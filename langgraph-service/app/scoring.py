"""
Scorecard axis scoring — thin wrapper over the award_axis_points Postgres RPC.

Deterministic, up-only, capped at 100 with diminishing returns; the RPC also
logs a score_events row. Safe to fire-and-forget from background tasks.
"""
import logging

from app.db.supabase import get_supabase

logger = logging.getLogger(__name__)

AXES = ["communication", "leadership", "technicality", "resourcefulness", "execution"]


async def award_axis(user_id: str, axis: str, base: float, reason: str = "", source: str = "") -> None:
    """Award points to one axis. Never raises — logs and moves on."""
    if axis not in AXES:
        logger.warning(f"[scoring] invalid axis {axis!r} for {user_id}")
        return
    try:
        get_supabase().rpc(
            "award_axis_points",
            {
                "p_user_id": user_id,
                "p_axis": axis,
                "p_base": base,
                "p_reason": (reason or None),
                "p_source": (source or None),
            },
        ).execute()
    except Exception as exc:
        logger.warning(f"[scoring] award_axis failed ({axis}, {user_id}): {exc}")
