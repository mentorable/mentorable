"""
The cost ledger: what every paid call cost, per student and per feature.

Every model call, web search and voice call reports here with what it
consumed. This module prices it at list price, logs one line, and writes a row
to public.llm_usage in the background (numbers only, never text). The views
student_cost_month and feature_cost_day add them up. Until this existed every
cost figure for the product was an estimate.

Recording never raises and never waits on the database: a lost row costs a
number in a report, never a student's reply.

Who the call was for comes from a context variable set by verify_jwt
(app/auth.py), so call sites do not pass it around. asyncio copies context
into tasks and to_thread, so background work started inside a request (a
spawned memory save, an agent's SSE job) is still charged to that student.
Work with no student (the counselors' digest) is recorded with no user.

Prices live here and only here, in PRICES. A model missing from it is still
recorded (tokens are known) with cost NULL and a warning, so a model swap in
app/models.py shows up as "unpriced_calls" in the views rather than as a
silent hole.
"""
from __future__ import annotations

import asyncio
import contextvars
import logging
import threading
from typing import Any, Optional

from app.db.supabase import get_supabase

logger = logging.getLogger(__name__)

current_user: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar("current_user", default=None)

# Per million tokens: (input, output, cache write, cache read). Anthropic's
# cache write is the 5-minute one (1.25x input). OpenAI has no write premium;
# its cached input is the fourth number. Official pages, checked 2026-11-17.
PRICES: dict[str, tuple[float, float, float, float]] = {
    "claude-sonnet-5":           (2.00, 10.00, 2.50, 0.20),
    "claude-sonnet-5-5":         (2.00, 10.00, 2.50, 0.10),
    "claude-haiku-4-5-20251001": (1.00, 5.00, 1.25, 0.10),
    "claude-haiku-4-5":          (1.00, 5.00, 1.25, 0.10),
    "claude-haiku-5-5":          (0.10, 0.50, 0.125, 0.01),
    "gpt-5-mini":                (0.25, 2.00, 0.25, 0.025),
    "gpt-5-nano":                (0.05, 0.40, 0.05, 0.005),
    "text-embedding-3-small":    (0.02, 0.0, 0.02, 0.02),
}

# Per unit: one search, or one second of a voice call.
UNIT_PRICES: dict[str, float] = {
    "anthropic_web_search": 0.01,      # $10 per 1,000, on top of the tokens
    "tavily":               0.008,     # pay-as-you-go basic search
    "brave":                0.005,     # $5 per 1,000
    "elevenlabs_voice":     0.08 / 60, # $0.08 a minute, the overage rate on every plan
}

_warned: set[str] = set()


def _int(value) -> int:
    try:
        return max(0, int(value or 0))
    except (TypeError, ValueError):
        return 0


def _get(obj: Any, name: str) -> Any:
    return obj.get(name) if isinstance(obj, dict) else getattr(obj, name, None)


def feature_name(label: str) -> str:
    """A stable feature name from a call's label: the first word, at most 80
    characters ("intake_extract <id>" becomes "intake_extract")."""
    first = (str(label or "").split() or ["unknown"])[0]
    return first[:80]


def price(model: str, *, input_tokens: int = 0, output_tokens: int = 0,
          cache_read: int = 0, cache_write: int = 0) -> Optional[float]:
    """List-price dollars for these tokens, or None for a model not in PRICES."""
    p = PRICES.get(model)
    if p is None:
        return None
    inp, out, write, read = p
    return (input_tokens * inp + output_tokens * out + cache_write * write + cache_read * read) / 1_000_000


def note(cost: Optional[float]) -> str:
    """" (about $0.031)" for a log line, or "" when unpriced."""
    return f" (about ${cost:.4f})" if cost is not None else ""


# ── Recording ───────────────────────────────────────────────────────────────

def record_anthropic(label: str, model: str, usage: Any, *, searches: Optional[int] = None,
                     user_id: Optional[str] = None) -> Optional[float]:
    """One Anthropic reply's usage. Returns its cost (None when unpriced).
    `usage` is the SDK's usage object or a dict; `searches` overrides the web
    search count the usage reports."""
    if usage is None:
        return None
    inp = _int(_get(usage, "input_tokens"))
    out = _int(_get(usage, "output_tokens"))
    write = _int(_get(usage, "cache_creation_input_tokens"))
    read = _int(_get(usage, "cache_read_input_tokens"))
    if searches is None:
        stu = _get(usage, "server_tool_use")
        searches = _int(_get(stu, "web_search_requests")) if stu is not None else 0
    cost = price(model, input_tokens=inp, output_tokens=out, cache_read=read, cache_write=write)
    if cost is not None and searches:
        cost += searches * UNIT_PRICES["anthropic_web_search"]
    _record(label, "anthropic", model, inp, out, read, write, searches, cost, user_id)
    return cost


def record_openai(label: str, model: str, usage: Any, *, user_id: Optional[str] = None) -> Optional[float]:
    """One OpenAI chat completion's usage. prompt_tokens includes the cached
    ones; completion_tokens includes the invisible reasoning ones."""
    if usage is None:
        return None
    prompt = _int(_get(usage, "prompt_tokens"))
    details = _get(usage, "prompt_tokens_details")
    cached = min(prompt, _int(_get(details, "cached_tokens")) if details is not None else 0)
    out = _int(_get(usage, "completion_tokens"))
    cost = price(model, input_tokens=prompt - cached, output_tokens=out, cache_read=cached)
    _record(label, "openai", model, prompt - cached, out, cached, 0, 0, cost, user_id)
    return cost


def record_embedding(label: str, model: str, tokens: int, *, user_id: Optional[str] = None) -> Optional[float]:
    cost = price(model, input_tokens=_int(tokens))
    _record(label, "openai", model, _int(tokens), 0, 0, 0, 0, cost, user_id)
    return cost


def record_units(label: str, kind: str, units: int, *, user_id: Optional[str] = None) -> Optional[float]:
    """Searches (kind "tavily", "brave") or voice seconds ("elevenlabs_voice")."""
    n = _int(units)
    each = UNIT_PRICES.get(kind)
    cost = n * each if each is not None else None
    provider = kind.split("_")[0]
    _record(label, provider, kind, 0, 0, 0, 0, n, cost, user_id)
    return cost


def _record(label, provider, model, inp, out, read, write, units, cost, user_id) -> None:
    try:
        feature = feature_name(label)
        uid = user_id or current_user.get()
        if cost is None and model not in _warned:
            _warned.add(model)
            logger.warning(f"[cost] no price for {model}; recorded with no cost (add it to app/costs.py PRICES)")
        cache = f", cache {read} read / {write} written" if (read or write) else ""
        extra = f", {units} units" if units else ""
        logger.info(f"[cost] {feature} via {model}: {inp} in / {out} out{cache}{extra}{note(cost)}")
        row = {
            "user_id": uid, "feature": feature, "provider": str(provider)[:40], "model": str(model)[:80],
            "input_tokens": inp, "output_tokens": out, "cache_read_tokens": read, "cache_write_tokens": write,
            "units": units, "cost_usd": round(cost, 6) if cost is not None else None,
        }
        _queue(row)
    except Exception as exc:  # never let bookkeeping break the call it describes
        logger.warning(f"[cost] could not record a call: {type(exc).__name__}")


def _insert(row: dict) -> None:
    try:
        get_supabase().table("llm_usage").insert(row).execute()
    except Exception as exc:
        logger.warning(f"[cost] ledger write failed: {type(exc).__name__}")


def _queue(row: dict) -> None:
    """Write the row off the request's path: on a worker thread when there is
    an event loop, on a short-lived thread when there is not."""
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        threading.Thread(target=_insert, args=(row,), daemon=True).start()
        return
    loop.run_in_executor(None, _insert, row)
