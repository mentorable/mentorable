CREATE TABLE IF NOT EXISTS quest_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,            -- 'Project', 'Research', 'Application', 'Learning', 'Other'
  estimated_time TEXT,      -- e.g. '1–2 weeks', '3–4 days'
  status TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'completed' | 'deleted'
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  order_index INTEGER DEFAULT 0
);

ALTER TABLE quest_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own their quest items" ON quest_items
  FOR ALL USING (auth.uid() = user_id);
