"""
Poise's feedback on a mock interview: notes on each answer, pinned to the
student's own words, and a 1 to 5 score on each part of the rubric.

One call to POISE_FEEDBACK_MODEL (Sonnet 5.5) with structured output
(prompts.FEEDBACK_SCHEMA), whose schema has no field for a sample answer. Then
rules.validate_feedback checks all of it in code: a quote that is not the
student's, a line that hands them words to say, talks about admission or an
offer, or comments on grammar costs the note it was in, and nothing is ever
repaired. When the reply is unusable, or a reply that should have been scored
lost its rubric, the model is asked once more with the reasons, and the better
of the two answers is kept.

Why not llm.tool_completion or llm.json_completion: Sonnet 5.5 refuses a
forced tool choice (a 400), which tool_completion always sends, and
json_completion asks OpenAI first and then reads the first block of an
Anthropic reply, which on a model that thinks by default is a thinking block.
So this call goes through the app's one Anthropic client (llm._anthropic) with
output_config's json_schema format, which constrains the reply to the schema
and does work on this model.

The hand-off comes before everything: rules.crisis_now on every student line
before any call, and the model's own safety flag on every reply.

No database here, and nothing is looked up. The transcript, the notes and the
model's replies are never logged: log lines carry counts, the labels of what
was dropped, and an exception's type.
"""
import asyncio
import json
import logging
from collections import Counter
from typing import Optional

import anthropic

import app.llm as llm
from app.models import POISE_FEEDBACK_MODEL
from app.nodes.agents.interview import prompts, rules

logger = logging.getLogger(__name__)

# A ceiling, not a spend: thinking and the reply share it. Ten questions with
# two notes each, three habits and four reasons come to about 2500 tokens of
# reply; the rest is room to think. A ceiling costs nothing unless used.
FEEDBACK_MAX_TOKENS = 16000
# Sonnet 5.5 thinks by default. Medium is the middle of its range: enough to
# judge an answer against a rubric, without paying for long deliberation.
# scripts/check_interview.py prints what each call cost.
FEEDBACK_EFFORT = "medium"
# A refusal by the model's safety classifiers is retried on the next model
# down inside the same call (the server-side fallback beta), so a student who
# talked about something hard still gets notes. If the API turns the beta
# down (a 400), the same call is sent once without it, and the log says so;
# scripts/check_interview.py shows it too. False switches it off.
USE_FALLBACK = True
FALLBACK_BETA = "server-side-fallback-2026-07-01"
ATTEMPTS = 2                    # the call, and one retry with what was wrong

SAFETY = {"safety": True, "feedback": None, "scores": None}


def _reasons(dropped: list[dict]) -> Counter:
    """Why things were thrown away, as {reason: count}. Something left out
    only because there were too many is not a mistake to correct."""
    return Counter(d.get("reason") for d in dropped if isinstance(d, dict) and d.get("reason") != "over_the_cap")


def _crisis(transcript) -> bool:
    return any(rules.crisis_now(text) for _, text in rules.student_lines(transcript))


async def _call(system: str, prompt: str) -> Optional[dict]:
    """One structured call. The parsed reply, or None when it could not be
    read (a refusal, a cut-off reply, no text block). Raises when the API
    cannot be reached; the caller turns that into a failed run."""
    if USE_FALLBACK:
        try:
            return await _send(system, prompt, fallback=True)
        except anthropic.BadRequestError:
            logger.warning("[interview_feedback] the fallback beta was refused (400); sending without it")
    return await _send(system, prompt, fallback=False)


async def _send(system: str, prompt: str, *, fallback: bool) -> Optional[dict]:
    kwargs = {
        "model": POISE_FEEDBACK_MODEL,
        "max_tokens": FEEDBACK_MAX_TOKENS,
        "system": system,
        "messages": [{"role": "user", "content": prompt}],
    }
    body: dict = {"output_config": {"effort": FEEDBACK_EFFORT,
                                    "format": {"type": "json_schema", "schema": prompts.FEEDBACK_SCHEMA}}}
    if fallback:
        body["fallbacks"] = "default"
        kwargs["extra_headers"] = {"anthropic-beta": FALLBACK_BETA}
    # In extra_body so an older SDK that does not know the parameters still
    # sends them.
    kwargs["extra_body"] = body
    message = await llm._anthropic.messages.create(**kwargs)

    stop = getattr(message, "stop_reason", None)
    usage = getattr(message, "usage", None)
    logger.info(f"[interview_feedback] stop={stop} in={getattr(usage, 'input_tokens', '?')} "
                f"out={getattr(usage, 'output_tokens', '?')}")
    if stop in ("refusal", "max_tokens"):
        return None
    # The last text block: after a fallback, any text before the switch is
    # the declining model's and may be cut off.
    for block in reversed(list(getattr(message, "content", None) or [])):
        if getattr(block, "type", None) == "text":
            try:
                parsed = json.loads(getattr(block, "text", "") or "")
            except (TypeError, ValueError):
                return None
            return parsed if isinstance(parsed, dict) else None
    return None


def _better(a: Optional[tuple], b: Optional[tuple]) -> Optional[tuple]:
    """Of two checked results, the one with a rubric, then the one with more
    notes. A tie goes to `b` (the retry, which was told what went wrong)."""
    if a is None:
        return b
    if b is None:
        return a

    def rank(result):
        feedback, scores = result
        return (scores is not None, len(feedback["questions"]) + len(feedback["habits"]))
    return b if rank(b) >= rank(a) else a


async def write_feedback(mode, target, role, details, transcript, *, thin: bool,
                         trace: Optional[list] = None) -> Optional[dict]:
    """Notes and scores for one mock. Returns
      {"safety": False, "feedback": dict, "scores": dict | None}   checked, in the stored shapes
      {"safety": True, "feedback": None, "scores": None}           the student is in danger now
      None                                                         unreachable, or nothing usable came back
    Never raises (a cancellation, which is how the caller's deadline arrives,
    passes through).

    thin: the student said under rules.SCORE_WORDS words; no rubric is asked
    for or kept. trace, when a list is passed, collects each attempt's raw
    reply and what the code dropped (for scripts/check_interview.py; the
    service never passes it)."""
    try:
        return await _write(mode, target, role, details, transcript, bool(thin), trace)
    except Exception as exc:
        # The type only: an error raised around a prompt can carry the transcript.
        logger.error(f"[interview_feedback] failed: {type(exc).__name__}")
        return None


async def _write(mode, target, role, details, transcript, thin: bool, trace: Optional[list]) -> Optional[dict]:
    if _crisis(transcript):
        logger.info("[interview_feedback] hand-off before any call")
        return dict(SAFETY)

    system = prompts.FEEDBACK_SYSTEM
    prompt = prompts.feedback_user(mode, target, role, details, transcript, thin=thin)
    best: Optional[tuple] = None
    correction = ""
    for attempt in range(1, ATTEMPTS + 1):
        try:
            raw = await _call(system, prompt + correction)
        except Exception as exc:
            logger.warning(f"[interview_feedback] call failed on attempt {attempt}: {type(exc).__name__}")
            break
        if isinstance(raw, dict) and raw.get("safety") is True:
            logger.info("[interview_feedback] hand-off from the model's flag")
            return dict(SAFETY)
        dropped: list[dict] = []
        checked = await asyncio.to_thread(rules.validate_feedback, raw, transcript, thin=thin, dropped=dropped)
        reasons = _reasons(dropped)
        offered_q = len(raw.get("questions") or []) if isinstance(raw, dict) and isinstance(
            raw.get("questions"), list) else 0
        logger.info(
            f"[interview_feedback] attempt {attempt}: {offered_q} questions offered, "
            f"{len(checked[0]['questions']) if checked else 0} kept, "
            f"{len(checked[0]['habits']) if checked else 0} habits, "
            f"scores {'kept' if checked and checked[1] else 'none'}, dropped: {dict(reasons)}"
            + ("" if checked else " (unusable reply)"))
        if trace is not None:
            trace.append({"attempt": attempt, "raw": raw, "dropped": dropped, "usable": checked is not None})
        best = _better(best, checked)
        lost_rubric = checked is not None and not thin and checked[1] is None
        if checked is not None and not lost_rubric:
            break
        correction = prompts.correction(dict(reasons), unreadable=checked is None)

    if best is None:
        return None
    feedback, scores = best
    return {"safety": False, "feedback": feedback, "scores": scores}
