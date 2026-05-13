CREATE TABLE IF NOT EXISTS research_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  query       TEXT NOT NULL,
  results     JSONB NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE research_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own research history"
  ON research_history FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own research history"
  ON research_history FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own research history"
  ON research_history FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS research_history_user_id_idx ON research_history(user_id);
CREATE INDEX IF NOT EXISTS research_history_created_at_idx ON research_history(user_id, created_at DESC);
