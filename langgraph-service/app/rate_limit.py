import logging

from fastapi import HTTPException
from app.db.supabase import get_supabase
from app.config import DEV_BYPASS_EMAILS

logger = logging.getLogger(__name__)

LIMITS = {
    "chat": 15,
    "research": 3,
    "quest_gen": 3,
    "axis_boost": 5,
    "roadmap_gen": 1,
    "node_expand": 5,
    "roadmap_reeval": 1,
}

# feature → usage_tracking column (for refunds when the work fails after incrementing).
_USAGE_COLUMN = {
    "chat": "chat_messages_used",
    "research": "research_queries_used",
    "quest_gen": "quest_generations_used",
    "axis_boost": "axis_boosts_used",
    "roadmap_gen": "roadmap_generations_used",
    "node_expand": "node_expansions_used",
    "roadmap_reeval": "roadmap_reevals_used",
}


async def check_rate_limit(user_id: str, feature: str) -> dict:
    """
    Calls the check_and_increment_usage Postgres RPC.
    Returns the usage dict if allowed, raises HTTP 429 if limit reached.
    Dev accounts (in DEV_BYPASS_EMAILS) are bypassed at the DB level by
    the RPC itself — this function doesn't need special-case logic.
    """
    limit = LIMITS[feature]
    supabase = get_supabase()
    result = supabase.rpc(
        "check_and_increment_usage",
        {"p_user_id": user_id, "p_feature": feature, "p_limit": limit},
    ).execute()

    usage = result.data
    if not usage or not usage.get("allowed"):
        raise HTTPException(
            status_code=429,
            detail={
                "error": "LIMIT_REACHED",
                "feature": feature,
                "used": usage.get("used", limit) if usage else limit,
                "limit": limit,
            },
        )
    return usage


async def refund_usage(user_id: str, feature: str) -> None:
    """
    Give back one increment when the expensive work fails AFTER check_rate_limit incremented.
    Prevents a transient AI/network error from burning a user's lifetime quota — critical for
    the 1/lifetime roadmap_gen + roadmap_reeval. Best-effort: never raises. Dev accounts were
    never incremented, so a refund just floors at 0 (harmless).
    """
    col = _USAGE_COLUMN.get(feature)
    if not col:
        return
    try:
        supabase = get_supabase()
        row = (
            supabase.from_("usage_tracking").select(col)
            .eq("user_id", user_id).maybe_single().execute()
        )
        current = (row.data or {}).get(col)
        if isinstance(current, int) and current > 0:
            supabase.from_("usage_tracking").update({col: current - 1}).eq("user_id", user_id).execute()
    except Exception as exc:
        logger.warning(f"[rate_limit] refund of {feature} for {user_id} failed: {exc}")
