-- ============================================================
-- Migration: Rename roadmap schema to quest
-- Renames core tables and columns from the old "roadmap" naming
-- to the new "quest" naming. Drops legacy columns and the
-- student_canvas table that are no longer used.
-- Safe to run on existing data — all operations are renames,
-- not drops of data-bearing columns, except where noted.
-- ============================================================

-- ── 1. Rename core tables ─────────────────────────────────────────────────────

ALTER TABLE IF EXISTS roadmaps          RENAME TO quests;
ALTER TABLE IF EXISTS roadmap_phases    RENAME TO quest_phases;
ALTER TABLE IF EXISTS roadmap_tasks     RENAME TO quest_tasks;
-- confidence_history is kept as-is (name is generic enough)

-- ── 2. Rename roadmap_id → quest_id in child tables ──────────────────────────

ALTER TABLE IF EXISTS quest_phases   RENAME COLUMN roadmap_id TO quest_id;
ALTER TABLE IF EXISTS quest_tasks    RENAME COLUMN roadmap_id TO quest_id;
ALTER TABLE IF EXISTS confidence_history RENAME COLUMN roadmap_id TO quest_id;

-- ── 3. Clean up profiles table ────────────────────────────────────────────────

-- Rename roadmap_* preference columns to quest_* equivalents
-- (still used by generate-phase for personalisation)
ALTER TABLE IF EXISTS profiles
  RENAME COLUMN roadmap_hours_per_week TO quest_hours_per_week;

ALTER TABLE IF EXISTS profiles
  RENAME COLUMN roadmap_task_style TO quest_task_style;

ALTER TABLE IF EXISTS profiles
  RENAME COLUMN roadmap_difficulty TO quest_difficulty;

-- Drop pre-roadmap survey columns — this survey no longer exists
ALTER TABLE IF EXISTS profiles
  DROP COLUMN IF EXISTS pre_roadmap_certainty;

ALTER TABLE IF EXISTS profiles
  DROP COLUMN IF EXISTS pre_roadmap_career;

-- ── 4. Drop student_canvas — replaced entirely by quest ───────────────────────
-- Keeping this commented out for safety until confirmed no data is needed.
-- Uncomment and re-run if you want to clean it up:
-- DROP TABLE IF EXISTS student_canvas;
