"""
Chat tools — lets Mentora actually act on the student's quest board instead of
just claiming it did. Currently exposes one tool: add_quest_to_board.

The model chooses the column via the `status` param, so the student can say
"add it to In Progress" / "put it in Considered" and have it land there.
"""
import logging
from datetime import datetime, timezone

from app.db.supabase import get_supabase

logger = logging.getLogger(__name__)

# Maps the user-facing column names to quest_items.status values.
COLUMN_TO_STATUS = {
    "suggestions": "suggested",
    "suggested":   "suggested",
    "considered":  "considered",
    "considering": "considered",
    "in_progress": "in_progress",
    "in progress": "in_progress",
    "inprogress":  "in_progress",
}

CHAT_TOOLS = [
    {
        "name": "add_quest_to_board",
        "description": (
            "Add a quest (a concrete project, application, skill to practice, or "
            "opportunity to pursue) to the student's quest board. Call this when the "
            "student asks you to add something, or explicitly agrees to a suggestion "
            "you made. Do NOT call it speculatively or without the student's intent."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {
                    "type": "string",
                    "description": "Concise, specific quest title (max 60 chars).",
                },
                "description": {
                    "type": "string",
                    "description": "1-2 sentences with concrete next steps.",
                },
                "column": {
                    "type": "string",
                    "enum": ["Suggestions", "Considered", "In Progress"],
                    "description": (
                        "Which board column to place the quest in. Honor what the "
                        "student asked for. If they didn't specify, use 'Suggestions'."
                    ),
                },
                "category": {
                    "type": "string",
                    "enum": ["Project", "Research", "Application", "Learning", "Other"],
                    "description": "Quest category.",
                },
                "estimated_time": {
                    "type": "string",
                    "description": 'Realistic estimate like "3-4 days", "1-2 weeks".',
                },
                "difficulty": {
                    "type": "string",
                    "enum": ["Easy", "Medium", "Hard"],
                    "description": "Effort level.",
                },
                "why_it_matters": {
                    "type": "string",
                    "description": "One short sentence (max 80 chars) tying it to their goals.",
                },
            },
            "required": ["title", "description", "column"],
        },
    },
]


async def _add_quest_to_board(user_id: str, args: dict) -> dict:
    supabase = get_supabase()

    title = (args.get("title") or "").strip()
    if not title:
        return {"success": False, "error": "Quest needs a title."}

    column = (args.get("column") or "Suggestions").strip().lower()
    status = COLUMN_TO_STATUS.get(column, "suggested")

    # Place the new quest at the end of its column.
    order_res = (
        supabase.from_("quest_items")
        .select("order_index")
        .eq("user_id", user_id)
        .eq("status", status)
        .order("order_index", desc=True)
        .limit(1)
        .execute()
    )
    existing = order_res.data or []
    next_index = (existing[0]["order_index"] + 1) if existing and existing[0].get("order_index") is not None else 0

    now = datetime.now(timezone.utc).isoformat()
    row = {
        "user_id":        user_id,
        "title":          title[:120],
        "description":    args.get("description"),
        "category":       args.get("category") or "Other",
        "estimated_time": args.get("estimated_time"),
        "difficulty":     args.get("difficulty"),
        "why_it_matters": args.get("why_it_matters"),
        "status":         status,
        "order_index":    next_index,
        "created_at":     now,
        "updated_at":     now,
    }

    insert_res = supabase.from_("quest_items").insert(row).execute()
    inserted = (insert_res.data or [None])[0]

    if not inserted:
        return {"success": False, "error": "Could not save the quest. Try again."}

    column_label = {"suggested": "Suggestions", "considered": "Considered", "in_progress": "In Progress"}[status]
    logger.info(f"[add_quest_to_board] {user_id} added {title!r} to {status}")
    return {
        "success": True,
        "id": inserted.get("id"),
        "title": inserted.get("title"),
        "column": column_label,
        "status": status,
    }


# Dispatch table — tool name → coroutine(user_id, args) -> result dict.
_HANDLERS = {
    "add_quest_to_board": _add_quest_to_board,
}


async def execute_chat_tool(user_id: str, name: str, args: dict) -> dict:
    """Execute a chat tool by name. Never raises — returns a result dict."""
    handler = _HANDLERS.get(name)
    if handler is None:
        return {"success": False, "error": f"Unknown tool: {name}"}
    try:
        return await handler(user_id, args or {})
    except Exception as exc:
        logger.warning(f"[execute_chat_tool] {name} failed for {user_id}: {exc}")
        return {"success": False, "error": "Tool execution failed."}
