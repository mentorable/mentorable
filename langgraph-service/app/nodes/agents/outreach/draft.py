"""
Beaker's writing: the first email, the tone rewrites, and the follow-up.

The prompt (prompts.DRAFT_SYSTEM) carries the judgment. What can be checked is
enforced here, on every reply, whatever the prompt said: the word cap (175 for
a first email, 70 for a follow-up), a subject of 1 to 12 words and at most 120
characters, no phone number, street address, ID number or bracketed
placeholder, no em dashes (cleaned, the same rule as clean_text), and claims
kept only when their source is one of the research's own URLs and their words
really appear in the body. A reply that breaks a rule gets one corrective
retry, told exactly what was wrong; a second failure is DraftFailed, whose
message is fit to show the student.

Facts about the student come only from their record, their note and their
answer; facts about the recipient only from the research.
"""
import logging
import re
from typing import Optional

from app.llm import ModelUnavailable, tool_completion
from app.models import OUTREACH_DRAFT_MODEL, OUTREACH_FOLLOWUP_MODEL, OUTREACH_REWRITE_MODEL
from app.nodes.agents.outreach import prompts
from app.nodes.agents.outreach.research import Emit, progress_line
from app.nodes.agents.outreach.voices import (
    DEFAULT_LENGTH, DEFAULT_VOICE, FOLLOWUP_MAX_WORDS, LENGTHS, MAX_WORDS, VOICES, valid_length, valid_purpose,
    valid_tweak, valid_voice,
)
from app.nodes.quest.common import clean_text

logger = logging.getLogger(__name__)

MAX_SUBJECT_WORDS = 12
MAX_SUBJECT_CHARS = 120
MIN_FIRST_WORDS = 40
MIN_REWRITE_WORDS = 25
MIN_FOLLOWUP_WORDS = 12
MAX_FOLLOWUP_SENTENCES = 4
MAX_CLAIMS = 8
MAX_FACTS_TO_VERIFY = 6
MAX_QUESTION_CHARS = 300
ADD_YOUR_NAME = "Add your name at the end"

UNAVAILABLE = "Beaker could not reach the writing model just now. Please try again in a minute."
COULD_NOT_WRITE = "Beaker could not write a draft that follows the rules this time. Please try again."
COULD_NOT_FOLLOW_UP = "Beaker could not write a follow-up that follows the rules this time. Please try again."
SAFETY_STOP = ("It sounds like someone may be asking you for personal details or private contact. Please talk "
               "to a parent, a teacher or another adult you trust before you reply, and keep your phone number, "
               "address and photos to yourself.")


class DraftFailed(Exception):
    """The draft could not be written. .message is plain and fit to show."""

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


# ── Counting and cleaning ────────────────────────────────────────────────────

def word_count(text) -> int:
    """Words as a student's editor counts them: whitespace-separated tokens
    with at least one letter or digit ("Dr." and "don't" are one word each)."""
    if not isinstance(text, str):
        return 0
    return sum(1 for token in text.split() if re.search(r"[A-Za-z0-9]", token))


# An em dash (spaced or not), or a spaced en dash or double hyphen standing in
# for one, becomes a comma: the clean_text rule, applied line by line so the
# paragraphs of an email survive. Year ranges ("2019-2023", or with an en dash) are left alone.
_DASH = re.compile(r"\s*\u2014\s*|[ \t]+(?:\u2013|--)[ \t]+")


def _dashes(text: str) -> str:
    return _DASH.sub(", ", text).replace("\u2014", ", ")


def clean_body(text) -> str:
    """An email body made safe to show: plain text, no em dashes, tidy spacing,
    paragraphs kept."""
    if not isinstance(text, str):
        return ""
    text = text.replace("\r\n", "\n").replace("\r", "\n").replace("**", "").replace("__", "")
    lines = []
    for line in text.split("\n"):
        line = re.sub(r"[ \t\u00a0]+", " ", _dashes(line)).strip()
        line = re.sub(r"^,\s*", "", line)                  # a dash that opened the line
        line = re.sub(r",\s*([.,;:!?])", r"\1", line)       # a dash that ended a clause
        lines.append(line)
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


def _clean_subject(text) -> str:
    subject = clean_text(_dashes(text) if isinstance(text, str) else "", 300)
    subject = re.sub(r"^subject\s*:\s*", "", subject, flags=re.IGNORECASE)
    return subject.strip().strip("\"'").strip()


def first_name(student_name) -> str:
    """The first word of the student's name, for the sign off. "" when unknown."""
    for word in clean_text(student_name, 120).split():
        word = re.sub(r"[^\w'-]", "", word).strip("'-_")
        if word and not word.isdigit():
            return (word.capitalize() if word.islower() else word)[:40]
    return ""


def _signed(body: str, first: str) -> str:
    """The body ending with the student's first name, added if the model left
    it off. Signed means the last line is a sign off: it ends with the name,
    perhaps with a last name or an initial ("Sam", "Thanks, Sam", "Sam R.").
    A first name that is also a word ("I hope you have a great week" from a
    student called Hope) elsewhere in the closing is not a signature."""
    if not first or not body:
        return body
    body = body.rstrip()
    last_line = body.rsplit("\n", 1)[-1].strip()
    if re.search(rf"(?:^|[^\w'])(?i:{re.escape(first)})(?:[ \t]+[A-Z][\w'.-]*){{0,2}}[ \t]*[.!]?$", last_line):
        return body
    return body + ("\n" if last_line.endswith(",") else "\n\n") + first


# ── What must never be sent ──────────────────────────────────────────────────

_US_PHONE = re.compile(r"(?<![\d/.-])(?:\+?1[\s.-]?)?(?:\(\d{3}\)\s?|\d{3}[\s.-]?)\d{3}[\s.-]?\d{4}(?![\d/-])")
_INTL_PHONE = re.compile(r"(?<![\w/])\+\d[\d\s().-]{7,20}\d(?!\d)")
# A street address: a house number, then one to four capitalized (or
# numbered: "5th") words on the same line, then a street type. On its own
# that shape also fits ordinary sentences ("the 2023 Blood Drive", "3 Science
# Fair First Place ribbons"), so it counts only when:
# - the type is plainly a street's (Street, Ave, Rd...) and the number is not
#   a year, or
# - the address goes on (a unit, a ZIP code, or a city then a state or ZIP),
#   or something before it says it is one ("at", "on", "my address is").
# Drive, Court, Place, Way, Trail, Circle and Terrace are ordinary nouns too,
# and "Dr." or "St." before a name is a title or a saint.
_STREET = re.compile(
    r"(?<![\w.,/-])(?P<number>\d{1,6})[ \t]+(?:[NSEW]\.?[ \t]+)?"
    r"(?:(?:[A-Z][A-Za-z'.-]*|\d{1,3}(?:st|nd|rd|th))[ \t]+){1,4}"
    r"(?P<type>Street|Avenue|Road|Boulevard|Lane|Parkway|Highway|Drive|Court|Place|Way|Trail|Circle|Terrace"
    r"|St|Ave|Rd|Blvd|Ln|Dr|Ct|Pl|Ter|Cir|Pkwy|Hwy|Trl)\b"
)
_STREET_ONLY = {"Street", "Avenue", "Road", "Boulevard", "Lane", "Parkway", "Highway",
                "St", "Ave", "Rd", "Blvd", "Ln", "Dr", "Ct", "Pl", "Ter", "Cir", "Pkwy", "Hwy", "Trl"}
_YEAR = re.compile(r"(?:19|20)\d\d")
_ADDRESS_GOES_ON = re.compile(
    r"\.?(?:,?[ \t]*(?:(?:Apt|Apartment|Suite|Ste|Unit)\b|#[ \t]*\d|\d{5}\b)"
    r"|,[ \t]*(?:[A-Z][A-Za-z.'-]*[ \t]+){0,2}[A-Z][A-Za-z.'-]*,?[ \t]+(?:[A-Z]{2}|\d{5})\b)"
)
_ADDRESS_CUE = re.compile(r"(?:\b(?:at|on)|\baddress(?:[ \t]+is)?[ \t]*:?)[ \t]*$", re.IGNORECASE)
_PO_BOX = re.compile(r"\bP\.?\s?O\.?\s+Box\s+\d+", re.IGNORECASE)
_ID_NUMBER = re.compile(r"\b\d{3}-\d{2}-\d{4}\b|\b(?:student|school)\s*(?:id|number|#)\s*[:#]?\s*\d{4,}",
                        re.IGNORECASE)
# [Your Name], {school}, <first name>. Angle brackets count only around plain
# words, so a pasted <https://...> link or <name@school.org> is not one.
_PLACEHOLDER = re.compile(r"\[[^\[\]\n]{0,80}\]|\{[^{}\n]{0,80}\}|<[A-Za-z][A-Za-z ]{0,40}>")


def contains_phone(text) -> bool:
    """A US phone number in any common spelling, or an international one
    written with a +. Years, year ranges and DOIs are not phone numbers."""
    if not isinstance(text, str):
        return False
    if _US_PHONE.search(text):
        return True
    return any(8 <= len(re.sub(r"\D", "", m.group(0))) <= 15 for m in _INTL_PHONE.finditer(text))


def street_address(text) -> str:
    """The first thing in text that is a street address or a PO box, as
    written, or "" when there is none."""
    if not isinstance(text, str):
        return ""
    for m in _STREET.finditer(text):
        kind, after = m.group("type"), text[m.end():m.end() + 80]
        if kind in ("Dr", "St") and _YEAR.fullmatch(m.group("number")) and re.match(r"\.[ \t]+[A-Z]", after):
            continue          # "the 2023 Science Fair St. Louis", not "123 Main St. Springfield"
        plain = kind in _STREET_ONLY and not _YEAR.fullmatch(m.group("number"))
        if plain or _ADDRESS_GOES_ON.match(after) or _ADDRESS_CUE.search(text[max(0, m.start() - 30):m.start()]):
            return m.group(0)
    box = _PO_BOX.search(text)
    return box.group(0) if box else ""


def _content_problems(text: str) -> list[str]:
    problems = []
    if contains_phone(text):
        problems.append("It includes a phone number. Take it out.")
    street = street_address(text)
    if street:
        problems.append(f"It includes a street address ({street[:60]}). Take it out.")
    if _ID_NUMBER.search(text):
        problems.append("It includes an ID number. Take it out.")
    placeholder = _PLACEHOLDER.search(text)
    if placeholder:
        problems.append(f"It has a placeholder in brackets: {placeholder.group(0)[:40]}. Fill it in or write around it.")
    return problems


def _length_problems(body: str, max_words: int, min_words: int) -> list[str]:
    if not body.strip():
        return ["The email body is empty."]
    n = word_count(body)
    if n > max_words:
        return [f"The email is {n} words. The limit is {max_words}."]
    if min_words and n < min_words:
        return [f"The email is only {n} words. Write at least {min_words}."]
    return []


def email_problems(subject: str, body: str, *, max_words: int, min_words: int = 0) -> list[str]:
    """Everything that stops this email being sent as it is. Empty = fine.
    Plain sentences, fit for the model's retry and for the student."""
    subject = subject.strip() if isinstance(subject, str) else ""
    body = body if isinstance(body, str) else ""
    problems = []
    words = word_count(subject)
    if not words:
        problems.append("The subject line is empty.")
    elif words > MAX_SUBJECT_WORDS:
        problems.append(f"The subject has {words} words. Keep it to {MAX_SUBJECT_WORDS} or fewer.")
    if len(subject) > MAX_SUBJECT_CHARS:
        problems.append(f"The subject is {len(subject)} characters. Keep it to {MAX_SUBJECT_CHARS} or fewer.")
    if "\n" in subject:
        problems.append("The subject must be one line.")
    problems += _length_problems(body, max_words, min_words)
    # The subject and the body apart: joined, the end of one and the start of
    # the other read as one phrase ("class of 2027" and "Dear Dr. Lee").
    for problem in _content_problems(subject) + _content_problems(body):
        if problem not in problems:
            problems.append(problem)
    return problems


# ── Claims ───────────────────────────────────────────────────────────────────

_QUOTE_CLASSES = {"'": "['\u2018\u2019]", "\u2018": "['\u2018\u2019]", "\u2019": "['\u2018\u2019]",
                  '"': "[\"\u201c\u201d]", "\u201c": "[\"\u201c\u201d]", "\u201d": "[\"\u201c\u201d]"}


def _span_pattern(text: str) -> Optional[re.Pattern]:
    words = text.split()
    if not words:
        return None
    parts = ["".join(_QUOTE_CLASSES.get(ch, re.escape(ch)) for ch in word) for word in words]
    return re.compile(r"\s+".join(parts), re.IGNORECASE)


def ground_claims(claims, body: str, allowed_urls: set[str]) -> list[dict]:
    """The model's claims that hold up: the source is one of the research's own
    URLs, and the words really are in the body (whitespace, case and quote
    style aside). Each claim's text is returned as the exact slice of the body,
    so the editor can highlight it."""
    if not isinstance(claims, list) or not isinstance(body, str) or not body:
        return []
    allowed = {u.strip() for u in (allowed_urls or ()) if isinstance(u, str) and u.strip()}
    out: list[dict] = []
    seen: set[str] = set()
    for claim in claims:
        if not isinstance(claim, dict):
            continue
        url, text = claim.get("source_url"), claim.get("text")
        if not isinstance(url, str) or url.strip() not in allowed or not isinstance(text, str):
            continue
        text = _dashes(text).strip().strip("\"'\u201c\u201d\u2018\u2019").rstrip(".,;:!?").strip()
        if len(text) < 8:
            continue
        pattern = _span_pattern(text)
        match = pattern.search(body) if pattern else None
        if not match or match.group(0).lower() in seen:
            continue
        seen.add(match.group(0).lower())
        out.append({"text": match.group(0), "source_url": url.strip()})
        if len(out) == MAX_CLAIMS:
            break
    return out


def research_urls(research: dict) -> set[str]:
    """The URLs a claim may cite: the research's fact URLs and the profile."""
    research = research if isinstance(research, dict) else {}
    urls = {f.get("url") for f in (research.get("facts") or []) if isinstance(f, dict)}
    person = research.get("person") if isinstance(research.get("person"), dict) else {}
    urls.add(person.get("profile_url"))
    return {u for u in urls if isinstance(u, str) and u}


# ── Checking one reply ───────────────────────────────────────────────────────

def _facts_to_verify(raw, first: str, claims: list[dict], final: bool) -> list[str]:
    out: list[str] = []
    for item in (raw if isinstance(raw, list) else []):
        text = clean_text(item, 160)
        if text and text.lower() not in {x.lower() for x in out}:
            out.append(text)
        if len(out) == MAX_FACTS_TO_VERIFY:
            break
    if not first and ADD_YOUR_NAME not in out:
        out.insert(0, ADD_YOUR_NAME)
    if final and not claims:
        out.append("Check what the email says about their work against the sources.")
    return out or ["Read it once more and check each detail about their work against the sources."]


def _question(raw: dict) -> str:
    """The one question, if the model asked one. A question has a question
    mark: "none" or "n/a" in the field is not one."""
    question = clean_text(raw.get("question"), MAX_QUESTION_CHARS)
    return question if "?" in question else ""


def check_draft(raw, *, allowed_urls: set[str], first: str, max_words: int, min_words: int,
                allow_question: bool, final: bool) -> tuple[Optional[dict], list[str]]:
    """(the cleaned draft or question, the problems that need a retry).

    Raises DraftFailed at once when the model stopped for safety: that is not
    something a retry should talk it out of. `final` is the last attempt, where
    a draft with no sourced claim is accepted with a line in facts to verify
    rather than failed."""
    if not isinstance(raw, dict):
        return None, ["No draft came back. Call the tool with the whole email."]
    if raw.get("safety_stop") is True:
        raise DraftFailed(SAFETY_STOP)
    question = _question(raw)
    if question and allow_question:
        return {"question": question}, []

    subject = _clean_subject(raw.get("subject"))
    body = _signed(clean_body(raw.get("body")), first)
    if question and not body:
        return None, ["Do not ask the student anything. Write the whole email with what you have."]
    problems = email_problems(subject, body, max_words=max_words, min_words=min_words)
    claims = ground_claims(raw.get("claims"), body, allowed_urls)
    if not problems and not claims and allowed_urls and not final:
        problems.append("No sentence about the recipient's work is tied to a source. Use one fact from the list, "
                        "and copy its exact words from the body into claims with that fact's URL.")
    draft = {"subject": subject, "body": body, "claims": claims,
             "facts_to_verify": _facts_to_verify(raw.get("facts_to_verify"), first, claims, final)}
    return draft, problems


async def _call(*, model: str, system: Optional[str], prompt: str, tool: dict, label: str, max_tokens: int):
    try:
        return await tool_completion(model=model, system=system, prompt=prompt, tool=tool,
                                     max_tokens=max_tokens, label=label)
    except ModelUnavailable as exc:
        logger.warning(f"[{label}] model unavailable: {exc}")
        raise DraftFailed(UNAVAILABLE) from exc


def _fixing_label(problems: list[str]) -> str:
    n = len(problems)
    return f"Fixing {n} problem{'s' if n != 1 else ''} in the draft"


# ── The three jobs ───────────────────────────────────────────────────────────

async def write_draft(*, research: dict, record_text: str, student_name: str, grade: str, purpose: str,
                      voice: str, length: str, student_note: str, answer: Optional[str], allow_question: bool,
                      emit: Optional[Emit] = None, question: Optional[str] = None) -> dict:
    """The first email: {"subject", "body", "claims", "facts_to_verify"}, or
    {"question"} when allow_question and one detail the email truly needs is
    missing. `question` is the one Beaker asked before, if `answer` answers it.
    Raises DraftFailed."""
    if not valid_purpose(purpose):
        raise DraftFailed("Pick what you would like from this person first.")
    voice = voice if valid_voice(voice) else DEFAULT_VOICE
    length = length if valid_length(length) else DEFAULT_LENGTH
    first = first_name(student_name)
    allowed = research_urls(research)
    prompt = prompts.draft_prompt(
        research=research, record_text=record_text, first_name=first, grade=grade, purpose=purpose, voice=voice,
        length=length, student_note=clean_text(student_note, 300), answer=clean_text(answer, 600),
        question=clean_text(question, MAX_QUESTION_CHARS), allow_question=allow_question,
    )
    tool = prompts.draft_tool(allow_question)
    what = f"Writing a {LENGTHS[length]['label'].lower()} email in a {VOICES[voice]['label'].lower()} voice"
    await progress_line(emit, "draft", what, "active")

    try:
        return await _draft_attempts(prompt=prompt, tool=tool, allowed=allowed, first=first,
                                     allow_question=allow_question, emit=emit)
    except DraftFailed as exc:
        # Close the checklist line with what really happened, then pass it on.
        stopped = {SAFETY_STOP: "Stopped: this needs a trusted adult",
                   UNAVAILABLE: "Could not reach the writing model"}.get(exc.message, "Could not write a clean draft")
        await progress_line(emit, "draft", stopped, "failed")
        raise


async def _draft_attempts(*, prompt: str, tool: dict, allowed: set[str], first: str, allow_question: bool,
                          emit: Optional[Emit]) -> dict:
    extra = ""
    for attempt in (1, 2):
        raw = await _call(model=OUTREACH_DRAFT_MODEL, system=prompts.DRAFT_SYSTEM, prompt=prompt + extra, tool=tool,
                          label="outreach_draft", max_tokens=1500)
        result, problems = check_draft(raw, allowed_urls=allowed, first=first, max_words=MAX_WORDS,
                                       min_words=MIN_FIRST_WORDS, allow_question=allow_question,
                                       final=attempt == 2)
        if not problems:
            if "question" in result:
                await progress_line(emit, "draft", "Beaker has one question for you first", "done")
                return result
            await progress_line(emit, "draft", f"Draft written, {word_count(result['body'])} words", "done")
            n = len(result["claims"])
            await progress_line(emit, "check", f"{n} detail{'s' if n != 1 else ''} tied to sources" if n
                                else "Checked against the rules", "done")
            return result
        logger.info(f"[outreach_draft] attempt {attempt} rejected: {problems}")
        if attempt == 1:
            await progress_line(emit, "check", _fixing_label(problems), "active")
        extra = prompts.correction(problems)

    await progress_line(emit, "check", "The draft still broke a rule", "failed")
    raise DraftFailed(COULD_NOT_WRITE)


async def rewrite_draft(*, research: dict, record_text: str, student_name: str, subject: str, body: str,
                        style: str, purpose: str, voice: str) -> dict:
    """The student's current email, rewritten one way (a chip): {"subject",
    "body", "claims", "facts_to_verify"}. No search: the stored research is
    all it uses. Raises DraftFailed."""
    if not valid_tweak(style):
        raise DraftFailed("That rewrite is not available.")
    current = clean_body(body)
    if not current:
        raise DraftFailed("There is no email to rewrite yet.")
    words_now = word_count(current)
    first = first_name(student_name)
    allowed = research_urls(research)
    prompt = prompts.rewrite_prompt(
        research=research, record_text=record_text, first_name=first, subject=_clean_subject(subject), body=current,
        style=style, purpose=purpose, voice=voice, current_words=words_now,
    )
    tool = prompts.draft_tool(False)

    extra = ""
    for attempt in (1, 2):
        raw = await _call(model=OUTREACH_REWRITE_MODEL, system=prompts.DRAFT_SYSTEM, prompt=prompt + extra, tool=tool,
                          label="outreach_rewrite", max_tokens=1500)
        result, problems = check_draft(raw, allowed_urls=allowed, first=first, max_words=MAX_WORDS,
                                       min_words=MIN_REWRITE_WORDS, allow_question=False, final=attempt == 2)
        if not problems and style == "shorter" and word_count(result["body"]) >= words_now:
            problems = [f"It is not shorter: {word_count(result['body'])} words against {words_now} now. "
                        f"Cut at least a quarter of the words."]
        if not problems:
            return result
        logger.info(f"[outreach_rewrite] attempt {attempt} rejected: {problems}")
        extra = prompts.correction(problems)
    raise DraftFailed(COULD_NOT_WRITE)


def _sentences(body: str) -> int:
    """Sentences between the greeting line and the sign off."""
    lines = [line for line in body.split("\n") if line.strip()]
    if lines and re.match(r"^(dear|hi|hello)\b", lines[0], re.IGNORECASE) and len(lines[0].split()) <= 6:
        lines = lines[1:]
    if lines and len(lines[-1].split()) <= 3:
        lines = lines[:-1]
    if lines and len(lines[-1].split()) <= 3 and lines[-1].rstrip().endswith(","):
        lines = lines[:-1]
    return len(re.findall(r"[^.!?]+[.!?]+", " ".join(lines)))


async def write_followup(*, research: dict, student_name: str, subject: str, body_sent: str,
                         days_since: int) -> str:
    """A two or three sentence nudge for the same thread, under 70 words, that
    points back to the first email and gives one easy out. Raises DraftFailed."""
    first = first_name(student_name)
    prompt = prompts.followup_prompt(research=research, first_name=first, subject=_clean_subject(subject),
                                     body_sent=clean_body(body_sent), days_since=days_since)
    extra = ""
    for attempt in (1, 2):
        raw = await _call(model=OUTREACH_FOLLOWUP_MODEL, system=None, prompt=prompt + extra,
                          tool=prompts.FOLLOWUP_TOOL, label="outreach_followup", max_tokens=600)
        body = _signed(clean_body(raw.get("body") if isinstance(raw, dict) else ""), first)
        problems = _length_problems(body, FOLLOWUP_MAX_WORDS, MIN_FOLLOWUP_WORDS) + _content_problems(body)
        if not problems and attempt == 1 and _sentences(body) > MAX_FOLLOWUP_SENTENCES:
            problems = ["It is too long. Keep it to two or three sentences between the greeting and your name."]
        if not problems:
            return body
        logger.info(f"[outreach_followup] attempt {attempt} rejected: {problems}")
        extra = prompts.correction(problems)
    raise DraftFailed(COULD_NOT_FOLLOW_UP)
