"""
Opening a student's own Google Doc so their draft can come into Quill.

Only a Google Docs document link is accepted (docs.google.com/document/d/<id>),
and only Google's plain-text export of it is fetched, so this can never be
pointed at any other address. The doc must be shared as "anyone with the link
can view": a private doc answers with Google's sign-in page, which is said
plainly rather than read.

The text is handed straight back to the student's page, which puts it in the
editor only when the student presses to. Nothing here is stored or logged:
log lines carry the outcome and a size, never the link, the title or the text.
(A Word file never reaches the server at all: the page reads it in the browser.)
"""
from __future__ import annotations

import logging
import re
import time
from collections import defaultdict, deque
from typing import Optional
from urllib.parse import unquote, urlsplit

import httpx

from app.nodes.agents.outreach.service import AgentError

logger = logging.getLogger(__name__)


class _HideDocLinks(logging.Filter):
    """httpx logs every request's URL at INFO, and a doc link shared "with
    anyone with the link" is as good as the doc. Drop those lines."""

    def filter(self, record: logging.LogRecord) -> bool:
        try:
            text = record.getMessage()
        except Exception:
            return True
        return "/document/d/" not in text and "googleusercontent.com" not in text


logging.getLogger("httpx").addFilter(_HideDocLinks())

MAX_BYTES = 400_000              # far past any college essay; a bigger file is not one
MAX_CHARS = 60_000
TIMEOUT = 15.0
DOC_ID = re.compile(r"^/document/(?:u/\d+/)?d/([A-Za-z0-9_-]{20,80})(?:/|$)")
EXPORT = "https://docs.google.com/document/d/{id}/export?format=txt"
# Where Google's export may redirect to on its way to the file.
GOOGLE_HOSTS = ("docs.google.com", "doc-0s-docs.googleusercontent.com")

BAD_LINK = "That isn't a Google Docs link. Open the doc and copy the address from the top of the browser."
NOT_SHARED = ("Quill couldn't open that doc because it's private. In Google Docs, press Share, set General access "
              "to \"Anyone with the link\", then try again. You can set it back afterwards.")
TOO_BIG = "That doc is far longer than an essay, so Quill didn't open it. Copy the essay into its own doc."
COULD_NOT_OPEN = "Google didn't answer just now. Try again in a minute."
EMPTY = "That doc is empty."
SLOW_DOWN = "That's a lot of docs in a short time. Wait a few minutes, then try again."

# Opening a doc costs nothing, but it is still a fetch the server makes on a
# student's word, so a student gets a handful an hour (kept in memory: a
# restart forgets it, which is fine for a courtesy limit).
PER_HOUR = 20
_opened: dict[str, deque] = defaultdict(deque)


def _allow(user_id: str) -> bool:
    now = time.monotonic()
    seen = _opened[user_id]
    while seen and now - seen[0] > 3600:
        seen.popleft()
    if len(seen) >= PER_HOUR:
        return False
    seen.append(now)
    return True


def doc_id(link) -> Optional[str]:
    if not isinstance(link, str):
        return None
    link = link.strip()
    if not link.startswith(("https://", "http://")):
        link = "https://" + link
    try:
        parts = urlsplit(link)
    except ValueError:
        return None
    if (parts.hostname or "").lower() != "docs.google.com":
        return None
    match = DOC_ID.match(parts.path)
    return match.group(1) if match else None


def _allowed(url: httpx.URL) -> bool:
    host = (url.host or "").lower()
    return url.scheme == "https" and (host in GOOGLE_HOSTS or host.endswith(".googleusercontent.com"))


def _title(disposition: str) -> str:
    """The doc's name, from the export's Content-Disposition filename."""
    star = re.search(r"filename\*=UTF-8''([^;]+)", disposition or "", re.I)
    plain = re.search(r'filename="([^"]+)"', disposition or "", re.I)
    name = unquote(star.group(1)) if star else (plain.group(1) if plain else "")
    name = re.sub(r"\.txt$", "", name.strip(), flags=re.I)
    return name[:200]


def clean(text: str) -> str:
    text = text.lstrip("﻿").replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()[:MAX_CHARS]


async def open_google_doc(user_id: str, body: dict) -> dict:
    found = doc_id((body or {}).get("url"))
    if not found:
        raise AgentError(400, "bad_link", BAD_LINK)
    if not _allow(user_id):
        raise AgentError(429, "slow_down", SLOW_DOWN)
    url = httpx.URL(EXPORT.format(id=found))
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=False) as client:
            for _ in range(5):                          # follow Google's own redirects, and only those
                resp = await client.get(url)
                if resp.is_redirect:
                    nxt = resp.next_request.url if resp.next_request else None
                    if nxt is None or not _allowed(nxt):
                        logger.info("[essay_import] the doc is private")
                        raise AgentError(403, "not_shared", NOT_SHARED)
                    url = nxt
                    continue
                break
            else:
                raise AgentError(502, "could_not_open", COULD_NOT_OPEN)
    except httpx.HTTPError as exc:
        logger.warning(f"[essay_import] Google did not answer: {type(exc).__name__}")
        raise AgentError(502, "could_not_open", COULD_NOT_OPEN)
    if resp.status_code in (401, 403, 404):
        raise AgentError(403, "not_shared", NOT_SHARED)
    if resp.status_code != 200:
        raise AgentError(502, "could_not_open", COULD_NOT_OPEN)
    if "text/plain" not in resp.headers.get("content-type", ""):
        raise AgentError(403, "not_shared", NOT_SHARED)       # a sign-in page, not the doc
    if len(resp.content) > MAX_BYTES:
        raise AgentError(413, "too_big", TOO_BIG)
    text = clean(resp.content.decode("utf-8", errors="replace"))
    if not text:
        raise AgentError(422, "empty", EMPTY)
    logger.info(f"[essay_import] opened a doc for {user_id}: {len(text)} chars")
    return {"source": "google", "title": _title(resp.headers.get("content-disposition", "")),
            "url": f"https://docs.google.com/document/d/{found}/edit", "text": text}
