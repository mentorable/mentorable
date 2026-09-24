"""
Quest planning: a goal plus the student's pace becomes a milestone outline.

Runs once per quest (Sonnet 5), before the student commits. The outline is what
every daily task is generated against, so it is worth the stronger model.
"""
import logging
from typing import Optional

from app.llm import tool_completion
from app.models import QUEST_PLAN_MODEL
from app.nodes.quest.common import GOAL_KINDS, clean_kind, clean_text

logger = logging.getLogger(__name__)

MIN_MILESTONES = 3
MAX_MILESTONES = 8
MAX_TOTAL_DAYS = 60

PLAN_TOOL = {
    "name": "save_quest_plan",
    "description": "Save the quest outline.",
    "input_schema": {
        "type": "object",
        "properties": {
            "title": {"type": "string", "description": "A short name for the whole quest, at most 60 characters."},
            "summary": {"type": "string", "description": "One or two sentences on what they will have at the end."},
            "goal_kind": {"type": "string", "enum": GOAL_KINDS},
            "milestones": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string", "description": "At most 60 characters, names the outcome."},
                        "description": {"type": "string", "description": "What done looks like for this stage."},
                        "days": {"type": "integer", "description": "Work days needed at the student's daily pace."},
                    },
                    "required": ["title", "description", "days"],
                },
            },
        },
        "required": ["title", "summary", "goal_kind", "milestones"],
    },
}

PLAN_PROMPT = """You are planning a Quest for a high school student in the United States: one real project they will move forward a little every day, for about {minutes} minutes a day, {work_days} days a week.

THE STUDENT'S GOAL, IN THEIR OWN WORDS:
{goal}

WHAT WE KNOW ABOUT THEM:
{record}
{deadline_block}
Break the project into 5 to 8 milestones. Each milestone is a real, checkable stage of the work ("A working prototype", "First full practice test under timed conditions", "Summaries of ten papers"), not a vague theme like "Learn more". They run in order, and each should be possible once the one before it is done.

For each milestone:
- title: at most 60 characters, concrete, names the outcome.
- description: one or two sentences on what done looks like for this stage.
- days: how many work days it needs at {minutes} minutes a day, between 2 and 15.

Size the whole quest honestly for {minutes} minutes a day. Most quests land between 15 and 45 work days in total.{deadline_sizing}

Rules:
- It has to be doable by a high school student with the time and resources a typical student has: free tools, their school, their library, the internet. Never require paid programs, travel, or special access unless the goal itself names it.
- Keep it theirs. If the goal involves an essay or application writing, plan the thinking, drafting and revising, never a step where someone or something else writes it.
- Build something real. Never plan steps that exist to manufacture a title, an award, or an impressive-sounding line for an application.
- Do not state deadlines, dates or rules for any competition, program or school: they change every year. If the goal depends on one, make an early step "look up the current rules on the official site".
- title: a short name for the whole quest, at most 60 characters, that they would be glad to see on their screen every day.
- summary: one or two sentences on what they will have at the end.
- goal_kind: passion_project, competition_prep, research, or other.
- Plain words. Never use em dashes.

Call save_quest_plan with the result."""


def fit_days(days: list[int], cap: int) -> list[int]:
    """Shrink milestone lengths proportionally until they fit within cap."""
    total = sum(days)
    if total <= cap:
        return days
    scaled = [max(1, (d * cap) // total) for d in days]
    while sum(scaled) > cap and max(scaled) > 1:
        i = scaled.index(max(scaled))
        scaled[i] -= 1
    return scaled


def clean_plan(raw, max_days: Optional[int] = None) -> Optional[dict]:
    """Validate the model's outline. None when there is not a usable plan."""
    if not isinstance(raw, dict):
        return None
    milestones = []
    for m in (raw.get("milestones") if isinstance(raw.get("milestones"), list) else []):
        if not isinstance(m, dict):
            continue
        title = clean_text(m.get("title"), 60)
        if not title:
            continue
        try:
            days = int(m.get("days"))
        except (TypeError, ValueError):
            days = 4
        milestones.append({
            "title": title,
            "description": clean_text(m.get("description"), 240),
            "days": max(1, min(20, days)),
        })
        if len(milestones) == MAX_MILESTONES:
            break
    if len(milestones) < MIN_MILESTONES:
        return None

    cap = MAX_TOTAL_DAYS if max_days is None else min(MAX_TOTAL_DAYS, max_days)
    days = fit_days([m["days"] for m in milestones], cap)
    if sum(days) > cap:
        # More milestones than days before the deadline: keep what fits.
        milestones = milestones[:cap]
        days = [1] * len(milestones)
    for m, d in zip(milestones, days):
        m["days"] = d

    title = clean_text(raw.get("title"), 60) or milestones[-1]["title"]
    return {
        "title": title,
        "summary": clean_text(raw.get("summary"), 300),
        "goal_kind": clean_kind(raw.get("goal_kind")),
        "milestones": milestones,
    }


async def plan_quest(*, goal: str, record_text: str, minutes: int, work_days: int,
                     max_days: Optional[int], deadline_label: Optional[str]) -> Optional[dict]:
    """Raises ModelUnavailable if the model cannot be reached; None if its
    answer was unusable."""
    if max_days is not None:
        deadline_block = (f"\nFIXED DEADLINE: {deadline_label}. That leaves {max_days} work days, and it cannot move.\n")
        deadline_sizing = (f" It MUST fit in {max_days} work days in total. If the project cannot be done "
                           f"properly in that time, plan the most valuable version of it that can.")
    else:
        deadline_block = "\n"
        deadline_sizing = ""
    prompt = PLAN_PROMPT.format(
        minutes=minutes, work_days=work_days, goal=goal.strip(), record=record_text,
        deadline_block=deadline_block, deadline_sizing=deadline_sizing,
    )
    raw = await tool_completion(model=QUEST_PLAN_MODEL, prompt=prompt, tool=PLAN_TOOL,
                                max_tokens=2000, label="quest_plan")
    plan = clean_plan(raw, max_days)
    if plan is None:
        logger.warning("[quest_plan] unusable plan from the model")
    return plan
