export interface MentionedCareer {
  title: string
  ruled_out: boolean
}

export interface Profile {
  id: string
  full_name?: string
  education_level?: 'high_school' | 'college' | 'other' | null
  grade_level?: number | null
  location_general?: string | null
  // Scorecard fields
  strengths?: string[]
  weaknesses?: string[]
  interests?: string[]
  work_style?: string | null
  career_matches?: string[]
  onboarding_summary?: string | null
  onboarding_completed?: boolean
  // Enrichment fields — nullable, may not exist for older users
  career_certainty?: 'certain' | 'exploring' | 'undecided' | null
  mentioned_careers?: MentionedCareer[] | null
  motivations?: string[] | null
  biggest_concern?: string | null
  external_influences?: string | null
  self_confidence_level?: 'low' | 'medium' | 'high' | null
  personality_signals?: string[] | null
  own_words_keywords?: string[] | null
  conversation_tone?: 'excited' | 'anxious' | 'uncertain' | 'motivated' | 'mixed' | null
  pre_roadmap_certainty?: 'certain' | 'partial' | 'undecided' | null
  pre_roadmap_career?: string | null
  created_at?: string
  updated_at?: string
}

export type RoadmapMode = 'discovery' | 'career'

export type TaskStatus = 'not_started' | 'in_progress' | 'completed' | 'skipped'

export type PhaseStatus = 'active' | 'completed' | 'locked'

export interface Roadmap {
  id: string
  user_id: string
  mode: RoadmapMode
  career_direction: string | null
  current_phase_number: number
  confidence_score: number
  is_active: boolean
  started_at: string
  updated_at: string
  created_at: string
}

export interface RoadmapPhase {
  id: string
  roadmap_id: string
  user_id: string
  phase_number: number
  title: string
  focus: string
  duration_weeks: number
  status: PhaseStatus
  generated_at: string
  created_at: string
  tasks?: RoadmapTask[]
}

export interface RoadmapTask {
  id: string
  phase_id: string
  roadmap_id: string
  user_id: string
  week_number: number
  title: string
  description: string
  estimated_time: string
  skill_gained: string | null
  resource_url: string | null
  resource_label: string | null
  status: TaskStatus
  not_for_me: boolean
  completed_at: string | null
  created_at: string
}

export interface ConfidenceEvent {
  id: string
  roadmap_id: string
  user_id: string
  previous_score: number
  new_score: number
  delta: number
  reason: string
  trigger: string
  created_at: string
}
