import asyncio
import json
import logging
import uuid
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response, StreamingResponse
from pydantic import BaseModel

from app import costs
from app.auth import verify_jwt
from app.config import CORS_ORIGIN, PARKED_ROUTES_ENABLED
from app import llm
from app.llm import _anthropic
from app.posthog_client import posthog_client
from app.db.supabase import get_supabase
from app.graphs.chat import create_chat_graph
from app.models import CHAT_DEFAULT, CHAT_MODELS, INTERVIEW_MODEL
from app.nodes.chat.extract_signals import extract_signals
from app.nodes.chat.tools import execute_chat_tool, WRITE_TOOLS, QUEST_WRITE_TOOLS, TOOL_VERB, tools_for
from app.nodes.recall.store import spawn
from app.nodes.agents.interview import elevenlabs
from app.nodes.onboarding import budget as onboarding_budget
from app.nodes.onboarding.intake import (
    INTERVIEW_SYSTEM,
    commit_intake,
    extract_intake,
    load_student_record,
    render_record_context,
)
from app.nodes.portfolio.extract import extract_file_text, extract_portfolio_items
from app.nodes.portfolio.resume import PdfEngineUnavailable, build_resume_tex, compile_tex_to_pdf
from app.nodes.scorecard.improve import improve_axis
from app.nodes.research.run import run_research
from app.nodes.roadmap.generate import generate_roadmap
from app.nodes.roadmap.phase import generate_phase
from app.nodes.roadmap.reflect import reflect_on_phase
from app.nodes.roadmap.expand import expand_node
from app.nodes.roadmap.intake import generate_intake_questions
from app.rate_limit import check_rate_limit, refund_usage
from app.routers.agents import router as agents_router
from app.routers.counselor import router as counselor_router
from app.routers.quest import router as quest_router

logger = logging.getLogger(__name__)

# Put between an assistant turn that called a tool and the turn that follows it,
# so the two do not run together in the client's rendered text. A blank line
# rather than a space, because the model treats each turn as its own paragraph.
TURN_SEPARATOR = "\n\n"
chat_graph = create_chat_graph()


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    posthog_client.flush()


app = FastAPI(
    title="Mentorable LangGraph Service",
    description="Agentic backend for Mentorable: the advisor chat, onboarding, portfolio, Quest and the Agents",
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

# Quest: the daily streak loop. Its endpoints live in their own router because
# this file was already long enough to hide a missing variable.
app.include_router(quest_router)
app.include_router(agents_router)
# The counselors' daily email: one route, called by the database's scheduler.
app.include_router(counselor_router)


# ── Health ─────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "mentorable-langgraph",
        "version": "0.2.0",
        "chat_graph": "ready",
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
    node_id: Optional[str] = None  # scopes the conversation to one roadmap node
    # The chat_sessions row the page saves this conversation in. Lets the
    # chat's note replace itself (one note per conversation) and stay out of
    # the prompt while that conversation is still going.
    session_id: Optional[str] = None
    # A key of app.models.CHAT_MODELS (the page's model picker). Anything else
    # gets CHAT_DEFAULT.
    model: Optional[str] = None


# What one /chat request may send to the model. A student pasting a long essay
# fits (650 words is about 4,000 characters); a request that would cost dollars
# does not. Older history beyond the caps is dropped from the front.
CHAT_MAX_MESSAGE_CHARS = 8000
CHAT_MAX_HISTORY_CHARS = 60000
CHAT_MAX_HISTORY_MESSAGES = 40
CHAT_MAX_TOKENS = 2048
# Tool rounds in one reply. Five covers a view, a few writes and a confirmation;
# the last round is told to answer in words, so a model stuck calling tools
# cannot loop (and bill) without end.
CHAT_MAX_TOOL_ROUNDS = 5
# A model that thinks spends part of max_tokens thinking, so it gets more room.
# A cap, not a spend.
CHAT_MAX_TOKENS_THINKING = 4096
CHAT_MAX_TOKENS_OPENAI = 8192      # includes the invisible reasoning tokens
CHAT_REFUSED = ("I can't help with that one here. If something serious is going on, please talk to a "
                "school counselor or a trusted adult.")
_CACHE = {"type": "ephemeral"}


def _sse(payload) -> str:
    return "data: " + (payload if isinstance(payload, str) else json.dumps(payload)) + "\n\n"


def _without_thinking(message: dict) -> dict:
    """An assistant turn with its thinking blocks removed (for a re-run on
    another model); every other message unchanged."""
    content = message.get("content")
    if message.get("role") != "assistant" or isinstance(content, str):
        return message
    kept = [b for b in content
            if (b.get("type") if isinstance(b, dict) else getattr(b, "type", None)) not in ("thinking", "redacted_thinking")]
    return {**message, "content": kept}


def _openai_tools(tools: list[dict]) -> list[dict]:
    """The chat tools in OpenAI's function format (same names and schemas)."""
    return [{"type": "function", "function": {
        "name": t["name"], "description": t.get("description", ""),
        "parameters": t.get("input_schema") or {"type": "object", "properties": {}}}}
        for t in tools]


def _uuid_or_none(value) -> Optional[str]:
    try:
        return str(uuid.UUID(str(value))) if value else None
    except (ValueError, TypeError, AttributeError):
        return None


def _normalize_chat(messages: list[Message]) -> list[dict]:
    """Merge consecutive same-role turns, map "ai" to "assistant", and keep
    the newest history that fits the caps, starting on a user turn."""
    normalized: list[dict] = []
    for m in messages:
        if not (m.content and m.content.strip()):
            continue
        role = "assistant" if m.role in ("ai", "assistant") else "user"
        content = m.content.strip()
        if normalized and normalized[-1]["role"] == role:
            normalized[-1]["content"] += "\n\n" + content
        else:
            normalized.append({"role": role, "content": content})
    kept: list[dict] = []
    total = 0
    for m in reversed(normalized):
        size = len(m["content"])
        if kept and (total + size > CHAT_MAX_HISTORY_CHARS or len(kept) >= CHAT_MAX_HISTORY_MESSAGES):
            break
        kept.append(m)
        total += size
    kept.reverse()
    while kept and kept[0]["role"] != "user":
        kept.pop(0)
    return kept


def _mark_cache(conversation: list[dict]) -> list[dict]:
    """The conversation with a cache breakpoint on its last block, so the next
    request (the student's next message, or the next tool round) reads every
    earlier turn from the prompt cache instead of paying for it again."""
    if not conversation:
        return conversation
    *head, last = conversation
    content = last["content"]
    if isinstance(content, str):
        blocks = [{"type": "text", "text": content, "cache_control": _CACHE}]
    else:
        blocks = [dict(b) if isinstance(b, dict) else b for b in content]
        if blocks and isinstance(blocks[-1], dict):
            blocks[-1] = {**blocks[-1], "cache_control": _CACHE}
    return [*head, {**last, "content": blocks}]


@app.post("/chat")
async def chat(request: ChatRequest, user_id: str = Depends(verify_jwt)):
    normalized = _normalize_chat(request.messages)
    if not normalized or normalized[0]["role"] != "user" or normalized[-1]["role"] != "user":
        raise HTTPException(status_code=400, detail="Messages must start and end with a user message")
    # Before the rate limit, so a message that is refused never costs one.
    if len(normalized[-1]["content"]) > CHAT_MAX_MESSAGE_CHARS:
        raise HTTPException(status_code=413, detail=(
            f"That message is too long for one reply (over {CHAT_MAX_MESSAGE_CHARS:,} characters). "
            "Send a shorter part of it."))
    chat_id = _uuid_or_none(request.session_id)
    pick = CHAT_MODELS.get(request.model or "") or CHAT_MODELS[CHAT_DEFAULT]
    if pick["provider"] == "openai" and not llm.openai_enabled():
        raise HTTPException(status_code=503, detail="That model isn't available right now. Pick another one.")

    # Rate limit check
    await check_rate_limit(user_id, "chat")

    posthog_client.capture(
        "chat_message_sent",
        distinct_id=user_id,
        properties={"has_node_context": request.node_id is not None, "model": pick["model"]},
    )

    # load_context + build_prompt. load_context is sync and LangGraph runs it
    # on a worker thread, so its database reads never block the event loop.
    state = await chat_graph.ainvoke({"user_id": user_id, "node_id": request.node_id, "chat_id": chat_id})
    shared = state.get("_system_shared") or ""
    student = state.get("_system_student") or ""

    if not (shared and student):
        await refund_usage(user_id, "chat")
        raise HTTPException(status_code=500, detail="Failed to build system prompt")

    # Two cached blocks: the shared rules first (the same for every student,
    # so one student's cache serves the next), then this student's block.
    system = [
        {"type": "text", "text": shared, "cache_control": _CACHE},
        {"type": "text", "text": student, "cache_control": _CACHE},
    ]
    # recall_memory is only offered while the student has memory on.
    chat_tools = tools_for(state.get("profile") or {})

    st = {"text": "", "tools": False}

    async def run_tool(name: str, args: dict) -> tuple[dict, list[str]]:
        """Run one chat tool; its result and the SSE events it shows the page."""
        result = await execute_chat_tool(user_id, name, args)
        events: list[str] = []
        if result.get("success") and name in WRITE_TOOLS:
            # Writes surface as a UI toast; reads (view_portfolio) stay silent.
            events.append(_sse({"event": "portfolio_changed", "verb": TOOL_VERB.get(name, "Updated"), "item": result}))
            posthog_client.capture("portfolio_changed_via_chat", distinct_id=user_id,
                                   properties={"tool": name, "kind": result.get("kind")})
        elif result.get("success") and name in QUEST_WRITE_TOOLS:
            # The nav streak chip and the Quest page listen for this.
            events.append(_sse({"event": "quest_changed", "verb": TOOL_VERB.get(name, "Updated"), "item": result}))
            posthog_client.capture("quest_changed_via_chat", distinct_id=user_id,
                                   properties={"tool": name, "changed": result.get("changed")})
        return result, events

    def text_chunk(text: str, turn_text: str) -> list[str]:
        """The SSE lines for a chunk of reply text. The first text of a turn
        that follows a tool call gets a separator: the client appends raw
        chunks, so the previous turn's last character would otherwise run into
        this one's first ("...all the changes at once.Got all the IDs.")."""
        out = []
        if not turn_text and st["text"]:
            st["text"] += TURN_SEPARATOR
            out.append(_sse({"text": TURN_SEPARATOR}))
        st["text"] += text
        out.append(_sse({"text": text}))
        return out

    async def claude_rounds():
        """The Anthropic tool loop. A newer model that declines a turn before
        writing anything gets that turn re-run on the default model (Haiku
        5.5 has no server-side fallback; Sonnet 5.5's covers only some
        categories), without the thinking blocks the first model wrote."""
        conversation: list[dict] = list(normalized)
        model, effort = pick["model"], pick["effort"]
        default = CHAT_MODELS[CHAT_DEFAULT]
        round_no = 0
        while round_no <= CHAT_MAX_TOOL_ROUNDS:
            turn_text = ""
            extra: dict = {}
            if round_no == CHAT_MAX_TOOL_ROUNDS:
                extra["tool_choice"] = {"type": "none"}
            if effort:
                # In extra_body so an SDK that predates output_config still sends it.
                extra["extra_body"] = {"output_config": {"effort": effort}}
            async with _anthropic.messages.stream(
                model=model,
                max_tokens=CHAT_MAX_TOKENS_THINKING if effort else CHAT_MAX_TOKENS,
                system=system,
                messages=_mark_cache(conversation),
                tools=chat_tools,
                **extra,
            ) as stream:
                async for text in stream.text_stream:
                    for line in text_chunk(text, turn_text):
                        yield line
                    turn_text += text
                final_message = await stream.get_final_message()

            costs.record_anthropic("chat", model, getattr(final_message, "usage", None))
            stop = final_message.stop_reason
            if stop == "refusal" and not turn_text:
                if model != default["model"]:
                    logger.info(f"[chat] {model} declined a turn for {user_id}; re-running it on {default['model']}")
                    model, effort = default["model"], default["effort"]
                    # Its thinking blocks mean nothing to the default model.
                    conversation = [_without_thinking(m) for m in conversation]
                    continue
                for line in text_chunk(CHAT_REFUSED, turn_text):
                    yield line
                break
            if stop == "max_tokens":
                logger.warning(f"[chat] reply for {user_id} on {model} cut off at max_tokens")
            if stop != "tool_use":
                break

            # Record the assistant turn (text, thinking and tool_use blocks) verbatim.
            conversation.append({"role": "assistant", "content": final_message.content})
            st["tools"] = True
            tool_results = []
            for block in final_message.content:
                if getattr(block, "type", None) != "tool_use":
                    continue
                result, events = await run_tool(block.name, dict(block.input))
                for line in events:
                    yield line
                tool_results.append({"type": "tool_result", "tool_use_id": block.id, "content": json.dumps(result)})
            conversation.append({"role": "user", "content": tool_results})
            round_no += 1
            # loop again for the model's natural-language confirmation

    async def openai_rounds():
        """The same loop on OpenAI's Chat Completions API: one system message
        (OpenAI caches a repeated prefix on its own), the same tools as
        functions, streamed text, and tool calls assembled from their deltas."""
        client = llm._openai
        model = pick["model"]
        messages: list[dict] = [{"role": "system", "content": shared + "\n\n" + student}] + [dict(m) for m in normalized]
        tools = _openai_tools(chat_tools)
        effort = pick["effort"]
        for round_no in range(CHAT_MAX_TOOL_ROUNDS + 1):
            params = {"model": model, "messages": messages, "tools": tools, "stream": True,
                      "stream_options": {"include_usage": True}, "max_completion_tokens": CHAT_MAX_TOKENS_OPENAI}
            if round_no == CHAT_MAX_TOOL_ROUNDS:
                params["tool_choice"] = "none"
            if effort:
                params["reasoning_effort"] = effort
            try:
                stream = await client.chat.completions.create(**params)
            except Exception as exc:
                if effort and llm._rejects_param(exc, "reasoning_effort"):
                    effort = None
                    params.pop("reasoning_effort", None)
                    stream = await client.chat.completions.create(**params)
                else:
                    raise
            turn_text, calls, usage = "", {}, None
            async for chunk in stream:
                if getattr(chunk, "usage", None):
                    usage = chunk.usage
                if not chunk.choices:
                    continue
                delta = chunk.choices[0].delta
                if getattr(delta, "content", None):
                    for line in text_chunk(delta.content, turn_text):
                        yield line
                    turn_text += delta.content
                for tc in getattr(delta, "tool_calls", None) or []:
                    slot = calls.setdefault(tc.index, {"id": "", "name": "", "args": ""})
                    if tc.id:
                        slot["id"] = tc.id
                    fn = getattr(tc, "function", None)
                    if fn is not None:
                        slot["name"] += fn.name or ""
                        slot["args"] += fn.arguments or ""
            costs.record_openai("chat", model, usage)
            if not calls:
                if not turn_text and not st["text"]:
                    # Cut off, filtered or refused with nothing said: an error,
                    # so the message is given back rather than a blank reply.
                    raise RuntimeError(f"{model} returned no text")
                break

            ordered = [calls[i] for i in sorted(calls)]
            messages.append({"role": "assistant", "content": turn_text or None, "tool_calls": [
                {"id": c["id"], "type": "function", "function": {"name": c["name"], "arguments": c["args"] or "{}"}}
                for c in ordered]})
            st["tools"] = True
            for c in ordered:
                try:
                    args = json.loads(c["args"] or "{}")
                except ValueError:
                    args = None
                if isinstance(args, dict):
                    result, events = await run_tool(c["name"], args)
                    for line in events:
                        yield line
                else:
                    result = {"success": False, "error": "The tool arguments were not valid JSON."}
                messages.append({"role": "tool", "tool_call_id": c["id"], "content": json.dumps(result)})

    async def generate():
        rounds = openai_rounds() if pick["provider"] == "openai" else claude_rounds()
        try:
            async for line in rounds:
                yield line
            yield "data: [DONE]\n\n"

            # Fire-and-forget: the session summary and long-term memory. Pass a
            # clean text-only transcript. spawn keeps a reference until it ends.
            transcript = normalized + [{"role": "assistant", "content": st["text"]}]
            spawn(extract_signals(user_id, transcript, chat_id))

        except Exception as exc:
            logger.error(f"[chat] stream error for {user_id} on {pick['model']}: {exc}")
            # Nothing reached the student and nothing was changed: the message
            # is given back. (A tool may already have written to their record.)
            if not st["text"] and not st["tools"]:
                await refund_usage(user_id, "chat")
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


# ── Parked routes ──────────────────────────────────────────────────────────────
# Scorecard and Roadmap were built for career guidance and are unreachable from
# the app (src/lib/features.js), but their endpoints still answered anyone
# signed in, at Sonnet prices, two of them with no limit at all. They answer
# 404 unless PARKED_ROUTES_ENABLED is set. Their code stays. /research is not
# gated: the chat page's "Search the web" button still uses it (2 per account).

def _parked():
    if not PARKED_ROUTES_ENABLED:
        raise HTTPException(status_code=404, detail="Not found")


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

    # Rate limit check happens before we commit to a streaming response, so a
    # 429 still comes back as a normal HTTP status the frontend already handles.
    await check_rate_limit(user_id, "research")

    posthog_client.capture(
        "research_query_submitted",
        distinct_id=user_id,
        properties={"query_length": len(query)},
    )

    async def generate():
        task = asyncio.create_task(run_research(user_id, query, session_id))
        try:
            # The pipeline (decompose + searches/fetches + one merged synthesis
            # call) can run well past a minute. Keep sending SSE comment
            # heartbeats every 15s so no idle-connection timeout upstream kills
            # the request while we wait — this changes only the transport, not
            # the number of Anthropic calls made (still 2, same cost).
            while True:
                done, _ = await asyncio.wait([task], timeout=15)
                if done:
                    break
                yield ": keep-alive\n\n"

            result = task.result()
            yield f"data: {json.dumps(result)}\n\n"
        except ValueError as exc:
            await refund_usage(user_id, "research")  # don't burn the 2/lifetime quota on a failed run
            yield f"data: {json.dumps({'error': str(exc)})}\n\n"
        except Exception as exc:
            logger.error(f"[research] Unexpected error for {user_id}: {exc}")
            await refund_usage(user_id, "research")
            yield f"data: {json.dumps({'error': 'Research failed'})}\n\n"
        finally:
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/scorecard/improve", dependencies=[Depends(_parked)])
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
        result = await improve_axis(user_id, axis)
        posthog_client.capture(
            "scorecard_improve_triggered",
            distinct_id=user_id,
            properties={"axis": axis},
        )
        return result
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        logger.error(f"[scorecard] improve error for {user_id}: {exc}")
        raise HTTPException(status_code=500, detail="Could not generate suggestions")


@app.post("/roadmap/intake", dependencies=[Depends(_parked)])
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


@app.post("/roadmap/generate", dependencies=[Depends(_parked)])
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
        result = await generate_roadmap(user_id, goal, tf, end_month=end_month, intake_answers=intake_answers)
        posthog_client.capture(
            "roadmap_generated",
            distinct_id=user_id,
            properties={
                "timeframe_months": tf,
                "has_intake_answers": intake_answers is not None,
            },
        )
        return result
    except ValueError as exc:
        await refund_usage(user_id, "roadmap_gen")  # don't burn the 1/lifetime gen on a soft failure
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        await refund_usage(user_id, "roadmap_gen")
        logger.error(f"[roadmap] generate error for {user_id}: {exc}")
        raise HTTPException(status_code=500, detail="Could not generate roadmap")


@app.post("/roadmap/node/expand", dependencies=[Depends(_parked)])
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
        result = await expand_node(user_id, node_id)
        posthog_client.capture("roadmap_node_expanded", distinct_id=user_id)
        return result
    except ValueError as exc:
        await refund_usage(user_id, "node_expand")
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        await refund_usage(user_id, "node_expand")
        logger.error(f"[roadmap] expand error for {user_id}: {exc}")
        raise HTTPException(status_code=500, detail="Could not load resources")


@app.post("/roadmap/phase/generate", dependencies=[Depends(_parked)])
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
        result = await generate_phase(user_id, roadmap_id, phase_index)
        posthog_client.capture(
            "roadmap_phase_generated",
            distinct_id=user_id,
            properties={"phase_index": phase_index},
        )
        return result
    except ValueError as exc:
        await refund_usage(user_id, "phase_gen")  # soft failure shouldn't burn a phase gen
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        await refund_usage(user_id, "phase_gen")
        logger.error(f"[roadmap] phase generate error for {user_id}: {exc}")
        raise HTTPException(status_code=500, detail="Could not generate phase")


@app.post("/roadmap/phase/complete", dependencies=[Depends(_parked)])
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
        result = await reflect_on_phase(user_id, roadmap_id, phase_index, reflection_text)
        posthog_client.capture(
            "roadmap_phase_completed",
            distinct_id=user_id,
            properties={
                "phase_index": phase_index,
                "has_reflection": len(reflection_text) > 0,
            },
        )
        return result
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        logger.error(f"[roadmap] phase complete error for {user_id}: {exc}")
        raise HTTPException(status_code=500, detail="Could not complete phase")


@app.post("/portfolio/extract")
async def portfolio_extract(file: UploadFile = File(...), user_id: str = Depends(verify_jwt)):
    content = await file.read()

    # Validate + parse the file BEFORE the rate limit so a bad upload (wrong
    # type, unreadable, scanned image) never burns one of the 2 lifetime uploads.
    try:
        document = extract_file_text(file.filename or "", content)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    await check_rate_limit(user_id, "portfolio_upload")

    try:
        items = await extract_portfolio_items(document)
        posthog_client.capture(
            "portfolio_extracted",
            distinct_id=user_id,
            properties={"item_count": len(items)},
        )
        return {"items": items}
    except ValueError as exc:
        await refund_usage(user_id, "portfolio_upload")  # extraction failed, give the upload back
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        logger.error(f"[portfolio] Unexpected error for {user_id}: {exc}")
        await refund_usage(user_id, "portfolio_upload")
        raise HTTPException(status_code=500, detail="Extraction failed")


@app.post("/portfolio/resume/pdf")
async def portfolio_resume_pdf(raw: Request, user_id: str = Depends(verify_jwt)):
    """
    Build a one-page LaTeX resume from the student's selected record (academics,
    activities, awards) and compile it to PDF. Rate-limited to 1/lifetime in the
    demo; the compile is the only cost (no AI call).
    """
    try:
        body = await raw.json()
    except Exception:
        body = {}
    def ids(key):
        return [str(i) for i in (body.get(key) or []) if i]

    activity_ids = ids("activity_ids")
    award_ids    = ids("award_ids")
    course_ids   = ids("course_ids")
    score_ids    = ids("score_ids")
    include_gpa  = bool(body.get("include_gpa"))
    contact = body.get("contact") if isinstance(body.get("contact"), dict) else {}

    if not any([activity_ids, award_ids, course_ids, score_ids, include_gpa]):
        raise HTTPException(status_code=422, detail="Select at least one thing to include in your resume.")

    supabase = get_supabase()
    profile_res = (
        supabase.from_("profiles")
        .select("full_name, gpa_unweighted, gpa_weighted, gpa_scale")
        .eq("id", user_id).maybe_single().execute()
    )
    profile = profile_res.data or {}
    name = (profile.get("full_name") or "").strip()

    # Never trust what the client sends; re-read every row scoped to this user.
    def rows(table, cols, id_list, order):
        if not id_list:
            return []
        res = (
            supabase.from_(table).select(cols)
            .eq("user_id", user_id).in_("id", id_list).order(order).execute()
        )
        return res.data or []

    selection = {
        "academics": {
            "gpa_unweighted": profile.get("gpa_unweighted"),
            "gpa_weighted":   profile.get("gpa_weighted"),
            "gpa_scale":      profile.get("gpa_scale"),
        } if include_gpa else {},
        "activities": rows(
            "student_activities",
            "id, title, position, organization, description, hours_per_week, "
            "weeks_per_year, grade_levels, order_index",
            activity_ids, "order_index",
        ),
        "awards":  rows("student_awards", "id, title, level, year, description, order_index",
                        award_ids, "order_index"),
        "courses": rows("student_courses", "id, name, level, order_index",
                        course_ids, "order_index"),
        "scores":  rows("student_test_scores", "id, test_type, score, subject, section_scores",
                        score_ids, "test_type"),
    }

    if not any([selection["academics"], selection["activities"],
                selection["awards"], selection["courses"], selection["scores"]]):
        raise HTTPException(status_code=422, detail="None of the selected items belong to you.")

    # Build (cheap, pure) BEFORE the rate limit so a validation problem never burns the export.
    try:
        tex = build_resume_tex(name, contact, selection)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    await check_rate_limit(user_id, "resume_export")

    try:
        pdf = await compile_tex_to_pdf(tex)
    except PdfEngineUnavailable as exc:
        logger.error(f"[resume] engine unavailable: {exc}")
        await refund_usage(user_id, "resume_export")
        raise HTTPException(status_code=500, detail="PDF export is temporarily unavailable. Please try again later.")
    except ValueError as exc:
        await refund_usage(user_id, "resume_export")
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        logger.error(f"[resume] Unexpected error for {user_id}: {exc}")
        await refund_usage(user_id, "resume_export")
        raise HTTPException(status_code=500, detail="Could not build the PDF")

    posthog_client.capture(
        "resume_exported",
        distinct_id=user_id,
        properties={
            "item_count": sum(
                len(selection[k]) for k in ("activities", "awards", "courses", "scores")
            ),
            "include_gpa": bool(selection["academics"]),
        },
    )
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="resume.pdf"'},
    )


# ── College application intake ────────────────────────────────────────────────
# The text interview. Deliberately NOT routed through /chat: chat is capped at 8
# messages per lifetime, so onboarding would burn the student's whole demo budget
# before they ever reached the chat page. This endpoint is free and uncheckpointed.

INTERVIEW_MAX_TURNS = 12
INTERVIEW_WRAP_TURN = 9
# What one interview request may carry. The page sends the whole conversation
# each turn, so these bound the cost of a single request; the lifetime caps
# are in app/nodes/onboarding/budget.py.
INTERVIEW_MAX_MESSAGES = 2 * INTERVIEW_MAX_TURNS + 4
INTERVIEW_MAX_MESSAGE_CHARS = 4000
INTAKE_MAX_TRANSCRIPT_CHARS = 60000


@app.get("/onboarding/context")
async def onboarding_context(user_id: str = Depends(verify_jwt)):
    """The rendered form summary. The voice path sends this to the ElevenLabs agent
    via sendContextualUpdate so both channels see exactly the same facts."""
    try:
        record = load_student_record(user_id)
        return {"context": render_record_context(record),
                "activity_count": len(record.get("activities") or [])}
    except Exception as exc:
        logger.error(f"[intake] context build failed for {user_id}: {exc}")
        raise HTTPException(status_code=500, detail="Could not build intake context")


@app.post("/onboarding/interview")
async def onboarding_interview(raw: Request, user_id: str = Depends(verify_jwt)):
    try:
        body = await raw.json()
    except Exception:
        body = {}

    raw_messages = body.get("messages") or []
    conversation = [
        {"role": "assistant" if m.get("role") in ("assistant", "ai") else "user",
         "content": str(m.get("content") or "").strip()}
        for m in raw_messages
        if str(m.get("content") or "").strip()
    ]

    def sse_error(message: str, code: str):
        def one():
            yield f"data: {json.dumps({'error': message, 'code': code})}\n\n"
        return StreamingResponse(one(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})

    # Strict: a failed read is a retryable error, never "you listed nothing".
    try:
        record = load_student_record(user_id, strict=True)
    except Exception as exc:
        logger.error(f"[intake] interview record read failed for {user_id}: {exc}")
        return sse_error("Interview stream failed", "READ_FAILED")
    # The interview walks the listed activities and awards. With none, the
    # model has nothing real to ask about and reaches for names of its own; the
    # channel picker disables the interview in that case, and this backs it up.
    if not (record.get("activities") or record.get("awards")):
        return sse_error("Add at least one activity or award to have this conversation. "
                         "Refresh the page to go back to the form.", "NO_ITEMS")
    if len(conversation) > INTERVIEW_MAX_MESSAGES or \
            sum(1 for m in conversation if m["role"] == "user") > INTERVIEW_MAX_TURNS + 1:
        return sse_error("This conversation is complete. Continue to your summary.", "TURN_CAP")
    if any(len(m["content"]) > INTERVIEW_MAX_MESSAGE_CHARS for m in conversation):
        return sse_error("That answer is too long to send. Try a shorter one.", "TOO_LONG")
    try:
        allowed = await asyncio.to_thread(onboarding_budget.spend, user_id, "interview_turn")
    except onboarding_budget.Unavailable:
        return sse_error("Interview stream failed", "BUDGET_UNAVAILABLE")
    if not allowed:
        return sse_error("You have reached the limit for this conversation. Continue to your summary.", "LIMIT")
    system_prompt = INTERVIEW_SYSTEM.format(
        max_turns=INTERVIEW_MAX_TURNS,
        wrap_turn=INTERVIEW_WRAP_TURN,
        record_context=render_record_context(record),
    )

    # Opening turn: no user message yet, so prompt the model to start.
    if not conversation:
        conversation = [{"role": "user", "content": "(Begin the interview.)"}]

    async def generate():
        said = False
        try:
            async with _anthropic.messages.stream(
                model=INTERVIEW_MODEL,
                max_tokens=1024,
                # The system prefix is stable for the whole interview, and the
                # mark on the last turn lets the next request read this whole
                # conversation from the cache too.
                system=[{"type": "text", "text": system_prompt,
                         "cache_control": {"type": "ephemeral"}}],
                messages=_mark_cache(conversation),
            ) as stream:
                async for text in stream.text_stream:
                    said = True
                    yield f"data: {json.dumps({'text': text})}\n\n"
                final = await stream.get_final_message()
            costs.record_anthropic("onboarding_interview", INTERVIEW_MODEL, getattr(final, "usage", None))
            yield "data: [DONE]\n\n"
        except Exception as exc:
            logger.error(f"[intake] interview stream failed for {user_id}: {exc}")
            if not said:
                await asyncio.to_thread(onboarding_budget.refund, user_id, "interview_turn")
            yield f"data: {json.dumps({'error': 'Interview stream failed'})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive",
                 "X-Accel-Buffering": "no"},
    )


@app.post("/onboarding/intake/extract")
async def onboarding_intake_extract(raw: Request, user_id: str = Depends(verify_jwt)):
    """Turn the interview into a reviewable draft. Does NOT complete onboarding."""
    try:
        body = await raw.json()
    except Exception:
        body = {}

    transcript = (body.get("transcript") or "").strip()
    channel = body.get("channel") if body.get("channel") in ("text", "voice") else "text"
    if len(transcript) > INTAKE_MAX_TRANSCRIPT_CHARS:
        raise HTTPException(status_code=413, detail="That conversation is too long to summarize.")

    try:
        allowed = await asyncio.to_thread(onboarding_budget.spend, user_id, "extract")
    except onboarding_budget.Unavailable:
        raise HTTPException(status_code=503, detail="Try again in a minute.")
    if not allowed:
        raise HTTPException(status_code=429, detail={"error": "LIMIT_REACHED", "feature": "intake_extract"})

    try:
        return await extract_intake(user_id, transcript, channel=channel)
    except Exception as exc:
        logger.error(f"[intake] Unexpected extract error for {user_id}: {exc}")
        await asyncio.to_thread(onboarding_budget.refund, user_id, "extract")
        raise HTTPException(status_code=500, detail="Intake extraction failed")


@app.post("/onboarding/voice/session")
async def onboarding_voice_session(user_id: str = Depends(verify_jwt)):
    """A one-time signed URL for the onboarding voice interview.

    The voice agent used to be started from the browser with its public id,
    so anyone who found the id could run calls on this account. With the
    agent's authentication setting on, only a signed URL from here connects,
    and each one costs one of the student's voice calls (budget.py)."""
    try:
        allowed = await asyncio.to_thread(onboarding_budget.spend, user_id, "voice_call")
    except onboarding_budget.Unavailable:
        raise HTTPException(status_code=503, detail="Try again in a minute.")
    if not allowed:
        raise HTTPException(status_code=429, detail={
            "error": "LIMIT_REACHED", "feature": "onboarding_voice",
            "message": "You have used your voice interviews. The text interview is still open."})
    try:
        line = await elevenlabs.signed_url(elevenlabs.onboarding_agent_id())
    except elevenlabs.ElevenLabsError as exc:
        await asyncio.to_thread(onboarding_budget.refund, user_id, "voice_call")
        logger.warning(f"[intake] no voice line for {user_id} ({str(exc)[:120]}), given back")
        raise HTTPException(status_code=503, detail="The voice line could not open. Try again in a minute.")
    return {"signed_url": line["signed_url"]}


@app.post("/onboarding/intake/commit")
async def onboarding_intake_commit(raw: Request, user_id: str = Depends(verify_jwt)):
    """Write the student-confirmed draft into the real tables and finish onboarding."""
    try:
        body = await raw.json()
    except Exception:
        body = {}

    draft = body.get("draft")
    if not isinstance(draft, dict):
        raise HTTPException(status_code=422, detail="Missing draft")

    channel = body.get("channel") if body.get("channel") in ("text", "voice", "skipped") else None

    try:
        result = await commit_intake(user_id, draft, channel=channel)
        if result.get("success"):
            posthog_client.capture(
                "onboarding_completed",
                distinct_id=user_id,
                properties={"channel": channel or "unknown", "skipped": channel == "skipped"},
            )
        return result
    except Exception as exc:
        logger.error(f"[intake] Unexpected commit error for {user_id}: {exc}")
        raise HTTPException(status_code=500, detail="Intake commit failed")
