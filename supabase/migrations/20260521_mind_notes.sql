ALTER TABLE profiles ADD COLUMN IF NOT EXISTS mind_notes JSONB DEFAULT '[]'::jsonb;
