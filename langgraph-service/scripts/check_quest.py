"""
Check the Quest model calls against the real API.

Runs each of the five Quest jobs once with the app's real prompts and tool
schemas (plan, daily task, check-in reply on a real and a thin check-in,
suggestions, portfolio draft), then reports what came back and what it cost.
It answers the things the offline tests cannot:

  1. Does the API accept every forced-tool schema? A rejected schema would
     make that job fall back to plain content on every single call.
  2. Do the replies survive the app's own cleaning (lengths, no em dashes,
     a usable plan) rather than falling back?
  3. What does a day of Quest really cost per student?

Nothing is written to the database and no budget is touched. The key is read
from the environment (or langgraph-service/.env) and never printed.

    cd langgraph-service
    ANTHROPIC_API_KEY=sk-ant-... python3 scripts/check_quest.py
"""
import asyncio
import os
import sys
import types
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

for key, value in {
    "SUPABASE_URL": "http://stub", "SUPABASE_ANON_KEY": "stub",
    "SUPABASE_SERVICE_ROLE_KEY": "stub", "DATABASE_URL": "postgresql://stub", "CORS_ORIGIN": "*",
}.items():
    os.environ.setdefault(key, value)
_stub = types.ModuleType("app.db.supabase")
_stub.get_supabase = lambda: None
sys.modules["app.db.supabase"] = _stub

# Per-million-token list rates (input, output).
RATES = {"claude-sonnet-5": (2.00, 10.00), "claude-haiku-4-5-20251001": (1.00, 5.00)}

RECORD = """Name: Ada Chen
Year: currently grade 11, graduating 2028
GPA: 3.9 unweighted
Courses: AP Chemistry (ap), AP Biology (ap), Precalculus (honors)
Activities: Environmental Club, Grocery store cashier, Science Olympiad
Awards: Regional Science Fair, 2nd place
Considering majors: Environmental Science, Public Health
Target colleges: UC Davis, University of Michigan
Through-line in their record: Practical science aimed at her own community."""


def preflight() -> bool:
    try:
        from dotenv import load_dotenv
        load_dotenv(Path(__file__).resolve().parents[1] / ".env")
    except ImportError:
        pass
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("ANTHROPIC_API_KEY is not set.\n")
        print("Put it in langgraph-service/.env (gitignored), or pass it for one run:")
        print("  ANTHROPIC_API_KEY=sk-ant-... python3 scripts/check_quest.py")
        return False
    return True


async def run(client, label, model, prompt, tool, max_tokens):
    print(f"\n{'=' * 68}\n{label}  ({model})\n{'=' * 68}")
    try:
        msg = await client.messages.create(
            model=model, max_tokens=max_tokens, tools=[tool],
            tool_choice={"type": "tool", "name": tool["name"]},
            messages=[{"role": "user", "content": prompt}],
        )
    except Exception as exc:
        print(f"  FAILED: {exc}")
        print("  The app would fall back to plain content for this job on every call.")
        return None, 0.0
    block = next((b for b in msg.content if getattr(b, "type", None) == "tool_use"), None)
    u = msg.usage
    inp, out = RATES.get(model, (0, 0))
    cost = (u.input_tokens * inp + u.output_tokens * out) / 1_000_000
    print(f"  stop_reason   : {msg.stop_reason}")
    print(f"  tokens        : {u.input_tokens} in, {u.output_tokens} out  (${cost:.5f})")
    if block is None:
        print("  RESULT: no tool call came back")
        return None, cost
    return block.input, cost


def show(obj, limit=14):
    import json
    lines = json.dumps(obj, indent=2, ensure_ascii=False).splitlines()
    for line in lines[:limit]:
        print("    " + line)
    if len(lines) > limit:
        print("    ...")


def has_em_dash(obj) -> bool:
    import json
    return "—" in json.dumps(obj, ensure_ascii=False)


async def main() -> int:
    from anthropic import AsyncAnthropic
    from app.models import (QUEST_CHECKIN_MODEL, QUEST_DRAFT_MODEL, QUEST_PLAN_MODEL,
                            QUEST_SUGGEST_MODEL, QUEST_TASK_MODEL)
    from app.nodes.quest import checkin, draft, plan, suggest, task

    client = AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    problems, costs = [], {}

    # Plan
    raw, costs["plan"] = await run(client, "Quest plan (once per quest)", QUEST_PLAN_MODEL,
                                   plan.PLAN_PROMPT.format(
                                       minutes=30, work_days=5, record=RECORD,
                                       goal="Test lead levels in my county's drinking water and share what I find",
                                       deadline_block="\n", deadline_sizing=""),
                                   plan.PLAN_TOOL, 2000)
    cleaned = plan.clean_plan(raw)
    if cleaned is None:
        problems.append("plan: unusable, the student would see 'That plan did not come out right'")
    else:
        print(f"  plan          : {len(cleaned['milestones'])} milestones, "
              f"{sum(m['days'] for m in cleaned['milestones'])} days")
        show(cleaned)
        if has_em_dash(raw):
            print("  note          : the raw reply had em dashes (the app strips them)")

    ms = (cleaned or {"milestones": [{"title": "Pick the question", "description": "", "days": 3}]})["milestones"][0]
    quest = {"title": (cleaned or {}).get("title", "Water quality project"),
             "summary": (cleaned or {}).get("summary", ""), "daily_minutes": 30}

    # Daily task
    raw, costs["task"] = await run(client, "Daily task (every active student, every day)", QUEST_TASK_MODEL,
                                   task.TASK_PROMPT.format(
                                       minutes=30, quest_title=quest["title"], quest_summary=quest["summary"],
                                       ms_position=1, ms_count=5, ms_title=ms["title"],
                                       ms_description=ms["description"], day_in_ms=2, ms_days=ms["days"],
                                       catch_up_note="", prior="- List five questions you could test",
                                       recent='- On "List five questions you could test": I picked lead because the county publishes readings',
                                       grade="They are in grade 11."),
                                   task.TASK_TOOL, 600)
    cleaned_task = task.clean_task(raw, 30)
    if cleaned_task is None:
        problems.append("task: unusable, every student would get the plain fallback task")
    else:
        show(cleaned_task)

    # Check-in replies
    base = dict(quest_title=quest["title"], ms_title=ms["title"],
                task_title=(cleaned_task or {}).get("title", "Find the county dataset"),
                task_detail=(cleaned_task or {}).get("detail", ""), catch_up_line="")
    raw, costs["reply"] = await run(client, "Check-in reply, a real check-in", QUEST_CHECKIN_MODEL,
                                    checkin.CHECKIN_PROMPT.format(
                                        body="Found the state water dataset and saved two years of lead readings "
                                             "for our county into a spreadsheet.", **base),
                                    checkin.CHECKIN_TOOL, 400)
    reply = checkin.clean_reply(raw, "real")
    show(reply)
    if reply.get("canned"):
        problems.append("reply: fell back to a canned reply")
    if reply.get("thin"):
        problems.append("reply: a detailed check-in was judged thin")

    raw, thin_cost = await run(client, "Check-in reply, a thin check-in", QUEST_CHECKIN_MODEL,
                               checkin.CHECKIN_PROMPT.format(body="did it", **base),
                               checkin.CHECKIN_TOOL, 400)
    thin = checkin.clean_reply(raw, "did it")
    show(thin)
    if not thin.get("thin") or not thin.get("followup"):
        problems.append("reply: 'did it' did not get a follow-up question")

    # Suggestions
    raw, costs["suggest"] = await run(client, "Suggested quests (cached per record)", QUEST_SUGGEST_MODEL,
                                      suggest.SUGGEST_PROMPT.format(record=RECORD, gaps="- No research experience yet"),
                                      suggest.SUGGEST_TOOL, 900)
    ideas = suggest.clean_suggestions(raw)
    if not ideas:
        problems.append("suggestions: unusable, the picker would show the generic fallback")
    else:
        show(ideas)

    # Portfolio draft
    raw, costs["draft"] = await run(client, "Portfolio draft (once per finished quest)", QUEST_DRAFT_MODEL,
                                    draft.DRAFT_PROMPT.format(
                                        title=quest["title"], summary=quest["summary"],
                                        milestones="1. Pick the question\n2. Gather the data\n3. Write it up",
                                        checkins="- Found the state dataset and saved two years of lead readings\n"
                                                 "- Built a chart of readings by site; two schools are above the action level\n"
                                                 "- Presented the findings at Environmental Club"),
                                    draft.DRAFT_TOOL, 600)
    entry = draft.clean_draft(raw, quest)
    show(entry)
    if len(entry.get("description") or "") > 150:
        problems.append("draft: description over 150 characters")

    # The cost of a quest day
    daily = costs.get("task", 0) + costs.get("reply", 0)
    print(f"\n{'=' * 68}\nCOST\n{'=' * 68}")
    print(f"  one active day (task + reply) : ${daily:.4f}")
    print(f"  a 30-day month at that rate   : ${daily * 30:.2f}")
    print(f"  one-off per quest (plan + draft + suggestions): "
          f"${costs.get('plan', 0) + costs.get('draft', 0) + costs.get('suggest', 0):.4f}")

    print(f"\n{'=' * 68}\nVERDICT\n{'=' * 68}")
    if problems:
        for p in problems:
            print(f"  PROBLEM: {p}")
        return 1
    print("  Every Quest job returned a usable, cleaned result through its forced tool.")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()) if preflight() else 1)
