"""
Finding what a student said before, and showing it to a model.

recall() is the one way in. It embeds the query and runs the search in Postgres
(public.recall_memories), scoped to that student, with the constants from
rank.SETTINGS. It never raises and never blocks for long: memory off, no key,
nothing relevant, a failure or a timeout all come back as an empty list, and
every caller treats "no memories" as the normal case.

Recalled lines go into prompts as data, clearly marked as the student's own
earlier words, never as instructions.
"""
import asyncio
import logging
from datetime import date, datetime, timezone
from typing import Optional

from app.db.supabase import get_supabase
from app.nodes.recall import embed
from app.nodes.recall.rank import SETTINGS
from app.nodes.recall.store import memory_on

logger = logging.getLogger(__name__)

MAX_QUERY_CHARS = 1000
MAX_LIMIT = 8
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _parse_time(value) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


async def _search(user_id: str, query: str, limit: int, exclude_key: Optional[str],
                  enabled: Optional[bool]) -> list[dict]:
    if enabled is None:
        enabled = await asyncio.to_thread(memory_on, user_id)
    if not enabled:
        return []
    vector = await embed.embed_one(query)
    if vector is None:
        return []
    params = {
        "p_user_id": user_id, "p_embedding": vector, "p_query": query,
        "p_limit": limit, "p_min_similarity": SETTINGS.min_similarity,
        "p_text_min_matches": SETTINGS.text_min_matches, "p_rrf_k": SETTINGS.rrf_k,
        "p_recency_weight": SETTINGS.recency_weight, "p_recency_days": SETTINGS.recency_days,
        "p_exclude_key": exclude_key,
    }
    rows = await asyncio.to_thread(
        lambda: get_supabase().rpc("recall_memories", params).execute().data or [])
    out = []
    for r in rows:
        when = _parse_time(r.get("created_at"))
        if not r.get("body") or when is None:
            continue
        out.append({
            "id": r.get("id"), "body": r["body"], "context": r.get("context") or "",
            "source": r.get("source") or "chat", "quest_id": r.get("quest_id"), "created_at": when,
            "similarity": r.get("similarity"), "matched": r.get("matched"),
        })
    return out


async def recall(user_id: str, query, *, limit: int = 5, exclude_key: Optional[str] = None,
                 enabled: Optional[bool] = None, timeout: Optional[float] = None) -> list[dict]:
    """The student's earlier words most relevant to `query`, best first.

    [] when memory is off, there is no key, nothing is relevant, or anything
    fails. `timeout` caps the whole thing, for callers a student is waiting on.
    `enabled` skips the switch lookup when the caller already checked it."""
    query = " ".join(str(query or "").split())[:MAX_QUERY_CHARS]
    if not query or not embed.enabled():
        return []
    try:
        limit = max(1, min(int(limit or 5), MAX_LIMIT))
    except (TypeError, ValueError):
        limit = 5
    try:
        search = _search(user_id, query, limit, exclude_key, enabled)
        return await (asyncio.wait_for(search, timeout) if timeout else search)
    except asyncio.TimeoutError:
        logger.warning(f"[memory] recall timed out for {user_id}")
    except Exception as exc:
        logger.warning(f"[memory] recall failed for {user_id}: {exc}")
    return []


# ── Showing memories ──────────────────────────────────────────────────────────

def where_said(memory: dict) -> str:
    context = memory.get("context") or ""
    source = memory.get("source")
    if source == "checkin" and context:
        return f'checking in on "{context}"'
    if source == "followup" and context:
        return f'answering a follow-up about "{context}"'
    if source in ("checkin", "followup"):
        return "in a Quest check-in"
    return "in chat"


def date_label(when: datetime, today: Optional[date] = None) -> str:
    today = today or datetime.now(timezone.utc).date()
    day = when.date()
    label = f"{MONTHS[day.month - 1]} {day.day}"
    return label if day.year == today.year else f"{label}, {day.year}"


def prompt_lines(memories: list[dict], today: Optional[date] = None, max_chars: int = 300) -> str:
    """Memories as quoted lines for a prompt, or "" when there are none."""
    lines = []
    for m in memories:
        words = " ".join(str(m.get("body") or "").split())
        if len(words) > max_chars:
            words = words[:max_chars].rstrip() + "..."
        words = words.replace('"', "'")
        lines.append(f'- "{words}" ({where_said(m)}, {date_label(m["created_at"], today)})')
    return "\n".join(lines)


def tool_payload(memories: list[dict], today: Optional[date] = None) -> list[dict]:
    """Memories for the chat advisor's recall_memory tool."""
    today = today or datetime.now(timezone.utc).date()
    return [{
        "said": m["body"],
        "where": where_said(m),
        "when": m["created_at"].date().isoformat(),
        "days_ago": max(0, (today - m["created_at"].date()).days),
    } for m in memories]
