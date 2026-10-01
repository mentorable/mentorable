-- Agents, number two: Talon the opportunity hawk. Finds real scholarships and
-- activities (summer programs, competitions, research, internships,
-- volunteering) for a student, checks each one against its own page, and keeps
-- the ones they want on a board.
--
-- Who writes what:
--   * finder_items is the student's board. Only Talon creates rows (students
--     never insert). A student moves, ticks off, annotates and deletes their own
--     (RLS), but their column grants cover only their own fields: status,
--     outcome, notes, req_done, position and updated_at. The facts read from the
--     provider's page, the checks and the recheck counter are the backend's.
--   * finder_searches is the backend's ledger of finds: students read their own
--     rows and write none. Its brief never holds the student's citizenship or
--     the opt-in eligibility categories: those shape one search and are dropped,
--     and the CHECK on brief refuses any key outside the eight it may hold.
--   * agent_usage (20260930_agents_outreach.sql) holds Talon's budgets and
--     needs nothing new.
-- Everything is deleted with the account.


-- ── finder_searches: what each find was spent on ──────────────────────────────
-- A find is one brief, searched once. It stays 'running' while Talon works,
-- becomes 'done' once its listings are on the board, or 'refunded' when the
-- search failed or nothing it found could be checked or saved.
CREATE TABLE IF NOT EXISTS public.finder_searches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lane        TEXT NOT NULL CHECK (lane IN ('scholarship', 'activity')),
  status      TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'done', 'refunded')),
  -- {want, interests, state, grade, budget, travel, when, effort} and nothing else.
  brief       JSONB NOT NULL DEFAULT '{}'::jsonb
                CHECK (jsonb_typeof(brief) = 'object'
                       AND brief - ARRAY['want', 'interests', 'state', 'grade', 'budget', 'travel', 'when',
                                         'effort'] = '{}'::jsonb),
  -- [{title, reason, message}]: what the checks left out, and why. Never a
  -- 'citizenship' drop, which would record the student's answer.
  dropped     JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(dropped) = 'array'),
  found_count INT  NOT NULL DEFAULT 0 CHECK (found_count >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS finder_searches_user_idx ON public.finder_searches (user_id, created_at DESC);
ALTER TABLE public.finder_searches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users read own finder_searches" ON public.finder_searches;
CREATE POLICY "users read own finder_searches" ON public.finder_searches
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
REVOKE ALL ON public.finder_searches FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.finder_searches FROM authenticated;


-- ── finder_items: the board ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.finder_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  search_id      UUID REFERENCES public.finder_searches(id) ON DELETE SET NULL,
  lane           TEXT NOT NULL CHECK (lane IN ('scholarship', 'activity')),
  kind           TEXT NOT NULL DEFAULT 'other'
                   CHECK (kind IN ('scholarship', 'summer_program', 'competition', 'research', 'internship',
                                   'volunteering', 'other')),
  -- The student's own tracking. outcome is their answer once it is done
  -- (awarded or got in, or not this time).
  status         TEXT NOT NULL DEFAULT 'new'
                   CHECK (status IN ('new', 'saved', 'applying', 'applied', 'done', 'dismissed')),
  outcome        TEXT CHECK (outcome IS NULL OR outcome IN ('yes', 'no')),
  -- What the listing is, read from its page.
  title          TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  provider       TEXT NOT NULL DEFAULT '' CHECK (char_length(provider) <= 160),
  summary        TEXT NOT NULL DEFAULT '' CHECK (char_length(summary) <= 400),
  -- url is the listing's page; source_url the page its facts were read from
  -- (the same unless the provider's own page was also read). canonical_url is
  -- url without tracking parameters, "www." or a trailing slash, one per student.
  url            TEXT NOT NULL CHECK (char_length(url) BETWEEN 9 AND 2000 AND url ~* '^https://'),
  source_url     TEXT NOT NULL CHECK (char_length(source_url) BETWEEN 9 AND 2000 AND source_url ~* '^https://'),
  canonical_url  TEXT NOT NULL CHECK (char_length(canonical_url) BETWEEN 1 AND 2000),
  -- True only when the deadline and requirements came from the provider's own
  -- page, not from a list site.
  verified       BOOLEAN NOT NULL DEFAULT false,
  -- NULL when the page gives no date Talon could read; the page then shows
  -- "check the site", never a guess.
  deadline       DATE,
  deadline_text  TEXT NOT NULL DEFAULT '' CHECK (char_length(deadline_text) <= 120),
  deadline_kind  TEXT NOT NULL DEFAULT 'unknown' CHECK (deadline_kind IN ('date', 'rolling', 'unknown')),
  amount_text    TEXT NOT NULL DEFAULT '' CHECK (char_length(amount_text) <= 120),
  amount_usd     INT CHECK (amount_usd IS NULL OR amount_usd >= 0),
  cost_text      TEXT NOT NULL DEFAULT '' CHECK (char_length(cost_text) <= 120),
  cost_usd       INT CHECK (cost_usd IS NULL OR cost_usd >= 0),
  aid            BOOLEAN,
  dates_text     TEXT NOT NULL DEFAULT '' CHECK (char_length(dates_text) <= 120),
  location_text  TEXT NOT NULL DEFAULT '' CHECK (char_length(location_text) <= 120),
  -- Short lines, each found on the page.
  eligibility    JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(eligibility) = 'array'),
  requirements   JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(requirements) = 'array'),
  -- "You'd need to confirm" lines: a requirement the student did not state.
  confirm        JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(confirm) = 'array'),
  -- One sentence tied to a named item in their record (record_ref), or ''.
  fit_reason     TEXT NOT NULL DEFAULT '' CHECK (char_length(fit_reason) <= 300),
  record_ref     TEXT NOT NULL DEFAULT '' CHECK (char_length(record_ref) <= 160),
  -- When the page was last read, and what the last recheck found.
  checked_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  recheck_note   TEXT NOT NULL DEFAULT '' CHECK (char_length(recheck_note) <= 240),
  rechecks_used  INT NOT NULL DEFAULT 0 CHECK (rechecks_used >= 0),
  -- The student's own: notes, and which requirements (indices into
  -- requirements) they have done. Students write req_done directly, so it is
  -- held to at most 50 whole numbers from 0 to 49, nothing else.
  notes          TEXT NOT NULL DEFAULT '' CHECK (char_length(notes) <= 2000),
  req_done       JSONB NOT NULL DEFAULT '[]'::jsonb
                   CHECK (CASE WHEN jsonb_typeof(req_done) = 'array'
                               THEN jsonb_array_length(req_done) <= 50
                                    AND NOT jsonb_path_exists(req_done,
                                      'strict $[*] ? (@.type() != "number" || @ < 0 || @ >= 50 || @ != @.floor())')
                               ELSE false END),
  position       DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- A listing never appears twice on a board, dismissed ones included, so a
-- later find never brings back something the student dismissed.
CREATE UNIQUE INDEX IF NOT EXISTS finder_items_one_per_url ON public.finder_items (user_id, canonical_url);
CREATE INDEX IF NOT EXISTS finder_items_user_status_idx ON public.finder_items (user_id, status, deadline);
CREATE INDEX IF NOT EXISTS finder_items_search_idx ON public.finder_items (search_id);

ALTER TABLE public.finder_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users own finder_items" ON public.finder_items;
CREATE POLICY "users own finder_items" ON public.finder_items
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
REVOKE ALL ON public.finder_items FROM anon;
-- Column grants: students read and delete their own rows and change only their
-- own fields. They never insert: every row is a listing Talon checked.
REVOKE INSERT, UPDATE, TRUNCATE, REFERENCES, TRIGGER ON public.finder_items FROM authenticated;
GRANT SELECT, DELETE ON public.finder_items TO authenticated;
GRANT UPDATE (status, outcome, notes, req_done, position, updated_at) ON public.finder_items TO authenticated;
