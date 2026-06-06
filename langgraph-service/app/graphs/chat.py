"""
Chat graph — Sprint 2.
Nodes: load_context → build_prompt → END
Streaming and extract_signals run in the FastAPI endpoint, not as graph nodes,
so token-level SSE can flow directly to the client.
"""
from langgraph.graph import StateGraph, START, END
from app.state import StudentState
from app.nodes.chat.load_context import load_context
from app.nodes.chat.build_prompt import build_prompt


def create_chat_graph(checkpointer):
    builder = StateGraph(StudentState)
    builder.add_node("load_context", load_context)
    builder.add_node("build_prompt", build_prompt)
    builder.add_edge(START, "load_context")
    builder.add_edge("load_context", "build_prompt")
    builder.add_edge("build_prompt", END)
    return builder.compile(checkpointer=checkpointer)
