-- ============================================================
-- Migration: Add profile enrichment columns from onboarding transcript
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- All columns are nullable — existing users are unaffected.
-- ============================================================

-- Career certainty: how sure the student is about their career direction
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS career_certainty TEXT
    CHECK (career_certainty IS NULL OR career_certainty IN ('certain', 'exploring', 'undecided'));

-- Mentioned careers: all careers discussed, including ruled-out ones
-- Stored as JSONB array of objects: [{ "title": "...", "ruled_out": false }, ...]
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS mentioned_careers JSONB;

-- Motivations: what the student values in a career
-- e.g. ["income", "creativity", "helping others", "stability", "flexibility"]
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS motivations JSONB;

-- Biggest concern: the main fear or worry the student expressed
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS biggest_concern TEXT;

-- External influences: family pressure, financial constraints, geographic limits, etc.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS external_influences TEXT;

-- Self-confidence level based on how student spoke about their abilities
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS self_confidence_level TEXT
    CHECK (self_confidence_level IS NULL OR self_confidence_level IN ('low', 'medium', 'high'));

-- Personality signals: descriptive tags from how the student presented themselves
-- e.g. ["analytical", "creative", "introverted", "collaborative", "hands-on"]
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS personality_signals JSONB;

-- Own-words keywords: short phrases pulled directly from the student's language
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS own_words_keywords JSONB;

-- Conversation tone: overall emotional tone of the onboarding session
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS conversation_tone TEXT
    CHECK (conversation_tone IS NULL OR conversation_tone IN ('excited', 'anxious', 'uncertain', 'motivated', 'mixed'));
