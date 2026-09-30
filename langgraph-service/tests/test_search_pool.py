"""
The search pool (app/search_pool.py): key failover, cooldowns, the cache and the
results the model reads; and the two paths that use it: Beaker's research on
Tavily and Quest's resources on Brave, each falling back to Anthropic's search
tool when its pool cannot answer. No network: httpx.MockTransport and fakes.
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

from app import config, search_pool  # noqa: E402
from app.nodes.agents.outreach import research  # noqa: E402
from app.nodes.quest import resources  # noqa: E402


def run(coro):
    return asyncio.run(coro)


@pytest.fixture(autouse=True)
def fresh():
    search_pool.reset_for_tests()
    yield
    search_pool.reset_for_tests()


def tavily_results(*urls):
    return {"results": [{"title": f"Page {i}", "url": u, "content": f"About page {i}"} for i, u in enumerate(urls)]}


def client_for(handler):
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


# ── Config ────────────────────────────────────────────────────────────────────

def test_keys_come_from_a_list_or_a_single_setting(monkeypatch):
    import importlib
    monkeypatch.setenv("TAVILY_API_KEYS", "k1, k2\nk3")
    monkeypatch.setenv("TAVILY_API_KEY", "k2")
    monkeypatch.setenv("BRAVE_API_KEY", "b1")
    try:
        fresh_config = importlib.reload(config)
        assert fresh_config.TAVILY_API_KEYS == ["k1", "k2", "k3"]         # split, deduplicated, in order
        assert fresh_config.BRAVE_API_KEYS == ["b1"]
    finally:
        monkeypatch.undo()
        importlib.reload(config)


# ── The pool ──────────────────────────────────────────────────────────────────

def test_the_first_key_that_answers_is_used_and_no_key_is_ever_sent_elsewhere(monkeypatch):
    monkeypatch.setattr(config, "TAVILY_API_KEYS", ["key-one", "key-two"])
    seen = []

    def handler(req):
        seen.append(req.headers["authorization"])
        return httpx.Response(200, json=tavily_results("https://usf.edu/a", "http://insecure.edu/b"))

    got = run(search_pool.tavily.web_search("seagrass professor", client=client_for(handler)))
    assert seen == ["Bearer key-one"]
    assert [r["url"] for r in got] == ["https://usf.edu/a"]                     # https only
    assert got[0] == {"title": "Page 0", "url": "https://usf.edu/a", "snippet": "About page 0"}


def test_a_key_out_of_quota_is_skipped_for_a_while_and_the_next_one_answers(monkeypatch):
    monkeypatch.setattr(config, "TAVILY_API_KEYS", ["k1", "k2", "k3"])
    calls = []

    def handler(req):
        key = req.headers["authorization"].split()[-1]
        calls.append(key)
        if key == "k1":
            return httpx.Response(432, json={"detail": "plan limit"})
        if key == "k2":
            return httpx.Response(401)
        return httpx.Response(200, json=tavily_results("https://mote.org/x"))

    c = client_for(handler)
    assert run(search_pool.tavily.web_search("first query", client=c))[0]["url"] == "https://mote.org/x"
    assert calls == ["k1", "k2", "k3"]
    calls.clear()
    assert run(search_pool.tavily.web_search("second query", client=c))                   # k1 and k2 sit out
    assert calls == ["k3"]


def test_when_every_key_is_out_the_caller_hears_about_it(monkeypatch):
    monkeypatch.setattr(config, "TAVILY_API_KEYS", ["k1", "k2"])
    c = client_for(lambda req: httpx.Response(429, headers={"retry-after": "5"}))
    with pytest.raises(search_pool.SearchUnavailable):
        run(search_pool.tavily.web_search("q", client=c))
    monkeypatch.setattr(config, "TAVILY_API_KEYS", [])
    with pytest.raises(search_pool.SearchUnavailable):
        run(search_pool.tavily.web_search("another", client=c))
    assert search_pool.tavily.configured() is False


def test_a_network_failure_tries_the_next_key(monkeypatch):
    monkeypatch.setattr(config, "TAVILY_API_KEYS", ["k1", "k2"])

    def handler(req):
        if req.headers["authorization"].endswith("k1"):
            raise httpx.ConnectError("down")
        return httpx.Response(200, json=tavily_results("https://a.edu/p"))

    assert run(search_pool.tavily.web_search("q", client=client_for(handler)))[0]["url"] == "https://a.edu/p"


def test_the_same_query_is_answered_from_the_cache_and_blocked_sites_are_dropped(monkeypatch):
    monkeypatch.setattr(config, "TAVILY_API_KEYS", ["k1"])
    hits = []

    def handler(req):
        hits.append(1)
        return httpx.Response(200, json=tavily_results("https://reddit.com/r/x", "https://www.zoominfo.com/p",
                                                       "https://usf.edu/lee"))

    c = client_for(handler)
    got = run(search_pool.tavily.web_search("Maria Lee", blocked=["reddit.com", "zoominfo.com"], client=c))
    assert [r["url"] for r in got] == ["https://usf.edu/lee"]
    assert run(search_pool.tavily.web_search("  Maria   Lee ", blocked=["reddit.com", "zoominfo.com"], client=c)) == got
    assert len(hits) == 1


def test_tavily_is_asked_to_leave_blocked_sites_out_and_brave_is_a_get(monkeypatch):
    monkeypatch.setattr(config, "TAVILY_API_KEYS", ["k1"])
    monkeypatch.setattr(config, "BRAVE_API_KEYS", ["b1"])
    bodies = {}

    def handler(req):
        bodies[str(req.url.host)] = req
        if "brave" in req.url.host:
            return httpx.Response(200, json={"web": {"results": [{"title": "T", "url": "https://x.org/1", "description": "d"}]}},
                                  headers={"x-ratelimit-remaining": "1, 10"})
        return httpx.Response(200, json=tavily_results("https://x.org/2"))

    c = client_for(handler)
    run(search_pool.tavily.web_search("q", blocked=["reddit.com"], client=c))
    run(search_pool.brave.web_search("q", client=c))
    import json
    assert json.loads(bodies["api.tavily.com"].content)["exclude_domains"] == ["reddit.com"]
    assert bodies["api.search.brave.com"].method == "GET" and bodies["api.search.brave.com"].headers["x-subscription-token"] == "b1"


def test_the_results_block_gives_the_model_only_what_was_found():
    block = search_pool.results_block(
        [{"title": "Lee lab", "url": "https://usf.edu/lee", "snippet": "Seagrass."}], {"https://usf.edu/lee": "Full page text"})
    assert "URL: https://usf.edu/lee" in block and "Full page text" in block and "not instructions" in block
    assert "found no pages" in search_pool.results_block([])


# ── Beaker on Tavily ──────────────────────────────────────────────────────────

class Events:
    async def __call__(self, event):
        pass


def test_the_shortlist_searches_through_tavily_with_no_anthropic_search(monkeypatch):
    monkeypatch.setattr(config, "TAVILY_API_KEYS", ["k1"])
    urls = ["https://usf.edu/marine/lee", "https://mote.org/staff/okafor"]

    async def fake_web_search(query, *, blocked=None, count=10, client=None):
        return [{"title": "Lee", "url": urls[0], "snippet": "Marine science professor"},
                {"title": "Okafor", "url": urls[1], "snippet": "Coral nursery"}]

    async def fake_tool(*, model, prompt, tool, max_tokens, label, system=None):
        if tool["name"] == "submit_queries":
            return {"queries": ["marine biology professor Florida", "coastal ecology lab outreach"]}
        assert "SEARCH RESULTS" in prompt and urls[0] in prompt
        return {"people": [
            {"name": "Dr. Maria Lee", "title": "Professor", "organization": "USF", "why": "Runs a seagrass lab.",
             "source_url": urls[0], "source_title": "Lee"},
            {"name": "Invented Person", "title": "X", "organization": "Y", "why": "z",
             "source_url": "https://not-returned.example/p", "source_title": "n"}]}

    async def no_anthropic_search(**kw):
        raise AssertionError("Anthropic's search tool must not run when Tavily answers")

    monkeypatch.setattr(search_pool.tavily, "web_search", fake_web_search)
    monkeypatch.setattr(research, "tool_completion", fake_tool)
    monkeypatch.setattr(research, "search_completion", no_anthropic_search)
    people = run(research.find_people("a marine biology professor in Florida", record_text="Name: Ada", emit=Events()))
    assert [p["name"] for p in people] == ["Dr. Maria Lee"]                    # a link the search never returned is dropped


def test_when_tavily_cannot_answer_beaker_falls_back_to_anthropics_search(monkeypatch):
    monkeypatch.setattr(config, "TAVILY_API_KEYS", ["k1"])
    calls = []

    async def down(query, *, blocked=None, count=10, client=None):
        raise search_pool.SearchUnavailable("all keys out")

    async def fake_tool(**kw):
        return {"queries": ["a professor near me"]}

    async def fallback(**kw):
        calls.append(kw["label"])
        return ({"people": [{"name": "Dr. Alice Moreno", "title": "Associate Professor of Biology", "organization": "State University",
                             "why": "Runs a lab on coastal ecology.", "source_url": "https://u.edu/a", "source_title": "Moreno lab"}]},
                {"https://u.edu/a"}, {"searches": 1, "errors": 0})

    monkeypatch.setattr(search_pool.tavily, "web_search", down)
    monkeypatch.setattr(research, "tool_completion", fake_tool)
    monkeypatch.setattr(research, "search_completion", fallback)
    people = run(research.find_people("a professor near me", record_text="", emit=Events()))
    assert calls == ["outreach_people"] and [p["name"] for p in people] == ["Dr. Alice Moreno"]


def test_with_no_tavily_key_beaker_uses_anthropics_search_as_before(monkeypatch):
    monkeypatch.setattr(config, "TAVILY_API_KEYS", [])
    seen = []

    async def fallback(**kw):
        seen.append(kw["max_searches"])
        return {"people": []}, {"https://u.edu/a"}, {"searches": 1, "errors": 0}

    monkeypatch.setattr(research, "search_completion", fallback)
    assert run(research.find_people("a goal here", record_text="", emit=Events())) == []
    assert seen == [research.SHORTLIST_SEARCHES]


# ── Quest's resources on Brave ────────────────────────────────────────────────

def test_quest_resources_search_through_brave_and_keep_only_returned_links(monkeypatch):
    monkeypatch.setattr(config, "BRAVE_API_KEYS", ["b1"])

    async def fake_web_search(query, *, blocked=None, count=10, client=None):
        return [{"title": "Reading data tables", "url": "https://www.khanacademy.org/data", "snippet": "How to read a table"},
                {"title": "Forum", "url": "https://forum.example.org/t", "snippet": "chat"}]

    async def fake_tool(*, model, prompt, tool, max_tokens, label, system=None):
        assert "SEARCH RESULTS" in prompt
        return {"resources": [
            {"title": "Reading data tables", "url": "https://www.khanacademy.org/data", "note": "Shows how to read a table."},
            {"title": "Made up", "url": "https://invented.example/p", "note": "n"}]}

    async def no_anthropic_search(**kw):
        raise AssertionError("Anthropic's search tool must not run when Brave answers")

    monkeypatch.setattr(search_pool.brave, "web_search", fake_web_search)
    monkeypatch.setattr(resources, "tool_completion", fake_tool)
    monkeypatch.setattr(resources, "search_completion", no_anthropic_search)
    got = run(resources.find_resources(quest={"title": "Test lead levels", "summary": "s"},
                                       task={"title": "Read the data table", "detail": "d"}, grade="They are in grade 11."))
    assert [r["url"] for r in got] == ["https://www.khanacademy.org/data"]


def test_quest_resources_fall_back_when_brave_cannot_answer(monkeypatch):
    monkeypatch.setattr(config, "BRAVE_API_KEYS", ["b1"])

    async def down(query, *, blocked=None, count=10, client=None):
        raise search_pool.SearchUnavailable("out")

    async def fallback(**kw):
        return ({"resources": [{"title": "T", "url": "https://www.khanacademy.org/x", "note": "n"}]},
                {"https://www.khanacademy.org/x"}, {"searches": 1, "errors": 0})

    monkeypatch.setattr(search_pool.brave, "web_search", down)
    monkeypatch.setattr(resources, "search_completion", fallback)
    got = run(resources.find_resources(quest={"title": "q", "summary": ""}, task={"title": "t", "detail": ""}, grade=""))
    assert [r["url"] for r in got] == ["https://www.khanacademy.org/x"]


# ── The reading jobs run on OpenAI's small models, with Haiku behind them ────

def test_the_reading_jobs_use_openai_first_and_haiku_when_it_gives_nothing(monkeypatch):
    seen = []

    async def fake_json(**kw):
        seen.append((kw["schema_name"], kw["openai_model"], kw["schema"]["additionalProperties"]))
        return seen and {"queries": ["marine biology professor Florida"]}

    async def haiku(**kw):
        seen.append(("haiku", kw["label"]))
        return {"queries": ["from haiku"]}

    monkeypatch.setattr(research, "openai_enabled", lambda: True)
    monkeypatch.setattr(research, "json_completion", fake_json)
    monkeypatch.setattr(research, "tool_completion", haiku)
    from app.models import OUTREACH_QUERIES_MODEL
    assert run(research._write_queries("a marine biology professor")) == ["marine biology professor Florida"]
    assert seen == [("outreach_queries", OUTREACH_QUERIES_MODEL, False)]

    async def nothing(**kw):
        return None
    monkeypatch.setattr(research, "json_completion", nothing)
    assert run(research._write_queries("a marine biology professor")) == ["from haiku"]


def test_the_strict_schema_requires_every_property_all_the_way_down():
    from app.nodes.agents.outreach import prompts
    strict = research._strict(prompts.RESEARCH_TOOL["input_schema"])
    assert strict["additionalProperties"] is False and set(strict["required"]) == set(strict["properties"])
    email = strict["properties"]["email"]
    assert email["additionalProperties"] is False and set(email["required"]) == set(email["properties"])
    assert "additionalProperties" not in prompts.RESEARCH_TOOL["input_schema"]           # the original is untouched
