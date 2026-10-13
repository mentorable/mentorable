"""
Quill's service: the database, the budgets and the caps around every call.
talk.py, topics.py and review.py each make one kind of model call and know
nothing of the database; rules.py holds every check a line Quill writes must
pass; usage.py keeps the budgets. The endpoints in app/routers/agents.py only
translate HTTP.

The promise. Quill never writes, rewrites, corrects or edits any part of an
essay. rules.py and review.py keep it for what the model says (a review has no
field for essay text, and every line is checked in code). This file keeps it
for the database: an essay is inserted once, empty, and no code here ever
updates an essays row. The text is the student's, written from the page.

Every query filters on user_id as well as the row id: the backend runs as the
service role, which bypasses RLS, so that filter is the only thing keeping one
student's request away from another student's essays. The Supabase client is
blocking, so every call from async code goes through asyncio.to_thread.

Budgets (registry.py, all lifetime): 8 reviews, 3 reads of the record for
topic areas, 24 brainstorm turns. Everything a request can be refused for is
checked before a unit is taken, and a unit is taken before the model is
called, so two clicks cannot share one.
  review  given back when the call fails, times out, comes back unusable or
          cannot be stored, and when the writing gets the hand-off instead
  topics  given back when the call fails or finds nothing new
  talk    one per model turn; given back when the model could not take part.
          A spent talk budget never refuses: the talk just ends.
Each paid run ends in one place that gives its unit back, so a unit goes back
at most once, and "given back" is only said when the refund went through.
Giving back has a ceiling of its own (_give_back, and the "_back" budgets in
registry.py): past it a run that does not land keeps its unit, and the student
is told it still counted. Without that, a run that never lands would be a
free model call every time it was repeated.
The caps on essays (8) and saved versions per essay (30) are counts, not
budgets. Students cannot insert an essay themselves (no grant), so the count
here is the only one.

A review reads one snapshot: the draft is copied to essay_versions before the
model is called, and the notes point into that copy. A review that does not
land (a failure, a timeout, a hand-off) deletes its snapshot again, so the
versions list only ever shows text Quill read or the student saved. A review
also keeps the prompt it judged (prompt_key and prompt_text on its row): the
essay's prompt is the student's to change, and "nothing has changed since
Quill last read this" means the same text against the same prompt.

The hand-off. Writing that says the student is in danger now gets
rules.HANDOFF (a trusted adult, 988) instead of a review, or
rules.TALK_HANDOFF instead of a next question. It stores nothing: no snapshot,
no review, no card. The check in code comes before anything is spent, so it
costs nothing; a hand-off the model raises gives its unit back like any other
run that did not land. It leaves no record of whose writing it was either:
its log lines carry no ids, and the router sends no analytics event for it.

Privacy. Essay text, prompts, Quill's notes, brainstorm questions and answers
are never logged, never put in memory and never shown to chat (which gets
titles, statuses, word counts and the names of topic areas, and selects
nothing else: see chat/load_context.py). Log lines carry ids, counts and
timings. A database error is logged by its type and code only, because
Postgres puts the failing row in a constraint error, and here the row is the
essay. The record goes to the model without the student's name on it: the
"Name:" line is dropped from its summary and the name is taken out of the
rest of it (the interview's notes can use it), the way Beaker's and Talon's
research does it; full_name is left out of the rows; and the prompt that
lists the interview's notes leaves it out of those too (_record_for_model).
Nothing the student wrote in Quill (a draft, a prompt, an answer, a card) is
searched for a name or changed.
"""
from __future__ import annotations

import asyncio
import logging
import time
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Optional

from app.db.supabase import get_supabase
from app.nodes.agents import usage
from app.nodes.agents.essay import review as reviewer, rules, talk as talker, topics as topic_finder
from app.nodes.agents.names import research_record
from app.nodes.agents.outreach.service import AgentError
from app.nodes.agents.registry import get_agent
from app.nodes.quest.common import clean_text, student_context

logger = logging.getLogger(__name__)

AGENT = "essay"

ESSAYS_MAX = 8                       # essays per student
VERSIONS_MAX = 30                    # saved versions per essay
REVIEW_DEADLINE = 90.0               # one review: the call, its checks and its one retry
TOPICS_DEADLINE = 60.0               # one read of the record for areas
TALK_DEADLINE = 30.0                 # one brainstorm turn; past it the talk just ends

TITLE_MAX = 120
NAME_MAX = 200                       # of profiles.full_name, when it is looked for in the interview's notes
PROMPT_MIN, PROMPT_MAX = 10, 1500
SCHOOL_MIN, SCHOOL_MAX = 2, 200
PROMPT_KEYS = ("1", "2", "3", "4", "5", "6", "7")
SUMMARY_MAX = 400
OTHER_BODY_MAX = 6000                # how much of another essay a review sees, for overlap only
AREA_MIN, AREA_MAX = 2, 80
NOTES_MAX = 6000
AREAS_MAX = 5
EVIDENCE_MAX, EVIDENCE_CHARS = 6, 300
QUESTIONS_MAX, QUESTION_CHARS = 4, 200
EVIDENCE_KINDS = ("activity", "award", "course", "major", "theme", "voice")
# The parts of profiles.narrative that hold words. {} (the interview was
# skipped) and a narrative of empty fields both count as empty.
NARRATIVE_WORDS = ("theme", "theme_evidence", "concerns", "gaps", "student_voice", "summary")

# What the page gets of a row: every column but this.
HIDDEN_COLUMNS = ("user_id",)

# ── Copy (plain, no em dashes: the student reads every one) ───────────────────

NOT_AVAILABLE = "Quill is not available right now."
BAD_KIND = "Pick a personal statement or a supplement."
BAD_SCHOOL = "Pick the school this essay is for."
BAD_PROMPT = f"Paste the school's prompt, {PROMPT_MIN} to {PROMPT_MAX} characters."
BAD_LIMIT = "Set the word limit, from {low} to {high}."
BAD_START = "Pick where you'd like to start."
ESSAYS_FULL = "You have {limit} essays, the most Quill keeps. Delete one to start another."
CREATE_BUSY = "Quill is already setting up an essay for you. Give it a moment."
NO_ESSAY = "That essay was not found. It may have been deleted."
EMPTY = "There is nothing to save yet."
SAVED_ALREADY = "This is already saved as your latest version."
VERSIONS_FULL = "This essay has {limit} saved versions. Delete one to save another."
SAVE_BUSY = "Quill is already saving this one. Give it a moment."
NO_PROMPT = "Pick the prompt you are answering first."
TOO_SHORT = "Write at least {words} words before asking Quill to read it."
UNCHANGED = "Nothing has changed since Quill last read this."
BUSY = "Quill is already reading for you. Give it a moment."
NO_REVIEWS = "You've used all {limit} reviews this demo allows. Your essays and notes are still here."
BUDGET_UNAVAILABLE = "Quill couldn't check your limits just now. Try again in a minute."
REVIEW_FAILED = "Quill couldn't finish reading just now. Try again in a minute."
TIMED_OUT = "Quill took too long on this one and stopped."
GAVE_BACK = " Your review was given back."
# Said when the unit did not go back (the give-backs are used up, or the
# refund failed), so a count that drops after a failure is never a surprise.
KEPT = " It still counted as one of your reviews."
THIN_RECORD = "Quill doesn't have enough on your record to suggest areas yet. Try a brainstorm instead."
NO_TOPIC_FINDS = ("You've used all {limit} searches of your record this demo allows. You can still brainstorm or "
                  "add your own ideas.")
TOPICS_FAILED = "Quill couldn't read your record just now. Try again in a minute."
NOTHING_NEW = "Quill didn't find an area that isn't already on your board."
SEARCH_GAVE_BACK = " Your search was given back."
SEARCH_KEPT = " It still counted as one of your searches."
TALK_BUSY = "Quill is already on your last answer. Give it a moment."
# A talk that ended without the model and left no card here (nothing was
# answered yet, or the card could not be written and the page will keep the
# answers itself): talk.FALLBACK_LINE says the answers are saved on a card, so
# it is only sent when this service saved one.
LEFT_THERE = "Let's leave it there for now."
PS_TITLE = "Personal statement"
SERVER_ERROR = "Something went wrong. Try again."

# How a paid run that did not land is answered: (HTTP status, message).
ENDINGS = {
    "review_failed": (502, REVIEW_FAILED),
    "topics_failed": (502, TOPICS_FAILED),
    "timed_out": (504, TIMED_OUT),
    "nothing_new": (409, NOTHING_NEW),
    "no_essay": (404, NO_ESSAY),
    "server_error": (500, SERVER_ERROR),
}


# ── Small helpers ─────────────────────────────────────────────────────────────

def _sb():
    return get_supabase()


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _first(rows):
    return rows[0] if rows else None


def _int(value, default: int = 0) -> int:
    if isinstance(value, bool):
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _whole(value) -> Optional[int]:
    """A whole number as the page may send it (12, 12.0 or "12"), else None."""
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value) if value.is_integer() else None
    if isinstance(value, str) and value.strip().isdigit():
        # "²" and "①" are digits to isdigit() and not to int(), and int()
        # refuses a number thousands of digits long: each is "not a number"
        # here (the caller's 422), never an error of ours.
        try:
            return int(value.strip())
        except ValueError:
            return None
    return None


def _clip(value, limit: int) -> str:
    """The student's own words on one line, cut to `limit`, never rewritten."""
    if not isinstance(value, str):
        return ""
    return " ".join(value.replace("\x00", "").split())[:limit].strip()


def _block(value) -> str:
    """The student's own words with their line breaks kept (a pasted prompt):
    plain line ends, no blank edges. Not cut here: the caller checks the length."""
    if not isinstance(value, str):
        return ""
    return value.replace("\x00", "").replace("\r\n", "\n").replace("\r", "\n").strip()


def _uuid(value, code: str, message: str) -> str:
    try:
        return str(uuid.UUID(str(value)))
    except (ValueError, TypeError, AttributeError):
        raise AgentError(404, code, message)


def _own_id(value) -> Optional[str]:
    """An id the request may name but need not (a topic, a College List row):
    None when it is missing or not an id, and the request goes on without it."""
    if not value:
        return None
    try:
        return str(uuid.UUID(str(value)))
    except (ValueError, TypeError, AttributeError):
        return None


def _why(exc: Exception) -> str:
    """A database error for the log, without its details: a constraint error
    carries the whole failing row, and here the row is an essay."""
    code = getattr(exc, "code", None)
    return f"{type(exc).__name__}" + (f" {code}" if code else "")


def _parent_gone(exc: Exception) -> bool:
    """A foreign-key refusal: the essay (or the version) this row hangs from was
    deleted while Quill worked."""
    text = f"{getattr(exc, 'code', '')} {exc}".lower()
    return "23503" in text or "foreign key" in text


def _limit(kind: str) -> int:
    return get_agent(AGENT).budgets[kind][1]


def _public(row: Optional[dict]) -> dict:
    """A row as the page sees it: every column but user_id."""
    return {k: v for k, v in (row or {}).items() if k not in HIDDEN_COLUMNS}


def _body(essay: dict) -> str:
    return essay.get("body") if isinstance(essay.get("body"), str) else ""


def _nameless(record_text) -> str:
    """The record as prompt text, without the student's name: nothing Quill
    does needs it, so it is not sent. The "Name:" line goes, and the name is
    taken out of the rest too, as a name only (research_record, the same
    function Beaker's and Talon's research prompts use): the through-line and
    the "who they are" line were written by a model that was shown the name."""
    return research_record(str(record_text or ""))


def _nameless_rows(record) -> dict:
    """The record's rows for the code checks, without profiles.full_name."""
    record = record if isinstance(record, dict) else {}
    profile = record.get("profile") if isinstance(record.get("profile"), dict) else {}
    return {**record, "profile": {k: v for k, v in profile.items() if k != "full_name"}}


def _record_for_model(user_id: str, *, strict: bool = False) -> tuple[str, dict, str]:
    """The record as Quill's calls get it: (the summary without the student's
    name, the rows without full_name, the name itself). The name is handed on
    only to prompts.areas_prompt, which lists the interview's notes from the
    rows and leaves it out of them.

    strict: a table that cannot be read raises instead of coming back empty.
    A review and a read of the record for areas ask for it: told an unread
    record was an empty one, a review would say "your record has no
    activities or awards", and both would be paid for. Sync, and run on a
    worker thread, so taking the name out is off the event loop too."""
    text, record = student_context(user_id, strict=strict)
    profile = record.get("profile") if isinstance(record, dict) and isinstance(record.get("profile"), dict) else {}
    if strict and not profile and _has_profile(user_id):
        # The loader carries on without the profile when that one read fails,
        # strict or not. The interview's notes live there, so here an empty
        # profile with a row behind it is a failed read like any other. (No
        # row at all is a student with nothing on their profile yet.)
        raise RuntimeError("the profile could not be read")
    name = _clip(profile.get("full_name"), NAME_MAX)
    return _nameless(text), _nameless_rows(record), name


def _has_profile(user_id: str) -> bool:
    return bool(_sb().from_("profiles").select("id").eq("id", user_id).limit(1).execute().data)


# One paid run at a time per student (a review, or a read of the record), one
# brainstorm turn, one essay being created, and one save at a time per essay.
# The service runs as a single process (render.yaml), so this in-process guard
# is enough to stop a double click spending two reviews or making a ninth
# essay; the database still guards the budgets on its own.
_HELD: set[tuple] = set()


@contextmanager
def _busy(user_id: str, *what: str, message: str = BUSY):
    key = (user_id, *what)
    if key in _HELD:
        raise AgentError(409, "busy", message)
    _HELD.add(key)
    try:
        yield
    finally:
        _HELD.discard(key)


def _require_enabled() -> None:
    if not get_agent(AGENT).enabled:
        raise AgentError(404, "not_available", NOT_AVAILABLE)


# ── Budgets ───────────────────────────────────────────────────────────────────

async def _spend(user_id: str, kind: str) -> Optional[int]:
    """Take one unit of a budget. The count after taking it (0 under the dev
    bypass, which counts nothing), or None when the budget is spent. A 503 when
    it cannot be checked: a limit the student has not reached is never
    reported spent. Callers test `is None`, since 0 is a unit taken."""
    try:
        answer = await asyncio.to_thread(usage.bump, user_id, AGENT, kind)
    except usage.Unavailable:
        raise AgentError(503, "budget_unavailable", BUDGET_UNAVAILABLE)
    if not answer.get("allowed"):
        return None
    return max(0, _int(answer.get("used")))


def _usage(user_id: str, kind: str, known: Optional[int] = None) -> Optional[dict]:
    """{"used", "limit", "left"} for a reply. Read fresh; when that fails,
    worked out from `known` (the count this request's own spend returned, less
    what it gave back), so a counter that cannot be read never turns finished
    work into an error. None only when there is nothing to go on."""
    try:
        return usage.summary(user_id, AGENT, kind)
    except Exception as exc:
        logger.warning(f"[essay] could not read the {kind} budget of {user_id}: {_why(exc)}")
    if known is None:
        return None
    limit = _limit(kind)
    used = max(0, min(limit, known))
    return {"used": used, "limit": limit, "left": limit - used}


def _give_back(user_id: str, kind: str) -> bool:
    """Return the unit of a paid run that did not land. True only when it
    really went back.

    Each give-back is counted first, in a budget of its own that is never
    given back ("<kind>_back", registry.py). Once that is spent the unit stays
    spent: a run that never lands (a draft that trips the checks every time,
    a hand-off, a record with nothing new in it) would otherwise be a free
    model call every time it was repeated. A count that cannot be read holds
    nothing back: a limit that could not be checked is not a limit reached.
    Sync (two database calls): async callers use asyncio.to_thread."""
    try:
        if not usage.bump(user_id, AGENT, f"{kind}_back").get("allowed"):
            return False
    except usage.Unavailable:
        pass
    return usage.refund(user_id, AGENT, kind)


def _ending(outcome: str, refunded: bool, gave_back: str, kept: str) -> AgentError:
    """The refusal for a paid run that did not land. It says the unit went
    back only when it did, and that it still counted when it did not."""
    status_code, message = ENDINGS[outcome]
    return AgentError(status_code, outcome, message + (gave_back if refunded else kept))


# ── Rows ──────────────────────────────────────────────────────────────────────
# Sync, one query each, every one scoped by user_id. Reads raise when the
# database cannot be reached (the caller's request then fails as a whole);
# writes that can carry essay text catch their own errors and log the type only.

def _essay_row(user_id: str, essay_id: str) -> Optional[dict]:
    return _first(
        _sb().from_("essays").select("*").eq("id", essay_id).eq("user_id", user_id)
        .limit(1).execute().data or []
    )


def _count_essays(user_id: str) -> int:
    rows = (_sb().from_("essays").select("id").eq("user_id", user_id)
            .limit(ESSAYS_MAX * 4).execute().data or [])
    return len(rows)


def _delete_essay(user_id: str, essay_id: str) -> None:
    try:
        _sb().from_("essays").delete().eq("id", essay_id).eq("user_id", user_id).execute()
    except Exception as exc:
        logger.error(f"[essay] could not remove essay {essay_id} of {user_id}: {_why(exc)}")


def _college_row(user_id: str, college_id: str) -> Optional[dict]:
    return _first(
        _sb().from_("college_list_items").select("id, name").eq("id", college_id).eq("user_id", user_id)
        .limit(1).execute().data or []
    )


def _topic_row(user_id: str, topic_id: str) -> Optional[dict]:
    return _first(
        _sb().from_("essay_topics").select("*").eq("id", topic_id).eq("user_id", user_id)
        .limit(1).execute().data or []
    )


def _version_ids(user_id: str, essay_id: str, *, oldest_first: bool = False) -> list[str]:
    rows = (_sb().from_("essay_versions").select("id").eq("essay_id", essay_id).eq("user_id", user_id)
            .order("created_at", desc=not oldest_first).limit(VERSIONS_MAX * 3).execute().data or [])
    return [r["id"] for r in rows if r.get("id")]


def _version_body(user_id: str, version_id: str) -> Optional[str]:
    row = _first(
        _sb().from_("essay_versions").select("body").eq("id", version_id).eq("user_id", user_id)
        .limit(1).execute().data or []
    )
    return row.get("body") if row else None


def _insert_version(user_id: str, essay_id: str, body: str, source: str) -> tuple[Optional[dict], bool]:
    """A saved copy of the draft as it is now. (row, essay gone): the row is
    None when it could not be written, and the flag says the essay was deleted
    meanwhile."""
    try:
        row = _first(_sb().from_("essay_versions").insert({
            "essay_id": essay_id, "user_id": user_id, "body": body,
            "word_count": rules.word_count(body), "source": source,
        }).execute().data or [])
    except Exception as exc:
        logger.error(f"[essay] could not save a version of {essay_id} for {user_id}: {_why(exc)}")
        return None, _parent_gone(exc)
    return row, False


def _delete_version(user_id: str, version_id: str) -> bool:
    """Remove one saved version (and, by the foreign key, any review of it).
    Tried twice; never raises. False when it is still there."""
    for attempt in (1, 2):
        try:
            _sb().from_("essay_versions").delete().eq("id", version_id).eq("user_id", user_id).execute()
            return True
        except Exception as exc:
            level = logger.error if attempt == 2 else logger.warning
            level(f"[essay] could not remove version {version_id} of {user_id} (attempt {attempt}): {_why(exc)}")
    return False


def _same_prompt(one, other) -> bool:
    """Two prompts with the same words, however they are spaced (the page
    tells them apart the same way)."""
    return _clip(one, PROMPT_MAX * 2) == _clip(other, PROMPT_MAX * 2)


def _already_read(user_id: str, essay_id: str, body: str, prompt_text: str) -> bool:
    """Whether the newest review of this essay read exactly this text against
    this prompt. A review remembers the prompt it judged (prompt_text on its
    row), so the same draft under a different prompt is a new read. A review
    with no prompt on its row is told apart by the text alone."""
    last = _first(
        _sb().from_("essay_reviews").select("version_id, prompt_text").eq("essay_id", essay_id)
        .eq("user_id", user_id).order("created_at", desc=True).limit(1).execute().data or []
    )
    if not last or not last.get("version_id"):
        return False
    judged = last.get("prompt_text") if isinstance(last.get("prompt_text"), str) else ""
    if judged.strip() and not _same_prompt(judged, prompt_text):
        return False
    return _version_body(user_id, last["version_id"]) == body


def _other_essays(user_id: str, essay_id: str) -> list[dict]:
    """The student's other essays, for the overlap check only: id, title and
    the start of the text. This essay and the empty ones are left out."""
    rows = (_sb().from_("essays").select("id, title, body").eq("user_id", user_id)
            .order("updated_at", desc=True).limit(ESSAYS_MAX * 2).execute().data or [])
    out = []
    for row in rows:
        text = _body(row)
        if row.get("id") == essay_id or not text.strip():
            continue
        out.append({"id": row.get("id"), "title": _clip(row.get("title"), TITLE_MAX), "body": text[:OTHER_BODY_MAX]})
    return out


# ── Status ────────────────────────────────────────────────────────────────────

def _has_narrative(value) -> bool:
    if not isinstance(value, dict):
        return False
    for key in NARRATIVE_WORDS:
        part = value.get(key)
        if isinstance(part, str) and part.strip():
            return True
        if isinstance(part, list) and any(isinstance(x, str) and x.strip() for x in part):
            return True
    return False


def _record_shape(user_id: str) -> dict:
    """How much of a record there is for Quill to read (section 3.5). Thin
    means no activities, no awards and an empty narrative: nothing to find
    areas in, so the page offers a brainstorm instead. Raises when it cannot be
    read, so "could not read" is never mistaken for "nothing there"."""
    def count(table: str) -> int:
        return len(_sb().from_(table).select("id").eq("user_id", user_id).limit(200).execute().data or [])

    activities, awards = count("student_activities"), count("student_awards")
    profile = _first(
        _sb().from_("profiles").select("narrative").eq("id", user_id).limit(1).execute().data or []
    ) or {}
    told = _has_narrative(profile.get("narrative"))
    return {"thin": not (activities or awards or told), "activities": activities, "awards": awards,
            "has_narrative": told}


def _record_for_status(user_id: str) -> dict:
    """_record_shape for the status call, never fatal. A record that cannot be
    read is not called thin: the page keeps its button, and find_topics checks
    again before it spends anything."""
    try:
        return _record_shape(user_id)
    except Exception as exc:
        logger.warning(f"[essay] could not read the record of {user_id}: {_why(exc)}")
        return {"thin": False, "activities": 0, "awards": 0, "has_narrative": False}


async def status(user_id: str, tz_hint: Optional[str] = None) -> dict:
    """What Quill's pages need before anything is spent (section 3.5). tz_hint
    is taken for the same call shape as the other agents and not used: nothing
    here is counted in the student's own day."""
    def load() -> dict:
        essays = _count_essays(user_id)
        return {
            "reviews": usage.summary(user_id, AGENT, "review"),
            "topics": usage.summary(user_id, AGENT, "topics"),
            "talk": usage.summary(user_id, AGENT, "talk"),
            "essays": {"used": min(essays, ESSAYS_MAX), "limit": ESSAYS_MAX, "left": max(0, ESSAYS_MAX - essays)},
            "limits": {
                "review_min_words": rules.REVIEW_MIN_WORDS,
                "versions_per_essay": VERSIONS_MAX,
                "talk_questions": talker.MAX_QUESTIONS,
                "body_max": rules.BODY_MAX,
                "ps_min": rules.PS_MIN,
                "ps_max": rules.PS_MAX,
                "limit_min": rules.LIMIT_MIN,
                "limit_max": rules.LIMIT_MAX,
            },
            "record": _record_for_status(user_id),
        }
    return await asyncio.to_thread(load)


# ── Essays ────────────────────────────────────────────────────────────────────

def _prompt_key(value, prompt_text: str) -> Optional[str]:
    """Which of the seven Common App prompts, kept only with its words: the
    backend reads prompt_text alone, so a number without them is "not picked"."""
    key = str(value) if isinstance(value, int) and not isinstance(value, bool) else value
    return key if isinstance(key, str) and key in PROMPT_KEYS and prompt_text else None


async def _own_topic_id(user_id: str, value) -> Optional[str]:
    """topic_id, kept only when it is one of the student's own cards."""
    topic_id = _own_id(value)
    if not topic_id:
        return None
    row = await asyncio.to_thread(_topic_row, user_id, topic_id)
    return row["id"] if row else None


async def _essay_fields(user_id: str, kind: str, body: dict) -> dict:
    """The columns of a new essay from the request (section 3.5). A personal
    statement takes what it is given and falls back to defaults; a supplement
    must name its school, its prompt and its word limit, or it is a 422."""
    if kind == "personal_statement":
        prompt_text = _block(body.get("prompt_text"))[:PROMPT_MAX].strip()      # '' is "not picked yet"
        return {
            "kind": kind,
            "title": _clip(body.get("title"), TITLE_MAX) or PS_TITLE,
            "prompt_key": _prompt_key(body.get("prompt_key"), prompt_text),
            "prompt_text": prompt_text,
            "college_id": None,
            "school_name": "",
            "word_limit": rules.PS_MAX,
            "topic_id": await _own_topic_id(user_id, body.get("topic_id")),
        }

    # A school from their College List (its name is copied from the row), or a
    # typed one. An id that is not a row of theirs is ignored, and the typed
    # name then has to stand on its own.
    college = None
    college_id = _own_id(body.get("college_id"))
    if college_id:
        college = await asyncio.to_thread(_college_row, user_id, college_id)
    school = _clip(college.get("name"), SCHOOL_MAX) if college else _clip(body.get("school_name"), SCHOOL_MAX * 2)
    if not SCHOOL_MIN <= len(school) <= SCHOOL_MAX:
        raise AgentError(422, "bad_school", BAD_SCHOOL)
    prompt_text = _block(body.get("prompt_text"))
    if not PROMPT_MIN <= len(prompt_text) <= PROMPT_MAX:
        raise AgentError(422, "bad_prompt", BAD_PROMPT)
    word_limit = _whole(body.get("word_limit"))
    if word_limit is None or not rules.LIMIT_MIN <= word_limit <= rules.LIMIT_MAX:
        raise AgentError(422, "bad_limit", BAD_LIMIT.format(low=rules.LIMIT_MIN, high=rules.LIMIT_MAX))
    return {
        "kind": kind,
        "title": _clip(body.get("title"), TITLE_MAX) or _clip(f"{school} supplement", TITLE_MAX),
        "prompt_key": None,
        "prompt_text": prompt_text,
        "college_id": college["id"] if college else None,
        "school_name": school,
        "word_limit": word_limit,
        "topic_id": await _own_topic_id(user_id, body.get("topic_id")),
    }


def _new_essay(user_id: str, fields: dict) -> dict:
    """Insert the essay, then count again. The caller holds the student's
    create guard, so in this process the count before it cannot be passed; the
    recount is for a second process, and takes the new row back out if the
    student now has more than the cap."""
    try:
        row = _first(_sb().from_("essays").insert({
            **fields, "user_id": user_id, "updated_at": _iso_now(),
        }).execute().data or [])
    except Exception as exc:
        logger.error(f"[essay] could not create an essay for {user_id}: {_why(exc)}")
        row = None
    if not row:
        raise AgentError(500, "server_error", SERVER_ERROR)
    try:
        over = _count_essays(user_id) > ESSAYS_MAX
    except Exception as exc:
        logger.warning(f"[essay] could not recount the essays of {user_id}: {_why(exc)}")
        over = False
    if over:
        _delete_essay(user_id, row["id"])
        raise AgentError(409, "essays_full", ESSAYS_FULL.format(limit=ESSAYS_MAX))
    return row


async def create_essay(user_id: str, body) -> dict:
    """Start an essay: a personal statement or a supplement (section 3.5).
    Only the backend creates one, so the cap of 8 holds. Returns {"essay"}."""
    _require_enabled()
    body = body if isinstance(body, dict) else {}
    kind = body.get("kind")
    if not isinstance(kind, str) or kind not in rules.KINDS:
        raise AgentError(422, "bad_kind", BAD_KIND)
    with _busy(user_id, "essay", message=CREATE_BUSY):
        if await asyncio.to_thread(_count_essays, user_id) >= ESSAYS_MAX:
            raise AgentError(409, "essays_full", ESSAYS_FULL.format(limit=ESSAYS_MAX))
        fields = await _essay_fields(user_id, kind, body)
        row = await asyncio.to_thread(_new_essay, user_id, fields)
    logger.info(f"[essay] {user_id} started essay {row['id']} ({kind})")
    return {"essay": _public(row)}


# ── Versions ──────────────────────────────────────────────────────────────────

def _save_version(user_id: str, essay_id: str) -> dict:
    essay = _essay_row(user_id, essay_id)
    if not essay:
        raise AgentError(404, "no_essay", NO_ESSAY)
    body = _body(essay)
    if not body.strip():
        raise AgentError(422, "empty", EMPTY)
    ids = _version_ids(user_id, essay_id)
    if ids and _version_body(user_id, ids[0]) == body:
        raise AgentError(409, "unchanged", SAVED_ALREADY)
    if len(ids) >= VERSIONS_MAX:
        raise AgentError(409, "versions_full", VERSIONS_FULL.format(limit=VERSIONS_MAX))
    row, gone = _insert_version(user_id, essay_id, body, "manual")
    if not row:
        raise AgentError(404, "no_essay", NO_ESSAY) if gone else AgentError(500, "server_error", SERVER_ERROR)
    # Counted again, as a new essay is: a review's snapshot may have landed in between.
    try:
        over = len(_version_ids(user_id, essay_id)) > VERSIONS_MAX
    except Exception as exc:
        logger.warning(f"[essay] could not recount the versions of {essay_id} for {user_id}: {_why(exc)}")
        over = False
    if over:
        _delete_version(user_id, row["id"])
        raise AgentError(409, "versions_full", VERSIONS_FULL.format(limit=VERSIONS_MAX))
    return row


async def save_version(user_id: str, essay_id) -> dict:
    """Save the draft as it is now as a version (section 3.5). Free. Returns
    {"version"}."""
    _require_enabled()
    essay_id = _uuid(essay_id, "no_essay", NO_ESSAY)
    with _busy(user_id, "version", essay_id, message=SAVE_BUSY):
        row = await asyncio.to_thread(_save_version, user_id, essay_id)
    logger.info(f"[essay] {user_id} saved a version of {essay_id}: {_int(row.get('word_count'))} words")
    return {"version": _public(row)}


def _trim_versions(user_id: str, essay_id: str, keep_id: str) -> None:
    """Bring an essay back to VERSIONS_MAX after a review's snapshot landed:
    the oldest version no review points to goes first, and only when every
    other one has a review does the oldest of those go (its review with it).
    Never the snapshot just made. Done after the review is stored, not before
    the call, so a review that fails never costs the student a saved version.
    Never raises."""
    try:
        ids = _version_ids(user_id, essay_id, oldest_first=True)
        extra = len(ids) - VERSIONS_MAX
        if extra <= 0:
            return
        read = {r.get("version_id") for r in (
            _sb().from_("essay_reviews").select("version_id").eq("essay_id", essay_id).eq("user_id", user_id)
            .limit(VERSIONS_MAX * 3).execute().data or [])}
        others = [i for i in ids if i != keep_id]
        for version_id in ([i for i in others if i not in read] + [i for i in others if i in read])[:extra]:
            _delete_version(user_id, version_id)
    except Exception as exc:
        logger.warning(f"[essay] could not trim the versions of {essay_id} for {user_id}: {_why(exc)}")


# ── Reviews ───────────────────────────────────────────────────────────────────

def _handoff(usage_now: Optional[dict]) -> dict:
    return {"type": "handoff", "message": rules.HANDOFF, "usage": usage_now}


def _review_fields(found, *, words: int, low: Optional[int], high: int, prompt_key: Optional[str] = None,
                   prompt_text: str = "") -> Optional[dict]:
    """The columns of a review row from what review.py returned. Every line in
    it has already passed rules.validate_review; this only makes it fit the
    table, and counts the words itself so the row cannot disagree with the
    snapshot. prompt_key and prompt_text are the prompt the model was given,
    kept on the row: the essay's own prompt can change afterwards. None when
    the seven checks are not all there, in order."""
    if not isinstance(found, dict):
        return None
    checks = found.get("checks")
    if not isinstance(checks, list) or [c.get("check") if isinstance(c, dict) else None
                                        for c in checks] != list(rules.CHECKS):
        return None
    summary = found.get("summary") if isinstance(found.get("summary"), str) else ""
    notes = found.get("notes") if isinstance(found.get("notes"), list) else []
    cuts = found.get("cuts") if isinstance(found.get("cuts"), list) else []
    return {
        "summary": summary[:SUMMARY_MAX],
        "word_count": words,
        "word_limit": high,
        "word_min": low,
        "checks": checks,
        "notes": [n for n in notes if isinstance(n, dict)][:rules.MAX_NOTES],
        "cuts": [c for c in cuts if isinstance(c, dict)][:rules.MAX_CUTS],
        "prompt_key": prompt_key if prompt_key in PROMPT_KEYS else None,
        "prompt_text": prompt_text[:PROMPT_MAX] if isinstance(prompt_text, str) else "",
    }


def _insert_review(user_id: str, essay_id: str, version_id: str, fields: dict) -> tuple[Optional[dict], bool]:
    """(row, essay gone), as _insert_version."""
    try:
        row = _first(_sb().from_("essay_reviews").insert({
            **fields, "essay_id": essay_id, "version_id": version_id, "user_id": user_id,
        }).execute().data or [])
    except Exception as exc:
        logger.error(f"[essay] could not store a review of {essay_id} for {user_id}: {_why(exc)}")
        return None, _parent_gone(exc)
    return row, False


async def _judge(user_id: str, essay: dict, body: str, prompt_text: str, high: int, record_text: str,
                 record: dict, others: list[dict]) -> tuple[str, Optional[dict]]:
    """The model call, under its deadline. ("ok", the review) or the reason it
    did not land: "handoff", "timed_out" or "review_failed"."""
    kind = essay.get("kind")
    try:
        result = await asyncio.wait_for(reviewer.review_draft(
            kind=kind, prompt_text=prompt_text, body=body, word_limit=high,
            school_name=_clip(essay.get("school_name"), SCHOOL_MAX) if kind == "supplement" else "",
            record_text=record_text, record=record, others=others,
        ), REVIEW_DEADLINE)
    except asyncio.TimeoutError:
        logger.warning(f"[essay] a review of {essay['id']} for {user_id} passed {REVIEW_DEADLINE:.0f} s; stopping it")
        return "timed_out", None
    except Exception as exc:
        # The type only: an error raised around a prompt can carry the essay.
        logger.error(f"[essay] the review of {essay['id']} failed for {user_id}: {type(exc).__name__}")
        return "review_failed", None
    state = result.get("status") if isinstance(result, dict) else None
    if state == "handoff":
        return "handoff", None
    if state != "ok":
        return "review_failed", None
    return "ok", result.get("review")


async def _read_and_store(user_id: str, essay: dict, body: str, prompt_text: str, words: int,
                          bounds: tuple[Optional[int], int], record_text: str, record: dict,
                          others: list[dict]) -> tuple[str, Optional[dict], Optional[dict]]:
    """Everything a spent review does: the snapshot, the call, the stored row.
    (outcome, the snapshot, the review row), where the row is there only for
    "ok". Never raises: whatever goes wrong comes back as an outcome, together
    with the snapshot that was made, so the caller can take it back."""
    essay_id, version = essay["id"], None
    low, high = bounds
    try:
        version, gone = await asyncio.to_thread(_insert_version, user_id, essay_id, body, "review")
        if not version:
            return ("no_essay" if gone else "server_error"), None, None
        outcome, found = await _judge(user_id, essay, body, prompt_text, high, record_text, record, others)
        if outcome != "ok":
            return outcome, version, None
        fields = _review_fields(found, words=words, low=low, high=high, prompt_text=prompt_text,
                                prompt_key=_prompt_key(essay.get("prompt_key"), prompt_text))
        if not fields:
            return "review_failed", version, None
        saved, gone = await asyncio.to_thread(_insert_review, user_id, essay_id, version["id"], fields)
        if not saved:
            return ("no_essay" if gone else "server_error"), version, None
        return "ok", version, saved
    except Exception as exc:
        logger.error(f"[essay] a review of {essay_id} broke for {user_id}: {type(exc).__name__}")
        return "server_error", version, None


async def review(user_id: str, essay_id) -> dict:
    """Have Quill read the draft as it is now (section 3.5). Returns
    {"type": "review", "review", "version", "usage"}, or {"type": "handoff",
    "message", "usage"} when the writing says the student is in danger now.

    Everything that can refuse comes before the review is spent. The hand-off
    is checked first of all, ahead of the refusals a short or unchanged draft
    would get: a student who wrote that is not told to write 50 words."""
    _require_enabled()
    essay_id = _uuid(essay_id, "no_essay", NO_ESSAY)
    essay = await asyncio.to_thread(_essay_row, user_id, essay_id)
    if not essay:
        raise AgentError(404, "no_essay", NO_ESSAY)
    body = _body(essay)
    if rules.crisis_now(body):
        # Nothing spent, nothing stored: no snapshot, no review, no unit. And
        # no ids in the log line: a hand-off leaves no record of whose it was.
        logger.info("[essay] a review ended in the hand-off before any call")
        return _handoff(await asyncio.to_thread(_usage, user_id, "review"))
    prompt_text = _block(essay.get("prompt_text"))
    if not prompt_text:
        raise AgentError(422, "no_prompt", NO_PROMPT)
    words = rules.word_count(body)
    if words < rules.REVIEW_MIN_WORDS:
        raise AgentError(422, "too_short", TOO_SHORT.format(words=rules.REVIEW_MIN_WORDS))
    if await asyncio.to_thread(_already_read, user_id, essay_id, body, prompt_text):
        raise AgentError(409, "unchanged", UNCHANGED)
    with _busy(user_id):
        return await _review(user_id, essay, body, prompt_text, words)


async def _review(user_id: str, essay: dict, body: str, prompt_text: str, words: int) -> dict:
    essay_id = essay["id"]
    started = time.monotonic()
    # Asked again now that this request holds the student's guard: a review
    # that landed while it waited its turn has already read this text.
    if await asyncio.to_thread(_already_read, user_id, essay_id, body, prompt_text):
        raise AgentError(409, "unchanged", UNCHANGED)
    # What the call needs is read before the review is spent, and read
    # strictly (a table that cannot be read raises), so a read that fails costs
    # nothing and is never taken for a record with nothing on it.
    try:
        record_text, record, _ = await asyncio.to_thread(_record_for_model, user_id, strict=True)
        others = await asyncio.to_thread(_other_essays, user_id, essay_id)
    except Exception as exc:
        logger.error(f"[essay] could not read what a review needs for {user_id}: {_why(exc)}")
        raise AgentError(500, "server_error", SERVER_ERROR)
    bounds = rules.word_bounds(essay.get("kind"), _int(essay.get("word_limit"), rules.PS_MAX))

    counted = await _spend(user_id, "review")
    if counted is None:
        raise AgentError(409, "no_reviews", NO_REVIEWS.format(limit=_limit("review")))

    # From here the review is spent. It ends stored (the return below) or
    # undone (the one _undo_review after it); nothing else gives the unit back.
    outcome, version, saved = await _read_and_store(user_id, essay, body, prompt_text, words, bounds,
                                                    record_text, record, others)
    took = time.monotonic() - started

    if saved:
        await asyncio.to_thread(_trim_versions, user_id, essay_id, version["id"])
        logger.info(f"[essay] review of {essay_id} for {user_id}: {words} words, {len(saved.get('notes') or [])} "
                    f"notes, {len(saved.get('cuts') or [])} cuts, {took:.1f} s")
        return {"type": "review", "review": _public(saved), "version": _public(version),
                "usage": await asyncio.to_thread(_usage, user_id, "review", counted)}

    refunded = await _undo_review(user_id, version)
    if outcome == "handoff":
        # No ids here either: the hand-off leaves no record of whose writing it was.
        logger.info("[essay] a review ended in the hand-off")
        return _handoff(await asyncio.to_thread(_usage, user_id, "review", counted - (1 if refunded else 0)))
    logger.info(f"[essay] review of {essay_id} for {user_id} did not land ({outcome}), "
                f"{'given back' if refunded else 'NOT given back'}, {took:.1f} s")
    raise _ending(outcome, refunded, GAVE_BACK, KEPT)


async def _undo_review(user_id: str, version: Optional[dict]) -> bool:
    """Take back a review that did not land: its snapshot is deleted (so the
    versions list never shows text no review or save stands behind) and the
    unit returned, while there are give-backs left (_give_back). Called once,
    from the one place a spent review ends without a stored row. True only
    when the unit really went back."""
    if version:
        await asyncio.to_thread(_delete_version, user_id, version["id"])
    return await asyncio.to_thread(_give_back, user_id, "review")


# ── Topic areas from the record ───────────────────────────────────────────────

def _existing_areas(user_id: str) -> list[str]:
    rows = (_sb().from_("essay_topics").select("area").eq("user_id", user_id)
            .limit(200).execute().data or [])
    return [r["area"] for r in rows if isinstance(r.get("area"), str) and r["area"].strip()]


def _top_position(user_id: str) -> float:
    """A position above every card already on the board, so new ones show
    first (students' own moves can make positions negative)."""
    try:
        rows = _sb().from_("essay_topics").select("position").eq("user_id", user_id) \
            .order("position").limit(1).execute().data or []
    except Exception:
        return 0.0
    low = rows[0].get("position") if rows else None
    return (float(low) - 1.0) if isinstance(low, (int, float)) and not isinstance(low, bool) else 0.0


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


def _topic_fields(raw) -> Optional[dict]:
    """A card from one area topics.py returned. rules.validate_areas has
    already checked it (the evidence is the record's own wording, written by
    code); this only makes it fit the table. None when it has no usable area."""
    if not isinstance(raw, dict):
        return None
    area = clean_text(raw.get("area"), AREA_MAX)
    if len(area) < AREA_MIN:
        return None
    evidence = []
    for item in raw.get("evidence") if isinstance(raw.get("evidence"), list) else []:
        if not isinstance(item, dict):
            continue
        kind, text = item.get("kind"), _clip(item.get("text"), EVIDENCE_CHARS)
        if kind in EVIDENCE_KINDS and text:
            evidence.append({"kind": kind, "text": text})
        if len(evidence) >= EVIDENCE_MAX:
            break
    return {"area": area, "evidence": evidence, "questions": _lines(raw.get("questions"), QUESTIONS_MAX,
                                                                    QUESTION_CHARS)}


def _new_cards(areas: list, existing: list[str]) -> list[dict]:
    """The areas as cards, in the order given, without any the board already
    has (whatever the capitals) and without repeats."""
    seen = {a.casefold() for a in existing}
    out = []
    for raw in areas:
        fields = _topic_fields(raw)
        if not fields or fields["area"].casefold() in seen:
            continue
        seen.add(fields["area"].casefold())
        out.append(fields)
        if len(out) >= AREAS_MAX:
            break
    return out


def _insert_topics(user_id: str, cards: list[dict]) -> list[dict]:
    """Put the cards on the board in one insert, so they all land or none
    does, with positions that show them first and in order. [] when it failed."""
    top = _top_position(user_id)
    now = _iso_now()
    try:
        rows = _sb().from_("essay_topics").insert([{
            **card, "user_id": user_id, "source": "record", "position": top - (len(cards) - 1 - i),
            "updated_at": now,
        } for i, card in enumerate(cards)]).execute().data or []
    except Exception as exc:
        logger.error(f"[essay] could not save topic areas for {user_id}: {_why(exc)}")
        return []
    return sorted(rows, key=lambda r: r.get("position") if isinstance(r.get("position"), (int, float)) else 0.0)


async def _search_and_save(user_id: str, record_text: str, record: dict, name: str,
                           existing: list[str]) -> tuple[str, list[dict]]:
    """Everything a spent topic search does: the call, then the cards. (outcome,
    the rows), where the rows are there only for "ok". Never raises."""
    try:
        areas = await asyncio.wait_for(topic_finder.find_areas(
            record_text=record_text, record=record, existing_areas=existing, name=name,
        ), TOPICS_DEADLINE)
    except asyncio.TimeoutError:
        logger.warning(f"[essay] a topic search for {user_id} passed {TOPICS_DEADLINE:.0f} s; stopping it")
        return "timed_out", []
    except Exception as exc:
        logger.error(f"[essay] the topic search failed for {user_id}: {type(exc).__name__}")
        return "topics_failed", []
    if not isinstance(areas, list):                 # None: the model could not be reached or gave nothing usable
        return "topics_failed", []
    try:
        cards = _new_cards(areas, existing)
        if not cards:
            return "nothing_new", []
        rows = await asyncio.to_thread(_insert_topics, user_id, cards)
    except Exception as exc:
        logger.error(f"[essay] could not put topic areas on the board for {user_id}: {type(exc).__name__}")
        return "server_error", []
    return ("ok", rows) if rows else ("server_error", [])


async def find_topics(user_id: str) -> dict:
    """Read the record for areas the student might write about and put them on
    the ideas board (section 3.5). Returns {"topics", "usage"}."""
    _require_enabled()
    try:
        shape = await asyncio.to_thread(_record_shape, user_id)
    except Exception as exc:
        logger.error(f"[essay] could not read the record of {user_id}: {_why(exc)}")
        raise AgentError(500, "server_error", SERVER_ERROR)
    if shape["thin"]:
        raise AgentError(409, "thin_record", THIN_RECORD)
    with _busy(user_id):
        return await _find_topics(user_id)


async def _find_topics(user_id: str) -> dict:
    started = time.monotonic()
    # Read strictly, as a review's is, and before the search is spent: a table
    # that could not be read is not a thinner record to look for areas in.
    try:
        record_text, record, name = await asyncio.to_thread(_record_for_model, user_id, strict=True)
        existing = await asyncio.to_thread(_existing_areas, user_id)
    except Exception as exc:
        logger.error(f"[essay] could not read what a topic search needs for {user_id}: {_why(exc)}")
        raise AgentError(500, "server_error", SERVER_ERROR)

    counted = await _spend(user_id, "topics")
    if counted is None:
        raise AgentError(409, "no_topic_finds", NO_TOPIC_FINDS.format(limit=_limit("topics")))

    # Spent from here: it ends with cards on the board, or in the one refund below.
    outcome, rows = await _search_and_save(user_id, record_text, record, name, existing)
    took = time.monotonic() - started

    if outcome == "ok":
        logger.info(f"[essay] topic search for {user_id}: {len(rows)} areas, {took:.1f} s")
        return {"topics": [_public(row) for row in rows],
                "usage": await asyncio.to_thread(_usage, user_id, "topics", counted)}
    refunded = await asyncio.to_thread(_give_back, user_id, "topics")
    logger.info(f"[essay] topic search for {user_id} did not land ({outcome}), "
                f"{'given back' if refunded else 'NOT given back'}, {took:.1f} s")
    raise _ending(outcome, refunded, SEARCH_GAVE_BACK, SEARCH_KEPT)


# ── The brainstorm ────────────────────────────────────────────────────────────
# Stateless, as Quest's pre-plan talk is: the page sends the conversation back
# each turn and talk.clean_messages makes it safe. A spent budget, an outage
# or a bad reply never refuses a turn: each ends the talk, with the student's
# answers on a card. The one refusal is 409 busy, for a turn sent while the
# student's last one is still being answered (the page keeps the conversation
# and the answer can be sent again).

def _closing() -> dict:
    """The turn when the model takes no part: the talk ends here."""
    return {"done": True, "message": talker.FALLBACK_LINE, "area": "", "fallback": True, "handoff": False}


def _answers(messages: list[dict]) -> list[str]:
    return [m.get("content") for m in messages
            if m.get("role") == "student" and isinstance(m.get("content"), str)]


def _talk_lines(messages: list[dict]) -> str:
    """The talk as plain lines for a card's notes: each question Quill asked
    and what the student said to it, in order, in their own words. A last
    question nobody answered is left out."""
    lines, asked = [], None
    for m in messages:
        text = m.get("content") if isinstance(m.get("content"), str) else ""
        if m.get("role") == "advisor":
            asked = text
        elif m.get("role") == "student" and asked is not None:
            lines += [f"Quill asked: {asked}", f"You said: {text}"]
            asked = None
    return "\n".join(lines)


async def _turn(user_id: str, start: str, topic: Optional[dict], messages: list[dict]) -> dict:
    """One model turn, made safe: talk.next_turn never raises by contract, but
    a late or odd answer still ends the talk instead of failing the request."""
    # Not strict: with a thin record a talk only asks a plainer question.
    try:
        record_text, _, _ = await asyncio.to_thread(_record_for_model, user_id)
    except Exception as exc:
        logger.warning(f"[essay] could not read the record of {user_id} for a talk: {_why(exc)}")
        record_text = ""
    # The card they are picking up: what is on it, and nothing else of the row.
    about = {"area": topic.get("area") or "", "notes": topic.get("notes") or "",
             "questions": topic.get("questions") if isinstance(topic.get("questions"), list) else []} if topic else None
    try:
        raw = await asyncio.wait_for(talker.next_turn(
            start=start, topic=about, record_text=record_text, messages=messages,
        ), TALK_DEADLINE)
    except Exception as exc:                        # a timeout included
        logger.warning(f"[essay] a talk turn failed for {user_id}: {type(exc).__name__}")
        return _closing()
    if not isinstance(raw, dict):
        return _closing()
    if raw.get("handoff") is True:
        return {"done": True, "message": rules.TALK_HANDOFF, "area": "", "fallback": False, "handoff": True}
    message = raw.get("message") if isinstance(raw.get("message"), str) else ""
    if raw.get("fallback") is True or not message.strip():
        return _closing()
    return {"done": raw.get("done") is True, "message": message.strip(),
            "area": raw.get("area") if isinstance(raw.get("area"), str) else "",
            "fallback": False, "handoff": False}


def _save_card(user_id: str, start: str, topic: Optional[dict], lines: str, area: str) -> Optional[dict]:
    """Put a finished talk on the ideas board (section 3.5): added to the card
    it continued, or a new card named by the area the talk landed on. The same
    talk sent twice (a retry after a lost reply) lands once: the caller holds
    the student's talk guard, so the second copy only runs after the first
    has written its card and finds it here. Never raises: None when it could
    not be saved."""
    try:
        if topic:
            current = _topic_row(user_id, topic["id"])        # as it is now: the turn took a while
            if current:
                kept = current.get("notes") if isinstance(current.get("notes"), str) else ""
                if kept.rstrip().endswith(lines):
                    return current
                joined = f"{kept.rstrip()}\n\n{lines}" if kept.strip() else lines
                if len(joined) <= NOTES_MAX:
                    row = _first(
                        _sb().from_("essay_topics").update({"notes": joined, "updated_at": _iso_now()})
                        .eq("id", current["id"]).eq("user_id", user_id).execute().data or []
                    )
                    if row:
                        return row
                # No room left on that card (or it was just deleted): the
                # answers go on a card of their own under the same area, so
                # none of the student's words are cut.
                area = current.get("area") if isinstance(current.get("area"), str) else area
        notes = lines[:NOTES_MAX]
        recent = (_sb().from_("essay_topics").select("*").eq("user_id", user_id).eq("source", "talk")
                  .order("created_at", desc=True).limit(3).execute().data or [])
        for row in recent:
            if row.get("notes") == notes:
                return row
        label = clean_text(area, AREA_MAX)
        if len(label) < AREA_MIN:
            label = rules.TALK_STARTS[start][:AREA_MAX]
        return _first(_sb().from_("essay_topics").insert({
            "user_id": user_id, "area": label, "source": "talk", "notes": notes,
            "position": _top_position(user_id), "updated_at": _iso_now(),
        }).execute().data or [])
    except Exception as exc:
        logger.error(f"[essay] could not save a talk card for {user_id}: {_why(exc)}")
        return None


async def talk(user_id: str, body) -> dict:
    """Quill's next question in a brainstorm, or its closing line (section
    3.5). Returns {"done", "message", "fallback", "handoff", "topic", "usage"}.

    A conversation whose last line is Quill's own (a question the student left
    unanswered) is the student stopping. With answers before it, that is one
    more turn like any other: talk.next_turn closes from what they did say and
    names the card. With nothing said there is nothing to close or keep, so it
    just ends: no call, nothing spent.

    Writing that says the student is in danger now ends the talk with
    rules.TALK_HANDOFF, which does not say anything was saved: nothing is."""
    _require_enabled()
    body = body if isinstance(body, dict) else {}
    start = body.get("start")
    if not isinstance(start, str) or start not in rules.TALK_STARTS:
        raise AgentError(422, "bad_start", BAD_START)
    topic = None
    topic_id = _own_id(body.get("topic_id"))
    if topic_id:
        topic = await asyncio.to_thread(_topic_row, user_id, topic_id)      # not theirs: ignored
    messages = talker.clean_messages(body.get("conversation"))
    answers = _answers(messages)

    # Checked in code on everything they said, before a unit is taken,
    # whatever the budget and ahead of the busy guard: the hand-off stores
    # nothing, costs nothing and is never refused. No ids in its log line.
    if any(rules.crisis_now(a) for a in answers):
        logger.info("[essay] a talk ended in the hand-off before any call")
        return {"done": True, "message": rules.TALK_HANDOFF, "fallback": False, "handoff": True, "topic": None,
                "usage": await asyncio.to_thread(_usage, user_id, "talk")}

    # One turn at a time per student, on a guard of its own (a review can run
    # beside a brainstorm). Two copies of one turn in flight would each take a
    # unit, and both could look for the card before either had written it.
    with _busy(user_id, "talk", message=TALK_BUSY):
        return await _talk(user_id, start, topic, messages, answers)


async def _talk(user_id: str, start: str, topic: Optional[dict], messages: list[dict], answers: list[str]) -> dict:
    known = None
    stopped = bool(messages) and messages[-1].get("role") == "advisor"
    if stopped and not answers:
        turn = _closing()
    else:
        try:
            counted = await _spend(user_id, "talk")
        except AgentError:
            counted = None                          # a budget that cannot be read ends the talk too
        if counted is None:
            turn = _closing()
        else:
            turn = await _turn(user_id, start, topic, messages)
            # The model took no part, or the turn became the hand-off: not a
            # turn they pay for, while there are give-backs left (_give_back).
            back = (turn["fallback"] or turn["handoff"]) and await asyncio.to_thread(_give_back, user_id, "talk")
            known = counted - (1 if back else 0)

    if turn["handoff"]:
        logger.info("[essay] a talk ended in the hand-off")
        return {"done": True, "message": rules.TALK_HANDOFF, "fallback": False, "handoff": True, "topic": None,
                "usage": await asyncio.to_thread(_usage, user_id, "talk", known)}

    # A talk that ends with at least one answer leaves a card behind.
    card, lines = None, _talk_lines(messages)
    if turn["done"] and lines:
        card = await asyncio.to_thread(_save_card, user_id, start, topic, lines, turn["area"])
    message = turn["message"]
    if turn["fallback"] and not card:
        message = LEFT_THERE
    logger.info(f"[essay] talk turn for {user_id}: {len(answers)} answers, done={turn['done']}, "
                f"fallback={turn['fallback']}, card={'saved' if card else 'none'}")
    return {"done": turn["done"], "message": message, "fallback": turn["fallback"], "handoff": False,
            "topic": _public(card) if card else None,
            "usage": await asyncio.to_thread(_usage, user_id, "talk", known)}
