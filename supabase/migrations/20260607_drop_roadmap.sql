-- Drop the phase-based roadmap feature — fully deleted from the product.
-- The Quest Kanban board (quest_items) is a SEPARATE, live feature and is untouched.
--
-- Removed code: edge functions initialize-roadmap, generate-phase, regenerate-roadmap,
-- complete-task; frontend roadmap preference UI; onboarding initialize-roadmap call.
--
-- NOTE: This is destructive and irreversible. Review before `supabase db push`.

-- Roadmap tables (no remaining readers in the app)
DROP TABLE IF EXISTS quest_tasks CASCADE;
DROP TABLE IF EXISTS quest_phases CASCADE;
DROP TABLE IF EXISTS confidence_history CASCADE;
DROP TABLE IF EXISTS quests CASCADE;

-- Roadmap-only profile preference columns (only ever read by generate-phase)
ALTER TABLE profiles
  DROP COLUMN IF EXISTS roadmap_hours_per_week,
  DROP COLUMN IF EXISTS roadmap_task_style,
  DROP COLUMN IF EXISTS roadmap_difficulty;
