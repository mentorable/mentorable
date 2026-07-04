-- Lets a chat conversation be scoped to one roadmap node ("chat about this node").
-- Mirrors quest_items.roadmap_node_id (supabase/migrations/20260611_roadmap_phase1.sql).
ALTER TABLE chat_sessions
  ADD COLUMN IF NOT EXISTS roadmap_node_id UUID REFERENCES roadmap_nodes(id) ON DELETE SET NULL;
