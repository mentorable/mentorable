-- Where a quest is headed, in two or three sentences: what the student wants to
-- have at the end, what they are starting from, and what it is for. Written by
-- the planner from the short conversation before planning (or from the goal
-- alone when they skip it). Every daily task and the chat advisor read it, so
-- the long-term direction stays in view the whole way through.
ALTER TABLE public.quests
  ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT ''
  CONSTRAINT quests_direction_length CHECK (char_length(direction) <= 600);
