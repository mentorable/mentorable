-- Cost ledger and one chat note per conversation (2026-11-18).
--
-- 1. llm_usage: one row per paid call (a model call, a web search, a voice
--    call), written by the backend with what it consumed and its list-price
--    cost. Until this existed every cost figure was an estimate. Numbers only:
--    no prompt, no reply, no student text. Backend only (RLS on, no policies,
--    nothing granted to anon or authenticated).
--
-- 2. put_chat_signal: the chat's one-sentence note, one per conversation. The
--    old append_chat_signal added a note after every message, so one chat filled
--    the advisor's "previous conversations" list with copies of itself, and the
--    system prompt changed on every message, which made the prompt cache a 25%
--    surcharge instead of a 90% saving. Now a later message in the same chat
--    replaces that chat's note. profiles.chat_signal_session remembers which
--    chat wrote the last note and an md5 of it (never the note itself), so a
--    note the student deleted or edited meanwhile is never overwritten.

-- ── 1. The ledger ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.llm_usage (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  feature            TEXT NOT NULL CHECK (char_length(feature) BETWEEN 1 AND 80),
  provider           TEXT NOT NULL CHECK (char_length(provider) BETWEEN 1 AND 40),
  model              TEXT NOT NULL CHECK (char_length(model) BETWEEN 1 AND 80),
  input_tokens       INT NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens      INT NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  cache_read_tokens  INT NOT NULL DEFAULT 0 CHECK (cache_read_tokens >= 0),
  cache_write_tokens INT NOT NULL DEFAULT 0 CHECK (cache_write_tokens >= 0),
  -- Searches for a search row, seconds for a voice row, 0 otherwise.
  units              INT NOT NULL DEFAULT 0 CHECK (units >= 0),
  -- List price. NULL when the model is missing from the price table.
  cost_usd           NUMERIC(12, 6),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS llm_usage_user_time ON public.llm_usage (user_id, created_at);
CREATE INDEX IF NOT EXISTS llm_usage_time ON public.llm_usage (created_at);

ALTER TABLE public.llm_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.llm_usage FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.llm_usage TO service_role;

-- Per student, per month, per feature.
CREATE OR REPLACE VIEW public.student_cost_month WITH (security_invoker = true) AS
SELECT user_id,
       date_trunc('month', created_at)::date AS month,
       feature,
       count(*)::int                         AS calls,
       sum(cost_usd)                         AS cost_usd,
       sum(input_tokens)::bigint             AS input_tokens,
       sum(output_tokens)::bigint            AS output_tokens,
       sum(cache_read_tokens)::bigint        AS cache_read_tokens,
       sum(cache_write_tokens)::bigint       AS cache_write_tokens,
       count(*) FILTER (WHERE cost_usd IS NULL)::int AS unpriced_calls
  FROM public.llm_usage
 GROUP BY 1, 2, 3;

-- Per day, per feature and model, across everyone.
CREATE OR REPLACE VIEW public.feature_cost_day WITH (security_invoker = true) AS
SELECT date_trunc('day', created_at)::date AS day,
       feature,
       model,
       count(*)::int                       AS calls,
       count(DISTINCT user_id)::int        AS students,
       sum(cost_usd)                       AS cost_usd,
       count(*) FILTER (WHERE cost_usd IS NULL)::int AS unpriced_calls
  FROM public.llm_usage
 GROUP BY 1, 2, 3;

REVOKE ALL ON TABLE public.student_cost_month FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.feature_cost_day FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.student_cost_month TO service_role;
GRANT SELECT ON TABLE public.feature_cost_day TO service_role;


-- ── 2. One chat note per conversation ────────────────────────────────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS chat_signal_session JSONB;

-- Same guards as append_chat_signal: nothing lands when memory is off, or when
-- "Delete everything" ran after p_started. p_session NULL (an old client that
-- sends no chat id) always appends, as before.
CREATE OR REPLACE FUNCTION public.put_chat_signal(
  p_user_id UUID, p_note TEXT, p_started TIMESTAMPTZ, p_max INT, p_session UUID
) RETURNS BOOLEAN
LANGUAGE sql
SET search_path = ''
AS $$
  WITH cur AS (
    SELECT CASE WHEN jsonb_typeof(p.chat_signals) = 'array' THEN p.chat_signals ELSE '[]'::jsonb END AS notes,
           p.chat_signal_session AS sess
      FROM public.profiles p
     WHERE p.id = p_user_id
       FOR UPDATE
  ), next AS (
    SELECT CASE
             WHEN p_session IS NOT NULL
              AND jsonb_array_length(cur.notes) > 0
              AND cur.sess->>'session' = p_session::text
              AND md5(cur.notes->>-1) = cur.sess->>'md5'
             THEN (cur.notes - (-1)) || to_jsonb(p_note)
             ELSE cur.notes || to_jsonb(p_note)
           END AS notes
      FROM cur
  ), upd AS (
    UPDATE public.profiles p
       SET chat_signals = (
             SELECT coalesce(jsonb_agg(t.e ORDER BY t.ord), '[]'::jsonb)
               FROM (SELECT x.e, x.ord
                       FROM next, jsonb_array_elements(next.notes) WITH ORDINALITY AS x(e, ord)
                      ORDER BY x.ord DESC
                      LIMIT greatest(p_max, 1)) t),
           chat_signal_session = CASE WHEN p_session IS NULL THEN NULL
                                      ELSE jsonb_build_object('session', p_session::text, 'md5', md5(p_note)) END
     WHERE p.id = p_user_id AND p.memory_enabled
       AND (p.memory_cleared_at IS NULL OR p.memory_cleared_at <= p_started)
    RETURNING 1)
  SELECT EXISTS (SELECT 1 FROM upd);
$$;

REVOKE ALL ON FUNCTION public.put_chat_signal(UUID, TEXT, TIMESTAMPTZ, INT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.put_chat_signal(UUID, TEXT, TIMESTAMPTZ, INT, UUID) TO service_role;

-- "Delete everything" also forgets which chat wrote the last note. The
-- checkpoint deletes stay: the backend no longer writes those tables, but rows
-- from before still hold copies of old prompts until they are cleared.
CREATE OR REPLACE FUNCTION public.clear_my_memories() RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  uid UUID := auth.uid();
  n   INT;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not signed in';
  END IF;

  UPDATE public.profiles
     SET memory_cleared_at = clock_timestamp(), memory_backfilled_at = clock_timestamp(),
         chat_signals = '[]'::jsonb, chat_signal_session = NULL
   WHERE id = uid;

  DELETE FROM public.student_memories WHERE user_id = uid;
  GET DIAGNOSTICS n = ROW_COUNT;

  DELETE FROM public.checkpoint_writes WHERE thread_id = uid::text || '_chat';
  DELETE FROM public.checkpoint_blobs  WHERE thread_id = uid::text || '_chat';
  DELETE FROM public.checkpoints       WHERE thread_id = uid::text || '_chat';
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_my_memories() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_my_memories() TO authenticated;
