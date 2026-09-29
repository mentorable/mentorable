"""
scripts/backfill_memories.py: the one-off import of what students said before
memory existed. It has no model check, so these tests pin the rules that keep it
safe: nothing from after the ship date, nothing the advisor treated as a crisis,
nothing the wider keyword screen doubts, and no student imported twice (which is
also what stops a deleted memory coming back). Run from langgraph-service/:

    python3 -m pytest tests/
"""
import contextlib
import io
import os
import runpy
import sys

import pytest

from app.nodes.recall import embed

SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "scripts", "backfill_memories.py")
U, V, W = "u-1", "v-1", "w-1"
OLD = "2026-09-24T06:11:05+00:00"


def run_script(*argv):
    sys.argv = ["backfill_memories.py", *argv]
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        try:
            runpy.run_path(SCRIPT, run_name="__main__")
        except SystemExit as exc:
            print(f"exit: {exc}")
    return out.getvalue()


def checkin(cid, task, body, when=OLD, uid=U, reply="", followup=None, answer=None):
    return {"id": cid, "user_id": uid, "quest_id": "q1", "task_id": task, "body": body, "advisor_reply": reply,
            "followup": followup, "followup_answer": answer, "created_at": when}


def session(sid, uid, when, *messages):
    return {"id": sid, "user_id": uid, "created_at": when, "messages": [
        {"role": role, "content": text, "created_at": when} for role, text in messages]}


@pytest.fixture
def world(w):
    db = w.db
    db.t["profiles"] = [{"id": U, "memory_enabled": True, "memory_backfilled_at": None},
                        {"id": V, "memory_enabled": False, "memory_backfilled_at": None},
                        {"id": W, "memory_enabled": True, "memory_backfilled_at": "2026-09-29T10:00:00+00:00"}]
    db.t["quest_tasks"] += [{"id": f"t{i}", "user_id": U, "quest_id": "q1", "slot": i, "title": title} for i, title in
                            enumerate(["Clean the county dataset", "Map the results", "Email the council",
                                       "Draft the report", "Test the app", "Write the summary", "Plan the demo"], 1)]
    db.t["quest_checkins"] += [
        checkin("c1", "t1", "found two schools missing from the county data today"),
        checkin("c2", "t2", "did it", followup="What does the map show?",
                answer="the east side has way more lead readings than the west"),
        checkin("c3", "t3", "sent it but my dad hits me when i am on the laptop late"),
        checkin("c4", "t4", "wrote the first page of the council report tonight", when="2026-09-29T08:00:00+00:00"),
        checkin("c5", "t9", "someone with memory off wrote a long line here", uid=V),
        # nothing in the words, but the advisor's reply is the crisis hand-off
        checkin("c6", "t5", "everything with my family is a lot right now and i barely did the task today",
                reply="That sounds heavy. Please talk to a trusted adult, or call or text 988 if you are in crisis."),
        checkin("c7", "t6", "honestly everything is falling apart right now and school is a mess"),
    ]
    db.t["chat_sessions"] += [
        session("s1", U, "2026-07-23T03:21:29+00:00", ("user", "hi"),
                ("assistant", "Hello! What's on your mind about applications today?"),
                ("user", "i work saturdays at my aunt's bakery so weekends are hard"),
                ("user", "i work saturdays at my aunt's bakery so weekends are hard"),
                ("user", "i have been so depressed about the whole process lately")),
        session("s2", U, "2026-09-29T09:00:00+00:00",
                ("user", "this line came after memory shipped so it is live territory")),
        session("s3", W, "2026-08-01T00:00:00+00:00", ("user", "a student who already cleared everything said this")),
        session("s4", U, "2026-08-02T00:00:00+00:00",
                ("user", "i am not sure which of these two schools has the better engineering program"),
                ("assistant", "If anything you said feels heavier than applications, please talk to a trusted adult."),
                ("user", "thanks that is a lot to think about for the essay this month")),
    ]
    return w


def test_a_dry_run_reports_and_writes_nothing(world):
    out = run_script("--dry-run")
    assert not world.db.t["student_memories"] and world.emb["calls"] == 0
    assert "1 student(s)" in out and U in out and V not in out and W not in out
    assert "3 to keep (1 check-ins, 1 follow-ups, 1 chat lines)" in out and "crisis hand-offs skipped whole" in out


def test_the_import_keeps_only_what_is_safe_and_old_enough(world):
    run_script()
    kept = {m["dedupe_key"]: m for m in world.db.t["student_memories"]}
    chat = [m for m in kept.values() if m["source"] == "chat"]
    assert set(kept) - {m["dedupe_key"] for m in chat} == {"checkin:c1", "followup:c2"}
    assert len(chat) == 1 and "bakery" in chat[0]["body"] and chat[0]["created_at"].startswith("2026-07-23")
    assert kept["checkin:c1"]["created_at"].startswith("2026-09-24T06:11:05")            # their own day
    assert kept["checkin:c1"]["context"] == "Clean the county dataset" and kept["checkin:c1"]["quest_id"] == "q1"
    assert kept["followup:c2"]["context"] == "Map the results"
    assert world.emb["calls"] == 1                                                        # one batch
    text = " ".join(m["body"] for m in kept.values())
    for left_out in ("did it", "dad hits me", "depressed", "first page", "live territory", "memory off",
                     "cleared everything", "a lot right now", "falling apart", "engineering program", "essay this month"):
        assert left_out not in text, left_out
    assert world.db.t["profiles"][0]["memory_backfilled_at"]
    assert world.db.t["profiles"][1]["memory_backfilled_at"] is None
    assert world.db.t["profiles"][2]["memory_backfilled_at"] == "2026-09-29T10:00:00+00:00"


def test_a_student_is_never_imported_twice_so_deleted_memories_stay_deleted(world):
    run_script()
    n, calls = len(world.db.t["student_memories"]), world.emb["calls"]
    world.db.t["student_memories"] = [m for m in world.db.t["student_memories"] if m["dedupe_key"] != "checkin:c1"]
    out = run_script()
    assert "0 student(s)" in out and len(world.db.t["student_memories"]) == n - 1 and world.emb["calls"] == calls


def test_the_cutoff_cannot_move_later_and_a_key_is_needed(world, monkeypatch):
    out = run_script("--before", "2026-10-05T00:00:00+00:00")
    assert "must be a time no later than" in out and not world.db.t["student_memories"]
    monkeypatch.setattr(embed, "_client", None)
    assert "OPENAI_API_KEY is not set" in run_script()
    assert "1 student(s)" in run_script("--dry-run")           # a preview needs no key
