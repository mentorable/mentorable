"""
extract_signals — background task after each chat turn.

Distils what the student revealed into one sentence that seeds the next
session's prompt. The output is never shown as prose, so this runs on the
cheapest tier available rather than the model that writes their advice.
"""
import logging

from app.db.supabase import get_supabase
from app.llm import json_completion
from app.models import CHAT_SIGNALS_FALLBACK, CHAT_SIGNALS_MODEL

logger = logging.getLogger(__name__)

EXTRACTION_PROMPT = """You are analyzing a conversation between a high school student and their college application advisor.

Extract what the student revealed about themselves and their application that is NOT already a structured record field. Their activities, awards, courses, GPA and test scores are stored separately, so do not restate those. What matters here is the softer context an advisor would want to remember next time.

Pay particular attention to context that should change how they are advised: constraints on their time (a job, caring for siblings), what their school actually offers, money worries, family pressure, and how they talk about themselves.

Use an empty array for any category with nothing in it, and null for the summary if they shared nothing personal. Never use em dashes.

Conversation:
{conversation}"""

# Strict mode: every property required, no extras. Nullable via a union type.
SIGNALS_SCHEMA = {
    "type": "object",
    "properties": {
        "college_thoughts": {"type": "array", "items": {"type": "string"},
                             "description": "Schools, majors or paths they mentioned, and how they felt about them."},
        "constraints":      {"type": "array", "items": {"type": "string"},
                             "description": "Money, time, family, school resources, anything limiting their options."},
        "essay_material":   {"type": "array", "items": {"type": "string"},
                             "description": "Moments or turns of phrase that could matter for an essay later."},
        "concerns":         {"type": "array", "items": {"type": "string"},
                             "description": "Worries or pressure they expressed."},
        "summary":          {"type": ["string", "null"],
                             "description": "One sentence an advisor would want before the next conversation."},
    },
    "required": ["college_thoughts", "constraints", "essay_material", "concerns", "summary"],
    "additionalProperties": False,
}

MAX_SIGNALS = 20


async def extract_signals(user_id: str, messages: list[dict]) -> None:
    """Fire and forget. Exceptions are logged, never raised into the request."""
    if len(messages) < 2:
        return

    try:
        conversation = "\n".join(
            f"{m['role'].upper()}: {m['content'][:500]}"
            for m in messages[-12:]
            if m.get("content")
        )

        signals = await json_completion(
            prompt=EXTRACTION_PROMPT.format(conversation=conversation),
            schema=SIGNALS_SCHEMA,
            schema_name="chat_signals",
            openai_model=CHAT_SIGNALS_MODEL,
            anthropic_model=CHAT_SIGNALS_FALLBACK,
            max_tokens=512,
        )
        if not isinstance(signals, dict):
            return

        summary = signals.get("summary")
        if not summary or not str(summary).strip():
            logger.info(f"[extract_signals] nothing worth keeping for {user_id}")
            return
        summary = str(summary).strip()

        supabase = get_supabase()
        existing = (
            supabase.from_("profiles").select("chat_signals")
            .eq("id", user_id).maybe_single().execute()
        ).data or {}

        current = existing.get("chat_signals")
        if not isinstance(current, list):
            current = []
        current = [*current, summary][-MAX_SIGNALS:]

        supabase.from_("profiles").update({"chat_signals": current}).eq("id", user_id).execute()
        logger.info(f"[extract_signals] stored for {user_id}: {summary[:80]}")

    except Exception as exc:
        logger.warning(f"[extract_signals] failed for {user_id}: {exc}")
