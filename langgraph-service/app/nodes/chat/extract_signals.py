"""
extract_signals — background task after each chat turn.

Distils what the student revealed into one sentence that seeds the next
session's prompt, and saves what they just said to long-term memory. The
output is never shown as prose, so this runs on the cheapest tier available
rather than the model that writes their advice.
"""
import asyncio
import logging
from datetime import datetime, timezone

from app.db.supabase import get_supabase
from app.llm import json_completion
from app.models import CHAT_SIGNALS_FALLBACK, CHAT_SIGNALS_MODEL
from app.nodes.recall.store import chat_key, remember

logger = logging.getLogger(__name__)

EXTRACTION_PROMPT = """You are analyzing a conversation between a high school student and their college application advisor.

Extract what the student revealed about themselves and their application that is NOT already a structured record field. Their activities, awards, courses, GPA and test scores are stored separately, so do not restate those. What matters here is the softer context an advisor would want to remember next time.

Pay particular attention to context that should change how they are advised: constraints on their time (a job, caring for siblings), what their school actually offers, money worries, family pressure, and how they talk about themselves.

sensitive is true if the student mentioned anything serious that is not about applications: feeling unsafe, a crisis, hurting themselves, abuse, or a mental health emergency. Ordinary stress about school or applications is not sensitive. When it is true, nothing from this conversation is remembered.

Reply with only a JSON object with these keys: college_thoughts, constraints, essay_material and concerns (each an array of short strings), summary (one sentence, or null) and sensitive (true or false). Use an empty array for any category with nothing in it, and null for the summary if they shared nothing personal. Never use em dashes.

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
        "sensitive":        {"type": "boolean",
                             "description": "True if they mentioned something serious that is not about applications: feeling unsafe, a crisis, hurting themselves, abuse, a mental health emergency."},
    },
    "required": ["college_thoughts", "constraints", "essay_material", "concerns", "summary", "sensitive"],
    "additionalProperties": False,
}

MAX_SIGNALS = 20


def _last_student_line(messages: list[dict]) -> str:
    for m in reversed(messages):
        if m.get("role") == "user" and isinstance(m.get("content"), str):
            return m["content"]
    return ""


async def extract_signals(user_id: str, messages: list[dict]) -> None:
    """Fire and forget, after each chat turn. Exceptions are logged, never raised.

    Two things are remembered from a turn, both only while the student has
    memory on: a one-sentence summary for the next session's prompt
    (profiles.chat_signals), and what they just said, in their own words, for
    long-term recall (app/nodes/recall/). A turn the model flags as a serious
    disclosure keeps neither.
    """
    if len(messages) < 2:
        return

    # When they said it. Both writes below refuse to land if they turned memory
    # off, or deleted everything, after this moment, however long the model call takes.
    started = datetime.now(timezone.utc)
    try:
        supabase = get_supabase()
        rows = await asyncio.to_thread(
            lambda: supabase.from_("profiles").select("memory_enabled")
            .eq("id", user_id).limit(1).execute().data or [])
        profile = rows[0] if rows else {}
        if profile.get("memory_enabled") is False:
            logger.info(f"[extract_signals] memory is off for {user_id}; nothing kept")
            return

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
        # A model that read the turn has to clear it as ordinary: flagged, the
        # flag left out, or no answer at all keeps nothing (the same rule as a
        # check-in reply).
        if not isinstance(signals, dict) or signals.get("sensitive") is not False:
            logger.info(f"[extract_signals] not cleared as ordinary for {user_id}; nothing kept from this turn")
            return

        # What they just said, verbatim, for long-term recall. Its own checks
        # (thin, the keyword screen, the switch, the key) happen inside.
        said = _last_student_line(messages)
        if said:
            await remember(user_id, body=said, source="chat", dedupe_key=chat_key(said),
                           enabled=True, started=started)

        summary = signals.get("summary")
        if not summary or not str(summary).strip():
            logger.info(f"[extract_signals] nothing worth keeping for {user_id}")
            return
        summary = str(summary).strip()

        # One atomic append (public.append_chat_signal): it neither undoes a note
        # they deleted meanwhile nor lands after they turned memory off.
        saved = await asyncio.to_thread(
            lambda: supabase.rpc("append_chat_signal", {
                "p_user_id": user_id, "p_note": summary, "p_started": started.isoformat(),
                "p_max": MAX_SIGNALS}).execute().data)
        if saved is True:
            logger.info(f"[extract_signals] stored for {user_id}: {summary[:80]}")
        else:
            logger.info(f"[extract_signals] memory was turned off or cleared meanwhile for {user_id}; note dropped")

    except Exception as exc:
        logger.warning(f"[extract_signals] failed for {user_id}: {exc}")
