-- ── usage_tracking ────────────────────────────────────────────────────────────
-- One row per user. Lifetime counters — never reset.
CREATE TABLE IF NOT EXISTS usage_tracking (
  user_id                UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_messages_used     INT NOT NULL DEFAULT 0,
  research_queries_used  INT NOT NULL DEFAULT 0,
  quest_generations_used INT NOT NULL DEFAULT 0,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE usage_tracking ENABLE ROW LEVEL SECURITY;

-- Users can only read their own row; writes happen via SECURITY DEFINER RPC only
CREATE POLICY "users read own usage"
  ON usage_tracking FOR SELECT
  USING (auth.uid() = user_id);

-- ── waitlist ──────────────────────────────────────────────────────────────────
-- Stores emails of users who want early access to a paid plan.
-- Table may already exist (created outside migrations); safely add columns/policies.
CREATE TABLE IF NOT EXISTS waitlist (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add user_id column if it doesn't exist yet
ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE waitlist DROP CONSTRAINT IF EXISTS waitlist_user_id_key;
ALTER TABLE waitlist ADD CONSTRAINT waitlist_user_id_key UNIQUE (user_id);

ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users insert own waitlist" ON waitlist;
CREATE POLICY "users insert own waitlist"
  ON waitlist FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users read own waitlist" ON waitlist;
CREATE POLICY "users read own waitlist"
  ON waitlist FOR SELECT
  USING (auth.uid() = user_id);

-- ── check_and_increment_usage ─────────────────────────────────────────────────
-- Atomically checks the limit and increments the counter in one transaction.
-- Returns {allowed: bool, used: int, limit: int}
-- p_feature: 'chat' | 'research' | 'quest_gen'
CREATE OR REPLACE FUNCTION check_and_increment_usage(
  p_user_id UUID,
  p_feature  TEXT,
  p_limit    INT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  current_count INT;
BEGIN
  -- Ensure the row exists
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

  -- Increment the relevant column
  UPDATE usage_tracking SET
    chat_messages_used     = CASE WHEN p_feature = 'chat'      THEN chat_messages_used     + 1 ELSE chat_messages_used     END,
    research_queries_used  = CASE WHEN p_feature = 'research'  THEN research_queries_used  + 1 ELSE research_queries_used  END,
    quest_generations_used = CASE WHEN p_feature = 'quest_gen' THEN quest_generations_used + 1 ELSE quest_generations_used END,
    updated_at = now()
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object('allowed', true, 'used', current_count + 1, 'limit', p_limit);
END;
$$;
