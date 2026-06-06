-- chat_signals — array of signal summaries extracted from chat sessions by Haiku.
-- Written by langgraph-service/app/nodes/chat/extract_signals.py after each session.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS chat_signals JSONB DEFAULT '[]'::jsonb;
