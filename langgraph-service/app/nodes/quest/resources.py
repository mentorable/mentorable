"""
Resources for one Quest task: one to three real links the student can ask for.

Found with a web search (Brave when a key is set, otherwise Anthropic's web search tool; Haiku 4.5 reads the results), never written from memory: a model
asked for links makes up plausible ones. So every link the model submits is
checked against the URLs the search really returned, and the rest are dropped.
Sites unsuitable for a high school student, and homework-answer sites, are
blocked at the search itself and again on the way out.
"""
import logging
from typing import Optional
from urllib.parse import urlparse

from app import search_pool
from app.llm import ModelUnavailable, search_completion, tool_completion
from app.models import QUEST_RESOURCES_MODEL
from app.nodes.quest.common import clean_text

logger = logging.getLogger(__name__)

MAX_RESOURCES = 3

# Social media and forums (unmoderated, and unsuitable for minors), and sites
# that sell or leak homework answers. Not exhaustive: the prompt asks for
# reputable sources, and this catches the ones that must never appear.
BLOCKED_DOMAINS = [
    "reddit.com", "quora.com", "pinterest.com", "facebook.com", "instagram.com", "tiktok.com",
    "x.com", "twitter.com", "4chan.org", "tumblr.com", "discord.com", "answers.com",
    "chegg.com", "coursehero.com", "brainly.com", "studocu.com", "scribd.com", "essaypro.com",
]

SUBMIT_TOOL = {
    "name": "submit_resources",
    "description": "Submit the resources you found for this task.",
    "input_schema": {
        "type": "object",
        "properties": {
            "resources": {
                "type": "array",
                "description": "One to three resources, best first. Empty if nothing solid turned up.",
                "items": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string", "description": "The page's own title, shortened if long."},
                        "url": {"type": "string", "description": "The exact URL from a search result."},
                        "note": {"type": "string", "description": "One short sentence: what it gives them for this task."},
                    },
                    "required": ["title", "url", "note"],
                },
            },
        },
        "required": ["resources"],
    },
}

RESOURCES_PROMPT = """A high school student is about to do one task in a Quest, a real project they chose. Find one to three web pages that would help them do THIS task today.

QUEST: {quest_title}
{quest_summary}

TODAY'S TASK: {task_title}
{task_detail}
{grade}

How to work:
- Search first, then call submit_resources. Search for what they need to do the task, not for the quest's topic in general.
- Prefer sources a teacher would trust: .edu and .gov sites, museums and libraries, established nonprofits, official documentation, and well-known free learning sites. Skip forums, social media, content farms and anything behind a paywall or a sign-up.
- Only submit a URL exactly as it appeared in a search result. Never write a URL from memory.
- Each note is one plain sentence about what the page gives them for this task ("Shows how to read a data table, which is step two."). No hype.
- Free things only. Never send them to something they must pay for.
- If the task is writing their own essay or application, find help with the thinking or drafting process. Never a site that writes it for them.
- If nothing solid turned up, submit an empty list. One good page beats three weak ones.
- Talk to them directly. Plain words. Never use em dashes."""


def _host(url: str) -> str:
    return (urlparse(url).hostname or "").lower().removeprefix("www.")


def _blocked(url: str) -> bool:
    host = _host(url)
    return any(host == d or host.endswith("." + d) for d in BLOCKED_DOMAINS)


def clean_resources(raw, returned: set[str]) -> Optional[list[dict]]:
    """Keep only links the search really returned, on safe sites, with a note.

    None when the reply is unusable (retry-worthy); [] when the model honestly
    found nothing or nothing survived.
    """
    if not isinstance(raw, dict) or not isinstance(raw.get("resources"), list):
        return None
    out: list[dict] = []
    seen: set[str] = set()
    for item in raw["resources"]:
        if not isinstance(item, dict):
            continue
        url = item.get("url")
        if not isinstance(url, str) or url not in returned:
            continue
        if not url.startswith("https://") or _blocked(url):
            continue
        host = _host(url)
        if url in seen:
            continue
        seen.add(url)
        title = clean_text(item.get("title"), 100) or host
        out.append({"title": title, "url": url, "note": clean_text(item.get("note"), 140), "domain": host})
        if len(out) == MAX_RESOURCES:
            break
    return out


async def _search_and_pick(prompt: str, task: dict, quest: dict):
    """(what the model submitted, the URLs the search returned, {"searches",
    "errors"}). With a Brave key (Brave's API, one plain model call over the
    results) about a tenth of the price; otherwise, or if Brave cannot answer,
    Anthropic's own web search tool."""
    if search_pool.brave.configured():
        title = " ".join(str(task.get("title") or "").split())
        topic = " ".join(str(quest.get("title") or "").split())
        queries = [f"{title} {topic} guide OR tutorial OR explainer".strip()[:200]]
        try:
            results = []
            for q in queries:
                results += await search_pool.brave.web_search(q, blocked=BLOCKED_DOMAINS)
            raw = await tool_completion(model=QUEST_RESOURCES_MODEL,
                                        prompt=prompt + "\n\n" + search_pool.results_block(results[:10]),
                                        tool=SUBMIT_TOOL, max_tokens=1500, label="quest_resources")
            return raw, {r["url"] for r in results}, {"searches": len(queries), "errors": 0}
        except search_pool.SearchUnavailable:
            logger.warning("[quest_resources] Brave could not answer; using Anthropic's web search instead")
    return await search_completion(
        model=QUEST_RESOURCES_MODEL, prompt=prompt, submit_tool=SUBMIT_TOOL, max_tokens=1500,
        label="quest_resources", max_searches=3, blocked_domains=BLOCKED_DOMAINS,
    )


async def find_resources(*, quest: dict, task: dict, grade: str) -> Optional[list[dict]]:
    """Real, checked links for a task. None when the model or search failed
    (the caller refunds the student's search); [] when nothing solid turned up."""
    prompt = RESOURCES_PROMPT.format(
        quest_title=quest.get("title") or "",
        quest_summary=quest.get("summary") or "",
        task_title=task.get("title") or "",
        task_detail=task.get("detail") or "",
        grade=grade,
    )
    try:
        raw, returned, stats = await _search_and_pick(prompt, task, quest)
    except ModelUnavailable as exc:
        logger.warning(f"[quest_resources] search unavailable: {exc}")
        return None
    # "Nothing solid turned up" is only honest if a search ran and came back.
    # An errored search, or a model that submitted without searching, is a
    # failure the student can retry, not an answer to remember.
    if not returned and (stats["errors"] > 0 or stats["searches"] == 0):
        logger.warning(f"[quest_resources] no usable search results: {stats}")
        return None
    return clean_resources(raw, returned)
