"""
The agent's screen: what an agent actually looked at, streamed so the student
can watch it work, the way a person watches someone else's browser.

Every event is a record of something that happened, never a dramatisation:
  search    a query that ran and the results it really returned
  page      a page that was opened, with its real title, address and the start
            of the text that was read (or that it would not open)
  notes     the facts that survived the checks, each with the page it came from
  compose   a draft email, once it is written (it lands on the review page too)

Shape (one SSE event, beside the checklist's "progress" ones):
  {"type": "screen", "id": "search-1", "kind": "search", "status": "active" | "done" | "failed", ...}
The same id updates one tab in place, as a checklist line does.

Only public web text and the student's own draft go out here, to the student's
own page. Nothing is logged. A broken stream never stops the work.
"""
from __future__ import annotations

import logging
from typing import Awaitable, Callable, Optional
from urllib.parse import urlsplit

from app.nodes.quest.common import clean_text

logger = logging.getLogger(__name__)

Emit = Callable[[dict], Awaitable[None]]

RESULTS_SHOWN = 6
TITLE_CHARS = 120
SNIPPET_CHARS = 220
EXCERPT_CHARS = 900
QUERY_CHARS = 160
NOTE_CHARS = 240
BODY_CHARS = 4000
STATUSES = ("active", "done", "failed")


def domain(url) -> str:
    try:
        host = urlsplit(url).hostname or ""
    except ValueError:
        return ""
    return host[4:] if host.startswith("www.") else host


def _safe_url(url) -> str:
    """Only http(s) addresses reach the page, so a link there can never run script."""
    if not isinstance(url, str):
        return ""
    url = url.strip()[:2000]
    return url if urlsplit(url).scheme in ("http", "https") else ""


def results(found) -> list[dict]:
    out = []
    for r in found or []:
        if not isinstance(r, dict):
            continue
        url = _safe_url(r.get("url"))
        if not url:
            continue
        out.append({"title": clean_text(r.get("title") or "", TITLE_CHARS) or domain(url), "url": url,
                    "domain": domain(url), "snippet": clean_text(r.get("snippet") or r.get("content") or "", SNIPPET_CHARS)})
        if len(out) >= RESULTS_SHOWN:
            break
    return out


async def show(emit: Optional[Emit], shot_id: str, kind: str, status: str = "done", **fields) -> None:
    """Send one screen event. Never raises."""
    if emit is None:
        return
    event = {"type": "screen", "id": str(shot_id), "kind": kind,
             "status": status if status in STATUSES else "done", **fields}
    try:
        await emit(event)
    except Exception as exc:
        logger.warning(f"[screen] event failed: {type(exc).__name__}")


async def search(emit, shot_id: str, query: str, found=None, *, status: str = "active") -> None:
    await show(emit, shot_id, "search", status, query=clean_text(query or "", QUERY_CHARS),
               results=results(found) if found is not None else [])


async def page(emit, shot_id: str, url: str, *, title: str = "", text: str = "", status: str = "active") -> None:
    url = _safe_url(url)
    if not url:
        return
    await show(emit, shot_id, "page", status, url=url, domain=domain(url),
               title=clean_text(title or "", TITLE_CHARS), excerpt=clean_text(text or "", EXCERPT_CHARS))


async def notes(emit, shot_id: str, facts, *, title: str = "What checked out") -> None:
    kept = []
    for f in facts or []:
        if not isinstance(f, dict):
            continue
        text = clean_text(f.get("text") or "", NOTE_CHARS)
        url = _safe_url(f.get("url"))
        if text:
            kept.append({"text": text, "url": url, "domain": domain(url)})
    if kept:
        await show(emit, shot_id, "notes", "done", title=clean_text(title, 60), notes=kept[:8])


async def compose(emit, shot_id: str, *, to: str = "", subject: str = "", body: str = "", status: str = "done") -> None:
    await show(emit, shot_id, "compose", status, to=clean_text(to or "", 160), subject=clean_text(subject or "", 200),
               body=(body or "")[:BODY_CHARS])
