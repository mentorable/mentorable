"""
How memories are ranked: the tuning constants, and a Python mirror of the SQL.

Production ranks inside Postgres (public.recall_memories, in
supabase/migrations/20260929_student_memories.sql), and retrieve.py passes it
the constants below on every call, so this file is where they are tuned. The
mirror exists for the offline eval (scripts/eval_memory.py), which scores
ranking strategies without writing anything to the database, and it is checked
against numbers from a real Postgres run in tests/test_memory.py. Change the
SQL and the mirror together.

The scoring, in words:
  * rank every memory by cosine similarity to the query;
  * rank the memories that share words with the query by how rare those words
    are among this student's memories (the sum of ln(1 + N/df) over matched
    word stems), so a name or a specific noun outweighs "school" or "work";
  * nudge newer memories up inside each ranking: their relevance counts
    (1 + recency_weight * exp(-age_days / recency_days)) times more, so newer
    wins only among memories about as relevant (applied to the fused score
    instead, it let any new, loosely related memory overtake several better
    ones, because adjacent reciprocal ranks differ by under 2%);
  * fuse the two by reciprocal rank, 1/(k + rank) from each list;
  * keep only memories that are close in meaning (similarity >= min_similarity)
    or share enough of the query's words (text_min_matches of them, or the
    query's only word).
"""
import math
from dataclasses import dataclass
from datetime import datetime
from typing import Optional


@dataclass(frozen=True)
class RecallSettings:
    min_similarity: float = 0.30   # below this a memory is not "about" the query
    text_min_matches: int = 2      # 0 turns word matching off as a way in
    rrf_k: int = 60                # the usual reciprocal-rank constant
    recency_weight: float = 0.10   # a brand-new memory's relevance counts up to 10% more
    recency_days: float = 45.0     # how fast that nudge fades


# The values production uses. Tune them with scripts/eval_memory.py.
SETTINGS = RecallSettings()


def cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return dot / (na * nb) if na and nb else 0.0


def rank(memories: list[dict], query_vector: list[float], query_lexemes: list[str], *,
         now: datetime, settings: RecallSettings = SETTINGS, limit: int = 5,
         exclude_key: Optional[str] = None, use_text: bool = True, use_recency: bool = True) -> list[dict]:
    """The mirror of recall_memories. Each memory needs: id, embedding, lexemes,
    created_at (aware datetime) and, for exclusion, dedupe_key. Returns copies
    of the chosen memories with similarity, matched and score added, best first.

    use_text / use_recency switch those parts off, for comparing strategies."""
    mine = [m for m in memories if exclude_key is None or m.get("dedupe_key") != exclude_key]
    if not mine:
        return []
    q = sorted(set(query_lexemes)) if use_text else []
    n = float(len(mine))

    sims = {m["id"]: cosine(m["embedding"], query_vector) for m in mine}

    def fresh(m) -> float:
        if not use_recency:
            return 1.0
        age_days = max(0.0, (now - m["created_at"]).total_seconds() / 86400.0)
        return 1 + settings.recency_weight * math.exp(-age_days / settings.recency_days)
    boost = {m["id"]: fresh(m) for m in mine}
    df = {lex: sum(1 for m in mine if lex in m["lexemes"]) for lex in q}
    df = {lex: c for lex, c in df.items() if c > 0}
    matched = {m["id"]: [lex for lex in df if lex in m["lexemes"]] for m in mine}
    tscore = {mid: sum(math.log(1 + n / df[lex]) for lex in lexs) for mid, lexs in matched.items() if lexs}

    # Ties break the way the SQL does: newer first, then id.
    def newest_then_id(m):
        return (-m["created_at"].timestamp(), m["id"])

    by_vector = sorted(mine, key=lambda m: (-sims[m["id"]] * boost[m["id"]],) + newest_then_id(m))
    vrank = {m["id"]: i + 1 for i, m in enumerate(by_vector)}
    by_text = sorted((m for m in mine if m["id"] in tscore),
                     key=lambda m: (-tscore[m["id"]] * boost[m["id"]],) + newest_then_id(m))
    trank = {m["id"]: i + 1 for i, m in enumerate(by_text)}

    need = min(settings.text_min_matches, len(q)) if settings.text_min_matches > 0 else None
    out = []
    for m in mine:
        mid = m["id"]
        hits = len(matched[mid])
        eligible = sims[mid] >= settings.min_similarity or (
            need is not None and hits > 0 and hits >= need)
        if not eligible:
            continue
        score = 1.0 / (settings.rrf_k + vrank[mid])
        if mid in trank:
            score += 1.0 / (settings.rrf_k + trank[mid])
        out.append({**m, "similarity": sims[mid], "matched": hits, "score": score})

    out.sort(key=lambda m: (-m["score"],) + newest_then_id(m))
    return out[:max(1, min(limit, 20))]
