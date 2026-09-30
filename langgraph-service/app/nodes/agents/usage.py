"""
Agent budgets: spend, refund and count what is left.

The counts live in agent_usage, one row per (student, agent, kind, bucket),
and only change through agent_bump_usage (an atomic check-and-increment, with
the same dev-email bypass as Quest) and agent_refund_usage. The bucket is
"all" for a lifetime cap and the UTC date for a daily one. Not the student's
own date: profiles.timezone is theirs to edit, and a day counted in it could
be restarted by moving the zone (registry.py).

Everything here is sync (the Supabase client is): async callers wrap each
call in asyncio.to_thread.

A budget that cannot be checked is not a budget that is spent. spend() raises
Unavailable when the database call fails, so the caller can say "try again in
a minute" instead of telling a student they have used a try they still have.
refund() says whether the unit really went back, so nobody is told "your try
was given back" when it was not.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from app.db.supabase import get_supabase
from app.nodes.agents.registry import get_agent
from app.nodes.quest.schedule import valid_zone

logger = logging.getLogger(__name__)

# A refund is tried this many times before it is logged as lost.
REFUND_ATTEMPTS = 2


class Unavailable(Exception):
    """The budget could not be checked, so nothing was spent."""


def _sb():
    return get_supabase()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _int(value, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def bucket(period: str) -> str:
    """The bucket key: "all" for a lifetime budget, the UTC date for a daily one."""
    if period == "total":
        return "all"
    if period == "day":
        return _now().date().isoformat()
    raise ValueError(f"unknown budget period: {period!r}")


def student_tz(user_id: str) -> Optional[str]:
    """profiles.timezone when it is a real zone, else None. For showing dates
    in the student's own day; never for counting a budget."""
    rows = _sb().from_("profiles").select("timezone").eq("id", user_id).limit(1).execute().data or []
    return valid_zone((rows[0] if rows else {}).get("timezone"))


def _budget(agent: str, kind: str) -> tuple[str, int]:
    """(bucket, limit). KeyError for an unknown agent or kind: that is a bug in
    the caller, not something to hide as "no budget left"."""
    period, limit = get_agent(agent).budgets[kind]
    return bucket(period), limit


def spend(user_id: str, agent: str, kind: str) -> bool:
    """Take one unit. True when it was taken, False when the budget is spent.
    Unavailable when it cannot be checked (nothing is spent then)."""
    return bool(bump(user_id, agent, kind).get("allowed"))


def unmetered(result: dict) -> bool:
    """Whether a bump() answer came from the dev-email bypass (allowed, and
    nothing counted), which other caps on the same work honour too."""
    return bool(result.get("allowed")) and _int(result.get("used"), 1) == 0


def bump(user_id: str, agent: str, kind: str) -> dict:
    """spend(), with the whole answer: {"allowed", "used", "limit"}."""
    key, limit = _budget(agent, kind)
    try:
        res = _sb().rpc("agent_bump_usage", {
            "p_user_id": user_id, "p_agent": agent, "p_kind": kind,
            "p_bucket": key, "p_limit": limit,
        }).execute()
    except Exception as exc:
        logger.warning(f"[agents] budget check failed for {user_id} ({agent}/{kind}): {exc}")
        raise Unavailable(f"{agent}/{kind}") from None
    data = res.data if res is not None else None
    if not isinstance(data, dict) or "allowed" not in data:
        logger.warning(f"[agents] budget check for {user_id} ({agent}/{kind}) gave no answer")
        raise Unavailable(f"{agent}/{kind}")
    return data


def refund(user_id: str, agent: str, kind: str) -> bool:
    """Give one unit back after the work it paid for failed. True when it went
    back. Tried twice; a refund that still fails is logged as an error (the
    student keeps paying for it until someone gives it back by hand) and
    returns False. Never raises."""
    try:
        key, _ = _budget(agent, kind)
    except Exception as exc:
        logger.error(f"[agents] refund for {user_id} ({agent}/{kind}) has no budget: {exc}")
        return False
    for attempt in range(1, REFUND_ATTEMPTS + 1):
        try:
            _sb().rpc("agent_refund_usage", {
                "p_user_id": user_id, "p_agent": agent, "p_kind": kind, "p_bucket": key,
            }).execute()
            return True
        except Exception as exc:
            if attempt == REFUND_ATTEMPTS:
                logger.error(f"[agents] REFUND LOST for {user_id} ({agent}/{kind}/{key}): {exc}")
            else:
                logger.warning(f"[agents] refund failed for {user_id} ({agent}/{kind}), retrying: {exc}")
    return False


def used(user_id: str, agent: str, kind: str) -> int:
    key, _ = _budget(agent, kind)
    rows = (
        _sb().from_("agent_usage").select("used").eq("user_id", user_id).eq("agent", agent)
        .eq("kind", kind).eq("bucket", key).limit(1).execute().data or []
    )
    return max(0, _int((rows[0] if rows else {}).get("used"), 0))


def left(user_id: str, agent: str, kind: str) -> int:
    _, limit = get_agent(agent).budgets[kind]
    return max(0, limit - used(user_id, agent, kind))


def summary(user_id: str, agent: str, kind: str) -> dict:
    """{"used", "limit", "left"}, the shape the status endpoint shows."""
    _, limit = get_agent(agent).budgets[kind]
    n = min(limit, used(user_id, agent, kind))
    return {"used": n, "limit": limit, "left": limit - n}
