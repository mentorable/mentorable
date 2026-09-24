"""
load_context — first node in the Chat graph.

Fetches the student's college application record from Supabase on every request,
so the prompt always reflects what the Portfolio page currently shows. Nothing
here is cached: the student can edit their record mid-conversation (from the
Portfolio page or through a chat tool) and the next turn must see it.

The student's Quest (the daily-streak project) is loaded too, so the advisor can
talk about it and reshape it. Roadmap and research context are not: those
features are parked behind FEATURES flags (src/lib/features.js), and loading
them would mean dead queries and prompt sections about something the student
cannot reach.
"""
import logging

from app.state import StudentState
from app.db.supabase import get_supabase
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

    return {
        **state,
        "profile":     profile,
        "_activities": activities_res.data or [],
        "_awards":     awards_res.data or [],
        "_courses":    courses_res.data or [],
        "_scores":     scores_res.data or [],
        # Never raises: a quest that fails to load just leaves the section out.
        "_quest":      brief_for_chat(user_id, profile.get("timezone")),
    }
