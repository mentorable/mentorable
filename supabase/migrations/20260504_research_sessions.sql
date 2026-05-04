CREATE TABLE IF NOT EXISTS research_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  query       TEXT NOT NULL,
  results     JSONB NOT NULL DEFAULT '[]',
  status      TEXT NOT NULL DEFAULT 'pending',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE research_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own research sessions"
  ON research_sessions FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own research sessions"
  ON research_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own research sessions"
  ON research_sessions FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own research sessions"
  ON research_sessions FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS research_sessions_user_created_idx
  ON research_sessions(user_id, created_at DESC);
