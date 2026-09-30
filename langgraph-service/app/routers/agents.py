"""
Agents endpoints: Beaker the outreach pelican, and the Gmail connection every
agent shares. Thin on purpose: parse the request, call the service, map its
refusals to HTTP. The rules live in app/nodes/agents/.

Every route needs a valid Supabase JWT except the OAuth callback, which Google
calls in the student's browser: the signed state it carries says whose
connection it is. The browser sends its time zone in an X-Timezone header,
used only while none is stored.

The two long calls (shortlist, draft) are Server-Sent Events: a checklist of
progress events, then one final event, then [DONE]. The work runs as a task
that keeps going if the browser goes away, so a paid try always ends on the
board or refunded. The service stops a run at its own deadline and gives the
try back ("timed_out"); the stream has a later one of its own, in case a run
ever gets stuck past that. Anything refused before the work starts (a bad
body, no tries left) is a plain HTTP error instead of a stream.
"""
import asyncio
import json
import logging
from typing import Awaitable, Callable, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse, StreamingResponse

from app import config
from app.auth import verify_jwt
from app.nodes.agents import google
from app.nodes.agents.google import GoogleError
from app.nodes.agents.outreach import service as svc
from app.nodes.agents.outreach.service import AgentError
from app.posthog_client import posthog_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/agents", tags=["agents"])

# A comment line this often keeps idle-connection timeouts (Render's proxy,
# the browser) from cutting a long search off.
PING_EVERY = 10.0
SERVER_ERROR = "Something went wrong. Try again."
# The stream's own deadline: past the service's (which gives the try back), so
# it only fires if a run is stuck somewhere the service's cannot reach.
STREAM_GRACE = 30.0
TIMED_OUT = "Beaker took too long on this one and stopped."

# The running shortlist and draft tasks. A bare create_task can be garbage
# collected mid-flight, and these must finish even after the browser leaves.
_TASKS: set[asyncio.Task] = set()
_END = object()


def _tz(raw: Request) -> Optional[str]:
    return raw.headers.get("x-timezone")


async def _body(raw: Request) -> dict:
    try:
        data = await raw.json()
    except Exception:
        return {}
    return data if isinstance(data, dict) else {}


def _track(user_id: str, event: str, **props) -> None:
    try:
        posthog_client.capture(event, distinct_id=user_id, properties=props)
    except Exception:
        pass


def _refusal(exc: AgentError) -> HTTPException:
    return HTTPException(status_code=exc.status, detail={"error": exc.code, "message": exc.message})


def _server_error() -> HTTPException:
    return HTTPException(status_code=500, detail={"error": "server_error", "message": SERVER_ERROR})


async def _run(user_id: str, label: str, call: Callable[[], Awaitable]):
    """Await the service, turning its refusals into HTTP errors the page can
    show. The service puts its blocking database calls on worker threads."""
    try:
        return await call()
    except AgentError as exc:
        raise _refusal(exc)
    except HTTPException:
        raise
    except Exception:
        logger.exception(f"[agents] {label} failed for {user_id}")
        raise _server_error()


def _frame(event: dict) -> str:
    return "data: " + json.dumps(event) + "\n\n"


async def _sse(user_id: str, label: str, work: Callable[[Callable], Awaitable[dict]]) -> StreamingResponse:
    """Run `work(emit)` as a background task and stream what it emits.

    Until its first event the request can still fail as plain HTTP: a refusal
    raised before then (validation, no tries left, busy) becomes the matching
    status. After it, every outcome is a final event in the stream."""
    queue: asyncio.Queue = asyncio.Queue()
    started = asyncio.Event()

    async def emit(event: dict) -> None:
        started.set()
        queue.put_nowait(event)

    async def job() -> dict:
        try:
            final = await asyncio.wait_for(work(emit), svc.RUN_DEADLINE + STREAM_GRACE)
        except asyncio.TimeoutError:
            if not started.is_set():
                raise
            logger.error(f"[agents] {label} for {user_id} ran past the stream's deadline")
            final = {"type": "error", "error": "timed_out", "message": TIMED_OUT, "refunded": False}
        except AgentError as exc:
            if not started.is_set():
                raise
            final = {"type": "error", "error": exc.code, "message": exc.message, "refunded": False}
        except Exception:
            if not started.is_set():
                raise
            logger.exception(f"[agents] {label} failed for {user_id} after it started")
            final = {"type": "error", "error": "server_error", "message": SERVER_ERROR, "refunded": False}
        queue.put_nowait(final)
        queue.put_nowait(_END)
        kind = final.get("type") if isinstance(final, dict) else None
        _track(user_id, f"outreach_{label}", result=kind if kind != "error" else final.get("error"))
        return final

    task = asyncio.get_running_loop().create_task(job())
    _TASKS.add(task)
    task.add_done_callback(_TASKS.discard)

    waiter = asyncio.ensure_future(started.wait())
    try:
        await asyncio.wait({task, waiter}, return_when=asyncio.FIRST_COMPLETED)
    finally:
        waiter.cancel()
    if task.done() and task.cancelled():
        raise _server_error()
    if task.done() and task.exception() is not None:
        exc = task.exception()
        if isinstance(exc, AgentError):
            raise _refusal(exc)
        logger.error(f"[agents] {label} failed for {user_id}: {type(exc).__name__}: {exc}")
        raise _server_error()

    async def stream():
        while True:
            try:
                item = await asyncio.wait_for(queue.get(), timeout=PING_EVERY)
            except asyncio.TimeoutError:
                yield ": ping\n\n"
                continue
            if item is _END:
                break
            yield _frame(item)
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


# ── Beaker ────────────────────────────────────────────────────────────────────

@router.get("/outreach/status")
async def outreach_status(raw: Request, user_id: str = Depends(verify_jwt)):
    return await _run(user_id, "status", lambda: svc.status(user_id, _tz(raw)))


@router.post("/outreach/shortlist")
async def outreach_shortlist(raw: Request, user_id: str = Depends(verify_jwt)):
    body = await _body(raw)
    return await _sse(user_id, "shortlist", lambda emit: svc.shortlist(user_id, body, emit))


@router.post("/outreach/draft")
async def outreach_draft(raw: Request, user_id: str = Depends(verify_jwt)):
    body = await _body(raw)
    return await _sse(user_id, "draft", lambda emit: svc.draft(user_id, body, emit))


@router.post("/outreach/contacts/{contact_id}/rewrite")
async def outreach_rewrite(contact_id: str, raw: Request, user_id: str = Depends(verify_jwt)):
    body = await _body(raw)
    result = await _run(user_id, "rewrite", lambda: svc.rewrite(user_id, contact_id, body, _tz(raw)))
    _track(user_id, "outreach_rewrite", style=body.get("style"))
    return result


@router.post("/outreach/contacts/{contact_id}/followup")
async def outreach_followup(contact_id: str, raw: Request, user_id: str = Depends(verify_jwt)):
    result = await _run(user_id, "followup", lambda: svc.followup(user_id, contact_id, _tz(raw)))
    _track(user_id, "outreach_followup_drafted")
    return result


@router.post("/outreach/contacts/{contact_id}/send")
async def outreach_send(contact_id: str, raw: Request, user_id: str = Depends(verify_jwt)):
    body = await _body(raw)
    result = await _run(user_id, "send", lambda: svc.send(user_id, contact_id, body, _tz(raw)))
    _track(user_id, "outreach_sent", kind=body.get("kind"))
    return result


# ── Gmail ─────────────────────────────────────────────────────────────────────

@router.get("/google/status")
async def google_status(user_id: str = Depends(verify_jwt)):
    return await _run(user_id, "google_status", lambda: svc.gmail_status(user_id))


@router.post("/google/connect")
async def google_connect(raw: Request, user_id: str = Depends(verify_jwt)):
    body = await _body(raw)
    if not google.is_configured():
        raise HTTPException(status_code=503, detail={"error": "not_configured",
                                                     "message": google.MESSAGES["not_configured"]})
    try:
        state = google.make_state(user_id, body.get("return_to"))
        url = google.auth_url(state, google.redirect_uri(str(raw.base_url)))
    except GoogleError as exc:
        status = 503 if exc.code == "not_configured" else 500
        raise HTTPException(status_code=status, detail={"error": exc.code, "message": exc.message})
    return {"url": url}


def _back_to_app(return_to: str, outcome: str, code: str = "") -> RedirectResponse:
    """Back to the page the student connected from, saying how it went. A
    "confirm" carries the one-time code the page finishes the connection with."""
    path = google.safe_return_to(return_to)
    extra = f"&code={code}" if code else ""
    return RedirectResponse(f"{config.APP_URL}{path}?gmail={outcome}{extra}", status_code=302,
                            headers={"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"})


@router.get("/google/connect/callback")
async def google_callback(raw: Request, code: str = "", state: str = "", error: str = ""):
    """Google sends the student's browser here after the consent screen. No
    JWT: the state (encrypted, ten minutes) says who started the connect. The
    connection is only held here; the signed-in page confirms it (/google/finish)."""
    return_to = google.DEFAULT_RETURN_TO
    try:
        user_id, return_to = google.read_state(state)
    except GoogleError:
        return _back_to_app(return_to, "error")
    if error:
        # access_denied: the student pressed Cancel on Google's screen.
        return _back_to_app(return_to, "denied" if error == "access_denied" else "error")
    try:
        got = await google.exchange_code(code, google.redirect_uri(str(raw.base_url)))
        held = google.hold_pending(user_id, got["email"], got["scope"], got["refresh_token"])
    except GoogleError as exc:
        # scope_missing: they unticked "send email on your behalf".
        return _back_to_app(return_to, "denied" if exc.code == "scope_missing" else "error")
    except Exception as exc:
        logger.error(f"[agents] saving the Gmail connection failed for {user_id}: {type(exc).__name__}")
        return _back_to_app(return_to, "error")
    return _back_to_app(return_to, "confirm", held)


@router.post("/google/finish")
async def google_finish(raw: Request, user_id: str = Depends(verify_jwt)):
    """Save the connection Google just granted, if this signed-in student is the
    one who started it."""
    body = await _body(raw)
    try:
        result = await google.finish(user_id, body.get("code"))
    except GoogleError as exc:
        status = {"expired": 410, "wrong_account": 403}.get(exc.code, 500)
        raise HTTPException(status_code=status, detail={"error": exc.code, "message": exc.message})
    except Exception as exc:
        logger.error(f"[agents] saving the Gmail connection failed for {user_id}: {type(exc).__name__}")
        raise HTTPException(status_code=500, detail={"error": "server_error",
                                                     "message": "Could not save your Gmail connection. Connect again."})
    _track(user_id, "gmail_connected")
    return result


@router.post("/google/disconnect")
async def google_disconnect(user_id: str = Depends(verify_jwt)):
    try:
        await google.disconnect(user_id)
    except Exception as exc:
        logger.error(f"[agents] disconnecting Gmail failed for {user_id}: {type(exc).__name__}")
        raise HTTPException(status_code=500, detail={"error": "server_error",
                                                     "message": "Could not disconnect Gmail. Try again."})
    _track(user_id, "gmail_disconnected")
    return {"connected": False}
