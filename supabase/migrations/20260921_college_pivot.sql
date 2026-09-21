-- ─────────────────────────────────────────────────────────────────────────────
-- College application pivot — phase 1: the student record.
--
-- Replaces the career-guidance profile with a college-application record:
-- Common App shaped activities, awards, courses, test scores, GPA, candidate
-- majors, target colleges, and a single narrative blob.
--
-- See .claude/COLLEGE_PIVOT.md for the full design.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Activities — mirrors the real Common App activities section ───────────────
CREATE TABLE IF NOT EXISTS student_activities (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- The 13 Common App categories, plus 'other'.
  category            TEXT,
  title               TEXT NOT NULL,
  position            TEXT,            -- leadership/role title, 50 chars on the real form
  organization        TEXT,            -- 100 chars on the real form
  description         TEXT,            -- 150 chars on the real form
  grade_levels        INT[] NOT NULL DEFAULT '{}',   -- any of 9,10,11,12
  timing              TEXT,            -- school_year | summer | all_year
  hours_per_week      NUMERIC(5,2),
  weeks_per_year      INT,
  continue_in_college BOOLEAN NOT NULL DEFAULT false,
  -- Narrative-central activities the conversation deep-dived.
  is_spike            BOOLEAN NOT NULL DEFAULT false,
  -- 'name_only' straight from the form, 'enriched' after the conversation.
  detail_level        TEXT NOT NULL DEFAULT 'name_only',
  order_index         INT NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE student_activities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users own student_activities" ON student_activities;
CREATE POLICY "users own student_activities" ON student_activities
  FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS student_activities_user_idx
  ON student_activities(user_id, order_index);

-- ── Awards / honors ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS student_awards (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  -- school | regional | state | national | international
  level       TEXT,
  grade_level INT,
  year        INT,
  description TEXT,
  order_index INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE student_awards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users own student_awards" ON student_awards;
CREATE POLICY "users own student_awards" ON student_awards
  FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS student_awards_user_idx
  ON student_awards(user_id, order_index);

-- ── Coursework ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS student_courses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  -- ap | ib | honors | dual_enrollment | regular
  level       TEXT,
  grade_level INT,
  year        INT,
  -- true for courses the student intends to take but hasn't yet
  planned     BOOLEAN NOT NULL DEFAULT false,
  order_index INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE student_courses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users own student_courses" ON student_courses;
CREATE POLICY "users own student_courses" ON student_courses
  FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS student_courses_user_idx
  ON student_courses(user_id, order_index);

-- ── Test scores (SAT / ACT / AP / PSAT) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS student_test_scores (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- sat | act | ap | psat
  test_type      TEXT NOT NULL,
  -- SAT/ACT/PSAT composite; for AP this is the 1-5 score
  score          INT,
  -- SAT: { "reading_writing": 760, "math": 760 }  ACT: { "english":.., "math":.., ... }
  section_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- AP subject name; null for SAT/ACT
  subject        TEXT,
  test_date      DATE,
  attempt        INT NOT NULL DEFAULT 1,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE student_test_scores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users own student_test_scores" ON student_test_scores;
CREATE POLICY "users own student_test_scores" ON student_test_scores
  FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS student_test_scores_user_idx
  ON student_test_scores(user_id, test_type);

-- ── profiles: the college record ──────────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS graduation_year   INT,
  ADD COLUMN IF NOT EXISTS gpa_unweighted    NUMERIC(5,3),
  ADD COLUMN IF NOT EXISTS gpa_weighted      NUMERIC(5,3),
  -- 4.0 | 5.0 | 100 | other | not_used
  ADD COLUMN IF NOT EXISTS gpa_scale         TEXT,
  -- replaces career_matches
  ADD COLUMN IF NOT EXISTS candidate_majors  JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- name-only; reach/target/safety is computed from the record, never self-asserted
  ADD COLUMN IF NOT EXISTS target_colleges   JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- { theme, theme_evidence[], major_reasoning, spike_activity_ids[],
  --   concerns[], gaps[], student_voice[] }
  ADD COLUMN IF NOT EXISTS narrative         JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- text | voice
  ADD COLUMN IF NOT EXISTS intake_channel    TEXT,
  -- extraction lands here for review; committed to the real tables on confirm
  ADD COLUMN IF NOT EXISTS intake_draft      JSONB;

-- ── Everyone re-onboards ──────────────────────────────────────────────────────
-- The old career profile isn't convertible into a college record, and a student
-- with no activities or GPA is invisible to the new product.
UPDATE profiles SET onboarding_completed = false WHERE onboarding_completed = true;
