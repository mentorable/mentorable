"""
Research pipeline — exact port of supabase/functions/run-research/index.ts.
Runs as a single async function called from the FastAPI /research endpoint.

Steps:
  1. Cache check (7-day, same query same user)
  2. Load profile + quest context
  3. Decompose query → 2–4 sub-queries (Claude Sonnet)
  4. Parallel Brave searches + deduplication
  5. Synthesize + rank top 6–8 results (Claude Sonnet)
  6. Parallel page fetches (top 5, 6s timeout)
  7. Enrich + game plans (Claude Sonnet)
  8. Merge + save to research_sessions
  9. Extract top 3 findings → write to profiles.research_findings (LangGraph memory)
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

logger = logging.getLogger(__name__)

_anthropic = AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
SONNET = "claude-sonnet-4-6"
TOP_N  = 5


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

    # ── 3. Decompose query ────────────────────────────────────────────────────
    decompose_res = await _anthropic.messages.create(
        model=SONNET, max_tokens=400,
        system=(
            "You generate targeted search queries to find opportunities for high school students. "
            "Given the student's original query and their profile, produce 2–4 specific sub-queries "
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
    sub_queries = sub_queries[:4]

    # ── 4. Parallel Brave searches ────────────────────────────────────────────
    search_batches = await asyncio.gather(*[_brave_search(q) for q in sub_queries])
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
    raw_text = "\n\n".join(f"[{i+1}] {r['title']}\nURL: {r['url']}\n{r['description']}" for i, r in enumerate(all_results))

    # ── 5. Synthesize + rank ──────────────────────────────────────────────────
    synth_res = await _anthropic.messages.create(
        model=SONNET, max_tokens=4000,
        system=(
            "You are a research curator helping high school students find real career opportunities. "
            "Given raw search results and a student's profile, select and structure the 6–8 most genuinely useful results. "
            "For each result classify type: competition, internship, scholarship, program, resource, or article. "
            "Write a clear 2–3 sentence description and a 1-sentence relevance note referencing the student's profile. "
            "Use only exact URLs from the input. "
            'Return ONLY valid JSON: {"results": [{"type":"...","name":"...","description":"...","details":{},"url":"...","relevance_note":"..."}], "sources": [{"title":"...","url":"..."}]}'
        ),
        messages=[{"role": "user", "content": f'QUERY: "{normalized}"\n\n{context}\n\nRAW RESULTS ({len(all_results)} unique, from {len(sub_queries)} sub-queries):\n{raw_text}'}],
    )
    synth_text   = synth_res.content[0].text if synth_res.content else ""
    synthesized  = _parse_json(synth_text, {"results": [], "sources": []})
    synthesized["results"] = [r for r in (synthesized.get("results") or []) if r.get("url") in valid_urls]
    synthesized["sources"] = [s for s in (synthesized.get("sources") or []) if s.get("url") in valid_urls]

    if not synthesized["results"]:
        raise ValueError("Could not identify relevant results. Try a different query.")

    # ── 6. Parallel page fetches ──────────────────────────────────────────────
    top = synthesized["results"][:TOP_N]
    pages = await asyncio.gather(*[_fetch_page(r["url"]) for r in top])

    # ── 7. Enrich + game plans ────────────────────────────────────────────────
    pages_block = "\n\n---\n\n".join(
        f"RESULT {i} — {r['name']}\nURL: {r['url']}\n" + (
            f"PAGE CONTENT:\n{pages[i]['text']}" if pages[i]["ok"]
            else f"PAGE UNAVAILABLE. Use snippet: {next((a['description'] for a in all_results if a['url'] == r['url']), '')}"
        )
        for i, r in enumerate(top)
    )
    enrich_res = await _anthropic.messages.create(
        model=SONNET, max_tokens=5000,
        system=(
            f"You extract structured data from web pages and write personalized application strategies for high school students. "
            f"For EACH of the {TOP_N} results: extract official name, eligibility, deadline, application URL, award, selection criteria. "
            f"Write a 'gamePlan' of 3–4 sentences tailored to this student referencing their interests, strengths, or career matches. "
            "Return ONLY a valid JSON array: "
            '[{"index":0,"enriched":{"name":"...","description":"...","details":{"deadline":"...","eligibility":"...","location":"...","compensation":"...","applicationLink":"...","selectionCriteria":"..."},"pageEnriched":true},"gamePlan":"..."}]'
        ),
        messages=[{"role": "user", "content": f"STUDENT:\n{context}\n\n{'─'*40}\n\nRESULTS TO ENRICH:\n{pages_block}"}],
    )
    enrich_text  = enrich_res.content[0].text if enrich_res.content else ""
    enrichments  = _parse_json(enrich_text, [])

    # ── 8. Merge enrichment into final results ────────────────────────────────
    final_results = []
    for i, r in enumerate(synthesized["results"]):
        if i < TOP_N and isinstance(enrichments, list):
            enrich = next((e for e in enrichments if e.get("index") == i), None)
            if enrich:
                r = {
                    **r,
                    "name":        enrich.get("enriched", {}).get("name") or r.get("name"),
                    "description": enrich.get("enriched", {}).get("description") or r.get("description"),
                    "details":     {**(r.get("details") or {}), **(enrich.get("enriched", {}).get("details") or {})},
                    "pageEnriched": enrich.get("enriched", {}).get("pageEnriched", False),
                    "gamePlan":    enrich.get("gamePlan"),
                }
        final_results.append(r)

    payload = {"results": final_results, "sources": synthesized["sources"]}

    # Save to research_sessions
    supabase.from_("research_sessions").update(
        {"results": payload, "status": "completed", "updated_at": datetime.now(timezone.utc).isoformat()}
    ).eq("id", session_id).execute()

    # ── 9. Write top 3 findings to LangGraph memory (profiles.research_findings) ─
    asyncio.create_task(_save_research_findings(user_id, normalized, final_results[:3], session_id))

    logger.info(f"[research] Completed for user {user_id} — {len(final_results)} results")
    return {"results": final_results, "sources": synthesized["sources"], "cached": False}


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
