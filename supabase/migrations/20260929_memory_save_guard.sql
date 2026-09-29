-- Long-term memory, part 2: saves that honor the student's switch and
-- "Delete everything" even when they were already under way.
--
-- A save takes a few seconds (a model call, an embedding), and a student can
-- turn memory off or delete everything in that time. Checking the switch when
-- the work starts is not enough: the write itself has to check, in the same
-- transaction that writes.
--
--   * save_student_memories / append_chat_signal (backend only) write only while
--     profiles.memory_enabled is on and the student has not cleared their memory
--     since the thing being saved was said (p_started). save_student_memories
--     also takes a share lock on the profile row until it commits, so a switch
--     or a clear that arrives mid-save waits for it and then removes what it
--     wrote.
--   * clear_my_memories (the student's "Delete everything") does it all in one
--     transaction: stamps memory_cleared_at, empties the notes, deletes every
--     memory, and deletes the advisor's saved chat state, which holds copies of
--     the notes inside its prompt.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS memory_cleared_at TIMESTAMPTZ;

-- Students read and delete their own memories; only the backend writes them.
-- RLS already denied the rest, so this makes the table's grants say the same.
REVOKE INSERT, UPDATE, TRUNCATE, REFERENCES, TRIGGER ON public.student_memories FROM authenticated;


-- ── save_student_memories ─────────────────────────────────────────────────────
-- p_rows: a JSON array of {body, context, source, quest_id, dedupe_key,
-- embedding, embedding_model, created_at}. False when the student's switch is
-- off or they cleared their memory after p_started: nothing is written.
CREATE OR REPLACE FUNCTION public.save_student_memories(
  p_user_id UUID, p_rows JSONB, p_started TIMESTAMPTZ, p_keep INT DEFAULT 1500
) RETURNS BOOLEAN
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  PERFORM 1 FROM public.profiles
   WHERE id = p_user_id AND memory_enabled
     AND (memory_cleared_at IS NULL OR memory_cleared_at <= p_started)
   FOR SHARE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  INSERT INTO public.student_memories
    (user_id, body, context, source, quest_id, dedupe_key, embedding, embedding_model, created_at)
  SELECT p_user_id, r ->> 'body', coalesce(r ->> 'context', ''), r ->> 'source',
         nullif(r ->> 'quest_id', '')::uuid, r ->> 'dedupe_key',
         (r ->> 'embedding')::extensions.vector(1536), r ->> 'embedding_model',
         coalesce((r ->> 'created_at')::timestamptz, now())
    FROM jsonb_array_elements(p_rows) AS r
  ON CONFLICT (user_id, dedupe_key) DO NOTHING;

  -- Keep the newest p_keep; the oldest go.
  DELETE FROM public.student_memories
   WHERE id IN (SELECT id FROM public.student_memories WHERE user_id = p_user_id
                 ORDER BY created_at DESC, id DESC OFFSET greatest(p_keep, 0));
  RETURN true;
END;
$$;


-- ── append_chat_signal ────────────────────────────────────────────────────────
-- Adds one summary note to profiles.chat_signals (keeping the newest p_max), in
-- a single statement, so it can neither undo a deletion the student made while
-- the note was being written nor land after they turned memory off.
CREATE OR REPLACE FUNCTION public.append_chat_signal(
  p_user_id UUID, p_note TEXT, p_started TIMESTAMPTZ, p_max INT DEFAULT 20
) RETURNS BOOLEAN
LANGUAGE sql
SET search_path = ''
AS $$
  WITH upd AS (
    UPDATE public.profiles p
       SET chat_signals = (
         SELECT coalesce(jsonb_agg(t.e ORDER BY t.ord), '[]'::jsonb)
           FROM (SELECT x.e, x.ord
                   FROM jsonb_array_elements(
                          (CASE WHEN jsonb_typeof(p.chat_signals) = 'array' THEN p.chat_signals ELSE '[]'::jsonb END)
                          || to_jsonb(p_note)) WITH ORDINALITY AS x(e, ord)
                  ORDER BY x.ord DESC
                  LIMIT greatest(p_max, 1)) t)
     WHERE p.id = p_user_id AND p.memory_enabled
       AND (p.memory_cleared_at IS NULL OR p.memory_cleared_at <= p_started)
    RETURNING 1)
  SELECT EXISTS (SELECT 1 FROM upd);
$$;


-- ── clear_my_memories ─────────────────────────────────────────────────────────
-- "Delete everything" in Profile. SECURITY DEFINER only because the advisor's
-- saved chat state (the LangGraph checkpoint tables) is not readable by
-- students; everything it touches is scoped to the caller's own id. Returns how
-- many memories were deleted.
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

  -- First, so any save still in flight sees it and writes nothing (a save
  -- already holding its share lock finishes first, and its rows go below).
  -- clock_timestamp, not now(): the time this ran, even if it waited on that lock.
  UPDATE public.profiles
     SET memory_cleared_at = clock_timestamp(), memory_backfilled_at = clock_timestamp(),
         chat_signals = '[]'::jsonb
   WHERE id = uid;

  DELETE FROM public.student_memories WHERE user_id = uid;
  GET DIAGNOSTICS n = ROW_COUNT;

  -- The chat graph saves its assembled state (record, notes, prompt) per student.
  DELETE FROM public.checkpoint_writes WHERE thread_id = uid::text || '_chat';
  DELETE FROM public.checkpoint_blobs  WHERE thread_id = uid::text || '_chat';
  DELETE FROM public.checkpoints       WHERE thread_id = uid::text || '_chat';
  RETURN n;
END;
$$;


-- Backend only, except the student's own "Delete everything".
REVOKE ALL ON FUNCTION public.save_student_memories(UUID, JSONB, TIMESTAMPTZ, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_student_memories(UUID, JSONB, TIMESTAMPTZ, INT) TO service_role;
REVOKE ALL ON FUNCTION public.append_chat_signal(UUID, TEXT, TIMESTAMPTZ, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.append_chat_signal(UUID, TEXT, TIMESTAMPTZ, INT) TO service_role;
REVOKE ALL ON FUNCTION public.clear_my_memories() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_my_memories() TO authenticated;
