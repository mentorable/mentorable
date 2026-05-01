-- Add title column to chat_sessions (used for renamed/labeled conversations)
ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS title TEXT;
