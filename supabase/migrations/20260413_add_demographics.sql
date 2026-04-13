-- ============================================================
-- Migration: Add demographic fields to profiles
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Add full_name column
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS full_name TEXT DEFAULT '';

-- Add education_level column
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS education_level TEXT
    CHECK (education_level IS NULL OR education_level IN ('high_school', 'college', 'other'));

-- Widen grade_level to accept college years (1–4) in addition to HS grades (9–12)
-- The old constraint only allowed 9–12.
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_grade_level_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_grade_level_check
  CHECK (grade_level IS NULL OR (grade_level >= 1 AND grade_level <= 12));
