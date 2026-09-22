"""
load_context — first node in the Chat graph.

Fetches the student's college application record from Supabase on every request,
so the prompt always reflects what the Portfolio page currently shows. Nothing
here is cached: the student can edit their record mid-conversation (from the
Portfolio page or through a chat tool) and the next turn must see it.

Quest, roadmap and research context used to be loaded here too. Those features
are parked behind FEATURES flags pending a college-domain redesign (see
src/lib/features.js), so loading them meant four dead queries per request and
four prompt sections about a product the student cannot reach. They come back
with the features, rebuilt for admissions rather than careers.
"""
import logging

from app.state import StudentState
from app.db.supabase import get_supabase

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

    profile = profile_res.data or {}

    return {
        **state,
        "profile":     profile,
        "_activities": activities_res.data or [],
        "_awards":     awards_res.data or [],
        "_courses":    courses_res.data or [],
        "_scores":     scores_res.data or [],
    }
