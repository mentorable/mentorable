from fastapi import HTTPException
from app.db.supabase import get_supabase
from app.config import DEV_BYPASS_EMAILS

LIMITS = {
    "chat": 15,
    "research": 3,
    "quest_gen": 3,
    "axis_boost": 5,
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
