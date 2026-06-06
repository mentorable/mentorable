-- context_annotations — user-authored notes and replacements on their system prompt sections.
-- Used by ContextPage.jsx and injected into the Mentora system prompt via mentora.js.
CREATE TABLE IF NOT EXISTS context_annotations (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  section_id       TEXT        NOT NULL,  -- matches SECTION_LABELS keys in mentora.js
  type             TEXT        NOT NULL CHECK (type IN ('note', 'replace')),
  highlighted_text TEXT        NOT NULL DEFAULT '',
  annotation_text  TEXT        NOT NULL DEFAULT '',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE context_annotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own annotations"
  ON context_annotations
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS context_annotations_user_id_idx ON context_annotations (user_id);
