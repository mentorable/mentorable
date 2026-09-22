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

EXTRACTION_PROMPT = """You are analyzing a conversation between a high school student and their college application advisor.

Extract what the student revealed about themselves and their application that is NOT already a structured record field. Their activities, awards, courses, GPA and test scores are stored separately, so do not restate those. What matters here is the softer context an advisor would want to remember next time.

Pay particular attention to context that should change how they are advised: constraints on their time (a job, caring for siblings), what their school actually offers, money worries, family pressure, and how they talk about themselves.

Return JSON with this exact shape. Every key is required. Use empty arrays if nothing found for that category:
{{
  "college_thoughts": ["schools, majors or paths they mentioned considering, and how they felt about them"],
  "constraints": ["money, time, family, school resources, anything limiting their options"],
  "essay_material": ["moments, experiences or turns of phrase that could matter for an essay later"],
  "concerns": ["worries or pressure they expressed"],
  "summary": "one sentence an advisor would want to read before their next conversation, or null if they shared nothing personal"
}}

Never use em dashes.

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

        # Extract JSON object robustly — works regardless of markdown fences or prose
        import re
        match = re.search(r'\{[\s\S]*\}', raw)
        if not match:
            logger.info(f"[extract_signals] No JSON object found in response for {user_id}")
            return

        signals = json.loads(match.group(0))
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
