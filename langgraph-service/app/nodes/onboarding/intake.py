"""
College application intake — extraction and commit.

The student fills a minimal form (numbers and names), then talks to either a text
or a voice interviewer. This module turns that conversation into:

  * a narrative (theme, major reasoning, concerns, gaps, their own phrasing)
  * structured Common App detail for the 2-4 activities that form their spike

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
HAIKU = "claude-haiku-4-5-20251001"
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

# How many activities the conversation deep-dives. Onboarding's job is to find the
# story and the gaps, not to complete the Common App: a 10-activity structured walk
# is tedious and quality degrades badly as the student tires.
MAX_SPIKE_ACTIVITIES = 4


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

INTERVIEW_SYSTEM = """You are Mentorable's college application interviewer, talking with a high school student who is preparing to apply to college.

You already have their form data below. NEVER ask them to repeat anything you already know from it. Instead, use it: ask about specific activities and awards by name.

WHAT YOU ARE TRYING TO LEARN, in priority order:
1. The through-line. What actually connects the things they've done? What are they genuinely drawn to? This is the single most important thing.
2. Depth on the 2-4 activities that matter most. For those, find out: what their actual role was, what they personally did versus what the group did, concrete scale or results, roughly how many hours a week and weeks a year, and which grades they did it in.
3. Why the majors they listed. In their own words.
4. What they're worried about, and what they think is missing from their application.

HOW TO TALK:
- One question at a time. Never stack questions.
- Warm, direct and specific. You are a sharp mentor, not a form.
- Follow up when an answer is vague. "We raised money for charity" should become "how much, and what did you personally do?"
- Do not flatter. Do not tell them their profile is amazing.
- Keep your turns short, two or three sentences at most.
- Never use em dashes. Use commas or periods.

You have roughly {max_turns} exchanges. Around turn {wrap_turn}, start wrapping up: tell them you have what you need and thank them.

THE STUDENT'S FORM DATA:
{record_context}"""


# ── Extraction ───────────────────────────────────────────────────────────────

EXTRACTION_PROMPT = """You are extracting a college application profile from a conversation between a student and Mentorable's interviewer.

Return ONLY valid JSON, no other text, no markdown, no backticks.

You are given the student's form data (facts they typed, which are TRUE and must not be contradicted) and the conversation transcript.

RULES:
- Only enrich activities that already exist in the form data. Match them by title. Never invent an activity the student did not list. Use the EXACT `id` given for each activity.
- Enrich at most {max_spike} activities: the ones that form the student's narrative through-line. Leave the rest alone.
- "description" must be at most 150 characters, written in the compressed, impact-first style the Common App activities section uses. Lead with what they did and the concrete result. No filler, no first person pronouns where they can be dropped.
- "position" is at most 50 characters. "organization" is at most 100 characters.
- "hours_per_week" and "weeks_per_year" must be realistic numbers grounded in what the student actually said. If they did not say and you cannot reasonably infer, use null. Do NOT guess wildly, these numbers are shown back to the student for confirmation.
- "grade_levels" is a list drawn from 9, 10, 11, 12.
- "timing" is one of: school_year, summer, all_year.
- "theme" is one sentence naming the actual through-line. Be specific and honest. If their record is genuinely scattered, say so plainly rather than inventing a theme.
- "theme_evidence" lists the concrete things from their record that support the theme.
- "major_reasoning" is why they are drawn to the majors they listed, in their own framing, 2-3 sentences.
- "concerns" are worries they actually expressed (money, scores, being behind, family pressure). Empty list if none.
- "gaps" are honest, specific things missing from their application given what they are aiming at. This is the most useful field, do not soften it.
- "student_voice" is short phrases the student actually said, pulled verbatim, that capture how they talk about themselves. These get used later for essay work, so pick distinctive phrasing, not generic statements.
- "summary" is 2-3 warm but honest sentences about who this student is. Never use em dashes.

{{
  "theme": "one sentence",
  "theme_evidence": ["..."],
  "major_reasoning": "2-3 sentences",
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
    """Keep only well-formed enrichments for activities that actually exist."""
    out = []
    for item in (raw if isinstance(raw, list) else []):
        if not isinstance(item, dict):
            continue
        aid = str(item.get("id") or "")
        if aid not in valid_ids:
            continue  # never let the model invent activities

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
        if len(out) >= MAX_SPIKE_ACTIVITIES:
            break
    return out


def _str_list(raw) -> list:
    return [str(x).strip() for x in (raw if isinstance(raw, list) else []) if str(x).strip()]


async def extract_intake(user_id: str, transcript: str, channel: str = "text",
                         force: bool = False) -> dict:
    """Turn the interview into a reviewable draft. Never raises.

    Returns {sufficient, success, draft?, error?}. The draft is stored on
    profiles.intake_draft and is NOT committed until the student confirms it.
    """
    supabase = get_supabase()
    transcript = (transcript or "").strip()

    if not transcript or (len(transcript) < 40 and not force):
        return {"sufficient": False}

    record = load_student_record(user_id)
    activities = record.get("activities") or []
    activity_index = "\n".join(
        f"{a.get('id')} -> {a.get('title')}" for a in activities
    ) or "(none listed)"
    valid_ids = {str(a.get("id")) for a in activities}

    # Sufficiency gate. Skipped on a forced end: the student chose to stop, so we take
    # our best shot rather than making them start over.
    if not force:
        try:
            check = await _create_with_retry(
                model=HAIKU,
                max_tokens=64,
                messages=[{
                    "role": "user",
                    "content": (
                        "A student just finished a college application interview. Did they share enough "
                        "about what they've actually done and why it matters to them to build a profile? "
                        'Reply with only "yes" or "no".\n\n'
                        f"Transcript:\n{transcript}"
                    ),
                }],
            )
            text = (check.content[0].text if check.content else "").strip().lower()
            if not text.startswith("yes"):
                return {"sufficient": False}
        except Exception as exc:
            logger.warning(f"[intake] sufficiency check failed for {user_id}, proceeding: {exc}")

    prompt = EXTRACTION_PROMPT.format(
        max_spike=MAX_SPIKE_ACTIVITIES,
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
        return {"sufficient": True, "success": False,
                "error": "AI service is temporarily unavailable. Please try again in a moment."}

    parsed = _parse_json(message.content[0].text if message.content else "")
    if parsed is None:
        logger.error(f"[intake] JSON parse failed for {user_id}")
        return {"sufficient": True, "success": False, "error": "Failed to parse the interview result"}

    draft = {
        "theme":            str(parsed.get("theme") or "").strip(),
        "theme_evidence":   _str_list(parsed.get("theme_evidence")),
        "major_reasoning":  str(parsed.get("major_reasoning") or "").strip(),
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
        return {"sufficient": True, "success": False, "error": str(exc)}

    logger.info(f"[intake] draft ready for {user_id} ({len(draft['enriched_activities'])} enriched)")
    return {"sufficient": True, "success": True, "draft": draft}


async def commit_intake(user_id: str, draft: dict) -> dict:
    """Write the student-confirmed draft into the real tables and finish onboarding.

    `draft` is what came back from the review screen, so it may differ from what the
    model produced. It is re-validated here rather than trusted.
    """
    supabase = get_supabase()
    now = datetime.now(timezone.utc).isoformat()
    draft = draft if isinstance(draft, dict) else {}

    record = load_student_record(user_id)
    valid_ids = {str(a.get("id")) for a in (record.get("activities") or [])}
    enriched = _clean_enriched(draft.get("enriched_activities"), valid_ids)

    for item in enriched:
        aid = item.pop("id")
        try:
            supabase.from_("student_activities").update({
                **item,
                "is_spike": True,
                "detail_level": "enriched",
                "updated_at": now,
            }).eq("id", aid).eq("user_id", user_id).execute()
        except Exception as exc:
            logger.warning(f"[intake] failed to enrich activity {aid} for {user_id}: {exc}")

    narrative = {
        "theme":              str(draft.get("theme") or "").strip(),
        "theme_evidence":     _str_list(draft.get("theme_evidence")),
        "major_reasoning":    str(draft.get("major_reasoning") or "").strip(),
        "spike_activity_ids": [i["id"] for i in _clean_enriched(
            draft.get("enriched_activities"), valid_ids)],
        "concerns":           _str_list(draft.get("concerns")),
        "gaps":               _str_list(draft.get("gaps")),
        "student_voice":      _str_list(draft.get("student_voice")),
        "summary":            str(draft.get("summary") or "").strip(),
    }

    try:
        supabase.from_("profiles").update({
            "narrative":            narrative,
            "onboarding_completed": True,
            "intake_draft":         None,   # consumed
            "updated_at":           now,
        }).eq("id", user_id).execute()
    except Exception as exc:
        logger.error(f"[intake] commit failed for {user_id}: {exc}")
        return {"success": False, "error": str(exc)}

    logger.info(f"[intake] committed for {user_id} ({len(enriched)} activities enriched)")
    return {"success": True, "narrative": narrative}
