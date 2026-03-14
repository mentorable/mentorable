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
