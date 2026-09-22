"""
Provider routing for structured-output calls.

json_completion() is the one path every JSON-returning extraction goes through.
It prefers OpenAI, whose json_schema response format constrains decoding so the
model cannot emit anything but conforming JSON, and falls back to Anthropic plus
a permissive parse when OpenAI is unavailable.

The fallback is the point, not an afterthought. It means the service behaves
identically before and after an OPENAI_API_KEY exists, a provider outage costs
latency rather than a student's uploaded resume, and routing a task to a new
model is a one-line change in app/models.py instead of a rewrite here.

Why structured output matters beyond cost: the previous approach asked for JSON
in the prompt and then dug it out with a regex. A model that wrapped its reply
in prose or a markdown fence, or got truncated mid-object, produced a parse
failure that surfaced to the student as lost work. A schema makes that class of
failure impossible on the OpenAI path.
"""
import json
import logging
import re
from typing import Any, Optional

from anthropic import AsyncAnthropic

from app.config import ANTHROPIC_API_KEY, OPENAI_API_KEY

logger = logging.getLogger(__name__)

_anthropic = AsyncAnthropic(api_key=ANTHROPIC_API_KEY)

_openai = None
if OPENAI_API_KEY:
    try:
        from openai import AsyncOpenAI
        _openai = AsyncOpenAI(api_key=OPENAI_API_KEY)
    except Exception as exc:  # SDK missing or client construction failed
        logger.warning(f"[llm] OpenAI client unavailable, falling back to Anthropic: {exc}")


def openai_enabled() -> bool:
    return _openai is not None


def parse_json_loose(text: str) -> Optional[Any]:
    """Direct parse, then the first {...} or [...] in the text.

    Only the Anthropic path needs this: a schema-constrained OpenAI reply is
    always valid JSON already.
    """
    if not text:
        return None
    candidates = [text]
    for pattern in (r"\{[\s\S]*\}", r"\[[\s\S]*\]"):
        m = re.search(pattern, text)
        if m:
            candidates.append(m.group(0))
    for c in candidates:
        try:
            return json.loads(c)
        except Exception:
            continue
    return None


async def json_completion(
    *,
    prompt: str,
    schema: dict,
    schema_name: str,
    openai_model: str,
    anthropic_model: str,
    max_tokens: int,
) -> Optional[Any]:
    """Run one structured-output call. Returns the parsed object, or None.

    `schema` must satisfy OpenAI's strict mode: a top-level object, every
    property listed in `required`, and additionalProperties false. Wrap a list
    in an object with one array property rather than returning a bare array.
    """
    if _openai is not None:
        try:
            resp = await _openai.chat.completions.create(
                model=openai_model,
                messages=[{"role": "user", "content": prompt}],
                # The newer parameter name. `max_tokens` is rejected by the
                # GPT-5 family, so a wrong guess here surfaces as an exception
                # and the Anthropic fallback below picks the call up.
                max_completion_tokens=max_tokens,
                response_format={
                    "type": "json_schema",
                    "json_schema": {"name": schema_name, "schema": schema, "strict": True},
                },
            )
            choice = resp.choices[0]
            if choice.finish_reason == "length":
                logger.warning(f"[llm] {schema_name}: OpenAI reply hit the token cap")
            content = choice.message.content
            if content:
                return json.loads(content)
            logger.warning(f"[llm] {schema_name}: empty OpenAI reply, falling back")
        except Exception as exc:
            logger.warning(f"[llm] {schema_name}: OpenAI call failed, falling back to Anthropic: {exc}")

    try:
        msg = await _anthropic.messages.create(
            model=anthropic_model,
            max_tokens=max_tokens,
            messages=[{"role": "user", "content": prompt}],
        )
        if getattr(msg, "stop_reason", None) == "max_tokens":
            logger.warning(f"[llm] {schema_name}: Anthropic reply truncated at max_tokens")
        raw = msg.content[0].text if msg.content else ""
        parsed = parse_json_loose(raw)
        if parsed is None:
            logger.warning(f"[llm] {schema_name}: could not parse Anthropic reply: {raw[:200]!r}")
        return parsed
    except Exception as exc:
        logger.error(f"[llm] {schema_name}: Anthropic call failed: {exc}")
        return None
