"""
The chat graph:

    START → load_context → build_prompt → advisor ⇄ tools
                                             └→ END

advisor makes one model call and streams its text through the stream writer
(run the graph with stream_mode="custom"; /chat in app/main.py turns the
chunks into SSE). After it, route_after_advisor sends a tool_use stop to tools,
which runs the tools and loops back, until the model answers in words or
MAX_TOOL_ROUNDS rounds have run; the call at the cap has tools disabled, so
the student always gets a closing reply. A prompt that failed to build ends
the graph before any model call.

A hand-off to another agent is its own node. Beaker (outreach) is the first:
when the advisor calls start_outreach, route_after_advisor sends the turn to
beaker (app/nodes/chat/handoff.py), which runs Beaker's own service with its
own budgets, streams its checklist into the reply, and loops back to the
advisor to say what happened. One per reply, counted in state["handoffs"].

    advisor ─┬→ tools  ─→ advisor
             ├→ beaker ─→ advisor
             └→ END

No checkpointer. load_context re-reads everything from Supabase on every
message and the page resends the conversation, so a saved copy of the state
was never read back, and saving it cost a database write per message over one
shared connection (and kept another copy of the student's notes to delete).
"""
from langgraph.graph import StateGraph, START, END
from app.state import StudentState
from app.nodes.chat.load_context import load_context
from app.nodes.chat.build_prompt import build_prompt
from app.nodes.chat.advisor import MAX_TOOL_ROUNDS, advisor, tools
from app.nodes.chat.handoff import beaker, wants_handoff


def route_after_build(state: StudentState) -> str:
    return "advisor" if state.get("_system_shared") and state.get("_system_student") else END


def route_after_advisor(state: StudentState) -> str:
    if state.get("_stop_reason") == "tool_use" and state.get("rounds", 0) < MAX_TOOL_ROUNDS:
        return "beaker" if wants_handoff(state) else "tools"
    return END


def create_chat_graph():
    builder = StateGraph(StudentState)
    builder.add_node("load_context", load_context)
    builder.add_node("build_prompt", build_prompt)
    builder.add_node("advisor", advisor)
    builder.add_node("tools", tools)
    builder.add_node("beaker", beaker)
    builder.add_edge(START, "load_context")
    builder.add_edge("load_context", "build_prompt")
    builder.add_conditional_edges("build_prompt", route_after_build, {"advisor": "advisor", END: END})
    builder.add_conditional_edges("advisor", route_after_advisor, {"tools": "tools", "beaker": "beaker", END: END})
    builder.add_edge("tools", "advisor")
    builder.add_edge("beaker", "advisor")
    return builder.compile()
