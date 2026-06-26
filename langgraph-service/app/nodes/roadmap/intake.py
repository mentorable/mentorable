"""
Roadmap intake (v2) — the lightweight pre-questionnaire.

After the user enters a goal + end month, Haiku looks at the goal AND what the living
profile already knows, then returns UP TO 3 questions for the *gaps only* — things vital
to a personalized roadmap that we don't already have. MCQ or short-answer, skippable.
This endpoint is FREE (not rate-limited); answers feed /roadmap/generate and persist to
living_profile.intake there.

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
    m = re.search(r'(\{[\s\S]*\}|\[[\s\S]*\])', text)
    if m:
        try:
            return json.loads(m.group(0))
        except Exception:
            pass
    return fallback


async def generate_intake_questions(user_id: str, goal: str, end_month: str | None = None) -> dict:
    """Returns {"questions": [{id, prompt, type:'mcq'|'text', options?:[...]}]} — at most 3.
    Never raises for content; returns an empty list on failure so the flow can proceed."""
    goal = (goal or "").strip()
    if not goal:
        return {"questions": []}

    supabase = get_supabase()
    prof_res = (
        supabase.from_("profiles")
        .select("grade_level, education_level, interests, strengths, career_matches, "
                "onboarding_summary, living_profile")
        .eq("id", user_id).maybe_single().execute()
    )
    profile = prof_res.data or {}
    living = profile.get("living_profile") or {}

    known = []
    if profile.get("grade_level"):       known.append(f"grade {profile['grade_level']}")
    if profile.get("education_level"):   known.append(f"education: {profile['education_level']}")
    interests = living.get("interests") or profile.get("interests") or []
    if interests:                        known.append(f"interests: {', '.join(interests)}")
    strengths = living.get("strengths") or profile.get("strengths") or []
    if strengths:                        known.append(f"strengths: {', '.join(strengths)}")
    if living.get("current_summary"):    known.append(f"summary: {living['current_summary']}")
    if living.get("intake"):             known.append("prior intake: " + ", ".join(f"{k}={v}" for k, v in living["intake"].items()))
    known_str = "; ".join(known) or "almost nothing yet"

    system = (
        "You are setting up a personalized roadmap for a student. Generate AT MOST 3 short "
        "questions capturing ONLY what is genuinely vital to plan this specific roadmap AND that "
        "we do NOT already know. If we already know something, do not ask it. Prefer multiple-"
        "choice for fast answers; use short-answer only when options can't capture it. It must "
        "feel effortless — fewer is better; return an empty list if nothing vital is missing.\n\n"
        "Good gap questions: weekly time they can commit, current skill level in the goal area, "
        "what they most want to show / build toward, access constraints. Never ask their grade, "
        "name, or anything already known.\n\n"
        "Return ONLY valid JSON, no markdown."
    )
    user_prompt = (
        f"Goal: {goal}\n"
        f"End month: {end_month or 'not specified'}\n"
        f"Already known about them: {known_str}\n\n"
        "Return ONLY JSON:\n"
        '{"questions":[{"id":"hours_per_week","prompt":"...","type":"mcq","options":["...","..."]},'
        '{"id":"...","prompt":"...","type":"text"}]}'
    )

    try:
        resp = await _anthropic.messages.create(
            model=HAIKU, max_tokens=700, system=system,
            messages=[{"role": "user", "content": user_prompt}],
        )
        parsed = _parse_json(resp.content[0].text if resp.content else "", {"questions": []})
    except Exception as exc:
        logger.warning(f"[roadmap] intake generation failed for {user_id}: {exc}")
        return {"questions": []}

    raw = parsed.get("questions") if isinstance(parsed, dict) else None
    if not isinstance(raw, list):
        return {"questions": []}

    questions = []
    for i, q in enumerate(raw[:3]):
        if not isinstance(q, dict):
            continue
        prompt = (q.get("prompt") or "").strip()
        if not prompt:
            continue
        qtype = (q.get("type") or "text").strip().lower()
        qtype = qtype if qtype in ("mcq", "text") else "text"
        item = {
            "id": (q.get("id") or f"q{i}").strip()[:40],
            "prompt": prompt[:160],
            "type": qtype,
        }
        if qtype == "mcq":
            opts = [str(o).strip()[:60] for o in (q.get("options") or []) if str(o).strip()]
            if len(opts) < 2:
                item["type"] = "text"  # not enough options → degrade to free text
            else:
                item["options"] = opts[:5]
        questions.append(item)

    logger.info(f"[roadmap] intake produced {len(questions)} question(s) for {user_id}")
    return {"questions": questions}
