-- Roadmap v3 ("phase-by-phase") — sequential phase generation, per-node checklist tasks,
-- post-phase reflection. The broad outline (roadmaps.phases JSONB) is generated once; each
-- phase's roadmap_nodes are materialized on demand; each node expands into checklist tasks.
-- See .claude/ROADMAP_REDESIGN.md. Non-destructive + idempotent.

-- ── roadmap_tasks: the per-node checklist (replaces quest promotion) ──────────
CREATE TABLE IF NOT EXISTS roadmap_tasks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id     UUID NOT NULL REFERENCES roadmap_nodes(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text        TEXT NOT NULL,
  done        BOOLEAN NOT NULL DEFAULT false,
  axis_delta  NUMERIC NOT NULL DEFAULT 0,   -- exact axis points awarded on check (for clean revert)
  order_index INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE roadmap_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users own roadmap_tasks" ON roadmap_tasks;
CREATE POLICY "users own roadmap_tasks" ON roadmap_tasks FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS roadmap_tasks_node_idx ON roadmap_tasks(node_id, order_index);

-- ── usage counter: phase generations (cap 5/lifetime) ────────────────────────
ALTER TABLE usage_tracking
  ADD COLUMN IF NOT EXISTS phase_generations_used INT NOT NULL DEFAULT 0;

-- ── check_and_increment_usage: add phase_gen ─────────────────────────────────
CREATE OR REPLACE FUNCTION check_and_increment_usage(
  p_user_id UUID,
  p_feature  TEXT,
  p_limit    INT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  current_count INT;
  user_email    TEXT;
  dev_emails    TEXT[] := ARRAY['app.mentora.ai@gmail.com', 'kwu.1600@gmail.com'];
BEGIN
  SELECT email INTO user_email FROM auth.users WHERE id = p_user_id;
  IF user_email = ANY(dev_emails) THEN
    RETURN jsonb_build_object('allowed', true, 'used', 0, 'limit', p_limit);
  END IF;

  INSERT INTO usage_tracking (user_id) VALUES (p_user_id) ON CONFLICT (user_id) DO NOTHING;

  SELECT CASE p_feature
    WHEN 'chat'           THEN chat_messages_used
    WHEN 'research'       THEN research_queries_used
    WHEN 'quest_gen'      THEN quest_generations_used
    WHEN 'axis_boost'     THEN axis_boosts_used
    WHEN 'roadmap_gen'    THEN roadmap_generations_used
    WHEN 'phase_gen'      THEN phase_generations_used
    WHEN 'node_expand'    THEN node_expansions_used
    WHEN 'roadmap_reeval' THEN roadmap_reevals_used
    ELSE 0
  END
  INTO current_count
  FROM usage_tracking WHERE user_id = p_user_id FOR UPDATE;

  IF current_count >= p_limit THEN
    RETURN jsonb_build_object('allowed', false, 'used', current_count, 'limit', p_limit);
  END IF;

  UPDATE usage_tracking SET
    chat_messages_used       = CASE WHEN p_feature = 'chat'           THEN chat_messages_used       + 1 ELSE chat_messages_used       END,
    research_queries_used    = CASE WHEN p_feature = 'research'       THEN research_queries_used    + 1 ELSE research_queries_used    END,
    quest_generations_used   = CASE WHEN p_feature = 'quest_gen'      THEN quest_generations_used   + 1 ELSE quest_generations_used   END,
    axis_boosts_used         = CASE WHEN p_feature = 'axis_boost'     THEN axis_boosts_used         + 1 ELSE axis_boosts_used         END,
    roadmap_generations_used = CASE WHEN p_feature = 'roadmap_gen'    THEN roadmap_generations_used + 1 ELSE roadmap_generations_used END,
    phase_generations_used   = CASE WHEN p_feature = 'phase_gen'      THEN phase_generations_used   + 1 ELSE phase_generations_used   END,
    node_expansions_used     = CASE WHEN p_feature = 'node_expand'    THEN node_expansions_used     + 1 ELSE node_expansions_used     END,
    roadmap_reevals_used     = CASE WHEN p_feature = 'roadmap_reeval' THEN roadmap_reevals_used     + 1 ELSE roadmap_reevals_used     END,
    updated_at = now()
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object('allowed', true, 'used', current_count + 1, 'limit', p_limit);
END;
$$;
