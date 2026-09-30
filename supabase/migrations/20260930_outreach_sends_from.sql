-- Beaker's send rules, keyed on the mailbox as well as the account.
--
-- outreach_sends.from_email: the Gmail address an email went out from
-- (lowercase). The daily cap and the one-first-email rule used to be counted
-- per Mentorable account only, so a second account connected to the same Gmail
-- started both over. The backend now also counts them per sending address:
-- the service role counts across students for that, and returns only a yes, a
-- no or a number, never another student's rows.
--
-- outreach_sends.to_key: the recipient's canonical address (lowercase, no
-- "+tag", and for gmail.com / googlemail.com no dots), so mlee+2@usf.edu is not
-- a new person. The backend computes it (service.py _recipient_key); to_email
-- stays the address the email was actually sent to.
--
-- Both columns are nullable and the old unique index stays, so the backend
-- that is live when this is applied keeps working until the new one is
-- deployed. Apply this BEFORE deploying the backend that writes them.
--
-- Apply with: supabase db query --linked -f supabase/migrations/20260930_outreach_sends_from.sql
-- then check information_schema.columns for outreach_sends.from_email / to_key
-- and pg_indexes for the three indexes below.

ALTER TABLE public.outreach_sends
  ADD COLUMN IF NOT EXISTS from_email TEXT
    CHECK (from_email IS NULL OR (char_length(from_email) BETWEEN 3 AND 254 AND from_email = lower(from_email))),
  ADD COLUMN IF NOT EXISTS to_key TEXT
    CHECK (to_key IS NULL OR char_length(to_key) BETWEEN 3 AND 254);

-- Rows sent before this: lower(to_email) is already unique per student among
-- first emails (outreach_sends_one_first_email), so the index below cannot
-- fail on them. The backend canonicalizes these older keys itself when it
-- compares, so an older "+tag" send still counts.
UPDATE public.outreach_sends SET to_key = lower(to_email) WHERE to_key IS NULL;

-- One first email per canonical recipient: per student, and per sending Gmail
-- address whichever account sends it. Race-proof: the second insert fails.
CREATE UNIQUE INDEX IF NOT EXISTS outreach_sends_one_first_email_key
  ON public.outreach_sends (user_id, to_key)
  WHERE kind = 'first' AND to_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS outreach_sends_one_first_email_per_sender
  ON public.outreach_sends (from_email, to_key)
  WHERE kind = 'first' AND from_email IS NOT NULL AND to_key IS NOT NULL;

-- Today's count per sending address (the daily cap, in UTC).
CREATE INDEX IF NOT EXISTS outreach_sends_from_idx
  ON public.outreach_sends (from_email, sent_at DESC)
  WHERE from_email IS NOT NULL;

-- The backend writes these columns through PostgREST: make sure it sees them.
NOTIFY pgrst, 'reload schema';
