"""
Helpers shared by the quest model calls: cleaning what the model wrote, and
rendering the student's record for a prompt.
"""
import re

from app.nodes.onboarding.intake import load_student_record, render_record_context

GOAL_KINDS = ["passion_project", "competition_prep", "research", "other"]

_EM_DASH = re.compile(r"\s*—\s*")


def clean_text(value, limit: int) -> str:
    """Model text made safe to show: a string, no em dashes, within `limit`.

    The prompts forbid em dashes, but models still reach for them, and the
    product rule is that none reach a student. Cut on a word boundary so a
    truncated sentence does not end mid-word.
    """
    if not isinstance(value, str):
        return ""
    text = _EM_DASH.sub(", ", value).replace("—", ", ")
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= limit:
        return text
    cut = text[:limit]
    space = cut.rfind(" ")
    if space > limit * 0.6:
        cut = cut[:space]
    return cut.rstrip(" ,;:-")


def clean_kind(value) -> str:
    return value if value in GOAL_KINDS else "other"


def student_context(user_id: str) -> tuple[str, dict]:
    """The student's record as prompt text, plus the raw record for anything
    else the caller needs (grade, narrative gaps)."""
    record = load_student_record(user_id)
    text = render_record_context(record)
    narrative = (record.get("profile") or {}).get("narrative") or {}
    if isinstance(narrative, dict):
        if narrative.get("theme"):
            text += f"\nThrough-line in their record: {narrative['theme']}"
        if narrative.get("summary"):
            text += f"\nWho they are: {narrative['summary']}"
    return text, record


def grade_line(record: dict) -> str:
    grade = (record.get("profile") or {}).get("grade_level")
    return f"They are in grade {grade}." if grade else "Their grade is not recorded."
