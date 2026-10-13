-- Agents, number three: Quill the essay owl. A place to write the Common App
-- personal statement and college supplements, a board of ideas for what to
-- write about, and feedback on a draft against its prompt and the student's
-- record. Quill asks and points. It never writes, rewrites or edits any part of
-- an essay, and nothing in the backend ever changes essays.body.
--
-- Who writes what:
--   * essay_topics is the ideas board. A student adds their own cards and edits
--     any card's area, notes, status and position (RLS plus column grants). The
--     backend adds the cards Quill found in the record and the ones a
--     brainstorm ends on; source, evidence and questions are the backend's.
--   * essays holds the drafts. Only the backend creates a row, so the cap of 8
--     essays per student holds; students never insert. Everything a student
--     writes is theirs to change: title, prompt, word limit, body, status and
--     the topic it came from. kind, college_id and school_name are set once, at
--     creation.
--   * essay_versions are saved copies of a draft: one for every review (the
--     exact text Quill read) and the ones a student saves by hand. Backend
--     inserts only; students read and delete their own.
--   * essay_reviews are Quill's notes on one version, with the prompt they
--     were judged against. Backend inserts only. A student reads and deletes
--     their own, and writes one column: responses, their private answers to
--     the notes, which are never sent anywhere.
--   * agent_usage (20260930_agents_outreach.sql) holds Quill's budgets and
--     needs nothing new.
-- Essay text is the most personal thing in the app: every table is RLS-scoped
-- to its owner, anon has nothing, and none of it is read by chat or memory.
-- Everything is deleted with the account.


-- ── essay_topics: the ideas board ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.essay_topics (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- A neutral label for a part of their life ("Fixing bikes with my uncle"),
  -- never a thesis or a title.
  area        TEXT NOT NULL CHECK (char_length(area) BETWEEN 2 AND 80),
  -- Where the card came from: the student's own, Quill reading their record, or
  -- a brainstorm. Students cannot set it, so their inserts get the default.
  source      TEXT NOT NULL DEFAULT 'student' CHECK (source IN ('student', 'record', 'talk')),
  -- [{kind, text}]: what in the record points here, in the record's own words
  -- (written by code from the row, never by the model).
  evidence    JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(evidence) = 'array'),
  -- Open questions for the student to think about, as strings.
  questions   JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(questions) = 'array'),
  -- The student's own thinking, and their brainstorm answers when a talk ends.
  notes       TEXT NOT NULL DEFAULT '' CHECK (char_length(notes) <= 6000),
  status      TEXT NOT NULL DEFAULT 'exploring' CHECK (status IN ('exploring', 'chosen', 'parked')),
  position    DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS essay_topics_user_idx ON public.essay_topics (user_id, position);

ALTER TABLE public.essay_topics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users own essay_topics" ON public.essay_topics;
CREATE POLICY "users own essay_topics" ON public.essay_topics
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
REVOKE ALL ON public.essay_topics FROM anon;
-- Column grants: students add their own cards and change only their own fields.
REVOKE INSERT, UPDATE, TRUNCATE, REFERENCES, TRIGGER ON public.essay_topics FROM authenticated;
GRANT SELECT, DELETE ON public.essay_topics TO authenticated;
GRANT INSERT (user_id, area, notes, status, position) ON public.essay_topics TO authenticated;
GRANT UPDATE (area, notes, status, position, updated_at) ON public.essay_topics TO authenticated;


-- ── essays: the drafts ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.essays (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('personal_statement', 'supplement')),
  title        TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  -- Which of the seven Common App prompts, when it is one of them. The page
  -- copies the prompt's words into prompt_text, so there is one copy of the
  -- prompts (src/lib/essay.js) and the backend reads prompt_text only.
  prompt_key   TEXT CHECK (prompt_key IS NULL OR prompt_key IN ('1', '2', '3', '4', '5', '6', '7')),
  -- '' means not picked yet. Quill does not read an essay without one.
  prompt_text  TEXT NOT NULL DEFAULT '' CHECK (char_length(prompt_text) <= 1500),
  -- A supplement's school: their College List row when they picked one (the
  -- essay stays if the school leaves the list), and its name either way.
  college_id   UUID REFERENCES public.college_list_items(id) ON DELETE SET NULL,
  school_name  TEXT NOT NULL DEFAULT '' CHECK (char_length(school_name) <= 200),
  -- The student's own limit for a supplement. A personal statement is always
  -- 250 to 650 words, whatever this says.
  word_limit   INT NOT NULL CHECK (word_limit BETWEEN 50 AND 1000),
  body         TEXT NOT NULL DEFAULT '' CHECK (char_length(body) <= 20000),
  -- Kept by the page on save, for lists and for chat. The backend recounts
  -- before it relies on a count.
  word_count   INT NOT NULL DEFAULT 0 CHECK (word_count BETWEEN 0 AND 20000),
  status       TEXT NOT NULL DEFAULT 'idea' CHECK (status IN ('idea', 'drafting', 'revising', 'done')),
  topic_id     UUID REFERENCES public.essay_topics(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS essays_user_idx ON public.essays (user_id, updated_at DESC);
-- The two SET NULL references, so removing a school or a card does not scan every essay.
CREATE INDEX IF NOT EXISTS essays_college_idx ON public.essays (college_id);
CREATE INDEX IF NOT EXISTS essays_topic_idx ON public.essays (topic_id);

ALTER TABLE public.essays ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users own essays" ON public.essays;
-- topic_id is the one reference a student writes. A foreign key is checked
-- without RLS, so the policy also holds it to a card of their own.
CREATE POLICY "users own essays" ON public.essays
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND (topic_id IS NULL OR EXISTS (
      SELECT 1 FROM public.essay_topics t
       WHERE t.id = essays.topic_id AND t.user_id = (SELECT auth.uid())
    ))
  );
REVOKE ALL ON public.essays FROM anon;
-- Column grants: students read, edit and delete their own essays. They never
-- insert (the backend counts to 8 first), and kind, college_id and school_name
-- stay as they were created.
REVOKE INSERT, UPDATE, TRUNCATE, REFERENCES, TRIGGER ON public.essays FROM authenticated;
GRANT SELECT, DELETE ON public.essays TO authenticated;
GRANT UPDATE (title, prompt_key, prompt_text, word_limit, body, word_count, status, topic_id, updated_at)
  ON public.essays TO authenticated;


-- ── essay_versions: saved copies of a draft ───────────────────────────────────
-- 'review' is the exact text a review read; 'manual' is one the student saved.
-- At most 30 per essay, kept by the backend.
CREATE TABLE IF NOT EXISTS public.essay_versions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  essay_id    UUID NOT NULL REFERENCES public.essays(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body        TEXT NOT NULL CHECK (char_length(body) <= 20000),
  word_count  INT  NOT NULL CHECK (word_count >= 0),
  source      TEXT NOT NULL CHECK (source IN ('review', 'manual')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS essay_versions_essay_idx ON public.essay_versions (essay_id, created_at DESC);
CREATE INDEX IF NOT EXISTS essay_versions_user_idx ON public.essay_versions (user_id);

ALTER TABLE public.essay_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users read own essay_versions" ON public.essay_versions;
CREATE POLICY "users read own essay_versions" ON public.essay_versions
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "users delete own essay_versions" ON public.essay_versions;
CREATE POLICY "users delete own essay_versions" ON public.essay_versions
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);
REVOKE ALL ON public.essay_versions FROM anon;
-- Students read and delete their own versions, nothing else: a version is a
-- record of what the text was, so it is never edited.
REVOKE INSERT, UPDATE, TRUNCATE, REFERENCES, TRIGGER ON public.essay_versions FROM authenticated;
GRANT SELECT, DELETE ON public.essay_versions TO authenticated;


-- ── essay_reviews: Quill's notes on one version ───────────────────────────────
-- Deleting the version a review read deletes the review with it: its notes
-- quote that text by position and mean nothing without it.
CREATE TABLE IF NOT EXISTS public.essay_reviews (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  essay_id    UUID NOT NULL REFERENCES public.essays(id) ON DELETE CASCADE,
  version_id  UUID NOT NULL REFERENCES public.essay_versions(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- The prompt this review judged the draft against, copied by the backend
  -- from the essay as it was then and held to the same checks as there. The
  -- essay's prompt can change afterwards; these two do not, so the page can
  -- say which prompt a review was for, and the same draft under a different
  -- prompt counts as changed.
  prompt_key  TEXT CHECK (prompt_key IS NULL OR prompt_key IN ('1', '2', '3', '4', '5', '6', '7')),
  prompt_text TEXT NOT NULL DEFAULT '' CHECK (char_length(prompt_text) <= 1500),
  -- One or two sentences on what the draft is about, as an observation.
  summary     TEXT NOT NULL DEFAULT '' CHECK (char_length(summary) <= 400),
  -- Counted by code from the version, with the limits it was held to (word_min
  -- is NULL for a supplement, which has no minimum).
  word_count  INT NOT NULL CHECK (word_count >= 0),
  word_limit  INT NOT NULL CHECK (word_limit > 0),
  word_min    INT CHECK (word_min IS NULL OR word_min >= 0),
  -- [{check, verdict, line}]: the seven checks, in order.
  checks      JSONB NOT NULL CHECK (jsonb_typeof(checks) = 'array'),
  -- [{id, check, quote, start, end, observation, question, record_says, other}]:
  -- every quote is a verbatim piece of the version. There is no field for new
  -- essay text.
  notes       JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(notes) = 'array'),
  -- [{id, quote, start, end, reason, words}]: passages that could go, only when
  -- the draft is over its limit.
  cuts        JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(cuts) = 'array'),
  -- {noteId: {state, answer}}: the student's own answers to the notes. The one
  -- column here a student writes, so it is held to an object of about 16 KB.
  responses   JSONB NOT NULL DEFAULT '{}'::jsonb
                CHECK (jsonb_typeof(responses) = 'object' AND pg_column_size(responses) <= 16384),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS essay_reviews_essay_idx ON public.essay_reviews (essay_id, created_at DESC);
CREATE INDEX IF NOT EXISTS essay_reviews_version_idx ON public.essay_reviews (version_id);
CREATE INDEX IF NOT EXISTS essay_reviews_user_idx ON public.essay_reviews (user_id);

ALTER TABLE public.essay_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users own essay_reviews" ON public.essay_reviews;
CREATE POLICY "users own essay_reviews" ON public.essay_reviews
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
REVOKE ALL ON public.essay_reviews FROM anon;
-- Column grants: students read and delete their own reviews and write only
-- their answers. They never insert: every row is a review that passed the
-- backend's checks, line by line.
REVOKE INSERT, UPDATE, TRUNCATE, REFERENCES, TRIGGER ON public.essay_reviews FROM authenticated;
GRANT SELECT, DELETE ON public.essay_reviews TO authenticated;
GRANT UPDATE (responses) ON public.essay_reviews TO authenticated;
