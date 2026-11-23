"""
advisor and tools: the chat graph's tool-use loop.

advisor makes one model call per visit and streams its text to the client
through LangGraph's stream writer; tools runs every tool the model asked for
and feeds the results back. The graph (app/graphs/chat.py) loops the two until
the model answers in words or MAX_TOOL_ROUNDS is reached, when one last call
is made with tools disabled so the student always gets a closing reply.

The conversation lives in state["messages"] as Anthropic-format plain dicts
(never SDK block objects), whichever provider the student picked: the OpenAI
path converts to and from Chat Completions at the call.

What the writer sends, and /chat turns into SSE (app/main.py):
  {"ready": True}                    once, before the first call (the prompt was built)
  {"text": "..."}                    reply text, TURN_SEPARATOR included
  {"tools_ran": True}                before a round of tools runs (no refund after this)
  {"event": "portfolio_changed"|"quest_changed", "verb", "item"}
"""
import json
import logging

from langgraph.config import get_stream_writer

from app import costs
from app import llm
from app.llm import _anthropic
from app.models import CHAT_DEFAULT, CHAT_MODELS
from app.nodes.chat.handoff import START_OUTREACH
from app.nodes.chat.tools import QUEST_WRITE_TOOLS, TOOL_VERB, WRITE_TOOLS, execute_chat_tool, tools_for
from app.posthog_client import posthog_client
from app.state import StudentState

logger = logging.getLogger(__name__)

# Put between an assistant turn that called a tool and the turn that follows it,
# so the two do not run together in the client's rendered text. A blank line
# rather than a space, because the model treats each turn as its own paragraph.
TURN_SEPARATOR = "\n\n"

CHAT_MAX_TOKENS = 2048
# Tool rounds in one reply. Five covers a view, a few writes and a confirmation;
# the last call is told to answer in words, so a model stuck calling tools
# cannot loop (and bill) without end.
MAX_TOOL_ROUNDS = 5
# A model that thinks spends part of max_tokens thinking, so it gets more room.
# A cap, not a spend.
CHAT_MAX_TOKENS_THINKING = 4096
CHAT_MAX_TOKENS_OPENAI = 8192      # includes the invisible reasoning tokens
CHAT_REFUSED = ("I can't help with that one here. If something serious is going on, please talk to a "
                "school counselor or a trusted adult.")
_CACHE = {"type": "ephemeral"}


# ── Message helpers ──────────────────────────────────────────────────────────

def _btype(block):
    return block.get("type") if isinstance(block, dict) else getattr(block, "type", None)


def _without_thinking(message: dict) -> dict:
    """An assistant turn with its thinking blocks removed (for a re-run on
    another model); every other message unchanged."""
    content = message.get("content")
    if message.get("role") != "assistant" or isinstance(content, str):
        return message
    return {**message, "content": [b for b in content if _btype(b) not in ("thinking", "redacted_thinking")]}


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


def _block_dict(block) -> dict:
    """An SDK content block as a plain dict the API accepts back."""
    if isinstance(block, dict):
        return dict(block)
    if hasattr(block, "model_dump"):
        return block.model_dump(mode="json", exclude_none=True)
    return {k: v for k, v in vars(block).items() if v is not None}


def _openai_tools(tools: list[dict]) -> list[dict]:
    """The chat tools in OpenAI's function format (same names and schemas)."""
    return [{"type": "function", "function": {
        "name": t["name"], "description": t.get("description", ""),
        "parameters": t.get("input_schema") or {"type": "object", "properties": {}}}}
        for t in tools]


def _to_openai(messages: list[dict]) -> list[dict]:
    """Anthropic-format turns as Chat Completions messages: tool_use blocks
    become tool_calls, each tool_result its own "tool" message."""
    out: list[dict] = []
    for m in messages:
        content = m["content"]
        if isinstance(content, str):
            out.append({"role": m["role"], "content": content})
        elif m["role"] == "assistant":
            text = "".join(b.get("text", "") for b in content if b.get("type") == "text")
            calls = [{"id": b["id"], "type": "function", "function": {
                "name": b["name"], "arguments": b.get("_raw_args") or json.dumps(b.get("input") or {})}}
                for b in content if b.get("type") == "tool_use"]
            msg = {"role": "assistant", "content": text or None}
            if calls:
                msg["tool_calls"] = calls
            out.append(msg)
        else:
            for b in content:
                if b.get("type") == "tool_result":
                    out.append({"role": "tool", "tool_call_id": b["tool_use_id"], "content": b["content"]})
                elif b.get("type") == "text":
                    out.append({"role": "user", "content": b["text"]})
    return out


class _Reply:
    """Streams reply text, putting TURN_SEPARATOR before the first text of a
    turn that follows earlier text: the client appends raw chunks, so the
    previous turn's last character would otherwise run into this one's first
    ("...all the changes at once.Got all the IDs.")."""

    def __init__(self, writer, earlier: str):
        self.writer, self.total, self.turn = writer, earlier, ""

    def new_turn(self):
        self.turn = ""

    def say(self, text: str):
        if not self.turn and self.total:
            self.total += TURN_SEPARATOR
            self.writer({"text": TURN_SEPARATOR})
        self.total += text
        self.turn += text
        self.writer({"text": text})


# ── advisor ──────────────────────────────────────────────────────────────────

async def advisor(state: StudentState) -> StudentState:
    """One model call (two, when a newer model declines and the turn is re-run
    on the default). Returns the assistant turn and why it stopped."""
    writer = get_stream_writer()
    if not state.get("rounds") and not state.get("current_response"):
        writer({"ready": True})
    pick = state.get("_pick") or CHAT_MODELS[CHAT_DEFAULT]
    if pick["provider"] == "openai":
        return await _openai_call(state, pick, writer)
    return await _claude_call(state, pick, writer)


async def _claude_call(state: StudentState, pick: dict, writer) -> StudentState:
    """A newer model that declines a turn before writing anything gets that
    turn re-run on the default model (Haiku 5.5 has no server-side fallback;
    Sonnet 5.5's covers only some categories), without the thinking blocks the
    first model wrote."""
    user_id = state["user_id"]
    # Two cached blocks: the shared rules first (the same for every student,
    # so one student's cache serves the next), then this student's block.
    system = [
        {"type": "text", "text": state.get("_system_shared") or "", "cache_control": _CACHE},
        {"type": "text", "text": state.get("_system_student") or "", "cache_control": _CACHE},
    ]
    # recall_memory is only offered while the student has memory on.
    chat_tools = tools_for(state.get("profile") or {})
    messages = list(state.get("messages") or [])
    strip_before = state.get("_strip_thinking_before")
    default = CHAT_MODELS[CHAT_DEFAULT]
    reply = _Reply(writer, state.get("current_response") or "")
    out: dict = {}

    while True:
        model, effort = pick["model"], pick["effort"]
        conversation = messages
        if strip_before is not None:
            # Thinking blocks the first model wrote mean nothing to the default.
            conversation = [_without_thinking(m) for m in messages[:strip_before]] + messages[strip_before:]
        extra: dict = {}
        if state.get("rounds", 0) >= MAX_TOOL_ROUNDS:
            extra["tool_choice"] = {"type": "none"}
        if effort:
            # In extra_body so an SDK that predates output_config still sends it.
            extra["extra_body"] = {"output_config": {"effort": effort}}
        reply.new_turn()
        async with _anthropic.messages.stream(
            model=model,
            max_tokens=CHAT_MAX_TOKENS_THINKING if effort else CHAT_MAX_TOKENS,
            system=system,
            messages=_mark_cache(conversation),
            tools=chat_tools,
            **extra,
        ) as stream:
            async for text in stream.text_stream:
                reply.say(text)
            final_message = await stream.get_final_message()

        costs.record_anthropic("chat", model, getattr(final_message, "usage", None))
        stop = final_message.stop_reason
        if stop == "refusal" and not reply.turn:
            if model != default["model"]:
                logger.info(f"[chat] {model} declined a turn for {user_id}; re-running it on {default['model']}")
                pick, strip_before = default, len(messages)
                out.update({"_pick": pick, "_strip_thinking_before": strip_before})
                continue
            reply.say(CHAT_REFUSED)
            return {**out, "messages": [{"role": "assistant", "content": CHAT_REFUSED}],
                    "_stop_reason": "refusal", "current_response": reply.total}
        if stop == "max_tokens":
            logger.warning(f"[chat] reply for {user_id} on {model} cut off at max_tokens")
        # The assistant turn (text, thinking and tool_use blocks) verbatim.
        turn = {"role": "assistant", "content": [_block_dict(b) for b in final_message.content]}
        return {**out, "messages": [turn], "_stop_reason": stop, "current_response": reply.total}


async def _openai_call(state: StudentState, pick: dict, writer) -> StudentState:
    """The same call on OpenAI's Chat Completions API: one system message
    (OpenAI caches a repeated prefix on its own), the same tools as functions,
    streamed text, and tool calls assembled from their deltas."""
    client = llm._openai
    model, effort = pick["model"], pick["effort"]
    system = (state.get("_system_shared") or "") + "\n\n" + (state.get("_system_student") or "")
    messages = [{"role": "system", "content": system}] + _to_openai(state.get("messages") or [])
    params = {"model": model, "messages": messages, "tools": _openai_tools(tools_for(state.get("profile") or {})),
              "stream": True, "stream_options": {"include_usage": True},
              "max_completion_tokens": CHAT_MAX_TOKENS_OPENAI}
    if state.get("rounds", 0) >= MAX_TOOL_ROUNDS:
        params["tool_choice"] = "none"
    if effort:
        params["reasoning_effort"] = effort
    out: dict = {}
    try:
        stream = await client.chat.completions.create(**params)
    except Exception as exc:
        if effort and llm._rejects_param(exc, "reasoning_effort"):
            params.pop("reasoning_effort", None)
            # Later rounds of this reply skip it too.
            out["_pick"] = {**pick, "effort": None}
            stream = await client.chat.completions.create(**params)
        else:
            raise
    reply = _Reply(writer, state.get("current_response") or "")
    calls, usage = {}, None
    async for chunk in stream:
        if getattr(chunk, "usage", None):
            usage = chunk.usage
        if not chunk.choices:
            continue
        delta = chunk.choices[0].delta
        if getattr(delta, "content", None):
            reply.say(delta.content)
        for tc in getattr(delta, "tool_calls", None) or []:
            slot = calls.setdefault(tc.index, {"id": "", "name": "", "args": ""})
            if tc.id:
                slot["id"] = tc.id
            fn = getattr(tc, "function", None)
            if fn is not None:
                slot["name"] += fn.name or ""
                slot["args"] += fn.arguments or ""
    costs.record_openai("chat", model, usage)

    content: list[dict] = [{"type": "text", "text": reply.turn}] if reply.turn else []
    if not calls:
        if not reply.total:
            # Cut off, filtered or refused with nothing said: an error, so the
            # message is given back rather than a blank reply.
            raise RuntimeError(f"{model} returned no text")
        return {**out, "messages": [{"role": "assistant", "content": content}], "_stop_reason": "end_turn",
                "current_response": reply.total}
    for i in sorted(calls):
        c = calls[i]
        raw = c["args"] or "{}"
        try:
            args = json.loads(raw)
        except ValueError:
            args = None
        # The raw arguments go back to OpenAI as it sent them; a call whose
        # arguments are not a JSON object is answered with an error, never run.
        block = {"type": "tool_use", "id": c["id"], "name": c["name"],
                 "input": args if isinstance(args, dict) else {}, "_raw_args": raw}
        if not isinstance(args, dict):
            block["_bad_args"] = True
        content.append(block)
    return {**out, "messages": [{"role": "assistant", "content": content}], "_stop_reason": "tool_use",
            "current_response": reply.total}


# ── tools ────────────────────────────────────────────────────────────────────

async def tools(state: StudentState) -> StudentState:
    """Run every tool_use block of the last assistant turn, in order, and
    answer them all in one user turn."""
    writer = get_stream_writer()
    user_id = state["user_id"]
    last = (state.get("messages") or [{}])[-1]
    writer({"tools_ran": True})
    results = []
    for block in last.get("content") or []:
        if not isinstance(block, dict) or block.get("type") != "tool_use":
            continue
        if block.get("_bad_args"):
            result = {"success": False, "error": "The tool arguments were not valid JSON."}
        else:
            result = await run_tool(user_id, block["name"], dict(block.get("input") or {}), writer)
        results.append({"type": "tool_result", "tool_use_id": block["id"], "content": json.dumps(result)})
    return {"messages": [{"role": "user", "content": results}], "rounds": state.get("rounds", 0) + 1}


async def run_tool(user_id: str, name: str, args: dict, writer) -> dict:
    """Run one chat tool, and tell the page about a write. A hand-off only runs
    in its own graph node; one that reaches here is past the per-reply cap."""
    if name == START_OUTREACH:
        return {"success": False, "error": "one_per_reply", "message": "Beaker can start one outreach per message."}
    result = await execute_chat_tool(user_id, name, args)
    if result.get("success") and name in WRITE_TOOLS:
        # Writes surface as a UI toast; reads (view_portfolio) stay silent.
        writer({"event": "portfolio_changed", "verb": TOOL_VERB.get(name, "Updated"), "item": result})
        posthog_client.capture("portfolio_changed_via_chat", distinct_id=user_id,
                               properties={"tool": name, "kind": result.get("kind")})
    elif result.get("success") and name in QUEST_WRITE_TOOLS:
        # The nav streak chip and the Quest page listen for this.
        writer({"event": "quest_changed", "verb": TOOL_VERB.get(name, "Updated"), "item": result})
        posthog_client.capture("quest_changed_via_chat", distinct_id=user_id,
                               properties={"tool": name, "changed": result.get("changed")})
    return result
