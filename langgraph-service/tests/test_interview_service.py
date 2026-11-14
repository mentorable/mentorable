"""
Poise's service and router against the in-memory database (tests/fakedb.py):
the order start_mock refuses in (nothing spent before the budget), the
outright refund when no voice line can be had, and every way finish_mock can
end: still running, never connected (no_call), too short (too_short), given
back or kept once mock_back is spent, the hand-off from the code's crisis
screen and from the model's flag (the row deleted, nothing logged with an
id, no analytics event), a finished report, a feedback call that failed and
its retries, a second finish, a claim another request holds, and a stale
claim taken over without refunding twice.

ElevenLabs and the feedback model are scripted (FakeVoice and FakeModel,
patched onto the service module), so nothing here touches the network. The
budget functions, the record loader and the database mirrors are the real
ones; rules.py and prompts.py are the real ones too.

    python3 -m pytest tests/test_interview_service.py
"""
import asyncio
import copy
import logging
from datetime import datetime, timedelta, timezone

import pytest

from tests.memory_world import REAL_SLEEP, U, V  # noqa: E402  (first: it stubs the Supabase client)

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.auth import verify_jwt  # noqa: E402
from app.nodes.agents import usage  # noqa: E402
from app.nodes.agents.interview import rules  # noqa: E402
from app.nodes.agents.interview import service as svc  # noqa: E402
from app.nodes.agents.outreach.service import AgentError  # noqa: E402
from app.routers import agents as routes  # noqa: E402

AGENT_ID = "agent_poise_test"
COLLEGE = {"mode": "college", "target": "Rice University"}
INTERNSHIP = {"mode": "internship", "target": "City Hospital", "role": "Summer research intern",
              "details": "Six weeks in the cardiology lab.\nHigh school students welcome."}
ANSWER = ("I started the robotics club at my school because nobody had one and I wanted a place to build "
          "things with friends after class")                                     # 24 words
CRISIS = "honestly I want to kill myself and I do not know why I am here"


def run(coro):
    return asyncio.run(coro)


def refused(coro) -> AgentError:
    with pytest.raises(AgentError) as info:
        run(coro)
    return info.value


def call(answers: int, answer: str = ANSWER) -> list[dict]:
    """A transcript: a question, then an answer, `answers` times."""
    out = []
    for i in range(answers):
        out.append({"who": "interviewer", "text": f"Here is question {i + 1}. Tell me about it."})
        out.append({"who": "student", "text": answer})
    return out


GOOD = {
    "safety": False,
    "feedback": {
        "questions": [{"turn": 0, "question": "Here is question 1. Tell me about it.",
                       "worked": {"text": "You named a real club.", "quote": "the robotics club", "turn": 1},
                       "try": None}],
        "habits": [{"text": "Answers start with the reason.", "quote": None, "turn": None}],
        "thin": False,
    },
    "scores": {k: {"score": 3, "reason": "Clear enough."} for k in ("examples", "structure", "why", "conversation")},
}


class FakeVoice:
    """Stands in for interview/elevenlabs.py."""

    class ElevenLabsError(Exception):
        pass

    def __init__(self):
        self.configured = True
        self.signed_fail = False
        self.fetch_fail = False
        self.same_id = None          # hand out this conversation id every time
        self.conversations = {}      # id -> what fetch_conversation returns
        self.calls = []
        self.deleted = []
        self.n = 0

    def is_configured(self):
        return self.configured

    async def signed_url(self):
        self.calls.append("signed_url")
        if self.signed_fail:
            raise self.ElevenLabsError("down")
        self.n += 1
        cid = self.same_id or f"conv_{self.n}"
        return {"signed_url": f"wss://voice.example/convai?token=secret&conversation_id={cid}",
                "conversation_id": cid}

    async def fetch_conversation(self, conversation_id):
        self.calls.append(("fetch", conversation_id))
        if self.fetch_fail:
            raise self.ElevenLabsError("down")
        return copy.deepcopy(self.conversations.get(conversation_id))

    async def delete_conversation(self, conversation_id):
        self.deleted.append(conversation_id)
        self.conversations.pop(conversation_id, None)
        return True

    def ended(self, mock, turns, *, status="done", agent_id=AGENT_ID, mock_id="same", seconds=420):
        self.conversations[mock["conversation_id"]] = {
            "agent_id": agent_id, "status": status, "duration_s": seconds,
            "mock_id": mock["id"] if mock_id == "same" else mock_id, "turns": turns,
        }


class FakeModel:
    """Stands in for feedback.write_feedback."""

    def __init__(self):
        self.answers = [GOOD]        # the last one repeats
        self.calls = []

    async def __call__(self, mode, target, role, details, transcript, *, thin):
        self.calls.append({"mode": mode, "target": target, "role": role, "thin": thin, "turns": len(transcript)})
        await REAL_SLEEP(0)
        answer = self.answers.pop(0) if len(self.answers) > 1 else self.answers[0]
        if isinstance(answer, Exception):
            raise answer
        return copy.deepcopy(answer)


@pytest.fixture
def p(w, monkeypatch):
    """The scripted voice line and model, patched onto the service."""
    voice, model = FakeVoice(), FakeModel()
    monkeypatch.setenv("ELEVENLABS_INTERVIEW_AGENT_ID", AGENT_ID)
    monkeypatch.setattr(svc, "elevenlabs", voice)
    monkeypatch.setattr(svc, "write_feedback", model)
    events = []
    monkeypatch.setattr(routes, "_track", lambda uid, event, **props: events.append((event, props)))
    w.db.t["student_activities"].append({"id": "a1", "user_id": U, "title": "Robotics club founder",
                                          "category": "club", "order_index": 0})
    svc._HELD.clear()
    p_ = type("P", (), {})()
    p_.voice, p_.model, p_.events, p_.db = voice, model, events, w.db
    yield p_
    assert not svc._HELD, "a guard was left held"


def used(db, kind, uid=U) -> int:
    return sum(r["used"] for r in db.t["agent_usage"]
               if r["user_id"] == uid and r["agent"] == "interview" and r["kind"] == kind)


def row(db, mock_id):
    return next((r for r in db.t["interview_mocks"] if r["id"] == mock_id), None)


def started(p, body=COLLEGE) -> dict:
    res = run(svc.start_mock(U, body))
    return row(p.db, res["mock"]["id"])


def age(p, mock, seconds):
    """Move the mock's start back in time."""
    when = (datetime.now(timezone.utc) - timedelta(seconds=seconds)).isoformat()
    row(p.db, mock["id"])["started_at"] = when


# ── Start ─────────────────────────────────────────────────────────────────────

def test_start_spends_one_mock_and_stores_the_conversation_before_the_call(p, monkeypatch):
    seen = {}
    real = svc.prompts.interviewer_prompt

    def spy(mode, target, role, details, record_text):
        seen["record"] = record_text
        return real(mode, target, role, details, record_text)
    monkeypatch.setattr(svc.prompts, "interviewer_prompt", spy)

    res = run(svc.start_mock(U, INTERNSHIP))
    mock = row(p.db, res["mock"]["id"])
    assert mock["status"] == "live" and mock["conversation_id"] == "conv_1"
    assert mock["role"] == "Summer research intern" and mock["details"].startswith("Six weeks")
    assert used(p.db, "mock") == 1 and used(p.db, "mock_back") == 0
    assert res["signed_url"].startswith("wss://")
    assert set(res["overrides"]["agent"]) == {"prompt", "firstMessage"}
    assert isinstance(res["overrides"]["agent"]["prompt"]["prompt"], str)
    assert res["dynamic_variables"] == {"mock_id": mock["id"]}
    assert (res["max_seconds"], res["warn_seconds"]) == (600, 540)
    assert "user_id" not in res["mock"] and "transcript" not in res["mock"]
    # The record reaches the interviewer without the student's name.
    assert "Robotics club founder" in seen["record"]
    assert "Ada" not in seen["record"] and "Name:" not in seen["record"]
    # A college mock has no role, whatever was sent.
    svc._HELD.clear()
    p.db.t["interview_mocks"].clear()
    res = run(svc.start_mock(U, {**COLLEGE, "role": "ignored"}))
    assert row(p.db, res["mock"]["id"])["role"] is None


def test_start_refuses_in_order_and_spends_nothing_before_the_budget(p, monkeypatch):
    p.voice.configured = False
    # 1. The body, before anything else (even with no voice line).
    assert refused(svc.start_mock(U, {"mode": "debate", "target": "Rice"})).code == "bad_mode"
    assert refused(svc.start_mock(U, {"mode": "college", "target": "   "})).code == "bad_target"
    assert refused(svc.start_mock(U, {"mode": "college", "target": "x" * 121})).code == "bad_target"
    assert refused(svc.start_mock(U, {"mode": "internship", "target": "City Hospital"})).code == "bad_role"
    assert refused(svc.start_mock(U, {**INTERNSHIP, "role": "r" * 121})).code == "bad_role"
    assert refused(svc.start_mock(U, {**COLLEGE, "details": "d" * 1501})).code == "bad_details"
    assert refused(svc.start_mock(U, {**COLLEGE, "details": 7})).code == "bad_details"
    assert refused(svc.start_mock(U, "not a body")).status == 400
    # 2. The voice line.
    err = refused(svc.start_mock(U, COLLEGE))
    assert (err.status, err.code) == (503, "not_configured")
    assert p.db.t["agent_usage"] == [] and p.voice.calls == []

    # 3. A mock under way.
    p.voice.configured = True
    first = started(p)
    err = refused(svc.start_mock(U, COLLEGE))
    assert (err.status, err.code) == (409, "busy")
    assert used(p.db, "mock") == 1 and p.voice.calls == ["signed_url"]
    age(p, first, svc.LIVE_BUSY_S + 5)                     # an old one never blocks

    # 4. The budget: unreadable is a 503, spent is a 429, and neither calls ElevenLabs.
    def down(*_a, **_k):
        raise usage.Unavailable("x")
    with monkeypatch.context() as m:
        m.setattr(usage, "bump", down)
        err = refused(svc.start_mock(U, COLLEGE))
    assert (err.status, err.code) == (503, "budget_unavailable")
    next(r for r in p.db.t["agent_usage"] if r["kind"] == "mock")["used"] = 3
    err = refused(svc.start_mock(U, COLLEGE))
    assert (err.status, err.code) == (429, "no_mocks") and "3" in err.message
    assert p.voice.calls == ["signed_url"] and len(p.db.t["interview_mocks"]) == 1


def test_a_signed_url_failure_gives_the_mock_back_outright(p):
    p.voice.signed_fail = True
    err = refused(svc.start_mock(U, COLLEGE))
    assert (err.status, err.code) == (502, "voice_unavailable")
    assert svc.GAVE_BACK in err.message
    assert used(p.db, "mock") == 0 and used(p.db, "mock_back") == 0       # outright, not through mock_back
    assert p.db.t["interview_mocks"] == []


def test_a_row_that_cannot_be_written_gives_the_mock_back_outright(p):
    started(p)
    p.voice.same_id = "conv_1"                                    # the unique conversation_id refuses it
    age(p, p.db.t["interview_mocks"][0], svc.LIVE_BUSY_S + 5)
    err = refused(svc.start_mock(U, COLLEGE))
    assert (err.status, err.code) == (500, "server_error") and svc.GAVE_BACK in err.message
    assert used(p.db, "mock") == 1 and used(p.db, "mock_back") == 0 and len(p.db.t["interview_mocks"]) == 1


# ── Finish: waiting ───────────────────────────────────────────────────────────

def test_finish_waits_while_the_call_is_running_or_unreachable(p):
    mock = started(p)
    p.voice.ended(mock, call(6), status="in-progress")
    res = run(svc.finish_mock(U, mock["id"]))
    assert res["status"] == "pending" and res["gave_back"] is False
    assert row(p.db, mock["id"])["status"] == "live" and row(p.db, mock["id"])["claimed_at"] is None
    assert p.voice.deleted == [] and p.model.calls == []

    p.voice.fetch_fail = True
    assert run(svc.finish_mock(U, mock["id"]))["status"] == "pending"
    assert row(p.db, mock["id"])["status"] == "live"

    # Not on ElevenLabs yet, inside the grace period: still waiting, nothing given back.
    p.voice.fetch_fail = False
    p.voice.conversations.clear()
    assert run(svc.finish_mock(U, mock["id"]))["status"] == "pending"
    assert used(p.db, "mock") == 1


def test_finish_is_scoped_to_the_student_and_to_real_ids(p):
    mock = started(p)
    assert refused(svc.finish_mock(V, mock["id"])).status == 404
    assert refused(svc.finish_mock(U, "not-an-id")).code == "not_found"
    assert refused(svc.retry_feedback(V, mock["id"])).status == 404


def test_a_claim_held_elsewhere_waits_and_a_stale_one_is_taken_over(p):
    mock = started(p)
    p.voice.ended(mock, call(6))
    r = row(p.db, mock["id"])
    r["status"], r["claimed_at"] = "scoring", datetime.now(timezone.utc).isoformat()
    assert run(svc.finish_mock(U, mock["id"]))["status"] == "pending"
    assert p.voice.calls == ["signed_url"]                        # not fetched: another request has it
    r["claimed_at"] = (datetime.now(timezone.utc) - timedelta(seconds=svc.SCORING_STALE_S + 5)).isoformat()
    assert run(svc.finish_mock(U, mock["id"]))["status"] == "done"


def test_two_finishes_at_once_read_the_call_once(p):
    mock = started(p)
    p.voice.ended(mock, call(6))

    async def both():
        return await asyncio.gather(svc.finish_mock(U, mock["id"]), svc.finish_mock(U, mock["id"]))
    states = sorted(r["status"] for r in run(both()))
    assert states in (["done", "pending"], ["done", "done"])
    assert len(p.model.calls) == 1


# ── Finish: give-backs ────────────────────────────────────────────────────────

def test_a_call_that_never_happened_is_given_back_once(p):
    mock = started(p)
    age(p, mock, svc.NO_CALL_GRACE_S + 10)
    res = run(svc.finish_mock(U, mock["id"]))
    assert (res["status"], res["gave_back"], res["message"]) == ("refunded", True, svc.GAVE_BACK)
    assert res["mock"]["refund_reason"] == "no_call" and res["mock"]["transcript"] == []
    assert used(p.db, "mock") == 0 and used(p.db, "mock_back") == 1
    again = run(svc.finish_mock(U, mock["id"]))
    assert again["status"] == "refunded" and again["_new"] is False
    assert used(p.db, "mock") == 0 and used(p.db, "mock_back") == 1


def test_a_too_short_call_is_given_back_and_keeps_no_transcript(p):
    # No model reads a call this short, so its safety flag never sees it: what
    # the student said is not kept in case the code's crisis screen missed it.
    mock = started(p)
    p.voice.ended(mock, call(1, "I like robots a lot honestly"))
    res = run(svc.finish_mock(U, mock["id"]))
    assert (res["status"], res["gave_back"]) == ("refunded", True)
    stored = row(p.db, mock["id"])
    assert stored["refund_reason"] == "too_short" and stored["student_words"] == 6
    assert stored["transcript"] == [] and res["mock"]["transcript"] == []
    assert p.voice.deleted == [mock["conversation_id"]]
    assert p.model.calls == [] and used(p.db, "mock") == 0 and used(p.db, "mock_back") == 1


def test_a_short_call_the_screen_misses_keeps_none_of_the_students_words(p):
    mock = started(p)
    p.voice.ended(mock, call(1, "I do not see the point of any of this anymore"))
    res = run(svc.finish_mock(U, mock["id"]))
    assert res["status"] == "refunded"
    assert "point" not in str(row(p.db, mock["id"])) and "point" not in str(res)


@pytest.mark.parametrize("said", [
    "I want to, um, kill myself",
    "Yeah so I want to uh end my life",
    "I feel like killing myself",
    "I think about suicide a lot",
    "I'm gonna off myself",
])
def test_a_short_call_said_with_fillers_or_out_loud_gets_the_hand_off(p, said):
    mock = started(p)
    p.voice.ended(mock, call(1, said))
    res = run(svc.finish_mock(U, mock["id"]))
    assert res["status"] == "handoff" and res["message"] == rules.HANDOFF
    assert row(p.db, mock["id"]) is None and p.voice.deleted == [mock["conversation_id"]]
    assert p.model.calls == [] and used(p.db, "mock") == 0 and used(p.db, "mock_back") == 0


def test_with_mock_back_spent_a_short_call_counts_and_is_read_as_thin(p):
    p.db.t["agent_usage"].append({"user_id": U, "agent": "interview", "kind": "mock_back", "bucket": "all",
                                  "used": 3})
    mock = started(p)
    p.voice.ended(mock, call(1, "I like robots a lot honestly"))
    p.model.answers = [{**GOOD, "scores": GOOD["scores"]}]
    res = run(svc.finish_mock(U, mock["id"]))
    assert (res["status"], res["gave_back"]) == ("done", False) and svc.KEPT in res["message"]
    assert p.model.calls[-1]["thin"] is True
    stored = row(p.db, mock["id"])
    assert stored["scores"] is None and stored["feedback"]["thin"] is True and stored["refund_reason"] is None
    # Read by the model after all, so its transcript is kept like any mock that counted.
    assert [t["who"] for t in stored["transcript"]] == ["interviewer", "student"] and stored["student_words"] == 6
    assert used(p.db, "mock") == 1

    # A call that never happened, with nothing to give back: no report and no Retry.
    second = started(p)
    age(p, second, svc.NO_CALL_GRACE_S + 10)
    res = run(svc.finish_mock(U, second["id"]))
    assert (res["status"], res["gave_back"], res["message"]) == ("no_feedback", False, svc.KEPT)
    assert row(p.db, second["id"])["transcript"] == [] and used(p.db, "mock") == 2
    assert refused(svc.retry_feedback(U, second["id"])).code == "not_retryable"


def test_a_refund_already_made_is_never_made_again(p):
    mock = started(p)
    r = row(p.db, mock["id"])
    # A claim that stopped after writing the reason (the refund was made under it).
    r.update(status="scoring", refund_reason="too_short",
             claimed_at=(datetime.now(timezone.utc) - timedelta(seconds=svc.SCORING_STALE_S + 5)).isoformat())
    res = run(svc.finish_mock(U, mock["id"]))
    assert res["status"] == "refunded" and row(p.db, mock["id"])["status"] == "refunded"
    assert used(p.db, "mock_back") == 0 and used(p.db, "mock") == 1 and p.voice.calls == ["signed_url"]


# ── Finish: the hand-off ──────────────────────────────────────────────────────

def test_the_crisis_screen_deletes_everything_and_logs_no_ids(p, caplog):
    mock = started(p)
    p.voice.ended(mock, call(5) + [{"who": "student", "text": CRISIS}])
    caplog.set_level(logging.INFO)
    caplog.clear()
    res = run(svc.finish_mock(U, mock["id"]))
    assert res == {"status": "handoff", "mock": None, "message": rules.HANDOFF, "gave_back": False, "_new": False}
    assert row(p.db, mock["id"]) is None
    assert p.voice.deleted == [mock["conversation_id"]]
    assert p.model.calls == []
    assert used(p.db, "mock") == 0 and used(p.db, "mock_back") == 0
    assert U not in caplog.text and mock["id"] not in caplog.text and "kill" not in caplog.text


def test_the_model_flag_deletes_everything(p, caplog):
    mock = started(p)
    p.voice.ended(mock, call(6))
    p.model.answers = [{"safety": True, "feedback": {}, "scores": None}]
    caplog.set_level(logging.INFO)
    caplog.clear()
    res = run(svc.finish_mock(U, mock["id"]))
    assert res["status"] == "handoff" and res["message"] == rules.HANDOFF and res["mock"] is None
    assert row(p.db, mock["id"]) is None and p.voice.deleted == [mock["conversation_id"]]
    assert used(p.db, "mock") == 0 and used(p.db, "mock_back") == 0
    assert mock["id"] not in caplog.text


# ── Finish: a report ──────────────────────────────────────────────────────────

def test_a_finished_call_is_stored_read_and_settled_once(p, caplog):
    mock = started(p, INTERNSHIP)
    p.voice.ended(mock, call(6))                                   # 144 student words
    caplog.set_level(logging.INFO)
    caplog.clear()
    res = run(svc.finish_mock(U, mock["id"]))
    assert (res["status"], res["gave_back"], res["message"]) == ("done", False, None)
    stored = row(p.db, mock["id"])
    assert stored["status"] == "done" and stored["claimed_at"] is None
    assert stored["student_words"] == 144 and stored["duration_s"] == 420 and stored["ended_at"]
    assert stored["scores"]["why"]["score"] == 3 and stored["feedback"]["thin"] is False
    assert len(stored["transcript"]) == 12
    assert p.voice.deleted == [mock["conversation_id"]]
    assert p.model.calls == [{"mode": "internship", "target": "City Hospital", "role": "Summer research intern",
                              "thin": False, "turns": 12}]
    assert used(p.db, "mock") == 1
    assert "robotics" not in caplog.text and "City Hospital" not in caplog.text and "wss://" not in caplog.text

    again = run(svc.finish_mock(U, mock["id"]))
    assert again["status"] == "done" and again["_new"] is False and len(p.model.calls) == 1


def test_a_conversation_from_another_agent_is_not_read(p):
    mock = started(p)
    p.voice.ended(mock, call(6), agent_id="agent_someone_else")
    res = run(svc.finish_mock(U, mock["id"]))
    assert res["status"] == "no_feedback" and row(p.db, mock["id"])["transcript"] == []
    assert p.model.calls == [] and p.voice.deleted == [] and used(p.db, "mock") == 1


def test_feedback_that_fails_keeps_the_transcript_and_retries_twice(p):
    mock = started(p)
    p.voice.ended(mock, call(6))
    p.model.answers = [None]
    res = run(svc.finish_mock(U, mock["id"]))
    assert (res["status"], res["message"]) == ("no_feedback", svc.FEEDBACK_FAILED)
    stored = row(p.db, mock["id"])
    assert stored["feedback_tries"] == 1 and len(stored["transcript"]) == 12 and stored["scores"] is None
    assert p.voice.deleted == [mock["conversation_id"]] and used(p.db, "mock") == 1

    # A second finish reports it as it is, without a model call.
    assert run(svc.finish_mock(U, mock["id"]))["status"] == "no_feedback" and len(p.model.calls) == 1

    p.model.answers = [RuntimeError("model down")]
    res = run(svc.retry_feedback(U, mock["id"]))
    assert res["status"] == "no_feedback" and row(p.db, mock["id"])["feedback_tries"] == 2
    err = refused(svc.retry_feedback(U, mock["id"]))
    assert (err.status, err.code) == (429, "no_retries")
    assert used(p.db, "mock") == 1


def test_a_retry_that_lands_writes_the_report(p):
    mock = started(p)
    p.voice.ended(mock, call(6))
    p.model.answers = [None, GOOD]
    run(svc.finish_mock(U, mock["id"]))
    res = run(svc.retry_feedback(U, mock["id"]))
    assert res["status"] == "done" and res["mock"]["scores"]["examples"]["score"] == 3
    assert refused(svc.retry_feedback(U, mock["id"])).code == "not_retryable"
    assert len(p.voice.calls) == 2                                 # signed_url, one fetch: the retry reads the row


def test_a_stored_transcript_is_read_again_without_fetching(p):
    mock = started(p)
    r = row(p.db, mock["id"])
    r.update(status="scoring", transcript=call(6), student_words=144,
             claimed_at=(datetime.now(timezone.utc) - timedelta(seconds=svc.SCORING_STALE_S + 5)).isoformat())
    res = run(svc.finish_mock(U, mock["id"]))
    assert res["status"] == "done" and p.voice.calls == ["signed_url"]


# ── Status and the router ─────────────────────────────────────────────────────

def test_status_lists_the_open_mocks_and_the_budget(p):
    res = run(svc.status(U))
    assert res == {"configured": True, "mocks_left": 3, "mocks_limit": 3, "backs_left": 3, "max_seconds": 600,
                   "warn_seconds": 540, "live_ids": []}
    mock = started(p)
    res = run(svc.status(U))
    assert res["mocks_left"] == 2 and res["live_ids"] == [mock["id"]]
    assert run(svc.status(V))["live_ids"] == []


@pytest.fixture
def client(p):
    app = FastAPI()
    app.include_router(routes.router)
    app.dependency_overrides[verify_jwt] = lambda: U
    with TestClient(app) as c:
        yield c


def test_the_routes_track_once_and_never_for_a_hand_off(p, client):
    res = client.post("/agents/interview/mocks", json={"mode": "college", "target": ""})
    assert res.status_code == 400 and res.json()["detail"]["error"] == "bad_target"
    res = client.post("/agents/interview/mocks", json=COLLEGE)
    assert res.status_code == 200
    mock_id = res.json()["mock"]["id"]
    assert p.events == [("interview_started", {"mode": "college"})]

    p.voice.ended(row(p.db, mock_id), call(6), seconds=480)
    body = client.post(f"/agents/interview/mocks/{mock_id}/finish").json()
    assert body["status"] == "done" and "_new" not in body
    assert p.events[-1] == ("interview_finished", {"status": "done", "scored": True, "minutes": 8})
    client.post(f"/agents/interview/mocks/{mock_id}/finish")
    assert len(p.events) == 2                                    # a second finish sends nothing

    age(p, row(p.db, mock_id), svc.LIVE_BUSY_S + 5)
    other = client.post("/agents/interview/mocks", json=COLLEGE).json()["mock"]["id"]
    p.voice.ended(row(p.db, other), call(5) + [{"who": "student", "text": CRISIS}])
    body = client.post(f"/agents/interview/mocks/{other}/finish").json()
    assert body["status"] == "handoff" and body["mock"] is None
    assert [e for e, _ in p.events].count("interview_finished") == 1

    status = client.get("/agents/interview/status").json()
    assert status["mocks_left"] == 2 and status["live_ids"] == []
