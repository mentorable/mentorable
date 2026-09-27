-- College List: the schools a student is applying to, each tagged reach,
-- target or likely.
--
-- The facts on a row (admit rate, score ranges, net price, size) are copied
-- from the U.S. Department of Education's College Scorecard when the school is
-- added, through the college-search Edge Function. They are a snapshot, shown
-- to the student as published figures.
--
-- Unlike Quest, there is nothing here to game: a student tagging their own list
-- is as trustworthy as the free-text list they typed at onboarding. So students
-- read and write their own rows directly, the same as student_activities.

CREATE TABLE IF NOT EXISTS public.college_list_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scorecard_id     INT  NOT NULL CHECK (scorecard_id > 0),   -- IPEDS unit id; also the de-dup key
  name             TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  city             TEXT CHECK (char_length(city) <= 100),
  state            TEXT CHECK (char_length(state) <= 4),
  admission_rate   NUMERIC(5,4) CHECK (admission_rate BETWEEN 0 AND 1),
  -- SAT is published as two section ranges; these are their sums, the usual
  -- way to read a composite middle 50% off them.
  sat_25           INT CHECK (sat_25 BETWEEN 400 AND 1600),
  sat_75           INT CHECK (sat_75 BETWEEN 400 AND 1600),
  act_25           INT CHECK (act_25 BETWEEN 1 AND 36),
  act_75           INT CHECK (act_75 BETWEEN 1 AND 36),
  net_price        INT CHECK (net_price >= 0),
  enrollment       INT CHECK (enrollment >= 0),
  category         TEXT NOT NULL CHECK (category IN ('reach', 'target', 'likely')),
  -- Where the category came from: a firm suggestion (test scores against the
  -- school's range, or an admit rate that settles it alone), a rough guess (the
  -- admit rate and GPA, with no score range to compare), or the student's own
  -- pick. The app re-suggests the first two when the student's record changes,
  -- and never touches one the student picked.
  category_source  TEXT NOT NULL CHECK (category_source IN ('suggested', 'rough', 'student')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, scorecard_id)
);

ALTER TABLE public.college_list_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users own college_list_items" ON public.college_list_items;
CREATE POLICY "users own college_list_items" ON public.college_list_items
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
