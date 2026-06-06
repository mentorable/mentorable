"""
Quest generation — exact port of supabase/functions/generate-quest-items/index.ts.
Generates 1-5 standalone quest suggestions for a student.

Cross-feature integration: pulls research_findings from profile so suggestions
naturally reference what the student has been researching.
"""
import json
import logging
import re
from datetime import datetime, timezone

from anthropic import AsyncAnthropic

from app.config import ANTHROPIC_API_KEY
from app.db.supabase import get_supabase

logger = logging.getLogger(__name__)

_anthropic = AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
SONNET = "claude-sonnet-4-6"


def _parse_json(text: str, fallback):
    try:
        return json.loads(text)
    except Exception:
        pass
    match = re.search(r'(\{[\s\S]*\}|\[[\s\S]*\])', text)
    if match:
        try:
            return json.loads(match.group(0))
        except Exception:
            pass
    return fallback


async def generate_quest_items(user_id: str, count: int = 3) -> dict:
    """
    Returns {"items": [...]} — the inserted quest_items rows.
    Raises ValueError on user-facing failures.
    """
    count = max(1, min(int(count or 3), 5))
    supabase = get_supabase()

    # ── Load all context in parallel-ish ──────────────────────────────────────
    profile_res = (
        supabase.from_("profiles")
        .select("*")
        .eq("id", user_id)
        .maybe_single()
        .execute()
    )
    existing_res = (
        supabase.from_("quest_items")
        .select("title")
        .eq("user_id", user_id)
        .in_("status", ["suggested", "considered", "in_progress", "active"])
        .execute()
    )
    completed_res = (
        supabase.from_("quest_items")
        .select("title, category, completed_at")
        .eq("user_id", user_id)
        .eq("status", "completed")
        .order("completed_at", desc=True)
        .limit(20)
        .execute()
    )
    chats_res = (
        supabase.from_("chat_sessions")
        .select("messages")
        .eq("user_id", user_id)
        .order("updated_at", desc=True)
        .limit(5)
        .execute()
    )
    research_res = (
        supabase.from_("research_sessions")
        .select("query")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(8)
        .execute()
    )

    profile         = profile_res.data or {}
    existing_items  = existing_res.data or []
    completed_items = completed_res.data or []
    chat_sessions   = chats_res.data or []
    research_queries = [r["query"] for r in (research_res.data or []) if r.get("query")]

    # ── Build chat snippets ───────────────────────────────────────────────────
    chat_snippets = []
    for session in chat_sessions:
        messages = session.get("messages") or []
        last4 = messages[-4:] if isinstance(messages, list) else []
        for msg in last4:
            if len(chat_snippets) >= 20:
                break
            content = (msg.get("content") or "").strip()
            if content:
                chat_snippets.append(f"[{msg.get('role', 'user')}]: {content[:200]}")
        if len(chat_snippets) >= 20:
            break

    # ── Build profile summary ─────────────────────────────────────────────────
    profile_parts = []
    if profile.get("full_name"):           profile_parts.append(f"Name: {profile['full_name']}")
    if profile.get("grade_level"):         profile_parts.append(f"Grade: {profile['grade_level']}")
    if profile.get("education_level"):     profile_parts.append(f"Education: {profile['education_level']}")
    if profile.get("location_general"):    profile_parts.append(f"Location: {profile['location_general']}")
    if profile.get("onboarding_summary"):  profile_parts.append(f"Background: {profile['onboarding_summary']}")
    if profile.get("interests"):           profile_parts.append(f"Interests: {', '.join(profile['interests'])}")
    if profile.get("strengths"):           profile_parts.append(f"Strengths: {', '.join(profile['strengths'])}")
    if profile.get("career_matches"):      profile_parts.append(f"Career matches: {', '.join(profile['career_matches'])}")
    if profile.get("work_style"):          profile_parts.append(f"Work style: {profile['work_style']}")
    profile_summary = "\n".join(profile_parts)

    # ── Research findings (cross-feature memory) ──────────────────────────────
    research_findings = profile.get("research_findings") or []
    findings_block = ""
    if isinstance(research_findings, list) and research_findings:
        top = research_findings[:5]
        lines = [
            f"- {f.get('title', 'Unknown')} ({f.get('type', 'resource')}): {f.get('summary', '')[:150]}"
            for f in top if f.get("title")
        ]
        if lines:
            findings_block = "## Recent Research Findings (the student found these worth investigating)\n" + "\n".join(lines)

    # ── Build user prompt ─────────────────────────────────────────────────────
    sections = [f"## Student Profile\n{profile_summary}"]
    if existing_items:
        sections.append("## Current Quests (avoid duplicating these)\n" + "\n".join(f"- {q['title']}" for q in existing_items))
    else:
        sections.append("## Current Quests\nNone yet.")
    if completed_items:
        sections.append("## Completed Quests\n" + "\n".join(f"- {q['title']} ({q.get('category', 'Other')})" for q in completed_items))
    if findings_block:
        sections.append(findings_block)
    if chat_snippets:
        sections.append("## Recent Chat\n" + "\n".join(chat_snippets))
    if research_queries:
        sections.append("## Recent Research Queries\n" + "\n".join(f"- {q}" for q in research_queries))

    user_prompt = "\n\n".join(sections)

    # ── Call Claude ───────────────────────────────────────────────────────────
    response = await _anthropic.messages.create(
        model=SONNET,
        max_tokens=1600,
        system=(
            f"You are Mentorable's quest engine. Generate exactly {count} specific, actionable quests for a student based on their profile and history.\n\n"
            "Quests are standalone challenges — a project to build, a program to apply to, a skill to practice, an opportunity to pursue.\n\n"
            "If the student has recent research findings, prioritize quests that build on those findings — e.g. if they researched a scholarship, suggest preparing the application.\n\n"
            "For each quest include:\n"
            "- title: concise and specific (max 60 chars)\n"
            "- description: 1-2 sentences with concrete next steps\n"
            "- category: one of Project, Research, Application, Learning, Other\n"
            "- estimated_time: realistic estimate like \"3–4 days\", \"1–2 weeks\", \"3 weeks\"\n"
            "- difficulty: one of Easy, Medium, Hard (Easy = < 1 week low effort, Medium = 1-2 weeks moderate, Hard = 2+ weeks high effort)\n"
            "- why_it_matters: one short sentence (max 80 chars) explaining how this connects to their goals\n\n"
            "Return ONLY valid JSON, no markdown."
        ),
        messages=[{
            "role": "user",
            "content": (
                f"{user_prompt}\n\n"
                f"Generate exactly {count} new quests. Return ONLY valid JSON:\n"
                '{"quests":[{"title":"...","description":"...","category":"Project|Research|Application|Learning|Other","estimated_time":"1–2 weeks","difficulty":"Easy|Medium|Hard","why_it_matters":"..."}]}'
            ),
        }],
    )

    response_text = response.content[0].text if response.content else ""
    parsed = _parse_json(response_text, {"quests": []})
    quests = parsed.get("quests", [])

    if not isinstance(quests, list) or not quests:
        raise ValueError("Failed to generate quests")

    # ── Insert into quest_items ───────────────────────────────────────────────
    now = datetime.now(timezone.utc).isoformat()
    insert_rows = [
        {
            "user_id":        user_id,
            "title":          q.get("title"),
            "description":    q.get("description"),
            "category":       q.get("category") or "Other",
            "estimated_time": q.get("estimated_time"),
            "difficulty":     q.get("difficulty"),
            "why_it_matters": q.get("why_it_matters"),
            "status":         "suggested",
            "order_index":    len(existing_items) + i,
            "created_at":     now,
            "updated_at":     now,
        }
        for i, q in enumerate(quests[:count])
    ]

    insert_res = supabase.from_("quest_items").insert(insert_rows).execute()
    inserted = insert_res.data or []

    logger.info(f"[quest_gen] Generated {len(inserted)} quests for user {user_id}")
    return {"success": True, "items": inserted}
