-- Structured Guidance — Adaptive Roadmap, Phase 1 (data + scoring plumbing).
-- See .claude/ROADMAP_REDESIGN.md.

-- ── Tables ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS roadmaps (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal            TEXT NOT NULL,
  timeframe_months INT NOT NULL CHECK (timeframe_months BETWEEN 6 AND 24),
  start_month     DATE NOT NULL,            -- first month of the timeline (month 0)
  status          TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'archived'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE roadmaps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users own roadmaps" ON roadmaps;
CREATE POLICY "users own roadmaps" ON roadmaps FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS roadmaps_user_idx ON roadmaps(user_id, status);

CREATE TABLE IF NOT EXISTS roadmap_nodes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  roadmap_id    UUID NOT NULL REFERENCES roadmaps(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month_index   INT NOT NULL,              -- 0 = current/near-term (top of timeline)
  month_label   TEXT NOT NULL,             -- e.g. 'Jun 2026'
  pillar        TEXT NOT NULL,             -- 'Project' | 'Research' | 'Activity' | 'Club'
  title         TEXT NOT NULL,
  blurb         TEXT,                      -- short rationale from the broad generation
  target_axis   TEXT,                      -- mapped from pillar; drives scorecard on promotion
  state         TEXT NOT NULL DEFAULT 'explore',  -- explore | opened | on_board | done
  order_index   INT NOT NULL DEFAULT 0,
  overview      TEXT,                      -- null until expanded; markdown w/ [n] markers
  "references"  JSONB,                     -- null until expanded; [{id,type,title,url,source,thumbnail?}]
  quest_item_id UUID REFERENCES quest_items(id) ON DELETE SET NULL,  -- set on promotion
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE roadmap_nodes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users own roadmap_nodes" ON roadmap_nodes;
CREATE POLICY "users own roadmap_nodes" ON roadmap_nodes FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS roadmap_nodes_roadmap_idx ON roadmap_nodes(roadmap_id, month_index, order_index);

-- Reverse link so the quest board can mark a card as roadmap-originated + deep-link back.
ALTER TABLE quest_items
  ADD COLUMN IF NOT EXISTS roadmap_node_id UUID REFERENCES roadmap_nodes(id) ON DELETE SET NULL;

-- ── Usage counters ───────────────────────────────────────────────────────────
ALTER TABLE usage_tracking
  ADD COLUMN IF NOT EXISTS roadmap_generations_used INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS node_expansions_used     INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS roadmap_reevals_used     INT NOT NULL DEFAULT 0;

-- ── check_and_increment_usage: add roadmap_gen / node_expand / roadmap_reeval ──
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
    node_expansions_used     = CASE WHEN p_feature = 'node_expand'    THEN node_expansions_used     + 1 ELSE node_expansions_used     END,
    roadmap_reevals_used     = CASE WHEN p_feature = 'roadmap_reeval' THEN roadmap_reevals_used     + 1 ELSE roadmap_reevals_used     END,
    updated_at = now()
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object('allowed', true, 'used', current_count + 1, 'limit', p_limit);
END;
$$;

-- ── revert_axis_points: undo a completion's exact awarded delta ─────────────────
-- Subtracts the given delta from one axis (floored at 0) and removes the most recent
-- matching score_events row. Service-role only. Mirrors award_axis_points.
CREATE OR REPLACE FUNCTION revert_axis_points(
  p_user_id UUID,
  p_axis    TEXT,
  p_delta   NUMERIC,
  p_source  TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  valid_axes  TEXT[] := ARRAY['communication','leadership','technicality','resourcefulness','execution'];
  scores      JSONB;
  current_val NUMERIC;
  new_val     NUMERIC;
  ev_id       UUID;
BEGIN
  IF NOT (p_axis = ANY(valid_axes)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid axis');
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT axis_scores INTO scores FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF scores IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'axis', p_axis, 'value', 0, 'reverted', 0);
  END IF;

  current_val := COALESCE((scores->>p_axis)::numeric, 40);
  new_val     := GREATEST(0, current_val - COALESCE(p_delta, 0));
  scores      := jsonb_set(scores, ARRAY[p_axis], to_jsonb(new_val));
  UPDATE profiles SET axis_scores = scores, updated_at = now() WHERE id = p_user_id;

  -- Remove the most recent matching positive event so history stays honest.
  SELECT id INTO ev_id FROM score_events
  WHERE user_id = p_user_id AND axis = p_axis
    AND (p_source IS NULL OR source = p_source) AND delta > 0
  ORDER BY created_at DESC LIMIT 1;
  IF ev_id IS NOT NULL THEN
    DELETE FROM score_events WHERE id = ev_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'axis', p_axis, 'value', new_val, 'reverted', current_val - new_val);
END;
$$;

REVOKE ALL ON FUNCTION revert_axis_points(UUID, TEXT, NUMERIC, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION revert_axis_points(UUID, TEXT, NUMERIC, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION revert_axis_points(UUID, TEXT, NUMERIC, TEXT) TO service_role;
