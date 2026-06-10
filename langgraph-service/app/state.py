from typing import Any, Optional
from typing_extensions import TypedDict


class ProfileSnapshot(TypedDict, total=False):
    """Mirror of the Supabase profiles table — all fields optional for partial loads."""
    id: str
    full_name: str
    email: str
    age: Optional[int]
    grade_level: Optional[int]
    education_level: Optional[str]
    location_general: Optional[str]
    onboarding_summary: Optional[str]
    onboarding_completed: bool
    strengths: list[str]
    weaknesses: list[str]
    interests: list[str]
    work_style: Optional[str]
    career_matches: list[str]
    career_certainty: Optional[str]
    mentioned_careers: list[str]
    motivations: list[str]
    biggest_concern: Optional[str]
    external_influences: list[str]
    self_confidence_level: Optional[str]
    personality_signals: list[str]
    own_words_keywords: list[str]
    conversation_tone: Optional[str]
    agent_instructions: Optional[str]
    agent_response_style: Optional[str]  # encouraging | direct | balanced | concise


class ResearchFinding(TypedDict):
    """A single top finding surfaced from a research session."""
    title: str
    url: str
    summary: str
    type: str           # competition | internship | scholarship | program | resource | article
    session_id: str
    found_at: str       # ISO timestamp


class QuestItem(TypedDict, total=False):
    id: str
    title: str
    description: str
    category: str       # Project | Research | Application | Learning | Other
    estimated_time: str
    difficulty: str     # Easy | Medium | Hard
    why_it_matters: str
    status: str         # suggested | considered | in_progress | completed | deleted


class StudentState(TypedDict, total=False):
    """
    Shared working context across all three LangGraph graphs.

    Supabase is the source of truth for persistent data.
    This state holds the assembled session-scoped snapshot — it is
    refreshed from Supabase at the start of every request via load_context.

    Thread IDs:
      chat:     {user_id}_chat
      research: {user_id}_research
      quest:    {user_id}_quest
    """

    # ── Identity ──────────────────────────────────────────────────────────────
    user_id: str

    # ── Profile (loaded from Supabase on each request) ────────────────────────
    profile: ProfileSnapshot

    # ── Accumulated memory (active updates only — written to Supabase on key events)
    research_findings: list[ResearchFinding]   # top findings from research sessions
    quest_signals: list[str]                   # observations from completed quest batches
    chat_signals: list[str]                    # signals extracted from chat sessions (Haiku)

    # ── Active context (re-fetched from Supabase each request) ────────────────
    active_quests: list[QuestItem]
    recent_research_queries: list[str]

    # ── Intermediate results (ephemeral — per-request, not persisted) ─────────
    current_response: Optional[str]
    research_results: Optional[list[dict[str, Any]]]
    generated_quests: Optional[list[QuestItem]]

    # ── Chat graph internals (passed between load_context → build_prompt) ─────
    _completed_quests: list[dict[str, Any]]
    _deleted_titles: list[str]
    _recent_research: list[str]
    _chat_topics: list[str]
    _system_prompt: str

    # ── Metadata ──────────────────────────────────────────────────────────────
    errors: list[str]
