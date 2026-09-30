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
import asyncio
import inspect
import json
import logging
import re
from typing import Any, Callable, Optional
from urllib.parse import urlparse

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


class ModelUnavailable(Exception):
    """The model could not be reached at all, as opposed to replying badly."""


async def tool_completion(
    *,
    model: str,
    prompt: str,
    tool: dict,
    max_tokens: int,
    label: str,
    system: Optional[str] = None,
) -> Optional[dict]:
    """Force one Anthropic tool call and return its input, or None.

    Asking for JSON in plain text let a model answer a thin input in prose
    ("there isn't enough here to extract") that then failed to parse. Forcing a
    tool call means the reply always arrives as a parsed object. Callers still
    type-check every field: the schema guides the model, it does not bind it.

    Retries transient failures a couple of times, then raises ModelUnavailable
    so the caller can choose between an error and a fallback.
    """
    kwargs = {
        "model": model,
        "max_tokens": max_tokens,
        "tools": [tool],
        "tool_choice": {"type": "tool", "name": tool["name"]},
        "messages": [{"role": "user", "content": prompt}],
    }
    if system:
        kwargs["system"] = system

    last = None
    message = None
    for attempt in range(3):
        try:
            message = await _anthropic.messages.create(**kwargs)
            break
        except Exception as exc:
            last = exc
            if attempt < 2:
                await asyncio.sleep(0.8 * (2 ** attempt))
    if message is None:
        raise ModelUnavailable(str(last)) from last

    if getattr(message, "stop_reason", None) == "max_tokens":
        logger.warning(f"[llm] {label}: tool reply truncated at max_tokens")
    u = getattr(message, "usage", None)
    if u is not None:
        spent = {"in": int(getattr(u, "input_tokens", 0) or 0), "out": int(getattr(u, "output_tokens", 0) or 0)}
        logger.info(f"[llm] {label}: {spent['in']} in / {spent['out']} out tokens{_cost_note(model, spent, 0)}")

    for block in message.content or []:
        if getattr(block, "type", None) == "tool_use" and isinstance(getattr(block, "input", None), dict):
            return block.input
    logger.warning(f"[llm] {label}: no usable tool call in the reply")
    return None


# List prices per million tokens (input, output), for the log line only. Not
# used for any decision; app/models.py stays the source of which model runs.
_PRICE = {"claude-haiku-4-5-20251001": (1.00, 5.00), "claude-sonnet-5": (2.00, 10.00)}


def _cost_note(model: str, spent: dict, searches: int) -> str:
    """" (about $0.031)": tokens at list price plus $0.01 a search."""
    inp, out = _PRICE.get(model, (0.0, 0.0))
    if not (inp or out):
        return ""
    dollars = (spent["in"] * inp + spent["out"] * out) / 1_000_000 + searches * 0.01
    return f" (about ${dollars:.3f})"


async def _notify(on_event, event: dict) -> None:
    if on_event is None:
        return
    try:
        result = on_event(event)
        if inspect.isawaitable(result):
            await result
    except Exception as exc:
        logger.warning(f"[llm] progress callback failed: {exc}")


def _domains(urls: list[str], limit: int = 4) -> list[str]:
    out: list[str] = []
    for url in urls:
        host = (urlparse(url).hostname or "").lower().removeprefix("www.")
        if host and host not in out:
            out.append(host)
        if len(out) == limit:
            break
    return out


def _field(obj: Any, name: str) -> Any:
    """Read a field from an SDK object or a plain dict."""
    return obj.get(name) if isinstance(obj, dict) else getattr(obj, name, None)


async def search_completion(
    *,
    model: str,
    prompt: str,
    submit_tool: dict,
    max_tokens: int,
    label: str,
    max_searches: int = 3,
    blocked_domains: Optional[list[str]] = None,
    on_event: Optional[Callable[[dict], Any]] = None,
) -> tuple[Optional[dict], set[str], dict[str, int]]:
    """Let the model search the web, then submit an answer through a tool.

    Returns (what the model submitted, or None; the set of URLs the searches
    actually returned; {"searches": n, "errors": n} counting the searches the
    model ran and how many came back as errors). The URLs are the point: a model asked to "list some
    links" will invent plausible ones, so callers keep only submitted links
    that appear in that set. Every link that survives is a page the search tool
    really found.

    Each search is billed on top of tokens. A failed search is not. Raises
    ModelUnavailable when the API cannot be reached at all.

    on_event, if given, is called (and awaited when it returns an awaitable)
    for what really happened, in order, as each model turn comes back:
    {"type": "search", "query": str} for each search the model ran, then
    {"type": "results", "count": n, "domains": [...]} or {"type": "search_error"}.
    For progress screens; an exception it raises is logged and ignored.
    """
    search_tool: dict[str, Any] = {"type": "web_search_20250305", "name": "web_search", "max_uses": max_searches}
    if blocked_domains:
        search_tool["blocked_domains"] = blocked_domains

    messages: list[Any] = [{"role": "user", "content": prompt}]
    found: set[str] = set()
    stats = {"searches": 0, "errors": 0}
    spent = {"in": 0, "out": 0}

    for _turn in range(3):
        message = None
        last = None
        for attempt in range(2):
            try:
                message = await _anthropic.messages.create(
                    model=model, max_tokens=max_tokens, tools=[search_tool, submit_tool], messages=messages,
                )
                break
            except Exception as exc:
                last = exc
                if attempt < 1:
                    await asyncio.sleep(0.8)
        if message is None:
            raise ModelUnavailable(str(last)) from last
        u = getattr(message, "usage", None)
        spent["in"] += int(getattr(u, "input_tokens", 0) or 0)
        spent["out"] += int(getattr(u, "output_tokens", 0) or 0)

        for block in message.content or []:
            kind = _field(block, "type")
            if kind == "web_search_tool_result":
                results = _field(block, "content")
                if isinstance(results, list):
                    urls = []
                    for r in results:
                        url = _field(r, "url")
                        if isinstance(url, str):
                            found.add(url)
                            urls.append(url)
                    await _notify(on_event, {"type": "results", "count": len(urls), "domains": _domains(urls)})
                else:                              # a failed search comes back as one error object
                    stats["errors"] += 1
                    await _notify(on_event, {"type": "search_error"})
            elif kind == "server_tool_use":
                stats["searches"] += 1
                query = (_field(block, "input") or {}).get("query") if isinstance(_field(block, "input"), dict) else None
                await _notify(on_event, {"type": "search", "query": query if isinstance(query, str) else ""})
            elif kind == "tool_use" and _field(block, "name") == submit_tool["name"]:
                submitted = _field(block, "input")
                logger.info(f"[llm] {label}: {stats['searches']} search(es), {stats['errors']} error(s), "
                            f"{len(found)} result url(s), {spent['in']} in / {spent['out']} out tokens"
                            f"{_cost_note(model, spent, stats['searches'])}")
                return (submitted if isinstance(submitted, dict) else None), found, stats

        if getattr(message, "stop_reason", None) != "pause_turn":
            break
        # The API paused a long search turn: hand it back unchanged to continue.
        # Appended, so a second pause still carries the first turn's results.
        messages = messages + [{"role": "assistant", "content": message.content}]

    logger.warning(f"[llm] {label}: no submission after {stats['searches']} search(es)")
    return None, found, stats
