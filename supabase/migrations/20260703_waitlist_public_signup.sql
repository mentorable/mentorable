-- ── waitlist: public signup from the landing page ──────────────────────────────
-- The landing page "Interested in a full, paid version?" form lets anonymous
-- visitors join the waitlist by email, deduped by email.
--
-- Note: a public INSERT policy ("Anyone can join waitlist", WITH CHECK true)
-- and a unique constraint on email already existed on the remote table
-- (created outside migrations), so anon inserts were already permitted.
-- This migration just normalizes existing emails for the new unique-by-email
-- upsert path used by the landing page form.

UPDATE waitlist SET email = lower(trim(email));
