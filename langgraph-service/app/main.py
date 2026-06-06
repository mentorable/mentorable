import asyncio
import json
import logging
from contextlib import asynccontextmanager
from typing import Any

from anthropic import AsyncAnthropic
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

from app.auth import verify_jwt
from app.config import ANTHROPIC_API_KEY, CORS_ORIGIN
from app.db.checkpointer import get_checkpointer, lifespan_checkpointer, checkpointer_status
from app.db.supabase import get_supabase
from app.graphs.chat import create_chat_graph
from app.nodes.chat.extract_signals import extract_signals
from app.rate_limit import check_rate_limit

logger = logging.getLogger(__name__)

_anthropic = AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
chat_graph = None  # initialised in lifespan


@asynccontextmanager
async def lifespan(app: FastAPI):
    global chat_graph
    async with lifespan_checkpointer():
        cp = get_checkpointer()
        if cp is not None:
            chat_graph = create_chat_graph(cp)
            logger.info("Chat graph initialised")
        else:
            logger.warning("Chat graph NOT initialised — checkpointer unavailable")
        yield
    chat_graph = None


app = FastAPI(
    title="Mentorable LangGraph Service",
    description="Agentic backend for Mentorable — chat, research, quest graphs",
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[CORS_ORIGIN] if CORS_ORIGIN != "*" else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health ─────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "mentorable-langgraph",
        "version": "0.2.0",
        "checkpointer": checkpointer_status(),
        "chat_graph": "ready" if chat_graph is not None else "unavailable",
    }


# ── Profile probe ──────────────────────────────────────────────────────────────

@app.get("/profile")
async def get_profile(user_id: str = Depends(verify_jwt)):
    supabase = get_supabase()
    result = (
        supabase.from_("profiles")
        .select("id, full_name, grade_level, education_level, onboarding_completed, career_matches")
        .eq("id", user_id)
        .maybe_single()
        .execute()
    )
    if result.data is None:
        return JSONResponse(status_code=404, content={"error": "Profile not found", "user_id": user_id})
    return result.data


# ── Chat ───────────────────────────────────────────────────────────────────────

class Message(BaseModel):
    role: str    # "user" | "ai" | "assistant"
    content: str

class ChatRequest(BaseModel):
    messages: list[Message]


@app.post("/chat")
async def chat(request: ChatRequest, user_id: str = Depends(verify_jwt)):
    if chat_graph is None:
        raise HTTPException(status_code=503, detail="Chat graph unavailable — checkpointer not connected")

    # Rate limit check
    await check_rate_limit(user_id, "chat")

    # Normalise messages: merge consecutive same-role, map "ai" → "assistant"
    raw = [m for m in request.messages if m.content and m.content.strip()]
    normalized: list[dict] = []
    for m in raw:
        role = "assistant" if m.role in ("ai", "assistant") else "user"
        content = m.content.strip()
        if normalized and normalized[-1]["role"] == role:
            normalized[-1]["content"] += "\n\n" + content
        else:
            normalized.append({"role": role, "content": content})

    if not normalized or normalized[0]["role"] != "user":
        raise HTTPException(status_code=400, detail="Messages must start with a user message")

    # Run load_context + build_prompt through the graph (checkpointed)
    config = {"configurable": {"thread_id": f"{user_id}_chat"}}
    state = await chat_graph.ainvoke({"user_id": user_id}, config=config)
    system_prompt: str = state.get("_system_prompt", "")

    if not system_prompt:
        raise HTTPException(status_code=500, detail="Failed to build system prompt")

    async def generate():
        full_text = ""
        try:
            async with _anthropic.messages.stream(
                model="claude-sonnet-4-6",
                max_tokens=2048,
                system=system_prompt,
                messages=normalized,
            ) as stream:
                async for text in stream.text_stream:
                    full_text += text
                    yield f"data: {json.dumps({'text': text})}\n\n"

            yield "data: [DONE]\n\n"

            # Fire-and-forget signal extraction after streaming completes
            all_messages = normalized + [{"role": "assistant", "content": full_text}]
            asyncio.create_task(extract_signals(user_id, all_messages))

        except Exception as exc:
            logger.error(f"[chat] stream error for {user_id}: {exc}")
            yield f"data: {json.dumps({'error': 'Stream failed'})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ── Placeholder routes (Sprint 3–5) ───────────────────────────────────────────

@app.post("/research")
async def research_placeholder(user_id: str = Depends(verify_jwt)):
    return {"error": "Not implemented yet — Sprint 3", "user_id": user_id}


@app.post("/quests/generate")
async def quest_placeholder(user_id: str = Depends(verify_jwt)):
    return {"error": "Not implemented yet — Sprint 4", "user_id": user_id}


@app.post("/onboarding/extract")
async def onboarding_placeholder(user_id: str = Depends(verify_jwt)):
    return {"error": "Not implemented yet — Sprint 5", "user_id": user_id}
