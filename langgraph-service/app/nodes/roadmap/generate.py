"""
Roadmap generation (v2) — the anchor-through-line big-picture timeline.

v2 builds the timeline around ONE flagship "anchor" piece that deepens month over month
(evolving across pillars), with a minority of "side" nodes for breadth and "bridge" nodes
that close difficulty cliffs. Every node is scored on technical_depth + execution_mode (1-5).
A deterministic validation pass guarantees no steep jump (depth delta >= 2 along the anchor
chain) is left without a bridge. Generation uses OPUS (architecture-level reasoning); node
detail/resources are still generated lazily by Sonnet on open.

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
OPUS = "claude-opus-4-8"

PILLARS = {"Project", "Research", "Activity", "Club"}
KINDS = {"anchor", "side", "bridge"}

# Pillar → scorecard axis (model may refine per node, but this is the default).
PILLAR_AXIS = {
    "Project":  "execution",
    "Research": "resourcefulness",
    "Activity": "communication",
    "Club":     "leadership",
}

_AXES = {"communication", "leadership", "technicality", "resourcefulness", "execution"}
_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

# Difficulty-cliff threshold: a jump this big along the anchor chain demands a bridge.
BRIDGE_DELTA = 2


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


def _coerce_kind(v) -> str:
    v = (v or "").strip().lower()
    return v if v in KINDS else "anchor"


def _coerce_depth(v) -> int | None:
    try:
        n = int(v)
    except (TypeError, ValueError):
        return None
    return max(1, min(5, n))


def _infer_timeframe(profile: dict) -> int:
    """When the user lets Mentorable decide: clamp to [3, 24] using grade if present."""
    grade = profile.get("grade_level")
    # Earlier grades → longer horizon; near graduation → shorter, focused.
    if isinstance(grade, int):
        if grade <= 9:   return 24
        if grade == 10:  return 18
        if grade == 11:  return 12
        if grade >= 12:  return 9
    return 12


def _flatten(months_data: list, months: int) -> list[dict]:
    """Opus months[] → an ordered flat list of node dicts (timeline order)."""
    flat = []
    for m in sorted(months_data, key=lambda x: _safe_int(x.get("month_index"), 999)):
        mi = _safe_int(m.get("month_index"), None)
        if mi is None or mi < 0 or mi >= months:
            continue
        for n in (m.get("nodes") or []):
            title = (n.get("title") or "").strip()
            if not title:
                continue
            pillar = _coerce_pillar(n.get("pillar"))
            flat.append({
                "month_index": mi,
                "kind":   _coerce_kind(n.get("kind")),
                "pillar": pillar,
                "title":  title[:80],
                "blurb":  (n.get("blurb") or "").strip() or None,
                "target_axis": _coerce_axis(n.get("target_axis"), pillar),
                "technical_depth": _coerce_depth(n.get("technical_depth")),
                "execution_mode":  _coerce_depth(n.get("execution_mode")),
            })
    return flat


def _safe_int(v, fallback):
    try:
        return int(v)
    except (TypeError, ValueError):
        return fallback


def _enforce_bridges(flat: list[dict]) -> int:
    """
    Deterministic validation pass. Walk consecutive ANCHOR nodes in timeline order; if
    technical_depth jumps >= BRIDGE_DELTA and no bridge already sits between them, inject a
    bridge STUB on the edge (placed at the later anchor's month, just before it). Its real
    resources fill lazily on expand. Returns the count of bridges injected.
    """
    injected = 0
    i = 0
    while i < len(flat):
        if flat[i]["kind"] != "anchor":
            i += 1
            continue
        # find the next anchor
        j = i + 1
        while j < len(flat) and flat[j]["kind"] != "anchor":
            j += 1
        if j >= len(flat):
            break
        prev, nxt = flat[i], flat[j]
        has_bridge = any(flat[k]["kind"] == "bridge" for k in range(i + 1, j))
        d1 = prev.get("technical_depth") or 3
        d2 = nxt.get("technical_depth") or 3
        if not has_bridge and (d2 - d1) >= BRIDGE_DELTA:
            bridge = {
                "month_index": nxt["month_index"],
                "kind": "bridge",
                "pillar": nxt["pillar"],
                "title": f"Bridge: get ready for {nxt['title']}"[:80],
                "blurb": "A short catch-up step so the next milestone is actually reachable — "
                         "open it for the specific concepts and resources to close the gap.",
                "target_axis": nxt["target_axis"],
                "technical_depth": min(5, d1 + 1),
                "execution_mode": nxt.get("execution_mode"),
            }
            flat.insert(j, bridge)  # before the later anchor
            injected += 1
            i = j + 1  # continue after the later anchor
        else:
            i = j
    return injected


def _normalize_phases(phases_data: list, months: int) -> list[dict]:
    """
    Opus phases[] → a contiguous tiling of [0, months). Each phase is a broad topic spanning
    one or more consecutive months (the 'stage' a student goes through). We force contiguity
    deterministically so the UI overview always covers the whole timeline with no gaps/overlap,
    regardless of model drift. Returns [{index, title, blurb, pillar, target_axis,
    month_start, month_count}].
    """
    items = []
    for p in (phases_data or []):
        title = (p.get("title") or "").strip()
        count = _safe_int(p.get("month_count"), None)
        start = _safe_int(p.get("month_start"), None)
        if not title or count is None or count < 1:
            continue
        pillar = _coerce_pillar(p.get("pillar"))
        items.append({
            "title": title[:70],
            "blurb": (p.get("blurb") or "").strip() or None,
            "pillar": pillar,
            "target_axis": _coerce_axis(p.get("target_axis"), pillar),
            "_start": start if start is not None else 999,
            "month_count": count,
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
        normalized.append({
            "title": it["title"], "blurb": it["blurb"], "pillar": it["pillar"],
            "target_axis": it["target_axis"], "month_start": start, "month_count": end - start,
        })
        cursor = end

    if not normalized:
        normalized = [{"title": "Your path", "blurb": None, "pillar": "Project",
                       "target_axis": "execution", "month_start": 0, "month_count": months}]
    elif cursor < months:
        normalized[-1]["month_count"] += (months - cursor)  # absorb any leftover months

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
    Generates the anchor-through-line timeline and inserts roadmaps + roadmap_nodes.
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
    ctx = [f"Ultimate goal: {goal}", f"Timeline: {months} months"]
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
    club_clause = "Club (a school/community club to join or lead)" if is_hs else "Activity (a community or extracurricular involvement)"

    system = (
        "You are Mentorable's roadmap architect. Build a BIG-PICTURE monthly roadmap toward a "
        f"student's ultimate goal over exactly {months} months. This is the strategic outline — "
        "NOT detailed steps.\n\n"
        "MASTERY OVER BREADTH. The entire roadmap is built around ONE flagship piece — the "
        "ANCHOR — that the student deepens month after month, evolving it across pillars as it "
        "matures (e.g. Project: build it → Research: make it rigorous/write it up → Activity: "
        "present or share it). The anchor is the spine of the timeline and the centerpiece of "
        "their application/portfolio. Do NOT scatter unrelated experiences for quantity.\n\n"
        "PHASES. Group the months into a handful of PHASES, the broad stages a student moves "
        "through on the way to the goal (e.g. months 0-1 'Fundamentals of Law', month 4 'Study "
        "for the LSAT', months 5-7 'Mock Trial & Writing'). Each phase spans one or more "
        "CONSECUTIVE months and the phases together cover the whole timeline with no gaps. Give "
        "each phase a short broad-topic title and a one-sentence blurb. A phase can be a single "
        "month when that month is its own distinct stage. Aim for 3-6 phases total.\n\n"
        "Each node has a KIND:\n"
        "- 'anchor' — advances the flagship. MOST nodes are anchor nodes, one per month, in a "
        "clear build order where each is reachable from the previous.\n"
        "- 'side' — optional breadth (at most ONE per month, and only some months). A complementary "
        f"{club_clause} or activity that rounds out the profile.\n"
        "- 'bridge' — a SHORT, hyper-specific catch-up step placed right before a jump that would "
        "otherwise be too steep for a real student in the available time (e.g. before Verilog-on-"
        "FPGA, a bridge on sequential→concurrent thinking; before reaction mechanisms, a bridge on "
        "how reactions actually proceed). Insert a bridge whenever technical_depth would jump by 2 "
        "or more between consecutive anchor nodes.\n\n"
        "Pillars: Project (build/create) · Research (investigate/read/conduct — papers only suit "
        f"older/college-bound students) · {club_clause}.\n\n"
        "Score EVERY node on two 1-5 scales:\n"
        "- technical_depth: prior knowledge required (1 = Scratch-level, 5 = C++/research fluency).\n"
        "- execution_mode: 1 = single-threaded/sequential (write an essay), 5 = managing many "
        "moving parts at once (hardware routing, multi-system project).\n"
        "Keep the anchor's technical_depth rising gradually; that is what bridges protect.\n\n"
        "SAFETY (hard rules): never suggest anything requiring hazardous materials, equipment "
        "costing more than ~$50-100, lab or institutional access, or adult/professional "
        "supervision. Age-appropriate to the student's grade; achievable solo with free/cheap "
        "online resources.\n\n"
        "Tone: motivating yet practical, plain language, no jargon or buzzwords, never textbook-"
        "like. NEVER use em dashes (the long dash); use commas, periods, or parentheses instead. "
        "Month 0 is the current/near-term month. Return ONLY valid JSON, no markdown."
    )

    user_prompt = (
        f"## Student\n{context}\n\n"
        f"Design the {months}-month anchor-through-line roadmap. First pick the ANCHOR (the one "
        "flagship piece this whole roadmap builds), then lay out months 0..{last} where each month "
        "has its anchor-advancing node and, occasionally, one side node. Insert bridge nodes "
        "wherever an anchor step would be too steep a jump from the one before it.\n\n"
        "Return ONLY JSON:\n"
        '{"display_title":"a clean scannable Title Case headline for this roadmap, 2-6 words, like '
        '\\"Electrical Engineering & VLSI Portfolio\\" — NOT a full sentence, NOT their raw text",'
        '"goal_clean":"their goal restated faithfully with spelling and grammar fixed",'
        '"anchor":{"title":"the flagship piece, concise","summary":"one sentence on what it is '
        'and why it anchors their application"},'
        '"phases":[{"title":"broad stage, e.g. Fundamentals of Law","blurb":"one sentence on this '
        'stage","pillar":"Project|Research|Activity|Club","month_start":0,"month_count":2}],'
        '"months":[{"month_index":0,"focus":"short focus for the month","nodes":['
        '{"title":"max 60 chars","kind":"anchor|side|bridge","pillar":"Project|Research|Activity|Club",'
        '"target_axis":"communication|leadership|technicality|resourcefulness|execution",'
        '"technical_depth":1,"execution_mode":1,"blurb":"one plain-language sentence on why now"}]}]}'
    ).replace("{last}", str(months - 1))

    response = await _anthropic.messages.create(
        model=OPUS, max_tokens=8000, system=system,
        messages=[{"role": "user", "content": user_prompt}],
    )
    text = response.content[0].text if response.content else ""
    parsed = _parse_json(text, {})
    months_data = parsed.get("months", []) if isinstance(parsed, dict) else []
    if not isinstance(months_data, list) or not months_data:
        raise ValueError("Failed to generate a roadmap. Please try again.")

    anchor = parsed.get("anchor") or {}
    anchor_title = (anchor.get("title") or "").strip()[:120] or None
    anchor_summary = (anchor.get("summary") or "").strip()[:400] or None

    # Clean headline + typo-fixed goal (point 5 / 5a). Fall back to the raw goal.
    display_title = (parsed.get("display_title") or "").strip()[:80] or None
    goal_clean = (parsed.get("goal_clean") or "").strip()[:600] or goal

    # ── Flatten + enforce bridges deterministically ───────────────────────────
    flat = _flatten(months_data, months)
    if not flat:
        raise ValueError("Failed to generate roadmap nodes. Please try again.")
    n_bridges = _enforce_bridges(flat)
    if n_bridges:
        logger.info(f"[roadmap] injected {n_bridges} bridge(s) to close difficulty cliffs")

    # ── Phases (broad stages) tiled contiguously over the timeline ────────────
    phases = _normalize_phases(parsed.get("phases") or [], months)

    # ── Insert roadmap + nodes ────────────────────────────────────────────────
    today = date.today()
    start_month = today.replace(day=1)

    rm_payload = {
        "user_id": user_id,
        "goal": goal_clean,
        "display_title": display_title,
        "timeframe_months": months,
        "start_month": start_month.isoformat(),
        "status": "active",
        "anchor_title": anchor_title,
        "anchor_summary": anchor_summary,
        "phases": phases,
    }
    if end_month:
        rm_payload["end_month"] = end_month
    rm_res = supabase.from_("roadmaps").insert(rm_payload).execute()
    roadmap = (rm_res.data or [None])[0]
    if not roadmap:
        raise ValueError("Could not save the roadmap. Please try again.")
    roadmap_id = roadmap["id"]

    # Assign order_index per month in flattened (timeline) order.
    per_month_order: dict[int, int] = {}
    node_rows = []
    for n in flat:
        mi = n["month_index"]
        order = per_month_order.get(mi, 0)
        per_month_order[mi] = order + 1
        node_rows.append({
            "roadmap_id":  roadmap_id,
            "user_id":     user_id,
            "month_index": mi,
            "month_label": _month_label(start_month, mi),
            "pillar":      n["pillar"],
            "title":       n["title"],
            "blurb":       n["blurb"],
            "target_axis": n["target_axis"],
            "kind":        n["kind"],
            "technical_depth": n["technical_depth"],
            "execution_mode":  n["execution_mode"],
            "state":       "explore",
            "order_index": order,
        })

    nodes_res = supabase.from_("roadmap_nodes").insert(node_rows).execute()
    nodes = nodes_res.data or []

    logger.info(f"[roadmap] generated {len(nodes)} nodes ({n_bridges} bridges) over {months}mo for {user_id}")
    return {"roadmap": roadmap, "nodes": nodes}
