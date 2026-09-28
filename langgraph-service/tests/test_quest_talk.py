"""
The short conversation before a quest is planned.

The page sends the whole conversation back every turn, so these rules are what
keep it bounded: roles, order, length and the question cap. Run from
langgraph-service/:

    python3 -m pytest tests/
"""
import os

for _k in ("SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "ANTHROPIC_API_KEY",
           "DATABASE_URL", "CORS_ORIGIN"):
    os.environ.setdefault(_k, "stub")

from app.nodes.quest import plan  # noqa: E402
from app.nodes.quest.talk import (  # noqa: E402
    MAX_ANSWER_CHARS, MAX_QUESTIONS, TALK_PROMPT, clean_messages, clean_turn, questions_asked, render,
)


def turns(*pairs):
    out = []
    for q, a in pairs:
        out.append({"role": "assistant", "content": q})
        if a is not None:
            out.append({"role": "user", "content": a})
    return out


def test_roles_are_normalised_and_order_is_enforced():
    msgs = clean_messages(turns(("What do you want at the end?", "an app"), ("What have you built?", None)))
    assert [m["role"] for m in msgs] == ["advisor", "student", "advisor"]
    # A conversation that does not start with the advisor, or repeats a speaker, is cut there.
    assert clean_messages([{"role": "user", "content": "hi"}]) == []
    bad = [{"role": "assistant", "content": "Q1"}, {"role": "assistant", "content": "Q2"}]
    assert [m["content"] for m in clean_messages(bad)] == ["Q1"]


def test_empty_lines_and_junk_are_dropped_and_answers_clipped():
    msgs = clean_messages([{"role": "assistant", "content": "Q"}, {"role": "user", "content": "   "},
                           "junk", {"role": "user", "content": "x" * 5000}])
    assert msgs[1]["content"] == "x" * MAX_ANSWER_CHARS


def test_a_forged_long_conversation_is_capped():
    msgs = clean_messages(turns(*[(f"Q{i}", f"A{i}") for i in range(10)]))
    assert questions_asked(msgs) == MAX_QUESTIONS and len(msgs) == MAX_QUESTIONS * 2


def test_the_cap_forces_the_finish_even_if_the_model_wants_more():
    assert clean_turn({"done": False, "message": "One more?"}, MAX_QUESTIONS)["done"] is True
    assert clean_turn({"done": False, "message": "What is it for?"}, 1)["done"] is False


def test_an_unusable_turn_is_rejected_and_em_dashes_removed():
    assert clean_turn(None, 0) is None
    assert clean_turn({"done": False, "message": ""}, 0) is None
    assert "—" not in clean_turn({"done": True, "message": "Got it — an app."}, 2)["message"]


def test_render_labels_both_sides():
    assert render(clean_messages(turns(("Q?", "A.")))) == "Advisor: Q?\nStudent: A."


def test_the_plan_prompt_carries_the_conversation_only_when_there_was_one():
    assert plan.conversation_block("") == ""
    block = plan.conversation_block("Advisor: Q?\nStudent: A.")
    assert "WHAT THEY TOLD THE ADVISOR" in block and "Student: A." in block
    assert "{conversation_block}" in plan.PLAN_PROMPT


def test_the_plan_keeps_a_direction():
    raw = {"title": "T", "summary": "S", "goal_kind": "research", "direction": "You want a paper — by May.",
           "milestones": [{"title": f"M{i}", "description": "d", "days": 3} for i in range(3)]}
    cleaned = plan.clean_plan(raw)
    assert cleaned["direction"] == "You want a paper, by May."


def test_the_talk_prompt_formats_and_has_no_em_dash():
    text = TALK_PROMPT.format(goal="g", record="r", conversation="c", asked=0, max_q=4, rule="\n")
    assert "—" not in text
