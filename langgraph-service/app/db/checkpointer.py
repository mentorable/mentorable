from contextlib import asynccontextmanager
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from app.config import DATABASE_URL

# Module-level checkpointer — initialised once on startup via lifespan.
checkpointer: AsyncPostgresSaver | None = None


@asynccontextmanager
async def lifespan_checkpointer():
    """
    Async context manager used in FastAPI lifespan.
    Creates the AsyncPostgresSaver, runs .setup() to create LangGraph
    checkpoint tables if they don't exist, then yields.
    """
    global checkpointer
    async with AsyncPostgresSaver.from_conn_string(DATABASE_URL) as saver:
        await saver.setup()  # idempotent — creates tables on first run
        checkpointer = saver
        yield
    checkpointer = None


def get_checkpointer() -> AsyncPostgresSaver:
    if checkpointer is None:
        raise RuntimeError("Checkpointer not initialised — lifespan not running")
    return checkpointer
