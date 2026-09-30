"""
Check Beaker (the outreach agent) against the real APIs.

Runs one outreach end to end through the app's own code, the way a student's
try would, and reports what came back and what it cost:

  1. A goal becomes a shortlist of real people (web search, Haiku).
  2. One of them (or the person you name) is researched: facts with sources,
     and an email address only if it is published on a page the code fetched.
  3. The first email is drafted (Sonnet), and checked the way the app checks it:
     word limits, no phone numbers or placeholders, no em dashes, every claim
     tied to a source.
  4. One tone rewrite ("shorter") and a follow-up, neither of which searches.

It answers what the offline tests cannot: do the forced-tool schemas pass the
real API, do real search results survive the filters, is the writing any good,
and what does one try really cost. Nothing is written to the database and no
budget is touched. Pages are fetched from the public web (research reads the
person's page and checks the address on it). The key is read from the
environment (or langgraph-service/.env) and never printed.

    cd langgraph-service
    ANTHROPIC_API_KEY=sk-ant-... python3 scripts/check_outreach.py
    python3 scripts/check_outreach.py --goal "a robotics engineer in Seattle who mentors students"
    python3 scripts/check_outreach.py --name "Jane Doe" --org "University of Washington" --url https://...
"""
import argparse
import asyncio
import json
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

# Per-million-token list rates (input, output). Web search adds $0.01 a search.
RATES = {"claude-sonnet-5": (2.00, 10.00), "claude-haiku-4-5-20251001": (1.00, 5.00)}

RECORD = """Name: Ada Chen
Year: currently grade 11, graduating 2028
GPA: 3.9 unweighted
Courses: AP Chemistry (ap), AP Biology (ap), AP Environmental Science (ap)
Activities: Environmental Club, Grocery store cashier, Science Olympiad
Awards: Regional Science Fair, 2nd place
Considering majors: Environmental Science, Marine Biology
Through-line in their record: Practical science aimed at her own community."""
NOTE = "I test nitrate levels at three spots along our local bay with my environmental club."
GOAL = "A marine biology professor in Florida who studies seagrass or coastal water quality"


def preflight() -> bool:
    try:
        from dotenv import load_dotenv
        load_dotenv(Path(__file__).resolve().parents[1] / ".env")
    except ImportError:
        pass
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("ANTHROPIC_API_KEY is not set.\n")
        print("Put it in langgraph-service/.env (gitignored), or pass it for one run:")
        print("  ANTHROPIC_API_KEY=sk-ant-... python3 scripts/check_outreach.py")
        return False
    return True


class Meter:
    """Counts tokens and searches for every model call the app makes."""

    def __init__(self, llm):
        self.llm = llm
        self.real = llm._anthropic.messages.create
        self.rows = []

    async def create(self, **kw):
        msg = await self.real(**kw)
        u = msg.usage
        searches = getattr(getattr(u, "server_tool_use", None), "web_search_requests", 0) or 0
        self.rows.append((kw.get("model"), u.input_tokens, u.output_tokens, searches))
        return msg

    def install(self):
        self.llm._anthropic.messages.create = self.create

    def take(self) -> tuple[str, float]:
        rows, self.rows = self.rows, []
        cost = sum((i * RATES.get(m, (0, 0))[0] + o * RATES.get(m, (0, 0))[1]) / 1_000_000 + s * 0.01
                   for m, i, o, s in rows)
        tin = sum(r[1] for r in rows)
        tout = sum(r[2] for r in rows)
        srch = sum(r[3] for r in rows)
        return f"{len(rows)} call(s), {tin} in, {tout} out, {srch} search(es)", cost


def header(title: str) -> None:
    print(f"\n{'=' * 68}\n{title}\n{'=' * 68}")


def show(obj, limit=30) -> None:
    lines = json.dumps(obj, indent=2, ensure_ascii=False).splitlines()
    for line in lines[:limit]:
        print("    " + line)
    if len(lines) > limit:
        print("    ...")


async def progress(event: dict) -> None:
    if event.get("type") == "progress":
        print(f"  [{event.get('status')}] {event.get('label')}")


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--goal", default=GOAL)
    parser.add_argument("--name", help="research this person instead of running a shortlist")
    parser.add_argument("--org", default="")
    parser.add_argument("--url", default="")
    parser.add_argument("--voice", default="warm", choices=["formal", "warm", "direct", "humble"])
    parser.add_argument("--purpose", default="research",
                        choices=["research", "informational", "internship", "mentorship"])
    args = parser.parse_args()

    import app.llm as llm
    from app.nodes.agents.outreach import draft, research, voices

    meter = Meter(llm)
    meter.install()
    problems, costs = [], {}

    target = {"name": args.name, "organization": args.org, "url": args.url} if args.name else None
    if not target:
        header(f"1. Shortlist for a goal\n   {args.goal}")
        people = await research.find_people(args.goal, record_text=RECORD, emit=progress)
        line, costs["shortlist"] = meter.take()
        print(f"  cost          : {line}  (${costs['shortlist']:.4f})")
        if people is None:
            problems.append("shortlist: the search failed (the student's try would be given back)")
            return report(problems, costs)
        if not people:
            problems.append("shortlist: searched, but nobody survived the filters")
            return report(problems, costs)
        show(people)
        pick = people[0]
        target = {"name": pick["name"], "organization": pick.get("organization") or "",
                  "url": pick.get("source_url") or ""}

    header(f"2. Researching {target['name']}")
    found = await research.research_person(target, emit=progress)
    line, costs["research"] = meter.take()
    print(f"  cost          : {line}  (${costs['research']:.4f})")
    if not found or found.get("status") != "found":
        problems.append(f"research: {found.get('status') if found else 'failed'}")
        show(found or {})
        return report(problems, costs)
    show({k: found.get(k) for k in ("person", "facts", "verified_email", "email_source_url")})
    if not found.get("verified_email"):
        print("  NOTE: no address was verified on a page; the student would paste one or open the source.")

    header(f"3. First email ({args.voice}, {args.purpose}, brief)")
    try:
        written = await draft.write_draft(research=found, record_text=RECORD, student_name="Ada Chen",
                                          grade="They are in grade 11.", purpose=args.purpose, voice=args.voice,
                                          length="brief", student_note=NOTE, answer=None, allow_question=False,
                                          emit=progress)
    except draft.DraftFailed as exc:
        line, costs["draft"] = meter.take()
        problems.append(f"draft: failed ({exc.message})")
        return report(problems, costs)
    line, costs["draft"] = meter.take()
    print(f"  cost          : {line}  (${costs['draft']:.4f})")
    print(f"\n  Subject: {written['subject']}\n")
    for para in written["body"].split("\n"):
        print("    " + para)
    print(f"\n  {draft.word_count(written['body'])} words; claims:")
    show(written["claims"], limit=20)
    print("  Facts to verify:")
    show(written["facts_to_verify"], limit=12)
    for issue in draft.email_problems(written["subject"], written["body"], max_words=voices.MAX_WORDS):
        problems.append(f"draft: {issue}")
    if "—" in written["subject"] + written["body"]:
        problems.append("draft: an em dash reached the email")
    if not written["claims"]:
        problems.append("draft: no claim about the recipient is tied to a source")

    header("4. Rewrite: shorter (no search)")
    try:
        shorter = await draft.rewrite_draft(research=found, record_text=RECORD, student_name="Ada Chen",
                                            subject=written["subject"], body=written["body"], style="shorter",
                                            purpose=args.purpose, voice=args.voice)
        line, costs["rewrite"] = meter.take()
        print(f"  cost          : {line}  (${costs['rewrite']:.4f})")
        print(f"  {draft.word_count(written['body'])} words -> {draft.word_count(shorter['body'])} words")
    except draft.DraftFailed as exc:
        meter.take()
        problems.append(f"rewrite: failed ({exc.message})")

    header("5. Follow-up after 12 days (no search)")
    try:
        follow = await draft.write_followup(research=found, student_name="Ada Chen", subject=written["subject"],
                                            body_sent=written["body"], days_since=12)
        line, costs["followup"] = meter.take()
        print(f"  cost          : {line}  (${costs['followup']:.4f})")
        for para in follow.split("\n"):
            print("    " + para)
    except draft.DraftFailed as exc:
        meter.take()
        problems.append(f"follow-up: failed ({exc.message})")

    return report(problems, costs)


def report(problems: list[str], costs: dict) -> int:
    header("COST")
    for k, v in costs.items():
        print(f"  {k:<10}: ${v:.4f}")
    one_try = sum(v for k, v in costs.items() if k in ("shortlist", "research", "draft"))
    print(f"  one try (shortlist + research + draft): ${one_try:.4f}")
    header("VERDICT")
    if problems:
        for p in problems:
            print(f"  PROBLEM: {p}")
        return 1
    print("  Every step returned a usable, checked result.")
    return 0


if __name__ == "__main__":
    if not preflight():
        sys.exit(1)
    sys.exit(asyncio.run(main()))
