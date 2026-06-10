"""
Living profile — evolving user memory.

Re-synthesizes a focused, current picture of the student from the frozen
onboarding baseline + recent activity (completed quests, axis-score gains,
research, chat signals). Recent reality wins; the baseline is never touched, so
pivots surface in `momentum`. See .claude/MEMORY_REDESIGN.md.

Trigger model: milestone + lazy. award_axis_points increments
profiles.living_events_since_sync on every meaningful action; once it crosses
the threshold, the next feature load fires synthesize in the background.
"""
import asyncio
import json
import logging
import re
from datetime import datetime, timezone

from anthropic import AsyncAnthropic

from app.config import ANTHROPIC_API_KEY
from app.db.supabase import get_supabase

logger = logging.getLogger(__name__)

_anthropic = AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
HAIKU = "claude-haiku-4-5-20251001"

REFRESH_THRESHOLD = 3
FIELDS = ["current_summary", "strengths", "interests", "career_direction", "current_focus", "growth_areas", "momentum"]
LIST_FIELDS = {"strengths", "interests", "growth_areas"}


def _parse_json(text: str):
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
    return None


def _coerce(raw: dict, prev: dict) -> dict:
    """Validate the model output into the 7-field shape; fall back to prev per field."""
    raw = raw if isinstance(raw, dict) else {}
    prev = prev or {}
    out = {}
    for f in FIELDS:
        v = raw.get(f, None)
        if f in LIST_FIELDS:
            if isinstance(v, list):
                out[f] = [str(x).strip() for x in v if str(x).strip()][:8]
            else:
                out[f] = prev.get(f) or []
        else:
            out[f] = (str(v).strip() if v else "") or (prev.get(f) or "")
    return out


async def synthesize_living_profile(user_id: str) -> None:
    """Rebuild profiles.living_profile from baseline + recent activity. Never raises."""
    try:
        supabase = get_supabase()
        prof_res = (
            supabase.from_("profiles").select(
                "full_name, onboarding_summary, strengths, weaknesses, interests, "
                "career_matches, motivations, work_style, axis_scores, "
                "research_findings, chat_signals, living_profile, living_synced_at"
            ).eq("id", user_id).maybe_single().execute()
        )
        p = prof_res.data or {}
        prev_living = p.get("living_profile") or {}
        synced_at = p.get("living_synced_at")

        # Recent completed quests
        quests_res = (
            supabase.from_("quest_items")
            .select("title, category, target_axis, completed_at")
            .eq("user_id", user_id).eq("status", "completed")
            .order("completed_at", desc=True).limit(15).execute()
        )
        completed = quests_res.data or []

        # Axis movements since last sync
        ev_q = supabase.from_("score_events").select("axis, delta, reason, created_at").eq("user_id", user_id)
        if synced_at:
            ev_q = ev_q.gte("created_at", synced_at)
        events = (ev_q.order("created_at", desc=True).limit(40).execute().data) or []

        # ── Build the digest ──────────────────────────────────────────────────
        baseline = []
        if p.get("full_name"):          baseline.append(f"Name: {p['full_name']}")
        if p.get("onboarding_summary"): baseline.append(f"Onboarding summary: {p['onboarding_summary']}")
        if p.get("strengths"):          baseline.append(f"Onboarding strengths: {', '.join(p['strengths'])}")
        if p.get("interests"):          baseline.append(f"Onboarding interests: {', '.join(p['interests'])}")
        if p.get("career_matches"):     baseline.append(f"Onboarding career matches: {', '.join(p['career_matches'])}")
        if p.get("motivations"):        baseline.append(f"Motivations: {', '.join(p['motivations'])}")

        activity = []
        if completed:
            activity.append("Completed quests (newest first):\n" + "\n".join(
                f"- {q.get('title','')} [{q.get('target_axis','')}/{q.get('category','')}]" for q in completed
            ))
        if events:
            agg = {}
            for e in events:
                agg[e["axis"]] = agg.get(e["axis"], 0) + (e.get("delta") or 0)
            activity.append("Skill gains since last update: " + ", ".join(f"{k} +{int(v)}" for k, v in agg.items() if v))
        scores = p.get("axis_scores") or {}
        if scores:
            activity.append("Current scores: " + ", ".join(f"{k} {v}" for k, v in scores.items()))
        rf = p.get("research_findings") or []
        if isinstance(rf, list) and rf:
            activity.append("Recently researched: " + "; ".join(f"{f.get('title','')}" for f in rf[:6] if f.get("title")))
        cs = p.get("chat_signals") or []
        if isinstance(cs, list) and cs:
            activity.append("Shared in chat:\n" + "\n".join(f"- {s}" for s in cs[-8:] if isinstance(s, str)))

        if not activity:
            logger.info(f"[living] no activity for {user_id}; skipping synthesis")
            return

        prompt = (
            "You maintain a student's LIVING career profile — a current, evolving snapshot.\n\n"
            "## Frozen baseline (who they were at onboarding — do NOT just copy it)\n"
            + ("\n".join(baseline) or "(none)") +
            "\n\n## Current living profile (evolve from this)\n"
            + json.dumps(prev_living) +
            "\n\n## Recent activity (this is reality NOW — weight it highest)\n"
            + "\n".join(activity) +
            "\n\nRewrite the living profile to reflect who the student is RIGHT NOW. Recent activity "
            "wins: it's fine to drop interests that have gone cold and to shift career_direction. If "
            "their direction has clearly changed from the baseline, name the pivot in `momentum` "
            "(e.g. 'Shifted from pre-med toward CS'). Keep it concrete and grounded in the evidence.\n\n"
            "Return ONLY valid JSON, no markdown:\n"
            '{"current_summary":"2-3 sentences, who they are now","strengths":["..."],'
            '"interests":["..."],"career_direction":"their current primary direction",'
            '"current_focus":"what they are actively pursuing now","growth_areas":["..."],'
            '"momentum":"one short sentence on their trajectory/recent wins"}'
        )

        resp = await _anthropic.messages.create(
            model=HAIKU, max_tokens=700,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = resp.content[0].text if resp.content else ""
        parsed = _parse_json(raw)
        if not parsed:
            logger.warning(f"[living] parse failed for {user_id}: {raw[:200]}")
            return

        living = _coerce(parsed, prev_living)
        supabase.from_("profiles").update({
            "living_profile": living,
            "living_synced_at": datetime.now(timezone.utc).isoformat(),
            "living_events_since_sync": 0,
        }).eq("id", user_id).execute()
        logger.info(f"[living] resynthesized for {user_id}: focus={living.get('current_focus','')[:50]!r}")

    except Exception as exc:
        logger.warning(f"[living] synthesis failed for {user_id}: {exc}")


async def maybe_refresh_living_profile(user_id: str, events_since_sync: int | None = None) -> None:
    """If enough activity has accrued, schedule a background re-synthesis (non-blocking)."""
    try:
        if events_since_sync is None:
            res = (
                get_supabase().from_("profiles")
                .select("living_events_since_sync")
                .eq("id", user_id).maybe_single().execute()
            )
            events_since_sync = (res.data or {}).get("living_events_since_sync", 0)
        if (events_since_sync or 0) >= REFRESH_THRESHOLD:
            asyncio.create_task(synthesize_living_profile(user_id))
    except Exception as exc:
        logger.warning(f"[living] maybe_refresh failed for {user_id}: {exc}")
