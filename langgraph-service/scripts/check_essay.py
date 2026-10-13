"""
Check Quill (the essay owl) against the real API.

Runs Quill's three jobs through the app's own code, the way a student's
request would, and reports what came back, what the code threw away, and what
each call cost:

  1. Areas to write about, found in a sample record (topics.find_areas).
  2. A short scripted brainstorm (talk.next_turn), answered from a script.
  3. A review (review.review_draft) of six short sample essays, each built to
     trip one check: a strong one, a vague one, one that does not answer its
     prompt, one whose title and hours clash with the record, one about
     someone else, and one over its word limit.

It answers what the offline tests cannot: does the API accept the forced-tool
schemas, does Haiku copy quotes exactly enough to survive the checks, does it
see what each essay was built to show (a missing point, a student missing
from their own essay), how much does the guardrail throw away, and what does a
review really cost. The record and the essays are made up, about a student who
does not exist. Nothing is written to the database and no budget is touched.
The key is read from the environment (or langgraph-service/.env) and never
printed.

    cd langgraph-service
    ANTHROPIC_API_KEY=sk-ant-... python3 scripts/check_essay.py
    python3 scripts/check_essay.py --only review --essay vague
    python3 scripts/check_essay.py --review-model sonnet     # the same essays on the stronger model
"""
import argparse
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

# ── The sample student (made up) ─────────────────────────────────────────────
# The record as the service hands it over: the rows from load_student_record,
# and the summary text from student_context without the student's name.

RECORD = {
    "profile": {
        "grade_level": 12, "graduation_year": 2027, "gpa_unweighted": 3.8,
        "candidate_majors": ["Civil Engineering", "Urban Planning"],
        "narrative": {
            "theme": "Fixing shared things in her neighborhood, usually with her hands.",
            "gaps": ["No activity shows her leading other people over time"],
            "student_voice": ["my hands figure it out before my head does",
                              "I like when a thing works again and nobody notices"],
            "summary": ("A builder and fixer who learns by taking things apart, and who does it where neighbors "
                        "can use it."),
        },
    },
    "activities": [
        {"id": "act-1", "title": "Bike Repair Collective", "position": "Volunteer mechanic",
         "organization": "Eastside Community Center", "grade_levels": [10, 11, 12], "hours_per_week": 5,
         "weeks_per_year": 40,
         "description": ("Repair donated bikes for neighbors on Saturdays; fixed 140+ bikes; taught 12 kids basic "
                         "repairs.")},
        {"id": "act-2", "title": "Robotics Club", "position": "Treasurer", "organization": "Jefferson High School",
         "grade_levels": [11, 12], "hours_per_week": 4, "weeks_per_year": 30,
         "description": "Kept the club budget and ordered parts; ran two fundraisers that paid regional entry fees."},
        {"id": "act-3", "title": "Hardware store clerk", "position": "", "organization": "Dalton's Hardware",
         "grade_levels": [11, 12], "hours_per_week": 12, "weeks_per_year": 48, "description": ""},
        {"id": "act-4", "title": "Varsity Cross Country", "position": "Runner", "organization": "",
         "grade_levels": [9, 10, 11], "hours_per_week": 8, "weeks_per_year": 14, "description": ""},
    ],
    "awards": [
        {"id": "awd-1", "title": "Regional Science Fair, 2nd place", "level": "regional", "grade_level": 11,
         "year": 2026, "description": "Engineering category, for a gravity-fed water filter."},
        {"id": "awd-2", "title": "Volunteer of the Year", "level": "school", "grade_level": 11, "year": 2026,
         "description": ""},
    ],
    "courses": [{"name": "AP Physics 1", "level": "ap"}, {"name": "AP Calculus AB", "level": "ap"},
                {"name": "Woodshop", "level": "regular"}],
    "scores": [],
}

RECORD_TEXT = """Year: currently grade 12, graduating 2027
GPA: 3.8 unweighted
Courses: AP Physics 1 (ap), AP Calculus AB (ap), Woodshop (regular)
Activities: Bike Repair Collective, Robotics Club, Hardware store clerk, Varsity Cross Country
Awards: Regional Science Fair, 2nd place, Volunteer of the Year
Considering majors: Civil Engineering, Urban Planning
Through-line in their record: Fixing shared things in her neighborhood, usually with her hands.
Who they are: A builder and fixer who learns by taking things apart, and who does it where neighbors can use it."""

# Sample inputs only. The app's one copy of the Common App prompts is in src/lib/essay.js.
PROMPT_GROWTH = ("Discuss an accomplishment, event, or realization that sparked a period of personal growth and a new "
                 "understanding of yourself or others.")
PROMPT_GRATITUDE = ("Reflect on something that someone has done for you that has made you happy or thankful in a "
                    "surprising way. How has this gratitude affected or motivated you?")
PROMPT_BACKGROUND = ("Some students have a background, identity, interest, or talent that is so meaningful they "
                     "believe their application would be incomplete without it. If this sounds like you, then "
                     "please share your story.")
PROMPT_COMMUNITY = "Tell us about a community you belong to and your place in it. (150 words)"

STRONG = """The freewheel on Mr. Okafor's Schwinn had been stuck for eleven years when he rolled it into the community center. He told me that before he told me his name. I was fifteen, it was my third Saturday at the Bike Repair Collective, and until then I had only patched tubes.

I soaked the threads in penetrating oil and waited. I fitted the removal tool, leaned on the wrench, and felt it slip. I tried heat from a hair dryer somebody kept in the supply closet. Nothing moved. Mr. Okafor sat on an overturned bucket and watched without saying a word, which was worse than if he had talked.

After an hour I wanted to tell him it could not be done. What I said was, "Can you come back next week?" He nodded like that was a normal thing to ask.

That week I watched four videos and read a forum thread from 2009. The trick was to clamp the tool in the bench vise and turn the whole wheel like a steering wheel. On Saturday it broke free with a crack that made a kid at the next stand jump. Mr. Okafor laughed so hard he had to stand up.

I used to think being good at fixing things meant already knowing how. Most of my Saturdays since have started with a part I do not recognize and a neighbor waiting on a bucket. I have fixed about a hundred and forty bikes now, and I still say "come back next week" a few times a month. I stopped hearing it as failing. It is the part of the job where I find out what I do not know yet, with the person it matters to sitting right there."""

VAGUE = """Throughout my life, I have always believed that hard work is the key to success. Ever since I was young, I have been a person who never gives up, no matter what challenges come my way. Volunteering has taught me many valuable lessons that I will carry with me forever.

When I started volunteering, I did not know how much it would change me. At first it was difficult, but I pushed through and kept going. There were many times when things did not go as planned. However, I learned that every obstacle is an opportunity to grow. I became a better person because of these experiences.

Working with people in my community opened my eyes to the world around me. I realized that everyone has a story and that helping others is one of the most rewarding things a person can do. I gained skills like communication, leadership, and problem solving. These skills will help me in college and beyond.

Through all of this, I have grown in so many ways. I am more confident, more responsible, and more aware of the needs of others. I know that the lessons I have learned will stay with me for the rest of my life. I am excited to bring my passion and dedication to the next chapter of my journey, where I hope to continue making a difference in the lives of those around me. In conclusion, my experiences have shaped me into the person I am today, and I would not trade them for anything in the world."""

OFF_PROMPT = """My project for the regional science fair was a gravity-fed water filter built from two paint buckets, a length of PVC pipe, sand, gravel and activated charcoal. I got the idea in my woodshop class, where we had leftover buckets, and I spent most of January testing how fast water moved through different layers.

The first version leaked at the seam where the pipe met the lower bucket. I sealed it with plumber's putty, which worked for a day and then cracked. The second version used a rubber gasket and a threaded fitting, and it held. I ran forty liters of creek water through it and measured turbidity before and after with a meter I borrowed from the chemistry lab. The readings dropped from 38 units to 4.

At the fair, I set up my poster next to a project on fruit fly genetics. The judges came by three times. One of them asked how often the charcoal would need to be replaced, and I did not have a number, so I told her how I would find out. Another asked what it cost, and I knew that one: eleven dollars and forty cents.

When they announced the awards I was eating a granola bar and almost missed my name. I took second place in the engineering category. First place went to a senior who had built a drone that mapped soil moisture. Afterward I packed the buckets into my mom's car and started a list of what to change, starting with a way to see when the charcoal is spent. I plan to enter again this year with the next version."""

CLASH = """I have been president of the Robotics Club for all four years of high school, and I spend about twenty hours a week in the lab. When our team's regional entry fee came due last fall, the account was two hundred dollars short, and it was my job to tell everyone.

I stood at the whiteboard and wrote the number. Nobody said anything. Then Dario asked whether we could skip the regional and just go to the scrimmage, and I heard myself say no before I had a plan.

That weekend I made a spreadsheet of everything we owned that we did not use. We had three motor controllers from a robot that no longer existed and a box of aluminum extrusion. I listed them on a forum for other teams and sold all of it in four days for a hundred and thirty dollars. For the rest, I asked Dalton's Hardware, where I work, whether they would trade a sponsor sticker on the robot for seventy dollars of parts credit. My manager said yes before I finished the sentence.

We paid the fee two days before the deadline. At the regional we lost in the quarterfinals to a team whose robot cost more than our whole budget, and I did not mind as much as I expected.

What I think about now is the whiteboard. I had been dreading saying the number out loud, and saying it was the thing that let everyone start solving it. I keep the budget on that whiteboard now, where anyone can see it, including the weeks when it looks bad. The year before, I also won first place at the Regional Science Fair, but the budget is what I am proudest of."""

SOMEONE_ELSE = """My grandfather came to this country in 1974 with a toolbox and forty dollars. He found work at a machine shop on the east side, where he ran a lathe for thirty-one years. He was known for being able to hold a tolerance by feel that other machinists needed a gauge for.

He grew up in a village where the nearest paved road was a day's walk away. His father repaired carts, and my grandfather learned to straighten an axle before he learned to read. When he was nineteen he took a job on a cargo ship, and that is how he saw his first city.

At the shop he trained more than a dozen apprentices. Several of them now own shops of their own, and two of them spoke at his retirement party. The owner gave him a brass micrometer engraved with his name. He kept it in his shirt pocket every day after that, even at church.

He was also the person our whole street called when something broke. He fixed Mrs. Alvarado's furnace on Christmas Eve and would not take money for it. He rebuilt the carburetor on the Nguyens' truck in their driveway. He believed that a thing built by a person could be fixed by a person, and he said so often.

He died two years ago, in March. More than two hundred people came to the service, and many of them told stories about something he had repaired for them. His toolbox sits in our garage now. My grandfather was the most capable person I have ever known, and I am proud to be his granddaughter. He is the reason I want to be an engineer."""

OVER_LIMIT = """The community I belong to meets every Saturday morning in the back room of the Eastside Community Center, where the Bike Repair Collective sets up six repair stands and a folding table of donated parts. I have been part of this community for three years. It is a community that matters a great deal to me, and being part of it has been one of the most important parts of my high school experience.

Every Saturday, neighbors bring in bikes that do not work, and we fix them for free. Some of the people who come in are kids, some are adults who ride to work, and some are older people who have not ridden in years. All kinds of people come in, of all ages, and we help every one of them.

My place in it started at the tube-patching station, which is where every new volunteer starts. Now I run the stand by the window, and I teach the newer volunteers the things that were taught to me. Last spring I taught twelve kids from the middle school how to fix a flat, and one of them, Marcus, now comes in early to set up the stands with me.

I believe that community is about showing up. Community means being there for others. At Harlow, which is famous for its student-run bike co-op, I hope to find a community like this one and to take my place in it the same way, starting wherever new people start."""

# name -> what it is, and the check it was built to trip (None: built to pass).
ESSAYS = {
    "strong": {"about": "a specific story with the student in it and a point", "expects": None,
               "kind": "personal_statement", "prompt": PROMPT_GROWTH, "body": STRONG, "limit": 650, "school": ""},
    "vague": {"about": "general claims with no moment in them", "expects": "specificity",
              "kind": "personal_statement", "prompt": PROMPT_GROWTH, "body": VAGUE, "limit": 650, "school": ""},
    "off_prompt": {"about": "a science fair story under a prompt about gratitude", "expects": "prompt",
                   "kind": "personal_statement", "prompt": PROMPT_GRATITUDE, "body": OFF_PROMPT, "limit": 650,
                   "school": ""},
    "clash": {"about": "president, four years and twenty hours; the record says treasurer, two years, four hours",
              "expects": "consistency", "kind": "personal_statement", "prompt": PROMPT_GROWTH, "body": CLASH,
              "limit": 650, "school": ""},
    "someone_else": {"about": "her grandfather's life, with her in the last two lines", "expects": "presence",
                     "kind": "personal_statement", "prompt": PROMPT_BACKGROUND, "body": SOMEONE_ELSE, "limit": 650,
                     "school": ""},
    "over_limit": {"about": "a 150-word supplement that runs long and repeats itself", "expects": "length",
                   "kind": "supplement", "prompt": PROMPT_COMMUNITY, "body": OVER_LIMIT, "limit": 150,
                   "school": "Harlow College"},
}

# What the student "types" in the scripted brainstorm, one answer per question.
TALK_START = "challenge"
TALK_ANSWERS = [
    "probably the time I couldn't get a freewheel off a bike at the repair place where I volunteer",
    "the man who owned it just sat on a bucket and watched, and I had to ask him to come back next week",
    "embarrassed. I thought he could tell I didn't know what I was doing",
    "now I say come back next week all the time. it's kind of just part of the job",
]


def preflight() -> bool:
    try:
        from dotenv import load_dotenv
        load_dotenv(Path(__file__).resolve().parents[1] / ".env")
    except ImportError:
        pass
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("ANTHROPIC_API_KEY is not set.\n")
        print("Put it in langgraph-service/.env (gitignored), or pass it for one run:")
        print("  ANTHROPIC_API_KEY=sk-ant-... python3 scripts/check_essay.py")
        return False
    return True


class Meter:
    """Counts tokens for every model call the app makes."""

    def __init__(self, llm):
        self.llm = llm
        self.real = llm._anthropic.messages.create
        self.rows = []

    async def create(self, **kw):
        msg = await self.real(**kw)
        u = msg.usage
        self.rows.append((kw.get("model"), u.input_tokens, u.output_tokens))
        return msg

    def install(self):
        self.llm._anthropic.messages.create = self.create

    def take(self) -> tuple[str, float]:
        rows, self.rows = self.rows, []
        cost = sum((i * RATES.get(m, (0, 0))[0] + o * RATES.get(m, (0, 0))[1]) / 1_000_000 for m, i, o in rows)
        return f"{len(rows)} call(s), {sum(r[1] for r in rows)} in, {sum(r[2] for r in rows)} out", cost


def header(title: str) -> None:
    print(f"\n{'=' * 72}\n{title}\n{'=' * 72}")


def clip(text, limit: int = 110) -> str:
    text = " ".join(str(text or "").split())
    return text if len(text) <= limit else text[:limit - 3] + "..."


def raw_text(raw, what: str) -> str:
    """The model's own words for something the code dropped ("note 3",
    "cut 1", "check point", "summary", "area 2"), so the owner can see what
    the guardrail caught. Safe to print here: the essays are samples."""
    if not isinstance(raw, dict):
        return ""
    kind, _, which = what.partition(" ")
    try:
        if kind in ("note", "cut", "area"):
            entry = (raw.get(kind + "s") or [])[int(which) - 1]
            if not isinstance(entry, dict):
                return clip(entry)
            if kind == "area":
                return clip(f"{entry.get('area')!r} questions={entry.get('questions')!r} "
                            f"evidence={entry.get('evidence')!r}", 220)
            fields = ("quote", "observation", "question") if kind == "note" else ("quote", "reason")
            return " | ".join(f"{f}: {clip(entry.get(f), 90)}" for f in fields)
        if kind == "check":
            return clip(((raw.get("checks") or {}).get(which) or {}).get("line"))
        if kind == "summary":
            return clip(raw.get("summary"))
    except (IndexError, ValueError, AttributeError, TypeError):
        pass
    return ""


def show_dropped(trace: list) -> int:
    """Print what the code threw away on each attempt. Returns how many."""
    total = 0
    for step in trace:
        dropped = step.get("dropped") or []
        total += len(dropped)
        label = f"attempt {step['attempt']}" if "attempt" in step else "reply"
        if step.get("usable") is False:
            print(f"  {label}: the reply was unusable (no checks object)")
        for d in dropped:
            print(f"  DROPPED ({label}) {d['what']}: {d['reason']}")
            said = raw_text(step.get("raw"), d["what"])
            if said:
                print(f"      {said}")
    return total


def shown_lines(found: dict) -> list[str]:
    """Every line of a review a student would read that a model wrote."""
    lines = [found["summary"], *[c["line"] for c in found["checks"]]]
    for note in found["notes"]:
        lines += [note["observation"], note["question"]]
    lines += [cut["reason"] for cut in found["cuts"]]
    return [line for line in lines if line]


async def check_areas(topics, rules, meter, problems, costs) -> None:
    header("1. Areas to write about, from the sample record")
    trace: list = []
    areas = await topics.find_areas(record_text=RECORD_TEXT, record=RECORD, existing_areas=["Running cross country"],
                                    trace=trace)
    line, costs["areas"] = meter.take()
    print(f"  cost          : {line}  (${costs['areas']:.4f})")
    if areas is None:
        problems.append("areas: the call failed or gave nothing usable (the student's search would be given back)")
        show_dropped(trace)
        return
    if not areas:
        problems.append("areas: nothing new was found in a record that has plenty")
    for area in areas:
        print(f"\n  {area['area']}")
        for item in area["evidence"]:
            print(f"      from your record ({item['kind']}): {clip(item['text'], 100)}")
        for question in area["questions"]:
            print(f"      ? {question}")
        if any("\u2014" in text for text in (area["area"], *area["questions"])):
            problems.append(f"areas: an em dash reached the card '{area['area']}'")
    print()
    show_dropped(trace)
    if len(areas) < 3:
        print(f"  NOTE: {len(areas)} area(s) survived; the prompt asks for 3 to 5.")


async def check_talk(talk, meter, problems, costs) -> None:
    header(f"2. A scripted brainstorm, starting from '{TALK_START}'")
    messages: list[dict] = []
    answers = list(TALK_ANSWERS)
    total = 0.0
    for _ in range(talk.MAX_QUESTIONS + 1):
        turn = await talk.next_turn(start=TALK_START, topic=None, record_text=RECORD_TEXT, messages=messages)
        line, cost = meter.take()
        total += cost
        if turn["handoff"]:
            problems.append("talk: the hand-off fired on an ordinary answer")
            print(f"  HAND-OFF: {clip(turn['message'])}")
            break
        if turn["fallback"]:
            problems.append("talk: Quill could not take part (an outage, an unusable reply, or a line that broke "
                            "a rule)")
            print(f"  FALLBACK: {turn['message']}")
            break
        if turn["done"]:
            print(f"  Quill (closing): {turn['message']}")
            print(f"  card area      : {turn['area'] or '(none: the card is named after where the talk started)'}")
            if not turn["area"]:
                print("  NOTE: no usable area came back for the card.")
            break
        print(f"  Quill  : {turn['message']}   [{len(turn['message'].split())} words, ${cost:.4f}]")
        if len(turn["message"].split()) > 25:
            print("  NOTE: that question is over 25 words.")
        messages.append({"role": "advisor", "content": turn["message"]})
        if not answers:
            print("  (the student stops answering here)")
            continue
        answer = answers.pop(0)
        print(f"  Student: {answer}")
        messages.append({"role": "student", "content": answer})
    costs["talk"] = total
    print(f"  cost          : ${total:.4f} for the whole talk")


async def check_review(review, rules, meter, problems, costs, name: str, sample: dict) -> None:
    words = rules.word_count(sample["body"])
    header(f"3. Review: {name} ({sample['about']})\n   {sample['kind']}, {words} words, limit {sample['limit']}")
    # The over-limit supplement is about the same place as the strong essay,
    # so it is given that one to compare with.
    others = [{"id": "essay-strong", "title": "Personal statement", "body": STRONG}] if name == "over_limit" else []
    trace: list = []
    result = await review.review_draft(kind=sample["kind"], prompt_text=sample["prompt"], body=sample["body"],
                                       word_limit=sample["limit"], school_name=sample["school"],
                                       record_text=RECORD_TEXT, record=RECORD, others=others, trace=trace)
    line, costs[f"review {name}"] = meter.take()
    print(f"  cost          : {line}  (${costs[f'review {name}']:.4f})")
    if result["status"] != "ok":
        problems.append(f"review {name}: {result['status']}")
        show_dropped(trace)
        return
    found = result["review"]
    print(f"  summary       : {found['summary']}")
    for check in found["checks"]:
        print(f"  {check['check']:<12} {check['verdict']:<5} {check['line']}")
    for note in found["notes"]:
        print(f"\n  [{note['id']}] {note['check']}  \"{clip(note['quote'], 90)}\"")
        print(f"      noticed : {note['observation']}")
        if note["question"]:
            print(f"      asks    : {note['question']}")
        if note["record_says"]:
            print(f"      your record says: {note['record_says']}")
        if note["other"]:
            other = note["other"]
            print(f"      also in {other['kind']} '{other['label']}': {clip(other['quote'], 90)}")
    for cut in found["cuts"]:
        print(f"\n  [{cut['id']}] cut {cut['words']} words  \"{clip(cut['quote'], 90)}\"")
        print(f"      why     : {cut['reason']}")
    if found["cuts"]:
        print(f"\n  the cuts come to {sum(c['words'] for c in found['cuts'])} words")
    print()
    thrown = show_dropped(trace)
    print(f"  {len(found['notes'])} note(s) kept, {thrown} thing(s) dropped by the code, {len(trace)} attempt(s)")

    # What this essay was built to show.
    flagged = {c["check"] for c in found["checks"] if c["verdict"] == "flag"}
    expects = sample["expects"]
    if expects and expects not in flagged:
        problems.append(f"review {name}: built to trip '{expects}', which was not flagged")
    if expects == "consistency" and not any(n["record_says"] for n in found["notes"]):
        problems.append(f"review {name}: no consistency note carries the record's wording")
    if expects == "length" and not found["cuts"]:
        problems.append(f"review {name}: over its limit, and no cut survived")
    if expects != "length" and found["cuts"]:
        problems.append(f"review {name}: cuts on a draft that is not over its limit")
    if expects is None and len(found["notes"]) > 4:
        print(f"  NOTE: the strong essay drew {len(found['notes'])} notes; a draft that does its job should get few.")
    if len(trace) > 1:
        print("  NOTE: the first answer lost more than half its notes to the checks, so the model was asked again.")
    for line in shown_lines(found):
        if "\u2014" in line:
            problems.append(f"review {name}: an em dash reached the student ({clip(line, 60)})")
        broken = rules.breaks_rules(line, [sample["body"], sample["prompt"], RECORD_TEXT])
        if broken in ("rewrite", "mechanics", "odds"):
            problems.append(f"review {name}: a line that breaks a rule reached the student ({clip(line, 60)})")
    for entry in [*found["notes"], *found["cuts"]]:
        if rules.find_quote(entry["quote"], sample["body"]) is None:
            problems.append(f"review {name}: a quote that is not in the draft reached the student")


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--only", choices=["areas", "talk", "review"], help="run one of the three jobs")
    parser.add_argument("--essay", choices=list(ESSAYS), help="review only this sample essay")
    parser.add_argument("--review-model", choices=["haiku", "sonnet"], default=None,
                        help="read the essays with this model, whatever app/models.py says")
    args = parser.parse_args()

    import app.llm as llm
    from app import models
    from app.nodes.agents.essay import review, rules, talk, topics

    if args.review_model:
        review.OWL_REVIEW_MODEL = models.SONNET if args.review_model == "sonnet" else models.HAIKU
    print(f"talk: {talk.OWL_TALK_MODEL}   areas: {topics.OWL_TOPICS_MODEL}   review: {review.OWL_REVIEW_MODEL}")

    meter = Meter(llm)
    meter.install()
    problems: list[str] = []
    costs: dict[str, float] = {}

    if args.only in (None, "areas"):
        await check_areas(topics, rules, meter, problems, costs)
    if args.only in (None, "talk"):
        await check_talk(talk, meter, problems, costs)
    if args.only in (None, "review"):
        for name, sample in ESSAYS.items():
            if args.essay in (None, name):
                await check_review(review, rules, meter, problems, costs, name, sample)
    return report(problems, costs)


def report(problems: list[str], costs: dict) -> int:
    header("COST")
    for k, v in costs.items():
        print(f"  {k:<22}: ${v:.4f}")
    reviews = [v for k, v in costs.items() if k.startswith("review ")]
    if reviews:
        print(f"  one review, on average : ${sum(reviews) / len(reviews):.4f}  (most ${max(reviews):.4f})")
        print(f"  a student's 8 reviews  : about ${8 * sum(reviews) / len(reviews):.2f}")
    header("VERDICT")
    if problems:
        for p in problems:
            print(f"  PROBLEM: {p}")
        return 1
    print("  Every call returned a usable, checked result.")
    if len(reviews) == len(ESSAYS):
        print("  Each sample essay tripped the check it was built for, and only the over-length one drew cuts.")
    return 0


if __name__ == "__main__":
    if not preflight():
        sys.exit(1)
    sys.exit(asyncio.run(main()))
