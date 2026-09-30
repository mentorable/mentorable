"""
Gmail sending for the agents: a student connects their Gmail once, and Beaker
sends the emails they approve from their own address.

The permission asked for is gmail.send only (plus openid and email, to show
which address is connected). Mentorable can send as the student and cannot
read a single email. Google's refresh token is encrypted with Fernet
(GMAIL_TOKEN_KEY) before it is stored in google_connections, which only the
service role can read. No token is ever logged, and none leaves this module
except the short-lived access token the send itself uses.

The OAuth state is a Fernet token too, under a key derived from the same one
(so a state can never be mistaken for a stored token): the student's id, where
to send them back, and a nonce. It expires after ten minutes, and without the
key it can be neither read nor forged.

Failures come out as GoogleError, whose code the router turns into plain copy:
  not_configured   the client id, the secret or the token key is missing or unusable
  reconnect        the saved permission no longer works (revoked, expired, removed,
                   or unreadable under the current key): connect again
  scope_missing    the student unticked "send email on your behalf"
  send_failed      Google refused or did not answer (maybe_sent says whether the
                   email could have gone out anyway: a lost answer, a 408 or a
                   5xx, since Gmail may have taken it before failing to say so)
  state_invalid    the connect link was changed, is over ten minutes old, or was
                   made under another key
  exchange_failed  Google would not turn the code into a working connection

The Supabase client is sync, so the async functions here read and write it
through asyncio.to_thread; save_connection and connection are sync and async
callers wrap them the same way.
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import logging
import re
import secrets
import time
from datetime import datetime, timezone
from email.headerregistry import Address
from email.message import EmailMessage
from email.policy import SMTP
from email.utils import format_datetime, make_msgid
from typing import Optional
from urllib.parse import quote, urlencode, urlsplit, urlunsplit

import httpx
from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from app import config
from app.db.supabase import get_supabase

logger = logging.getLogger(__name__)

GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send"
SCOPES = "openid email " + GMAIL_SEND_SCOPE

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"
REVOKE_URL = "https://oauth2.googleapis.com/revoke"

CALLBACK_PATH = "/agents/google/connect/callback"
DEFAULT_RETURN_TO = "/agents/outreach"
STATE_MAX_AGE = 600
HTTP_TIMEOUT = httpx.Timeout(10.0, connect=5.0)
# An access token is reused until this many seconds before Google says it expires.
TOKEN_MARGIN = 120

MESSAGES = {
    "not_configured": "Sending with Gmail is not set up yet. You can still copy the email or open it in your mail app.",
    "reconnect": "Your Gmail connection stopped working. Connect Gmail again to send.",
    "scope_missing": "Google did not give permission to send email. Connect again and leave the send box ticked.",
    "send_failed": "Gmail did not send the email. Try again in a minute.",
    "send_unconfirmed": "Gmail did not confirm the email. Check your Sent folder before trying again.",
    "state_invalid": "That Gmail link expired. Start connecting again from the app.",
    "exchange_failed": "Google did not finish connecting your Gmail. Try again.",
    "expired": "That Gmail connection took too long to finish. Connect again.",
    "wrong_account": ("That Gmail connection was started from a different Mentorable account, so it was not saved. "
                      "Connect Gmail again from your own account."),
}


class GoogleError(Exception):
    """An expected failure. code is one of MESSAGES' keys; message is fit to show."""

    code: str

    def __init__(self, code: str, message: str = "", *, maybe_sent: bool = False):
        self.code = code
        self.message = message or MESSAGES.get(code, "Something went wrong with Gmail. Try again.")
        # True only when a send request reached Google and the answer was lost:
        # the email may have gone out.
        self.maybe_sent = maybe_sent
        super().__init__(self.message)


# ── Small helpers ─────────────────────────────────────────────────────────────

def _sb():
    return get_supabase()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _http() -> httpx.AsyncClient:
    """A fresh client per call, never following redirects. Tests swap this for
    one on a mock transport."""
    return httpx.AsyncClient(timeout=HTTP_TIMEOUT, follow_redirects=False)


def _int(value, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _google_error(res: httpx.Response) -> str:
    """Google's short error code, safe to log ("invalid_grant", "PERMISSION_DENIED")."""
    try:
        data = res.json()
    except ValueError:
        return ""
    err = data.get("error") if isinstance(data, dict) else None
    if isinstance(err, dict):  # the Gmail API's shape: {"error": {"code", "message", "status", "errors"}}
        return str(err.get("status") or "")[:60]
    return str(err or "")[:60]


def _gmail_reasons(res: httpx.Response) -> set[str]:
    try:
        err = res.json().get("error")
    except (ValueError, AttributeError):
        return set()
    if not isinstance(err, dict):
        return set()
    return {str(e.get("reason")) for e in err.get("errors") or [] if isinstance(e, dict)}


# ── Keys ──────────────────────────────────────────────────────────────────────

def _key() -> Optional[str]:
    """GMAIL_TOKEN_KEY when it is a usable Fernet key, else None."""
    key = str(config.GMAIL_TOKEN_KEY or "").strip()
    if not key:
        return None
    try:
        Fernet(key)
    except Exception:
        return None
    return key


def _token_fernet() -> Fernet:
    key = _key()
    if key is None:
        raise GoogleError("not_configured")
    return Fernet(key)


def _state_fernet() -> Fernet:
    """A separate key for OAuth states, derived from GMAIL_TOKEN_KEY."""
    key = _key()
    if key is None:
        raise GoogleError("not_configured")
    derived = HKDF(algorithm=hashes.SHA256(), length=32, salt=None,
                   info=b"mentorable google oauth state").derive(base64.urlsafe_b64decode(key))
    return Fernet(base64.urlsafe_b64encode(derived))


def is_configured() -> bool:
    """Client id, secret and a valid Fernet GMAIL_TOKEN_KEY. The redirect URI
    is optional: without it one is built from the request."""
    return bool(str(config.GOOGLE_OAUTH_CLIENT_ID or "").strip()
                and str(config.GOOGLE_OAUTH_CLIENT_SECRET or "").strip()
                and _key() is not None)


# ── The connect flow ──────────────────────────────────────────────────────────

_LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}


def redirect_uri(base_url: str) -> str:
    """GOOGLE_OAUTH_REDIRECT_URI when set (it must match the one registered on
    the OAuth client), else this service's callback under base_url. https is
    forced unless the host is local: Render ends TLS in front of the app, so
    the request itself says http."""
    fixed = str(config.GOOGLE_OAUTH_REDIRECT_URI or "").strip()
    if fixed:
        return fixed
    parts = urlsplit(str(base_url or "").strip())
    host = (parts.hostname or "").lower()
    local = host in _LOCAL_HOSTS or host.endswith(".localhost")
    scheme = parts.scheme if local and parts.scheme in ("http", "https") else "https"
    return urlunsplit((scheme, parts.netloc, parts.path.rstrip("/") + CALLBACK_PATH, "", ""))


_RETURN_SEGMENT = re.compile(r"[A-Za-z0-9._~-]+")


def safe_return_to(value) -> str:
    """Where the callback may send the student back: a path in the Agents area,
    and nothing else (no scheme, host, query, "//", backslash or line break).
    Anything else becomes the default."""
    if not isinstance(value, str) or len(value) > 200:
        return DEFAULT_RETURN_TO
    if value == "/agents":
        return value
    if not value.startswith("/agents/"):
        return DEFAULT_RETURN_TO
    segments = value[len("/agents/"):].split("/")
    if value.endswith("/"):
        segments = segments[:-1]
    for seg in segments:
        if not _RETURN_SEGMENT.fullmatch(seg) or seg in (".", ".."):
            return DEFAULT_RETURN_TO
    return value


def make_state(user_id: str, return_to: str) -> str:
    """The OAuth state: an encrypted, timestamped {"u", "r", "n"}."""
    payload = {"u": str(user_id), "r": safe_return_to(return_to), "n": secrets.token_urlsafe(16)}
    return _state_fernet().encrypt(json.dumps(payload, separators=(",", ":")).encode()).decode()


def read_state(token: str, max_age: int = STATE_MAX_AGE) -> tuple[str, str]:
    """(user_id, return_to) from a state this service made in the last
    max_age seconds. GoogleError("state_invalid") for anything else."""
    if not isinstance(token, str) or not token or len(token) > 2000:
        raise GoogleError("state_invalid")
    fernet = _state_fernet()
    try:
        data = json.loads(fernet.decrypt(token.encode(), ttl=max_age))
    except (InvalidToken, ValueError, UnicodeError):
        raise GoogleError("state_invalid") from None
    user_id = data.get("u") if isinstance(data, dict) else None
    if not isinstance(user_id, str) or not user_id or not isinstance(data.get("n"), str):
        raise GoogleError("state_invalid")
    return user_id, safe_return_to(data.get("r"))


def auth_url(state: str, redirect: str) -> str:
    """Google's consent page. access_type=offline and prompt=consent make
    Google hand back a refresh token every time, even on a reconnect."""
    if not is_configured():
        raise GoogleError("not_configured")
    params = {
        "client_id": config.GOOGLE_OAUTH_CLIENT_ID.strip(),
        "redirect_uri": redirect,
        "response_type": "code",
        "scope": SCOPES,
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    }
    return AUTH_URL + "?" + urlencode(params, quote_via=quote)


async def exchange_code(code: str, redirect: str) -> dict:
    """Turn the callback's code into {"email", "scope", "refresh_token"}.
    scope_missing when the send permission was not granted."""
    if not is_configured():
        raise GoogleError("not_configured")
    if not isinstance(code, str) or not code or len(code) > 2048:
        raise GoogleError("exchange_failed")
    try:
        async with _http() as client:
            res = await client.post(TOKEN_URL, data={
                "code": code,
                "client_id": config.GOOGLE_OAUTH_CLIENT_ID.strip(),
                "client_secret": config.GOOGLE_OAUTH_CLIENT_SECRET.strip(),
                "redirect_uri": redirect,
                "grant_type": "authorization_code",
            })
            if res.status_code != 200:
                logger.warning(f"[google] code exchange refused: {res.status_code} {_google_error(res)}")
                raise GoogleError("exchange_failed")
            tokens = res.json()
            if not isinstance(tokens, dict):
                raise GoogleError("exchange_failed")
            scope = str(tokens.get("scope") or "")
            if GMAIL_SEND_SCOPE not in scope.split():
                raise GoogleError("scope_missing")
            access, refresh = tokens.get("access_token"), tokens.get("refresh_token")
            if not isinstance(access, str) or not access or not isinstance(refresh, str) or not refresh:
                logger.warning("[google] code exchange returned no refresh token")
                raise GoogleError("exchange_failed")
            info = await client.get(USERINFO_URL, headers={"Authorization": f"Bearer {access}"})
            if info.status_code != 200:
                logger.warning(f"[google] userinfo refused: {info.status_code} {_google_error(info)}")
                raise GoogleError("exchange_failed")
            profile = info.json()
    except GoogleError:
        raise
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning(f"[google] code exchange failed: {type(exc).__name__}")
        raise GoogleError("exchange_failed") from None
    email = str(profile.get("email") or "").strip() if isinstance(profile, dict) else ""
    if not valid_address(email) or profile.get("email_verified") is False:
        raise GoogleError("exchange_failed")
    return {"email": email, "scope": scope[:1000], "refresh_token": refresh}


# ── The saved connection ──────────────────────────────────────────────────────

# user_id -> (fingerprint of the stored token, access token, monotonic expiry).
# The row is read on every call, so a disconnect or reconnect in another worker
# is seen at once; the cache only saves the call to Google.
_cache: dict[str, tuple[str, str, float]] = {}
_CACHE_CAP = 1000


def _forget(user_id: str) -> None:
    _cache.pop(str(user_id), None)


def _fingerprint(enc: str) -> str:
    return hashlib.sha256(enc.encode()).hexdigest()[:24]


def save_connection(user_id: str, email: str, scope: str, refresh_token: str) -> None:
    """Encrypt the refresh token and store the connection (one per student)."""
    if not isinstance(refresh_token, str) or not refresh_token:
        raise GoogleError("exchange_failed")
    enc = _token_fernet().encrypt(refresh_token.encode()).decode()
    now = _now().isoformat()
    _sb().from_("google_connections").upsert({
        "user_id": user_id,
        "google_email": str(email or "").strip()[:254],
        "scope": str(scope or "")[:1000],
        "refresh_token_enc": enc,
        "connected_at": now,
        "updated_at": now,
    }, on_conflict="user_id").execute()
    _forget(user_id)


def connection(user_id: str) -> Optional[dict]:
    """{"email", "connected_at"} when the student has connected Gmail, else
    None. Never the token."""
    rows = (_sb().from_("google_connections").select("google_email, connected_at")
            .eq("user_id", user_id).limit(1).execute().data or [])
    if not rows:
        return None
    return {"email": rows[0].get("google_email"), "connected_at": rows[0].get("connected_at")}


def _stored(user_id: str) -> Optional[dict]:
    rows = (_sb().from_("google_connections").select("google_email, refresh_token_enc")
            .eq("user_id", user_id).limit(1).execute().data or [])
    return rows[0] if rows else None


def _drop_if_unchanged(user_id: str, enc: str) -> None:
    """Delete a connection Google has revoked, unless the student reconnected
    meanwhile (the stored token is then a different one)."""
    try:
        _sb().from_("google_connections").delete().eq("user_id", user_id).eq("refresh_token_enc", enc).execute()
    except Exception as exc:
        logger.warning(f"[google] could not remove a revoked connection for {user_id}: {type(exc).__name__}")


def _decrypt(enc: str) -> str:
    try:
        return _token_fernet().decrypt(str(enc or "").encode()).decode()
    except GoogleError:
        raise
    except (InvalidToken, ValueError, UnicodeError):
        raise GoogleError("reconnect") from None


async def access_token(user_id: str) -> tuple[str, str]:
    """(access token, the connected address). reconnect when there is no
    connection, it cannot be read, or Google says it was revoked (invalid_grant:
    the row is deleted)."""
    if not is_configured():
        raise GoogleError("not_configured")
    row = await asyncio.to_thread(_stored, user_id)
    if not row:
        raise GoogleError("reconnect")
    enc = str(row.get("refresh_token_enc") or "")
    email = str(row.get("google_email") or "")
    fp = _fingerprint(enc)
    hit = _cache.get(str(user_id))
    if hit and hit[0] == fp and hit[2] > time.monotonic():
        return hit[1], email
    try:
        refresh = _decrypt(enc)
    except GoogleError:
        logger.warning(f"[google] the saved connection for {user_id} cannot be read with the current key")
        raise
    try:
        async with _http() as client:
            res = await client.post(TOKEN_URL, data={
                "grant_type": "refresh_token",
                "refresh_token": refresh,
                "client_id": config.GOOGLE_OAUTH_CLIENT_ID.strip(),
                "client_secret": config.GOOGLE_OAUTH_CLIENT_SECRET.strip(),
            })
    except httpx.HTTPError as exc:
        logger.warning(f"[google] token refresh failed for {user_id}: {type(exc).__name__}")
        raise GoogleError("send_failed") from None
    if res.status_code != 200:
        err = _google_error(res)
        if err == "invalid_grant":
            logger.info(f"[google] connection for {user_id} was revoked or expired; removing it")
            await asyncio.to_thread(_drop_if_unchanged, user_id, enc)
            _forget(user_id)
            raise GoogleError("reconnect")
        logger.warning(f"[google] token refresh refused for {user_id}: {res.status_code} {err}")
        raise GoogleError("send_failed")
    try:
        data = res.json()
    except ValueError:
        data = None
    token = data.get("access_token") if isinstance(data, dict) else None
    if not isinstance(token, str) or not token:
        raise GoogleError("send_failed")
    granted = data.get("scope")
    if isinstance(granted, str) and granted and GMAIL_SEND_SCOPE not in granted.split():
        await asyncio.to_thread(_drop_if_unchanged, user_id, enc)
        _forget(user_id)
        raise GoogleError("reconnect")
    if len(_cache) >= _CACHE_CAP:
        _cache.clear()
    ttl = max(0, _int(data.get("expires_in"), 3600) - TOKEN_MARGIN)
    _cache[str(user_id)] = (fp, token, time.monotonic() + ttl)
    return token, email


# ── Finishing a connection ────────────────────────────────────────────────────
# Google's callback carries no login: only the state says who started the
# connect. Saving there would let one student send their consent link to
# another and have the other's Gmail land on their own account. So the callback
# only holds what Google returned, under a one-time code that goes back to the
# browser that granted it, and the connection is saved when that browser's
# signed-in student confirms and turns out to be the one who started it.
# Held in this process (one worker; see render.yaml) for ten minutes: the
# refresh token never leaves the server. A restart in between just means
# connecting again (and the grant it held stays at Google until the student
# removes it there: there is nothing left to revoke it with).
#
# A grant that is dropped rather than saved (never confirmed, pushed out by
# newer ones, confirmed from the wrong account, or not saved because the
# database failed) is revoked at Google, so no send permission is left live
# with nothing on our side to use or remove it. Revoking any token of a Google
# account ends Mentorable's whole grant on that account, though, so a dropped
# grant is left alone when a saved connection is for the same account.

PENDING_MAX_AGE = 600
_PENDING_CAP = 200
_pending: dict[str, dict] = {}

# Work started in the background here (revoking a dropped grant, the timer
# that drops an unconfirmed one). Kept referenced: a bare create_task can be
# garbage collected mid-flight.
_BACKGROUND: set = set()


def _spawn(coro) -> None:
    """Run coro on the running loop without waiting for it. Every caller in the
    app runs on the loop; a sync caller (a test) has none, and it is dropped."""
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        coro.close()
        return
    task = loop.create_task(coro)
    _BACKGROUND.add(task)
    task.add_done_callback(_BACKGROUND.discard)


def _address_in_use(address: str) -> bool:
    """True when a saved connection (any student's) is for this Google address."""
    address = str(address or "").strip()
    for spelling in dict.fromkeys((address, address.lower())):
        if spelling and (_sb().from_("google_connections").select("user_id").eq("google_email", spelling)
                         .limit(1).execute().data or []):
            return True
    return False


async def _revoke_unkept(email: str, refresh_token: str) -> None:
    """Revoke a grant Mentorable is not keeping, unless a saved connection is
    for the same Google account (revoking would end that one too). Best
    effort, never raises."""
    try:
        in_use = await asyncio.to_thread(_address_in_use, email)
    except Exception as exc:
        # Unsure: a live grant nobody uses is better than a working connection cut off.
        logger.warning(f"[google] could not check a dropped grant before revoking it: {type(exc).__name__}")
        return
    if in_use:
        logger.info("[google] a dropped grant is for an account still connected; not revoking it")
        return
    await revoke_token(refresh_token)


def _drop_pending(code: str) -> None:
    held = _pending.pop(code, None)
    if held:
        _spawn(_revoke_unkept(held["email"], held["refresh_token"]))


async def _expire_later(code: str) -> None:
    """Drop (and revoke) a held grant nobody confirmed in time: the student
    closed the tab between Google and the app."""
    await asyncio.sleep(PENDING_MAX_AGE + 1)
    held = _pending.get(code)
    if held and held["expires"] <= time.monotonic():
        _drop_pending(code)


def hold_pending(user_id: str, email: str, scope: str, refresh_token: str) -> str:
    """Keep a just-granted connection until its student confirms it. Returns
    the one-time code for the redirect."""
    if not isinstance(refresh_token, str) or not refresh_token:
        raise GoogleError("exchange_failed")
    now = time.monotonic()
    for code in [c for c, p in _pending.items() if p["expires"] <= now]:
        _drop_pending(code)
    while len(_pending) >= _PENDING_CAP:
        _drop_pending(next(iter(_pending)))
    code = secrets.token_urlsafe(24)
    _pending[code] = {"user_id": str(user_id), "email": email, "scope": scope,
                      "refresh_token": refresh_token, "expires": now + PENDING_MAX_AGE}
    _spawn(_expire_later(code))
    return code


def take_pending(code) -> Optional[dict]:
    """The held connection for this code, once. None when unknown or expired
    (an expired one is revoked on the way out)."""
    if not isinstance(code, str) or not code or len(code) > 200:
        return None
    held = _pending.pop(code, None)
    if not held:
        return None
    if held["expires"] <= time.monotonic():
        _spawn(_revoke_unkept(held["email"], held["refresh_token"]))
        return None
    return held


async def revoke_token(refresh_token: str) -> None:
    """Revoke a token we are not going to keep (best effort, never raises)."""
    try:
        async with _http() as client:
            res = await client.post(REVOKE_URL, data={"token": refresh_token})
        if res.status_code != 200:
            logger.info(f"[google] revoke of an unsaved token answered {res.status_code}")
    except httpx.HTTPError as exc:
        logger.warning(f"[google] revoke of an unsaved token failed: {type(exc).__name__}")


def _same_account(a, b) -> bool:
    return str(a or "").strip().lower() == str(b or "").strip().lower()


async def finish(user_id: str, code) -> dict:
    """Save a held connection for the signed-in student who started it.
    {"connected": True, "email"}; GoogleError("expired") or ("wrong_account").
    A grant that is not saved is revoked, and so is the one a reconnect to a
    different Google account replaces."""
    held = take_pending(code)
    if held is None:
        raise GoogleError("expired")
    if held["user_id"] != str(user_id):
        await _revoke_unkept(held["email"], held["refresh_token"])
        raise GoogleError("wrong_account")
    try:
        previous = await asyncio.to_thread(_stored, user_id)
    except Exception as exc:
        logger.warning(f"[google] could not read the connection {user_id} is replacing: {type(exc).__name__}")
        previous = None
    try:
        await asyncio.to_thread(save_connection, user_id, held["email"], held["scope"], held["refresh_token"])
    except asyncio.CancelledError:
        _spawn(_revoke_unkept(held["email"], held["refresh_token"]))
        raise
    except Exception:
        # Not saved, so nothing would ever use or remove this grant.
        await _revoke_unkept(held["email"], held["refresh_token"])
        raise
    if previous and not _same_account(previous.get("google_email"), held["email"]):
        try:
            old = _decrypt(previous.get("refresh_token_enc"))
        except GoogleError:
            old = None  # unreadable under the current key: nothing to revoke with
        if old:
            await _revoke_unkept(str(previous.get("google_email") or ""), old)
    return {"connected": True, "email": held["email"]}


async def disconnect(user_id: str) -> None:
    """Delete the connection, then revoke it at Google (best effort). A failed
    delete raises: the student must not be told Gmail is off when it is not."""
    try:
        row = await asyncio.to_thread(_stored, user_id)
    except Exception as exc:
        logger.warning(f"[google] could not read the connection for {user_id} before deleting it: {exc}")
        row = None
    await asyncio.to_thread(
        lambda: _sb().from_("google_connections").delete().eq("user_id", user_id).execute())
    _forget(user_id)
    if not row:
        return
    try:
        refresh = _decrypt(row.get("refresh_token_enc"))
    except GoogleError:
        return  # no usable key or an unreadable token: nothing to revoke with
    try:
        async with _http() as client:
            res = await client.post(REVOKE_URL, data={"token": refresh})
        if res.status_code != 200:
            logger.info(f"[google] revoke for {user_id} answered {res.status_code} {_google_error(res)}")
    except httpx.HTTPError as exc:
        logger.warning(f"[google] revoke for {user_id} failed: {type(exc).__name__}")


# ── Sending ───────────────────────────────────────────────────────────────────

_ADDRESS = re.compile(
    r"[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*"
    r"@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+(?:[A-Za-z]{2,63}|xn--[A-Za-z0-9-]{1,59})"
)
_MESSAGE_ID = re.compile(r"<[^<>\s@]{1,200}@[^<>\s@]{1,200}>")
_THREAD_ID = re.compile(r"[A-Za-z0-9_-]{1,200}")
# Header values: no line breaks of any kind, no control characters.
_BAD_HEADER_CHARS = re.compile(r"[\x00-\x08\x0a-\x1f\x7f\x85  ]")
MAX_SUBJECT = 300
MAX_BODY = 20000
# Fold long lines and encode anything non-ASCII, with CRLF line endings.
_POLICY = SMTP.clone(cte_type="7bit")


def valid_address(value) -> bool:
    """One plain address (no display name, no list), at most 254 characters."""
    if not isinstance(value, str) or len(value) > 254 or not _ADDRESS.fullmatch(value):
        return False
    return len(value.split("@", 1)[0]) <= 64


def _header(name: str, value) -> str:
    text = str(value if value is not None else "")
    if _BAD_HEADER_CHARS.search(text):
        raise ValueError(f"the {name} has a line break or a control character in it")
    return text


def build_message(*, from_email: str, to: str, subject: str, body: str, message_id: str,
                  in_reply_to: Optional[str] = None, from_name: Optional[str] = None) -> str:
    """The email as Gmail's API takes it: RFC 5322 bytes, base64url encoded.
    Plain text in UTF-8. A follow-up (in_reply_to set) carries In-Reply-To and
    References so it lands in the same thread. ValueError for an invalid
    address, a line break in any header, or an empty subject or body."""
    from_email = _header("from address", from_email)
    to = _header("to address", to)
    if not valid_address(from_email):
        raise ValueError("the from address is not a valid email address")
    if not valid_address(to):
        raise ValueError("the to address is not a valid email address")
    subject = _header("subject", subject).strip()
    if not subject or len(subject) > MAX_SUBJECT:
        raise ValueError("the subject is empty or too long")
    message_id = _header("Message-ID", message_id)
    if not _MESSAGE_ID.fullmatch(message_id):
        raise ValueError("the Message-ID is not in <id@domain> form")
    if in_reply_to is not None:
        in_reply_to = _header("In-Reply-To", in_reply_to)
        if not _MESSAGE_ID.fullmatch(in_reply_to):
            raise ValueError("the In-Reply-To id is not in <id@domain> form")
    text = str(body or "").replace("\r\n", "\n").replace("\r", "\n")
    if not text.strip() or len(text) > MAX_BODY:
        raise ValueError("the body is empty or too long")

    msg = EmailMessage(policy=_POLICY)
    name = _header("from name", from_name).strip() if from_name else ""
    if name:
        local, domain = from_email.split("@", 1)
        msg["From"] = Address(display_name=name, username=local, domain=domain)
    else:
        msg["From"] = from_email
    msg["To"] = to
    msg["Subject"] = subject
    msg["Date"] = format_datetime(_now())
    msg["Message-ID"] = message_id
    if in_reply_to:
        msg["In-Reply-To"] = in_reply_to
        msg["References"] = in_reply_to
    msg.set_content(text, subtype="plain", charset="utf-8")
    return base64.urlsafe_b64encode(msg.as_bytes()).decode("ascii")


# Gmail answers some rate limits with 403: those are not a lost permission.
_RATE_REASONS = {"rateLimitExceeded", "userRateLimitExceeded", "dailyLimitExceeded", "quotaExceeded"}
# The request never reached Google, so nothing can have been sent.
_NOT_SENT = (httpx.ConnectError, httpx.ConnectTimeout, httpx.PoolTimeout, httpx.WriteError, httpx.WriteTimeout)


async def send(user_id: str, *, to: str, subject: str, body: str, thread_id: Optional[str] = None,
               in_reply_to: Optional[str] = None, from_name: Optional[str] = None) -> dict:
    """Send one plain-text email from the student's Gmail.

    For a follow-up pass the first email's thread_id and Message-ID
    (in_reply_to), and the same subject: Gmail only threads a message whose
    subject matches. Returns {"gmail_message_id", "gmail_thread_id",
    "message_id_header", "from_email"}; message_id_header is the Message-ID
    set here, for the next follow-up's In-Reply-To."""
    if thread_id is not None and not _THREAD_ID.fullmatch(str(thread_id)):
        raise GoogleError("send_failed", "That email could not be sent: the thread id is not valid.")
    token, from_email = await access_token(user_id)
    domain = from_email.rsplit("@", 1)[-1] if "@" in from_email else None
    message_id = make_msgid(domain=domain)
    try:
        raw = build_message(from_email=from_email, to=to, subject=subject, body=body,
                            message_id=message_id, in_reply_to=in_reply_to, from_name=from_name)
    except ValueError as exc:
        raise GoogleError("send_failed", f"That email could not be sent: {exc}.") from None
    payload = {"raw": raw}
    if thread_id:
        payload["threadId"] = str(thread_id)

    res = None
    for attempt in (1, 2):
        try:
            async with _http() as client:
                res = await client.post(SEND_URL, json=payload, headers={"Authorization": f"Bearer {token}"})
        except _NOT_SENT as exc:
            logger.warning(f"[google] send for {user_id} did not reach Gmail: {type(exc).__name__}")
            raise GoogleError("send_failed") from None
        except httpx.HTTPError as exc:
            logger.warning(f"[google] send for {user_id} lost its answer: {type(exc).__name__}")
            raise GoogleError("send_failed", MESSAGES["send_unconfirmed"], maybe_sent=True) from None
        if res.status_code == 401 and attempt == 1:
            # A cached token Google has dropped early. A fresh one settles it:
            # the refresh itself says reconnect if the permission is gone.
            _forget(user_id)
            token, _ = await access_token(user_id)
            continue
        break

    if res.is_success:
        try:
            data = res.json()
        except ValueError:
            data = {}
        data = data if isinstance(data, dict) else {}
        return {
            "gmail_message_id": str(data.get("id") or ""),
            "gmail_thread_id": str(data.get("threadId") or thread_id or ""),
            "message_id_header": message_id,
            "from_email": from_email,
        }
    err = _google_error(res)
    reasons = _gmail_reasons(res)
    logger.warning(f"[google] send for {user_id} refused: {res.status_code} {err} {sorted(reasons)}")
    if res.status_code == 401:
        _forget(user_id)
        raise GoogleError("reconnect")
    if res.status_code == 403 and not (reasons & _RATE_REASONS) and "accessNotConfigured" not in reasons:
        _forget(user_id)
        raise GoogleError("reconnect")
    if res.status_code == 408 or res.status_code >= 500:
        # Google may have taken the email and then failed to answer. A
        # messages.send has no idempotency key, so treating this as "not sent"
        # would let a retry send the same first email twice.
        raise GoogleError("send_failed", MESSAGES["send_unconfirmed"], maybe_sent=True)
    raise GoogleError("send_failed")
