"""
Roadmap phase generation (v3) — materialize ONE phase's nodes on demand.

Sequential, reflection-gated. Reads the broad outline + everything the student has done and
reflected on so far, then writes the concrete nodes (concepts / projects / activities) for the
requested phase ONLY, and quietly revises the remaining LOCKED phases' outline so the path keeps
adapting to where the student actually is. Uses OPUS. Nodes are stubs (no resources/tasks yet);
those fill lazily on expand. There is no anchor/bridge/side taxonomy in v3.

See .claude/ROADMAP_REDESIGN.md.
"""
import logging
from datetime import date

from anthropic import AsyncAnthropic

from app.config import ANTHROPIC_API_KEY
from app.db.supabase import get_supabase
from app.nodes.roadmap.generate import (
    _parse_json, _month_label, _coerce_pillar, _coerce_axis, _coerce_depth, _safe_int,
)

logger = logging.getLogger(__name__)

_anthropic = AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
OPUS = "claude-opus-4-8"


async def generate_phase(user_id: str, roadmap_id: str, phase_index: int) -> dict:
    """
    Generate the nodes for phases[phase_index], flip it to 'active', and revise the outline of
    later locked phases. Returns {"roadmap": {...updated...}, "nodes": [...], "phase_index": n}.
    Raises ValueError on user-facing failure.
    """
    supabase = get_supabase()

    rm_res = (
        supabase.from_("roadmaps").select("*")
        .eq("id", roadmap_id).eq("user_id", user_id).maybe_single().execute()
    )
    roadmap = rm_res.data
    if not roadmap:
        raise ValueError("Roadmap not found.")

    phases = roadmap.get("phases") or []
    if not isinstance(phases, list) or phase_index < 0 or phase_index >= len(phases):
        raise ValueError("That phase does not exist.")
    phase = phases[phase_index]
    if phase.get("status") == "active" or phase.get("status") == "completed":
        # Already generated: just return its existing nodes (idempotent, no charge upstream).
        nodes_res = (
            supabase.from_("roadmap_nodes").select("*")
            .eq("roadmap_id", roadmap_id)
            .gte("month_index", phase["month_start"])
            .lt("month_index", phase["month_start"] + phase["month_count"])
            .order("month_index").order("order_index").execute()
        )
        return {"roadmap": roadmap, "nodes": nodes_res.data or [], "phase_index": phase_index}

    # ── Context: profile + prior reflections/readiness ─────────────────────────
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

    is_hs = (isinstance(grade, int) and grade <= 12) or edu == "high_school"
    club_clause = "Club" if is_hs else "Activity"

    # Prior phases' reflections (the readiness signal that adapts this phase).
    history_lines = []
    for p in phases[:phase_index]:
        refl = p.get("reflection") or {}
        if refl:
            history_lines.append(
                f"- Phase '{p.get('title')}': readiness {refl.get('readiness_score','?')}/100. "
                f"Reflection: {refl.get('summary') or refl.get('text','')}"
            )
    history = "\n".join(history_lines) or "None yet (this is the first phase)."

    # The full outline, so Opus can keep later phases coherent when revising them.
    outline_lines = []
    for p in phases:
        marker = ">>" if p["index"] == phase_index else ("done" if p.get("status") == "completed" else "")
        outline_lines.append(
            f"  [{p['index']}] {p['title']} (months {p['month_start']+1}-{p['month_start']+p['month_count']}) "
            f"{marker}".rstrip()
        )
    outline = "\n".join(outline_lines)

    start_month = date.today().replace(day=1)
    ms, mc = phase["month_start"], phase["month_count"]
    month_lines = "\n".join(
        f"  month_index {ms+i} ({_month_label(start_month, ms+i)}): focus '{(phase.get('month_focuses') or [''])[i] if i < len(phase.get('month_focuses') or []) else ''}'"
        for i in range(mc)
    )

    locked_after = [p["index"] for p in phases[phase_index + 1:] if p.get("status") != "completed"]

    ctx = [f"Goal: {roadmap.get('goal')}", f"Total timeline: {roadmap.get('timeframe_months')} months",
           f"Grade: {grade or 'unknown'}", f"Education: {edu}"]
    if summary_p: ctx.append(f"About them now: {summary_p}")
    if direction: ctx.append(f"Direction: {direction}")
    if interests: ctx.append(f"Interests: {', '.join(interests)}")
    if intake:    ctx.append("They told us: " + ", ".join(f"{k}: {v}" for k, v in intake.items()))
    if axis_scores: ctx.append("Skill scores: " + ", ".join(f"{k} {v}" for k, v in axis_scores.items()))
    context = "\n".join(ctx)

    system = (
        "You are Mentorable's roadmap architect, generating the concrete plan for ONE phase of a "
        "student's roadmap (the phases before it are done, the ones after are still a rough "
        "outline). Produce the real NODES for this phase: each node is a concept to learn, a small "
        "project to build, or an activity to do, tied to one of the phase's monthly focuses. Aim "
        "for one to two nodes per month of the phase. Order them so each is reachable from the "
        "one before it. Adapt to the student's readiness from prior phases: if they struggled, "
        "reinforce fundamentals before advancing; if they excelled, push further.\n\n"
        f"Pillars: Project (build/create), Research (investigate/read, papers suit older students "
        f"only), {club_clause}. Score each node technical_depth 1-5 (1 = no prior knowledge needed, "
        "5 = fluency assumed); this only calibrates resource difficulty later.\n\n"
        "Then, OPTIONALLY revise the rough outline of the LATER locked phases if the student's "
        "progress suggests a better path (re-title, re-blurb, adjust month_focuses). Keep their "
        "month spans the same. Only include phases you actually want to change.\n\n"
        "SAFETY (hard rules): no hazardous materials, equipment over ~$50-100, lab/institutional "
        "access, or adult supervision; age-appropriate; free/cheap online resources. Motivating, "
        "plain language, no jargon. NEVER use em dashes; use commas or periods. Return ONLY valid "
        "JSON, no markdown."
    )
    user_prompt = (
        f"## Student\n{context}\n\n"
        f"## Full phase outline\n{outline}\n\n"
        f"## Prior phase reflections (readiness)\n{history}\n\n"
        f"## Generate nodes for phase [{phase_index}] '{phase.get('title')}'\n"
        f"Phase blurb: {phase.get('blurb') or ''}\n"
        f"Months in this phase:\n{month_lines}\n\n"
        f"Later locked phases you MAY revise: {locked_after or 'none'}\n\n"
        "Return ONLY JSON:\n"
        '{"nodes":[{"month_index":<int within this phase\'s months>,"title":"max 60 chars",'
        '"pillar":"Project|Research|Activity|Club",'
        '"target_axis":"communication|leadership|technicality|resourcefulness|execution",'
        '"technical_depth":1,"blurb":"one plain-language sentence on what it is and why now"}],'
        '"revised_phases":[{"index":<int>,"title":"...","blurb":"...","month_focuses":["...","..."]}]}'
    )

    resp = await _anthropic.messages.create(
        model=OPUS, max_tokens=4000, system=system,
        messages=[{"role": "user", "content": user_prompt}],
    )
    parsed = _parse_json(resp.content[0].text if resp.content else "", {})
    raw_nodes = parsed.get("nodes", []) if isinstance(parsed, dict) else []
    if not isinstance(raw_nodes, list) or not raw_nodes:
        raise ValueError("Failed to generate this phase. Please try again.")

    # ── Build + insert nodes (clamp month_index into the phase span) ───────────
    per_month_order: dict[int, int] = {}
    node_rows = []
    for n in raw_nodes:
        title = (n.get("title") or "").strip()
        if not title:
            continue
        mi = _safe_int(n.get("month_index"), ms)
        if mi < ms or mi >= ms + mc:
            mi = ms
        pillar = _coerce_pillar(n.get("pillar"))
        order = per_month_order.get(mi, 0)
        per_month_order[mi] = order + 1
        node_rows.append({
            "roadmap_id":  roadmap_id,
            "user_id":     user_id,
            "month_index": mi,
            "month_label": _month_label(start_month, mi),
            "pillar":      pillar,
            "title":       title[:80],
            "blurb":       (n.get("blurb") or "").strip() or None,
            "target_axis": _coerce_axis(n.get("target_axis"), pillar),
            "kind":        "anchor",   # column is NOT NULL; v3 ignores kind semantically
            "technical_depth": _coerce_depth(n.get("technical_depth")),
            "state":       "explore",
            "order_index": order,
        })
    if not node_rows:
        raise ValueError("Failed to generate this phase. Please try again.")

    nodes_res = supabase.from_("roadmap_nodes").insert(node_rows).execute()
    nodes = nodes_res.data or []

    # ── Update phases JSONB: this one active + apply any outline revisions ─────
    revised = {}
    for rp in (parsed.get("revised_phases") or []):
        idx = _safe_int(rp.get("index"), None)
        if idx is not None:
            revised[idx] = rp
    new_phases = []
    for p in phases:
        p = dict(p)
        if p["index"] == phase_index:
            p["status"] = "active"
        elif p["index"] in revised and p.get("status") == "locked":
            rp = revised[p["index"]]
            if (rp.get("title") or "").strip():
                p["title"] = rp["title"].strip()[:70]
            if (rp.get("blurb") or "").strip():
                p["blurb"] = rp["blurb"].strip()
            focuses = [str(f).strip()[:90] for f in (rp.get("month_focuses") or []) if str(f).strip()]
            if focuses:
                focuses = focuses[:p["month_count"]]
                while len(focuses) < p["month_count"]:
                    focuses.append("")
                p["month_focuses"] = focuses
        new_phases.append(p)

    upd = supabase.from_("roadmaps").update({"phases": new_phases}).eq("id", roadmap_id).execute()
    updated_rm = (upd.data or [None])[0] or {**roadmap, "phases": new_phases}

    logger.info(f"[roadmap] generated phase {phase_index} ({len(nodes)} nodes) for {user_id}")
    return {"roadmap": updated_rm, "nodes": nodes, "phase_index": phase_index}
