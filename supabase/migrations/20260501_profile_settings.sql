-- Profile settings & personalization columns
-- All nullable — safe to run on existing data.

-- Preferred display name override (separate from full_name used in scorecard)
-- We reuse full_name for this.

-- Custom AI instructions
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS agent_instructions TEXT;

-- Response style preference for the Mentorable Agent
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS agent_response_style TEXT
  CHECK (agent_response_style IS NULL OR agent_response_style IN ('encouraging','balanced','direct','concise'));

-- Short bio / tagline the student writes about themselves
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bio TEXT;

-- Accent color swatch chosen by student (hex string, e.g. "#3b82f6")
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_color TEXT;

-- Roadmap: how many hours per week the student can dedicate
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS roadmap_hours_per_week TEXT
  CHECK (roadmap_hours_per_week IS NULL OR roadmap_hours_per_week IN ('1-2','3-5','6+'));

-- Roadmap: preferred learning style for generated tasks
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS roadmap_task_style TEXT
  CHECK (roadmap_task_style IS NULL OR roadmap_task_style IN ('mix','reading','hands_on','videos'));

-- Roadmap: preferred task difficulty curve
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS roadmap_difficulty TEXT
  CHECK (roadmap_difficulty IS NULL OR roadmap_difficulty IN ('gradual','balanced','challenging'));
