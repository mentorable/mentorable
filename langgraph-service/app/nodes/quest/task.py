"""
The daily task: one small, concrete step for one day-slot of a quest.

Generated one day at a time (Haiku 4.5) so it can react to yesterday's
check-in. When the daily budget is spent or the model is down, a plain task
built from the milestone stands in: the student can always keep moving, only
the personalisation is capped.
"""
import logging
from typing import Optional

from app.llm import ModelUnavailable, tool_completion
from app.models import QUEST_TASK_MODEL
from app.nodes.quest.common import clean_text

logger = logging.getLogger(__name__)

TASK_TOOL = {
    "name": "set_task",
    "description": "Set the student's task for this day.",
    "input_schema": {
        "type": "object",
        "properties": {
            "title": {"type": "string", "description": "The task as one imperative line, at most 90 characters."},
            "detail": {"type": "string", "description": "One to three sentences: exactly what to do, and what finished looks like."},
            "minutes": {"type": "integer", "description": "Realistic minutes it takes."},
        },
        "required": ["title", "detail", "minutes"],
    },
}

TASK_PROMPT = """You set one day's task in a high school student's Quest: one small, concrete step on a real project, done in about {minutes} minutes.

QUEST: {quest_title}
{quest_summary}

CURRENT MILESTONE ({ms_position} of {ms_count}): {ms_title}
{ms_description}
This is day {day_in_ms} of {ms_days} planned for this milestone.{catch_up_note}

TASKS ALREADY SET IN THIS MILESTONE:
{prior}

WHAT THEY REPORTED RECENTLY, IN THEIR OWN WORDS:
{recent}

ABOUT THEM: {grade}

Write the task. Rules:
- One action a high school student can finish in {minutes} minutes in one sitting. If it cannot be finished in one sitting, cut it down.
- Concrete and checkable. "Sketch three layouts for the home screen on paper" is a task. "Think about the design" is not.
- Build on what they reported. If they got stuck, today's task is the way unstuck. If they are ahead, move forward.
- Do not repeat a task already set in this milestone.
- Pace the milestone so it is finished by its last day: the last task of a milestone should complete its stated outcome.
- Free tools and resources only. Never tell them to pay for anything.
- If the work is an essay or application writing, the task is to think, draft or revise their own words, never to have someone or something else write it.
- Do not state deadlines, dates or rules of any competition, program or school. If the task depends on one, the task is to look it up on the official site.
- Talk to them directly ("Write...", "List...", "Email..."). Plain words, no filler. Never use em dashes.

Call set_task."""


def fallback_task(milestone: dict, minutes: int) -> dict:
    title = clean_text(f"Move \"{milestone.get('title') or 'this milestone'}\" forward", 90)
    return {
        "title": title,
        "detail": (f"Spend {minutes} minutes on the next piece of this milestone. When you check in, "
                   f"write down what you got done and what comes next."),
        "est_minutes": minutes,
        "fallback": True,
    }


def clean_task(raw, minutes: int) -> Optional[dict]:
    if not isinstance(raw, dict):
        return None
    title = clean_text(raw.get("title"), 90)
    if not title:
        return None
    try:
        est = int(raw.get("minutes"))
    except (TypeError, ValueError):
        est = minutes
    return {
        "title": title,
        "detail": clean_text(raw.get("detail"), 400),
        "est_minutes": max(5, min(minutes, est)),
        "fallback": False,
    }


async def generate_task(*, quest: dict, milestone: dict, milestone_count: int, day_in_ms: int,
                        prior_titles: list[str], recent: list[dict], grade: str,
                        catch_up: bool) -> dict:
    """Always returns a task: a personalised one, or the fallback."""
    minutes = int(quest.get("daily_minutes") or 30)
    recent_text = "\n".join(
        f"- On \"{r.get('task_title')}\": {clean_text(r.get('body'), 300)}"
        + (f" (asked a follow-up, they said: {clean_text(r.get('followup_answer'), 200)})" if r.get("followup_answer") else "")
        for r in recent
    ) or "(nothing yet, this is the start)"
    prompt = TASK_PROMPT.format(
        minutes=minutes,
        quest_title=quest.get("title") or "",
        quest_summary=quest.get("summary") or "",
        ms_position=milestone.get("position"),
        ms_count=milestone_count,
        ms_title=milestone.get("title") or "",
        ms_description=milestone.get("description") or "",
        day_in_ms=day_in_ms,
        ms_days=milestone.get("expected_days"),
        catch_up_note=(" This is a catch-up for a day they missed, so keep it tight and useful." if catch_up else ""),
        prior="\n".join(f"- {t}" for t in prior_titles) or "(none yet, this is the first)",
        recent=recent_text,
        grade=grade,
    )
    try:
        raw = await tool_completion(model=QUEST_TASK_MODEL, prompt=prompt, tool=TASK_TOOL,
                                    max_tokens=600, label="quest_task")
    except ModelUnavailable as exc:
        logger.warning(f"[quest_task] model unavailable, using the fallback task: {exc}")
        return fallback_task(milestone, minutes)
    return clean_task(raw, minutes) or fallback_task(milestone, minutes)
