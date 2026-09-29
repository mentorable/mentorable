"""
The shared world for the memory flow tests: an in-memory database
(tests/fakedb.py), a scripted model, a fake embedder that maps texts sharing
words to nearby vectors, and a clock the Quest service reads. The `w` fixture
in conftest.py builds one per test and patches it into the app.
"""
import asyncio
import hashlib
import math
import os
import sys
import types
from datetime import datetime, timezone
from types import SimpleNamespace as NS

for _k in ("SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "ANTHROPIC_API_KEY",
           "DATABASE_URL", "CORS_ORIGIN"):
    os.environ.setdefault(_k, "stub")
_stub = types.ModuleType("app.db.supabase")
_stub.get_supabase = lambda: None
sys.modules.setdefault("app.db.supabase", _stub)

from tests.fakedb import FakeDB, crude_lexemes  # noqa: E402

START = datetime(2026, 9, 21, 16, 0, tzinfo=timezone.utc)
U, V, TZ = "11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222", "America/New_York"
REAL_SLEEP = asyncio.sleep


def fake_vector(text):
    """Hashed bag of word stems: texts that share words are close."""
    v = [0.0] * 1536
    for w in crude_lexemes(text):
        v[int(hashlib.sha1(w.encode()).hexdigest()[:8], 16) % 1536] += 1.0
    n = math.sqrt(sum(x * x for x in v)) or 1.0
    return [x / n for x in v]


class World:
    """The fake database, the scripted model, the fake embedder and the clock."""

    def __init__(self):
        self.db = FakeDB()
        self.now = START
        self.prompts = []            # (tool name, prompt) for every scripted model call
        self.sensitive = False       # what the check-in reply says about the line (None: leaves it out)
        self.followup = "Which part did you get working?"
        self.emb = {"calls": 0, "mode": "ok", "delay": 0.0}
        for uid in (U, V):
            self.db.t["profiles"].append({
                "id": uid, "full_name": "Ada", "grade_level": 11, "timezone": None, "narrative": {},
                "candidate_majors": [], "target_colleges": [], "quest_suggestions": [],
                "quest_suggestions_key": None, "memory_enabled": True, "chat_signals": []})

    @property
    def profile(self):
        return self.db.t["profiles"][0]

    def memories(self, uid=U, **match):
        return [m for m in self.db.t["student_memories"]
                if m["user_id"] == uid and all(m.get(k) == v for k, v in match.items())]

    def last_prompt(self, name):
        return [p for n, p in self.prompts if n == name][-1]

    async def fake_create(self, **kw):
        name = kw["tools"][0]["name"]
        prompt = kw["messages"][0]["content"]
        self.prompts.append((name, prompt))
        if name == "save_quest_plan":
            inp = {"title": "Club scheduler app", "summary": "An app clubs use.", "goal_kind": "passion_project",
                   "direction": "An app three clubs use by spring.",
                   "milestones": [{"title": "Build the signup screen", "description": "Write the python code for it.", "days": 4},
                                  {"title": "Test with a club", "description": "Get one club to try it.", "days": 4},
                                  {"title": "Polish", "description": "Fix what they found.", "days": 4}]}
        elif name == "set_task":
            inp = {"title": "Code the signup screen", "detail": "The form and its checks.", "minutes": 25}
        elif name == "reply_to_checkin":
            body = prompt.split('"""')[1] if '"""' in prompt else ""
            thin = len(body.split()) < 6
            inp = {"reply": "Nice, that is real progress.", "thin": thin, "followup": self.followup if thin else ""}
            if self.sensitive is not None:
                inp["sensitive"] = self.sensitive
        else:
            raise AssertionError(name)
        return NS(stop_reason="tool_use", content=[NS(type="tool_use", name=name, input=inp)])

    async def fake_embed(self, model, input, dimensions):
        self.emb["calls"] += 1
        assert model == "text-embedding-3-small" and dimensions == 1536
        if self.emb["delay"]:
            await REAL_SLEEP(self.emb["delay"])
        if self.emb["mode"] == "down":
            raise RuntimeError("openai is down")
        if self.emb["mode"] == "short":
            return NS(data=[NS(embedding=[0.1] * 10, index=i) for i, _ in enumerate(input)])
        return NS(data=[NS(embedding=fake_vector(t), index=i) for i, t in enumerate(input)])
