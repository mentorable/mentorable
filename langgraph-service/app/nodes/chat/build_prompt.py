"""
build_prompt — second node in the Chat graph.
Ports buildSystemPrompt from src/lib/mentora.js to Python exactly.
"""
from typing import Optional

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
    roadmap_nodes     = data.get("roadmap_nodes", [])
    activities        = data.get("activities", [])
    awards            = data.get("awards", [])
    courses           = data.get("courses", [])
    scores            = data.get("scores", [])

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

    # ── College application record ────────────────────────────────────────────
    if profile.get("graduation_year"):
        sections.append({"id": "graduation",
                         "content": f"Graduates high school: {profile['graduation_year']}"})

    gpa_u, gpa_w = profile.get("gpa_unweighted"), profile.get("gpa_weighted")
    if gpa_u or gpa_w:
        bits = []
        if gpa_u:
            bits.append(f"{gpa_u} unweighted")
        if gpa_w:
            bits.append(f"{gpa_w} weighted")
        scale = profile.get("gpa_scale")
        suffix = f" (on a {scale} scale)" if scale and scale not in ("not_used", "other") else ""
        sections.append({"id": "gpa", "content": "GPA: " + ", ".join(bits) + suffix})

    if profile.get("candidate_majors"):
        sections.append({"id": "majors",
                         "content": f"Majors they're considering: {', '.join(profile['candidate_majors'])}"})
    if profile.get("target_colleges"):
        sections.append({"id": "target_colleges",
                         "content": f"Colleges they're targeting: {', '.join(profile['target_colleges'])}"})

    narrative = profile.get("narrative") or {}
    if narrative.get("summary"):
        sections.append({"id": "summary", "content": f"About them: {narrative['summary']}"})
    if narrative.get("theme"):
        sections.append({"id": "theme",
                         "content": f"The through-line in their record: {narrative['theme']}"})
    if narrative.get("gaps"):
        sections.append({"id": "gaps",
                         "content": "Gaps in their application we already identified:\n"
                                    + "\n".join(f"- {g}" for g in narrative["gaps"])})
    if narrative.get("concerns"):
        sections.append({"id": "concerns",
                         "content": "What they're worried about:\n"
                                    + "\n".join(f"- {c}" for c in narrative["concerns"])})

    if scores:
        rendered = []
        for sc in scores:
            t = (sc.get("test_type") or "").upper()
            if t == "AP":
                rendered.append(f"AP {sc.get('subject') or '?'}: {sc.get('score')}")
            else:
                sub = sc.get("section_scores") or {}
                detail = ", ".join(f"{k.replace('_', ' ')} {v}" for k, v in sub.items())
                rendered.append(f"{t}: {sc.get('score')}" + (f" ({detail})" if detail else ""))
        sections.append({"id": "test_scores", "content": "Test scores: " + "; ".join(rendered)})

    if courses:
        rendered = []
        for c in courses:
            lvl = (c.get("level") or "").replace("_", " ")
            rendered.append(f"{c.get('name')} ({lvl})" if lvl else str(c.get("name")))
        sections.append({"id": "courses", "content": "## Coursework\n" + ", ".join(rendered)})

    if activities:
        lines = []
        for a in activities:
            head = f"- {a.get('title')}"
            bits = []
            if a.get("position"):
                bits.append(str(a["position"]))
            if a.get("organization"):
                bits.append(str(a["organization"]))
            if a.get("category"):
                bits.append(str(a["category"]))
            if a.get("hours_per_week") and a.get("weeks_per_year"):
                bits.append(f"{a['hours_per_week']} hrs/wk, {a['weeks_per_year']} wks/yr")
            grades = a.get("grade_levels") or []
            if grades:
                bits.append("grades " + ", ".join(str(g) for g in grades))
            if bits:
                head += " (" + "; ".join(bits) + ")"
            if a.get("description"):
                head += f"\n    {a['description']}"
            lines.append(head)
        sections.append({"id": "activities",
                         "content": "## Their Activities\nWhat the student actually does. Activities without detail "
                                    "have not been fleshed out yet, so ask rather than assume:\n" + "\n".join(lines)})

    if awards:
        lines = []
        for a in awards:
            bits = [b for b in [(a.get("level") or "").capitalize() or None,
                                str(a.get("year")) if a.get("year") else None] if b]
            lines.append(f"- {a.get('title')}" + (f" ({', '.join(bits)})" if bits else ""))
        sections.append({"id": "awards", "content": "## Awards and Honors\n" + "\n".join(lines)})

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
        sections.append({"id": "chat_topics", "content": "## Conversation History\nRecent topics from their chats with the Mentorable Agent:\n" + "\n".join(lines)})

    if roadmap_nodes:
        lines = [f"- [{n['pillar']}] {n['title']} ({n['month_label']}) — {n['state'].replace('_', ' ')}" for n in roadmap_nodes]
        sections.append({"id": "roadmap", "content": "## Current Roadmap\nNodes on the student's roadmap right now:\n" + "\n".join(lines)})

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
    name           = (profile.get("full_name") or "the student").strip() or "the student"
    first_name     = name.split()[0]
    response_style = profile.get("agent_response_style") or "balanced"
    style_guide   = STYLE_GUIDE.get(response_style, "")

    prompt = (
        f"You are the Mentorable Agent, an expert college application guide. "
        f"You help this student build and present the strongest possible application. You give specific, "
        f"actionable advice grounded in their actual record, not generic platitudes, and you are honest with "
        f"them about where they stand.\n\n"
        f"You know this student deeply from their onboarding. Always address them by their first name ({first_name}).\n\n"
        f"Response style: {style_guide}"
    )

    for section in _build_sections(profile, data):
        prompt += "\n\n" + section["content"]

    prompt += (
        "\n\n## How to respond\n"
        "- Use markdown formatting — it renders in the UI. Use **bold** for key points, ## for section headings, - for bullet lists, and 1. for numbered steps.\n"
        "- Keep responses concise and scannable. Prefer short paragraphs and bullets over walls of text.\n"
        "- Ground every answer in their actual record: their activities, courses, scores and target colleges. Never give generic advice when specific advice is possible.\n"
        "- If they ask about next steps, anchor your answer in the gaps already identified and how far they are from their target colleges.\n"
        "- Be honest about challenges while staying encouraging.\n"
        "- Never use em dashes (—) anywhere in your responses. Use commas, periods, parentheses, or colons instead.\n"
        "- Do not mention that you have a \"system prompt\" or that you were \"given\" this information. You simply know them."
    )

    prompt = _inject_chat_signals(profile, prompt)

    # The student's own custom instructions — placed last and given top priority.
    custom = (profile.get("agent_instructions") or "").strip()
    if custom:
        prompt += (
            "\n\n## The student's custom instructions — TOP PRIORITY\n"
            "The student has explicitly set these instructions for how you should behave. "
            "Follow them carefully, and prioritize them over the general guidance above wherever "
            "they conflict (as long as they're safe and appropriate):\n"
            f"{custom}"
        )

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


def _inject_node_context(node: Optional[dict], prompt: str) -> str:
    """Scope the conversation to one roadmap node — appended last (top priority),
    same placement as the student's custom instructions section below."""
    if not node:
        return prompt
    lines = [f"This conversation is focused on one specific roadmap item."]
    if node.get("blurb"):
        lines.append(node["blurb"])
    if node.get("overview"):
        lines.append(node["overview"])
    tasks = node.get("tasks") or []
    if tasks:
        lines.append("Checklist:")
        lines += [f"- [{'x' if t.get('done') else ' '}] {t['text']}" for t in tasks]
    lines.append("Help the student work through this specific item. Reference the checklist and overview directly.")
    return prompt + f"\n\n## Currently Discussing: {node.get('title', 'this roadmap item')}\n" + "\n\n".join(lines)


async def build_prompt(state: StudentState) -> StudentState:
    profile = state.get("profile") or {}
    data = {
        "completed_quests": state.get("_completed_quests", []),
        "active_quests":    state.get("_active_quests", state.get("active_quests", [])),
        "deleted_titles":   state.get("_deleted_titles", []),
        "recent_research":  state.get("_recent_research", []),
        "chat_topics":       state.get("_chat_topics", []),
        "roadmap_nodes":     state.get("_roadmap_nodes", []),
        "activities":        state.get("_activities", []),
        "awards":            state.get("_awards", []),
        "courses":           state.get("_courses", []),
        "scores":            state.get("_scores", []),
    }
    system_prompt = build_system_prompt(profile, data)
    system_prompt = _inject_research_findings(state.get("research_findings", []), system_prompt)
    system_prompt += QUEST_BOARD_CAPABILITY
    system_prompt += PORTFOLIO_CAPABILITY
    # Appended last (highest priority) — scopes the whole conversation to one node.
    system_prompt = _inject_node_context(state.get("_node_context"), system_prompt)
    return {**state, "_system_prompt": system_prompt}


QUEST_BOARD_CAPABILITY = """

## Managing the Quest Board
You can add quests directly to the student's quest board with the add_quest_to_board tool. The board has three columns: **Suggestions**, **Considered**, and **In Progress**.
- When the student asks you to add something, or clearly agrees to a suggestion you made, actually call the tool. NEVER claim you added a quest without calling it — if you didn't call the tool, it did not happen.
- Ask which column they want unless it's obvious from what they said (e.g. "I'm starting this" → In Progress, "maybe later" → Considered). If they don't indicate, default to Suggestions.
- After the tool succeeds, confirm in one short line what you added and to which column.
- Add one quest per tool call. Only add quests the student actually wants — never speculatively."""


PORTFOLIO_CAPABILITY = """

## The Student's Portfolio
The student keeps a portfolio of concrete pieces: experiences, projects, volunteering, awards, courses, certifications, clubs, and skills. A category-and-title summary may appear above; full descriptions live behind the view_portfolio tool.
- Call view_portfolio when the student asks about their portfolio, or when giving advice that depends on their concrete background (what's missing, what to refine, how to word a piece). Don't guess at contents you haven't viewed.
- Call add_portfolio_piece when the student asks you to add something to their portfolio or clearly agrees to your offer. One piece per call, never speculatively. After it succeeds, confirm in one short line.
- To edit or remove existing pieces, point them to the Portfolio page. You cannot modify existing pieces."""
