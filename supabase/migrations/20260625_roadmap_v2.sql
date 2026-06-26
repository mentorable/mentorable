-- Roadmap v2 ("the redo") — anchor through-line, node kinds, difficulty schema, end-month.
-- See .claude/ROADMAP_REDESIGN.md. Non-destructive: all new columns nullable, old roadmaps
-- still render. Idempotent (IF NOT EXISTS / guarded constraint swap).

-- ── roadmaps: flagship anchor + explicit end month ───────────────────────────
ALTER TABLE roadmaps
  ADD COLUMN IF NOT EXISTS anchor_title   TEXT,
  ADD COLUMN IF NOT EXISTS anchor_summary TEXT,
  ADD COLUMN IF NOT EXISTS end_month      DATE;

-- Loosen the timeframe floor from 6 to 3 (near-graduation seniors get a short arc).
-- The original constraint is unnamed (inline CHECK) → it gets a generated name. Drop any
-- CHECK on timeframe_months, then add the (3,24) version under a stable name.
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'roadmaps'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%timeframe_months%'
  LOOP
    EXECUTE format('ALTER TABLE roadmaps DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE roadmaps
  ADD CONSTRAINT roadmaps_timeframe_months_check
  CHECK (timeframe_months BETWEEN 3 AND 24);

-- ── roadmap_nodes: kind + difficulty scores ──────────────────────────────────
ALTER TABLE roadmap_nodes
  ADD COLUMN IF NOT EXISTS kind            TEXT NOT NULL DEFAULT 'anchor',  -- anchor | side | bridge
  ADD COLUMN IF NOT EXISTS technical_depth INT,   -- 1-5, nullable (null on old/unscored nodes)
  ADD COLUMN IF NOT EXISTS execution_mode  INT;   -- 1-5, nullable

-- Guard kind values + difficulty ranges (allow NULL depths for back-compat).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'roadmap_nodes_kind_check') THEN
    ALTER TABLE roadmap_nodes
      ADD CONSTRAINT roadmap_nodes_kind_check CHECK (kind IN ('anchor', 'side', 'bridge'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'roadmap_nodes_depth_check') THEN
    ALTER TABLE roadmap_nodes
      ADD CONSTRAINT roadmap_nodes_depth_check
      CHECK (technical_depth IS NULL OR technical_depth BETWEEN 1 AND 5);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'roadmap_nodes_exec_check') THEN
    ALTER TABLE roadmap_nodes
      ADD CONSTRAINT roadmap_nodes_exec_check
      CHECK (execution_mode IS NULL OR execution_mode BETWEEN 1 AND 5);
  END IF;
END $$;
