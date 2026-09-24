"""
The advisor's reply to a check-in (Haiku 4.5).

A check-in always counts: the task is already marked done before this runs, so
a slow or failed reply can never cost a student their streak. The reply is a
coach texting back, and on a thin check-in it asks one follow-up question.
"""
import logging
import random

from app.llm import ModelUnavailable, tool_completion
from app.models import QUEST_CHECKIN_MODEL
from app.nodes.quest.common import clean_text

logger = logging.getLogger(__name__)

THIN_WORDS = 6

CHECKIN_TOOL = {
    "name": "reply_to_checkin",
    "description": "Reply to the student's check-in.",
    "input_schema": {
        "type": "object",
        "properties": {
            "reply": {"type": "string", "description": "One to three short sentences back to the student."},
            "thin": {"type": "boolean", "description": "True if the check-in says almost nothing about what they actually did."},
            "followup": {"type": "string", "description": "Only when thin: one short, specific question. Otherwise an empty string."},
        },
        "required": ["reply", "thin", "followup"],
    },
}

CHECKIN_PROMPT = """A high school student just checked in on a task in their Quest. You are their college application advisor, replying in a few words, like a good coach texting back.

QUEST: {quest_title}
MILESTONE: {ms_title}
TASK: {task_title}
{task_detail}{catch_up_line}

WHAT THEY WROTE:
\"\"\"{body}\"\"\"

How to reply:
- One to three short sentences about what they actually wrote. Name the specific thing they did. Never generic praise on its own like "Great job!".
- You are a coach, not a gatekeeper. The task already counts as done whatever they wrote. Never suggest it does not count.
- If they hit a problem, give one concrete way forward.
- Give feedback on their work, never a rewritten version of it. If they share writing, react to it; do not produce new wording for them.
- thin is true when the check-in says almost nothing about what they did ("done", "did it", "worked on it"). Then followup is one short, specific question that would get them to say what they actually did or found. Otherwise followup is an empty string.
- If they mention something serious that is not about the project (feeling unsafe, a crisis, hurting themselves), set the project aside: say plainly that this matters more, and that they should talk to a trusted adult or their school counselor, or call or text 988 if they are in crisis.
- Plain words. No emoji. Never use em dashes.

Call reply_to_checkin."""

_CANNED = [
    "Logged. That is one more step done.",
    "Got it. Nice work keeping it moving.",
    "Checked in. Every day like this adds up.",
]
_CANNED_FOLLOWUP = "What was the most concrete thing you got done?"


def looks_thin(body: str) -> bool:
    return len((body or "").split()) < THIN_WORDS


def canned_reply(body: str) -> dict:
    thin = looks_thin(body)
    return {"reply": random.choice(_CANNED), "thin": thin,
            "followup": _CANNED_FOLLOWUP if thin else None, "canned": True}


def clean_reply(raw, body: str) -> dict:
    if not isinstance(raw, dict):
        return canned_reply(body)
    reply = clean_text(raw.get("reply"), 400)
    if not reply:
        return canned_reply(body)
    thin = raw.get("thin") if isinstance(raw.get("thin"), bool) else looks_thin(body)
    followup = clean_text(raw.get("followup"), 200) if thin else ""
    if thin and not followup:
        followup = _CANNED_FOLLOWUP
    return {"reply": reply, "thin": thin, "followup": followup or None, "canned": False}


async def reply_to_checkin(*, quest: dict, milestone: dict, task: dict, body: str, catch_up: bool) -> dict:
    prompt = CHECKIN_PROMPT.format(
        quest_title=quest.get("title") or "",
        ms_title=milestone.get("title") or "",
        task_title=task.get("title") or "",
        task_detail=task.get("detail") or "",
        catch_up_line=("\n(This was a catch-up for a day they missed.)" if catch_up else ""),
        body=body.replace('"""', '"'),
    )
    try:
        raw = await tool_completion(model=QUEST_CHECKIN_MODEL, prompt=prompt, tool=CHECKIN_TOOL,
                                    max_tokens=400, label="quest_checkin")
    except ModelUnavailable as exc:
        logger.warning(f"[quest_checkin] model unavailable, using a canned reply: {exc}")
        return canned_reply(body)
    return clean_reply(raw, body)
