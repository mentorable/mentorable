"""
The short conversation before a quest is planned.

Picking a card or typing a goal says what the project is, not where it is
headed. Before the plan is drawn, the advisor asks two to four quick questions,
one at a time: what the student wants to have at the end, what they are
starting from, and what it is for. The planner reads the conversation and
writes the quest's direction from it, which every daily task and the chat
advisor then see.

Sonnet 5: the student reads every question, and the whole plan builds on the
answers. The conversation is stateless: the page sends it back each turn, and it
is cleaned and capped here, never trusted as sent.
"""
import logging
from typing import Optional

from app.llm import ModelUnavailable, tool_completion
from app.models import QUEST_TALK_MODEL
from app.nodes.quest.common import clean_text

logger = logging.getLogger(__name__)

MAX_QUESTIONS = 4
MIN_QUESTIONS = 2
MAX_ANSWER_CHARS = 400
MAX_QUESTION_CHARS = 220

# What the page shows when the advisor cannot take part (outage, budget spent,
# an unusable reply). The student goes straight on to their pace.
FALLBACK_LINE = "Let's set your pace and map it out."

TALK_TOOL = {
    "name": "next_turn",
    "description": "Ask the student your next question, or finish the conversation.",
    "input_schema": {
        "type": "object",
        "properties": {
            "done": {"type": "boolean", "description": "true to finish; false to ask another question."},
            "message": {"type": "string", "description": "Your next question, or when done, one short line showing you understood."},
        },
        "required": ["done", "message"],
    },
}

TALK_PROMPT = """You are Mentorable's advisor. A high school student is about to start a Quest: one real project they will move forward a little every day. Before the plan is drawn, you ask a few quick questions so it points where they actually want to go.

THE PROJECT THEY PICKED:
{goal}

WHAT WE KNOW ABOUT THEM:
{record}

THE CONVERSATION SO FAR:
{conversation}

You have asked {asked} of at most {max_q} questions.

What you are trying to learn, most important first:
1. What they want to have at the end: the concrete thing they could show someone (a working app, a paper, a performance, a score).
2. What they are starting from: what they already know, have made, or can use.
3. What it is for, or anything fixed about it: a class, a competition, a team, a major they are applying for, a date.

How to ask:
- One short question per turn, at most 25 words, in plain words. No preamble and no praise.
- Build on what they just said. Do not ask for anything the project or their record already tells you. Never ask about time per day or their schedule: that comes next.
- If an answer is thin ("idk", "not sure"), do not push. Offer a concrete default they can just accept, like "Want to aim for a version three clubs actually use by spring?"
- Never write any part of the project for them, and never suggest padding an application.
- If they mention something serious that is not about the project (feeling unsafe, a crisis, hurting themselves), set the project aside: say plainly that this matters more, and that they should talk to a trusted adult or their school counselor, or call or text 988 if they are in crisis. Then set done to true. Ordinary stress about school is not this; just keep it light and move on.
- Never use em dashes.

When to finish: once you know roughly what they want at the end and what they are starting from, or when you have asked {max_q} questions. To finish, set done to true and write one line back to them, under 20 words, showing you understood where this is headed (for example "Got it: a club scheduling app three clubs use by spring, starting from basic Python."). Ask nothing when you finish.
{rule}
Call next_turn."""


def clean_messages(raw) -> list[dict]:
    """The conversation as the page sent it, made safe to put in a prompt:
    roles normalised to advisor/student, empty lines dropped, each line clipped,
    and cut off at the question cap. It always starts with the advisor and
    alternates; anything that breaks that is dropped from there on."""
    out: list[dict] = []
    for m in (raw if isinstance(raw, list) else []):
        if not isinstance(m, dict):
            continue
        role = {"assistant": "advisor", "advisor": "advisor", "user": "student", "student": "student"}.get(
            str(m.get("role") or "").lower())
        text = " ".join(str(m.get("content") or "").split())
        if not role or not text:
            continue
        expected = "advisor" if len(out) % 2 == 0 else "student"
        if role != expected:
            break
        out.append({"role": role, "content": text[: MAX_QUESTION_CHARS if role == "advisor" else MAX_ANSWER_CHARS]})
        if len(out) == MAX_QUESTIONS * 2:
            break
    return out


def render(messages: list[dict]) -> str:
    return "\n".join(f"{'Advisor' if m['role'] == 'advisor' else 'Student'}: {m['content']}" for m in messages)


def questions_asked(messages: list[dict]) -> int:
    return sum(1 for m in messages if m["role"] == "advisor")


def _rule(asked: int) -> str:
    if asked >= MAX_QUESTIONS:
        return "\nYou have asked all your questions. Finish now.\n"
    if asked < MIN_QUESTIONS:
        return "\nAsk another question unless they have already told you both what they want at the end and what they are starting from.\n"
    return "\n"


def clean_turn(raw, asked: int) -> Optional[dict]:
    """The model's turn, checked. None when it is unusable."""
    if not isinstance(raw, dict):
        return None
    message = clean_text(raw.get("message"), MAX_QUESTION_CHARS)
    if not message:
        return None
    done = raw.get("done") is True or asked >= MAX_QUESTIONS
    return {"done": done, "message": message, "fallback": False}


async def next_turn(*, goal: str, record_text: str, messages: list[dict]) -> dict:
    """The advisor's next question, or its closing line. Never raises: an outage
    or an unusable reply finishes the conversation with FALLBACK_LINE, so the
    student is never stuck on this step."""
    asked = questions_asked(messages)
    prompt = TALK_PROMPT.format(
        goal=goal.strip(), record=record_text,
        conversation=render(messages) or "(nothing yet: ask your first question)",
        asked=asked, max_q=MAX_QUESTIONS, rule=_rule(asked),
    )
    try:
        raw = await tool_completion(model=QUEST_TALK_MODEL, prompt=prompt, tool=TALK_TOOL,
                                    max_tokens=300, label="quest_talk")
    except ModelUnavailable as exc:
        logger.warning(f"[quest_talk] model unavailable: {exc}")
        return {"done": True, "message": FALLBACK_LINE, "fallback": True}
    turn = clean_turn(raw, asked)
    if turn is None:
        logger.warning("[quest_talk] unusable turn from the model")
        return {"done": True, "message": FALLBACK_LINE, "fallback": True}
    return turn
