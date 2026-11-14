-- Agents, number four: Poise the interview heron. A mock interview by voice
-- for a college (alumni or admissions) interview or an internship, summer
-- program or job interview, then written feedback on each answer and a 1 to 5
-- score on four rubric dimensions. Poise practises and points to the student's
-- own words. It never writes an answer for them and never predicts an
-- admission or an offer.
--
-- Who writes what:
--   * interview_mocks holds one mock: what it was for, the transcript fetched
--     from ElevenLabs after the call, and the feedback and scores written from
--     it. Only the backend (service role) inserts or updates a row: it spends
--     the budget and gets the signed URL before the row exists, stores the
--     ElevenLabs conversation id itself (the browser never says which
--     conversation is whose), and writes the transcript, feedback and scores
--     once its checks have passed. A student reads and deletes their own rows
--     and writes nothing else, so no feedback reaches the page without passing
--     the backend's checks, and no status can be moved by hand.
--   * agent_usage (20260930_agents_outreach.sql) holds Poise's budgets (mock
--     and mock_back) and needs nothing new.
-- What a student says in a mock is theirs alone: RLS-scoped to the owner, anon
-- has nothing, no counselor function reads it, and it never goes to long-term
-- memory. Chat reads only the target, the date and the scores of finished
-- mocks. No audio is kept here, and everything is deleted with the account.


-- ── interview_mocks: one mock interview ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.interview_mocks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- college: an alumni or admissions interview. internship: an internship,
  -- summer program or job. Same flow, a separate question bank for each.
  mode             TEXT NOT NULL CHECK (mode IN ('college', 'internship')),
  -- The school (from their College List or typed) or the organization.
  target           TEXT NOT NULL CHECK (char_length(target) BETWEEN 1 AND 120),
  -- The role applied for. Required for an internship (the table CHECK below),
  -- NULL for a college interview.
  role             TEXT CHECK (role IS NULL OR char_length(role) BETWEEN 1 AND 120),
  -- An optional pasted description of the program or role. Nothing is looked
  -- up on the web.
  details          TEXT NOT NULL DEFAULT '' CHECK (char_length(details) <= 1500),
  -- live: the signed URL was issued (a row starts here). scoring: the backend
  -- has claimed it to fetch the transcript and write feedback. done: feedback
  -- written. no_feedback: the transcript is kept but feedback could not be
  -- written (a Retry may follow). refunded: given back, see refund_reason.
  status           TEXT NOT NULL DEFAULT 'live'
                   CHECK (status IN ('live', 'scoring', 'done', 'no_feedback', 'refunded')),
  -- no_call: ElevenLabs has no conversation for it. too_short: the student
  -- said too little for it to count.
  refund_reason    TEXT CHECK (refund_reason IS NULL OR refund_reason IN ('no_call', 'too_short')),
  -- ElevenLabs' id for the call, read by the backend from the signed URL it
  -- asked for. Unique, so one conversation can only ever be one mock.
  conversation_id  TEXT NOT NULL UNIQUE CHECK (char_length(conversation_id) BETWEEN 1 AND 120),
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at         TIMESTAMPTZ,
  -- When status became 'scoring', so a claim left by a crashed finish goes
  -- stale and can be taken again.
  claimed_at       TIMESTAMPTZ,
  duration_s       INTEGER CHECK (duration_s IS NULL OR duration_s BETWEEN 0 AND 3600),
  -- Counted by code from the student's lines; decides give-backs and whether
  -- there is enough to score.
  student_words    INTEGER CHECK (student_words IS NULL OR student_words >= 0),
  -- [{who: "interviewer" | "student", text}], in the order it was said.
  transcript       JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(transcript) = 'array'),
  -- {questions, habits, thin}: written by code from the model's checked
  -- output. Every quote is the student's own words from the transcript; there
  -- is no field for a sample answer.
  feedback         JSONB CHECK (feedback IS NULL OR jsonb_typeof(feedback) = 'object'),
  -- {examples, structure, why, conversation: {score, reason}}, or NULL when
  -- there was too little to score.
  scores           JSONB CHECK (scores IS NULL OR jsonb_typeof(scores) = 'object'),
  feedback_tries   INTEGER NOT NULL DEFAULT 0 CHECK (feedback_tries BETWEEN 0 AND 5),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (mode = 'college' OR role IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS interview_mocks_user_idx ON public.interview_mocks (user_id, created_at DESC);

ALTER TABLE public.interview_mocks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users read own interview_mocks" ON public.interview_mocks;
CREATE POLICY "users read own interview_mocks" ON public.interview_mocks
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "users delete own interview_mocks" ON public.interview_mocks;
CREATE POLICY "users delete own interview_mocks" ON public.interview_mocks
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);
REVOKE ALL ON public.interview_mocks FROM anon;
-- Students read and delete their own mocks, nothing else. They never insert
-- (the backend spends the budget first) and never update (every status,
-- transcript, note and score is the backend's, after its checks).
REVOKE INSERT, UPDATE, TRUNCATE, REFERENCES, TRIGGER ON public.interview_mocks FROM authenticated;
GRANT SELECT, DELETE ON public.interview_mocks TO authenticated;
