"""The chat advisor handing work to Beaker (app/nodes/chat/handoff.py): the
graph routes start_outreach to its own node, Beaker's own service runs with
its own budgets, its checklist streams into the reply, the advisor reads back
what happened (never the email), one hand-off per reply, a refusal said
plainly, a run that finishes even when the student leaves, and no way to send
from chat."""
import asyncio
import json
from types import SimpleNamespace as NS

import pytest

from tests.test_chat_graph import drive, faked, inputs, tool_use

import app.nodes.chat.handoff as handoff  # noqa: E402
from app.nodes.agents import registry  # noqa: E402
from app.nodes.agents.outreach import service as beaker  # noqa: E402
from app.nodes.chat import tools as chat_tools  # noqa: E402

FIXTURES = (faked,)      # the chat graph with a scripted model, shared with test_chat_graph.py

CONTACT = {"id": "c1", "name": "Dr. Maria Lee", "organization": "USF", "subject": "Coral sensors",
           "body": "Dear Dr. Lee, the whole email", "email": "mlee@usf.edu"}


@pytest.fixture
def service(monkeypatch):
    """Beaker's service, faked: records each run and streams two checklist lines."""
    world = NS(runs=[], final={"type": "draft", "contact": CONTACT}, refuse=None)

    async def run(kind, user_id, body, emit):
        world.runs.append((kind, body))
        if world.refuse:
            raise world.refuse
        await emit({"type": "progress", "id": "record", "label": "Reading your record", "status": "done"})
        await emit({"type": "other", "id": "x"})                       # not a progress line: never forwarded
        await emit({"type": "progress", "id": "pick", "label": "Found Dr. Maria Lee", "status": "done"})
        return world.final

    monkeypatch.setattr(beaker, "draft", lambda u, b, e: run("draft", u, b, e))
    monkeypatch.setattr(beaker, "shortlist", lambda u, b, e: run("shortlist", u, b, e))
    monkeypatch.setattr(handoff.posthog_client, "capture", lambda *a, **k: None)
    return world


def results_sent(call) -> list[dict]:
    """The tool results the advisor was given in this model call."""
    last = call["messages"][-1]["content"]
    return [json.loads(b["content"]) for b in last if b.get("type") == "tool_result"]


def test_a_named_person_goes_to_beaker_and_the_page_gets_its_checklist_and_card(faked, service):
    graph = faked.graph([
        {"stop": "tool_use", "texts": ["Handing this to Beaker. "],
         "content": [tool_use("start_outreach", {"person_name": "Maria Lee", "organization": "USF",
                                                 "purpose": "research"})]},
        {"stop": "end_turn", "texts": ["Beaker drafted an email to Dr. Lee."]},
    ])
    chunks = drive(graph, inputs())
    kind, body = service.runs[0]
    assert kind == "draft" and body["try_id"] is None and body["person"]["name"] == "Maria Lee"
    assert body["purpose"] == "research" and body["voice"] == "warm" and body["length"] == "brief"
    progress = [c["progress"]["id"] for c in chunks if c.get("event") == "agent_progress"]
    assert progress == ["record", "pick"]
    card = next(c for c in chunks if c.get("event") == "outreach_started")
    assert card["outcome"] == "draft" and card["link"] == "/agents/outreach/c1" and card["name"] == "Dr. Maria Lee"
    assert {"tools_ran": True} in chunks                 # the chat message is not given back after this
    told = results_sent(faked.model.calls[1])[0]
    assert told["outcome"] == "draft" and told["subject"] == "Coral sensors"
    assert "the whole email" not in json.dumps(told)    # the advisor never gets the email to paste


def test_a_goal_becomes_a_shortlist_the_student_picks_from_on_the_agents_page(faked, service):
    service.final = {"type": "shortlist", "try_id": "t1", "candidates": [{"name": "Ana Diaz"}, {"name": "Ben Ortiz"}]}
    graph = faked.graph([
        {"stop": "tool_use", "content": [tool_use("start_outreach", {
            "goal": "A marine biologist in Florida who works on seagrass", "purpose": "informational"})]},
        {"stop": "end_turn", "texts": ["Beaker found two people."]},
    ])
    chunks = drive(graph, inputs())
    assert service.runs[0] == ("shortlist", {"goal": "A marine biologist in Florida who works on seagrass"})
    card = next(c for c in chunks if c.get("event") == "outreach_started")
    assert card["outcome"] == "shortlist" and card["link"] == "/agents/outreach/new"
    assert results_sent(faked.model.calls[1])[0]["people"] == ["Ana Diaz", "Ben Ortiz"]


def test_one_hand_off_per_reply(faked, service):
    again = {"stop": "tool_use", "content": [tool_use("start_outreach", {"person_name": "Ben Ortiz",
                                                                          "purpose": "research"}, id="t2")]}
    graph = faked.graph([
        {"stop": "tool_use", "content": [tool_use("start_outreach", {"person_name": "Maria Lee", "purpose": "research"})]},
        again,
        {"stop": "end_turn", "texts": ["Done."]},
    ])
    drive(graph, inputs())
    assert len(service.runs) == 1
    assert results_sent(faked.model.calls[2])[0]["error"] == "one_per_reply"


def test_two_hand_offs_in_one_turn_run_only_the_first(faked, service):
    graph = faked.graph([
        {"stop": "tool_use", "content": [
            tool_use("start_outreach", {"person_name": "Maria Lee", "purpose": "research"}, id="a"),
            tool_use("start_outreach", {"person_name": "Ben Ortiz", "purpose": "research"}, id="b")]},
        {"stop": "end_turn", "texts": ["Done."]},
    ])
    drive(graph, inputs())
    assert len(service.runs) == 1
    sent = results_sent(faked.model.calls[1])
    assert sent[0]["outcome"] == "draft" and sent[1]["error"] == "one_per_reply"


def test_a_refusal_is_told_to_the_advisor_and_shown_on_the_page(faked, service):
    service.refuse = beaker.AgentError(409, "no_tries", "You have used both of your tries.")
    graph = faked.graph([
        {"stop": "tool_use", "content": [tool_use("start_outreach", {"person_name": "Maria Lee", "purpose": "research"})]},
        {"stop": "end_turn", "texts": ["You're out of Beaker tries."]},
    ])
    chunks = drive(graph, inputs())
    told = results_sent(faked.model.calls[1])[0]
    assert told == {"success": False, "outcome": "refused", "error": "no_tries",
                    "message": "You have used both of your tries."}
    card = next(c for c in chunks if c.get("event") == "outreach_started")
    assert card["outcome"] == "error" and "both of your tries" in card["message"]


def test_a_failed_run_says_whether_the_try_came_back(faked, service):
    service.final = {"type": "error", "error": "not_found", "message": "Beaker could not find them. Your try was given back.",
                     "refunded": True}
    graph = faked.graph([
        {"stop": "tool_use", "content": [tool_use("start_outreach", {"person_name": "Maria Lee", "purpose": "research"})]},
        {"stop": "end_turn", "texts": ["No luck."]},
    ])
    drive(graph, inputs())
    told = results_sent(faked.model.calls[1])[0]
    assert told["success"] is False and told["try_given_back"] is True


def test_a_goal_too_thin_to_search_is_refused_before_anything_is_spent(faked, service):
    graph = faked.graph([
        {"stop": "tool_use", "content": [tool_use("start_outreach", {"goal": "a professor", "purpose": "research"})]},
        {"stop": "end_turn", "texts": ["Who would you like to reach?"]},
    ])
    drive(graph, inputs())
    assert service.runs == [] and results_sent(faked.model.calls[1])[0]["error"] == "bad_goal"


def test_ordinary_tools_in_the_same_turn_still_run(faked, service):
    graph = faked.graph([
        {"stop": "tool_use", "content": [
            tool_use("view_portfolio", id="a"),
            tool_use("start_outreach", {"person_name": "Maria Lee", "purpose": "research"}, id="b")]},
        {"stop": "end_turn", "texts": ["Done."]},
    ])
    drive(graph, inputs())
    assert faked.ran == [("view_portfolio", {})] and len(service.runs) == 1


def test_a_run_beaker_started_finishes_when_the_student_leaves(monkeypatch):
    done = []

    async def slow(user_id, body, emit):
        await asyncio.sleep(0.05)
        done.append(body["person"]["name"])
        return {"type": "draft", "contact": CONTACT}

    monkeypatch.setattr(beaker, "draft", slow)
    monkeypatch.setattr(handoff.posthog_client, "capture", lambda *a, **k: None)

    async def go():
        reply = asyncio.ensure_future(handoff.start_outreach("u1", {"person_name": "Maria Lee",
                                                                    "purpose": "research"}, lambda e: None))
        await asyncio.sleep(0.01)
        reply.cancel()                                   # the tab closed mid-reply
        with pytest.raises(asyncio.CancelledError):
            await reply
        await asyncio.sleep(0.1)
    asyncio.run(go())
    assert done == ["Maria Lee"]


def test_chat_offers_the_hand_off_only_while_beaker_is_on_and_never_a_send():
    names = [t["name"] for t in chat_tools.tools_for({})]
    assert "start_outreach" in names
    assert not [n for n in names if "send" in n or "email" in n]
    off = registry.AgentSpec("outreach", "Beaker", False, {})
    try:
        registry.AGENTS["outreach"], real = off, registry.AGENTS["outreach"]
        assert "start_outreach" not in [t["name"] for t in chat_tools.tools_for({})]
    finally:
        registry.AGENTS["outreach"] = real


def test_the_hand_off_wording_carries_no_em_dashes():
    texts = [json.dumps(handoff.START_OUTREACH_TOOL)] + [handoff._summary(f)[0]["note"] for f in (
        {"type": "draft", "contact": CONTACT}, {"type": "shortlist", "candidates": []}, {"type": "question"})]
    assert not [t for t in texts if "—" in t or "–" in t]
