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



-- ── 6. AI DATA SOURCES ───────────────────────────────────────
-- Reference table of free external datasets the AI can draw on.
-- Read-only for all authenticated users; managed via service role.

CREATE TABLE ai_data_sources (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT    NOT NULL,
  category      TEXT    NOT NULL CHECK (category IN (
                  'labor_market', 'career_info', 'skills',
                  'salary', 'education', 'colleges',
                  'scholarships', 'competitions', 'other')),
  description   TEXT    NOT NULL,
  endpoint_url  TEXT,
  access_type   TEXT    NOT NULL CHECK (access_type IN (
                  'free_api', 'free_download', 'public_web', 'built_in')),
  usage_notes   TEXT,
  is_active     BOOLEAN DEFAULT TRUE,
  last_verified TIMESTAMPTZ DEFAULT NOW(),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ai_data_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read data sources"
  ON ai_data_sources FOR SELECT
  USING (auth.role() = 'authenticated');


-- ── Seed data ────────────────────────────────────────────────

INSERT INTO ai_data_sources
  (name, category, description, endpoint_url, access_type, usage_notes)
VALUES

-- CAREER INFO
('O*NET OnLine',
 'career_info',
 'The most comprehensive US occupational database: 1,000+ careers with tasks, skills, knowledge areas, work activities, and work values.',
 'https://services.onetcenter.org/ws/',
 'free_api',
 'Use for: career descriptions, required skills, day-in-the-life details, career simulation prompts. Requires free API key from onetonline.org.'),

('CareerOneStop (DOL)',
 'career_info',
 'US Dept of Labor portal covering career exploration, training finder, job search, and career videos for 550+ occupations.',
 'https://api.careeronestop.org/',
 'free_api',
 'Use for: career videos, local job listings, training programs, apprenticeships. Free API key via careeronestop.org.'),

('MyNextMove / O*NET Interest Profiler',
 'career_info',
 'Career interest assessment (RIASEC) and career matching tool from the DOL. Maps student interests to occupations.',
 'https://www.mynextmove.org/',
 'public_web',
 'Use for: RIASEC career matching during onboarding. Embed interest profiler logic into AI onboarding questions.'),

-- LABOR MARKET
('BLS Occupational Outlook Handbook',
 'labor_market',
 'US Bureau of Labor Statistics handbook with 10-year job growth projections, median wages, and entry requirements for 330+ occupations.',
 'https://www.bls.gov/ooh/',
 'public_web',
 'Use for: job growth outlook ("is this career growing or shrinking"), employment numbers. Reference directly in roadmap generation.'),

('BLS Public Data API',
 'labor_market',
 'BLS time-series data API: unemployment rates, wage data, employment by industry. Free, no key required for public series.',
 'https://api.bls.gov/publicAPI/v2/timeseries/data/',
 'free_api',
 'Use for: real-time salary benchmarks and employment trends for the skills gap visualizer. No API key needed for basic series.'),

('US Census Bureau American Community Survey API',
 'labor_market',
 'Census data on income, employment, industry, and occupation broken down by geography.',
 'https://api.census.gov/data/',
 'free_api',
 'Use for: regional labor market context — how many people work in a given field in a given state. Pairs with BLS data for local insights.'),

('LinkedIn Economic Graph (Public Reports)',
 'labor_market',
 'LinkedIn''s publicly released "Jobs on the Rise" reports and trending skills data, updated quarterly.',
 'https://economicgraph.linkedin.com/',
 'public_web',
 'Use for: emerging roles and skills trending in job postings. Reference the annual Economic Graph reports for talking points.'),

-- SKILLS
('Lightcast Open Skills Taxonomy',
 'skills',
 'Open dataset of 32,000+ standardized skills extracted from millions of real job postings. Free download.',
 'https://skills.lightcast.io/',
 'free_download',
 'Use for: skills gap analysis — map student self-reported skills against employer demand. Download the taxonomy CSV for local matching.'),

-- SALARY
('BLS Occupational Employment and Wage Statistics (OEWS)',
 'salary',
 'Annual survey of wages for 800+ occupations across industries and geographies. Free bulk download.',
 'https://www.bls.gov/oes/',
 'free_download',
 'Use for: precise salary ranges by career and location in the scorecard and skills gap visualizer.'),

('Levels.fyi Public Compensation Data',
 'salary',
 'Crowdsourced compensation data for tech roles (SWE, PM, Data Science) at hundreds of companies. Especially strong for new grad offers.',
 'https://www.levels.fyi/',
 'public_web',
 'Use for: salary reality checks for students targeting tech careers. Cite in roadmap and chat when discussing compensation expectations.'),

-- COLLEGES
('College Scorecard API (Dept of Education)',
 'colleges',
 'Federal dataset of 6,000+ US colleges: acceptance rates, graduation rates, median earnings by field of study, average debt.',
 'https://api.data.gov/ed/collegescorecard/v1/',
 'free_api',
 'Use for: college recommendations tied to target careers, ROI analysis ("what do graduates of X program earn?"). Free key via api.data.gov.'),

('IPEDS Data Center (NCES)',
 'colleges',
 'Official US federal database for postsecondary stats: enrollment, graduation rates, tuition, financial aid, demographics by institution.',
 'https://nces.ed.gov/ipeds/use-the-data',
 'free_download',
 'Use for: detailed program-level college data. Supplements College Scorecard for deeper institutional analysis.'),

('Common Data Set Initiative',
 'colleges',
 'Standardized self-reported data from colleges on admissions, enrollment, financial aid, and academics. Published annually by each school.',
 'https://commondataset.org/',
 'public_web',
 'Use for: admissions rate context, average financial aid, class size, and academic profile comparisons.'),

-- SCHOLARSHIPS
('Scholarships.com Database',
 'scholarships',
 'Large public database of scholarships searchable by major, GPA, demographics, and state.',
 'https://www.scholarships.com/',
 'public_web',
 'Use for: surfacing scholarships in a student''s roadmap filtered by their profile (major interest, GPA, state).'),

('Opportunity Desk',
 'scholarships',
 'Curated global database of scholarships, fellowships, competitions, and grants for students and young professionals.',
 'https://opportunitydesk.org/',
 'public_web',
 'Use for: international scholarships, fellowships, and recognition programs matched to student career track.'),

-- COMPETITIONS
('Devpost',
 'competitions',
 'Aggregator of software competitions and sponsored challenges. Many accept pre-built projects and teams.',
 'https://devpost.com/',
 'public_web',
 'Use for: surfacing tech competitions in a student''s roadmap based on their career track and project portfolio.');

