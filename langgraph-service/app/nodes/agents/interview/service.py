"""
Poise's service: the database, the budget and the order of every step around
a mock interview. elevenlabs.py talks to ElevenLabs and feedback.py makes the
one model call; neither knows the database. rules.py holds every check a line
Poise writes must pass; usage.py keeps the budgets. The endpoints in
app/routers/agents.py only translate HTTP.

The promise. Poise practises with the student and points to their own words.
It never writes an answer for them, never predicts an admission or an offer,
and keeps what they said private to them. rules.py and feedback.py keep it for
what the model says (the feedback format has no field for a sample answer, and
every quote must be found in the student's own lines). This file keeps it for
the database: a mock row is the student's alone, and nothing here copies a
word of it anywhere else.

Every query filters on user_id as well as the row id: the backend runs as the
service role, which bypasses RLS, so that filter is the only thing keeping one
student's request away from another student's mocks. The Supabase client is
blocking, so every call from async code goes through asyncio.to_thread.

A mock, start to finish.
  start   Everything that can refuse comes first (the body, the voice line
          being configured, a mock already under way), then one unit of the
          "mock" budget is taken, then ElevenLabs is asked for a one-time
          signed URL with the conversation id in it. That id is stored on the
          row before the browser ever connects, so the browser never tells us
          which conversation is whose. The row starts "live". A signed URL
          that cannot be had, or a row that cannot be written, gives the unit
          back outright: no call was possible.
  finish  Idempotent, and safe to call twice at once: a conditional UPDATE
          moves the row from "live" to "scoring" (or takes over a "scoring"
          claim older than SCORING_STALE_S), and only the request that made
          that move goes on. Every later write repeats the claim's own stamp
          in its WHERE, so a request whose claim was taken over writes
          nothing. The transcript is fetched from ElevenLabs by the stored id,
          screened, stored, and then deleted on ElevenLabs. The feedback call
          runs last, so a model outage costs a "feedback could not be
          written" with a free Retry, never the transcript.
  retry   A mock whose feedback could not be written is read again, free, at
          most FEEDBACK_TRIES_MAX times.
A mock left "live" (the tab closed mid-call) is finished on the student's next
visit: status() lists it in live_ids and the page calls finish for it.

Give-backs. A mock goes back when the call never really happened: ElevenLabs
has no conversation for it NO_CALL_GRACE_S after it started ("no_call"), or
the student said fewer than REFUND_WORDS words ("too_short"). Each counts
against "mock_back" first (_give_back, the way Quill's "_back" budgets work);
past that the mock keeps its unit and the student is told it still counted.
A mock given back keeps no transcript: no model reads a call that short (the
model's safety flag never sees it), so what the student said is not kept on
the chance the crisis screen missed it. A finished mock is never given back. "Given back" is only said when the
refund went through, and a mock is given back at most once: the refund
reason is written on the row (still under the claim) before the refund is
made, and a claim that finds one already there finishes the row without
refunding again.

The hand-off. A transcript where the student says they are in danger now
(rules.crisis_now on their lines, or the model's safety flag) gets
rules.HANDOFF instead of a report. Nothing is kept: the row is deleted, the
ElevenLabs copy too, and the unit goes back outright (not through
mock_back). It leaves no record of whose call it was: its log lines carry no
ids, and the router sends no analytics event for it.

Privacy. A transcript line, the target, the details, a prompt, the feedback,
the record and the signed URL are never logged. Log lines carry ids, counts,
timings and status codes. A database error is logged by its type and code
only, because Postgres puts the failing row in a constraint error, and here
the row holds what the student said. The record goes to the interviewer
without the student's name on it (research_record, as Quill's does).
"""
from __future__ import annotations

import asyncio
import logging
import os
import time
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from typing import Optional

from app.db.supabase import get_supabase
from app.nodes.agents import usage
from app.nodes.agents.interview import elevenlabs, prompts, rules
from app.nodes.agents.interview.feedback import write_feedback
from app.nodes.agents.names import research_record
from app.nodes.agents.outreach.service import AgentError
from app.nodes.agents.registry import get_agent
from app.nodes.quest.common import student_context

logger = logging.getLogger(__name__)

AGENT = "interview"
MODES = ("college", "internship")

MOCK_SECONDS = 600                   # the call's cap (also set on the ElevenLabs agent)
WARN_SECONDS = 540                   # the page shows a one-minute warning
# The word and time thresholds live in rules.py, which decides with them
# (rules.refundable); these names are the same values, never a second copy.
REFUND_WORDS = rules.REFUND_WORDS    # student words below which a mock is given back (too_short)
SCORE_WORDS = rules.SCORE_WORDS      # student words below which there is no rubric (thin)
NO_CALL_GRACE_S = rules.NO_CALL_GRACE_S  # no conversation on ElevenLabs this long after the start: no_call
LIVE_BUSY_S = 720                    # a live or scoring row younger than this blocks another start
SCORING_STALE_S = 180                # a scoring claim older than this may be taken over
FEEDBACK_TRIES_MAX = 2               # free retries of the feedback call per mock
FEEDBACK_DEADLINE = 90.0             # one feedback run: the call, its checks and its one retry

TARGET_MAX = 120
ROLE_MAX = 120
DETAILS_MAX = 1500
TURNS_MAX = rules.TURNS_MAX
TURN_CHARS_MAX = rules.TURN_CHARS_MAX
DURATION_MAX = 3600                  # the table's CHECK on duration_s
CONVERSATION_ID_MAX = 120            # the table's CHECK on conversation_id
LIVE_IDS_MAX = 10

# ElevenLabs' conversation states while it is still running or being processed.
RUNNING = ("initiated", "in-progress", "processing")
SETTLED = ("done", "no_feedback", "refunded")

# What the page gets of a row: every column but these. A start also leaves out
# the transcript (there is none yet).
HIDDEN_COLUMNS = ("user_id",)

# ── Copy (plain, no em dashes: the student reads every one) ───────────────────

NOT_AVAILABLE = "Poise is not available right now."
NOT_CONFIGURED = "Poise's voice line isn't set up yet, so mock interviews can't start right now."
BAD_MODE = "Pick a college interview or an internship interview."
BAD_TARGET = f"Name the school or organization, up to {TARGET_MAX} characters."
BAD_ROLE = f"Name the role or program you're interviewing for, up to {ROLE_MAX} characters."
BAD_DETAILS = f"Keep the description to {DETAILS_MAX} characters."
BUSY = "A mock is already under way. Give it a moment to finish."
NO_MOCKS = "You've used all {limit} mock interviews this demo allows. Your past reports are still here."
BUDGET_UNAVAILABLE = "Poise couldn't check your limits just now. Try again in a minute."
VOICE_UNAVAILABLE = "Poise couldn't open the voice line just now. Try again in a minute."
NOT_FOUND = "That mock interview was not found. It may have been deleted."
NOT_RETRYABLE = "There is nothing in this mock for Poise to read again."
NO_RETRIES = "Poise has tried to read this mock as many times as it can. The transcript is still here."
FEEDBACK_FAILED = "Poise couldn't write feedback on this one just now. Your transcript is saved."
GAVE_BACK = "Your mock was given back."
# Said when the unit did not go back (the give-backs are used up, or the
# refund failed), so a count that drops after a short call is never a surprise.
KEPT = "It still counted as one of your mocks."
SERVER_ERROR = "Something went wrong. Try again."


# ── Small helpers ─────────────────────────────────────────────────────────────

def _sb():
    return get_supabase()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(moment: datetime) -> str:
    return moment.isoformat()


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
    return " ".join(value.replace("\x00", "").split())[:limit].strip()


def _block(value) -> str:
    """The student's own words with their line breaks kept (a pasted job
    description): plain line ends, no blank edges. Not cut here: the caller
    checks the length."""
    if not isinstance(value, str):
        return ""
    return value.replace("\x00", "").replace("\r\n", "\n").replace("\r", "\n").strip()


def _uuid(value, code: str, message: str) -> str:
    try:
        return str(uuid.UUID(str(value)))
    except (ValueError, TypeError, AttributeError):
        raise AgentError(404, code, message)


def _why(exc: Exception) -> str:
    """A database error for the log, without its details: a constraint error
    carries the whole failing row, and here the row holds a transcript."""
    code = getattr(exc, "code", None)
    return f"{type(exc).__name__}" + (f" {code}" if code else "")


def _limit(kind: str) -> int:
    return get_agent(AGENT).budgets[kind][1]


def _public(row: Optional[dict], *, transcript: bool = True) -> dict:
    """A row as the page sees it: every column but user_id (and the
    transcript, when it is left out)."""
    hidden = HIDDEN_COLUMNS if transcript else HIDDEN_COLUMNS + ("transcript",)
    return {k: v for k, v in (row or {}).items() if k not in hidden}


def _instant(value) -> Optional[datetime]:
    """A timestamp from a row (Postgres' text or our own isoformat), or None."""
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if not isinstance(value, str) or not value:
        return None
    try:
        moment = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return moment if moment.tzinfo else moment.replace(tzinfo=timezone.utc)


def _since(row: dict) -> float:
    """Seconds since the mock started. A row with no readable start counts as
    long ago, so it is never kept waiting for a call that cannot come."""
    started = _instant(row.get("started_at")) or _instant(row.get("created_at"))
    if started is None:
        return float(NO_CALL_GRACE_S * 10)
    return max(0.0, (_now() - started).total_seconds())


def _our_agent() -> str:
    return os.environ.get("ELEVENLABS_INTERVIEW_AGENT_ID", "").strip()


def _require_enabled() -> None:
    if not get_agent(AGENT).enabled:
        raise AgentError(404, "not_available", NOT_AVAILABLE)


def _transcript(turns) -> list[dict]:
    """The turns as stored: {"who", "text"} with who one of the two speakers,
    text on its own and capped, empty turns skipped. elevenlabs.py caps them
    already; this is the table's own guard."""
    out = []
    for turn in turns if isinstance(turns, list) else []:
        if not isinstance(turn, dict) or turn.get("who") not in ("interviewer", "student"):
            continue
        text = turn.get("text") if isinstance(turn.get("text"), str) else ""
        text = text.replace("\x00", "").strip()[:TURN_CHARS_MAX].strip()
        if text:
            out.append({"who": turn["who"], "text": text})
        if len(out) >= TURNS_MAX:
            break
    return out


# One start at a time per student. The service runs as a single process
# (render.yaml), so this in-process guard is enough to stop a double click
# spending two mocks; the database still guards the budget on its own, and
# finish has its own guard in the database (the claim).
_HELD: set[tuple] = set()


@contextmanager
def _busy(user_id: str, *what: str):
    key = (user_id, *what)
    if key in _HELD:
        raise AgentError(409, "busy", BUSY)
    _HELD.add(key)
    try:
        yield
    finally:
        _HELD.discard(key)


# ── Budgets ───────────────────────────────────────────────────────────────────

async def _spend(user_id: str) -> Optional[int]:
    """Take one mock. The count after taking it (0 under the dev bypass, which
    counts nothing), or None when the budget is spent. A 503 when it cannot be
    checked: a limit the student has not reached is never reported spent."""
    try:
        answer = await asyncio.to_thread(usage.bump, user_id, AGENT, "mock")
    except usage.Unavailable:
        raise AgentError(503, "budget_unavailable", BUDGET_UNAVAILABLE)
    if not answer.get("allowed"):
        return None
    return max(0, _int(answer.get("used")))


def _left(user_id: str, kind: str) -> Optional[int]:
    """What is left of a budget, or None when it cannot be read (the page then
    says "couldn't check", never "0 left")."""
    try:
        return usage.summary(user_id, AGENT, kind)["left"]
    except Exception as exc:
        logger.warning(f"[interview] could not read the {kind} budget of {user_id}: {_why(exc)}")
        return None


def _give_back(user_id: str) -> bool:
    """Return the mock of a call that never really happened. True only when it
    really went back.

    Each give-back is counted first, in "mock_back" (registry.py), which is
    never given back itself. Once that is spent the mock stays spent: a short
    call on purpose would otherwise be a free voice session every time. A
    count that cannot be read holds nothing back: a limit that could not be
    checked is not a limit reached. Sync: async callers use asyncio.to_thread."""
    try:
        if not usage.bump(user_id, AGENT, "mock_back").get("allowed"):
            return False
    except usage.Unavailable:
        pass
    return usage.refund(user_id, AGENT, "mock")


def _refund_outright(user_id: str) -> bool:
    """Give the mock back without counting it against mock_back: for a signed
    URL that could not be had and for the hand-off. Never raises."""
    return usage.refund(user_id, AGENT, "mock")


# ── Rows ──────────────────────────────────────────────────────────────────────
# Sync, one query each, every one scoped by user_id. Reads raise when the
# database cannot be reached (the caller's request then fails as a whole);
# writes catch their own errors and log the type only.

def _mock_row(user_id: str, mock_id: str) -> Optional[dict]:
    return _first(
        _sb().from_("interview_mocks").select("*").eq("id", mock_id).eq("user_id", user_id)
        .limit(1).execute().data or []
    )


def _under_way(user_id: str) -> bool:
    """Whether a mock started less than LIVE_BUSY_S ago is still live or being
    read. An older one is finished on the next visit, and never blocks."""
    cutoff = _iso(_now() - timedelta(seconds=LIVE_BUSY_S))
    rows = (_sb().from_("interview_mocks").select("id").eq("user_id", user_id)
            .in_("status", ["live", "scoring"]).gte("started_at", cutoff).limit(1).execute().data or [])
    return bool(rows)


def _live_ids(user_id: str) -> list[str]:
    rows = (_sb().from_("interview_mocks").select("id").eq("user_id", user_id)
            .in_("status", ["live", "scoring"]).order("created_at", desc=True).limit(LIVE_IDS_MAX)
            .execute().data or [])
    return [str(r["id"]) for r in rows if r.get("id")]


def _insert_mock(user_id: str, fields: dict) -> Optional[dict]:
    try:
        return _first(_sb().from_("interview_mocks").insert({**fields, "user_id": user_id}).execute().data or [])
    except Exception as exc:
        logger.error(f"[interview] could not create a mock for {user_id}: {_why(exc)}")
        return None


def _claim(user_id: str, mock_id: str) -> Optional[dict]:
    """Move the row to "scoring" for this request, or None when another request
    has it. Two conditional UPDATEs, each one atomic in the database: a live
    row, or a scoring claim gone stale. The claim's stamp (claimed_at) is
    repeated in every later write, so a request whose claim was taken over
    writes nothing."""
    now = _now()
    stamp = _iso(now)
    change = {"status": "scoring", "claimed_at": stamp, "updated_at": stamp}
    row = _first(
        _sb().from_("interview_mocks").update(change).eq("id", mock_id).eq("user_id", user_id)
        .eq("status", "live").execute().data or []
    )
    if row:
        return row
    stale = _iso(now - timedelta(seconds=SCORING_STALE_S))
    return _first(
        _sb().from_("interview_mocks").update(change).eq("id", mock_id).eq("user_id", user_id)
        .eq("status", "scoring").lt("claimed_at", stale).execute().data or []
    )


def _write(user_id: str, mock_id: str, stamp: str, fields: dict) -> Optional[dict]:
    """Write to a row this request holds the claim on. The row as written, or
    None when the claim was lost (taken over, or the row deleted) or the write
    failed. Never raises."""
    try:
        return _first(
            _sb().from_("interview_mocks").update({**fields, "updated_at": _iso(_now())})
            .eq("id", mock_id).eq("user_id", user_id).eq("status", "scoring").eq("claimed_at", stamp)
            .execute().data or []
        )
    except Exception as exc:
        logger.error(f"[interview] could not write mock {mock_id} of {user_id}: {_why(exc)}")
        return None


def _release(user_id: str, mock_id: str, stamp: str) -> None:
    """Hand the row back as "live", for a finish that has to wait (the call is
    still running, or ElevenLabs could not be reached). Never raises: a row
    that stays "scoring" is taken over once its claim is stale."""
    _write(user_id, mock_id, stamp, {"status": "live", "claimed_at": None})


def _delete_mock(user_id: str, mock_id: str) -> bool:
    """Remove a row (the hand-off). Tried twice; never raises. False when it
    is still there. No ids in the log: a hand-off leaves no record."""
    for attempt in (1, 2):
        try:
            _sb().from_("interview_mocks").delete().eq("id", mock_id).eq("user_id", user_id).execute()
            return True
        except Exception as exc:
            level = logger.error if attempt == 2 else logger.warning
            level(f"[interview] could not remove a mock after the hand-off (attempt {attempt}): {type(exc).__name__}")
    return False


def _empty_mock(user_id: str, mock_id: str) -> None:
    """The hand-off's fallback when the row could not be deleted: nothing of
    the call stays on it, and it is settled, so no later finish can read it,
    claim it or give its mock back a second time. Never raises."""
    try:
        _sb().from_("interview_mocks").update({
            "status": "refunded", "refund_reason": None, "transcript": [], "feedback": None, "scores": None,
            "student_words": None, "claimed_at": None, "updated_at": _iso(_now()),
        }).eq("id", mock_id).eq("user_id", user_id).execute()
    except Exception as exc:
        logger.error(f"[interview] could not empty a mock after the hand-off: {type(exc).__name__}")


# ── Status ────────────────────────────────────────────────────────────────────

async def status(user_id: str) -> dict:
    """What the home page needs before anything is spent. Never fatal for a
    budget that cannot be read (None, "couldn't check")."""
    def load() -> dict:
        try:
            live = _live_ids(user_id)
        except Exception as exc:
            logger.warning(f"[interview] could not list the open mocks of {user_id}: {_why(exc)}")
            live = []
        return {
            "configured": bool(elevenlabs.is_configured()),
            "mocks_left": _left(user_id, "mock"),
            "mocks_limit": _limit("mock"),
            "backs_left": _left(user_id, "mock_back"),
            "max_seconds": MOCK_SECONDS,
            "warn_seconds": WARN_SECONDS,
            "live_ids": live,
        }
    _require_enabled()
    return await asyncio.to_thread(load)


# ── Start ─────────────────────────────────────────────────────────────────────

def _start_fields(body) -> dict:
    """The mock's columns from the request, or a 400 naming the first field
    that is wrong. A college mock has no role, whatever was sent."""
    body = body if isinstance(body, dict) else {}
    mode = body.get("mode")
    if not isinstance(mode, str) or mode not in MODES:
        raise AgentError(400, "bad_mode", BAD_MODE)
    target = _clip(body.get("target"), TARGET_MAX * 2)
    if not 1 <= len(target) <= TARGET_MAX:
        raise AgentError(400, "bad_target", BAD_TARGET)
    role = None
    if mode == "internship":
        role = _clip(body.get("role"), ROLE_MAX * 2)
        if not 1 <= len(role) <= ROLE_MAX:
            raise AgentError(400, "bad_role", BAD_ROLE)
    raw = body.get("details")
    if raw is not None and not isinstance(raw, str):
        raise AgentError(400, "bad_details", BAD_DETAILS)
    details = _block(raw)
    if len(details) > DETAILS_MAX:
        raise AgentError(400, "bad_details", BAD_DETAILS)
    return {"mode": mode, "target": target, "role": role, "details": details}


def _record_text(user_id: str) -> str:
    """The record for the interviewer, without the student's name. Not strict
    and never fatal: the mock is already spent here, and with no record the
    interviewer just asks plainer questions. Sync."""
    try:
        text, _ = student_context(user_id)
    except Exception as exc:
        logger.warning(f"[interview] could not read the record of {user_id}: {_why(exc)}")
        return ""
    return research_record(str(text or ""))


async def start_mock(user_id: str, body) -> dict:
    """Spend a mock and open the voice line. Everything that can refuse comes
    before the spend, in this order: the body (400), the voice line being set
    up (503), a mock already under way (409), the budget (503 when it cannot
    be read, 429 when it is spent). After the spend only the two steps that
    give the mock back outright can fail: the signed URL (502) and the row
    (500)."""
    _require_enabled()
    fields = _start_fields(body)
    if not elevenlabs.is_configured():
        raise AgentError(503, "not_configured", NOT_CONFIGURED)
    with _busy(user_id, "start"):
        if await asyncio.to_thread(_under_way, user_id):
            raise AgentError(409, "busy", BUSY)
        counted = await _spend(user_id)
        if counted is None:
            raise AgentError(429, "no_mocks", NO_MOCKS.format(limit=_limit("mock")))
        try:
            return await _open_line(user_id, fields)
        except AgentError:
            raise                               # _open_line's own endings refund before they raise
        except Exception as exc:
            refunded = await asyncio.to_thread(_refund_outright, user_id)
            logger.error(f"[interview] starting a mock broke for {user_id}: {type(exc).__name__}, "
                         f"{'given back' if refunded else 'NOT given back'}")
            raise AgentError(500, "server_error", f"{SERVER_ERROR} {GAVE_BACK if refunded else KEPT}")


async def _open_line(user_id: str, fields: dict) -> dict:
    """Everything a spent mock does before the call: the prompt, the signed
    URL, the row. Spent from the first line: it ends with a live row, or in
    one of the two outright refunds."""
    started = time.monotonic()
    record_text = await asyncio.to_thread(_record_text, user_id)
    prompt = prompts.interviewer_prompt(fields["mode"], fields["target"], fields["role"], fields["details"],
                                        record_text)
    opening = prompts.first_message(fields["mode"], fields["target"], fields["role"])

    try:
        line = await elevenlabs.signed_url()
        signed, conversation_id = line["signed_url"], line["conversation_id"]
        if not (isinstance(signed, str) and signed and isinstance(conversation_id, str)
                and 1 <= len(conversation_id) <= CONVERSATION_ID_MAX):
            raise elevenlabs.ElevenLabsError("no usable signed url")
    except Exception as exc:
        # The type only: the URL carries a signature.
        refunded = await asyncio.to_thread(_refund_outright, user_id)
        logger.warning(f"[interview] no signed URL for {user_id} ({type(exc).__name__}), "
                       f"{'given back' if refunded else 'NOT given back'}")
        raise AgentError(502, "voice_unavailable", f"{VOICE_UNAVAILABLE} {GAVE_BACK if refunded else KEPT}")

    mock_id = str(uuid.uuid4())
    now = _iso(_now())
    row = await asyncio.to_thread(_insert_mock, user_id, {
        "id": mock_id, **fields, "status": "live", "conversation_id": conversation_id,
        "started_at": now, "updated_at": now,
    })
    if not row:
        refunded = await asyncio.to_thread(_refund_outright, user_id)
        logger.info(f"[interview] mock for {user_id} not stored, {'given back' if refunded else 'NOT given back'}")
        raise AgentError(500, "server_error", f"{SERVER_ERROR} {GAVE_BACK if refunded else KEPT}")

    logger.info(f"[interview] {user_id} started mock {mock_id} ({fields['mode']}), "
                f"{time.monotonic() - started:.1f} s")
    return {
        "mock": _public(row, transcript=False),
        "signed_url": signed,
        "overrides": {"agent": {"prompt": {"prompt": prompt}, "firstMessage": opening}},
        "dynamic_variables": {"mock_id": mock_id},
        "max_seconds": MOCK_SECONDS,
        "warn_seconds": WARN_SECONDS,
    }


# ── Finish ────────────────────────────────────────────────────────────────────

def _answer(state: str, row: Optional[dict] = None, message: Optional[str] = None,
            gave_back: bool = False, *, new: bool = False) -> dict:
    """finish_mock's reply. "_new" is for the router only (it sends the
    analytics event once, when this request settled the mock) and is taken out
    before the reply leaves."""
    return {"status": state, "mock": _public(row) if row else None, "message": message,
            "gave_back": gave_back, "_new": new}


def _settled(row: dict) -> dict:
    """A mock that was already settled, as it is. "refunded" is only ever
    written once its give-back went through, so it says so."""
    state = row.get("status")
    if state == "refunded" and row.get("refund_reason"):
        return _answer(state, row, GAVE_BACK, True)
    if state == "no_feedback" and row.get("transcript"):
        return _answer(state, row, FEEDBACK_FAILED)
    return _answer(state, row)


async def finish_mock(user_id: str, mock_id) -> dict:
    """Finish a mock: fetch the call, screen it, store it, read it. Idempotent:
    a settled mock comes back as it is, and a mock another request is working
    on comes back "pending". Returns {"status", "mock", "message",
    "gave_back"}."""
    _require_enabled()
    mock_id = _uuid(mock_id, "not_found", NOT_FOUND)
    row = await asyncio.to_thread(_mock_row, user_id, mock_id)
    if not row:
        raise AgentError(404, "not_found", NOT_FOUND)
    if row.get("status") in SETTLED:
        return _settled(row)
    claimed = await asyncio.to_thread(_claim, user_id, mock_id)
    if not claimed:
        return _answer("pending", row)
    try:
        return await _finish(user_id, claimed)
    except Exception as exc:
        # Unexpected: the claim goes stale and the next visit takes it over.
        logger.error(f"[interview] finishing mock {mock_id} of {user_id} broke: {type(exc).__name__}")
        return _answer("pending", claimed)


async def _finish(user_id: str, row: dict) -> dict:
    mock_id, stamp = row["id"], row["claimed_at"]
    started = time.monotonic()

    # A claim that finds work already done picks it up where it stopped.
    if row.get("refund_reason"):
        # The refund was already made (or tried) under an earlier claim: never twice.
        done = await asyncio.to_thread(_write, user_id, mock_id, stamp, {"status": "refunded", "claimed_at": None})
        return _answer("refunded", done or row, GAVE_BACK, True, new=bool(done))
    stored = _transcript(row.get("transcript"))
    if stored and row.get("student_words") is not None:
        # Stored, and the copy on ElevenLabs deleted: straight on to the feedback.
        return await _score(user_id, row, stored, started)

    try:
        remote = await elevenlabs.fetch_conversation(row["conversation_id"])
    except Exception as exc:
        logger.warning(f"[interview] could not fetch the call of mock {mock_id} for {user_id}: {type(exc).__name__}")
        await asyncio.to_thread(_release, user_id, mock_id, stamp)
        return _answer("pending", row)

    since = _since(row)
    if remote is None:
        if rules.refundable(False, since, 0) == "no_call":
            return await _refund(user_id, row, "no_call", [], None, started)
        await asyncio.to_thread(_release, user_id, mock_id, stamp)
        return _answer("pending", row)
    if not isinstance(remote, dict) or remote.get("status") in RUNNING:
        await asyncio.to_thread(_release, user_id, mock_id, stamp)
        return _answer("pending", row)
    ours = _our_agent()
    if (ours and remote.get("agent_id") != ours) or (remote.get("mock_id") not in (None, mock_id)):
        # Not a conversation of this mock: nothing of it is read or kept.
        logger.error(f"[interview] mock {mock_id} of {user_id} points at a conversation that is not its own")
        done = await asyncio.to_thread(_write, user_id, mock_id, stamp, {
            "status": "no_feedback", "claimed_at": None, "transcript": [], "ended_at": _iso(_now())})
        return _answer("no_feedback", done or row, new=bool(done))

    transcript = _transcript(remote.get("turns"))
    words = rules.word_count(transcript)
    duration = _int(remote.get("duration_s"), 0) if remote.get("duration_s") is not None else None
    duration = max(0, min(DURATION_MAX, duration)) if duration is not None else None

    if any(rules.crisis_now(text) for _, text in rules.student_lines(transcript)):
        return await _handoff(user_id, row)

    if rules.refundable(True, since, words) == "too_short":
        return await _refund(user_id, row, "too_short", transcript, duration, started, words=words)

    kept = await _store(user_id, row, transcript, words, duration)
    if not kept:
        await asyncio.to_thread(_release, user_id, mock_id, stamp)
        return _answer("pending", row)
    return await _score(user_id, kept, transcript, started)


async def _store(user_id: str, row: dict, transcript: list[dict], words: int,
                 duration: Optional[int]) -> Optional[dict]:
    """Write the transcript onto the row, then delete the copy on ElevenLabs
    (best effort: the agent keeps transcripts at most 7 days as a backstop).
    The row as written, or None when it could not be (the remote copy is then
    left alone, so a later finish can fetch it again)."""
    kept = await asyncio.to_thread(_write, user_id, row["id"], row["claimed_at"], {
        "transcript": transcript, "student_words": words, "duration_s": duration, "ended_at": _iso(_now()),
    })
    if kept:
        await _forget_remote(row.get("conversation_id"))
    return kept


async def _forget_remote(conversation_id) -> None:
    """Delete the conversation on ElevenLabs. Never raises."""
    if not conversation_id:
        return
    try:
        await elevenlabs.delete_conversation(conversation_id)
    except Exception as exc:
        logger.warning(f"[interview] could not delete a conversation on ElevenLabs: {type(exc).__name__}")


async def _refund(user_id: str, row: dict, reason: str, transcript: list[dict], duration: Optional[int],
                  started: float, *, words: int = 0) -> dict:
    """The call never really happened. The reason is written first (under the
    claim), then the mock is given back through mock_back, then the row is
    settled: a refund made here is never made again, whatever fails after it.

    Given back: "refunded", with no transcript. A too-short call is never
    read by a model, so the model's safety flag never sees it: what the
    student said is not kept in case the code's crisis screen missed it (a
    student who says something alarming and hangs up is exactly this call).
    Not given back (mock_back spent, or the refund failed): a too-short call
    carries on as an ordinary thin mock; a call that never happened becomes
    "no_feedback" with nothing to read (and so no Retry). Either way the
    student is told it still counted."""
    mock_id, stamp = row["id"], row["claimed_at"]
    marked = await asyncio.to_thread(_write, user_id, mock_id, stamp, {
        "refund_reason": reason, "transcript": [], "student_words": words if transcript else None,
        "duration_s": duration, "ended_at": _iso(_now()),
    })
    if not marked:
        await asyncio.to_thread(_release, user_id, mock_id, stamp)
        return _answer("pending", row)
    await _forget_remote(row.get("conversation_id"))

    refunded = await asyncio.to_thread(_give_back, user_id)
    took = time.monotonic() - started
    logger.info(f"[interview] mock {mock_id} of {user_id} was {reason}, "
                f"{'given back' if refunded else 'NOT given back'}, {took:.1f} s")
    if refunded:
        done = await asyncio.to_thread(_write, user_id, mock_id, stamp, {"status": "refunded", "claimed_at": None})
        return _answer("refunded", done or marked, GAVE_BACK, True, new=bool(done))

    if reason == "too_short":
        # Read by the model after all (its safety flag included), so stored as a mock that counted.
        kept = await asyncio.to_thread(_write, user_id, mock_id, stamp, {"refund_reason": None,
                                                                         "transcript": transcript})
        if not kept:
            return _answer("pending", marked)
        return await _score(user_id, kept, transcript, started, extra=KEPT)
    done = await asyncio.to_thread(_write, user_id, mock_id, stamp, {
        "status": "no_feedback", "refund_reason": None, "claimed_at": None})
    return _answer("no_feedback", done or marked, KEPT, new=bool(done))


async def _handoff(user_id: str, row: dict, *, remote: bool = True) -> dict:
    """The student said they are in danger now. Nothing is kept: the row and
    the copy on ElevenLabs are deleted (remote=False when it already was), and
    the mock goes back outright. No ids in the log lines, and the router sends
    no event."""
    if not await asyncio.to_thread(_delete_mock, user_id, row["id"]):
        await asyncio.to_thread(_empty_mock, user_id, row["id"])
    if remote:
        await _forget_remote(row.get("conversation_id"))
    refunded = await asyncio.to_thread(_refund_outright, user_id)
    logger.info(f"[interview] a mock ended in the hand-off, {'given back' if refunded else 'NOT given back'}")
    return {"status": "handoff", "mock": None, "message": rules.HANDOFF, "gave_back": False, "_new": False}


async def _feedback(user_id: str, row: dict, transcript: list[dict], thin: bool) -> Optional[dict]:
    """The model call, under its deadline. Its answer, or None when it failed,
    timed out or came back in a shape that cannot be stored."""
    try:
        found = await asyncio.wait_for(write_feedback(
            row.get("mode"), row.get("target"), row.get("role"), row.get("details") or "", transcript, thin=thin,
        ), FEEDBACK_DEADLINE)
    except asyncio.TimeoutError:
        logger.warning(f"[interview] feedback on mock {row['id']} for {user_id} passed {FEEDBACK_DEADLINE:.0f} s")
        return None
    except Exception as exc:
        # The type only: an error raised around a prompt can carry the transcript.
        logger.error(f"[interview] feedback on mock {row['id']} failed for {user_id}: {type(exc).__name__}")
        return None
    if not isinstance(found, dict):
        return None
    if found.get("safety") is True:
        return {"safety": True}
    if not isinstance(found.get("feedback"), dict):
        return None
    scores = found.get("scores") if isinstance(found.get("scores"), dict) and not thin else None
    return {"safety": False, "feedback": found["feedback"], "scores": scores}


async def _score(user_id: str, row: dict, transcript: list[dict], started: float, *,
                 extra: Optional[str] = None) -> dict:
    """The feedback call and its row: "done", "no_feedback", or the hand-off.
    `extra` is added to the reply's message (KEPT, for a short call that still
    counted)."""
    mock_id, stamp = row["id"], row["claimed_at"]
    words = rules.word_count(transcript)
    thin = words < SCORE_WORDS
    # Not a word from the student (a short call that still counted): nothing
    # to read, so no call, and the tries are set to the cap so no Retry is offered.
    found = await _feedback(user_id, row, transcript, thin) if words else None
    took = time.monotonic() - started

    if found and found.get("safety"):
        return await _handoff(user_id, row, remote=False)          # deleted when the transcript was stored
    if not found:
        tries = min(5, _int(row.get("feedback_tries")) + 1) if words else FEEDBACK_TRIES_MAX
        done = await asyncio.to_thread(_write, user_id, mock_id, stamp, {
            "status": "no_feedback", "claimed_at": None, "feedback_tries": tries})
        logger.info(f"[interview] mock {mock_id} of {user_id}: no feedback (try {tries}), {took:.1f} s")
        if not done:
            return _answer("pending", row)
        return _answer("no_feedback", done, " ".join(m for m in (FEEDBACK_FAILED, extra) if m), new=True)

    feedback = dict(found["feedback"])
    feedback["thin"] = thin
    done = await asyncio.to_thread(_write, user_id, mock_id, stamp, {
        "status": "done", "claimed_at": None, "feedback": feedback, "scores": found["scores"]})
    logger.info(f"[interview] mock {mock_id} of {user_id}: {words} student words, "
                f"{len(feedback.get('questions') or [])} questions, {len(feedback.get('habits') or [])} habits, "
                f"scored={found['scores'] is not None}, {took:.1f} s")
    if not done:
        return _answer("pending", row)
    return _answer("done", done, extra, new=True)


# ── Retry ─────────────────────────────────────────────────────────────────────

def _claim_retry(user_id: str, mock_id: str, tries: int) -> Optional[dict]:
    """Move a no_feedback row to "scoring" for a retry. Conditional on the
    count of tries this request read, so two retries at once take one turn."""
    stamp = _iso(_now())
    return _first(
        _sb().from_("interview_mocks").update({"status": "scoring", "claimed_at": stamp, "updated_at": stamp})
        .eq("id", mock_id).eq("user_id", user_id).eq("status", "no_feedback").eq("feedback_tries", tries)
        .execute().data or []
    )


async def retry_feedback(user_id: str, mock_id) -> dict:
    """Read a mock again whose feedback could not be written. Free, and capped
    at FEEDBACK_TRIES_MAX per mock. Returns finish_mock's shape."""
    _require_enabled()
    mock_id = _uuid(mock_id, "not_found", NOT_FOUND)
    row = await asyncio.to_thread(_mock_row, user_id, mock_id)
    if not row:
        raise AgentError(404, "not_found", NOT_FOUND)
    transcript = _transcript(row.get("transcript"))
    if row.get("status") != "no_feedback" or not transcript:
        raise AgentError(409, "not_retryable", NOT_RETRYABLE)
    tries = _int(row.get("feedback_tries"))
    if tries >= FEEDBACK_TRIES_MAX:
        raise AgentError(429, "no_retries", NO_RETRIES)
    claimed = await asyncio.to_thread(_claim_retry, user_id, mock_id, tries)
    if not claimed:
        raise AgentError(409, "busy", BUSY)
    try:
        return await _score(user_id, claimed, transcript, time.monotonic())
    except Exception as exc:
        logger.error(f"[interview] retrying mock {mock_id} of {user_id} broke: {type(exc).__name__}")
        return _answer("pending", claimed)
