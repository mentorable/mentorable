-- Long-term memory: what a student has said, in their own words, searchable by
-- meaning and by exact words, so the advisor can find the right thing months
-- later ("in week 2 you said your data was messy").
--
-- What goes in: the student's own lines from chat, Quest check-ins and
-- follow-up answers, verbatim (never the advisor's words, never a model's
-- rewording). Thin lines and serious disclosures are never saved; the backend
-- decides that before writing (app/nodes/recall/).
--
-- Students can read and delete their own memories (Profile, "What Mentorable
-- remembers") and turn saving off (profiles.memory_enabled). Only the backend
-- writes. Everything is deleted with the account (ON DELETE CASCADE).

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.student_memories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Their words, exactly as they wrote them (clipped to 500 characters).
  body            TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  -- Where it was said: the Quest task's title, or '' for chat.
  context         TEXT NOT NULL DEFAULT '' CHECK (char_length(context) <= 120),
  source          TEXT NOT NULL CHECK (source IN ('chat', 'checkin', 'followup')),
  quest_id        UUID REFERENCES public.quests(id) ON DELETE SET NULL,
  -- 'checkin:<id>', 'followup:<id>' or 'chat:<hash of the words>'. Makes a
  -- retry, or a backfill of something already saved, a no-op.
  dedupe_key      TEXT NOT NULL CHECK (char_length(dedupe_key) BETWEEN 1 AND 200),
  embedding       extensions.vector(1536) NOT NULL,
  -- Which model made the vector, so a future model change knows what to redo.
  embedding_model TEXT NOT NULL CHECK (char_length(embedding_model) BETWEEN 1 AND 80),
  -- The distinct word stems (Postgres English), for the exact-words half of
  -- the search. Stored rather than indexed: every search covers one student's
  -- few hundred rows, so a full-text index would cost writes and never be used.
  lexemes         TEXT[] GENERATED ALWAYS AS (
                    tsvector_to_array(to_tsvector('english'::regconfig, context || ' ' || body))
                  ) STORED,
  -- When they said it (a backfilled check-in keeps its own date).
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, dedupe_key)
);

-- No vector (HNSW) index, deliberately: every search is scoped to one student,
-- so an exact scan of their rows is fast and returns exactly the nearest
-- memories, where an approximate index would add error for no speed. Revisit
-- only if one student's memories grow into the thousands (they are capped at
-- 1500 by the backend).
CREATE INDEX IF NOT EXISTS student_memories_user_created_idx
  ON public.student_memories (user_id, created_at DESC);

ALTER TABLE public.student_memories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read own memories" ON public.student_memories;
CREATE POLICY "users read own memories" ON public.student_memories
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "users delete own memories" ON public.student_memories;
CREATE POLICY "users delete own memories" ON public.student_memories
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);
-- No insert or update policy: only the backend (service role) writes. Signed-out
-- visitors get no access at all, not just no rows.
REVOKE ALL ON public.student_memories FROM anon;

-- The student's switch. Off: nothing new is saved and nothing is recalled.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS memory_enabled BOOLEAN NOT NULL DEFAULT true;

-- Set once a student's older history (check-ins and chats from before memory
-- existed) has been imported by scripts/backfill_memories.py, or when they
-- delete everything. Either way, that history is never imported after it, so
-- nothing a student deleted can come back.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS memory_backfilled_at TIMESTAMPTZ;


-- ── recall_memories ───────────────────────────────────────────────────────────
-- The search. Two rankings of the student's memories, fused:
--   * by meaning: cosine similarity to the query's embedding;
--   * by exact words: the query's word stems found in the memory, each weighted
--     by how rare it is among this student's memories (ln(1 + N/df)), so
--     "Michigan" or "aunt" count for more than "school" or "work".
-- Newer memories get a nudge inside each ranking: its relevance (similarity,
-- or word score) counts up to (1 + recency_weight) times more when brand new,
-- fading over recency_days. So newer wins only among memories about as
-- relevant; a far closer old memory still ranks first. (Applying the nudge to
-- the fused score instead let any new, loosely related memory overtake several
-- better ones: adjacent reciprocal ranks differ by under 2%.) The two rankings
-- are then fused by reciprocal rank, 1/(k + rank) from each.
--
-- A memory is only returned when it is close in meaning (similarity at or above
-- the floor) or matches enough of the query's words (at least
-- text_min_matches of them, or the query's only word). Recalling something
-- irrelevant is worse than recalling nothing.
--
-- Every tuning constant is a parameter. The backend passes the values it uses
-- (app/nodes/recall/rank.py holds them, and mirrors this scoring in Python for
-- the offline eval, scripts/eval_memory.py). Service role only.
CREATE OR REPLACE FUNCTION public.recall_memories(
  p_user_id          UUID,
  p_embedding        extensions.vector,
  p_query            TEXT,
  p_limit            INT         DEFAULT 5,
  p_min_similarity   FLOAT8      DEFAULT 0.30,
  p_text_min_matches INT         DEFAULT 2,
  p_rrf_k            INT         DEFAULT 60,
  p_recency_weight   FLOAT8      DEFAULT 0.10,
  p_recency_days     FLOAT8      DEFAULT 45,
  p_exclude_key      TEXT        DEFAULT NULL,
  p_now              TIMESTAMPTZ DEFAULT now()
) RETURNS TABLE (
  id         UUID,
  body       TEXT,
  context    TEXT,
  source     TEXT,
  quest_id   UUID,
  created_at TIMESTAMPTZ,
  similarity FLOAT8,
  matched    INT,
  score      FLOAT8
)
LANGUAGE sql STABLE SET search_path = '' AS $$
  WITH q AS (
    SELECT DISTINCT lex
    FROM unnest(tsvector_to_array(to_tsvector('english'::regconfig, coalesce(p_query, '')))) AS lex
  ),
  nq AS (
    SELECT count(*)::int AS n FROM q
  ),
  mine AS (
    SELECT m.id, m.body, m.context, m.source, m.quest_id, m.created_at, m.lexemes,
           (1 - (m.embedding OPERATOR(extensions.<=>) p_embedding))::float8 AS similarity,
           (1 + p_recency_weight
                * exp(-greatest(0, extract(epoch FROM (p_now - m.created_at))::float8 / 86400.0)
                      / p_recency_days))::float8 AS fresh
    FROM public.student_memories m
    WHERE m.user_id = p_user_id
      AND (p_exclude_key IS NULL OR m.dedupe_key <> p_exclude_key)
  ),
  total AS (
    SELECT count(*)::float8 AS n FROM mine
  ),
  df AS (
    SELECT q.lex, count(*)::float8 AS df
    FROM q JOIN mine m ON q.lex = ANY (m.lexemes)
    GROUP BY q.lex
  ),
  hits AS (
    SELECT m.id, count(*)::int AS matched, sum(ln(1 + total.n / df.df))::float8 AS tscore
    FROM mine m
    JOIN df ON df.lex = ANY (m.lexemes)
    CROSS JOIN total
    GROUP BY m.id
  ),
  ranked AS (
    SELECT m.id, m.body, m.context, m.source, m.quest_id, m.created_at, m.similarity,
           coalesce(h.matched, 0) AS matched,
           row_number() OVER (ORDER BY m.similarity * m.fresh DESC, m.created_at DESC, m.id) AS vrank,
           CASE WHEN h.id IS NULL THEN NULL
                ELSE row_number() OVER (ORDER BY h.tscore * m.fresh DESC NULLS LAST, m.created_at DESC, m.id)
           END AS trank
    FROM mine m
    LEFT JOIN hits h ON h.id = m.id
  )
  SELECT r.id, r.body, r.context, r.source, r.quest_id, r.created_at, r.similarity, r.matched,
         (1.0::float8 / (p_rrf_k + r.vrank) + coalesce(1.0::float8 / (p_rrf_k + r.trank), 0))::float8 AS score
  FROM ranked r
  CROSS JOIN nq
  WHERE r.similarity >= p_min_similarity
     OR (p_text_min_matches > 0 AND r.matched > 0 AND r.matched >= least(p_text_min_matches, nq.n))
  ORDER BY score DESC, r.created_at DESC, r.id
  LIMIT greatest(1, least(coalesce(p_limit, 5), 20));
$$;


-- ── prune_student_memories ────────────────────────────────────────────────────
-- Keep a student's newest p_keep memories and delete the rest. Returns how many
-- went. The backend calls it after each save.
CREATE OR REPLACE FUNCTION public.prune_student_memories(p_user_id UUID, p_keep INT)
RETURNS INT
LANGUAGE sql VOLATILE SET search_path = '' AS $$
  WITH doomed AS (
    SELECT m.id
    FROM public.student_memories m
    WHERE m.user_id = p_user_id
    ORDER BY m.created_at DESC, m.id DESC
    OFFSET greatest(coalesce(p_keep, 0), 0)
  ),
  gone AS (
    DELETE FROM public.student_memories m
    USING doomed d
    WHERE m.id = d.id AND m.user_id = p_user_id
    RETURNING 1
  )
  SELECT count(*)::int FROM gone;
$$;

-- Both run with the caller's rights and are callable by the backend only.
REVOKE ALL ON FUNCTION public.recall_memories(UUID, extensions.vector, TEXT, INT, FLOAT8, INT, INT, FLOAT8, FLOAT8, TEXT, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prune_student_memories(UUID, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recall_memories(UUID, extensions.vector, TEXT, INT, FLOAT8, INT, INT, FLOAT8, FLOAT8, TEXT, TIMESTAMPTZ)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.prune_student_memories(UUID, INT) TO service_role;
