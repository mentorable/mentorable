"""
Embeddings for long-term memory: OpenAI text-embedding-3-small.

The only provider call memory makes. Without OPENAI_API_KEY, or when the call
fails, embed() returns None and memory quietly does nothing: nothing is saved,
nothing is recalled, and everything else works exactly as before. That is the
same rule app/llm.py follows for its OpenAI routing.
"""
import logging
from typing import Optional

from app.config import OPENAI_API_KEY
from app.models import MEMORY_EMBED_DIMS, MEMORY_EMBED_MODEL

logger = logging.getLogger(__name__)

_client = None
if OPENAI_API_KEY:
    try:
        from openai import AsyncOpenAI
        # Short timeout, one retry: a slow embedding must never hold up a
        # check-in reply or a chat turn for long, and a miss only costs a memory.
        _client = AsyncOpenAI(api_key=OPENAI_API_KEY, timeout=8.0, max_retries=1)
    except Exception as exc:  # SDK missing or client construction failed
        logger.warning(f"[memory] OpenAI client unavailable, memory is off: {exc}")

BATCH = 96              # inputs per request (the API allows far more; this keeps requests small)
MAX_INPUT_CHARS = 2000  # a memory is at most 500 characters plus a short context


def enabled() -> bool:
    """Whether memory can work at all (an OpenAI key and a client)."""
    return _client is not None


def model_label() -> str:
    """What each row records as the model that made its vector."""
    return f"{MEMORY_EMBED_MODEL}@{MEMORY_EMBED_DIMS}"


def _clean(text) -> str:
    return " ".join(str(text or "").split())[:MAX_INPUT_CHARS]


async def embed(texts: list[str]) -> Optional[list[list[float]]]:
    """One vector per text, in order. None when memory is off or anything fails."""
    if _client is None:
        return None
    if not texts:
        return []
    cleaned = [_clean(t) or "." for t in texts]
    vectors: list[list[float]] = []
    try:
        for start in range(0, len(cleaned), BATCH):
            chunk = cleaned[start:start + BATCH]
            res = await _client.embeddings.create(model=MEMORY_EMBED_MODEL, input=chunk,
                                                  dimensions=MEMORY_EMBED_DIMS)
            got = [d.embedding for d in sorted(res.data, key=lambda d: d.index)]
            if len(got) != len(chunk) or any(len(v) != MEMORY_EMBED_DIMS for v in got):
                logger.warning(f"[memory] embedding reply had the wrong shape ({len(got)} for {len(chunk)})")
                return None
            vectors.extend(got)
    except Exception as exc:
        logger.warning(f"[memory] embedding failed: {exc}")
        return None
    return vectors


async def embed_one(text) -> Optional[list[float]]:
    vectors = await embed([text])
    return vectors[0] if vectors else None
