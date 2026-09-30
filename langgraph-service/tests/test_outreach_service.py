"""
Beaker's service and router end to end, against the in-memory database
(tests/fakedb.py): the try accounting (spend before paid work, refund on every
failure before a draft, never after, and only say so when it happened), the
sweep of tries nobody can finish, the run deadline, the shortlist, the
question and its answer, the look-alikes, rewrites and follow-up drafts (their
write budget, and never saving over a card sent or edited meanwhile), every
send check in the contract's order (per student and per Gmail address, on the
recipient's canonical address, in UTC days), and the SSE framing.

The model and Gmail are scripted (the Beaker class below stands in for
research.py, draft.py and google.py's network calls), so nothing here touches
the network. The budget functions, the send-time content check
(draft.email_problems) and the database mirrors are the real ones.

    python3 -m pytest tests/test_outreach_service.py
"""
import asyncio
import copy
import json
from datetime import datetime, timedelta, timezone

import pytest

from tests.memory_world import REAL_SLEEP, U, V  # noqa: E402  (first: it stubs the Supabase client)

from cryptography.fernet import Fernet  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import config  # noqa: E402
from app.auth import verify_jwt  # noqa: E402
from app.nodes.agents import google, usage  # noqa: E402
from app.nodes.agents.google import GoogleError  # noqa: E402
from app.nodes.agents.outreach import draft as writer  # noqa: E402
from app.nodes.agents.outreach import research  # noqa: E402
from app.nodes.agents.outreach import service as svc  # noqa: E402
from app.nodes.agents.outreach.draft import DraftFailed  # noqa: E402
from app.nodes.agents.outreach.service import AgentError  # noqa: E402
from app.routers import agents as routes  # noqa: E402

NOW = datetime(2026, 10, 1, 16, 0, tzinfo=timezone.utc)
NY = "America/New_York"

CAND_A = {"name": "Dr. Maria Lee", "title": "Associate Professor of Marine Science",
          "organization": "University of South Florida", "why": "Runs a coral reef lab that works with students.",
          "source_url": "https://www.usf.edu/marine/lee", "source_title": "Lee Lab"}
CAND_B = {"name": "Dr. Sam Ortiz", "title": "Research Scientist", "organization": "Mote Marine Laboratory",
          "why": "Leads the reef restoration volunteer program.", "source_url": "https://mote.org/staff/ortiz",
          "source_title": "Sam Ortiz"}
CAND_C = {"name": "Dr. Ana Ruiz", "title": "Professor", "organization": "University of Tampa",
          "why": "Teaches marine ecology and mentors undergraduates.", "source_url": "https://www.ut.edu/ruiz",
          "source_title": "Ana Ruiz"}
FACT_URL = "https://www.usf.edu/marine/lee/research"
FOUND = {
    "status": "found",
    "person": {"name": "Dr. Maria Lee", "title": "Associate Professor", "organization": "University of South Florida",
               "profile_url": "https://www.usf.edu/marine/lee"},
    "facts": [{"text": "Her lab tracks how coral recovers after bleaching.", "url": FACT_URL}],
    "sources": [{"url": "https://www.usf.edu/marine/lee", "title": "Lee Lab", "domain": "usf.edu"},
                {"url": FACT_URL, "title": "Research", "domain": "usf.edu"}],
    "verified_email": "mlee@usf.edu",
    "email_source_url": "https://www.usf.edu/marine/lee",
}
SUBJECT = "High school student curious about coral recovery"
BODY = ("Dear Dr. Lee,\n\nI'm a junior at a public high school in Tampa, and I read that your lab tracks how coral "
        "recovers after bleaching. I've spent the last year volunteering at our local aquarium, where I help log "
        "water quality for the reef tank.\n\nWould you be open to a fifteen minute call about how a high school "
        "student could learn more about reef recovery? I understand many labs cannot take minors, so any pointer "
        "would help.\n\nThank you,\nAda")
DRAFT = {"subject": SUBJECT, "body": BODY,
         "claims": [{"text": "your lab tracks how coral recovers after bleaching", "source_url": FACT_URL}],
         "facts_to_verify": ["Check that the lab still runs the bleaching study"]}
REWRITTEN = {"subject": "Coral recovery question from a high school junior",
             "body": "Dear Dr. Lee,\n\nI'm a junior in Tampa and read that your lab tracks how coral recovers after "
                     "bleaching. Could I ask where a student like me should start reading?\n\nThanks,\nAda",
             "claims": [], "facts_to_verify": ["Read it once more"]}
FOLLOWUP = ("Dear Dr. Lee,\n\nI wanted to follow up on my note from last week about your coral recovery work. "
            "I know you are busy, so no worries if now is not a good time.\n\nThanks,\nAda")
GOAL = "Marine biology research I could help with near Tampa"


def run(coro):
    return asyncio.run(coro)


def refused(coro) -> AgentError:
    with pytest.raises(AgentError) as info:
        run(coro)
    return info.value


class Events:
    """The emit callback: keeps every event."""

    def __init__(self):
        self.items = []

    async def __call__(self, event):
        self.items.append(event)

    def lines(self):
        return [(e["id"], e["status"]) for e in self.items]


class Beaker:
    """Scripted stand-ins for the model calls (research.py, draft.py) and for
    Gmail (google.py's network side), plus helpers over the fake database."""

    def __init__(self, world):
        self.w = world
        self.db = world.db
        self.now = NOW
        self.people = [CAND_A, CAND_B, CAND_C]
        self.found = FOUND
        self.drafts = []
        self.rewrites = []
        self.followups = []
        self.configured = True
        self.token_error = None
        self.send_errors = []
        self.pause = 0.0
        self.calls = {"find_people": [], "research_person": [], "write_draft": [], "rewrite_draft": [],
                      "write_followup": [], "send": [], "access_token": 0}

    # ── the fakes ──
    async def find_people(self, goal, *, record_text, emit):
        self.calls["find_people"].append({"goal": goal, "record_text": record_text})
        await emit({"type": "progress", "id": "search-1", "label": "Searching: marine biology Tampa",
                    "status": "active"})
        if self.pause:
            await REAL_SLEEP(self.pause)
        await emit({"type": "progress", "id": "search-1", "label": "Found 6 pages on usf.edu", "status": "done"})
        if isinstance(self.people, Exception):
            raise self.people
        return copy.deepcopy(self.people)

    async def research_person(self, target, *, emit):
        self.calls["research_person"].append(dict(target))
        await emit({"type": "progress", "id": "search-1", "label": "Searching: Maria Lee USF", "status": "done"})
        found = self.found
        if isinstance(found, Exception):
            raise found
        return copy.deepcopy(found)

    async def write_draft(self, **kw):
        self.calls["write_draft"].append(kw)
        if kw.get("emit"):
            await kw["emit"]({"type": "progress", "id": "draft", "label": "Writing", "status": "active"})
        out = self.drafts.pop(0) if self.drafts else DRAFT
        if isinstance(out, Exception):
            raise out
        return copy.deepcopy(out)

    async def rewrite_draft(self, **kw):
        self.calls["rewrite_draft"].append(kw)
        out = self.rewrites.pop(0) if self.rewrites else REWRITTEN
        if isinstance(out, Exception):
            raise out
        return copy.deepcopy(out)

    async def write_followup(self, **kw):
        self.calls["write_followup"].append(kw)
        out = self.followups.pop(0) if self.followups else FOLLOWUP
        if isinstance(out, Exception):
            raise out
        return out

    async def access_token(self, user_id):
        self.calls["access_token"] += 1
        if self.token_error:
            raise self.token_error
        return "ya29.token", "ada@gmail.com"

    async def send(self, user_id, *, to, subject, body, thread_id=None, in_reply_to=None, from_name=None):
        self.calls["send"].append({"user_id": user_id, "to": to, "subject": subject, "body": body,
                                   "thread_id": thread_id, "in_reply_to": in_reply_to, "from_name": from_name})
        if self.send_errors:
            raise self.send_errors.pop(0)
        n = len(self.calls["send"])
        return {"gmail_message_id": f"msg-{n}", "gmail_thread_id": thread_id or "thread-1",
                "message_id_header": f"<m{n}@mail.gmail.com>", "from_email": "ada@gmail.com"}

    # ── helpers over the fake database ──
    def card(self, contact_id):
        return next(r for r in self.db.t["outreach_contacts"] if r["id"] == contact_id)

    def the_try(self, try_id):
        return next(r for r in self.db.t["outreach_tries"] if r["id"] == try_id)

    def used(self, kind, uid=U):
        return sum(r["used"] for r in self.db.t["agent_usage"] if r["user_id"] == uid and r["kind"] == kind)

    def spend_all(self, kind="try", uid=U, bucket="all", n=2):
        self.db.t["agent_usage"].append({"user_id": uid, "agent": "outreach", "kind": kind, "bucket": bucket,
                                         "used": n})

    def connect(self, uid=U):
        self.db.t["google_connections"].append({
            "user_id": uid, "google_email": "ada@gmail.com", "scope": google.GMAIL_SEND_SCOPE,
            "refresh_token_enc": "encrypted", "connected_at": NOW.isoformat(), "updated_at": NOW.isoformat()})

    def drafted(self, uid=U, **over) -> dict:
        """A card drafted through the person path."""
        final = run(svc.draft(uid, person_body(**over), Events()))
        assert final["type"] == "draft", final
        return self.card(final["contact"]["id"])

    def sent_card(self, uid=U) -> dict:
        """A card whose first email went out through Gmail."""
        self.connect(uid)
        card = self.drafted(uid)
        run(svc.send(uid, card["id"], send_body(), NY))
        return self.card(card["id"])


def person_body(**over):
    body = {"try_id": None, "candidate_index": 0,
            "person": {"name": "Dr. Maria Lee", "organization": "University of South Florida", "url": ""},
            "purpose": "research", "voice": "warm", "length": "brief", "student_note": "", "answer": None}
    body.update(over)
    return body


def pick_body(try_id, index=0, **over):
    body = {"try_id": try_id, "candidate_index": index, "person": None, "purpose": "informational",
            "voice": "formal", "length": "fuller", "student_note": "", "answer": None}
    body.update(over)
    return body


def send_body(**over):
    body = {"kind": "first", "to": "mlee@usf.edu", "subject": SUBJECT, "body": BODY}
    body.update(over)
    return body


@pytest.fixture
def b(w, monkeypatch):
    fake = Beaker(w)
    monkeypatch.setattr(svc, "_now", lambda: fake.now)
    monkeypatch.setattr(usage, "_now", lambda: fake.now)
    monkeypatch.setattr(research, "find_people", fake.find_people)
    monkeypatch.setattr(research, "research_person", fake.research_person)
    monkeypatch.setattr(writer, "write_draft", fake.write_draft)
    monkeypatch.setattr(writer, "rewrite_draft", fake.rewrite_draft)
    monkeypatch.setattr(writer, "write_followup", fake.write_followup)
    monkeypatch.setattr(google, "is_configured", lambda: fake.configured)
    monkeypatch.setattr(google, "access_token", fake.access_token)
    monkeypatch.setattr(google, "send", fake.send)
    monkeypatch.setattr(routes, "_track", lambda *a, **k: None)
    svc._WORKING.clear()
    svc._SENDING.clear()
    yield fake
    assert not svc._WORKING and not svc._SENDING, "a guard was left held"


# ── Status ────────────────────────────────────────────────────────────────────

def test_status_before_anything_and_with_an_open_try(w, b):
    out = run(svc.status(U, "America/Los_Angeles"))
    assert out == {
        "tries": {"used": 0, "limit": 2, "left": 2},
        "searches": {"used": 0, "limit": 8, "left": 8},
        "writes": {"used": 0, "limit": 20, "left": 20},
        "sends_today": {"used": 0, "limit": 5, "left": 5},
        "limits": {"rewrites_per_card": 3, "followup_drafts_per_card": 3, "followups_per_card": 2,
                   "followup_after_days": 10, "max_words": 175},
        "gmail": {"configured": True, "connected": False, "email": None},
        "open_try": None,
    }
    assert w.profile["timezone"] == "America/Los_Angeles"      # the browser's zone, saved the first time

    final = run(svc.shortlist(U, {"goal": GOAL}, Events()))
    b.connect()
    out = run(svc.status(U, "Europe/Paris"))
    assert w.profile["timezone"] == "America/Los_Angeles"      # a stored zone is never replaced
    assert out["tries"] == {"used": 1, "limit": 2, "left": 1}
    assert out["searches"] == {"used": 1, "limit": 8, "left": 7}
    assert out["gmail"] == {"configured": True, "connected": True, "email": "ada@gmail.com"}
    assert out["open_try"] == {"id": final["try_id"], "mode": "goal", "goal": GOAL, "candidates": b.people,
                               "pending_question": None, "contact_id": None}

    b.configured = False
    assert run(svc.status(U, None))["gmail"]["configured"] is False
    # Only a try that is still open.
    run(svc.draft(U, pick_body(final["try_id"]), Events()))
    assert run(svc.status(U, None))["open_try"] is None


# ── Spending a try ────────────────────────────────────────────────────────────

def test_no_tries_left_refuses_before_any_work(w, b):
    b.spend_all()
    events = Events()
    err = refused(svc.shortlist(U, {"goal": GOAL}, events))
    assert (err.status, err.code, err.message) == (409, "no_tries", "You have used both of your tries.")
    err = refused(svc.draft(U, person_body(), events))
    assert (err.status, err.code) == (409, "no_tries")
    assert events.items == []                                   # nothing streamed: a plain HTTP error
    assert w.db.t["outreach_tries"] == [] and not b.calls["find_people"] and not b.calls["research_person"]


def test_research_runs_are_capped_even_when_tries_are_given_back(w, b):
    b.found = None                                    # every search fails, so every try is refunded
    for _ in range(8):
        final = run(svc.draft(U, person_body(), Events()))
        assert final["type"] == "error" and final["refunded"] is True
    assert b.used("try") == 0 and b.used("search") == 8
    err = refused(svc.draft(U, person_body(), Events()))
    assert (err.status, err.code) == (409, "no_searches")
    assert b.used("try") == 0                         # the try is not kept when the search is refused
    assert len(b.calls["research_person"]) == 8


def test_a_pick_from_the_list_costs_a_search_but_not_a_try(w, b):
    final = run(svc.shortlist(U, {"goal": GOAL}, Events()))
    assert (b.used("try"), b.used("search")) == (1, 1)
    run(svc.draft(U, pick_body(final["try_id"]), Events()))
    assert (b.used("try"), b.used("search")) == (1, 2)


def test_beakers_new_card_goes_to_the_top_of_its_stage(w, b):
    w.db.t["outreach_contacts"].append({"id": "mine", "user_id": U, "stage": "drafted", "name": "Moved up",
                                         "position": -3.0, "created_by": "student"})
    card = b.drafted()
    assert card["position"] < -3.0


def test_bad_bodies_are_refused_before_anything_is_spent(w, b):
    for goal in ("", "   short ", "x" * 301, None):
        assert refused(svc.shortlist(U, {"goal": goal}, Events())).code == "bad_goal"
    assert refused(svc.draft(U, person_body(purpose="bribery"), Events())).code == "bad_purpose"
    assert refused(svc.draft(U, person_body(person={"name": " "}), Events())).code == "bad_person"
    assert refused(svc.draft(U, person_body(person=None), Events())).code == "bad_person"
    assert b.used("try") == 0 and w.db.t["outreach_tries"] == []


def test_a_shortlist_spends_one_try_and_keeps_the_people(w, b):
    events = Events()
    final = run(svc.shortlist(U, {"goal": "  " + GOAL + "  "}, events))
    assert final == {"type": "shortlist", "try_id": final["try_id"], "candidates": [CAND_A, CAND_B, CAND_C]}
    assert b.used("try") == 1
    t = b.the_try(final["try_id"])
    assert (t["status"], t["mode"], t["goal"], t["candidates"]) == ("open", "goal", GOAL, [CAND_A, CAND_B, CAND_C])
    # The record is the first checklist line, then the search's own lines.
    assert events.lines()[:2] == [("record", "active"), ("record", "done")]
    assert events.items[1]["label"] == "Read your record, which has no activities yet"
    assert ("search-1", "done") in events.lines()
    assert b.calls["find_people"][0]["goal"] == GOAL


@pytest.mark.parametrize("outcome, code", [(None, "search_failed"), ([], "no_candidates"),
                                           (RuntimeError("boom"), "search_failed")])
def test_a_shortlist_that_finds_nobody_gives_the_try_back(w, b, outcome, code):
    b.people = outcome
    final = run(svc.shortlist(U, {"goal": GOAL}, Events()))
    assert final["type"] == "error" and final["error"] == code and final["refunded"] is True
    assert final["message"].endswith("Your try was given back.")
    assert b.used("try") == 0
    assert [t["status"] for t in w.db.t["outreach_tries"]] == ["refunded"]


# ── Drafting ──────────────────────────────────────────────────────────────────

def test_a_named_person_is_researched_and_drafted_for_one_try(w, b):
    body = person_body(person={"name": "  Dr.  Maria Lee ", "organization": "USF", "url": "usf.edu/marine/lee"},
                       student_note="  I volunteer at the aquarium  ", voice="nonsense", length=None)
    events = Events()
    final = run(svc.draft(U, body, events))
    assert final["type"] == "draft"
    assert b.used("try") == 1
    assert b.calls["research_person"] == [{"name": "Dr. Maria Lee", "organization": "USF",
                                           "url": "https://usf.edu/marine/lee"}]
    call = b.calls["write_draft"][0]
    assert call["student_name"] == "Ada" and call["grade"] == "11"          # the raw grade, not a sentence
    assert call["allow_question"] is True and call["answer"] is None and call["question"] is None
    assert (call["voice"], call["length"], call["student_note"]) == ("warm", "brief", "I volunteer at the aquarium")
    assert "Name: Ada" in call["record_text"]
    assert events.lines()[:2] == [("record", "active"), ("record", "done")]

    card = b.card(final["contact"]["id"])
    assert card["user_id"] == U and card["created_by"] == "agent" and card["stage"] == "drafted"
    assert (card["name"], card["email"], card["email_source_url"]) == (
        "Dr. Maria Lee", "mlee@usf.edu", "https://www.usf.edu/marine/lee")
    assert (card["subject"], card["body"], card["claims"]) == (SUBJECT, BODY, DRAFT["claims"])
    assert card["research"] == FOUND and card["sources"] == FOUND["sources"]
    assert (card["purpose"], card["voice"], card["length"]) == ("research", "warm", "brief")
    t = w.db.t["outreach_tries"][0]
    assert (t["status"], t["mode"], t["contact_id"]) == ("drafted", "person", card["id"])

    payload = final["contact"]
    assert "research" not in payload and "user_id" not in payload
    assert payload["email_verified"] is True and payload["rewrites_left"] == 3
    assert payload["followups_left"] == 2 and payload["next_followup_on"] is None
    json.dumps(final)                                            # the event must be JSON


def test_picking_from_the_shortlist_costs_nothing_more(w, b):
    shortlist = run(svc.shortlist(U, {"goal": GOAL}, Events()))
    tid = shortlist["try_id"]
    assert refused(svc.draft(U, pick_body(tid, 7), Events())).code == "bad_candidate"
    assert refused(svc.draft(U, pick_body(tid, "x"), Events())).code == "bad_candidate"
    final = run(svc.draft(U, pick_body(tid, 1), Events()))
    assert final["type"] == "draft"
    assert b.used("try") == 1
    # The candidate's own source page is read, and the reason they were picked is kept.
    assert b.calls["research_person"] == [{"name": "Dr. Sam Ortiz", "organization": "Mote Marine Laboratory",
                                           "url": "https://mote.org/staff/ortiz", "url_source": "search"}]
    card = b.card(final["contact"]["id"])
    assert card["why"] == CAND_B["why"] and (card["purpose"], card["voice"], card["length"]) == (
        "informational", "formal", "fuller")
    assert b.the_try(tid)["status"] == "drafted"
    # One try is one recipient: the rest of the list is gone.
    assert refused(svc.draft(U, pick_body(tid, 2), Events())).code == "try_closed"


def test_the_one_question_is_saved_and_answered_without_searching_again(w, b):
    b.drafts = [{"question": "Which grade are you in, and what did you do at the aquarium?"}, DRAFT]
    first = run(svc.draft(U, person_body(student_note="I love reefs"), Events()))
    assert first["type"] == "question"
    assert first["question"] == "Which grade are you in, and what did you do at the aquarium?"
    card = b.card(first["contact_id"])
    assert card["stage"] == "to_contact" and card["research"] == FOUND and card["body"] == ""
    assert card["student_note"] == "I love reefs"
    t = b.the_try(first["try_id"])
    assert (t["status"], t["pending_question"], t["contact_id"]) == ("open", first["question"], card["id"])
    assert run(svc.status(U, None))["open_try"]["pending_question"] == first["question"]

    # While Beaker waited, the student added a note and a better address to the card; both survive.
    card["notes"] = "Met her at the science fair"
    card["email"] = "maria.lee@usf.edu"
    events = Events()
    final = run(svc.draft(U, {"try_id": first["try_id"], "candidate_index": 0,
                              "answer": "  Grade 11. I log water quality  for the reef tank. "}, events))
    assert final["type"] == "draft" and final["contact"]["id"] == card["id"]
    assert len(b.calls["research_person"]) == 1                 # the saved research, no new search
    assert b.used("try") == 1                                    # and no new charge
    call = b.calls["write_draft"][1]
    assert call["answer"] == "Grade 11. I log water quality for the reef tank."
    assert call["question"] == first["question"] and call["allow_question"] is False
    assert call["research"] == FOUND and call["student_note"] == "I love reefs" and call["purpose"] == "research"
    assert events.lines()[0] == ("record", "active")
    card = b.card(card["id"])
    assert (card["stage"], card["body"], card["notes"], card["email"]) == (
        "drafted", BODY, "Met her at the science fair", "maria.lee@usf.edu")
    t = b.the_try(first["try_id"])
    assert (t["status"], t["pending_question"]) == ("drafted", None)
    assert len(w.db.t["outreach_contacts"]) == 1


def test_a_second_question_is_never_asked(w, b):
    b.drafts = [{"question": "Which grade are you in?"}, {"question": "And your school?"}]
    first = run(svc.draft(U, person_body(), Events()))
    final = run(svc.draft(U, {"try_id": first["try_id"], "answer": "11"}, Events()))
    assert final["type"] == "error" and final["error"] == "draft_failed" and final["refunded"] is True
    assert b.used("try") == 0


def test_an_ambiguous_name_offers_look_alikes_once(w, b):
    b.found = {"status": "ambiguous", "candidates": [CAND_A, CAND_B, CAND_C, CAND_A]}
    first = run(svc.draft(U, person_body(), Events()))
    assert first == {"type": "ambiguous", "try_id": first["try_id"], "candidates": [CAND_A, CAND_B, CAND_C]}
    t = b.the_try(first["try_id"])
    assert t["status"] == "open" and t["candidates"] == [CAND_A, CAND_B, CAND_C]
    assert b.used("try") == 1

    # A pick that is ambiguous again is not found: picks cannot search forever for free.
    second = run(svc.draft(U, pick_body(first["try_id"], 0), Events()))
    assert second["type"] == "error" and second["error"] == "not_found" and second["refunded"] is True
    assert b.used("try") == 0

    b.found = {"status": "ambiguous", "candidates": [CAND_A, CAND_B]}
    again = run(svc.draft(U, person_body(), Events()))
    b.found = FOUND
    final = run(svc.draft(U, pick_body(again["try_id"], 0), Events()))
    assert final["type"] == "draft" and b.used("try") == 1
    assert b.calls["research_person"][-1]["url"] == CAND_A["source_url"]


@pytest.mark.parametrize("found, code", [(None, "search_failed"), (RuntimeError("down"), "search_failed"),
                                         ({"status": "not_found"}, "not_found"),
                                         ({"status": "ambiguous", "candidates": []}, "not_found")])
def test_research_that_fails_gives_the_try_back(w, b, found, code):
    b.found = found
    final = run(svc.draft(U, person_body(), Events()))
    assert final["type"] == "error" and final["error"] == code and final["refunded"] is True
    if code == "not_found":
        assert "Dr. Maria Lee" in final["message"]
    assert b.used("try") == 0 and w.db.t["outreach_contacts"] == []
    assert w.db.t["outreach_tries"][0]["status"] == "refunded"
    assert not b.calls["write_draft"]


def test_a_draft_that_fails_gives_the_try_back(w, b):
    b.drafts = [DraftFailed(writer.SAFETY_STOP)]
    final = run(svc.draft(U, person_body(), Events()))
    assert final["type"] == "error" and final["error"] == "draft_failed" and final["refunded"] is True
    assert final["message"].startswith(writer.SAFETY_STOP)
    assert b.used("try") == 0 and w.db.t["outreach_contacts"] == []

    # On the answer path the question's empty card goes with the refund.
    b.drafts = [{"question": "Which grade are you in?"}, DraftFailed(writer.COULD_NOT_WRITE)]
    first = run(svc.draft(U, person_body(), Events()))
    final = run(svc.draft(U, {"try_id": first["try_id"], "answer": "11"}, Events()))
    assert final["error"] == "draft_failed" and final["refunded"] is True
    assert b.used("try") == 0 and w.db.t["outreach_contacts"] == []
    assert b.the_try(first["try_id"])["status"] == "refunded"
    # A refunded try is finished.
    assert refused(svc.draft(U, {"try_id": first["try_id"], "answer": "11"}, Events())).code == "try_closed"


def test_a_deleted_question_card_ends_the_try_with_a_refund(w, b):
    b.drafts = [{"question": "Which grade are you in?"}]
    first = run(svc.draft(U, person_body(), Events()))
    w.db.from_("outreach_contacts").delete().eq("id", first["contact_id"]).execute()   # SET NULL on the try
    err = refused(svc.draft(U, {"try_id": first["try_id"], "answer": "11"}, Events()))
    assert (err.status, err.code) == (409, "card_deleted")
    assert b.used("try") == 0 and b.the_try(first["try_id"])["status"] == "refunded"


def test_a_delivered_draft_is_never_refunded(w, b):
    b.drafted()
    assert b.used("try") == 1
    b.drafted()
    assert b.used("try") == 2
    assert refused(svc.draft(U, person_body(), Events())).code == "no_tries"
    assert [t["status"] for t in w.db.t["outreach_tries"]] == ["drafted", "drafted"]


def test_one_flow_at_a_time_per_student(w, b):
    async def scenario():
        b.pause = 0.05
        first = asyncio.create_task(svc.shortlist(U, {"goal": GOAL}, Events()))
        await REAL_SLEEP(0.01)
        with pytest.raises(AgentError) as info:
            await svc.shortlist(U, {"goal": GOAL}, Events())
        assert info.value.code == "busy"
        assert (await first)["type"] == "shortlist"
    run(scenario())
    assert b.used("try") == 1


# ── Another student's rows ────────────────────────────────────────────────────

def test_another_students_card_or_try_is_not_found(w, b):
    theirs = b.drafted(uid=V)
    shortlist = run(svc.shortlist(V, {"goal": GOAL}, Events()))
    b.connect(U)
    assert refused(svc.rewrite(U, theirs["id"], {"style": "shorter", "subject": SUBJECT, "body": BODY})).status == 404
    assert refused(svc.followup(U, theirs["id"])).status == 404
    err = refused(svc.send(U, theirs["id"], send_body(), NY))
    assert (err.status, err.code) == (404, "no_contact")
    err = refused(svc.draft(U, pick_body(shortlist["try_id"]), Events()))
    assert (err.status, err.code) == (404, "no_try")
    assert refused(svc.draft(U, pick_body("not-a-uuid"), Events())).code == "no_try"
    assert refused(svc.followup(U, "not-a-uuid")).code == "no_contact"
    assert b.used("try", uid=U) == 0 and not b.calls["send"]


# ── The payload ───────────────────────────────────────────────────────────────

def test_contact_payload_hides_the_research_and_counts_what_is_left():
    row = {"id": "c1", "user_id": U, "name": "Dr. Maria Lee", "email": "MLee@USF.edu",
           "research": {"verified_email": "mlee@usf.edu", "facts": [{"text": "secret notes"}]},
           "rewrites_used": 2, "followup_drafts_used": 5, "follow_ups_sent": 1,
           "sent_at": "2026-10-02T03:00:00+00:00", "last_sent_at": None, "manual_sent_at": None}
    out = svc.contact_payload(row)
    assert "research" not in out and "user_id" not in out and out["name"] == "Dr. Maria Lee"
    assert out["email_verified"] is True
    assert (out["rewrites_left"], out["followup_drafts_left"], out["followups_left"]) == (1, 0, 1)
    assert out["next_followup_on"] == "2026-10-12"
    # 03:00 UTC on October 2 is still October 1 in Los Angeles.
    assert svc.contact_payload(row, "America/Los_Angeles")["next_followup_on"] == "2026-10-11"
    assert svc.contact_payload({**row, "email": "someone@usf.edu"})["email_verified"] is False
    assert svc.contact_payload({**row, "research": {}})["email_verified"] is False
    assert svc.contact_payload({**row, "follow_ups_sent": 2})["next_followup_on"] is None
    assert svc.contact_payload({**row, "sent_at": None})["next_followup_on"] is None
    manual = svc.contact_payload({**row, "sent_at": None, "manual_sent_at": "2026-10-05T12:00:00Z"})
    assert manual["next_followup_on"] == "2026-10-15"


# ── Rewrites ──────────────────────────────────────────────────────────────────

def test_rewrites_use_the_editors_text_and_stop_at_three(w, b):
    card = b.drafted()
    edited = BODY.replace("fifteen minute", "short")
    out = run(svc.rewrite(U, card["id"], {"style": "shorter", "subject": "My own subject", "body": edited}))
    call = b.calls["rewrite_draft"][0]
    assert (call["subject"], call["body"], call["style"]) == ("My own subject", edited, "shorter")
    assert call["research"] == FOUND and call["purpose"] == "research" and call["student_name"] == "Ada"
    assert out["contact"]["body"] == REWRITTEN["body"] and out["contact"]["rewrites_left"] == 2
    assert b.card(card["id"])["subject"] == REWRITTEN["subject"]
    assert not b.calls["research_person"][1:]                    # no search

    b.rewrites = [DraftFailed(writer.COULD_NOT_WRITE)]
    err = refused(svc.rewrite(U, card["id"], {"style": "warmer", "subject": SUBJECT, "body": BODY}))
    assert (err.status, err.code, err.message) == (502, "rewrite_failed", writer.COULD_NOT_WRITE)
    assert b.card(card["id"])["rewrites_used"] == 1              # a failed rewrite is not counted

    for style in ("warmer", "formal"):
        run(svc.rewrite(U, card["id"], {"style": style, "subject": SUBJECT, "body": BODY}))
    assert b.card(card["id"])["rewrites_used"] == 3
    err = refused(svc.rewrite(U, card["id"], {"style": "smaller_ask", "subject": SUBJECT, "body": BODY}))
    assert (err.status, err.code) == (409, "rewrites_spent")
    assert b.used("try") == 1                                    # rewrites never cost a try


def test_rewrite_refusals(w, b):
    card = b.drafted()
    assert refused(svc.rewrite(U, card["id"], {"style": "louder", "subject": SUBJECT, "body": BODY})).code == "bad_style"
    assert refused(svc.rewrite(U, card["id"], {"style": "shorter", "subject": SUBJECT, "body": "  "})).code == "empty"
    manual = w.db.from_("outreach_contacts").insert({"user_id": U, "name": "Coach Kim", "body": BODY}).execute().data[0]
    assert refused(svc.rewrite(U, manual["id"], {"style": "shorter", "subject": SUBJECT, "body": BODY})).code == "no_research"
    b.card(card["id"])["manual_sent_at"] = NOW.isoformat()
    err = refused(svc.rewrite(U, card["id"], {"style": "shorter", "subject": SUBJECT, "body": BODY}))
    assert (err.status, err.code) == (409, "already_sent")
    assert not b.calls["rewrite_draft"]


# ── Follow-up drafts ──────────────────────────────────────────────────────────

def test_a_follow_up_needs_a_first_email_sent(w, b):
    card = b.drafted()
    err = refused(svc.followup(U, card["id"]))
    assert (err.status, err.code) == (409, "not_sent")
    # Marked as sent by hand counts for drafting.
    b.card(card["id"]).update(stage="sent", manual_sent_at=(NOW - timedelta(days=12)).isoformat())
    out = run(svc.followup(U, card["id"]))
    assert out["contact"]["followup_body"] == FOLLOWUP and out["contact"]["followup_drafts_left"] == 2
    call = b.calls["write_followup"][0]
    assert (call["subject"], call["body_sent"], call["days_since"], call["student_name"]) == (SUBJECT, BODY, 12, "Ada")
    assert call["research"] == FOUND


def test_follow_up_drafts_stop_at_three_and_after_two_sent(w, b):
    card = b.drafted()
    b.card(card["id"]).update(stage="sent", manual_sent_at=NOW.isoformat())
    b.followups = [DraftFailed(writer.COULD_NOT_FOLLOW_UP)]
    err = refused(svc.followup(U, card["id"]))
    assert (err.status, err.code) == (502, "followup_failed")
    assert b.card(card["id"])["followup_drafts_used"] == 0
    for _ in range(3):
        run(svc.followup(U, card["id"]))
    assert refused(svc.followup(U, card["id"])).code == "followup_drafts_spent"
    b.card(card["id"]).update(follow_ups_sent=2)
    assert refused(svc.followup(U, card["id"])).code == "followups_spent"


def test_a_hand_made_card_can_get_a_follow_up_from_what_it_holds(w, b):
    manual = w.db.from_("outreach_contacts").insert({
        "user_id": U, "name": "Coach Kim", "title": "Swim coach", "organization": "Tampa Aquatics",
        "stage": "sent", "manual_sent_at": NOW.isoformat()}).execute().data[0]
    assert refused(svc.followup(U, manual["id"])).code == "no_email"
    b.card(manual["id"])["body"] = "Hi Coach Kim, could I shadow a practice?"
    run(svc.followup(U, manual["id"]))
    research_used = b.calls["write_followup"][0]["research"]
    assert research_used["person"]["name"] == "Coach Kim" and research_used["facts"] == []


# ── Sending ───────────────────────────────────────────────────────────────────

def test_the_first_email_goes_out_and_lands_on_the_card(w, b):
    b.connect()
    card = b.drafted()
    out = run(svc.send(U, card["id"], send_body(to=" MLee@USF.edu "), NY))
    assert b.calls["send"] == [{"user_id": U, "to": "MLee@USF.edu", "subject": SUBJECT, "body": BODY,
                                "thread_id": None, "in_reply_to": None, "from_name": "Ada"}]
    row = b.card(card["id"])
    assert (row["stage"], row["sent_via"], row["email"]) == ("sent", "gmail", "mlee@usf.edu")
    assert row["sent_at"] == row["last_sent_at"] == NOW.isoformat()
    assert (row["gmail_thread_id"], row["message_id_header"]) == ("thread-1", "<m1@mail.gmail.com>")
    assert (row["subject"], row["body"], row["follow_up_on"]) == (SUBJECT, BODY, "2026-10-11")
    sends = w.db.t["outreach_sends"]
    assert len(sends) == 1
    assert {k: sends[0][k] for k in ("user_id", "contact_id", "to_email", "to_key", "from_email", "kind", "status",
                                     "gmail_message_id", "gmail_thread_id")} == {
        "user_id": U, "contact_id": card["id"], "to_email": "mlee@usf.edu", "to_key": "mlee@usf.edu",
        "from_email": "ada@gmail.com", "kind": "first", "status": "sent",
        "gmail_message_id": "msg-1", "gmail_thread_id": "thread-1"}
    assert b.used("send") == 1
    assert w.db.t["agent_usage"][-1]["bucket"] == "2026-10-01"  # the UTC date
    assert out["contact"]["next_followup_on"] == "2026-10-11" and out["contact"]["email_verified"] is True
    assert "research" not in out["contact"]


def test_follow_ups_reply_in_the_thread_ten_days_apart_at_most_twice(w, b):
    card = b.sent_card()
    b.card(card["id"])["followup_body"] = FOLLOWUP
    fu = send_body(kind="followup", subject="anything", body=FOLLOWUP)

    b.now = NOW + timedelta(days=5)
    err = refused(svc.send(U, card["id"], fu, NY))
    assert (err.status, err.code) == (409, "too_soon")
    assert "October 11" in err.message
    err = refused(svc.send(U, card["id"], {**fu, "to": "someone.else@usf.edu"}, NY))
    assert (err.status, err.code) == (422, "bad_address")

    b.now = NOW + timedelta(days=10)
    out = run(svc.send(U, card["id"], {**fu, "to": "MLEE@usf.edu"}, NY))
    call = b.calls["send"][-1]
    assert (call["thread_id"], call["in_reply_to"]) == ("thread-1", "<m1@mail.gmail.com>")
    assert call["subject"] == "Re: " + SUBJECT and call["body"] == FOLLOWUP
    row = b.card(card["id"])
    assert (row["follow_ups_sent"], row["last_sent_at"], row["followup_body"]) == (1, b.now.isoformat(), "")
    assert row["sent_at"] == NOW.isoformat() and row["body"] == BODY    # the first email is kept as it was
    assert row["message_id_header"] == "<m1@mail.gmail.com>"
    assert out["contact"]["followups_left"] == 1 and out["contact"]["next_followup_on"] == "2026-10-21"
    assert [s["kind"] for s in w.db.t["outreach_sends"]] == ["first", "followup"]

    b.now = NOW + timedelta(days=19)
    assert refused(svc.send(U, card["id"], fu, NY)).code == "too_soon"
    b.now = NOW + timedelta(days=20)
    run(svc.send(U, card["id"], fu, NY))
    b.now = NOW + timedelta(days=40)
    err = refused(svc.send(U, card["id"], fu, NY))
    assert (err.status, err.code) == (409, "followups_spent")
    assert b.used("send") == 3                                   # one a day, each in its own UTC day's bucket
    assert sorted(r["bucket"] for r in w.db.t["agent_usage"] if r["kind"] == "send") == [
        "2026-10-01", "2026-10-11", "2026-10-21"]


def test_a_gmail_follow_up_needs_a_first_gmail_send(w, b):
    b.connect()
    card = b.drafted()
    fu = send_body(kind="followup", body=FOLLOWUP)
    err = refused(svc.send(U, card["id"], fu, NY))
    assert (err.status, err.code) == (409, "not_sent")
    b.card(card["id"]).update(stage="sent", manual_sent_at=(NOW - timedelta(days=30)).isoformat())
    err = refused(svc.send(U, card["id"], fu, NY))
    assert err.code == "not_sent" and "copy it" in err.message
    assert not b.calls["send"] and b.used("send") == 0


def test_one_first_email_per_address_ignoring_case(w, b):
    b.connect()
    first = b.drafted()
    run(svc.send(U, first["id"], send_body(to="mlee@usf.edu"), NY))
    second = b.drafted()
    err = refused(svc.send(U, second["id"], send_body(to="MLEE@USF.EDU"), NY))
    assert (err.status, err.code) == (409, "already_emailed")
    assert len(b.calls["send"]) == 1 and b.used("send") == 1
    # The same card twice.
    err = refused(svc.send(U, first["id"], send_body(to="other@usf.edu"), NY))
    assert err.code == "already_emailed"


def test_a_race_to_the_same_address_is_stopped_by_the_unique_index(w, b, monkeypatch):
    b.connect()
    first = b.drafted()
    second = b.drafted()
    run(svc.send(U, first["id"], send_body(), NY))
    monkeypatch.setattr(svc, "_first_sends", lambda user_id: [])     # the other request checked first
    monkeypatch.setattr(svc, "_first_sent_from", lambda from_email, to_key: False)
    err = refused(svc.send(U, second["id"], send_body(to="MLee@usf.edu"), NY))
    assert (err.status, err.code) == (409, "already_emailed")
    assert len(b.calls["send"]) == 1 and b.used("send") == 1        # the second unit was given back
    assert len(w.db.t["outreach_sends"]) == 1


def test_a_card_marked_sent_by_hand_is_not_sent_again(w, b):
    b.connect()
    card = b.drafted()
    b.card(card["id"])["manual_sent_at"] = NOW.isoformat()
    err = refused(svc.send(U, card["id"], send_body(), NY))
    assert err.code == "already_emailed" and not b.calls["send"]


def test_personal_addresses_need_to_be_the_verified_one(w, b):
    b.connect()
    card = b.drafted()
    err = refused(svc.send(U, card["id"], send_body(to="maria.lee@gmail.com"), NY))
    assert (err.status, err.code) == (422, "personal_address")
    # Found only on a page the student pointed Beaker at: not verified enough
    # for a personal mailbox.
    b.found = {**FOUND, "verified_email": "maria.lee@gmail.com", "email_source_kind": "given"}
    card = b.drafted()
    assert refused(svc.send(U, card["id"], send_body(to="maria.lee@gmail.com"), NY)).code == "personal_address"
    # Research from before the field existed says nothing of where: not verified either.
    b.connect(uid=V)
    b.found = {**FOUND, "verified_email": "maria.lee@gmail.com"}
    card = b.drafted(uid=V)
    assert refused(svc.send(V, card["id"], send_body(to="maria.lee@gmail.com"), NY)).code == "personal_address"
    # Found on a page the search itself returned: allowed, in any spelling of that mailbox.
    b.found = {**FOUND, "verified_email": "maria.lee@gmail.com", "email_source_kind": "search"}
    card = b.drafted(uid=V)
    run(svc.send(V, card["id"], send_body(to="Maria.Lee@Gmail.com"), NY))
    assert b.calls["send"][-1]["to"] == "Maria.Lee@Gmail.com"
    assert not svc._published_personal({**b.found, "email_source_kind": "search"}, "someone@gmail.com")


@pytest.mark.parametrize("address", ["kim@yahoo.fr", "kim@outlook.co.uk", "kim@live.co.uk", "kim@hotmail.fr",
                                     "kim@btinternet.com", "kim@naver.com", "kim@tampabay.rr.com",
                                     "kim@hotmail.com.br", "kim@web.de"])
def test_the_personal_address_list_covers_country_and_isp_domains(w, b, address):
    b.connect()
    card = b.drafted()
    assert refused(svc.send(U, card["id"], send_body(to=address), NY)).code == "personal_address"


def test_school_and_work_domains_are_not_personal():
    for address in ("mlee@usf.edu", "mlee@mail.usf.edu", "ortiz@mote.org", "a@orange.com", "a@live.edu",
                    "a@noaa.gov"):
        assert not svc._free_mail(address), address


@pytest.mark.parametrize("over, code", [
    ({"to": "not an address"}, "bad_address"),
    ({"to": "a@b.com, c@d.com"}, "bad_address"),
    ({"to": "mlee@usf.edu\r\nBcc: x@y.com"}, "bad_address"),
    ({"body": "   "}, "bad_content"),
    ({"subject": ""}, "bad_content"),
    ({"body": BODY.replace("Thank you,", "Call me at (813) 555-0142. Thank you,")}, "bad_content"),
    ({"body": BODY.replace("Thank you,", "Best, [Your Name]")}, "bad_content"),
    ({"body": BODY + " word" * 120}, "bad_content"),
    ({"subject": "one two three four five six seven eight nine ten eleven twelve thirteen"}, "bad_content"),
    ({"kind": "third"}, "bad_kind"),
])
def test_send_content_and_address_refusals(w, b, over, code):
    b.connect()
    card = b.drafted()
    err = refused(svc.send(U, card["id"], send_body(**over), NY))
    assert err.code == code and err.status == 422
    if "Call me" in str(over.get("body")):
        assert "phone number" in err.message
    assert not b.calls["send"] and b.used("send") == 0 and w.db.t["outreach_sends"] == []


def test_gmail_is_checked_first(w, b):
    card = b.drafted()
    bad = send_body(body="")
    err = refused(svc.send(U, card["id"], bad, NY))
    assert (err.status, err.code) == (409, "gmail_not_connected")
    b.connect()
    b.token_error = GoogleError("reconnect")
    err = refused(svc.send(U, card["id"], bad, NY))
    assert (err.status, err.code) == (409, "gmail_reconnect")
    b.configured = False
    err = refused(svc.send(U, card["id"], bad, NY))
    assert (err.status, err.code) == (503, "not_configured")
    assert not b.calls["send"]


def test_five_sends_a_day_and_a_failed_send_is_given_back(w, b):
    b.connect()
    card = b.drafted()
    b.spend_all(kind="send", bucket="2026-10-01", n=5)
    err = refused(svc.send(U, card["id"], send_body(), NY))
    assert (err.status, err.code) == (429, "SEND_LIMIT")
    assert "5 emails today" in err.message
    b.now = NOW + timedelta(days=1)                              # a new local day

    for error, status, code in [(GoogleError("send_failed"), 502, "send_failed"),
                                (GoogleError("reconnect"), 409, "gmail_reconnect")]:
        b.send_errors = [error]
        err = refused(svc.send(U, card["id"], send_body(), NY))
        assert (err.status, err.code) == (status, code)
        assert b.used("send") == 5                               # only yesterday's five
        assert w.db.t["outreach_sends"] == []                    # the reservation is gone
        assert b.card(card["id"])["stage"] == "drafted" and b.card(card["id"])["sent_at"] is None

    out = run(svc.send(U, card["id"], send_body(), NY))
    assert out["contact"]["stage"] == "sent" and b.used("send") == 6


def test_a_send_gmail_may_have_made_keeps_its_reservation(w, b):
    b.connect()
    card = b.drafted()
    b.send_errors = [GoogleError("send_failed", "Gmail did not confirm the email. Check your Sent folder before "
                                                "trying again.", maybe_sent=True)]
    err = refused(svc.send(U, card["id"], send_body(), NY))
    assert (err.status, err.code) == (502, "send_unconfirmed") and "Sent folder" in err.message
    assert [s["status"] for s in w.db.t["outreach_sends"]] == ["sending"]
    assert b.used("send") == 1
    err = refused(svc.send(U, card["id"], send_body(), NY))
    assert err.code == "already_emailed" and len(b.calls["send"]) == 1


def test_a_failed_follow_up_gives_its_count_back(w, b):
    card = b.sent_card()
    b.now = NOW + timedelta(days=11)
    b.send_errors = [GoogleError("send_failed")]
    fu = send_body(kind="followup", body=FOLLOWUP)
    assert refused(svc.send(U, card["id"], fu, NY)).code == "send_failed"
    assert b.card(card["id"])["follow_ups_sent"] == 0
    assert [s["kind"] for s in w.db.t["outreach_sends"]] == ["first"]
    run(svc.send(U, card["id"], fu, NY))
    assert b.card(card["id"])["follow_ups_sent"] == 1


# ── Tries nobody can finish ───────────────────────────────────────────────────

def stranded_try(mode="person", goal=""):
    """A try spent and recorded, then left: the process stopped mid-run."""
    run(svc._spend_try(U))
    return run(svc._new_try(U, mode=mode, goal=goal))


def test_a_try_left_open_mid_run_is_given_back_once(w, b):
    row = stranded_try()
    assert b.used("try") == 1
    # In its first minutes it could still be running somewhere: shown, not touched.
    assert run(svc.status(U, None))["open_try"]["id"] == row["id"]
    b.now = NOW + timedelta(minutes=6)
    out = run(svc.status(U, None))
    assert out["open_try"] is None and out["tries"] == {"used": 0, "limit": 2, "left": 2}
    assert b.the_try(row["id"])["status"] == "refunded"
    assert b.used("search") == 1                              # the search it ran is not given back
    # Given back once: a try spent since stays spent however often status looks.
    b.drafted()
    for _ in range(3):
        run(svc.status(U, None))
    assert b.used("try") == 1


def test_a_run_in_progress_is_never_swept(w, b):
    row = stranded_try()
    b.now = NOW + timedelta(minutes=30)
    svc._WORKING.add(U)
    try:
        assert run(svc.status(U, None))["open_try"]["id"] == row["id"]
    finally:
        svc._WORKING.discard(U)
    assert b.the_try(row["id"])["status"] == "open" and b.used("try") == 1


def test_a_new_start_gives_back_stranded_tries_first(w, b):
    stranded_try()
    stranded_try(mode="goal", goal=GOAL)
    assert refused(svc.shortlist(U, {"goal": GOAL}, Events())).code == "no_tries"
    b.now = NOW + timedelta(minutes=6)
    assert run(svc.shortlist(U, {"goal": GOAL}, Events()))["type"] == "shortlist"
    assert b.used("try") == 1
    assert sorted(t["status"] for t in w.db.t["outreach_tries"]) == ["open", "refunded", "refunded"]


def test_a_try_left_open_an_hour_is_given_back_with_its_empty_card(w, b):
    b.drafts = [{"question": "Which grade are you in?"}]
    first = run(svc.draft(U, person_body(), Events()))
    b.now = NOW + timedelta(minutes=59)
    assert run(svc.status(U, None))["open_try"]["pending_question"] == "Which grade are you in?"
    b.now = NOW + timedelta(hours=1, minutes=1)
    out = run(svc.status(U, None))
    assert out["open_try"] is None and out["tries"]["used"] == 0
    assert w.db.t["outreach_contacts"] == []                  # its research goes with the refund
    assert refused(svc.draft(U, {"try_id": first["try_id"], "answer": "11"}, Events())).code == "try_closed"


def test_a_card_the_student_wrote_in_survives_the_sweep(w, b):
    b.drafts = [{"question": "Which grade are you in?"}]
    first = run(svc.draft(U, person_body(), Events()))
    b.card(first["contact_id"])["notes"] = "Met her at the science fair"
    b.now = NOW + timedelta(hours=2)
    run(svc.status(U, None))
    assert b.card(first["contact_id"])["notes"] == "Met her at the science fair"


def test_status_shows_the_try_still_open_not_just_the_newest(w, b):
    b.drafts = [{"question": "Which grade are you in?"}, DRAFT]
    first = run(svc.draft(U, person_body(), Events()))
    b.drafted()                                               # started over instead of answering
    out = run(svc.status(U, None))
    assert out["open_try"]["id"] == first["try_id"] and out["open_try"]["pending_question"]


def test_a_pick_refused_for_searches_gives_the_try_back(w, b):
    final = run(svc.shortlist(U, {"goal": GOAL}, Events()))
    next(r for r in w.db.t["agent_usage"] if r["kind"] == "search")["used"] = 8
    err = refused(svc.draft(U, pick_body(final["try_id"]), Events()))
    assert (err.status, err.code) == (409, "no_searches") and err.message.endswith("Your try was given back.")
    assert b.used("try") == 0 and b.the_try(final["try_id"])["status"] == "refunded"
    assert not b.calls["research_person"]
    assert run(svc.status(U, None))["searches"] == {"used": 8, "limit": 8, "left": 0}


# ── The deadline ──────────────────────────────────────────────────────────────

def test_a_run_past_its_deadline_is_stopped_and_given_back(w, b, monkeypatch):
    monkeypatch.setattr(svc, "RUN_DEADLINE", 0.05)
    b.pause = 0.5                                             # the search stalls
    final = run(svc.shortlist(U, {"goal": GOAL}, Events()))
    assert final == {"type": "error", "error": "timed_out", "message": svc.TIMED_OUT + svc.GAVE_BACK,
                     "refunded": True}
    assert b.used("try") == 0 and [t["status"] for t in w.db.t["outreach_tries"]] == ["refunded"]
    assert not svc._WORKING                                    # the student's lock is free again
    b.pause = 0
    assert run(svc.shortlist(U, {"goal": GOAL}, Events()))["type"] == "shortlist"


def test_an_answer_past_its_deadline_gives_back_the_try_and_its_empty_card(w, b, monkeypatch):
    b.drafts = [{"question": "Which grade are you in?"}]
    first = run(svc.draft(U, person_body(), Events()))

    async def stalled(**_kw):
        await REAL_SLEEP(0.5)
    monkeypatch.setattr(writer, "write_draft", stalled)
    monkeypatch.setattr(svc, "RUN_DEADLINE", 0.05)
    final = run(svc.draft(U, {"try_id": first["try_id"], "answer": "11"}, Events()))
    assert final["error"] == "timed_out" and final["refunded"] is True
    assert b.used("try") == 0 and w.db.t["outreach_contacts"] == []


def test_a_draft_that_lands_as_time_runs_out_is_still_delivered(w, b, monkeypatch):
    import time
    real = svc._deliver

    def slow_deliver(*a, **k):
        saved = real(*a, **k)                                 # on the card, try marked drafted
        time.sleep(0.6)
        return saved
    monkeypatch.setattr(svc, "_deliver", slow_deliver)
    monkeypatch.setattr(svc, "RUN_DEADLINE", 0.3)
    final = run(svc.draft(U, person_body(), Events()))
    assert final["type"] == "draft" and final["contact"]["body"] == BODY
    assert b.used("try") == 1 and w.db.t["outreach_tries"][0]["status"] == "drafted"


# ── Budgets that cannot be checked, refunds that fail ─────────────────────────

def break_rpc(w, monkeypatch, broken):
    real = w.db.rpc

    def rpc(fn, params):
        if broken(fn, params):
            raise RuntimeError("database down")
        return real(fn, params)
    monkeypatch.setattr(w.db, "rpc", rpc)


def test_a_budget_that_cannot_be_checked_is_not_reported_spent(w, b, monkeypatch):
    break_rpc(w, monkeypatch, lambda fn, p: fn == "agent_bump_usage")
    for start in (lambda: svc.shortlist(U, {"goal": GOAL}, Events()), lambda: svc.draft(U, person_body(), Events())):
        err = refused(start())
        assert (err.status, err.code, err.message) == (
            503, "budget_unavailable", "Beaker couldn't check your limits just now. Try again in a minute.")
    assert w.db.t["outreach_tries"] == [] and not b.calls["find_people"] and not b.calls["research_person"]


def test_a_search_that_cannot_be_checked_gives_the_try_back(w, b, monkeypatch):
    break_rpc(w, monkeypatch, lambda fn, p: fn == "agent_bump_usage" and p["p_kind"] == "search")
    assert refused(svc.shortlist(U, {"goal": GOAL}, Events())).code == "budget_unavailable"
    assert b.used("try") == 0


def test_a_send_or_a_rewrite_that_cannot_be_checked_spends_nothing(w, b, monkeypatch):
    b.connect()
    card = b.drafted()
    break_rpc(w, monkeypatch, lambda fn, p: fn == "agent_bump_usage")
    err = refused(svc.send(U, card["id"], send_body(), NY))
    assert (err.status, err.code) == (503, "budget_unavailable")
    assert not b.calls["send"] and w.db.t["outreach_sends"] == []
    err = refused(svc.rewrite(U, card["id"], {"style": "warmer", "subject": SUBJECT, "body": BODY}))
    assert (err.status, err.code) == (503, "budget_unavailable")
    assert b.card(card["id"])["rewrites_used"] == 0 and not b.calls["rewrite_draft"]


def test_a_refund_that_fails_is_not_announced(w, b, monkeypatch):
    b.found = None
    break_rpc(w, monkeypatch, lambda fn, p: fn == "agent_refund_usage")
    final = run(svc.draft(U, person_body(), Events()))
    assert final["type"] == "error" and final["refunded"] is False
    assert "given back" not in final["message"]
    assert b.used("try") == 1
    # Closed all the same, so nothing can give it back twice later.
    assert w.db.t["outreach_tries"][0]["status"] == "refunded"


def test_the_budget_route_answers_503(w, b, client, monkeypatch):
    break_rpc(w, monkeypatch, lambda fn, p: fn == "agent_bump_usage")
    res = client.post("/agents/outreach/shortlist", json={"goal": GOAL})
    assert res.status_code == 503 and res.json()["detail"]["error"] == "budget_unavailable"


# ── The write budget ──────────────────────────────────────────────────────────

def test_rewrites_and_follow_up_drafts_share_a_write_budget_failures_spend(w, b):
    card = b.drafted()
    b.rewrites = [DraftFailed(writer.COULD_NOT_WRITE)] * 5
    for _ in range(5):
        err = refused(svc.rewrite(U, card["id"], {"style": "warmer", "subject": SUBJECT, "body": BODY}))
        assert err.code == "rewrite_failed"
    assert b.card(card["id"])["rewrites_used"] == 0              # the card's own count is given back
    assert b.used("write") == 5                                  # the student's writes are not
    next(r for r in w.db.t["agent_usage"] if r["kind"] == "write")["used"] = 20
    err = refused(svc.rewrite(U, card["id"], {"style": "warmer", "subject": SUBJECT, "body": BODY}))
    assert (err.status, err.code) == (409, "no_writes")
    assert b.card(card["id"])["rewrites_used"] == 0 and len(b.calls["rewrite_draft"]) == 5
    assert run(svc.status(U, None))["writes"] == {"used": 20, "limit": 20, "left": 0}


def test_hand_made_cards_cannot_buy_unlimited_follow_up_drafts(w, b):
    ids = [w.db.from_("outreach_contacts").insert({
        "user_id": U, "name": f"Coach {i}", "stage": "sent", "manual_sent_at": NOW.isoformat(),
        "body": "Hi Coach, could I shadow one of your practices this month?"}).execute().data[0]["id"]
        for i in range(10)]
    refusals = []
    for cid in ids:
        for _ in range(3):
            try:
                run(svc.followup(U, cid))
            except AgentError as exc:
                refusals.append(exc.code)
    assert len(b.calls["write_followup"]) == 20
    assert set(refusals) == {"no_writes"} and len(refusals) == 10


def test_a_shorter_rewrite_of_an_email_at_the_floor_is_refused_for_free(w, b):
    card = b.drafted()
    err = refused(svc.rewrite(U, card["id"], {"style": "shorter", "subject": "S", "body": "Hi Dr Lee"}))
    assert (err.status, err.code) == (422, "too_short")
    assert not b.calls["rewrite_draft"] and b.used("write") == 0 and b.card(card["id"])["rewrites_used"] == 0
    run(svc.rewrite(U, card["id"], {"style": "warmer", "subject": "S", "body": "Hi Dr Lee"}))   # may grow it


# ── Late results never land on a card sent or edited meanwhile ────────────────

def paused(monkeypatch, module, name):
    """Replace module.name with a version that waits on `gate` after saying it
    started (`entered`), then runs the original."""
    real = getattr(module, name)
    entered, gate = asyncio.Event(), asyncio.Event()

    async def slow(**kw):
        entered.set()
        await gate.wait()
        return await real(**kw)
    monkeypatch.setattr(module, name, slow)
    return entered, gate


def test_a_rewrite_never_lands_on_an_email_sent_meanwhile(w, b, monkeypatch):
    b.connect()
    card = b.drafted()

    async def scenario():
        entered, gate = paused(monkeypatch, writer, "rewrite_draft")
        task = asyncio.create_task(svc.rewrite(U, card["id"], {"style": "warmer", "subject": SUBJECT, "body": BODY}))
        await entered.wait()
        await svc.send(U, card["id"], send_body(), NY)
        gate.set()
        with pytest.raises(AgentError) as info:
            await task
        return info.value
    err = run(scenario())
    assert (err.status, err.code) == (409, "already_sent")
    row = b.card(card["id"])
    assert (row["subject"], row["body"], row["claims"]) == (SUBJECT, BODY, DRAFT["claims"])   # what Gmail sent
    assert row["rewrites_used"] == 0 and b.used("write") == 0


def test_a_rewrite_never_overwrites_an_edit_made_meanwhile(w, b, monkeypatch):
    card = b.drafted()
    mine = BODY + "\n\nP.S. I also started a reef club at school."

    async def scenario():
        entered, gate = paused(monkeypatch, writer, "rewrite_draft")
        task = asyncio.create_task(svc.rewrite(U, card["id"], {"style": "warmer", "subject": SUBJECT, "body": BODY}))
        await entered.wait()
        w.db.from_("outreach_contacts").update({"body": mine, "updated_at": "2026-10-01T16:00:05+00:00"}) \
            .eq("id", card["id"]).execute()
        gate.set()
        with pytest.raises(AgentError) as info:
            await task
        return info.value
    err = run(scenario())
    assert (err.status, err.code) == (409, "changed")
    assert b.card(card["id"])["body"] == mine and b.card(card["id"])["rewrites_used"] == 0
    assert b.used("write") == 1                                 # an edit can be repeated: the write stays spent


def test_an_autosave_of_the_same_words_does_not_block_a_rewrite(w, b, monkeypatch):
    card = b.drafted()
    edited = BODY.replace("fifteen minute", "short")

    async def scenario():
        entered, gate = paused(monkeypatch, writer, "rewrite_draft")
        task = asyncio.create_task(svc.rewrite(U, card["id"], {"style": "warmer", "subject": SUBJECT, "body": edited}))
        await entered.wait()
        # The editor's autosave lands: the very words the rewrite started from.
        w.db.from_("outreach_contacts").update({"body": edited + "  ", "updated_at": "2026-10-01T16:00:05+00:00"}) \
            .eq("id", card["id"]).execute()
        gate.set()
        return await task
    out = run(scenario())
    assert out["contact"]["body"] == REWRITTEN["body"] and b.card(card["id"])["rewrites_used"] == 1


def test_an_answer_draft_never_overwrites_an_email_written_on_the_card_meanwhile(w, b, monkeypatch):
    b.drafts = [{"question": "Which grade are you in?"}, DRAFT]
    first = run(svc.draft(U, person_body(), Events()))
    question_card = first["contact_id"]

    async def scenario():
        entered, gate = paused(monkeypatch, writer, "write_draft")
        task = asyncio.create_task(svc.draft(U, {"try_id": first["try_id"], "answer": "11"}, Events()))
        await entered.wait()
        w.db.from_("outreach_contacts").update({"subject": "My own", "body": "My own words, sent by me.",
                                                "updated_at": "2026-10-01T16:00:05+00:00"}) \
            .eq("id", question_card).execute()
        gate.set()
        return await task
    final = run(scenario())
    assert final["type"] == "draft" and final["contact"]["id"] != question_card
    assert b.card(question_card)["body"] == "My own words, sent by me."
    new = b.card(final["contact"]["id"])
    assert new["body"] == BODY and new["research"] == FOUND and new["stage"] == "drafted"
    t = b.the_try(first["try_id"])
    assert (t["status"], t["contact_id"]) == ("drafted", new["id"]) and b.used("try") == 1


def test_a_follow_up_draft_is_not_saved_over_a_follow_up_sent_meanwhile(w, b, monkeypatch):
    card = b.sent_card()
    b.now = NOW + timedelta(days=11)

    async def scenario():
        entered, gate = paused(monkeypatch, writer, "write_followup")
        task = asyncio.create_task(svc.followup(U, card["id"]))
        await entered.wait()
        await svc.send(U, card["id"], send_body(kind="followup", body=FOLLOWUP), NY)
        gate.set()
        with pytest.raises(AgentError) as info:
            await task
        return info.value
    err = run(scenario())
    assert (err.status, err.code) == (409, "changed")
    row = b.card(card["id"])
    assert (row["follow_ups_sent"], row["followup_body"], row["followup_drafts_used"]) == (1, "", 0)
    assert b.used("write") == 0


# ── The student's own day on every payload ────────────────────────────────────

def test_follow_up_payloads_use_the_students_day(w, b):
    w.profile["timezone"] = "America/Los_Angeles"
    card = b.drafted()
    # Marked sent at 6 pm Pacific on October 1, which is 01:00 UTC on October 2.
    b.card(card["id"]).update(stage="sent", manual_sent_at="2026-10-02T01:00:00+00:00")
    b.now = datetime(2026, 10, 11, 18, 0, tzinfo=timezone.utc)
    out = run(svc.followup(U, card["id"], "Europe/Paris"))           # a stored zone wins over the header
    assert out["contact"]["next_followup_on"] == "2026-10-11"


def test_the_follow_up_route_passes_the_browsers_zone(w, b, client):
    card = b.drafted()
    b.card(card["id"]).update(stage="sent", manual_sent_at="2026-10-02T01:00:00+00:00")
    res = client.post(f"/agents/outreach/contacts/{card['id']}/followup",
                      headers={"X-Timezone": "America/Los_Angeles"})
    assert res.status_code == 200 and res.json()["contact"]["next_followup_on"] == "2026-10-11"
    assert w.profile["timezone"] == "America/Los_Angeles"


# ── Sending: per Gmail address, per mailbox, per UTC day ──────────────────────

def test_a_second_account_on_the_same_gmail_does_not_start_the_rules_over(w, b):
    b.connect(U)
    b.connect(V)                                                 # the same Gmail, a second Mentorable account
    mine = b.drafted(uid=U)
    run(svc.send(U, mine["id"], send_body(), NY))
    theirs = b.drafted(uid=V)
    err = refused(svc.send(V, theirs["id"], send_body(to="MLee+reef@usf.edu"), NY))
    assert (err.status, err.code) == (409, "already_emailed")
    assert len(b.calls["send"]) == 1
    assert not [r for r in w.db.t["agent_usage"] if r["user_id"] == V and r["kind"] == "send"]   # refused first

    # Four more from U today, then V would be the sixth from that Gmail address.
    for i in range(4):
        card = w.db.from_("outreach_contacts").insert({"user_id": U, "name": f"Dr. {i}"}).execute().data[0]
        run(svc.send(U, card["id"], send_body(to=f"prof{i}@usf.edu"), NY))
    err = refused(svc.send(V, theirs["id"], send_body(to="someone.new@usf.edu"), NY))
    assert (err.status, err.code) == (429, "SEND_LIMIT") and "Gmail address" in err.message
    assert b.used("send", uid=V) == 0 and len(b.calls["send"]) == 5
    assert not [s for s in w.db.t["outreach_sends"] if s["user_id"] == V]
    b.now = NOW + timedelta(days=1)                              # a new UTC day
    run(svc.send(V, theirs["id"], send_body(to="someone.new@usf.edu"), NY))


def test_dev_accounts_skip_the_daily_caps_as_elsewhere(w, b):
    w.db.emails[U] = "kwu.1600@gmail.com"
    b.connect()
    for i in range(7):
        card = w.db.from_("outreach_contacts").insert({"user_id": U, "name": f"Dr. {i}"}).execute().data[0]
        run(svc.send(U, card["id"], send_body(to=f"prof{i}@usf.edu"), NY))
    assert len(b.calls["send"]) == 7


def test_one_first_email_per_mailbox_whatever_the_spelling(w, b):
    b.connect()
    first = b.drafted()
    run(svc.send(U, first["id"], send_body(to="mlee@usf.edu"), NY))
    second = b.drafted()
    for alias in ("mlee+2@usf.edu", "MLee+lab@USF.edu"):
        assert refused(svc.send(U, second["id"], send_body(to=alias), NY)).code == "already_emailed"
    # A send from before to_key existed still counts, canonicalized here.
    w.db.t["outreach_sends"].append({"id": "old", "user_id": U, "contact_id": None, "to_email": "kim+old@ut.edu",
                                     "kind": "first", "status": "sent", "to_key": None, "from_email": None,
                                     "sent_at": "2026-09-30T12:00:00+00:00"})
    assert refused(svc.send(U, second["id"], send_body(to="kim@ut.edu"), NY)).code == "already_emailed"
    assert len(b.calls["send"]) == 1
    assert svc._recipient_key("M.A.Ria.Lee+x@googlemail.com") == "marialee@gmail.com"
    assert svc._recipient_key("m.lee+x@usf.edu") == "m.lee@usf.edu"      # dots matter outside Gmail


def test_a_follow_up_may_use_another_spelling_of_the_same_mailbox(w, b):
    card = b.sent_card()
    b.now = NOW + timedelta(days=10)
    run(svc.send(U, card["id"], send_body(kind="followup", to="MLee+x@usf.edu", body=FOLLOWUP), NY))
    assert b.card(card["id"])["follow_ups_sent"] == 1


def test_the_daily_cap_is_counted_in_utc_whatever_zone_the_profile_says(w, b):
    b.connect()
    card = b.drafted()
    b.spend_all(kind="send", bucket="2026-10-01", n=5)
    for zone in ("Pacific/Kiritimati", "Etc/GMT+12", NY):
        w.profile["timezone"] = zone                           # a new local date in each
        err = refused(svc.send(U, card["id"], send_body(), zone))
        assert (err.status, err.code) == (429, "SEND_LIMIT")
    assert "You can send more after 8 PM today." in err.message   # midnight UTC, in New York time
    assert not b.calls["send"]


# ── The router ────────────────────────────────────────────────────────────────

def frames(text: str) -> list:
    out = []
    for chunk in text.split("\n\n"):
        if chunk.startswith("data: "):
            payload = chunk[len("data: "):]
            out.append(payload if payload == "[DONE]" else json.loads(payload))
    return out


@pytest.fixture
def client(b):
    app = FastAPI()
    app.include_router(routes.router)
    app.dependency_overrides[verify_jwt] = lambda: U
    with TestClient(app) as c:
        yield c


def test_the_shortlist_streams_progress_then_the_result_then_done(w, b, client):
    res = client.post("/agents/outreach/shortlist", json={"goal": GOAL}, headers={"X-Timezone": NY})
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/event-stream")
    assert res.headers["cache-control"] == "no-cache" and res.headers["x-accel-buffering"] == "no"
    got = frames(res.text)
    assert got[-1] == "[DONE]"
    assert got[-2]["type"] == "shortlist" and got[-2]["candidates"] == [CAND_A, CAND_B, CAND_C]
    assert [e["type"] for e in got[:-2]] == ["progress"] * (len(got) - 2)
    assert got[0] == {"type": "progress", "id": "record", "label": "Reading your record", "status": "active"}
    assert res.text.endswith("data: [DONE]\n\n")


def test_refusals_before_the_stream_are_plain_http(w, b, client):
    res = client.post("/agents/outreach/shortlist", json={"goal": "short"})
    assert res.status_code == 422 and res.json()["detail"]["error"] == "bad_goal"
    b.spend_all()
    res = client.post("/agents/outreach/shortlist", json={"goal": GOAL})
    assert res.status_code == 409
    assert res.json() == {"detail": {"error": "no_tries", "message": "You have used both of your tries."}}
    res = client.post("/agents/outreach/draft", json=person_body())
    assert res.status_code == 409 and res.json()["detail"]["error"] == "no_tries"


def test_the_draft_stream_and_the_json_routes(w, b, client):
    got = frames(client.post("/agents/outreach/draft", json=person_body()).text)
    assert got[-2]["type"] == "draft" and "research" not in got[-2]["contact"]
    cid = got[-2]["contact"]["id"]

    res = client.get("/agents/outreach/status", headers={"X-Timezone": NY})
    assert res.status_code == 200 and res.json()["tries"]["used"] == 1

    res = client.post(f"/agents/outreach/contacts/{cid}/rewrite", json={"style": "warmer", "subject": SUBJECT,
                                                                       "body": BODY})
    assert res.status_code == 200 and res.json()["contact"]["rewrites_left"] == 2

    res = client.post(f"/agents/outreach/contacts/{cid}/followup")
    assert res.status_code == 409 and res.json()["detail"]["error"] == "not_sent"

    res = client.post(f"/agents/outreach/contacts/{cid}/send", json=send_body())
    assert res.status_code == 409 and res.json()["detail"]["error"] == "gmail_not_connected"
    b.connect()
    res = client.post(f"/agents/outreach/contacts/{cid}/send", json=send_body(), headers={"X-Timezone": NY})
    assert res.status_code == 200 and res.json()["contact"]["stage"] == "sent"

    res = client.post("/agents/outreach/contacts/nope/send", json=send_body())
    assert res.status_code == 404 and res.json()["detail"]["error"] == "no_contact"

    res = client.get("/agents/google/status")
    assert res.json() == {"configured": True, "connected": True, "email": "ada@gmail.com"}


def test_pings_keep_a_long_search_alive(w, b, client, monkeypatch):
    monkeypatch.setattr(routes, "PING_EVERY", 0.01)
    b.pause = 0.08
    text = client.post("/agents/outreach/shortlist", json={"goal": GOAL}).text
    assert ": ping\n\n" in text
    assert frames(text)[-2]["type"] == "shortlist"


def test_the_work_finishes_after_the_browser_leaves(w, b):
    async def scenario():
        gate = asyncio.Event()
        finished = []

        async def work(emit):
            await emit({"type": "progress", "id": "record", "label": "Reading your record", "status": "active"})
            await gate.wait()
            finished.append(True)
            return {"type": "shortlist", "try_id": "t", "candidates": []}

        response = await routes._sse(U, "test", work)
        stream = response.body_iterator
        assert (await stream.__anext__()).startswith('data: {"type": "progress"')
        await stream.aclose()                                   # the browser went away
        assert len(routes._TASKS) == 1                          # still running, still referenced
        gate.set()
        for _ in range(100):
            if finished and not routes._TASKS:
                break
            await REAL_SLEEP(0.01)
        assert finished and not routes._TASKS
    run(scenario())


def test_a_real_shortlist_lands_even_if_nobody_reads_the_stream(w, b):
    async def scenario():
        b.pause = 0.03
        response = await routes._sse(U, "shortlist", lambda emit: svc.shortlist(U, {"goal": GOAL}, emit))
        await response.body_iterator.aclose()
        for _ in range(100):
            if not routes._TASKS:
                break
            await REAL_SLEEP(0.01)
    run(scenario())
    assert [t["status"] for t in w.db.t["outreach_tries"]] == ["open"]
    assert w.db.t["outreach_tries"][0]["candidates"] == [CAND_A, CAND_B, CAND_C]


def test_a_refusal_after_the_stream_started_is_a_final_event(w, b):
    async def scenario():
        async def work(emit):
            await emit({"type": "progress", "id": "record", "label": "Reading your record", "status": "active"})
            raise AgentError(409, "busy", "Busy")

        response = await routes._sse(U, "test", work)
        return "".join([chunk async for chunk in response.body_iterator])
    got = frames(run(scenario()))
    assert got[-2] == {"type": "error", "error": "busy", "message": "Busy", "refunded": False}
    assert got[-1] == "[DONE]"


def test_a_timed_out_run_streams_its_error_then_done(w, b, client, monkeypatch):
    monkeypatch.setattr(svc, "RUN_DEADLINE", 0.05)
    b.pause = 0.5
    got = frames(client.post("/agents/outreach/shortlist", json={"goal": GOAL}).text)
    assert got[-2]["type"] == "error" and got[-2]["error"] == "timed_out" and got[-2]["refunded"] is True
    assert got[-1] == "[DONE]" and b.used("try") == 0


def test_the_stream_has_a_deadline_of_its_own(w, b, monkeypatch):
    monkeypatch.setattr(svc, "RUN_DEADLINE", 0.0)
    monkeypatch.setattr(routes, "STREAM_GRACE", 0.05)

    async def scenario():
        async def work(emit):
            await emit({"type": "progress", "id": "record", "label": "Reading your record", "status": "active"})
            await REAL_SLEEP(1)
            return {"type": "shortlist", "try_id": "t", "candidates": []}

        response = await routes._sse(U, "test", work)
        return "".join([chunk async for chunk in response.body_iterator])
    got = frames(run(scenario()))
    assert got[-2] == {"type": "error", "error": "timed_out", "message": routes.TIMED_OUT, "refunded": False}
    assert got[-1] == "[DONE]"


# ── Gmail connect ─────────────────────────────────────────────────────────────

def test_connect_builds_googles_url_from_the_request(w, b, client, monkeypatch):
    monkeypatch.setattr(config, "GOOGLE_OAUTH_CLIENT_ID", "client-123.apps.googleusercontent.com")
    monkeypatch.setattr(config, "GOOGLE_OAUTH_CLIENT_SECRET", "test-secret")
    monkeypatch.setattr(config, "GOOGLE_OAUTH_REDIRECT_URI", "")
    monkeypatch.setattr(config, "GMAIL_TOKEN_KEY", Fernet.generate_key().decode())
    res = client.post("/agents/google/connect", json={"return_to": "/agents/outreach/new"})
    assert res.status_code == 200
    url = res.json()["url"]
    assert url.startswith(google.AUTH_URL + "?")
    assert "redirect_uri=https%3A%2F%2Ftestserver%2Fagents%2Fgoogle%2Fconnect%2Fcallback" in url
    b.configured = False
    res = client.post("/agents/google/connect", json={})
    assert res.status_code == 503 and res.json()["detail"]["error"] == "not_configured"


@pytest.mark.parametrize("query, exchange, outcome, path", [
    ("code=abc&state=good", None, "confirm", "/agents/outreach/new"),
    ("error=access_denied&state=good", None, "denied", "/agents/outreach/new"),
    ("code=abc&state=good", GoogleError("scope_missing"), "denied", "/agents/outreach/new"),
    ("code=abc&state=good", GoogleError("exchange_failed"), "error", "/agents/outreach/new"),
    ("code=abc&state=bad", None, "error", "/agents/outreach"),
    ("code=abc", None, "error", "/agents/outreach"),
])
def test_the_callback_sends_the_student_back_to_the_app(w, b, client, monkeypatch, query, exchange, outcome, path):
    saved = []

    def read_state(token, max_age=600):
        if token != "good":
            raise GoogleError("state_invalid")
        return U, "/agents/outreach/new"

    async def exchange_code(code, redirect):
        assert redirect == "https://testserver/agents/google/connect/callback"
        if exchange:
            raise exchange
        return {"email": "ada@gmail.com", "scope": google.GMAIL_SEND_SCOPE, "refresh_token": "r"}

    monkeypatch.setattr(config, "APP_URL", "https://app.test")
    monkeypatch.setattr(google, "read_state", read_state)
    monkeypatch.setattr(google, "exchange_code", exchange_code)
    monkeypatch.setattr(google, "save_connection", lambda *a: saved.append(a))
    held = []
    monkeypatch.setattr(google, "hold_pending", lambda *a: held.append(a) or "one-time-code")
    client.headers.pop("authorization", None)
    res = client.get(f"/agents/google/connect/callback?{query}", follow_redirects=False)
    assert res.status_code == 302
    extra = "&code=one-time-code" if outcome == "confirm" else ""
    assert res.headers["location"] == f"https://app.test{path}?gmail={outcome}{extra}"
    # The callback never saves: only the signed-in student can confirm it.
    assert saved == []
    assert held == ([(U, "ada@gmail.com", google.GMAIL_SEND_SCOPE, "r")] if outcome == "confirm" else [])


def test_only_the_student_who_started_a_connection_can_finish_it(w, b, client, monkeypatch):
    saved, revoked = [], []
    monkeypatch.setattr(google, "save_connection", lambda *a: saved.append(a))

    async def revoke_token(token):
        revoked.append(token)
    monkeypatch.setattr(google, "revoke_token", revoke_token)

    # Someone else's link, granted in this student's browser: nothing saved, the grant revoked.
    code = google.hold_pending(V, "victim@gmail.com", google.GMAIL_SEND_SCOPE, "r-victim")
    res = client.post("/agents/google/finish", json={"code": code})
    assert res.status_code == 403 and res.json()["detail"]["error"] == "wrong_account"
    assert saved == [] and revoked == ["r-victim"]
    # A code works once.
    assert client.post("/agents/google/finish", json={"code": code}).status_code == 410

    code = google.hold_pending(U, "ada@gmail.com", google.GMAIL_SEND_SCOPE, "r-ada")
    res = client.post("/agents/google/finish", json={"code": code})
    assert res.status_code == 200 and res.json() == {"connected": True, "email": "ada@gmail.com"}
    assert saved == [(U, "ada@gmail.com", google.GMAIL_SEND_SCOPE, "r-ada")]
    assert client.post("/agents/google/finish", json={"code": "made-up"}).status_code == 410
    assert client.post("/agents/google/finish", json={}).status_code == 410


def test_a_held_connection_expires(w, b, monkeypatch):
    code = google.hold_pending(U, "ada@gmail.com", google.GMAIL_SEND_SCOPE, "r")
    google._pending[code]["expires"] = 0
    assert google.take_pending(code) is None


def test_disconnect(w, b, client, monkeypatch):
    gone = []

    async def disconnect(user_id):
        gone.append(user_id)
    monkeypatch.setattr(google, "disconnect", disconnect)
    res = client.post("/agents/google/disconnect")
    assert res.json() == {"connected": False} and gone == [U]


def test_a_named_persons_typed_page_is_never_treated_as_a_search_result(w, b):
    body = person_body(person={"name": "Dr. Maria Lee", "organization": "USF", "url": "https://example.com/mine"})
    run(svc.draft(U, body, Events()))
    assert "url_source" not in b.calls["research_person"][0]


def test_a_school_staff_title_is_not_a_student():
    from app.nodes.agents.outreach import research as r
    assert not r.looks_like_a_school_student("Student Services Director", "Lincoln High School")
    assert r.looks_like_a_school_student("Student", "Lincoln High School")
