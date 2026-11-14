-- The interview guard test. Proves, against the real database, that a mock
-- interview in public.interview_mocks (20261113_agents_interview.sql) belongs
-- to its student alone: they read and delete their own rows and nothing else,
-- they can never write a row (the backend writes everything), the signed-out
-- role reaches nothing, every CHECK refuses a bad value, a conversation is
-- only ever one mock, and deleting the account takes every mock with it.
--
-- Run it after the migration is applied:
--   supabase db query --linked -f supabase/tests/interview_guard.sql
--
-- It is one transaction that ends in ROLLBACK: the accounts and mocks it makes
-- (addresses at guard.mentorable.invalid) never exist outside it. Every check
-- raises "GUARD FAILED: <what>" the moment it is wrong, which stops the run
-- and undoes everything; the last row says how many checks passed.
--
-- It acts as each person the way the API does: the authenticated role with the
-- person's id in the request's claims, so auth.uid() is theirs, the same way
-- counselor_guard.sql does.

BEGIN;

-- ── Helpers (in the session's temporary schema, gone with the transaction) ────

-- The people in this test, by a short name: two students with mocks, one whose
-- account is deleted at the end, and one who never has a mock.
CREATE FUNCTION pg_temp.u(p_who TEXT) RETURNS UUID LANGUAGE sql IMMUTABLE AS $$
  SELECT ('9a11d100-0000-4000-8000-' || lpad(to_hex(array_position(
    ARRAY['s1', 's2', 's3', 'e1'], p_who)), 12, '0'))::uuid
$$;

-- Become someone: a signed-in person by short name, or 'admin' (the owner, for
-- setting up and looking behind RLS), 'anon' (signed out), 'service' (the
-- backend) or 'nobody' (the signed-in role with no id in its claims).
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

-- Notes carried from one step to the next (a mock's id).
CREATE FUNCTION pg_temp.put(p_key TEXT, p_value TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('interview_guard.' || p_key, p_value, true);
END;
$$;
CREATE FUNCTION pg_temp.get(p_key TEXT) RETURNS TEXT LANGUAGE sql AS $$
  SELECT current_setting('interview_guard.' || p_key, true)
$$;

CREATE FUNCTION pg_temp.pass(p_name TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('interview_guard.passed',
                     (coalesce(nullif(current_setting('interview_guard.passed', true), ''), '0')::int + 1)::text,
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

-- The statement must break a constraint: this SQLSTATE, and when p_which is
-- given, this constraint (or, for a NOT NULL, this column). Naming the
-- constraint proves the right CHECK fired, not some other one.
CREATE FUNCTION pg_temp.violates(p_name TEXT, p_sql TEXT, p_state TEXT, p_which TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
  v_message    TEXT;
  v_state      TEXT;
  v_constraint TEXT;
  v_column     TEXT;
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT, v_state = RETURNED_SQLSTATE,
                            v_constraint = CONSTRAINT_NAME, v_column = COLUMN_NAME;
    IF v_state = p_state AND (p_which IS NULL OR p_which IN (v_constraint, v_column)) THEN
      PERFORM pg_temp.pass(p_name);
      RETURN;
    END IF;
    RAISE EXCEPTION 'GUARD FAILED: % (wanted % on %, got "%" [%] on %/%)',
      p_name, p_state, coalesce(p_which, 'any'), v_message, v_state, v_constraint, v_column;
  END;
  RAISE EXCEPTION 'GUARD FAILED: % (wanted % on %, but it went through)', p_name, p_state, coalesce(p_which, 'any');
END;
$$;

-- The statement must go through.
CREATE FUNCTION pg_temp.accepts(p_name TEXT, p_sql TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_message TEXT;
  v_state   TEXT;
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT, v_state = RETURNED_SQLSTATE;
    RAISE EXCEPTION 'GUARD FAILED: % (wanted it to go through, got "%" [%])', p_name, v_message, v_state;
  END;
  PERFORM pg_temp.pass(p_name);
END;
$$;

-- Write one mock for a person the way the backend does, from a valid row with
-- some fields changed (a JSON null sets a column to NULL). Returns its id.
CREATE FUNCTION pg_temp.mock(p_who TEXT, p_set JSONB DEFAULT '{}'::jsonb) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
  v_id UUID := gen_random_uuid();
BEGIN
  INSERT INTO public.interview_mocks
  SELECT * FROM jsonb_populate_record(NULL::public.interview_mocks,
    jsonb_build_object(
      'id', v_id, 'user_id', pg_temp.u(p_who), 'mode', 'college', 'target', 'Guard College',
      'role', NULL, 'details', '', 'status', 'live', 'refund_reason', NULL,
      'conversation_id', 'conv_guard_' || replace(v_id::text, '-', ''),
      'started_at', now(), 'transcript', '[]'::jsonb, 'feedback_tries', 0,
      'created_at', now(), 'updated_at', now()) || p_set);
  RETURN v_id;
END;
$$;

-- How many mocks the current role can see, for one person or for anyone.
CREATE FUNCTION pg_temp.seen(p_who TEXT DEFAULT NULL) RETURNS BIGINT LANGUAGE sql AS $$
  SELECT count(*) FROM public.interview_mocks m WHERE p_who IS NULL OR m.user_id = pg_temp.u(p_who)
$$;

-- How many mocks a person really has, behind RLS. Call it as admin.
CREATE FUNCTION pg_temp.held(p_who TEXT) RETURNS BIGINT LANGUAGE sql AS $$
  SELECT count(*) FROM public.interview_mocks m WHERE m.user_id = pg_temp.u(p_who)
$$;


-- ── 0. Setup: four accounts ───────────────────────────────────────────────────
SELECT pg_temp.put('passed', '0');

DO $$
BEGIN
  IF to_regclass('public.interview_mocks') IS NULL THEN
    RAISE EXCEPTION 'GUARD FAILED: public.interview_mocks does not exist; apply 20261113_agents_interview.sql first';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users u
              WHERE u.email LIKE 'poise-%@guard.mentorable.invalid'
                 OR u.id::text LIKE '9a11d100-0000-4000-8000-%') THEN
    RAISE EXCEPTION 'GUARD FAILED: the test accounts already exist; nothing was changed';
  END IF;
END;
$$;

INSERT INTO auth.users
  (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data,
   raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new,
   email_change)
SELECT pg_temp.u(w), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'poise-' || w || '@guard.mentorable.invalid', '', now(),
       '{"provider": "email", "providers": ["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', ''
  FROM unnest(ARRAY['s1', 's2', 's3', 'e1']) AS w;

DO $$ BEGIN PERFORM pg_temp.ok('the four test accounts exist',
  (SELECT count(*) FROM auth.users u WHERE u.id::text LIKE '9a11d100-0000-4000-8000-%') = 4); END; $$;


-- ── 1. The table's shape: RLS, policies, grants, index, keys ─────────────────
DO $$
DECLARE
  v_priv TEXT;
BEGIN
  PERFORM pg_temp.ok('RLS is on',
    (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = 'public.interview_mocks'::regclass));

  PERFORM pg_temp.ok('exactly two policies: SELECT and DELETE',
    (SELECT array_agg(p.cmd ORDER BY p.cmd) FROM pg_policies p
      WHERE p.schemaname = 'public' AND p.tablename = 'interview_mocks') = ARRAY['DELETE', 'SELECT']);
  PERFORM pg_temp.ok('both policies are for the signed-in role only, permissive, and keyed on (SELECT auth.uid())',
    NOT EXISTS (SELECT 1 FROM pg_policies p
                 WHERE p.schemaname = 'public' AND p.tablename = 'interview_mocks'
                   AND (p.roles <> ARRAY['authenticated']::name[] OR p.permissive <> 'PERMISSIVE'
                        OR p.qual IS NULL OR p.qual NOT LIKE '%SELECT auth.uid()%'
                        OR p.qual NOT LIKE '%user_id%' OR p.with_check IS NOT NULL)));

  FOREACH v_priv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
    PERFORM pg_temp.ok('anon holds no ' || v_priv || ' on the table',
      NOT has_table_privilege('anon', 'public.interview_mocks', v_priv));
  END LOOP;
  FOREACH v_priv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'] LOOP
    PERFORM pg_temp.ok('anon holds no ' || v_priv || ' on any column',
      NOT has_any_column_privilege('anon', 'public.interview_mocks', v_priv));
  END LOOP;

  PERFORM pg_temp.ok('a student holds SELECT and DELETE',
    has_table_privilege('authenticated', 'public.interview_mocks', 'SELECT')
    AND has_table_privilege('authenticated', 'public.interview_mocks', 'DELETE'));
  FOREACH v_priv IN ARRAY ARRAY['INSERT', 'UPDATE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
    PERFORM pg_temp.ok('a student holds no ' || v_priv || ' on the table',
      NOT has_table_privilege('authenticated', 'public.interview_mocks', v_priv));
  END LOOP;
  FOREACH v_priv IN ARRAY ARRAY['INSERT', 'UPDATE', 'REFERENCES'] LOOP
    PERFORM pg_temp.ok('a student holds no ' || v_priv || ' on any column',
      NOT has_any_column_privilege('authenticated', 'public.interview_mocks', v_priv));
  END LOOP;

  PERFORM pg_temp.ok('the backend (service role) can read and write, past RLS',
    has_table_privilege('service_role', 'public.interview_mocks', 'SELECT')
    AND has_table_privilege('service_role', 'public.interview_mocks', 'INSERT')
    AND has_table_privilege('service_role', 'public.interview_mocks', 'UPDATE')
    AND has_table_privilege('service_role', 'public.interview_mocks', 'DELETE')
    AND (SELECT r.rolbypassrls FROM pg_roles r WHERE r.rolname = 'service_role'));

  PERFORM pg_temp.ok('the list index is (user_id, created_at DESC)',
    (SELECT i.indexdef FROM pg_indexes i
      WHERE i.schemaname = 'public' AND i.indexname = 'interview_mocks_user_idx')
    = 'CREATE INDEX interview_mocks_user_idx ON public.interview_mocks USING btree (user_id, created_at DESC)');
  PERFORM pg_temp.ok('conversation_id carries a UNIQUE constraint',
    EXISTS (SELECT 1 FROM pg_constraint c
             WHERE c.conrelid = 'public.interview_mocks'::regclass AND c.contype = 'u'
               AND c.conkey = ARRAY[(SELECT a.attnum FROM pg_attribute a
                                      WHERE a.attrelid = 'public.interview_mocks'::regclass
                                        AND a.attname = 'conversation_id')]));
  PERFORM pg_temp.ok('user_id references auth.users and cascades on delete',
    EXISTS (SELECT 1 FROM pg_constraint c
             WHERE c.conrelid = 'public.interview_mocks'::regclass AND c.contype = 'f'
               AND c.confrelid = 'auth.users'::regclass AND c.confdeltype = 'c'));

  -- Nothing in the database reads the table on a student's or counselor's
  -- behalf: RLS is the only way in, and no SECURITY DEFINER function goes round it.
  PERFORM pg_temp.ok('no database function mentions interview_mocks',
    NOT EXISTS (SELECT 1 FROM pg_proc p
                  JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
                   AND n.nspname NOT LIKE 'pg_temp%'
                   AND p.prosrc LIKE '%interview_mocks%'));
END;
$$;


-- ── 2. A row the backend writes gets the right defaults ──────────────────────
SELECT pg_temp.be('service');
DO $$
DECLARE
  v_id UUID;
  r    public.interview_mocks;
BEGIN
  INSERT INTO public.interview_mocks (user_id, mode, target, conversation_id)
  VALUES (pg_temp.u('s3'), 'college', 'Guard College', 'conv_guard_defaults')
  RETURNING id INTO v_id;
  SELECT * INTO r FROM public.interview_mocks m WHERE m.id = v_id;
  PERFORM pg_temp.ok('a new mock starts live, with an empty transcript and no feedback, scores or refund',
    r.status = 'live' AND r.transcript = '[]'::jsonb AND r.feedback IS NULL AND r.scores IS NULL
    AND r.refund_reason IS NULL AND r.details = '' AND r.role IS NULL AND r.feedback_tries = 0
    AND r.ended_at IS NULL AND r.claimed_at IS NULL AND r.duration_s IS NULL AND r.student_words IS NULL
    AND r.started_at IS NOT NULL AND r.created_at IS NOT NULL AND r.updated_at IS NOT NULL);
END;
$$;


-- ── 3. Every CHECK refuses a bad value (as the backend, which passes RLS) ────
-- All on s3, whose account is deleted in section 8.
SELECT pg_temp.be('service');
DO $$
BEGIN
  -- mode
  PERFORM pg_temp.violates('mode must be college or internship',
    $q$SELECT pg_temp.mock('s3', '{"mode": "phone", "role": "Guard role"}')$q$, '23514', 'interview_mocks_mode_check');
  PERFORM pg_temp.violates('mode is not case-folded',
    $q$SELECT pg_temp.mock('s3', '{"mode": "College", "role": "Guard role"}')$q$, '23514', 'interview_mocks_mode_check');
  PERFORM pg_temp.violates('mode cannot be NULL',
    $q$SELECT pg_temp.mock('s3', '{"mode": null}')$q$, '23502', 'mode');

  -- target
  PERFORM pg_temp.violates('target cannot be empty',
    $q$SELECT pg_temp.mock('s3', '{"target": ""}')$q$, '23514', 'interview_mocks_target_check');
  PERFORM pg_temp.violates('target cannot be over 120 characters',
    format($q$SELECT pg_temp.mock('s3', %L)$q$, jsonb_build_object('target', repeat('t', 121))),
    '23514', 'interview_mocks_target_check');
  PERFORM pg_temp.accepts('target of exactly 120 characters is fine',
    format($q$SELECT pg_temp.mock('s3', %L)$q$, jsonb_build_object('target', repeat('t', 120))));
  PERFORM pg_temp.violates('target cannot be NULL',
    $q$SELECT pg_temp.mock('s3', '{"target": null}')$q$, '23502', 'target');

  -- role, and the internship rule
  PERFORM pg_temp.violates('an internship needs a role',
    $q$SELECT pg_temp.mock('s3', '{"mode": "internship", "target": "Guard Labs", "role": null}')$q$,
    '23514', 'interview_mocks_check');
  PERFORM pg_temp.accepts('an internship with a role is fine',
    $q$SELECT pg_temp.mock('s3', '{"mode": "internship", "target": "Guard Labs", "role": "Research intern"}')$q$);
  PERFORM pg_temp.accepts('a college interview without a role is fine',
    $q$SELECT pg_temp.mock('s3', '{"mode": "college", "role": null}')$q$);
  PERFORM pg_temp.violates('role cannot be empty',
    $q$SELECT pg_temp.mock('s3', '{"mode": "internship", "role": ""}')$q$, '23514', 'interview_mocks_role_check');
  PERFORM pg_temp.violates('role cannot be over 120 characters',
    format($q$SELECT pg_temp.mock('s3', %L)$q$,
           jsonb_build_object('mode', 'internship', 'role', repeat('r', 121))),
    '23514', 'interview_mocks_role_check');

  -- details
  PERFORM pg_temp.violates('details cannot be over 1500 characters',
    format($q$SELECT pg_temp.mock('s3', %L)$q$, jsonb_build_object('details', repeat('d', 1501))),
    '23514', 'interview_mocks_details_check');
  PERFORM pg_temp.accepts('details of exactly 1500 characters is fine',
    format($q$SELECT pg_temp.mock('s3', %L)$q$, jsonb_build_object('details', repeat('d', 1500))));
  PERFORM pg_temp.violates('details cannot be NULL (empty is the default)',
    $q$SELECT pg_temp.mock('s3', '{"details": null}')$q$, '23502', 'details');

  -- status
  PERFORM pg_temp.violates('status must be one of the five',
    $q$SELECT pg_temp.mock('s3', '{"status": "pending"}')$q$, '23514', 'interview_mocks_status_check');
  PERFORM pg_temp.violates('status has no starting state',
    $q$SELECT pg_temp.mock('s3', '{"status": "starting"}')$q$, '23514', 'interview_mocks_status_check');
  PERFORM pg_temp.accepts('every listed status is fine',
    $q$SELECT pg_temp.mock('s3', jsonb_build_object('status', s)) FROM unnest(ARRAY['live', 'scoring', 'done', 'no_feedback', 'refunded']) AS s$q$);

  -- refund_reason
  PERFORM pg_temp.violates('refund_reason must be no_call or too_short',
    $q$SELECT pg_temp.mock('s3', '{"status": "refunded", "refund_reason": "handoff"}')$q$,
    '23514', 'interview_mocks_refund_reason_check');
  PERFORM pg_temp.accepts('both refund reasons are fine',
    $q$SELECT pg_temp.mock('s3', jsonb_build_object('status', 'refunded', 'refund_reason', r)) FROM unnest(ARRAY['no_call', 'too_short']) AS r$q$);

  -- conversation_id
  PERFORM pg_temp.violates('conversation_id cannot be NULL',
    $q$SELECT pg_temp.mock('s3', '{"conversation_id": null}')$q$, '23502', 'conversation_id');
  PERFORM pg_temp.violates('conversation_id cannot be empty',
    $q$SELECT pg_temp.mock('s3', '{"conversation_id": ""}')$q$, '23514', 'interview_mocks_conversation_id_check');
  PERFORM pg_temp.violates('conversation_id cannot be over 120 characters',
    format($q$SELECT pg_temp.mock('s3', %L)$q$, jsonb_build_object('conversation_id', 'conv_' || repeat('c', 116))),
    '23514', 'interview_mocks_conversation_id_check');

  -- numbers
  PERFORM pg_temp.violates('duration_s cannot be negative',
    $q$SELECT pg_temp.mock('s3', '{"duration_s": -1}')$q$, '23514', 'interview_mocks_duration_s_check');
  PERFORM pg_temp.violates('duration_s cannot be over an hour',
    $q$SELECT pg_temp.mock('s3', '{"duration_s": 3601}')$q$, '23514', 'interview_mocks_duration_s_check');
  PERFORM pg_temp.accepts('duration_s of 0 and of 3600 are fine',
    $q$SELECT pg_temp.mock('s3', jsonb_build_object('duration_s', d)) FROM unnest(ARRAY[0, 3600]) AS d$q$);
  PERFORM pg_temp.violates('student_words cannot be negative',
    $q$SELECT pg_temp.mock('s3', '{"student_words": -1}')$q$, '23514', 'interview_mocks_student_words_check');
  PERFORM pg_temp.violates('feedback_tries cannot be negative',
    $q$SELECT pg_temp.mock('s3', '{"feedback_tries": -1}')$q$, '23514', 'interview_mocks_feedback_tries_check');
  PERFORM pg_temp.violates('feedback_tries cannot be over 5',
    $q$SELECT pg_temp.mock('s3', '{"feedback_tries": 6}')$q$, '23514', 'interview_mocks_feedback_tries_check');

  -- JSON shapes
  PERFORM pg_temp.violates('transcript must be an array, not an object',
    $q$SELECT pg_temp.mock('s3', '{"transcript": {"who": "student", "text": "hi"}}')$q$,
    '23514', 'interview_mocks_transcript_check');
  PERFORM pg_temp.violates('transcript must be an array, not a string',
    $q$SELECT pg_temp.mock('s3', '{"transcript": "hello"}')$q$, '23514', 'interview_mocks_transcript_check');
  PERFORM pg_temp.violates('transcript cannot be NULL',
    $q$SELECT pg_temp.mock('s3', '{"transcript": null}')$q$, '23502', 'transcript');
  PERFORM pg_temp.violates('feedback must be an object',
    $q$SELECT pg_temp.mock('s3', '{"feedback": []}')$q$, '23514', 'interview_mocks_feedback_check');
  PERFORM pg_temp.violates('scores must be an object',
    $q$SELECT pg_temp.mock('s3', '{"scores": [3, 4]}')$q$, '23514', 'interview_mocks_scores_check');

  -- the owner
  PERFORM pg_temp.violates('user_id cannot be NULL',
    $q$SELECT pg_temp.mock('s3', '{"user_id": null}')$q$, '23502', 'user_id');
  PERFORM pg_temp.violates('user_id must be a real account',
    $q$SELECT pg_temp.mock('s3', '{"user_id": "11111111-2222-4333-8444-555555555555"}')$q$, '23503', NULL);
END;
$$;

-- An update is held to the same CHECKs as an insert.
DO $$
DECLARE
  v_id UUID := pg_temp.mock('s3');
BEGIN
  PERFORM pg_temp.violates('an update cannot set a bad status',
    format($q$UPDATE public.interview_mocks SET status = 'won' WHERE id = %L$q$, v_id),
    '23514', 'interview_mocks_status_check');
  PERFORM pg_temp.violates('an update cannot set a non-array transcript',
    format($q$UPDATE public.interview_mocks SET transcript = '{}'::jsonb WHERE id = %L$q$, v_id),
    '23514', 'interview_mocks_transcript_check');
  PERFORM pg_temp.violates('an update cannot drop the role of an internship',
    format($q$UPDATE public.interview_mocks SET mode = 'internship', role = NULL WHERE id = %L$q$, v_id),
    '23514', 'interview_mocks_check');
END;
$$;


-- ── 4. A conversation is only ever one mock ──────────────────────────────────
DO $$
BEGIN
  PERFORM pg_temp.mock('s3', '{"conversation_id": "conv_guard_unique"}');
  PERFORM pg_temp.violates('the same conversation_id twice for one student is refused',
    $q$SELECT pg_temp.mock('s3', '{"conversation_id": "conv_guard_unique"}')$q$,
    '23505', 'interview_mocks_conversation_id_key');
  PERFORM pg_temp.violates('the same conversation_id for another student is refused too',
    $q$SELECT pg_temp.mock('s1', '{"conversation_id": "conv_guard_unique"}')$q$,
    '23505', 'interview_mocks_conversation_id_key');
END;
$$;


-- ── 5. The mocks the rest of the test reads ──────────────────────────────────
-- s1: two finished mocks. s2: one. Each carries a marker so a leak is visible.
DO $$
BEGIN
  PERFORM pg_temp.put('s1_a', pg_temp.mock('s1', jsonb_build_object(
    'status', 'done', 'conversation_id', 'conv_guard_s1_a', 'duration_s', 540, 'student_words', 812,
    'transcript', '[{"who": "interviewer", "text": "Why this school?"}, {"who": "student", "text": "S1_MARK_ANSWER"}]'::jsonb,
    'feedback', '{"questions": [], "habits": [], "thin": false}'::jsonb,
    'scores', '{"examples": {"score": 3, "reason": "S1_MARK_REASON"}}'::jsonb))::text);
  PERFORM pg_temp.put('s1_b', pg_temp.mock('s1', jsonb_build_object(
    'mode', 'internship', 'target', 'Guard Labs', 'role', 'Research intern',
    'conversation_id', 'conv_guard_s1_b'))::text);
  PERFORM pg_temp.put('s2_a', pg_temp.mock('s2', jsonb_build_object(
    'status', 'done', 'conversation_id', 'conv_guard_s2_a',
    'transcript', '[{"who": "student", "text": "S2_MARK_ANSWER"}]'::jsonb))::text);
END;
$$;
SELECT pg_temp.be('admin');
DO $$ BEGIN PERFORM pg_temp.ok('s1 holds two mocks and s2 one',
  pg_temp.held('s1') = 2 AND pg_temp.held('s2') = 1); END; $$;


-- ── 6. A student sees and deletes only their own, and writes nothing ─────────
SELECT pg_temp.be('s1');
DO $$
DECLARE
  v_n BIGINT;
BEGIN
  PERFORM pg_temp.ok('s1 sees their two mocks and nothing else',
    pg_temp.seen() = 2 AND pg_temp.seen('s1') = 2 AND pg_temp.seen('s2') = 0);
  PERFORM pg_temp.ok('s1 reads the whole of their own mock: transcript, feedback and scores',
    (SELECT m.transcript::text LIKE '%S1_MARK_ANSWER%' AND m.scores::text LIKE '%S1_MARK_REASON%'
            AND m.feedback IS NOT NULL
       FROM public.interview_mocks m WHERE m.id = pg_temp.get('s1_a')::uuid));
  PERFORM pg_temp.ok('s1 cannot find s2''s mock by its id or its conversation id',
    NOT EXISTS (SELECT 1 FROM public.interview_mocks m
                 WHERE m.id = pg_temp.get('s2_a')::uuid OR m.conversation_id = 'conv_guard_s2_a'));
  PERFORM pg_temp.ok('nothing of s2''s transcript reaches s1 by any column',
    NOT EXISTS (SELECT 1 FROM public.interview_mocks m WHERE m::text LIKE '%S2_MARK%'));

  -- No insert, with their own id or a forged one.
  PERFORM pg_temp.denied('s1 cannot insert a mock of their own',
    $q$INSERT INTO public.interview_mocks (user_id, mode, target, conversation_id)
       VALUES (pg_temp.u('s1'), 'college', 'Guard College', 'conv_guard_forged_own')$q$);
  PERFORM pg_temp.denied('s1 cannot insert a mock under s2''s id',
    $q$INSERT INTO public.interview_mocks (user_id, mode, target, conversation_id)
       VALUES (pg_temp.u('s2'), 'college', 'Guard College', 'conv_guard_forged_s2')$q$);
  PERFORM pg_temp.denied('s1 cannot insert a finished, scored mock',
    $q$INSERT INTO public.interview_mocks (user_id, mode, target, conversation_id, status, scores)
       VALUES (pg_temp.u('s1'), 'college', 'Guard College', 'conv_guard_forged_done', 'done',
               '{"examples": {"score": 5, "reason": "x"}}')$q$);

  -- No update of any column, on their own row or anyone's.
  PERFORM pg_temp.denied('s1 cannot move their own mock''s status',
    format($q$UPDATE public.interview_mocks SET status = 'refunded', refund_reason = 'too_short' WHERE id = %L$q$,
           pg_temp.get('s1_a')));
  PERFORM pg_temp.denied('s1 cannot write their own scores',
    format($q$UPDATE public.interview_mocks SET scores = '{"examples": {"score": 5, "reason": "x"}}' WHERE id = %L$q$,
           pg_temp.get('s1_a')));
  PERFORM pg_temp.denied('s1 cannot rewrite their own transcript',
    format($q$UPDATE public.interview_mocks SET transcript = '[]' WHERE id = %L$q$, pg_temp.get('s1_a')));
  PERFORM pg_temp.denied('s1 cannot point their mock at another conversation',
    format($q$UPDATE public.interview_mocks SET conversation_id = 'conv_guard_moved' WHERE id = %L$q$,
           pg_temp.get('s1_b')));
  PERFORM pg_temp.denied('s1 cannot hand their mock to s2 (a forged user_id)',
    format($q$UPDATE public.interview_mocks SET user_id = %L WHERE id = %L$q$, pg_temp.u('s2'), pg_temp.get('s1_a')));
  PERFORM pg_temp.denied('s1 cannot reset their feedback tries',
    format($q$UPDATE public.interview_mocks SET feedback_tries = 0 WHERE id = %L$q$, pg_temp.get('s1_a')));
  PERFORM pg_temp.denied('s1 cannot update s2''s mock',
    format($q$UPDATE public.interview_mocks SET status = 'refunded' WHERE id = %L$q$, pg_temp.get('s2_a')));
  PERFORM pg_temp.denied('s1 cannot empty the table', 'TRUNCATE public.interview_mocks');

  -- Delete: someone else's is untouched, their own goes.
  DELETE FROM public.interview_mocks m WHERE m.id = pg_temp.get('s2_a')::uuid;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  PERFORM pg_temp.ok('s1 deleting s2''s mock by id removes nothing', v_n = 0);
  DELETE FROM public.interview_mocks m WHERE m.user_id = pg_temp.u('s2');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  PERFORM pg_temp.ok('s1 deleting by s2''s user_id removes nothing', v_n = 0);

  DELETE FROM public.interview_mocks m WHERE m.id = pg_temp.get('s1_b')::uuid;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  PERFORM pg_temp.ok('s1 deletes their own mock', v_n = 1 AND pg_temp.seen() = 1);
END;
$$;

SELECT pg_temp.be('admin');
DO $$ BEGIN PERFORM pg_temp.ok('s2''s mock survived s1''s deletes, and s1''s deleted one is really gone',
  pg_temp.held('s2') = 1 AND pg_temp.held('s1') = 1
  AND NOT EXISTS (SELECT 1 FROM public.interview_mocks m WHERE m.id = pg_temp.get('s1_b')::uuid)); END; $$;

-- A delete with no filter at all takes only the student's own rows.
SELECT pg_temp.be('s2');
DO $$
DECLARE
  v_n BIGINT;
BEGIN
  PERFORM pg_temp.ok('s2 sees their one mock and none of s1''s',
    pg_temp.seen() = 1 AND pg_temp.seen('s2') = 1 AND pg_temp.seen('s1') = 0);
  DELETE FROM public.interview_mocks;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  PERFORM pg_temp.ok('s2 deleting every row they can reach removes only their own', v_n = 1 AND pg_temp.seen() = 0);
END;
$$;
SELECT pg_temp.be('admin');
DO $$ BEGIN PERFORM pg_temp.ok('s1''s mock is still there after s2 emptied what they could',
  pg_temp.held('s1') = 1 AND pg_temp.held('s2') = 0); END; $$;

-- A student with no mocks sees none.
SELECT pg_temp.be('e1');
DO $$ BEGIN PERFORM pg_temp.ok('a student with no mocks sees an empty table', pg_temp.seen() = 0); END; $$;

-- The signed-in role with no id in its claims (auth.uid() is NULL) gets nothing.
SELECT pg_temp.be('nobody');
DO $$
DECLARE
  v_n BIGINT;
BEGIN
  PERFORM pg_temp.ok('signed in with no id: sees nothing', pg_temp.seen() = 0);
  DELETE FROM public.interview_mocks;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  PERFORM pg_temp.ok('signed in with no id: deletes nothing', v_n = 0);
  PERFORM pg_temp.denied('signed in with no id: cannot insert',
    $q$INSERT INTO public.interview_mocks (user_id, mode, target, conversation_id)
       VALUES (pg_temp.u('s1'), 'college', 'Guard College', 'conv_guard_nobody')$q$);
END;
$$;


-- ── 7. Signed out, nothing at all ────────────────────────────────────────────
SELECT pg_temp.be('anon');
DO $$
BEGIN
  PERFORM pg_temp.denied('anon cannot read the table', 'SELECT count(*) FROM public.interview_mocks');
  PERFORM pg_temp.denied('anon cannot read a single column',
    'SELECT conversation_id FROM public.interview_mocks LIMIT 1');
  PERFORM pg_temp.denied('anon cannot insert',
    $q$INSERT INTO public.interview_mocks (user_id, mode, target, conversation_id)
       VALUES (pg_temp.u('s1'), 'college', 'Guard College', 'conv_guard_anon')$q$);
  PERFORM pg_temp.denied('anon cannot update', $q$UPDATE public.interview_mocks SET status = 'done'$q$);
  PERFORM pg_temp.denied('anon cannot delete', 'DELETE FROM public.interview_mocks');
  PERFORM pg_temp.denied('anon cannot empty the table', 'TRUNCATE public.interview_mocks');
END;
$$;
SELECT pg_temp.be('admin');
DO $$ BEGIN PERFORM pg_temp.ok('s1''s mock is untouched after anon''s tries', pg_temp.held('s1') = 1); END; $$;


-- ── 8. The backend writes, the student reads it ──────────────────────────────
SELECT pg_temp.be('service');
DO $$
DECLARE
  v_n BIGINT;
BEGIN
  UPDATE public.interview_mocks
     SET status = 'scoring', claimed_at = now()
   WHERE id = pg_temp.get('s1_a')::uuid AND user_id = pg_temp.u('s1') AND status = 'done';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  PERFORM pg_temp.ok('the backend can claim a mock (an update scoped by id and user_id)', v_n = 1);
  UPDATE public.interview_mocks
     SET status = 'done', feedback_tries = feedback_tries + 1,
         scores = '{"examples": {"score": 4, "reason": "S1_MARK_NEWREASON"}}'::jsonb, updated_at = now()
   WHERE id = pg_temp.get('s1_a')::uuid AND user_id = pg_temp.u('s1');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  PERFORM pg_temp.ok('the backend can write the feedback and scores', v_n = 1);
  UPDATE public.interview_mocks SET status = 'refunded'
   WHERE id = pg_temp.get('s1_a')::uuid AND user_id = pg_temp.u('s2');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  PERFORM pg_temp.ok('a backend update with the wrong user_id touches nothing', v_n = 0);
END;
$$;
SELECT pg_temp.be('s1');
DO $$ BEGIN PERFORM pg_temp.ok('s1 reads what the backend wrote',
  (SELECT m.status = 'done' AND m.feedback_tries = 1 AND m.scores::text LIKE '%S1_MARK_NEWREASON%'
     FROM public.interview_mocks m WHERE m.id = pg_temp.get('s1_a')::uuid)); END; $$;


-- ── 9. Deleting the account takes every mock with it ─────────────────────────
SELECT pg_temp.be('admin');
DO $$ BEGIN PERFORM pg_temp.ok('s3 holds the mocks from the CHECK tests before the account goes',
  pg_temp.held('s3') > 5); END; $$;
DELETE FROM auth.users WHERE id = pg_temp.u('s3');
DO $$ BEGIN PERFORM pg_temp.ok('deleting s3''s account removes all of s3''s mocks and nobody else''s',
  pg_temp.held('s3') = 0 AND pg_temp.held('s1') = 1
  AND NOT EXISTS (SELECT 1 FROM public.interview_mocks m WHERE m.conversation_id = 'conv_guard_unique')); END; $$;
DELETE FROM auth.users WHERE id = pg_temp.u('s1');
DO $$ BEGIN PERFORM pg_temp.ok('deleting s1''s account removes their finished, scored mock too',
  pg_temp.held('s1') = 0
  AND NOT EXISTS (SELECT 1 FROM public.interview_mocks m WHERE m.id = pg_temp.get('s1_a')::uuid)); END; $$;


-- ── The result ────────────────────────────────────────────────────────────────
SELECT 'interview guard: ' || pg_temp.get('passed') || ' checks passed, 0 failed' AS result,
       pg_temp.get('passed')::int AS passed;

ROLLBACK;
