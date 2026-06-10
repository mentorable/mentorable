-- Evolving user memory — the "living profile".
-- A focused synthesis (separate from the frozen onboarding baseline) that
-- re-derives from activity. See .claude/MEMORY_REDESIGN.md.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS living_profile JSONB,
  ADD COLUMN IF NOT EXISTS living_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS living_events_since_sync INT NOT NULL DEFAULT 0;

-- award_axis_points is the single chokepoint every meaningful action hits
-- (quest completion, research run, substantive chat). Increment the
-- living-profile staleness counter here so it tracks real activity.
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
  new_val       := round(LEAST(100, current_val + p_base * (100 - current_val) / 100.0));
  delta_applied := new_val - current_val;

  -- Every call is a meaningful activity event for the living profile, even if
  -- the score was capped (delta 0).
  IF delta_applied <= 0 THEN
    UPDATE profiles SET living_events_since_sync = living_events_since_sync + 1 WHERE id = p_user_id;
    RETURN jsonb_build_object('ok', true, 'axis', p_axis, 'value', current_val, 'delta', 0);
  END IF;

  scores := jsonb_set(scores, ARRAY[p_axis], to_jsonb(new_val));
  UPDATE profiles
    SET axis_scores = scores,
        living_events_since_sync = living_events_since_sync + 1,
        updated_at = now()
    WHERE id = p_user_id;

  INSERT INTO score_events (user_id, axis, delta, reason, source)
  VALUES (p_user_id, p_axis, delta_applied, p_reason, p_source);

  RETURN jsonb_build_object('ok', true, 'axis', p_axis, 'value', new_val, 'delta', delta_applied);
END;
$$;

REVOKE ALL ON FUNCTION award_axis_points(UUID, TEXT, NUMERIC, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION award_axis_points(UUID, TEXT, NUMERIC, TEXT, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION award_axis_points(UUID, TEXT, NUMERIC, TEXT, TEXT) TO service_role;
