"""
Saving what a student says, and running memory work in the background.

A memory is one line in their own words: a chat message, a Quest check-in, or
the answer to a check-in's follow-up question. It is saved exactly as written
(clipped to 500 characters), with where it was said and when. Saving happens
after the thing it came from has already landed, in the background, so a slow
or failed save can never cost a check-in, a streak or a chat reply.

Nothing is saved when memory is off for the student (profiles.memory_enabled),
when there is no OpenAI key, or when safety.worth_saving says no.
"""
import asyncio
import hashlib
import logging
from datetime import datetime, timezone
from typing import Optional

from app.db.supabase import get_supabase
from app.nodes.recall import embed
from app.nodes.recall.safety import looks_sensitive, worth_saving

logger = logging.getLogger(__name__)

MAX_BODY = 500
MAX_CONTEXT = 120
# Newest kept, oldest dropped. About four years of daily check-ins; the cap
# exists so one student's memories cannot grow without bound.
MEMORY_CAP = 1500
SOURCES = {"chat", "checkin", "followup"}


# ── Background work ───────────────────────────────────────────────────────────

_tasks: set = set()


def spawn(coro) -> None:
    """Run a coroutine in the background after the response. A reference is
    kept until it finishes: a bare create_task can be garbage collected
    mid-flight."""
    task = asyncio.get_running_loop().create_task(coro)
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)


async def drain() -> None:
    """Wait for background memory work. For tests and scripts."""
    while _tasks:
        await asyncio.gather(*list(_tasks), return_exceptions=True)


# ── Small helpers ─────────────────────────────────────────────────────────────

def _clip(text, limit: int) -> str:
    text = " ".join(str(text or "").split())
    return text if len(text) <= limit else text[:limit].rstrip()


def chat_key(body: str) -> str:
    """Chat lines have no id of their own, so the words are the key: saying the
    same thing twice keeps one copy, and a backfill finds what was saved live."""
    digest = hashlib.sha1(_clip(body, MAX_BODY).lower().encode("utf-8")).hexdigest()
    return f"chat:{digest[:24]}"


def memory_text(body: str, context: str = "") -> str:
    """What gets embedded: the words, led by where they were said, so a check-in
    about a task is findable by the task ("problems with the dataset")."""
    return f"{context}: {body}" if context else body


def memory_available(profile: dict) -> bool:
    """For a profile already in hand (the chat's): an OpenAI key, and the
    student's switch not off."""
    return embed.enabled() and (profile or {}).get("memory_enabled") is not False


def memory_on(user_id: str) -> bool:
    """The student's switch, and whether memory can work at all. Fails closed:
    if the switch cannot be read, nothing is saved or recalled."""
    if not embed.enabled():
        return False
    try:
        rows = (get_supabase().from_("profiles").select("memory_enabled")
                .eq("id", user_id).limit(1).execute().data) or []
    except Exception as exc:
        logger.warning(f"[memory] could not read the memory switch for {user_id}: {exc}")
        return False
    return bool(rows) and rows[0].get("memory_enabled") is not False


# ── Saving ────────────────────────────────────────────────────────────────────

SAVE_BATCH = 50  # rows per database call; each carries a 1536-number vector


async def remember(user_id: str, *, body: str, source: str, dedupe_key: str, context: str = "",
                   quest_id: Optional[str] = None, created_at: Optional[datetime] = None,
                   enabled: Optional[bool] = None, started: Optional[datetime] = None) -> bool:
    """Save one thing they said. True if it was saved (or already was).

    Never raises. `enabled` skips the switch lookup when the caller already
    checked it. `started` is when they said it: pass the moment the request
    began, so that if they delete everything while the save is under way, the
    save loses (see remember_many)."""
    item = {"body": body, "source": source, "dedupe_key": dedupe_key, "context": context,
            "quest_id": quest_id, "created_at": created_at}
    return await remember_many(user_id, [item], enabled=enabled, started=started) == 1


async def remember_many(user_id: str, items: list[dict], *, enabled: Optional[bool] = None,
                        started: Optional[datetime] = None, strict: bool = False) -> int:
    """Save several things they said, embedded in batches: the live path saves
    one, the backfill a student's whole history. Returns how many were saved
    (or already were), 0 when nothing was written. Never raises.

    Each item has body, source and dedupe_key, and optionally context, quest_id
    and created_at (a datetime: a backfilled line keeps the day it was said).

    The write itself checks the student's switch and whether they have deleted
    their memory since `started` (default: now, before the embedding call), in
    the same transaction (public.save_student_memories). Checking only up front
    would let a save that began before "Delete everything" land after it.
    `strict` uses the wider safety screen (the backfill)."""
    started = started or datetime.now(timezone.utc)
    rows, texts, seen = [], [], set()
    for item in items:
        body = _clip(item.get("body"), MAX_BODY)
        context = _clip(item.get("context"), MAX_CONTEXT)
        key = str(item.get("dedupe_key") or "")[:200]
        if (item.get("source") not in SOURCES or not key or key in seen
                or not worth_saving(body, strict) or looks_sensitive(context, strict)):
            continue
        seen.add(key)
        when = item.get("created_at")
        rows.append({"body": body, "context": context, "source": item["source"],
                     "quest_id": item.get("quest_id"), "dedupe_key": key,
                     "embedding_model": embed.model_label(), "created_at": when.isoformat() if when else None})
        texts.append(memory_text(body, context))
    if not rows:
        return 0
    if enabled is None:
        enabled = await asyncio.to_thread(memory_on, user_id)
    if not enabled:
        return 0

    vectors = await embed.embed(texts)
    if vectors is None:
        return 0
    for row, vector in zip(rows, vectors):
        row["embedding"] = vector

    def write() -> bool:
        sb = get_supabase()
        for start in range(0, len(rows), SAVE_BATCH):
            res = sb.rpc("save_student_memories", {
                "p_user_id": user_id, "p_rows": rows[start:start + SAVE_BATCH],
                "p_started": started.isoformat(), "p_keep": MEMORY_CAP}).execute()
            if res.data is not True:
                return False  # the switch is off, or they cleared their memory meanwhile
        return True

    try:
        accepted = await asyncio.to_thread(write)
    except Exception as exc:
        logger.warning(f"[memory] could not save {len(rows)} memories for {user_id}: {exc}")
        return 0
    if not accepted:
        logger.info(f"[memory] memory was turned off or cleared while saving for {user_id}; nothing kept")
        return 0
    logger.info(f"[memory] saved {len(rows)} memories ({', '.join(sorted({r['source'] for r in rows}))}) for {user_id}")
    return len(rows)
