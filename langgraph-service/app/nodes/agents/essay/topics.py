"""
Areas to write about, found in the student's record.

Quill reads the record (activities, awards, courses, majors, and from the
interview the through-line and the student's own phrases) and points to three
to five parts of their life it suggests, each with the record items that point
there and two or three open questions to think about. An area is a place to
look, never a topic handed over: no thesis, no scene, no arc, no opening.

One Haiku call. rules.validate_areas then checks every area in code: the
evidence must be real items of the record, and its text is written by code
from the row, so nothing a student reads as "from your record" is the model's
wording. The record is never logged; log lines carry counts and reasons.
"""
import asyncio
import logging
from collections import Counter
from typing import Optional

from app.llm import ModelUnavailable, tool_completion
from app.models import OWL_TOPICS_MODEL
from app.nodes.agents.essay import prompts, rules

logger = logging.getLogger(__name__)

AREAS_MAX_TOKENS = 1500


async def find_areas(*, record_text: str, record: dict, existing_areas: list[str], name: str = "",
                     trace: Optional[list] = None) -> Optional[list[dict]]:
    """0 to 5 areas, each {"area": str, "evidence": [{"kind", "text"}],
    "questions": [str]}, or None.

    None means the model could not be reached or gave nothing usable (the
    caller gives the student's search back). An empty list means it was read
    and has nothing new: the model found no area, or only ones already on the
    board. Never raises.

    record_text must already be without the student's name. name is that
    name, passed only so the prompt can leave it out of the interview's notes
    too (prompts.areas_prompt); the checks and the evidence a student reads
    use the record as it stands. existing_areas: the areas on their board, so
    none comes back. trace, when a list is passed, collects the raw reply and
    what the code dropped (for scripts/check_essay.py; the service never
    passes it)."""
    try:
        return await _find_areas(record_text, record, existing_areas, name, trace)
    except Exception as exc:
        # The type only: an error raised around a prompt can carry the record.
        logger.error(f"[essay_topics] failed: {type(exc).__name__}")
        return None


async def _find_areas(record_text, record, existing_areas, name, trace: Optional[list]) -> Optional[list[dict]]:
    existing = [a for a in (existing_areas if isinstance(existing_areas, list) else []) if isinstance(a, str)]
    prompt = prompts.areas_prompt(record_text=record_text, record=record, existing_areas=existing, name=name)
    try:
        raw = await tool_completion(model=OWL_TOPICS_MODEL, prompt=prompt, tool=prompts.AREAS_TOOL,
                                    max_tokens=AREAS_MAX_TOKENS, label="essay_topics")
    except ModelUnavailable as exc:
        logger.warning(f"[essay_topics] model unavailable: {type(exc).__name__}")
        return None
    offered = raw.get("areas") if isinstance(raw, dict) else None
    if not isinstance(offered, list):
        logger.warning("[essay_topics] no usable reply")
        return None
    dropped: list[dict] = []
    # Off the event loop, like every check that reads text of unknown size.
    areas = await asyncio.to_thread(rules.validate_areas, raw, record, existing, dropped)
    reasons = Counter(d["reason"] for d in dropped)
    logger.info(f"[essay_topics] {len(offered)} offered, {len(areas)} kept, dropped: {dict(reasons)}")
    if trace is not None:
        trace.append({"raw": raw, "dropped": dropped, "kept": len(areas)})
    if areas or not offered:
        return areas
    # Nothing survived. Only "already on the board" is an honest "nothing new";
    # anything else means the reply itself was not usable.
    return [] if all(d["reason"] == "already_on_the_board" for d in dropped) else None
