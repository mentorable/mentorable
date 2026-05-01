-- Allow users to delete their own chat sessions
CREATE POLICY "Users can delete own chat sessions"
  ON chat_sessions FOR DELETE USING (auth.uid() = user_id);
