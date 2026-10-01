"""
Talon's research: real scholarships and activities for one student, each read
from its own page and checked in code.

One find, in the order the student watches it on the checklist:
- queries: gpt-nano turns the brief into three short web searches; code
  writes them from the student's own words when the model cannot.
- search-1..3: Tavily runs them (search_pool), and up to 15 pages not already
  on the student's board are kept. With no key, or when no key can answer,
  Anthropic's web search tool searches instead (about ten times dearer).
- read: up to 8 of those pages are fetched here (pages.fetch_page), 4 at a
  time, each opportunity's own pages before list sites.
- check: gpt-mini reads every page in one call and reports what each shows;
  rules.check_listing then checks each listing in code. A date, an amount or
  a requirement stays only if it is on its page, and scams, past deadlines
  and listings the student cannot apply to are left out with a reason they
  can read.
- fit: Haiku writes one line per listing on why it fits, tied to a named item
  in the student's record (or code writes a plain one), and rules.rank keeps 8.

No database here. Every model reply is type-checked field by field. A failure
shrinks the result rather than raising: None means no search could run at all
(or no model could read the pages it found), and the caller refunds.

Privacy: citizenship and the eligibility chips shape the searches and the
prompts as category words only. The brief, those, and the searches themselves
(which can carry those words) are never logged; log lines carry counts. The
student's full name is taken out of every search, and their record reaches the
"why it fits" prompt without it.
"""
import asyncio
import dataclasses
import logging
import re
from datetime import date, datetime, timezone
from typing import Optional
from urllib.parse import urldefrag

from app import search_pool
from app.llm import ModelUnavailable, json_completion, openai_enabled, search_completion, tool_completion
from app.models import FINDER_EXTRACT_MODEL, FINDER_FALLBACK_MODEL, FINDER_FIT_MODEL, FINDER_QUERIES_MODEL
from app.nodes.agents.finder import prompts, rules
from app.nodes.agents.outreach import pages
from app.nodes.agents.outreach.research import Emit, _SearchLines, _strict, progress_line, research_record
from app.nodes.quest.common import clean_text
from app.nodes.quest.resources import BLOCKED_DOMAINS

logger = logging.getLogger(__name__)

# The plan's cost per find: 3 queries, at most 8 pages read, one extract call
# and one fit call. Fetching a page costs nothing, so a page that will not open
# is replaced from the rest of the results, up to MAX_FETCHES tries.
QUERY_COUNT = 3
QUERY_MIN_WORDS = 4
QUERY_MAX_WORDS = 12
QUERY_CHARS = 120
RESULTS_KEPT = 15
PAGES_READ = 8
MAX_FETCHES = 12
FETCH_AT_ONCE = 4
PAGES_PER_SITE = 3              # so one site cannot fill the read
PAGE_PROMPT_CHARS = 6000        # of each page, in the extract prompt
CHECK_TEXT_CHARS = 100_000      # of each page, for the checks in code
MIN_PAGE_CHARS = 200            # less is a script-only page or an error
MAX_RAW_LISTINGS = 24
PER_PAGE = 2                    # entries one page may give
FALLBACK_SEARCHES = 3
MAX_DROPPED = 20
MAX_RECORD_ITEMS = 40
FIT_CHARS = 220
FALLBACK_WANT_CHARS = 80
RECHECK_NOTE_CHARS = 240

# On top of Quest's list (social media, forums, homework-answer sites): essay
# mills and essay-sample sites, since Talon never sends a student to buy or
# copy an essay; a paid scholarship-matching service (paying to be matched is
# the scam sign the rules drop on); and video, job-network and forum sites that
# never hold an opportunity's own page.
FINDER_BLOCKED = BLOCKED_DOMAINS + [
    "papersowl.com", "essayshark.com", "grademiners.com", "ukessays.com", "edubirdie.com", "studybay.com",
    "speedypaper.com", "myperfectwords.com", "kingessays.com", "paperhelp.org", "99papers.com", "123helpme.com",
    "ivypanda.com", "gradesfixer.com", "studymoose.com", "writemypapers.org", "essaywriter.org",
    "scholarshipowl.com",
    "youtube.com", "linkedin.com", "collegeconfidential.com",
]


def _blocked(url) -> bool:
    host = pages.domain_of(url)
    return bool(host) and any(host == d or host.endswith("." + d) for d in FINDER_BLOCKED)


def _plural(n: int, word: str) -> str:
    return f"{n} {word}" if n == 1 else f"{n} {word}s"


def _found_label(results: list[dict]) -> str:
    if not results:
        return "That search found nothing"
    hosts: list[str] = []
    for r in results:
        host = pages.domain_of(r.get("url"))
        if host and host not in hosts:
            hosts.append(host)
        if len(hosts) == 3:
            break
    found = f"Found {_plural(len(results), 'page')}"
    return f"{found} on {', '.join(hosts)}" if hosts else found


async def _ask(*, label: str, prompt: str, tool: dict, max_tokens: int, openai_model: str,
               expect: str) -> Optional[dict]:
    """One structured job, as Beaker's _extract: OpenAI's small model under a
    strict schema first, then Haiku through a forced tool when there is no
    OpenAI key or that call gave nothing usable. The reply only when its
    `expect` field is a list; None when no model gave one. Never raises."""
    if openai_enabled():
        out = await json_completion(prompt=prompt, schema=_strict(tool["input_schema"]), schema_name=label,
                                    openai_model=openai_model, anthropic_model=FINDER_FALLBACK_MODEL,
                                    max_tokens=max_tokens)
        if isinstance(out, dict) and isinstance(out.get(expect), list):
            return out
        logger.warning(f"[{label}] {openai_model} gave no usable answer; asking {FINDER_FALLBACK_MODEL}")
    try:
        out = await tool_completion(model=FINDER_FALLBACK_MODEL, prompt=prompt, tool=tool, max_tokens=max_tokens,
                                    label=label)
    except ModelUnavailable as exc:
        logger.warning(f"[{label}] {FINDER_FALLBACK_MODEL} unavailable: {type(exc).__name__}")
        return None
    return out if isinstance(out, dict) and isinstance(out.get(expect), list) else None


# ── The searches ─────────────────────────────────────────────────────────────

def _student_names(record_text) -> list[str]:
    """The student's name as the record's "Name:" line gives it."""
    names = []
    for line in (record_text or "").splitlines():
        if line.strip().lower().startswith("name:"):
            name = line.split(":", 1)[1].strip()
            if name:
                names.append(name)
    return names


def _without_names(text: str, names: list[str]) -> str:
    """text without the student's full name (first and last, with up to two
    words between), in any case. A first or last name alone stays: too many
    are ordinary words (Park, Will, Grace) to take out of a search, and alone
    one does not say who the student is."""
    for full in names:
        words = [w for w in re.findall(r"[^\W\d_][\w'-]*", full) if len(w) >= 2]
        if len(words) < 2:
            continue
        first, last = re.escape(words[0]), re.escape(words[-1])
        text = re.sub(rf"(?<![\w'-]){first}(?:\s+[\w'.-]+){{0,2}}?\s+{last}(?![\w'-])", " ", text,
                      flags=re.IGNORECASE)
    return " ".join(text.split())


def _clean_query(value, names: list[str]) -> str:
    text = _without_names(clean_text(value, 400), names)
    text = re.sub(r"[\"\u201c\u201d]", " ", text)
    return clean_text(" ".join(text.split()[:QUERY_MAX_WORDS]), QUERY_CHARS)


def _fallback_queries(brief: dict, today: date) -> list[str]:
    """Searches built from the student's own words, the lane and the year,
    for when the model gives fewer than three."""
    lane = brief.get("lane") if brief.get("lane") in rules.LANES else "scholarship"
    want = clean_text(brief.get("want"), 70)
    year = rules.cycle_year(today)
    interests = [clean_text(i, 40) for i in (brief.get("interests") if isinstance(brief.get("interests"), list) else [])]
    interest = next((i for i in interests if i), "")
    chips = [rules.CHIPS[c] for c in (brief.get("chips") if isinstance(brief.get("chips"), list) else [])
             if isinstance(c, str) and c in rules.CHIPS]
    if lane == "scholarship":
        state = rules.state_name(brief.get("state"))
        base = want if "scholarship" in want.lower() else f"{want} scholarship"
        return [
            f"{base} {year}",
            f"{base} for high school students {state}",
            f"{(chips[0] if chips else '') or interest or 'high school'} scholarship {state} {year}",
        ]
    state = rules.state_name(brief.get("state")) if brief.get("travel") == "local" else ""
    where = "online" if brief.get("travel") == "online" else state
    season = f"summer {year}" if brief.get("when") == "summer" else "program"
    return [
        f"{want} for high school students {year}",
        f"{want} for teens {where}",
        f"{interest or want} {season} for high school students {where}",
    ]


async def _write_queries(brief: dict, today: date, names: list[str]) -> list[str]:
    got = await _ask(label="finder_queries", prompt=prompts.queries_prompt(brief, today), tool=prompts.QUERIES_TOOL,
                     max_tokens=400, openai_model=FINDER_QUERIES_MODEL, expect="queries")
    queries: list[str] = []
    for value in (got or {}).get("queries", []):
        query = _clean_query(value, names)
        if len(query.split()) >= QUERY_MIN_WORDS and query.lower() not in {q.lower() for q in queries}:
            queries.append(query)
        if len(queries) == QUERY_COUNT:
            break
    for value in _fallback_queries(brief, today):
        if len(queries) == QUERY_COUNT:
            break
        query = _clean_query(value, names)
        if query and query.lower() not in {q.lower() for q in queries}:
            queries.append(query)
    return queries


async def _tavily(queries: list[str], emit: Optional[Emit]) -> Optional[list[list[dict]]]:
    """Each query's results, run at once. None when not one search went
    through, so the caller can fall back."""
    async def one(n: int, query: str) -> Optional[list[dict]]:
        line = f"search-{n}"
        await progress_line(emit, line, f"Searching: {clean_text(query, 55)}", "active")
        try:
            found = await search_pool.tavily.web_search(query, blocked=FINDER_BLOCKED)
        except search_pool.SearchUnavailable:
            await progress_line(emit, line, "That search did not go through", "failed")
            return None
        await progress_line(emit, line, _found_label(found), "done")
        return found

    got = await asyncio.gather(*[one(n, q) for n, q in enumerate(queries, start=1)])
    if all(g is None for g in got):
        return None
    return [g for g in got if g is not None]


def _interleave(lists: list[list[dict]]) -> list[dict]:
    """Each search's first result, then each one's second, and so on, so every
    search's best pages are near the front."""
    out: list[dict] = []
    for i in range(max((len(x) for x in lists), default=0)):
        out.extend(x[i] for x in lists if i < len(x))
    return out


async def _anthropic_search(queries: list[str], *, lane: str, today: date, emit: Optional[Emit],
                            first: int) -> Optional[list[dict]]:
    """Results from Anthropic's web search tool, kept only when the search
    really returned them. None when it could not search."""
    lines = _SearchLines(emit, first=first)
    await lines.start()
    try:
        raw, found, stats = await search_completion(
            model=FINDER_FALLBACK_MODEL, prompt=prompts.search_prompt(lane=lane, queries=queries, today=today),
            submit_tool=prompts.SEARCH_TOOL, max_tokens=1500, label="finder_search",
            max_searches=FALLBACK_SEARCHES, blocked_domains=FINDER_BLOCKED, on_event=lines.on_event)
    except ModelUnavailable as exc:
        logger.warning(f"[finder] Anthropic's web search is unavailable: {type(exc).__name__}")
        await lines.finish()
        return None
    await lines.finish()
    # "Nothing found" is honest only when a search ran and came back.
    if not found and not (stats.get("searches", 0) > 0 and stats.get("errors", 0) == 0):
        logger.warning(f"[finder] no search ran cleanly: {stats}")
        return None
    out: list[dict] = []
    seen: set[str] = set()
    submitted = raw.get("results") if isinstance(raw, dict) and isinstance(raw.get("results"), list) else []
    for item in submitted:
        url = item.get("url").strip() if isinstance(item, dict) and isinstance(item.get("url"), str) else ""
        if url in found and url not in seen:
            seen.add(url)
            out.append({"title": clean_text(item.get("title"), 160), "url": url, "snippet": ""})
    if not out:                         # the model submitted nothing usable: the search's own results
        out = [{"title": "", "url": u, "snippet": ""} for u in sorted(found)]
    return out


async def _search(queries: list[str], *, lane: str, today: date, known: set[str], already: set[str],
                  emit: Optional[Emit]) -> Optional[list[dict]]:
    """Up to RESULTS_KEPT new results ({title, url, canonical, aggregator}),
    or None when no search could run. A result already on the board goes into
    `already` instead."""
    results = None
    first_line = 1
    if search_pool.tavily.configured():
        lists = await _tavily(queries, emit)
        if lists is not None:
            results = _interleave(lists)
        else:
            logger.warning("[finder] Tavily could not answer; using Anthropic's web search instead")
            first_line = len(queries) + 1
    if results is None:
        results = await _anthropic_search(queries, lane=lane, today=today, emit=emit, first=first_line)
        if results is None:
            return None

    kept: list[dict] = []
    seen: set[str] = set()
    for r in results:
        checked = pages.checked_url(r.get("url"))
        if checked is None or _blocked(checked[0]):
            continue
        canonical = rules.canonical_url(checked[0])
        if canonical in known:
            already.add(canonical)
            continue
        if canonical in seen:
            continue
        seen.add(canonical)
        kept.append({"title": r.get("title") or "", "url": checked[0], "canonical": canonical,
                     "aggregator": rules.is_aggregator(checked[0])})
        if len(kept) == RESULTS_KEPT:
            break
    return kept


# ── Reading the pages ────────────────────────────────────────────────────────

def _reading_order(results: list[dict]) -> list[dict]:
    """Each opportunity's own pages before list sites (only an own page can
    give a verified listing), at most PAGES_PER_SITE from one site."""
    ordered = [r for r in results if not r["aggregator"]] + [r for r in results if r["aggregator"]]
    out: list[dict] = []
    per_site: dict[str, int] = {}
    for r in ordered:
        site = pages.site_of(r["url"])
        if per_site.get(site, 0) >= PAGES_PER_SITE:
            continue
        per_site[site] = per_site.get(site, 0) + 1
        out.append(r)
    return out


def _usable(page: Optional[pages.Page]) -> Optional[pages.Page]:
    """The page, trimmed for reading, if it opened on an allowed https page
    with enough text to read; else None."""
    if page is None or len(page.text or "") < MIN_PAGE_CHARS:
        return None
    checked = pages.checked_url(page.final_url)
    if checked is None or _blocked(checked[0]):
        return None
    return dataclasses.replace(page, final_url=checked[0], text=page.text[:CHECK_TEXT_CHARS], emails=set())


async def _read(results: list[dict], *, known: set[str], already: set[str],
                emit: Optional[Emit]) -> list[pages.Page]:
    queue = _reading_order(results)
    if not queue:
        return []
    await progress_line(emit, "read", f"Reading {_plural(min(len(queue), PAGES_READ), 'page')}", "active")
    gate = asyncio.Semaphore(FETCH_AT_ONCE)

    async def fetch(r: dict) -> Optional[pages.Page]:
        async with gate:
            return _usable(await pages.fetch_page(r["url"]))

    read: list[pages.Page] = []
    seen: set[str] = set()
    tried = 0
    while queue and len(read) < PAGES_READ and tried < MAX_FETCHES:
        wave = queue[:min(PAGES_READ - len(read), MAX_FETCHES - tried)]
        queue = queue[len(wave):]
        tried += len(wave)
        for page in await asyncio.gather(*[fetch(r) for r in wave]):
            if page is None:
                continue
            canonical = rules.canonical_url(page.final_url)
            if canonical in known:              # it redirected to something already on the board
                already.add(canonical)
                continue
            if canonical in seen or len(read) == PAGES_READ:
                continue
            seen.add(canonical)
            read.append(page)
    if read:
        await progress_line(emit, "read", f"Read {_plural(len(read), 'page')}", "done")
    else:
        await progress_line(emit, "read", "Couldn't open any of those pages", "failed")
    return read


# ── Checking ─────────────────────────────────────────────────────────────────

def _title_key(title) -> str:
    return re.sub(r"[^a-z0-9]+", " ", rules.plain(title)).strip()


def _check_all(raw: list, read: list[pages.Page], brief: dict, today: date,
               known: set[str]) -> tuple[list[dict], list[dict], set[str], int]:
    """(kept listings, dropped ones with their reasons, canonical links already
    on the board, how many entries were checked). Pure, so it runs off the
    event loop.

    A page gives at most PER_PAGE entries. Its first entry the model calls its
    own page links to the page itself; every other entry from it (a list
    page's, or a second one on a provider's page) links to its own name on the
    page, so each one is its own listing."""
    kept: list[dict] = []
    dropped: list[dict] = []
    already: set[str] = set()
    seen_links: set[str] = set()
    by_title: dict[str, list[list]] = {}        # title key -> [[provider key, index in kept], ...]
    per_page: dict[int, int] = {}
    plain_link_used: set[int] = set()
    checked = 0
    for item in raw[:MAX_RAW_LISTINGS]:
        if not isinstance(item, dict):
            continue
        n = item.get("page")
        if isinstance(n, bool) or not isinstance(n, int) or not 1 <= n <= len(read):
            continue
        if per_page.get(n, 0) >= PER_PAGE:
            continue
        per_page[n] = per_page.get(n, 0) + 1
        plain_link = item.get("own_page") is True and n not in plain_link_used
        if plain_link:
            plain_link_used.add(n)
        checked += 1
        listing, drop = rules.check_listing(item, read[n - 1], brief, today, link_to_entry=not plain_link)
        if drop is not None:
            dropped.append(drop)
            continue
        if listing is None:
            continue
        link = listing["canonical_url"]
        if link in known:
            already.add(link)
            continue
        if link in seen_links:
            continue
        seen_links.add(link)
        # The same opportunity twice (a list site's copy and the provider's
        # own): the same name from the same provider, or from one with no
        # provider given. Keep the verified copy. Two providers' programs that
        # share a generic name ("Summer Research Program") are both kept.
        key, provider = _title_key(listing["title"]), _title_key(listing.get("provider"))
        entries = by_title.setdefault(key, [])
        same = next((e for e in entries if not e[0] or not provider or e[0] == provider), None)
        if same is not None:
            if listing["verified"] and not kept[same[1]]["verified"]:
                kept[same[1]] = listing
                same[0] = provider or same[0]
            continue
        entries.append([provider, len(kept)])
        kept.append(listing)

    kept_titles = {_title_key(listing["title"]) for listing in kept}
    out: list[dict] = []
    seen_drops: set[tuple[str, str]] = set()
    for drop in dropped:
        key = (_title_key(drop["title"]), drop["reason"])
        if key[0] in kept_titles or key in seen_drops:
            continue
        seen_drops.add(key)
        out.append(drop)
    return kept, out[:MAX_DROPPED], already, checked


# ── Why it fits ──────────────────────────────────────────────────────────────

async def _explain(listings: list[dict], *, brief: dict, record_text: str, record_items: list) -> None:
    """Sets fit_reason and record_ref on each listing. A reason stays only when
    it names an item of the student's record (record_ref, spelled as the
    record spells it) and says nothing about chances; every other listing gets
    the plain line built here."""
    want = clean_text(brief.get("want"), FALLBACK_WANT_CHARS)
    fallback = clean_text(f"Matches what you asked for: {want}", FIT_CHARS) if want else "Matches what you asked for."
    for listing in listings:
        listing["fit_reason"], listing["record_ref"] = fallback, ""
    items: dict[str, str] = {}
    for value in record_items or []:
        name = clean_text(value, 160)
        if name:
            items.setdefault(rules.plain(name), name)
    if not listings or not items:
        return
    try:
        raw = await tool_completion(
            model=FINDER_FIT_MODEL, tool=prompts.FIT_TOOL, max_tokens=2000, label="finder_fit",
            prompt=prompts.fit_prompt(brief=brief, record_text=research_record(record_text),
                                      record_items=list(items.values())[:MAX_RECORD_ITEMS], listings=listings))
    except ModelUnavailable as exc:
        logger.warning(f"[finder_fit] {FINDER_FIT_MODEL} unavailable: {type(exc).__name__}")
        return
    fits = raw.get("fits") if isinstance(raw, dict) else None
    if not isinstance(fits, list):
        logger.warning("[finder_fit] no usable reply")
        return
    done: set[int] = set()
    for fit in fits:
        if not isinstance(fit, dict):
            continue
        n = fit.get("index")
        if isinstance(n, bool) or not isinstance(n, int) or not 1 <= n <= len(listings) or n in done:
            continue
        ref = items.get(rules.plain(fit.get("record_item")))
        reason = clean_text(fit.get("reason"), FIT_CHARS)
        if not ref or not reason or not rules.no_odds(reason) or rules.plain(ref) not in rules.plain(reason):
            continue
        done.add(n)
        listings[n - 1]["fit_reason"], listings[n - 1]["record_ref"] = reason, ref


# ── A find ───────────────────────────────────────────────────────────────────

async def find_listings(brief: dict, *, record_text: str, record_items: list[str], known_urls: set[str],
                        today: date, emit: Emit) -> Optional[dict]:
    """Real listings for a brief (service._brief's shape), checked and ranked.

    None when the search could not run at all (every pool key and Anthropic's
    search failed) or no model could read the pages: the caller refunds.
    Otherwise {"listings": [...] (ranked, at most 8, each a finder_items row
    without the columns the service sets), "dropped": [{"title", "reason",
    "message"}], "already": how many it found that were already on the board}.

    known_urls: the canonical_url of every listing on the student's board,
    dismissed ones included, so nothing comes back. record_items: the names in
    their record (activity and award titles, course names, majors) a "why it
    fits" line may name."""
    brief = brief if isinstance(brief, dict) else {}
    lane = brief.get("lane") if brief.get("lane") in rules.LANES else "scholarship"
    known = {u for u in (known_urls or ()) if isinstance(u, str)}
    known |= {rules.canonical_url(u) for u in known}
    already: set[str] = set()
    started = datetime.now(timezone.utc)

    await progress_line(emit, "queries", f"Writing {QUERY_COUNT} searches", "active")
    queries = await _write_queries(brief, today, _student_names(record_text))
    await progress_line(emit, "queries", f"Wrote {len(queries)} {'search' if len(queries) == 1 else 'searches'}",
                        "done")

    results = await _search(queries, lane=lane, today=today, known=known, already=already, emit=emit)
    if results is None:
        logger.warning(f"[finder] {lane} find: no search could run")
        return None

    read = await _read(results, known=known, already=already, emit=emit)
    if not read:
        logger.info(f"[finder] {lane} find: {len(results)} results, no page opened, {len(already)} already")
        return {"listings": [], "dropped": [], "already": len(already)}

    await progress_line(emit, "check", f"Checking what {_plural(len(read), 'page')} say", "active")
    pages_for_prompt = [{"url": p.final_url, "title": p.title, "text": p.text[:PAGE_PROMPT_CHARS]} for p in read]
    got = await _ask(label="finder_extract", prompt=prompts.extract_prompt(brief=brief, pages=pages_for_prompt,
                                                                            today=today),
                     tool=prompts.EXTRACT_TOOL, max_tokens=6000, openai_model=FINDER_EXTRACT_MODEL,
                     expect="listings")
    if got is None:
        await progress_line(emit, "check", "Couldn't read those pages just now", "failed")
        logger.warning(f"[finder] {lane} find: no model could read {len(read)} pages")
        return None

    kept, dropped, more, checked = await asyncio.to_thread(_check_all, got["listings"], read, brief, today, known)
    already |= more
    if checked:
        await progress_line(emit, "check", f"Checked {_plural(checked, 'listing')}, kept {len(kept)}", "done")
    else:
        await progress_line(emit, "check", "Nothing on those pages could be checked", "failed")

    if kept:
        await progress_line(emit, "fit", "Explaining why each one fits you", "active")
        await _explain(kept, brief=brief, record_text=record_text, record_items=record_items)
        await progress_line(emit, "fit", "Explained why each one fits you", "done")

    listings = rules.rank(kept, today)
    seconds = (datetime.now(timezone.utc) - started).total_seconds()
    logger.info(f"[finder] {lane} find: {len(queries)} searches, {len(results)} results, {len(read)} pages read, "
                f"{checked} checked, {len(kept)} kept, {len(listings)} shown, {len(dropped)} dropped, "
                f"{len(already)} already, {seconds:.1f}s")
    return {"listings": listings, "dropped": dropped, "already": len(already)}


# ── A recheck ────────────────────────────────────────────────────────────────

async def _open_saved(item: dict) -> Optional[pages.Page]:
    """The saved listing's page: its source page, else its link. A page that
    moved to another site does not count as found (an expired domain can
    point anywhere)."""
    urls: list[str] = []
    for key in ("source_url", "url"):
        value = item.get(key)
        if isinstance(value, str) and value.strip():
            url = urldefrag(value.strip())[0]
            if url and url not in urls:
                urls.append(url)
    for url in urls:
        if _blocked(url):
            continue
        page = _usable(await pages.fetch_page(url))
        if page is not None and pages.site_of(page.final_url) == pages.site_of(url):
            return page
    return None


def _matching_entry(entries, title) -> Optional[dict]:
    """The model's entry for the saved listing: the same name, or one name
    inside the other, or the only entry it gave."""
    entries = [e for e in (entries or []) if isinstance(e, dict) and isinstance(e.get("title"), str)]
    want = _title_key(title)
    for entry in entries:
        if _title_key(entry["title"]) == want:
            return entry
    for entry in entries:
        got = _title_key(entry["title"])
        if got and want and (got in want or want in got):
            return entry
    return entries[0] if len(entries) == 1 else None


def _money_changed(old, new: str) -> bool:
    before, after = set(rules.dollars(old)), set(rules.dollars(new))
    if before or after:
        return before != after
    return rules.plain(old) != rules.plain(new)


def _deadline_line(day: Optional[date], kind: str) -> str:
    return f"Deadline is now {rules.day_label(day)}" if kind == "date" and day else "Deadline is now rolling"


def _note(lines: list[str]) -> str:
    return clean_text(". ".join(line.rstrip(". ") for line in lines) + ".", RECHECK_NOTE_CHARS) if lines else ""


async def recheck_listing(item: dict, *, today: date) -> dict:
    """Re-read one saved listing's own page (no search).

    {"status": "ok" | "gone" | "failed", "fields": {column: value}, "changed":
    [lines for the student]}. gone: the page would not open (or moved to
    another site), and fields carries only recheck_note. failed: no model
    could read it, and nothing changes. ok: fields carries the refreshed facts
    that were found on the page (a fact the page no longer shows is kept as it
    was), checked_at, and recheck_note; when the page opened but the listing
    was not on it, only recheck_note (no checked_at: nothing was verified).
    The requirements are never rewritten,
    so the student's checklist (req_done) keeps pointing at the same lines."""
    item = item if isinstance(item, dict) else {}
    lane = item.get("lane") if item.get("lane") in rules.LANES else "scholarship"
    page = await _open_saved(item)
    if page is None:
        note = f"Couldn't open its page on {rules.short_day(today)}. It may have moved or closed."
        return {"status": "gone", "fields": {"recheck_note": note}, "changed": []}

    got = await _ask(label="finder_recheck", tool=prompts.EXTRACT_TOOL, max_tokens=2000,
                     openai_model=FINDER_EXTRACT_MODEL, expect="listings",
                     prompt=prompts.recheck_prompt(item=item, today=today, page={
                         "url": page.final_url, "title": page.title, "text": page.text[:PAGE_PROMPT_CHARS]}))
    if got is None:
        return {"status": "failed", "fields": {}, "changed": []}

    scam = rules.scam_reasons(page.text, lane, page.final_url)
    entry = _matching_entry(got["listings"], item.get("title"))
    if entry is None:
        lines = [rules.DROP_MESSAGES[scam[0]]] if scam else [
            f"Talon couldn't find it on its page on {rules.short_day(today)}. Open its page to check it."]
        return {"status": "ok", "fields": {"recheck_note": _note(lines)}, "changed": lines}

    facts = rules.listing_facts(entry, page.text)
    fields: dict = {"checked_at": datetime.now(timezone.utc).isoformat()}
    changed: list[str] = []

    old_day = rules.iso_day(item.get("deadline"))
    old_kind = item.get("deadline_kind") if item.get("deadline_kind") in ("date", "rolling", "unknown") else "unknown"
    if facts["deadline_text"]:
        day, kind = rules.parse_deadline(facts["deadline_text"], today)
        if kind != "unknown":
            if (day, kind) != (old_day, old_kind):
                changed.append(_deadline_line(day, kind))
            fields.update(deadline=day.isoformat() if day else None, deadline_text=facts["deadline_text"],
                          deadline_kind=kind)
        elif old_kind == "unknown" and rules.plain(facts["deadline_text"]) != rules.plain(item.get("deadline_text")):
            changed.append(f"Its deadline now reads: {facts['deadline_text']}")
            fields["deadline_text"] = facts["deadline_text"]

    for text_key, usd_key, label in (("amount_text", "amount_usd", "Amount"), ("cost_text", "cost_usd", "Cost")):
        new = facts[text_key]
        if not new:
            continue
        if _money_changed(item.get(text_key), new):
            changed.append(f"{label} is now {new}")
        fields[text_key], fields[usd_key] = new, facts[usd_key]
    for key in ("dates_text", "location_text", "eligibility"):
        if facts[key]:
            fields[key] = facts[key]
    if facts["aid"] is not None:
        fields["aid"] = facts["aid"]

    deadline = rules.iso_day(fields["deadline"]) if "deadline" in fields else old_day
    if scam:
        warning = rules.DROP_MESSAGES[scam[0]]
    elif deadline is not None and deadline < today:
        warning = rules.DROP_MESSAGES["past_deadline"]
    else:
        warning = ""
    if warning:
        changed.insert(0, warning)
        fields["recheck_note"] = clean_text(warning, RECHECK_NOTE_CHARS)
    else:
        fields["recheck_note"] = _note(changed)
    return {"status": "ok", "fields": fields, "changed": changed}
