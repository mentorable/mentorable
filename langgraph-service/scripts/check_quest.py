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
  4. Does the web search tool return real, checked links for a task, and what
     does one "Find resources" tap cost (searches plus tokens)?
  5. Does the pre-plan talk ask a real first question, finish when told to,
     and does the plan write a direction from it?

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
RATES = {"claude-sonnet-5": (2.00, 10.00), "claude-haiku-4-5-20251001": (1.00, 5.00)}  # web search adds $0.01 a search

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


def quote_quest(quest: dict) -> dict:
    return {"title": quest["title"], "summary": quest["summary"]}


def has_em_dash(obj) -> bool:
    import json
    return "—" in json.dumps(obj, ensure_ascii=False)


async def main() -> int:
    from anthropic import AsyncAnthropic
    from app.models import (QUEST_CHECKIN_MODEL, QUEST_DRAFT_MODEL, QUEST_PLAN_MODEL,
                            QUEST_SUGGEST_MODEL, QUEST_TASK_MODEL)
    from app.nodes.quest import checkin, draft, plan, resources, suggest, talk, task

    client = AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    problems, costs = [], {}

    # The talk before planning: a first question, then a forced finish.
    goal = "Test lead levels in my county's drinking water and share what I find"
    raw, costs["talk"] = await run(client, "Pre-plan talk, first question", talk.QUEST_TALK_MODEL,
                                   talk.TALK_PROMPT.format(goal=goal, record=RECORD,
                                                           conversation="(nothing yet: ask your first question)",
                                                           asked=0, max_q=talk.MAX_QUESTIONS, rule=talk._rule(0)),
                                   talk.TALK_TOOL, 300)
    first = talk.clean_turn(raw, 0)
    show(first or {})
    if not first or first["done"] or not first["message"].endswith("?"):
        problems.append("talk: the first turn did not come back as a question")
    convo = [{"role": "advisor", "content": (first or {}).get("message") or "What do you want at the end?"},
             {"role": "student", "content": "a short report for my town council with a map of the readings"},
             {"role": "advisor", "content": "What have you done with data like this before?"},
             {"role": "student", "content": "just spreadsheets in chem class"}]
    raw, talk_cost2 = await run(client, "Pre-plan talk, told to finish", talk.QUEST_TALK_MODEL,
                                talk.TALK_PROMPT.format(goal=goal, record=RECORD, conversation=talk.render(convo),
                                                        asked=talk.MAX_QUESTIONS, max_q=talk.MAX_QUESTIONS,
                                                        rule=talk._rule(talk.MAX_QUESTIONS)),
                                talk.TALK_TOOL, 300)
    closing = talk.clean_turn(raw, talk.MAX_QUESTIONS)
    show(closing or {})
    if not closing or not closing["done"]:
        problems.append("talk: told to finish, it did not")
    costs["talk"] += talk_cost2

    # Plan
    raw, costs["plan"] = await run(client, "Quest plan (once per quest)", QUEST_PLAN_MODEL,
                                   plan.PLAN_PROMPT.format(
                                       minutes=30, work_days=5, record=RECORD, goal=goal,
                                       conversation_block=plan.conversation_block(talk.render(convo)),
                                       deadline_block="\n", deadline_sizing=""),
                                   plan.PLAN_TOOL, 2000)
    cleaned = plan.clean_plan(raw)
    if cleaned is None:
        problems.append("plan: unusable, the student would see 'That plan did not come out right'")
    else:
        print(f"  plan          : {len(cleaned['milestones'])} milestones, "
              f"{sum(m['days'] for m in cleaned['milestones'])} days")
        print(f"  direction     : {cleaned['direction'] or '(empty)'}")
        if not cleaned["direction"]:
            problems.append("plan: no direction written from the talk")
        show(cleaned)
        if has_em_dash(raw):
            print("  note          : the raw reply had em dashes (the app strips them)")

    ms = (cleaned or {"milestones": [{"title": "Pick the question", "description": "", "days": 3}]})["milestones"][0]
    quest = {"title": (cleaned or {}).get("title", "Water quality project"),
             "summary": (cleaned or {}).get("summary", ""), "daily_minutes": 30,
             "direction": (cleaned or {}).get("direction", "")}

    # Daily task
    raw, costs["task"] = await run(client, "Daily task (every active student, every day)", QUEST_TASK_MODEL,
                                   task.TASK_PROMPT.format(
                                       minutes=30, quest_title=quest["title"], quest_summary=quest["summary"],
                                       direction=quest["direction"] or "Not discussed; go by the quest and the milestone.",
                                       ms_position=1, ms_count=5, ms_title=ms["title"],
                                       ms_description=ms["description"], day_in_ms=2, ms_days=ms["days"],
                                       catch_up_note="", prior="- List five questions you could test",
                                       recent='- On "List five questions you could test": I picked lead because the county publishes readings',
                                       # A memory, the way retrieve.prompt_lines shows one.
                                       earlier=task.EARLIER_BLOCK.format(
                                           lines='- "i only have my phone at home, the school laptop is lunch only" (in chat, Sep 3)'),
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
                task_detail=(cleaned_task or {}).get("detail", ""), catch_up_line="",
                earlier=checkin.earlier_block(
                    '- "the county data had two schools missing, idk why" '
                    '(checking in on "Download the county data", Sep 10)'))
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
    if reply.get("sensitive"):
        problems.append("reply: an ordinary check-in was flagged sensitive, so it would never be remembered")

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

    # Resources for a task: the real search, through the app's own code path.
    print(f"\n{'=' * 68}\nTask resources, on request ({resources.QUEST_RESOURCES_MODEL}, web search)\n{'=' * 68}")
    import app.llm as llm
    usage = {"in": 0, "out": 0, "searches": 0}
    real_create = llm._anthropic.messages.create

    async def counting_create(**kw):
        msg = await real_create(**kw)
        u = msg.usage
        usage["in"] += u.input_tokens
        usage["out"] += u.output_tokens
        usage["searches"] += getattr(getattr(u, "server_tool_use", None), "web_search_requests", 0) or 0
        return msg

    llm._anthropic.messages.create = counting_create
    found = await resources.find_resources(
        quest=quote_quest(quest), grade="They are in grade 11.",
        task={"title": (cleaned_task or {}).get("title", "Find the county dataset"),
              "detail": (cleaned_task or {}).get("detail", "Find where the state publishes lead readings by county.")})
    llm._anthropic.messages.create = real_create
    inp, out = RATES.get(resources.QUEST_RESOURCES_MODEL, (0, 0))
    res_cost = (usage["in"] * inp + usage["out"] * out) / 1_000_000 + usage["searches"] * 0.01
    costs["resources"] = res_cost
    print(f"  tokens        : {usage['in']} in, {usage['out']} out, {usage['searches']} search(es)  (${res_cost:.4f})")
    if found is None:
        problems.append("resources: the search call failed or returned nothing usable; the button would say 'try again'")
    elif not found:
        print("  RESULT: searched, nothing solid survived the filter (the student sees 'nothing turned up')")
    else:
        show(found, limit=24)
        if any(not r["url"].startswith("https://") for r in found):
            problems.append("resources: a non-https link got through")

    # The cost of a quest day
    daily = costs.get("task", 0) + costs.get("reply", 0)
    print(f"\n{'=' * 68}\nCOST\n{'=' * 68}")
    print(f"  one active day (task + reply) : ${daily:.4f}")
    print(f"  a 30-day month at that rate   : ${daily * 30:.2f}")
    print(f"  one 'Find resources' tap      : ${costs.get('resources', 0):.4f}  (6 a month max = ${costs.get('resources', 0) * 6:.2f})")
    print(f"  pre-plan talk (two turns)     : ${costs.get('talk', 0):.4f}")
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
