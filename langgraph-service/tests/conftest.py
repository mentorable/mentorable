import sys
from types import SimpleNamespace as NS

import pytest

from tests.memory_world import REAL_SLEEP, World  # noqa: E402  (first: it stubs the Supabase client)

import app.llm as llm  # noqa: E402
from app.nodes.quest import service as svc  # noqa: E402
from app.nodes.recall import embed  # noqa: E402


@pytest.fixture
def w(monkeypatch):
    """A fresh World, patched into every app module that talks to Supabase, the
    model, the embedder or the Quest clock. Undone after each test."""
    world = World()
    for name, mod in list(sys.modules.items()):
        if name.startswith("app.") and getattr(mod, "get_supabase", None) is not None:
            monkeypatch.setattr(mod, "get_supabase", lambda: world.db)
    monkeypatch.setattr(llm, "_anthropic", NS(messages=NS(create=world.fake_create)))

    async def fast(*_a, **_k):
        await REAL_SLEEP(0)
    monkeypatch.setattr(llm.asyncio, "sleep", fast)          # the retry back-offs; restored after the test
    monkeypatch.setattr(svc, "_now", lambda: world.now)
    monkeypatch.setattr(embed, "_client", NS(embeddings=NS(create=world.fake_embed)))
    return world
