"""
load_context — first node in the Chat graph.

Fetches the student's college application record from Supabase on every request,
so the prompt always reflects what the Portfolio page currently shows. Nothing
here is cached: the student can edit their record mid-conversation (from the
Portfolio page or through a chat tool) and the next turn must see it.

The student's Quest (the daily-streak project) is loaded too, so the advisor can
talk about it and reshape it, their College List, so it can discuss it (the
list itself is only edited on its page), and their outreach board and Talon
board from the Agents page, which it can read and point to but never change.
Roadmap and research context are not: those
features are parked behind FEATURES flags (src/lib/features.js), and loading
them would mean dead queries and prompt sections about something the student
cannot reach.
"""
import logging
from datetime import datetime, timezone

from app.state import StudentState
from app.db.supabase import get_supabase
from app.nodes.agents.registry import get_agent
from app.nodes.quest.schedule import local_today
from app.nodes.quest.service import brief_for_chat

logger = logging.getLogger(__name__)


async def load_context(state: StudentState) -> StudentState:
    user_id = state["user_id"]
    supabase = get_supabase()

    def rows(table, cols, order):
        return (
            supabase.from_(table).select(cols)
            .eq("user_id", user_id).order(order).execute()
        )

    profile_res = (
        supabase.from_("profiles").select("*")
        .eq("id", user_id).maybe_single().execute()
    )

    # ids come along because the edit/delete tools address rows by id.
    activities_res = rows(
        "student_activities",
        "id, title, category, position, organization, description, grade_levels, "
        "timing, hours_per_week, weeks_per_year, continue_in_college, detail_level",
        "order_index",
    )
    awards_res  = rows("student_awards", "id, title, level, year, description", "order_index")
    courses_res = rows("student_courses", "id, name, level, grade_level, planned", "order_index")
    scores_res  = rows("student_test_scores",
                       "id, test_type, score, subject, section_scores, test_date", "test_type")

    profile = (profile_res.data if profile_res is not None else None) or {}

    # Read-only here, and never fatal: a list that fails to load just leaves
    # the section out. Capped at the 40 newest so a runaway list cannot swamp
    # the prompt, then put back in the order they were added.
    try:
        college_list = list(reversed(
            supabase.from_("college_list_items")
            .select("name, city, state, category, category_source, admission_rate, "
                    "sat_25, sat_75, act_25, act_75, net_price")
            .eq("user_id", user_id).order("created_at", desc=True).limit(40).execute().data or []
        ))
    except Exception as exc:
        logger.warning(f"[chat] college list failed to load for {user_id}: {exc}")
        college_list = []

    # Their outreach board (the Agents page's Beaker), read-only, never fatal,
    # the 40 most recently touched cards.
    try:
        outreach = (
            supabase.from_("outreach_contacts")
            .select("name, organization, stage, created_by, purpose, sent_at, last_sent_at, manual_sent_at, "
                    "follow_up_on, follow_ups_sent")
            .eq("user_id", user_id).order("updated_at", desc=True).limit(40).execute().data or []
        )
    except Exception as exc:
        logger.warning(f"[chat] outreach board failed to load for {user_id}: {exc}")
        outreach = []
    # Beaker's tries left, so the advisor never sends a student to a tool that
    # cannot start anything for them. None when it cannot be read.
    try:
        used = sum(int(r.get("used") or 0) for r in (
            supabase.from_("agent_usage").select("used").eq("user_id", user_id)
            .eq("agent", "outreach").eq("kind", "try").execute().data or []))
        tries_left = max(0, get_agent("outreach").budgets["try"][1] - used)
    except Exception as exc:
        logger.warning(f"[chat] outreach tries failed to load for {user_id}: {exc}")
        tries_left = None

    # Their Talon board (the Agents page's opportunity hawk): only what they
    # saved, are applying to or applied to. Read-only, never fatal, and only
    # the listing's facts: never their notes, checklist or eligibility lines.
    # Upcoming deadlines first (soonest first, counted from the student's own
    # today), then the ones with no date, then the ones that have passed
    # (marked, so the advisor never reads a closed one as the next due), cut
    # to 20. A board holds at most about 32 of these, so all are read (latest
    # deadline first, so any cut there drops the longest closed).
    try:
        talon_rows = (
            supabase.from_("finder_items")
            .select("lane, kind, status, title, provider, deadline, deadline_text, amount_text, cost_text, "
                    "verified, checked_at")
            .eq("user_id", user_id).in_("status", ["saved", "applying", "applied"])
            .order("deadline", desc=True).limit(60).execute().data or []
        )
        today = local_today(profile.get("timezone"), datetime.now(timezone.utc)).isoformat()

        def soonest(row):
            day = str(row.get("deadline") or "")[:10]
            if not day:
                return (1, "")
            return (0, day) if day >= today else (2, day)

        finder = []
        for row in sorted(talon_rows, key=soonest)[:20]:
            day = str(row.get("deadline") or "")[:10]
            finder.append({**row, "deadline_passed": bool(day) and day < today})
    except Exception as exc:
        logger.warning(f"[chat] Talon board failed to load for {user_id}: {exc}")
        finder = []
    # Talon's finds left, as for Beaker's tries. None when it cannot be read.
    try:
        found = sum(int(r.get("used") or 0) for r in (
            supabase.from_("agent_usage").select("used").eq("user_id", user_id)
            .eq("agent", "finder").eq("kind", "find").execute().data or []))
        finds_left = max(0, get_agent("finder").budgets["find"][1] - found)
    except Exception as exc:
        logger.warning(f"[chat] Talon finds failed to load for {user_id}: {exc}")
        finds_left = None

    return {
        **state,
        "profile":     profile,
        "_activities": activities_res.data or [],
        "_awards":     awards_res.data or [],
        "_courses":    courses_res.data or [],
        "_scores":     scores_res.data or [],
        # Never raises: a quest that fails to load just leaves the section out.
        "_quest":      brief_for_chat(user_id, profile.get("timezone")),
        "_college_list": college_list,
        "_outreach": outreach,
        "_outreach_tries_left": tries_left,
        "_finder": finder,
        "_finder_finds_left": finds_left,
    }
