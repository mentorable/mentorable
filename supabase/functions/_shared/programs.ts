/**
 * Curated opportunity dataset (summer programs, AP/IB courses, internships,
 * competitions, scholarships, career resources) used as additional grounding
 * for the roadmap LLM.
 *
 * The JSON is duplicated from the repo root `data.json` so that it ships with
 * the edge function on deploy. Keep them in sync when the dataset changes
 * (or migrate to a Supabase table later).
 */

// Load the dataset at module init via the local file system. This avoids
// import-attribute syntax differences across Deno versions and works in the
// Supabase edge runtime, which bundles `_shared/programs.json` alongside the
// function on deploy.
const programsJsonUrl = new URL('./programs.json', import.meta.url)
const programsData: unknown = JSON.parse(Deno.readTextFileSync(programsJsonUrl))

type CareerFocus = string

interface SummerProgram {
  id: string
  name: string
  description: string
  duration: string
  cost: string
  location: string
  gradeLevel: number[]
  careerFocus: CareerFocus[]
  highlights: string[]
  applicationDeadline: string
  website: string
  acceptanceRate: string
}

interface AcademicCourse {
  id: string
  name: string
  type: string
  gradeLevel: number[]
  careerFocus: CareerFocus[]
  difficulty: string
  examDate: string
  topicsCovered: string[]
  passRate: string
  description: string
}

interface CareerResource {
  id: string
  name: string
  url: string
  type: string
  careerFocus: CareerFocus[]
  description: string
  features: string[]
}

interface Internship {
  id: string
  name: string
  company: string
  careerFocus: CareerFocus[]
  duration: string
  location: string
  pay: string
  gradeLevel: number[]
  applicationDeadline: string
  description: string
  requirements: string[]
}

interface Competition {
  id: string
  name: string
  careerFocus: CareerFocus[]
  type: string
  level: string
  season: string
  website: string
  description: string
  prizePool: string
}

interface Scholarship {
  id: string
  name: string
  amount: string
  careerFocus: CareerFocus[]
  eligibility: string
  website: string
  deadline: string
}

interface ProgramsDataset {
  summerPrograms: SummerProgram[]
  academicCourses: AcademicCourse[]
  careerResources: CareerResource[]
  internships: Internship[]
  competitions: Competition[]
  scholarships: Scholarship[]
}

const dataset = programsData as unknown as ProgramsDataset

// ── Matching helpers ─────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s.toLowerCase().trim()
}

/**
 * Career-focus match: returns true if any item focus loosely matches any
 * student keyword (substring either direction), or item is tagged "All".
 */
function matchesCareer(itemFocus: string[] | undefined, keywords: string[]): boolean {
  const focus = itemFocus ?? []
  if (focus.includes('All')) return true
  if (keywords.length === 0) return false
  for (const kw of keywords) {
    const k = normalize(kw)
    if (!k) continue
    for (const f of focus) {
      const fn = normalize(f)
      if (!fn) continue
      if (fn === k) return true
      if (fn.includes(k) || k.includes(fn)) return true
    }
  }
  return false
}

function matchesGrade(itemGrades: number[] | undefined, studentGrade: number | null): boolean {
  if (!itemGrades || itemGrades.length === 0) return true
  if (studentGrade == null) return true
  return itemGrades.includes(studentGrade)
}

interface FilterCaps {
  career: number
  discovery: number
}

/**
 * Filter and pick items per mode.
 * - In CAREER mode: keep only career-aligned items, capped at `career`.
 * - In DISCOVERY mode: prioritize career-aligned items, but mix in unrelated
 *   ones for variety. Capped at `discovery`.
 */
function filterAndPick<T extends { careerFocus?: string[]; gradeLevel?: number[] }>(
  items: T[],
  caps: FilterCaps,
  keywords: string[],
  studentGrade: number | null,
  isDiscovery: boolean
): T[] {
  const inGrade = items.filter((it) => matchesGrade(it.gradeLevel, studentGrade))
  const matched = inGrade.filter((it) => matchesCareer(it.careerFocus, keywords))

  if (!isDiscovery) {
    return matched.slice(0, caps.career)
  }

  // Discovery: keep up to ~half from matched, rest from non-matched for variety.
  const matchedShare = Math.min(matched.length, Math.ceil(caps.discovery / 2))
  const matchedPicks = matched.slice(0, matchedShare)
  const matchedIds = new Set(matchedPicks.map((m) => (m as unknown as { id: string }).id))
  const variety = inGrade.filter((it) => !matchedIds.has((it as unknown as { id: string }).id))
  return [...matchedPicks, ...variety].slice(0, caps.discovery)
}

// ── Public API ───────────────────────────────────────────────────────────────

interface ProfileLike {
  grade_level?: number | null
  career_matches?: unknown
  interests?: unknown
}

interface RoadmapLike {
  mode?: string | null
  career_direction?: string | null
}

/**
 * Build a compact, prompt-ready section that surfaces a handful of real,
 * relevant programs/courses/internships/competitions/scholarships/resources
 * for this student. Returns "" if nothing relevant is found (safe to inline).
 */
export function selectProgramContext(
  profile: ProfileLike | null | undefined,
  roadmap: RoadmapLike | null | undefined
): string {
  const keywords: string[] = []
  if (typeof roadmap?.career_direction === 'string' && roadmap.career_direction.trim()) {
    keywords.push(roadmap.career_direction.trim())
  }
  if (Array.isArray(profile?.career_matches)) {
    for (const m of profile!.career_matches as unknown[]) {
      if (typeof m === 'string' && m.trim()) keywords.push(m.trim())
    }
  }
  if (Array.isArray(profile?.interests)) {
    for (const i of profile!.interests as unknown[]) {
      if (typeof i === 'string' && i.trim()) keywords.push(i.trim())
    }
  }

  const grade =
    typeof profile?.grade_level === 'number' && profile.grade_level >= 9 && profile.grade_level <= 12
      ? profile.grade_level
      : null
  const isDiscovery = (roadmap?.mode ?? '').toLowerCase() === 'discovery'

  const programs = filterAndPick(
    dataset.summerPrograms,
    { career: 3, discovery: 3 },
    keywords,
    grade,
    isDiscovery
  )
  const courses = filterAndPick(
    dataset.academicCourses,
    { career: 3, discovery: 3 },
    keywords,
    grade,
    isDiscovery
  )
  const resources = filterAndPick(
    dataset.careerResources,
    { career: 4, discovery: 4 },
    keywords,
    grade,
    isDiscovery
  )
  const internships = filterAndPick(
    dataset.internships,
    { career: 2, discovery: 2 },
    keywords,
    grade,
    isDiscovery
  )
  const competitions = filterAndPick(
    dataset.competitions,
    { career: 3, discovery: 2 },
    keywords,
    grade,
    isDiscovery
  )
  const scholarships = filterAndPick(
    dataset.scholarships,
    { career: 2, discovery: 2 },
    keywords,
    grade,
    isDiscovery
  )

  const sections: string[] = []

  if (programs.length) {
    sections.push(
      '### Summer programs\n' +
        programs
          .map(
            (p) =>
              `- ${p.name} — ${p.duration}, ${p.location}, ${p.cost} (deadline ${p.applicationDeadline}, acceptance ${p.acceptanceRate}). ${p.description} | ${p.website}`
          )
          .join('\n')
    )
  }

  if (courses.length) {
    sections.push(
      '### Academic courses (AP / IB)\n' +
        courses
          .map(
            (c) =>
              `- ${c.name} (${c.type}, ${c.difficulty}, pass rate ${c.passRate}) — ${c.description}`
          )
          .join('\n')
    )
  }

  if (internships.length) {
    sections.push(
      '### Internships\n' +
        internships
          .map(
            (i) =>
              `- ${i.name} at ${i.company} — ${i.duration}, ${i.location}, ${i.pay} (deadline ${i.applicationDeadline}). ${i.description}`
          )
          .join('\n')
    )
  }

  if (competitions.length) {
    sections.push(
      '### Competitions\n' +
        competitions
          .map(
            (c) =>
              `- ${c.name} (${c.type}, ${c.level}, ${c.season}) — ${c.description} | ${c.website}`
          )
          .join('\n')
    )
  }

  if (scholarships.length) {
    sections.push(
      '### Scholarships\n' +
        scholarships
          .map(
            (s) =>
              `- ${s.name} — ${s.amount} (deadline ${s.deadline}). Eligibility: ${s.eligibility} | ${s.website}`
          )
          .join('\n')
    )
  }

  if (resources.length) {
    sections.push(
      '### Career resources / tools\n' +
        resources
          .map((r) => `- ${r.name} (${r.type}) — ${r.description} | ${r.url}`)
          .join('\n')
    )
  }

  if (sections.length === 0) return ''

  const header = isDiscovery
    ? '## Curated opportunities (real programs, courses, competitions, etc. — vary across the phase)'
    : '## Curated opportunities (real programs, courses, internships, etc. — pick what fits this phase)'

  return `\n${header}\n${sections.join('\n\n')}\n`
}
