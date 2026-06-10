-- Scorecard redesign — Phase 1 foundation.
-- 5 standardized axes scored 0-100, persisted on profiles, moved by deterministic
-- rules with diminishing returns + a score_events change log.
-- See .claude/SCORECARD_REDESIGN.md.

-- ── Schema ───────────────────────────────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS axis_scores JSONB,
  ADD COLUMN IF NOT EXISTS scorecard_intro_seen BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE quest_items
  ADD COLUMN IF NOT EXISTS target_axis TEXT;

ALTER TABLE usage_tracking
  ADD COLUMN IF NOT EXISTS axis_boosts_used INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS score_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  axis       TEXT NOT NULL,
  delta      NUMERIC NOT NULL,
  reason     TEXT,
  source     TEXT,        -- quest | research | chat | onboarding | axis_boost
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE score_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users read own score_events" ON score_events;
CREATE POLICY "users read own score_events" ON score_events
  FOR SELECT USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS score_events_user_idx ON score_events(user_id, created_at DESC);

-- ── award_axis_points: atomic, diminishing-returns, capped, logs the event ──────
-- Service-role only (our edge functions + LangGraph). Up-only, cap 100.
CREATE OR REPLACE FUNCTION award_axis_points(
  p_user_id UUID,
  p_axis    TEXT,
  p_base    NUMERIC,
  p_reason  TEXT DEFAULT NULL,
  p_source  TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  valid_axes    TEXT[] := ARRAY['communication','leadership','technicality','resourcefulness','execution'];
  scores        JSONB;
  current_val   NUMERIC;
  new_val       NUMERIC;
  delta_applied NUMERIC;
BEGIN
  IF NOT (p_axis = ANY(valid_axes)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid axis');
  END IF;

  -- Defensive: if ever called by an authenticated user, only allow self.
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT axis_scores INTO scores FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF scores IS NULL THEN
    scores := jsonb_build_object(
      'communication', 40, 'leadership', 40, 'technicality', 40,
      'resourcefulness', 40, 'execution', 40
    );
  END IF;

  current_val   := COALESCE((scores->>p_axis)::numeric, 40);
  -- diminishing returns toward the 100 cap
  new_val       := round(LEAST(100, current_val + p_base * (100 - current_val) / 100.0));
  delta_applied := new_val - current_val;

  IF delta_applied <= 0 THEN
    RETURN jsonb_build_object('ok', true, 'axis', p_axis, 'value', current_val, 'delta', 0);
  END IF;

  scores := jsonb_set(scores, ARRAY[p_axis], to_jsonb(new_val));
  UPDATE profiles SET axis_scores = scores, updated_at = now() WHERE id = p_user_id;

  INSERT INTO score_events (user_id, axis, delta, reason, source)
  VALUES (p_user_id, p_axis, delta_applied, p_reason, p_source);

  RETURN jsonb_build_object('ok', true, 'axis', p_axis, 'value', new_val, 'delta', delta_applied);
END;
$$;

REVOKE ALL ON FUNCTION award_axis_points(UUID, TEXT, NUMERIC, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION award_axis_points(UUID, TEXT, NUMERIC, TEXT, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION award_axis_points(UUID, TEXT, NUMERIC, TEXT, TEXT) TO service_role;

-- ── check_and_increment_usage: add the 'axis_boost' feature ─────────────────────
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
    WHEN 'chat'       THEN chat_messages_used
    WHEN 'research'   THEN research_queries_used
    WHEN 'quest_gen'  THEN quest_generations_used
    WHEN 'axis_boost' THEN axis_boosts_used
    ELSE 0
  END
  INTO current_count
  FROM usage_tracking WHERE user_id = p_user_id FOR UPDATE;

  IF current_count >= p_limit THEN
    RETURN jsonb_build_object('allowed', false, 'used', current_count, 'limit', p_limit);
  END IF;

  UPDATE usage_tracking SET
    chat_messages_used     = CASE WHEN p_feature = 'chat'       THEN chat_messages_used     + 1 ELSE chat_messages_used     END,
    research_queries_used  = CASE WHEN p_feature = 'research'   THEN research_queries_used  + 1 ELSE research_queries_used  END,
    quest_generations_used = CASE WHEN p_feature = 'quest_gen'  THEN quest_generations_used + 1 ELSE quest_generations_used END,
    axis_boosts_used       = CASE WHEN p_feature = 'axis_boost' THEN axis_boosts_used       + 1 ELSE axis_boosts_used       END,
    updated_at = now()
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object('allowed', true, 'used', current_count + 1, 'limit', p_limit);
END;
$$;
