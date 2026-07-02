"""
Roadmap generation (v3) — the ONE-TIME broad outline.

v3 is phase-by-phase. This module only generates the big-picture OUTLINE: a short list of
PHASES (the broad stages a student moves through), each spanning consecutive months and carrying
a per-month "concept focus" list. NO real nodes are created here. Nodes for a phase are
materialized later, one phase at a time, by `phase.py` (gated by a reflection). Uses Sonnet
(cost-optimized for the public demo; was Opus).

See .claude/ROADMAP_REDESIGN.md.
"""
import logging
import json
import re
from datetime import date

from anthropic import AsyncAnthropic

from app.config import ANTHROPIC_API_KEY
from app.db.supabase import get_supabase

logger = logging.getLogger(__name__)

_anthropic = AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
SONNET = "claude-sonnet-4-6"

PILLARS = {"Project", "Research", "Activity", "Club"}

# Pillar → scorecard axis (default; the model may refine per node later).
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


def _coerce_depth(v) -> int | None:
    try:
        n = int(v)
    except (TypeError, ValueError):
        return None
    return max(1, min(5, n))


def _safe_int(v, fallback):
    try:
        return int(v)
    except (TypeError, ValueError):
        return fallback


def _infer_timeframe(profile: dict) -> int:
    """When the user lets Mentorable decide: clamp to [3, 24] using grade if present."""
    grade = profile.get("grade_level")
    if isinstance(grade, int):
        if grade <= 9:   return 24
        if grade == 10:  return 18
        if grade == 11:  return 12
        if grade >= 12:  return 9
    return 12


def _normalize_phases(phases_data: list, months: int) -> list[dict]:
    """
    Opus phases[] → a contiguous tiling of [0, months). Each phase is a broad stage spanning one
    or more consecutive months, with a per-month concept focus list. We force contiguity
    deterministically so the outline always covers the whole timeline with no gaps/overlap.
    Every phase starts 'locked'; phase.py flips one to 'active' as it's generated, 'completed'
    after its reflection. Returns
    [{index, title, blurb, pillar, target_axis, month_start, month_count, month_focuses, status}].
    """
    items = []
    for p in (phases_data or []):
        title = (p.get("title") or "").strip()
        count = _safe_int(p.get("month_count"), None)
        start = _safe_int(p.get("month_start"), None)
        if not title or count is None or count < 1:
            continue
        pillar = _coerce_pillar(p.get("pillar"))
        focuses = [str(f).strip()[:90] for f in (p.get("month_focuses") or []) if str(f).strip()]
        items.append({
            "title": title[:70],
            "blurb": (p.get("blurb") or "").strip() or None,
            "pillar": pillar,
            "target_axis": _coerce_axis(p.get("target_axis"), pillar),
            "_start": start if start is not None else 999,
            "month_count": count,
            "month_focuses": focuses,
        })
    items.sort(key=lambda x: x["_start"])

    normalized = []
    cursor = 0
    for it in items:
        if cursor >= months:
            break
        start = cursor                                  # force contiguity from the running cursor
        end = min(months, start + it["month_count"])
        if end <= start:
            continue
        count = end - start
        focuses = (it["month_focuses"] or [])[:count]
        while len(focuses) < count:                     # pad so every month has a focus label
            focuses.append("")
        normalized.append({
            "title": it["title"], "blurb": it["blurb"], "pillar": it["pillar"],
            "target_axis": it["target_axis"], "month_start": start, "month_count": count,
            "month_focuses": focuses, "status": "locked",
        })
        cursor = end

    if not normalized:
        normalized = [{"title": "Your path", "blurb": None, "pillar": "Project",
                       "target_axis": "execution", "month_start": 0, "month_count": months,
                       "month_focuses": [""] * months, "status": "locked"}]
    elif cursor < months:
        extra = months - cursor
        normalized[-1]["month_count"] += extra
        normalized[-1]["month_focuses"] += [""] * extra

    for i, it in enumerate(normalized):
        it["index"] = i
    return normalized


async def generate_roadmap(
    user_id: str,
    goal: str,
    timeframe_months: int | None,
    end_month: str | None = None,
    intake_answers: dict | None = None,
) -> dict:
    """
    Generates the one-time broad OUTLINE and inserts the roadmaps row (phases JSONB). Does NOT
    create roadmap_nodes — phase.py does that per phase. Returns {"roadmap": {...}}.
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

    living = profile.get("living_profile") or {}
    summary  = living.get("current_summary") or profile.get("onboarding_summary") or ""
    strengths = living.get("strengths") or profile.get("strengths") or []
    interests = living.get("interests") or profile.get("interests") or []
    direction = living.get("career_direction") or (profile.get("career_matches") or [None])[0] or ""

    months = timeframe_months if (isinstance(timeframe_months, int) and 3 <= timeframe_months <= 24) else _infer_timeframe(profile)

    grade = profile.get("grade_level")
    edu   = profile.get("education_level") or "student"
    axis_scores = profile.get("axis_scores") or {}

    # ── Persist intake answers into the living profile (cross-feature memory) ───
    if intake_answers:
        merged_intake = {**(living.get("intake") or {}), **intake_answers}
        new_living = {**living, "intake": merged_intake}
        try:
            supabase.from_("profiles").update({"living_profile": new_living}).eq("id", user_id).execute()
            living = new_living
        except Exception as exc:
            logger.warning(f"[roadmap] could not persist intake for {user_id}: {exc}")

    intake = living.get("intake") or {}

    # ── Build context ─────────────────────────────────────────────────────────
    ctx = [f"Ultimate goal: {goal}", f"Total timeline: {months} months"]
    if profile.get("full_name"): ctx.append(f"Name: {profile['full_name']}")
    if grade:                    ctx.append(f"Grade: {grade}")
    ctx.append(f"Education: {edu}")
    if summary:                  ctx.append(f"About them: {summary}")
    if interests:                ctx.append(f"Interests: {', '.join(interests)}")
    if strengths:                ctx.append(f"Strengths: {', '.join(strengths)}")
    if direction:                ctx.append(f"Current direction: {direction}")
    if axis_scores:              ctx.append("Skill scores (0-100): " + ", ".join(f"{k} {v}" for k, v in axis_scores.items()))
    if intake:                   ctx.append("They told us: " + ", ".join(f"{k}: {v}" for k, v in intake.items()))
    context = "\n".join(ctx)

    is_hs = (isinstance(grade, int) and grade <= 12) or edu == "high_school"
    club_clause = "Club (a school/community club)" if is_hs else "Activity (a community or extracurricular involvement)"

    system = (
        "You are Mentorable's roadmap architect. Build the BIG-PICTURE OUTLINE of a student's path "
        f"toward their ultimate goal over exactly {months} months. This is the strategic skeleton "
        "ONLY, not detailed steps and not specific resources.\n\n"
        "Think in PHASES, the broad stages a student moves through (e.g. for a law goal: "
        "'Foundations of Government' for 2 months, then 'LSAT-style Reasoning' for 2 months, then "
        "'Mock Trial and Writing' for 3 months). Each phase spans one or more CONSECUTIVE months "
        "and the phases together cover the whole timeline with no gaps. Aim for 3 to 6 phases.\n\n"
        "For each phase give: a short broad-topic title, a one-sentence blurb, the dominant pillar "
        f"(Project / Research / {club_clause}), and a 'month_focuses' list with ONE short concept "
        "label per month of the phase (e.g. ['The Constitution', 'The three branches', "
        "'Federalism']). The focuses are concepts, not tasks.\n\n"
        "Order phases so each builds on the one before it, rising in difficulty gradually. Early "
        "phases lay foundations, later phases produce the application-worthy pieces. Optimize for "
        "real mastery and depth, not a pile of unrelated activities.\n\n"
        "SAFETY (hard rules): never anything requiring hazardous materials, equipment over "
        "~$50-100, lab or institutional access, or adult supervision; age-appropriate; achievable "
        "with free or cheap online resources.\n\n"
        "Tone: motivating yet practical, plain language, no jargon or buzzwords. NEVER use em "
        "dashes (the long dash); use commas, periods, or parentheses instead. Return ONLY valid "
        "JSON, no markdown."
    )

    user_prompt = (
        f"## Student\n{context}\n\n"
        f"Design the {months}-month phase outline. Return ONLY JSON:\n"
        '{"display_title":"a clean scannable Title Case headline for this roadmap, 2-6 words, like '
        '\\"Electrical Engineering & VLSI Portfolio\\", NOT a full sentence and NOT their raw text",'
        '"goal_clean":"their goal restated faithfully with spelling and grammar fixed",'
        '"phases":[{"title":"broad stage, e.g. Foundations of Government","blurb":"one sentence on '
        'this stage","pillar":"Project|Research|Activity|Club","month_start":0,"month_count":2,'
        '"month_focuses":["concept for month 1","concept for month 2"]}]}'
    )

    response = await _anthropic.messages.create(
        model=SONNET, max_tokens=4000, system=system,
        messages=[{"role": "user", "content": user_prompt}],
    )
    text = response.content[0].text if response.content else ""
    parsed = _parse_json(text, {})
    phases_data = parsed.get("phases", []) if isinstance(parsed, dict) else []
    phases = _normalize_phases(phases_data, months)
    if not phases:
        raise ValueError("Failed to generate a roadmap outline. Please try again.")

    display_title = (parsed.get("display_title") or "").strip()[:80] or None
    goal_clean = (parsed.get("goal_clean") or "").strip()[:600] or goal

    # ── Insert the roadmap row (outline only; nodes come per-phase) ────────────
    today = date.today()
    start_month = today.replace(day=1)

    rm_payload = {
        "user_id": user_id,
        "goal": goal_clean,
        "display_title": display_title,
        "timeframe_months": months,
        "start_month": start_month.isoformat(),
        "status": "active",
        "phases": phases,
    }
    if end_month:
        rm_payload["end_month"] = end_month
    rm_res = supabase.from_("roadmaps").insert(rm_payload).execute()
    roadmap = (rm_res.data or [None])[0]
    if not roadmap:
        raise ValueError("Could not save the roadmap. Please try again.")

    logger.info(f"[roadmap] generated outline ({len(phases)} phases over {months}mo) for {user_id}")
    return {"roadmap": roadmap}
