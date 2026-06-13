"""
Roadmap generation — the broad, two-tier timeline.

Produces the BIG PICTURE only: every month gets a focus + lightweight node stubs
(title + pillar + target_axis + blurb, NO references). References + concrete steps
are generated lazily later, per node, when the user opens one.

See .claude/ROADMAP_REDESIGN.md.
"""
import json
import logging
import re
from datetime import date

from anthropic import AsyncAnthropic

from app.config import ANTHROPIC_API_KEY
from app.db.supabase import get_supabase

logger = logging.getLogger(__name__)

_anthropic = AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
SONNET = "claude-sonnet-4-6"

PILLARS = {"Project", "Research", "Activity", "Club"}

# Pillar → scorecard axis (model may refine per node, but this is the default).
PILLAR_AXIS = {
    "Project":  "execution",
    "Research": "resourcefulness",
    "Activity": "communication",
    "Club":     "leadership",
}

_AXES = {"communication", "leadership", "technicality", "resourcefulness", "execution"}
_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _parse_json(text: str, fallback):
    try:
        return json.loads(text)
    except Exception:
        pass
    m = re.search(r'(\{[\s\S]*\}|\[[\s\S]*\])', text)
    if m:
        try:
            return json.loads(m.group(0))
        except Exception:
            pass
    return fallback


def _month_label(start: date, offset: int) -> str:
    m0 = start.month - 1 + offset
    return f"{_MONTHS[m0 % 12]} {start.year + m0 // 12}"


def _coerce_pillar(v) -> str:
    v = (v or "").strip().title()
    return v if v in PILLARS else "Project"


def _coerce_axis(v, pillar) -> str:
    v = (v or "").strip().lower()
    return v if v in _AXES else PILLAR_AXIS.get(pillar, "execution")


def _infer_timeframe(profile: dict) -> int:
    """When the user lets Mentorable decide: clamp to [6, 24] using grade if present."""
    grade = profile.get("grade_level")
    # Earlier grades → longer horizon; near graduation → shorter, focused.
    if isinstance(grade, int):
        if grade <= 9:   return 24
        if grade == 10:  return 18
        if grade == 11:  return 12
        if grade >= 12:  return 9
    return 12


async def generate_roadmap(user_id: str, goal: str, timeframe_months: int | None) -> dict:
    """
    Generates the broad timeline and inserts roadmaps + stub roadmap_nodes.
    Returns {"roadmap": {...}, "nodes": [...]}.
    Raises ValueError on user-facing failure.
    """
    goal = (goal or "").strip()
    if not goal:
        raise ValueError("A goal is required.")

    supabase = get_supabase()

    profile_res = (
        supabase.from_("profiles")
        .select("full_name, grade_level, education_level, location_general, "
                "onboarding_summary, interests, strengths, career_matches, work_style, "
                "axis_scores, living_profile")
        .eq("id", user_id).maybe_single().execute()
    )
    profile = profile_res.data or {}

    # Prefer the evolving living profile.
    living = profile.get("living_profile") or {}
    summary  = living.get("current_summary") or profile.get("onboarding_summary") or ""
    strengths = living.get("strengths") or profile.get("strengths") or []
    interests = living.get("interests") or profile.get("interests") or []
    direction = living.get("career_direction") or (profile.get("career_matches") or [None])[0] or ""

    months = timeframe_months if (isinstance(timeframe_months, int) and 6 <= timeframe_months <= 24) else _infer_timeframe(profile)

    grade = profile.get("grade_level")
    edu   = profile.get("education_level") or "student"
    axis_scores = profile.get("axis_scores") or {}

    # ── Build context ─────────────────────────────────────────────────────────
    ctx = [f"Ultimate goal: {goal}", f"Timeline: {months} months"]
    if profile.get("full_name"): ctx.append(f"Name: {profile['full_name']}")
    if grade:                    ctx.append(f"Grade: {grade}")
    ctx.append(f"Education: {edu}")
    if summary:                  ctx.append(f"About them: {summary}")
    if interests:                ctx.append(f"Interests: {', '.join(interests)}")
    if strengths:                ctx.append(f"Strengths: {', '.join(strengths)}")
    if direction:                ctx.append(f"Current direction: {direction}")
    if axis_scores:              ctx.append("Skill scores (0-100): " + ", ".join(f"{k} {v}" for k, v in axis_scores.items()))
    context = "\n".join(ctx)

    is_hs = (isinstance(grade, int) and grade <= 12) or edu == "high_school"
    club_clause = "Club (a school/community club to join or lead)" if is_hs else "Activity (a community or extracurricular involvement)"

    system = (
        "You are Mentorable's roadmap architect. Build a BIG-PICTURE monthly roadmap toward a "
        f"student's ultimate goal over exactly {months} months. This is the strategic outline — "
        "NOT detailed steps. For each month, give a short focus and 1-2 milestone nodes.\n\n"
        "Each node is classified into ONE pillar:\n"
        "- Project (something they build/create)\n"
        "- Research (investigating, reading, or conducting research — research papers only suit "
        "older/college-bound students doing real research)\n"
        f"- Activity / {club_clause}\n\n"
        "Make the path progressive: foundational work early, ambitious/portfolio-defining work "
        "later. Reflect what we know about the student. Tone: motivating yet practical, plain "
        "language, no academic jargon or buzzwords, never textbook-like.\n\n"
        "SAFETY (hard rules): never suggest anything requiring hazardous materials, equipment "
        "costing more than ~$50-100, lab or institutional access, or adult/professional "
        "supervision. Keep everything realistic and age-appropriate to the student's grade. "
        "Suggest only things a student can realistically do on their own or with free/cheap "
        "online resources.\n\n"
        "Month 0 is the current/near-term month. Return ONLY valid JSON, no markdown."
    )

    user_prompt = (
        f"## Student\n{context}\n\n"
        f"Generate a {months}-month big-picture roadmap. For EACH month (0 to {months-1}) include "
        "a focus and its node(s). Each node: title (concise, max 60 chars), pillar "
        "(Project|Research|Activity|Club), target_axis (communication|leadership|technicality|"
        "resourcefulness|execution — the skill it most builds), and blurb (one sentence on why it "
        "matters now, plain language).\n\n"
        "Return ONLY JSON:\n"
        '{"months":[{"month_index":0,"focus":"...","nodes":[{"title":"...","pillar":"Project",'
        '"target_axis":"execution","blurb":"..."}]}]}'
    )

    response = await _anthropic.messages.create(
        model=SONNET, max_tokens=4000, system=system,
        messages=[{"role": "user", "content": user_prompt}],
    )
    text = response.content[0].text if response.content else ""
    parsed = _parse_json(text, {"months": []})
    months_data = parsed.get("months", []) if isinstance(parsed, dict) else []
    if not isinstance(months_data, list) or not months_data:
        raise ValueError("Failed to generate a roadmap. Please try again.")

    # ── Insert roadmap + stub nodes ───────────────────────────────────────────
    today = date.today()
    start_month = today.replace(day=1)

    rm_res = supabase.from_("roadmaps").insert({
        "user_id": user_id,
        "goal": goal,
        "timeframe_months": months,
        "start_month": start_month.isoformat(),
        "status": "active",
    }).execute()
    roadmap = (rm_res.data or [None])[0]
    if not roadmap:
        raise ValueError("Could not save the roadmap. Please try again.")
    roadmap_id = roadmap["id"]

    node_rows = []
    for m in months_data:
        try:
            mi = int(m.get("month_index"))
        except (TypeError, ValueError):
            continue
        if mi < 0 or mi >= months:
            continue
        for order, n in enumerate(m.get("nodes") or []):
            title = (n.get("title") or "").strip()
            if not title:
                continue
            pillar = _coerce_pillar(n.get("pillar"))
            node_rows.append({
                "roadmap_id":  roadmap_id,
                "user_id":     user_id,
                "month_index": mi,
                "month_label": _month_label(start_month, mi),
                "pillar":      pillar,
                "title":       title[:80],
                "blurb":       (n.get("blurb") or "").strip() or None,
                "target_axis": _coerce_axis(n.get("target_axis"), pillar),
                "state":       "explore",
                "order_index": order,
            })

    if not node_rows:
        raise ValueError("Failed to generate roadmap nodes. Please try again.")

    nodes_res = supabase.from_("roadmap_nodes").insert(node_rows).execute()
    nodes = nodes_res.data or []

    logger.info(f"[roadmap] generated {len(nodes)} nodes over {months}mo for {user_id}")
    return {"roadmap": roadmap, "nodes": nodes}
