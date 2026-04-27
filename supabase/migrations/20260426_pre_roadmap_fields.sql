-- ============================================================
-- Migration: Add pre-roadmap question fields to profiles
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- Both columns are nullable — existing users are unaffected.
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS pre_roadmap_certainty TEXT
    CHECK (pre_roadmap_certainty IS NULL OR pre_roadmap_certainty IN ('certain', 'partial', 'undecided'));

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS pre_roadmap_career TEXT;
