from contextlib import asynccontextmanager
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.auth import verify_jwt
from app.config import CORS_ORIGIN
from app.db.checkpointer import lifespan_checkpointer
from app.db.supabase import get_supabase


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with lifespan_checkpointer():
        yield


app = FastAPI(
    title="Mentorable LangGraph Service",
    description="Agentic backend for Mentorable — chat, research, quest graphs",
    version="0.1.0",
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
    return {"status": "ok", "service": "mentorable-langgraph", "version": "0.1.0"}


# ── Profile probe (Sprint 1 verification endpoint) ────────────────────────────
# Verifies that JWT auth + Supabase service client work end-to-end.
# Returns the authenticated user's profile row.

@app.get("/profile")
async def get_profile(user_id: str = Depends(verify_jwt)):
    supabase = get_supabase()
    result = (
        supabase.from_("profiles")
        .select("id, full_name, email, grade_level, education_level, onboarding_completed, career_matches")
        .eq("id", user_id)
        .maybe_single()
        .execute()
    )
    if result.data is None:
        return JSONResponse(
            status_code=404,
            content={"error": "Profile not found", "user_id": user_id},
        )
    return result.data


# ── Placeholder routes (Sprint 2–5) ───────────────────────────────────────────

@app.post("/chat")
async def chat_placeholder(user_id: str = Depends(verify_jwt)):
    return {"error": "Not implemented yet — Sprint 2", "user_id": user_id}


@app.post("/research")
async def research_placeholder(user_id: str = Depends(verify_jwt)):
    return {"error": "Not implemented yet — Sprint 3", "user_id": user_id}


@app.post("/quests/generate")
async def quest_placeholder(user_id: str = Depends(verify_jwt)):
    return {"error": "Not implemented yet — Sprint 4", "user_id": user_id}


@app.post("/onboarding/extract")
async def onboarding_placeholder(user_id: str = Depends(verify_jwt)):
    return {"error": "Not implemented yet — Sprint 5", "user_id": user_id}
