"""
extract_signals — runs as a background task after each chat session closes.
Uses Haiku to detect high-signal profile updates from the conversation.
Only writes back to Supabase if something meaningful is found.
"""
import json
import logging
from anthropic import AsyncAnthropic
from app.config import ANTHROPIC_API_KEY
from app.db.supabase import get_supabase

logger = logging.getLogger(__name__)

_anthropic = AsyncAnthropic(api_key=ANTHROPIC_API_KEY)

EXTRACTION_PROMPT = """You are analyzing a conversation between a student and an AI career mentor.

Extract any HIGH-SIGNAL profile updates — things the student revealed that would meaningfully change how the mentor should understand them. Only extract if genuinely significant (new career interest, major life event, significant mindset shift, new skill, completed achievement).

Do NOT extract: casual mentions, generic statements, things already known, small talk.

Return JSON with this exact shape (omit any key if nothing meaningful found):
{
  "new_interests": ["..."],
  "career_shifts": ["..."],
  "new_achievements": ["..."],
  "mindset_signals": ["..."],
  "summary": "one sentence describing what changed, or null if nothing significant"
}

Conversation:
{conversation}"""


async def extract_signals(user_id: str, messages: list[dict]) -> None:
    """
    Background task. Fire-and-forget — exceptions are logged but not raised.
    messages: list of {role, content} dicts from the session.
    """
    if len(messages) < 2:
        return

    try:
        conversation = "\n".join(
            f"{m['role'].upper()}: {m['content'][:500]}"
            for m in messages[-12:]  # last 6 turns (12 messages)
            if m.get("content")
        )

        response = await _anthropic.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=256,
            messages=[{
                "role": "user",
                "content": EXTRACTION_PROMPT.format(conversation=conversation),
            }],
        )

        raw = response.content[0].text.strip()
        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]

        signals = json.loads(raw)
        summary = signals.get("summary")

        if not summary:
            logger.info(f"[extract_signals] No significant signals found for user {user_id}")
            return

        logger.info(f"[extract_signals] Signals found for {user_id}: {summary}")

        # Write signals back to profiles as chat_signals array
        supabase = get_supabase()
        profile_res = (
            supabase.from_("profiles")
            .select("chat_signals")
            .eq("id", user_id)
            .maybe_single()
            .execute()
        )
        existing = profile_res.data or {}
        current_signals = existing.get("chat_signals") or []
        if not isinstance(current_signals, list):
            current_signals = []

        current_signals.append(summary)
        # Keep last 20 signals
        current_signals = current_signals[-20:]

        supabase.from_("profiles").update(
            {"chat_signals": current_signals}
        ).eq("id", user_id).execute()

        logger.info(f"[extract_signals] Wrote signal to profiles for {user_id}")

    except Exception as exc:
        logger.warning(f"[extract_signals] Failed for {user_id}: {exc}")
