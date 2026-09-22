"""
Portfolio extraction — parses an uploaded resume/activity list/course list
(PDF or DOCX) into structured portfolio pieces via one Haiku call.

The extracted list is returned to the frontend for review/edit/selection;
nothing is persisted here. Saving happens client-side (direct Supabase insert)
after the user confirms in the review modal.
"""
import io
import logging
import re

from app.llm import json_completion
from app.models import PORTFOLIO_UPLOAD_FALLBACK, PORTFOLIO_UPLOAD_MODEL

logger = logging.getLogger(__name__)

# Upload only feeds the ECs/Awards tab, so every extracted row is one of these
# two kinds. Academics (GPA, scores, courses) is typed in, not parsed.
KINDS = ["activity", "award"]

AWARD_LEVELS = ["school", "regional", "state", "national", "international"]

MAX_FILE_BYTES = 5 * 1024 * 1024   # 5MB — resumes are tiny; anything bigger is wrong
MAX_TEXT_CHARS = 20_000            # bounds the Haiku input for cost
MAX_ITEMS      = 40


def _extract_pdf_text(content: bytes) -> str:
    from pypdf import PdfReader
    reader = PdfReader(io.BytesIO(content))
    return "\n".join((page.extract_text() or "") for page in reader.pages)


def _extract_docx_text(content: bytes) -> str:
    import docx
    doc = docx.Document(io.BytesIO(content))
    parts = [p.text for p in doc.paragraphs]
    for table in doc.tables:
        for row in table.rows:
            parts.append(" | ".join(cell.text for cell in row.cells))
    return "\n".join(parts)


def extract_file_text(filename: str, content: bytes) -> str:
    """Raw text from a PDF/DOCX upload. Raises ValueError with a user-facing message."""
    if len(content) > MAX_FILE_BYTES:
        raise ValueError("File is too large. Please upload a file under 5MB.")
    name = (filename or "").lower()
    try:
        if name.endswith(".pdf"):
            text = _extract_pdf_text(content)
        elif name.endswith(".docx"):
            text = _extract_docx_text(content)
        else:
            raise ValueError("Unsupported file type. Please upload a PDF or DOCX file.")
    except ValueError:
        raise
    except Exception as exc:
        logger.warning(f"[portfolio] file parse failed for {filename!r}: {exc}")
        raise ValueError("Could not read that file. Make sure it is a valid PDF or DOCX.")
    text = re.sub(r"[ \t]+", " ", text).strip()
    if len(text) < 40:
        raise ValueError("Could not find readable text in that file. Scanned images are not supported.")
    return text[:MAX_TEXT_CHARS]


EXTRACTION_PROMPT = """You extract a student's extracurriculars and awards from their resume, activity list, or brag sheet.

Pull out every distinct activity (clubs, sports, jobs, internships, volunteering, research, projects, leadership roles) and every distinct award or honor.

Rules:
- "kind" must be exactly "activity" or "award".
- "title" is short and specific, max 80 characters (e.g. "Science Olympiad", "Software Engineering Intern at Acme", "DECA State Finalist").
- For an activity, also fill what the document actually states, and leave anything it does not state as null:
    - "position": their role or leadership title, max 50 chars (e.g. "Anatomy Captain", "Treasurer")
    - "organization": the club, company or school, max 100 chars
    - "hours_per_week" and "weeks_per_year": numbers only if the document says so
    - "grade_levels": any of 9, 10, 11, 12 that the document indicates
- For an award, also fill:
    - "level": one of school, regional, state, national, international, if the document makes it clear
    - "year": a four digit year if stated
- "description": 1-2 sentences of the concrete details the document gives (scope, results, numbers). Use ONLY what the document says, never invent. Empty string if there is nothing beyond the title.
- Skip contact info, objective/summary paragraphs, references, GPA, test scores and coursework. Those are entered separately.
- Never use em dashes anywhere. Use commas or periods instead.
- Return at most {max_items} items, the most substantive ones.

Return an object with one key, "items", holding the list.

DOCUMENT:
{document}"""


# Strict mode wants every property required and no extras, so fields that do not
# apply to a kind (level/year on an activity) are sent as null rather than
# omitted. The normaliser below drops them per kind.
ITEMS_SCHEMA = {
    "type": "object",
    "properties": {
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "kind":           {"type": "string", "enum": KINDS},
                    "title":          {"type": "string"},
                    "description":    {"type": "string"},
                    "position":       {"type": ["string", "null"]},
                    "organization":   {"type": ["string", "null"]},
                    "hours_per_week": {"type": ["number", "null"]},
                    "weeks_per_year": {"type": ["number", "null"]},
                    "grade_levels":   {"type": "array", "items": {"type": "integer"}},
                    "level":          {"type": ["string", "null"], "enum": [*AWARD_LEVELS, None]},
                    "year":           {"type": ["integer", "null"]},
                },
                "required": ["kind", "title", "description", "position", "organization",
                             "hours_per_week", "weeks_per_year", "grade_levels", "level", "year"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["items"],
    "additionalProperties": False,
}


async def extract_portfolio_items(document: str) -> list[dict]:
    """
    Extracted document text -> list of activity/award rows for the ECs/Awards tab.
    Raises ValueError with a user-facing message on expected failures.
    (File reading/validation lives in extract_file_text so the endpoint can
    reject bad files BEFORE burning a rate-limited upload.)
    """
    result = await json_completion(
        prompt=EXTRACTION_PROMPT.format(max_items=MAX_ITEMS, document=document),
        schema=ITEMS_SCHEMA,
        schema_name="portfolio_items",
        openai_model=PORTFOLIO_UPLOAD_MODEL,
        anthropic_model=PORTFOLIO_UPLOAD_FALLBACK,
        max_tokens=4000,
    )
    # A bare list is still accepted: the Anthropic fallback is not schema-bound,
    # so it can answer with the array instead of the wrapper object.
    if isinstance(result, dict):
        parsed = result.get("items")
    elif isinstance(result, list):
        parsed = result
    else:
        parsed = None
    if not isinstance(parsed, list):
        logger.warning("[portfolio] extraction returned nothing usable")
        raise ValueError("Could not extract items from that file. Try again or add pieces manually.")

    def num(v, lo, hi):
        try:
            f = float(v)
        except (TypeError, ValueError):
            return None
        return max(lo, min(hi, f))

    items = []
    for entry in parsed[:MAX_ITEMS]:
        if not isinstance(entry, dict):
            continue
        title = str(entry.get("title") or "").strip()[:120]
        if not title:
            continue

        kind = str(entry.get("kind") or "").strip().lower()
        if kind not in KINDS:
            kind = "activity"
        description = str(entry.get("description") or "").strip()[:500]

        if kind == "award":
            level = str(entry.get("level") or "").strip().lower()
            year = num(entry.get("year"), 1900, 2100)
            items.append({
                "kind": "award", "title": title, "description": description,
                "level": level if level in AWARD_LEVELS else None,
                "year": int(year) if year else None,
            })
        else:
            grades = sorted({g for g in (entry.get("grade_levels") or []) if g in (9, 10, 11, 12)})
            hrs = num(entry.get("hours_per_week"), 0, 168)
            wks = num(entry.get("weeks_per_year"), 0, 52)
            items.append({
                "kind": "activity", "title": title, "description": description,
                "position": (str(entry.get("position") or "").strip() or None) and str(entry.get("position")).strip()[:50],
                "organization": (str(entry.get("organization") or "").strip() or None) and str(entry.get("organization")).strip()[:100],
                "hours_per_week": hrs,
                "weeks_per_year": int(wks) if wks else None,
                "grade_levels": grades,
            })

    if not items:
        raise ValueError("No activities or awards were found in that file. Try adding them manually.")

    logger.info(f"[portfolio] extracted {len(items)} items")
    return items
