-- Store raw transcript during voice onboarding for recovery if profile extraction fails.
-- Cleared once the profile is successfully extracted.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS raw_voice_transcript TEXT;
