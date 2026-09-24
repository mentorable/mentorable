"""
Suggested quests for the picker (Sonnet 5).

Built from the student's record and the gaps the intake interview found, then
cached on profiles.quest_suggestions against a fingerprint of the record, so
opening the picker is free and instant. It only regenerates when the record
changes in a way that matters or the student asks for new ideas.
"""
import hashlib
import json
import logging
from typing import Optional

from app.llm import tool_completion
from app.models import QUEST_SUGGEST_MODEL
from app.nodes.quest.common import GOAL_KINDS, clean_kind, clean_text

logger = logging.getLogger(__name__)

# Shown when there is no record to work from, or no model: the three kinds of
# quest in the student's own words, which still lead into a real plan.
FALLBACK_SUGGESTIONS = [
    {"title": "Start a passion project", "goal_kind": "passion_project", "weeks": 5,
     "why": "Build something of your own around a thing you already care about."},
    {"title": "Prep for a competition", "goal_kind": "competition_prep", "weeks": 6,
     "why": "Pick one competition in an area you are strong in and train for it steadily."},
    {"title": "Start a research project", "goal_kind": "research", "weeks": 6,
     "why": "Take a question you are curious about and investigate it properly."},
]

SUGGEST_TOOL = {
    "name": "save_suggestions",
    "description": "Save three quest suggestions.",
    "input_schema": {
        "type": "object",
        "properties": {
            "suggestions": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string", "description": "At most 60 characters, specific."},
                        "why": {"type": "string", "description": "One sentence on why it fits them."},
                        "goal_kind": {"type": "string", "enum": GOAL_KINDS},
                        "weeks": {"type": "integer", "description": "Rough length in weeks, 2 to 10."},
                    },
                    "required": ["title", "why", "goal_kind", "weeks"],
                },
            },
        },
        "required": ["suggestions"],
    },
}

SUGGEST_PROMPT = """Suggest three Quests for a high school student in the United States. A Quest is one real project they work on a little every day for a few weeks. It should end with something that genuinely strengthens their college application because it is real work they care about, not because it looks good.

THEIR RECORD:
{record}

GAPS ALREADY IDENTIFIED IN THEIR APPLICATION:
{gaps}

Rules:
- Build on what they already do and care about. The best Quest deepens something real in their record, or fills a gap in a direction they have already shown interest in. Never invent a new identity for them.
- Judge against the opportunity they actually have. If they work or care for family, the Quest has to fit around that.
- Make the three meaningfully different. Aim for one passion project, one competition or exam prep, and one research project, each fitted to them. If one kind clearly does not suit them, swap it for another that does.
- title: at most 60 characters and specific ("Build a practice-scheduling app for your robotics team", not "Coding project").
- why: one sentence on why it fits them, pointing at something real in their record.
- weeks: rough length, 2 to 10.
- No paid programs, no travel, nothing that needs access they do not have.
- Do not state deadlines, dates or rules for any competition or program.
- Plain words. Never use em dashes.

Call save_suggestions."""


def record_key(record: dict) -> str:
    """A fingerprint of the parts of the record that should change the ideas.
    Editing an activity's hours does not; adding an activity does."""
    profile = record.get("profile") or {}
    narrative = profile.get("narrative") if isinstance(profile.get("narrative"), dict) else {}
    basis = {
        "grade": profile.get("grade_level"),
        "activities": sorted(str(a.get("title") or "") for a in record.get("activities") or []),
        "awards": sorted(str(a.get("title") or "") for a in record.get("awards") or []),
        "majors": profile.get("candidate_majors") or [],
        "colleges": profile.get("target_colleges") or [],
        "gaps": (narrative or {}).get("gaps") or [],
    }
    return hashlib.sha1(json.dumps(basis, sort_keys=True, default=str).encode()).hexdigest()[:16]


def clean_suggestions(raw) -> Optional[list[dict]]:
    items = raw.get("suggestions") if isinstance(raw, dict) else None
    out = []
    for s in items if isinstance(items, list) else []:
        if not isinstance(s, dict):
            continue
        title = clean_text(s.get("title"), 60)
        if not title:
            continue
        try:
            weeks = int(s.get("weeks"))
        except (TypeError, ValueError):
            weeks = 5
        out.append({
            "title": title,
            "why": clean_text(s.get("why"), 200),
            "goal_kind": clean_kind(s.get("goal_kind")),
            "weeks": max(2, min(10, weeks)),
        })
        if len(out) == 3:
            break
    return out if len(out) >= 2 else None


async def suggest_quests(*, record_text: str, record: dict) -> Optional[list[dict]]:
    """Raises ModelUnavailable if the model cannot be reached."""
    profile = record.get("profile") or {}
    narrative = profile.get("narrative") if isinstance(profile.get("narrative"), dict) else {}
    gaps = (narrative or {}).get("gaps") or []
    prompt = SUGGEST_PROMPT.format(
        record=record_text,
        gaps="\n".join(f"- {g}" for g in gaps if isinstance(g, str)) or "(none recorded)",
    )
    raw = await tool_completion(model=QUEST_SUGGEST_MODEL, prompt=prompt, tool=SUGGEST_TOOL,
                                max_tokens=900, label="quest_suggest")
    return clean_suggestions(raw)
