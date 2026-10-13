"""
The guided brainstorm: Quill asks, one question at a time, until the student
has said something worth a card on their ideas board.

For a student whose record points nowhere, or who skipped the interview. They
pick where to start (rules.TALK_STARTS) or pick up a card they already have,
and Quill asks up to six short questions. It asks for a moment, a place, a
person. It never suggests a topic, a thesis, an opening or a sentence: the
subject has to be one the student finds. When it is done it reflects back what
they said in one line and names a neutral area for the card.

Modelled on Quest's pre-plan talk (quest/talk.py). The conversation is
stateless: the page sends it back each turn, and it is cleaned and capped
here, never trusted as sent. next_turn never raises: an outage, an unusable
reply or a line that breaks Quill's rules ends the talk with FALLBACK_LINE, so
a student is never stuck on this step and always leaves with their answers on
a card. Writing that says the student is in danger now ends it with
rules.TALK_HANDOFF instead, and nothing they typed is kept.

Nothing a student types here is logged: log lines carry labels and counts.
"""
import logging
from typing import Optional

from app.llm import ModelUnavailable, tool_completion
from app.models import OWL_TALK_MODEL
from app.nodes.agents.essay import prompts, rules

logger = logging.getLogger(__name__)

MAX_QUESTIONS = 6
MIN_QUESTIONS = 2
MAX_QUESTION_CHARS = 220
MIN_QUESTION_WORDS = 3          # of the one question a turn is cut down to
MAX_ANSWER_CHARS = 600
CLOSING_CHARS = 180             # the closing line: one line, under 20 words
AREA_WORDS = 6                  # the card's label when a talk names it
TALK_MAX_TOKENS = 300

# What the page shows when Quill cannot take part (an outage, an unusable or
# rule-breaking reply). The service saves the answers given so far on a card.
FALLBACK_LINE = "Let's leave it there for now. Your answers are saved on a card."

_ROLES = {"assistant": "advisor", "advisor": "advisor", "quill": "advisor", "user": "student", "student": "student"}


def clean_messages(raw) -> list[dict]:
    """The conversation as the page sent it, made safe to put in a prompt:
    roles normalised to advisor/student, empty lines dropped, each line
    clipped (a question to 220 characters, an answer to 600), and cut off at
    six pairs. It always starts with the advisor and alternates; anything that
    breaks that is dropped from there on."""
    out: list[dict] = []
    for m in (raw if isinstance(raw, list) else []):
        if not isinstance(m, dict):
            continue
        role = _ROLES.get(str(m.get("role") or "").lower())
        content = m.get("content")
        text = " ".join(content.split()) if isinstance(content, str) else ""
        if not role or not text:
            continue
        expected = "advisor" if len(out) % 2 == 0 else "student"
        if role != expected:
            break
        out.append({"role": role, "content": text[:MAX_QUESTION_CHARS if role == "advisor" else MAX_ANSWER_CHARS]})
        if len(out) == MAX_QUESTIONS * 2:
            break
    return out


def render(messages: list[dict]) -> str:
    return "\n".join(f"{'Quill' if m['role'] == 'advisor' else 'Student'}: {m['content']}" for m in messages)


def questions_asked(messages: list[dict]) -> int:
    return sum(1 for m in messages if m["role"] == "advisor")


def answers(messages: list[dict]) -> list[str]:
    return [m["content"] for m in messages if m["role"] == "student"]


def _ended(message: str, *, fallback: bool = False, handoff: bool = False, area: str = "") -> dict:
    return {"done": True, "message": message, "area": area, "fallback": fallback, "handoff": handoff}


def fallback_turn() -> dict:
    """The turn when Quill takes no part: the talk ends here."""
    return _ended(FALLBACK_LINE, fallback=True)


def handoff_turn() -> dict:
    return _ended(rules.TALK_HANDOFF, handoff=True)


def asked(text) -> Optional[str]:
    """The one thing a turn asks: its first sentence that ends with a question
    mark, or failing that a closing "Tell me ...", which is a way of asking.
    Whatever else the model put around it (a word about their answer, a second
    question, "that would make a great essay") is left off. Leaving words off
    cannot add any, and it is the difference between a brainstorm that goes on
    and one that ends because of a preamble."""
    parts = rules.sentences(text)
    for part in parts:
        if part.rstrip("\"')]\u201d\u2019").endswith("?"):
            # "Want to?" and "Why?" lean on what came before them, which is
            # gone: a question that stands alone has a few words of its own.
            return part if rules.word_count(part) >= MIN_QUESTION_WORDS else None
    if parts and parts[-1].lower().startswith("tell me "):
        return parts[-1]
    return None


def clean_turn(raw, *, must_finish: bool, allowed_sources: list, can_finish: bool = True,
               raised: Optional[list] = None) -> Optional[dict]:
    """The model's turn, checked. None when it is unusable.

    A turn that goes on is cut down to the one thing it asks (asked), which
    must pass rules.clean_line as an open question (rules.OPEN) and
    rules.talk_breaks: a "question" that suggests what to write, says what
    colleges want, names the essay or its topic, offers the answer for them
    to agree to, asks for the lesson, or names one the student has not raised
    is not asked. A closing line is held to the lists too, and has to say what
    the student did in the talk ("You kept coming back to...") without
    calling anything a topic or a theme or drawing a lesson from it; one that
    fails is replaced by FALLBACK_LINE (the talk is over either way), and one
    that is itself a question is not a closing. The
    area is kept only as a short neutral label (rules.clean_area), else left
    empty for the service to name the card from where the talk started.

    raised: what the student has said or written themselves, for the lessons
    a line may name (allowed_sources when it is not given). can_finish is
    false until the student has answered something: a talk cannot close on
    nothing."""
    if not isinstance(raw, dict):
        return None
    raised = allowed_sources if raised is None else raised
    if must_finish or (raw.get("done") is True and can_finish):
        message = rules.clean_line(raw.get("message"), CLOSING_CHARS, allowed_sources,
                                   also=lambda flat: rules.talk_breaks(flat, raised, closing=True))
        if message is None or message.endswith("?"):
            return fallback_turn()
        area = rules.clean_area(raw.get("area"), AREA_WORDS, allowed_sources) or ""
        return _ended(message, area=area)
    message = rules.clean_line(asked(raw.get("message")), MAX_QUESTION_CHARS, allowed_sources, allow=("tell_me",),
                               kind=rules.OPEN, also=lambda flat: rules.talk_breaks(flat, raised, closing=False))
    if message is None:
        return None
    return {"done": False, "message": message, "area": "", "fallback": False, "handoff": False}


def _topic_texts(topic: Optional[dict]) -> list[str]:
    if not isinstance(topic, dict):
        return []
    questions = topic.get("questions") if isinstance(topic.get("questions"), list) else []
    return [t for t in (topic.get("area"), topic.get("notes"), *questions) if isinstance(t, str) and t.strip()]


async def next_turn(*, start: str, topic: Optional[dict], record_text: str, messages: list[dict]) -> dict:
    """Quill's next question, or its closing line:
    {"done": bool, "message": str, "area": str, "fallback": bool, "handoff": bool}.

    topic: the card being continued ({"area", "notes"}), or None for a new
    talk from `start` (a rules.TALK_STARTS key). Never raises. A conversation
    whose last line is Quill's own unanswered question means the student
    stopped there, so the turn is the closing one."""
    try:
        return await _next_turn(start, topic, record_text if isinstance(record_text, str) else "",
                                clean_messages(messages))
    except Exception as exc:
        # The type only: an error raised around a prompt can carry what they typed.
        logger.error(f"[essay_talk] turn failed: {type(exc).__name__}")
        return fallback_turn()


async def _next_turn(start: str, topic: Optional[dict], record_text: str, messages: list[dict]) -> dict:
    said = answers(messages)
    asked = questions_asked(messages)
    stopped = bool(messages) and messages[-1]["role"] == "advisor"
    # Checked in code before any call, on the last thing they said (their
    # earlier answers were the last thing said on the turns before this one).
    if said and rules.crisis_now(said[-1]):
        logger.info("[essay_talk] hand-off before any call")
        return handoff_turn()
    if stopped and not said:
        return fallback_turn()                     # nothing was said: nothing to reflect back

    prompt = prompts.talk_prompt(
        start=start, topic=topic, record_text=record_text, conversation=render(messages), asked=asked,
        max_questions=MAX_QUESTIONS, min_questions=MIN_QUESTIONS, stopped=stopped,
    )
    try:
        raw = await tool_completion(model=OWL_TALK_MODEL, prompt=prompt, tool=prompts.TALK_TOOL,
                                    max_tokens=TALK_MAX_TOKENS, label="essay_talk")
    except ModelUnavailable as exc:
        logger.warning(f"[essay_talk] model unavailable: {type(exc).__name__}")
        return fallback_turn()
    if isinstance(raw, dict) and raw.get("safety") == "crisis":
        logger.info("[essay_talk] hand-off from the model's flag")
        return handoff_turn()
    # Quotation marks in Quill's line may only hold the student's own words,
    # their card's, or the record's. A lesson it names must be one the student
    # raised: the record's summary was written by a model, so it does not count.
    raised = [rules.prepare(text) for text in (*said, *_topic_texts(topic)) if text]
    sources = raised + ([rules.prepare(record_text)] if record_text else [])
    turn = clean_turn(raw, must_finish=stopped or asked >= MAX_QUESTIONS, allowed_sources=sources,
                      can_finish=bool(said), raised=raised)
    if turn is None:
        logger.warning("[essay_talk] unusable turn from the model")
        return fallback_turn()
    if turn["fallback"]:
        logger.warning("[essay_talk] the closing line broke a rule; canned line used")
    return turn
