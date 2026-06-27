"""
Onboarding profile extraction — port of supabase/functions/extract-profile/index.ts.

Two-stage pipeline:
  1. Haiku sufficiency check — did the student share enough to build a profile?
  2. Sonnet extraction — structured 17-field career profile → written to Supabase.

Returns the same shape the frontend already expects:
  {sufficient: bool, success: bool, profile: {...}, error: str?}
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
SONNET = "claude-sonnet-4-6"


async def _create_with_retry(**kwargs):
    """Call Anthropic with a few backoff retries for transient failures (rate limit /
    overload / network). Raises the last error if all attempts fail."""
    last = None
    for attempt in range(3):
        try:
            return await _anthropic.messages.create(**kwargs)
        except Exception as exc:  # RateLimitError, APIStatusError, APIConnectionError, ...
            last = exc
            if attempt < 2:
                await asyncio.sleep(0.8 * (2 ** attempt))  # 0.8s, 1.6s
    raise last

EXTRACTION_PROMPT = """You are extracting a structured career profile from a voice conversation transcript between an AI career guide and a student.

Return ONLY valid JSON with no other text, no markdown, no backticks. The JSON must contain all fields below.

IMPORTANT RULES:
- "career_matches" must ALWAYS contain exactly 3 career title strings — never empty. Even if the student was undecided, infer the 3 best-fit careers from everything they shared. This field drives scorecard and roadmap generation.
- "onboarding_summary" must always be a warm, encouraging 2–3 sentence description of who the student is and what makes them unique.
- For "mentioned_careers", include ALL careers the student brought up — even ones they rejected or were unsure about. Set "ruled_out" to true for any they dismissed.
- "career_certainty" reflects how decided the student seems overall: "certain" if they know what they want, "exploring" if they're curious but open, "undecided" if they expressed confusion or no direction.
- "self_confidence_level" is based on HOW the student talked about themselves — "low" if hesitant/self-doubting, "high" if assured, "medium" otherwise.
- "personality_signals" are short tags inferred from tone and content (e.g. "analytical", "creative", "introverted", "collaborative", "independent", "hands-on", "empathetic").
- "own_words_keywords" are short phrases or words the student actually used that capture who they are — pull these verbatim or near-verbatim from their speech.
- "conversation_tone" is the dominant emotional register of the student's side of the conversation.
- "motivations" are what the student values in a career — pull from what they said excites them or matters to them (e.g. "income", "creativity", "helping others", "stability", "flexibility", "prestige", "impact").
- "biggest_concern" is the single most prominent fear or worry the student expressed about their future, if any. Null if none detected.
- "external_influences" is a short description of any outside factors shaping their choices — family pressure, financial need, geographic limits, etc. Null if none detected.
- "axis_scores" rates the student 0-100 on five fixed dimensions, based ONLY on evidence in the transcript. Calibrate for a student: a typical motivated student sits around 40-65 on most axes; reserve 80+ for clearly demonstrated excellence and use lower values where there's little evidence. Do not inflate. The five axes:
    - communication: how clearly and confidently they articulate themselves in conversation
    - leadership: initiative, ownership, guiding or influencing others
    - technicality: depth of knowledge and proficiency in their field(s) of interest
    - resourcefulness: capacity to self-educate, find resources, and figure things out independently
    - execution: ability to apply knowledge and actually ship/complete things, follow-through

{{
  "strengths": ["3-5 specific strengths mentioned or demonstrated"],
  "weaknesses": ["2-3 areas for growth"],
  "interests": ["3-5 specific interests or passions"],
  "work_style": "2-3 sentence description of how they like to work",
  "career_matches": ["top 3 most suitable career titles — REQUIRED, never empty"],
  "onboarding_summary": "2-3 warm, encouraging sentences summarizing who this student is and what makes them unique",
  "career_certainty": "certain | exploring | undecided",
  "mentioned_careers": [{{ "title": "career title", "ruled_out": false }}],
  "motivations": ["short value strings"],
  "biggest_concern": "text or null",
  "external_influences": "text or null",
  "self_confidence_level": "low | medium | high",
  "personality_signals": ["short descriptive tags"],
  "own_words_keywords": ["short phrases from the student's own speech"],
  "conversation_tone": "excited | anxious | uncertain | motivated | mixed",
  "axis_scores": {{ "communication": 0-100, "leadership": 0-100, "technicality": 0-100, "resourcefulness": 0-100, "execution": 0-100 }}
}}

Transcript:
{transcript}"""


AXES = ["communication", "leadership", "technicality", "resourcefulness", "execution"]


AXIS_LABELS = {
    "communication": "Communication", "leadership": "Leadership",
    "technicality": "Technicality", "resourcefulness": "Resourcefulness",
    "execution": "Execution",
}


def _coerce_axis_scores(raw) -> dict:
    """Clamp the model's axis scores to ints 0-100; default missing axes to 40."""
    raw = raw if isinstance(raw, dict) else {}
    out = {}
    for axis in AXES:
        try:
            v = int(round(float(raw.get(axis, 40))))
        except (TypeError, ValueError):
            v = 40
        out[axis] = max(0, min(100, v))
    return out


def _initial_living_profile(profile: dict, axis_scores: dict) -> dict:
    """Seed the living profile from the onboarding extraction (no extra AI call).
    Baseline == living on day 1; it diverges as the student acts."""
    matches = profile.get("career_matches") or []
    weakest = sorted(axis_scores.items(), key=lambda kv: kv[1])[:2]
    return {
        "current_summary": profile.get("onboarding_summary") or "",
        "strengths":       profile.get("strengths") or [],
        "interests":       profile.get("interests") or [],
        "career_direction": matches[0] if matches else "",
        "current_focus":   "Just getting started — explore your first quests.",
        "growth_areas":    [AXIS_LABELS[k] for k, _ in weakest],
        "momentum":        "Just getting started.",
    }


def _parse_profile(text: str):
    try:
        return json.loads(text)
    except Exception:
        pass
    match = re.search(r'\{[\s\S]*\}', text)
    if match:
        try:
            return json.loads(match.group(0))
        except Exception:
            pass
    return None


async def extract_profile(user_id: str, transcript: str) -> dict:
    """Run the two-stage extraction and persist the profile. Never raises — on a transient
    AI failure it returns {sufficient: True, success: False, error} so the client shows the
    recoverable retry UI (the saved transcript lets the user re-run) instead of a hard error."""
    supabase = get_supabase()
    now = datetime.now(timezone.utc).isoformat()

    transcript = (transcript or "").strip()

    # ── Step 0: Empty / too-short transcript → not sufficient, skip the AI calls ──
    # Need at least a little back-and-forth to build anything meaningful.
    if len(transcript) < 40:
        return {"sufficient": False}

    # ── Step 1: Save raw transcript immediately for recovery ──────────────────
    try:
        supabase.from_("profiles").update(
            {"raw_voice_transcript": transcript, "updated_at": now}
        ).eq("id", user_id).execute()
    except Exception as exc:
        logger.warning(f"[onboarding] failed to save raw transcript for {user_id}: {exc}")

    # ── Step 2: Sufficiency check (Haiku) ─────────────────────────────────────
    # If Haiku is unavailable, don't fail the whole onboarding on the *gate* — we already
    # know the transcript is non-trivial, so proceed to extraction and let that be the judge.
    try:
        check = await _create_with_retry(
            model=HAIKU,
            max_tokens=64,
            messages=[{
                "role": "user",
                "content": (
                    "A student just finished a voice onboarding conversation with an AI career guide. "
                    "Did the student share enough personal information (interests, strengths, goals, or "
                    'experiences) to meaningfully build a career profile? Reply with only "yes" or "no".\n\n'
                    f"Transcript:\n{transcript}"
                ),
            }],
        )
        check_text = (check.content[0].text if check.content else "").strip().lower()
        if not check_text.startswith("yes"):
            return {"sufficient": False}
    except Exception as exc:
        logger.warning(f"[onboarding] sufficiency check failed for {user_id}, proceeding: {exc}")

    # ── Step 3: Full profile extraction (Sonnet) ──────────────────────────────
    try:
        message = await _create_with_retry(
            model=SONNET,
            max_tokens=2048,
            messages=[{"role": "user", "content": EXTRACTION_PROMPT.format(transcript=transcript)}],
        )
    except Exception as exc:
        logger.error(f"[onboarding] extraction AI call failed for {user_id}: {exc}")
        # Transcript is saved → client shows recovery UI and can retry once the API recovers.
        return {"sufficient": True, "success": False, "error": "AI service is temporarily unavailable. Please try again in a moment."}

    response_text = message.content[0].text if message.content else ""
    profile = _parse_profile(response_text)

    if profile is None:
        logger.error(f"[onboarding] JSON parse failed for {user_id}: {response_text[:500]}")
        return {"sufficient": True, "success": False, "error": "Failed to parse profile from AI response"}

    # ── Step 4: Persist to Supabase ───────────────────────────────────────────
    axis_scores = _coerce_axis_scores(profile.get("axis_scores"))
    living = _initial_living_profile(profile, axis_scores)
    try:
        supabase.from_("profiles").update({
            "strengths":             profile.get("strengths"),
            "weaknesses":            profile.get("weaknesses"),
            "interests":             profile.get("interests"),
            "work_style":            profile.get("work_style"),
            "career_matches":        profile.get("career_matches"),
            "onboarding_summary":    profile.get("onboarding_summary"),
            "onboarding_completed":  True,
            "career_certainty":      profile.get("career_certainty"),
            "mentioned_careers":     profile.get("mentioned_careers"),
            "motivations":           profile.get("motivations"),
            "biggest_concern":       profile.get("biggest_concern"),
            "external_influences":   profile.get("external_influences"),
            "self_confidence_level": profile.get("self_confidence_level"),
            "personality_signals":   profile.get("personality_signals"),
            "own_words_keywords":    profile.get("own_words_keywords"),
            "conversation_tone":     profile.get("conversation_tone"),
            "axis_scores":           axis_scores,
            "living_profile":        living,
            "living_synced_at":      datetime.now(timezone.utc).isoformat(),
            "living_events_since_sync": 0,
            "raw_voice_transcript":  None,  # clear once extracted
            "updated_at":            datetime.now(timezone.utc).isoformat(),
        }).eq("id", user_id).execute()
    except Exception as exc:
        logger.error(f"[onboarding] supabase update failed for {user_id}: {exc}")
        return {"sufficient": True, "success": False, "error": str(exc)}

    logger.info(f"[onboarding] profile extracted + saved for {user_id}")
    return {"sufficient": True, "success": True, "profile": profile}
