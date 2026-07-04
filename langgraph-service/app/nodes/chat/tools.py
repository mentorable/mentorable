"""
Chat tools — lets Mentorable Chat actually act on the student's quest board instead of
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

_AXES = {"communication", "leadership", "technicality", "resourcefulness", "execution"}

PORTFOLIO_CATEGORIES = ["experience", "volunteering", "award", "course", "certification", "club", "skill", "other"]


def _coerce_axis(value) -> str:
    v = (value or "").strip().lower()
    return v if v in _AXES else "execution"

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
                "target_axis": {
                    "type": "string",
                    "enum": ["communication", "leadership", "technicality", "resourcefulness", "execution"],
                    "description": "The ONE scorecard skill this quest most builds. Completing it raises that axis.",
                },
                "why_it_matters": {
                    "type": "string",
                    "description": "One short sentence (max 80 chars) tying it to their goals.",
                },
            },
            "required": ["title", "description", "column"],
        },
    },
    {
        "name": "view_portfolio",
        "description": (
            "Look up the student's portfolio: their recorded experiences, volunteering, "
            "awards, courses, certifications, clubs, and skills. Call this when the student "
            "asks about their portfolio, or when you need their concrete background (e.g. to "
            "advise on what's missing or how to reword a piece). Returns full titles and "
            "descriptions."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "category": {
                    "type": "string",
                    "enum": PORTFOLIO_CATEGORIES,
                    "description": "Optional: only return pieces in this category. Omit to get everything.",
                },
            },
            "required": [],
        },
    },
    {
        "name": "add_portfolio_piece",
        "description": (
            "Add one piece to the student's portfolio (an experience, award, course, "
            "certification, club, volunteering role, or skill). Call this when the student "
            "asks you to add something to their portfolio, or explicitly agrees when you "
            "offer. Do NOT call it speculatively."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "category": {
                    "type": "string",
                    "enum": PORTFOLIO_CATEGORIES,
                    "description": "The kind of portfolio piece.",
                },
                "title": {
                    "type": "string",
                    "description": "Short, specific title (max 80 chars), e.g. 'AP Computer Science A' or 'DECA State Finalist'.",
                },
                "description": {
                    "type": "string",
                    "description": "1-2 sentences of concrete detail (dates, role, scope, results). Never use em dashes.",
                },
            },
            "required": ["category", "title"],
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
        "target_axis":    _coerce_axis(args.get("target_axis")),
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


async def _view_portfolio(user_id: str, args: dict) -> dict:
    supabase = get_supabase()
    query = (
        supabase.from_("portfolio_items")
        .select("category, title, description")
        .eq("user_id", user_id)
        .order("category")
        .order("order_index")
        .limit(60)
    )
    category = (args.get("category") or "").strip().lower()
    if category in PORTFOLIO_CATEGORIES:
        query = query.eq("category", category)
    items = query.execute().data or []
    # Bound the tool-result tokens; descriptions can be long.
    for item in items:
        if item.get("description"):
            item["description"] = item["description"][:300]
    return {"success": True, "count": len(items), "items": items}


async def _add_portfolio_piece(user_id: str, args: dict) -> dict:
    supabase = get_supabase()

    title = (args.get("title") or "").strip()
    if not title:
        return {"success": False, "error": "Portfolio piece needs a title."}
    category = (args.get("category") or "").strip().lower()
    if category not in PORTFOLIO_CATEGORIES:
        category = "other"

    # Place the new piece at the end of its category.
    order_res = (
        supabase.from_("portfolio_items")
        .select("order_index")
        .eq("user_id", user_id)
        .eq("category", category)
        .order("order_index", desc=True)
        .limit(1)
        .execute()
    )
    existing = order_res.data or []
    next_index = (existing[0]["order_index"] + 1) if existing and existing[0].get("order_index") is not None else 0

    now = datetime.now(timezone.utc).isoformat()
    insert_res = supabase.from_("portfolio_items").insert({
        "user_id":     user_id,
        "category":    category,
        "title":       title[:120],
        "description": (args.get("description") or "").strip()[:500] or None,
        "source":      "ai",
        "order_index": next_index,
        "created_at":  now,
        "updated_at":  now,
    }).execute()
    inserted = (insert_res.data or [None])[0]

    if not inserted:
        return {"success": False, "error": "Could not save the portfolio piece. Try again."}

    logger.info(f"[add_portfolio_piece] {user_id} added {title!r} to {category}")
    return {
        "success": True,
        "id": inserted.get("id"),
        "title": inserted.get("title"),
        "category": category,
    }


# Dispatch table — tool name → coroutine(user_id, args) -> result dict.
_HANDLERS = {
    "add_quest_to_board": _add_quest_to_board,
    "view_portfolio": _view_portfolio,
    "add_portfolio_piece": _add_portfolio_piece,
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
