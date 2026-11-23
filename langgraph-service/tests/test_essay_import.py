"""Opening a student's Google Doc for Quill (app/nodes/agents/essay/imports.py):
only a Docs link, only Google's own hosts, a private doc said plainly, and the
text handed back without being stored. Google is faked; no network.

    python3 -m pytest tests/test_essay_import.py
"""
import asyncio
import os
import sys
import types

for _k in ("SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "ANTHROPIC_API_KEY",
           "DATABASE_URL", "CORS_ORIGIN"):
    os.environ.setdefault(_k, "stub")
_stub = types.ModuleType("app.db.supabase")
_stub.get_supabase = lambda: None
sys.modules.setdefault("app.db.supabase", _stub)

import httpx  # noqa: E402
import pytest  # noqa: E402

from app.nodes.agents.essay import imports  # noqa: E402

DOC = "1aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789abcdEF"
LINK = f"https://docs.google.com/document/d/{DOC}/edit?usp=sharing"


@pytest.fixture
def google(monkeypatch):
    """A fake Google: `answer(request)` decides each reply; every URL asked is kept."""
    asked = []
    state = {"answer": None}
    real = httpx.AsyncClient

    def handler(request):
        asked.append(str(request.url))
        return state["answer"](request)

    monkeypatch.setattr(imports.httpx, "AsyncClient",
                        lambda **kw: real(transport=httpx.MockTransport(handler), **kw))
    monkeypatch.setattr(imports, "_opened", imports.defaultdict(imports.deque))
    return asked, state


def open_doc(url, user="u1"):
    return asyncio.run(imports.open_google_doc(user, {"url": url}))


def code_of(url, user="u1"):
    with pytest.raises(imports.AgentError) as err:
        open_doc(url, user)
    return err.value.code


def test_a_shared_doc_comes_back_with_its_title_and_text(google):
    asked, state = google
    state["answer"] = lambda r: httpx.Response(200, headers={
        "content-type": "text/plain; charset=utf-8",
        "content-disposition": "attachment; filename=\"Why Rice.txt\"; filename*=UTF-8''Why%20Rice.txt"},
        content="﻿The first line.\r\n\r\n\r\n\r\nThe second.  \n".encode())
    got = open_doc(LINK)
    assert got == {"source": "google", "title": "Why Rice", "url": f"https://docs.google.com/document/d/{DOC}/edit",
                   "text": "The first line.\n\nThe second."}
    assert asked == [f"https://docs.google.com/document/d/{DOC}/export?format=txt"]


@pytest.mark.parametrize("link", [
    "https://evil.example.com/document/d/" + DOC, "https://docs.google.com.evil.com/document/d/" + DOC,
    "https://docs.google.com/spreadsheets/d/" + DOC, "file:///etc/passwd", "", None, 42])
def test_only_a_google_docs_link_is_opened(google, link):
    asked, _ = google
    assert code_of(link) == "bad_link" and asked == []


def test_a_private_doc_is_said_plainly_and_the_sign_in_page_is_never_read(google):
    asked, state = google
    state["answer"] = lambda r: httpx.Response(302, headers={"location": "https://accounts.google.com/ServiceLogin"})
    assert code_of(LINK) == "not_shared" and len(asked) == 1


def test_a_redirect_off_google_is_not_followed(google):
    asked, state = google
    state["answer"] = lambda r: httpx.Response(302, headers={"location": "https://169.254.169.254/latest"})
    assert code_of(LINK) == "not_shared" and len(asked) == 1


def test_googles_own_redirect_to_its_file_host_is_followed(google):
    asked, state = google

    def answer(r):
        if r.url.host == "docs.google.com":
            return httpx.Response(307, headers={"location": "https://doc-0s-docs.googleusercontent.com/export/x"})
        return httpx.Response(200, headers={"content-type": "text/plain"}, content=b"Hello")
    state["answer"] = answer
    assert open_doc(LINK)["text"] == "Hello" and len(asked) == 2


def test_an_html_answer_is_a_sign_in_page_not_the_doc(google):
    _, state = google
    state["answer"] = lambda r: httpx.Response(200, headers={"content-type": "text/html"}, content=b"<html>Sign in</html>")
    assert code_of(LINK) == "not_shared"


def test_an_empty_or_huge_doc_is_refused(google):
    _, state = google
    state["answer"] = lambda r: httpx.Response(200, headers={"content-type": "text/plain"}, content=b"  \n ")
    assert code_of(LINK) == "empty"
    state["answer"] = lambda r: httpx.Response(200, headers={"content-type": "text/plain"},
                                               content=b"x" * (imports.MAX_BYTES + 1))
    assert code_of(LINK) == "too_big"


def test_google_not_answering_is_a_try_again(google):
    _, state = google

    def down(r):
        raise httpx.ConnectError("down")
    state["answer"] = down
    assert code_of(LINK) == "could_not_open"


def test_a_student_gets_a_handful_an_hour(google, monkeypatch):
    _, state = google
    monkeypatch.setattr(imports, "PER_HOUR", 2)
    state["answer"] = lambda r: httpx.Response(200, headers={"content-type": "text/plain"}, content=b"Hi")
    open_doc(LINK)
    open_doc(LINK)
    assert code_of(LINK) == "slow_down"
    assert open_doc(LINK, user="u2")["text"] == "Hi"           # another student is not held up


def test_the_link_and_the_text_never_reach_the_log(google, caplog):
    _, state = google
    state["answer"] = lambda r: httpx.Response(200, headers={"content-type": "text/plain"}, content=b"My secret essay")
    with caplog.at_level("INFO"):
        open_doc(LINK)
    assert DOC not in caplog.text and "secret" not in caplog.text
