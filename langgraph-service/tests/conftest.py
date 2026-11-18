import sys
from types import SimpleNamespace as NS

import pytest

from tests.memory_world import World  # noqa: E402  (first: it stubs the Supabase client)

import app.costs as costs  # noqa: E402
import app.llm as llm  # noqa: E402
from app.nodes.quest import service as svc  # noqa: E402
from app.nodes.recall import embed  # noqa: E402


@pytest.fixture(autouse=True)
def _no_cost_ledger(monkeypatch):
    """Tests price and log calls as usual but never write ledger rows."""
    monkeypatch.setattr(costs, "_queue", lambda row: None)


@pytest.fixture
def w(monkeypatch):
    """A fresh World, patched into every app module that talks to Supabase, the
    model, the embedder or the Quest clock. Undone after each test."""
    world = World()
    for name, mod in list(sys.modules.items()):
        if name.startswith("app.") and getattr(mod, "get_supabase", None) is not None:
            monkeypatch.setattr(mod, "get_supabase", lambda: world.db)
    monkeypatch.setattr(llm, "_anthropic", NS(messages=NS(create=world.fake_create)))

    monkeypatch.setattr(svc, "_now", lambda: world.now)
    monkeypatch.setattr(embed, "_client", NS(embeddings=NS(create=world.fake_embed)))
    return world
