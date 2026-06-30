"""
Roadmap re-evaluation (v2) — proposes a revised big-picture timeline as a DIFF.

User-initiated only. v2: PRESERVES the flagship anchor (never swaps it) and the work the
student has already engaged with; it re-paces remaining months, adds/drops bridges + side
nodes, and adjusts difficulty as the student grows. Returns a PROPOSED new timeline + a short
plain-language summary — does NOT persist. The frontend applies on "Accept New Path" (direct
RLS writes), or discards on "Keep Original". Uses OPUS (architecture-level reasoning).

See .claude/ROADMAP_REDESIGN.md.
"""
import logging
from datetime import date

from anthropic import AsyncAnthropic

from app.config import ANTHROPIC_API_KEY
from app.db.supabase import get_supabase
from app.nodes.roadmap.generate import (
    _parse_json, _month_label, _infer_timeframe, _flatten, _enforce_bridges,
    _normalize_phases,
)

logger = logging.getLogger(__name__)

_anthropic = AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
OPUS = "claude-opus-4-8"


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
        supabase.from_("roadmap_nodes")
        .select("month_index, month_label, pillar, title, state, kind, technical_depth")
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
    intake = living.get("intake") or {}
    months = roadmap.get("timeframe_months") or _infer_timeframe(profile)

    anchor_title = roadmap.get("anchor_title") or roadmap.get("goal")
    anchor_summary = roadmap.get("anchor_summary") or ""

    # What they've actually engaged with / completed (protect this).
    done = [n["title"] for n in current_nodes if n.get("state") in ("on_board", "done")]
    current_outline = "\n".join(
        f"- m{n['month_index']} [{n.get('kind','anchor')}/{n['pillar']}] {n['title']}"
        + (f" d{n['technical_depth']}" if n.get("technical_depth") else "")
        + (f" ({n['state']})" if n.get("state") in ("on_board", "done") else "")
        for n in current_nodes
    )

    is_hs = (isinstance(grade, int) and grade <= 12) or edu == "high_school"
    club_clause = "Club" if is_hs else "Activity"

    system = (
        "You are Mentorable's roadmap architect REVISING a student's existing big-picture roadmap "
        f"toward their goal over {months} months. KEEP THE SAME FLAGSHIP ANCHOR — do not swap it; "
        "the student is invested in it. Reflect their CURRENT state and momentum: keep what's still "
        "right, re-pace what's stale, add bridge nodes where a jump is now too steep, drop side "
        "nodes they skipped. Preserve progress: do not undo months they've already engaged with.\n\n"
        "Same v2 rules: ONE anchor through-line (most nodes advance it, evolving across pillars), "
        f"at most one 'side' node per month, 'bridge' nodes before steep jumps. Pillars Project / "
        f"Research / Activity / {club_clause}. Score every node technical_depth (1-5) and "
        "execution_mode (1-5); insert a bridge whenever technical_depth would jump by 2+ between "
        "consecutive anchors. STRICT safety (no hazardous materials, equipment over ~$50-100, "
        "lab/institutional access, or age-inappropriate activities). Motivating, plain language. "
        "NEVER use em dashes (the long dash); use commas, periods, or parentheses instead. "
        "Month 0 is current/near-term.\n\n"
        "Re-group the months into PHASES too (broad consecutive-month stages covering the whole "
        "timeline, 3-6 of them, each with a short broad-topic title and one-sentence blurb). "
        "Also write a SHORT summary (1-2 sentences, plain language) of what's changing and why. "
        "Return ONLY valid JSON, no markdown."
    )
    user_prompt = (
        f"Goal: {roadmap.get('goal')}\nFlagship anchor (KEEP): {anchor_title}"
        + (f" — {anchor_summary}" if anchor_summary else "") + "\n"
        f"Timeline: {months} months\nGrade: {grade or 'unknown'} · Education: {edu}\n"
        f"Now: {summary_p}\nDirection: {direction}\nInterests: {', '.join(interests)}\n"
        + ("They told us: " + ", ".join(f"{k}: {v}" for k, v in intake.items()) + "\n" if intake else "")
        + ("Skill scores: " + ", ".join(f"{k} {v}" for k, v in axis_scores.items()) + "\n" if axis_scores else "")
        + (f"Already engaged with (preserve): {', '.join(done)}\n" if done else "")
        + f"\nCurrent roadmap outline:\n{current_outline}\n\n"
        f"Propose the REVISED {months}-month roadmap around the SAME anchor. Return ONLY JSON:\n"
        '{"summary":"what changed and why",'
        '"phases":[{"title":"broad stage","blurb":"one sentence","pillar":"Project","month_start":0,"month_count":2}],'
        '"months":[{"month_index":0,"focus":"...","nodes":'
        '[{"title":"...","kind":"anchor|side|bridge","pillar":"Project","target_axis":"execution",'
        '"technical_depth":1,"execution_mode":1,"blurb":"..."}]}]}'
    )

    resp = await _anthropic.messages.create(
        model=OPUS, max_tokens=8000, system=system,
        messages=[{"role": "user", "content": user_prompt}],
    )
    parsed = _parse_json(resp.content[0].text if resp.content else "", {})
    months_data = parsed.get("months", []) if isinstance(parsed, dict) else []
    if not isinstance(months_data, list) or not months_data:
        raise ValueError("Couldn't re-evaluate the roadmap. Try again.")

    # Flatten + enforce bridges deterministically (same path as generation).
    flat = _flatten(months_data, months)
    if not flat:
        raise ValueError("Couldn't re-evaluate the roadmap. Try again.")
    _enforce_bridges(flat)

    start_month = date.today().replace(day=1)
    grouped: dict[int, dict] = {}
    focus_by_mi = {int(m["month_index"]): (m.get("focus") or "").strip()
                   for m in months_data if isinstance(m.get("month_index"), (int, float))}
    for n in flat:
        mi = n["month_index"]
        g = grouped.setdefault(mi, {"month_index": mi, "focus": focus_by_mi.get(mi, ""), "nodes": []})
        g["nodes"].append({
            "month_index": mi,
            "month_label": _month_label(start_month, mi),
            "kind": n["kind"],
            "pillar": n["pillar"],
            "title": n["title"],
            "blurb": n["blurb"],
            "target_axis": n["target_axis"],
            "technical_depth": n["technical_depth"],
            "execution_mode": n["execution_mode"],
            "order_index": len(g["nodes"]),
        })

    proposed_months = [grouped[mi] for mi in sorted(grouped.keys())]
    phases = _normalize_phases(parsed.get("phases") or [], months)

    logger.info(f"[roadmap] reevaluated {roadmap_id} for {user_id}")
    return {
        "summary": (parsed.get("summary") or "Here's an updated path based on where you are now.").strip(),
        "proposed": {"timeframe_months": months, "anchor_title": anchor_title,
                     "anchor_summary": anchor_summary, "months": proposed_months, "phases": phases},
    }
