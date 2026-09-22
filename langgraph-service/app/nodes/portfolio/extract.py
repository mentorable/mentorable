"""
Portfolio extraction — parses an uploaded resume/activity list/course list
(PDF or DOCX) into structured portfolio pieces via one Haiku call.

The extracted list is returned to the frontend for review/edit/selection;
nothing is persisted here. Saving happens client-side (direct Supabase insert)
after the user confirms in the review modal.
"""
import io
import json
import logging
import re

from anthropic import AsyncAnthropic

from app.config import ANTHROPIC_API_KEY

logger = logging.getLogger(__name__)

_anthropic = AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
HAIKU = "claude-haiku-4-5-20251001"

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


def _parse_items(text: str):
    """Permissive JSON parse: direct, then first [...] block. Returns list or None."""
    for candidate in (text, *(m.group(0) for m in [re.search(r"\[[\s\S]*\]", text)] if m)):
        try:
            parsed = json.loads(candidate)
            if isinstance(parsed, list):
                return parsed
            if isinstance(parsed, dict) and isinstance(parsed.get("items"), list):
                return parsed["items"]
        except Exception:
            continue
    return None


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

Return ONLY a valid JSON array, no other text, no markdown, no backticks:
[{{"kind": "activity", "title": "...", "position": null, "organization": null, "hours_per_week": null, "weeks_per_year": null, "grade_levels": [], "description": "..."}},
 {{"kind": "award", "title": "...", "level": null, "year": null, "description": "..."}}]

DOCUMENT:
{document}"""


async def extract_portfolio_items(document: str) -> list[dict]:
    """
    Extracted document text -> list of activity/award rows for the ECs/Awards tab.
    Raises ValueError with a user-facing message on expected failures.
    (File reading/validation lives in extract_file_text so the endpoint can
    reject bad files BEFORE burning a rate-limited upload.)
    """
    resp = await _anthropic.messages.create(
        model=HAIKU,
        max_tokens=4000,
        messages=[{
            "role": "user",
            "content": EXTRACTION_PROMPT.format(max_items=MAX_ITEMS, document=document),
        }],
    )
    raw = resp.content[0].text if resp.content else ""
    if resp.stop_reason == "max_tokens":
        logger.warning("[portfolio] extraction truncated at max_tokens")
    parsed = _parse_items(raw)
    if parsed is None:
        logger.warning(f"[portfolio] extraction parse failed: {raw[:200]!r}")
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
