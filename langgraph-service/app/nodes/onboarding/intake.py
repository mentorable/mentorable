"""
College application intake — extraction and commit.

The student fills a minimal form (numbers and names), then talks to either a text
or a voice interviewer. The interview is deliberately concrete: it walks their
listed activities and awards asking what they actually did, and never asks them
to reflect on a theme or justify their majors. This module turns that into:

  * structured Common App detail for every activity that came up
  * a narrative (theme inferred silently from the record, concerns they raised,
    gaps, and their own phrasing for later essay work)

Extraction writes to `profiles.intake_draft` rather than committing. The student
reviews and edits the draft; `commit_intake` then writes it into the real tables.
That split is deliberate: extraction infers things the student never typed (hours
per week, position titles, which activities matter), and a bad inference must not
silently become the foundation of every later recommendation.

See .claude/COLLEGE_PIVOT.md.
"""
import asyncio
import json
import logging
import re
from datetime import datetime, timezone

from anthropic import AsyncAnthropic

from app.config import ANTHROPIC_API_KEY
from app.db.supabase import get_supabase

logger = logging.getLogger(__name__)

_anthropic = AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
SONNET = "claude-sonnet-4-6"

# Common App activity categories, plus a catch-all.
ACTIVITY_CATEGORIES = [
    "Academic", "Art", "Athletics: Club", "Athletics: JV/Varsity", "Career Oriented",
    "Community Service (Volunteer)", "Computer/Technology", "Cultural", "Dance", "Debate/Speech",
    "Environmental", "Family Responsibilities", "Foreign Exchange", "Foreign Language",
    "Internship", "Journalism/Publication", "Junior R.O.T.C.", "LGBT", "Music: Instrumental",
    "Music: Vocal", "Religious", "Research", "Robotics", "School Spirit",
    "Science/Math", "Student Govt./Politics", "Theater/Drama", "Work (Paid)", "Other",
]

AWARD_LEVELS = ["school", "regional", "state", "national", "international"]

# No cap on how many activities get enriched: the interview now works through the
# student's whole list rather than curating a narrative "spike", so extraction
# enriches whatever was actually discussed. The turn budget bounds this naturally.


async def _create_with_retry(**kwargs):
    """Call Anthropic with a few backoff retries for transient failures."""
    last = None
    for attempt in range(3):
        try:
            return await _anthropic.messages.create(**kwargs)
        except Exception as exc:
            last = exc
            if attempt < 2:
                await asyncio.sleep(0.8 * (2 ** attempt))
    raise last


def _parse_json(text: str):
    try:
        return json.loads(text)
    except Exception:
        pass
    match = re.search(r"\{[\s\S]*\}", text)
    if match:
        try:
            return json.loads(match.group(0))
        except Exception:
            pass
    return None


# ── Record loading ────────────────────────────────────────────────────────────

def load_student_record(user_id: str) -> dict:
    """Read everything the form collected. Used both to seed the interviewer and to
    give extraction the list of activities it is allowed to enrich."""
    supabase = get_supabase()

    def rows(table: str, order: str = "order_index"):
        try:
            return (
                supabase.from_(table).select("*").eq("user_id", user_id)
                .order(order).execute().data or []
            )
        except Exception as exc:
            logger.warning(f"[intake] failed to load {table} for {user_id}: {exc}")
            return []

    try:
        prof = (
            supabase.from_("profiles")
            .select("full_name, graduation_year, grade_level, gpa_unweighted, gpa_weighted, "
                    "gpa_scale, candidate_majors, target_colleges, narrative")
            .eq("id", user_id).single().execute().data or {}
        )
    except Exception as exc:
        logger.warning(f"[intake] failed to load profile for {user_id}: {exc}")
        prof = {}

    return {
        "profile":    prof,
        "activities": rows("student_activities"),
        "awards":     rows("student_awards"),
        "courses":    rows("student_courses"),
        "scores":     rows("student_test_scores", "test_type"),
    }


def render_record_context(record: dict) -> str:
    """A compact plain-text summary of the form data.

    Used verbatim for both channels: injected into the text interviewer's system
    prompt, and sent to the ElevenLabs agent via sendContextualUpdate. Keeping one
    renderer means both channels see exactly the same facts.
    """
    prof = record.get("profile") or {}
    lines: list[str] = []

    name = prof.get("full_name")
    if name:
        lines.append(f"Name: {name}")

    grad = prof.get("graduation_year")
    grade = prof.get("grade_level")
    if grad or grade:
        bits = []
        if grade:
            bits.append(f"currently grade {grade}")
        if grad:
            bits.append(f"graduating {grad}")
        lines.append("Year: " + ", ".join(bits))

    gpa_u, gpa_w, scale = prof.get("gpa_unweighted"), prof.get("gpa_weighted"), prof.get("gpa_scale")
    if gpa_u or gpa_w:
        bits = []
        if gpa_u:
            bits.append(f"{gpa_u} unweighted")
        if gpa_w:
            bits.append(f"{gpa_w} weighted")
        suffix = f" (scale: {scale})" if scale and scale not in ("not_used",) else ""
        lines.append("GPA: " + ", ".join(bits) + suffix)

    scores = record.get("scores") or []
    if scores:
        rendered = []
        for s in scores:
            t = (s.get("test_type") or "").upper()
            if t == "AP":
                rendered.append(f"AP {s.get('subject') or '?'}: {s.get('score')}")
            else:
                rendered.append(f"{t}: {s.get('score')}")
        lines.append("Test scores: " + "; ".join(rendered))

    courses = record.get("courses") or []
    if courses:
        rendered = []
        for c in courses:
            lvl = (c.get("level") or "").replace("_", " ")
            rendered.append(f"{c.get('name')} ({lvl})" if lvl else str(c.get("name")))
        lines.append("Courses: " + ", ".join(rendered))

    acts = record.get("activities") or []
    if acts:
        lines.append("Activities: " + ", ".join(str(a.get("title")) for a in acts))

    awards = record.get("awards") or []
    if awards:
        lines.append("Awards: " + ", ".join(str(a.get("title")) for a in awards))

    majors = prof.get("candidate_majors") or []
    if majors:
        lines.append("Considering majors: " + ", ".join(str(m) for m in majors))

    colleges = prof.get("target_colleges") or []
    if colleges:
        lines.append("Target colleges: " + ", ".join(str(c) for c in colleges))

    return "\n".join(lines) if lines else "(The student has not filled in the form yet.)"


# ── The interviewer's system prompt (text channel) ────────────────────────────

INTERVIEW_SYSTEM = """You are Mentorable's college application interviewer, talking with a high school student who just filled in a short form listing their activities, awards, and majors.

Your ONLY job is to clarify and add detail to what they already listed. This is not a reflective interview and you are not trying to figure out who they are as a person. You are a fast, friendly fact-gatherer.

You already have their form data below. NEVER ask them to repeat anything you already know from it. Go through their listed activities and awards, one at a time, in the order they listed them:
- ALWAYS name the specific activity or award you are asking about. Say "tell me about Science Olympiad" and never "tell me about the first one on your list" or "the next one". The student cannot see the list the way you can, and asking them to recall it is backwards: you are the one holding it.
- Your very first question must name their first listed activity outright.
- For each activity, ask 1-2 concrete questions: what they actually did (their specific role, not the group's), roughly how many hours a week and weeks a year, and one real result or outcome.
- For each award, a quick line on what it was for and at what level (school, regional, state, national).
- If they clearly have nothing more to add on something, move on immediately, don't dig.
- Near the end, ask one simple question: what are they most worried about with their application (test scores, not enough leadership, too few activities, anything).

DO NOT ASK:
- Do not ask what connects their activities, what their "story" or "theme" is, or anything like "in your own words, what ties this together". That is not your job.
- Do not ask why they chose the majors they listed. Just accept the list as given.
- Do not ask about feelings, identity, or self-reflection. Stick to concrete facts: what they did, how much, what happened.

HOW TO TALK:
- One question at a time. Never stack questions.
- Plain and direct, like a friend helping you fill out a form. Not a mentor, not a coach, not a therapist.
- Keep your turns very short: one question, maybe one sentence of context. No preamble, no "great question" filler.
- Never use em dashes. Use commas or periods.

You have roughly {max_turns} exchanges. Around turn {wrap_turn}, start wrapping up: tell them that's everything you need and thank them.

THE STUDENT'S FORM DATA:
{record_context}"""


# ── Extraction ───────────────────────────────────────────────────────────────

EXTRACTION_PROMPT = """You are extracting a college application profile from a conversation between a student and Mentorable's interviewer.

Return ONLY valid JSON, no other text, no markdown, no backticks.

You are given the student's form data (facts they typed, which are TRUE and must not be contradicted) and the conversation transcript.

RULES:
- Only enrich activities that already exist in the form data. Match them by title. Never invent an activity the student did not list. Use the EXACT `id` given for each activity.
- Enrich every activity that was actually discussed in the transcript, no matter how many. Leave anything not discussed alone rather than guessing at it.
- "description" must be at most 150 characters, written in the compressed, impact-first style the Common App activities section uses. Lead with what they did and the concrete result. No filler, no first person pronouns where they can be dropped.
- "position" is at most 50 characters. "organization" is at most 100 characters.
- "hours_per_week" and "weeks_per_year" must be realistic numbers grounded in what the student actually said. If they did not say and you cannot reasonably infer, use null. Do NOT guess wildly, these numbers are shown back to the student for confirmation.
- "grade_levels" is a list drawn from 9, 10, 11, 12.
- "timing" is one of: school_year, summer, all_year.
- "theme" is your own read of the actual through-line across their record, based purely on the pattern in what they've done. The student was NOT asked about this directly, so infer it honestly from the activities and awards themselves. One sentence. If their record is genuinely scattered, say so plainly rather than inventing a theme.
- "theme_evidence" lists the concrete things from their record that support the theme.
- "concerns" are worries they actually expressed (money, scores, being behind, family pressure). Empty list if none.
- "gaps" are honest, specific things missing from their application given what they are aiming at. This is the most useful field, do not soften it.
- "student_voice" is short phrases the student actually said, pulled verbatim, that capture how they talk about themselves. These get used later for essay work, so pick distinctive phrasing, not generic statements.
- "summary" is 2-3 warm but honest sentences about who this student is. Never use em dashes.

{{
  "theme": "one sentence",
  "theme_evidence": ["..."],
  "concerns": ["..."],
  "gaps": ["..."],
  "student_voice": ["verbatim phrases"],
  "summary": "2-3 sentences",
  "enriched_activities": [
    {{
      "id": "the exact id from the form data",
      "category": "one of the Common App categories",
      "position": "<=50 chars",
      "organization": "<=100 chars",
      "description": "<=150 chars",
      "grade_levels": [9, 10],
      "timing": "school_year | summer | all_year",
      "hours_per_week": 5,
      "weeks_per_year": 30,
      "continue_in_college": false
    }}
  ]
}}

VALID CATEGORIES: {categories}

STUDENT'S FORM DATA:
{record_context}

ACTIVITIES YOU MAY ENRICH (id -> title):
{activity_index}

TRANSCRIPT:
{transcript}"""


def _truncate(value, limit: int):
    if value is None:
        return None
    text = str(value).strip()
    return text[:limit] if text else None


def _clean_enriched(raw, valid_ids: set) -> list:
    """Keep only well-formed enrichments for activities that actually exist. No cap:
    the interview covers the student's whole list now, not a curated few."""
    out = []
    seen = set()
    for item in (raw if isinstance(raw, list) else []):
        if not isinstance(item, dict):
            continue
        aid = str(item.get("id") or "")
        if aid not in valid_ids or aid in seen:
            continue  # never let the model invent activities, or double-enrich one
        seen.add(aid)

        grades = [g for g in (item.get("grade_levels") or []) if g in (9, 10, 11, 12)]

        def num(key, lo, hi):
            try:
                v = float(item.get(key))
            except (TypeError, ValueError):
                return None
            return max(lo, min(hi, v))

        timing = item.get("timing")
        out.append({
            "id": aid,
            "category": item.get("category") if item.get("category") in ACTIVITY_CATEGORIES else "Other",
            "position": _truncate(item.get("position"), 50),
            "organization": _truncate(item.get("organization"), 100),
            "description": _truncate(item.get("description"), 150),
            "grade_levels": sorted(set(grades)),
            "timing": timing if timing in ("school_year", "summer", "all_year") else None,
            "hours_per_week": num("hours_per_week", 0, 168),
            "weeks_per_year": num("weeks_per_year", 0, 52),
            "continue_in_college": bool(item.get("continue_in_college")),
        })
    return out


def _str_list(raw) -> list:
    return [str(x).strip() for x in (raw if isinstance(raw, list) else []) if str(x).strip()]


# An empty draft: what a student gets when there was nothing to extract. They
# still reach the review screen and can fill it in there or just continue.
EMPTY_DRAFT = {
    "theme": "", "theme_evidence": [], "concerns": [], "gaps": [],
    "student_voice": [], "summary": "", "enriched_activities": [],
}


async def extract_intake(user_id: str, transcript: str, channel: str = "text") -> dict:
    """Turn the interview into a reviewable draft. Never raises.

    Returns {success, draft?, error?}. The draft is stored on
    profiles.intake_draft and is NOT committed until the student confirms it.

    There is deliberately no sufficiency gate. One used to ask Haiku whether the
    student had said enough and bounced them back to start over if it said no.
    That fired precisely on the most complete conversations: the voice call
    auto-ends at the 3 minute cap, which did not count as a deliberate end, so a
    student who used the whole call could be told they had not said enough. An
    interview that happened is always worth extracting, and a thin result is
    better shown on the review screen than thrown away.
    """
    supabase = get_supabase()
    transcript = (transcript or "").strip()

    if len(transcript) < 40:
        # Nothing worth an extraction call, but never send them backwards.
        logger.info(f"[intake] transcript too short to extract for {user_id}; empty draft")
        draft = {**EMPTY_DRAFT, "channel": channel,
                 "extracted_at": datetime.now(timezone.utc).isoformat()}
        try:
            supabase.from_("profiles").update({
                "intake_draft": draft, "intake_channel": channel,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", user_id).execute()
        except Exception as exc:
            logger.warning(f"[intake] short-draft save failed for {user_id}: {exc}")
        return {"success": True, "draft": draft}

    record = load_student_record(user_id)
    activities = record.get("activities") or []
    activity_index = "\n".join(
        f"{a.get('id')} -> {a.get('title')}" for a in activities
    ) or "(none listed)"
    valid_ids = {str(a.get("id")) for a in activities}

    prompt = EXTRACTION_PROMPT.format(
        categories=", ".join(ACTIVITY_CATEGORIES),
        record_context=render_record_context(record),
        activity_index=activity_index,
        transcript=transcript,
    )

    try:
        message = await _create_with_retry(
            model=SONNET, max_tokens=3000,
            messages=[{"role": "user", "content": prompt}],
        )
    except Exception as exc:
        logger.error(f"[intake] extraction call failed for {user_id}: {exc}")
        return {"success": False,
                "error": "AI service is temporarily unavailable. Please try again in a moment."}

    parsed = _parse_json(message.content[0].text if message.content else "")
    if parsed is None:
        logger.error(f"[intake] JSON parse failed for {user_id}")
        return {"success": False, "error": "Failed to parse the interview result"}

    draft = {
        "theme":            str(parsed.get("theme") or "").strip(),
        "theme_evidence":   _str_list(parsed.get("theme_evidence")),
        "concerns":         _str_list(parsed.get("concerns")),
        "gaps":             _str_list(parsed.get("gaps")),
        "student_voice":    _str_list(parsed.get("student_voice")),
        "summary":          str(parsed.get("summary") or "").strip(),
        "enriched_activities": _clean_enriched(parsed.get("enriched_activities"), valid_ids),
        "channel":          channel,
        "extracted_at":     datetime.now(timezone.utc).isoformat(),
    }

    try:
        supabase.from_("profiles").update({
            "intake_draft":   draft,
            "intake_channel": channel,
            "updated_at":     datetime.now(timezone.utc).isoformat(),
        }).eq("id", user_id).execute()
    except Exception as exc:
        logger.error(f"[intake] draft save failed for {user_id}: {exc}")
        return {"success": False, "error": str(exc)}

    logger.info(f"[intake] draft ready for {user_id} ({len(draft['enriched_activities'])} enriched)")
    return {"success": True, "draft": draft}


async def commit_intake(user_id: str, draft: dict, channel: str | None = None) -> dict:
    """Write the student-confirmed draft into the real tables and finish onboarding.

    `draft` is what came back from the review screen, so it may differ from what the
    model produced. It is re-validated here rather than trusted.

    An empty draft is a legitimate case: the student skipped the interview. Their
    activities stay name-only and the narrative stays genuinely empty rather than
    a shape full of blank strings, so nothing downstream mistakes it for a real
    (but uninformative) read on them.
    """
    supabase = get_supabase()
    now = datetime.now(timezone.utc).isoformat()
    draft = draft if isinstance(draft, dict) else {}

    record = load_student_record(user_id)
    valid_ids = {str(a.get("id")) for a in (record.get("activities") or [])}
    enriched = _clean_enriched(draft.get("enriched_activities"), valid_ids)

    enriched_ids = [item["id"] for item in enriched]

    for item in enriched:
        aid = item.pop("id")
        try:
            supabase.from_("student_activities").update({
                **item,
                "detail_level": "enriched",
                "updated_at": now,
            }).eq("id", aid).eq("user_id", user_id).execute()
        except Exception as exc:
            logger.warning(f"[intake] failed to enrich activity {aid} for {user_id}: {exc}")

    narrative_fields = {
        "theme":              str(draft.get("theme") or "").strip(),
        "theme_evidence":     _str_list(draft.get("theme_evidence")),
        # Activities the conversation actually covered. Not a curated "spike"
        # any more, just the ones we have real detail on.
        "detailed_activity_ids": enriched_ids,
        "concerns":           _str_list(draft.get("concerns")),
        "gaps":               _str_list(draft.get("gaps")),
        "student_voice":      _str_list(draft.get("student_voice")),
        "summary":            str(draft.get("summary") or "").strip(),
    }
    # Nothing of substance means the interview was skipped: store {} rather than
    # a hollow shape.
    has_content = any(v for k, v in narrative_fields.items() if k != "detailed_activity_ids")
    narrative = narrative_fields if has_content else {}

    updates = {
        "narrative":            narrative,
        "onboarding_completed": True,
        "intake_draft":         None,   # consumed
        "updated_at":           now,
    }
    if channel:
        updates["intake_channel"] = channel

    try:
        supabase.from_("profiles").update(updates).eq("id", user_id).execute()
    except Exception as exc:
        logger.error(f"[intake] commit failed for {user_id}: {exc}")
        return {"success": False, "error": str(exc)}

    logger.info(f"[intake] committed for {user_id} via {channel or 'unknown'} "
                f"({len(enriched)} activities enriched)")
    return {"success": True, "narrative": narrative}
