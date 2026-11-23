"""The chat advisor's tool loop as a LangGraph (app/graphs/chat.py): the round
cap and its forced closing reply, the change events, tool results fed back to
the model, the conversation kept as plain dicts and never doubled by the
reducer, the record reaching the prompt through the real load_context (the
undeclared-key regression in CLAUDE.md), and the /chat keep-alive pings."""
import asyncio
import json
from types import SimpleNamespace as NS

import pytest

from tests.memory_world import U  # noqa: F401  (first: it stubs the Supabase client)

import app.graphs.chat as graph_mod  # noqa: E402
import app.nodes.chat.advisor as advisor  # noqa: E402
from app.models import CHAT_DEFAULT, CHAT_MODELS  # noqa: E402


class Model:
    """A scripted Anthropic messages.stream: each call pops one step."""

    def __init__(self, script):
        self.script, self.calls = list(script), []

    def stream(self, **kw):
        # Deep-copied: the graph must never mutate what it sent.
        self.calls.append(json.loads(json.dumps(kw, default=lambda o: vars(o))))
        step = self.script.pop(0)
        model = self

        class S:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *a):
                return False

            @property
            async def text_stream(self):
                for t in step.get("texts", []):
                    yield t

            async def get_final_message(self):
                return NS(stop_reason=step["stop"], content=list(step.get("content", [])),
                          usage={"input_tokens": 1, "output_tokens": 1})
        model.last = S()
        return model.last


def tool_use(name, args=None, id="t1"):
    return NS(type="tool_use", id=id, name=name, input=args or {})


def inputs(**extra):
    return {"user_id": U, "chat_id": None, "node_id": None, "rounds": 0, "handoffs": 0,
            "_pick": CHAT_MODELS[CHAT_DEFAULT],
            "messages": [{"role": "user", "content": "hi"}], **extra}


def drive(graph, state):
    async def go():
        return [c async for c in graph.astream(state, stream_mode="custom")]
    return asyncio.run(go())


@pytest.fixture
def faked(monkeypatch):
    """The graph with the database reads and the prompt faked, a scripted
    model and recorded tools and analytics."""
    world = NS(ran=[], captured=[], loads=0)

    async def fake_load(state):
        world.loads += 1
        return {"profile": {}}

    async def fake_build(state):
        return {"_system_shared": "SHARED", "_system_student": "STUDENT"}

    async def fake_tool(user_id, name, args):
        world.ran.append((name, args))
        return {"success": True, "kind": "activity", "title": "Robotics", "changed": ["title"]}

    monkeypatch.setattr(graph_mod, "load_context", fake_load)
    monkeypatch.setattr(graph_mod, "build_prompt", fake_build)
    monkeypatch.setattr(advisor, "execute_chat_tool", fake_tool)
    monkeypatch.setattr(advisor, "tools_for", lambda profile: [{"name": "view_portfolio"}])
    monkeypatch.setattr(advisor.posthog_client, "capture",
                        lambda event, distinct_id, properties: world.captured.append((event, properties)))

    def with_model(script):
        world.model = Model(script)
        monkeypatch.setattr(advisor, "_anthropic", NS(messages=world.model))
        return graph_mod.create_chat_graph()
    world.graph = with_model
    return world


def texts(chunks):
    return "".join(c["text"] for c in chunks if "text" in c)


def test_the_round_cap_forces_a_closing_reply(faked):
    n = advisor.MAX_TOOL_ROUNDS
    graph = faked.graph([{"stop": "tool_use", "texts": ["Looking. "], "content": [tool_use("view_portfolio")]}] * n
                        + [{"stop": "end_turn", "texts": ["Here is the summary."]}])
    chunks = drive(graph, inputs())
    calls = faked.model.calls
    assert len(calls) == n + 1
    assert all("tool_choice" not in kw for kw in calls[:-1])
    assert calls[-1]["tool_choice"] == {"type": "none"}
    assert len(faked.ran) == n
    # Each turn after the first starts on the separator, so turns never run together.
    assert texts(chunks) == advisor.TURN_SEPARATOR.join(["Looking. "] * n + ["Here is the summary."])
    assert chunks[0] == {"ready": True}


def test_a_model_that_ignores_tool_choice_still_stops_at_the_cap(faked):
    n = advisor.MAX_TOOL_ROUNDS
    graph = faked.graph([{"stop": "tool_use", "content": [tool_use("view_portfolio")]}] * (n + 1))
    drive(graph, inputs())
    assert len(faked.model.calls) == n + 1 and len(faked.ran) == n


def test_writes_emit_change_events_and_reads_stay_silent(faked):
    graph = faked.graph([
        {"stop": "tool_use", "content": [tool_use("view_portfolio", id="a"),
                                         tool_use("add_portfolio_item", {"kind": "activity"}, id="b"),
                                         tool_use("update_quest", {"title": "x"}, id="c")]},
        {"stop": "end_turn", "texts": ["Done."]},
    ])
    chunks = drive(graph, inputs())
    events = [c for c in chunks if "event" in c]
    assert [(e["event"], e["verb"]) for e in events] == [("portfolio_changed", "Added"), ("quest_changed", "Updated")]
    assert events[0]["item"]["title"] == "Robotics"
    assert [e for e, _ in faked.captured] == ["portfolio_changed_via_chat", "quest_changed_via_chat"]
    assert faked.captured[0][1] == {"tool": "add_portfolio_item", "kind": "activity"}
    assert {"tools_ran": True} in chunks
    # Events come before the reply that follows them.
    assert chunks.index(events[-1]) < next(i for i, c in enumerate(chunks) if c.get("text") == "Done.")


def test_tool_results_are_fed_back_as_plain_dicts(faked):
    thinking = NS(type="thinking", thinking="hmm", signature="sig")
    graph = faked.graph([
        {"stop": "tool_use", "texts": ["Let me check."], "content": [
            thinking, NS(type="text", text="Let me check.", citations=None),
            tool_use("view_portfolio", {"section": "all"}, id="tu_1")]},
        {"stop": "end_turn", "texts": ["You have one activity."]},
    ])
    drive(graph, inputs())
    first, second = faked.model.calls
    # The reducer appends: the history is sent once, not doubled by a node.
    assert [m["role"] for m in first["messages"]] == ["user"]
    assert [m["role"] for m in second["messages"]] == ["user", "assistant", "user"]
    assistant, results = second["messages"][1], second["messages"][2]
    assert assistant["content"] == [
        {"type": "thinking", "thinking": "hmm", "signature": "sig"},
        {"type": "text", "text": "Let me check."},
        {"type": "tool_use", "id": "tu_1", "name": "view_portfolio", "input": {"section": "all"}}]
    (result,) = results["content"]
    assert result["type"] == "tool_result" and result["tool_use_id"] == "tu_1"
    assert json.loads(result["content"])["success"] is True
    assert result["cache_control"] == {"type": "ephemeral"}
    assert faked.ran == [("view_portfolio", {"section": "all"})]
    assert faked.loads == 1


def test_the_final_state_holds_the_whole_reply(faked):
    graph = faked.graph([{"stop": "tool_use", "texts": ["A."], "content": [tool_use("view_portfolio")]},
                         {"stop": "end_turn", "texts": ["B."], "content": [NS(type="text", text="B.")]}])
    state = asyncio.run(graph.ainvoke(inputs()))
    assert state["current_response"] == "A." + advisor.TURN_SEPARATOR + "B."
    assert state["rounds"] == 1 and state["handoffs"] == 0
    assert [m["role"] for m in state["messages"]] == ["user", "assistant", "user", "assistant"]
    assert all(isinstance(b, dict) for m in state["messages"][1:] for b in m["content"])


def test_sdk_blocks_become_dicts_the_api_accepts():
    from anthropic.types import TextBlock, ToolUseBlock
    assert advisor._block_dict(TextBlock(type="text", text="hi", citations=None)) == {"type": "text", "text": "hi"}
    assert advisor._block_dict(ToolUseBlock(type="tool_use", id="t", name="view_quest", input={})) == {
        "type": "tool_use", "id": "t", "name": "view_quest", "input": {}}


def test_a_prompt_that_failed_to_build_never_calls_the_model(faked, monkeypatch):
    async def no_prompt(state):
        return {"_system_shared": "", "_system_student": ""}
    monkeypatch.setattr(graph_mod, "build_prompt", no_prompt)
    graph = faked.graph([])
    assert drive(graph, inputs()) == [] and faked.model.calls == []


# ── Through the real load_context (CLAUDE.md: test prompts via the graph) ──

def test_the_record_reaches_the_prompt_through_the_graph(w, monkeypatch):
    w.db.t["student_activities"].append({"id": "a1", "user_id": U, "title": "Robotics Club captain",
                                         "category": "Robotics", "order_index": 0})
    w.db.t["student_awards"].append({"id": "w1", "user_id": U, "title": "AIME qualifier", "order_index": 0})
    model = Model([{"stop": "end_turn", "texts": ["Hi Ada."]}])
    monkeypatch.setattr(advisor, "_anthropic", NS(messages=model))
    chunks = drive(graph_mod.create_chat_graph(), inputs())
    assert texts(chunks) == "Hi Ada."
    (kw,) = model.calls
    shared, student = (b["text"] for b in kw["system"])
    assert "## How to advise" in shared
    assert "Robotics Club captain" in student and "AIME qualifier" in student and "Ada" in student
    assert kw["messages"] == [{"role": "user", "content": [
        {"type": "text", "text": "hi", "cache_control": {"type": "ephemeral"}}]}]


def test_a_real_write_tool_changes_the_record_and_says_so(w, monkeypatch):
    model = Model([
        {"stop": "tool_use", "content": [tool_use("add_portfolio_item",
                                                  {"kind": "award", "title": "State science fair, 2nd"})]},
        {"stop": "end_turn", "texts": ["Added it."]},
    ])
    monkeypatch.setattr(advisor, "_anthropic", NS(messages=model))
    monkeypatch.setattr(advisor.posthog_client, "capture", lambda *a, **k: None)
    chunks = drive(graph_mod.create_chat_graph(), inputs())
    assert [c["event"] for c in chunks if "event" in c] == ["portfolio_changed"]
    assert [r["title"] for r in w.db.t["student_awards"] if r["user_id"] == U] == ["State science fair, 2nd"]
    fed_back = json.loads(model.calls[1]["messages"][-1]["content"][0]["content"])
    assert fed_back["success"] is True


# ── /chat keep-alive ─────────────────────────────────────────────────────────

def test_a_slow_stream_gets_pings_between_chunks():
    import app.main as main

    async def slow():
        yield {"text": "a"}
        await asyncio.sleep(0.12)
        yield {"text": "b"}

    async def go():
        return [c async for c in main._with_pings(slow(), 0.05)]
    got = asyncio.run(go())
    assert got[0] == {"text": "a"} and got[-1] == {"text": "b"}
    assert got[1:-1] and all(c is None for c in got[1:-1])


def test_chat_sends_a_ping_comment_while_the_model_is_quiet(monkeypatch):
    from fastapi.testclient import TestClient
    import app.main as main
    from app.auth import verify_jwt

    async def rate(user_id, feature):
        pass

    async def fake_graph_stream(state, stream_mode):
        assert stream_mode == "custom"
        yield {"ready": True}
        await asyncio.sleep(0.12)
        yield {"text": "late"}

    monkeypatch.setattr(main, "check_rate_limit", rate)
    monkeypatch.setattr(main, "CHAT_PING_SECONDS", 0.05)
    monkeypatch.setattr(main, "chat_graph", NS(astream=fake_graph_stream))
    monkeypatch.setattr(main, "spawn", lambda coro: coro.close())
    main.app.dependency_overrides[verify_jwt] = lambda: "u1"
    try:
        res = TestClient(main.app).post("/chat", json={"messages": [{"role": "user", "content": "hi"}]})
    finally:
        main.app.dependency_overrides.clear()
    lines = [line for line in res.text.splitlines() if line]
    assert ": ping" in lines
    assert [line for line in lines if line.startswith("data: ")] == [
        "data: " + json.dumps({"text": "late"}), "data: [DONE]"]


def test_chat_answers_500_and_refunds_when_the_prompt_fails(monkeypatch):
    from fastapi.testclient import TestClient
    import app.main as main
    from app.auth import verify_jwt
    refunds = []

    async def rate(user_id, feature):
        pass

    async def refund(user_id, feature):
        refunds.append(feature)

    async def empty(state, stream_mode):
        return
        yield

    monkeypatch.setattr(main, "check_rate_limit", rate)
    monkeypatch.setattr(main, "refund_usage", refund)
    monkeypatch.setattr(main, "chat_graph", NS(astream=empty))
    main.app.dependency_overrides[verify_jwt] = lambda: "u1"
    try:
        res = TestClient(main.app).post("/chat", json={"messages": [{"role": "user", "content": "hi"}]})
    finally:
        main.app.dependency_overrides.clear()
    assert res.status_code == 500 and refunds == ["chat"]
