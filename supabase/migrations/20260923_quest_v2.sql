-- ── Quest v2 ──────────────────────────────────────────────────────────────────
-- A daily-streak retention loop: one project at a time, split into milestones,
-- moved forward by one small task on every scheduled day.
--
-- This replaces the legacy quest_items board (suggestion cards). That table is
-- left in place until nothing reads it and is dropped in its own migration.
--
-- Students can READ their own rows and nothing else. There are deliberately no
-- insert/update/delete policies: XP, streaks and completion may only change
-- through the backend's check-in path, never through a direct table write from
-- the browser. The backend uses the service role, so every query it makes is
-- scoped by user_id in code as well.
--
-- Apply with:  supabase db query --linked -f supabase/migrations/20260923_quest_v2.sql
-- (supabase db push is broken on this project; see CLAUDE.md.)

-- ── profiles ──────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS timezone              TEXT,
  ADD COLUMN IF NOT EXISTS quest_suggestions     JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS quest_suggestions_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS quest_suggestions_key TEXT;

-- ── quests ────────────────────────────────────────────────────────────────────
-- schedule: JSONB list of segments [{"slot": 1, "date": "2026-09-23", "rest": [0, 6]}].
-- Slot k is the k-th non-rest day on or after its segment's date. A new segment
-- is appended whenever the pace changes or a pause ends, so past days never move.
CREATE TABLE IF NOT EXISTS public.quests (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title                 TEXT NOT NULL,
  summary               TEXT NOT NULL DEFAULT '',
  goal_kind             TEXT NOT NULL DEFAULT 'other'
                          CHECK (goal_kind IN ('passion_project', 'competition_prep', 'research', 'other')),
  status                TEXT NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft', 'active', 'paused', 'completed', 'retired')),
  daily_minutes         INT  NOT NULL DEFAULT 30 CHECK (daily_minutes IN (15, 30, 45)),
  rest_days             INT[] NOT NULL DEFAULT '{}'
                          CHECK (rest_days <@ ARRAY[0, 1, 2, 3, 4, 5, 6] AND cardinality(rest_days) <= 6),
  schedule              JSONB NOT NULL DEFAULT '[]'::jsonb,
  start_date            DATE,
  paused_on             DATE,
  ended_on              DATE,
  hard_deadline         DATE,
  add_to_portfolio      BOOLEAN NOT NULL DEFAULT true,
  portfolio_draft       JSONB,
  portfolio_activity_id UUID REFERENCES public.student_activities(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at            TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ
);

-- One quest at a time. A draft or a paused quest still counts as the one.
CREATE UNIQUE INDEX IF NOT EXISTS quests_one_open_per_user
  ON public.quests (user_id) WHERE status IN ('draft', 'active', 'paused');
CREATE INDEX IF NOT EXISTS quests_user_created_idx ON public.quests (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS quests_portfolio_activity_idx ON public.quests (portfolio_activity_id);

-- ── quest_milestones ──────────────────────────────────────────────────────────
-- Locked / current is derived (a milestone is open once every earlier one is
-- done), so only pending / done is stored.
CREATE TABLE IF NOT EXISTS public.quest_milestones (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quest_id      UUID NOT NULL REFERENCES public.quests(id) ON DELETE CASCADE,
  position      INT  NOT NULL CHECK (position >= 1),
  title         TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  expected_days INT  NOT NULL CHECK (expected_days BETWEEN 1 AND 60),
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done')),
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (quest_id, position)
);
CREATE INDEX IF NOT EXISTS quest_milestones_user_idx ON public.quest_milestones (user_id);

-- ── quest_tasks ───────────────────────────────────────────────────────────────
-- One row per day-slot, created only when the student opens that slot. The
-- slot's date is not stored: it is derived from quests.schedule.
CREATE TABLE IF NOT EXISTS public.quest_tasks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quest_id     UUID NOT NULL REFERENCES public.quests(id) ON DELETE CASCADE,
  milestone_id UUID NOT NULL REFERENCES public.quest_milestones(id) ON DELETE CASCADE,
  slot         INT  NOT NULL CHECK (slot >= 1),
  title        TEXT NOT NULL,
  detail       TEXT NOT NULL DEFAULT '',
  est_minutes  INT  NOT NULL DEFAULT 15 CHECK (est_minutes BETWEEN 1 AND 120),
  fallback     BOOLEAN NOT NULL DEFAULT false,
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  done_on      DATE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (quest_id, slot)          -- also what makes task generation idempotent
);
CREATE INDEX IF NOT EXISTS quest_tasks_milestone_idx ON public.quest_tasks (milestone_id, status);
CREATE INDEX IF NOT EXISTS quest_tasks_user_idx ON public.quest_tasks (user_id);

-- ── quest_checkins ────────────────────────────────────────────────────────────
-- UNIQUE (task_id): a task can be checked in once, so XP can be awarded once,
-- however many times the button is pressed or however many tabs are open.
CREATE TABLE IF NOT EXISTS public.quest_checkins (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quest_id        UUID NOT NULL REFERENCES public.quests(id) ON DELETE CASCADE,
  task_id         UUID NOT NULL UNIQUE REFERENCES public.quest_tasks(id) ON DELETE CASCADE,
  body            TEXT NOT NULL,
  advisor_reply   TEXT NOT NULL DEFAULT '',
  followup        TEXT,
  followup_answer TEXT,
  thin            BOOLEAN NOT NULL DEFAULT false,
  on_time         BOOLEAN NOT NULL DEFAULT false,
  xp_awarded      INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS quest_checkins_quest_idx ON public.quest_checkins (quest_id, created_at DESC);
CREATE INDEX IF NOT EXISTS quest_checkins_user_idx ON public.quest_checkins (user_id);

-- ── quest_stats ───────────────────────────────────────────────────────────────
-- streak / streak_date: the streak as of the last on-time check-in. Whether it
-- is still alive today is derived from the schedule by the backend, which also
-- writes 0 here before any change that could otherwise erase a missed day.
CREATE TABLE IF NOT EXISTS public.quest_stats (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  xp          INT  NOT NULL DEFAULT 0 CHECK (xp >= 0),
  streak      INT  NOT NULL DEFAULT 0 CHECK (streak >= 0),
  streak_date DATE,
  best_streak INT  NOT NULL DEFAULT 0 CHECK (best_streak >= 0),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── quest_usage ───────────────────────────────────────────────────────────────
-- AI budgets for Quest. The shared check_and_increment_usage RPC only counts
-- lifetime totals, and a daily habit needs per-day and per-month buckets.
-- bucket is the student's local date ('2026-09-23') or month ('2026-09').
CREATE TABLE IF NOT EXISTS public.quest_usage (
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  bucket     TEXT NOT NULL,
  used       INT  NOT NULL DEFAULT 0 CHECK (used >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind, bucket)
);

-- ── RLS: read your own rows, write nothing ────────────────────────────────────
ALTER TABLE public.quests           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quest_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quest_tasks      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quest_checkins   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quest_stats      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quest_usage      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read own quests" ON public.quests;
CREATE POLICY "users read own quests" ON public.quests
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "users read own quest_milestones" ON public.quest_milestones;
CREATE POLICY "users read own quest_milestones" ON public.quest_milestones
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "users read own quest_tasks" ON public.quest_tasks;
CREATE POLICY "users read own quest_tasks" ON public.quest_tasks
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "users read own quest_checkins" ON public.quest_checkins;
CREATE POLICY "users read own quest_checkins" ON public.quest_checkins
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "users read own quest_stats" ON public.quest_stats;
CREATE POLICY "users read own quest_stats" ON public.quest_stats
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "users read own quest_usage" ON public.quest_usage;
CREATE POLICY "users read own quest_usage" ON public.quest_usage
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

-- ── quest_bump_usage ──────────────────────────────────────────────────────────
-- Atomic check-and-increment for one budget bucket. Same dev bypass as
-- check_and_increment_usage.
CREATE OR REPLACE FUNCTION public.quest_bump_usage(
  p_user_id UUID,
  p_kind    TEXT,
  p_bucket  TEXT,
  p_limit   INT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_used     INT;
  v_email    TEXT;
  dev_emails TEXT[] := ARRAY['app.mentora.ai@gmail.com', 'kwu.1600@gmail.com'];
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;
  IF v_email = ANY(dev_emails) THEN
    RETURN jsonb_build_object('allowed', true, 'used', 0, 'limit', p_limit);
  END IF;

  INSERT INTO public.quest_usage (user_id, kind, bucket)
  VALUES (p_user_id, p_kind, p_bucket)
  ON CONFLICT (user_id, kind, bucket) DO NOTHING;

  SELECT used INTO v_used FROM public.quest_usage
  WHERE user_id = p_user_id AND kind = p_kind AND bucket = p_bucket
  FOR UPDATE;

  IF v_used >= p_limit THEN
    RETURN jsonb_build_object('allowed', false, 'used', v_used, 'limit', p_limit);
  END IF;

  UPDATE public.quest_usage SET used = used + 1, updated_at = now()
  WHERE user_id = p_user_id AND kind = p_kind AND bucket = p_bucket;

  RETURN jsonb_build_object('allowed', true, 'used', v_used + 1, 'limit', p_limit);
END;
$$;

-- Give a unit back when the work it paid for failed, so a model outage does
-- not cost the student one of their three monthly quest plans.
CREATE OR REPLACE FUNCTION public.quest_refund_usage(
  p_user_id UUID,
  p_kind    TEXT,
  p_bucket  TEXT
) RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.quest_usage SET used = GREATEST(used - 1, 0), updated_at = now()
  WHERE user_id = p_user_id AND kind = p_kind AND bucket = p_bucket;
$$;

-- ── quest_complete_task ───────────────────────────────────────────────────────
-- Everything a check-in changes, in one transaction: the check-in row, the
-- task, milestone and quest completion, XP and the streak. The XP amounts are
-- passed in so app/nodes/quest/xp.py stays their single source of truth.
--
-- The backend decides on_time and whether the streak is still alive (both need
-- the schedule); this function only applies them. A second call for the same
-- task returns the first result instead of awarding anything again.
CREATE OR REPLACE FUNCTION public.quest_complete_task(
  p_user_id       UUID,
  p_task_id       UUID,
  p_body          TEXT,
  p_thin          BOOLEAN,
  p_today         DATE,
  p_on_time       BOOLEAN,
  p_streak_alive  BOOLEAN,
  p_task_xp       INT,
  p_milestone_xp  INT,
  p_quest_xp      INT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_task          public.quest_tasks%ROWTYPE;
  v_stats         public.quest_stats%ROWTYPE;
  v_checkin_id    UUID;
  v_xp            INT := p_task_xp;
  v_ms_days       INT;
  v_ms_pos        INT;
  v_ms_done       INT;
  v_ms_completed  BOOLEAN := false;
  v_q_completed   BOOLEAN := false;
  v_remaining     INT;
  v_new_streak    INT;
  v_new_date      DATE;
BEGIN
  SELECT * INTO v_task FROM public.quest_tasks
  WHERE id = p_task_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_task.status = 'done' THEN
    RETURN jsonb_build_object(
      'ok', true, 'already', true,
      'checkin_id', (SELECT id FROM public.quest_checkins WHERE task_id = v_task.id));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.quests
                 WHERE id = v_task.quest_id AND user_id = p_user_id AND status = 'active') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_active');
  END IF;

  INSERT INTO public.quest_checkins (user_id, quest_id, task_id, body, thin, on_time)
  VALUES (p_user_id, v_task.quest_id, v_task.id, p_body, p_thin, p_on_time)
  RETURNING id INTO v_checkin_id;

  UPDATE public.quest_tasks
  SET status = 'done', done_on = p_today, updated_at = now()
  WHERE id = v_task.id;

  -- Milestone: done once it has as many finished tasks as scheduled days.
  SELECT expected_days, position INTO v_ms_days, v_ms_pos
  FROM public.quest_milestones WHERE id = v_task.milestone_id;

  SELECT count(*) INTO v_ms_done FROM public.quest_tasks
  WHERE milestone_id = v_task.milestone_id AND status = 'done';

  IF v_ms_done >= v_ms_days THEN
    UPDATE public.quest_milestones
    SET status = 'done', completed_at = now(), updated_at = now()
    WHERE id = v_task.milestone_id AND status <> 'done';
    IF FOUND THEN
      v_ms_completed := true;
      v_xp := v_xp + p_milestone_xp;
    END IF;
  END IF;

  -- Quest: done once every milestone is.
  IF v_ms_completed THEN
    SELECT count(*) INTO v_remaining FROM public.quest_milestones
    WHERE quest_id = v_task.quest_id AND status <> 'done';
    IF v_remaining = 0 THEN
      UPDATE public.quests
      SET status = 'completed', completed_at = now(), ended_on = p_today, updated_at = now()
      WHERE id = v_task.quest_id AND status = 'active';
      IF FOUND THEN
        v_q_completed := true;
        v_xp := v_xp + p_quest_xp;
      END IF;
    END IF;
  END IF;

  -- XP and streak. Only an on-time check-in moves the streak, and only once a day.
  INSERT INTO public.quest_stats (user_id) VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_stats FROM public.quest_stats WHERE user_id = p_user_id FOR UPDATE;

  v_new_streak := v_stats.streak;
  v_new_date   := v_stats.streak_date;
  IF p_on_time AND (v_stats.streak_date IS NULL OR v_stats.streak_date < p_today) THEN
    v_new_streak := CASE WHEN p_streak_alive THEN v_stats.streak + 1 ELSE 1 END;
    v_new_date   := p_today;
  END IF;

  UPDATE public.quest_stats
  SET xp          = xp + v_xp,
      streak      = v_new_streak,
      streak_date = v_new_date,
      best_streak = GREATEST(best_streak, v_new_streak),
      updated_at  = now()
  WHERE user_id = p_user_id
  RETURNING * INTO v_stats;

  UPDATE public.quest_checkins SET xp_awarded = v_xp WHERE id = v_checkin_id;

  RETURN jsonb_build_object(
    'ok',                  true,
    'already',             false,
    'checkin_id',          v_checkin_id,
    'xp_gained',           v_xp,
    'xp',                  v_stats.xp,
    'streak',              v_stats.streak,
    'best_streak',         v_stats.best_streak,
    'milestone_completed', CASE WHEN v_ms_completed THEN v_ms_pos END,
    'quest_completed',     v_q_completed
  );
END;
$$;

-- ── quest_answer_followup ─────────────────────────────────────────────────────
-- The optional follow-up on a thin check-in. Pays its bonus exactly once.
CREATE OR REPLACE FUNCTION public.quest_answer_followup(
  p_user_id    UUID,
  p_checkin_id UUID,
  p_answer     TEXT,
  p_bonus_xp   INT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_xp INT;
BEGIN
  UPDATE public.quest_checkins
  SET followup_answer = p_answer, xp_awarded = xp_awarded + p_bonus_xp
  WHERE id = p_checkin_id AND user_id = p_user_id
    AND followup IS NOT NULL AND followup_answer IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  INSERT INTO public.quest_stats (user_id) VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.quest_stats SET xp = xp + p_bonus_xp, updated_at = now()
  WHERE user_id = p_user_id
  RETURNING xp INTO v_xp;

  RETURN jsonb_build_object('ok', true, 'xp_gained', p_bonus_xp, 'xp', v_xp);
END;
$$;

-- ── Lock the functions down ───────────────────────────────────────────────────
-- Each one trusts the p_user_id it is given, so only the backend may call them.
-- Without this, any signed-in student could call them through the REST API
-- with someone else's id (or their own, with made-up XP).
REVOKE ALL ON FUNCTION public.quest_bump_usage(UUID, TEXT, TEXT, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.quest_refund_usage(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.quest_complete_task(UUID, UUID, TEXT, BOOLEAN, DATE, BOOLEAN, BOOLEAN, INT, INT, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.quest_answer_followup(UUID, UUID, TEXT, INT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.quest_bump_usage(UUID, TEXT, TEXT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.quest_refund_usage(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.quest_complete_task(UUID, UUID, TEXT, BOOLEAN, DATE, BOOLEAN, BOOLEAN, INT, INT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.quest_answer_followup(UUID, UUID, TEXT, INT) TO service_role;
