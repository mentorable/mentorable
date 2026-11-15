"""
The three calls Poise makes to ElevenLabs, and nothing else.

- signed_url: a one-time URL the browser connects the voice call with. It is
  asked for with include_conversation_id=true, so it carries the id of the
  conversation it will open; service.py stores that id on the mock row before
  the browser ever connects, so the browser never tells us which
  conversation is whose.
- fetch_conversation: the finished conversation, read by the backend itself,
  turned into the stored transcript shape ({"who", "text"}).
- delete_conversation: the conversation removed from ElevenLabs once it has
  been read, so the student's words do not sit on a third party.

No database here. The signed URL is a credential, and a transcript is the
student's own words: neither is ever logged, nor is a message or a prompt.
Log lines carry status codes, counts and an exception's type. The API key
goes in the xi-api-key header, never in a URL.

Every reply is parsed defensively: a field that is missing or of the wrong
type is None (or skipped), never a KeyError, since the shape of a third
party's reply can move under us.
"""
import logging
import os
import re
from typing import Optional
from urllib.parse import parse_qs, quote, urlparse

import httpx

from app.nodes.agents.interview import rules

logger = logging.getLogger(__name__)

API = "https://api.elevenlabs.io"
TIMEOUT = 10.0
CONVERSATION_ID_MAX = 120
# What an ElevenLabs conversation id looks like ("conv_" and letters and
# digits); anything else is never put into a URL path.
_CONVERSATION_ID = re.compile(r"[A-Za-z0-9_-]{1,120}")
_WHO = {"agent": "interviewer", "user": "student"}


class ElevenLabsError(Exception):
    """ElevenLabs could not be reached, or answered with something unusable.
    The message is a short label and a status code, never a URL or content."""


def _api_key() -> str:
    # Quotes pasted around the value in a dashboard would otherwise reach the header.
    return os.environ.get("ELEVENLABS_API_KEY", "").strip().strip("'\"").strip()


def agent_id() -> str:
    """The interview agent's id (ELEVENLABS_INTERVIEW_AGENT_ID), or ""."""
    return os.environ.get("ELEVENLABS_INTERVIEW_AGENT_ID", "").strip().strip("'\"").strip()


def is_configured() -> bool:
    """Both the API key and the interview agent's id are set."""
    return bool(_api_key() and agent_id())


def _headers() -> dict:
    return {"xi-api-key": _api_key(), "Accept": "application/json"}


def _why(resp) -> str:
    """ElevenLabs' own short reason for a refusal ("invalid_api_key",
    "missing_permissions", ...), or "". It names no key and no student, so it
    is safe to log, and it tells a bad key from a bad agent id at a glance."""
    try:
        detail = resp.json().get("detail")
    except Exception:
        return ""
    reason = detail.get("status") if isinstance(detail, dict) else None
    return reason[:60] if isinstance(reason, str) and re.fullmatch(r"[A-Za-z0-9_.-]{1,60}", reason) else ""


def _valid_id(conversation_id) -> bool:
    return isinstance(conversation_id, str) and _CONVERSATION_ID.fullmatch(conversation_id) is not None


async def signed_url() -> dict:
    """{"signed_url": str, "conversation_id": str} for one new call.

    Raises ElevenLabsError when not configured, on a timeout or a network
    failure, on any status but 200, and on a reply whose URL is not a wss://
    URL carrying a conversation_id."""
    if not is_configured():
        raise ElevenLabsError("not configured")
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.get(f"{API}/v1/convai/conversation/get-signed-url",
                                    params={"agent_id": agent_id(), "include_conversation_id": "true"},
                                    headers=_headers())
    except httpx.HTTPError as exc:
        logger.warning(f"[elevenlabs] signed_url failed: {type(exc).__name__}")
        raise ElevenLabsError(f"signed_url {type(exc).__name__}") from None
    if resp.status_code != 200:
        logger.warning(f"[elevenlabs] signed_url status {resp.status_code} {_why(resp)}".rstrip())
        raise ElevenLabsError(f"signed_url status {resp.status_code}")
    try:
        data = resp.json()
    except ValueError:
        raise ElevenLabsError("signed_url unreadable reply") from None
    url = data.get("signed_url") if isinstance(data, dict) else None
    if not isinstance(url, str) or not url.startswith("wss://"):
        raise ElevenLabsError("signed_url no url")
    try:
        found = parse_qs(urlparse(url).query).get("conversation_id") or []
    except ValueError:
        found = []
    conversation_id = found[0] if found else None
    if not _valid_id(conversation_id):
        raise ElevenLabsError("signed_url no conversation_id")
    logger.info(f"[elevenlabs] signed_url issued for conversation {conversation_id}")
    return {"signed_url": url, "conversation_id": conversation_id}


def _int_or_none(value) -> Optional[int]:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value == value and abs(value) < 10 ** 9:
        return int(value)
    return None


def _str_or_none(value) -> Optional[str]:
    return value if isinstance(value, str) and value else None


def _clip(text: str, limit: int) -> str:
    """At most `limit` characters, cut at a word boundary when there is one."""
    if len(text) <= limit:
        return text
    cut = text[:limit]
    space = cut.rfind(" ")
    return cut[:space] if space > limit // 2 else cut


def _turns(transcript) -> list[dict]:
    """ElevenLabs' transcript as the stored shape: role agent is the
    interviewer, user is the student; a tool call or an empty message is
    skipped. Two lines in a row from the same speaker (the speech-to-text
    splits a long answer, or the agent speaks twice) become one turn, so a
    question and its answer sit next to each other. Capped at
    rules.TURNS_MAX turns of rules.TURN_CHARS_MAX characters."""
    turns: list[dict] = []
    if not isinstance(transcript, list):
        return turns
    for item in transcript[:rules.TURNS_MAX * 5]:
        if not isinstance(item, dict):
            continue
        who = _WHO.get(item.get("role"))
        message = item.get("message")
        if who is None or not isinstance(message, str):
            continue
        text = " ".join(message[:rules.TURN_CHARS_MAX * 2].split())
        if not text:
            continue
        if turns and turns[-1]["who"] == who:
            turns[-1]["text"] = _clip(turns[-1]["text"] + " " + text, rules.TURN_CHARS_MAX)
            continue
        if len(turns) >= rules.TURNS_MAX:
            break
        turns.append({"who": who, "text": _clip(text, rules.TURN_CHARS_MAX)})
    return turns


def parse_conversation(data) -> dict:
    """A conversation reply as {"agent_id", "status", "duration_s",
    "mock_id", "turns"}. Pure, and safe on any shape: a missing field is None
    (turns: [])."""
    data = data if isinstance(data, dict) else {}
    metadata = data.get("metadata") if isinstance(data.get("metadata"), dict) else {}
    client_data = data.get("conversation_initiation_client_data")
    client_data = client_data if isinstance(client_data, dict) else {}
    variables = client_data.get("dynamic_variables")
    variables = variables if isinstance(variables, dict) else {}
    duration = _int_or_none(metadata.get("call_duration_secs"))
    return {
        "agent_id": _str_or_none(data.get("agent_id")),
        "status": _str_or_none(data.get("status")),
        "duration_s": duration if duration is None or duration >= 0 else None,
        "mock_id": _str_or_none(variables.get("mock_id")),
        "turns": _turns(data.get("transcript")),
    }


async def fetch_conversation(conversation_id: str) -> Optional[dict]:
    """The conversation, parsed (parse_conversation), or None when ElevenLabs
    has none by that id (404: the browser never connected, or it was already
    deleted). Any other failure raises ElevenLabsError."""
    if not _api_key():
        raise ElevenLabsError("not configured")
    if not _valid_id(conversation_id):
        raise ElevenLabsError("bad conversation id")
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.get(f"{API}/v1/convai/conversations/{quote(conversation_id, safe='')}",
                                    headers=_headers())
    except httpx.HTTPError as exc:
        logger.warning(f"[elevenlabs] fetch failed: {type(exc).__name__}")
        raise ElevenLabsError(f"fetch {type(exc).__name__}") from None
    if resp.status_code == 404:
        logger.info(f"[elevenlabs] no conversation {conversation_id}")
        return None
    if resp.status_code != 200:
        logger.warning(f"[elevenlabs] fetch status {resp.status_code} {_why(resp)}".rstrip())
        raise ElevenLabsError(f"fetch status {resp.status_code}")
    try:
        data = resp.json()
    except ValueError:
        raise ElevenLabsError("fetch unreadable reply") from None
    parsed = parse_conversation(data)
    logger.info(f"[elevenlabs] fetched {conversation_id}: status {parsed['status']}, "
                f"{len(parsed['turns'])} turns, {parsed['duration_s']} s")
    return parsed


async def delete_conversation(conversation_id: str) -> bool:
    """Remove the conversation from ElevenLabs. True on a 2xx or a 404 (it is
    gone either way); False on anything else. Never raises."""
    try:
        if not _api_key() or not _valid_id(conversation_id):
            return False
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.delete(f"{API}/v1/convai/conversations/{quote(conversation_id, safe='')}",
                                       headers=_headers())
        ok = 200 <= resp.status_code < 300 or resp.status_code == 404
        if not ok:
            logger.warning(f"[elevenlabs] delete status {resp.status_code}")
        return ok
    except Exception as exc:
        logger.warning(f"[elevenlabs] delete failed: {type(exc).__name__}")
        return False
