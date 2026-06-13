"""
Roadmap re-evaluation — proposes a revised big-picture timeline as a DIFF.

User-initiated only. Returns a PROPOSED new timeline + a short plain-language summary
of what's changing. Does NOT persist — the frontend applies on "Accept New Path"
(direct RLS writes), or discards on "Keep Original".

See .claude/ROADMAP_REDESIGN.md.
"""
import json
import logging

from anthropic import AsyncAnthropic

from app.config import ANTHROPIC_API_KEY
from app.db.supabase import get_supabase
from app.nodes.roadmap.generate import (
    _parse_json, _coerce_pillar, _coerce_axis, _month_label, _infer_timeframe,
)

logger = logging.getLogger(__name__)

_anthropic = AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
SONNET = "claude-sonnet-4-6"


async def reevaluate_roadmap(user_id: str, roadmap_id: str) -> dict:
    """Returns {"proposed": {"timeframe_months", "months":[...]}, "summary": "..."} — NOT persisted."""
    supabase = get_supabase()

    rm_res = (
        supabase.from_("roadmaps").select("*")
        .eq("id", roadmap_id).eq("user_id", user_id).maybe_single().execute()
    )
    roadmap = rm_res.data
    if not roadmap:
        raise ValueError("Roadmap not found.")

    nodes_res = (
        supabase.from_("roadmap_nodes").select("month_index, month_label, pillar, title, state")
        .eq("roadmap_id", roadmap_id).order("month_index").order("order_index").execute()
    )
    current_nodes = nodes_res.data or []

    prof_res = (
        supabase.from_("profiles").select("grade_level, education_level, interests, strengths, "
                                          "career_matches, axis_scores, living_profile")
        .eq("id", user_id).maybe_single().execute()
    )
    profile = prof_res.data or {}
    living = profile.get("living_profile") or {}
    summary_p = living.get("current_summary") or ""
    direction = living.get("career_direction") or (profile.get("career_matches") or [None])[0] or ""
    interests = living.get("interests") or profile.get("interests") or []
    axis_scores = profile.get("axis_scores") or {}
    grade = profile.get("grade_level")
    edu = profile.get("education_level") or "student"
    months = roadmap.get("timeframe_months") or _infer_timeframe(profile)

    # What they've actually engaged with / completed.
    done = [n["title"] for n in current_nodes if n.get("state") in ("on_board", "done")]
    current_outline = "\n".join(
        f"- m{n['month_index']} [{n['pillar']}] {n['title']}" + (f" ({n['state']})" if n.get("state") in ("on_board", "done") else "")
        for n in current_nodes
    )

    is_hs = (isinstance(grade, int) and grade <= 12) or edu == "high_school"
    club_clause = "Club" if is_hs else "Activity"

    system = (
        "You are Mentorable's roadmap architect REVISING a student's existing big-picture roadmap "
        f"toward their goal over {months} months. The student has grown since the original plan — "
        "reflect their CURRENT state and momentum. Keep what's still right, evolve what's stale, and "
        "if their direction has shifted, shift the plan. Preserve progress: do not undo months the "
        "student has already engaged with. Same rules as before: pillars Project / Research / "
        f"Activity / {club_clause}; motivating, plain language; STRICT safety (no hazardous "
        "materials, equipment over ~$50-100, lab/institutional access, or age-inappropriate "
        "activities). Month 0 is current/near-term.\n\n"
        "Also write a SHORT summary (1-2 sentences, plain language) of what's changing and why. "
        "Return ONLY valid JSON, no markdown."
    )
    user_prompt = (
        f"Goal: {roadmap.get('goal')}\nTimeline: {months} months\n"
        f"Grade: {grade or 'unknown'} · Education: {edu}\n"
        f"Now: {summary_p}\nDirection: {direction}\nInterests: {', '.join(interests)}\n"
        + ("Skill scores: " + ", ".join(f"{k} {v}" for k, v in axis_scores.items()) + "\n" if axis_scores else "")
        + (f"Already engaged with: {', '.join(done)}\n" if done else "")
        + f"\nCurrent roadmap outline:\n{current_outline}\n\n"
        f"Propose the REVISED {months}-month roadmap. Return ONLY JSON:\n"
        '{"summary":"what changed and why","months":[{"month_index":0,"focus":"...","nodes":'
        '[{"title":"...","pillar":"Project","target_axis":"execution","blurb":"..."}]}]}'
    )

    resp = await _anthropic.messages.create(
        model=SONNET, max_tokens=4000, system=system,
        messages=[{"role": "user", "content": user_prompt}],
    )
    parsed = _parse_json(resp.content[0].text if resp.content else "", {})
    months_data = parsed.get("months", []) if isinstance(parsed, dict) else []
    if not isinstance(months_data, list) or not months_data:
        raise ValueError("Couldn't re-evaluate the roadmap. Try again.")

    from datetime import date
    start_month = date.today().replace(day=1)

    proposed_months = []
    for m in months_data:
        try:
            mi = int(m.get("month_index"))
        except (TypeError, ValueError):
            continue
        if mi < 0 or mi >= months:
            continue
        nodes = []
        for order, n in enumerate(m.get("nodes") or []):
            title = (n.get("title") or "").strip()
            if not title:
                continue
            pillar = _coerce_pillar(n.get("pillar"))
            nodes.append({
                "month_index": mi,
                "month_label": _month_label(start_month, mi),
                "pillar": pillar,
                "title": title[:80],
                "blurb": (n.get("blurb") or "").strip() or None,
                "target_axis": _coerce_axis(n.get("target_axis"), pillar),
                "order_index": order,
            })
        if nodes:
            proposed_months.append({"month_index": mi, "focus": (m.get("focus") or "").strip(), "nodes": nodes})

    if not proposed_months:
        raise ValueError("Couldn't re-evaluate the roadmap. Try again.")

    logger.info(f"[roadmap] reevaluated {roadmap_id} for {user_id}")
    return {
        "summary": (parsed.get("summary") or "Here's an updated path based on where you are now.").strip(),
        "proposed": {"timeframe_months": months, "months": proposed_months},
    }
