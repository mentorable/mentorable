"""
Offline eval of long-term memory: does recall find the right earlier words, and
does it stay quiet when there is nothing to find?

Uses scripts/fixtures/memory_eval.json: synthetic students, each with about 115
memories (check-ins, follow-up answers and chat lines, with specific facts
planted among look-alike distractors) and questions of four kinds:

  tool       what the chat advisor would pass to recall_memory
  checkin    a new check-in (the reply recalls what connects to it)
  task       the next task's milestone (the task prompt recalls constraints)
  no_answer  something the student never mentioned: anything returned is a
             false recall, which is worse than returning nothing

Ranking runs through app/nodes/recall/rank.py, the mirror of the SQL function
that production uses (pinned to real Postgres scores in tests/test_memory.py).
Word stems come from Postgres itself (to_tsvector('english'), read only), so
the exact-words half matches production too. Nothing is written anywhere.

Strategies compared:
  recent 10        what a "last N lines" memory gives: the newest, whatever the question
  vector only      meaning alone, with the similarity floor
  hybrid           meaning + exact words, fused by reciprocal rank
  production       hybrid + the recency nudge (rank.SETTINGS)

    cd langgraph-service
    OPENAI_API_KEY=sk-... python3 scripts/eval_memory.py            # the real numbers (about $0.0005 of embeddings)
    OPENAI_API_KEY=sk-... python3 scripts/eval_memory.py --sweep    # tune the floor and the word rule
    python3 scripts/eval_memory.py --fake-embeddings                # plumbing check only; the numbers mean nothing

Word stems need DATABASE_URL (the service's .env) or a linked Supabase CLI in
the repo root; --lexemes local uses a rough stand-in instead.
"""
import argparse
import asyncio
import hashlib
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
import types
from dataclasses import replace
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.abspath(os.path.join(HERE, "..")))

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(HERE, "..", ".env"))
except ImportError:
    pass
# The app's config insists on these, and the eval touches none of them.
DATABASE_URL = os.environ.get("DATABASE_URL", "")
for _key, _value in {"SUPABASE_URL": "http://stub", "SUPABASE_ANON_KEY": "stub", "SUPABASE_SERVICE_ROLE_KEY": "stub",
                     "ANTHROPIC_API_KEY": "stub", "DATABASE_URL": "postgresql://stub", "CORS_ORIGIN": "*"}.items():
    os.environ.setdefault(_key, _value)
_stub = types.ModuleType("app.db.supabase")
_stub.get_supabase = lambda: None
sys.modules["app.db.supabase"] = _stub

from app.models import MEMORY_EMBED_DIMS, MEMORY_EMBED_MODEL  # noqa: E402
from app.nodes.recall.rank import SETTINGS, rank  # noqa: E402
from app.nodes.recall.store import memory_text  # noqa: E402

FIXTURE = os.path.join(HERE, "fixtures", "memory_eval.json")
REPO_ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
NOW = datetime(2026, 9, 29, 16, 0, tzinfo=timezone.utc)
KINDS = ("tool", "checkin", "task", "no_answer")
# How many memories each path asks for in production: the chat tool's default,
# and MEMORY_RECALL_LIMIT in the Quest service.
PATH_LIMIT = {"tool": 5, "checkin": 3, "task": 3, "no_answer": 5}
DEPTH = 10


# ── The fixture ───────────────────────────────────────────────────────────────

def load_fixture(path: str) -> list[dict]:
    with open(path) as f:
        data = json.load(f)
    students = data["students"]
    problems = []
    for s in students:
        ids = [m["id"] for m in s["memories"]]
        if len(ids) != len(set(ids)):
            problems.append(f"{s['id']}: duplicate memory ids")
        for m in s["memories"]:
            if m["source"] not in ("chat", "checkin", "followup") or not m["body"].strip():
                problems.append(f"{m['id']}: bad source or empty body")
        for q in s["questions"]:
            if q["kind"] not in KINDS:
                problems.append(f"{q['id']}: unknown kind {q['kind']}")
            if (q["kind"] == "no_answer") != (not q["answers"]):
                problems.append(f"{q['id']}: answers do not fit its kind")
            missing = [a for a in q["answers"] if a not in ids]
            if missing:
                problems.append(f"{q['id']}: answers {missing} are not memories")
            elif q.get("changed"):
                days = {m["id"]: m["days_ago"] for m in s["memories"]}
                if len(q["answers"]) < 2 or days[q["answers"][0]] >= days[q["answers"][1]]:
                    problems.append(f"{q['id']}: a changed fact lists its newer memory first, then the older one")
    if problems:
        sys.exit("Fixture problems:\n  " + "\n  ".join(problems))
    return students


# ── Word stems ────────────────────────────────────────────────────────────────

_STOP = set("""a an and are as at be but by for from has have he her his i if in into is it its me my of on or our
so that the their them then there these they this to was we were what when which who will with you your""".split())


def local_lexemes(text: str) -> list[str]:
    """A rough stand-in for to_tsvector('english'): lowercase words minus
    stopwords, with a few common endings cut. Only for --lexemes local."""
    out = set()
    for w in re.findall(r"[a-z0-9]+", text.lower()):
        if w in _STOP:
            continue
        for suffix in ("ing", "ed", "es", "s"):
            if len(w) > len(suffix) + 2 and w.endswith(suffix):
                w = w[: -len(suffix)]
                break
        out.add(w)
    return sorted(out)


_LEXEME_SQL = """SELECT x.i::int AS i, tsvector_to_array(to_tsvector('english'::regconfig, x.t)) AS lex
FROM jsonb_array_elements_text('{payload}'::jsonb) WITH ORDINALITY AS x(t, i)"""


def postgres_lexemes(texts: list[str]) -> list[list[str]]:
    """Stems from Postgres itself, read only: via DATABASE_URL, or the Supabase CLI."""
    url = DATABASE_URL
    if url:
        import psycopg
        with psycopg.connect(url) as conn, conn.cursor() as cur:
            cur.execute("SELECT x.i::int, tsvector_to_array(to_tsvector('english'::regconfig, x.t)) "
                        "FROM jsonb_array_elements_text(%s::jsonb) WITH ORDINALITY AS x(t, i)", (json.dumps(texts),))
            got = dict(cur.fetchall())
        return [sorted(got[i + 1]) for i in range(len(texts))]
    if not shutil.which("supabase"):
        sys.exit("No DATABASE_URL and no Supabase CLI for word stems. Set one, or pass --lexemes local.")
    payload = json.dumps(texts).replace("'", "''")
    with tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False) as f:
        f.write(_LEXEME_SQL.format(payload=payload))
        sql_path = f.name
    try:
        res = subprocess.run(["supabase", "db", "query", "--linked", "-f", sql_path], cwd=REPO_ROOT,
                             capture_output=True, text=True, timeout=120)
    finally:
        os.unlink(sql_path)
    out = res.stdout
    start = out.find("{")
    if res.returncode != 0 or start < 0:
        sys.exit(f"Supabase CLI query failed: {(res.stderr or out)[-400:]}")
    rows = json.loads(out[start:out.rfind("}") + 1])["rows"]
    got = {int(r["i"]): r["lex"] or [] for r in rows}
    return [sorted(got[i + 1]) for i in range(len(texts))]


# ── Embeddings ────────────────────────────────────────────────────────────────

def fake_vector(text: str, dims: int) -> list[float]:
    """Hashed bag of words: texts sharing words are close. Plumbing checks only."""
    v = [0.0] * dims
    for w in local_lexemes(text):
        v[int(hashlib.sha1(w.encode()).hexdigest()[:8], 16) % dims] += 1.0
    n = math.sqrt(sum(x * x for x in v)) or 1.0
    return [x / n for x in v]


async def real_vectors(texts: list[str]) -> list[list[float]]:
    from openai import AsyncOpenAI
    client = AsyncOpenAI(api_key=os.environ["OPENAI_API_KEY"], timeout=60.0, max_retries=2)
    out: list[list[float]] = []
    for start in range(0, len(texts), 96):
        chunk = texts[start:start + 96]
        res = await client.embeddings.create(model=MEMORY_EMBED_MODEL, input=chunk, dimensions=MEMORY_EMBED_DIMS)
        out.extend(d.embedding for d in sorted(res.data, key=lambda d: d.index))
    return out


def shorten(vector: list[float], dims: int) -> list[float]:
    """text-embedding-3 vectors can be cut and renormalised (the API's own
    `dimensions` does the same), which is how --dims compares smaller sizes."""
    if dims >= len(vector):
        return vector
    head = vector[:dims]
    n = math.sqrt(sum(x * x for x in head)) or 1.0
    return [x / n for x in head]


# ── Scoring ───────────────────────────────────────────────────────────────────

def strategies(settings):
    return {
        "recent 10": None,
        "vector only": dict(use_text=False, use_recency=False, settings=replace(settings, text_min_matches=0)),
        "hybrid": dict(use_text=True, use_recency=False, settings=settings),
        "production": dict(use_text=True, use_recency=True, settings=settings),
    }


def ranked_ids(strategy, memories, qvec, qlex):
    if strategy is None:
        newest = sorted(memories, key=lambda m: (m["created_at"], m["id"]), reverse=True)
        return [m["id"] for m in newest[:DEPTH]]
    got = rank(memories, qvec, qlex, now=NOW, limit=DEPTH, **strategy)
    return [m["id"] for m in got]


def score(questions, results):
    """results: question id -> ranked ids. Returns the metrics for one strategy."""
    answerable = [q for q in questions if q["answers"]]
    empty = [q for q in questions if not q["answers"]]

    def first_hit(q):
        ids = results[q["id"]]
        return next((i + 1 for i, mid in enumerate(ids) if mid in q["answers"]), None)

    def hit_at(k, qs):
        return sum(1 for q in qs if (first_hit(q) or 99) <= k) / max(1, len(qs))

    def delivered(qs):
        return sum(1 for q in qs if (first_hit(q) or 99) <= PATH_LIMIT[q["kind"]]) / max(1, len(qs))

    newer = [q for q in answerable if q.get("changed")]

    def newer_first(q):
        ids = results[q["id"]]
        a, b = q["answers"][0], q["answers"][1]
        return a in ids and (b not in ids or ids.index(a) < ids.index(b))

    return {
        "hit@1": hit_at(1, answerable), "hit@3": hit_at(3, answerable), "hit@5": hit_at(5, answerable),
        "mrr": sum(1 / (first_hit(q) or math.inf) for q in answerable) / max(1, len(answerable)),
        "delivered": delivered(answerable),
        "by_kind": {k: delivered([q for q in answerable if q["kind"] == k]) for k in ("tool", "checkin", "task")},
        "false_recall": sum(1 for q in empty if results[q["id"]][:PATH_LIMIT["no_answer"]]) / max(1, len(empty)),
        "newer_first": (sum(1 for q in newer if newer_first(q)), len(newer)),
    }


def run_all(students, vectors, lexemes, settings, only=None):
    table = {}
    for name, strategy in strategies(settings).items():
        if only and name != only:
            continue
        results, questions = {}, []
        for s in students:
            for q in s["questions"]:
                results[q["id"]] = ranked_ids(strategy, s["_memories"], vectors[q["id"]], lexemes[q["id"]])
                questions.append(q)
        table[name] = (score(questions, results), results)
    return table


def pct(x):
    return f"{100 * x:5.1f}%"


def print_table(table):
    print(f"{'strategy':<14}{'found*':>8}{'hit@1':>8}{'hit@3':>8}{'hit@5':>8}{'MRR':>7}"
          f"{'tool':>8}{'checkin':>9}{'task':>8}{'false':>8}{'newer':>7}")
    for name, (m, _) in table.items():
        nf = m["newer_first"]
        print(f"{name:<14}{pct(m['delivered']):>8}{pct(m['hit@1']):>8}{pct(m['hit@3']):>8}{pct(m['hit@5']):>8}"
              f"{m['mrr']:>7.3f}{pct(m['by_kind']['tool']):>8}{pct(m['by_kind']['checkin']):>9}"
              f"{pct(m['by_kind']['task']):>8}{pct(m['false_recall']):>8}{f'{nf[0]}/{nf[1]}':>7}")
    print("  found*: an answer within what production asks for (5 for the chat tool, 3 for check-ins and tasks)."
          "\n  false: questions with no answer that still got something back. newer: a changed fact's newer"
          " version ranked above the older one.")


def print_misses(students, table):
    _, results = table["production"]
    memo = {m["id"]: m for s in students for m in s["memories"]}
    print("\nProduction misses (no answer within the path's limit) and false recalls:")
    for s in students:
        for q in s["questions"]:
            ids = results[q["id"]][:PATH_LIMIT[q["kind"]]]
            wrong = (q["answers"] and not any(i in q["answers"] for i in ids)) or (not q["answers"] and ids)
            if not wrong:
                continue
            print(f"  {q['id']} ({q['kind']}): {q['query']!r}")
            for i in ids:
                print(f"      got  {i}: {memo[i]['body'][:90]!r}")
            for a in q["answers"][:2]:
                print(f"      want {a}: {memo[a]['body'][:90]!r}")


async def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--fixture", default=FIXTURE)
    parser.add_argument("--fake-embeddings", action="store_true", help="hashed bag of words instead of OpenAI")
    parser.add_argument("--lexemes", choices=("postgres", "local"), default="postgres")
    parser.add_argument("--dims", type=int, default=MEMORY_EMBED_DIMS, help="cut vectors to this size to compare")
    parser.add_argument("--sweep", action="store_true", help="try other similarity floors and word rules")
    parser.add_argument("--misses", action="store_true", help="list what production got wrong")
    args = parser.parse_args()
    if not args.fake_embeddings and not os.environ.get("OPENAI_API_KEY"):
        sys.exit("Set OPENAI_API_KEY for real embeddings, or pass --fake-embeddings to check the plumbing.")

    students = load_fixture(args.fixture)
    texts, keys = [], []
    for s in students:
        for m in s["memories"]:
            # Spread a day's memories over its hours, so same-day ties break the same way every run.
            spread = int(hashlib.sha1(m["id"].encode()).hexdigest()[:4], 16) % 12
            m["created_at"] = NOW - timedelta(days=float(m["days_ago"]), hours=spread)
            texts.append(memory_text(m["body"], m.get("context") or ""))
            keys.append(m["id"])
        for q in s["questions"]:
            texts.append(q["query"])
            keys.append(q["id"])

    if args.fake_embeddings:
        vecs = [fake_vector(t, MEMORY_EMBED_DIMS) for t in texts]
    else:
        vecs = await real_vectors(texts)
    vecs = [shorten(v, args.dims) for v in vecs]
    # The stored stems come from context || ' ' || body, the query's from the query.
    lex_texts = [(f"{m.get('context') or ''} {m['body']}") for s in students for m in s["memories"]]
    lex_texts += [q["query"] for s in students for q in s["questions"]]
    lex_keys = [m["id"] for s in students for m in s["memories"]] + [q["id"] for s in students for q in s["questions"]]
    lex = postgres_lexemes(lex_texts) if args.lexemes == "postgres" else [local_lexemes(t) for t in lex_texts]
    vectors = dict(zip(keys, vecs))
    lexemes = dict(zip(lex_keys, lex))
    for s in students:
        s["_memories"] = [{**m, "embedding": vectors[m["id"]], "lexemes": lexemes[m["id"]]} for m in s["memories"]]

    n_mem = sum(len(s["memories"]) for s in students)
    n_q = sum(len(s["questions"]) for s in students)
    print(f"{len(students)} students, {n_mem} memories, {n_q} questions. "
          f"Embeddings: {'FAKE (plumbing only)' if args.fake_embeddings else MEMORY_EMBED_MODEL}"
          f"{f' cut to {args.dims}' if args.dims < MEMORY_EMBED_DIMS else ''}; stems: {args.lexemes}.")
    print(f"Production settings: {SETTINGS}\n")
    table = run_all(students, vectors, lexemes, SETTINGS)
    print_table(table)
    if args.misses:
        print_misses(students, table)

    if args.sweep:
        print("\nSweep (production strategy): found* on answerable questions / false recall on no-answer ones")
        floors = [0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50]
        print(f"{'words needed':<14}" + "".join(f"{f'floor {f:.2f}':>16}" for f in floors))
        for need in (0, 1, 2, 3):
            cells = []
            for floor in floors:
                m, _ = run_all(students, vectors, lexemes,
                               replace(SETTINGS, min_similarity=floor, text_min_matches=need),
                               only="production")["production"]
                cells.append(f"{pct(m['delivered'])} /{pct(m['false_recall'])}")
            print(f"{('off' if need == 0 else need):<14}" + "".join(f"{c:>16}" for c in cells))


if __name__ == "__main__":
    asyncio.run(main())
