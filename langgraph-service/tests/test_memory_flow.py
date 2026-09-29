"""
Long-term memory end to end: the real Quest service, chat summary and chat tool
against an in-memory database (tests/fakedb.py), a scripted model and a fake
embedding client (tests/memory_world.py, the `w` fixture in conftest.py). Covers
what the pure tests in test_memory.py cannot: what gets saved from each path,
what reaches the prompts, that every failure degrades to "no memory" without
touching a check-in, and that turning memory off or deleting everything wins over
a save already under way. Run from langgraph-service/:

    python3 -m pytest tests/
"""
import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace as NS

from tests.memory_world import START, TZ, U, V  # noqa: E402  (first: it stubs the Supabase client)

from app.nodes.chat import extract_signals as es  # noqa: E402
from app.nodes.chat.tools import execute_chat_tool  # noqa: E402
from app.nodes.quest import service as svc  # noqa: E402
from app.nodes.recall import embed, store  # noqa: E402


def run(coro):
    return asyncio.run(coro)


async def checkin_today(w, slot, body):
    await svc.open_task(U, TZ, slot)
    res = await svc.check_in(U, TZ, slot, body)
    await store.drain()
    return res


async def checkin_next_day(w, slot, body):
    w.now += timedelta(days=1)
    return await checkin_today(w, slot, body)


# ── Quest: the daily loop ─────────────────────────────────────────────────────

def test_the_quest_loop_saves_recalls_and_degrades(w, monkeypatch):
    async def scenario():
        db = w.db
        # Two things said in chat weeks ago, one of them about this project.
        w.now = START - timedelta(days=20)
        chromebook = "the python signup screen code wont run on my school chromebook"
        assert await store.remember(U, body=chromebook, source="chat", dedupe_key=store.chat_key(chromebook))
        assert await store.remember(U, body="i work saturdays at my aunt's bakery so weekends are packed",
                                    source="chat", dedupe_key="chat:bakery")
        w.now = START
        assert len(w.memories()) == 2
        assert w.memories()[0]["embedding_model"] == "text-embedding-3-small@1536"
        assert len(w.memories()[0]["embedding"]) == 1536
        again = "The python signup screen code   wont run on my school Chromebook"
        assert await store.remember(U, body=again, source="chat", dedupe_key=store.chat_key(again))
        assert len(w.memories()) == 2                                  # the same words keep one copy
        calls = w.emb["calls"]
        assert not await store.remember(U, body="ok thanks", source="chat", dedupe_key="chat:thin")
        assert not await store.remember(U, body="i have been really depressed and i do not know why",
                                        source="chat", dedupe_key="chat:sad")
        assert not await store.remember(U, body="i don’t feel safe at home and i can’t focus",
                                        source="chat", dedupe_key="chat:curly")
        assert w.emb["calls"] == calls                                 # refused before any embedding

        plan = await svc.create_plan(U, TZ, {"goal": "Build a club scheduling app.", "daily_minutes": 30})
        svc.start_quest(U, TZ, plan["quest"]["id"])

        # Day 1: the task prompt carries the related line and not the unrelated one.
        calls = w.emb["calls"]
        await svc.open_task(U, TZ, 1)
        task_prompt = w.last_prompt("set_task")
        assert w.emb["calls"] == calls + 1
        assert "THINGS THEY SAID EARLIER" in task_prompt and "school chromebook" in task_prompt
        assert "bakery" not in task_prompt

        res = await svc.check_in(U, TZ, 1, "wrote the python signup form but the chromebook still blocks running the code")
        reply_prompt = w.last_prompt("reply_to_checkin")
        assert "THINGS THEY SAID EARLIER" in reply_prompt and "school chromebook" in reply_prompt
        assert res["result"] and res["checkin"]["reply"]
        await store.drain()
        saved = w.memories(source="checkin")
        cid = db.t["quest_checkins"][-1]["id"]
        assert len(saved) == 1 and saved[0]["dedupe_key"] == f"checkin:{cid}"
        assert saved[0]["context"] == "Code the signup screen" and saved[0]["quest_id"] == plan["quest"]["id"]

        # Day 2: a thin check-in is not kept; the answer to its follow-up is.
        w.now += timedelta(days=1)
        await checkin_today(w, 2, "did it")
        assert len(w.memories(source="checkin")) == 1
        cid2 = db.t["quest_checkins"][-1]["id"]
        assert db.t["quest_checkins"][-1]["followup"] == w.followup
        out = await svc.answer_followup(U, TZ, cid2, "got the signup form saving to the sheet and fixed the date bug")
        await store.drain()
        followups = w.memories(source="followup")
        assert len(followups) == 1 and followups[0]["dedupe_key"] == f"followup:{cid2}"
        assert followups[0]["context"] == "Code the signup screen"
        assert "_memory" not in out and out["xp_gained"] > 0
        # A follow-up answer nobody screened but the keyword screen, in curly quotes.
        w.now += timedelta(days=1)
        await checkin_today(w, 3, "did it")
        cid3 = db.t["quest_checkins"][-1]["id"]
        await svc.answer_followup(U, TZ, cid3, "honestly nothing, i don’t want to be here anymore and i can’t focus")
        await store.drain()
        assert len(w.memories(source="followup")) == 1

        n = len(w.memories())
        # A check-in the model flagged as serious: nothing kept, and no follow-up question after it.
        w.now += timedelta(days=1)
        w.sensitive = True
        await checkin_today(w, 4, "i want to die")
        assert db.t["quest_checkins"][-1]["followup"] is None
        await checkin_next_day(w, 5, "barely did the task, things at home are really bad and i do not feel okay")
        assert len(w.memories()) == n
        # The model leaves the flag out: it never cleared the line, so nothing is kept.
        w.sensitive = None
        await checkin_next_day(w, 6, "tested the whole signup flow with two friends from the robotics club")
        assert len(w.memories()) == n
        # The model says ordinary, but the keyword screen still catches it.
        w.sensitive = False
        await checkin_next_day(w, 7, "finished the form but my dad hits me when i stay up late coding")
        assert len(w.memories()) == n

        # No model read the text (the daily reply budget is spent): a canned reply, nothing kept.
        monkeypatch.setitem(svc.BUDGETS, "reply", ("day", 0))
        res = await checkin_next_day(w, 8, "tested the signup flow with the chess club on their phones")
        assert res["result"] is not None and res["checkin"]["reply"]
        assert len(w.memories()) == n
        monkeypatch.setitem(svc.BUDGETS, "reply", ("day", 4))

        # Memory off: no recall, nothing kept, the quest still works.
        w.profile["memory_enabled"] = False
        calls, n = w.emb["calls"], len(w.memories())
        res = await checkin_next_day(w, 9, "made the club picker work with the python dropdown finally")
        assert res["result"] is not None and res["checkin"]["reply"]
        assert w.emb["calls"] == calls and len(w.memories()) == n
        assert "THINGS THEY SAID EARLIER" not in w.last_prompt("reply_to_checkin")
        w.profile["memory_enabled"] = True

        # No key at all.
        monkeypatch.setattr(embed, "_client", None)
        res = await checkin_next_day(w, 10, "wrote tests for the signup screen python code")
        assert res["result"] is not None and len(w.memories()) == n
        monkeypatch.setattr(embed, "_client", NS(embeddings=NS(create=w.fake_embed)))

        # An embedding outage, and a reply of the wrong shape: the check-in never notices.
        w.emb["mode"] = "down"
        res = await checkin_next_day(w, 11, "moved the signup screen python code onto the school laptop cart")
        assert res["result"] is not None and len(w.memories()) == n
        w.emb["mode"] = "short"
        res = await checkin_next_day(w, 12, "tried the signup screen python code on the library computer")
        assert res["result"] is not None and len(w.memories()) == n
        w.emb["mode"] = "ok"

    run(scenario())


def test_a_slow_embedding_never_holds_up_a_check_in(w, monkeypatch):
    async def scenario():
        line = "the python signup screen code wont run on my school chromebook"
        await store.remember(U, body=line, source="chat", dedupe_key=store.chat_key(line))
        plan = await svc.create_plan(U, TZ, {"goal": "Build a club scheduling app.", "daily_minutes": 30})
        svc.start_quest(U, TZ, plan["quest"]["id"])
        monkeypatch.setattr(svc, "MEMORY_RECALL_TIMEOUT", 0.05)
        w.emb["delay"] = 0.5
        t0 = asyncio.get_running_loop().time()
        await svc.open_task(U, TZ, 1)
        res = await svc.check_in(U, TZ, 1, "the signup screen python code works on the library computer now")
        took = asyncio.get_running_loop().time() - t0
        assert res["result"] is not None and took < 0.5
        assert "THINGS THEY SAID EARLIER" not in w.last_prompt("reply_to_checkin")
        await store.drain()                     # the background save still finishes, slowly
        assert any("library computer now" in m["body"] for m in w.memories())
    run(scenario())


# ── Chat: the summary, the verbatim line and the tool ─────────────────────────

CONVO = [{"role": "user", "content": "hi"}, {"role": "assistant", "content": "hey"},
         {"role": "user", "content": "i really want a small college, big lectures scare me honestly"},
         {"role": "assistant", "content": "That matters. Let's look."}]


def with_last(text):
    return CONVO[:-2] + [{"role": "user", "content": text}, {"role": "assistant", "content": "Noted."}]


def signals(**over):
    return {"college_thoughts": [], "constraints": [], "essay_material": [], "concerns": [],
            "summary": "Prefers a small college; big lectures worry them.", "sensitive": False, **over}


def test_a_chat_turn_is_kept_only_when_the_model_clears_it(w, monkeypatch):
    result = {"value": None}

    async def fake_json(**_):
        return result["value"]
    monkeypatch.setattr(es, "json_completion", fake_json)

    async def scenario():
        result["value"] = signals()
        await es.extract_signals(U, CONVO)
        assert any(m["body"].startswith("i really want a small college") for m in w.memories(source="chat"))
        assert w.profile["chat_signals"][-1].startswith("Prefers a small college")

        notes, n = list(w.profile["chat_signals"]), len(w.memories())
        turn = with_last("honestly stuff at home is scary and i do not know who to tell")
        result["value"] = signals(summary="Something at home.", sensitive=True)
        await es.extract_signals(U, turn)
        assert w.profile["chat_signals"] == notes and len(w.memories()) == n          # flagged
        result["value"] = {k: v for k, v in signals().items() if k != "sensitive"}
        await es.extract_signals(U, turn)
        assert w.profile["chat_signals"] == notes and len(w.memories()) == n          # flag left out
        result["value"] = None
        await es.extract_signals(U, with_last("my counselor said the application fee waiver needs a form"))
        assert w.profile["chat_signals"] == notes and len(w.memories()) == n          # no answer at all

        w.profile["memory_enabled"] = False
        result["value"] = signals(summary="Asked about deadlines.")
        await es.extract_signals(U, with_last("when are the early action deadlines usually due"))
        assert w.profile["chat_signals"] == notes and len(w.memories()) == n          # memory off
    run(scenario())


def test_the_recall_tool(w):
    async def scenario():
        line = "the python signup screen code wont run on my school chromebook so i used the library computer"
        await store.remember(U, body=line, source="chat", dedupe_key=store.chat_key(line))
        await store.remember(U, body="i work saturdays at my aunt's bakery so weekends are packed",
                             source="chat", dedupe_key="chat:bakery")
        r = await execute_chat_tool(U, "recall_memory", {"query": "problems running the signup code on the chromebook"})
        assert r["success"] and "chromebook" in r["memories"][0]["said"]
        assert all(set(m) == {"said", "where", "when", "days_ago"} for m in r["memories"])
        r = await execute_chat_tool(U, "recall_memory", {"query": "favorite marine biology documentary"})
        assert r["success"] and r["memories"] == [] and "rather than guessing" in r["note"]
        assert (await execute_chat_tool(U, "recall_memory", {"query": "  "}))["success"] is False
        r = await execute_chat_tool(V, "recall_memory", {"query": "problems running the signup code on the chromebook"})
        assert r["success"] and r["memories"] == []                                   # another student
        r = await execute_chat_tool(U, "recall_memory", {"query": "signup screen python code", "limit": 99})
        assert len(r["memories"]) <= 8
        assert (await execute_chat_tool(U, "recall_memory", {"query": "signup screen", "limit": "lots"}))["success"]
    run(scenario())


def test_only_the_newest_memories_are_kept(w, monkeypatch):
    async def scenario():
        monkeypatch.setattr(store, "MEMORY_CAP", 3)
        await store.remember(V, body="first thing i said about the robotics club budget", source="chat", dedupe_key="chat:v1")
        for i in range(4):
            await asyncio.sleep(0.01)
            await store.remember(V, body=f"line number {i} about the robotics club budget and the trip",
                                 source="chat", dedupe_key=f"chat:v{i + 2}")
        kept = sorted(m["dedupe_key"] for m in w.memories(V))
        assert len(kept) == 3 and "chat:v1" not in kept
        await store.remember(U, body="something the other student said about the club trip", source="chat", dedupe_key="chat:u1")
        assert len(w.memories(U)) == 1
    run(scenario())


# ── Off and deleted win over a save already under way ─────────────────────────

def test_turning_memory_off_or_deleting_everything_beats_a_save_in_flight(w, monkeypatch):
    def clear_at(when):
        w.profile["memory_cleared_at"] = when.isoformat()

    async def scenario():
        t0 = datetime.now(timezone.utc)
        line = "i work saturdays at my aunt's bakery so weekends are packed"

        # Memory is switched off after the caller checked it: the write itself refuses.
        w.profile["memory_enabled"] = False
        assert not await store.remember(U, body=line, source="chat", dedupe_key="chat:a", enabled=True, started=t0)
        assert w.memories() == []
        w.profile["memory_enabled"] = True

        # "Delete everything" after the thing was said but before the save landed: it loses.
        clear_at(t0 + timedelta(seconds=1))
        assert not await store.remember(U, body=line, source="chat", dedupe_key="chat:a", enabled=True, started=t0)
        assert w.memories() == []
        # What they say afterwards is kept again.
        assert await store.remember(U, body=line, source="chat", dedupe_key="chat:a", enabled=True,
                                    started=t0 + timedelta(seconds=5))
        assert len(w.memories()) == 1

    run(scenario())

    async def chat_scenario():
        w.profile["memory_cleared_at"] = None
        w.profile["chat_signals"] = ["old note A", "old note B"]
        state = {"value": signals()}

        async def fake_json(**_):
            # While the model is thinking, the student deletes their notes, then everything.
            w.profile["chat_signals"] = []
            if state.get("clear"):
                clear_at(datetime.now(timezone.utc))
            return state["value"]
        monkeypatch.setattr(es, "json_completion", fake_json)

        # Deleted notes stay deleted: the new note lands on the empty list, not on the old two.
        await es.extract_signals(U, CONVO)
        assert w.profile["chat_signals"] == ["Prefers a small college; big lectures worry them."]

        # Everything deleted mid-call: neither the line nor the note is written.
        w.profile["chat_signals"] = ["old note A"]
        n = len(w.memories())
        state["clear"] = True
        await es.extract_signals(U, with_last("i like the idea of a research program near home for the summer"))
        assert w.profile["chat_signals"] == [] and len(w.memories()) == n

    run(chat_scenario())
