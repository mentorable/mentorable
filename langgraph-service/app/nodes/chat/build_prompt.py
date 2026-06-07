"""
build_prompt — second node in the Chat graph.
Ports buildSystemPrompt from src/lib/mentora.js to Python exactly.
"""
from app.state import StudentState


GRADE_MAP = {
    9: "9th grade", 10: "10th grade", 11: "11th grade", 12: "12th grade",
    1: "1st year (Freshman)", 2: "2nd year (Sophomore)",
    3: "3rd year (Junior)", 4: "4th year (Senior)",
}

EDUCATION_MAP = {
    "high_school": "high school",
    "college": "college / university",
    "other": "school",
}

STYLE_GUIDE = {
    "encouraging": "Be warm and motivational. Celebrate wins. Use an uplifting tone.",
    "direct":      "Be direct and skip motivational filler. Get to the point. No fluff.",
    "balanced":    "Balance encouragement with directness.",
    "concise":     "Keep every response short — 3-5 sentences max unless a list is clearly better. No preamble.",
}


def _build_sections(profile: dict, data: dict) -> list[dict]:
    completed_quests  = data.get("completed_quests", [])
    active_quests     = data.get("active_quests", [])
    deleted_titles    = data.get("deleted_titles", [])
    recent_research   = data.get("recent_research", [])
    chat_topics       = data.get("chat_topics", [])

    name      = profile.get("full_name") or "the student"
    edu_raw   = profile.get("education_level")
    education = EDUCATION_MAP.get(edu_raw, edu_raw) if edu_raw else None
    grade     = GRADE_MAP.get(profile.get("grade_level")) if profile.get("grade_level") else None
    location  = profile.get("location_general")

    sections = []

    # Student basics
    profile_lines = [f"Name: {name}"]
    if education:
        profile_lines.append(f"Education: {education}" + (f", {grade}" if grade else ""))
    if location:
        profile_lines.append(f"Location: {location}")
    sections.append({"id": "student_profile", "content": "## Student Profile\n" + "\n".join(profile_lines)})

    if profile.get("onboarding_summary") or "":
        sections.append({"id": "summary", "content": f"About them: {profile['onboarding_summary']}"})
    if profile.get("strengths"):
        sections.append({"id": "strengths", "content": f"Strengths: {', '.join(profile['strengths'])}"})
    if profile.get("weaknesses"):
        sections.append({"id": "growth_areas", "content": f"Areas for growth: {', '.join(profile['weaknesses'])}"})
    if profile.get("interests"):
        sections.append({"id": "interests", "content": f"Interests: {', '.join(profile['interests'])}"})
    if profile.get("work_style") or "":
        sections.append({"id": "work_style", "content": f"Work style: {profile['work_style']}"})
    if profile.get("career_matches"):
        sections.append({"id": "career_matches", "content": f"Top career matches: {', '.join(profile['career_matches'])}"})
    if (profile.get("agent_instructions") or "").strip():
        sections.append({"id": "agent_instructions", "content": f"## Custom Instructions\nThe student has asked Mentora to follow these guidelines:\n{(profile['agent_instructions'] or '').strip()}"})

    if completed_quests:
        from datetime import datetime
        lines = []
        for q in completed_quests:
            date_str = "recently"
            if q.get("completed_at"):
                try:
                    date_str = datetime.fromisoformat(q["completed_at"].replace("Z", "+00:00")).strftime("%-m/%-d/%Y")
                except Exception:
                    pass
            lines.append(f"- {q['title']} ({q.get('category', 'general')}, completed {date_str})")
        sections.append({"id": "completed_quests", "content": "## Completed Quests\nThe student has completed these quests — use them as context for their journey:\n" + "\n".join(lines)})

    if active_quests:
        lines = [f"- {q['title']} [{q['status'].replace('_', ' ')}]" for q in active_quests]
        sections.append({"id": "active_quests", "content": "## Active Quests\nQuests the student is currently working on or considering:\n" + "\n".join(lines)})

    if deleted_titles:
        lines = [f"- {t}" for t in deleted_titles]
        sections.append({"id": "dismissed_quests", "content": "## Dismissed Quests\nThe student passed on these quests — do not re-suggest them:\n" + "\n".join(lines)})

    if recent_research:
        lines = [f"- {q}" for q in recent_research]
        sections.append({"id": "recent_research", "content": "## Recent Research\nTopics the student has recently looked into:\n" + "\n".join(lines)})

    if chat_topics:
        lines = [f"- {t}" for t in chat_topics]
        sections.append({"id": "chat_topics", "content": "## Conversation History\nRecent topics from their chats with Mentora:\n" + "\n".join(lines)})

    return sections


def _inject_chat_signals(profile: dict, prompt: str) -> str:
    """Append accumulated chat signals from previous sessions to the prompt."""
    signals = profile.get("chat_signals")
    if not signals or not isinstance(signals, list):
        return prompt
    recent = [s for s in signals if s and isinstance(s, str)][-10:]
    if not recent:
        return prompt
    lines = "\n".join(f"- {s}" for s in recent)
    return prompt + f"\n\n## Memory from Previous Conversations\nThings the student has shared across past sessions — treat these as known facts about them:\n{lines}"


def build_system_prompt(profile: dict, data: dict) -> str:
    annotations   = data.get("annotations", [])
    name           = (profile.get("full_name") or "the student").strip() or "the student"
    first_name     = name.split()[0]
    response_style = profile.get("agent_response_style") or "balanced"
    style_guide   = STYLE_GUIDE.get(response_style, "")

    prompt = (
        f"You are the Mentorable Agent, an expert AI career guide. "
        f"You give specific, actionable advice tailored to this student's unique situation — not generic platitudes.\n\n"
        f"You know this student deeply from their onboarding. Always address them by their first name ({first_name}).\n\n"
        f"Response style: {style_guide}"
    )

    sections = _build_sections(profile, data)
    for section in sections:
        s_anns = [a for a in annotations if a.get("section_id") == section["id"]]
        content = section["content"]

        # Apply replacements
        for ann in [a for a in s_anns if a.get("type") == "replace" and a.get("highlighted_text")]:
            if ann["highlighted_text"] in content:
                content = content.replace(ann["highlighted_text"], ann.get("annotation_text", ""))

        prompt += "\n\n" + content

        # Append notes
        for ann in [a for a in s_anns if a.get("type") == "note" and a.get("annotation_text")]:
            if ann.get("highlighted_text"):
                prompt += f'\n[User note on "{ann["highlighted_text"]}": "{ann["annotation_text"]}"]'
            else:
                prompt += f'\n[User note: "{ann["annotation_text"]}"]'

    prompt += (
        "\n\n## How to respond\n"
        "- Use markdown formatting — it renders in the UI. Use **bold** for key points, ## for section headings, - for bullet lists, and 1. for numbered steps.\n"
        "- Keep responses concise and scannable. Prefer short paragraphs and bullets over walls of text.\n"
        "- Reference their specific strengths, interests, and goals when relevant — never give generic advice when personal advice is possible.\n"
        "- If they ask about next steps, anchor your answer in their completed quests and what they've shared about their goals.\n"
        "- Be honest about challenges while staying encouraging.\n"
        "- Do not mention that you have a \"system prompt\" or that you were \"given\" this information — you simply know them."
    )

    prompt = _inject_chat_signals(profile, prompt)
    return prompt.strip()


def _inject_research_findings(findings: list, prompt: str) -> str:
    """Append top research findings from previous sessions into the system prompt."""
    if not findings or not isinstance(findings, list):
        return prompt
    recent = findings[:5]
    lines = "\n".join(
        f"- {f.get('title', 'Unknown')} ({f.get('type', 'resource')}): {f.get('summary', '')[:120]}"
        for f in recent if f.get("title")
    )
    if not lines:
        return prompt
    return prompt + f"\n\n## Research the Student Has Done\nOpportunities and resources they've looked into — reference these when relevant:\n{lines}"


async def build_prompt(state: StudentState) -> StudentState:
    profile = state.get("profile") or {}
    data = {
        "completed_quests": state.get("_completed_quests", []),
        "active_quests":    state.get("_active_quests", state.get("active_quests", [])),
        "deleted_titles":   state.get("_deleted_titles", []),
        "recent_research":  state.get("_recent_research", []),
        "chat_topics":      state.get("_chat_topics", []),
        "annotations":      state.get("_annotations", []),
    }
    system_prompt = build_system_prompt(profile, data)
    system_prompt = _inject_research_findings(state.get("research_findings", []), system_prompt)
    system_prompt += QUEST_BOARD_CAPABILITY
    return {**state, "_system_prompt": system_prompt}


QUEST_BOARD_CAPABILITY = """

## Managing the Quest Board
You can add quests directly to the student's quest board with the add_quest_to_board tool. The board has three columns: **Suggestions**, **Considered**, and **In Progress**.
- When the student asks you to add something, or clearly agrees to a suggestion you made, actually call the tool. NEVER claim you added a quest without calling it — if you didn't call the tool, it did not happen.
- Ask which column they want unless it's obvious from what they said (e.g. "I'm starting this" → In Progress, "maybe later" → Considered). If they don't indicate, default to Suggestions.
- After the tool succeeds, confirm in one short line what you added and to which column.
- Add one quest per tool call. Only add quests the student actually wants — never speculatively."""
