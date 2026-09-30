"""
The agents' plumbing: budgets (usage.py over the agent_usage mirrors in
fakedb.py) and Gmail (google.py): the OAuth state, the connect flow, the
encrypted refresh token, the access-token refresh, the send itself, and the
revoking of every grant that is dropped rather than saved.

Google is a scripted fake behind httpx.MockTransport, so nothing here touches
the network and no real key is read: every test sets its own client id,
secret and a freshly generated Fernet key.

    python3 -m pytest tests/test_agents_google.py
"""
import asyncio
import base64
import email
import json
import logging
import time
from datetime import datetime, timezone
from email import policy
from urllib.parse import parse_qs, parse_qsl, urlsplit

import httpx
import pytest
from cryptography.fernet import Fernet, InvalidToken

from tests.fakedb import FakeDB

from app import config
from app.nodes.agents import google, registry, usage
from app.nodes.agents.google import GMAIL_SEND_SCOPE, GoogleError

U = "11111111-1111-1111-1111-111111111111"
V = "22222222-2222-2222-2222-222222222222"
REFRESH = "1//0g-refresh-token-for-ada"
CODE_ACCESS = "ya29.access-from-the-code"
GRANTED = f"openid {GMAIL_SEND_SCOPE} https://www.googleapis.com/auth/userinfo.email"


def run(coro):
    return asyncio.run(coro)


class FakeGoogle:
    """Google's token, userinfo, send and revoke endpoints, scripted."""

    def __init__(self, db):
        self.db = db
        self.calls = []
        self.scope = GRANTED
        self.code_status = 200
        self.give_refresh = True
        self.userinfo = {"sub": "1", "email": "ada@gmail.com", "email_verified": True}
        self.refresh_error = None
        self.refresh_scope = GMAIL_SEND_SCOPE
        self.before_refresh = None
        self.send_replies = []
        self.revoke_status = 200
        self.revoke_raises = None
        self.issued = 0

    def kinds(self):
        return [c[0] for c in self.calls]

    def handle(self, request: httpx.Request) -> httpx.Response:
        url = str(request.url).split("?")[0]
        body = request.content.decode()
        if url == google.TOKEN_URL:
            form = dict(parse_qsl(body))
            if form.get("grant_type") == "authorization_code":
                self.calls.append(("code", form))
                if self.code_status != 200:
                    return httpx.Response(self.code_status, json={"error": "invalid_grant"})
                out = {"access_token": CODE_ACCESS, "expires_in": 3599, "scope": self.scope, "token_type": "Bearer"}
                if self.give_refresh:
                    out["refresh_token"] = REFRESH
                return httpx.Response(200, json=out)
            self.calls.append(("refresh", form))
            if self.before_refresh:
                self.before_refresh()
            if self.refresh_error:
                return httpx.Response(400, json={"error": self.refresh_error,
                                                 "error_description": "Token has been expired or revoked."})
            self.issued += 1
            return httpx.Response(200, json={"access_token": f"ya29.fresh-{self.issued}", "expires_in": 3599,
                                             "scope": self.refresh_scope, "token_type": "Bearer"})
        if url == google.USERINFO_URL:
            self.calls.append(("userinfo", request.headers.get("authorization")))
            return httpx.Response(200, json=self.userinfo)
        if url == google.SEND_URL:
            payload = json.loads(body)
            self.calls.append(("send", payload, request.headers.get("authorization")))
            reply = self.send_replies.pop(0) if self.send_replies else \
                (200, {"id": "msg-1", "threadId": payload.get("threadId", "thread-1"), "labelIds": ["SENT"]})
            if isinstance(reply, Exception):
                raise reply
            status, data = reply
            return httpx.Response(status, json=data)
        if url == google.REVOKE_URL:
            self.calls.append(("revoke", dict(parse_qsl(body))))
            if self.revoke_raises:
                raise self.revoke_raises
            return httpx.Response(self.revoke_status)
        raise AssertionError(f"unexpected request to {url}")


@pytest.fixture
def g(monkeypatch):
    db = FakeDB()
    db.t["profiles"].append({"id": U, "timezone": None})
    fake = FakeGoogle(db)
    monkeypatch.setattr(config, "GOOGLE_OAUTH_CLIENT_ID", "client-123.apps.googleusercontent.com")
    monkeypatch.setattr(config, "GOOGLE_OAUTH_CLIENT_SECRET", "test-secret")
    monkeypatch.setattr(config, "GOOGLE_OAUTH_REDIRECT_URI", "")
    monkeypatch.setattr(config, "GMAIL_TOKEN_KEY", Fernet.generate_key().decode())
    monkeypatch.setattr(google, "get_supabase", lambda: db)
    monkeypatch.setattr(usage, "get_supabase", lambda: db)
    monkeypatch.setattr(google, "_http", lambda: httpx.AsyncClient(transport=httpx.MockTransport(fake.handle)))
    google._cache.clear()
    google._pending.clear()
    yield fake
    google._cache.clear()
    google._pending.clear()


def connect(uid=U, token=REFRESH, address="ada@gmail.com"):
    google.save_connection(uid, address, GRANTED, token)


def parse(raw):
    return email.message_from_bytes(base64.urlsafe_b64decode(raw), policy=policy.default)


def code_of(excinfo):
    return excinfo.value.code


async def settle_background():
    """Wait for google.py's background revokes (not its expiry timers)."""
    for _ in range(200):
        busy = [t for t in google._BACKGROUND if not t.done() and t.get_coro().__name__ != "_expire_later"]
        if not busy:
            return
        await asyncio.wait(busy, timeout=0.05)


# ── Registry ──────────────────────────────────────────────────────────────────

def test_the_registry_holds_beaker_with_its_budgets():
    spec = registry.get_agent("outreach")
    assert (spec.id, spec.name, spec.enabled) == ("outreach", "Beaker", True)
    assert spec.budgets == {"try": ("total", 2), "search": ("total", 8), "write": ("total", 20),
                            "send": ("day", 5)}
    with pytest.raises(KeyError):
        registry.get_agent("nobody")


# ── Configuration ─────────────────────────────────────────────────────────────

def test_configured_needs_the_id_the_secret_and_a_real_fernet_key(g, monkeypatch):
    assert google.is_configured()
    for bad in ("", "not-a-key", base64.urlsafe_b64encode(b"x" * 31).decode()):
        monkeypatch.setattr(config, "GMAIL_TOKEN_KEY", bad)
        assert not google.is_configured()
    monkeypatch.setattr(config, "GMAIL_TOKEN_KEY", Fernet.generate_key().decode())
    monkeypatch.setattr(config, "GOOGLE_OAUTH_CLIENT_SECRET", "")
    assert not google.is_configured()
    monkeypatch.setattr(config, "GOOGLE_OAUTH_CLIENT_SECRET", "test-secret")
    monkeypatch.setattr(config, "GOOGLE_OAUTH_CLIENT_ID", "  ")
    assert not google.is_configured()


def test_nothing_starts_without_configuration(g, monkeypatch):
    monkeypatch.setattr(config, "GMAIL_TOKEN_KEY", "")
    with pytest.raises(GoogleError) as e:
        google.auth_url("state", "https://api.example.com/cb")
    assert code_of(e) == "not_configured"
    with pytest.raises(GoogleError) as e:
        google.make_state(U, "/agents")
    assert code_of(e) == "not_configured"
    with pytest.raises(GoogleError) as e:
        run(google.access_token(U))
    assert code_of(e) == "not_configured"


def test_the_redirect_uri_is_the_configured_one_or_https_on_this_service(g, monkeypatch):
    assert google.redirect_uri("http://mentorable-langgraph.onrender.com/") == \
        "https://mentorable-langgraph.onrender.com/agents/google/connect/callback"
    assert google.redirect_uri("http://localhost:8000/") == "http://localhost:8000/agents/google/connect/callback"
    assert google.redirect_uri("http://127.0.0.1:8000") == "http://127.0.0.1:8000/agents/google/connect/callback"
    monkeypatch.setattr(config, "GOOGLE_OAUTH_REDIRECT_URI", "https://api.mentorable.net/agents/google/connect/callback")
    assert google.redirect_uri("http://anything/") == "https://api.mentorable.net/agents/google/connect/callback"


# ── OAuth state ───────────────────────────────────────────────────────────────

def test_a_state_round_trips_and_does_not_show_the_user_id(g):
    state = google.make_state(U, "/agents/outreach/new")
    assert U not in state
    assert google.read_state(state) == (U, "/agents/outreach/new")
    # Two states for the same student differ (the nonce).
    assert google.make_state(U, "/agents") != google.make_state(U, "/agents")


def test_a_state_expires_after_ten_minutes(g, monkeypatch):
    real = time.time()
    monkeypatch.setattr(time, "time", lambda: real - 590)
    fresh_enough = google.make_state(U, "/agents")
    monkeypatch.setattr(time, "time", lambda: real - 610)
    stale = google.make_state(U, "/agents")
    monkeypatch.setattr(time, "time", lambda: real)
    assert google.read_state(fresh_enough) == (U, "/agents")
    with pytest.raises(GoogleError) as e:
        google.read_state(stale)
    assert code_of(e) == "state_invalid"


def test_a_tampered_or_garbage_state_is_refused(g):
    state = google.make_state(U, "/agents/outreach")
    i = len(state) // 2
    tampered = state[:i] + ("A" if state[i] != "A" else "B") + state[i + 1:]
    for bad in (tampered, "not-a-token", "", None, 42, "x" * 5000):
        with pytest.raises(GoogleError) as e:
            google.read_state(bad)
        assert code_of(e) == "state_invalid"


def test_a_state_made_under_another_key_is_refused(g, monkeypatch):
    state = google.make_state(U, "/agents/outreach")
    monkeypatch.setattr(config, "GMAIL_TOKEN_KEY", Fernet.generate_key().decode())
    with pytest.raises(GoogleError) as e:
        google.read_state(state)
    assert code_of(e) == "state_invalid"


def test_states_and_stored_tokens_use_different_keys(g):
    state = google.make_state(U, "/agents")
    with pytest.raises(InvalidToken):
        google._token_fernet().decrypt(state.encode())
    stored = google._token_fernet().encrypt(json.dumps({"u": V, "r": "/agents", "n": "x"}).encode()).decode()
    with pytest.raises(GoogleError) as e:
        google.read_state(stored)
    assert code_of(e) == "state_invalid"


def test_a_state_carrying_an_unsafe_return_path_falls_back_to_the_board(g):
    forged = google._state_fernet().encrypt(json.dumps({"u": U, "r": "//evil.example", "n": "n"}).encode()).decode()
    assert google.read_state(forged) == (U, "/agents/outreach")
    assert google.read_state(google.make_state(U, "https://evil.example/agents")) == (U, "/agents/outreach")


@pytest.mark.parametrize("value,expected", [
    ("/agents", "/agents"),
    ("/agents/outreach", "/agents/outreach"),
    ("/agents/outreach/new", "/agents/outreach/new"),
    ("/agents/outreach/3f2a9c1e-0000-4000-8000-000000000000", "/agents/outreach/3f2a9c1e-0000-4000-8000-000000000000"),
    ("/agents/", "/agents/"),
    (None, "/agents/outreach"),
    (42, "/agents/outreach"),
    ("", "/agents/outreach"),
    ("/quest", "/agents/outreach"),
    ("/agentsevil", "/agents/outreach"),
    ("//evil.example/agents", "/agents/outreach"),
    ("/agents//evil.example", "/agents/outreach"),
    ("https://evil.example/agents", "/agents/outreach"),
    ("javascript:alert(1)", "/agents/outreach"),
    ("/agents/\\evil", "/agents/outreach"),
    ("/agents/outreach\r\nSet-Cookie: x=1", "/agents/outreach"),
    ("/agents/outreach\n", "/agents/outreach"),
    ("/agents/../quest", "/agents/outreach"),
    ("/agents/outreach?gmail=connected", "/agents/outreach"),
    ("/agents/outreach#top", "/agents/outreach"),
    ("/agents/" + "a" * 300, "/agents/outreach"),
])
def test_safe_return_to(value, expected):
    assert google.safe_return_to(value) == expected


def test_the_consent_url_asks_for_offline_send_permission_only(g):
    url = google.auth_url("the-state", "https://api.example.com/agents/google/connect/callback")
    parts = urlsplit(url)
    assert f"{parts.scheme}://{parts.netloc}{parts.path}" == google.AUTH_URL
    q = {k: v[0] for k, v in parse_qs(parts.query).items()}
    assert q == {
        "client_id": "client-123.apps.googleusercontent.com",
        "redirect_uri": "https://api.example.com/agents/google/connect/callback",
        "response_type": "code",
        "scope": "openid email https://www.googleapis.com/auth/gmail.send",
        "access_type": "offline",
        "prompt": "consent",
        "state": "the-state",
    }
    assert "test-secret" not in url


# ── Exchanging the code ───────────────────────────────────────────────────────

def test_the_code_exchange_returns_the_address_scope_and_refresh_token(g):
    out = run(google.exchange_code("4/the-code", "https://api.example.com/cb"))
    assert out == {"email": "ada@gmail.com", "scope": GRANTED, "refresh_token": REFRESH}
    (_, form), (_, auth) = g.calls
    assert form == {"code": "4/the-code", "client_id": "client-123.apps.googleusercontent.com",
                    "client_secret": "test-secret", "redirect_uri": "https://api.example.com/cb",
                    "grant_type": "authorization_code"}
    assert auth == f"Bearer {CODE_ACCESS}"


def test_an_exchange_without_the_send_permission_is_scope_missing(g):
    g.scope = "openid https://www.googleapis.com/auth/userinfo.email"
    with pytest.raises(GoogleError) as e:
        run(google.exchange_code("4/the-code", "https://api.example.com/cb"))
    assert code_of(e) == "scope_missing"
    assert g.kinds() == ["code"]       # never asked who they are


def test_a_refused_exchange_or_one_without_a_refresh_token_fails(g):
    g.code_status = 400
    with pytest.raises(GoogleError) as e:
        run(google.exchange_code("4/used-code", "https://api.example.com/cb"))
    assert code_of(e) == "exchange_failed"
    g.code_status, g.give_refresh = 200, False
    with pytest.raises(GoogleError) as e:
        run(google.exchange_code("4/the-code", "https://api.example.com/cb"))
    assert code_of(e) == "exchange_failed"
    with pytest.raises(GoogleError) as e:
        run(google.exchange_code("", "https://api.example.com/cb"))
    assert code_of(e) == "exchange_failed"


def test_an_unverified_google_address_is_not_accepted(g):
    g.userinfo = {"sub": "1", "email": "ada@gmail.com", "email_verified": False}
    with pytest.raises(GoogleError) as e:
        run(google.exchange_code("4/the-code", "https://api.example.com/cb"))
    assert code_of(e) == "exchange_failed"


# ── The stored connection ─────────────────────────────────────────────────────

def test_the_refresh_token_is_stored_encrypted_and_never_returned(g):
    connect()
    (row,) = g.db.t["google_connections"]
    assert row["google_email"] == "ada@gmail.com" and row["scope"] == GRANTED
    assert REFRESH not in json.dumps(row)
    assert Fernet(config.GMAIL_TOKEN_KEY).decrypt(row["refresh_token_enc"].encode()).decode() == REFRESH
    info = google.connection(U)
    assert set(info) == {"email", "connected_at"} and info["email"] == "ada@gmail.com"
    assert google.connection(V) is None
    connect(token="1//a-newer-token", address="ada.l@gmail.com")
    assert len(g.db.t["google_connections"]) == 1
    assert google.connection(U)["email"] == "ada.l@gmail.com"


def test_an_access_token_is_refreshed_then_reused_until_the_connection_changes(g):
    connect()
    assert run(google.access_token(U)) == ("ya29.fresh-1", "ada@gmail.com")
    (_, form), = g.calls
    assert form == {"grant_type": "refresh_token", "refresh_token": REFRESH,
                    "client_id": "client-123.apps.googleusercontent.com", "client_secret": "test-secret"}
    assert run(google.access_token(U)) == ("ya29.fresh-1", "ada@gmail.com")
    assert g.kinds() == ["refresh"]
    connect(token="1//reconnected")
    assert run(google.access_token(U)) == ("ya29.fresh-2", "ada@gmail.com")
    assert g.calls[-1][1]["refresh_token"] == "1//reconnected"


def test_a_revoked_connection_is_deleted_and_asks_to_reconnect(g):
    connect()
    g.refresh_error = "invalid_grant"
    with pytest.raises(GoogleError) as e:
        run(google.access_token(U))
    assert code_of(e) == "reconnect"
    assert g.db.t["google_connections"] == []
    with pytest.raises(GoogleError) as e:
        run(google.access_token(U))
    assert code_of(e) == "reconnect"


def test_a_reconnect_that_lands_mid_refresh_is_not_deleted(g):
    connect()
    g.refresh_error = "invalid_grant"
    g.before_refresh = lambda: connect(token="1//reconnected-meanwhile")
    with pytest.raises(GoogleError):
        run(google.access_token(U))
    (row,) = g.db.t["google_connections"]
    assert Fernet(config.GMAIL_TOKEN_KEY).decrypt(row["refresh_token_enc"].encode()).decode() == "1//reconnected-meanwhile"


def test_other_refresh_failures_keep_the_connection(g):
    connect()
    g.refresh_error = "invalid_client"
    with pytest.raises(GoogleError) as e:
        run(google.access_token(U))
    assert code_of(e) == "send_failed"
    assert len(g.db.t["google_connections"]) == 1


def test_a_token_unreadable_under_a_new_key_means_reconnect(g, monkeypatch):
    connect()
    monkeypatch.setattr(config, "GMAIL_TOKEN_KEY", Fernet.generate_key().decode())
    with pytest.raises(GoogleError) as e:
        run(google.access_token(U))
    assert code_of(e) == "reconnect"
    assert g.calls == []
    assert len(g.db.t["google_connections"]) == 1    # the old key may come back


def test_disconnect_revokes_and_deletes_and_survives_a_failed_revoke(g):
    connect()
    run(google.disconnect(U))
    assert g.db.t["google_connections"] == []
    assert g.calls == [("revoke", {"token": REFRESH})]
    connect()
    g.revoke_raises = httpx.ConnectError("down")
    run(google.disconnect(U))
    assert g.db.t["google_connections"] == []
    g.calls.clear()
    run(google.disconnect(U))              # nothing connected: nothing to revoke, no error
    assert g.calls == []


def test_disconnect_drops_the_cached_access_token(g):
    connect()
    run(google.access_token(U))
    run(google.disconnect(U))
    with pytest.raises(GoogleError) as e:
        run(google.access_token(U))
    assert code_of(e) == "reconnect"


# ── Grants that are dropped, not saved ────────────────────────────────────────

def test_finishing_saves_the_held_grant_and_revokes_nothing(g):
    async def scenario():
        code = google.hold_pending(U, "ada@gmail.com", GRANTED, "1//held")
        assert await google.finish(U, code) == {"connected": True, "email": "ada@gmail.com"}
        await settle_background()
    run(scenario())
    assert google.connection(U)["email"] == "ada@gmail.com" and "revoke" not in g.kinds()


def test_a_held_grant_nobody_confirms_is_revoked_when_it_expires(g, monkeypatch):
    monkeypatch.setattr(google, "PENDING_MAX_AGE", 0.05)

    async def scenario():
        google.hold_pending(U, "ada@gmail.com", GRANTED, "1//held")
        for _ in range(100):
            await asyncio.sleep(0.02)
            if "revoke" in g.kinds():
                break
        await settle_background()
    run(scenario())
    assert g.calls == [("revoke", {"token": "1//held"})] and not google._pending


def test_an_expired_code_is_revoked_when_it_comes_back(g):
    async def scenario():
        code = google.hold_pending(U, "ada@gmail.com", GRANTED, "1//held")
        google._pending[code]["expires"] = 0
        with pytest.raises(GoogleError) as e:
            await google.finish(U, code)
        assert code_of(e) == "expired"
        await settle_background()
    run(scenario())
    assert g.calls == [("revoke", {"token": "1//held"})] and google.connection(U) is None


def test_a_held_grant_pushed_out_by_newer_ones_is_revoked(g, monkeypatch):
    monkeypatch.setattr(google, "_PENDING_CAP", 2)

    async def scenario():
        for n, address in enumerate(("a@gmail.com", "b@gmail.com", "c@gmail.com")):
            google.hold_pending(U, address, GRANTED, f"1//held-{n}")
        await settle_background()
    run(scenario())
    assert g.calls == [("revoke", {"token": "1//held-0"})] and len(google._pending) == 2


def test_a_grant_that_cannot_be_saved_is_revoked(g, monkeypatch):
    def broken(*_a):
        raise RuntimeError("database down")
    monkeypatch.setattr(google, "save_connection", broken)

    async def scenario():
        code = google.hold_pending(U, "ada@gmail.com", GRANTED, "1//held")
        with pytest.raises(RuntimeError):
            await google.finish(U, code)
    run(scenario())
    assert g.calls == [("revoke", {"token": "1//held"})]


def test_a_dropped_grant_for_an_account_still_connected_is_left_alone(g):
    # Revoking any token of a Google account ends Mentorable's whole grant on
    # it, which would cut off the connection saved for the same account.
    connect(V, address="ada@gmail.com")

    async def scenario():
        code = google.hold_pending(U, "ada@gmail.com", GRANTED, "1//held")
        google._pending[code]["expires"] = 0
        assert google.take_pending(code) is None
        wrong = google.hold_pending(V, "ada@gmail.com", GRANTED, "1//held-too")
        with pytest.raises(GoogleError):
            await google.finish(U, wrong)                 # confirmed from the wrong account
        await settle_background()
    run(scenario())
    assert "revoke" not in g.kinds()


def test_reconnecting_another_gmail_revokes_the_old_one_but_not_the_same_one(g):
    connect(U, token="1//old", address="old@gmail.com")

    async def scenario():
        code = google.hold_pending(U, "new@gmail.com", GRANTED, "1//new")
        assert (await google.finish(U, code))["email"] == "new@gmail.com"
        code = google.hold_pending(U, "New@gmail.com", GRANTED, "1//newer")
        await google.finish(U, code)
    run(scenario())
    assert g.calls == [("revoke", {"token": "1//old"})]
    (row,) = g.db.t["google_connections"]
    assert Fernet(config.GMAIL_TOKEN_KEY).decrypt(row["refresh_token_enc"].encode()).decode() == "1//newer"


# ── Building the email ────────────────────────────────────────────────────────

MID = "<1759.42.99@gmail.com>"


def test_a_first_email_has_the_headers_and_a_utf8_plain_body():
    raw = google.build_message(from_email="ada@gmail.com", to="mlee@usf.edu",
                               subject="High school student asking about José's reef survey",
                               body="Dear Dr. Lee,\n\nI read about your coral work. Café trip next week?\n\nThanks,\nAda",
                               message_id=MID)
    assert "+" not in raw and "/" not in raw            # base64url, as Gmail takes it
    decoded = base64.urlsafe_b64decode(raw)
    assert b"\r\n" in decoded and b"\n" not in decoded.replace(b"\r\n", b"")   # CRLF only
    msg = parse(raw)
    assert msg["From"] == "ada@gmail.com" and msg["To"] == "mlee@usf.edu"
    assert msg["Subject"] == "High school student asking about José's reef survey"
    assert msg["Message-ID"] == MID
    assert msg["Date"]
    assert msg["In-Reply-To"] is None and msg["References"] is None
    assert msg.get_content_type() == "text/plain" and msg.get_content_charset() == "utf-8"
    assert msg.get_content().replace("\r\n", "\n").rstrip("\n") == \
        "Dear Dr. Lee,\n\nI read about your coral work. Café trip next week?\n\nThanks,\nAda"


def test_a_follow_up_threads_on_the_first_message_id():
    raw = google.build_message(from_email="ada@gmail.com", to="mlee@usf.edu", subject="Re: A question",
                               body="Just checking this reached you.", message_id="<2@gmail.com>",
                               in_reply_to=MID, from_name="Ada Park")
    msg = parse(raw)
    assert msg["In-Reply-To"] == MID and msg["References"] == MID
    assert msg["From"] == "Ada Park <ada@gmail.com>"


@pytest.mark.parametrize("field,value", [
    ("subject", "Hello\r\nBcc: everyone@example.com"),
    ("subject", "Hello\nthere"),
    ("subject", "Hello there"),
    ("subject", "   "),
    ("to", "mlee@usf.edu\r\nBcc: x@example.com"),
    ("to", "mlee@usf.edu, other@usf.edu"),
    ("to", "Maria Lee <mlee@usf.edu>"),
    ("to", "not an address"),
    ("to", "mlee@localhost"),
    ("from_email", "ada@gmail.com\n"),
    ("from_name", "Ada\r\nBcc: x@example.com"),
    ("message_id", "<1@gmail.com>\r\nBcc: x@example.com"),
    ("message_id", "no-brackets@gmail.com"),
    ("in_reply_to", "<1@gmail.com>\nX: y"),
    ("in_reply_to", "garbage"),
    ("body", "  \n "),
])
def test_bad_headers_and_addresses_are_refused(field, value):
    args = {"from_email": "ada@gmail.com", "to": "mlee@usf.edu", "subject": "A question",
            "body": "Hello.", "message_id": MID, field: value}
    with pytest.raises(ValueError):
        google.build_message(**args)


def test_valid_address():
    assert google.valid_address("m.lee+lab@marine.usf.edu")
    for bad in ("", None, "a@b", "a b@usf.edu", "a@@usf.edu", "a@usf.edu.", ".a@usf.edu", "a..b@usf.edu",
                "a@-usf.edu", "x" * 65 + "@usf.edu", "a@" + "b" * 250 + ".edu"):
        assert not google.valid_address(bad), bad


# ── Sending ───────────────────────────────────────────────────────────────────

def test_a_send_posts_the_raw_email_with_the_access_token(g):
    connect()
    out = run(google.send(U, to="mlee@usf.edu", subject="A question", body="Hello, Dr. Lee."))
    kind, payload, auth = g.calls[-1]
    assert kind == "send" and auth == "Bearer ya29.fresh-1"
    assert set(payload) == {"raw"}
    msg = parse(payload["raw"])
    assert msg["From"] == "ada@gmail.com" and msg["To"] == "mlee@usf.edu"
    assert out == {"gmail_message_id": "msg-1", "gmail_thread_id": "thread-1",
                   "message_id_header": msg["Message-ID"], "from_email": "ada@gmail.com"}
    assert out["message_id_header"].startswith("<") and out["message_id_header"].endswith("@gmail.com>")


def test_a_follow_up_goes_in_the_same_thread(g):
    connect()
    out = run(google.send(U, to="mlee@usf.edu", subject="A question", body="Just checking in.",
                          thread_id="18c2f0a1b2c3d4e5", in_reply_to=MID))
    _, payload, _ = g.calls[-1]
    assert payload["threadId"] == "18c2f0a1b2c3d4e5"
    assert parse(payload["raw"])["In-Reply-To"] == MID
    assert out["gmail_thread_id"] == "18c2f0a1b2c3d4e5"


def test_a_401_refreshes_once_then_sends(g):
    connect()
    g.send_replies = [(401, {"error": {"code": 401, "status": "UNAUTHENTICATED"}})]
    out = run(google.send(U, to="mlee@usf.edu", subject="A question", body="Hello."))
    assert out["gmail_message_id"] == "msg-1"
    assert g.kinds() == ["refresh", "send", "refresh", "send"]
    assert g.calls[-1][2] == "Bearer ya29.fresh-2"


@pytest.mark.parametrize("replies,code", [
    ([(401, {"error": {"status": "UNAUTHENTICATED"}})] * 2, "reconnect"),
    ([(403, {"error": {"status": "PERMISSION_DENIED", "errors": [{"reason": "insufficientPermissions"}]}})], "reconnect"),
    ([(403, {"error": {"status": "PERMISSION_DENIED", "errors": [{"reason": "userRateLimitExceeded"}]}})], "send_failed"),
    ([(429, {"error": {"status": "RESOURCE_EXHAUSTED"}})], "send_failed"),
    ([(400, {"error": {"status": "INVALID_ARGUMENT"}})], "send_failed"),
])
def test_send_failures_map_to_codes(g, replies, code):
    connect()
    g.send_replies = list(replies)
    with pytest.raises(GoogleError) as e:
        run(google.send(U, to="mlee@usf.edu", subject="A question", body="Hello."))
    assert code_of(e) == code
    assert e.value.maybe_sent is False


@pytest.mark.parametrize("status", [500, 502, 503, 504, 408])
def test_a_server_error_after_the_request_may_have_sent_it(g, status):
    # Gmail may take the email and then fail to answer, and messages.send has
    # no idempotency key: a retry could send the same first email twice.
    connect()
    g.send_replies = [(status, {"error": {"status": "INTERNAL"}})]
    with pytest.raises(GoogleError) as e:
        run(google.send(U, to="mlee@usf.edu", subject="A question", body="Hello."))
    assert code_of(e) == "send_failed" and e.value.maybe_sent is True
    assert "Sent folder" in e.value.message


def test_a_lost_answer_may_have_sent_and_a_refused_connection_did_not(g):
    connect()
    g.send_replies = [httpx.ReadTimeout("slow")]
    with pytest.raises(GoogleError) as e:
        run(google.send(U, to="mlee@usf.edu", subject="A question", body="Hello."))
    assert code_of(e) == "send_failed" and e.value.maybe_sent is True
    g.send_replies = [httpx.ConnectError("refused")]
    with pytest.raises(GoogleError) as e:
        run(google.send(U, to="mlee@usf.edu", subject="A question", body="Hello."))
    assert code_of(e) == "send_failed" and e.value.maybe_sent is False


def test_a_bad_message_or_no_connection_never_reaches_gmail(g):
    with pytest.raises(GoogleError) as e:
        run(google.send(U, to="mlee@usf.edu", subject="A question", body="Hello."))
    assert code_of(e) == "reconnect"
    connect()
    for kwargs in ({"to": "mlee@usf.edu\r\nBcc: x@example.com"}, {"subject": "Hi\nBcc: x@example.com"},
                   {"thread_id": "abc def"}):
        args = {"to": "mlee@usf.edu", "subject": "A question", "body": "Hello.", **kwargs}
        with pytest.raises(GoogleError) as e:
            run(google.send(U, **args))
        assert code_of(e) == "send_failed"
    assert "send" not in g.kinds()


def test_no_token_ever_reaches_the_logs(g, caplog):
    caplog.set_level(logging.DEBUG)
    connect()
    run(google.send(U, to="mlee@usf.edu", subject="A question", body="Hello."))
    g.send_replies = [(500, {"error": {"status": "INTERNAL"}})]
    with pytest.raises(GoogleError):
        run(google.send(U, to="mlee@usf.edu", subject="A question", body="Hello."))
    google._cache.clear()
    g.refresh_error = "invalid_grant"
    with pytest.raises(GoogleError):
        run(google.access_token(U))
    for secret in (REFRESH, "ya29.fresh-1", CODE_ACCESS, "test-secret"):
        assert secret not in caplog.text


# ── Budgets ───────────────────────────────────────────────────────────────────

def test_tries_are_spent_refunded_and_counted(g):
    assert usage.left(U, "outreach", "try") == 2
    assert usage.spend(U, "outreach", "try") and usage.spend(U, "outreach", "try")
    assert not usage.spend(U, "outreach", "try")
    assert usage.left(U, "outreach", "try") == 0
    assert usage.summary(U, "outreach", "try") == {"used": 2, "limit": 2, "left": 0}
    usage.refund(U, "outreach", "try")
    assert usage.left(U, "outreach", "try") == 1
    (row,) = g.db.t["agent_usage"]
    assert (row["agent"], row["kind"], row["bucket"], row["used"]) == ("outreach", "try", "all", 1)
    usage.refund(U, "outreach", "try")
    usage.refund(U, "outreach", "try")
    assert usage.left(U, "outreach", "try") == 2         # never below zero used
    assert usage.left(V, "outreach", "try") == 2         # per student


def test_a_budget_that_cannot_be_checked_is_unavailable_not_spent(g, monkeypatch):
    def broken(*_a, **_k):
        raise RuntimeError("database down")
    monkeypatch.setattr(g.db, "rpc", broken)
    with pytest.raises(usage.Unavailable):
        usage.spend(U, "outreach", "try")
    assert usage.refund(U, "outreach", "try") is False     # never raises, and says it did not happen
    monkeypatch.undo()
    assert g.db.t["agent_usage"] == []


def test_a_refund_is_retried_once_and_says_whether_it_went_back(g, monkeypatch, caplog):
    assert usage.spend(U, "outreach", "try")
    real, failures = g.db.rpc, []

    def flaky(fn, params):
        if fn == "agent_refund_usage" and len(failures) < 1:
            failures.append(fn)
            raise RuntimeError("blip")
        return real(fn, params)
    monkeypatch.setattr(g.db, "rpc", flaky)
    assert usage.refund(U, "outreach", "try") is True
    assert usage.left(U, "outreach", "try") == 2

    def down(fn, params):
        if fn == "agent_refund_usage":
            raise RuntimeError("down")
        return real(fn, params)
    monkeypatch.setattr(g.db, "rpc", down)
    assert usage.spend(U, "outreach", "try")
    caplog.set_level(logging.ERROR)
    assert usage.refund(U, "outreach", "try") is False
    assert "REFUND LOST" in caplog.text and usage.left(U, "outreach", "try") == 1


def test_an_unknown_agent_or_kind_is_a_bug_not_an_empty_budget(g):
    with pytest.raises(KeyError):
        usage.spend(U, "outreach", "nap")
    with pytest.raises(KeyError):
        usage.left(U, "nobody", "try")


def test_the_daily_bucket_is_the_utc_date_whatever_the_profile_says(g, monkeypatch):
    # 02:30 UTC on Sep 30 is still the evening of Sep 29 in Los Angeles; the
    # budget does not care, so moving the zone cannot start a new day.
    monkeypatch.setattr(usage, "_now", lambda: datetime(2026, 9, 30, 2, 30, tzinfo=timezone.utc))
    assert usage.bucket("total") == "all"
    assert usage.bucket("day") == "2026-09-30"
    with pytest.raises(ValueError):
        usage.bucket("week")

    assert usage.student_tz(U) is None
    g.db.t["profiles"][0]["timezone"] = "America/Los_Angeles"
    assert usage.student_tz(U) == "America/Los_Angeles"
    for zone in ("America/Los_Angeles", "Pacific/Kiritimati", "Etc/GMT+12", None, None):
        g.db.t["profiles"][0]["timezone"] = zone
        assert usage.spend(U, "outreach", "send")
    assert not usage.spend(U, "outreach", "send")
    assert {r["bucket"] for r in g.db.t["agent_usage"]} == {"2026-09-30"}
    assert usage.left(U, "outreach", "send") == 0
    assert usage.refund(U, "outreach", "send") is True
    assert usage.left(U, "outreach", "send") == 1

    monkeypatch.setattr(usage, "_now", lambda: datetime(2026, 10, 1, 0, 0, tzinfo=timezone.utc))
    assert usage.left(U, "outreach", "send") == 5          # a new UTC day


def test_dev_emails_bypass_the_budget_like_the_sql(g):
    g.db.emails[U] = "kwu.1600@gmail.com"
    for _ in range(4):
        assert usage.spend(U, "outreach", "try")
    assert usage.left(U, "outreach", "try") == 2
    assert usage.unmetered(usage.bump(U, "outreach", "send"))      # other caps can honour the bypass
    g.db.emails[V] = "someone@example.com"
    assert usage.spend(V, "outreach", "try") and usage.spend(V, "outreach", "try")
    assert not usage.spend(V, "outreach", "try")
    assert not usage.unmetered(usage.bump(V, "outreach", "send"))
    assert not usage.unmetered(usage.bump(V, "outreach", "try"))    # refused is not unmetered
