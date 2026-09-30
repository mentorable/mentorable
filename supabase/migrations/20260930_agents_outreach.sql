-- Agents: the shared budget table every agent uses, and the first agent,
-- Beaker the outreach pelican (research a professor or professional, draft a
-- sourced email, send it through the student's own Gmail).
--
-- Who writes what:
--   * outreach_contacts is the student's pipeline board. They add cards by hand
--     and move, edit and delete their own, directly (RLS). The columns the agent
--     fills (its research, the claims and their sources, the counters that cap
--     rewrites) are not in their column grants, so only the backend sets those.
--   * agent_usage, outreach_tries and outreach_sends are the backend's ledgers:
--     students can read their own rows and write none. outreach_sends is what
--     enforces "one email per recipient", so it must not be editable.
--   * google_connections holds each student's Gmail send permission, encrypted
--     by the backend (GMAIL_TOKEN_KEY). Service role only; students never read it.
-- Everything is deleted with the account.


-- ── agent_usage: every agent's budgets ────────────────────────────────────────
-- One row per (student, agent, kind, bucket). bucket is 'all' for a lifetime
-- cap (the demo's "two tries") or a local date for a daily one (sends).
CREATE TABLE IF NOT EXISTS public.agent_usage (
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent      TEXT NOT NULL CHECK (char_length(agent) BETWEEN 1 AND 40),
  kind       TEXT NOT NULL CHECK (char_length(kind) BETWEEN 1 AND 40),
  bucket     TEXT NOT NULL CHECK (char_length(bucket) BETWEEN 1 AND 20),
  used       INT  NOT NULL DEFAULT 0 CHECK (used >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, agent, kind, bucket)
);
ALTER TABLE public.agent_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users read own agent_usage" ON public.agent_usage;
CREATE POLICY "users read own agent_usage" ON public.agent_usage
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
REVOKE ALL ON public.agent_usage FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.agent_usage FROM authenticated;

-- Atomic check-and-increment, the same shape and dev bypass as quest_bump_usage.
CREATE OR REPLACE FUNCTION public.agent_bump_usage(
  p_user_id UUID, p_agent TEXT, p_kind TEXT, p_bucket TEXT, p_limit INT
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

  INSERT INTO public.agent_usage (user_id, agent, kind, bucket)
  VALUES (p_user_id, p_agent, p_kind, p_bucket)
  ON CONFLICT (user_id, agent, kind, bucket) DO NOTHING;

  SELECT used INTO v_used FROM public.agent_usage
   WHERE user_id = p_user_id AND agent = p_agent AND kind = p_kind AND bucket = p_bucket
   FOR UPDATE;

  IF v_used >= p_limit THEN
    RETURN jsonb_build_object('allowed', false, 'used', v_used, 'limit', p_limit);
  END IF;

  UPDATE public.agent_usage SET used = used + 1, updated_at = now()
   WHERE user_id = p_user_id AND agent = p_agent AND kind = p_kind AND bucket = p_bucket;
  RETURN jsonb_build_object('allowed', true, 'used', v_used + 1, 'limit', p_limit);
END;
$$;

-- Give a unit back when the work it paid for failed.
CREATE OR REPLACE FUNCTION public.agent_refund_usage(
  p_user_id UUID, p_agent TEXT, p_kind TEXT, p_bucket TEXT
) RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.agent_usage SET used = GREATEST(used - 1, 0), updated_at = now()
   WHERE user_id = p_user_id AND agent = p_agent AND kind = p_kind AND bucket = p_bucket;
$$;

REVOKE ALL ON FUNCTION public.agent_bump_usage(UUID, TEXT, TEXT, TEXT, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agent_refund_usage(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_bump_usage(UUID, TEXT, TEXT, TEXT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.agent_refund_usage(UUID, TEXT, TEXT, TEXT) TO service_role;


-- ── outreach_contacts: the pipeline board ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.outreach_contacts (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stage                TEXT NOT NULL DEFAULT 'to_contact'
                         CHECK (stage IN ('to_contact', 'drafted', 'sent', 'heard_back', 'meeting', 'closed')),
  created_by           TEXT NOT NULL DEFAULT 'student' CHECK (created_by IN ('agent', 'student')),
  -- Who: the student's own words for a manual card, the research for an agent one.
  name                 TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  title                TEXT NOT NULL DEFAULT '' CHECK (char_length(title) <= 160),
  organization         TEXT NOT NULL DEFAULT '' CHECK (char_length(organization) <= 160),
  email                TEXT CHECK (email IS NULL OR (char_length(email) BETWEEN 3 AND 254
                                                     AND email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  -- The public page the agent found the address on. NULL for an address the
  -- student typed. The address itself as verified is kept in research.
  email_source_url     TEXT CHECK (char_length(email_source_url) <= 2000),
  -- What the student asked for (agent cards only).
  purpose              TEXT CHECK (purpose IN ('research', 'informational', 'internship', 'mentorship')),
  voice                TEXT CHECK (voice IN ('formal', 'warm', 'direct', 'humble')),
  length               TEXT CHECK (length IN ('brief', 'fuller')),
  student_note         TEXT NOT NULL DEFAULT '' CHECK (char_length(student_note) <= 300),
  why                  TEXT NOT NULL DEFAULT '' CHECK (char_length(why) <= 600),
  -- The email. subject and body are the student's to edit.
  subject              TEXT NOT NULL DEFAULT '' CHECK (char_length(subject) <= 200),
  body                 TEXT NOT NULL DEFAULT '' CHECK (char_length(body) <= 4000),
  -- [{text, source_url}]: sentences of the draft that state something about the
  -- recipient, each tied to a page the search really returned.
  claims               JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(claims) = 'array'),
  -- [{url, title, domain}]: every page the research used.
  sources              JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(sources) = 'array'),
  -- The research the draft stands on ({person, facts[{text, url}], verified_email}),
  -- reused by rewrites and follow-ups so they never search again.
  research             JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(research) = 'object'),
  facts_to_verify      JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(facts_to_verify) = 'array'),
  followup_body        TEXT NOT NULL DEFAULT '' CHECK (char_length(followup_body) <= 1500),
  -- The student's own tracking.
  notes                TEXT NOT NULL DEFAULT '' CHECK (char_length(notes) <= 2000),
  follow_up_on         DATE,
  position             DOUBLE PRECISION NOT NULL DEFAULT 0,
  -- Counters the backend keeps (not student-writable).
  rewrites_used        INT NOT NULL DEFAULT 0 CHECK (rewrites_used >= 0),
  followup_drafts_used INT NOT NULL DEFAULT 0 CHECK (followup_drafts_used >= 0),
  follow_ups_sent      INT NOT NULL DEFAULT 0 CHECK (follow_ups_sent >= 0),
  -- Sending. sent_at / last_sent_at are set by the backend when Gmail sends;
  -- manual_sent_at is the student saying "I sent it myself".
  sent_via             TEXT CHECK (sent_via IN ('gmail', 'manual')),
  sent_at              TIMESTAMPTZ,
  last_sent_at         TIMESTAMPTZ,
  manual_sent_at       TIMESTAMPTZ,
  gmail_thread_id      TEXT CHECK (char_length(gmail_thread_id) <= 200),
  message_id_header    TEXT CHECK (char_length(message_id_header) <= 300),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS outreach_contacts_user_stage_idx ON public.outreach_contacts (user_id, stage, position);

ALTER TABLE public.outreach_contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users own outreach_contacts" ON public.outreach_contacts;
CREATE POLICY "users own outreach_contacts" ON public.outreach_contacts
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
REVOKE ALL ON public.outreach_contacts FROM anon;
-- Column grants: what a student may set on their own cards.
REVOKE INSERT, UPDATE, TRUNCATE, REFERENCES, TRIGGER ON public.outreach_contacts FROM authenticated;
GRANT SELECT, DELETE ON public.outreach_contacts TO authenticated;
GRANT INSERT (user_id, stage, name, title, organization, email, notes, follow_up_on, position)
  ON public.outreach_contacts TO authenticated;
GRANT UPDATE (stage, name, title, organization, email, subject, body, notes, follow_up_on, position,
              manual_sent_at, updated_at)
  ON public.outreach_contacts TO authenticated;


-- ── outreach_tries: what the two tries were spent on ──────────────────────────
-- A try is one recipient, start to finish: a goal's shortlist and the pick from
-- it, or a named person, then the research and the draft. It stays 'open'
-- while the agent waits on the student (a pick, or its one question), becomes
-- 'drafted' with the card it made, or 'refunded' when the research failed.
CREATE TABLE IF NOT EXISTS public.outreach_tries (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'drafted', 'refunded')),
  mode             TEXT NOT NULL CHECK (mode IN ('person', 'goal')),
  goal             TEXT NOT NULL DEFAULT '' CHECK (char_length(goal) <= 400),
  -- The shortlist (or the look-alikes for an ambiguous name): [{name, title,
  -- organization, why, source_url, source_title}], every URL one the search returned.
  candidates       JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(candidates) = 'array'),
  pending_question TEXT CHECK (char_length(pending_question) <= 300),
  contact_id       UUID REFERENCES public.outreach_contacts(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS outreach_tries_user_idx ON public.outreach_tries (user_id, created_at DESC);
ALTER TABLE public.outreach_tries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users read own outreach_tries" ON public.outreach_tries;
CREATE POLICY "users read own outreach_tries" ON public.outreach_tries
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
REVOKE ALL ON public.outreach_tries FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.outreach_tries FROM authenticated;


-- ── outreach_sends: every email the agent sent ────────────────────────────────
-- Written before Gmail is called (and removed if the call fails), so a double
-- click cannot send twice: the unique index allows one first email per
-- recipient per student, ever, even if the card is deleted.
CREATE TABLE IF NOT EXISTS public.outreach_sends (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id       UUID REFERENCES public.outreach_contacts(id) ON DELETE SET NULL,
  to_email         TEXT NOT NULL CHECK (char_length(to_email) BETWEEN 3 AND 254),
  kind             TEXT NOT NULL CHECK (kind IN ('first', 'followup')),
  status           TEXT NOT NULL DEFAULT 'sending' CHECK (status IN ('sending', 'sent')),
  gmail_message_id TEXT CHECK (char_length(gmail_message_id) <= 200),
  gmail_thread_id  TEXT CHECK (char_length(gmail_thread_id) <= 200),
  sent_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS outreach_sends_one_first_email
  ON public.outreach_sends (user_id, lower(to_email)) WHERE kind = 'first';
CREATE INDEX IF NOT EXISTS outreach_sends_contact_idx ON public.outreach_sends (contact_id, sent_at DESC);
ALTER TABLE public.outreach_sends ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users read own outreach_sends" ON public.outreach_sends;
CREATE POLICY "users read own outreach_sends" ON public.outreach_sends
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
REVOKE ALL ON public.outreach_sends FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.outreach_sends FROM authenticated;


-- ── google_connections: a student's Gmail send permission ─────────────────────
-- scope is what Google actually granted. refresh_token_enc is Fernet-encrypted
-- with GMAIL_TOKEN_KEY; losing that key means everyone reconnects.
CREATE TABLE IF NOT EXISTS public.google_connections (
  user_id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  google_email      TEXT NOT NULL CHECK (char_length(google_email) BETWEEN 3 AND 254),
  scope             TEXT NOT NULL CHECK (char_length(scope) <= 1000),
  refresh_token_enc TEXT NOT NULL CHECK (char_length(refresh_token_enc) <= 4000),
  connected_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.google_connections ENABLE ROW LEVEL SECURITY;
-- No policies: nobody but the service role reads or writes it.
REVOKE ALL ON public.google_connections FROM anon, authenticated;
