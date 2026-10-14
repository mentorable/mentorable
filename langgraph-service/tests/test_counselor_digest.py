"""
The counselors' daily email (app/nodes/counselor/digest.py) and its route.

Offline: the three ledger functions are a small fake of what the migration
describes (who is due, claim today, release today), and Resend is a scripted
fake behind httpx.MockTransport. Every test sets its own key and sender, so no
real one is read and nothing reaches the network.

What is pinned here: nothing happens without a key; one email per due
counselor, claimed before it is sent; a failed send gives the claim back; a
counselor someone else claimed is skipped; the email holds the count, the
school's name and the schedule link and nothing about a student; the logs
hold ids and counts and never an address; the route does nothing and answers
404 without the scheduler's secret, and with it never answers with an error.

    python3 -m pytest tests/test_counselor_digest.py
"""
import asyncio
import html
import importlib
import json
import logging
import re
import threading
from pathlib import Path
from types import SimpleNamespace as NS

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import config
from app.nodes.counselor import digest
from app.routers import counselor as routes

A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
D = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
RIVERA = "rivera@lincoln.example"
OKOYE = "okoye@harbor.example"
KEY = "re_test_key_that_is_not_real"
SENDER = "Mentorable <digest@mentorable.example>"
APP = "https://app.example"
SECRET = "digest-secret-that-is-not-real-0123456789abcdef"
AUTH = {"X-Digest-Secret": SECRET}               # what the scheduler sends
NOT_FOUND = {"detail": "Not Found"}
LINK = f"{APP}/counselor/schedule"
ZERO = {"sent": 0, "skipped": 0, "failed": 0}

# What a counselor_digest_due() gone wrong might hand over. None of it may
# reach the email or the logs.
STUDENT = {"student_id": "5f0c1b7e-2d3a-4c55-9e10-6a7b8c9d0e1f", "student_name": "Priya Raman", "grade": 11,
           "message": "I need help choosing between two colleges", "times": ["2031-03-04T14:30:00+00:00"]}

REAL_HTTP = digest._http          # the world fixture swaps it for the fake


def run(coro):
    return asyncio.run(coro)


def due(counselor_id, email, school="Lincoln High School", pending=3, **extra):
    return {"counselor_id": counselor_id, "email": email, "school_name": school, "pending": pending, **extra}


def answers(status, **body):
    return lambda req: httpx.Response(status, json=body)


def breaks(exc):
    def reply(req):
        raise exc
    return reply


class Ledger:
    """counselor_digest_due, counselor_digest_claim and counselor_digest_release
    as the migration describes them, over one day's rows."""
    UNSET = object()

    def __init__(self, events):
        self.events = events
        self.due = []
        self.today = {}              # counselor_id -> count: today's counselor_digests rows
        self.raced = set()           # counselors another run claims between the read and our claim
        self.broken = {}             # function name -> how many calls still fail
        self.due_says = self.UNSET   # an odd answer from counselor_digest_due
        self.claim_says = self.UNSET
        self.threads = set()

    def rpc(self, name, params=None):
        return NS(execute=lambda: self._run(name, dict(params or {})))

    def _run(self, name, params):
        self.threads.add(threading.get_ident())
        self.events.append((name, params.get("p_counselor")))
        if self.broken.get(name, 0) > 0:
            self.broken[name] -= 1
            raise RuntimeError(f"connection reset while writing the row for {RIVERA}")
        if name == "counselor_digest_due":
            assert params == {}
            if self.due_says is not self.UNSET:
                return NS(data=self.due_says)
            rows = [r for r in self.due if not (isinstance(r, dict) and r.get("counselor_id") in self.today)]
            for counselor_id in self.raced:
                self.today[counselor_id] = "theirs"
            return NS(data=rows)
        if name == "counselor_digest_claim":
            assert set(params) == {"p_counselor", "p_count"}
            if self.claim_says is not self.UNSET:
                return NS(data=self.claim_says)
            if params["p_counselor"] in self.today:
                return NS(data=False)
            self.today[params["p_counselor"]] = params["p_count"]
            return NS(data=True)
        if name == "counselor_digest_release":
            assert set(params) == {"p_counselor"}
            self.today.pop(params["p_counselor"], None)
            return NS(data=None)
        raise AssertionError(f"unexpected database function: {name}")


class Resend:
    """POST /emails, scripted per recipient: a reply function, or the email is taken."""

    def __init__(self, events):
        self.events = events
        self.requests = []
        self.sent = []               # the body of every email it took
        self.replies = {}            # address -> reply(request)

    def handler(self, req):
        body = json.loads(req.content)
        self.requests.append(req)
        to = body["to"][0]
        self.events.append(("POST", to))
        if to in self.replies:
            return self.replies[to](req)
        self.sent.append(body)
        return httpx.Response(200, json={"id": f"email-{len(self.sent)}"})

    def client(self):
        return httpx.AsyncClient(transport=httpx.MockTransport(self.handler))


@pytest.fixture
def world(monkeypatch):
    events = []                      # database calls and emails, in the order they happened
    w = NS(events=events, ledger=Ledger(events), resend=Resend(events))
    monkeypatch.setattr(digest, "get_supabase", lambda: w.ledger)
    monkeypatch.setattr(digest, "_http", w.resend.client)
    monkeypatch.setattr(config, "RESEND_API_KEY", KEY)
    monkeypatch.setattr(config, "RESEND_FROM", SENDER)
    monkeypatch.setattr(config, "APP_URL", APP)
    monkeypatch.setattr(config, "DIGEST_SECRET", SECRET)
    return w


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(config, "DIGEST_SECRET", SECRET)
    monkeypatch.setattr(routes, "_said_unset", False)
    monkeypatch.setattr(routes, "_said_wrong_at", None)
    app = FastAPI()
    app.include_router(routes.router)
    with TestClient(app) as c:
        yield c


# ── Settings ──────────────────────────────────────────────────────────────────

def test_both_settings_are_optional_and_the_sender_has_a_default(monkeypatch):
    monkeypatch.setenv("RESEND_API_KEY", "")
    monkeypatch.setenv("RESEND_FROM", "")
    try:
        fresh = importlib.reload(config)
        assert fresh.RESEND_API_KEY == ""
        assert fresh.RESEND_FROM == "Mentorable <onboarding@resend.dev>"
        monkeypatch.setenv("RESEND_API_KEY", " re_abc ")
        monkeypatch.setenv("RESEND_FROM", "Mentorable <hello@mentorable.example>")
        fresh = importlib.reload(config)
        assert fresh.RESEND_API_KEY == "re_abc"
        assert fresh.RESEND_FROM == "Mentorable <hello@mentorable.example>"
    finally:
        monkeypatch.undo()
        importlib.reload(config)


def test_the_digest_secret_is_optional_and_trimmed(monkeypatch):
    monkeypatch.delenv("DIGEST_SECRET", raising=False)
    try:
        assert importlib.reload(config).DIGEST_SECRET == ""      # the service still boots; the route stays shut
        monkeypatch.setenv("DIGEST_SECRET", "   ")
        assert importlib.reload(config).DIGEST_SECRET == ""
        monkeypatch.setenv("DIGEST_SECRET", f" {SECRET}\n")
        assert importlib.reload(config).DIGEST_SECRET == SECRET
    finally:
        monkeypatch.undo()
        importlib.reload(config)


def test_without_a_key_nothing_is_read_claimed_or_sent(world, monkeypatch):
    monkeypatch.setattr(config, "RESEND_API_KEY", "")
    world.ledger.due = [due(A, RIVERA)]
    assert run(digest.send_due()) == {**ZERO, "configured": False}
    assert world.events == [] and world.ledger.today == {}


def test_the_real_client_waits_ten_seconds_and_follows_no_redirect():
    c = REAL_HTTP()
    try:
        assert c.timeout == httpx.Timeout(10.0) and c.follow_redirects is False
    finally:
        run(c.aclose())
    assert digest.RESEND_URL == "https://api.resend.com/emails"


# ── One email per due counselor ───────────────────────────────────────────────

def test_each_due_counselor_gets_one_email_claimed_before_it_is_sent(world):
    world.ledger.due = [due(A, RIVERA, pending=3), due(B, OKOYE, "Harbor Prep", 1)]
    assert run(digest.send_due()) == {"sent": 2, "skipped": 0, "failed": 0}
    assert world.events == [
        ("counselor_digest_due", None),
        ("counselor_digest_claim", A), ("POST", RIVERA),
        ("counselor_digest_claim", B), ("POST", OKOYE),
    ]
    assert world.ledger.today == {A: 3, B: 1}                     # the count goes on the ledger row

    first, second = world.resend.sent
    assert first["from"] == SENDER and first["to"] == [RIVERA] and second["to"] == [OKOYE]
    assert first["subject"] == "3 students requested a meeting"
    assert second["subject"] == "1 student requested a meeting"
    req = world.resend.requests[0]
    assert req.method == "POST" and str(req.url) == "https://api.resend.com/emails"
    assert req.headers["authorization"] == f"Bearer {KEY}"

    # Later the same day nobody is due, so nothing more goes out.
    assert run(digest.send_due()) == ZERO
    assert len(world.resend.sent) == 2


def test_with_nobody_due_nothing_is_claimed_or_sent(world):
    assert run(digest.send_due()) == ZERO
    world.ledger.due_says = None                                  # a function that answers null
    assert run(digest.send_due()) == ZERO
    assert world.events == [("counselor_digest_due", None)] * 2


def test_a_single_row_answer_is_still_one_counselor(world):
    world.ledger.due_says = due(A, RIVERA, pending=1)
    assert run(digest.send_due()) == {"sent": 1, "skipped": 0, "failed": 0}
    assert [m["to"] for m in world.resend.sent] == [[RIVERA]]


# ── What the email holds ──────────────────────────────────────────────────────

def test_the_email_holds_the_count_the_school_and_the_link_and_nothing_about_a_student(world, monkeypatch):
    monkeypatch.setattr(digest, "_today", lambda: "2026-10-12")
    world.ledger.due = [due(A, RIVERA, "Lincoln High School", 2, **STUDENT)]
    assert run(digest.send_due()) == {"sent": 1, "skipped": 0, "failed": 0}
    (body,) = world.resend.sent
    assert set(body) == {"from", "to", "subject", "text", "html"}        # no cc, bcc, reply_to or tags
    assert body["to"] == [RIVERA]
    assert body["subject"] == "2 students requested a meeting"
    for part in (body["text"], body["html"]):
        assert "2 students requested a meeting" in part and "Lincoln High School" in part and LINK in part
    assert f'href="{LINK}"' in body["html"]

    req = world.resend.requests[0]
    wire = req.content.decode() + " ".join(f"{k}: {v}" for k, v in req.headers.items())
    for leak in ("Priya", "Raman", "choosing between", "2031-03-04", "14:30", STUDENT["student_id"], "grade"):
        assert leak not in wire


def test_the_plain_text_is_exactly_this(world):
    mail = digest.build_email(3, "Lincoln High School")
    assert mail["subject"] == "3 students requested a meeting"
    assert mail["text"] == (
        "Lincoln High School\n\n"
        "3 students requested a meeting and are waiting for an answer.\n\n"
        "Open your schedule to see the requests and pick a time:\n"
        f"{LINK}\n\n"
        "This email comes at most once a day, and only when new requests are waiting. "
        "It never includes a student's name or what they wrote.\n\n"
        "Mentorable\n")
    one = digest.build_email(1, "Lincoln High School")
    assert one["subject"] == "1 student requested a meeting"
    assert "1 student requested a meeting and is waiting for an answer." in one["text"]
    banned = [chr(0x2014), chr(0x2013), chr(0xB7)]                       # em dash, en dash, middle dot
    for part in (*mail.values(), *one.values()):
        assert not any(mark in part for mark in banned)


def test_the_html_says_what_the_text_says(world):
    mail = digest.build_email(4, "Lincoln High School")
    shown = html.unescape(re.sub(r"<[^>]+>", "\n", mail["html"]))
    for line in mail["text"].splitlines():
        assert line in shown


def test_a_school_name_is_escaped_in_the_html_and_kept_to_one_line(world):
    name = '<img src=x onerror=alert(1)> & "Sons"\r\nBcc: someone@elsewhere.example'
    mail = digest.build_email(2, name)
    assert "<img" not in mail["html"]
    assert "&lt;img src=x onerror=alert(1)&gt; &amp; &quot;Sons&quot; Bcc:" in mail["html"]
    assert mail["text"].splitlines()[0] == '<img src=x onerror=alert(1)> & "Sons" Bcc: someone@elsewhere.example'
    assert mail["subject"] == "2 students requested a meeting"           # the name never reaches the subject
    assert digest.build_email(2, "   ")["text"].startswith("Your school\n")
    assert digest.build_email(2, None)["text"].startswith("Your school\n")
    assert digest.build_email(2, {"name": "Priya"})["text"].startswith("Your school\n")   # only ever a string
    assert len(digest.build_email(2, "x" * 500)["text"].splitlines()[0]) == 120


# ── Claim, send, release ──────────────────────────────────────────────────────

@pytest.mark.parametrize("reply", [
    answers(500, name="application_error", message="Something broke."),
    answers(403, statusCode=403, name="validation_error",
            message=f"You can only send testing emails to your own email address ({RIVERA})."),
    answers(429, name="rate_limit_exceeded"),
    answers(409, name="invalid_idempotent_request"),
    answers(307),
    breaks(httpx.ConnectError("down")),
    breaks(httpx.ReadTimeout("no answer")),
    breaks(RuntimeError("anything else")),
], ids=["500", "403", "429", "409", "redirect", "no connection", "no answer", "unforeseen"])
def test_a_failed_send_gives_the_claim_back_and_the_others_still_get_theirs(world, reply):
    world.ledger.due = [due(A, RIVERA), due(B, OKOYE, "Harbor Prep", 1)]
    world.resend.replies[RIVERA] = reply
    assert run(digest.send_due()) == {"sent": 1, "skipped": 0, "failed": 1}
    assert world.events == [
        ("counselor_digest_due", None),
        ("counselor_digest_claim", A), ("POST", RIVERA), ("counselor_digest_release", A),
        ("counselor_digest_claim", B), ("POST", OKOYE),
    ]
    assert world.ledger.today == {B: 1}                           # A is due again on the next run
    assert [m["to"] for m in world.resend.sent] == [[OKOYE]]


def test_after_a_failed_send_the_next_run_sends_it_and_the_one_after_sends_nothing(world):
    world.ledger.due = [due(A, RIVERA)]
    world.resend.replies[RIVERA] = breaks(httpx.ReadTimeout("no answer"))
    assert run(digest.send_due()) == {"sent": 0, "skipped": 0, "failed": 1}
    del world.resend.replies[RIVERA]
    assert run(digest.send_due()) == {"sent": 1, "skipped": 0, "failed": 0}
    assert run(digest.send_due()) == ZERO
    assert len(world.resend.sent) == 1
    # Both tries carried the same key, so if Resend had taken the first after
    # all, it would not send the second.
    first, second = (r.headers["idempotency-key"] for r in world.resend.requests)
    assert first == second


def test_a_run_stopped_mid_send_gives_the_claim_back_on_its_way_out(world):
    world.ledger.due = [due(A, RIVERA), due(B, OKOYE)]

    async def go():
        sending = asyncio.Event()

        async def hang(req):
            sending.set()
            await asyncio.sleep(60)

        world.resend.replies[RIVERA] = hang
        task = asyncio.create_task(digest.send_due())
        await asyncio.wait_for(sending.wait(), timeout=5)
        assert world.ledger.today == {A: 3}                       # claimed, and the email is in flight
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task

    run(go())
    assert world.events == [
        ("counselor_digest_due", None),
        ("counselor_digest_claim", A), ("POST", RIVERA), ("counselor_digest_release", A),
    ]
    assert world.ledger.today == {}                               # due again; B was never touched


def test_the_idempotency_key_names_the_counselor_and_the_day(world, monkeypatch):
    monkeypatch.setattr(digest, "_today", lambda: "2026-10-12")
    world.ledger.due = [due(A, RIVERA), due(B, OKOYE)]
    run(digest.send_due())
    world.ledger.today.clear()                                    # the next day
    monkeypatch.setattr(digest, "_today", lambda: "2026-10-13")
    run(digest.send_due())
    keys = [r.headers["idempotency-key"] for r in world.resend.requests]
    assert keys == [f"counselor-digest/{A}/2026-10-12", f"counselor-digest/{B}/2026-10-12",
                    f"counselor-digest/{A}/2026-10-13", f"counselor-digest/{B}/2026-10-13"]
    assert all(RIVERA not in k and OKOYE not in k for k in keys)


def test_a_counselor_another_run_claimed_first_is_skipped(world):
    world.ledger.due = [due(A, RIVERA), due(B, OKOYE, "Harbor Prep", 1)]
    world.ledger.raced = {A}
    assert run(digest.send_due()) == {"sent": 1, "skipped": 1, "failed": 0}
    assert world.events == [
        ("counselor_digest_due", None),
        ("counselor_digest_claim", A),                            # refused: no email, and not ours to release
        ("counselor_digest_claim", B), ("POST", OKOYE),
    ]
    assert world.ledger.today == {A: "theirs", B: 1}


@pytest.mark.parametrize("answer", [False, None, [], 1, "true", {"claimed": True}, [True]])
def test_only_a_plain_true_counts_as_a_claim(world, answer):
    world.ledger.due = [due(A, RIVERA)]
    world.ledger.claim_says = answer
    assert run(digest.send_due()) == {"sent": 0, "skipped": 1, "failed": 0}
    assert world.events == [("counselor_digest_due", None), ("counselor_digest_claim", A)]


def test_a_claim_that_cannot_be_made_sends_nothing_and_releases_nothing(world):
    world.ledger.due = [due(A, RIVERA), due(B, OKOYE, "Harbor Prep", 1)]
    world.ledger.broken["counselor_digest_claim"] = 1
    assert run(digest.send_due()) == {"sent": 1, "skipped": 0, "failed": 1}
    assert world.events == [
        ("counselor_digest_due", None),
        ("counselor_digest_claim", A),
        ("counselor_digest_claim", B), ("POST", OKOYE),
    ]


def test_when_who_is_due_cannot_be_read_the_run_counts_one_failure_and_sends_nothing(world):
    world.ledger.due = [due(A, RIVERA)]
    world.ledger.broken["counselor_digest_due"] = 1
    assert run(digest.send_due()) == {"sent": 0, "skipped": 0, "failed": 1}
    world.ledger.due_says = "permission denied for function counselor_digest_due"
    assert run(digest.send_due()) == {"sent": 0, "skipped": 0, "failed": 1}
    assert world.events == [("counselor_digest_due", None)] * 2


def test_a_release_is_tried_twice_and_a_lost_one_is_logged_not_raised(world, caplog):
    world.ledger.due = [due(A, RIVERA)]
    world.resend.replies[RIVERA] = answers(500)
    world.ledger.broken["counselor_digest_release"] = 1
    assert run(digest.send_due()) == {"sent": 0, "skipped": 0, "failed": 1}
    assert world.events.count(("counselor_digest_release", A)) == 2
    assert world.ledger.today == {}                               # the second try gave it back

    world.events.clear()
    world.ledger.broken["counselor_digest_release"] = 2
    with caplog.at_level(logging.ERROR):
        assert run(digest.send_due()) == {"sent": 0, "skipped": 0, "failed": 1}
    assert world.events.count(("counselor_digest_release", A)) == 2
    assert world.ledger.today == {A: 3}
    assert "CLAIM NOT RELEASED" in caplog.text and A in caplog.text


def test_rows_that_cannot_be_used_are_never_claimed(world):
    world.ledger.due = [
        due(A, None),                                             # no address
        due(B, f"{RIVERA}, {OKOYE}"),                             # two addresses in one
        due(C, f"Ms. Rivera <{RIVERA}>"),                         # a display name
        due("not-an-id", RIVERA),
        due(None, RIVERA),
        "garbage", None,
        due(D, OKOYE, pending=0),                                 # nothing waiting
        due(D, OKOYE, pending=None),
        due(D, OKOYE, pending=True),
    ]
    assert run(digest.send_due()) == {"sent": 0, "skipped": 3, "failed": 7}
    assert world.events == [("counselor_digest_due", None)]


def test_the_database_is_never_called_on_the_event_loop_thread(world):
    world.ledger.due = [due(A, RIVERA)]
    world.resend.replies[RIVERA] = answers(500)                   # so the release runs too
    loop_thread = []

    async def go():
        loop_thread.append(threading.get_ident())
        return await digest.send_due()

    run(go())
    assert {name for name, _ in world.events} == {
        "counselor_digest_due", "counselor_digest_claim", "counselor_digest_release", "POST"}
    assert world.ledger.threads and loop_thread[0] not in world.ledger.threads


# ── Logs ──────────────────────────────────────────────────────────────────────

def test_logs_carry_ids_and_counts_and_never_an_address_a_school_or_an_error_message(world, caplog):
    world.ledger.due = [
        due(A, RIVERA, "Lincoln High School", 2, **STUDENT),      # refused by Resend, then the release is lost
        due(B, OKOYE, "Harbor Prep", 1),                          # sent
        due(C, "chen at ridge.example", "Ridge Academy", 1),      # no usable address
        due(D, "diaz@summit.example", "Summit School", 4),        # the claim fails
    ]
    world.resend.replies[RIVERA] = answers(
        403, statusCode=403, name="validation_error",
        message=f"You can only send testing emails to your own email address ({RIVERA}).")
    world.ledger.broken["counselor_digest_release"] = 2

    real_run = world.ledger._run

    def claim_fails_for_d(name, params):
        if name == "counselor_digest_claim" and params.get("p_counselor") == D:
            world.events.append((name, D))
            raise RuntimeError("timeout writing the row for diaz@summit.example at Summit School")
        return real_run(name, params)

    world.ledger._run = claim_fails_for_d
    with caplog.at_level(logging.DEBUG):
        assert run(digest.send_due()) == {"sent": 1, "skipped": 0, "failed": 3}

    text = caplog.text
    for secret in (RIVERA, OKOYE, "diaz@", "lincoln.example", "chen at", "Lincoln High", "Harbor Prep",
                   "Ridge Academy", "Summit School", "Priya", "Raman", "choosing between", "testing emails",
                   "connection reset", "timeout writing", KEY, SENDER):
        assert secret not in text
    for counselor_id in (A, C, D):
        assert counselor_id in text
    assert "403 validation_error" in text and "RuntimeError" in text
    assert "4 due, sent 1, skipped 0, failed 3" in text


def test_without_a_key_the_log_says_so_once(world, monkeypatch, caplog):
    monkeypatch.setattr(config, "RESEND_API_KEY", "")
    with caplog.at_level(logging.INFO):
        run(digest.send_due())
    assert [r.getMessage() for r in caplog.records] == [
        "[counselor] digest: RESEND_API_KEY is not set; nothing read, claimed or sent"]


# ── The route ─────────────────────────────────────────────────────────────────

def test_the_route_answers_the_scheduler_with_the_counts(world, client):
    world.ledger.due = [due(A, RIVERA)]
    res = client.post("/internal/counselor-digest", json={}, headers=AUTH)      # what the scheduler sends
    assert res.status_code == 200 and res.json() == {"sent": 1, "skipped": 0, "failed": 0}
    res = client.post("/internal/counselor-digest", headers=AUTH)               # no body at all
    assert res.status_code == 200 and res.json() == ZERO
    res = client.post("/internal/counselor-digest", headers={"x-digest-secret": SECRET})   # header names have no case
    assert res.status_code == 200 and res.json() == ZERO
    assert len(world.resend.sent) == 1
    assert client.get("/internal/counselor-digest", headers=AUTH).status_code == 405


@pytest.mark.parametrize("headers", [
    {},
    {"X-Digest-Secret": ""},
    {"X-Digest-Secret": "guess"},
    {"X-Digest-Secret": SECRET[:-1]},
    {"X-Digest-Secret": SECRET + "0"},
    {"X-Digest-Secret": SECRET.upper()},
    {"X-Digest-Secret": f" {SECRET} x"},
    {"X-Digest-Secret": "s\u00e9cret".encode("utf-8")},        # not plain ASCII: a miss, not a crash
    {"X-Digest-Secret": b"\xff\xfe"},
    {"Authorization": f"Bearer {SECRET}"},                     # the right value in the wrong place
    {"X-Secret": SECRET},
], ids=["no header", "empty", "a guess", "one short", "one long", "wrong case", "padded", "not ascii",
        "not text", "as a bearer token", "another header"])
def test_without_the_secret_the_route_is_a_404_and_nothing_is_read_claimed_or_sent(world, client, headers):
    world.ledger.due = [due(A, RIVERA)]
    res = client.post("/internal/counselor-digest", json={}, headers=headers)
    assert res.status_code == 404 and res.json() == NOT_FOUND
    assert world.events == [] and world.ledger.today == {} and world.resend.requests == []
    # The answer says nothing the caller could use: no counts, no "configured".
    assert not {"sent", "skipped", "failed", "configured"} & set(res.json())


def test_a_miss_looks_exactly_like_a_path_that_does_not_exist(world, client):
    miss = client.post("/internal/counselor-digest", json={})
    nowhere = client.post("/internal/no-such-route", json={})
    assert (miss.status_code, miss.json()) == (nowhere.status_code, nowhere.json()) == (404, NOT_FOUND)
    assert miss.headers.get("content-type") == nowhere.headers.get("content-type")


@pytest.mark.parametrize("unset", ["", None])
def test_with_no_secret_configured_the_route_is_shut_to_everyone(world, client, monkeypatch, caplog, unset):
    monkeypatch.setattr(config, "DIGEST_SECRET", unset)
    world.ledger.due = [due(A, RIVERA)]
    with caplog.at_level(logging.DEBUG):
        for headers in ({}, {"X-Digest-Secret": ""}, {"X-Digest-Secret": "None"}, AUTH):
            res = client.post("/internal/counselor-digest", json={}, headers=headers)
            assert res.status_code == 404 and res.json() == NOT_FOUND
    assert world.events == [] and world.resend.requests == []
    # Said once, however many calls arrive.
    assert [r.getMessage() for r in caplog.records if r.name == routes.logger.name] == [
        "[counselor] digest: DIGEST_SECRET is not set; the route answers 404 and nothing is read, claimed or sent"]


def test_a_wrong_secret_is_logged_at_most_once_an_hour_and_never_quoted(world, client, monkeypatch, caplog):
    clock = [1000.0]
    monkeypatch.setattr(routes.time, "monotonic", lambda: clock[0])
    with caplog.at_level(logging.DEBUG):
        for _ in range(5):
            assert client.post("/internal/counselor-digest", headers={"X-Digest-Secret": "a-wrong-guess"}).status_code == 404
        assert client.post("/internal/counselor-digest").status_code == 404           # no header: nothing to say
        said = [r.getMessage() for r in caplog.records if r.name == routes.logger.name]
        assert len(said) == 1 and "wrong secret" in said[0]
        clock[0] += routes.WRONG_SECRET_LOG_EVERY - 1
        client.post("/internal/counselor-digest", headers={"X-Digest-Secret": "a-wrong-guess"})
        assert len([r for r in caplog.records if r.name == routes.logger.name]) == 1
        clock[0] += 1
        client.post("/internal/counselor-digest", headers={"X-Digest-Secret": "a-wrong-guess"})
        assert len([r for r in caplog.records if r.name == routes.logger.name]) == 2
    assert "a-wrong-guess" not in caplog.text and SECRET not in caplog.text
    assert world.events == []


def test_the_secret_never_reaches_the_logs_or_the_mail_provider(world, client, caplog):
    world.ledger.due = [due(A, RIVERA)]
    with caplog.at_level(logging.DEBUG):
        assert client.post("/internal/counselor-digest", json={}, headers=AUTH).json()["sent"] == 1
    assert SECRET not in caplog.text
    req = world.resend.requests[0]
    assert SECRET not in req.content.decode() + " ".join(f"{k}: {v}" for k, v in req.headers.items())


def test_the_route_says_so_when_no_key_is_set(world, client, monkeypatch):
    monkeypatch.setattr(config, "RESEND_API_KEY", "")
    world.ledger.due = [due(A, RIVERA)]
    res = client.post("/internal/counselor-digest", json={}, headers=AUTH)
    assert res.status_code == 200 and res.json() == {**ZERO, "configured": False}
    assert world.events == []
    # Only to the scheduler: a stranger cannot learn whether mail is set up.
    assert client.post("/internal/counselor-digest", json={}).json() == NOT_FOUND


def test_the_route_reports_failures_in_the_counts_not_as_an_error(world, client):
    world.ledger.broken["counselor_digest_due"] = 1
    res = client.post("/internal/counselor-digest", json={}, headers=AUTH)
    assert res.status_code == 200 and res.json() == {"sent": 0, "skipped": 0, "failed": 1}


def test_the_route_never_answers_with_an_error_even_if_the_run_itself_breaks(client, monkeypatch, caplog):
    async def boom():
        raise RuntimeError(f"the mail for {RIVERA} bounced")

    monkeypatch.setattr(digest, "send_due", boom)
    with caplog.at_level(logging.ERROR):
        res = client.post("/internal/counselor-digest", json={}, headers=AUTH)
    assert res.status_code == 200 and res.json() == {"sent": 0, "skipped": 0, "failed": 1}
    assert "RuntimeError" in caplog.text and RIVERA not in caplog.text


def test_the_route_is_left_out_of_the_public_api_listing(client):
    assert "/internal/counselor-digest" not in client.get("/openapi.json").json().get("paths", {})


def test_the_scheduler_sends_the_header_the_route_reads_and_the_secret_is_not_in_the_repo():
    """The other half of the guard is the cron job at the end of the migration.
    If the two disagree on the header, the daily call is a 404 and no email
    ever goes out, with nothing failing anywhere."""
    migration = Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "20261012_counselor.sql"
    if not migration.exists():
        pytest.skip("the migration is not in this checkout")
    sql = migration.read_text()
    job = sql[sql.index("-- >>> cron"):sql.index("-- <<< cron")]
    assert "/internal/counselor-digest" in job
    assert f"'{routes.SECRET_HEADER}', s.decrypted_secret" in job
    # Read from the Vault when the job runs, and no call at all when the Vault has none.
    assert "from vault.decrypted_secrets s" in job and "where s.name = 'counselor_digest_secret'" in job
    assert "and s.decrypted_secret <> ''" in job
    # The header's value is never a literal.
    assert not re.search(r"'X-Digest-Secret'\s*,\s*'", sql, re.I)
