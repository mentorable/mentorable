"""
Quest endpoints. Thin on purpose: parse the request, call the service, map its
refusals to HTTP. The rules live in app/nodes/quest/.

Every route needs a valid Supabase JWT. The browser sends its time zone in an
X-Timezone header, which is only used the first time we have none stored.
"""
import inspect
import logging
import uuid
from typing import Any, Callable, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.concurrency import run_in_threadpool

from app.auth import verify_jwt
from app.nodes.quest import service as svc
from app.nodes.quest.service import QuestError
from app.posthog_client import posthog_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/quest", tags=["quest"])


def _tz(raw: Request) -> Optional[str]:
    return raw.headers.get("x-timezone")


async def _body(raw: Request) -> dict:
    try:
        data = await raw.json()
    except Exception:
        return {}
    return data if isinstance(data, dict) else {}


def _uuid(value: str) -> str:
    try:
        return str(uuid.UUID(value))
    except (ValueError, TypeError):
        raise HTTPException(status_code=404, detail={"error": "no_quest", "message": "That was not found."})


def _track(user_id: str, event: str, **props) -> None:
    try:
        posthog_client.capture(event, distinct_id=user_id, properties=props)
    except Exception:
        pass


async def _run(user_id: str, label: str, fn: Callable[[], Any]) -> Any:
    """Call the service, turning its refusals into HTTP errors the page can show.

    The service talks to Supabase through a blocking client, so a plain call
    runs on a worker thread: on the event loop it would hold up every other
    request, and the page's first load fires several at once. An async service
    function only builds its coroutine there and is awaited here.
    """
    try:
        result = await run_in_threadpool(fn)
        if inspect.isawaitable(result):
            result = await result
        return result
    except QuestError as exc:
        raise HTTPException(status_code=exc.status, detail={"error": exc.code, "message": exc.message})
    except HTTPException:
        raise
    except Exception:
        logger.exception(f"[quest] {label} failed for {user_id}")
        raise HTTPException(status_code=500, detail={"error": "server_error",
                                                     "message": "Something went wrong. Try again."})


# ── Reads ─────────────────────────────────────────────────────────────────────

@router.get("")
async def quest_state(raw: Request, user_id: str = Depends(verify_jwt)):
    return await _run(user_id, "state", lambda: svc.get_state(user_id, _tz(raw)))


@router.get("/summary")
async def quest_summary(raw: Request, user_id: str = Depends(verify_jwt)):
    return await _run(user_id, "summary", lambda: svc.get_summary(user_id, _tz(raw)))


# ── Setting up ────────────────────────────────────────────────────────────────

@router.post("/suggestions")
async def quest_suggestions(raw: Request, user_id: str = Depends(verify_jwt)):
    body = await _body(raw)
    refresh = body.get("refresh") is True
    result = await _run(user_id, "suggestions", lambda: svc.suggestions(user_id, _tz(raw), refresh))
    if refresh:
        _track(user_id, "quest_suggestions_refreshed")
    return result


@router.post("/plan")
async def quest_plan(raw: Request, user_id: str = Depends(verify_jwt)):
    body = await _body(raw)
    result = await _run(user_id, "plan", lambda: svc.create_plan(user_id, _tz(raw), body))
    _track(user_id, "quest_planned", daily_minutes=body.get("daily_minutes"),
           rest_days=len(body.get("rest_days") or []), has_deadline=bool(body.get("hard_deadline")),
           from_suggestion=bool(body.get("from_suggestion")))
    return result


@router.post("/{quest_id}/start")
async def quest_start(quest_id: str, raw: Request, user_id: str = Depends(verify_jwt)):
    qid = _uuid(quest_id)
    result = await _run(user_id, "start", lambda: svc.start_quest(user_id, _tz(raw), qid))
    _track(user_id, "quest_started")
    return result


@router.post("/{quest_id}/discard")
async def quest_discard(quest_id: str, raw: Request, user_id: str = Depends(verify_jwt)):
    qid = _uuid(quest_id)
    return await _run(user_id, "discard", lambda: svc.discard_draft(user_id, _tz(raw), qid))


# ── The daily loop ────────────────────────────────────────────────────────────

@router.post("/tasks/{slot}")
async def quest_open_task(slot: int, raw: Request, user_id: str = Depends(verify_jwt)):
    return await _run(user_id, "open_task", lambda: svc.open_task(user_id, _tz(raw), slot))


@router.post("/tasks/{slot}/checkin")
async def quest_checkin(slot: int, raw: Request, user_id: str = Depends(verify_jwt)):
    body = await _body(raw)
    result = await _run(user_id, "checkin", lambda: svc.check_in(user_id, _tz(raw), slot, body.get("body")))
    r = (result or {}).get("result") or {}
    if r:
        _track(user_id, "quest_checked_in", on_time=r.get("on_time"), xp_gained=r.get("xp_gained"),
               thin=((result.get("checkin") or {}).get("thin")))
        if r.get("milestone_completed"):
            _track(user_id, "quest_milestone_completed", position=r["milestone_completed"].get("position"))
        if r.get("quest_completed"):
            _track(user_id, "quest_completed")
        if r.get("level_after", 0) > r.get("level_before", 0):
            _track(user_id, "quest_level_up", level=r.get("level_after"))
    return result


@router.post("/checkins/{checkin_id}/followup")
async def quest_followup(checkin_id: str, raw: Request, user_id: str = Depends(verify_jwt)):
    cid = _uuid(checkin_id)
    body = await _body(raw)
    result = await _run(user_id, "followup",
                        lambda: svc.answer_followup(user_id, _tz(raw), cid, body.get("answer")))
    _track(user_id, "quest_followup_answered")
    return result


# ── Pace, pause, ending ───────────────────────────────────────────────────────

@router.post("/{quest_id}/pause")
async def quest_pause(quest_id: str, raw: Request, user_id: str = Depends(verify_jwt)):
    qid = _uuid(quest_id)
    result = await _run(user_id, "pause", lambda: svc.pause(user_id, _tz(raw), qid))
    _track(user_id, "quest_paused")
    return result


@router.post("/{quest_id}/resume")
async def quest_resume(quest_id: str, raw: Request, user_id: str = Depends(verify_jwt)):
    qid = _uuid(quest_id)
    result = await _run(user_id, "resume", lambda: svc.resume(user_id, _tz(raw), qid))
    _track(user_id, "quest_resumed")
    return result


@router.post("/{quest_id}/retire")
async def quest_retire(quest_id: str, raw: Request, user_id: str = Depends(verify_jwt)):
    qid = _uuid(quest_id)
    result = await _run(user_id, "retire", lambda: svc.retire(user_id, _tz(raw), qid))
    _track(user_id, "quest_retired", source="page")
    return result


@router.post("/{quest_id}/break")
async def quest_break(quest_id: str, raw: Request, user_id: str = Depends(verify_jwt)):
    qid = _uuid(quest_id)
    result = await _run(user_id, "break", lambda: svc.take_break(user_id, _tz(raw), qid))
    _track(user_id, "quest_break_taken")
    return result


@router.post("/{quest_id}/settings")
async def quest_settings(quest_id: str, raw: Request, user_id: str = Depends(verify_jwt)):
    qid = _uuid(quest_id)
    body = await _body(raw)
    result = await _run(user_id, "settings", lambda: svc.change_settings(user_id, _tz(raw), qid, body))
    _track(user_id, "quest_pace_changed")
    return result


# ── The portfolio entry ───────────────────────────────────────────────────────

@router.post("/{quest_id}/portfolio-draft")
async def quest_portfolio_draft(quest_id: str, user_id: str = Depends(verify_jwt)):
    qid = _uuid(quest_id)
    return await _run(user_id, "portfolio_draft", lambda: svc.portfolio_draft(user_id, qid))


@router.post("/{quest_id}/portfolio-save")
async def quest_portfolio_save(quest_id: str, raw: Request, user_id: str = Depends(verify_jwt)):
    qid = _uuid(quest_id)
    body = await _body(raw)
    result = await _run(user_id, "portfolio_save", lambda: svc.portfolio_save(user_id, qid, body))
    _track(user_id, "quest_added_to_portfolio")
    return result


@router.post("/{quest_id}/portfolio-dismiss")
async def quest_portfolio_dismiss(quest_id: str, user_id: str = Depends(verify_jwt)):
    qid = _uuid(quest_id)
    return await _run(user_id, "portfolio_dismiss", lambda: svc.portfolio_dismiss(user_id, qid))
