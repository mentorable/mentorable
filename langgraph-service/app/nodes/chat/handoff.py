"""
The chat advisor handing work to another agent. Beaker (outreach) is the
first: the advisor calls start_outreach, the chat graph routes to the beaker
node, and Beaker runs exactly as it does from the Agents page (the same
service, the same try and search budgets, the same refunds), streaming its
checklist into the chat reply.

What chat can and cannot do here:
- Start an outreach: a shortlist for a goal, or research and a draft for a
  named person. It lands on the student's outreach board.
- Never send. Sending is the student's press on the review page, from their
  own Gmail. No chat tool sends anything.
- One hand-off per reply (state["handoffs"]), so one message cannot spend both
  of a student's tries.

A run Beaker has started finishes even if the student leaves the chat
mid-reply: it is a shielded task, as on the Agents page (routers/agents.py),
so a closed tab never leaves a try half spent.

Writer events (app/main.py passes any {"event": ...} chunk through as SSE):
  {"event": "agent_progress", "agent": "outreach", "progress": {...}}   a checklist line
  {"event": "agent_screen", "agent": "outreach", "screen": {...}}       what Beaker is looking at (agents/screen.py)
  {"event": "outreach_started", "outcome": ..., "link": ..., ...}       how it ended
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Optional

from langgraph.config import get_stream_writer

from app.nodes.agents.registry import get_agent
from app.posthog_client import posthog_client
from app.state import StudentState

logger = logging.getLogger(__name__)

START_OUTREACH = "start_outreach"
MAX_HANDOFFS = 1
PURPOSES = ["research", "informational", "internship", "mentorship"]
VOICES = ["formal", "warm", "direct", "humble"]
BOARD = "/agents/outreach"
NEW = "/agents/outreach/new"

START_OUTREACH_TOOL = {
    "name": START_OUTREACH,
    "description": (
        "Hand this to Beaker, the outreach agent, which researches a real person on official pages, checks their "
        "email address, and drafts a short first email the student reviews and sends themselves from the Agents "
        "page. Spends one of their Beaker tries. Use it only after the student has said yes to starting it. Give "
        "person_name for someone specific, or goal to have Beaker find a few people to choose from. Never sends."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "person_name": {"type": "string", "description": "The person's full name, if the student named someone. Otherwise empty."},
            "organization": {"type": "string", "description": "Where that person works, if known. Otherwise empty."},
            "url": {"type": "string", "description": "A link to their page the student gave, if any. Otherwise empty."},
            "goal": {"type": "string", "description": ("When there is no person yet: who the student wants to reach and "
                                                         "why, in 20 to 400 characters. Otherwise empty.")},
            "purpose": {"type": "string", "enum": PURPOSES,
                        "description": "What the student wants from them: research, an informational chat, an internship, or mentorship."},
            "voice": {"type": "string", "enum": VOICES, "description": "How the email should sound. warm if they did not say."},
            "note": {"type": "string", "description": "Anything the student wants the email to mention, in their words, up to 300 characters."},
        },
        "required": ["purpose"],
    },
}


def handoff_tools() -> list[dict]:
    """The hand-off tools on offer: Beaker's, while Beaker is switched on."""
    try:
        return [START_OUTREACH_TOOL] if get_agent("outreach").enabled else []
    except KeyError:
        return []


def wants_handoff(state: StudentState) -> bool:
    """The advisor's last turn asked for a hand-off this reply still has room for."""
    if state.get("handoffs", 0) >= MAX_HANDOFFS:
        return False
    content = (state.get("messages") or [{}])[-1].get("content")
    if not isinstance(content, list):
        return False
    return any(isinstance(b, dict) and b.get("type") == "tool_use" and b.get("name") == START_OUTREACH
               for b in content)


def _text(value, limit: int) -> str:
    return " ".join(value.split())[:limit] if isinstance(value, str) else ""


def _body(args: dict) -> tuple[str, dict]:
    """("shortlist" or "draft", the request body Beaker's service takes)."""
    purpose = args.get("purpose") if args.get("purpose") in PURPOSES else "informational"
    voice = args.get("voice") if args.get("voice") in VOICES else "warm"
    name = _text(args.get("person_name"), 120)
    if name:
        return "draft", {
            "try_id": None, "person": {"name": name, "organization": _text(args.get("organization"), 160),
                                       "url": _text(args.get("url"), 2000)},
            "purpose": purpose, "voice": voice, "length": "brief", "student_note": _text(args.get("note"), 300),
            "answer": None,
        }
    return "shortlist", {"goal": _text(args.get("goal"), 1000)}


# Runs Beaker started from chat, kept until they finish (see the docstring).
_RUNS: set[asyncio.Task] = set()


async def _shielded(work) -> dict:
    task = asyncio.ensure_future(work)
    _RUNS.add(task)
    task.add_done_callback(_RUNS.discard)
    return await asyncio.shield(task)


def _summary(final: dict) -> tuple[dict, Optional[dict]]:
    """(the tool result the advisor reads, the event the page shows)."""
    kind = final.get("type")
    if kind == "draft":
        contact = final.get("contact") or {}
        cid = contact.get("id")
        link = f"{BOARD}/{cid}" if cid else BOARD
        return ({"success": True, "outcome": "draft", "name": contact.get("name"),
                 "organization": contact.get("organization"), "subject": contact.get("subject"),
                 "has_verified_email": bool(contact.get("email")),
                 "note": ("The draft is on their outreach board. Tell them in a sentence or two who it is to and that "
                          "the card below opens it to read, edit and send. Do not write the email out here.")},
                {"event": "outreach_started", "outcome": "draft", "link": link, "name": contact.get("name"),
                 "subject": contact.get("subject")})
    if kind in ("shortlist", "ambiguous"):
        people = [c.get("name") for c in (final.get("candidates") or []) if isinstance(c, dict)]
        return ({"success": True, "outcome": kind, "people": people,
                 "note": ("Beaker found these people. The student picks one on the Agents page (the card below), "
                          "which costs no extra try. Do not pick for them.")},
                {"event": "outreach_started", "outcome": kind, "link": NEW, "people": people})
    if kind == "question":
        return ({"success": True, "outcome": "question", "question": final.get("question"),
                 "note": "Beaker needs one answer before it writes. The student answers on the Agents page (the card below)."},
                {"event": "outreach_started", "outcome": "question", "link": NEW, "question": final.get("question")})
    message = final.get("message") or "Beaker could not finish this one."
    return ({"success": False, "outcome": "error", "error": final.get("error"), "message": message,
             "try_given_back": bool(final.get("refunded"))},
            {"event": "outreach_started", "outcome": "error", "link": BOARD, "message": message})


async def start_outreach(user_id: str, args: dict, writer) -> dict:
    """Run Beaker for this student. Returns the tool result for the advisor."""
    from app.nodes.agents.outreach import service as beaker      # imported late: it is a big module
    mode, body = _body(args if isinstance(args, dict) else {})
    if mode == "shortlist" and len(body["goal"]) < 20:
        return {"success": False, "error": "bad_goal",
                "message": "Give either the person's name, or a goal of at least a sentence saying who to reach and why."}

    async def emit(event: dict):
        if isinstance(event, dict) and event.get("type") == "progress":
            writer({"event": "agent_progress", "agent": "outreach", "progress": event})
        elif isinstance(event, dict) and event.get("type") == "screen":
            writer({"event": "agent_screen", "agent": "outreach", "screen": event})

    run = beaker.shortlist(user_id, body, emit) if mode == "shortlist" else beaker.draft(user_id, body, emit)
    try:
        final = await _shielded(run)
    except beaker.AgentError as exc:            # refused before any work: no tries left, busy, switched off
        result = {"success": False, "outcome": "refused", "error": exc.code, "message": exc.message}
        writer({"event": "outreach_started", "outcome": "error", "link": BOARD, "message": exc.message})
        return result
    except Exception:
        logger.exception(f"[chat] Beaker hand-off failed for {user_id}")
        writer({"event": "outreach_started", "outcome": "error", "link": BOARD,
                "message": "Beaker could not finish this one."})
        return {"success": False, "outcome": "error", "message": "Beaker could not finish this one."}
    result, event = _summary(final if isinstance(final, dict) else {})
    if event:
        writer(event)
    posthog_client.capture("outreach_started_via_chat", distinct_id=user_id,
                           properties={"mode": mode, "outcome": result.get("outcome")})
    return result


async def beaker(state: StudentState) -> StudentState:
    """The chat graph's hand-off node: run start_outreach (once), and answer the
    turn's other tool calls the way the tools node would."""
    from app.nodes.chat.advisor import run_tool
    writer = get_stream_writer()
    user_id = state["user_id"]
    last = (state.get("messages") or [{}])[-1]
    writer({"tools_ran": True})          # a try may be spent from here: the chat message is not given back
    results, handed = [], state.get("handoffs", 0)
    for block in last.get("content") or []:
        if not isinstance(block, dict) or block.get("type") != "tool_use":
            continue
        if block.get("_bad_args"):
            result = {"success": False, "error": "The tool arguments were not valid JSON."}
        elif block["name"] == START_OUTREACH:
            if handed >= MAX_HANDOFFS:
                result = {"success": False, "error": "one_per_reply",
                          "message": "Beaker can start one outreach per message."}
            else:
                handed += 1
                result = await start_outreach(user_id, dict(block.get("input") or {}), writer)
        else:
            result = await run_tool(user_id, block["name"], dict(block.get("input") or {}), writer)
        results.append({"type": "tool_result", "tool_use_id": block["id"], "content": json.dumps(result)})
    return {"messages": [{"role": "user", "content": results}], "rounds": state.get("rounds", 0) + 1,
            "handoffs": handed}
