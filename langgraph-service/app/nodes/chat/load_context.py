"""
load_context — first node in the Chat graph.
Fetches all context needed to build the system prompt from Supabase.
Runs on every request so the state reflects live data.
"""
import logging
from app.state import StudentState
from app.db.supabase import get_supabase
from app.nodes.memory.synthesize import maybe_refresh_living_profile

logger = logging.getLogger(__name__)


async def load_context(state: StudentState) -> StudentState:
    user_id = state["user_id"]
    supabase = get_supabase()

    # Run all queries (supabase-py is sync; wrap in thread if needed at scale)
    profile_res = (
        supabase.from_("profiles")
        .select("*")
        .eq("id", user_id)
        .maybe_single()
        .execute()
    )

    quests_res = (
        supabase.from_("quest_items")
        .select("title, category, status, completed_at, why_it_matters")
        .eq("user_id", user_id)
        .neq("status", "deleted")
        .order("created_at", desc=False)
        .execute()
    )

    research_res = (
        supabase.from_("research_sessions")
        .select("query")
        .eq("user_id", user_id)
        .eq("status", "completed")
        .order("created_at", desc=True)
        .limit(10)
        .execute()
    )

    chat_res = (
        supabase.from_("chat_sessions")
        .select("title")
        .eq("user_id", user_id)
        .not_.is_("title", "null")
        .order("updated_at", desc=True)
        .limit(8)
        .execute()
    )

    roadmap_res = (
        supabase.from_("roadmap_nodes")
        .select("title, pillar, month_label, state, roadmaps!inner(status)")
        .eq("user_id", user_id)
        .eq("roadmaps.status", "active")
        .order("month_index")
        .order("order_index")
        .execute()
    )

    # Lightweight portfolio summary (category + title only) — full descriptions
    # live behind the view_portfolio chat tool to keep every-request cost down.
    portfolio_res = (
        supabase.from_("portfolio_items")
        .select("category, title")
        .eq("user_id", user_id)
        .order("category")
        .order("order_index")
        .limit(30)
        .execute()
    )

    profile    = profile_res.data or {}
    all_quests = quests_res.data or []

    # Pull research_findings from profile for cross-feature memory
    research_findings = profile.get("research_findings") or []

    completed_quests = [q for q in all_quests if q["status"] == "completed"]
    active_quests    = [q for q in all_quests if q["status"] in ("in_progress", "considered")]
    deleted_titles   = []  # deleted are excluded by the query filter

    # Fetch deleted titles separately for the dismissed section
    deleted_res = (
        supabase.from_("quest_items")
        .select("title")
        .eq("user_id", user_id)
        .eq("status", "deleted")
        .order("updated_at", desc=True)
        .limit(20)
        .execute()
    )
    deleted_titles = [q["title"] for q in (deleted_res.data or [])]

    recent_research = [r["query"] for r in (research_res.data or []) if r.get("query")]
    chat_topics     = [s["title"] for s in (chat_res.data or []) if s.get("title")]
    roadmap_nodes   = [
        {"title": n["title"], "pillar": n["pillar"], "month_label": n["month_label"], "state": n["state"]}
        for n in (roadmap_res.data or [])
    ]
    portfolio_summary = [
        {"category": p["category"], "title": p["title"]}
        for p in (portfolio_res.data or [])
    ]

    # Living profile: if enough activity has accrued, refresh it in the background.
    await maybe_refresh_living_profile(user_id, profile.get("living_events_since_sync"))

    # A "chat about this node" conversation gets that node's full content (blurb,
    # overview, checklist) injected on top of the lightweight roadmap summary above.
    node_context = None
    node_id = state.get("node_id")
    if node_id:
        node_res = (
            supabase.from_("roadmap_nodes")
            .select("title, blurb, pillar, overview")
            .eq("id", node_id)
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )
        node = node_res.data
        if node:
            tasks_res = (
                supabase.from_("roadmap_tasks")
                .select("text, done")
                .eq("node_id", node_id)
                .order("order_index")
                .execute()
            )
            node_context = {**node, "tasks": tasks_res.data or []}

    return {
        **state,
        "profile": profile,
        "active_quests": active_quests,
        "research_findings": research_findings,
        "_completed_quests": completed_quests,
        "_deleted_titles": deleted_titles,
        "_recent_research": recent_research,
        "_chat_topics": chat_topics,
        "_roadmap_nodes": roadmap_nodes,
        "_portfolio_summary": portfolio_summary,
        "_node_context": node_context,
    }
