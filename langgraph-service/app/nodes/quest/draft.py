"""
Turning a finished quest into a Common App activity draft (Sonnet 5).

The student reviews and edits the draft before anything is saved. Hours and
weeks are computed from the quest itself rather than asked of the model, and
only check-ins with substance feed the description, so a run of "did it"
check-ins cannot turn into an inflated line on an application.
"""
import logging
import math
from datetime import date
from typing import Optional

from app.llm import ModelUnavailable, tool_completion
from app.models import QUEST_DRAFT_MODEL
from app.nodes.onboarding.intake import ACTIVITY_CATEGORIES
from app.nodes.quest.common import clean_text

logger = logging.getLogger(__name__)

DRAFT_TOOL = {
    "name": "save_activity_draft",
    "description": "Save the Common App activity draft.",
    "input_schema": {
        "type": "object",
        "properties": {
            "title": {"type": "string", "description": "The activity's name, at most 60 characters."},
            "category": {"type": "string", "enum": ACTIVITY_CATEGORIES},
            "position": {"type": "string", "description": "Their role, at most 50 characters."},
            "organization": {"type": "string", "description": "At most 100 characters."},
            "description": {"type": "string", "description": "At most 150 characters, impact first."},
        },
        "required": ["title", "category", "position", "organization", "description"],
    },
}

DRAFT_PROMPT = """A high school student just finished a Quest: a project they worked on a little every day. Draft the Common App activity entry for it, using only what their check-ins show they actually did.

QUEST: {title}
{summary}

MILESTONES:
{milestones}

WHAT THEY REPORTED, IN THEIR OWN WORDS:
{checkins}

Fields:
- title: the activity's name, at most 60 characters.
- category: the closest Common App activity category.
- position: their role, at most 50 characters ("Founder", "Researcher", "Competitor", "Independent project").
- organization: at most 100 characters. If it was independent, "Independent project".
- description: at most 150 characters, in the compressed, impact-first Common App style. Lead with what they did and a concrete result.

Rules:
- Only what the check-ins support. Never add a result, a number, an audience or an award they did not report. If the check-ins are thin, write a modest, accurate description instead of an impressive guess: this goes on a real application, and admissions readers compare thousands of these.
- Never use em dashes.

Call save_activity_draft."""


def computed_fields(quest: dict, rest_days: list[int], start: Optional[date], end: Optional[date]) -> dict:
    """The numbers, worked out rather than generated."""
    minutes = int(quest.get("daily_minutes") or 30)
    work_days = max(1, 7 - len(rest_days or []))
    hours = round(minutes * work_days / 60 * 2) / 2
    weeks = 1
    if start and end and end >= start:
        weeks = max(1, min(52, math.ceil(((end - start).days + 1) / 7)))
    timing = "summer" if start and start.month in (6, 7, 8) else "school_year"
    return {"hours_per_week": max(0.5, hours), "weeks_per_year": weeks, "timing": timing}


def fallback_draft(quest: dict) -> dict:
    return {
        "title": clean_text(quest.get("title"), 60),
        "category": "Other",
        "position": "Independent project",
        "organization": "Independent project",
        "description": clean_text(quest.get("summary"), 150),
    }


def clean_draft(raw, quest: dict) -> dict:
    if not isinstance(raw, dict):
        return fallback_draft(quest)
    category = raw.get("category") if raw.get("category") in ACTIVITY_CATEGORIES else "Other"
    return {
        "title": clean_text(raw.get("title"), 60) or clean_text(quest.get("title"), 60),
        "category": category,
        "position": clean_text(raw.get("position"), 50),
        "organization": clean_text(raw.get("organization"), 100),
        "description": clean_text(raw.get("description"), 150),
    }


async def draft_activity(*, quest: dict, milestones: list[dict], checkins: list[dict]) -> dict:
    """Always returns a draft; the student edits it before it is saved."""
    usable = [c for c in checkins if not c.get("thin") or c.get("followup_answer")]
    lines = []
    for c in usable[-25:]:
        line = clean_text(c.get("body"), 300)
        if c.get("followup_answer"):
            line += f" ({clean_text(c.get('followup_answer'), 200)})"
        lines.append(f"- {line}")
    prompt = DRAFT_PROMPT.format(
        title=quest.get("title") or "",
        summary=quest.get("summary") or "",
        milestones="\n".join(f"{m.get('position')}. {m.get('title')}" for m in milestones),
        checkins="\n".join(lines) or "(They checked in every day but wrote very little about what they did.)",
    )
    try:
        raw = await tool_completion(model=QUEST_DRAFT_MODEL, prompt=prompt, tool=DRAFT_TOOL,
                                    max_tokens=600, label="quest_draft")
    except ModelUnavailable as exc:
        logger.warning(f"[quest_draft] model unavailable, using the plain draft: {exc}")
        return fallback_draft(quest)
    return clean_draft(raw, quest)
