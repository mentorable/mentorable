"""
Beaker's service: the database, the try accounting, and the order of checks
around every model call and every send. research.py and draft.py make the
model calls and know nothing of the database; google.py talks to Gmail;
usage.py keeps the budgets. The endpoints in app/routers/agents.py only
translate HTTP and SSE.

Every query filters on user_id as well as the row id: the backend runs as the
service role, which bypasses RLS, so that filter is the only thing keeping one
student's request away from another student's rows. The Supabase client is
blocking, so every call from async code goes through asyncio.to_thread.

A try (outreach_tries) is one recipient, start to finish, and costs one of the
student's two. It is spent before any paid work, so two clicks cannot share it.
  open      spent, and waiting on the student: a pick from the shortlist or
            the look-alikes, or an answer to Beaker's one question
  drafted   the draft was delivered on a card; never refunded after this
  refunded  the search failed, nobody fit, the person could not be found, the
            draft could not be written, the run passed its deadline, or the
            try was left where nobody could finish it, and the unit went back
Picking from the shortlist and answering the question cost nothing more. The
question is asked at most once per try, and the research behind it is saved on
a to_contact card first, so the answer is drafted from it without searching
again.

Every run has an overall deadline (RUN_DEADLINE); one that passes it ends with
a "timed_out" error and the try given back. A try nobody can finish is closed
and given back when the status call or the student's next start sees it: one
with nothing to pick or answer (the process stopped mid-run) once it is
STUCK_AFTER old, and any open try once it is OPEN_FOR old. Closing is
conditional on the row still being open, so a try is given back at most once,
and "given back" is only said when the refund really went through.

Rewrites and follow-up drafts take a "write" from the student's budget before
the model is called and do not give it back when the model fails (registry.py).
Their result is only saved on a card nobody has sent or rewritten meanwhile.

A send runs its checks in the contract's order: Gmail, content, address, one
first email per address (or the follow-up rules), then the daily cap. The
daily cap is counted per UTC day, for the student and for the Gmail address
it goes out from (a second Mentorable account on the same Gmail does not start
it over), and the one-first-email rule holds per student and per Gmail address
on the recipient's canonical address (case, a "+tag" and Gmail's dots do not
make a new person). The outreach_sends row is written before Gmail is called,
so the unique indexes turn a double click into "already emailed". When Gmail
refuses, the row is removed and the send unit given back; when Gmail may have
sent it anyway (the answer was lost, or Gmail failed while answering), both
are kept, so a retry cannot send a second first email.

Events for the page's checklist go through `emit` (section 5 of the spec).
Everything a request can be refused for is checked before the first event, so
the router can still answer those with a plain HTTP error; after it, every
outcome is a final event.
"""
from __future__ import annotations

import asyncio
import logging
import re
import uuid
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo

from app.db.supabase import get_supabase
from app.nodes.agents import google, usage
from app.nodes.agents.google import GoogleError
from app.nodes.agents.outreach import draft as writer
from app.nodes.agents.outreach import research, voices
from app.nodes.agents.outreach.draft import DraftFailed
from app.nodes.agents.outreach.research import Emit, progress_line
from app.nodes.agents.registry import get_agent
from app.nodes.quest.common import student_context
from app.nodes.quest.schedule import valid_zone

logger = logging.getLogger(__name__)

AGENT = "outreach"

REWRITES_PER_CARD = 3
FOLLOWUP_DRAFTS_PER_CARD = 3
FOLLOWUPS_PER_CARD = 2
FOLLOWUP_AFTER_DAYS = 10

GOAL_MIN, GOAL_MAX = 8, 300
NOTE_MAX = 300
ANSWER_MAX = 600
MAX_CANDIDATES = 5
MAX_AMBIGUOUS = 3
MAX_BODY_CHARS = 4000          # outreach_contacts.body
MAX_SUBJECT_CHARS = 200        # outreach_contacts.subject

# How long a run may take in all (research, draft and every check), and when an
# open try counts as one nobody will finish.
RUN_DEADLINE = 150.0
STUCK_AFTER = timedelta(minutes=5)   # nothing to pick or answer: the run died
OPEN_FOR = timedelta(hours=1)        # anything still open this long

# Personal mailboxes. A first email goes to one of these only when the research
# found that exact address on a page the search itself returned: a student
# typing a stranger's personal address is what the rails are there to stop.
# This is a soft rail (a personal domain of someone's own is not on any list),
# so it is broad: the providers below under any country domain (yahoo.fr,
# outlook.co.uk, hotmail.com.br), the exact domains after them, and the
# subdomains of the internet providers that hand out addresses per town.
FREE_MAIL_BRANDS = frozenset({
    "gmail", "googlemail", "yahoo", "ymail", "rocketmail", "hotmail", "outlook", "live", "msn", "windowslive",
    "aol", "icloud", "gmx", "yandex", "protonmail", "rediffmail", "naver", "hanmail", "libero", "btinternet",
    "bigpond", "sympatico", "rambler", "seznam", "t-online",
})
FREE_MAIL = frozenset({
    "me.com", "mac.com", "aim.com", "proton.me", "pm.me", "mail.com", "email.com", "usa.com", "myself.com",
    "zoho.com", "zohomail.com", "mail.ru", "bk.ru", "list.ru", "inbox.ru", "inbox.lv", "inbox.com", "ukr.net",
    "qq.com", "foxmail.com", "163.com", "126.com", "yeah.net", "sina.com", "sina.cn", "sohu.com", "aliyun.com",
    "daum.net", "nate.com", "rediff.com", "fastmail.com", "fastmail.fm", "hey.com", "tutanota.com", "tutanota.de",
    "tuta.io", "tuta.com", "hushmail.com", "posteo.de", "posteo.net", "mailbox.org", "startmail.com", "web.de",
    "mail.de", "orange.fr", "wanadoo.fr", "free.fr", "sfr.fr", "laposte.net", "virgilio.it", "tiscali.it",
    "alice.it", "wp.pl", "o2.pl", "onet.pl", "interia.pl", "abv.bg", "sky.com", "talktalk.net",
    "virginmedia.com", "blueyonder.co.uk", "ntlworld.com", "optusnet.com.au", "shaw.ca", "rogers.com",
    "telus.net", "videotron.ca", "bell.net", "comcast.net", "verizon.net", "att.net", "sbcglobal.net",
    "bellsouth.net", "pacbell.net", "prodigy.net", "ameritech.net", "flash.net", "snet.net", "cox.net",
    "charter.net", "spectrum.net", "earthlink.net", "mindspring.com", "juno.com", "netzero.net", "netzero.com",
    "frontier.com", "frontiernet.net", "windstream.net", "centurylink.net", "embarqmail.com", "q.com",
    "optonline.net", "optimum.net", "roadrunner.com", "twc.com", "mchsi.com", "suddenlink.net", "wowway.com",
    "hughes.net", "gci.net", "ptd.net",
})
FREE_MAIL_PARENTS = ("rr.com", "comcast.net", "verizon.net", "att.net", "charter.net", "cox.net")
_BRAND_DOMAIN = re.compile(r"(?P<brand>[a-z0-9-]+)\.(?:[a-z]{2,3}|(?:co|com|net|org)\.[a-z]{2})")
GMAIL_DOMAINS = frozenset({"gmail.com", "googlemail.com"})

# ── Copy (plain, no em dashes: the student reads every one) ───────────────────

NO_TRIES = "You have used both of your tries."
NO_SEARCHES = ("Beaker has run all the searches this demo allows. Your board still works: add people by hand, "
               "edit your drafts and send what is ready.")
NO_WRITES = ("You have used all the rewrites and follow-up drafts this demo allows. "
             "You can still edit the email yourself.")
BUDGET_UNAVAILABLE = "Beaker couldn't check your limits just now. Try again in a minute."
TIMED_OUT = "Beaker took too long on this one and stopped."
TOO_SHORT = ("This email is already short, so Beaker cannot make it any shorter. "
             "Try another option, or edit it yourself.")
BUSY = "Beaker is already working on one for you. Give it a moment."
SEARCH_FAILED = "Beaker could not finish searching just now. Please try again in a minute."
NO_CANDIDATES = "Beaker could not find anyone who fits that goal. Try describing it another way."
NOT_FOUND = "Beaker could not find enough about {name} to write an email with sources."
COULD_NOT_SAVE = "Beaker could not save its work just now. Please try again."
GAVE_BACK = " Your try was given back."
SERVER_ERROR = "Something went wrong. Try again."


class AgentError(Exception):
    """An expected refusal, with the HTTP status and a message for the student."""

    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


# ── Small helpers ─────────────────────────────────────────────────────────────

def _sb():
    return get_supabase()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso_now() -> str:
    return _now().isoformat()


def _first(rows):
    return rows[0] if rows else None


def _int(value, default: int = 0) -> int:
    if isinstance(value, bool):
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _clip(value, limit: int) -> str:
    """The student's own words on one line, cut to `limit`, never rewritten."""
    if not isinstance(value, str):
        return ""
    return " ".join(value.split())[:limit].strip()


def _uuid(value, code: str, message: str) -> str:
    try:
        return str(uuid.UUID(str(value)))
    except (ValueError, TypeError, AttributeError):
        raise AgentError(404, code, message)


def _instant(value) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _zone(tz_name: Optional[str]) -> ZoneInfo:
    return ZoneInfo(valid_zone(tz_name) or "UTC")


def _local_today(tz_name: Optional[str]) -> date:
    return _now().astimezone(_zone(tz_name)).date()


def _local_date(moment: datetime, tz_name: Optional[str]) -> date:
    return moment.astimezone(_zone(tz_name)).date()


def _day_label(d: date) -> str:
    return f"{d:%B} {d.day}"


def _research_of(row: dict) -> dict:
    research_data = (row or {}).get("research")
    return research_data if isinstance(research_data, dict) else {}


def _last_sent(row: dict) -> Optional[datetime]:
    """When the last email on this card went out, by Gmail or by hand."""
    row = row or {}
    return _instant(row.get("last_sent_at")) or _instant(row.get("sent_at")) or _instant(row.get("manual_sent_at"))


def _free_mail(address: str) -> bool:
    """A personal mailbox provider's address (see FREE_MAIL)."""
    domain = str(address or "").rsplit("@", 1)[-1].strip().lower().rstrip(".")
    if domain.rsplit(".", 1)[-1] in ("edu", "gov", "mil"):
        return False
    if domain in FREE_MAIL or any(domain.endswith("." + parent) for parent in FREE_MAIL_PARENTS):
        return True
    brand = _BRAND_DOMAIN.fullmatch(domain)
    return bool(brand and brand.group("brand") in FREE_MAIL_BRANDS)


def _recipient_key(address) -> str:
    """One key per mailbox, for the one-first-email rule: lowercase, without a
    "+tag" (mlee+2@usf.edu reaches mlee@usf.edu at most schools and companies),
    and for Gmail without the dots it ignores. Never what the email is sent to."""
    text = str(address or "").strip().lower()
    local, at, domain = text.rpartition("@")
    if not at:
        return text
    local = local.split("+", 1)[0] or local
    if domain in GMAIL_DOMAINS:
        local, domain = local.replace(".", "") or local, "gmail.com"
    return f"{local}@{domain}"


def _limit(kind: str) -> int:
    return get_agent(AGENT).budgets[kind][1]


def _resolve_tz(user_id: str, hint: Optional[str]) -> Optional[str]:
    """The student's zone, for the dates they see (a follow-up's due day): the
    stored one wins, and the browser's is saved the first time we see one (as
    Quest does). Budgets never use it (they count in UTC). None means UTC."""
    try:
        stored = usage.student_tz(user_id)
    except Exception as exc:                        # a date is not worth a 500 after a paid draft
        logger.warning(f"[outreach] could not read the time zone for {user_id}: {exc}")
        stored = None
    if stored:
        return stored
    hinted = valid_zone(hint)
    if hinted:
        try:
            _sb().from_("profiles").update({"timezone": hinted}).eq("id", user_id).execute()
        except Exception as exc:
            logger.warning(f"[outreach] could not save the time zone for {user_id}: {exc}")
    return hinted


def _stored_zone(user_id: str) -> Optional[str]:
    """The saved zone, or None (UTC) when it cannot be read."""
    try:
        return usage.student_tz(user_id)
    except Exception as exc:
        logger.warning(f"[outreach] could not read the time zone for {user_id}: {exc}")
        return None


def _reset_label(tz_name: Optional[str]) -> str:
    """When the daily cap starts over (midnight UTC), in the student's own time:
    "8 PM today", "12 AM tomorrow"."""
    reset = (_now() + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    local = reset.astimezone(_zone(tz_name))
    clock = local.strftime("%I:%M %p").lstrip("0").replace(":00 ", " ")
    return f"{clock} {'today' if local.date() == _local_today(tz_name) else 'tomorrow'}"


def _full_name(user_id: str) -> str:
    """The student's name as it goes on the From line: no control characters,
    which a mail header cannot carry."""
    rows = _sb().from_("profiles").select("full_name").eq("id", user_id).limit(1).execute().data or []
    name = (_first(rows) or {}).get("full_name")
    return _clip(re.sub(r"[\x00-\x1f\x7f]", " ", name) if isinstance(name, str) else "", 80)


# One flow at a time per student, and one send at a time per card. The service
# runs as a single process (render.yaml), so this in-process guard is enough to
# stop a double click spending two tries; the database still guards the money
# and the one-first-email rule on its own.
_WORKING: set[str] = set()
_SENDING: set[tuple[str, str]] = set()


@contextmanager
def _busy(user_id: str):
    if user_id in _WORKING:
        raise AgentError(409, "busy", BUSY)
    _WORKING.add(user_id)
    try:
        yield
    finally:
        _WORKING.discard(user_id)


# ── The payload the page gets ─────────────────────────────────────────────────

HIDDEN_COLUMNS = ("user_id", "research")


def contact_payload(row: dict, tz_name: Optional[str] = None) -> dict:
    """A card as the page sees it: every column except user_id and research,
    plus what is left of each per-card allowance. tz_name only sets the day
    next_followup_on falls on (UTC when not given)."""
    row = row or {}
    out = {k: v for k, v in row.items() if k not in HIDDEN_COLUMNS}
    verified = _research_of(row).get("verified_email")
    email = row.get("email")
    out["email_verified"] = bool(isinstance(email, str) and isinstance(verified, str) and verified.strip()
                                 and email.strip().lower() == verified.strip().lower())
    out["rewrites_left"] = max(0, REWRITES_PER_CARD - _int(row.get("rewrites_used")))
    out["followup_drafts_left"] = max(0, FOLLOWUP_DRAFTS_PER_CARD - _int(row.get("followup_drafts_used")))
    followups_left = max(0, FOLLOWUPS_PER_CARD - _int(row.get("follow_ups_sent")))
    out["followups_left"] = followups_left
    last = _last_sent(row)
    out["next_followup_on"] = (
        (_local_date(last, tz_name) + timedelta(days=FOLLOWUP_AFTER_DAYS)).isoformat()
        if last and followups_left > 0 else None
    )
    return out


def _try_payload(row: dict) -> dict:
    return {
        "id": row["id"], "mode": row.get("mode"), "goal": row.get("goal") or "",
        "candidates": row.get("candidates") if isinstance(row.get("candidates"), list) else [],
        "pending_question": row.get("pending_question"), "contact_id": row.get("contact_id"),
    }


# ── Status ────────────────────────────────────────────────────────────────────

def _gmail_status(user_id: str) -> dict:
    configured = google.is_configured()
    try:
        conn = google.connection(user_id)
    except Exception as exc:
        logger.warning(f"[outreach] could not read the Gmail connection for {user_id}: {exc}")
        conn = None
    return {"configured": configured, "connected": bool(conn), "email": (conn or {}).get("email")}


async def gmail_status(user_id: str) -> dict:
    """{"configured", "connected", "email"} (section 4.7)."""
    return await asyncio.to_thread(_gmail_status, user_id)


async def status(user_id: str, tz_hint: Optional[str]) -> dict:
    """What the board and the flow need before anything is spent (section 4.1).
    Settles any try nobody can finish first, so what it shows is spendable;
    open_try is the newest try still open (an older, finished one never hides it)."""
    def load() -> dict:
        _resolve_tz(user_id, tz_hint)      # saved the first time, for the dates the page shows
        if user_id not in _WORKING:        # a run in progress owns its try
            _sweep_tries(user_id)
        latest = _first(
            _sb().from_("outreach_tries").select("*").eq("user_id", user_id).eq("status", "open")
            .order("created_at", desc=True).limit(1).execute().data or []
        )
        return {
            "tries": usage.summary(user_id, AGENT, "try"),
            "searches": usage.summary(user_id, AGENT, "search"),
            "writes": usage.summary(user_id, AGENT, "write"),
            "sends_today": usage.summary(user_id, AGENT, "send"),
            "limits": {
                "rewrites_per_card": REWRITES_PER_CARD,
                "followup_drafts_per_card": FOLLOWUP_DRAFTS_PER_CARD,
                "followups_per_card": FOLLOWUPS_PER_CARD,
                "followup_after_days": FOLLOWUP_AFTER_DAYS,
                "max_words": voices.MAX_WORDS,
            },
            "gmail": _gmail_status(user_id),
            "open_try": _try_payload(latest) if latest else None,
        }
    return await asyncio.to_thread(load)


# ── Tries ─────────────────────────────────────────────────────────────────────

def _require_enabled() -> None:
    if not get_agent(AGENT).enabled:
        raise AgentError(404, "not_available", "Beaker is not available right now.")


async def _spend(user_id: str, kind: str) -> bool:
    """Take one unit of a budget. False when it is spent; a 503 when it cannot
    be checked (a limit the student has not reached is never reported spent)."""
    try:
        return await asyncio.to_thread(usage.spend, user_id, AGENT, kind)
    except usage.Unavailable:
        raise AgentError(503, "budget_unavailable", BUDGET_UNAVAILABLE)


async def _spend_try(user_id: str) -> None:
    """A try and the search it is about to run. The search unit is never given
    back (see registry.py), so failed runs cannot be retried for free forever."""
    if not await _spend(user_id, "try"):
        raise AgentError(409, "no_tries", NO_TRIES)
    try:
        searched = await _spend(user_id, "search")
    except AgentError:
        await asyncio.to_thread(usage.refund, user_id, AGENT, "try")
        raise
    if not searched:
        await asyncio.to_thread(usage.refund, user_id, AGENT, "try")
        raise AgentError(409, "no_searches", NO_SEARCHES)


async def _spend_search(user_id: str) -> None:
    """A research run inside a try already paid for (a pick from its list)."""
    if not await _spend(user_id, "search"):
        raise AgentError(409, "no_searches", NO_SEARCHES)


async def _spend_write(user_id: str) -> None:
    """A rewrite or a follow-up draft: one paid model call, never given back
    when the model fails (see registry.py)."""
    if not await _spend(user_id, "write"):
        raise AgentError(409, "no_writes", NO_WRITES)


def _refund_write(user_id: str) -> None:
    usage.refund(user_id, AGENT, "write")


async def _new_try(user_id: str, *, mode: str, goal: str) -> dict:
    """The ledger row for a try just spent. If it cannot be written the unit
    goes straight back: nothing was done with it."""
    def insert():
        return _first(_sb().from_("outreach_tries").insert({
            "user_id": user_id, "mode": mode, "goal": goal, "status": "open", "updated_at": _iso_now(),
        }).execute().data or [])
    try:
        row = await asyncio.to_thread(insert)
    except Exception as exc:
        logger.error(f"[outreach] could not record a try for {user_id}: {exc}")
        row = None
    if not row:
        await asyncio.to_thread(usage.refund, user_id, AGENT, "try")
        raise AgentError(500, "server_error", SERVER_ERROR)
    return row


def _try_row(user_id: str, try_id: str) -> Optional[dict]:
    return _first(
        _sb().from_("outreach_tries").select("*").eq("id", try_id).eq("user_id", user_id)
        .limit(1).execute().data or []
    )


async def _open_try(user_id: str, raw_id) -> dict:
    try_id = _uuid(raw_id, "no_try", "That outreach was not found.")
    row = await asyncio.to_thread(_try_row, user_id, try_id)
    if not row:
        raise AgentError(404, "no_try", "That outreach was not found.")
    if row.get("status") != "open":
        raise AgentError(409, "try_closed", "That outreach is already finished. Start a new one.")
    return row


def _update_open_try(user_id: str, try_id: str, fields: dict) -> bool:
    """Change a try that is still open. False when it is not (or the write failed)."""
    try:
        rows = _sb().from_("outreach_tries").update({**fields, "updated_at": _iso_now()}) \
            .eq("id", try_id).eq("user_id", user_id).eq("status", "open").execute().data
    except Exception as exc:
        logger.error(f"[outreach] could not update try {try_id} for {user_id}: {exc}")
        return False
    return bool(rows)


def _error(code: str, message: str, refunded: bool) -> dict:
    return {"type": "error", "error": code, "message": message + (GAVE_BACK if refunded else ""),
            "refunded": refunded}


def _drop_card(user_id: str, contact_id: str) -> None:
    """Remove the to_contact card a refunded try left, unless the student has
    written in it since."""
    try:
        _sb().from_("outreach_contacts").delete().eq("id", contact_id).eq("user_id", user_id) \
            .eq("stage", "to_contact").eq("body", "").eq("notes", "").execute()
    except Exception as exc:
        logger.warning(f"[outreach] could not remove card {contact_id} for {user_id}: {exc}")


def _close_try(user_id: str, try_id: str, drop_card: Optional[str] = None) -> bool:
    """End an open try without a draft: mark it refunded and return the unit.
    Only the call that closes the row refunds it, so a unit never goes back
    twice (a run, the status sweep and a timeout can all reach the same try).
    A close that cannot be written refunds nothing: the try stays open and the
    sweep settles it later. True only when the unit really went back; the
    research card goes only then (a student who still pays for it keeps it)."""
    try:
        rows = _sb().from_("outreach_tries").update({
            "status": "refunded", "pending_question": None, "updated_at": _iso_now(),
        }).eq("id", try_id).eq("user_id", user_id).eq("status", "open").execute().data
    except Exception as exc:
        logger.error(f"[outreach] could not close try {try_id} for {user_id}: {exc}")
        return False
    if not rows:
        return False
    refunded = usage.refund(user_id, AGENT, "try")
    if refunded and drop_card:
        _drop_card(user_id, drop_card)
    return refunded


async def _give_back(user_id: str, try_id: str, code: str, message: str, *,
                     drop_card: Optional[str] = None) -> dict:
    """Close the try and give it back (_close_try). The final error event for
    the page, which says "given back" only when it was."""
    refunded = await asyncio.to_thread(_close_try, user_id, try_id, drop_card)
    return _error(code, message, refunded)


def _stuck(row: dict, now: datetime) -> bool:
    """An open try nobody can finish: nothing to pick or answer once it is
    STUCK_AFTER old (the run that owned it is gone), or anything at OPEN_FOR."""
    touched = _instant(row.get("updated_at")) or _instant(row.get("created_at"))
    if touched is None:
        return False
    age = now - touched
    if age >= OPEN_FOR:
        return True
    candidates = row.get("candidates")
    resumable = bool(row.get("pending_question")) or (isinstance(candidates, list) and bool(candidates))
    return not resumable and age >= STUCK_AFTER


def _sweep_tries(user_id: str) -> int:
    """Close and give back the student's open tries nobody can finish. Called
    by status (when no run of theirs is in progress) and by every start (under
    the student's lock). Never raises; the number given back."""
    try:
        rows = (_sb().from_("outreach_tries").select("*").eq("user_id", user_id).eq("status", "open")
                .execute().data or [])
    except Exception as exc:
        logger.warning(f"[outreach] could not check the open tries of {user_id}: {exc}")
        return 0
    now, settled = _now(), 0
    for row in rows:
        if _stuck(row, now):
            logger.info(f"[outreach] try {row.get('id')} of {user_id} was left open; giving it back")
            settled += bool(_close_try(user_id, row["id"], row.get("contact_id")))
    return settled


async def _sweep(user_id: str) -> None:
    await asyncio.to_thread(_sweep_tries, user_id)


async def _in_time(user_id: str, try_id: str, work) -> dict:
    """Await a run's work within RUN_DEADLINE. Past it the work is stopped (the
    model calls with it) and the try given back: a stalled model must not keep
    the try and the student's lock for as long as the client's own timeouts."""
    try:
        return await asyncio.wait_for(work, RUN_DEADLINE)
    except asyncio.TimeoutError:
        logger.warning(f"[outreach] a run for {user_id} passed {RUN_DEADLINE:.0f} s; stopping it")
    try:
        row = await asyncio.to_thread(_try_row, user_id, try_id)
        if row and row.get("status") == "drafted" and row.get("contact_id"):
            # It finished just as time ran out: the draft is on the board.
            card = await asyncio.to_thread(_card_row, user_id, row["contact_id"])
            if card:
                tz = await asyncio.to_thread(_stored_zone, user_id)
                return {"type": "draft", "contact": contact_payload(card, tz)}
    except Exception as exc:
        logger.warning(f"[outreach] could not read try {try_id} after its deadline: {exc}")
        row = None
    return await _give_back(user_id, try_id, "timed_out", TIMED_OUT, drop_card=(row or {}).get("contact_id"))


# ── Reading the request ───────────────────────────────────────────────────────

def _goal(body: dict) -> str:
    goal = _clip(body.get("goal"), 1000)
    if not GOAL_MIN <= len(goal) <= GOAL_MAX:
        raise AgentError(422, "bad_goal", f"Describe your goal in {GOAL_MIN} to {GOAL_MAX} characters.")
    return goal


def _choices(body: dict) -> dict:
    purpose = body.get("purpose")
    if not voices.valid_purpose(purpose):
        raise AgentError(422, "bad_purpose", "Pick what you would like from this person.")
    voice = body.get("voice")
    length = body.get("length")
    return {
        "purpose": purpose,
        "voice": voice if voices.valid_voice(voice) else voices.DEFAULT_VOICE,
        "length": length if voices.valid_length(length) else voices.DEFAULT_LENGTH,
        "student_note": _clip(body.get("student_note"), NOTE_MAX),
    }


def _person(raw) -> dict:
    raw = raw if isinstance(raw, dict) else {}
    name = _clip(raw.get("name"), 120)
    if len(name) < 2:
        raise AgentError(422, "bad_person", "Add the name of the person you want to write to.")
    url = _clip(raw.get("url"), 2000).replace(" ", "")
    if url and "://" not in url:
        url = "https://" + url
    return {"name": name, "organization": _clip(raw.get("organization"), 160), "url": url}


# ── The research and the draft ────────────────────────────────────────────────

def _plural(n: int, one: str, many: str) -> str:
    return f"{n} {one if n == 1 else many}"


async def _record(user_id: str, emit: Emit) -> tuple[str, dict]:
    """The student's record for the prompts, as the first checklist line."""
    await progress_line(emit, "record", "Reading your record", "active")
    record_text, record = await asyncio.to_thread(student_context, user_id)
    activities = len(record.get("activities") or [])
    awards = len(record.get("awards") or [])
    if activities or awards:
        label = (f"Read your record: {_plural(activities, 'activity', 'activities')} and "
                 f"{_plural(awards, 'award', 'awards')}")
    else:
        label = "Read your record, which has no activities yet"
    await progress_line(emit, "record", label, "done")
    return record_text, record


def _card_fields(found: dict, choice: dict, why: str) -> dict:
    """The card's columns that come from the research and the student's picks."""
    person = found.get("person") if isinstance(found.get("person"), dict) else {}
    verified = found.get("verified_email")
    email = verified.strip().lower() if isinstance(verified, str) and google.valid_address(verified.strip()) else None
    source = found.get("email_source_url") if email else None
    return {
        "name": _clip(person.get("name"), 120) or "Unknown",
        "title": _clip(person.get("title"), 160),
        "organization": _clip(person.get("organization"), 160),
        "email": email,
        "email_source_url": source[:2000] if isinstance(source, str) and source else None,
        "purpose": choice["purpose"],
        "voice": choice["voice"],
        "length": choice["length"],
        "student_note": choice["student_note"],
        "why": _clip(why, 600),
        "sources": found.get("sources") if isinstance(found.get("sources"), list) else [],
        "research": found,
    }


def _draft_fields(result: dict) -> dict:
    return {
        "subject": str(result.get("subject") or "")[:MAX_SUBJECT_CHARS],
        "body": str(result.get("body") or "")[:MAX_BODY_CHARS],
        "claims": result.get("claims") if isinstance(result.get("claims"), list) else [],
        "facts_to_verify": result.get("facts_to_verify") if isinstance(result.get("facts_to_verify"), list) else [],
    }


def _top_position(user_id: str, stage: str) -> float:
    """A position above every card already in the stage, so Beaker's newest
    card shows first (students' own moves can make positions negative)."""
    try:
        rows = _sb().from_("outreach_contacts").select("position").eq("user_id", user_id) \
            .eq("stage", stage).order("position").limit(1).execute().data or []
    except Exception:
        return 0.0
    low = rows[0].get("position") if rows else None
    return (float(low) - 1.0) if isinstance(low, (int, float)) else 0.0


def _insert_card(user_id: str, fields: dict) -> Optional[dict]:
    try:
        return _first(_sb().from_("outreach_contacts").insert({
            **fields, "user_id": user_id, "created_by": "agent",
            "position": _top_position(user_id, fields.get("stage") or "to_contact"),
        }).execute().data or [])
    except Exception as exc:
        logger.error(f"[outreach] could not save a card for {user_id}: {exc}")
        return None


def _update_card(user_id: str, contact_id: str, fields: dict) -> Optional[dict]:
    return _first(
        _sb().from_("outreach_contacts").update({**fields, "updated_at": _iso_now()})
        .eq("id", contact_id).eq("user_id", user_id).execute().data or []
    )


def _card_row(user_id: str, contact_id: str) -> Optional[dict]:
    return _first(
        _sb().from_("outreach_contacts").select("*").eq("id", contact_id).eq("user_id", user_id)
        .limit(1).execute().data or []
    )


async def _card_or_404(user_id: str, raw_id) -> dict:
    contact_id = _uuid(raw_id, "no_contact", "That contact was not found.")
    row = await asyncio.to_thread(_card_row, user_id, contact_id)
    if not row:
        raise AgentError(404, "no_contact", "That contact was not found.")
    return row


def _text_of(subject, body) -> tuple[str, str]:
    """An email's words, whitespace aside, to tell an edit from a resave."""
    return " ".join(str(subject or "").split()), " ".join(str(body or "").split())


def _save_if_unchanged(user_id: str, contact_id: str, patch: dict, based_on: list) -> tuple[Optional[dict], str]:
    """Write a model's result onto a card only if nobody sent the email or
    changed its words while the model worked. based_on holds the (subject,
    body) pairs the result may replace: the card's words when the call started
    and, for a rewrite, the editor's words it rewrote (an autosave landing
    meanwhile writes those). The write itself is conditional on the version
    just read, so nothing can slip in between. (row, "") when saved, else
    (None, why) with why "gone", "sent" or "changed"."""
    current = _card_row(user_id, contact_id)
    if not current:
        return None, "gone"
    if current.get("sent_at") or current.get("manual_sent_at"):
        return None, "sent"
    if _text_of(current.get("subject"), current.get("body")) not in {_text_of(s, b) for s, b in based_on}:
        return None, "changed"
    query = (_sb().from_("outreach_contacts").update({**patch, "updated_at": _iso_now()})
             .eq("id", contact_id).eq("user_id", user_id).is_("sent_at", "null").is_("manual_sent_at", "null"))
    if current.get("updated_at") is not None:
        query = query.eq("updated_at", current["updated_at"])
    saved = _first(query.execute().data or [])
    return (saved, "") if saved else (None, "changed")


def _deliver(user_id: str, try_id: str, card: Optional[dict], new_card: dict, draft_only: dict) -> Optional[dict]:
    """Put the draft on the card, then close the try as drafted. From here the
    try is never refunded. The question's card keeps whatever the student
    changed on it while Beaker waited: only the draft is written there, and
    only if they did not write or send an email on it while Beaker drafted. A
    new card (or one to replace a question card deleted, sent or written in
    meanwhile) gets everything."""
    saved = None
    if card:
        patch = dict(draft_only)
        if card.get("stage") == "to_contact":
            patch["stage"] = "drafted"
            patch["position"] = _top_position(user_id, "drafted")
        try:
            saved, why = _save_if_unchanged(user_id, card["id"], patch, [(card.get("subject"), card.get("body"))])
            if why:
                logger.info(f"[outreach] card {card['id']} of {user_id} was {why} while Beaker drafted; "
                            f"the draft goes on a new card")
        except Exception as exc:
            logger.error(f"[outreach] could not update card {card['id']} for {user_id}: {exc}")
    if saved is None:
        saved = _insert_card(user_id, {**new_card, "stage": "drafted"})
    if saved is None:
        return None
    if not _update_open_try(user_id, try_id, {"status": "drafted", "contact_id": saved["id"],
                                              "pending_question": None}):
        logger.error(f"[outreach] draft {saved['id']} delivered but try {try_id} was not marked drafted")
    return saved


async def _write(user_id: str, try_row: dict, found: dict, choice: dict, *, why: str, record_text: str,
                 record: dict, emit: Emit, answer: Optional[str] = None, card: Optional[dict] = None) -> dict:
    """Draft from research that checked out. The final event: a draft, the one
    question, or an error (refunded)."""
    try_id = try_row["id"]
    profile = record.get("profile") or {}
    # At most one question per try: once asked, the try carries the card it saved.
    allow_question = not try_row.get("contact_id")
    try:
        result = await writer.write_draft(
            research=found, record_text=record_text, student_name=profile.get("full_name") or "",
            # The raw grade: the prompt turns "11" into "a junior (11th grade) in high school".
            grade=str(profile.get("grade_level") or ""),
            purpose=choice["purpose"], voice=choice["voice"], length=choice["length"],
            student_note=choice["student_note"], answer=answer, allow_question=allow_question, emit=emit,
            question=try_row.get("pending_question") if answer is not None else None,
        )
    except DraftFailed as exc:
        return await _give_back(user_id, try_id, "draft_failed", exc.message,
                                drop_card=card["id"] if card else None)
    except Exception:
        logger.exception(f"[outreach] drafting failed for {user_id}")
        return await _give_back(user_id, try_id, "draft_failed", writer.COULD_NOT_WRITE,
                                drop_card=card["id"] if card else None)

    question = result.get("question") if isinstance(result, dict) else None
    if question:
        if not allow_question:
            return await _give_back(user_id, try_id, "draft_failed", writer.COULD_NOT_WRITE,
                                    drop_card=card["id"] if card else None)
        saved = await asyncio.to_thread(_insert_card, user_id,
                                        {**_card_fields(found, choice, why), "stage": "to_contact"})
        if not saved:
            return await _give_back(user_id, try_id, "draft_failed", COULD_NOT_SAVE)
        ok = await asyncio.to_thread(_update_open_try, user_id, try_id, {
            "pending_question": str(question)[:300], "contact_id": saved["id"],
        })
        if not ok:
            return await _give_back(user_id, try_id, "draft_failed", COULD_NOT_SAVE, drop_card=saved["id"])
        return {"type": "question", "try_id": try_id, "contact_id": saved["id"], "question": str(question)[:300]}

    written = _draft_fields(result)
    saved = await asyncio.to_thread(_deliver, user_id, try_id, card,
                                    {**_card_fields(found, choice, why), **written}, written)
    if not saved:
        return await _give_back(user_id, try_id, "draft_failed", COULD_NOT_SAVE,
                                drop_card=card["id"] if card else None)
    tz = await asyncio.to_thread(_stored_zone, user_id)
    return {"type": "draft", "contact": contact_payload(saved, tz)}


async def _research_and_draft(user_id: str, try_row: dict, target: dict, choice: dict, *, why: str,
                              emit: Emit, may_be_ambiguous: bool) -> dict:
    try_id = try_row["id"]
    try:
        record_text, record = await _record(user_id, emit)
        found = await research.research_person(target, emit=emit)
    except Exception:
        logger.exception(f"[outreach] research failed for {user_id}")
        found = None
    if found is None:
        return await _give_back(user_id, try_id, "search_failed", SEARCH_FAILED)

    state = found.get("status") if isinstance(found, dict) else None
    candidates = found.get("candidates") if state == "ambiguous" else None
    # Look-alikes are offered once, for a name the student typed. A pick that
    # comes back ambiguous again is treated as not found: otherwise picks could
    # search on and on for free.
    if state == "ambiguous" and may_be_ambiguous and isinstance(candidates, list) and candidates:
        candidates = candidates[:MAX_AMBIGUOUS]
        if not await asyncio.to_thread(_update_open_try, user_id, try_id, {"candidates": candidates}):
            return await _give_back(user_id, try_id, "search_failed", COULD_NOT_SAVE)
        return {"type": "ambiguous", "try_id": try_id, "candidates": candidates}
    if state != "found":
        return await _give_back(user_id, try_id, "not_found", NOT_FOUND.format(name=target["name"]))
    return await _write(user_id, try_row, found, choice, why=why, record_text=record_text, record=record,
                        emit=emit)


async def _answer(user_id: str, try_row: dict, body: dict, emit: Emit) -> dict:
    """Beaker asked its one question; draft from the research saved on the
    card, with the student's answer. No search, no charge."""
    answer = body.get("answer")
    answer = " ".join(answer.split())[:ANSWER_MAX] if isinstance(answer, str) else ""
    card = await asyncio.to_thread(_card_row, user_id, try_row["contact_id"])
    found = _research_of(card)
    if not card or found.get("status") != "found":
        # The student deleted the card, and the research with it.
        closed = await _give_back(user_id, try_row["id"], "card_deleted", "")
        raise AgentError(409, "card_deleted", "That card was deleted, so Beaker cannot finish this one."
                         + (GAVE_BACK if closed["refunded"] else ""))
    choice = {
        "purpose": card.get("purpose") if voices.valid_purpose(card.get("purpose")) else "informational",
        "voice": card.get("voice") if voices.valid_voice(card.get("voice")) else voices.DEFAULT_VOICE,
        "length": card.get("length") if voices.valid_length(card.get("length")) else voices.DEFAULT_LENGTH,
        "student_note": card.get("student_note") or "",
    }
    try:
        record_text, record = await _record(user_id, emit)
    except Exception:
        logger.exception(f"[outreach] could not read the record for {user_id}")
        return await _give_back(user_id, try_row["id"], "draft_failed", SERVER_ERROR, drop_card=card["id"])
    return await _write(user_id, try_row, found, choice, why=card.get("why") or "", record_text=record_text,
                        record=record, emit=emit, answer=answer, card=card)


async def shortlist(user_id: str, body: dict, emit: Emit) -> dict:
    """A goal becomes three to five real people to pick from (section 4.2).
    Spends a try; refunds it when the search fails or finds nobody."""
    _require_enabled()
    goal = _goal(body if isinstance(body, dict) else {})
    with _busy(user_id):
        await _sweep(user_id)
        await _spend_try(user_id)
        try_row = await _new_try(user_id, mode="goal", goal=goal)
        return await _in_time(user_id, try_row["id"], _find_people(user_id, try_row["id"], goal, emit))


async def _find_people(user_id: str, try_id: str, goal: str, emit: Emit) -> dict:
    try:
        record_text, _ = await _record(user_id, emit)
        people = await research.find_people(goal, record_text=record_text, emit=emit)
    except Exception:
        logger.exception(f"[outreach] shortlist failed for {user_id}")
        people = None
    if people is None:
        return await _give_back(user_id, try_id, "search_failed", SEARCH_FAILED)
    if not people:
        return await _give_back(user_id, try_id, "no_candidates", NO_CANDIDATES)
    people = people[:MAX_CANDIDATES]
    if not await asyncio.to_thread(_update_open_try, user_id, try_id, {"candidates": people}):
        return await _give_back(user_id, try_id, "search_failed", COULD_NOT_SAVE)
    return {"type": "shortlist", "try_id": try_id, "candidates": people}


async def draft(user_id: str, body: dict, emit: Emit) -> dict:
    """Research a person and draft the email (section 4.3). A new person
    spends a try; a pick from the try's list or an answer to Beaker's question
    does not."""
    _require_enabled()
    body = body if isinstance(body, dict) else {}
    with _busy(user_id):
        await _sweep(user_id)
        if body.get("try_id") in (None, ""):
            choice = _choices(body)
            target = _person(body.get("person"))
            await _spend_try(user_id)
            try_row = await _new_try(user_id, mode="person", goal="")
            return await _in_time(user_id, try_row["id"], _research_and_draft(
                user_id, try_row, target, choice, why="", emit=emit, may_be_ambiguous=True))

        try_row = await _open_try(user_id, body.get("try_id"))
        if try_row.get("pending_question"):
            if not try_row.get("contact_id"):
                closed = await _give_back(user_id, try_row["id"], "card_deleted", "")
                raise AgentError(409, "card_deleted", "That card was deleted, so Beaker cannot finish this one."
                                 + (GAVE_BACK if closed["refunded"] else ""))
            return await _in_time(user_id, try_row["id"], _answer(user_id, try_row, body, emit))

        choice = _choices(body)
        candidates = try_row.get("candidates") if isinstance(try_row.get("candidates"), list) else []
        index = _int(body.get("candidate_index"), -1)
        if not 0 <= index < len(candidates) or not isinstance(candidates[index], dict):
            raise AgentError(422, "bad_candidate", "Pick one of the people on the list.")
        picked = candidates[index]
        target = {"name": _clip(picked.get("name"), 120), "organization": _clip(picked.get("organization"), 160),
                  "url": picked.get("source_url") if isinstance(picked.get("source_url"), str) else ""}
        if try_row.get("mode") == "goal":
            # A pick from Beaker's own shortlist: its page came from the search,
            # not from the student (a same-name pick's page might be theirs).
            target["url_source"] = "search"
        if not target["name"]:
            raise AgentError(422, "bad_candidate", "Pick one of the people on the list.")
        try:
            await _spend_search(user_id)
        except AgentError as exc:
            if exc.code != "no_searches":
                raise
            # No search is left to research anyone on the list, so this try
            # can never be finished: give it back rather than strand it.
            refunded = await asyncio.to_thread(_close_try, user_id, try_row["id"])
            raise AgentError(409, "no_searches", NO_SEARCHES + (GAVE_BACK if refunded else ""))
        return await _in_time(user_id, try_row["id"], _research_and_draft(
            user_id, try_row, target, choice, why=picked.get("why") or "", emit=emit, may_be_ambiguous=False))


# ── Rewrites and follow-up drafts (free of tries, capped per card) ────────────
# Each takes a per-card use (given back when the model's answer is unusable, so
# the card's "2 left" stays true) and a write from the student's budget (kept:
# see registry.py). A result that comes back to a card sent or changed
# meanwhile is not saved.

def _take(user_id: str, contact_id: str, column: str, current: int) -> bool:
    """Count one use of a per-card allowance, only if nobody else did first."""
    rows = _sb().from_("outreach_contacts").update({column: current + 1}) \
        .eq("id", contact_id).eq("user_id", user_id).eq(column, current).execute().data
    return bool(rows)


def _give(user_id: str, contact_id: str, column: str, current: int) -> None:
    """Undo _take after the work it counted failed."""
    try:
        _sb().from_("outreach_contacts").update({column: current}) \
            .eq("id", contact_id).eq("user_id", user_id).eq(column, current + 1).execute()
    except Exception as exc:
        logger.warning(f"[outreach] could not give back {column} on {contact_id} for {user_id}: {exc}")


async def _take_with_write(user_id: str, contact_id: str, column: str, used: int, busy: str) -> None:
    """A per-card use, then a write from the student's budget (the per-card use
    goes back if the write is refused)."""
    if not await asyncio.to_thread(_take, user_id, contact_id, column, used):
        raise AgentError(409, "busy", busy)
    try:
        await _spend_write(user_id)
    except AgentError:
        await asyncio.to_thread(_give, user_id, contact_id, column, used)
        raise


async def rewrite(user_id: str, contact_id: str, body: dict, tz_hint: Optional[str] = None) -> dict:
    """The editor's current email rewritten one way (section 4.4). No search:
    only the research saved on the card."""
    body = body if isinstance(body, dict) else {}
    style = body.get("style")
    if not voices.valid_tweak(style):
        raise AgentError(422, "bad_style", "Pick one of the rewrite options.")
    subject = body.get("subject").strip()[:MAX_SUBJECT_CHARS] if isinstance(body.get("subject"), str) else ""
    text = body.get("body").strip()[:MAX_BODY_CHARS] if isinstance(body.get("body"), str) else ""

    card = await _card_or_404(user_id, contact_id)
    found = _research_of(card)
    if found.get("status") != "found":
        raise AgentError(409, "no_research", "Beaker can only rewrite an email it researched.")
    if card.get("sent_at") or card.get("manual_sent_at"):
        raise AgentError(409, "already_sent", "This email has already been sent.")
    if not text:
        raise AgentError(422, "empty", "There is no email to rewrite yet.")
    if style == "shorter" and writer.word_count(text) <= writer.MIN_REWRITE_WORDS:
        # A rewrite keeps at least MIN_REWRITE_WORDS, so this one could only fail.
        raise AgentError(422, "too_short", TOO_SHORT)
    used = _int(card.get("rewrites_used"))
    if used >= REWRITES_PER_CARD:
        raise AgentError(409, "rewrites_spent", f"You have used all {REWRITES_PER_CARD} rewrites for this email.")
    await _take_with_write(user_id, card["id"], "rewrites_used", used, "Beaker is already rewriting this one.")

    try:
        record_text, record = await asyncio.to_thread(student_context, user_id)
        result = await writer.rewrite_draft(
            research=found, record_text=record_text,
            student_name=(record.get("profile") or {}).get("full_name") or "",
            subject=subject, body=text, style=style, purpose=card.get("purpose") or "",
            voice=card.get("voice") or voices.DEFAULT_VOICE,
        )
    except DraftFailed as exc:
        await asyncio.to_thread(_give, user_id, card["id"], "rewrites_used", used)
        raise AgentError(502, "rewrite_failed", exc.message)
    except Exception:
        await asyncio.to_thread(_give, user_id, card["id"], "rewrites_used", used)
        raise

    patch = _draft_fields(result)
    if card.get("stage") == "to_contact":
        patch["stage"] = "drafted"
    saved, why = await asyncio.to_thread(_save_if_unchanged, user_id, card["id"], patch,
                                         [(card.get("subject"), card.get("body")), (subject, text)])
    if not saved:
        await asyncio.to_thread(_give, user_id, card["id"], "rewrites_used", used)
        if why == "changed":
            # An edit can be repeated at will, so the write it cost stays spent.
            raise AgentError(409, "changed", "The email changed while Beaker was rewriting it, so Beaker kept "
                                             "your version. Try the rewrite again if you still want it.")
        # A send or a delete cannot be repeated on this card: the write goes back.
        await asyncio.to_thread(_refund_write, user_id)
        if why == "sent":
            raise AgentError(409, "already_sent", "This email was sent while Beaker was rewriting it, "
                                                  "so the rewrite was not saved.")
        raise AgentError(404, "no_contact", "That contact was not found.")
    tz = await asyncio.to_thread(_resolve_tz, user_id, tz_hint)
    return {"contact": contact_payload(saved, tz)}


def _save_followup(user_id: str, contact_id: str, text: str, sent_before: int) -> Optional[dict]:
    """The follow-up draft, unless a follow-up went out while it was written
    (it would be a draft for a follow-up already sent)."""
    return _first(
        _sb().from_("outreach_contacts").update({"followup_body": text, "updated_at": _iso_now()})
        .eq("id", contact_id).eq("user_id", user_id).eq("follow_ups_sent", sent_before).execute().data or []
    )


async def followup(user_id: str, contact_id: str, tz_hint: Optional[str] = None) -> dict:
    """A short follow-up for the same thread, saved as followup_body (section
    4.5). The first email must have gone out, by Gmail or by hand."""
    card = await _card_or_404(user_id, contact_id)
    last = _last_sent(card)
    if not last:
        raise AgentError(409, "not_sent", "Send your first email, or mark it as sent, before drafting a follow-up.")
    sent_before = _int(card.get("follow_ups_sent"))
    if sent_before >= FOLLOWUPS_PER_CARD:
        raise AgentError(409, "followups_spent",
                         f"You have sent both follow-ups for {card.get('name') or 'this contact'}.")
    used = _int(card.get("followup_drafts_used"))
    if used >= FOLLOWUP_DRAFTS_PER_CARD:
        raise AgentError(409, "followup_drafts_spent",
                         f"You have used all {FOLLOWUP_DRAFTS_PER_CARD} follow-up drafts for this contact.")
    if not str(card.get("body") or "").strip():
        raise AgentError(409, "no_email", "Add the email you sent to this card first, so Beaker can follow up on it.")
    await _take_with_write(user_id, card["id"], "followup_drafts_used", used,
                           "Beaker is already writing this follow-up.")

    found = _research_of(card)
    if not isinstance(found.get("person"), dict):
        # A card the student added by hand: who they are is all there is.
        found = {"person": {"name": card.get("name") or "", "title": card.get("title") or "",
                            "organization": card.get("organization") or "", "profile_url": ""}, "facts": []}
    try:
        name = await asyncio.to_thread(_full_name, user_id)
        text = await writer.write_followup(
            research=found, student_name=name, subject=card.get("subject") or "", body_sent=card.get("body") or "",
            days_since=max(0, (_now() - last).days),
        )
    except DraftFailed as exc:
        await asyncio.to_thread(_give, user_id, card["id"], "followup_drafts_used", used)
        raise AgentError(502, "followup_failed", exc.message)
    except Exception:
        await asyncio.to_thread(_give, user_id, card["id"], "followup_drafts_used", used)
        raise

    saved = await asyncio.to_thread(_save_followup, user_id, card["id"], str(text or "")[:1500], sent_before)
    if not saved:
        # Deleted, or a follow-up went out meanwhile. Neither repeats at will
        # (follow-ups sent are counted by the backend), so the write goes back.
        await asyncio.to_thread(_give, user_id, card["id"], "followup_drafts_used", used)
        await asyncio.to_thread(_refund_write, user_id)
        if not await asyncio.to_thread(_card_row, user_id, card["id"]):
            raise AgentError(404, "no_contact", "That contact was not found.")
        raise AgentError(409, "changed", "A follow-up went out while Beaker was writing this one, "
                                         "so this draft was not saved.")
    tz = await asyncio.to_thread(_resolve_tz, user_id, tz_hint)
    return {"contact": contact_payload(saved, tz)}


# ── Sending through Gmail ─────────────────────────────────────────────────────

def _gmail_refusal(exc: GoogleError) -> AgentError:
    if exc.code in ("reconnect", "scope_missing"):
        return AgentError(409, "gmail_reconnect", google.MESSAGES["reconnect"])
    if exc.code == "not_configured":
        return AgentError(503, "not_configured", google.MESSAGES["not_configured"])
    return AgentError(502, "send_failed", exc.message)


async def _gmail_ready(user_id: str) -> str:
    """Check 1: Gmail is connected and Google still honours it. The connected
    address, lowercased (the address the email goes out from)."""
    if not google.is_configured():
        raise AgentError(503, "not_configured", google.MESSAGES["not_configured"])
    if not await asyncio.to_thread(google.connection, user_id):
        raise AgentError(409, "gmail_not_connected", "Connect Gmail to send from your own address.")
    try:
        _, from_email = await google.access_token(user_id)
    except GoogleError as exc:
        raise _gmail_refusal(exc)
    return str(from_email or "").strip().lower()


def _sent_key(row: dict) -> str:
    """The canonical recipient of a send row (rows from before to_key existed
    have only to_email)."""
    return _recipient_key(row.get("to_key") or row.get("to_email"))


def _first_sends(user_id: str) -> list[dict]:
    return (_sb().from_("outreach_sends").select("*").eq("user_id", user_id).eq("kind", "first")
            .execute().data or [])


def _first_sent_from(from_email: str, to_key: str) -> bool:
    """Whether this Gmail address already sent a first email to this person,
    from any student's account. Only a yes or no leaves this function: another
    student's rows are never returned."""
    rows = (_sb().from_("outreach_sends").select("id").eq("from_email", from_email).eq("to_key", to_key)
            .eq("kind", "first").limit(1).execute().data or [])
    return bool(rows)


def _sender_sends_today(from_email: str) -> int:
    """How many emails this Gmail address has sent (or is sending) through
    Beaker since midnight UTC, from any student's account. A count only."""
    midnight = _now().replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    rows = (_sb().from_("outreach_sends").select("id").eq("from_email", from_email).gte("sent_at", midnight)
            .limit(100).execute().data or [])
    return len(rows)


def _first_send_of(user_id: str, contact_id: str) -> Optional[dict]:
    return _first(
        _sb().from_("outreach_sends").select("*").eq("user_id", user_id).eq("contact_id", contact_id)
        .eq("kind", "first").eq("status", "sent").limit(1).execute().data or []
    )


def _reserve(user_id: str, contact_id: str, to_email: str, to_key: str, from_email: str, kind: str) -> dict:
    row = _first(_sb().from_("outreach_sends").insert({
        "user_id": user_id, "contact_id": contact_id, "to_email": to_email, "to_key": to_key,
        "from_email": from_email or None, "kind": kind, "status": "sending", "sent_at": _iso_now(),
    }).execute().data or [])
    if not row:
        raise RuntimeError("the send reservation came back empty")
    return row


def _release(user_id: str, send_id: Optional[str]) -> None:
    if not send_id:
        return
    try:
        _sb().from_("outreach_sends").delete().eq("id", send_id).eq("user_id", user_id) \
            .eq("status", "sending").execute()
    except Exception as exc:
        logger.error(f"[outreach] could not remove send reservation {send_id} for {user_id}: {exc}")


def _duplicate(exc: Exception) -> bool:
    text = f"{getattr(exc, 'code', '')} {exc}".lower()
    return "23505" in text or "duplicate key" in text


def _reply_subject(subject: str) -> str:
    return subject if subject.lower().startswith("re:") else f"Re: {subject}"


def _published_personal(found: dict, to_key: str) -> bool:
    """A personal (free-mail) address may get a first email only when the
    research found that address on a page the search itself returned
    (email_source_kind "search"), not only on a page the student pointed
    Beaker at. A research without the field counts as not verified."""
    verified = found.get("verified_email")
    return (isinstance(verified, str) and found.get("email_source_kind") == "search"
            and _recipient_key(verified) == to_key)


def _already_emailed(to: str) -> AgentError:
    return AgentError(409, "already_emailed",
                      f"You have already emailed {to}. Beaker sends one first email to each person.")


async def send(user_id: str, contact_id: str, body: dict, tz_hint: Optional[str]) -> dict:
    """Send the first email or a follow-up from the student's Gmail (section
    4.6). Returns {"contact": ...}."""
    body = body if isinstance(body, dict) else {}
    kind = body.get("kind")
    if kind not in ("first", "followup"):
        raise AgentError(422, "bad_kind", "Say whether this is the first email or a follow-up.")
    try:
        key = (user_id, str(uuid.UUID(str(contact_id))))
    except ValueError:
        key = (user_id, str(contact_id))
    if key in _SENDING:
        raise AgentError(409, "busy", "Already sending this one.")
    _SENDING.add(key)
    try:
        return await _send(user_id, contact_id, kind, body, tz_hint)
    finally:
        _SENDING.discard(key)


async def _send(user_id: str, contact_id: str, kind: str, body: dict, tz_hint: Optional[str]) -> dict:
    card = await _card_or_404(user_id, contact_id)
    cid = card["id"]

    # 1. Gmail.
    from_email = await _gmail_ready(user_id)

    # 2. Content.
    text = body.get("body") if isinstance(body.get("body"), str) else ""
    text = text.replace("\r\n", "\n").replace("\r", "\n").strip()
    if kind == "first":
        subject = body.get("subject").strip() if isinstance(body.get("subject"), str) else ""
        problems = writer.email_problems(subject, text, max_words=voices.MAX_WORDS)
    else:
        # A follow-up keeps the first email's subject, so Gmail threads it.
        thread_subject = str(card.get("subject") or "").strip()
        if not thread_subject and isinstance(body.get("subject"), str):
            thread_subject = body["subject"].strip()
            if thread_subject.lower().startswith("re:"):
                thread_subject = thread_subject[3:].strip()
        problems = writer.email_problems(thread_subject, text, max_words=voices.FOLLOWUP_MAX_WORDS)
        subject = _reply_subject(thread_subject)
    if not problems and (len(text) > MAX_BODY_CHARS or len(subject) > MAX_SUBJECT_CHARS):
        problems = ["The email is too long."]
    if problems:
        raise AgentError(422, "bad_content", " ".join(problems[:3]))

    # 3. Address. to_key is the mailbox (see _recipient_key); the email goes to what was typed.
    to = body.get("to").strip() if isinstance(body.get("to"), str) else ""
    if not google.valid_address(to):
        raise AgentError(422, "bad_address", "That email address does not look right. Check it and try again.")
    to_email = to.lower()
    to_key = _recipient_key(to)
    if kind == "first" and _free_mail(to_email) and not _published_personal(_research_of(card), to_key):
        raise AgentError(422, "personal_address",
                         "That looks like a personal address. Beaker only sends to a school or work address, "
                         "or to one published on the person's own page.")

    tz = await asyncio.to_thread(_resolve_tz, user_id, tz_hint)
    today = _local_today(tz)
    thread_id = in_reply_to = None
    followups_before = _int(card.get("follow_ups_sent"))

    if kind == "first":
        # 4. One first email per person, ever: from this student, and from
        # this Gmail address whichever account sends it.
        if card.get("sent_at"):
            raise AgentError(409, "already_emailed", "You already sent this email with Gmail.")
        if card.get("manual_sent_at"):
            raise AgentError(409, "already_emailed", "You marked this email as sent, so Beaker will not send it again.")
        earlier = await asyncio.to_thread(_first_sends, user_id)
        if any(_sent_key(r) == to_key for r in earlier):
            raise _already_emailed(to)
        if from_email and await asyncio.to_thread(_first_sent_from, from_email, to_key):
            raise _already_emailed(to)
    else:
        # 5. The follow-up rules: in the first email's thread, to the same
        # address, at most two, ten days apart.
        first = await asyncio.to_thread(_first_send_of, user_id, cid)
        if not (card.get("sent_at") and card.get("gmail_thread_id") and card.get("message_id_header") and first):
            if card.get("manual_sent_at"):
                raise AgentError(409, "not_sent", "You sent the first email yourself, so send this follow-up the "
                                                  "same way: copy it or open it in your mail app.")
            raise AgentError(409, "not_sent", "Send the first email with Gmail before sending a follow-up.")
        if to_key != _sent_key(first):
            first_to = str(first.get("to_email") or "").lower()
            raise AgentError(422, "bad_address", f"A follow-up goes to the same address as your first email, {first_to}.")
        if followups_before >= FOLLOWUPS_PER_CARD:
            raise AgentError(409, "followups_spent",
                             f"You have sent both follow-ups for {card.get('name') or 'this contact'}.")
        last = _instant(card.get("last_sent_at")) or _instant(card.get("sent_at")) or _now()
        due = _local_date(last, tz) + timedelta(days=FOLLOWUP_AFTER_DAYS)
        if today < due:
            raise AgentError(409, "too_soon", f"It is too soon to follow up. You can send one on {_day_label(due)}.")
        thread_id, in_reply_to = card["gmail_thread_id"], card["message_id_header"]

    # 6. The daily cap, per UTC day (the student cannot move it by changing
    # their zone). From here every failure gives the unit back.
    limit = _limit("send")
    try:
        took = await asyncio.to_thread(usage.bump, user_id, AGENT, "send")
    except usage.Unavailable:
        raise AgentError(503, "budget_unavailable", BUDGET_UNAVAILABLE)
    if not took.get("allowed"):
        raise AgentError(429, "SEND_LIMIT",
                         f"You have sent {limit} emails today, the most Beaker sends in a day. "
                         f"You can send more after {_reset_label(tz)}.")

    reservation = None
    took_followup = False

    def undo() -> None:
        _release(user_id, (reservation or {}).get("id"))
        if took_followup:
            _give(user_id, cid, "follow_ups_sent", followups_before)
        usage.refund(user_id, AGENT, "send")

    # 7. Reserve, so a second click cannot send it again.
    try:
        if kind == "followup":
            took_followup = await asyncio.to_thread(_take, user_id, cid, "follow_ups_sent", followups_before)
            if not took_followup:
                raise AgentError(409, "busy", "Already sending this one.")
        reservation = await asyncio.to_thread(_reserve, user_id, cid, to_email, to_key, from_email, kind)
    except AgentError:
        await asyncio.to_thread(undo)
        raise
    except Exception as exc:
        await asyncio.to_thread(undo)
        if kind == "first" and _duplicate(exc):
            raise _already_emailed(to)
        raise

    # 8. The same cap for the Gmail address, across every account that sends
    # from it (not for the dev accounts the budget itself lets through).
    # Counted after the reservation, so two sends racing from two accounts
    # each see the other (both may be refused; neither slips past).
    if from_email and not usage.unmetered(took):
        try:
            sender_today = await asyncio.to_thread(_sender_sends_today, from_email)
        except Exception as exc:
            logger.warning(f"[outreach] could not count today's sends from {user_id}'s Gmail: {exc}")
            await asyncio.to_thread(undo)
            raise AgentError(503, "budget_unavailable", BUDGET_UNAVAILABLE)
        if sender_today > limit:
            await asyncio.to_thread(undo)
            raise AgentError(429, "SEND_LIMIT",
                             f"Your Gmail address has sent {limit} emails through Beaker today, the most it sends "
                             f"from one address in a day. You can send more after {_reset_label(tz)}.")

    # 9. Send.
    try:
        from_name = await asyncio.to_thread(_full_name, user_id)
        sent = await google.send(user_id, to=to, subject=subject, body=text, thread_id=thread_id,
                                 in_reply_to=in_reply_to, from_name=from_name or None)
    except GoogleError as exc:
        if exc.maybe_sent:
            # It may have gone out: keep the reservation and the spent unit, so
            # the one-first-email rule still holds if the student tries again.
            logger.warning(f"[outreach] send {reservation['id']} for {user_id} is unconfirmed; keeping it")
            raise AgentError(502, "send_unconfirmed", exc.message)
        await asyncio.to_thread(undo)
        raise _gmail_refusal(exc)
    except Exception:
        await asyncio.to_thread(undo)
        raise

    # 10. Record it. The email is out, so a failed write here is logged, not undone.
    now_iso = _iso_now()

    def record() -> Optional[dict]:
        try:
            _sb().from_("outreach_sends").update({
                "status": "sent", "sent_at": now_iso,
                "gmail_message_id": (sent.get("gmail_message_id") or None),
                "gmail_thread_id": (sent.get("gmail_thread_id") or None),
            }).eq("id", reservation["id"]).eq("user_id", user_id).execute()
        except Exception as exc:
            logger.error(f"[outreach] sent {reservation['id']} for {user_id} but could not mark it: {exc}")
        patch = {"stage": "sent", "sent_via": "gmail", "last_sent_at": now_iso,
                 "follow_up_on": (today + timedelta(days=FOLLOWUP_AFTER_DAYS)).isoformat()}
        if kind == "first":
            patch.update({
                "sent_at": now_iso, "email": to_email, "subject": subject, "body": text,
                "gmail_thread_id": (sent.get("gmail_thread_id") or None),
                "message_id_header": (sent.get("message_id_header") or None),
            })
        else:
            # Sent: clear it, so the page cannot offer the same words again.
            patch["followup_body"] = ""
        try:
            return _update_card(user_id, cid, patch)
        except Exception as exc:
            logger.error(f"[outreach] sent from card {cid} for {user_id} but could not update it: {exc}")
            return _card_row(user_id, cid)

    saved = await asyncio.to_thread(record)
    return {"contact": contact_payload(saved or card, tz)}
