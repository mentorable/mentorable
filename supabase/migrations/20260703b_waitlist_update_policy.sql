-- ── waitlist: allow logged-in users to update their own row ────────────────────
-- LimitModal upserts on user_id (INSERT ... ON CONFLICT (user_id) DO UPDATE) so
-- a signed-in user can join the waitlist from any of the 8 rate-limit modals.
-- Without an UPDATE policy, RLS rejects the DO UPDATE branch whenever the user
-- already has a row (i.e. every submission after their first).

DROP POLICY IF EXISTS "users update own waitlist" ON waitlist;
CREATE POLICY "users update own waitlist"
  ON waitlist FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
