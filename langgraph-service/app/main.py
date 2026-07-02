import asyncio
import json
import logging
from contextlib import asynccontextmanager
from typing import Any

from anthropic import AsyncAnthropic
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

from app.auth import verify_jwt
from app.config import ANTHROPIC_API_KEY, CORS_ORIGIN
from app.db.checkpointer import get_checkpointer, lifespan_checkpointer, checkpointer_status
from app.db.supabase import get_supabase
from app.graphs.chat import create_chat_graph
from app.nodes.chat.extract_signals import extract_signals
from app.nodes.chat.tools import CHAT_TOOLS, execute_chat_tool
from app.nodes.onboarding.extract import extract_profile
from app.nodes.quest.generate import generate_quest_items
from app.nodes.scorecard.improve import improve_axis
from app.nodes.research.run import run_research
from app.nodes.roadmap.generate import generate_roadmap
from app.nodes.roadmap.phase import generate_phase
from app.nodes.roadmap.reflect import reflect_on_phase
from app.nodes.roadmap.expand import expand_node
from app.nodes.roadmap.intake import generate_intake_questions
from app.rate_limit import check_rate_limit, refund_usage
from app.scoring import award_axis

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

_cors_origins = ["*"] if CORS_ORIGIN == "*" else [o.strip() for o in CORS_ORIGIN.split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
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
        conversation: list[dict] = list(normalized)
        final_text = ""
        try:
            # Tool-use loop: stream text, and if the model calls a tool, run it,
            # feed the result back, and continue so it can confirm to the student.
            while True:
                turn_text = ""
                async with _anthropic.messages.stream(
                    model="claude-sonnet-4-6",
                    max_tokens=2048,
                    # Cache the tools+system prefix: it's stable across a session's messages,
                    # so messages 2..N pay ~10% on the prefix instead of full price (demo cost).
                    system=[{
                        "type": "text",
                        "text": system_prompt,
                        "cache_control": {"type": "ephemeral"},
                    }],
                    messages=conversation,
                    tools=CHAT_TOOLS,
                ) as stream:
                    async for text in stream.text_stream:
                        turn_text += text
                        yield f"data: {json.dumps({'text': text})}\n\n"
                    final_message = await stream.get_final_message()

                final_text = turn_text

                if final_message.stop_reason != "tool_use":
                    break

                # Record the assistant turn (text + tool_use blocks) verbatim.
                conversation.append({"role": "assistant", "content": final_message.content})

                tool_results = []
                for block in final_message.content:
                    if getattr(block, "type", None) != "tool_use":
                        continue
                    result = await execute_chat_tool(user_id, block.name, dict(block.input))
                    if result.get("success"):
                        yield f"data: {json.dumps({'event': 'quest_added', 'quest': result})}\n\n"
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": json.dumps(result),
                    })
                conversation.append({"role": "user", "content": tool_results})
                # loop again for the model's natural-language confirmation

            yield "data: [DONE]\n\n"

            # Fire-and-forget signal extraction. Pass a clean text-only transcript.
            transcript = normalized + [{"role": "assistant", "content": final_text}]
            asyncio.create_task(extract_signals(user_id, transcript))

            # Scorecard: a substantive message builds Communication (background).
            last_user = next((m["content"] for m in reversed(normalized) if m["role"] == "user"), "")
            if len(last_user.strip()) >= 60:
                asyncio.create_task(award_axis(user_id, "communication", 2, "Engaged in chat", "chat"))

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


@app.post("/research")
async def research(raw: Request, user_id: str = Depends(verify_jwt)):
    try:
        body = await raw.json()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid JSON: {exc}")

    query      = (body.get("query") or "").strip()
    session_id = (body.get("session_id") or body.get("sessionId") or "").strip()
    logger.info(f"[research] keys={list(body.keys())} query={query!r} session_id={session_id!r}")

    if not query:
        raise HTTPException(status_code=400, detail="Query is required")
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id is required")

    await check_rate_limit(user_id, "research")

    try:
        result = await run_research(user_id, query, session_id)
        return result
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        logger.error(f"[research] Unexpected error for {user_id}: {exc}")
        raise HTTPException(status_code=500, detail="Research failed")


@app.post("/quests/generate")
async def quests_generate(raw: Request, user_id: str = Depends(verify_jwt)):
    try:
        body = await raw.json()
    except Exception:
        body = {}

    count = int(body.get("count") or 3)
    count = max(1, min(count, 5))

    await check_rate_limit(user_id, "quest_gen")

    try:
        result = await generate_quest_items(user_id, count)
        return result
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        logger.error(f"[quest_gen] Unexpected error for {user_id}: {exc}")
        raise HTTPException(status_code=500, detail="Quest generation failed")


@app.post("/scorecard/improve")
async def scorecard_improve(raw: Request, user_id: str = Depends(verify_jwt)):
    try:
        body = await raw.json()
    except Exception:
        body = {}
    axis = (body.get("axis") or "").strip().lower()
    if not axis:
        raise HTTPException(status_code=400, detail="axis is required")

    await check_rate_limit(user_id, "axis_boost")

    try:
        return await improve_axis(user_id, axis)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        logger.error(f"[scorecard] improve error for {user_id}: {exc}")
        raise HTTPException(status_code=500, detail="Could not generate suggestions")


@app.post("/roadmap/intake")
async def roadmap_intake(raw: Request, user_id: str = Depends(verify_jwt)):
    """Free Haiku pre-questionnaire — up to 3 gap-only questions. Not rate-limited."""
    try:
        body = await raw.json()
    except Exception:
        body = {}
    goal = (body.get("goal") or "").strip()
    if not goal:
        raise HTTPException(status_code=400, detail="goal is required")
    end_month = (body.get("end_month") or "").strip() or None
    try:
        return await generate_intake_questions(user_id, goal, end_month)
    except Exception as exc:
        logger.error(f"[roadmap] intake error for {user_id}: {exc}")
        return {"questions": []}  # never block the flow on intake


@app.post("/roadmap/generate")
async def roadmap_generate(raw: Request, user_id: str = Depends(verify_jwt)):
    try:
        body = await raw.json()
    except Exception:
        body = {}
    goal = (body.get("goal") or "").strip()
    if not goal:
        raise HTTPException(status_code=400, detail="goal is required")

    # End-month picker: derive timeframe_months from the month the user wants to end on
    # (floor 3, ceil 24). Falls back to an explicit timeframe_months, else lets the model infer.
    end_month = (body.get("end_month") or "").strip() or None
    tf = body.get("timeframe_months")
    try:
        tf = int(tf) if tf is not None else None
    except (TypeError, ValueError):
        tf = None
    if end_month:
        try:
            from datetime import date as _date
            y, m, _ = end_month.split("-")
            today = _date.today()
            diff = (int(y) - today.year) * 12 + (int(m) - today.month)
            tf = max(3, min(24, diff))
        except Exception:
            pass  # malformed end_month → fall back to tf / inference

    intake_answers = body.get("intake_answers")
    if not isinstance(intake_answers, dict):
        intake_answers = None

    await check_rate_limit(user_id, "roadmap_gen")

    try:
        return await generate_roadmap(user_id, goal, tf, end_month=end_month, intake_answers=intake_answers)
    except ValueError as exc:
        await refund_usage(user_id, "roadmap_gen")  # don't burn the 1/lifetime gen on a soft failure
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        await refund_usage(user_id, "roadmap_gen")
        logger.error(f"[roadmap] generate error for {user_id}: {exc}")
        raise HTTPException(status_code=500, detail="Could not generate roadmap")


@app.post("/roadmap/node/expand")
async def roadmap_node_expand(raw: Request, user_id: str = Depends(verify_jwt)):
    try:
        body = await raw.json()
    except Exception:
        body = {}
    node_id = (body.get("node_id") or "").strip()
    if not node_id:
        raise HTTPException(status_code=400, detail="node_id is required")

    supabase = get_supabase()
    existing = (
        supabase.from_("roadmap_nodes").select("id, references")
        .eq("id", node_id).eq("user_id", user_id).maybe_single().execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Node not found")

    # Re-opening an already-expanded node is free (no AI call, no charge). Attach its tasks.
    if existing.data.get("references"):
        full = (
            supabase.from_("roadmap_nodes").select("*")
            .eq("id", node_id).eq("user_id", user_id).maybe_single().execute()
        )
        node = full.data
        if node:
            tasks = (
                supabase.from_("roadmap_tasks").select("*")
                .eq("node_id", node_id).order("order_index").execute()
            ).data or []
            node["tasks"] = tasks
        return node

    await check_rate_limit(user_id, "node_expand")

    try:
        return await expand_node(user_id, node_id)
    except ValueError as exc:
        await refund_usage(user_id, "node_expand")
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        await refund_usage(user_id, "node_expand")
        logger.error(f"[roadmap] expand error for {user_id}: {exc}")
        raise HTTPException(status_code=500, detail="Could not load resources")


@app.post("/roadmap/phase/generate")
async def roadmap_phase_generate(raw: Request, user_id: str = Depends(verify_jwt)):
    """Materialize one phase's nodes (Opus). Rate-limited: phase_gen (5/lifetime)."""
    try:
        body = await raw.json()
    except Exception:
        body = {}
    roadmap_id = (body.get("roadmap_id") or "").strip()
    if not roadmap_id:
        raise HTTPException(status_code=400, detail="roadmap_id is required")
    try:
        phase_index = int(body.get("phase_index"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="phase_index is required")

    await check_rate_limit(user_id, "phase_gen")

    try:
        return await generate_phase(user_id, roadmap_id, phase_index)
    except ValueError as exc:
        await refund_usage(user_id, "phase_gen")  # soft failure shouldn't burn a phase gen
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        await refund_usage(user_id, "phase_gen")
        logger.error(f"[roadmap] phase generate error for {user_id}: {exc}")
        raise HTTPException(status_code=500, detail="Could not generate phase")


@app.post("/roadmap/phase/complete")
async def roadmap_phase_complete(raw: Request, user_id: str = Depends(verify_jwt)):
    """Score the post-phase reflection + mark the phase completed. Free (not rate-limited)."""
    try:
        body = await raw.json()
    except Exception:
        body = {}
    roadmap_id = (body.get("roadmap_id") or "").strip()
    if not roadmap_id:
        raise HTTPException(status_code=400, detail="roadmap_id is required")
    try:
        phase_index = int(body.get("phase_index"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="phase_index is required")
    reflection_text = (body.get("reflection_text") or "").strip()

    try:
        return await reflect_on_phase(user_id, roadmap_id, phase_index, reflection_text)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        logger.error(f"[roadmap] phase complete error for {user_id}: {exc}")
        raise HTTPException(status_code=500, detail="Could not complete phase")


@app.post("/onboarding/extract")
async def onboarding_extract(raw: Request, user_id: str = Depends(verify_jwt)):
    try:
        body = await raw.json()
    except Exception:
        body = {}

    transcript = (body.get("transcript") or "").strip()
    force = bool(body.get("force"))
    # user_id comes from the verified JWT — body userId (if any) is ignored for safety.

    try:
        return await extract_profile(user_id, transcript, force=force)
    except Exception as exc:
        logger.error(f"[onboarding] Unexpected error for {user_id}: {exc}")
        raise HTTPException(status_code=500, detail="Profile extraction failed")
