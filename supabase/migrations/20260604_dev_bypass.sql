-- Replace check_and_increment_usage with dev-bypass support.
-- Any email in dev_emails gets allowed: true without incrementing.
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
  -- Dev bypass: infinite limits, no counter increment
  SELECT email INTO user_email FROM auth.users WHERE id = p_user_id;
  IF user_email = ANY(dev_emails) THEN
    RETURN jsonb_build_object('allowed', true, 'used', 0, 'limit', p_limit);
  END IF;

  -- Ensure row exists
  INSERT INTO usage_tracking (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  -- Lock and read current count
  SELECT CASE p_feature
    WHEN 'chat'      THEN chat_messages_used
    WHEN 'research'  THEN research_queries_used
    WHEN 'quest_gen' THEN quest_generations_used
    ELSE 0
  END
  INTO current_count
  FROM usage_tracking
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF current_count >= p_limit THEN
    RETURN jsonb_build_object('allowed', false, 'used', current_count, 'limit', p_limit);
  END IF;

  UPDATE usage_tracking SET
    chat_messages_used     = CASE WHEN p_feature = 'chat'      THEN chat_messages_used     + 1 ELSE chat_messages_used     END,
    research_queries_used  = CASE WHEN p_feature = 'research'  THEN research_queries_used  + 1 ELSE research_queries_used  END,
    quest_generations_used = CASE WHEN p_feature = 'quest_gen' THEN quest_generations_used + 1 ELSE quest_generations_used END,
    updated_at = now()
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object('allowed', true, 'used', current_count + 1, 'limit', p_limit);
END;
$$;
