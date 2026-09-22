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


# The GPT-5 family are reasoning models: invisible reasoning tokens come out of
# the same max_completion_tokens budget as the visible reply, and are billed as
# output. A budget sized for the answer alone gets spent entirely on reasoning
# and returns finish_reason="length" with empty content, which is exactly what a
# 512-token cap did to chat_signals in production.
#
# The cap is a ceiling, not a spend, so being generous costs nothing unless the
# tokens are actually used. OpenAI suggests reserving far more than this while
# experimenting; this floor is sized for short extraction replies plus room to
# think, and the usage logging below tells us what is really being consumed.
MIN_COMPLETION_BUDGET = 8192

# These jobs are mechanical extraction, not analysis, so buy as little reasoning
# as the model will sell. "none" is deliberately not used: it is reported to be
# ignored when combined with max_completion_tokens, which puts us back in the
# empty-reply failure. A model that rejects this value is retried without it.
REASONING_EFFORT = "low"


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


def _rejects_param(exc: Exception, param: str) -> bool:
    """True when the API refused the request because of that parameter."""
    text = str(exc).lower()
    return param.lower() in text and any(
        s in text for s in ("unsupported", "invalid", "unrecognized", "not supported", "does not support")
    )


def _log_usage(schema_name: str, model: str, resp) -> None:
    """Record what the call actually consumed.

    Reasoning tokens are invisible in the reply but billed as output, so without
    this the real cost of a call is unknowable from the outside. This is the one
    number that says whether routing a job to a reasoning model actually saved
    anything.
    """
    try:
        u = resp.usage
        details = getattr(u, "completion_tokens_details", None)
        reasoning = getattr(details, "reasoning_tokens", None) if details else None
        visible = u.completion_tokens - (reasoning or 0)
        logger.info(
            f"[llm] {schema_name} via {model}: in={u.prompt_tokens} "
            f"out={u.completion_tokens} (visible={visible}, reasoning={reasoning if reasoning is not None else 'n/a'})"
        )
    except Exception:
        pass


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
        budget = max(max_tokens, MIN_COMPLETION_BUDGET)
        params = {
            "model": openai_model,
            "messages": [{"role": "user", "content": prompt}],
            # The newer parameter name; `max_tokens` is rejected by this family.
            "max_completion_tokens": budget,
            "response_format": {
                "type": "json_schema",
                "json_schema": {"name": schema_name, "schema": schema, "strict": True},
            },
        }
        for attempt, effort in enumerate((REASONING_EFFORT, None)):
            call = dict(params)
            if effort:
                call["reasoning_effort"] = effort
            try:
                resp = await _openai.chat.completions.create(**call)
            except Exception as exc:
                # A model that does not accept this value should not cost us the
                # whole provider, so drop the parameter and try once more.
                if effort and _rejects_param(exc, "reasoning_effort"):
                    logger.info(f"[llm] {schema_name}: {openai_model} rejected reasoning_effort, retrying without")
                    continue
                logger.warning(f"[llm] {schema_name}: OpenAI call failed, falling back to Anthropic: {exc}")
                break

            _log_usage(schema_name, openai_model, resp)
            choice = resp.choices[0]
            content = choice.message.content
            if content:
                try:
                    return json.loads(content)
                except Exception as exc:
                    logger.warning(f"[llm] {schema_name}: OpenAI returned unparseable JSON: {exc}")
                    break
            if choice.finish_reason == "length":
                logger.warning(
                    f"[llm] {schema_name}: {openai_model} spent its whole {budget} token budget "
                    f"without producing output. Raise MIN_COMPLETION_BUDGET or lower REASONING_EFFORT."
                )
            else:
                logger.warning(f"[llm] {schema_name}: empty OpenAI reply ({choice.finish_reason}), falling back")
            break

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
