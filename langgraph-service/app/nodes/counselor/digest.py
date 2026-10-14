"""
The counselors' daily email: "3 students requested a meeting".

Once a day the database's scheduler calls POST /internal/counselor-digest
(app/routers/counselor.py), which runs send_due(). The database decides who is
due (counselor_digest_due: a counselor whose school has requests waiting that
are newer than their last email, and who has had no email today). This module
sends, and keeps the ledger of what was sent straight.

What the email holds: the count, the school's name and a link to the schedule.
Never a student's name, a message or a time. The function that says who is due
returns none of them, and build_email() takes a number and a school's name and
nothing else, so there is nowhere for one to come from.

The order is claim, send, and release if the send failed:
  - counselor_digest_claim writes today's ledger row first and says whether it
    did. Only the run that wrote it sends, so two runs at once (the scheduler's
    and one started by hand with the secret) still send one email.
  - A send that fails gives the claim back (counselor_digest_release), so the
    counselor is due again on the next run and does not lose the day's email.
  - Each send carries an Idempotency-Key naming the counselor and the day. If
    Resend took an email whose answer never reached us, the retry that the
    release allows is recognised by Resend for 24 hours and not sent again.
  - A claim that could not be made, or whose answer was lost, sends nothing
    and releases nothing: releasing a row this run does not hold could erase
    the record of an email another run has just sent.
A run that is stopped mid-send gives its claim back on the way out. The price
of claiming first is what is left: a process killed outright between the claim
and the send costs that counselor one day's email. The other order risks two.

Without RESEND_API_KEY nothing is read, claimed or sent.

Logs carry counts, counselor ids and short error codes. Never an address, a
school's name, or the text of an error (Resend's messages quote the address
the email was for).

The Supabase client is blocking, so every call to it runs on a worker thread.
"""
from __future__ import annotations

import asyncio
import html
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Optional

import httpx

from app import config
from app.db.supabase import get_supabase

logger = logging.getLogger(__name__)

RESEND_URL = "https://api.resend.com/emails"
TIMEOUT = httpx.Timeout(10.0)
SCHEDULE_PATH = "/counselor/schedule"
SCHOOL_NAME_MAX = 120          # schools.name holds 2 to 120 characters
ADDRESS_MAX = 254
# A release is tried this many times before it is logged as lost.
RELEASE_ATTEMPTS = 2

ACTION = "Open your schedule to see the requests and pick a time:"
FOOTER = ("This email comes at most once a day, and only when new requests are waiting. "
          "It never includes a student's name or what they wrote.")

# One plain address: no display name, no list, nothing that could add a second
# recipient to the one counselor this email is for.
_ADDRESS = re.compile(r"[^@\s<>,;\"]+@[^@\s<>,;\"]+\.[^@\s<>,;\"]+")
_CONTROL = re.compile(r"[\x00-\x1f\x7f]")
_RESEND_CODE = re.compile(r"[a-z_]{1,60}")
_DB_CODE = re.compile(r"[A-Za-z0-9]{1,10}")


# ── The email ─────────────────────────────────────────────────────────────────

def configured() -> bool:
    return bool(config.RESEND_API_KEY)


def schedule_link() -> str:
    return f"{config.APP_URL}{SCHEDULE_PATH}"


def subject_for(pending: int) -> str:
    return "1 student requested a meeting" if pending == 1 else f"{pending} students requested a meeting"


def _school(name) -> str:
    """The school's name on one line, or a stand-in when there is none."""
    raw = name if isinstance(name, str) else ""
    text = " ".join(_CONTROL.sub(" ", raw).split())[:SCHOOL_NAME_MAX].strip()
    return text or "Your school"


def build_email(pending: int, school_name) -> dict:
    """{"subject", "text", "html"} for one counselor. The count, the school's
    name and the schedule link are all it is given and all it says. The name
    is a counselor's own typing, so it is escaped in the HTML."""
    subject = subject_for(pending)
    school = _school(school_name)
    link = schedule_link()
    lead = f"{subject} and {'is' if pending == 1 else 'are'} waiting for an answer."
    text = f"{school}\n\n{lead}\n\n{ACTION}\n{link}\n\n{FOOTER}\n\nMentorable\n"

    school_h, lead_h, action_h, link_h, footer_h = (
        html.escape(part, quote=True) for part in (school, lead, ACTION, link, FOOTER))
    page = (
        '<!doctype html><html lang="en"><body style="margin:0;padding:24px;background:#F5F5F5;'
        "font-family:Raleway,Helvetica,Arial,sans-serif;color:#141413;\">"
        '<div style="max-width:520px;margin:0 auto;padding:24px;background:#ffffff;'
        'border:1px solid #e6dfd8;border-radius:16px;">'
        f'<p style="margin:0 0 8px;font-size:15px;font-weight:700;color:#494742;">{school_h}</p>'
        f'<p style="margin:0 0 20px;font-size:20px;font-weight:700;line-height:1.35;">{lead_h}</p>'
        f'<p style="margin:0 0 12px;font-size:16px;line-height:1.5;">{action_h}</p>'
        f'<p style="margin:0 0 20px;"><a href="{link_h}" style="display:inline-block;padding:13px 20px;'
        'background:#1d4ed8;color:#ffffff;border-radius:12px;font-size:16px;font-weight:700;'
        'text-decoration:none;">Open your schedule</a></p>'
        f'<p style="margin:0 0 20px;font-size:15px;line-height:1.5;color:#494742;word-break:break-all;">{link_h}</p>'
        f'<p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#494742;">{footer_h}</p>'
        '<p style="margin:0;font-size:15px;font-weight:700;color:#494742;">Mentorable</p>'
        "</div></body></html>"
    )
    return {"subject": subject, "text": text, "html": page}


# ── Reading a due row ─────────────────────────────────────────────────────────

def _counselor_id(value) -> Optional[str]:
    try:
        return str(uuid.UUID(str(value)))
    except (ValueError, TypeError, AttributeError):
        return None


def _address(value) -> Optional[str]:
    text = value.strip() if isinstance(value, str) else ""
    return text if len(text) <= ADDRESS_MAX and _ADDRESS.fullmatch(text) else None


def _count(value) -> int:
    if isinstance(value, bool):
        return 0
    try:
        return int(value)
    except (TypeError, ValueError, OverflowError):
        return 0


# ── The ledger (sync: callers go through asyncio.to_thread) ───────────────────

def _due() -> list:
    """counselor_digest_due(): rows of {counselor_id, email, school_name, pending}."""
    data = get_supabase().rpc("counselor_digest_due", {}).execute().data
    if data is None:
        return []
    if isinstance(data, dict):
        return [data]
    if not isinstance(data, list):
        raise ValueError("counselor_digest_due did not answer with rows")
    return data


def _claim(counselor_id: str, count: int) -> bool:
    """Write today's row. True only when this call wrote it."""
    res = get_supabase().rpc("counselor_digest_claim", {"p_counselor": counselor_id, "p_count": count}).execute()
    return res.data is True


def _release(counselor_id: str) -> None:
    get_supabase().rpc("counselor_digest_release", {"p_counselor": counselor_id}).execute()


def _what(exc: BaseException) -> str:
    """As much of an error as is safe to log: its type and, for a database
    refusal, the short code. Never its message."""
    name = type(exc).__name__
    code = getattr(exc, "code", None)
    return f"{name} {code}" if isinstance(code, str) and _DB_CODE.fullmatch(code) else name


async def _give_back(counselor_id: str) -> bool:
    """Release today's claim after a failed send. Tried twice; never raises."""
    for attempt in range(1, RELEASE_ATTEMPTS + 1):
        try:
            await asyncio.to_thread(_release, counselor_id)
            return True
        except Exception as exc:
            if attempt == RELEASE_ATTEMPTS:
                logger.error(f"[counselor] digest: CLAIM NOT RELEASED for counselor {counselor_id} "
                             f"({_what(exc)}): today's email is lost for them")
            else:
                logger.warning(f"[counselor] digest: release failed for counselor {counselor_id} "
                               f"({_what(exc)}), retrying")
    return False


# ── Sending ───────────────────────────────────────────────────────────────────

def _http() -> httpx.AsyncClient:
    """One client for a run, never following redirects (it carries the API
    key). Tests swap this for one on a mock transport."""
    return httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=False)


def _today() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def _resend_code(res: httpx.Response) -> str:
    """Resend's short error name ("validation_error", "rate_limit_exceeded").
    Its message is left where it is: it can quote the recipient's address."""
    try:
        data = res.json()
    except ValueError:
        return ""
    if not isinstance(data, dict):
        return ""
    name = data.get("name") or data.get("type")
    return name if isinstance(name, str) and _RESEND_CODE.fullmatch(name) else ""


async def _deliver(client: httpx.AsyncClient, row: dict) -> Optional[str]:
    """Send one counselor's email. None when Resend took it, otherwise a short
    reason that is safe to log."""
    payload = {"from": config.RESEND_FROM, "to": [row["email"]],
               **build_email(row["pending"], row["school_name"])}
    headers = {"Authorization": f"Bearer {config.RESEND_API_KEY}",
               "Idempotency-Key": f"counselor-digest/{row['counselor_id']}/{_today()}"}
    try:
        res = await client.post(RESEND_URL, json=payload, headers=headers)
    except httpx.HTTPError as exc:
        return type(exc).__name__
    if res.is_success:
        return None
    return f"{res.status_code} {_resend_code(res)}".strip()


async def _send_one(client: httpx.AsyncClient, raw) -> str:
    """One due row to its end: "sent", "skipped" or "failed". No error gets
    out of it; only a cancellation passes through."""
    counselor_id = _counselor_id(raw.get("counselor_id")) if isinstance(raw, dict) else None
    if counselor_id is None:
        logger.warning("[counselor] digest: a due row named no counselor")
        return "failed"
    pending = _count(raw.get("pending"))
    if pending < 1:
        logger.info(f"[counselor] digest: nothing is waiting for counselor {counselor_id}; skipped")
        return "skipped"
    email = _address(raw.get("email"))
    if email is None:
        logger.warning(f"[counselor] digest: counselor {counselor_id} has no usable address")
        return "failed"
    row = {"counselor_id": counselor_id, "email": email, "pending": pending,
           "school_name": raw.get("school_name")}

    try:
        claimed = await asyncio.to_thread(_claim, counselor_id, pending)
    except Exception as exc:
        logger.warning(f"[counselor] digest: could not claim today for counselor {counselor_id} "
                       f"({_what(exc)}); nothing sent")
        return "failed"
    if not claimed:
        logger.info(f"[counselor] digest: counselor {counselor_id} already has today's email; skipped")
        return "skipped"

    # From here the claim is this run's, so any failure gives it back.
    try:
        problem = await _deliver(client, row)
    except asyncio.CancelledError:
        # Stopped mid-send (the server is shutting down) with the claim held.
        # Give it back on the way out: if Resend had already taken the email,
        # the idempotency key keeps the next run from sending it again.
        logger.warning(f"[counselor] digest: stopped while sending for counselor {counselor_id}; "
                       "giving today's claim back")
        await _give_back(counselor_id)
        raise
    except Exception as exc:
        problem = type(exc).__name__
    if problem is None:
        return "sent"
    logger.warning(f"[counselor] digest: the email for counselor {counselor_id} was not sent ({problem}); "
                   "giving today's claim back")
    await _give_back(counselor_id)
    return "failed"


async def send_due() -> dict:
    """Email every counselor who is due. {"sent", "skipped", "failed"}:
    skipped is a counselor who already has today's email (another run claimed
    them) or has nothing waiting; failed is one whose email did not go out
    (a claim this run held is given back), or 1 when the list of who is due
    could not be read. No error gets out of it."""
    if not configured():
        logger.info("[counselor] digest: RESEND_API_KEY is not set; nothing read, claimed or sent")
        return {"sent": 0, "skipped": 0, "failed": 0, "configured": False}

    counts = {"sent": 0, "skipped": 0, "failed": 0}
    try:
        rows = await asyncio.to_thread(_due)
    except Exception as exc:
        logger.error(f"[counselor] digest: could not read who is due ({_what(exc)})")
        counts["failed"] = 1
        return counts

    if rows:
        try:
            async with _http() as client:
                for raw in rows:
                    outcome = await _send_one(client, raw)
                    counts[outcome] += 1
        except Exception as exc:
            # _send_one does not raise: this is the mail client failing to open
            # or close. Rows it never reached were not claimed.
            logger.error(f"[counselor] digest: the mail client failed ({type(exc).__name__})")
            counts["failed"] += len(rows) - sum(counts.values())

    logger.info(f"[counselor] digest: {len(rows)} due, sent {counts['sent']}, "
                f"skipped {counts['skipped']}, failed {counts['failed']}")
    return counts
