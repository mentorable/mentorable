"""
Lifetime limits on onboarding's model calls.

Onboarding is free, but it was also unmetered: the text interview, the
extraction and the voice call could each be called again and again by anyone
signed in, at Sonnet prices (or ElevenLabs' $0.08 a minute). These caps are
several times what a student finishing onboarding needs, so nobody doing it
honestly meets them: a 12-turn interview is 13 replies, an extraction runs once
or twice, and a voice interview is one call.

The counts live in agent_usage under agent "onboarding" and move only through
agent_bump_usage / agent_refund_usage, the same atomic check-and-increment the
agents use (with the same dev-email bypass). Everything here is sync: async
callers use asyncio.to_thread.
"""
from __future__ import annotations

import logging

from app.db.supabase import get_supabase

logger = logging.getLogger(__name__)

AGENT = "onboarding"
BUCKET = "all"

LIMITS = {
    "interview_turn": 40,   # three full text interviews, with room for retries
    "extract": 6,
    # A unit is spent when the signed URL is issued, before the browser
    # connects, so a dropped connection costs one. Six leaves room for a bad
    # network without a refund route anyone could call to get calls back.
    "voice_call": 6,
}


class Unavailable(Exception):
    """The budget could not be checked, so nothing was spent."""


def spend(user_id: str, kind: str) -> bool:
    """Take one. True when taken, False when the limit is reached. Raises
    Unavailable when the database cannot say (nothing is spent then)."""
    try:
        res = get_supabase().rpc("agent_bump_usage", {
            "p_user_id": user_id, "p_agent": AGENT, "p_kind": kind,
            "p_bucket": BUCKET, "p_limit": LIMITS[kind],
        }).execute()
    except Exception as exc:
        logger.warning(f"[onboarding] budget check failed for {user_id} ({kind}): {type(exc).__name__}")
        raise Unavailable(kind) from None
    data = res.data if res is not None else None
    if not isinstance(data, dict) or "allowed" not in data:
        raise Unavailable(kind)
    return bool(data.get("allowed"))


def refund(user_id: str, kind: str) -> None:
    """Give one back after the call it paid for failed. Never raises."""
    try:
        get_supabase().rpc("agent_refund_usage", {
            "p_user_id": user_id, "p_agent": AGENT, "p_kind": kind, "p_bucket": BUCKET,
        }).execute()
    except Exception as exc:
        logger.warning(f"[onboarding] refund failed for {user_id} ({kind}): {type(exc).__name__}")
