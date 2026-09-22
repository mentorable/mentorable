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

AWARD_LEVELS = ["school", "regional", "state", "national", "international"]


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
            "Look up the full detail of the student's activities and awards: their role, the "
            "organization, hours per week, weeks per year, grade levels, and what they actually "
            "did. Call this when you need their concrete background beyond the titles you "
            "already have, for example to advise on what is missing or to help reword an entry."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "kind": {
                    "type": "string",
                    "enum": ["activity", "award", "all"],
                    "description": "Optional: narrow to activities or awards. Omit for everything.",
                },
            },
            "required": [],
        },
    },
    {
        "name": "add_portfolio_piece",
        "description": (
            "Add one activity or award to the student's portfolio. Call this when the student "
            "asks you to add something, or explicitly agrees when you offer. Do NOT call it "
            "speculatively. Academics (GPA, test scores, coursework) are entered by the student "
            "on the Academics tab, so never use this for those."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "kind": {
                    "type": "string",
                    "enum": ["activity", "award"],
                    "description": "Whether this is an activity or an award/honor.",
                },
                "title": {
                    "type": "string",
                    "description": "Short, specific name (max 80 chars), e.g. 'Science Olympiad' or 'DECA State Finalist'.",
                },
                "position": {
                    "type": "string",
                    "description": "Activities only: their role or leadership title, max 50 chars.",
                },
                "organization": {
                    "type": "string",
                    "description": "Activities only: the club, company or school, max 100 chars.",
                },
                "level": {
                    "type": "string",
                    "enum": ["school", "regional", "state", "national", "international"],
                    "description": "Awards only: how far the recognition reached.",
                },
                "description": {
                    "type": "string",
                    "description": "Up to 150 chars of concrete detail (role, scale, result). Never use em dashes.",
                },
            },
            "required": ["kind", "title"],
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
    """Full detail for the student's activities and awards.

    The chat prompt already carries the titles, so this exists for the depth:
    role, organization, commitment and what they actually did.
    """
    supabase = get_supabase()
    kind = (args.get("kind") or "all").strip().lower()
    out = {"success": True}

    if kind in ("activity", "all"):
        res = (
            supabase.from_("student_activities")
            .select("title, category, position, organization, description, hours_per_week, "
                    "weeks_per_year, grade_levels, timing, detail_level")
            .eq("user_id", user_id).order("order_index").limit(40).execute()
        )
        activities = res.data or []
        for a in activities:
            if a.get("description"):
                a["description"] = a["description"][:300]
        out["activities"] = activities

    if kind in ("award", "all"):
        res = (
            supabase.from_("student_awards")
            .select("title, level, year, description")
            .eq("user_id", user_id).order("order_index").limit(40).execute()
        )
        awards = res.data or []
        for w in awards:
            if w.get("description"):
                w["description"] = w["description"][:300]
        out["awards"] = awards

    out["count"] = len(out.get("activities", [])) + len(out.get("awards", []))
    return out


async def _add_portfolio_piece(user_id: str, args: dict) -> dict:
    supabase = get_supabase()

    title = (args.get("title") or "").strip()
    if not title:
        return {"success": False, "error": "Needs a title."}

    kind = (args.get("kind") or "activity").strip().lower()
    if kind not in ("activity", "award"):
        kind = "activity"
    table = "student_awards" if kind == "award" else "student_activities"

    # Append to the end of that list.
    order_res = (
        supabase.from_(table).select("order_index")
        .eq("user_id", user_id).order("order_index", desc=True).limit(1).execute()
    )
    existing = order_res.data or []
    next_index = (existing[0]["order_index"] + 1) if existing and existing[0].get("order_index") is not None else 0

    now = datetime.now(timezone.utc).isoformat()
    description = (args.get("description") or "").strip()[:150] or None

    if kind == "award":
        level = (args.get("level") or "").strip().lower()
        row = {
            "user_id": user_id, "title": title[:120], "description": description,
            "level": level if level in AWARD_LEVELS else None,
            "order_index": next_index, "created_at": now, "updated_at": now,
        }
    else:
        position = (args.get("position") or "").strip()[:50] or None
        row = {
            "user_id": user_id, "title": title[:120], "description": description,
            "position": position,
            "organization": (args.get("organization") or "").strip()[:100] or None,
            "detail_level": "enriched" if (description or position) else "name_only",
            "order_index": next_index, "created_at": now, "updated_at": now,
        }

    insert_res = supabase.from_(table).insert(row).execute()
    inserted = (insert_res.data or [None])[0]
    if not inserted:
        return {"success": False, "error": "Could not save that. Try again."}

    logger.info(f"[add_portfolio_piece] {user_id} added {kind} {title!r}")
    return {"success": True, "id": inserted.get("id"), "title": inserted.get("title"), "kind": kind}


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
