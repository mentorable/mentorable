"""
One-off: bring what students said before long-term memory existed into it.

For each student with memory on, reads their Quest check-ins (the check-in
itself, or the answer to its follow-up question when the check-in was too thin
to keep) and their own lines in past chats, and saves them as memories with the
day they were said. Nothing else is touched.

Three rules keep it safe to run:

  * Only what was said before --before (the day memory shipped) is imported.
    Everything after that was handled live, where the models' own checks for
    serious disclosures ran. This script has no model check, only the keyword
    screen (app/nodes/recall/safety.py, its wider "strict" version), so it never
    reaches past that line.
  * Anything the advisor already treated as a crisis is skipped whole: a
    check-in whose reply pointed them to a trusted adult or 988, and every line
    of a chat in which the advisor did the same. Those replies are the one
    signal from the time that a model did read the student's words.
  * Each student is imported at most once. profiles.memory_backfilled_at marks
    them done, and "Delete everything" in Profile sets it too, so nothing a
    student deleted can ever come back from here.

Run from langgraph-service/ with the service's .env (SUPABASE_URL,
SUPABASE_SERVICE_ROLE_KEY and OPENAI_API_KEY):

    python3 scripts/backfill_memories.py --dry-run    # what would be imported; no OpenAI calls, no writes
    python3 scripts/backfill_memories.py              # import it

Embedding cost is about $0.02 per million tokens (text-embedding-3-small), so a
whole cohort's history costs a fraction of a cent.
"""
import argparse
import asyncio
import os
import re
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.db.supabase import get_supabase  # noqa: E402
from app.nodes.quest.checkin import looks_thin  # noqa: E402
from app.nodes.recall import embed  # noqa: E402
from app.nodes.recall.safety import looks_sensitive, worth_saving  # noqa: E402
from app.nodes.recall.store import chat_key, remember_many  # noqa: E402

# The day long-term memory shipped. Do not move it later: see the docstring.
MEMORY_SHIPPED = "2026-09-29T00:00:00+00:00"

# What the advisor's crisis hand-off says (the Quest reply prompt and the chat
# rules): a trusted adult, a counselor, 988, a crisis line.
CRISIS_REPLY = re.compile(r"\b(988|trusted adult|crisis|hotline|lifeline|emergency)\b", re.IGNORECASE)


def _when(value):
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _students(sb, only):
    query = sb.from_("profiles").select("id, memory_enabled, memory_backfilled_at")
    if only:
        query = query.eq("id", only)
    rows = query.execute().data or []
    return [r["id"] for r in rows if r.get("memory_enabled") is not False and not r.get("memory_backfilled_at")]


def _checkin_items(sb, user_id, before):
    checkins = (sb.from_("quest_checkins")
                .select("id, quest_id, task_id, body, advisor_reply, followup, followup_answer, created_at")
                .eq("user_id", user_id).lt("created_at", before).execute().data) or []
    task_ids = list({c["task_id"] for c in checkins if c.get("task_id")})
    titles = {}
    if task_ids:
        tasks = (sb.from_("quest_tasks").select("id, title").eq("user_id", user_id)
                 .in_("id", task_ids).execute().data) or []
        titles = {t["id"]: t.get("title") or "" for t in tasks}
    items = []
    for c in checkins:
        if CRISIS_REPLY.search(c.get("advisor_reply") or ""):
            continue  # the advisor treated this one as a crisis: neither the line nor its answer
        when = _when(c.get("created_at"))
        title = titles.get(c.get("task_id"), "")
        base = {"context": title, "quest_id": c.get("quest_id"), "created_at": when}
        # The live rule: a check-in the advisor asked a follow-up about was too
        # thin to keep, and its real answer is kept instead.
        if not c.get("followup") and not looks_thin(c.get("body") or ""):
            items.append({**base, "body": c["body"], "source": "checkin", "dedupe_key": f"checkin:{c['id']}"})
        answer = c.get("followup_answer") or ""
        if answer and not looks_thin(answer):
            items.append({**base, "body": answer, "source": "followup", "dedupe_key": f"followup:{c['id']}"})
    return items


def _chat_items(sb, user_id, before):
    cutoff = _when(before)
    sessions = (sb.from_("chat_sessions").select("id, messages, created_at")
                .eq("user_id", user_id).execute().data) or []
    items = []
    for s in sessions:
        messages = [m for m in (s.get("messages") or []) if isinstance(m, dict)]
        if any(m.get("role") == "assistant" and CRISIS_REPLY.search(str(m.get("content") or "")) for m in messages):
            continue  # the advisor treated something in this chat as a crisis: none of it is imported
        for m in messages:
            if m.get("role") != "user" or not isinstance(m.get("content"), str):
                continue
            when = _when(m.get("created_at")) or _when(s.get("created_at"))
            if when is None or when >= cutoff:
                continue
            items.append({"body": m["content"], "source": "chat", "dedupe_key": chat_key(m["content"]),
                          "created_at": when})
    return items


def _tally(items):
    kept, keys = [], set()
    for i in items:
        if worth_saving(i["body"], strict=True) and not looks_sensitive(i.get("context"), True) \
                and i["dedupe_key"] not in keys:
            keys.add(i["dedupe_key"])
            kept.append(i)
    sensitive = sum(1 for i in items if looks_sensitive(i["body"], True))
    by_source = {s: sum(1 for i in kept if i["source"] == s) for s in ("checkin", "followup", "chat")}
    return kept, sensitive, by_source


async def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="show what would be imported; write nothing")
    parser.add_argument("--user", help="only this student's id")
    parser.add_argument("--before", default=MEMORY_SHIPPED,
                        help=f"import only what was said before this time (default {MEMORY_SHIPPED})")
    args = parser.parse_args()
    if _when(args.before) is None or _when(args.before) > _when(MEMORY_SHIPPED):
        sys.exit(f"--before must be a time no later than {MEMORY_SHIPPED}.")
    if not args.dry_run and not embed.enabled():
        sys.exit("OPENAI_API_KEY is not set, so nothing can be embedded. Use --dry-run to preview.")

    sb = get_supabase()
    students = await asyncio.to_thread(_students, sb, args.user)
    print(f"{len(students)} student(s) with memory on and not yet imported. Importing what was said before {args.before}.")
    total, chars = 0, 0
    for user_id in students:
        items = (await asyncio.to_thread(_checkin_items, sb, user_id, args.before)
                 + await asyncio.to_thread(_chat_items, sb, user_id, args.before))
        kept, sensitive, by_source = _tally(items)
        chars += sum(len(i["body"]) + len(i.get("context") or "") for i in kept)
        if args.dry_run:
            total += len(kept)
        line = (f"  {user_id}: {len(kept)} to keep ({by_source['checkin']} check-ins, {by_source['followup']} "
                f"follow-ups, {by_source['chat']} chat lines); {len(items) - len(kept)} skipped as thin, serious or "
                f"repeated ({sensitive} by the safety screen); crisis hand-offs skipped whole")
        if args.dry_run:
            print(line)
            continue

        # Re-check right before writing: they may have pressed "Delete everything" since.
        still = await asyncio.to_thread(_students, sb, user_id)
        if not still:
            print(f"  {user_id}: skipped, memory was turned off or cleared meanwhile")
            continue
        saved = await remember_many(user_id, kept, enabled=True, strict=True) if kept else 0
        if kept and saved == 0:
            print(f"  {user_id}: FAILED to save (embedding or write error); not marked, so a rerun retries")
            continue
        await asyncio.to_thread(
            lambda: sb.from_("profiles").update({"memory_backfilled_at": datetime.now(timezone.utc).isoformat()})
            .eq("id", user_id).is_("memory_backfilled_at", "null").execute())
        total += saved
        print(line.replace("to keep", "saved", 1))

    tokens = chars / 4
    print(f"\n{'Would import' if args.dry_run else 'Imported'} {total} memories "
          f"(about {int(tokens):,} tokens, ${tokens * 0.02 / 1_000_000:.5f} to embed).")


if __name__ == "__main__":
    asyncio.run(main())
