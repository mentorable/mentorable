"""
Check the OpenAI routing against the real API.

Exercises the two jobs that were moved to OpenAI, using the actual prompts and
schemas from the app rather than copies, and reports what each call really
consumed. It answers three questions that cannot be settled without a key:

  1. Does the model accept reasoning_effort="low", or does it fall back?
  2. How many reasoning tokens does each job actually burn? Reasoning is billed
     as output but invisible in the reply, so this is the number that decides
     whether routing a job to OpenAI saved anything.
  3. Does strict json_schema mode accept our schemas?

Nothing is written to the database and no rate limit is touched. Your key is
read from the environment and never printed.

    cd langgraph-service
    OPENAI_API_KEY=sk-... python3 scripts/check_openai.py

Anything else the app needs is stubbed, so you do not need Supabase or the rest
of the environment to run this.
"""
import asyncio
import os
import sys
import types
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# Stub the parts of the app this check does not exercise, so it runs with only
# an OpenAI key rather than a full environment.
for key, value in {
    "SUPABASE_URL": "http://stub", "SUPABASE_ANON_KEY": "stub",
    "SUPABASE_SERVICE_ROLE_KEY": "stub", "DATABASE_URL": "postgresql://stub",
    "ANTHROPIC_API_KEY": "stub", "CORS_ORIGIN": "*",
}.items():
    os.environ.setdefault(key, value)
_stub = types.ModuleType("app.db.supabase")
_stub.get_supabase = lambda: None
sys.modules["app.db.supabase"] = _stub


def preflight():
    """Check the environment before importing the app, so a missing piece is a
    sentence rather than a traceback."""
    try:
        from dotenv import load_dotenv          # picks up langgraph-service/.env
        load_dotenv(Path(__file__).resolve().parents[1] / ".env")
    except ImportError:
        pass

    missing = []
    for mod, hint in (("openai", "openai"), ("anthropic", "anthropic"), ("dotenv", "python-dotenv")):
        try:
            __import__(mod)
        except ImportError:
            missing.append(hint)
    if missing:
        print(f"Missing packages: {', '.join(missing)}\n")
        print("  cd langgraph-service")
        print("  pip install -r requirements.txt")
        return False

    if not os.environ.get("OPENAI_API_KEY"):
        print("OPENAI_API_KEY is not set.\n")
        print("Either put it in langgraph-service/.env (gitignored):")
        print("  OPENAI_API_KEY=sk-...\n")
        print("or pass it for one run:")
        print("  OPENAI_API_KEY=sk-... python3 scripts/check_openai.py")
        return False
    return True

# Per-million rates, for the comparison at the end.
RATES = {
    "gpt-5-nano": (0.05, 0.40),
    "gpt-5-mini": (0.25, 2.00),
}
HAIKU_RATE = (1.00, 5.00)

SAMPLE_CONVERSATION = """USER: i work like 12 hours a week at a grocery store so i dont have much time for clubs
ASSISTANT: That is real and it counts. How long have you been working there?
USER: since sophomore year. my mom needs the help. im worried duke will think i didnt do enough
ASSISTANT: Admissions readers weigh what you did against the time you actually had.
USER: i guess. i just really want to do something with public health"""

SAMPLE_RESUME = """ADA CHEN
Lincoln High School, Class of 2027

EXPERIENCE
Science Olympiad, Anatomy Captain (2025-2026)
  Led a 15 person team to the state finals. Ran weekly practice sessions.
  About 6 hours per week, 30 weeks a year.
Free Clinic of Franklin County, Volunteer (2024-present)
  Intake desk and Spanish translation, roughly 4 hours per week.
Grocery store cashier, 12 hours per week during the school year.

HONORS
Ohio Science Olympiad State Finalist, 2026
National Merit Commended Scholar, 2026
AP Scholar with Distinction, 2025

COURSEWORK
AP Biology, AP Chemistry, AP Spanish, Honors Precalculus
GPA 3.91 unweighted
"""


async def probe(label, model, prompt, schema, schema_name, budget, effort):
    from openai import AsyncOpenAI
    client = AsyncOpenAI(api_key=os.environ["OPENAI_API_KEY"])

    base = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "max_completion_tokens": budget,
        "response_format": {
            "type": "json_schema",
            "json_schema": {"name": schema_name, "schema": schema, "strict": True},
        },
    }

    print(f"\n{'=' * 68}\n{label}  ({model})\n{'=' * 68}")

    used_effort = effort
    try:
        resp = await client.chat.completions.create(**base, reasoning_effort=effort)
        print(f"  reasoning_effort={effort!r}: accepted")
    except Exception as exc:
        if "reasoning_effort" in str(exc).lower():
            print(f"  reasoning_effort={effort!r}: REJECTED -> {str(exc)[:120]}")
            print("  (the app retries without it, so this is handled, but tell Claude)")
            used_effort = None
            resp = await client.chat.completions.create(**base)
        else:
            print(f"  FAILED: {exc}")
            return None

    choice = resp.choices[0]
    u = resp.usage
    details = getattr(u, "completion_tokens_details", None)
    reasoning = getattr(details, "reasoning_tokens", 0) if details else 0
    visible = u.completion_tokens - reasoning

    print(f"  finish_reason : {choice.finish_reason}")
    print(f"  input tokens  : {u.prompt_tokens}")
    print(f"  output tokens : {u.completion_tokens}  (visible {visible}, reasoning {reasoning})")

    if not choice.message.content:
        print("  RESULT: EMPTY REPLY. The budget was spent before it could answer.")
        print(f"          Raise MIN_COMPLETION_BUDGET above {budget}, or lower REASONING_EFFORT.")
        return None

    import json
    try:
        parsed = json.loads(choice.message.content)
    except Exception as exc:
        print(f"  RESULT: reply was not valid JSON: {exc}")
        return None

    print("  schema        : accepted, reply parsed")
    preview = json.dumps(parsed, indent=2)
    print("  reply:")
    for line in preview.splitlines()[:14]:
        print("    " + line)
    if len(preview.splitlines()) > 14:
        print("    ...")

    inp_rate, out_rate = RATES.get(model, (0, 0))
    cost = (u.prompt_tokens * inp_rate + u.completion_tokens * out_rate) / 1_000_000
    haiku = (u.prompt_tokens * HAIKU_RATE[0] + visible * HAIKU_RATE[1]) / 1_000_000
    delta = (cost / haiku - 1) * 100 if haiku else 0
    print(f"\n  this call     : ${cost:.5f}")
    print(f"  same on Haiku : ${haiku:.5f}   -> {delta:+.0f}%"
          f"{'   WORSE, reasoning ate the saving' if cost > haiku else ''}")
    return {"reasoning": reasoning, "cost": cost, "haiku": haiku, "effort": used_effort}


async def main():
    # Imported here, not at module scope, so preflight() can explain a missing
    # dependency before an import error does it less kindly.
    from app.llm import MIN_COMPLETION_BUDGET, REASONING_EFFORT
    from app.models import CHAT_SIGNALS_MODEL, PORTFOLIO_UPLOAD_MODEL
    from app.nodes.chat.extract_signals import EXTRACTION_PROMPT as SIGNALS_PROMPT
    from app.nodes.chat.extract_signals import SIGNALS_SCHEMA
    from app.nodes.portfolio.extract import EXTRACTION_PROMPT as UPLOAD_PROMPT
    from app.nodes.portfolio.extract import ITEMS_SCHEMA, MAX_ITEMS

    print(f"budget floor {MIN_COMPLETION_BUDGET}, reasoning_effort {REASONING_EFFORT!r}")

    results = []
    results.append(await probe(
        "chat signals (fires after every chat message)",
        CHAT_SIGNALS_MODEL,
        SIGNALS_PROMPT.format(conversation=SAMPLE_CONVERSATION),
        SIGNALS_SCHEMA, "chat_signals", MIN_COMPLETION_BUDGET, REASONING_EFFORT))
    results.append(await probe(
        "portfolio upload (resume to rows)",
        PORTFOLIO_UPLOAD_MODEL,
        UPLOAD_PROMPT.format(max_items=MAX_ITEMS, document=SAMPLE_RESUME),
        ITEMS_SCHEMA, "portfolio_items", MIN_COMPLETION_BUDGET, REASONING_EFFORT))

    print(f"\n{'=' * 68}\nVERDICT\n{'=' * 68}")
    if any(r is None for r in results):
        print("  At least one call failed. The app falls back to Anthropic, so")
        print("  nothing is broken, but the saving is not being realised.")
        return 1
    worse = [r for r in results if r["cost"] > r["haiku"]]
    print(f"  reasoning tokens: {', '.join(str(r['reasoning']) for r in results)}")
    if worse:
        print("  Some calls cost MORE than Haiku did. Reasoning overhead is")
        print("  outweighing the cheaper rate. Worth moving those back.")
    else:
        print("  Both jobs are cheaper than the Anthropic calls they replaced.")
    if any(r["effort"] is None for r in results):
        print("  reasoning_effort was rejected somewhere. Handled, but worth changing.")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()) if preflight() else 1)
