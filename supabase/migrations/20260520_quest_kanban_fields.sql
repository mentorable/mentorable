-- Add difficulty and why_it_matters fields to quest_items
ALTER TABLE quest_items
  ADD COLUMN IF NOT EXISTS difficulty TEXT,         -- 'Easy' | 'Medium' | 'Hard'
  ADD COLUMN IF NOT EXISTS why_it_matters TEXT;     -- short AI-written rationale

-- Migrate legacy 'active' status to 'in_progress' for kanban columns
UPDATE quest_items SET status = 'in_progress' WHERE status = 'active';

-- Update default status for new inserts
ALTER TABLE quest_items ALTER COLUMN status SET DEFAULT 'suggested';
