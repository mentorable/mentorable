-- The counselor guard test. Proves, against the real database, that a counselor
-- can see only what a linked student chose to share, only through the functions
-- of 20261012_counselor.sql, and nothing else by any route.
--
-- Run it after the migration is applied:
--   supabase db query --linked -f supabase/tests/counselor_guard.sql
--
-- It is one transaction that ends in ROLLBACK: the schools, counselors and
-- students it makes (addresses at guard.mentorable.invalid) never exist outside
-- it. Every check raises "GUARD FAILED: <what>" the moment it is wrong, which
-- stops the run and undoes everything; the last row says how many checks passed.
--
-- It acts as each person the way the API does: the authenticated role with the
-- person's id in the request's claims, so auth.uid() is theirs.

BEGIN;

-- ── Helpers (in the session's temporary schema, gone with the transaction) ────

-- The people in this test, by a short name.
CREATE FUNCTION pg_temp.u(p_who TEXT) RETURNS UUID LANGUAGE sql IMMUTABLE AS $$
  SELECT ('9a11d000-0000-4000-8000-' || lpad(to_hex(array_position(
    ARRAY['ca', 'cb', 'a1', 'a2', 'a3', 'b1', 'n1', 'n2', 'r1', 'dc', 'd1', 'd2'], p_who)), 12, '0'))::uuid
$$;

-- Become someone: a signed-in person by short name, or 'admin' (the owner, for
-- setting up and looking behind the functions), 'anon' (signed out), 'service'
-- (the backend) or 'nobody' (the signed-in role with no id in its claims).
CREATE FUNCTION pg_temp.be(p_who TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  IF p_who = 'admin' THEN
    PERFORM set_config('request.jwt.claims', '', true);
    PERFORM set_config('role', 'postgres', true);
  ELSIF p_who = 'anon' THEN
    PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    PERFORM set_config('role', 'anon', true);
  ELSIF p_who = 'service' THEN
    PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
    PERFORM set_config('role', 'service_role', true);
  ELSIF p_who = 'nobody' THEN
    PERFORM set_config('request.jwt.claims', json_build_object('role', 'authenticated')::text, true);
    PERFORM set_config('role', 'authenticated', true);
  ELSE
    IF pg_temp.u(p_who) IS NULL THEN
      RAISE EXCEPTION 'GUARD FAILED: the test has no person called %', p_who;
    END IF;
    PERFORM set_config('request.jwt.claims',
                       json_build_object('sub', pg_temp.u(p_who), 'role', 'authenticated')::text, true);
    PERFORM set_config('role', 'authenticated', true);
  END IF;
END;
$$;

-- Notes carried from one step to the next (a join code, a request's id).
CREATE FUNCTION pg_temp.put(p_key TEXT, p_value TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('counselor_guard.' || p_key, p_value, true);
END;
$$;
CREATE FUNCTION pg_temp.get(p_key TEXT) RETURNS TEXT LANGUAGE sql AS $$
  SELECT current_setting('counselor_guard.' || p_key, true)
$$;

CREATE FUNCTION pg_temp.pass(p_name TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('counselor_guard.passed',
                     (coalesce(nullif(current_setting('counselor_guard.passed', true), ''), '0')::int + 1)::text,
                     true);
END;
$$;

-- A check: true passes, false or null stops the run.
CREATE FUNCTION pg_temp.ok(p_name TEXT, p_cond BOOLEAN) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  IF p_cond IS NOT TRUE THEN
    RAISE EXCEPTION 'GUARD FAILED: %', p_name;
  END IF;
  PERFORM pg_temp.pass(p_name);
END;
$$;

-- The statement must be refused with exactly this code.
CREATE FUNCTION pg_temp.refuses(p_name TEXT, p_sql TEXT, p_code TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_message TEXT;
  v_state   TEXT;
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT, v_state = RETURNED_SQLSTATE;
    IF v_message = p_code AND v_state = 'P0001' THEN
      PERFORM pg_temp.pass(p_name);
      RETURN;
    END IF;
    RAISE EXCEPTION 'GUARD FAILED: % (wanted %, got "%" [%])', p_name, p_code, v_message, v_state;
  END;
  RAISE EXCEPTION 'GUARD FAILED: % (wanted %, but it went through)', p_name, p_code;
END;
$$;

-- The statement must be refused for lack of permission (a grant, not a rule).
CREATE FUNCTION pg_temp.denied(p_name TEXT, p_sql TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_message TEXT;
  v_state   TEXT;
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT, v_state = RETURNED_SQLSTATE;
    IF v_state = '42501' THEN
      PERFORM pg_temp.pass(p_name);
      RETURN;
    END IF;
    RAISE EXCEPTION 'GUARD FAILED: % (wanted permission denied, got "%" [%])', p_name, v_message, v_state;
  END;
  RAISE EXCEPTION 'GUARD FAILED: % (wanted permission denied, but it went through)', p_name;
END;
$$;

-- Every key anywhere inside a JSON value, sorted.
CREATE FUNCTION pg_temp.all_keys(p JSONB) RETURNS TEXT[] LANGUAGE sql AS $$
  WITH RECURSIVE walk(v) AS (
    SELECT p
    UNION ALL
    SELECT c.v
      FROM walk w,
           LATERAL (
             SELECT e.value AS v
               FROM jsonb_each(CASE WHEN jsonb_typeof(w.v) = 'object' THEN w.v ELSE '{}'::jsonb END) e
             UNION ALL
             SELECT a.value
               FROM jsonb_array_elements(CASE WHEN jsonb_typeof(w.v) = 'array' THEN w.v ELSE '[]'::jsonb END) a
           ) c
  )
  SELECT coalesce(array_agg(DISTINCT k.key COLLATE "C" ORDER BY k.key COLLATE "C"), '{}'::text[])
    FROM walk w,
         LATERAL jsonb_object_keys(CASE WHEN jsonb_typeof(w.v) = 'object' THEN w.v ELSE '{}'::jsonb END) AS k(key)
$$;

-- The top-level keys of one object, sorted.
CREATE FUNCTION pg_temp.keys(p JSONB) RETURNS TEXT[] LANGUAGE sql AS $$
  SELECT coalesce(array_agg(k ORDER BY k COLLATE "C"), '{}'::text[]) FROM jsonb_object_keys(p) AS k
$$;

-- The caseload row of one student, or null when they are not in it.
CREATE FUNCTION pg_temp.row_of(p_caseload JSONB, p_who TEXT) RETURNS JSONB LANGUAGE sql AS $$
  SELECT e FROM jsonb_array_elements(p_caseload) AS e WHERE e ->> 'student_id' = pg_temp.u(p_who)::text
$$;

-- How many rows of a table the current role can see for one person.
CREATE FUNCTION pg_temp.visible(p_table TEXT, p_column TEXT, p_who TEXT) RETURNS BIGINT LANGUAGE plpgsql AS $$
DECLARE
  v_n BIGINT;
BEGIN
  EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = $1', p_table, p_column)
     INTO v_n USING pg_temp.u(p_who);
  RETURN v_n;
END;
$$;

-- A whole record for one student, marked so the test can tell whose it is and
-- which parts must never leave. "<mark>MARK_..." sits in fields a section may
-- show once it is shared; "CANARY_..." sits in everything no counselor function
-- may ever return (essay words, check-in words, chat, memory, private profile
-- fields).
CREATE FUNCTION pg_temp.give_record(p_who TEXT, p_mark TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_user     UUID := pg_temp.u(p_who);
  v_canary   TEXT := 'CANARY_' || p_mark || '_';
  v_quest    UUID := gen_random_uuid();
  v_ms       UUID := gen_random_uuid();
  v_task1    UUID := gen_random_uuid();
  v_task2    UUID := gen_random_uuid();
  v_essay    UUID := gen_random_uuid();
  v_version  UUID := gen_random_uuid();
  v_n        INT  := array_position(ARRAY['ca', 'cb', 'a1', 'a2', 'a3', 'b1', 'n1', 'n2', 'r1', 'dc', 'd1', 'd2'], p_who);
BEGIN
  UPDATE public.profiles
     SET gpa_unweighted = 3.8, gpa_weighted = 4.2, gpa_scale = '4.0',
         candidate_majors = jsonb_build_array(p_mark || 'MARK_MAJOR'),
         chat_signals = jsonb_build_array(v_canary || 'CHAT_SIGNAL'),
         agent_instructions = v_canary || 'AGENT_INSTRUCTIONS',
         narrative = jsonb_build_object('theme', v_canary || 'NARRATIVE'),
         location_general = v_canary || 'LOCATION',
         bio = v_canary || 'BIO',
         resume_contact = jsonb_build_object('phone', v_canary || 'PHONE'),
         intake_draft = jsonb_build_object('draft', v_canary || 'INTAKE_DRAFT'),
         raw_voice_transcript = v_canary || 'VOICE',
         target_colleges = jsonb_build_array(v_canary || 'TARGET_COLLEGE'),
         onboarding_summary = v_canary || 'ONBOARDING_SUMMARY'
   WHERE id = v_user;

  INSERT INTO public.student_activities
    (user_id, category, title, "position", organization, description, grade_levels, timing,
     hours_per_week, weeks_per_year, order_index)
  VALUES
    (v_user, 'Robotics', p_mark || 'MARK_ACT', 'Captain', 'Guard Robotics', 'Built a robot', '{10,11}',
     'school_year', 6.5, 30, 0),
    (v_user, 'Work (Paid)', p_mark || 'MARK_ACT_TWO', NULL, NULL, NULL, '{11}', 'summer', 12, 8, 1);

  INSERT INTO public.student_awards (user_id, title, level, grade_level, year, description, order_index)
  VALUES (v_user, p_mark || 'MARK_AWARD', 'state', 11, 2026, 'Second place', 0);

  INSERT INTO public.student_courses (user_id, name, level, grade_level, year, planned, order_index)
  VALUES (v_user, p_mark || 'MARK_COURSE', 'ap', 11, 2026, false, 0),
         (v_user, 'Guard English', 'honors', 11, 2026, false, 1),
         (v_user, 'Guard Calculus', 'ap', 12, 2027, true, 2);

  INSERT INTO public.student_test_scores (user_id, test_type, score, section_scores, subject, test_date)
  VALUES (v_user, 'sat', 1450, jsonb_build_object('math', 760, 'note', v_canary || 'SECTION_SCORES'), NULL,
          DATE '2026-03-14'),
         (v_user, 'ap', 5, '{}'::jsonb, p_mark || 'MARK_SUBJECT', DATE '2026-05-08');

  INSERT INTO public.college_list_items
    (user_id, scorecard_id, name, city, state, admission_rate, net_price, category, category_source)
  VALUES
    (v_user, 99000001, p_mark || 'MARK_COLLEGE_REACH', 'Guardville', 'MI', 0.0800, 21000, 'reach', 'suggested'),
    (v_user, 99000002, p_mark || 'MARK_COLLEGE_TARGET', 'Guardville', 'MI', 0.4500, 18000, 'target', 'student'),
    (v_user, 99000003, p_mark || 'MARK_COLLEGE_TARGET_TWO', 'Guardville', 'OH', 0.5200, 16000, 'target', 'rough');

  -- Three quests: an old finished one, the one under way (the one a counselor
  -- may see), and a newer retired one that must be passed over.
  INSERT INTO public.quests (user_id, title, summary, direction, status, created_at, started_at, completed_at)
  VALUES (v_user, v_canary || 'OLDER_QUEST', 'older', '', 'completed',
          now() - interval '60 days', now() - interval '60 days', now() - interval '40 days');
  INSERT INTO public.quests
    (id, user_id, title, summary, direction, status, start_date, created_at, started_at, portfolio_draft)
  VALUES (v_quest, v_user, p_mark || 'MARK_QUEST', p_mark || 'MARK_QUEST_SUMMARY', v_canary || 'DIRECTION',
          'active', current_date - 10, now() - interval '10 days', now() - interval '10 days',
          jsonb_build_object('description', v_canary || 'PORTFOLIO_DRAFT'));
  INSERT INTO public.quests (user_id, title, summary, direction, status, created_at)
  VALUES (v_user, v_canary || 'RETIRED_QUEST', 'retired', '', 'retired', now() - interval '1 day');

  INSERT INTO public.quest_milestones
    (id, user_id, quest_id, "position", title, description, expected_days, status)
  VALUES (v_ms, v_user, v_quest, 1, p_mark || 'MARK_MILESTONE_ONE', v_canary || 'MILESTONE_DESCRIPTION', 2, 'done'),
         (gen_random_uuid(), v_user, v_quest, 2, p_mark || 'MARK_MILESTONE_TWO', '', 3, 'pending'),
         (gen_random_uuid(), v_user, v_quest, 3, p_mark || 'MARK_MILESTONE_THREE', '', 3, 'pending');

  INSERT INTO public.quest_tasks (id, user_id, quest_id, milestone_id, slot, title, detail, status, done_on)
  VALUES (v_task1, v_user, v_quest, v_ms, 1, v_canary || 'TASK_TITLE', v_canary || 'TASK_DETAIL', 'done',
          current_date - 2),
         (v_task2, v_user, v_quest, v_ms, 2, v_canary || 'TASK_TITLE_TWO', v_canary || 'TASK_DETAIL_TWO', 'done',
          current_date - 1);

  INSERT INTO public.quest_checkins
    (user_id, quest_id, task_id, body, advisor_reply, followup, followup_answer, created_at)
  VALUES (v_user, v_quest, v_task1, v_canary || 'CHECKIN_BODY', v_canary || 'ADVISOR_REPLY',
          v_canary || 'FOLLOWUP', v_canary || 'FOLLOWUP_ANSWER', now() - interval '2 days'),
         (v_user, v_quest, v_task2, v_canary || 'CHECKIN_BODY_TWO', v_canary || 'ADVISOR_REPLY_TWO', NULL, NULL,
          now() - interval '1 day');

  INSERT INTO public.quest_stats (user_id, xp, streak, streak_date, best_streak)
  VALUES (v_user, 120, 4, current_date, 6);

  -- Two personal statements (the newer one is the one that counts) and two supplements.
  INSERT INTO public.essays
    (id, user_id, kind, title, prompt_key, prompt_text, school_name, word_limit, body, word_count, status, updated_at)
  VALUES
    (v_essay, v_user, 'personal_statement', v_canary || 'ESSAY_TITLE', '1', v_canary || 'PROMPT_TEXT', '', 650,
     v_canary || 'ESSAY_BODY', 412, 'revising', now() - interval '1 hour'),
    (gen_random_uuid(), v_user, 'personal_statement', v_canary || 'OLD_ESSAY_TITLE', '2',
     v_canary || 'OLD_PROMPT_TEXT', '', 650, v_canary || 'OLD_ESSAY_BODY', 7, 'idea', now() - interval '5 days'),
    (gen_random_uuid(), v_user, 'supplement', v_canary || 'SUPPLEMENT_TITLE', NULL,
     v_canary || 'SUPPLEMENT_PROMPT', v_canary || 'SUPPLEMENT_SCHOOL', 250, v_canary || 'SUPPLEMENT_BODY', 240,
     'done', now() - interval '2 days'),
    (gen_random_uuid(), v_user, 'supplement', v_canary || 'SUPPLEMENT_TITLE_TWO', NULL,
     v_canary || 'SUPPLEMENT_PROMPT_TWO', v_canary || 'SUPPLEMENT_SCHOOL_TWO', 300,
     v_canary || 'SUPPLEMENT_BODY_TWO', 80, 'drafting', now() - interval '3 days');

  INSERT INTO public.essay_topics (user_id, area, notes)
  VALUES (v_user, v_canary || 'TOPIC_AREA', v_canary || 'TOPIC_NOTES');
  INSERT INTO public.essay_versions (id, essay_id, user_id, body, word_count, source)
  VALUES (v_version, v_essay, v_user, v_canary || 'VERSION_BODY', 400, 'manual');
  INSERT INTO public.essay_reviews (essay_id, version_id, user_id, summary, word_count, word_limit, checks)
  VALUES (v_essay, v_version, v_user, v_canary || 'REVIEW_SUMMARY', 400, 650, '[]'::jsonb);

  INSERT INTO public.student_memories (user_id, body, context, source, dedupe_key, embedding, embedding_model)
  VALUES (v_user, v_canary || 'MEMORY said in chat one evening', v_canary || 'MEMORY_CONTEXT', 'chat',
          'chat:guard-' || v_n,
          ('[' || array_to_string(array_fill(0.1::float4, ARRAY[1536]), ',') || ']')::extensions.vector,
          'guard-test');

  INSERT INTO public.chat_sessions (user_id, messages, title)
  VALUES (v_user, jsonb_build_array(jsonb_build_object('role', 'user', 'content', v_canary || 'CHAT_MESSAGE')),
          v_canary || 'CHAT_TITLE');
END;
$$;

-- The fourteen functions a signed-in person may call, each with harmless arguments.
CREATE FUNCTION pg_temp.calls() RETURNS TABLE (fn TEXT, call TEXT) LANGUAGE sql AS $$
  VALUES
    ('counselor_me',       $q$SELECT public.counselor_me()$q$),
    ('create_school',      $q$SELECT public.create_school('Guard School', 'Ms. Guard')$q$),
    ('rotate_join_code',   $q$SELECT public.rotate_join_code()$q$),
    ('counselor_caseload', $q$SELECT public.counselor_caseload()$q$),
    ('counselor_student',  $q$SELECT public.counselor_student('11111111-2222-4333-8444-555555555555')$q$),
    ('counselor_requests', $q$SELECT public.counselor_requests()$q$),
    ('answer_request',     $q$SELECT public.answer_request('11111111-2222-4333-8444-555555555555', 'decline', NULL, '')$q$),
    ('remove_student',     $q$SELECT public.remove_student('11111111-2222-4333-8444-555555555555')$q$),
    ('my_school',          $q$SELECT public.my_school()$q$),
    ('join_school',        $q$SELECT public.join_school('ABCDEFGH')$q$),
    ('set_sharing',        $q$SELECT public.set_sharing(true, true, true, true)$q$),
    ('leave_school',       $q$SELECT public.leave_school()$q$),
    ('request_meeting',    $q$SELECT public.request_meeting('hello', ARRAY[now() + interval '1 day'])$q$),
    ('cancel_request',     $q$SELECT public.cancel_request('11111111-2222-4333-8444-555555555555')$q$)
$$;


-- ── 0. Setup: twelve accounts, six of them with a full record ────────────────
SELECT pg_temp.put('passed', '0');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users u
              WHERE u.email LIKE '%@guard.mentorable.invalid'
                 OR u.id::text LIKE '9a11d000-0000-4000-8000-%') THEN
    RAISE EXCEPTION 'GUARD FAILED: the test accounts already exist; nothing was changed';
  END IF;
END;
$$;

INSERT INTO auth.users
  (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data,
   raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new,
   email_change)
SELECT pg_temp.u(w), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'guard-' || w || '@guard.mentorable.invalid', '', now(),
       '{"provider": "email", "providers": ["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', ''
  FROM unnest(ARRAY['ca', 'cb', 'a1', 'a2', 'a3', 'b1', 'n1', 'n2', 'r1', 'dc', 'd1', 'd2']) AS w;

DO $$
BEGIN
  PERFORM pg_temp.ok('signing up made a profile for each test account',
    (SELECT count(*) FROM public.profiles p WHERE p.id::text LIKE '9a11d000-0000-4000-8000-%') = 12);
END;
$$;

UPDATE public.profiles p
   SET full_name = v.full_name, grade_level = v.grade, graduation_year = v.class_of, onboarding_completed = true
  FROM (VALUES ('ca', 'Counselor Alpha', NULL::int, NULL::int),
               ('cb', 'Counselor Beta',  NULL, NULL),
               ('a1', 'Ada Guard',  11, 2028),
               ('a2', 'Ben Guard',  10, 2029),
               ('a3', 'Cy Guard',   12, 2027),
               ('b1', 'Bea Other',   9, 2030),
               ('n1', 'Nat Nobody', 11, 2028),
               ('n2', '   ',        NULL, NULL),
               ('r1', 'Rae Limit',  10, 2029),
               ('dc', 'Counselor Demo', NULL, NULL),
               ('d1', 'Dee Real',   11, 2028),
               ('d2', 'Owner Tester', 12, 2027)) AS v(who, full_name, grade, class_of)
 WHERE p.id = pg_temp.u(v.who);

SELECT pg_temp.give_record('a1', 'A1');
SELECT pg_temp.give_record('a2', 'A2');
SELECT pg_temp.give_record('a3', 'A3');
SELECT pg_temp.give_record('b1', 'B1');
SELECT pg_temp.give_record('n1', 'N1');
SELECT pg_temp.give_record('d1', 'D1');


-- ── 1. The catalog: tables closed, functions definer with an empty path ──────
DO $$
DECLARE
  k_tables CONSTANT TEXT[] := ARRAY['schools', 'counselors', 'school_links', 'meeting_requests',
                                    'counselor_digests', 'join_attempts'];
  k_user_fns CONSTANT TEXT[] := ARRAY[
    'counselor_me()', 'create_school(text,text)', 'rotate_join_code()', 'counselor_caseload()',
    'counselor_student(uuid)', 'counselor_requests()',
    'answer_request(uuid,text,timestamp with time zone,text)', 'remove_student(uuid)', 'my_school()',
    'join_school(text)', 'set_sharing(boolean,boolean,boolean,boolean)', 'leave_school()',
    'request_meeting(text,timestamp with time zone[])', 'cancel_request(uuid)'];
  k_backend_fns CONSTANT TEXT[] := ARRAY[
    'counselor_digest_due()', 'counselor_digest_claim(uuid,integer)', 'counselor_digest_release(uuid)'];
  v_table TEXT;
  v_fn    TEXT;
  v_oid   OID;
  v_found TEXT[];
BEGIN
  FOREACH v_table IN ARRAY k_tables LOOP
    PERFORM pg_temp.ok(v_table || ': row level security is on',
      (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = ('public.' || v_table)::regclass));
    PERFORM pg_temp.ok(v_table || ': has no policy at all',
      NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = v_table));
    PERFORM pg_temp.ok(v_table || ': anon and authenticated hold no privilege on it',
      NOT has_table_privilege('anon', 'public.' || v_table,
            'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
      AND NOT has_table_privilege('authenticated', 'public.' || v_table,
            'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
      AND NOT has_any_column_privilege('anon', 'public.' || v_table, 'SELECT, INSERT, UPDATE, REFERENCES')
      AND NOT has_any_column_privilege('authenticated', 'public.' || v_table, 'SELECT, INSERT, UPDATE, REFERENCES'));
  END LOOP;

  FOREACH v_fn IN ARRAY k_user_fns || k_backend_fns LOOP
    v_oid := ('public.' || v_fn)::regprocedure::oid;
    PERFORM pg_temp.ok(v_fn || ': SECURITY DEFINER with an empty search_path',
      (SELECT p.prosecdef AND p.proconfig @> ARRAY['search_path=""'] FROM pg_proc p WHERE p.oid = v_oid));
    PERFORM pg_temp.ok(v_fn || ': not executable by PUBLIC or anon',
      NOT has_function_privilege('anon', v_oid, 'EXECUTE')
      AND NOT EXISTS (SELECT 1 FROM pg_proc p, LATERAL aclexplode(p.proacl) a
                       WHERE p.oid = v_oid AND a.grantee = 0));
  END LOOP;

  FOREACH v_fn IN ARRAY k_user_fns LOOP
    PERFORM pg_temp.ok(v_fn || ': executable by authenticated',
      has_function_privilege('authenticated', ('public.' || v_fn)::regprocedure::oid, 'EXECUTE'));
  END LOOP;

  FOREACH v_fn IN ARRAY k_backend_fns LOOP
    v_oid := ('public.' || v_fn)::regprocedure::oid;
    PERFORM pg_temp.ok(v_fn || ': the service role only',
      NOT has_function_privilege('authenticated', v_oid, 'EXECUTE')
      AND has_function_privilege('service_role', v_oid, 'EXECUTE'));
  END LOOP;

  v_oid := 'public.counselor_new_join_code()'::regprocedure::oid;
  PERFORM pg_temp.ok('counselor_new_join_code: nobody can call it through the API',
    NOT has_function_privilege('anon', v_oid, 'EXECUTE')
    AND NOT has_function_privilege('authenticated', v_oid, 'EXECUTE')
    AND NOT has_function_privilege('service_role', v_oid, 'EXECUTE')
    AND (SELECT p.proconfig @> ARRAY['search_path=""'] FROM pg_proc p WHERE p.oid = v_oid));

  -- Nothing else with a counselor-ish name is lying around with default grants.
  SELECT array_agg(p.oid::regprocedure::text ORDER BY p.oid::regprocedure::text)
    INTO v_found
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname ~ '(counselor|school|sharing|meeting|join_|_request|^remove_student$)';
  PERFORM pg_temp.ok('the counselor functions are exactly the eighteen in the migration',
    v_found = (SELECT array_agg(x.spelled ORDER BY x.spelled)
                 FROM (SELECT ('public.' || f)::regprocedure::text AS spelled
                         FROM unnest(k_user_fns || k_backend_fns || ARRAY['counselor_new_join_code()']) AS f) x));
END;
$$;


-- ── 2. Signed out: nothing at all ─────────────────────────────────────────────
SELECT pg_temp.be('anon');
DO $$
DECLARE
  r RECORD;
  v_table TEXT;
BEGIN
  FOR r IN SELECT * FROM pg_temp.calls() LOOP
    PERFORM pg_temp.denied('signed out: ' || r.fn || ' is refused', r.call);
  END LOOP;
  PERFORM pg_temp.denied('signed out: counselor_digest_due is refused', 'SELECT public.counselor_digest_due()');
  FOREACH v_table IN ARRAY ARRAY['schools', 'counselors', 'school_links', 'meeting_requests',
                                 'counselor_digests', 'join_attempts'] LOOP
    PERFORM pg_temp.denied('signed out: cannot read ' || v_table,
                           format('SELECT 1 FROM public.%I LIMIT 1', v_table));
  END LOOP;
END;
$$;


-- ── 3. The signed-in role with no id: not_signed_in everywhere ───────────────
SELECT pg_temp.be('nobody');
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT * FROM pg_temp.calls() LOOP
    PERFORM pg_temp.refuses('no id in the claims: ' || r.fn, r.call, 'not_signed_in');
  END LOOP;
END;
$$;


-- ── 4. Two counselors set up two schools ──────────────────────────────────────
SELECT pg_temp.be('ca');
DO $$
DECLARE
  v JSONB;
BEGIN
  PERFORM pg_temp.ok('counselor_me is null before a school exists', public.counselor_me() IS NULL);
  PERFORM pg_temp.refuses('a one-letter school name', $q$SELECT public.create_school(' x ', 'Ms. Alpha')$q$, 'bad_name');
  PERFORM pg_temp.refuses('a 121-letter school name',
    $q$SELECT public.create_school(repeat('n', 121), 'Ms. Alpha')$q$, 'bad_name');
  PERFORM pg_temp.refuses('an empty counselor name', $q$SELECT public.create_school('Guard School A', '   ')$q$,
    'bad_display_name');
  PERFORM pg_temp.refuses('an 81-letter counselor name',
    $q$SELECT public.create_school('Guard School A', repeat('n', 81))$q$, 'bad_display_name');

  v := public.create_school('  Guard   School A ', ' Ms. Alpha ');
  PERFORM pg_temp.ok('create_school answers with the school, trimmed, and a well-formed code',
    v #>> '{school,name}' = 'Guard School A'
    AND v #>> '{counselor,display_name}' = 'Ms. Alpha'
    AND (v #>> '{school,join_code}') ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$'
    AND (v #>> '{school,student_count}')::int = 0
    AND (v #>> '{school,is_demo}')::boolean = false
    AND pg_temp.keys(v) = ARRAY['counselor', 'school']
    AND pg_temp.keys(v -> 'school') = ARRAY['id', 'is_demo', 'join_code', 'name', 'student_count']);
  PERFORM pg_temp.ok('counselor_me now says the same', public.counselor_me() = v);
  PERFORM pg_temp.put('code_a', v #>> '{school,join_code}');
  PERFORM pg_temp.put('school_a', v #>> '{school,id}');
  PERFORM pg_temp.refuses('a counselor cannot set up a second school',
    $q$SELECT public.create_school('Another School', 'Ms. Alpha')$q$, 'already_counselor');
END;
$$;

SELECT pg_temp.be('cb');
DO $$
DECLARE
  v JSONB := public.create_school('Guard School B', 'Mr. Beta');
BEGIN
  PERFORM pg_temp.put('code_b', v #>> '{school,join_code}');
  PERFORM pg_temp.put('school_b', v #>> '{school,id}');
  PERFORM pg_temp.ok('the two schools have different codes', pg_temp.get('code_a') <> pg_temp.get('code_b'));
END;
$$;

SELECT pg_temp.be('admin');
DO $$
DECLARE
  v_codes TEXT[];
BEGIN
  -- 400 fresh codes: all well formed, all different, and every letter of the
  -- alphabet turns up (a broken mapping would leave some out).
  SELECT array_agg(public.counselor_new_join_code()) INTO v_codes FROM generate_series(1, 400);
  PERFORM pg_temp.ok('generated codes are 8 characters from the alphabet',
    NOT EXISTS (SELECT 1 FROM unnest(v_codes) c WHERE c !~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$'));
  PERFORM pg_temp.ok('generated codes do not repeat',
    (SELECT count(DISTINCT c) FROM unnest(v_codes) c) = 400);
  PERFORM pg_temp.ok('generated codes use all 31 characters',
    (SELECT count(DISTINCT ch) FROM unnest(v_codes) c, regexp_split_to_table(c, '') ch) = 31);
END;
$$;


-- ── 5. Someone who is neither a counselor nor linked ─────────────────────────
SELECT pg_temp.be('n1');
DO $$
BEGIN
  PERFORM pg_temp.ok('not a counselor: counselor_me is null', public.counselor_me() IS NULL);
  PERFORM pg_temp.refuses('not a counselor: counselor_caseload', 'SELECT public.counselor_caseload()', 'not_counselor');
  PERFORM pg_temp.refuses('not a counselor: counselor_requests', 'SELECT public.counselor_requests()', 'not_counselor');
  PERFORM pg_temp.refuses('not a counselor: rotate_join_code', 'SELECT public.rotate_join_code()', 'not_counselor');
  PERFORM pg_temp.refuses('not a counselor: counselor_student of a real student',
    $q$SELECT public.counselor_student(pg_temp.u('a1'))$q$, 'not_counselor');
  PERFORM pg_temp.refuses('not a counselor: counselor_student of themselves',
    $q$SELECT public.counselor_student(pg_temp.u('n1'))$q$, 'not_counselor');
  PERFORM pg_temp.refuses('not a counselor: remove_student',
    $q$SELECT public.remove_student(pg_temp.u('a1'))$q$, 'not_counselor');
  PERFORM pg_temp.refuses('not a counselor: answer_request',
    $q$SELECT public.answer_request('11111111-2222-4333-8444-555555555555', 'confirm', now() + interval '1 day', '')$q$,
    'not_counselor');

  PERFORM pg_temp.ok('not linked: my_school is null', public.my_school() IS NULL);
  PERFORM pg_temp.refuses('not linked: set_sharing', 'SELECT public.set_sharing(true, true, true, true)', 'not_linked');
  PERFORM pg_temp.refuses('not linked: leave_school', 'SELECT public.leave_school()', 'not_linked');
  PERFORM pg_temp.refuses('not linked: request_meeting',
    $q$SELECT public.request_meeting('hello', ARRAY[now() + interval '1 day'])$q$, 'not_linked');
  PERFORM pg_temp.refuses('not linked: cancel_request',
    $q$SELECT public.cancel_request('11111111-2222-4333-8444-555555555555')$q$, 'no_request');
END;
$$;


-- ── 6. Joining ────────────────────────────────────────────────────────────────
SELECT pg_temp.be('a1');
DO $$
DECLARE
  v JSONB;
  k_code CONSTANT TEXT := pg_temp.get('code_a');
BEGIN
  -- Typed the way people type: lower case, a dash, spaces.
  v := public.join_school(' ' || lower(left(k_code, 4)) || ' - ' || lower(right(k_code, 4)) || ' ');
  PERFORM pg_temp.ok('joining links the student with every switch off',
    v #>> '{school,name}' = 'Guard School A'
    AND v -> 'counselors' = '["Ms. Alpha"]'::jsonb
    AND v -> 'sharing' = '{"college_list": false, "portfolio": false, "quest": false, "essays": false}'::jsonb
    AND v -> 'requests' = '[]'::jsonb
    AND pg_temp.keys(v) = ARRAY['counselors', 'linked_at', 'requests', 'school', 'sharing']
    AND pg_temp.keys(v -> 'school') = ARRAY['name']);
  PERFORM pg_temp.ok('my_school says the same', public.my_school() = v);

  v := public.join_school(k_code);
  PERFORM pg_temp.ok('joining twice is answered already_linked', v ->> 'message' = 'already_linked');
  v := public.join_school(pg_temp.get('code_b'));
  PERFORM pg_temp.ok('one school per student: a second school is answered already_linked',
    v ->> 'message' = 'already_linked' AND v ->> 'code' = 'P0001');
END;
$$;

SELECT pg_temp.be('a2');
DO $$ BEGIN PERFORM pg_temp.ok('a2 joins school A', public.join_school(pg_temp.get('code_a')) -> 'school' IS NOT NULL); END; $$;
SELECT pg_temp.be('a3');
DO $$ BEGIN PERFORM pg_temp.ok('a3 joins school A', public.join_school(pg_temp.get('code_a')) -> 'school' IS NOT NULL); END; $$;
SELECT pg_temp.be('b1');
DO $$ BEGIN PERFORM pg_temp.ok('b1 joins school B', public.join_school(pg_temp.get('code_b')) -> 'school' IS NOT NULL); END; $$;

SELECT pg_temp.be('ca');
DO $$
DECLARE
  v JSONB := public.join_school(pg_temp.get('code_a'));
  c JSONB;
BEGIN
  PERFORM pg_temp.ok('a counselor cannot join their own school as a student', v ->> 'message' = 'own_school');
  PERFORM pg_temp.ok('and is still not linked', public.my_school() IS NULL);

  -- Everything is off until a student turns it on.
  c := public.counselor_caseload();
  PERFORM pg_temp.ok('the caseload has the three students who joined, by name',
    jsonb_array_length(c) = 3
    AND c #>> '{0,name}' = 'Ada Guard' AND c #>> '{1,name}' = 'Ben Guard' AND c #>> '{2,name}' = 'Cy Guard');
  PERFORM pg_temp.ok('before anyone shares, every section of every student is null',
    NOT EXISTS (SELECT 1 FROM jsonb_array_elements(c) e
                 WHERE e -> 'college_list' <> 'null'::jsonb OR e -> 'portfolio' <> 'null'::jsonb
                    OR e -> 'quest' <> 'null'::jsonb OR e -> 'essays' <> 'null'::jsonb));
  PERFORM pg_temp.ok('before anyone shares, nothing of any record is in the caseload',
    position('MARK' in c::text) = 0 AND position('CANARY' in c::text) = 0);
  c := public.counselor_student(pg_temp.u('a1'));
  PERFORM pg_temp.ok('before sharing, a student page holds a name, a grade and four nulls',
    c #>> '{student,name}' = 'Ada Guard' AND (c #>> '{student,grade}')::int = 11
    AND (c #>> '{student,graduation_year}')::int = 2028
    AND c -> 'portfolio' = 'null'::jsonb AND c -> 'college_list' = 'null'::jsonb
    AND c -> 'quest' = 'null'::jsonb AND c -> 'essays' = 'null'::jsonb
    AND position('MARK' in c::text) = 0 AND position('CANARY' in c::text) = 0);
END;
$$;


-- ── 7. Sharing: a1 everything, a2 nothing, a3 College List and essays ────────
SELECT pg_temp.be('a1');
DO $$
DECLARE
  v JSONB := public.set_sharing(true, true, true, true);
BEGIN
  PERFORM pg_temp.ok('set_sharing answers with the new switches',
    v -> 'sharing' = '{"college_list": true, "portfolio": true, "quest": true, "essays": true}'::jsonb);
END;
$$;
SELECT pg_temp.be('a3');
DO $$
DECLARE
  v JSONB := public.set_sharing(true, NULL, NULL, true);
BEGIN
  PERFORM pg_temp.ok('a switch sent as null is off',
    v -> 'sharing' = '{"college_list": true, "portfolio": false, "quest": false, "essays": true}'::jsonb);
END;
$$;
SELECT pg_temp.be('b1');
DO $$ BEGIN PERFORM pg_temp.ok('b1 shares everything with school B',
  public.set_sharing(true, true, true, true) #>> '{sharing,portfolio}' = 'true'); END; $$;


-- ── 8. What counselor A sees ──────────────────────────────────────────────────
SELECT pg_temp.be('ca');
DO $$
DECLARE
  c  JSONB := public.counselor_caseload();
  r1 JSONB := pg_temp.row_of(c, 'a1');
  r2 JSONB := pg_temp.row_of(c, 'a2');
  r3 JSONB := pg_temp.row_of(c, 'a3');
  d  JSONB;
BEGIN
  PERFORM pg_temp.ok('caseload: only school A''s students, nobody from school B or from no school',
    jsonb_array_length(c) = 3 AND r1 IS NOT NULL AND r2 IS NOT NULL AND r3 IS NOT NULL
    AND pg_temp.row_of(c, 'b1') IS NULL AND pg_temp.row_of(c, 'n1') IS NULL
    AND position('B1MARK' in c::text) = 0 AND position('N1MARK' in c::text) = 0
    AND position('Bea Other' in c::text) = 0 AND position('Nat Nobody' in c::text) = 0);
  PERFORM pg_temp.ok('caseload: never a canary (essay words, check-in words, chat, memory, private fields)',
    position('CANARY' in c::text) = 0);
  PERFORM pg_temp.ok('caseload: a row has exactly the agreed fields',
    pg_temp.keys(r1) = ARRAY['college_list', 'essays', 'grade', 'graduation_year', 'is_demo', 'linked_at', 'name',
                             'next_meeting_at', 'pending_requests', 'portfolio', 'quest', 'sharing', 'student_id']);

  -- a1 shares everything.
  PERFORM pg_temp.ok('caseload a1: who they are',
    r1 ->> 'name' = 'Ada Guard' AND (r1 ->> 'grade')::int = 11 AND (r1 ->> 'graduation_year')::int = 2028
    AND (r1 ->> 'is_demo')::boolean = false
    AND r1 -> 'sharing' = '{"college_list": true, "portfolio": true, "quest": true, "essays": true}'::jsonb);
  PERFORM pg_temp.ok('caseload a1: College List counts',
    r1 -> 'college_list' = '{"reach": 1, "target": 2, "likely": 0, "total": 3}'::jsonb);
  PERFORM pg_temp.ok('caseload a1: Portfolio counts',
    r1 -> 'portfolio' = '{"activities": 2, "awards": 1, "courses": 3, "has_gpa": true}'::jsonb);
  PERFORM pg_temp.ok('caseload a1: the quest under way, not the older or the retired one',
    r1 #>> '{quest,status}' = 'active' AND r1 #>> '{quest,title}' = 'A1MARK_QUEST'
    AND (r1 #>> '{quest,streak}')::int = 4
    AND (r1 #>> '{quest,milestones_done}')::int = 1 AND (r1 #>> '{quest,milestones_total}')::int = 3
    AND (r1 #>> '{quest,started_at}')::timestamptz = now() - interval '10 days'
    AND (r1 #>> '{quest,last_checkin_at}')::timestamptz = now() - interval '1 day');
  PERFORM pg_temp.ok('caseload a1: the quest has seven fields and no check-in text',
    pg_temp.all_keys(r1 -> 'quest') = ARRAY['last_checkin_at', 'milestones_done', 'milestones_total', 'started_at',
                                            'status', 'streak', 'title']);
  PERFORM pg_temp.ok('caseload a1: essay progress is the newer personal statement and two supplements',
    r1 -> 'essays' = '{"personal_statement": {"status": "revising", "word_count": 412},
                       "supplements": 2, "supplements_done": 1}'::jsonb);
  PERFORM pg_temp.ok('caseload a1: essays carry no title, school, prompt or text',
    pg_temp.all_keys(r1 -> 'essays') = ARRAY['personal_statement', 'status', 'supplements', 'supplements_done',
                                             'word_count']);
  PERFORM pg_temp.ok('caseload a1: no requests yet',
    (r1 ->> 'pending_requests')::int = 0 AND r1 -> 'next_meeting_at' = 'null'::jsonb);

  -- a2 shares nothing.
  PERFORM pg_temp.ok('caseload a2: name, grade and class, and four nulls',
    r2 ->> 'name' = 'Ben Guard' AND (r2 ->> 'grade')::int = 10 AND (r2 ->> 'graduation_year')::int = 2029
    AND r2 -> 'college_list' = 'null'::jsonb AND r2 -> 'portfolio' = 'null'::jsonb
    AND r2 -> 'quest' = 'null'::jsonb AND r2 -> 'essays' = 'null'::jsonb
    AND r2 -> 'sharing' = '{"college_list": false, "portfolio": false, "quest": false, "essays": false}'::jsonb);
  PERFORM pg_temp.ok('caseload: nothing of a2''s record anywhere', position('A2MARK' in c::text) = 0);

  -- a3 shares College List and essays only.
  PERFORM pg_temp.ok('caseload a3: the two shared sections are there, the other two are null',
    r3 -> 'college_list' = '{"reach": 1, "target": 2, "likely": 0, "total": 3}'::jsonb
    AND r3 #>> '{essays,personal_statement,status}' = 'revising'
    AND r3 -> 'portfolio' = 'null'::jsonb AND r3 -> 'quest' = 'null'::jsonb);
  PERFORM pg_temp.ok('caseload: a3''s quest and portfolio are nowhere in it',
    position('A3MARK_QUEST' in c::text) = 0 AND position('A3MARK_ACT' in c::text) = 0);

  -- The student page, a1.
  d := public.counselor_student(pg_temp.u('a1'));
  PERFORM pg_temp.ok('student a1: the page has exactly the agreed parts',
    pg_temp.keys(d) = ARRAY['college_list', 'essays', 'portfolio', 'quest', 'requests', 'sharing', 'student']
    AND pg_temp.keys(d -> 'student') = ARRAY['grade', 'graduation_year', 'id', 'linked_at', 'name']
    AND d #>> '{student,id}' = pg_temp.u('a1')::text AND d #>> '{student,name}' = 'Ada Guard');
  PERFORM pg_temp.ok('student a1: never a canary', position('CANARY' in d::text) = 0);
  PERFORM pg_temp.ok('student a1: nobody else''s record',
    position('A2MARK' in d::text) = 0 AND position('A3MARK' in d::text) = 0 AND position('B1MARK' in d::text) = 0);
  PERFORM pg_temp.ok('student a1: Portfolio has the grades, scores, courses, activities and awards',
    pg_temp.keys(d -> 'portfolio') = ARRAY['activities', 'awards', 'courses', 'gpa_scale', 'gpa_unweighted',
                                           'gpa_weighted', 'majors', 'test_scores']
    AND (d #>> '{portfolio,gpa_unweighted}')::numeric = 3.8 AND (d #>> '{portfolio,gpa_weighted}')::numeric = 4.2
    AND d #>> '{portfolio,gpa_scale}' = '4.0'
    AND d #> '{portfolio,majors}' = '["A1MARK_MAJOR"]'::jsonb
    AND jsonb_array_length(d #> '{portfolio,activities}') = 2
    AND d #>> '{portfolio,activities,0,title}' = 'A1MARK_ACT'
    AND (d #>> '{portfolio,activities,0,hours_per_week}')::numeric = 6.5
    AND d #> '{portfolio,activities,0,grade_levels}' = '[10, 11]'::jsonb
    AND jsonb_array_length(d #> '{portfolio,awards}') = 1 AND d #>> '{portfolio,awards,0,title}' = 'A1MARK_AWARD'
    AND jsonb_array_length(d #> '{portfolio,courses}') = 3 AND d #>> '{portfolio,courses,0,name}' = 'A1MARK_COURSE'
    AND (d #>> '{portfolio,courses,2,planned}')::boolean = true
    AND jsonb_array_length(d #> '{portfolio,test_scores}') = 2);
  PERFORM pg_temp.ok('student a1: each Portfolio row has only the agreed fields (no section scores)',
    pg_temp.keys(d #> '{portfolio,test_scores,0}') = ARRAY['score', 'subject', 'test_date', 'test_type']
    AND pg_temp.keys(d #> '{portfolio,courses,0}') = ARRAY['grade_level', 'level', 'name', 'planned']
    AND pg_temp.keys(d #> '{portfolio,activities,0}') = ARRAY['category', 'description', 'grade_levels',
          'hours_per_week', 'organization', 'position', 'title', 'weeks_per_year']
    AND pg_temp.keys(d #> '{portfolio,awards,0}') = ARRAY['description', 'grade_level', 'level', 'title', 'year']);
  PERFORM pg_temp.ok('student a1: College List, reach first',
    pg_temp.keys(d -> 'college_list') = ARRAY['schools']
    AND jsonb_array_length(d #> '{college_list,schools}') = 3
    AND d #>> '{college_list,schools,0,name}' = 'A1MARK_COLLEGE_REACH'
    AND d #>> '{college_list,schools,0,category}' = 'reach'
    AND (d #>> '{college_list,schools,0,admission_rate}')::numeric = 0.08
    AND (d #>> '{college_list,schools,0,net_price}')::int = 21000
    AND pg_temp.keys(d #> '{college_list,schools,0}') = ARRAY['admission_rate', 'category', 'category_source',
          'city', 'name', 'net_price', 'state']);
  PERFORM pg_temp.ok('student a1: Quest with its milestones, a count of check-ins and no word of them',
    d #>> '{quest,status}' = 'active' AND d #>> '{quest,title}' = 'A1MARK_QUEST'
    AND d #>> '{quest,summary}' = 'A1MARK_QUEST_SUMMARY'
    AND (d #>> '{quest,streak}')::int = 4 AND (d #>> '{quest,best_streak}')::int = 6
    AND (d #>> '{quest,checkins}')::int = 2
    AND (d #>> '{quest,last_checkin_at}')::timestamptz = now() - interval '1 day'
    AND jsonb_array_length(d #> '{quest,milestones}') = 3
    AND d #> '{quest,milestones,0}' = '{"position": 1, "title": "A1MARK_MILESTONE_ONE", "status": "done"}'::jsonb
    AND pg_temp.all_keys(d -> 'quest') = ARRAY['best_streak', 'checkins', 'last_checkin_at', 'milestones',
          'position', 'started_at', 'status', 'streak', 'summary', 'title']);
  PERFORM pg_temp.ok('student a1: essays are kind, stage, counts and a date, personal statements first',
    jsonb_array_length(d #> '{essays,essays}') = 4
    AND d #>> '{essays,essays,0,kind}' = 'personal_statement' AND d #>> '{essays,essays,0,status}' = 'revising'
    AND (d #>> '{essays,essays,0,word_count}')::int = 412 AND (d #>> '{essays,essays,0,word_limit}')::int = 650
    AND d #>> '{essays,essays,3,kind}' = 'supplement');
  PERFORM pg_temp.ok('student a1: essays never carry a title, school_name, prompt_text or body',
    pg_temp.all_keys(d -> 'essays') = ARRAY['essays', 'kind', 'status', 'updated_at', 'word_count', 'word_limit']);
  PERFORM pg_temp.ok('student a1: no key that only a private column has, anywhere on the page',
    NOT pg_temp.all_keys(d) && ARRAY['body', 'prompt_text', 'prompt_key', 'school_name', 'advisor_reply', 'followup',
          'followup_answer', 'section_scores', 'direction', 'detail', 'notes', 'chat_signals', 'narrative',
          'agent_instructions', 'email']);

  -- The student page, a2 (nothing shared) and a3 (two sections).
  d := public.counselor_student(pg_temp.u('a2'));
  PERFORM pg_temp.ok('student a2: a name and four nulls, nothing of the record',
    d #>> '{student,name}' = 'Ben Guard'
    AND d -> 'portfolio' = 'null'::jsonb AND d -> 'college_list' = 'null'::jsonb
    AND d -> 'quest' = 'null'::jsonb AND d -> 'essays' = 'null'::jsonb
    AND d -> 'requests' = '[]'::jsonb
    AND position('A2MARK' in d::text) = 0 AND position('CANARY' in d::text) = 0);
  d := public.counselor_student(pg_temp.u('a3'));
  PERFORM pg_temp.ok('student a3: College List and essays are there, Portfolio and Quest are null',
    d #>> '{college_list,schools,0,name}' = 'A3MARK_COLLEGE_REACH'
    AND jsonb_array_length(d #> '{essays,essays}') = 4
    AND d -> 'portfolio' = 'null'::jsonb AND d -> 'quest' = 'null'::jsonb
    AND position('A3MARK_ACT' in d::text) = 0 AND position('A3MARK_QUEST' in d::text) = 0
    AND position('A3MARK_MAJOR' in d::text) = 0 AND position('CANARY' in d::text) = 0);

  -- Anyone who is not linked to school A answers the same way.
  PERFORM pg_temp.refuses('a student of the other school: not_linked',
    $q$SELECT public.counselor_student(pg_temp.u('b1'))$q$, 'not_linked');
  PERFORM pg_temp.refuses('a real account linked to no school: not_linked',
    $q$SELECT public.counselor_student(pg_temp.u('n1'))$q$, 'not_linked');
  PERFORM pg_temp.refuses('an id that belongs to nobody: not_linked',
    $q$SELECT public.counselor_student('11111111-2222-4333-8444-555555555555')$q$, 'not_linked');
  PERFORM pg_temp.refuses('no id at all: not_linked', 'SELECT public.counselor_student(NULL)', 'not_linked');
  PERFORM pg_temp.refuses('the other school''s counselor: not_linked',
    $q$SELECT public.counselor_student(pg_temp.u('cb'))$q$, 'not_linked');
  PERFORM pg_temp.refuses('the counselor themselves: not_linked',
    $q$SELECT public.counselor_student(pg_temp.u('ca'))$q$, 'not_linked');
  PERFORM pg_temp.refuses('removing a student of the other school: not_linked',
    $q$SELECT public.remove_student(pg_temp.u('b1'))$q$, 'not_linked');
  PERFORM pg_temp.refuses('removing an id that belongs to nobody: not_linked',
    $q$SELECT public.remove_student('11111111-2222-4333-8444-555555555555')$q$, 'not_linked');
END;
$$;

-- Counselor B sees school B and nothing of school A.
SELECT pg_temp.be('cb');
DO $$
DECLARE
  c JSONB := public.counselor_caseload();
  d JSONB;
BEGIN
  PERFORM pg_temp.ok('counselor B''s caseload is b1 alone',
    jsonb_array_length(c) = 1 AND pg_temp.row_of(c, 'b1') IS NOT NULL
    AND position('A1MARK' in c::text) = 0 AND position('Ada Guard' in c::text) = 0
    AND position('CANARY' in c::text) = 0);
  PERFORM pg_temp.refuses('counselor B asking for a student of school A: not_linked',
    $q$SELECT public.counselor_student(pg_temp.u('a1'))$q$, 'not_linked');
  PERFORM pg_temp.refuses('counselor B removing a student of school A: not_linked',
    $q$SELECT public.remove_student(pg_temp.u('a2'))$q$, 'not_linked');
  d := public.counselor_student(pg_temp.u('b1'));
  PERFORM pg_temp.ok('counselor B reads their own student',
    d #>> '{portfolio,activities,0,title}' = 'B1MARK_ACT' AND position('A1MARK' in d::text) = 0);

  -- A counselor of one school who joins another as a student gains nothing there.
  d := public.join_school(pg_temp.get('code_a'));
  PERFORM pg_temp.ok('counselor B can join school A as a student', d #>> '{school,name}' = 'Guard School A');
  c := public.counselor_caseload();
  PERFORM pg_temp.ok('and still has only school B''s caseload', jsonb_array_length(c) = 1
    AND pg_temp.row_of(c, 'b1') IS NOT NULL);
  PERFORM pg_temp.refuses('and still cannot read a student of school A',
    $q$SELECT public.counselor_student(pg_temp.u('a1'))$q$, 'not_linked');
  PERFORM pg_temp.ok('leaving again', public.leave_school() = '{"left": true}'::jsonb);
END;
$$;

-- A linked student is not a counselor.
SELECT pg_temp.be('a2');
DO $$
BEGIN
  PERFORM pg_temp.refuses('a linked student: counselor_caseload', 'SELECT public.counselor_caseload()', 'not_counselor');
  PERFORM pg_temp.refuses('a linked student: counselor_student of a classmate',
    $q$SELECT public.counselor_student(pg_temp.u('a1'))$q$, 'not_counselor');
  PERFORM pg_temp.refuses('a linked student: counselor_requests', 'SELECT public.counselor_requests()', 'not_counselor');
  PERFORM pg_temp.refuses('a linked student: rotate_join_code', 'SELECT public.rotate_join_code()', 'not_counselor');
  PERFORM pg_temp.refuses('a linked student: remove_student',
    $q$SELECT public.remove_student(pg_temp.u('a1'))$q$, 'not_counselor');
END;
$$;


-- ── 9. No way around the functions ────────────────────────────────────────────
-- The six tables refuse a signed-in person outright, to read or to write.
SELECT pg_temp.be('ca');
DO $$
DECLARE
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['schools', 'counselors', 'school_links', 'meeting_requests',
                                 'counselor_digests', 'join_attempts'] LOOP
    PERFORM pg_temp.denied('a counselor cannot read ' || v_table || ' directly',
                           format('SELECT 1 FROM public.%I LIMIT 1', v_table));
    PERFORM pg_temp.denied('a counselor cannot delete from ' || v_table,
                           format('DELETE FROM public.%I', v_table));
  END LOOP;
  PERFORM pg_temp.denied('a counselor cannot move themselves to another school',
    $q$UPDATE public.counselors SET school_id = pg_temp.get('school_b')::uuid$q$);
  PERFORM pg_temp.denied('a counselor cannot write a link for a student',
    $q$INSERT INTO public.school_links (student_id, school_id, share_portfolio)
       VALUES (pg_temp.u('n1'), pg_temp.get('school_a')::uuid, true)$q$);
  PERFORM pg_temp.denied('a counselor cannot flip a student''s switch',
    $q$UPDATE public.school_links SET share_portfolio = true$q$);
  PERFORM pg_temp.denied('a counselor cannot call the digest functions',
    'SELECT public.counselor_digest_due()');
  PERFORM pg_temp.denied('a counselor cannot claim a digest',
    $q$SELECT public.counselor_digest_claim(pg_temp.u('ca'), 1)$q$);
  PERFORM pg_temp.denied('a counselor cannot release a digest',
    $q$SELECT public.counselor_digest_release(pg_temp.u('ca'))$q$);
  PERFORM pg_temp.denied('a counselor cannot call the code generator',
    'SELECT public.counselor_new_join_code()');
END;
$$;

-- Behind the functions the rows are really there (so "sees none" below means something).
SELECT pg_temp.be('admin');
DO $$
BEGIN
  PERFORM pg_temp.ok('a1''s record exists in every table the next check looks at',
    pg_temp.visible('student_activities', 'user_id', 'a1') = 2
    AND pg_temp.visible('student_awards', 'user_id', 'a1') = 1
    AND pg_temp.visible('student_courses', 'user_id', 'a1') = 3
    AND pg_temp.visible('student_test_scores', 'user_id', 'a1') = 2
    AND pg_temp.visible('college_list_items', 'user_id', 'a1') = 3
    AND pg_temp.visible('quests', 'user_id', 'a1') = 3
    AND pg_temp.visible('quest_milestones', 'user_id', 'a1') = 3
    AND pg_temp.visible('quest_tasks', 'user_id', 'a1') = 2
    AND pg_temp.visible('quest_checkins', 'user_id', 'a1') = 2
    AND pg_temp.visible('quest_stats', 'user_id', 'a1') = 1
    AND pg_temp.visible('essays', 'user_id', 'a1') = 4
    AND pg_temp.visible('essay_topics', 'user_id', 'a1') = 1
    AND pg_temp.visible('essay_versions', 'user_id', 'a1') = 1
    AND pg_temp.visible('essay_reviews', 'user_id', 'a1') = 1
    AND pg_temp.visible('student_memories', 'user_id', 'a1') = 1
    AND pg_temp.visible('chat_sessions', 'user_id', 'a1') = 1
    AND pg_temp.visible('profiles', 'id', 'a1') = 1);
END;
$$;

-- A counselor querying a student's tables directly sees none of their rows,
-- shared or not: the functions are the only way in.
SELECT pg_temp.be('ca');
DO $$
DECLARE
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['student_activities', 'student_awards', 'student_courses', 'student_test_scores',
                                 'college_list_items', 'quests', 'quest_milestones', 'quest_tasks', 'quest_checkins',
                                 'quest_stats', 'essays', 'essay_topics', 'essay_versions', 'essay_reviews',
                                 'student_memories', 'chat_sessions'] LOOP
    PERFORM pg_temp.ok('a counselor sees none of a linked, sharing student''s ' || v_table || ' directly',
      pg_temp.visible(v_table, 'user_id', 'a1') = 0);
  END LOOP;
  PERFORM pg_temp.ok('a counselor sees no student''s profile row directly',
    pg_temp.visible('profiles', 'id', 'a1') = 0 AND pg_temp.visible('profiles', 'id', 'a2') = 0);
END;
$$;

-- The same for one student looking at another, and the demo flag stays put.
SELECT pg_temp.be('a2');
DO $$
BEGIN
  PERFORM pg_temp.denied('a student cannot read school_links directly', 'SELECT 1 FROM public.school_links LIMIT 1');
  PERFORM pg_temp.denied('a student cannot flip their own switch outside set_sharing',
    $q$UPDATE public.school_links SET share_quest = true WHERE student_id = pg_temp.u('a2')$q$);
  PERFORM pg_temp.denied('a student cannot write a meeting request directly',
    $q$INSERT INTO public.meeting_requests (student_id, school_id, message, times)
       VALUES (pg_temp.u('a2'), pg_temp.get('school_a')::uuid, 'hi', '["2027-01-01T00:00:00Z"]')$q$);
  PERFORM pg_temp.denied('a student cannot clear their own join attempts', 'DELETE FROM public.join_attempts');
  PERFORM pg_temp.ok('a student sees none of a classmate''s activities, essays or profile directly',
    pg_temp.visible('student_activities', 'user_id', 'a1') = 0
    AND pg_temp.visible('essays', 'user_id', 'a1') = 0
    AND pg_temp.visible('profiles', 'id', 'a1') = 0
    AND pg_temp.visible('student_activities', 'user_id', 'a2') = 2);

  UPDATE public.profiles SET is_demo = true, bio = 'guard' WHERE id = pg_temp.u('a2');
  PERFORM pg_temp.ok('a student cannot mark their own profile as demo (the rest of the update lands)',
    (SELECT NOT p.is_demo AND p.bio = 'guard' FROM public.profiles p WHERE p.id = pg_temp.u('a2')));
END;
$$;


-- ── 10. Turning a switch off takes the section away on the next call ─────────
SELECT pg_temp.be('a1');
DO $$ BEGIN PERFORM pg_temp.ok('a1 turns Portfolio off',
  public.set_sharing(true, false, true, true) #>> '{sharing,portfolio}' = 'false'); END; $$;
SELECT pg_temp.be('ca');
DO $$
DECLARE
  c JSONB := public.counselor_caseload();
  d JSONB := public.counselor_student(pg_temp.u('a1'));
BEGIN
  PERFORM pg_temp.ok('caseload: a1''s Portfolio is null again, the rest stays',
    pg_temp.row_of(c, 'a1') -> 'portfolio' = 'null'::jsonb
    AND pg_temp.row_of(c, 'a1') #>> '{quest,title}' = 'A1MARK_QUEST');
  PERFORM pg_temp.ok('student page: a1''s Portfolio is null again and none of it is in the answer',
    d -> 'portfolio' = 'null'::jsonb
    AND position('A1MARK_ACT' in d::text) = 0 AND position('A1MARK_AWARD' in d::text) = 0
    AND position('A1MARK_COURSE' in d::text) = 0 AND position('A1MARK_MAJOR' in d::text) = 0
    AND d #>> '{quest,title}' = 'A1MARK_QUEST');
END;
$$;
SELECT pg_temp.be('a1');
DO $$ BEGIN PERFORM pg_temp.ok('a1 turns Portfolio back on',
  public.set_sharing(true, true, true, true) #>> '{sharing,portfolio}' = 'true'); END; $$;

-- A streak that was not kept up reads as 0.
SELECT pg_temp.be('admin');
UPDATE public.quest_stats SET streak_date = current_date - 2 WHERE user_id = pg_temp.u('a1');
SELECT pg_temp.be('ca');
DO $$ BEGIN PERFORM pg_temp.ok('a streak last kept two days ago shows as 0',
  (pg_temp.row_of(public.counselor_caseload(), 'a1') #>> '{quest,streak}')::int = 0
  AND (public.counselor_student(pg_temp.u('a1')) #>> '{quest,streak}')::int = 0
  AND (public.counselor_student(pg_temp.u('a1')) #>> '{quest,best_streak}')::int = 6); END; $$;
SELECT pg_temp.be('admin');
UPDATE public.quest_stats SET streak_date = current_date - 1 WHERE user_id = pg_temp.u('a1');
SELECT pg_temp.be('ca');
DO $$ BEGIN PERFORM pg_temp.ok('a streak kept yesterday still shows',
  (pg_temp.row_of(public.counselor_caseload(), 'a1') #>> '{quest,streak}')::int = 4); END; $$;


-- ── 11. Meeting requests ──────────────────────────────────────────────────────
SELECT pg_temp.be('a1');
DO $$
DECLARE
  v JSONB;
BEGIN
  PERFORM pg_temp.refuses('an empty message', $q$SELECT public.request_meeting('   ', ARRAY[now() + interval '1 day'])$q$,
    'bad_message');
  PERFORM pg_temp.refuses('a 301-character message',
    $q$SELECT public.request_meeting(repeat('m', 301), ARRAY[now() + interval '1 day'])$q$, 'bad_message');
  PERFORM pg_temp.refuses('no times', $q$SELECT public.request_meeting('hello', ARRAY[]::timestamptz[])$q$, 'bad_times');
  PERFORM pg_temp.refuses('null times', $q$SELECT public.request_meeting('hello', NULL)$q$, 'bad_times');
  PERFORM pg_temp.refuses('four times',
    $q$SELECT public.request_meeting('hello', ARRAY[now() + interval '1 day', now() + interval '2 days',
                                                     now() + interval '3 days', now() + interval '4 days'])$q$,
    'bad_times');
  PERFORM pg_temp.refuses('a time in the past',
    $q$SELECT public.request_meeting('hello', ARRAY[now() - interval '1 minute'])$q$, 'bad_times');
  PERFORM pg_temp.refuses('a time 61 days out',
    $q$SELECT public.request_meeting('hello', ARRAY[now() + interval '61 days'])$q$, 'bad_times');
  PERFORM pg_temp.refuses('a null among the times',
    $q$SELECT public.request_meeting('hello', ARRAY[now() + interval '1 day', NULL])$q$, 'bad_times');

  v := public.request_meeting('  A1 first request  ', ARRAY[now() + interval '2 days', now() + interval '1 day',
                                                           now() + interval '2 days']);
  PERFORM pg_temp.ok('a request is saved trimmed, waiting, with its times in the order given and no repeats',
    v ->> 'message' = 'A1 first request' AND v ->> 'status' = 'pending'
    AND v -> 'meeting_at' = 'null'::jsonb AND v ->> 'counselor_note' = ''
    AND jsonb_array_length(v -> 'times') = 2
    AND (v #>> '{times,0}')::timestamptz = now() + interval '2 days'
    AND (v #>> '{times,1}')::timestamptz = now() + interval '1 day'
    AND pg_temp.keys(v) = ARRAY['counselor_note', 'created_at', 'id', 'meeting_at', 'message', 'status', 'times']);
  PERFORM pg_temp.put('req1', v ->> 'id');

  v := public.request_meeting('A1 second request', ARRAY[now() + interval '60 days']);
  PERFORM pg_temp.put('req2', v ->> 'id');
  PERFORM pg_temp.refuses('a third request while two are waiting',
    $q$SELECT public.request_meeting('A1 third request', ARRAY[now() + interval '1 day'])$q$, 'too_many_open');
  PERFORM pg_temp.ok('my_school lists the student''s two requests',
    jsonb_array_length(public.my_school() -> 'requests') = 2);
END;
$$;

SELECT pg_temp.be('a3');
DO $$ BEGIN PERFORM pg_temp.put('req_a3',
  public.request_meeting('A3 request', ARRAY[now() + interval '5 days']) ->> 'id'); END; $$;
SELECT pg_temp.be('b1');
DO $$ BEGIN PERFORM pg_temp.put('req_b1',
  public.request_meeting('B1 request', ARRAY[now() + interval '5 days']) ->> 'id'); END; $$;

-- a3 asked first, for the order below.
SELECT pg_temp.be('admin');
UPDATE public.meeting_requests SET created_at = now() - interval '2 hours' WHERE id = pg_temp.get('req_a3')::uuid;

-- A student cannot answer a request, their own or anyone's.
SELECT pg_temp.be('a1');
DO $$
BEGIN
  PERFORM pg_temp.refuses('a student cannot confirm their own request',
    $q$SELECT public.answer_request(pg_temp.get('req1')::uuid, 'confirm', now() + interval '1 day', '')$q$,
    'not_counselor');
  PERFORM pg_temp.refuses('a student cannot decline a classmate''s request',
    $q$SELECT public.answer_request(pg_temp.get('req_a3')::uuid, 'decline', NULL, '')$q$, 'not_counselor');
END;
$$;

-- The other school's counselor cannot see or answer it.
SELECT pg_temp.be('cb');
DO $$
DECLARE
  q JSONB := public.counselor_requests();
BEGIN
  PERFORM pg_temp.ok('counselor B''s schedule holds school B''s request only',
    jsonb_array_length(q) = 1 AND q #>> '{0,id}' = pg_temp.get('req_b1')
    AND position('A1 first request' in q::text) = 0 AND position('Ada Guard' in q::text) = 0);
  PERFORM pg_temp.refuses('counselor B cannot confirm a request of school A',
    $q$SELECT public.answer_request(pg_temp.get('req1')::uuid, 'confirm', now() + interval '1 day', '')$q$,
    'no_request');
  PERFORM pg_temp.refuses('counselor B cannot decline a request of school A',
    $q$SELECT public.answer_request(pg_temp.get('req1')::uuid, 'decline', NULL, 'no')$q$, 'no_request');
END;
$$;
SELECT pg_temp.be('admin');
DO $$ BEGIN PERFORM pg_temp.ok('and the request is untouched',
  (SELECT r.status = 'pending' AND r.counselor_note = '' AND r.answered_by IS NULL
     FROM public.meeting_requests r WHERE r.id = pg_temp.get('req1')::uuid)); END; $$;

SELECT pg_temp.be('ca');
DO $$
DECLARE
  q JSONB := public.counselor_requests();
  v JSONB;
  c JSONB;
BEGIN
  PERFORM pg_temp.ok('counselor A''s schedule: three waiting, the oldest first, none from school B',
    jsonb_array_length(q) = 3 AND q #>> '{0,id}' = pg_temp.get('req_a3')
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(q) e WHERE e ->> 'status' <> 'pending')
    AND position('B1 request' in q::text) = 0 AND position('Bea Other' in q::text) = 0
    AND position('CANARY' in q::text) = 0 AND position('MARK' in q::text) = 0);
  PERFORM pg_temp.ok('a schedule entry has exactly the agreed fields',
    pg_temp.keys(q -> 0) = ARRAY['counselor_note', 'created_at', 'grade', 'id', 'meeting_at', 'message',
                                 'shares_portfolio', 'status', 'student_id', 'student_name', 'times']
    AND q #>> '{0,student_name}' = 'Cy Guard' AND (q #>> '{0,grade}')::int = 12
    AND (q #>> '{0,shares_portfolio}')::boolean = false
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(q) e
                 WHERE e ->> 'student_name' = 'Ada Guard' AND (e ->> 'shares_portfolio')::boolean));

  PERFORM pg_temp.refuses('answering an id that belongs to no request',
    $q$SELECT public.answer_request('11111111-2222-4333-8444-555555555555', 'decline', NULL, '')$q$, 'no_request');
  PERFORM pg_temp.refuses('answering a request of the other school',
    $q$SELECT public.answer_request(pg_temp.get('req_b1')::uuid, 'decline', NULL, '')$q$, 'no_request');
  PERFORM pg_temp.refuses('an action that is neither confirm nor decline',
    $q$SELECT public.answer_request(pg_temp.get('req1')::uuid, 'approve', now() + interval '1 day', '')$q$, 'bad_action');
  PERFORM pg_temp.refuses('confirming with no time',
    $q$SELECT public.answer_request(pg_temp.get('req1')::uuid, 'confirm', NULL, '')$q$, 'bad_time');
  PERFORM pg_temp.refuses('confirming a time in the past',
    $q$SELECT public.answer_request(pg_temp.get('req1')::uuid, 'confirm', now() - interval '1 hour', '')$q$, 'bad_time');
  PERFORM pg_temp.refuses('confirming a time 121 days out',
    $q$SELECT public.answer_request(pg_temp.get('req1')::uuid, 'confirm', now() + interval '121 days', '')$q$, 'bad_time');

  v := public.answer_request(pg_temp.get('req1')::uuid, 'confirm', now() + interval '3 days', repeat('n', 400));
  PERFORM pg_temp.ok('confirming sets the time and keeps a note of at most 300 characters',
    v ->> 'status' = 'confirmed' AND (v ->> 'meeting_at')::timestamptz = now() + interval '3 days'
    AND char_length(v ->> 'counselor_note') = 300 AND v ->> 'student_name' = 'Ada Guard'
    AND pg_temp.keys(v) = pg_temp.keys(q -> 0));
  v := public.answer_request(pg_temp.get('req1')::uuid, 'confirm', now() + interval '4 days', 'Moved a day');
  PERFORM pg_temp.ok('a confirmed request can be moved',
    v ->> 'status' = 'confirmed' AND (v ->> 'meeting_at')::timestamptz = now() + interval '4 days'
    AND v ->> 'counselor_note' = 'Moved a day');

  v := public.answer_request(pg_temp.get('req2')::uuid, 'decline', NULL, '  Not this month  ');
  PERFORM pg_temp.ok('declining closes the request with the note, trimmed',
    v ->> 'status' = 'declined' AND v -> 'meeting_at' = 'null'::jsonb AND v ->> 'counselor_note' = 'Not this month');
  PERFORM pg_temp.refuses('a declined request cannot be answered again',
    $q$SELECT public.answer_request(pg_temp.get('req2')::uuid, 'confirm', now() + interval '1 day', '')$q$,
    'already_closed');

  q := public.counselor_requests();
  PERFORM pg_temp.ok('the schedule now reads: waiting, then confirmed, then declined',
    jsonb_array_length(q) = 3
    AND q #>> '{0,status}' = 'pending' AND q #>> '{1,status}' = 'confirmed' AND q #>> '{2,status}' = 'declined');

  c := public.counselor_caseload();
  PERFORM pg_temp.ok('the caseload counts what is waiting and shows the next meeting',
    (pg_temp.row_of(c, 'a1') ->> 'pending_requests')::int = 0
    AND (pg_temp.row_of(c, 'a1') ->> 'next_meeting_at')::timestamptz = now() + interval '4 days'
    AND (pg_temp.row_of(c, 'a3') ->> 'pending_requests')::int = 1
    AND pg_temp.row_of(c, 'a3') -> 'next_meeting_at' = 'null'::jsonb
    AND (pg_temp.row_of(c, 'a2') ->> 'pending_requests')::int = 0);

  v := public.counselor_student(pg_temp.u('a1'));
  PERFORM pg_temp.ok('the student page lists that student''s requests and nobody else''s',
    jsonb_array_length(v -> 'requests') = 2
    AND position('A3 request' in v::text) = 0
    AND pg_temp.keys(v #> '{requests,0}') = ARRAY['counselor_note', 'created_at', 'id', 'meeting_at', 'message',
                                                  'status', 'times']);
END;
$$;

-- The student sees the answers, and cancels.
SELECT pg_temp.be('a2');
DO $$ BEGIN PERFORM pg_temp.refuses('a student cannot cancel a classmate''s request',
  $q$SELECT public.cancel_request(pg_temp.get('req1')::uuid)$q$, 'no_request'); END; $$;
SELECT pg_temp.be('a1');
DO $$
DECLARE
  m JSONB := public.my_school();
  v JSONB;
BEGIN
  PERFORM pg_temp.ok('the student sees one confirmed with its time and note, one declined, and only their own',
    jsonb_array_length(m -> 'requests') = 2
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(m -> 'requests') e
                 WHERE e ->> 'status' = 'confirmed' AND e ->> 'counselor_note' = 'Moved a day'
                   AND (e ->> 'meeting_at')::timestamptz = now() + interval '4 days')
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(m -> 'requests') e
                 WHERE e ->> 'status' = 'declined' AND e ->> 'counselor_note' = 'Not this month')
    AND position('A3 request' in m::text) = 0);
  PERFORM pg_temp.refuses('a declined request cannot be cancelled',
    $q$SELECT public.cancel_request(pg_temp.get('req2')::uuid)$q$, 'no_request');
  v := public.cancel_request(pg_temp.get('req1')::uuid);
  PERFORM pg_temp.ok('cancelling a confirmed meeting closes it and clears the time',
    v ->> 'status' = 'cancelled' AND v -> 'meeting_at' = 'null'::jsonb);
  PERFORM pg_temp.refuses('cancelling twice', $q$SELECT public.cancel_request(pg_temp.get('req1')::uuid)$q$, 'no_request');
  -- Nothing is waiting any more, so there is room for a new one.
  v := public.request_meeting('A1 third request', ARRAY[now() + interval '7 days']);
  PERFORM pg_temp.put('req3', v ->> 'id');
END;
$$;
SELECT pg_temp.be('ca');
DO $$
BEGIN
  PERFORM pg_temp.refuses('a cancelled request cannot be answered',
    $q$SELECT public.answer_request(pg_temp.get('req1')::uuid, 'confirm', now() + interval '1 day', '')$q$,
    'already_closed');
  PERFORM pg_temp.ok('the caseload drops the cancelled meeting',
    pg_temp.row_of(public.counselor_caseload(), 'a1') -> 'next_meeting_at' = 'null'::jsonb
    AND (pg_temp.row_of(public.counselor_caseload(), 'a1') ->> 'pending_requests')::int = 1);
END;
$$;


-- ── 12. The daily email's three functions ─────────────────────────────────────
SELECT pg_temp.be('service');
DO $$
DECLARE
  d  JSONB := public.counselor_digest_due();
  ea JSONB;
  eb JSONB;
BEGIN
  SELECT e INTO ea FROM jsonb_array_elements(d) e WHERE e ->> 'counselor_id' = pg_temp.u('ca')::text;
  SELECT e INTO eb FROM jsonb_array_elements(d) e WHERE e ->> 'counselor_id' = pg_temp.u('cb')::text;
  PERFORM pg_temp.ok('due: counselor A, with two students waiting, by address and school',
    ea ->> 'email' = 'guard-ca@guard.mentorable.invalid' AND ea ->> 'school_name' = 'Guard School A'
    AND (ea ->> 'pending')::int = 2
    AND pg_temp.keys(ea) = ARRAY['counselor_id', 'email', 'pending', 'school_name']);
  PERFORM pg_temp.ok('due: counselor B, with one', (eb ->> 'pending')::int = 1);
  PERFORM pg_temp.ok('due: no student''s name or message is in the answer',
    position('Guard' in (ea - 'school_name' - 'email')::text) = 0
    AND position('Ada' in d::text) = 0 AND position('Cy ' in d::text) = 0
    AND position('request' in d::text) = 0 AND position('MARK' in d::text) = 0
    AND position('CANARY' in d::text) = 0);

  PERFORM pg_temp.ok('claim: the first call takes today',
    public.counselor_digest_claim(pg_temp.u('ca'), 2) = 'true'::jsonb);
  PERFORM pg_temp.ok('claim: the second call does not',
    public.counselor_digest_claim(pg_temp.u('ca'), 2) = 'false'::jsonb);
  d := public.counselor_digest_due();
  PERFORM pg_temp.ok('a counselor emailed today is not due again, the other still is',
    NOT EXISTS (SELECT 1 FROM jsonb_array_elements(d) e WHERE e ->> 'counselor_id' = pg_temp.u('ca')::text)
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(d) e WHERE e ->> 'counselor_id' = pg_temp.u('cb')::text));
  PERFORM pg_temp.ok('release: gives today back', public.counselor_digest_release(pg_temp.u('ca')) = 'true'::jsonb);
  PERFORM pg_temp.ok('release: nothing to give back twice',
    public.counselor_digest_release(pg_temp.u('ca')) = 'false'::jsonb);
  PERFORM pg_temp.ok('after a release the counselor is due again',
    EXISTS (SELECT 1 FROM jsonb_array_elements(public.counselor_digest_due()) e
             WHERE e ->> 'counselor_id' = pg_temp.u('ca')::text));
  PERFORM pg_temp.refuses('the backend has no caseload of its own', 'SELECT public.counselor_caseload()',
    'not_signed_in');
END;
$$;

-- Yesterday's email covered everything waiting now: nothing new, so not due.
SELECT pg_temp.be('admin');
INSERT INTO public.counselor_digests (counselor_id, day, count, sent_at)
VALUES (pg_temp.u('ca'), current_date - 1, 2, now());
SELECT pg_temp.be('service');
DO $$ BEGIN PERFORM pg_temp.ok('nothing new since the last email: not due',
  NOT EXISTS (SELECT 1 FROM jsonb_array_elements(public.counselor_digest_due()) e
               WHERE e ->> 'counselor_id' = pg_temp.u('ca')::text)); END; $$;
-- Move that email back an hour: a3's request (two hours old) was already covered
-- by it, a1's newest was not.
SELECT pg_temp.be('admin');
UPDATE public.counselor_digests SET sent_at = now() - interval '1 hour' WHERE counselor_id = pg_temp.u('ca');
SELECT pg_temp.be('service');
DO $$ BEGIN PERFORM pg_temp.ok('one request since the last email: due, counting only the new one',
  (SELECT (e ->> 'pending')::int FROM jsonb_array_elements(public.counselor_digest_due()) e
    WHERE e ->> 'counselor_id' = pg_temp.u('ca')::text) = 1); END; $$;
SELECT pg_temp.be('admin');
UPDATE public.schools SET is_demo = true WHERE id = pg_temp.get('school_a')::uuid;
UPDATE auth.users SET email_confirmed_at = NULL WHERE id = pg_temp.u('cb');
SELECT pg_temp.be('service');
DO $$ BEGIN PERFORM pg_temp.ok('a demo school and an unconfirmed address are never emailed',
  NOT EXISTS (SELECT 1 FROM jsonb_array_elements(public.counselor_digest_due()) e
               WHERE e ->> 'counselor_id' IN (pg_temp.u('ca')::text, pg_temp.u('cb')::text))); END; $$;
SELECT pg_temp.be('admin');
UPDATE public.schools SET is_demo = false WHERE id = pg_temp.get('school_a')::uuid;
UPDATE auth.users SET email_confirmed_at = now() WHERE id = pg_temp.u('cb');
DELETE FROM public.counselor_digests WHERE counselor_id = pg_temp.u('ca');


-- ── 13. The join code's hourly limit ──────────────────────────────────────────
-- Ten tries an hour, and a wrong guess has to count. The proof is the row: a
-- wrong code is answered without an exception, so the try that counted it is
-- still there afterwards.
SELECT pg_temp.be('r1');
DO $$
DECLARE
  v JSONB;
  k_wrong CONSTANT TEXT[] := ARRAY['ZZZZZZZZ', '', 'SHORT', 'ABCDEFGH', '22222222', 'not a code at all',
                                   'ZZZZ-ZZZZ', 'QQQQQQQQ', 'ZZZZZZZZZZZZZZZZ', '99999999'];
  v_code TEXT;
BEGIN
  FOREACH v_code IN ARRAY k_wrong LOOP
    BEGIN
      v := public.join_school(v_code);
    EXCEPTION WHEN OTHERS THEN
      -- This block undoes what the call wrote, exactly as a failed request would.
      RAISE EXCEPTION 'GUARD FAILED: a wrong join code raised "%": an exception undoes the try that counted it, so the hourly limit would never fill', SQLERRM;
    END;
    IF v IS DISTINCT FROM '{"code": "P0001", "message": "bad_code", "details": null, "hint": null}'::jsonb THEN
      RAISE EXCEPTION 'GUARD FAILED: a wrong code was not answered bad_code (%: %)', v_code, v;
    END IF;
  END LOOP;
  PERFORM pg_temp.ok('ten wrong codes are each answered bad_code, in the shape the API sends for a refusal', true);
  PERFORM pg_temp.ok('and the answer goes out as HTTP 400', current_setting('response.status', true) = '400');
  PERFORM pg_temp.ok('none of them linked the student', public.my_school() IS NULL);
END;
$$;
SELECT pg_temp.be('admin');
DO $$ BEGIN PERFORM pg_temp.ok('all ten wrong tries were kept',
  (SELECT count(*) FROM public.join_attempts a WHERE a.user_id = pg_temp.u('r1')) = 10); END; $$;
SELECT pg_temp.be('r1');
DO $$
BEGIN
  PERFORM pg_temp.refuses('the eleventh try in an hour is refused', $q$SELECT public.join_school('ZZZZZZZZ')$q$,
    'too_many_tries');
  PERFORM pg_temp.refuses('and so is the right code, until the hour is up',
    $q$SELECT public.join_school(pg_temp.get('code_a'))$q$, 'too_many_tries');
  PERFORM pg_temp.ok('still not linked', public.my_school() IS NULL);
END;
$$;
SELECT pg_temp.be('admin');
UPDATE public.join_attempts SET at = at - interval '61 minutes' WHERE user_id = pg_temp.u('r1');
SELECT pg_temp.be('r1');
DO $$ BEGIN PERFORM pg_temp.ok('an hour later the right code works',
  public.join_school(pg_temp.get('code_a')) #>> '{school,name}' = 'Guard School A'); END; $$;
SELECT pg_temp.be('admin');
DO $$ BEGIN PERFORM pg_temp.ok('a try that worked is counted too',
  (SELECT count(*) FROM public.join_attempts a
    WHERE a.user_id = pg_temp.u('r1') AND a.at > now() - interval '1 hour') = 1); END; $$;
UPDATE public.join_attempts SET at = at - interval '2 days' WHERE user_id = pg_temp.u('r1');
SELECT pg_temp.be('r1');
DO $$ BEGIN
  PERFORM pg_temp.ok('r1 leaves', public.leave_school() = '{"left": true}'::jsonb);
  PERFORM pg_temp.ok('and joins again', public.join_school(pg_temp.get('code_a')) -> 'school' IS NOT NULL);
END; $$;
SELECT pg_temp.be('admin');
DO $$ BEGIN PERFORM pg_temp.ok('tries older than a day are cleared away',
  (SELECT count(*) FROM public.join_attempts a WHERE a.user_id = pg_temp.u('r1')) = 1); END; $$;
-- Deleting the account takes the link and the tries with it.
DELETE FROM auth.users WHERE id = pg_temp.u('r1');
DO $$ BEGIN PERFORM pg_temp.ok('deleting an account removes its link and its tries',
  NOT EXISTS (SELECT 1 FROM public.school_links l WHERE l.student_id = pg_temp.u('r1'))
  AND NOT EXISTS (SELECT 1 FROM public.join_attempts a WHERE a.user_id = pg_temp.u('r1'))); END; $$;


-- ── 14. A new join code ───────────────────────────────────────────────────────
SELECT pg_temp.be('ca');
DO $$
DECLARE
  k_old CONSTANT TEXT := pg_temp.get('code_a');
  v JSONB := public.rotate_join_code();
BEGIN
  PERFORM pg_temp.ok('rotating gives a different, well-formed code',
    pg_temp.keys(v) = ARRAY['join_code'] AND v ->> 'join_code' <> k_old
    AND (v ->> 'join_code') ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$'
    AND public.counselor_me() #>> '{school,join_code}' = v ->> 'join_code');
  PERFORM pg_temp.put('old_code_a', k_old);
  PERFORM pg_temp.put('code_a', v ->> 'join_code');
  PERFORM pg_temp.ok('everyone already linked is still linked',
    jsonb_array_length(public.counselor_caseload()) = 3
    AND (public.counselor_me() #>> '{school,student_count}')::int = 3
    AND public.counselor_student(pg_temp.u('a1')) #>> '{quest,title}' = 'A1MARK_QUEST');
END;
$$;
SELECT pg_temp.be('cb');
DO $$ BEGIN PERFORM pg_temp.ok('the other school''s code did not change',
  public.counselor_me() #>> '{school,join_code}' = pg_temp.get('code_b')); END; $$;
SELECT pg_temp.be('n2');
DO $$
DECLARE
  v JSONB := public.join_school(pg_temp.get('old_code_a'));
BEGIN
  PERFORM pg_temp.ok('the old code stops working, answered like any wrong code',
    v = '{"code": "P0001", "message": "bad_code", "details": null, "hint": null}'::jsonb
    AND public.my_school() IS NULL);
  v := public.join_school(pg_temp.get('code_a'));
  PERFORM pg_temp.ok('the new code works', v #>> '{school,name}' = 'Guard School A');
  PERFORM pg_temp.ok('n2 shares everything',
    public.set_sharing(true, true, true, true) #>> '{sharing,essays}' = 'true');
  PERFORM pg_temp.put('req_n2', public.request_meeting('N2 request', ARRAY[now() + interval '2 days']) ->> 'id');
END;
$$;

-- A student with no name and an empty record, sharing everything: the empty shapes.
SELECT pg_temp.be('ca');
DO $$
DECLARE
  r JSONB := pg_temp.row_of(public.counselor_caseload(), 'n2');
  d JSONB := public.counselor_student(pg_temp.u('n2'));
BEGIN
  PERFORM pg_temp.ok('caseload: a student with no name reads "Student", and empty sections are present, not null',
    r ->> 'name' = 'Student' AND r -> 'grade' = 'null'::jsonb
    AND r -> 'college_list' = '{"reach": 0, "target": 0, "likely": 0, "total": 0}'::jsonb
    AND r -> 'portfolio' = '{"activities": 0, "awards": 0, "courses": 0, "has_gpa": false}'::jsonb
    AND r -> 'quest' = '{"status": "none", "title": null, "started_at": null, "streak": null, "milestones_done": null,
                         "milestones_total": null, "last_checkin_at": null}'::jsonb
    AND r -> 'essays' = '{"personal_statement": null, "supplements": 0, "supplements_done": 0}'::jsonb);
  PERFORM pg_temp.ok('student page: the same student, with empty lists and no quest',
    d #>> '{student,name}' = 'Student'
    AND d #> '{portfolio,activities}' = '[]'::jsonb AND d #> '{portfolio,test_scores}' = '[]'::jsonb
    AND d #> '{portfolio,majors}' = '[]'::jsonb AND d #> '{portfolio,gpa_unweighted}' = 'null'::jsonb
    AND d -> 'college_list' = '{"schools": []}'::jsonb
    AND d #>> '{quest,status}' = 'none' AND d #> '{quest,milestones}' = '[]'::jsonb
    AND (d #>> '{quest,checkins}')::int = 0 AND d #> '{quest,title}' = 'null'::jsonb
    AND d -> 'essays' = '{"essays": []}'::jsonb
    AND jsonb_array_length(d -> 'requests') = 1);
END;
$$;


-- ── 15. Leaving, and being removed ────────────────────────────────────────────
SELECT pg_temp.be('a3');
DO $$
BEGIN
  PERFORM pg_temp.ok('a3 leaves the school', public.leave_school() = '{"left": true}'::jsonb);
  PERFORM pg_temp.ok('and is linked to nothing', public.my_school() IS NULL);
  PERFORM pg_temp.refuses('leaving twice', 'SELECT public.leave_school()', 'not_linked');
  PERFORM pg_temp.refuses('no sharing without a link', 'SELECT public.set_sharing(true, true, true, true)', 'not_linked');
END;
$$;
SELECT pg_temp.be('admin');
DO $$ BEGIN PERFORM pg_temp.ok('nothing of a3 is left with the school, and their own record is untouched',
  NOT EXISTS (SELECT 1 FROM public.school_links l WHERE l.student_id = pg_temp.u('a3'))
  AND NOT EXISTS (SELECT 1 FROM public.meeting_requests r WHERE r.student_id = pg_temp.u('a3'))
  AND pg_temp.visible('student_activities', 'user_id', 'a3') = 2
  AND pg_temp.visible('essays', 'user_id', 'a3') = 4); END; $$;
SELECT pg_temp.be('ca');
DO $$
DECLARE
  c JSONB := public.counselor_caseload();
  q JSONB := public.counselor_requests();
BEGIN
  PERFORM pg_temp.ok('after leaving: gone from the caseload',
    pg_temp.row_of(c, 'a3') IS NULL AND jsonb_array_length(c) = 3
    AND position('Cy Guard' in c::text) = 0 AND position('A3MARK' in c::text) = 0);
  PERFORM pg_temp.refuses('after leaving: the student page answers not_linked',
    $q$SELECT public.counselor_student(pg_temp.u('a3'))$q$, 'not_linked');
  PERFORM pg_temp.ok('after leaving: their request is gone from the schedule',
    position('A3 request' in q::text) = 0 AND position('Cy Guard' in q::text) = 0);
  PERFORM pg_temp.refuses('after leaving: their request cannot be answered',
    $q$SELECT public.answer_request(pg_temp.get('req_a3')::uuid, 'decline', NULL, '')$q$, 'no_request');
  PERFORM pg_temp.refuses('after leaving: they cannot be removed either',
    $q$SELECT public.remove_student(pg_temp.u('a3'))$q$, 'not_linked');

  PERFORM pg_temp.ok('a counselor removes a student of their own school',
    public.remove_student(pg_temp.u('a1')) = '{"removed": true}'::jsonb);
  PERFORM pg_temp.refuses('removed: the student page answers not_linked',
    $q$SELECT public.counselor_student(pg_temp.u('a1'))$q$, 'not_linked');
  PERFORM pg_temp.refuses('removing twice', $q$SELECT public.remove_student(pg_temp.u('a1'))$q$, 'not_linked');
  PERFORM pg_temp.ok('removed: gone from the caseload and the schedule',
    pg_temp.row_of(public.counselor_caseload(), 'a1') IS NULL
    AND position('Ada Guard' in public.counselor_requests()::text) = 0);
END;
$$;
SELECT pg_temp.be('a1');
DO $$ BEGIN PERFORM pg_temp.ok('the removed student is linked to nothing', public.my_school() IS NULL); END; $$;
SELECT pg_temp.be('admin');
DO $$
BEGIN
  PERFORM pg_temp.ok('the removed student''s requests went with the link',
    NOT EXISTS (SELECT 1 FROM public.meeting_requests r WHERE r.student_id = pg_temp.u('a1')));
  -- The schema holds the same line by itself: a link deleted by any route takes its requests.
  DELETE FROM public.school_links WHERE student_id = pg_temp.u('n2');
  PERFORM pg_temp.ok('deleting a link by hand deletes its requests too',
    NOT EXISTS (SELECT 1 FROM public.meeting_requests r WHERE r.student_id = pg_temp.u('n2')));
  PERFORM pg_temp.ok('school B was never touched by any of this',
    (SELECT count(*) FROM public.school_links l WHERE l.school_id = pg_temp.get('school_b')::uuid) = 1
    AND (SELECT count(*) FROM public.meeting_requests r WHERE r.school_id = pg_temp.get('school_b')::uuid) = 1);
END;
$$;


-- ── 16. A day's limit on requests, and a cut on the schedule's closed list ───
-- "Two waiting at once" is not a limit by itself: cancelling frees a place, so
-- a student could request and cancel in a loop and bury the counselor's
-- schedule. Six requests in any 24 hours, whatever became of them, is.
SELECT pg_temp.be('ca');
DO $$ BEGIN PERFORM pg_temp.ok('school A''s schedule is empty before the loop',
  public.counselor_requests() = '[]'::jsonb); END; $$;

SELECT pg_temp.be('a2');
DO $$
DECLARE
  v JSONB;
BEGIN
  FOR i IN 1..6 LOOP
    v := public.request_meeting('A2 loop ' || i, ARRAY[now() + interval '3 days']);
    v := public.cancel_request((v ->> 'id')::uuid);
  END LOOP;
  PERFORM pg_temp.ok('six requests in a day go through, each cancelled before the next',
    v ->> 'status' = 'cancelled' AND v ->> 'message' = 'A2 loop 6');
  PERFORM pg_temp.refuses('a seventh request inside 24 hours is refused, though nothing is waiting',
    $q$SELECT public.request_meeting('A2 loop 7', ARRAY[now() + interval '3 days'])$q$, 'too_many_today');
END;
$$;
SELECT pg_temp.be('admin');
DO $$ BEGIN PERFORM pg_temp.ok('the loop left six rows, all cancelled, and the refused request wrote nothing',
  (SELECT count(*) = 6 AND count(*) FILTER (WHERE r.status = 'cancelled') = 6
     FROM public.meeting_requests r WHERE r.student_id = pg_temp.u('a2'))); END; $$;

-- One of the six slides out of the 24 hours: there is room for exactly one more.
UPDATE public.meeting_requests SET created_at = now() - interval '24 hours 1 minute'
 WHERE student_id = pg_temp.u('a2') AND message = 'A2 loop 1';
SELECT pg_temp.be('a2');
DO $$
BEGIN
  PERFORM pg_temp.put('req_a2', public.request_meeting('A2 next day', ARRAY[now() + interval '3 days']) ->> 'id');
  PERFORM pg_temp.ok('a request older than 24 hours no longer counts', pg_temp.get('req_a2') IS NOT NULL);
  PERFORM pg_temp.refuses('and the one after it is refused again',
    $q$SELECT public.request_meeting('A2 one more', ARRAY[now() + interval '3 days'])$q$, 'too_many_today');
END;
$$;
-- Answered ones count like cancelled ones: the limit is on asking, not on what is open.
SELECT pg_temp.be('ca');
DO $$ BEGIN PERFORM pg_temp.ok('the counselor confirms that request',
  public.answer_request(pg_temp.get('req_a2')::uuid, 'confirm', now() + interval '3 days', '') ->> 'status'
    = 'confirmed'); END; $$;
SELECT pg_temp.be('a2');
DO $$ BEGIN PERFORM pg_temp.refuses('a confirmed request still counts toward the day',
  $q$SELECT public.request_meeting('A2 one more', ARRAY[now() + interval '3 days'])$q$, 'too_many_today'); END; $$;

-- The schedule's closed list: the last 14 days, and never more than the newest 50.
SELECT pg_temp.be('admin');
INSERT INTO public.meeting_requests (student_id, school_id, message, times, status, created_at, updated_at)
VALUES (pg_temp.u('a2'), pg_temp.get('school_a')::uuid, 'A2 waiting', '["2027-01-01T00:00:00Z"]', 'pending',
        now() - interval '3 days', now() - interval '3 days'),
       (pg_temp.u('a2'), pg_temp.get('school_a')::uuid, 'A2 long ago', '["2027-01-01T00:00:00Z"]', 'declined',
        now() - interval '20 days', now() - interval '15 days');
SELECT pg_temp.be('ca');
DO $$
DECLARE
  q JSONB := public.counselor_requests();
BEGIN
  PERFORM pg_temp.ok('the schedule: one waiting, one confirmed, the six cancelled, and nothing closed over 14 days ago',
    jsonb_array_length(q) = 8
    AND q #>> '{0,message}' = 'A2 waiting' AND q #>> '{0,status}' = 'pending'
    AND q #>> '{1,message}' = 'A2 next day' AND q #>> '{1,status}' = 'confirmed'
    AND (SELECT count(*) FROM jsonb_array_elements(q) e
          WHERE e ->> 'status' = 'cancelled' AND e ->> 'message' LIKE 'A2 loop %') = 6
    AND position('A2 long ago' in q::text) = 0);
END;
$$;
-- Sixty more closed in the last hour, one a minute, some declined and some
-- cancelled. With the six from the loop that is 66 inside the 14 days.
SELECT pg_temp.be('admin');
INSERT INTO public.meeting_requests (student_id, school_id, message, times, status, created_at, updated_at)
SELECT pg_temp.u('a2'), pg_temp.get('school_a')::uuid, 'A2 closed ' || g, '["2027-01-01T00:00:00Z"]',
       CASE WHEN g % 2 = 0 THEN 'cancelled' ELSE 'declined' END,
       now() - interval '2 days', now() - make_interval(mins => g)
  FROM generate_series(1, 60) AS g;
SELECT pg_temp.be('ca');
DO $$
DECLARE
  q JSONB := public.counselor_requests();
BEGIN
  PERFORM pg_temp.ok('with 66 closed in the window the schedule carries 50 of them, and everything open',
    jsonb_array_length(q) = 52
    AND q #>> '{0,message}' = 'A2 waiting' AND q #>> '{0,status}' = 'pending'
    AND q #>> '{1,message}' = 'A2 next day' AND q #>> '{1,status}' = 'confirmed'
    AND (SELECT count(*) FROM jsonb_array_elements(q) e WHERE e ->> 'status' IN ('declined', 'cancelled')) = 50);
  PERFORM pg_temp.ok('the 50 kept are the newest: the six just cancelled and the 44 closed most recently',
    (SELECT count(*) FROM jsonb_array_elements(q) e WHERE e ->> 'message' LIKE 'A2 loop %') = 6
    AND (SELECT count(*) FROM jsonb_array_elements(q) e WHERE e ->> 'message' LIKE 'A2 closed %') = 44
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(q) e
                     WHERE e ->> 'message' LIKE 'A2 closed %'
                       AND split_part(e ->> 'message', ' ', 3)::int > 44)
    AND q #>> '{51,message}' = 'A2 closed 44');
  PERFORM pg_temp.ok('a meeting a student cancelled is still shown, beside the declined ones',
    EXISTS (SELECT 1 FROM jsonb_array_elements(q) e
             WHERE e ->> 'status' = 'cancelled' AND e ->> 'message' LIKE 'A2 closed %')
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(q) e
                 WHERE e ->> 'status' = 'declined' AND e ->> 'message' LIKE 'A2 closed %'));
END;
$$;
SELECT pg_temp.be('admin');
DO $$ BEGIN PERFORM pg_temp.ok('the cut is on what is listed: all 69 rows are still there behind it',
  (SELECT count(*) FROM public.meeting_requests r WHERE r.student_id = pg_temp.u('a2')) = 69); END; $$;


-- ── 17. The demo school takes only accounts the owner flagged ────────────────
-- The demo school's counselor login is shared with judges and its code is on
-- screen in every walkthrough. A real student who typed that code would hand
-- their name, and whatever they ticked, to everyone holding that password. So
-- to a real account the code does not exist.
SELECT pg_temp.be('dc');
DO $$
DECLARE
  v JSONB := public.create_school('Guard Demo School', 'Demo Counselor');
BEGIN
  PERFORM pg_temp.put('code_d', v #>> '{school,join_code}');
  PERFORM pg_temp.put('school_d', v #>> '{school,id}');
END;
$$;
-- What the seed does to the school, and what the owner does by hand to the one
-- test account that may join it.
SELECT pg_temp.be('admin');
UPDATE public.schools SET is_demo = true WHERE id = pg_temp.get('school_d')::uuid;
UPDATE public.profiles SET is_demo = true WHERE id = pg_temp.u('d2');
DO $$ BEGIN PERFORM pg_temp.ok('the owner can flag a school and a test account as demo',
  (SELECT s.is_demo FROM public.schools s WHERE s.id = pg_temp.get('school_d')::uuid)
  AND (SELECT p.is_demo FROM public.profiles p WHERE p.id = pg_temp.u('d2'))
  AND NOT (SELECT p.is_demo FROM public.profiles p WHERE p.id = pg_temp.u('d1'))); END; $$;

SELECT pg_temp.be('d1');
DO $$
DECLARE
  v JSONB;
  k_wrong CONSTANT JSONB := '{"code": "P0001", "message": "bad_code", "details": null, "hint": null}';
BEGIN
  PERFORM set_config('response.status', '', true);
  v := public.join_school(pg_temp.get('code_d'));
  PERFORM pg_temp.ok('demo school: a real account entering its code is answered exactly like a wrong code',
    v = k_wrong AND current_setting('response.status', true) = '400' AND public.my_school() IS NULL);
  PERFORM pg_temp.refuses('demo school: so the real account has nothing to share with it',
    'SELECT public.set_sharing(true, true, true, true)', 'not_linked');
  PERFORM pg_temp.refuses('demo school: and no meeting to ask for',
    $q$SELECT public.request_meeting('hello', ARRAY[now() + interval '1 day'])$q$, 'not_linked');

  -- Nobody can flag themselves (the trigger keeps the flag), so that opens nothing.
  UPDATE public.profiles SET is_demo = true WHERE id = pg_temp.u('d1');
  v := public.join_school(pg_temp.get('code_d'));
  PERFORM pg_temp.ok('demo school: an account cannot flag itself to get in',
    v = k_wrong AND public.my_school() IS NULL);
END;
$$;
-- A student of another school is told the same thing: not even "already linked"
-- says the code is real.
SELECT pg_temp.be('a2');
DO $$ BEGIN PERFORM pg_temp.ok('demo school: a student linked elsewhere is told bad_code too, and stays where they are',
  public.join_school(pg_temp.get('code_d'))
    = '{"code": "P0001", "message": "bad_code", "details": null, "hint": null}'::jsonb
  AND public.my_school() #>> '{school,name}' = 'Guard School A'); END; $$;
SELECT pg_temp.be('admin');
DO $$ BEGIN PERFORM pg_temp.ok('demo school: both of the real account''s tries were counted, and no link was written',
  (SELECT count(*) FROM public.join_attempts a WHERE a.user_id = pg_temp.u('d1')) = 2
  AND NOT (SELECT p.is_demo FROM public.profiles p WHERE p.id = pg_temp.u('d1'))
  AND NOT EXISTS (SELECT 1 FROM public.school_links l WHERE l.student_id = pg_temp.u('d1'))
  AND NOT EXISTS (SELECT 1 FROM public.school_links l WHERE l.school_id = pg_temp.get('school_d')::uuid)); END; $$;
SELECT pg_temp.be('dc');
DO $$
BEGIN
  PERFORM pg_temp.ok('demo school: the shared counselor login has nobody on its caseload',
    public.counselor_caseload() = '[]'::jsonb
    AND (public.counselor_me() #>> '{school,student_count}')::int = 0
    AND (public.counselor_me() #>> '{school,is_demo}')::boolean);
  PERFORM pg_temp.refuses('demo school: and cannot open the real account''s page',
    $q$SELECT public.counselor_student(pg_temp.u('d1'))$q$, 'not_linked');
END;
$$;

-- The account the owner flagged gets in like anyone joining a school.
SELECT pg_temp.be('d2');
DO $$
DECLARE
  v JSONB := public.join_school(pg_temp.get('code_d'));
BEGIN
  PERFORM pg_temp.ok('demo school: an account the owner flagged joins, with every switch off',
    v #>> '{school,name}' = 'Guard Demo School'
    AND v -> 'sharing' = '{"college_list": false, "portfolio": false, "quest": false, "essays": false}'::jsonb);
  PERFORM pg_temp.ok('demo school: and shares what it likes',
    public.set_sharing(true, true, true, true) #>> '{sharing,portfolio}' = 'true');
END;
$$;
SELECT pg_temp.be('dc');
DO $$
DECLARE
  c JSONB := public.counselor_caseload();
BEGIN
  PERFORM pg_temp.ok('demo school: the caseload is the flagged account alone, marked demo, and nothing of the real one',
    jsonb_array_length(c) = 1 AND (pg_temp.row_of(c, 'd2') ->> 'is_demo')::boolean
    AND pg_temp.row_of(c, 'd1') IS NULL
    AND position('Dee Real' in c::text) = 0 AND position('D1MARK' in c::text) = 0
    AND position('CANARY' in c::text) = 0);
END;
$$;
-- The gate is the school's flag and nothing about the account: an ordinary
-- school takes the same real account, and what they share reaches its counselor.
SELECT pg_temp.be('d1');
DO $$ BEGIN
  PERFORM pg_temp.ok('an ordinary school still takes that real account',
    public.join_school(pg_temp.get('code_a')) #>> '{school,name}' = 'Guard School A');
  PERFORM pg_temp.ok('who shares their Portfolio there',
    public.set_sharing(false, true, false, false) #>> '{sharing,portfolio}' = 'true');
END; $$;
SELECT pg_temp.be('ca');
DO $$ BEGIN PERFORM pg_temp.ok('and the ordinary school''s counselor reads it',
  public.counselor_student(pg_temp.u('d1')) #>> '{portfolio,activities,0,title}' = 'D1MARK_ACT'); END; $$;


-- ── The result ────────────────────────────────────────────────────────────────
SELECT 'counselor guard: ' || pg_temp.get('passed') || ' checks passed, 0 failed' AS result,
       pg_temp.get('passed')::int AS passed;

ROLLBACK;
