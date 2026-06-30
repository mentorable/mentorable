"""
Roadmap post-phase reflection (v3) — readiness scoring.

When the student finishes a phase, they answer a short reflection naming what they actually
worked on. Haiku reads the free-text answer (plus what they completed) and derives a 0-100
readiness score + a one-line summary. We store it on that phase in roadmaps.phases and mirror a
compact note into living_profile.roadmap_progress (cross-feature memory). This endpoint is FREE
(not rate-limited). Marking the phase 'completed' here is what unlocks generating the next phase.

See .claude/ROADMAP_REDESIGN.md.
"""
import json
import logging
import re

from anthropic import AsyncAnthropic

from app.config import ANTHROPIC_API_KEY
from app.db.supabase import get_supabase

logger = logging.getLogger(__name__)

_anthropic = AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
HAIKU = "claude-haiku-4-5-20251001"


def _parse_json(text: str, fallback):
    try:
        return json.loads(text)
    except Exception:
        pass
    m = re.search(r'\{[\s\S]*\}', text)
    if m:
        try:
            return json.loads(m.group(0))
        except Exception:
            pass
    return fallback


async def reflect_on_phase(user_id: str, roadmap_id: str, phase_index: int, reflection_text: str) -> dict:
    """
    Score the reflection, mark the phase completed, store history. Returns
    {"readiness_score": int, "summary": str, "phase_index": int}. Never raises for scoring
    failure (falls back to a neutral score) so the user is never blocked from advancing.
    """
    reflection_text = (reflection_text or "").strip()
    supabase = get_supabase()

    rm_res = (
        supabase.from_("roadmaps").select("id, phases, goal, display_title")
        .eq("id", roadmap_id).eq("user_id", user_id).maybe_single().execute()
    )
    roadmap = rm_res.data
    if not roadmap:
        raise ValueError("Roadmap not found.")
    phases = roadmap.get("phases") or []
    if not isinstance(phases, list) or phase_index < 0 or phase_index >= len(phases):
        raise ValueError("That phase does not exist.")
    phase = phases[phase_index]

    # What they actually completed in this phase (done tasks + their nodes).
    ms, mc = phase["month_start"], phase["month_count"]
    nodes_res = (
        supabase.from_("roadmap_nodes").select("id, title, state")
        .eq("roadmap_id", roadmap_id)
        .gte("month_index", ms).lt("month_index", ms + mc).execute()
    )
    nodes = nodes_res.data or []
    node_titles = [n["title"] for n in nodes]
    node_ids = [n["id"] for n in nodes]
    completed_titles = [n["title"] for n in nodes if n.get("state") == "done"]
    done_task_count = 0
    if node_ids:
        try:
            t_res = (
                supabase.from_("roadmap_tasks").select("id", count="exact")
                .in_("node_id", node_ids).eq("done", True).execute()
            )
            done_task_count = t_res.count or 0
        except Exception:
            pass

    # ── Haiku: derive a readiness score from the free-text reflection ──────────
    readiness_score, summary = 60, "Completed the phase."
    if reflection_text:
        system = (
            "You assess a student's readiness after finishing a roadmap phase, from their own "
            "reflection. Output a readiness score 0-100 (how prepared they are to build on this "
            "phase: low if they struggled or skipped a lot, high if they clearly grasped it) and a "
            "one-sentence plain-language summary of how the phase went. Be fair, not inflated. "
            "NEVER use em dashes. Return ONLY JSON."
        )
        user_prompt = (
            f"Phase: {phase.get('title')}\n"
            f"What was planned: {', '.join(node_titles) or 'n/a'}\n"
            f"They marked complete: {', '.join(completed_titles) or 'none'} "
            f"({done_task_count} checklist tasks done)\n\n"
            f"Their reflection:\n\"{reflection_text}\"\n\n"
            'Return ONLY JSON: {"readiness_score":<0-100 int>,"summary":"one sentence"}'
        )
        try:
            resp = await _anthropic.messages.create(
                model=HAIKU, max_tokens=300, system=system,
                messages=[{"role": "user", "content": user_prompt}],
            )
            parsed = _parse_json(resp.content[0].text if resp.content else "", {})
            rs = parsed.get("readiness_score")
            if isinstance(rs, (int, float)):
                readiness_score = max(0, min(100, int(rs)))
            if (parsed.get("summary") or "").strip():
                summary = parsed["summary"].strip()[:240]
        except Exception as exc:
            logger.warning(f"[roadmap] reflection scoring failed for {user_id}: {exc}")

    # ── Store reflection on the phase + mark completed ─────────────────────────
    new_phases = [dict(p) for p in phases]
    new_phases[phase_index]["status"] = "completed"
    new_phases[phase_index]["reflection"] = {
        "text": reflection_text[:2000],
        "readiness_score": readiness_score,
        "summary": summary,
        "completed": completed_titles,
    }
    supabase.from_("roadmaps").update({"phases": new_phases}).eq("id", roadmap_id).execute()

    # ── Mirror a compact note into living_profile (cross-feature memory) ───────
    try:
        prof = supabase.from_("profiles").select("living_profile").eq("id", user_id).maybe_single().execute()
        living = (prof.data or {}).get("living_profile") or {}
        progress = list(living.get("roadmap_progress") or [])
        progress.append({"phase": phase.get("title"), "readiness": readiness_score, "summary": summary})
        living["roadmap_progress"] = progress[-8:]  # keep it bounded
        supabase.from_("profiles").update({"living_profile": living}).eq("id", user_id).execute()
    except Exception as exc:
        logger.warning(f"[roadmap] could not mirror phase progress for {user_id}: {exc}")

    logger.info(f"[roadmap] phase {phase_index} reflected (readiness {readiness_score}) for {user_id}")
    return {"readiness_score": readiness_score, "summary": summary, "phase_index": phase_index}
