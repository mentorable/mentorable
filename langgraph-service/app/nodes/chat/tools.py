"""
Chat tools — lets the advisor actually work on the student's record instead of
telling them to go do it themselves.

The whole surface is CRUD over the four college-record tables plus GPA on
profiles, which is the same data the Portfolio page edits. There is no separate
copy: a change made here shows up on the Portfolio page and vice versa.

Two rules hold everywhere in this module:

  * Every write is scoped by user_id as well as row id. RLS already enforces
    ownership, but the service role bypasses RLS, so the .eq("user_id", ...) is
    what actually stops one student's id from touching another's row.

  * Model input is never trusted as-is. Each kind has a _clean_* that whitelists
    fields, clamps numbers to what the column can hold, and truncates strings to
    the real Common App limits, so a hallucinated 400-character "description"
    cannot land in a 150-character field.

The Quest tools (view_quest, update_quest, retire_quest) can reshape the
student's daily-streak project, but there is deliberately no tool that completes
a task, awards XP or touches the streak. Those only move when the student checks
in on the Quest page, so "just mark today done" is not something the model can
be talked into.
"""
import logging
from datetime import datetime, timezone

from app.db.supabase import get_supabase
from app.nodes.quest.service import brief_for_chat, retire_from_chat, update_from_chat

logger = logging.getLogger(__name__)

# ── Vocabulary, mirroring the schema and the Portfolio page's selects ─────────

ACTIVITY_CATEGORIES = [
    "Academic", "Art", "Athletics: Club", "Athletics: JV/Varsity", "Career Oriented",
    "Community Service (Volunteer)", "Computer/Technology", "Cultural", "Dance", "Debate/Speech",
    "Environmental", "Family Responsibilities", "Foreign Exchange", "Foreign Language",
    "Internship", "Journalism/Publication", "Junior R.O.T.C.", "LGBT", "Music: Instrumental",
    "Music: Vocal", "Religious", "Research", "Robotics", "School Spirit",
    "Science/Math", "Student Govt./Politics", "Theater/Drama", "Work (Paid)", "Other",
]
AWARD_LEVELS  = ["school", "regional", "state", "national", "international"]
COURSE_LEVELS = ["ap", "ib", "honors", "dual_enrollment", "regular"]
TEST_TYPES    = ["sat", "act", "ap", "psat"]
TIMINGS       = ["school_year", "summer", "all_year"]
GPA_SCALES    = ["4.0", "5.0", "100", "other", "not_used"]

KIND_TABLE = {
    "activity": "student_activities",
    "award":    "student_awards",
    "course":   "student_courses",
    "score":    "student_test_scores",
}

# Labels for the confirmation the UI toasts.
KIND_LABEL = {"activity": "activity", "award": "award", "course": "course", "score": "test score"}


# ── Coercion helpers ─────────────────────────────────────────────────────────

def _text(value, limit: int):
    if value is None:
        return None
    s = str(value).strip()
    return s[:limit] if s else None


def _num(value, lo, hi, as_int=False):
    if value is None or value == "":
        return None
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    v = max(lo, min(hi, v))
    return int(round(v)) if as_int else v


def _enum(value, allowed):
    v = (str(value).strip().lower() if value is not None else "")
    return v if v in allowed else None


def _grades(value):
    """Accepts [9, 10] or ["9","10"]; drops anything outside 9-12."""
    if not isinstance(value, list):
        return None
    out = {int(g) for g in value if str(g).strip().isdigit() and 9 <= int(str(g).strip()) <= 12}
    return sorted(out)


def _clean_activity(args: dict, partial: bool) -> dict:
    """partial=True for updates: only keys the model actually sent are returned,
    so an update of one field never blanks the others."""
    raw = {
        "title":        _text(args.get("title"), 120),
        "category":     args.get("category") if args.get("category") in ACTIVITY_CATEGORIES else None,
        "position":     _text(args.get("position"), 50),
        "organization": _text(args.get("organization"), 100),
        "description":  _text(args.get("description"), 150),
        "grade_levels": _grades(args.get("grade_levels")),
        "timing":       _enum(args.get("timing"), TIMINGS),
        # NUMERIC(5,2) and a week can only hold so many hours.
        "hours_per_week": _num(args.get("hours_per_week"), 0, 168),
        "weeks_per_year": _num(args.get("weeks_per_year"), 0, 52, as_int=True),
        "continue_in_college": bool(args["continue_in_college"]) if "continue_in_college" in args else None,
    }
    return {k: v for k, v in raw.items() if v is not None or (not partial and k == "title")}


def _clean_award(args: dict, partial: bool) -> dict:
    raw = {
        "title":       _text(args.get("title"), 120),
        "level":       _enum(args.get("level"), AWARD_LEVELS),
        "year":        _num(args.get("year"), 1900, 2100, as_int=True),
        "description": _text(args.get("description"), 300),
    }
    return {k: v for k, v in raw.items() if v is not None or (not partial and k == "title")}


def _clean_course(args: dict, partial: bool) -> dict:
    raw = {
        "name":        _text(args.get("name") or args.get("title"), 120),
        "level":       _enum(args.get("level"), COURSE_LEVELS),
        "grade_level": _num(args.get("grade_level"), 9, 12, as_int=True),
        "planned":     bool(args["planned"]) if "planned" in args else None,
    }
    return {k: v for k, v in raw.items() if v is not None or (not partial and k == "name")}


def _clean_score(args: dict, partial: bool) -> dict:
    test_type = _enum(args.get("test_type"), TEST_TYPES)
    # An AP score is 1-5; SAT/PSAT/ACT composites live on very different scales.
    hi = 5 if test_type == "ap" else 1600
    sections = args.get("section_scores")
    raw = {
        "test_type":      test_type,
        "score":          _num(args.get("score"), 0, hi, as_int=True),
        "subject":        _text(args.get("subject"), 100),
        "section_scores": sections if isinstance(sections, dict) else None,
    }
    return {k: v for k, v in raw.items() if v is not None or (not partial and k == "test_type")}


_CLEANERS = {
    "activity": _clean_activity,
    "award":    _clean_award,
    "course":   _clean_course,
    "score":    _clean_score,
}


# ── Tool schemas ─────────────────────────────────────────────────────────────

_ACTIVITY_FIELDS = {
    "title":        {"type": "string", "description": "The activity's name, e.g. 'Science Olympiad'."},
    "category":     {"type": "string", "enum": ACTIVITY_CATEGORIES,
                     "description": "The Common App activity category."},
    "position":     {"type": "string", "description": "Their role or leadership title. Common App allows 50 characters."},
    "organization": {"type": "string", "description": "The club, company or school. Common App allows 100 characters."},
    "description":  {"type": "string",
                     "description": "What they actually did and what came of it. Common App allows 150 characters, "
                                    "so write in that compressed, impact-first style. Never use em dashes."},
    "grade_levels": {"type": "array", "items": {"type": "integer"},
                     "description": "Which of grades 9, 10, 11, 12 they did this in."},
    "timing":       {"type": "string", "enum": TIMINGS, "description": "When during the year."},
    "hours_per_week": {"type": "number", "description": "Typical hours per week."},
    "weeks_per_year": {"type": "integer", "description": "Typical weeks per year."},
    "continue_in_college": {"type": "boolean", "description": "Whether they intend to continue this in college."},
}

_AWARD_FIELDS = {
    "title":       {"type": "string", "description": "The award's name, e.g. 'National Merit Semifinalist'."},
    "level":       {"type": "string", "enum": AWARD_LEVELS, "description": "How far the recognition reached."},
    "year":        {"type": "integer", "description": "Calendar year received."},
    "description": {"type": "string", "description": "Short context: the field, the pool size, what it took."},
}

_COURSE_FIELDS = {
    "name":        {"type": "string", "description": "Course name, e.g. 'AP Biology'."},
    "level":       {"type": "string", "enum": COURSE_LEVELS, "description": "Rigor level."},
    "grade_level": {"type": "integer", "description": "Which grade they take or took it in (9-12)."},
    "planned":     {"type": "boolean", "description": "True if they intend to take it but have not yet."},
}

_SCORE_FIELDS = {
    "test_type":      {"type": "string", "enum": TEST_TYPES, "description": "Which test."},
    "score":          {"type": "integer", "description": "Composite score, or the 1-5 score for an AP exam."},
    "subject":        {"type": "string", "description": "AP exams only: the subject."},
    "section_scores": {"type": "object",
                       "description": 'Per-section breakdown, e.g. {"reading_writing": 730, "math": 760}.'},
}

CHAT_TOOLS = [
    {
        "name": "view_portfolio",
        "description": (
            "Read the student's full record: activities, awards, coursework and test scores, "
            "each with the id you need in order to change it. A summary is already in your "
            "context, so call this when you need the full detail behind an entry (the exact "
            "description wording, hours, grade levels) or when you are about to update or "
            "delete something and need its id. Never guess an id."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "section": {
                    "type": "string",
                    "enum": ["activities", "awards", "courses", "scores", "all"],
                    "description": "Which part of the record to read. Omit for everything.",
                },
            },
            "required": [],
        },
    },
    {
        "name": "add_portfolio_item",
        "description": (
            "Add one entry to the student's record. Call this only when the student asks you "
            "to add something, or clearly says yes to an addition you offered. Never add "
            "speculatively, and never invent detail they did not tell you: leave a field out "
            "rather than guessing at it."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "kind": {"type": "string", "enum": ["activity", "award", "course", "score"],
                         "description": "What sort of entry this is."},
                **_ACTIVITY_FIELDS, **_AWARD_FIELDS, **_COURSE_FIELDS, **_SCORE_FIELDS,
            },
            "required": ["kind"],
        },
    },
    {
        "name": "update_portfolio_item",
        "description": (
            "Change fields on one existing entry. Use this to reword a description, fix hours, "
            "correct a score, or set a category. Pass ONLY the fields you are changing; "
            "anything you leave out keeps its current value. You must pass the id from "
            "view_portfolio. Only make a change the student asked for or agreed to, and when "
            "you are rewriting their words, show them the new wording in your reply."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "kind": {"type": "string", "enum": ["activity", "award", "course", "score"],
                         "description": "Which sort of entry this id belongs to."},
                "id":   {"type": "string", "description": "The entry's id, from view_portfolio."},
                **_ACTIVITY_FIELDS, **_AWARD_FIELDS, **_COURSE_FIELDS, **_SCORE_FIELDS,
            },
            "required": ["kind", "id"],
        },
    },
    {
        "name": "delete_portfolio_item",
        "description": (
            "Permanently remove one entry from the student's record. This cannot be undone. "
            "Call it ONLY when the student has explicitly asked for that specific thing to be "
            "deleted. Never delete as part of a rewrite (update it instead), never delete "
            "something you merely think is weak, and if you are at all unsure which entry they "
            "mean, name the candidates and ask first."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "kind": {"type": "string", "enum": ["activity", "award", "course", "score"],
                         "description": "Which sort of entry this id belongs to."},
                "id":   {"type": "string", "description": "The entry's id, from view_portfolio."},
            },
            "required": ["kind", "id"],
        },
    },
    {
        "name": "view_quest",
        "description": (
            "Read the student's Quest in full: its milestones and where they are, today's task, "
            "how far behind they are, their streak, and what they said in their recent check-ins. "
            "A summary is already in your context; call this when you need the detail."
        ),
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "update_quest",
        "description": (
            "Reshape the student's active or paused Quest when they ask. Pass only what changes. "
            "You can rename it, change the daily time or rest days, set or clear a fixed deadline, "
            "and edit milestones by position: titles and descriptions on any milestone that is not "
            "done, and the number of days only on milestones after the current one. This cannot "
            "complete tasks, award XP or change the streak, and nothing else can either."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "New name for the quest, at most 60 characters."},
                "summary": {"type": "string", "description": "New one or two sentence summary."},
                "daily_minutes": {"type": "integer", "enum": [15, 30, 45],
                                  "description": "Minutes a day the tasks are sized for."},
                "rest_days": {"type": "array", "items": {"type": "integer"},
                              "description": "Days off, as 0 = Sunday through 6 = Saturday. At most six."},
                "hard_deadline": {"type": "string",
                                  "description": "A fixed deadline as YYYY-MM-DD, or an empty string to clear it."},
                "milestones": {
                    "type": "array",
                    "description": "Edits to milestones, each addressed by its position.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "position": {"type": "integer"},
                            "title": {"type": "string"},
                            "description": {"type": "string"},
                            "days": {"type": "integer", "description": "Work days, 1 to 20."},
                        },
                        "required": ["position"],
                    },
                },
            },
            "required": [],
        },
    },
    {
        "name": "retire_quest",
        "description": (
            "End the student's Quest. Only when they clearly say they want to stop it, not when "
            "they are merely behind (offer to lighten the pace instead). They keep their XP and "
            "can start a new quest afterwards."
        ),
        "input_schema": {
            "type": "object",
            "properties": {"reason": {"type": "string", "description": "Why, in a few words."}},
            "required": [],
        },
    },
    {
        "name": "update_gpa",
        "description": (
            "Set the student's GPA, which lives on their profile rather than as a record entry. "
            "Only call this with a number the student has actually told you. Pass the scale "
            "whenever you know it, since a 3.8 means different things on a 4.0 and a 100 scale."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "gpa_unweighted": {"type": "number", "description": "Unweighted GPA."},
                "gpa_weighted":   {"type": "number", "description": "Weighted GPA."},
                "gpa_scale":      {"type": "string", "enum": GPA_SCALES,
                                   "description": "The scale the numbers are on."},
            },
            "required": [],
        },
    },
]


# ── Handlers ─────────────────────────────────────────────────────────────────

def _now():
    return datetime.now(timezone.utc).isoformat()


async def _view_portfolio(user_id: str, args: dict) -> dict:
    supabase = get_supabase()
    section = (args.get("section") or "all").strip().lower()
    out = {"success": True}

    def rows(table, cols, order):
        return (supabase.from_(table).select(cols)
                .eq("user_id", user_id).order(order).limit(60).execute()).data or []

    if section in ("activities", "all"):
        out["activities"] = rows(
            "student_activities",
            "id, title, category, position, organization, description, grade_levels, "
            "timing, hours_per_week, weeks_per_year, continue_in_college, detail_level",
            "order_index")
    if section in ("awards", "all"):
        out["awards"] = rows("student_awards", "id, title, level, year, description", "order_index")
    if section in ("courses", "all"):
        out["courses"] = rows("student_courses", "id, name, level, grade_level, planned", "order_index")
    if section in ("scores", "all"):
        out["scores"] = rows("student_test_scores",
                             "id, test_type, score, subject, section_scores", "test_type")

    out["count"] = sum(len(v) for k, v in out.items() if isinstance(v, list))
    return out


async def _add_portfolio_item(user_id: str, args: dict) -> dict:
    kind = _enum(args.get("kind"), list(KIND_TABLE))
    if not kind:
        return {"success": False, "error": "Unknown kind."}
    table = KIND_TABLE[kind]

    values = _CLEANERS[kind](args, partial=False)
    label_field = "name" if kind == "course" else ("test_type" if kind == "score" else "title")
    if not values.get(label_field):
        return {"success": False, "error": f"A {KIND_LABEL[kind]} needs a {label_field}."}

    supabase = get_supabase()
    row = {"user_id": user_id, **values, "created_at": _now(), "updated_at": _now()}

    # Test scores are ordered by test_type and have no order_index column.
    if kind != "score":
        last = (supabase.from_(table).select("order_index")
                .eq("user_id", user_id).order("order_index", desc=True).limit(1).execute()).data or []
        row["order_index"] = (last[0]["order_index"] + 1) if last and last[0].get("order_index") is not None else 0

    if kind == "activity":
        row["detail_level"] = "enriched" if (values.get("description") or values.get("position")) else "name_only"

    inserted = (supabase.from_(table).insert(row).execute().data or [None])[0]
    if not inserted:
        return {"success": False, "error": "Could not save that. Try again."}

    logger.info(f"[add_portfolio_item] {user_id} added {kind} {inserted.get('id')}")
    return {"success": True, "kind": kind, "id": inserted.get("id"),
            "title": inserted.get("title") or inserted.get("name") or (inserted.get("test_type") or "").upper()}


async def _update_portfolio_item(user_id: str, args: dict) -> dict:
    kind = _enum(args.get("kind"), list(KIND_TABLE))
    item_id = (args.get("id") or "").strip()
    if not kind or not item_id:
        return {"success": False, "error": "Need both kind and id."}

    values = _CLEANERS[kind](args, partial=True)
    values.pop("id", None)
    if not values:
        return {"success": False, "error": "No recognised fields to change."}

    supabase = get_supabase()
    # .eq("user_id") as well as id: the service role bypasses RLS, so this is the
    # only thing standing between a wrong id and another student's row.
    res = (supabase.from_(KIND_TABLE[kind])
           .update({**values, "updated_at": _now()})
           .eq("id", item_id).eq("user_id", user_id).execute())

    updated = (res.data or [None])[0]
    if not updated:
        return {"success": False, "error": "No entry with that id. Call view_portfolio for current ids."}

    logger.info(f"[update_portfolio_item] {user_id} updated {kind} {item_id}: {sorted(values)}")
    return {"success": True, "kind": kind, "id": item_id,
            "title": updated.get("title") or updated.get("name") or (updated.get("test_type") or "").upper(),
            "changed": sorted(values)}


async def _delete_portfolio_item(user_id: str, args: dict) -> dict:
    kind = _enum(args.get("kind"), list(KIND_TABLE))
    item_id = (args.get("id") or "").strip()
    if not kind or not item_id:
        return {"success": False, "error": "Need both kind and id."}

    supabase = get_supabase()
    res = (supabase.from_(KIND_TABLE[kind])
           .delete().eq("id", item_id).eq("user_id", user_id).execute())

    deleted = (res.data or [None])[0]
    if not deleted:
        return {"success": False, "error": "No entry with that id. Call view_portfolio for current ids."}

    logger.info(f"[delete_portfolio_item] {user_id} deleted {kind} {item_id}")
    return {"success": True, "kind": kind, "id": item_id,
            "title": deleted.get("title") or deleted.get("name") or (deleted.get("test_type") or "").upper()}


async def _update_gpa(user_id: str, args: dict) -> dict:
    scale = _enum(args.get("gpa_scale"), GPA_SCALES)
    # NUMERIC(6,3) holds up to 999.999, which covers 4.0, 5.0 and 100-point scales.
    values = {}
    if args.get("gpa_unweighted") is not None:
        values["gpa_unweighted"] = _num(args.get("gpa_unweighted"), 0, 999)
    if args.get("gpa_weighted") is not None:
        values["gpa_weighted"] = _num(args.get("gpa_weighted"), 0, 999)
    if scale:
        values["gpa_scale"] = scale
    if not values:
        return {"success": False, "error": "Nothing to set."}

    supabase = get_supabase()
    res = (supabase.from_("profiles").update({**values, "updated_at": _now()})
           .eq("id", user_id).execute())
    if not (res.data or []):
        return {"success": False, "error": "Could not save the GPA."}

    logger.info(f"[update_gpa] {user_id} set {sorted(values)}")
    return {"success": True, "kind": "gpa", "title": "GPA", "changed": sorted(values)}


async def _view_quest(user_id: str, args: dict) -> dict:
    brief = brief_for_chat(user_id, None)
    if not brief:
        return {"success": True, "quest": None,
                "note": "They have no quest right now. They can start one on the Quest page."}
    return {"success": True, "quest": brief}


async def _update_quest(user_id: str, args: dict) -> dict:
    return update_from_chat(user_id, None, args or {})


async def _retire_quest(user_id: str, args: dict) -> dict:
    result = retire_from_chat(user_id, None)
    if result.get("success"):
        logger.info(f"[retire_quest] {user_id} retired their quest: {str(args.get('reason') or '')[:120]}")
    return result


_HANDLERS = {
    "view_portfolio":        _view_portfolio,
    "add_portfolio_item":    _add_portfolio_item,
    "update_portfolio_item": _update_portfolio_item,
    "delete_portfolio_item": _delete_portfolio_item,
    "update_gpa":            _update_gpa,
    "view_quest":            _view_quest,
    "update_quest":          _update_quest,
    "retire_quest":          _retire_quest,
}

# Which tools changed something the student should see a confirmation for.
WRITE_TOOLS = {"add_portfolio_item", "update_portfolio_item", "delete_portfolio_item", "update_gpa"}
QUEST_WRITE_TOOLS = {"update_quest", "retire_quest"}

TOOL_VERB = {
    "add_portfolio_item":    "Added",
    "update_portfolio_item": "Updated",
    "delete_portfolio_item": "Removed",
    "update_gpa":            "Updated",
    "update_quest":          "Updated",
    "retire_quest":          "Retired",
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
