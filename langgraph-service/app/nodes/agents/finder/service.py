"""
Talon's service: the database, the find accounting, and the order of checks
around every paid run. research.py makes the searches and the model calls and
knows nothing of the database; rules.py holds every check a listing must pass;
usage.py keeps the budgets. The endpoints in app/routers/agents.py only
translate HTTP and SSE.

Every query filters on user_id as well as the row id: the backend runs as the
service role, which bypasses RLS, so that filter is the only thing keeping one
student's request away from another student's rows. The Supabase client is
blocking, so every call from async code goes through asyncio.to_thread.

A find (finder_searches) is one brief, searched once, and costs one of the
student's four finds plus one search. Both are spent before any paid work, so
two clicks cannot share them.
  running   spent, and the run is working on it
  done      at least one listing landed on the board; never refunded after this
  refunded  the search could not run, ran out of time, found nothing it could
            check, found only what is already on the board, or nothing could
            be saved, and the find went back
The search unit is never given back (registry.py), so failed runs cannot be
retried for free forever. A recheck re-reads one saved listing's own page (no
search) and is never given back either, whatever the page says.

Every run has an overall deadline (RUN_DEADLINE); one that passes it ends with
a "timed_out" error and the find given back. A run nobody can finish (the
process stopped mid-run) is settled when the status call or the student's next
find sees it STUCK_AFTER old: given back when nothing of it reached the board,
closed as done when some of it did. Closing is conditional on the row still
running, so a find is given back at most once, and "given back" is only said
when the refund really went through.

Privacy. The brief's citizenship and the opt-in eligibility chips shape the
search words and the prompts for this one run and are then dropped: they are
never written to the database, never logged, never put in memory or chat
context. The stored brief is only STORED_KEYS. Log lines carry the user id,
the lane, counts and timings, and a database error is logged by its type and
code only, because Postgres puts the failing row in a constraint error.

Events for the page's checklist go through `emit` (section 3.6 of the spec).
Everything a request can be refused for is checked before the first event, so
the router can still answer those with a plain HTTP error; after it, every
outcome is a final event.
"""
from __future__ import annotations

import asyncio
import logging
import time
import uuid
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo

from app.db.supabase import get_supabase
from app.nodes.agents import usage
from app.nodes.agents.finder import research, rules
from app.nodes.agents.outreach.research import Emit, progress_line
from app.nodes.agents.outreach.service import AgentError
from app.nodes.agents.registry import get_agent
from app.nodes.quest.common import clean_text, student_context
from app.nodes.quest.schedule import valid_zone

logger = logging.getLogger(__name__)

AGENT = "finder"

RUN_DEADLINE = 150.0                 # the whole search, every page and every model call
STUCK_AFTER = timedelta(minutes=5)   # a running find this old: the run that owned it is gone
RECHECK_DEADLINE = 60.0              # one page and one model call
RECHECKS_PER_ITEM = 3
STALE_AFTER_DAYS = 14
RESULTS_MAX = 8
WANT_MIN, WANT_MAX = 8, 300
INTERESTS_MAX, INTEREST_CHARS = 5, 60
STATE_MAX = 40
DROPPED_MAX = 40

# The only parts of a brief ever written down (finder_searches.brief). Never
# the lane's citizenship answer, never the eligibility chips.
STORED_KEYS = ("want", "interests", "state", "grade", "budget", "travel", "when", "effort")

# What the page gets of a row: every column but these.
HIDDEN_COLUMNS = ("user_id", "canonical_url")

# ── Copy (plain, no em dashes: the student reads every one) ───────────────────

BAD_LANE = "Pick scholarships or activities."
BAD_WANT = f"Tell Talon what you're looking for in {WANT_MIN} to {WANT_MAX} characters."
BUSY = "Talon is already searching for you. Give it a moment."
RECHECK_BUSY = "Talon is already rechecking this one. Give it a moment."
NO_FINDS = "You've used all {limit} finds this demo allows. Your board still works."
NO_SEARCHES = "Talon has run all the searches this demo allows. Your board still works."
NO_RECHECKS = "You've used all the rechecks this demo allows. Open its page to check it yourself."
RECHECKS_SPENT = "You've rechecked this one {limit} times. Open its page to check it yourself."
BUDGET_UNAVAILABLE = "Talon couldn't check your limits just now. Try again in a minute."
NOT_AVAILABLE = "Talon is not available right now."
SEARCH_FAILED = "Talon couldn't finish searching just now. Please try again in a minute."
TIMED_OUT = "Talon took too long on this one and stopped."
NOTHING_NEW = "Everything Talon found is already on your board. Try describing it another way."
NOTHING_FOUND = "Talon couldn't find anything it could check for that. Try describing it another way."
COULD_NOT_SAVE = "Talon couldn't save what it found. Please try again."
NO_ITEM = "That find was not found. It may have been deleted."
RECHECK_FAILED = "Talon couldn't read that page just now. Try again later."
GAVE_BACK = " Your find was given back."
SERVER_ERROR = "Something went wrong. Try again."


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


def _why(exc: Exception) -> str:
    """A database error for the log, without its details: a constraint error
    carries the whole failing row, and a search row carries the brief."""
    code = getattr(exc, "code", None)
    return f"{type(exc).__name__}" + (f" {code}" if code else "")


def _duplicate(exc: Exception) -> bool:
    text = f"{getattr(exc, 'code', '')} {exc}".lower()
    return "23505" in text or "duplicate key" in text


def _plural(n: int, one: str, many: str) -> str:
    return f"{n} {one if n == 1 else many}"


def _limit(kind: str) -> int:
    return get_agent(AGENT).budgets[kind][1]


def _zone(tz_name: Optional[str]) -> ZoneInfo:
    return ZoneInfo(valid_zone(tz_name) or "UTC")


def _local_today(tz_name: Optional[str]) -> date:
    return _now().astimezone(_zone(tz_name)).date()


def _resolve_tz(user_id: str, hint: Optional[str]) -> Optional[str]:
    """The student's zone, for the day a deadline is counted from: the stored
    one wins, and the browser's is saved the first time we see one (as Quest
    and Beaker do). Budgets never use it (they count in UTC). None means UTC."""
    try:
        stored = usage.student_tz(user_id)
    except Exception as exc:                        # a date is not worth a 500
        logger.warning(f"[finder] could not read the time zone for {user_id}: {_why(exc)}")
        stored = None
    if stored:
        return stored
    hinted = valid_zone(hint)
    if hinted:
        try:
            _sb().from_("profiles").update({"timezone": hinted}).eq("id", user_id).execute()
        except Exception as exc:
            logger.warning(f"[finder] could not save the time zone for {user_id}: {_why(exc)}")
    return hinted


def _stored_zone(user_id: str) -> Optional[str]:
    """The saved zone, or None (UTC) when it cannot be read."""
    try:
        return usage.student_tz(user_id)
    except Exception as exc:
        logger.warning(f"[finder] could not read the time zone for {user_id}: {_why(exc)}")
        return None


# One find at a time per student, and one recheck at a time per listing. The
# service runs as a single process (render.yaml), so this in-process guard is
# enough to stop a double click spending two finds; the database still guards
# the money on its own.
_WORKING: set[str] = set()
_RECHECKING: set[tuple[str, str]] = set()


@contextmanager
def _busy(user_id: str):
    if user_id in _WORKING:
        raise AgentError(409, "busy", BUSY)
    _WORKING.add(user_id)
    try:
        yield
    finally:
        _WORKING.discard(user_id)


# ── Reading the brief ─────────────────────────────────────────────────────────

def _pick(value, allowed, default: str) -> str:
    return value if isinstance(value, str) and value in allowed else default


def _grade(value) -> Optional[int]:
    grade = _int(value, 0) if isinstance(value, (int, str)) else 0
    return grade if 9 <= grade <= 12 else None


def _interests(value) -> list[str]:
    """Up to INTERESTS_MAX short phrases, each the student's own words, no repeats."""
    if not isinstance(value, list):
        return []
    out, seen = [], set()
    for raw in value:
        text = _clip(raw, INTEREST_CHARS)
        if text and text.casefold() not in seen:
            seen.add(text.casefold())
            out.append(text)
        if len(out) >= INTERESTS_MAX:
            break
    return out


def _chips(value) -> list[str]:
    """The opt-in eligibility chips: keys of rules.CHIPS only, for this search only."""
    if not isinstance(value, list):
        return []
    out = []
    for key in value:
        if isinstance(key, str) and key in rules.CHIPS and key not in out:
            out.append(key)
    return out


def _brief(body) -> dict:
    """The request body as a brief (section 3.2). A bad lane or want is a 422;
    every other field falls back to its default, and the fields of the other
    lane are set to theirs, so a scholarship search is never cut by a budget."""
    body = body if isinstance(body, dict) else {}
    lane = body.get("lane")
    if not isinstance(lane, str) or lane not in rules.LANES:
        raise AgentError(422, "bad_lane", BAD_LANE)
    want = _clip(body.get("want"), 1000)
    if not WANT_MIN <= len(want) <= WANT_MAX:
        raise AgentError(422, "bad_want", BAD_WANT)
    activity = lane == "activity"
    return {
        "lane": lane,
        "want": want,
        "interests": _interests(body.get("interests")),
        "state": _clip(body.get("state"), STATE_MAX),
        "citizenship": _pick(body.get("citizenship"), rules.CITIZENSHIP, "unsure"),
        "grade": _grade(body.get("grade")),
        "budget": _pick(body.get("budget"), rules.BUDGETS, "any") if activity else "any",
        "travel": _pick(body.get("travel"), rules.TRAVEL, "anywhere") if activity else "anywhere",
        "when": _pick(body.get("when"), rules.WHEN, "any") if activity else "any",
        "effort": "any" if activity else _pick(body.get("effort"), rules.EFFORT, "any"),
        "chips": _chips(body.get("chips")),
    }


def _stored(brief: dict) -> dict:
    """The part of a brief that may be written down (STORED_KEYS)."""
    return {key: brief.get(key) for key in STORED_KEYS}


# ── Listings as rows ──────────────────────────────────────────────────────────
# research.py has already checked every listing (rules.check_listing). These
# only make sure what reaches the table fits its columns, so one odd value
# cannot cost the student a whole find.

FACT_TEXT = {"provider": 160, "summary": 400, "deadline_text": 120, "amount_text": 120, "cost_text": 120,
             "dates_text": 120, "location_text": 120}
FACT_LINES = {"eligibility": (6, 140), "requirements": (8, 140)}
CONFIRM_LINES = (8, 200)
DEADLINE_KINDS = ("date", "rolling", "unknown")
USD_MAX = 2_000_000_000            # an int column


def item_payload(row: dict) -> dict:
    """A board row as the page sees it: every column but user_id and canonical_url."""
    return {k: v for k, v in (row or {}).items() if k not in HIDDEN_COLUMNS}


def _https(value) -> str:
    text = value.strip() if isinstance(value, str) else ""
    if (not text.lower().startswith("https://") or not 9 <= len(text) <= 2000
            or any(c.isspace() for c in text)):
        return ""
    return text


def _usd(value) -> Optional[int]:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    try:
        amount = int(round(value))
    except (OverflowError, ValueError):
        return None
    return amount if 0 <= amount <= USD_MAX else None


def _deadline(value) -> Optional[str]:
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, str):
        try:
            return date.fromisoformat(value.strip()[:10]).isoformat()
        except ValueError:
            return None
    return None


def _lines(value, count: int, chars: int) -> list[str]:
    if not isinstance(value, list):
        return []
    out = []
    for raw in value:
        text = clean_text(raw, chars)
        if text and text not in out:
            out.append(text)
        if len(out) >= count:
            break
    return out


def _facts(raw: dict, *, partial: bool = False) -> dict:
    """The fact columns of a listing, made to fit. partial: only the keys the
    listing carries (a recheck refreshes what it read, nothing else)."""
    out: dict = {}

    def has(key: str) -> bool:
        return not partial or key in raw

    for key, limit in FACT_TEXT.items():
        if has(key):
            out[key] = clean_text(raw.get(key), limit)
    if has("kind"):
        out["kind"] = _pick(raw.get("kind"), rules.KINDS, "other")
    if has("verified"):
        out["verified"] = raw.get("verified") is True
    if has("deadline") or has("deadline_kind"):
        deadline = _deadline(raw.get("deadline"))
        out["deadline"] = deadline
        out["deadline_kind"] = "date" if deadline else _pick(raw.get("deadline_kind"), ("rolling", "unknown"),
                                                             "unknown")
    for key in ("amount_usd", "cost_usd"):
        if has(key):
            out[key] = _usd(raw.get(key))
    if has("aid"):
        out["aid"] = raw.get("aid") if isinstance(raw.get("aid"), bool) else None
    for key, (count, chars) in FACT_LINES.items():
        if has(key):
            out[key] = _lines(raw.get(key), count, chars)
    return out


def _item_fields(listing: dict) -> Optional[dict]:
    """A new board row from one listing, or None when it has no title or no
    https page (nothing a student could open)."""
    title = clean_text(listing.get("title"), 200)
    url = _https(listing.get("url"))
    if not title or not url:
        return None
    canonical = listing.get("canonical_url")
    canonical = canonical.strip() if isinstance(canonical, str) and canonical.strip() else rules.canonical_url(url)
    return {
        **_facts(listing),
        "title": title,
        "url": url,
        "source_url": _https(listing.get("source_url")) or url,
        "canonical_url": str(canonical)[:2000],
        "confirm": _lines(listing.get("confirm"), *CONFIRM_LINES),
        "fit_reason": clean_text(listing.get("fit_reason"), 300),
        "record_ref": clean_text(listing.get("record_ref"), 160),
    }


def _dropped(value) -> list[dict]:
    """What the checks left out, as the page shows it: [{title, reason, message}]."""
    if not isinstance(value, list):
        return []
    out = []
    for raw in value:
        if not isinstance(raw, dict):
            continue
        title = clean_text(raw.get("title"), 200)
        if not title:
            continue
        out.append({"title": title, "reason": clean_text(raw.get("reason"), 40),
                    "message": clean_text(raw.get("message"), 240)})
        if len(out) >= DROPPED_MAX:
            break
    return out


# ── Status ────────────────────────────────────────────────────────────────────

def _prefill(user_id: str) -> dict:
    """What the brief starts from: grade, state and candidate majors. Never fatal."""
    try:
        row = _first(
            _sb().from_("profiles").select("grade_level, location_general, candidate_majors")
            .eq("id", user_id).limit(1).execute().data or []
        ) or {}
    except Exception as exc:
        logger.warning(f"[finder] could not read the prefill for {user_id}: {_why(exc)}")
        row = {}
    return {
        "grade": _grade(row.get("grade_level")),
        "state": _clip(row.get("location_general"), STATE_MAX),
        "interests": _interests(row.get("candidate_majors")),
    }


def _running(user_id: str) -> Optional[dict]:
    row = _first(
        _sb().from_("finder_searches").select("id, lane, created_at").eq("user_id", user_id)
        .eq("status", "running").order("created_at", desc=True).limit(1).execute().data or []
    )
    return {"id": row["id"], "lane": row.get("lane"), "created_at": row.get("created_at")} if row else None


async def status(user_id: str, tz_hint: Optional[str]) -> dict:
    """What the board and the flow need before anything is spent (section 3.4).
    Settles any find nobody can finish first, so what it shows is spendable;
    running is the newest find still running after that."""
    def load() -> dict:
        _resolve_tz(user_id, tz_hint)      # saved the first time, for the dates the page shows
        if user_id not in _WORKING:        # a run in progress owns its find
            _sweep_searches(user_id)
        return {
            "finds": usage.summary(user_id, AGENT, "find"),
            "searches": usage.summary(user_id, AGENT, "search"),
            "rechecks": usage.summary(user_id, AGENT, "recheck"),
            "limits": {
                "rechecks_per_item": RECHECKS_PER_ITEM,
                "stale_after_days": STALE_AFTER_DAYS,
                "results_max": RESULTS_MAX,
                "want_min": WANT_MIN,
                "want_max": WANT_MAX,
            },
            "prefill": _prefill(user_id),
            "running": _running(user_id),
        }
    return await asyncio.to_thread(load)


# ── Finds ─────────────────────────────────────────────────────────────────────

def _require_enabled() -> None:
    if not get_agent(AGENT).enabled:
        raise AgentError(404, "not_available", NOT_AVAILABLE)


async def _spend(user_id: str, kind: str) -> bool:
    """Take one unit of a budget. False when it is spent; a 503 when it cannot
    be checked (a limit the student has not reached is never reported spent)."""
    try:
        return await asyncio.to_thread(usage.spend, user_id, AGENT, kind)
    except usage.Unavailable:
        raise AgentError(503, "budget_unavailable", BUDGET_UNAVAILABLE)


async def _spend_find(user_id: str) -> None:
    """A find and the search it is about to run. The search unit is never given
    back (see registry.py), so failed runs cannot be retried for free forever."""
    if not await _spend(user_id, "find"):
        raise AgentError(409, "no_finds", NO_FINDS.format(limit=_limit("find")))
    try:
        searched = await _spend(user_id, "search")
    except AgentError:
        await asyncio.to_thread(usage.refund, user_id, AGENT, "find")
        raise
    if not searched:
        await asyncio.to_thread(usage.refund, user_id, AGENT, "find")
        raise AgentError(409, "no_searches", NO_SEARCHES)


async def _new_search(user_id: str, brief: dict) -> dict:
    """The ledger row for a find just spent, with the stored brief only. If it
    cannot be written the find goes straight back: nothing was done with it."""
    def insert():
        return _first(_sb().from_("finder_searches").insert({
            "user_id": user_id, "lane": brief["lane"], "status": "running", "brief": _stored(brief),
            "updated_at": _iso_now(),
        }).execute().data or [])
    try:
        row = await asyncio.to_thread(insert)
    except Exception as exc:
        logger.error(f"[finder] could not record a find for {user_id}: {_why(exc)}")
        row = None
    if not row:
        await asyncio.to_thread(usage.refund, user_id, AGENT, "find")
        raise AgentError(500, "server_error", SERVER_ERROR)
    return row


def _error(code: str, message: str, refunded: bool) -> dict:
    return {"type": "error", "error": code, "message": message + (GAVE_BACK if refunded else ""),
            "refunded": refunded}


def _storable(dropped: Optional[list]) -> list:
    """What may be written to finder_searches.dropped: every drop but a
    citizenship one, which would record the student's citizenship answer. The
    page still gets the full list in its results event."""
    return [d for d in (dropped or []) if not (isinstance(d, dict) and d.get("reason") == "citizenship")]


def _close_search(user_id: str, search_id: str, dropped: Optional[list] = None) -> bool:
    """End a running find without results: mark it refunded and return the
    find. Only the call that closes the row refunds it, so a find never goes
    back twice (a run and the status sweep can both reach the same row). A
    close that cannot be written refunds nothing: the row stays running and
    the sweep settles it later. True only when the find really went back."""
    fields = {"status": "refunded", "updated_at": _iso_now()}
    stored = _storable(dropped)
    if stored:
        fields["dropped"] = stored
    try:
        rows = _sb().from_("finder_searches").update(fields) \
            .eq("id", search_id).eq("user_id", user_id).eq("status", "running").execute().data
    except Exception as exc:
        logger.error(f"[finder] could not close find {search_id} for {user_id}: {_why(exc)}")
        return False
    if not rows:
        return False
    return usage.refund(user_id, AGENT, "find")


def _finish_search(user_id: str, search_id: str, found_count: int, dropped: list) -> bool:
    """Mark a running find done (its listings are on the board). Never refunds."""
    try:
        rows = _sb().from_("finder_searches").update({
            "status": "done", "found_count": max(0, found_count), "dropped": _storable(dropped),
            "updated_at": _iso_now(),
        }).eq("id", search_id).eq("user_id", user_id).eq("status", "running").execute().data
    except Exception as exc:
        logger.error(f"[finder] could not mark find {search_id} done for {user_id}: {_why(exc)}")
        return False
    return bool(rows)


async def _give_back(user_id: str, search_id: str, code: str, message: str, *,
                     dropped: Optional[list] = None) -> dict:
    """Close the find and give it back (_close_search). The final error event
    for the page, which says "given back" only when it was."""
    refunded = await asyncio.to_thread(_close_search, user_id, search_id, dropped)
    return _error(code, message, refunded)


def _items_of(user_id: str, search_id: str) -> int:
    """How many board rows a find left (it may have died while saving them)."""
    rows = (_sb().from_("finder_items").select("id").eq("user_id", user_id).eq("search_id", search_id)
            .limit(RESULTS_MAX * 2).execute().data or [])
    return len(rows)


def _stuck(row: dict, now: datetime) -> bool:
    touched = _instant(row.get("updated_at")) or _instant(row.get("created_at"))
    return touched is not None and now - touched >= STUCK_AFTER


def _sweep_searches(user_id: str) -> int:
    """Settle the student's finds nobody can finish: given back when nothing
    of the run reached the board, closed as done when some of it did. Called
    by status (when no run of theirs is in progress) and by every find (under
    the student's lock). Never raises; the number given back."""
    try:
        rows = (_sb().from_("finder_searches").select("id, created_at, updated_at").eq("user_id", user_id)
                .eq("status", "running").execute().data or [])
    except Exception as exc:
        logger.warning(f"[finder] could not check the running finds of {user_id}: {_why(exc)}")
        return 0
    now, settled = _now(), 0
    for row in rows:
        if not _stuck(row, now):
            continue
        try:
            kept = _items_of(user_id, row["id"])
        except Exception as exc:
            logger.warning(f"[finder] could not check find {row.get('id')} of {user_id}: {_why(exc)}")
            continue
        if kept:
            logger.info(f"[finder] find {row['id']} of {user_id} stopped after saving {kept}; closing it")
            _finish_search(user_id, row["id"], kept, [])
        else:
            logger.info(f"[finder] find {row['id']} of {user_id} was left running; giving it back")
            settled += bool(_close_search(user_id, row["id"]))
    return settled


async def _sweep(user_id: str) -> None:
    await asyncio.to_thread(_sweep_searches, user_id)


def _record_items(record: dict) -> list[str]:
    """The named things in their record a "why it fits you" may point at:
    activity titles, award titles, course names and candidate majors."""
    names: list = []
    for table, key in (("activities", "title"), ("awards", "title"), ("courses", "name")):
        names += [r.get(key) for r in (record.get(table) or []) if isinstance(r, dict)]
    majors = (record.get("profile") or {}).get("candidate_majors")
    if isinstance(majors, list):
        names += majors
    out, seen = [], set()
    for name in names:
        text = _clip(name, 160)
        if text and text.casefold() not in seen:
            seen.add(text.casefold())
            out.append(text)
    return out[:60]


async def _record(user_id: str, emit: Emit) -> tuple[str, list[str]]:
    """The student's record for the prompts, as the first checklist line.
    Returned with its "Name:" line: research.py reads the name from it to take
    the name out of every search and out of the record the fit prompt gets."""
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
    return record_text, _record_items(record)


def _known_urls(user_id: str) -> set[str]:
    """Every listing already on the student's board, dismissed ones included,
    so a find never brings one back. Empty when it cannot be read: the unique
    index still keeps a listing from landing twice."""
    try:
        rows = (_sb().from_("finder_items").select("canonical_url").eq("user_id", user_id)
                .limit(2000).execute().data or [])
    except Exception as exc:
        logger.warning(f"[finder] could not read the board of {user_id}: {_why(exc)}")
        return set()
    return {r["canonical_url"] for r in rows if isinstance(r.get("canonical_url"), str) and r["canonical_url"]}


def _top_position(user_id: str) -> float:
    """A position above every row already in New finds, so the newest find
    shows first (students' own moves can make positions negative)."""
    try:
        rows = _sb().from_("finder_items").select("position").eq("user_id", user_id) \
            .eq("status", "new").order("position").limit(1).execute().data or []
    except Exception:
        return 0.0
    low = rows[0].get("position") if rows else None
    return (float(low) - 1.0) if isinstance(low, (int, float)) else 0.0


def _save_items(user_id: str, search_id: str, lane: str, listings: list[dict]) -> tuple[list[dict], int, int]:
    """Put the ranked listings on the board, one row each, in rank order.
    (saved rows, already on the board, failed writes). A listing whose
    canonical URL the student already has is skipped by the unique index and
    counted as already there."""
    fields_list, seen = [], set()
    for listing in listings:
        fields = _item_fields(listing)
        if fields and fields["canonical_url"] not in seen:
            seen.add(fields["canonical_url"])
            fields_list.append(fields)
    top = _top_position(user_id)
    now = _iso_now()
    saved: list[dict] = []
    already = failed = 0
    for i, fields in enumerate(fields_list):
        try:
            row = _first(_sb().from_("finder_items").insert({
                **fields, "user_id": user_id, "search_id": search_id, "lane": lane, "status": "new",
                "checked_at": now, "updated_at": now, "position": top - (len(fields_list) - 1 - i),
            }).execute().data or [])
        except Exception as exc:
            if _duplicate(exc):
                already += 1
            else:
                logger.error(f"[finder] could not save a listing for {user_id}: {_why(exc)}")
                failed += 1
            continue
        if row:
            saved.append(row)
        else:
            failed += 1
    return saved, already, failed


async def find(user_id: str, body: dict, emit: Emit) -> dict:
    """Search for opportunities that fit the brief, check each against its own
    page and put the keepers on the board (section 3.4). Spends a find and a
    search; gives the find back when nothing reached the board."""
    _require_enabled()
    brief = _brief(body)
    with _busy(user_id):
        await _sweep(user_id)
        await _spend_find(user_id)
        search = await _new_search(user_id, brief)
        return await _search_and_save(user_id, search, brief, emit)


async def _search_and_save(user_id: str, search: dict, brief: dict, emit: Emit) -> dict:
    search_id, lane = search["id"], brief["lane"]
    started = time.monotonic()
    try:
        record_text, record_items = await _record(user_id, emit)
    except Exception:
        logger.exception(f"[finder] could not read the record for {user_id}")
        await progress_line(emit, "record", "Couldn't read your record", "failed")
        return await _give_back(user_id, search_id, "search_failed", SEARCH_FAILED)
    known = await asyncio.to_thread(_known_urls, user_id)
    today = _local_today(await asyncio.to_thread(_stored_zone, user_id))

    try:
        found = await asyncio.wait_for(research.find_listings(
            brief, record_text=record_text, record_items=record_items, known_urls=known, today=today, emit=emit,
        ), RUN_DEADLINE)
    except asyncio.TimeoutError:
        logger.warning(f"[finder] a find for {user_id} ({lane}) passed {RUN_DEADLINE:.0f} s; stopping it")
        return await _give_back(user_id, search_id, "timed_out", TIMED_OUT)
    except Exception:
        logger.exception(f"[finder] the search failed for {user_id} ({lane})")
        found = None
    if not isinstance(found, dict):
        return await _give_back(user_id, search_id, "search_failed", SEARCH_FAILED)

    listings = [x for x in (found.get("listings") or []) if isinstance(x, dict)][:RESULTS_MAX]
    dropped = _dropped(found.get("dropped"))
    already = max(0, _int(found.get("already")))
    if not listings:
        logger.info(f"[finder] find for {user_id} ({lane}) kept nothing: {len(dropped)} left out, "
                    f"{already} already on the board, {time.monotonic() - started:.1f} s")
        if already:
            return await _give_back(user_id, search_id, "nothing_new", NOTHING_NEW, dropped=dropped)
        return await _give_back(user_id, search_id, "nothing_found", NOTHING_FOUND, dropped=dropped)

    saved, taken, failed = await asyncio.to_thread(_save_items, user_id, search_id, lane, listings)
    already += taken
    if not saved:
        logger.info(f"[finder] find for {user_id} ({lane}) saved nothing: {taken} already on the board, "
                    f"{failed} failed writes")
        if failed:
            return await _give_back(user_id, search_id, "could_not_save", COULD_NOT_SAVE, dropped=dropped)
        if taken:
            return await _give_back(user_id, search_id, "nothing_new", NOTHING_NEW, dropped=dropped)
        return await _give_back(user_id, search_id, "nothing_found", NOTHING_FOUND, dropped=dropped)

    if not await asyncio.to_thread(_finish_search, user_id, search_id, len(saved), dropped):
        # The listings are on the board; the sweep closes the row as done later.
        logger.error(f"[finder] find {search_id} for {user_id} saved {len(saved)} but was not marked done")
    logger.info(f"[finder] find for {user_id} ({lane}): {len(saved)} saved, {len(dropped)} left out, "
                f"{already} already on the board, {failed} failed writes, {time.monotonic() - started:.1f} s")
    return {
        "type": "results",
        "search": {"id": search_id, "lane": search.get("lane") or lane, "created_at": search.get("created_at")},
        "items": [item_payload(row) for row in saved],
        "dropped": dropped,
        "already": already,
    }


# ── Rechecks ──────────────────────────────────────────────────────────────────
# One saved listing's own page read again (no search): a recheck from the
# student's budget and one of the listing's three, neither ever given back.

# What a recheck may refresh. Not the title, the links (the unique index is on
# the canonical one) or the "why it fits you", which the page cannot change,
# and not the confirm lines, which come from the brief a recheck does not have.
RECHECK_COLUMNS = frozenset(FACT_TEXT) | frozenset(FACT_LINES) | {
    "kind", "verified", "deadline", "deadline_kind", "amount_usd", "cost_usd", "aid",
}

# What research.recheck_listing is given of a row: the facts, never the
# student's notes or checklist.
RECHECK_INPUT = ("id", "lane", "kind", "title", "provider", "summary", "url", "source_url", "verified",
                 "deadline", "deadline_text", "deadline_kind", "amount_text", "amount_usd", "cost_text",
                 "cost_usd", "aid", "dates_text", "location_text", "eligibility", "requirements", "checked_at")


def _item_row(user_id: str, item_id: str) -> Optional[dict]:
    return _first(
        _sb().from_("finder_items").select("*").eq("id", item_id).eq("user_id", user_id)
        .limit(1).execute().data or []
    )


def _update_item(user_id: str, item_id: str, fields: dict) -> Optional[dict]:
    return _first(
        _sb().from_("finder_items").update({**fields, "updated_at": _iso_now()})
        .eq("id", item_id).eq("user_id", user_id).execute().data or []
    )


def _count_recheck(user_id: str, item_id: str, used: int) -> None:
    """A recheck that could not read the page still counts against the listing."""
    try:
        _sb().from_("finder_items").update({"rechecks_used": used + 1}) \
            .eq("id", item_id).eq("user_id", user_id).execute()
    except Exception as exc:
        logger.warning(f"[finder] could not count a recheck on {item_id} for {user_id}: {_why(exc)}")


def _remap_done(old, new: list[str], done) -> list[int]:
    """The student's ticked requirements, moved to where the same words sit in
    the refreshed list (a requirement that is gone loses its tick)."""
    old = old if isinstance(old, list) else []
    out = set()
    for i in done if isinstance(done, list) else []:
        if isinstance(i, int) and not isinstance(i, bool) and 0 <= i < len(old) and old[i] in new:
            out.add(new.index(old[i]))
    return sorted(out)


def _recheck_fields(result: dict, state: str, item: dict) -> dict:
    """The columns a recheck writes: the refreshed facts (status "ok" only),
    the note, and when the page was read."""
    raw = result.get("fields") if isinstance(result.get("fields"), dict) else {}
    fields: dict = {}
    if state == "ok":
        fields = _facts({k: v for k, v in raw.items() if k in RECHECK_COLUMNS}, partial=True)
        # A thin read never wipes the lists the student works from.
        for key in FACT_LINES:
            if key in fields and not fields[key]:
                del fields[key]
        if "requirements" in fields and fields["requirements"] != item.get("requirements"):
            fields["req_done"] = _remap_done(item.get("requirements"), fields["requirements"], item.get("req_done"))
        # Only when the listing was found on its page: a page that opened
        # without it verified nothing, so the card must not read "Checked today".
        if raw.get("checked_at"):
            fields["checked_at"] = _iso_now()
    fields["recheck_note"] = clean_text(raw.get("recheck_note"), 240)
    return fields


async def recheck(user_id: str, item_id, tz_hint: Optional[str] = None) -> dict:
    """Read one listing's own page again and refresh what changed (section
    3.4). Returns {"item", "changed", "gone"}."""
    _require_enabled()
    item_id = _uuid(item_id, "no_item", NO_ITEM)
    item = await asyncio.to_thread(_item_row, user_id, item_id)
    if not item:
        raise AgentError(404, "no_item", NO_ITEM)
    used = _int(item.get("rechecks_used"))
    if used >= RECHECKS_PER_ITEM:
        raise AgentError(409, "rechecks_spent", RECHECKS_SPENT.format(limit=RECHECKS_PER_ITEM))
    key = (user_id, item_id)
    if key in _RECHECKING:
        raise AgentError(409, "busy", RECHECK_BUSY)
    _RECHECKING.add(key)
    try:
        return await _recheck(user_id, item, used, tz_hint)
    finally:
        _RECHECKING.discard(key)


async def _recheck(user_id: str, item: dict, used: int, tz_hint: Optional[str]) -> dict:
    if not await _spend(user_id, "recheck"):
        raise AgentError(409, "no_rechecks", NO_RECHECKS)
    tz = await asyncio.to_thread(_resolve_tz, user_id, tz_hint)
    facts = {k: item.get(k) for k in RECHECK_INPUT}
    try:
        result = await asyncio.wait_for(research.recheck_listing(facts, today=_local_today(tz)), RECHECK_DEADLINE)
    except Exception:
        logger.exception(f"[finder] recheck of {item['id']} failed for {user_id}")
        result = None
    state = result.get("status") if isinstance(result, dict) else None
    if state not in ("ok", "gone"):
        await asyncio.to_thread(_count_recheck, user_id, item["id"], used)
        raise AgentError(502, "recheck_failed", RECHECK_FAILED)

    fields = _recheck_fields(result, state, item)
    saved = await asyncio.to_thread(_update_item, user_id, item["id"], {**fields, "rechecks_used": used + 1})
    if not saved:
        raise AgentError(404, "no_item", NO_ITEM)       # deleted while Talon read the page
    changed = _lines(result.get("changed"), 6, 160)
    logger.info(f"[finder] recheck of {item['id']} for {user_id}: {state}, {len(changed)} changed")
    return {"item": item_payload(saved), "changed": changed, "gone": state == "gone"}
