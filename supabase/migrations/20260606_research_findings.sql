-- research_findings — top findings from research sessions, stored for cross-feature memory.
-- Written by langgraph-service after each research session completes.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS research_findings JSONB DEFAULT '[]'::jsonb;
