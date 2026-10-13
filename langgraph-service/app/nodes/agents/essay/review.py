"""
Quill's review of a draft: what it noticed, as notes pinned to the student's
own words.

One Haiku call through a forced tool (prompts.REVIEW_TOOL), whose schema has no
field for essay text: a note is a passage quoted from the draft, an
observation and a question. Then rules.validate_review checks all of it in
code. A quote that is not in the draft, a line that tells the student what to
write, a comment on spelling or grammar, a word about admission chances: each
costs the note it was in, and nothing is ever repaired. When that throws away
more than half the notes, or leaves nothing, the model is asked once more with
the reasons, and the better of the two answers is kept. An answer whose notes
were all thrown away is never passed off as a clean review: with nothing
better, the review has failed and the caller gives it back.

The hand-off comes before everything: rules.crisis_now on the draft before any
call, and the model's own safety flag on every reply.

No database here, and nothing is looked up. The draft, the notes and the
model's replies are never logged: log lines carry counts and the labels of
what was dropped.
"""
import asyncio
import logging
from collections import Counter
from typing import Optional

from app.llm import ModelUnavailable, tool_completion
from app.models import OWL_REVIEW_MODEL
from app.nodes.agents.essay import prompts, rules

logger = logging.getLogger(__name__)

# About 2500 tokens holds eight notes; a draft over its limit also gets up to
# six cuts, each quoting a passage, so the ceiling sits a little above that. A
# ceiling costs nothing unless it is used.
REVIEW_MAX_TOKENS = 3000
ATTEMPTS = 2                    # the call, and one retry with what was wrong

HANDOFF = {"status": "handoff"}
FAILED = {"status": "failed"}


def _reasons(dropped: list[dict]) -> Counter:
    """Why notes were thrown away, as {reason: count}. A note left out only
    because there were more than twelve is not a mistake to correct."""
    return Counter(d["reason"] for d in dropped
                   if d["what"].startswith("note ") and d["reason"] != "over_the_cap")


def needs_retry(checked: Optional[dict], offered: int, dropped: list[dict]) -> bool:
    """Ask again when the reply was unusable, or when the checks threw away
    more than half the notes it offered (which covers "left nothing")."""
    if checked is None:
        return True
    return offered > 0 and sum(_reasons(dropped).values()) * 2 > offered


async def review_draft(*, kind: str, prompt_text: str, body: str, word_limit: int, school_name: str,
                       record_text: str, record: dict, others: list[dict], trace: Optional[list] = None) -> dict:
    """Read one draft. Returns
      {"status": "ok", "review": {...}}  the review as it is saved (rules.validate_review)
      {"status": "handoff"}              the writing says the student is in danger now
      {"status": "failed"}               the model could not be reached, or nothing usable came back
                                         (an unreadable reply, or one whose every note broke a rule)
    Never raises (a cancellation, which is how the caller's deadline arrives,
    passes through).

    others: the student's other essays as [{"id", "title", "body"}], for the
    overlap check only. record_text must already be without the student's
    name. trace, when a list is passed, collects each attempt's raw reply and
    what the code dropped (for scripts/check_essay.py; the service never
    passes it)."""
    try:
        return await _review(kind, prompt_text, body, word_limit, school_name, record_text, record, others, trace)
    except Exception as exc:
        # The type only: an error raised around a prompt can carry the essay.
        logger.error(f"[essay_review] failed: {type(exc).__name__}")
        return dict(FAILED)


async def _review(kind, prompt_text, body, word_limit, school_name, record_text, record, others,
                  trace: Optional[list]) -> dict:
    body = body[:rules.BODY_MAX] if isinstance(body, str) else ""
    prompt_text = prompt_text if isinstance(prompt_text, str) else ""
    if rules.crisis_now(body):
        logger.info("[essay_review] hand-off before any call")
        return dict(HANDOFF)

    prompt = prompts.review_prompt(kind=kind, prompt_text=prompt_text, body=body, word_limit=word_limit,
                                   school_name=school_name, record_text=record_text, record=record, others=others)
    best: Optional[dict] = None
    correction = ""
    for attempt in range(1, ATTEMPTS + 1):
        try:
            raw = await tool_completion(model=OWL_REVIEW_MODEL, prompt=prompt + correction,
                                        tool=prompts.REVIEW_TOOL, max_tokens=REVIEW_MAX_TOKENS, label="essay_review")
        except ModelUnavailable as exc:
            logger.warning(f"[essay_review] model unavailable on attempt {attempt}: {type(exc).__name__}")
            break
        dropped: list[dict] = []
        # Off the event loop: the checks read the whole draft and every other
        # essay, and the backend has one worker.
        checked = await asyncio.to_thread(
            rules.validate_review, raw, body=body, prompt_text=prompt_text, record=record, others=others,
            kind=kind, word_limit=word_limit, school_name=school_name, dropped=dropped,
        )
        if checked is not None and checked.get("handoff"):
            logger.info("[essay_review] hand-off from the model's flag")
            return dict(HANDOFF)
        notes = raw.get("notes") if isinstance(raw, dict) else None
        offered = len(notes) if isinstance(notes, list) else 0
        kept = len(checked["notes"]) if checked else 0
        reasons = _reasons(dropped)
        logger.info(f"[essay_review] attempt {attempt}: {offered} notes offered, {kept} kept, "
                    f"{len(checked['cuts']) if checked else 0} cuts, dropped: {dict(reasons)}"
                    + ("" if checked else " (unusable reply)"))
        if trace is not None:
            trace.append({"attempt": attempt, "raw": raw, "dropped": dropped, "kept": kept,
                          "usable": checked is not None})
        # A reply whose every note was thrown away is not a clean review: it
        # saw things and could not say them within the rules, so it is never
        # shown as "nothing to flag". Of the rest, the one that kept more
        # notes wins, and the retry (which was told what went wrong) a tie.
        emptied = offered > 0 and kept == 0
        if checked is not None and not emptied and (best is None or kept >= len(best["notes"])):
            best = checked
        if not needs_retry(checked, offered, dropped):
            break
        correction = prompts.correction(dict(reasons), unreadable=checked is None)

    if best is None:
        return dict(FAILED)
    return {"status": "ok", "review": best}
