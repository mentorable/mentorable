import logging
from contextlib import asynccontextmanager
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from app.config import DATABASE_URL

logger = logging.getLogger(__name__)

# Module-level checkpointer — initialised once on startup via lifespan.
checkpointer: AsyncPostgresSaver | None = None
checkpointer_error: str | None = None


@asynccontextmanager
async def lifespan_checkpointer():
    """
    Async context manager used in FastAPI lifespan.
    Fails gracefully — if the DB is unreachable, logs the error and
    lets the app start anyway. Health + profile endpoints work without it.
    Graph endpoints will return 503 until the checkpointer is available.
    """
    global checkpointer, checkpointer_error
    try:
        async with AsyncPostgresSaver.from_conn_string(DATABASE_URL) as saver:
            await saver.setup()  # idempotent — creates checkpoint tables
            checkpointer = saver
            logger.info("Checkpointer initialised successfully")
            yield
        checkpointer = None
    except Exception as exc:
        checkpointer_error = str(exc)
        logger.error(f"Checkpointer failed to initialise: {exc}")
        logger.error("Graph endpoints will be unavailable. Fix DATABASE_URL and redeploy.")
        yield  # let the app start — health/profile still work


def get_checkpointer() -> AsyncPostgresSaver:
    if checkpointer is None:
        detail = f"Checkpointer unavailable: {checkpointer_error}" if checkpointer_error else "Checkpointer not initialised"
        raise RuntimeError(detail)
    return checkpointer


def checkpointer_status() -> dict:
    if checkpointer is not None:
        return {"status": "ok"}
    return {"status": "error", "detail": checkpointer_error or "not initialised"}
