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
from app.nodes.chat.advisor import MAX_TOOL_ROUNDS, _mark_cache
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
# The longest /chat waits silently (a model thinking, a slow tool): an SSE
# comment this often keeps an idle-connection timeout upstream from cutting it.
CHAT_PING_SECONDS = 10
# The tool loop's caps and fixed replies live with it (app/nodes/chat/advisor.py).
CHAT_MAX_TOOL_ROUNDS = MAX_TOOL_ROUNDS


def _sse(payload) -> str:
    return "data: " + (payload if isinstance(payload, str) else json.dumps(payload)) + "\n\n"


async def _with_pings(chunks, every: float):
    """The chunks of an async iterator, with None put in after every `every`
    seconds that pass without one (the caller sends a keep-alive for it)."""
    done = object()

    async def next_chunk():
        try:
            return await anext(chunks)
        except StopAsyncIteration:
            return done

    pending = None
    try:
        while True:
            if pending is None:
                pending = asyncio.ensure_future(next_chunk())
            finished, _ = await asyncio.wait({pending}, timeout=every)
            if not finished:
                yield None
                continue
            chunk, pending = pending.result(), None
            if chunk is done:
                return
            yield chunk
    finally:
        if pending is not None:
            pending.cancel()
            try:
                await pending
            except BaseException:
                pass
        await chunks.aclose()


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

    # The whole reply is the chat graph (app/graphs/chat.py): load_context,
    # build_prompt, then the advisor ⇄ tools loop, streaming through its
    # writer. The advisor says "ready" before its first call, so a prompt that
    # failed to build is still a plain 500 before the stream starts.
    inputs = {"user_id": user_id, "node_id": request.node_id, "chat_id": chat_id,
              "messages": normalized, "rounds": 0, "handoffs": 0, "_pick": pick}
    graph_stream = chat_graph.astream(inputs, stream_mode="custom")
    first = await anext(graph_stream, None)
    if not (isinstance(first, dict) and first.get("ready")):
        await graph_stream.aclose()
        await refund_usage(user_id, "chat")
        raise HTTPException(status_code=500, detail="Failed to build system prompt")

    async def generate():
        text, tools_ran = "", False
        try:
            async for chunk in _with_pings(graph_stream, CHAT_PING_SECONDS):
                if chunk is None:
                    yield ": ping\n\n"
                elif "text" in chunk:
                    text += chunk["text"]
                    yield _sse({"text": chunk["text"]})
                elif "event" in chunk:
                    yield _sse(chunk)
                elif chunk.get("tools_ran"):
                    tools_ran = True
            yield "data: [DONE]\n\n"

            # Fire-and-forget: the session summary and long-term memory. Pass a
            # clean text-only transcript. spawn keeps a reference until it ends.
            transcript = normalized + [{"role": "assistant", "content": text}]
            spawn(extract_signals(user_id, transcript, chat_id))

        except Exception as exc:
            logger.error(f"[chat] stream error for {user_id} on {pick['model']}: {exc}")
            # Nothing reached the student and nothing was changed: the message
            # is given back. (A tool may already have written to their record.)
            if not text and not tools_ran:
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
