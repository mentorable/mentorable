"""
Roadmap node expansion — the lazy, per-node detail generation.

When a user opens a node, we Brave-search for real resources, then Claude curates a
diverse, typed package and writes an overview with inline [n] citation markers tied to
the references. URLs are REAL: Claude selects results BY INDEX and we map back to the
actual URLs server-side (never trust the model to copy a URL).

See .claude/ROADMAP_REDESIGN.md.
"""
import json
import logging
import re

from anthropic import AsyncAnthropic

from app.config import ANTHROPIC_API_KEY
from app.db.supabase import get_supabase
from app.nodes.research.run import _brave_search

logger = logging.getLogger(__name__)

_anthropic = AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
SONNET = "claude-sonnet-4-6"

REF_TYPES = {"doc", "video", "platform", "paper", "article", "framework", "course"}


def _parse_json(text: str):
    try:
        return json.loads(text)
    except Exception:
        pass
    m = re.search(r'\{[\s\S]*\}', text)
    if m:
        try:
            return json.loads(m.group(0))
        except Exception:
            pass
    return None


def _source_of(url: str) -> str:
    m = re.search(r'https?://(?:www\.)?([^/]+)', url or "")
    return m.group(1) if m else ""


def _queries_for(node: dict, goal: str, allow_papers: bool) -> list[str]:
    title = node.get("title", "")
    pillar = node.get("pillar", "")
    qs = [title, f"{title} tutorial for students", f"how to {title}"]
    if pillar == "Research" and allow_papers:
        qs.append(f"{title} research paper student")
    if pillar == "Club":
        qs.append(f"how to start or join a {title} club high school")
    if pillar == "Project":
        qs.append(f"{title} step by step guide")
    return qs[:4]


async def expand_node(user_id: str, node_id: str) -> dict:
    """Generate the reference package + overview for a node. Returns the updated node row.
    Raises ValueError on user-facing failure."""
    supabase = get_supabase()

    node_res = (
        supabase.from_("roadmap_nodes").select("*")
        .eq("id", node_id).eq("user_id", user_id).maybe_single().execute()
    )
    node = node_res.data
    if not node:
        raise ValueError("Node not found.")

    # Profile context (for relevance + paper suitability by grade/education).
    prof_res = (
        supabase.from_("profiles").select("grade_level, education_level, interests, living_profile")
        .eq("id", user_id).maybe_single().execute()
    )
    profile = prof_res.data or {}
    grade = profile.get("grade_level")
    edu = profile.get("education_level")
    allow_papers = (isinstance(grade, int) and grade >= 11) or edu == "college"

    rm_res = supabase.from_("roadmaps").select("goal").eq("id", node["roadmap_id"]).maybe_single().execute()
    goal = (rm_res.data or {}).get("goal", "")

    # ── Brave search for real candidates ──────────────────────────────────────
    queries = _queries_for(node, goal, allow_papers)
    batches = await _gather_searches(queries)
    seen, candidates = set(), []
    for batch in batches:
        for r in batch:
            u = r.get("url")
            if u and u not in seen:
                seen.add(u)
                candidates.append(r)
    candidates = candidates[:16]
    if not candidates:
        raise ValueError("Couldn't find resources for this node right now. Try again.")

    # ── Claude curates by index + writes the inline-cited overview ─────────────
    listing = "\n".join(
        f"[{i}] {c.get('title','')} — {_source_of(c.get('url',''))}\n    {(c.get('description','') or '')[:160]}"
        for i, c in enumerate(candidates)
    )

    system = (
        "You curate a concise resource package for a student working on one roadmap node. "
        "From the REAL search results provided (numbered), pick the 4-6 BEST and most DIVERSE "
        "(mix of types: documentation, conceptual video, platform/tool, course, article, and a "
        "research paper ONLY if genuinely suitable). Then write a short, plain-language overview "
        "(120-180 words, motivating yet practical, no jargon/buzzwords, NOT textbook-like) that "
        "tells the student how to approach this node, weaving in citations to the resources you "
        "picked using [n] markers (1-indexed into YOUR references array order). Bold-worthy "
        "phrases are the cited ones. Do not invent resources; only use the provided indices.\n\n"
        "Return ONLY valid JSON, no markdown."
    )
    user_prompt = (
        f"Node: {node.get('title')} (pillar: {node.get('pillar')})\n"
        f"Why it matters: {node.get('blurb') or ''}\n"
        f"Student's goal: {goal}\n"
        f"Grade: {grade or 'unknown'} · research papers suitable: {allow_papers}\n\n"
        f"Real search results:\n{listing}\n\n"
        "Return ONLY JSON:\n"
        '{"overview":"...text with [1] [2] markers...","references":[{"source_index":<int from the list>,'
        '"type":"doc|video|platform|paper|article|framework|course","label":"short descriptive title"}]}'
    )

    resp = await _anthropic.messages.create(
        model=SONNET, max_tokens=1500, system=system,
        messages=[{"role": "user", "content": user_prompt}],
    )
    parsed = _parse_json(resp.content[0].text if resp.content else "")
    if not parsed or not isinstance(parsed.get("references"), list):
        raise ValueError("Couldn't build the resource package. Try again.")

    # ── Map selected indices back to REAL urls; build stable 1-indexed refs ────
    references = []
    for sel in parsed["references"]:
        try:
            idx = int(sel.get("source_index"))
        except (TypeError, ValueError):
            continue
        if idx < 0 or idx >= len(candidates):
            continue
        cand = candidates[idx]
        rtype = (sel.get("type") or "article").strip().lower()
        if rtype not in REF_TYPES:
            rtype = "article"
        references.append({
            "id": len(references) + 1,  # 1-indexed, matches overview [n] markers
            "type": rtype,
            "title": (sel.get("label") or cand.get("title") or "").strip()[:120],
            "url": cand["url"],
            "source": _source_of(cand["url"]),
        })
    if not references:
        raise ValueError("Couldn't build the resource package. Try again.")

    overview = (parsed.get("overview") or "").strip()

    # ── Persist; advance state explore → opened (don't downgrade later states) ─
    new_state = node["state"] if node["state"] in ("on_board", "done") else "opened"
    upd = (
        supabase.from_("roadmap_nodes")
        .update({"overview": overview, "references": references, "state": new_state})
        .eq("id", node_id).eq("user_id", user_id).execute()
    )
    updated = (upd.data or [None])[0] or {**node, "overview": overview, "references": references, "state": new_state}

    logger.info(f"[roadmap] expanded node {node_id} ({len(references)} refs) for {user_id}")
    return updated


async def _gather_searches(queries: list[str]) -> list[list[dict]]:
    import asyncio
    return await asyncio.gather(*[_brave_search(q, count=8) for q in queries])
