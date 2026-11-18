"""
The chat graph: load_context, then build_prompt.

Streaming, the tool loop and extract_signals run in the FastAPI endpoint
(app/main.py), so token-level SSE flows straight to the client.

No checkpointer. load_context re-reads everything from Supabase on every
message, so a saved copy of the state was never read back, and saving it cost a
database write per message over one shared connection (and kept another copy
of the student's notes to delete).
"""
from langgraph.graph import StateGraph, START, END
from app.state import StudentState
from app.nodes.chat.load_context import load_context
from app.nodes.chat.build_prompt import build_prompt


def create_chat_graph():
    builder = StateGraph(StudentState)
    builder.add_node("load_context", load_context)
    builder.add_node("build_prompt", build_prompt)
    builder.add_edge(START, "load_context")
    builder.add_edge("load_context", "build_prompt")
    builder.add_edge("build_prompt", END)
    return builder.compile()
