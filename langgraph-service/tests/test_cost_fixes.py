"""The 2026-11-18 cost fixes: the ledger, the chat prompt split for caching,
one chat note per conversation, the chat's caps and tool-round limit, the
onboarding limits, and the structured-output fallback that paid twice."""
import asyncio
import hashlib
import json
import logging
from types import SimpleNamespace as NS

import pytest
from fastapi.testclient import TestClient

import app.costs as costs
import app.llm as llm
from app.nodes.chat import build_prompt as bp


def run(coro):
    return asyncio.run(coro)


# ── The ledger ──────────────────────────────────────────────────────────────

@pytest.fixture
def rows(monkeypatch):
    got = []
    monkeypatch.setattr(costs, "_queue", got.append)
    return got


def test_prices_cover_every_model_the_app_routes_to():
    import app.models as m
    used = {v for k, v in vars(m).items() if k.isupper() and isinstance(v, str) and v.startswith(("claude", "gpt", "text-"))}
    assert used <= set(costs.PRICES), used - set(costs.PRICES)


def test_anthropic_cost_counts_cache_reads_and_writes(rows):
    usage = NS(input_tokens=1000, output_tokens=500, cache_creation_input_tokens=4000,
               cache_read_input_tokens=10000, server_tool_use=None)
    cost = costs.record_anthropic("chat", "claude-sonnet-5", usage, user_id="u1")
    want = (1000 * 2 + 500 * 10 + 4000 * 2.5 + 10000 * 0.2) / 1e6
    assert cost == pytest.approx(want)
    (row,) = rows
    assert row["feature"] == "chat" and row["user_id"] == "u1" and row["provider"] == "anthropic"
    assert (row["input_tokens"], row["output_tokens"], row["cache_write_tokens"], row["cache_read_tokens"]) == \
        (1000, 500, 4000, 10000)
    assert row["cost_usd"] == round(want, 6)


def test_anthropic_web_searches_are_billed_on_top(rows):
    usage = {"input_tokens": 100, "output_tokens": 10, "server_tool_use": {"web_search_requests": 3}}
    cost = costs.record_anthropic("quest_resources", "claude-haiku-4-5-20251001", usage)
    assert cost == pytest.approx((100 * 1 + 10 * 5) / 1e6 + 0.03)
    assert rows[0]["units"] == 3


def test_openai_cached_tokens_are_split_out(rows):
    usage = NS(prompt_tokens=10000, completion_tokens=2000, prompt_tokens_details=NS(cached_tokens=4000))
    cost = costs.record_openai("finder_extract", "gpt-5-mini", usage)
    assert cost == pytest.approx((6000 * 0.25 + 4000 * 0.025 + 2000 * 2.0) / 1e6)
    assert rows[0]["input_tokens"] == 6000 and rows[0]["cache_read_tokens"] == 4000


def test_unpriced_model_is_still_recorded_with_a_warning(rows, caplog):
    costs._warned.discard("claude-future-9")
    with caplog.at_level(logging.WARNING):
        assert costs.record_anthropic("x", "claude-future-9", {"input_tokens": 5, "output_tokens": 5}) is None
        costs.record_anthropic("x", "claude-future-9", {"input_tokens": 5, "output_tokens": 5})
    assert [r["cost_usd"] for r in rows] == [None, None]
    assert sum("no price for claude-future-9" in r.message for r in caplog.records) == 1


def test_units_and_labels(rows):
    assert costs.record_units("interview_voice", "elevenlabs_voice", 600) == pytest.approx(0.8)
    assert costs.record_units("tavily_search", "tavily", 1) == pytest.approx(0.008)
    assert [r["provider"] for r in rows] == ["elevenlabs", "tavily"]
    assert costs.feature_name("intake_extract 1234-abcd") == "intake_extract"
    assert costs.feature_name("") == "unknown"


def test_recording_never_raises(monkeypatch):
    def boom(row):
        raise RuntimeError("db down")
    monkeypatch.setattr(costs, "_queue", boom)
    assert costs.record_anthropic("chat", "claude-sonnet-5", {"input_tokens": 1}) is not None


def test_the_student_comes_from_the_request_context_and_follows_tasks(rows):
    async def main():
        costs.current_user.set("student-7")

        async def background():
            costs.record_units("tavily_search", "tavily", 1)
        await asyncio.create_task(background())
        await asyncio.to_thread(costs.record_units, "brave_search", "brave", 1)
    run(main())
    assert [r["user_id"] for r in rows] == ["student-7", "student-7"]


def test_verify_jwt_marks_the_request_for_the_endpoint_and_its_stream(monkeypatch, rows):
    from fastapi import Depends, FastAPI
    from fastapi.responses import StreamingResponse
    import app.auth as auth

    async def fake_get(url, headers):
        return NS(status_code=200, json=lambda: {"id": "student-9"})
    monkeypatch.setattr(auth, "_http", lambda: NS(get=fake_get))

    api = FastAPI()
    seen = {}

    @api.get("/x")
    async def x(user_id: str = Depends(auth.verify_jwt)):
        seen["endpoint"] = costs.current_user.get()

        async def gen():
            seen["stream"] = costs.current_user.get()
            yield "data: ok\n\n"
        return StreamingResponse(gen(), media_type="text/event-stream")

    res = TestClient(api).get("/x", headers={"Authorization": "Bearer t"})
    assert res.status_code == 200
    assert seen == {"endpoint": "student-9", "stream": "student-9"}


# ── One model call per fallback, no retry stack ─────────────────────────────

class Calls:
    def __init__(self, reply=None, error=None):
        self.n = 0
        self.kwargs = []
        self.reply, self.error = reply, error

    async def create(self, **kw):
        self.n += 1
        self.kwargs.append(kw)
        if self.error:
            raise self.error
        return self.reply


def _tool_reply(name, value):
    return NS(stop_reason="tool_use", usage={"input_tokens": 10, "output_tokens": 5},
              content=[NS(type="tool_use", name=name, input=value)])


def test_tool_completion_makes_one_call_and_raises_on_failure(monkeypatch, rows):
    calls = Calls(error=RuntimeError("400 bad request"))
    monkeypatch.setattr(llm, "_anthropic", NS(messages=NS(create=calls.create)))
    with pytest.raises(llm.ModelUnavailable):
        run(llm.tool_completion(model="claude-haiku-4-5-20251001", prompt="p", max_tokens=10, label="t",
                                tool={"name": "t", "input_schema": {"type": "object"}}))
    assert calls.n == 1


def test_json_fallback_is_one_forced_tool_call(monkeypatch, rows):
    calls = Calls(reply=_tool_reply("chat_signals", {"summary": "x", "sensitive": False}))
    monkeypatch.setattr(llm, "_anthropic", NS(messages=NS(create=calls.create)))
    monkeypatch.setattr(llm, "_openai", None)
    schema = {"type": "object", "properties": {"summary": {"type": "string"}}, "required": ["summary"],
              "additionalProperties": False}
    got = run(llm.json_completion(prompt="p", schema=schema, schema_name="chat_signals", openai_model="gpt-5-nano",
                                  anthropic_model="claude-haiku-4-5-20251001", max_tokens=100))
    assert got == {"summary": "x", "sensitive": False}
    assert calls.n == 1
    assert calls.kwargs[0]["tool_choice"] == {"type": "tool", "name": "chat_signals"}
    assert calls.kwargs[0]["tools"][0]["input_schema"] == schema
    assert rows and rows[0]["feature"] == "chat_signals"


def test_a_caller_with_its_own_fallback_pays_for_one_anthropic_call(monkeypatch, rows):
    """Talon's reading jobs (Beaker's research is an agent loop now): OpenAI
    fails, Haiku answers once through the caller's own forced tool, never a
    plain Haiku call first."""
    from app.nodes.agents.finder import research

    async def openai_fails(**kw):
        raise RuntimeError("openai down")
    monkeypatch.setattr(llm, "_openai", NS(chat=NS(completions=NS(create=openai_fails))))
    monkeypatch.setattr(research, "openai_enabled", lambda: True)
    calls = Calls(reply=_tool_reply("submit_queries", {"queries": ["a", "b"]}))
    monkeypatch.setattr(llm, "_anthropic", NS(messages=NS(create=calls.create)))
    got = run(research._ask(label="finder_queries", prompt="p", max_tokens=100, openai_model="gpt-5-nano",
                            expect="queries",
                            tool={"name": "submit_queries", "input_schema": {
                                "type": "object", "properties": {"queries": {"type": "array", "items": {"type": "string"}}}}}))
    assert got == {"queries": ["a", "b"]}
    assert calls.n == 1


# ── The chat prompt, in two blocks ──────────────────────────────────────────

def _student(name, **extra):
    return {"full_name": name, "grade_level": 11, "agent_response_style": "direct",
            "memory_enabled": True, "chat_signals": ["Worried about cost.", "Likes chemistry."], **extra}


def test_the_shared_block_is_the_same_for_every_student():
    a_shared, a_student = bp.build_system_blocks(_student("Ana Ruiz"), {})
    b_shared, b_student = bp.build_system_blocks(_student("Ben Okafor", grade_level=9), {})
    assert a_shared == b_shared
    assert "Ana" not in a_shared and "Ana" in a_student and "Ben" in b_student
    assert "## How to advise" in a_shared and "## Format" in a_shared
    assert "## How to advise" not in a_student


def test_the_students_own_instructions_come_last():
    _, student = bp.build_system_blocks(_student("Ana Ruiz", agent_instructions="Call me Annie."), {})
    assert student.rstrip().endswith("Call me Annie.")
    assert student.index("## From previous conversations") < student.index("## What the student asked")


def _marked(note, session="11111111-1111-1111-1111-111111111111"):
    return {"session": session, "md5": hashlib.md5(note.encode()).hexdigest()}


def test_this_conversations_own_note_stays_out_of_its_prompt():
    chat = "11111111-1111-1111-1111-111111111111"
    profile = _student("Ana Ruiz", chat_signal_session=_marked("Likes chemistry."))
    _, student = bp.build_system_blocks(profile, {}, chat)
    assert "Worried about cost." in student and "Likes chemistry." not in student
    # Another conversation sees it.
    _, other = bp.build_system_blocks(profile, {}, "22222222-2222-2222-2222-222222222222")
    assert "Likes chemistry." in other
    # A last note the student edited (the hash no longer matches) is shown.
    _, edited = bp.build_system_blocks(_student("Ana Ruiz", chat_signal_session=_marked("Old text.")), {}, chat)
    assert "Likes chemistry." in edited


def test_notes_stay_hidden_with_memory_off():
    _, student = bp.build_system_blocks(_student("Ana Ruiz", memory_enabled=False), {})
    assert "From previous conversations" not in student


def test_the_md5_matches_postgres():
    # Postgres: SELECT md5('Likes chemistry.') = 'b0e2a4c3...' (hex of the UTF-8 bytes).
    assert bp._note_hash("café") == hashlib.md5("café".encode("utf-8")).hexdigest()


def test_the_chat_graph_carries_both_blocks(monkeypatch):
    """Through create_chat_graph, not the nodes one by one (CLAUDE.md)."""
    from app.graphs import chat as chat_graph_mod
    import app.graphs.chat as g

    def fake_load(state):
        return {**state, "profile": _student("Ana Ruiz"), "_activities": [{"id": "a1", "title": "Robotics"}]}
    monkeypatch.setattr(g, "load_context", fake_load)
    graph = chat_graph_mod.create_chat_graph()
    state = run(graph.ainvoke({"user_id": "u", "chat_id": None}))
    assert "## How to advise" in state["_system_shared"]
    assert "Robotics" in state["_system_student"] and "Ana" in state["_system_student"]


# ── The chat endpoint ───────────────────────────────────────────────────────

@pytest.fixture
def chat_app(monkeypatch):
    import app.main as main
    from app.auth import verify_jwt

    world = NS(rate=0, refunds=0, streams=[], spawned=[], script=[])

    async def rate(user_id, feature):
        world.rate += 1

    async def refund(user_id, feature):
        world.refunds += 1

    async def ainvoke(state):
        world.state = state
        return {**state, "profile": {}, "_system_shared": "SHARED", "_system_student": "STUDENT"}

    class FakeStream:
        def __init__(self, kw):
            self.kw = kw
            step = world.script.pop(0)
            self.texts, self.final, self.error = step.get("texts", []), step.get("final"), step.get("error")

        async def __aenter__(self):
            if self.error:
                raise self.error
            return self

        async def __aexit__(self, *a):
            return False

        @property
        async def text_stream(self):
            for t in self.texts:
                yield t

        async def get_final_message(self):
            return self.final

    def stream(**kw):
        world.streams.append(kw)
        return FakeStream(kw)

    def spawn(coro):
        world.spawned.append(coro)
        coro.close()

    async def run_tool(user_id, name, args):
        return {"success": True}

    monkeypatch.setattr(main, "check_rate_limit", rate)
    monkeypatch.setattr(main, "refund_usage", refund)
    monkeypatch.setattr(main, "chat_graph", NS(ainvoke=ainvoke))
    monkeypatch.setattr(main, "_anthropic", NS(messages=NS(stream=stream)))
    monkeypatch.setattr(main, "spawn", spawn)
    monkeypatch.setattr(main, "execute_chat_tool", run_tool)
    monkeypatch.setattr(main, "tools_for", lambda profile: [{"name": "view_portfolio"}])
    monkeypatch.setattr(costs, "_queue", lambda row: None)
    main.app.dependency_overrides[verify_jwt] = lambda: "u1"
    world.client = TestClient(main.app)
    yield world
    main.app.dependency_overrides.clear()


def _final(stop, content=()):
    return NS(stop_reason=stop, content=list(content), usage={"input_tokens": 10, "output_tokens": 5})


def _events(res):
    return [line[6:] for line in res.text.splitlines() if line.startswith("data: ")]


def test_a_reply_streams_with_two_cached_system_blocks_and_a_cached_history(chat_app):
    chat_app.script = [{"texts": ["Hi ", "Ana"], "final": _final("end_turn")}]
    res = chat_app.client.post("/chat", json={"messages": [{"role": "user", "content": "hello"}],
                                              "session_id": "11111111-1111-1111-1111-111111111111"})
    assert _events(res) == [json.dumps({"text": "Hi "}), json.dumps({"text": "Ana"}), "[DONE]"]
    (kw,) = chat_app.streams
    assert [b["text"] for b in kw["system"]] == ["SHARED", "STUDENT"]
    assert all(b["cache_control"] == {"type": "ephemeral"} for b in kw["system"])
    last = kw["messages"][-1]["content"][-1]
    assert last["text"] == "hello" and last["cache_control"] == {"type": "ephemeral"}
    assert chat_app.state["chat_id"] == "11111111-1111-1111-1111-111111111111"
    assert len(chat_app.spawned) == 1


def test_a_bad_session_id_is_ignored(chat_app):
    chat_app.script = [{"texts": ["ok"], "final": _final("end_turn")}]
    chat_app.client.post("/chat", json={"messages": [{"role": "user", "content": "hi"}], "session_id": "nope"})
    assert chat_app.state["chat_id"] is None


def test_tool_rounds_are_capped_and_the_last_one_must_answer_in_words(chat_app):
    import app.main as main
    tool = NS(type="tool_use", id="t1", name="view_portfolio", input={})
    chat_app.script = ([{"texts": [], "final": _final("tool_use", [tool])}] * main.CHAT_MAX_TOOL_ROUNDS
                       + [{"texts": ["Done."], "final": _final("end_turn")}])
    res = chat_app.client.post("/chat", json={"messages": [{"role": "user", "content": "loop"}]})
    assert len(chat_app.streams) == main.CHAT_MAX_TOOL_ROUNDS + 1
    assert all("tool_choice" not in kw for kw in chat_app.streams[:-1])
    assert chat_app.streams[-1]["tool_choice"] == {"type": "none"}
    # Each round's last block (a tool result) carries the cache mark.
    assert chat_app.streams[1]["messages"][-1]["content"][-1]["cache_control"] == {"type": "ephemeral"}
    assert _events(res)[-1] == "[DONE]"


def test_a_message_that_is_too_long_is_refused_before_it_costs_one(chat_app):
    import app.main as main
    res = chat_app.client.post("/chat", json={"messages": [
        {"role": "user", "content": "x" * (main.CHAT_MAX_MESSAGE_CHARS + 1)}]})
    assert res.status_code == 413
    assert chat_app.rate == 0 and chat_app.streams == []


def test_a_failure_before_any_text_gives_the_message_back(chat_app):
    chat_app.script = [{"error": RuntimeError("overloaded")}]
    res = chat_app.client.post("/chat", json={"messages": [{"role": "user", "content": "hi"}]})
    assert json.loads(_events(res)[-1]) == {"error": "Stream failed"}
    assert chat_app.rate == 1 and chat_app.refunds == 1


def test_history_is_trimmed_from_the_front_and_starts_on_a_user_turn():
    import app.main as main
    msgs = []
    for i in range(60):
        msgs.append(main.Message(role="user", content=f"q{i}"))
        msgs.append(main.Message(role="ai", content=f"a{i}"))
    msgs.append(main.Message(role="user", content="last"))
    kept = main._normalize_chat(msgs)
    assert len(kept) <= main.CHAT_MAX_HISTORY_MESSAGES
    assert kept[0]["role"] == "user" and kept[-1]["content"] == "last"
    big = [main.Message(role="user", content="x" * 50000), main.Message(role="ai", content="y" * 20000),
           main.Message(role="user", content="now")]
    assert [m["content"][:1] for m in main._normalize_chat(big)] == ["n"]


# ── Parked routes and onboarding limits ─────────────────────────────────────

def test_parked_routes_answer_404(chat_app):
    for path in ("/scorecard/improve", "/roadmap/intake", "/roadmap/generate", "/roadmap/node/expand",
                 "/roadmap/phase/generate", "/roadmap/phase/complete"):
        assert chat_app.client.post(path, json={}).status_code == 404, path


def test_onboarding_interview_refuses_past_its_turn_cap_and_its_budget(chat_app, monkeypatch):
    import app.main as main
    from app.nodes.onboarding import budget
    monkeypatch.setattr(main, "load_student_record", lambda uid, strict=False: {"activities": [{"title": "DECA"}]})
    monkeypatch.setattr(main, "render_record_context", lambda record: "DECA")
    spent = []
    monkeypatch.setattr(budget, "spend", lambda uid, kind: spent.append(kind) or False)
    too_many = [{"role": "user" if i % 2 else "assistant", "content": "x"} for i in range(main.INTERVIEW_MAX_MESSAGES + 2)]
    res = chat_app.client.post("/onboarding/interview", json={"messages": too_many})
    assert json.loads(_events(res)[0])["code"] == "TURN_CAP" and spent == []
    res = chat_app.client.post("/onboarding/interview", json={"messages": [{"role": "user", "content": "hi"}]})
    assert json.loads(_events(res)[0])["code"] == "LIMIT" and spent == ["interview_turn"]
    assert chat_app.streams == []


def test_onboarding_extract_is_capped(chat_app, monkeypatch):
    import app.main as main
    from app.nodes.onboarding import budget
    monkeypatch.setattr(budget, "spend", lambda uid, kind: False)
    assert chat_app.client.post("/onboarding/intake/extract",
                                json={"transcript": "x" * (main.INTAKE_MAX_TRANSCRIPT_CHARS + 1)}).status_code == 413
    assert chat_app.client.post("/onboarding/intake/extract", json={"transcript": "hi"}).status_code == 429


def test_onboarding_voice_session_spends_and_refunds(chat_app, monkeypatch):
    import app.main as main
    from app.nodes.onboarding import budget
    log = []
    monkeypatch.setattr(budget, "spend", lambda uid, kind: log.append(("spend", kind)) or True)
    monkeypatch.setattr(budget, "refund", lambda uid, kind: log.append(("refund", kind)))

    async def ok(agent):
        assert agent == main.elevenlabs.onboarding_agent_id()
        return {"signed_url": "wss://x", "conversation_id": "c1"}
    monkeypatch.setattr(main.elevenlabs, "signed_url", ok)
    assert chat_app.client.post("/onboarding/voice/session").json() == {"signed_url": "wss://x"}

    async def down(agent):
        raise main.elevenlabs.ElevenLabsError("signed_url status 401 invalid_api_key")
    monkeypatch.setattr(main.elevenlabs, "signed_url", down)
    assert chat_app.client.post("/onboarding/voice/session").status_code == 503
    assert log == [("spend", "voice_call"), ("spend", "voice_call"), ("refund", "voice_call")]


# ── The chat's model picker ─────────────────────────────────────────────────

def test_a_picked_claude_model_runs_with_low_effort(chat_app):
    chat_app.script = [{"texts": ["hi"], "final": _final("end_turn")}]
    chat_app.client.post("/chat", json={"messages": [{"role": "user", "content": "hello"}], "model": "haiku-5-5"})
    (kw,) = chat_app.streams
    assert kw["model"] == "claude-haiku-5-5"
    assert kw["extra_body"] == {"output_config": {"effort": "low"}}


def test_an_unknown_model_key_gets_the_default(chat_app):
    chat_app.script = [{"texts": ["hi"], "final": _final("end_turn")}]
    chat_app.client.post("/chat", json={"messages": [{"role": "user", "content": "hello"}], "model": "claude-opus-5-5"})
    (kw,) = chat_app.streams
    assert kw["model"] == "claude-sonnet-5" and "extra_body" not in kw


def test_a_declined_turn_is_rerun_on_the_default_model(chat_app):
    chat_app.script = [{"texts": [], "final": _final("refusal")},
                       {"texts": ["Here is what I can say."], "final": _final("end_turn")}]
    res = chat_app.client.post("/chat", json={"messages": [{"role": "user", "content": "hello"}], "model": "sonnet-5-5"})
    assert [kw["model"] for kw in chat_app.streams] == ["claude-sonnet-5-5", "claude-sonnet-5"]
    assert json.loads(_events(res)[0]) == {"text": "Here is what I can say."}


def test_a_refusal_on_the_default_model_says_so(chat_app):
    import app.main as main
    chat_app.script = [{"texts": [], "final": _final("refusal")}]
    res = chat_app.client.post("/chat", json={"messages": [{"role": "user", "content": "hello"}]})
    assert json.loads(_events(res)[0]) == {"text": main.CHAT_REFUSED}


def test_openai_models_refuse_cleanly_without_a_key(chat_app, monkeypatch):
    monkeypatch.setattr(llm, "_openai", None)
    res = chat_app.client.post("/chat", json={"messages": [{"role": "user", "content": "hi"}], "model": "gpt-6-luna"})
    assert res.status_code == 503 and chat_app.rate == 0


def test_the_openai_loop_streams_text_and_runs_tools(chat_app, monkeypatch):
    calls = []

    def chunk(content=None, tool=None, usage=None):
        if usage:
            return NS(usage=usage, choices=[])
        return NS(usage=None, choices=[NS(delta=NS(content=content, tool_calls=[tool] if tool else None))])

    rounds = [
        [chunk("Let me look. "),
         chunk(tool=NS(index=0, id="c1", function=NS(name="view_portfolio", arguments='{"se'))),
         chunk(tool=NS(index=0, id=None, function=NS(name=None, arguments='ction": "all"}'))),
         chunk(usage={"prompt_tokens": 100, "completion_tokens": 20})],
        [chunk("You have two activities."), chunk(usage={"prompt_tokens": 150, "completion_tokens": 10})],
    ]

    async def create(**kw):
        calls.append(kw)
        items = rounds.pop(0)

        async def gen():
            for c in items:
                yield c
        return gen()

    import app.main as main
    ran = []

    async def tool(user_id, name, args):
        ran.append((name, args))
        return {"success": True}
    monkeypatch.setattr(main, "execute_chat_tool", tool)
    monkeypatch.setattr(llm, "_openai", NS(chat=NS(completions=NS(create=create))))
    res = chat_app.client.post("/chat", json={"messages": [{"role": "user", "content": "what do I have"}],
                                              "model": "gpt-6-2-sol"})
    texts = [json.loads(e)["text"] for e in _events(res) if e != "[DONE]" and "text" in json.loads(e)]
    assert "".join(texts) == "Let me look. \n\nYou have two activities."
    assert ran == [("view_portfolio", {"section": "all"})]
    assert calls[0]["model"] == "gpt-6.2-sol" and calls[0]["reasoning_effort"] == "low"
    assert calls[0]["messages"][0] == {"role": "system", "content": "SHARED\n\nSTUDENT"}
    assert calls[0]["tools"][0]["function"]["name"] == "view_portfolio"
    tool_msgs = [m for m in calls[1]["messages"] if m["role"] == "tool"]
    assert tool_msgs == [{"role": "tool", "tool_call_id": "c1", "content": json.dumps({"success": True})}]
    assert _events(res)[-1] == "[DONE]"


def test_a_rerun_after_a_decline_drops_the_first_models_thinking(chat_app):
    tool = NS(type="tool_use", id="t1", name="view_portfolio", input={})
    thinking = NS(type="thinking", thinking="", signature="sig")
    chat_app.script = [{"texts": [], "final": _final("tool_use", [thinking, tool])},
                       {"texts": [], "final": _final("refusal")},
                       {"texts": ["ok"], "final": _final("end_turn")}]
    chat_app.client.post("/chat", json={"messages": [{"role": "user", "content": "hi"}], "model": "sonnet-5-5"})
    last = chat_app.streams[-1]
    assert last["model"] == "claude-sonnet-5"
    assistant = [m for m in last["messages"] if m["role"] == "assistant"][0]
    assert [getattr(b, "type", None) for b in assistant["content"]] == ["tool_use"]


def test_an_empty_openai_reply_is_an_error_and_refunded(chat_app, monkeypatch):
    async def create(**kw):
        async def gen():
            yield NS(usage=None, choices=[NS(delta=NS(content=None, tool_calls=None))])
        return gen()
    monkeypatch.setattr(llm, "_openai", NS(chat=NS(completions=NS(create=create))))
    res = chat_app.client.post("/chat", json={"messages": [{"role": "user", "content": "hi"}], "model": "gpt-6-luna"})
    assert json.loads(_events(res)[-1]) == {"error": "Stream failed"}
    assert chat_app.refunds == 1
