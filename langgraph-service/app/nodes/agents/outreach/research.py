"""
Beaker's research: who to write to, and what their work is about.

Two calls, both Haiku 4.5, each submitting its answer through a tool. The web
search behind them is a search API (Tavily, through search_pool.py) when a key is set: the
searches run here, and the model reads a short list of results in one plain
call, which is what keeps a try cheap. With no key, or when no key can answer,
they use Anthropic's web search tool (llm.search_completion), which costs many
times more:
- find_people: a goal becomes a shortlist of three to five real people.
- research_person: a named person becomes a few facts about their work, each
  with the page that states it, plus an email address if one is published.

Nothing the model submits is trusted as sent. A link survives only if a
search really returned it (or it is the page the student gave, fetched here),
is https, and is not on a blocked site. An email address survives only if it
appears on a page this service fetched itself (pages.fetch_page), that page
speaks for the person (their own profile, the page the student gave, or a page
on their organization's site, before and after any redirect), and the address
is theirs rather than an office's. A search that errored or never ran is a
failure the caller refunds (None), never "nobody found".

Beaker writes only to adults in a professional role. Someone who looks like a
school student, or a private person with no work page, comes back as
not_found with a reason and a message the student can read.

Progress goes to `emit` as the lines of the page's checklist: search-1,
search-2, ... for each search the model really ran (with its real query and
what came back), pick for the people chosen, email for the address check.
"""
import logging
import re
import unicodedata
from typing import Awaitable, Callable, Optional

import asyncio

from app.llm import ModelUnavailable, json_completion, openai_enabled, search_completion, tool_completion
from app.models import OUTREACH_FACTS_MODEL, OUTREACH_PEOPLE_MODEL, OUTREACH_QUERIES_MODEL, OUTREACH_RESEARCH_MODEL
from app import search_pool
from app.nodes.agents.outreach import pages, prompts
from app.nodes.quest.common import clean_text
from app.nodes.quest.resources import BLOCKED_DOMAINS

logger = logging.getLogger(__name__)

Emit = Callable[[dict], Awaitable[None]]

# Every search costs $0.01 and feeds its results back through the model, which
# costs more than the search itself, so the counts are as low as still finds
# someone: the shortlist needs breadth (2), a named person needs their page and
# one piece of work (3), and with their page already read (a shortlist pick, or
# a link the student gave) one more search is enough (1).
SHORTLIST_SEARCHES = 2
PERSON_SEARCHES = 3
PERSON_SEARCHES_PAGE_READ = 1
MAX_SEARCHES = SHORTLIST_SEARCHES      # kept for the tests that import it
MAX_CANDIDATES = 5
MAX_AMBIGUOUS = 3
MAX_FACTS = 6
PAGE_PROMPT_CHARS = 6000
LABEL_CHARS = 69

# On top of Quest's list: people-search and contact-scraping sites, whose
# addresses are guesses or were never meant to be public (a verified address
# must be one the person published), and a site of anonymous reviews.
OUTREACH_BLOCKED = BLOCKED_DOMAINS + [
    "rocketreach.co", "zoominfo.com", "contactout.com", "signalhire.com", "lusha.com", "apollo.io",
    "hunter.io", "snov.io", "spokeo.com", "whitepages.com", "beenverified.com", "truepeoplesearch.com",
    "fastpeoplesearch.com", "radaris.com", "peoplefinders.com", "ratemyprofessors.com",
]

# Where a verified address was found: a page the web search returned, or the
# link the student typed. The service holds a typed link to a stricter rule,
# since a student can type any page at all.
SOURCE_SEARCH = "search"
SOURCE_GIVEN = "given_url"

# Why a named person is not researched (research_person's not_found).
REFUSE_MINOR = "minor"
REFUSE_PRIVATE = "private_person"
REFUSAL_MESSAGES = {
    REFUSE_MINOR: ("Beaker only writes to adults in a professional role, like professors, researchers and program "
                   "staff. This person looks like a student under 18, so Beaker stopped here."),
    REFUSE_PRIVATE: ("Beaker only writes to people in a professional role with a public work page, like "
                     "professors, researchers and program staff. It could not find one for this person, so "
                     "Beaker stopped here."),
}
REFUSAL_LINE = "Beaker only writes to adults in a professional role"


# ── Progress ─────────────────────────────────────────────────────────────────

async def progress_line(emit: Optional[Emit], line_id: str, label: str, status: str) -> None:
    """Send one checklist line. A broken progress stream never stops the work."""
    if emit is None:
        return
    try:
        await emit({"type": "progress", "id": line_id, "label": clean_text(label, LABEL_CHARS), "status": status})
    except Exception as exc:
        logger.warning(f"[outreach] progress event failed: {exc}")


def _found_label(count: int, domains: list) -> str:
    if not count:
        return "That search found nothing"
    names = ", ".join(str(d) for d in (domains or [])[:3])
    pages_word = "page" if count == 1 else "pages"
    return f"Found {count} {pages_word} on {names}" if names else f"Found {count} {pages_word}"


class _SearchLines:
    """Turns search_completion's events into search-<n> lines.

    The model's turn comes back whole, so a placeholder line goes up first and
    the first real search takes it over. A result closes the oldest search still
    waiting for one, and finish() closes anything left spinning.
    """

    def __init__(self, emit: Optional[Emit], first: int = 1):
        self.emit = emit
        self.next = first
        self.open: list[str] = []
        self.placeholder: Optional[str] = None

    def _new_line(self) -> str:
        if self.placeholder:
            line, self.placeholder = self.placeholder, None
            return line
        line = f"search-{self.next}"
        self.next += 1
        return line

    async def start(self) -> None:
        self.placeholder = f"search-{self.next}"
        self.next += 1
        await progress_line(self.emit, self.placeholder, "Searching the web", "active")

    async def on_event(self, event) -> None:
        kind = event.get("type") if isinstance(event, dict) else None
        if kind == "search":
            line = self._new_line()
            self.open.append(line)
            query = clean_text(event.get("query"), 55)
            await progress_line(self.emit, line, f"Searching: {query}" if query else "Searching the web", "active")
        elif kind in ("results", "search_error"):
            line = self.open.pop(0) if self.open else self._new_line()
            if kind == "search_error":
                await progress_line(self.emit, line, "That search did not go through", "failed")
            else:
                await progress_line(self.emit, line, _found_label(event.get("count") or 0, event.get("domains")), "done")

    async def finish(self) -> None:
        if self.placeholder:
            await progress_line(self.emit, self.placeholder, "No search ran", "failed")
            self.placeholder = None
        for line in self.open:
            await progress_line(self.emit, line, "That search did not come back", "failed")
        self.open = []


# ── Searching ────────────────────────────────────────────────────────────────

QUERIES_TOOL = {
    "name": "submit_queries",
    "description": "Submit the web search queries.",
    "input_schema": {
        "type": "object",
        "properties": {"queries": {"type": "array", "items": {"type": "string"},
                                   "description": "Two queries, four to ten words each, from different angles."}},
        "required": ["queries"],
    },
}

QUERIES_PROMPT = """A US high school student wants to email someone who could help with a goal. Write two short web search queries (four to ten words each) that would find official pages of the right people: faculty profiles, lab pages, university outreach programs, or a professional's work bio. Use different angles: one on the field and the kind of person, one on the kind of page (a lab, a program, a directory). Keep the student's own name and personal details out.

THE GOAL, IN THEIR WORDS:
{goal}"""

READ_PAGES = 2                  # pages read in full when researching a named person
READ_PAGE_CHARS = 3500


def _strict(schema):
    """A tool's input schema as OpenAI's strict mode wants it: every property
    required and no extras, all the way down."""
    if isinstance(schema, dict):
        out = {k: _strict(v) for k, v in schema.items()}
        if out.get("type") == "object" and isinstance(out.get("properties"), dict):
            out["required"] = list(out["properties"])
            out["additionalProperties"] = False
        return out
    if isinstance(schema, list):
        return [_strict(v) for v in schema]
    return schema


async def _extract(*, label: str, prompt: str, tool: dict, max_tokens: int, openai_model: str) -> Optional[dict]:
    """One reading job: the model's answer as a dict, or None. OpenAI's small
    model first (strict JSON schema, several times cheaper), and Haiku through
    a forced tool when there is no OpenAI key or that call gave nothing.
    Raises ModelUnavailable only when Haiku cannot be reached either."""
    if openai_enabled():
        out = await json_completion(prompt=prompt, schema=_strict(tool["input_schema"]), schema_name=label,
                                    openai_model=openai_model, anthropic_model=OUTREACH_RESEARCH_MODEL,
                                    max_tokens=max_tokens)
        if isinstance(out, dict):
            return out
        logger.warning(f"[{label}] {openai_model} gave no usable answer; asking Haiku")
    return await tool_completion(model=OUTREACH_RESEARCH_MODEL, prompt=prompt, tool=tool, max_tokens=max_tokens,
                                 label=label)


async def _write_queries(goal: str) -> list[str]:
    """Two search queries for a goal, from a tiny model call. The goal itself
    is the fallback: a student's own words search well enough."""
    try:
        got = await _extract(label="outreach_queries", prompt=QUERIES_PROMPT.format(goal=goal), tool=QUERIES_TOOL,
                             max_tokens=200, openai_model=OUTREACH_QUERIES_MODEL)
    except ModelUnavailable:
        got = None
    queries = []
    for q in (got or {}).get("queries", []) if isinstance(got, dict) else []:
        q = clean_text(q, 120)
        if 3 <= len(q) and q.lower() not in [x.lower() for x in queries]:
            queries.append(q)
    return queries[:2] or [clean_text(goal, 200)]


async def _search_answer(*, label: str, prompt: str, tool: dict, max_tokens: int, queries, lines: "_SearchLines",
                         anthropic_searches: int, extract_model: str, read_pages: int = 0,
                         fetched: Optional[dict] = None, emit: Optional[Emit] = None):
    """(what the model submitted, the URLs the search returned, {"searches", "errors"}).

    With Tavily: run the queries, optionally read the top pages, and put the
    results in front of the model in one plain call. If no Tavily key can
    answer, or none is set, the model searches with Anthropic's own tool."""
    if search_pool.tavily.configured():
        try:
            return await _pooled_answer(label=label, prompt=prompt, tool=tool, max_tokens=max_tokens,
                                       queries=list(queries), lines=lines, read_pages=read_pages,
                                       fetched=fetched if fetched is not None else {}, emit=emit,
                                       extract_model=extract_model)
        except search_pool.SearchUnavailable:
            logger.warning(f"[{label}] Tavily could not answer; using Anthropic's web search instead")
    return await search_completion(
        model=OUTREACH_RESEARCH_MODEL, prompt=prompt, submit_tool=tool, max_tokens=max_tokens, label=label,
        max_searches=anthropic_searches, blocked_domains=OUTREACH_BLOCKED, on_event=lines.on_event)


async def _pooled_answer(*, label, prompt, tool, max_tokens, queries, lines, read_pages, fetched, emit,
                         extract_model):
    results: list[dict] = []
    seen: set[str] = set()
    ran = errors = 0
    for query in queries:
        await lines.on_event({"type": "search", "query": query})
        try:
            got = await search_pool.tavily.web_search(query, blocked=OUTREACH_BLOCKED)
        except search_pool.SearchUnavailable:
            await lines.on_event({"type": "search_error"})
            if not ran:
                raise                                   # nothing worked: let the caller fall back
            errors += 1
            continue
        ran += 1
        await lines.on_event({"type": "results", "count": len(got), "domains": _domains_of(got)})
        for r in got:
            if r["url"] not in seen and len(results) < 12:
                seen.add(r["url"])
                results.append(r)

    texts: dict[str, str] = {}
    extra: set[str] = set()
    if read_pages and results:
        picks = results[:read_pages]
        await progress_line(emit, "read", f"Reading their page on {pages.domain_of(picks[0]['url'])}", "active")
        got_pages = await asyncio.gather(*[_fetch_cached(r["url"], fetched) for r in picks])
        for r, page in zip(picks, got_pages):
            if page is not None and page.text:
                texts[r["url"]] = page.text[:READ_PAGE_CHARS]
                extra |= {r["url"], page.final_url}
        await progress_line(emit, "read", f"Read {len(texts)} page{'s' if len(texts) != 1 else ''}" if texts
                            else "Could not open their pages, using the search results", "done" if texts else "failed")

    raw = await _extract(label=label, prompt=prompt + "\n\n" + search_pool.results_block(results, texts), tool=tool,
                         max_tokens=max_tokens, openai_model=extract_model)
    return raw, {r["url"] for r in results} | extra, {"searches": ran, "errors": errors}


def _domains_of(results: list[dict], limit: int = 4) -> list[str]:
    out: list[str] = []
    for r in results:
        host = pages.domain_of(r["url"])
        if host and host not in out:
            out.append(host)
        if len(out) == limit:
            break
    return out


# ── Links, names and people ──────────────────────────────────────────────────

def _blocked(url: str) -> bool:
    host = pages.domain_of(url)
    return any(host == d or host.endswith("." + d) for d in OUTREACH_BLOCKED)


def usable_url(url, allowed: set[str]) -> Optional[str]:
    """The URL if the search returned it (or it is the student's fetched page),
    it is https, and it is not on a blocked site."""
    if not isinstance(url, str):
        return None
    url = url.strip()
    if url not in allowed or not url.startswith("https://") or _blocked(url):
        return None
    return url


def _searched(returned: set, stats: dict) -> bool:
    """Whether "nothing found" would be an honest answer: a search ran and came
    back. An errored search, or a model that submitted without searching, is a
    failure to retry, as in Quest's resources."""
    return bool(returned) or (stats.get("searches", 0) > 0 and stats.get("errors", 0) == 0)


_HONORIFICS = {"dr", "prof", "professor", "mr", "mrs", "ms", "mx", "miss", "phd", "md", "jr", "sr",
               "ii", "iii", "iv", "dphil", "esq"}


def name_tokens(name) -> list[str]:
    """The words of a person's name, lowercased, accents and titles removed,
    initials dropped: "Dr. María J. Núñez-Ortiz" is ["maria", "nunezortiz"]."""
    text = unicodedata.normalize("NFKD", name if isinstance(name, str) else "")
    text = "".join(c for c in text if not unicodedata.combining(c)).lower()
    out = []
    for word in text.replace(",", " ").split():
        letters = re.sub(r"[^a-z]", "", word)
        if len(letters) > 1 and letters not in _HONORIFICS:
            out.append(letters)
    return out


def _name_key(name) -> str:
    return " ".join(sorted(name_tokens(name)))


def same_person(wanted: str, found: str) -> bool:
    """The name the search found is the name the student gave: the last name,
    and the first name or its initial when one was given."""
    want, got = name_tokens(wanted), name_tokens(found)
    if not want:
        return True
    if want[-1] not in got:
        return False
    return len(want) == 1 or want[0] in got


def name_matches_address(name: str, address: str) -> bool:
    """An address whose local part is built from the person's own name:
    mlee, maria.lee, leem, m.lee, lee, marialee for Maria Lee. Conservative on
    purpose: an address that fails this is only kept when the model cited the
    page it appears on and that page checks out."""
    tokens = name_tokens(name)
    local = address.split("@", 1)[0].lower() if isinstance(address, str) and "@" in address else ""
    parts = [p for p in re.split(r"[^a-z]+", local) if p]
    if not tokens or not parts:
        return False
    joined = "".join(parts)
    last = tokens[-1]
    if joined == last:
        return True
    if len(tokens) < 2:
        return False
    first = tokens[0]
    if last in parts and (first in parts or first[0] in parts):
        return True
    return joined in {first + last, last + first, first[0] + last, last + first[0], first + last[0]}


# Mailboxes that belong to an office, a lab, a program or a website, never to
# one person: a word of the local part (lee.lab, biology-dept), the whole of
# it (webmaster, noreply), or its start or end (gradadmissions, marineoffice).
ROLE_WORDS = frozenset({
    "info", "information", "contact", "contacts", "hello", "admin", "administrator", "webmaster", "web", "webteam",
    "admissions", "admission", "office", "dept", "department", "lab", "labs", "group", "hr", "help", "helpdesk",
    "support", "noreply", "donotreply", "reply", "press", "media", "news", "communications", "comms", "privacy",
    "registrar", "events", "outreach", "program", "programs", "inquiries", "enquiries", "questions", "feedback",
    "team", "staff", "general", "mail", "email", "reception", "frontdesk", "secretary", "advising", "undergrad",
    "grad", "graduate", "faculty", "jobs", "careers", "hiring", "recruiting", "sales", "marketing", "billing",
    "accounts", "security", "abuse", "postmaster", "hostmaster", "library", "alumni", "giving", "service",
    "services", "center", "centre", "institute", "school", "college", "chair", "director", "coordinator",
    "research", "membership", "members", "orders", "desk",
})
_ROLE_PREFIXES = ("info", "office", "dept", "admissions", "webmaster", "noreply", "donotreply", "support", "contact",
                  "registrar", "helpdesk", "enquir", "inquir", "outreach", "department", "admin")
_ROLE_SUFFIXES = ("info", "office", "dept", "admissions", "admission", "webmaster", "support", "registrar",
                  "helpdesk", "outreach", "program", "programs", "department", "lab", "labs", "group", "center",
                  "centre", "institute", "events", "news", "media", "press")


def is_role_address(address) -> bool:
    """An office's or a website's mailbox (info@, admissions@, biology.dept@,
    webmaster@), not a person's."""
    local = address.split("@", 1)[0].lower() if isinstance(address, str) and "@" in address else ""
    parts = [p for p in re.split(r"[^a-z]+", local) if p]
    if not parts:
        return False
    joined = "".join(parts)
    if joined in ROLE_WORDS or any(p in ROLE_WORDS for p in parts):
        return True
    return joined.startswith(_ROLE_PREFIXES) or joined.endswith(_ROLE_SUFFIXES)


# A role or a school that says they are a school student, so under 18 or near
# it: "High school junior", "10th grader", or a student at a high school. A
# teacher, coach or counselor at one is an adult in a professional role.
_SCHOOL_KID = re.compile(
    r"\b(?:high|middle|elementary|grade|junior high) ?school(?:er)?\b(?:\s+[\w-]+){0,2}?\s+"
    r"(?:student|intern|junior|senior|sophomore|freshman|pupil)s?\b"
    r"|\bhigh ?schooler\b|\b(?:[1-9]|1[0-2])(?:st|nd|rd|th)[- ]grader\b"
    r"|\b(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth)[- ]grader\b",
    re.IGNORECASE,
)
_SCHOOL = re.compile(r"\b(?:high|middle|elementary|primary|junior high|grade) school\b", re.IGNORECASE)


def looks_like_a_school_student(title, organization) -> bool:
    title = title if isinstance(title, str) else ""
    organization = organization if isinstance(organization, str) else ""
    if _SCHOOL_KID.search(title):
        return True
    is_student = re.search(r"\bstudent\b", title, re.IGNORECASE)
    staff = re.search(r"\b(?:services|affairs|success|support|life|director|coordinator|counselor|advisor|adviser|"
                      r"teacher|manager|officer|dean|principal|specialist|program)\b", title, re.IGNORECASE)
    return bool(is_student and not staff and _SCHOOL.search(organization))


def clean_candidates(raw, allowed: set[str], limit: int) -> list[dict]:
    """The model's people, kept only with a checked source link, one per name,
    and never someone who looks like a school student (the prompts leave them
    out; this is the check in code)."""
    out: list[dict] = []
    seen: set[str] = set()
    for item in (raw if isinstance(raw, list) else []):
        if not isinstance(item, dict):
            continue
        name = clean_text(item.get("name"), 120)
        key = _name_key(name)
        url = usable_url(item.get("source_url"), allowed)
        if not name or not key or not url or key in seen:
            continue
        if looks_like_a_school_student(item.get("title"), item.get("organization")):
            continue
        seen.add(key)
        out.append({
            "name": name,
            "title": clean_text(item.get("title"), 160),
            "organization": clean_text(item.get("organization"), 160),
            "why": clean_text(item.get("why"), 300),
            "source_url": url,
            "source_title": clean_text(item.get("source_title"), 160) or pages.domain_of(url),
        })
        if len(out) == limit:
            break
    return out


def _without_name(text: str, full: str) -> str:
    """text with the student's name taken out, as a name only.

    The whole name goes wherever it is, in any case. One part of it goes only
    where it stands as a name: spelled with its capital, and not inside some
    other proper noun. So "Samira is a junior" loses the name, while a student
    called Emily Park keeps "National Park Service", Will keeps "will", and
    Grace keeps "the Grace Hopper Celebration"."""
    words = [w for w in full.split() if len(re.sub(r"\W", "", w)) >= 2]
    if not words:
        return text
    if len(words) >= 2:
        for phrase in sorted({full.strip(), " ".join(words)}, key=len, reverse=True):
            pattern = r"\s+".join(re.escape(w) for w in phrase.split())
            text = re.sub(rf"(?<![\w'-]){pattern}(?![\w-])", "the student", text, flags=re.IGNORECASE)
    for word in sorted(set(words), key=len, reverse=True):
        # As a name is written in prose: "samira" or "SAMIRA" on the Name line is "Samira" there.
        forms = {word.capitalize()} if word.islower() else {word, word.capitalize()} if word.isupper() else {word}
        found = re.compile(r"(?<![\w'-])(?:" + "|".join(re.escape(f) for f in forms) + r")(?![\w-])")

        def swap(m, text=text):
            before, after = text[max(0, m.start() - 60):m.start()], text[m.end():m.end() + 60]
            if re.search(r"(?<![\w'-])[A-Z][\w'-]*[ \t]+$", before) or re.match(r"(?:'s)?[ \t]+[A-Z]", after):
                return m.group(0)       # part of another proper noun: Central Park, Will Rogers
            return "the student"
        text = found.sub(swap, text)
    return text


def research_record(record_text: str) -> str:
    """The record for a research prompt, without the student's name: the model
    doing the searching has no use for it, and it must never become a query.
    The "Name:" line goes, and the name is taken out of the rest too (the
    narrative summary can use it), as a name only (_without_name)."""
    kept, names = [], []
    for line in (record_text or "").splitlines():
        if line.strip().lower().startswith("name:"):
            names.append(line.split(":", 1)[1].strip())
        else:
            kept.append(line)
    text = "\n".join(kept).strip()
    for full in names:
        text = _without_name(text, full)
    return text


# ── The shortlist ────────────────────────────────────────────────────────────

async def find_people(goal: str, *, record_text: str, emit: Emit) -> Optional[list[dict]]:
    """Three to five real people for a goal. None when the search failed (the
    caller refunds); [] when it ran and nobody suitable turned up."""
    lines = _SearchLines(emit)
    await lines.start()
    prompt = prompts.find_people_prompt(goal=goal, record_text=research_record(record_text))
    try:
        queries = await _write_queries(goal) if search_pool.tavily.configured() else []
        raw, returned, stats = await _search_answer(
            label="outreach_people", prompt=prompt, tool=prompts.PEOPLE_TOOL, max_tokens=2500, queries=queries,
            lines=lines, anthropic_searches=SHORTLIST_SEARCHES, emit=emit, extract_model=OUTREACH_PEOPLE_MODEL)
    except ModelUnavailable as exc:
        logger.warning(f"[outreach_people] search unavailable: {exc}")
        await lines.finish()
        return None
    await lines.finish()
    if not _searched(returned, stats) or not isinstance(raw, dict) or not isinstance(raw.get("people"), list):
        logger.warning(f"[outreach_people] no usable search or submission: {stats}")
        return None
    people = clean_candidates(raw["people"], returned, MAX_CANDIDATES)
    if people:
        word = "person" if len(people) == 1 else "people"
        await progress_line(emit, "pick", f"Picked {len(people)} {word} for you to choose from", "done")
    else:
        await progress_line(emit, "pick", "Nobody on those pages was a good fit", "failed")
    return people


# ── One person ───────────────────────────────────────────────────────────────

def _clean_facts(raw, allowed: set[str], titles: dict[str, str]) -> list[dict]:
    out: list[dict] = []
    seen: set[str] = set()
    for item in (raw if isinstance(raw, list) else []):
        if not isinstance(item, dict):
            continue
        text = clean_text(item.get("text"), 240)
        url = usable_url(item.get("url"), allowed)
        if not text or not url or text.lower() in seen:
            continue
        seen.add(text.lower())
        out.append({"text": text, "url": url})
        title = clean_text(item.get("source_title"), 160)
        if title:
            titles.setdefault(url, title)
        if len(out) == MAX_FACTS:
            break
    return out


async def _fetch_cached(url: str, fetched: dict) -> Optional[pages.Page]:
    """The page at url, or None. A page that redirected to a blocked site (a
    contact scraper, a forum) counts as not fetched: the check on the link
    the search returned says nothing about where it leads."""
    if url not in fetched:
        page = await pages.fetch_page(url)
        if page is not None and (_blocked(page.final_url) or not page.final_url.startswith("https://")):
            logger.info("[outreach] a page redirected to a blocked site")
            page = None
        fetched[url] = page
        if page is not None:
            fetched.setdefault(page.final_url, page)
    return fetched[url]


def _words_on(page: pages.Page) -> set[str]:
    return set(name_tokens(page.text))


def _plausibly_theirs(address: str, person_name: str, page: pages.Page) -> bool:
    """The model's cited address is theirs: it carries their name, or it is the
    only address on a page that names them in full and it is not an office's
    (webmaster@, admissions@). A directory or lab page lists several people,
    and an address picked off it without their name could belong to any of
    them."""
    if name_matches_address(person_name, address):
        return True
    if is_role_address(address):
        return False
    tokens = name_tokens(person_name)
    if len(page.emails) != 1 or len(tokens) < 2:
        return False
    words = _words_on(page)
    return tokens[0] in words and tokens[-1] in words


def _stayed(url: str, page: pages.Page) -> bool:
    """The page is where its link said: no redirect to another site, and never
    to a blocked one."""
    return not _blocked(page.final_url) and pages.site_of(page.final_url) == pages.site_of(url)


def _speaks_for_them(address: str, url: str, page: pages.Page, *, own: set[str], org_site: str) -> bool:
    """The page an address was found on speaks for the person, so the address
    can be shown as theirs.

    - One of their own pages (their profile, or the link the student gave):
      any address on it.
    - Any other page the search returned: only one on their organization's
      site (the site of the profile page the search returned), and only an
      address at that site. A roster or a club page, even one on a
      university's site, can list a different person's personal address under
      the same name.
    Either way the page must not have redirected to another site."""
    if not _stayed(url, page):
        return False
    if url in own:
        return True
    return bool(org_site) and pages.site_of(url) == org_site and pages.site_of(address) == org_site


async def _verified_email(proposed, *, person_name: str, profile_url: str, searched: set[str], given: set[str],
                          fetched: dict, emit: Optional[Emit]) -> tuple[Optional[str], Optional[str], Optional[str]]:
    """(address, the link of the page it appears on, SOURCE_SEARCH or
    SOURCE_GIVEN), or (None, None, None). Never a guess. The link is the one
    the search returned or the student typed, not wherever it redirected."""
    await progress_line(emit, "email", "Checking for a public email address", "active")
    address = source = kind = None
    own = {u for u in (profile_url,) if u} | given
    org_site = pages.site_of(profile_url) if profile_url and profile_url in searched else ""

    # 1. The address the model cited, on the page it cited, fetched here.
    if isinstance(proposed, dict):
        wanted = pages.clean_address(proposed.get("address"))
        url = usable_url(proposed.get("url"), searched | given)
        if wanted and url:
            page = await _fetch_cached(url, fetched)
            if (page and pages.page_has_email(page, wanted) and _plausibly_theirs(wanted, person_name, page)
                    and _speaks_for_them(wanted, url, page, own=own, org_site=org_site)):
                address, source = wanted, url

    # 2. Their profile page: an address built from their name at the page's
    #    own site.
    if address is None and profile_url:
        page = await _fetch_cached(profile_url, fetched)
        if page and _stayed(profile_url, page):
            site = pages.site_of(page.final_url)
            mine = sorted(a for a in page.emails
                          if name_matches_address(person_name, a) and pages.site_of(a) == site)
            if mine:
                address, source = mine[0], profile_url

    if address:
        kind = SOURCE_GIVEN if source in given else SOURCE_SEARCH
        await progress_line(emit, "email", f"Email confirmed on {pages.domain_of(source)}", "done")
    else:
        await progress_line(emit, "email", "No public email found, you can add one", "done")
    return address, source, kind


def _sources(urls: list, titles: dict[str, str], fetched: dict) -> list[dict]:
    out: list[dict] = []
    seen: set[str] = set()
    for url in urls:
        if not url or url in seen:
            continue
        seen.add(url)
        page = fetched.get(url)
        title = titles.get(url) or (clean_text(page.title, 160) if page else "") or pages.domain_of(url)
        out.append({"url": url, "title": title, "domain": pages.domain_of(url)})
    return out


def _candidate_from(person: dict, facts: list[dict], titles: dict[str, str]) -> dict:
    url = person["profile_url"] or facts[0]["url"]
    return {
        "name": person["name"], "title": person["title"], "organization": person["organization"],
        "why": "The closest match the search found. Check this is the person you mean.",
        "source_url": url, "source_title": titles.get(url) or pages.domain_of(url),
    }


def refusal(reason: str) -> dict:
    """research_person's answer for someone Beaker does not write to."""
    return {"status": "not_found", "reason": reason, "message": REFUSAL_MESSAGES[reason]}


async def _found(raw: dict, *, wanted_name: str, wanted_org: str, searched: set[str], given: set[str],
                 titles: dict[str, str], fetched: dict, emit: Optional[Emit]) -> Optional[dict]:
    """The research for a "found" submission, or None when too little of it
    checks out to write a sourced email from."""
    allowed = searched | given
    person_raw = raw.get("person") if isinstance(raw.get("person"), dict) else {}
    facts = _clean_facts(raw.get("facts"), allowed, titles)
    if not facts:
        return None
    profile_url = usable_url(person_raw.get("profile_url"), allowed) or ""
    if profile_url:
        profile_title = clean_text(person_raw.get("profile_title"), 160)
        if profile_title:
            titles.setdefault(profile_url, profile_title)
    person = {
        "name": clean_text(person_raw.get("name"), 120) or wanted_name,
        "title": clean_text(person_raw.get("title"), 160),
        "organization": clean_text(person_raw.get("organization"), 160) or wanted_org,
        "profile_url": profile_url,
    }
    if looks_like_a_school_student(person["title"], person["organization"]):
        await progress_line(emit, "pick", REFUSAL_LINE, "failed")
        return refusal(REFUSE_MINOR)
    if not same_person(wanted_name, person["name"]):
        # Someone with a different name: let the student say whether it is them.
        await progress_line(emit, "pick", f"Found {person['name']}, check it is them", "done")
        return {"status": "ambiguous", "candidates": [_candidate_from(person, facts, titles)]}

    where = f" at {person['organization']}" if person["organization"] else ""
    await progress_line(emit, "pick", f"Found {person['name']}{where}", "done")
    email, email_url, email_kind = await _verified_email(
        raw.get("email"), person_name=person["name"], profile_url=profile_url, searched=searched, given=given,
        fetched=fetched, emit=emit,
    )
    return {
        "status": "found",
        "person": person,
        "facts": facts,
        "sources": _sources([profile_url] + [f["url"] for f in facts] + [email_url], titles, fetched),
        "verified_email": email,
        "email_source_url": email_url,
        "email_source_kind": email_kind,
    }


async def research_person(target: dict, *, emit: Emit) -> Optional[dict]:
    """What a named person works on, with sources, and their address if it is
    published. target is {"name", "organization", "url"}, plus "url_source":
    SOURCE_SEARCH when the url is a shortlist pick's source (a page Beaker's
    own search returned); without it the url counts as one the student typed.
    None when the search failed (the caller refunds); otherwise
    {"status": "found", ...} (with "email_source_kind": SOURCE_SEARCH or
    SOURCE_GIVEN when there is a verified address, else None),
    {"status": "ambiguous", "candidates": [...]}, {"status": "not_found"}, or
    {"status": "not_found", "reason": REFUSE_MINOR or REFUSE_PRIVATE,
    "message": plain words for the student} for someone Beaker does not
    write to."""
    target = target if isinstance(target, dict) else {}
    name = clean_text(target.get("name"), 120)
    organization = clean_text(target.get("organization"), 160)
    if not name:
        return {"status": "not_found"}

    allowed_extra: set[str] = set()
    titles: dict[str, str] = {}
    fetched: dict = {}
    given = target.get("url").strip() if isinstance(target.get("url"), str) else ""
    page = None
    first_line = 1
    if given:
        # The link that came with the person (typed by the student, or the
        # source of a shortlist pick) is read here, not searched: the model
        # sees its text, so facts from it stand on a page really fetched.
        first_line = 2
        domain = pages.domain_of(given) or "that link"
        await progress_line(emit, "search-1", f"Reading their page on {domain}", "active")
        page = None if _blocked(given) else await _fetch_cached(given, fetched)
        if page and page.text:
            allowed_extra |= {given, page.final_url}
            if page.title:
                titles.setdefault(given, clean_text(page.title, 160))
                titles.setdefault(page.final_url, clean_text(page.title, 160))
            await progress_line(emit, "search-1", f"Read {page.title or domain}", "done")
        else:
            page = None
            await progress_line(emit, "search-1", "Could not open that page, searching instead", "failed")

    lines = _SearchLines(emit, first=first_line)
    await lines.start()
    prompt = prompts.research_prompt(
        name=name, organization=organization, given_url=given if given and not _blocked(given) else "",
        page_title=page.title if page else "", page_text=page.text[:PAGE_PROMPT_CHARS] if page else "",
    )
    who = f"{name} {organization}".strip()
    queries = ([f"{who} publications OR research OR project"] if page
               else [f'"{name}" {organization}'.strip(), f"{who} faculty OR lab OR profile"])
    try:
        raw, returned, stats = await _search_answer(
            label="outreach_research", prompt=prompt, tool=prompts.RESEARCH_TOOL, max_tokens=3000, queries=queries,
            lines=lines, anthropic_searches=PERSON_SEARCHES_PAGE_READ if page else PERSON_SEARCHES,
            read_pages=0 if page else READ_PAGES, fetched=fetched, emit=emit, extract_model=OUTREACH_FACTS_MODEL)
    except ModelUnavailable as exc:
        logger.warning(f"[outreach_research] search unavailable: {exc}")
        await lines.finish()
        return None
    await lines.finish()
    if not isinstance(raw, dict):
        logger.warning(f"[outreach_research] no submission: {stats}")
        return None

    searched = _searched(returned, stats)
    allowed = set(returned) | allowed_extra
    status = raw.get("status")
    # A shortlist pick's page came from a search too; a typed link did not.
    if target.get("url_source") == SOURCE_SEARCH:
        from_search, from_student = set(returned) | allowed_extra, set()
    else:
        from_search, from_student = set(returned), allowed_extra

    # Someone Beaker does not write to: a school student, or a private person
    # with no work page. Said plainly, whatever else came back.
    kind = raw.get("recipient_kind")
    if kind in ("minor", "private"):
        await progress_line(emit, "pick", REFUSAL_LINE, "failed")
        return refusal(REFUSE_MINOR if kind == "minor" else REFUSE_PRIVATE)

    if status == "found":
        result = await _found(raw, wanted_name=name, wanted_org=organization, searched=from_search,
                              given=from_student, titles=titles, fetched=fetched, emit=emit)
        # Facts can stand on the student's own page even when a search failed.
        if result is not None:
            return result

    if not searched:
        logger.warning(f"[outreach_research] search did not run cleanly: {stats}")
        return None

    if status == "ambiguous":
        candidates = clean_candidates(raw.get("candidates"), allowed, MAX_AMBIGUOUS)
        if candidates:
            matches = "1 possible match" if len(candidates) == 1 else f"{len(candidates)} possible matches"
            await progress_line(emit, "pick", f"Found {matches} for {name}", "done")
            return {"status": "ambiguous", "candidates": candidates}

    await progress_line(emit, "pick", f"Could not find enough about {name}", "failed")
    return {"status": "not_found"}
