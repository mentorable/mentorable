-- Roadmap phases ("the redo, pt.2") — group the month timeline into the phases a student
-- goes through (e.g. months 0-1 "Fundamentals of Law", month 4 "Study for the LSAT"), plus a
-- clean scannable display title separate from the raw goal prompt.
-- See .claude/ROADMAP_REDESIGN.md. Non-destructive: new columns nullable / defaulted, old
-- roadmaps still render (empty phases → flat month fallback). Idempotent.

ALTER TABLE roadmaps
  ADD COLUMN IF NOT EXISTS phases        JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS display_title TEXT;
