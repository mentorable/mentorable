-- The counselor dashboard: a school counselor sets up a school and gets a join
-- code; a student who enters it links to that school, chooses what to share,
-- and can ask for a meeting. The counselor sees a caseload, a schedule and each
-- student's shared record. Students are minors, so this file is the guard, and
-- the only one: there is no other path to any of this.
--
-- Who can do what:
--   * Nobody reads or writes the six tables below directly, student or
--     counselor: row level security is on, there are no policies, and anon and
--     authenticated have no grants. The browser reaches them only through the
--     functions in this file.
--   * A counselor reads through counselor_caseload, counselor_student and
--     counselor_requests. Each one reads auth.uid() itself (it never takes a
--     counselor id from the caller), finds the caller's own school, and returns
--     a student only while that student is linked to that school. A section of
--     the record (College List, Portfolio, Quest, Essay progress) comes back
--     only while the student's switch for it is on, and is null otherwise.
--     Always visible once linked: name, grade, graduation year, and the meeting
--     requests the student sent.
--   * Never returned by any function, whatever the switches say: chat, long-term
--     memories, an essay's title, school, prompt or text, Quill's notes and
--     reviews, brainstorm answers, what a student wrote in a Quest check-in (or
--     a task, or the advisor's replies), Beaker's and Talon's boards.
--   * A student joins with the code (join_school), flips the four switches
--     (set_sharing), asks for a meeting (request_meeting, cancel_request) and
--     leaves (leave_school). Leaving deletes the link and every request they
--     sent, at once.
--   * The demo school (schools.is_demo, made by supabase/seed/) takes no real
--     student: its counselor login is shared with judges, so join_school
--     answers its code like a wrong one for every account the owner has not
--     flagged profiles.is_demo, a flag nobody can set on themselves.
--   * The three digest functions are the backend's (service role only): they
--     tell the daily email job which counselors have new requests waiting.
--
-- Every function is SECURITY DEFINER with an empty search_path and fully
-- qualified names, so nothing a caller creates can stand in for a table or a
-- function here. A refusal is an exception whose whole message is a short code
-- (not_linked, bad_code, ...), which the page turns into words. One exception:
-- join_school answers a wrong code without raising (see there for why).
--
-- Apply with:  supabase db query --linked -f supabase/migrations/20261012_counselor.sql
-- Then run:    supabase db query --linked -f supabase/tests/counselor_guard.sql
-- (it rolls itself back, and its last row says how many checks passed).
-- The daily email also needs a shared secret set in two places, by hand: see
-- "The daily email job" at the end of this file. Without it nothing is sent.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;


-- ── profiles.is_demo ──────────────────────────────────────────────────────────
-- Marks the made-up students of the demo school (supabase/seed/), so usage
-- numbers can leave them out and the cleanup script can find them.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;

-- Students can update their own profile row, and a column cannot be carved out
-- of a table-wide grant. So the flag is held by a trigger: only the backend and
-- SQL run by the owner can set it. From the browser it stays as it was.
CREATE OR REPLACE FUNCTION public.profiles_keep_is_demo() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.is_demo := false;
    ELSE
      NEW.is_demo := OLD.is_demo;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.profiles_keep_is_demo() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_keep_is_demo ON public.profiles;
CREATE TRIGGER profiles_keep_is_demo
  BEFORE INSERT OR UPDATE OF is_demo ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_keep_is_demo();


-- ── schools ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.schools (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  -- 8 characters with no look-alikes (no I, L or O, no 0 or 1). The counselor
  -- can replace it; students already linked stay linked.
  join_code   TEXT NOT NULL UNIQUE CHECK (join_code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$'),
  is_demo     BOOLEAN NOT NULL DEFAULT false,
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS schools_created_by_idx ON public.schools (created_by);

-- ── counselors: one row makes an ordinary account a counselor of one school ───
CREATE TABLE IF NOT EXISTS public.counselors (
  user_id       UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id     UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  -- The name students see ("Ms. Rivera").
  display_name  TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 80),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS counselors_school_idx ON public.counselors (school_id);

-- ── school_links: a student's link to one school, and what they share ─────────
-- One school per student (the primary key). Every switch starts off.
CREATE TABLE IF NOT EXISTS public.school_links (
  student_id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id           UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  share_college_list  BOOLEAN NOT NULL DEFAULT false,
  share_portfolio     BOOLEAN NOT NULL DEFAULT false,
  share_quest         BOOLEAN NOT NULL DEFAULT false,
  share_essays        BOOLEAN NOT NULL DEFAULT false,
  linked_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- So a meeting request can point at the link itself (below).
  UNIQUE (student_id, school_id)
);
CREATE INDEX IF NOT EXISTS school_links_school_idx ON public.school_links (school_id);

-- ── meeting_requests ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.meeting_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id       UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  message         TEXT NOT NULL CHECK (char_length(message) BETWEEN 1 AND 300),
  -- 1 to 3 times that suit the student, as ISO timestamps.
  times           JSONB NOT NULL
                    CHECK (CASE WHEN jsonb_typeof(times) = 'array'
                                THEN jsonb_array_length(times) BETWEEN 1 AND 3
                                     AND NOT jsonb_path_exists(times, 'strict $[*] ? (@.type() != "string")')
                                ELSE false END),
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'confirmed', 'declined', 'cancelled')),
  -- Set exactly while the request is confirmed, so a calendar can trust it.
  meeting_at      TIMESTAMPTZ,
  counselor_note  TEXT NOT NULL DEFAULT '' CHECK (char_length(counselor_note) <= 300),
  answered_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((status = 'confirmed') = (meeting_at IS NOT NULL)),
  -- A request exists only while its student is linked to that school. When the
  -- link goes (the student leaves, is removed, or deletes their account), the
  -- database deletes their requests with it, whatever code path removed it.
  FOREIGN KEY (student_id, school_id)
    REFERENCES public.school_links (student_id, school_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS meeting_requests_school_idx ON public.meeting_requests (school_id, status, created_at);
CREATE INDEX IF NOT EXISTS meeting_requests_student_idx ON public.meeting_requests (student_id, school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS meeting_requests_answered_by_idx ON public.meeting_requests (answered_by)
  WHERE answered_by IS NOT NULL;

-- ── counselor_digests: the email job's ledger, one row per counselor per day ──
CREATE TABLE IF NOT EXISTS public.counselor_digests (
  counselor_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day           DATE NOT NULL,
  count         INT  NOT NULL CHECK (count >= 0),
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (counselor_id, day)
);

-- ── join_attempts: every try at a join code, for the hourly limit ─────────────
CREATE TABLE IF NOT EXISTS public.join_attempts (
  user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS join_attempts_user_at_idx ON public.join_attempts (user_id, at);

-- ── No direct access for anyone signed in or out ──────────────────────────────
-- RLS on with no policy denies every row; the revokes make the grants say the
-- same, so a direct query is refused outright instead of returning nothing.
ALTER TABLE public.schools           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.counselors        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_links      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_requests  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.counselor_digests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.join_attempts     ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.schools           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.counselors        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.school_links      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.meeting_requests  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.counselor_digests FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.join_attempts     FROM PUBLIC, anon, authenticated;


-- ── counselor_new_join_code (internal) ────────────────────────────────────────
-- A fresh code that no school has. The randomness is pgcrypto's
-- gen_random_bytes, the operating system's secure source, not random(). A byte
-- is used only when it is under 248 (8 x 31): mapping all 256 values onto 31
-- letters would make the first eight letters a little likelier than the rest.
-- Callers still handle the unique index refusing a code another school took in
-- the same instant. Nobody can call this through the API.
CREATE OR REPLACE FUNCTION public.counselor_new_join_code() RETURNS TEXT
LANGUAGE plpgsql VOLATILE
SET search_path = ''
AS $$
DECLARE
  k_alphabet CONSTANT TEXT := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_bytes BYTEA;
  v_byte  INT;
  v_code  TEXT;
BEGIN
  LOOP
    v_code := '';
    WHILE char_length(v_code) < 8 LOOP
      v_bytes := extensions.gen_random_bytes(16);
      FOR i IN 0..15 LOOP
        v_byte := get_byte(v_bytes, i);
        IF v_byte < 248 AND char_length(v_code) < 8 THEN
          v_code := v_code || substr(k_alphabet, (v_byte % 31) + 1, 1);
        END IF;
      END LOOP;
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.schools s WHERE s.join_code = v_code);
  END LOOP;
  RETURN v_code;
END;
$$;


-- ══ Counselor side ════════════════════════════════════════════════════════════

-- ── counselor_me ──────────────────────────────────────────────────────────────
-- Who the caller is as a counselor, or null when they have set up no school.
CREATE OR REPLACE FUNCTION public.counselor_me() RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_out JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_signed_in' USING ERRCODE = 'P0001';
  END IF;

  SELECT jsonb_build_object(
           'counselor', jsonb_build_object('display_name', c.display_name),
           'school', jsonb_build_object(
             'id', s.id,
             'name', s.name,
             'join_code', s.join_code,
             'is_demo', s.is_demo,
             'student_count', (SELECT count(*) FROM public.school_links l WHERE l.school_id = s.id)))
    INTO v_out
    FROM public.counselors c
    JOIN public.schools s ON s.id = c.school_id
   WHERE c.user_id = v_uid;

  RETURN v_out;   -- null when there is no counselors row
END;
$$;


-- ── create_school ─────────────────────────────────────────────────────────────
-- An account sets up one school and becomes its counselor.
CREATE OR REPLACE FUNCTION public.create_school(p_name TEXT, p_display_name TEXT) RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_name    TEXT := btrim(regexp_replace(left(coalesce(p_name, ''), 400), '\s+', ' ', 'g'));
  v_display TEXT := btrim(regexp_replace(left(coalesce(p_display_name, ''), 400), '\s+', ' ', 'g'));
  v_school  UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_signed_in' USING ERRCODE = 'P0001';
  END IF;
  IF char_length(v_name) NOT BETWEEN 2 AND 120 THEN
    RAISE EXCEPTION 'bad_name' USING ERRCODE = 'P0001';
  END IF;
  IF char_length(v_display) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'bad_display_name' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.counselors c WHERE c.user_id = v_uid) THEN
    RAISE EXCEPTION 'already_counselor' USING ERRCODE = 'P0001';
  END IF;

  -- The code is drawn until the unique index accepts it.
  FOR i IN 1..5 LOOP
    BEGIN
      INSERT INTO public.schools (name, join_code, created_by)
      VALUES (v_name, public.counselor_new_join_code(), v_uid)
      RETURNING id INTO v_school;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      v_school := NULL;
    END;
  END LOOP;
  IF v_school IS NULL THEN
    RAISE EXCEPTION 'try_again' USING ERRCODE = 'P0001';
  END IF;

  BEGIN
    INSERT INTO public.counselors (user_id, school_id, display_name)
    VALUES (v_uid, v_school, v_display);
  EXCEPTION WHEN unique_violation THEN
    -- Two tabs at once: the other one won, and this school is undone with it.
    RAISE EXCEPTION 'already_counselor' USING ERRCODE = 'P0001';
  END;

  RETURN public.counselor_me();
END;
$$;


-- ── rotate_join_code ──────────────────────────────────────────────────────────
-- A new code for the caller's school. The old one stops working at once;
-- nobody already linked is touched.
CREATE OR REPLACE FUNCTION public.rotate_join_code() RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_school UUID;
  v_code   TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_signed_in' USING ERRCODE = 'P0001';
  END IF;
  SELECT c.school_id INTO v_school FROM public.counselors c WHERE c.user_id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_counselor' USING ERRCODE = 'P0001';
  END IF;

  FOR i IN 1..5 LOOP
    BEGIN
      UPDATE public.schools s
         SET join_code = public.counselor_new_join_code()
       WHERE s.id = v_school
      RETURNING s.join_code INTO v_code;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      v_code := NULL;
    END;
  END LOOP;
  IF v_code IS NULL THEN
    RAISE EXCEPTION 'try_again' USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object('join_code', v_code);
END;
$$;


-- ── counselor_caseload ────────────────────────────────────────────────────────
-- One element per student linked to the caller's school, by name. Each of the
-- four sections sits behind its own switch: with the switch off the CASE gives
-- null and the query under it is never run for that student. The caseload
-- carries counts and stages only; the record itself is counselor_student's.
CREATE OR REPLACE FUNCTION public.counselor_caseload() RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_school UUID;
  v_out    JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_signed_in' USING ERRCODE = 'P0001';
  END IF;
  SELECT c.school_id INTO v_school FROM public.counselors c WHERE c.user_id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_counselor' USING ERRCODE = 'P0001';
  END IF;

  SELECT coalesce(jsonb_agg(t.entry ORDER BY t.sort_name, t.student_id), '[]'::jsonb)
    INTO v_out
    FROM (
      SELECT l.student_id,
             lower(coalesce(nullif(btrim(p.full_name), ''), 'Student')) AS sort_name,
             jsonb_build_object(
               'student_id', l.student_id,
               'name', coalesce(nullif(btrim(p.full_name), ''), 'Student'),
               'grade', p.grade_level,
               'graduation_year', p.graduation_year,
               'linked_at', l.linked_at,
               'is_demo', coalesce(p.is_demo, false),
               'sharing', jsonb_build_object(
                 'college_list', l.share_college_list,
                 'portfolio', l.share_portfolio,
                 'quest', l.share_quest,
                 'essays', l.share_essays),

               'college_list', CASE WHEN l.share_college_list THEN (
                 SELECT jsonb_build_object(
                          'reach',  count(*) FILTER (WHERE i.category = 'reach'),
                          'target', count(*) FILTER (WHERE i.category = 'target'),
                          'likely', count(*) FILTER (WHERE i.category = 'likely'),
                          'total',  count(*))
                   FROM public.college_list_items i
                  WHERE i.user_id = l.student_id) END,

               'portfolio', CASE WHEN l.share_portfolio THEN jsonb_build_object(
                 'activities', (SELECT count(*) FROM public.student_activities a WHERE a.user_id = l.student_id),
                 'awards',     (SELECT count(*) FROM public.student_awards w WHERE w.user_id = l.student_id),
                 'courses',    (SELECT count(*) FROM public.student_courses k WHERE k.user_id = l.student_id),
                 'has_gpa',    coalesce(p.gpa_unweighted IS NOT NULL OR p.gpa_weighted IS NOT NULL, false)) END,

               -- The newest quest that is under way, paused or finished. Never a
               -- draft, a retired one, a task or a word of a check-in.
               'quest', CASE WHEN l.share_quest THEN coalesce((
                 SELECT jsonb_build_object(
                          'status', q.status,
                          'title', q.title,
                          'started_at', q.started_at,
                          'streak', coalesce((
                            SELECT CASE WHEN st.streak_date >= current_date - 1 THEN st.streak ELSE 0 END
                              FROM public.quest_stats st WHERE st.user_id = l.student_id), 0),
                          'milestones_done', (
                            SELECT count(*) FROM public.quest_milestones m
                             WHERE m.quest_id = q.id AND m.user_id = l.student_id AND m.status = 'done'),
                          'milestones_total', (
                            SELECT count(*) FROM public.quest_milestones m
                             WHERE m.quest_id = q.id AND m.user_id = l.student_id),
                          'last_checkin_at', (
                            SELECT max(ch.created_at) FROM public.quest_checkins ch
                             WHERE ch.quest_id = q.id AND ch.user_id = l.student_id))
                   FROM public.quests q
                  WHERE q.user_id = l.student_id AND q.status IN ('active', 'paused', 'completed')
                  ORDER BY q.created_at DESC, q.id DESC
                  LIMIT 1),
                 jsonb_build_object('status', 'none', 'title', NULL, 'started_at', NULL, 'streak', NULL,
                                    'milestones_done', NULL, 'milestones_total', NULL, 'last_checkin_at', NULL)) END,

               -- How far along, and nothing else: no title, school, prompt or text.
               'essays', CASE WHEN l.share_essays THEN jsonb_build_object(
                 'personal_statement', (
                   SELECT jsonb_build_object('status', e.status, 'word_count', e.word_count)
                     FROM public.essays e
                    WHERE e.user_id = l.student_id AND e.kind = 'personal_statement'
                    ORDER BY e.updated_at DESC, e.id DESC
                    LIMIT 1),
                 'supplements', (
                   SELECT count(*) FROM public.essays e
                    WHERE e.user_id = l.student_id AND e.kind = 'supplement'),
                 'supplements_done', (
                   SELECT count(*) FROM public.essays e
                    WHERE e.user_id = l.student_id AND e.kind = 'supplement' AND e.status = 'done')) END,

               'pending_requests', (
                 SELECT count(*) FROM public.meeting_requests r
                  WHERE r.student_id = l.student_id AND r.school_id = l.school_id AND r.status = 'pending'),
               'next_meeting_at', (
                 SELECT min(r.meeting_at) FROM public.meeting_requests r
                  WHERE r.student_id = l.student_id AND r.school_id = l.school_id
                    AND r.status = 'confirmed' AND r.meeting_at >= now())
             ) AS entry
        FROM public.school_links l
        LEFT JOIN public.profiles p ON p.id = l.student_id
       WHERE l.school_id = v_school
    ) t;

  RETURN v_out;
END;
$$;


-- ── counselor_student ─────────────────────────────────────────────────────────
-- One student's shared record. The link is checked before anything of the
-- student's is read, and the answer is not_linked whether that id belongs to
-- nobody, to a student of another school, or to one who has left: a counselor
-- cannot use it to find out which accounts exist. Each section is read only
-- inside the IF for its switch. STABLE, so every read in one call sees the same
-- moment: a switch flipped mid-call cannot leave half an answer.
CREATE OR REPLACE FUNCTION public.counselor_student(p_student UUID) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid        UUID := auth.uid();
  v_school     UUID;
  v_link       public.school_links%ROWTYPE;
  v_student    JSONB;
  v_portfolio  JSONB;
  v_college    JSONB;
  v_quest      JSONB;
  v_essays     JSONB;
  v_requests   JSONB;
  v_quest_id   UUID;
  v_streak     INT;
  v_best       INT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_signed_in' USING ERRCODE = 'P0001';
  END IF;
  SELECT c.school_id INTO v_school FROM public.counselors c WHERE c.user_id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_counselor' USING ERRCODE = 'P0001';
  END IF;

  SELECT l.* INTO v_link
    FROM public.school_links l
   WHERE l.student_id = p_student AND l.school_id = v_school;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_linked' USING ERRCODE = 'P0001';
  END IF;

  -- Always shared once linked: name, grade, graduation year.
  SELECT jsonb_build_object(
           'id', v_link.student_id,
           'name', coalesce(nullif(btrim(p.full_name), ''), 'Student'),
           'grade', p.grade_level,
           'graduation_year', p.graduation_year,
           'linked_at', v_link.linked_at)
    INTO v_student
    FROM (SELECT 1) one
    LEFT JOIN public.profiles p ON p.id = v_link.student_id;

  IF v_link.share_portfolio THEN
    SELECT jsonb_build_object(
             'gpa_unweighted', p.gpa_unweighted,
             'gpa_weighted', p.gpa_weighted,
             'gpa_scale', p.gpa_scale,
             'majors', CASE WHEN jsonb_typeof(p.candidate_majors) = 'array' THEN p.candidate_majors
                            ELSE '[]'::jsonb END,
             'test_scores', coalesce((
               SELECT jsonb_agg(jsonb_build_object(
                        'test_type', t.test_type, 'score', t.score, 'subject', t.subject, 'test_date', t.test_date)
                        ORDER BY t.test_type, t.subject NULLS FIRST, t.test_date DESC NULLS LAST, t.attempt DESC, t.id)
                 FROM public.student_test_scores t WHERE t.user_id = v_link.student_id), '[]'::jsonb),
             'courses', coalesce((
               SELECT jsonb_agg(jsonb_build_object(
                        'name', k.name, 'level', k.level, 'grade_level', k.grade_level, 'planned', k.planned)
                        ORDER BY k.order_index, k.created_at, k.id)
                 FROM public.student_courses k WHERE k.user_id = v_link.student_id), '[]'::jsonb),
             'activities', coalesce((
               SELECT jsonb_agg(jsonb_build_object(
                        'title', a.title, 'position', a.position, 'organization', a.organization,
                        'category', a.category, 'description', a.description, 'grade_levels', a.grade_levels,
                        'hours_per_week', a.hours_per_week, 'weeks_per_year', a.weeks_per_year)
                        ORDER BY a.order_index, a.created_at, a.id)
                 FROM public.student_activities a WHERE a.user_id = v_link.student_id), '[]'::jsonb),
             'awards', coalesce((
               SELECT jsonb_agg(jsonb_build_object(
                        'title', w.title, 'level', w.level, 'grade_level', w.grade_level, 'year', w.year,
                        'description', w.description)
                        ORDER BY w.order_index, w.created_at, w.id)
                 FROM public.student_awards w WHERE w.user_id = v_link.student_id), '[]'::jsonb))
      INTO v_portfolio
      FROM (SELECT 1) one
      LEFT JOIN public.profiles p ON p.id = v_link.student_id;
  END IF;

  IF v_link.share_college_list THEN
    SELECT jsonb_build_object('schools', coalesce(jsonb_agg(jsonb_build_object(
             'name', i.name, 'city', i.city, 'state', i.state, 'category', i.category,
             'category_source', i.category_source, 'admission_rate', i.admission_rate, 'net_price', i.net_price)
             ORDER BY CASE i.category WHEN 'reach' THEN 1 WHEN 'target' THEN 2 ELSE 3 END, lower(i.name), i.id),
           '[]'::jsonb))
      INTO v_college
      FROM public.college_list_items i
     WHERE i.user_id = v_link.student_id;
  END IF;

  IF v_link.share_quest THEN
    SELECT CASE WHEN st.streak_date >= current_date - 1 THEN st.streak ELSE 0 END, st.best_streak
      INTO v_streak, v_best
      FROM public.quest_stats st WHERE st.user_id = v_link.student_id;

    -- The newest quest that is under way, paused or finished (as in the caseload).
    SELECT q.id INTO v_quest_id
      FROM public.quests q
     WHERE q.user_id = v_link.student_id AND q.status IN ('active', 'paused', 'completed')
     ORDER BY q.created_at DESC, q.id DESC
     LIMIT 1;

    IF v_quest_id IS NULL THEN
      v_quest := jsonb_build_object(
        'status', 'none', 'title', NULL, 'summary', NULL, 'started_at', NULL,
        'streak', coalesce(v_streak, 0), 'best_streak', coalesce(v_best, 0),
        'checkins', 0, 'last_checkin_at', NULL, 'milestones', '[]'::jsonb);
    ELSE
      -- Check-ins are counted and dated, never read: no body, no reply, no task.
      SELECT jsonb_build_object(
               'status', q.status,
               'title', q.title,
               'summary', q.summary,
               'started_at', q.started_at,
               'streak', coalesce(v_streak, 0),
               'best_streak', coalesce(v_best, 0),
               'checkins', (
                 SELECT count(*) FROM public.quest_checkins ch
                  WHERE ch.quest_id = q.id AND ch.user_id = v_link.student_id),
               'last_checkin_at', (
                 SELECT max(ch.created_at) FROM public.quest_checkins ch
                  WHERE ch.quest_id = q.id AND ch.user_id = v_link.student_id),
               'milestones', coalesce((
                 SELECT jsonb_agg(jsonb_build_object('position', m.position, 'title', m.title, 'status', m.status)
                          ORDER BY m.position)
                   FROM public.quest_milestones m
                  WHERE m.quest_id = q.id AND m.user_id = v_link.student_id), '[]'::jsonb))
        INTO v_quest
        FROM public.quests q
       WHERE q.id = v_quest_id AND q.user_id = v_link.student_id;
    END IF;
  END IF;

  IF v_link.share_essays THEN
    -- Five facts an essay: no title, school, prompt or text is selected at all.
    SELECT jsonb_build_object('essays', coalesce(jsonb_agg(jsonb_build_object(
             'kind', e.kind, 'status', e.status, 'word_count', e.word_count, 'word_limit', e.word_limit,
             'updated_at', e.updated_at)
             ORDER BY CASE e.kind WHEN 'personal_statement' THEN 1 ELSE 2 END, e.updated_at DESC, e.id),
           '[]'::jsonb))
      INTO v_essays
      FROM public.essays e
     WHERE e.user_id = v_link.student_id;
  END IF;

  -- What the student sent this counselor's school, whatever the switches say.
  SELECT coalesce(jsonb_agg(x.entry ORDER BY x.created_at DESC, x.id), '[]'::jsonb)
    INTO v_requests
    FROM (
      SELECT r.id, r.created_at,
             jsonb_build_object(
               'id', r.id, 'message', r.message, 'times', r.times, 'status', r.status,
               'meeting_at', r.meeting_at, 'counselor_note', r.counselor_note, 'created_at', r.created_at) AS entry
        FROM public.meeting_requests r
       WHERE r.student_id = v_link.student_id AND r.school_id = v_school
       ORDER BY r.created_at DESC, r.id
       LIMIT 20
    ) x;

  RETURN jsonb_build_object(
    'student', v_student,
    'sharing', jsonb_build_object(
      'college_list', v_link.share_college_list,
      'portfolio', v_link.share_portfolio,
      'quest', v_link.share_quest,
      'essays', v_link.share_essays),
    'portfolio', v_portfolio,
    'college_list', v_college,
    'quest', v_quest,
    'essays', v_essays,
    'requests', v_requests);
END;
$$;


-- ── counselor_requests ────────────────────────────────────────────────────────
-- The schedule: requests waiting (oldest first), then confirmed meetings from
-- the last 30 days onwards by time, then ones declined or cancelled in the last
-- 14 days. Only requests of students still linked to the caller's school.
--
-- The closed ones are the newest 50 and no more. Waiting and confirmed requests
-- are bounded by what a student can hold open and a counselor can confirm;
-- closed ones pile up, and a cancelled meeting has to stay visible (a counselor
-- needs to see that a student called one off), so the list is cut, not hidden.
CREATE OR REPLACE FUNCTION public.counselor_requests() RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_school UUID;
  v_out    JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_signed_in' USING ERRCODE = 'P0001';
  END IF;
  SELECT c.school_id INTO v_school FROM public.counselors c WHERE c.user_id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_counselor' USING ERRCODE = 'P0001';
  END IF;

  SELECT coalesce(jsonb_agg(x.entry ORDER BY x.rank, x.sort_up NULLS LAST, x.sort_down DESC NULLS LAST, x.id),
                  '[]'::jsonb)
    INTO v_out
    FROM (
      SELECT r.id,
             CASE r.status WHEN 'pending' THEN 0 WHEN 'confirmed' THEN 1 ELSE 2 END AS rank,
             CASE r.status WHEN 'pending' THEN r.created_at WHEN 'confirmed' THEN r.meeting_at END AS sort_up,
             CASE WHEN r.status IN ('declined', 'cancelled') THEN r.updated_at END AS sort_down,
             jsonb_build_object(
               'id', r.id,
               'student_id', r.student_id,
               'student_name', coalesce(nullif(btrim(p.full_name), ''), 'Student'),
               'grade', p.grade_level,
               'message', r.message,
               'times', r.times,
               'status', r.status,
               'meeting_at', r.meeting_at,
               'counselor_note', r.counselor_note,
               'created_at', r.created_at,
               'shares_portfolio', l.share_portfolio) AS entry
        FROM public.meeting_requests r
        JOIN public.school_links l ON l.student_id = r.student_id AND l.school_id = r.school_id
        LEFT JOIN public.profiles p ON p.id = r.student_id
       WHERE r.school_id = v_school
         AND (r.status = 'pending'
              OR (r.status = 'confirmed' AND r.meeting_at >= now() - interval '30 days')
              OR r.id IN (SELECT closed.id
                            FROM public.meeting_requests closed
                           WHERE closed.school_id = v_school
                             AND closed.status IN ('declined', 'cancelled')
                             AND closed.updated_at >= now() - interval '14 days'
                           ORDER BY closed.updated_at DESC, closed.id
                           LIMIT 50))
    ) x;

  RETURN v_out;
END;
$$;


-- ── answer_request ────────────────────────────────────────────────────────────
-- Confirm a time (one the student offered or another) or decline, with a short
-- note the student reads. A confirmed request can be answered again, to move
-- the time or to decline after all. The answer is no_request whether the id is
-- nobody's or another school's.
CREATE OR REPLACE FUNCTION public.answer_request(
  p_id UUID, p_action TEXT, p_time TIMESTAMPTZ DEFAULT NULL, p_note TEXT DEFAULT ''
) RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_school UUID;
  v_status TEXT;
  v_note   TEXT := left(btrim(coalesce(p_note, '')), 300);
  v_out    JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_signed_in' USING ERRCODE = 'P0001';
  END IF;
  SELECT c.school_id INTO v_school FROM public.counselors c WHERE c.user_id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_counselor' USING ERRCODE = 'P0001';
  END IF;

  SELECT r.status INTO v_status
    FROM public.meeting_requests r
   WHERE r.id = p_id AND r.school_id = v_school
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no_request' USING ERRCODE = 'P0001';
  END IF;

  IF p_action IS NULL OR p_action NOT IN ('confirm', 'decline') THEN
    RAISE EXCEPTION 'bad_action' USING ERRCODE = 'P0001';
  END IF;
  IF v_status NOT IN ('pending', 'confirmed') THEN
    RAISE EXCEPTION 'already_closed' USING ERRCODE = 'P0001';
  END IF;

  IF p_action = 'confirm' THEN
    IF p_time IS NULL OR p_time <= now() OR p_time > now() + interval '120 days' THEN
      RAISE EXCEPTION 'bad_time' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.meeting_requests r
       SET status = 'confirmed', meeting_at = p_time, counselor_note = v_note,
           answered_by = v_uid, updated_at = now()
     WHERE r.id = p_id AND r.school_id = v_school;
  ELSE
    UPDATE public.meeting_requests r
       SET status = 'declined', meeting_at = NULL, counselor_note = v_note,
           answered_by = v_uid, updated_at = now()
     WHERE r.id = p_id AND r.school_id = v_school;
  END IF;

  -- The row as counselor_requests gives it.
  SELECT jsonb_build_object(
           'id', r.id,
           'student_id', r.student_id,
           'student_name', coalesce(nullif(btrim(p.full_name), ''), 'Student'),
           'grade', p.grade_level,
           'message', r.message,
           'times', r.times,
           'status', r.status,
           'meeting_at', r.meeting_at,
           'counselor_note', r.counselor_note,
           'created_at', r.created_at,
           'shares_portfolio', l.share_portfolio)
    INTO v_out
    FROM public.meeting_requests r
    JOIN public.school_links l ON l.student_id = r.student_id AND l.school_id = r.school_id
    LEFT JOIN public.profiles p ON p.id = r.student_id
   WHERE r.id = p_id AND r.school_id = v_school;

  RETURN v_out;
END;
$$;


-- ── remove_student ────────────────────────────────────────────────────────────
-- A counselor unlinks a student from their own school. The student's requests
-- there go with the link.
CREATE OR REPLACE FUNCTION public.remove_student(p_student UUID) RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_school UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_signed_in' USING ERRCODE = 'P0001';
  END IF;
  SELECT c.school_id INTO v_school FROM public.counselors c WHERE c.user_id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_counselor' USING ERRCODE = 'P0001';
  END IF;

  PERFORM 1 FROM public.school_links l
    WHERE l.student_id = p_student AND l.school_id = v_school
      FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_linked' USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.meeting_requests r WHERE r.student_id = p_student AND r.school_id = v_school;
  DELETE FROM public.school_links l WHERE l.student_id = p_student AND l.school_id = v_school;

  RETURN jsonb_build_object('removed', true);
END;
$$;


-- ══ Student side ══════════════════════════════════════════════════════════════

-- ── my_school ─────────────────────────────────────────────────────────────────
-- The caller's own link: the school, its counselors' names, the four switches
-- and their own newest 10 requests. Null when they are not linked.
CREATE OR REPLACE FUNCTION public.my_school() RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid  UUID := auth.uid();
  v_link public.school_links%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_signed_in' USING ERRCODE = 'P0001';
  END IF;

  SELECT l.* INTO v_link FROM public.school_links l WHERE l.student_id = v_uid;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'school', jsonb_build_object(
      'name', (SELECT s.name FROM public.schools s WHERE s.id = v_link.school_id)),
    'counselors', coalesce((
      SELECT jsonb_agg(c.display_name ORDER BY c.created_at, c.user_id)
        FROM public.counselors c WHERE c.school_id = v_link.school_id), '[]'::jsonb),
    'linked_at', v_link.linked_at,
    'sharing', jsonb_build_object(
      'college_list', v_link.share_college_list,
      'portfolio', v_link.share_portfolio,
      'quest', v_link.share_quest,
      'essays', v_link.share_essays),
    'requests', coalesce((
      SELECT jsonb_agg(x.entry ORDER BY x.created_at DESC, x.id)
        FROM (
          SELECT r.id, r.created_at,
                 jsonb_build_object(
                   'id', r.id, 'message', r.message, 'times', r.times, 'status', r.status,
                   'meeting_at', r.meeting_at, 'counselor_note', r.counselor_note,
                   'created_at', r.created_at) AS entry
            FROM public.meeting_requests r
           WHERE r.student_id = v_uid AND r.school_id = v_link.school_id
           ORDER BY r.created_at DESC, r.id
           LIMIT 10
        ) x), '[]'::jsonb));
END;
$$;


-- ── join_school ───────────────────────────────────────────────────────────────
-- Link the caller to the school a code belongs to, with every switch off.
--
-- At most 10 tries an hour per student, and the count has to survive a wrong
-- guess. An exception would not do that: it undoes everything its transaction
-- wrote, the row that counted the try included, so a limiter that refused with
-- one would only ever count the guesses that were right. So the try is written
-- first, and nothing after it raises. A wrong code, a student who is already
-- linked and a counselor entering their own school's code are answered by
-- returning: the row stays, and the caller gets the same thing an exception
-- would have sent them, HTTP 400 with {"code": "P0001", "message": "bad_code"}
-- (PostgREST takes the status from response.status), so the page reads
-- error.message as it does for every other refusal. Called from SQL, it returns
-- that object instead of raising.
--
-- Only too_many_tries is a real exception: by then there is nothing to keep.
-- A code that was replaced answers exactly as one that never existed.
--
-- So does the demo school's code, for every account but one the owner flagged
-- (profiles.is_demo, which profiles_keep_is_demo keeps anyone from setting on
-- themselves). The demo counselor login is handed to judges and its code is on
-- screen in every walkthrough, so a real student who typed it would be sharing
-- their name and record with everyone who holds that password. To show the
-- student side of the demo, the owner flags a test account by hand:
--   UPDATE public.profiles SET is_demo = true WHERE id = '<the test account>';
CREATE OR REPLACE FUNCTION public.join_school(p_code TEXT) RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid     UUID := auth.uid();
  -- Upper case, with spaces, dashes and anything else that is not a letter or
  -- a number taken out.
  v_code    TEXT := regexp_replace(upper(left(coalesce(p_code, ''), 64)), '[^A-Z0-9]', '', 'g');
  v_school  UUID;
  v_tries   INT;
  v_refusal TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_signed_in' USING ERRCODE = 'P0001';
  END IF;

  -- One try at a time per student: ten calls sent together would otherwise all
  -- read "nine so far" and all go through.
  PERFORM pg_advisory_xact_lock(hashtextextended('counselor.join:' || v_uid::text, 0));

  SELECT count(*) INTO v_tries
    FROM public.join_attempts a
   WHERE a.user_id = v_uid AND a.at > now() - interval '1 hour';
  IF v_tries >= 10 THEN
    RAISE EXCEPTION 'too_many_tries' USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.join_attempts a WHERE a.user_id = v_uid AND a.at < now() - interval '1 day';
  INSERT INTO public.join_attempts (user_id) VALUES (v_uid);

  -- Nothing below this line raises. A demo school is found only by an account
  -- flagged as demo; for anyone else its code is simply not there, so the try
  -- is counted and answered bad_code like any other wrong guess.
  SELECT s.id INTO v_school
    FROM public.schools s
   WHERE s.join_code = v_code
     AND (NOT s.is_demo
          OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_uid AND p.is_demo));
  IF NOT FOUND THEN
    v_refusal := 'bad_code';
  ELSIF EXISTS (SELECT 1 FROM public.school_links l WHERE l.student_id = v_uid) THEN
    v_refusal := 'already_linked';
  ELSIF EXISTS (SELECT 1 FROM public.counselors c WHERE c.user_id = v_uid AND c.school_id = v_school) THEN
    v_refusal := 'own_school';
  ELSE
    INSERT INTO public.school_links (student_id, school_id)
    VALUES (v_uid, v_school)
    ON CONFLICT (student_id) DO NOTHING;
    IF NOT FOUND THEN
      v_refusal := 'already_linked';   -- two tabs at once
    END IF;
  END IF;

  IF v_refusal IS NOT NULL THEN
    PERFORM set_config('response.status', '400', true);
    RETURN jsonb_build_object('code', 'P0001', 'message', v_refusal, 'details', NULL, 'hint', NULL);
  END IF;

  RETURN public.my_school();
END;
$$;


-- ── set_sharing ───────────────────────────────────────────────────────────────
-- All four switches at once. Anything but a real true is off.
CREATE OR REPLACE FUNCTION public.set_sharing(
  p_college_list BOOLEAN, p_portfolio BOOLEAN, p_quest BOOLEAN, p_essays BOOLEAN
) RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_signed_in' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.school_links l
     SET share_college_list = coalesce(p_college_list, false),
         share_portfolio    = coalesce(p_portfolio, false),
         share_quest        = coalesce(p_quest, false),
         share_essays       = coalesce(p_essays, false)
   WHERE l.student_id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_linked' USING ERRCODE = 'P0001';
  END IF;

  RETURN public.my_school();
END;
$$;


-- ── leave_school ──────────────────────────────────────────────────────────────
-- The counselor's access ends with this call: the link and every request the
-- student sent are deleted, so nothing of theirs is left with the school.
CREATE OR REPLACE FUNCTION public.leave_school() RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_signed_in' USING ERRCODE = 'P0001';
  END IF;

  PERFORM 1 FROM public.school_links l WHERE l.student_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_linked' USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.meeting_requests r WHERE r.student_id = v_uid;
  DELETE FROM public.school_links l WHERE l.student_id = v_uid;

  RETURN jsonb_build_object('left', true);
END;
$$;


-- ── request_meeting ───────────────────────────────────────────────────────────
-- A message and 1 to 3 times, each in the future and within 60 days. At most 2
-- requests waiting at once, and at most 6 sent in any 24 hours whatever became
-- of them: cancelling frees a place among the two waiting, so without the
-- second limit a loop of request and cancel would fill the school's schedule.
-- (Leaving deletes a student's requests, so leaving and joining again cannot
-- pile them up either, and joining is itself limited to 10 tries an hour.)
CREATE OR REPLACE FUNCTION public.request_meeting(p_message TEXT, p_times TIMESTAMPTZ[]) RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_school  UUID;
  v_message TEXT := btrim(coalesce(p_message, ''));
  v_times   JSONB;
  v_out     JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_signed_in' USING ERRCODE = 'P0001';
  END IF;

  -- The lock also puts a student's own requests in a line, so two sent together
  -- cannot both count "one waiting" and make three.
  SELECT l.school_id INTO v_school FROM public.school_links l WHERE l.student_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_linked' USING ERRCODE = 'P0001';
  END IF;

  IF char_length(v_message) NOT BETWEEN 1 AND 300 THEN
    RAISE EXCEPTION 'bad_message' USING ERRCODE = 'P0001';
  END IF;

  IF p_times IS NULL OR cardinality(p_times) NOT BETWEEN 1 AND 3
     OR EXISTS (SELECT 1 FROM unnest(p_times) AS u(t)
                 WHERE u.t IS NULL OR u.t <= now() OR u.t > now() + interval '60 days') THEN
    RAISE EXCEPTION 'bad_times' USING ERRCODE = 'P0001';
  END IF;

  IF (SELECT count(*) FROM public.meeting_requests r
       WHERE r.student_id = v_uid AND r.school_id = v_school AND r.status = 'pending') >= 2 THEN
    RAISE EXCEPTION 'too_many_open' USING ERRCODE = 'P0001';
  END IF;

  -- Every request of theirs from the last 24 hours counts, cancelled, declined
  -- and confirmed ones included.
  IF (SELECT count(*) FROM public.meeting_requests r
       WHERE r.student_id = v_uid AND r.created_at > now() - interval '24 hours') >= 6 THEN
    RAISE EXCEPTION 'too_many_today' USING ERRCODE = 'P0001';
  END IF;

  -- In the order given, a repeated time kept once.
  SELECT jsonb_agg(to_jsonb(d.t) ORDER BY d.ord)
    INTO v_times
    FROM (SELECT u.t, min(u.ord) AS ord
            FROM unnest(p_times) WITH ORDINALITY AS u(t, ord)
           GROUP BY u.t) d;

  INSERT INTO public.meeting_requests AS r (student_id, school_id, message, times)
  VALUES (v_uid, v_school, v_message, v_times)
  RETURNING jsonb_build_object(
    'id', r.id, 'message', r.message, 'times', r.times, 'status', r.status,
    'meeting_at', r.meeting_at, 'counselor_note', r.counselor_note, 'created_at', r.created_at)
    INTO v_out;

  RETURN v_out;
END;
$$;


-- ── cancel_request ────────────────────────────────────────────────────────────
-- The caller's own request, while it is waiting or confirmed.
CREATE OR REPLACE FUNCTION public.cancel_request(p_id UUID) RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_out JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_signed_in' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.meeting_requests r
     SET status = 'cancelled', meeting_at = NULL, updated_at = now()
   WHERE r.id = p_id AND r.student_id = v_uid AND r.status IN ('pending', 'confirmed')
  RETURNING jsonb_build_object(
    'id', r.id, 'message', r.message, 'times', r.times, 'status', r.status,
    'meeting_at', r.meeting_at, 'counselor_note', r.counselor_note, 'created_at', r.created_at)
    INTO v_out;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no_request' USING ERRCODE = 'P0001';
  END IF;

  RETURN v_out;
END;
$$;


-- ══ The daily email (backend only) ════════════════════════════════════════════

-- ── counselor_digest_due ──────────────────────────────────────────────────────
-- Counselors to email today: [{counselor_id, email, school_name, pending}].
-- pending is how many students have a request waiting that arrived after this
-- counselor's last email (every waiting request when there has been none). A
-- counselor already emailed today, a demo school and an address that was never
-- confirmed are all left out. No student's name or message is in the answer.
CREATE OR REPLACE FUNCTION public.counselor_digest_due() RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'counselor_id', d.counselor_id, 'email', d.email, 'school_name', d.school_name,
             'pending', d.pending)
             ORDER BY d.counselor_id)
      FROM (
        SELECT c.user_id AS counselor_id,
               u.email::text AS email,
               s.name AS school_name,
               (SELECT count(DISTINCT r.student_id)
                  FROM public.meeting_requests r
                 WHERE r.school_id = c.school_id AND r.status = 'pending'
                   AND r.created_at > coalesce(
                         (SELECT max(g.sent_at) FROM public.counselor_digests g WHERE g.counselor_id = c.user_id),
                         '-infinity'::timestamptz)) AS pending
          FROM public.counselors c
          JOIN public.schools s ON s.id = c.school_id
          JOIN auth.users u ON u.id = c.user_id
         WHERE NOT s.is_demo
           AND u.email IS NOT NULL AND u.email <> '' AND u.email_confirmed_at IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM public.counselor_digests g
                            WHERE g.counselor_id = c.user_id AND g.day = current_date)
      ) d
     WHERE d.pending > 0), '[]'::jsonb);
END;
$$;

-- ── counselor_digest_claim ────────────────────────────────────────────────────
-- Take today's slot for one counselor before sending. True when this call took
-- it, false when it was already taken (so two runs cannot both send).
CREATE OR REPLACE FUNCTION public.counselor_digest_claim(p_counselor UUID, p_count INT) RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.counselor_digests (counselor_id, day, count)
  VALUES (p_counselor, current_date, greatest(coalesce(p_count, 0), 0))
  ON CONFLICT (counselor_id, day) DO NOTHING;
  RETURN to_jsonb(FOUND);
END;
$$;

-- ── counselor_digest_release ──────────────────────────────────────────────────
-- Give today's slot back: the send failed, so the counselor is still due.
CREATE OR REPLACE FUNCTION public.counselor_digest_release(p_counselor UUID) RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.counselor_digests g WHERE g.counselor_id = p_counselor AND g.day = current_date;
  RETURN to_jsonb(FOUND);
END;
$$;


-- ── Who may call what ─────────────────────────────────────────────────────────
-- New functions in public are executable by everyone until told otherwise.
-- Signed-out visitors get nothing. Signed-in users get the fourteen functions
-- that check auth.uid() themselves. The digest functions trust the id they are
-- given, so they are the backend's alone. The code generator is nobody's.
REVOKE ALL ON FUNCTION public.counselor_me()                                FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_school(TEXT, TEXT)                     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rotate_join_code()                            FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.counselor_caseload()                          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.counselor_student(UUID)                       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.counselor_requests()                          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.answer_request(UUID, TEXT, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_student(UUID)                          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_school()                                   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.join_school(TEXT)                             FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_sharing(BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.leave_school()                                FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.request_meeting(TEXT, TIMESTAMPTZ[])          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_request(UUID)                          FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.counselor_me()                                TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_school(TEXT, TEXT)                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_join_code()                            TO authenticated;
GRANT EXECUTE ON FUNCTION public.counselor_caseload()                          TO authenticated;
GRANT EXECUTE ON FUNCTION public.counselor_student(UUID)                       TO authenticated;
GRANT EXECUTE ON FUNCTION public.counselor_requests()                          TO authenticated;
GRANT EXECUTE ON FUNCTION public.answer_request(UUID, TEXT, TIMESTAMPTZ, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_student(UUID)                          TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_school()                                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_school(TEXT)                             TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_sharing(BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_school()                                TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_meeting(TEXT, TIMESTAMPTZ[])          TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_request(UUID)                          TO authenticated;

REVOKE ALL ON FUNCTION public.counselor_digest_due()                 FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.counselor_digest_claim(UUID, INT)      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.counselor_digest_release(UUID)         FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.counselor_digest_due()              TO service_role;
GRANT EXECUTE ON FUNCTION public.counselor_digest_claim(UUID, INT)   TO service_role;
GRANT EXECUTE ON FUNCTION public.counselor_digest_release(UUID)      TO service_role;

REVOKE ALL ON FUNCTION public.counselor_new_join_code() FROM PUBLIC, anon, authenticated, service_role;

-- The API reads its list of functions when the schema changes; say so plainly.
NOTIFY pgrst, 'reload schema';


-- ── The daily email job ───────────────────────────────────────────────────────
-- 13:00 UTC every day, the way 20260924_keep_backend_awake.sql pings /health:
-- the backend asks counselor_digest_due() who is due and sends at most one
-- email a counselor a day. Scheduling under an existing name replaces that job,
-- so this is safe to re-run. To stop it:  select cron.unschedule('counselor-digest');
--
-- The route is not open: it answers 404 unless the call carries the shared
-- secret in an X-Digest-Secret header. The secret is not in this file. The job
-- reads it from Supabase Vault each time it runs, and makes no call at all
-- while the Vault has none. Once, before the first run (any long random
-- string, for example from `openssl rand -hex 32`):
--   1. Set DIGEST_SECRET to it on Render (the backend's environment).
--   2. Store the same value here, run as the owner and never committed:
--        select vault.create_secret('<the value>', 'counselor_digest_secret',
--                                   'X-Digest-Secret for the counselor-digest job');
-- To change it later: vault.update_secret(<its id>, '<new value>'), and the
-- same new value on Render. Until both are set the job sends nothing.
-- (The guard test's dry run leaves everything from the next line down out.)
-- >>> cron
select cron.schedule(
  'counselor-digest',
  '0 13 * * *',
  $$
    select net.http_post(
      url := 'https://mentorable-langgraph.onrender.com/internal/counselor-digest',
      body := '{}'::jsonb,
      headers := jsonb_build_object('Content-Type', 'application/json',
                                    'X-Digest-Secret', s.decrypted_secret),
      timeout_milliseconds := 60000
    )
      from vault.decrypted_secrets s
     where s.name = 'counselor_digest_secret'
       and s.decrypted_secret <> '';
  $$
);
-- <<< cron
