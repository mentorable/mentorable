-- ── feedback: free-text feedback from logged-in users ───────────────────────────
-- Nav-bar "Feedback" button opens a small form; submissions are stored here for
-- founders to review. No AI involved, direct-to-Supabase insert from the client.

CREATE TABLE feedback (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users insert own feedback" ON feedback
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users view own feedback" ON feedback
  FOR SELECT USING (auth.uid() = user_id);
