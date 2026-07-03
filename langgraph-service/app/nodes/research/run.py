"""
Research pipeline — exact port of supabase/functions/run-research/index.ts.
Runs as a single async function called from the FastAPI /research endpoint.

Steps (cost-optimized for the public demo — 2 Sonnet calls, was 3):
  1. Cache check (7-day, same query same user)
  2. Load profile + quest context
  3. Decompose query → ≤3 sub-queries (Claude Sonnet)
  4. Parallel Brave searches (count=6) + deduplication
  5. Parallel page fetches (top 3 candidates by rank, 6s timeout)
  6. Single synthesize+enrich call: select 6–8, structure, + game plans (Claude Sonnet)
  7. Save to research_sessions
  8. Extract top 3 findings → write to profiles.research_findings (LangGraph memory)
"""
import asyncio
import json
import logging
import re
from datetime import datetime, timezone, timedelta

import httpx
from anthropic import AsyncAnthropic

from app.config import ANTHROPIC_API_KEY, BRAVE_API_KEY
from app.db.supabase import get_supabase
from app.scoring import award_axis
from app.nodes.memory.synthesize import maybe_refresh_living_profile

logger = logging.getLogger(__name__)

_anthropic = AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
SONNET = "claude-sonnet-4-6"
TOP_N  = 3   # pages fetched + deeply enriched (was 5) — demo cost


def _parse_json(text: str, fallback):
    try:
        return json.loads(text)
    except Exception:
        pass
    match = re.search(r'(\{[\s\S]*\}|\[[\s\S]*\])', text)
    if match:
        try:
            return json.loads(match.group(0))
        except Exception:
            pass
    return fallback


def _salvage_results(text: str) -> list[dict]:
    """
    Last-resort recovery for a truncated {"results": [...]} payload: keep the
    complete objects in the results array and drop the cut-off tail. Scans with
    a string-aware depth counter; each object closed at array depth is one result.
    """
    start = text.find('"results"')
    if start == -1:
        return []
    start = text.find("[", start)
    if start == -1:
        return []
    results, depth, in_str, esc, obj_start = [], 0, False, False, None
    for i in range(start, len(text)):
        c = text[i]
        if in_str:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == '"':
                in_str = False
            continue
        if c == '"':
            in_str = True
        elif c == "{":
            if depth == 0:
                obj_start = i
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0 and obj_start is not None:
                try:
                    results.append(json.loads(text[obj_start:i + 1]))
                except Exception:
                    pass
                obj_start = None
        elif c == "]" and depth == 0:
            break
    return [r for r in results if isinstance(r, dict)]


async def _brave_search(query: str, count: int = 10) -> list[dict]:
    if not BRAVE_API_KEY:
        return []
    url = f"https://api.search.brave.com/res/v1/web/search?q={httpx.URL(query).path}&count={count}&search_lang=en&safesearch=moderate"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.get(
                "https://api.search.brave.com/res/v1/web/search",
                params={"q": query, "count": count, "search_lang": "en", "safesearch": "moderate"},
                headers={
                    "Accept": "application/json",
                    "Accept-Encoding": "gzip",
                    "X-Subscription-Token": BRAVE_API_KEY,
                },
            )
        if not res.is_success:
            return []
        data = res.json()
        return [
            {"title": r.get("title", ""), "url": r.get("url", ""), "description": r.get("description", "")}
            for r in data.get("web", {}).get("results", [])
            if r.get("title") and r.get("url")
        ]
    except Exception as exc:
        logger.warning(f"[research] Brave search failed for '{query}': {exc}")
        return []


async def _fetch_page(url: str) -> dict:
    try:
        async with httpx.AsyncClient(timeout=6, follow_redirects=True) as client:
            res = await client.get(
                url,
                headers={
                    "User-Agent": "Mozilla/5.0 (compatible; Mentorable-Research/1.0)",
                    "Accept": "text/html,application/xhtml+xml,*/*",
                },
            )
        if not res.is_success:
            return {"text": "", "ok": False}
        html = res.text
        # Strip scripts, styles, nav, header, footer
        for tag in ["script", "style", "nav", "header", "footer"]:
            html = re.sub(rf"<{tag}[\s\S]*?</{tag}>", " ", html, flags=re.IGNORECASE)
        text = re.sub(r"<[^>]+>", " ", html)
        text = text.replace("&nbsp;", " ").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
        text = re.sub(r"\s+", " ", text).strip()
        return {"text": text[:3500], "ok": True}
    except Exception:
        return {"text": "", "ok": False}


def _build_profile_block(profile: dict) -> str:
    return (
        f"STUDENT PROFILE\n"
        f"- Grade: {profile.get('grade_level') or 'not specified'}\n"
        f"- Age: {profile.get('age') or 'not specified'}\n"
        f"- Location: {profile.get('location_general') or 'not specified'}\n"
        f"- Interests: {json.dumps(profile.get('interests') or [])}\n"
        f"- Strengths: {json.dumps(profile.get('strengths') or [])}\n"
        f"- Career matches: {json.dumps(profile.get('career_matches') or [])}\n"
        f"- Work style: {profile.get('work_style') or 'not specified'}\n"
        f"- Background: {profile.get('onboarding_summary') or 'not available'}"
    )


def _build_quests_block(quests: list) -> str:
    if not quests:
        return ""
    lines = []
    for q in quests:
        date_str = "recently"
        if q.get("completed_at"):
            try:
                date_str = datetime.fromisoformat(q["completed_at"].replace("Z", "+00:00")).strftime("%-m/%-d/%Y")
            except Exception:
                pass
        lines.append(f"- {q['title']} ({q.get('category', 'Other')}, completed {date_str})")
    return "COMPLETED QUESTS\n" + "\n".join(lines)


async def run_research(user_id: str, query: str, session_id: str) -> dict:
    """
    Full research pipeline. Returns {results, sources, cached}.
    Raises ValueError with user-facing message on expected failures.
    """
    supabase = get_supabase()
    normalized = query.strip()

    # Living profile: refresh in the background if enough activity has accrued.
    await maybe_refresh_living_profile(user_id)

    # ── 1. Cache check ────────────────────────────────────────────────────────
    seven_days_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    cached_res = (
        supabase.from_("research_sessions")
        .select("id, results")
        .eq("user_id", user_id)
        .eq("query", normalized)
        .eq("status", "completed")
        .gte("created_at", seven_days_ago)
        .neq("id", session_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    cached = (cached_res.data or [None])[0]
    if cached and cached.get("results"):
        cp = cached["results"]
        r = cp if isinstance(cp, list) else cp.get("results", [])
        s = [] if isinstance(cp, list) else cp.get("sources", [])
        if r:
            supabase.from_("research_sessions").update(
                {"results": cp, "status": "completed", "updated_at": datetime.now(timezone.utc).isoformat()}
            ).eq("id", session_id).execute()
            logger.info(f"[research] Cache hit for '{normalized}' user {user_id}")
            return {"results": r, "sources": s, "cached": True}

    if not BRAVE_API_KEY:
        raise ValueError("Search service not configured.")

    # ── 2. Load profile + quest context ───────────────────────────────────────
    profile_res = (
        supabase.from_("profiles")
        .select("interests, strengths, career_matches, grade_level, age, location_general, onboarding_summary, work_style")
        .eq("id", user_id)
        .maybe_single()
        .execute()
    )
    quests_res = (
        supabase.from_("quest_items")
        .select("title, category, completed_at")
        .eq("user_id", user_id)
        .eq("status", "completed")
        .order("completed_at", desc=True)
        .limit(15)
        .execute()
    )
    profile = profile_res.data or {}
    quests  = quests_res.data or []
    profile_block = _build_profile_block(profile)
    quests_block  = _build_quests_block(quests)
    context = profile_block + ("\n\n" + quests_block if quests_block else "")

    # ── 3. Decompose query (≤3 sub-queries — demo cost) ───────────────────────
    decompose_res = await _anthropic.messages.create(
        model=SONNET, max_tokens=400,
        system=(
            "You generate targeted search queries to find opportunities for high school students. "
            "Given the student's original query and their profile, produce 2–3 specific sub-queries "
            "that together cover the full intent. Make each query distinct. "
            "Return ONLY valid JSON: {\"subQueries\": [\"query1\", \"query2\", ...]}"
        ),
        messages=[{"role": "user", "content": f'ORIGINAL QUERY: "{normalized}"\n\n{context}'}],
    )
    decompose_text = decompose_res.content[0].text if decompose_res.content else ""
    parsed = _parse_json(decompose_text, {"subQueries": [normalized]})
    sub_queries = parsed.get("subQueries", [normalized])
    if not isinstance(sub_queries, list) or not sub_queries:
        sub_queries = [normalized]
    sub_queries = sub_queries[:3]

    # ── 4. Parallel Brave searches (count=6 — demo cost) ──────────────────────
    search_batches = await asyncio.gather(*[_brave_search(q, count=6) for q in sub_queries])
    seen_urls: set[str] = set()
    all_results: list[dict] = []
    for batch in search_batches:
        for r in batch:
            if r["url"] not in seen_urls:
                seen_urls.add(r["url"])
                all_results.append(r)

    if not all_results:
        raise ValueError("Search returned no results. Try a more specific query.")

    valid_urls = {r["url"] for r in all_results}

    # ── 5. Fetch the top candidates' pages up front, BY BRAVE RANK, so a single
    #      Sonnet call can select + structure + write game plans in one pass.
    #      (Was: synthesize → fetch synthesized winners → enrich. Merged to cut a
    #      whole Sonnet call for the demo; page targeting is now by rank, not model pick.)
    top_candidates = all_results[:TOP_N]
    pages = await asyncio.gather(*[_fetch_page(r["url"]) for r in top_candidates])
    fetched = {top_candidates[i]["url"]: pages[i] for i in range(len(top_candidates))}

    snippets_block = "\n\n".join(
        f"[{i+1}] {r['title']}\nURL: {r['url']}\n{r['description']}" for i, r in enumerate(all_results)
    )
    pages_block = "\n\n---\n\n".join(
        f"PAGE — {r['title']}\nURL: {r['url']}\nCONTENT:\n{pages[i]['text']}"
        for i, r in enumerate(top_candidates) if pages[i]["ok"] and pages[i]["text"]
    ) or "(No page content could be fetched. Work from the snippets above.)"

    # ── 6. Single merged call: select + structure + game plans ────────────────
    # max_tokens is a CAP, not a spend — we only pay for tokens actually
    # generated. 3000 truncated the JSON mid-array on every run (the pre-merge
    # pipeline had 4000 + 5000 across its two calls); 8000 gives the ~4-5k the
    # full payload needs. Asking for exactly 6 results keeps generation lean.
    merged_res = await _anthropic.messages.create(
        model=SONNET, max_tokens=8000,
        system=(
            "You are a research curator helping high school students find real career opportunities. "
            "From the raw search snippets (numbered) plus the fetched page content for the top few, "
            "select and structure the 6 most genuinely useful results (fewer only if the input is thin). "
            "For each result: classify "
            "type (competition, internship, scholarship, program, resource, or article); write a clear "
            "2-3 sentence description and a 1-sentence relevance note referencing the student's profile; "
            "and extract whatever structured details the source supports (deadline, eligibility, "
            "location, award/compensation, application link, selection criteria) — omit fields you "
            "cannot find. ONLY for results that have fetched page content, ALSO write a 'gamePlan' of "
            "3–4 sentences tailored to this student's interests, strengths, or career matches; omit "
            "gamePlan entirely for the rest. Keep every field concise. "
            "Use ONLY exact URLs from the input, character for character. NEVER use em dashes (the long "
            "dash); use commas or periods instead. Return ONLY valid JSON: "
            '{"results":[{"type":"...","name":"...","description":"...","relevance_note":"...","url":"...",'
            '"details":{"deadline":"...","eligibility":"...","location":"...","compensation":"...",'
            '"applicationLink":"...","selectionCriteria":"..."},"gamePlan":"..."}],'
            '"sources":[{"title":"...","url":"..."}]}'
        ),
        messages=[{"role": "user", "content": (
            f'QUERY: "{normalized}"\n\n{context}\n\n'
            f"SEARCH RESULTS ({len(all_results)} unique, from {len(sub_queries)} sub-queries):\n{snippets_block}\n\n"
            f"{'─'*40}\n\nFETCHED PAGE CONTENT (top {len(top_candidates)}):\n{pages_block}"
        )}],
    )
    merged_text = merged_res.content[0].text if merged_res.content else ""
    if merged_res.stop_reason == "max_tokens":
        logger.warning(f"[research] merged call truncated at max_tokens for '{normalized}' — salvaging")
    merged = _parse_json(merged_text, None)
    if merged is None:
        merged = {"results": _salvage_results(merged_text), "sources": []}

    def _norm(u):  # tolerate trailing-slash/scheme-case drift in model-echoed URLs
        return (u or "").strip().rstrip("/").lower()

    norm_valid = {_norm(u): u for u in valid_urls}
    results_in, sources = [], []
    for r in merged.get("results") or []:
        exact = norm_valid.get(_norm(r.get("url")))
        if exact:
            r["url"] = exact
            results_in.append(r)
    for s in merged.get("sources") or []:
        exact = norm_valid.get(_norm(s.get("url")))
        if exact:
            s["url"] = exact
            sources.append(s)
    if not results_in:
        logger.error(
            f"[research] 0 usable results for '{normalized}' — stop_reason={merged_res.stop_reason}, "
            f"model_results={len(merged.get('results') or [])}, text_len={len(merged_text)}"
        )
        raise ValueError("Could not identify relevant results. Try a different query.")

    # pageEnriched is decided server-side: true only when we truly fetched an ok page for that URL
    # (don't trust the model's self-report). Drives the "Verified" badge in the UI.
    final_results = []
    for r in results_in:
        pg = fetched.get(r.get("url"))
        r["pageEnriched"] = bool(pg and pg.get("ok") and pg.get("text"))
        final_results.append(r)

    payload = {"results": final_results, "sources": sources}

    # Save to research_sessions
    supabase.from_("research_sessions").update(
        {"results": payload, "status": "completed", "updated_at": datetime.now(timezone.utc).isoformat()}
    ).eq("id", session_id).execute()

    # ── 7. Write top 3 findings to LangGraph memory (profiles.research_findings) ─
    asyncio.create_task(_save_research_findings(user_id, normalized, final_results[:3], session_id))
    # Scorecard: a real research run builds Resourcefulness (background, never blocks).
    asyncio.create_task(award_axis(user_id, "resourcefulness", 3, f"Researched: {normalized[:60]}", "research"))

    logger.info(f"[research] Completed for user {user_id} — {len(final_results)} results")
    return {"results": final_results, "sources": sources, "cached": False}


async def _save_research_findings(user_id: str, query: str, top_results: list, session_id: str) -> None:
    """Background task — saves top findings into profiles.research_findings for cross-feature memory."""
    try:
        supabase = get_supabase()
        new_findings = [
            {
                "title":      r.get("name", ""),
                "url":        r.get("url", ""),
                "summary":    r.get("description", "")[:200],
                "type":       r.get("type", "resource"),
                "session_id": session_id,
                "query":      query,
                "found_at":   datetime.now(timezone.utc).isoformat(),
            }
            for r in top_results if r.get("name") and r.get("url")
        ]
        if not new_findings:
            return

        profile_res = (
            supabase.from_("profiles")
            .select("research_findings")
            .eq("id", user_id)
            .maybe_single()
            .execute()
        )
        existing = (profile_res.data or {}).get("research_findings") or []
        if not isinstance(existing, list):
            existing = []

        # Prepend new findings, keep last 20
        updated = (new_findings + existing)[:20]
        supabase.from_("profiles").update({"research_findings": updated}).eq("id", user_id).execute()
        logger.info(f"[research] Saved {len(new_findings)} findings to profiles for {user_id}")
    except Exception as exc:
        logger.warning(f"[research] Failed to save findings for {user_id}: {exc}")
