"""
Scorecard axis improvement — generates 3 targeted quest suggestions for ONE axis.

Returns suggestions only (not inserted); the client adds the chosen ones to the
board, tagged with the axis, so completing them raises that exact score.
"""
import json
import logging
import re

from anthropic import AsyncAnthropic

from app.config import ANTHROPIC_API_KEY
from app.db.supabase import get_supabase

logger = logging.getLogger(__name__)

_anthropic = AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
SONNET = "claude-sonnet-4-6"

AXES = {
    "communication":   "articulating ideas clearly — writing, speaking, presenting, persuading",
    "leadership":      "taking initiative, organizing, mentoring or leading others",
    "technicality":    "deepening domain knowledge and hard technical skill",
    "resourcefulness": "self-directed research and learning — finding and using resources independently",
    "execution":       "building, shipping, and completing concrete things end-to-end",
}


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


async def improve_axis(user_id: str, axis: str) -> dict:
    """Returns {"axis": ..., "suggestions": [...]} — 3 quest suggestions, NOT inserted."""
    axis = (axis or "").strip().lower()
    if axis not in AXES:
        raise ValueError("invalid axis")

    supabase = get_supabase()
    profile_res = (
        supabase.from_("profiles").select(
            "full_name, grade_level, education_level, interests, strengths, "
            "career_matches, work_style, axis_scores, research_findings"
        ).eq("id", user_id).maybe_single().execute()
    )
    existing_res = (
        supabase.from_("quest_items").select("title")
        .eq("user_id", user_id)
        .in_("status", ["suggested", "considered", "in_progress", "active"])
        .execute()
    )
    profile = profile_res.data or {}
    existing_titles = [q["title"] for q in (existing_res.data or []) if q.get("title")]

    # Build context
    parts = []
    if profile.get("full_name"):      parts.append(f"Name: {profile['full_name']}")
    if profile.get("grade_level"):    parts.append(f"Grade: {profile['grade_level']}")
    if profile.get("interests"):      parts.append(f"Interests: {', '.join(profile['interests'])}")
    if profile.get("strengths"):      parts.append(f"Strengths: {', '.join(profile['strengths'])}")
    if profile.get("career_matches"): parts.append(f"Career matches: {', '.join(profile['career_matches'])}")
    if profile.get("work_style"):     parts.append(f"Work style: {profile['work_style']}")
    scores = profile.get("axis_scores") or {}
    if scores:
        parts.append("Current scores: " + ", ".join(f"{k} {v}" for k, v in scores.items()))
    context = "\n".join(parts)

    findings = profile.get("research_findings") or []
    findings_block = ""
    if isinstance(findings, list) and findings:
        lines = [f"- {f.get('title','')}: {f.get('summary','')[:120]}" for f in findings[:4] if f.get("title")]
        if lines:
            findings_block = "\n\nThings they've researched (build on these if relevant):\n" + "\n".join(lines)

    dupes = ("\n\nAvoid duplicating existing quests:\n" + "\n".join(f"- {t}" for t in existing_titles)) if existing_titles else ""

    response = await _anthropic.messages.create(
        model=SONNET,
        max_tokens=1200,
        system=(
            f"You are Mentorable's quest engine. The student wants to improve their "
            f"**{axis}** score — {AXES[axis]}. Generate exactly 3 specific, actionable "
            f"quests that directly build {axis}. Each should be concrete and doable by a "
            f"student in days-to-weeks. Tailor to their profile.\n\n"
            "For each: title (max 60 chars), description (1-2 sentences with concrete next "
            "steps), category (Project|Research|Application|Learning|Other), estimated_time, "
            "difficulty (Easy|Medium|Hard), why_it_matters (max 80 chars, tie to building "
            f"{axis}). Return ONLY valid JSON, no markdown."
        ),
        messages=[{
            "role": "user",
            "content": (
                f"## Student\n{context}{findings_block}{dupes}\n\n"
                f"Generate exactly 3 quests to improve {axis}. Return ONLY JSON:\n"
                '{"suggestions":[{"title":"...","description":"...","category":"Project|Research|Application|Learning|Other","estimated_time":"1–2 weeks","difficulty":"Easy|Medium|Hard","why_it_matters":"..."}]}'
            ),
        }],
    )

    text = response.content[0].text if response.content else ""
    parsed = _parse_json(text, {"suggestions": []})
    suggestions = parsed.get("suggestions", []) if isinstance(parsed, dict) else []
    suggestions = [s for s in suggestions if isinstance(s, dict) and s.get("title")][:3]
    if not suggestions:
        raise ValueError("Failed to generate suggestions")

    # Force the axis tag onto every suggestion.
    for s in suggestions:
        s["target_axis"] = axis

    logger.info(f"[scorecard] {len(suggestions)} {axis} suggestions for {user_id}")
    return {"axis": axis, "suggestions": suggestions}
