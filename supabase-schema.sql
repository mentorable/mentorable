-- ============================================================
-- Mentorable — Full Database Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================


-- ── 1. TABLES ────────────────────────────────────────────────

CREATE TABLE profiles (
  id                   UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name            TEXT DEFAULT '',
  education_level      TEXT CHECK (education_level IS NULL OR education_level IN ('high_school', 'college', 'other')),
  grade_level          SMALLINT CHECK (grade_level IS NULL OR (grade_level >= 1 AND grade_level <= 12)),
  school_type          TEXT CHECK (school_type IN ('public', 'private', 'charter', 'homeschool')),
  location_general     TEXT,
  strengths            JSONB DEFAULT '[]',
  weaknesses           JSONB DEFAULT '[]',
  interests            JSONB DEFAULT '[]',
  work_style           TEXT,
  career_matches       JSONB DEFAULT '[]',
  onboarding_summary   TEXT,
  onboarding_completed BOOLEAN DEFAULT FALSE,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE career_roadmaps (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  career_title TEXT NOT NULL,
  roadmap_data JSONB NOT NULL DEFAULT '{}',
  is_active    BOOLEAN DEFAULT TRUE,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE chat_sessions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  messages   JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE user_context (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  summary    TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE check_ins (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  week_of    DATE NOT NULL,
  responses  JSONB DEFAULT '{}',
  mood_score SMALLINT CHECK (mood_score BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE waitlist (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);


-- ── 2. ROW LEVEL SECURITY ─────────────────────────────────────

ALTER TABLE profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE career_roadmaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_context    ENABLE ROW LEVEL SECURITY;
ALTER TABLE check_ins       ENABLE ROW LEVEL SECURITY;
ALTER TABLE waitlist        ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);

-- career_roadmaps
CREATE POLICY "Users can view own roadmaps"
  ON career_roadmaps FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own roadmaps"
  ON career_roadmaps FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own roadmaps"
  ON career_roadmaps FOR UPDATE USING (auth.uid() = user_id);

-- chat_sessions
CREATE POLICY "Users can view own chat sessions"
  ON chat_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own chat sessions"
  ON chat_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own chat sessions"
  ON chat_sessions FOR UPDATE USING (auth.uid() = user_id);

-- user_context
CREATE POLICY "Users can view own context"
  ON user_context FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can insert own context"
  ON user_context FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own context"
  ON user_context FOR UPDATE USING (auth.uid() = id);

-- check_ins
CREATE POLICY "Users can view own check ins"
  ON check_ins FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own check ins"
  ON check_ins FOR INSERT WITH CHECK (auth.uid() = user_id);

-- waitlist (public insert only)
CREATE POLICY "Anyone can join waitlist"
  ON waitlist FOR INSERT WITH CHECK (true);


-- ── 3. INDEXES ────────────────────────────────────────────────

CREATE INDEX idx_career_roadmaps_user_id ON career_roadmaps(user_id);
CREATE INDEX idx_career_roadmaps_active  ON career_roadmaps(user_id, is_active);
CREATE INDEX idx_chat_sessions_user_id   ON chat_sessions(user_id);
CREATE INDEX idx_check_ins_user_week     ON check_ins(user_id, week_of);


-- ── 4. UPDATED_AT TRIGGER ─────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_chat_sessions_updated_at
  BEFORE UPDATE ON chat_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_user_context_updated_at
  BEFORE UPDATE ON user_context
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ── 5. AUTO-CREATE PROFILE ON SIGNUP ─────────────────────────

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id)
  VALUES (NEW.id);

  INSERT INTO user_context (id)
  VALUES (NEW.id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
