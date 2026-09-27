/**
 * College Scorecard (U.S. Department of Education) — shared by Edge Functions.
 *
 * Pure: builds the request and cleans the reply, no Deno or network calls, so
 * it can be checked outside the Edge runtime. Field paths were checked against
 * the live API on 2026-09-27.
 */

export const SCORECARD_API = 'https://api.data.gov/ed/collegescorecard/v1/schools'

const F = {
  id: 'id',
  name: 'school.name',
  city: 'school.city',
  state: 'school.state',
  openAdmissions: 'school.open_admissions_policy',
  admitRate: 'latest.admissions.admission_rate.overall',
  satReading25: 'latest.admissions.sat_scores.25th_percentile.critical_reading',
  satReading75: 'latest.admissions.sat_scores.75th_percentile.critical_reading',
  satMath25: 'latest.admissions.sat_scores.25th_percentile.math',
  satMath75: 'latest.admissions.sat_scores.75th_percentile.math',
  act25: 'latest.admissions.act_scores.25th_percentile.cumulative',
  act75: 'latest.admissions.act_scores.75th_percentile.cumulative',
  netPrice: 'latest.cost.avg_net_price.overall',
  size: 'latest.student.size',
} as const

export type School = {
  scorecard_id: number
  name: string
  city: string | null
  state: string | null
  admission_rate: number | null   // 0..1; 1 for an open-admission school
  sat_25: number | null           // composite, the sum of the two section ranges
  sat_75: number | null
  act_25: number | null
  act_75: number | null
  net_price: number | null
  enrollment: number | null
}

// The API searches official names only ("University of Michigan-Ann Arbor"),
// so the short names students actually type find nothing. These cover the
// common ones; anything ambiguous (OSU, UW) is left out on purpose.
//
// Where the value is the school's exact official name, the onboarding import
// can add it without asking (it only auto-adds an exact name match). UMich,
// NYU and UMass Amherst were checked against the live API; the other full
// names are the standard IPEDS names. A value that is only a few words of the
// name (UCLA's) still helps a search, and the import asks the student instead.
const ALIASES: Record<string, string> = {
  nyu: 'New York University',
  mit: 'Massachusetts Institute of Technology',
  caltech: 'California Institute of Technology',
  ucla: 'California Los Angeles',
  berkeley: 'California Berkeley',
  'uc berkeley': 'California Berkeley',
  ucb: 'California Berkeley',
  ucsd: 'California San Diego',
  'uc san diego': 'California San Diego',
  uci: 'California Irvine',
  'uc irvine': 'California Irvine',
  ucsb: 'California Santa Barbara',
  'uc santa barbara': 'California Santa Barbara',
  'uc davis': 'California Davis',
  ucd: 'California Davis',
  usc: 'University of Southern California',
  umich: 'University of Michigan-Ann Arbor',
  umass: 'University of Massachusetts',
  'umass amherst': 'University of Massachusetts-Amherst',
  uva: 'University of Virginia',
  unc: 'North Carolina Chapel Hill',
  'unc chapel hill': 'North Carolina Chapel Hill',
  uiuc: 'Illinois Urbana',
  'ut austin': 'Texas Austin',
  gatech: 'Georgia Institute of Technology',
  'georgia tech': 'Georgia Institute of Technology',
  cmu: 'Carnegie Mellon University',
  upenn: 'University of Pennsylvania',
  penn: 'University of Pennsylvania',
  jhu: 'Johns Hopkins University',
  rpi: 'Rensselaer Polytechnic',
  wpi: 'Worcester Polytechnic',
  byu: 'Brigham Young',
  'penn state': 'Pennsylvania State University',
  psu: 'Pennsylvania State University',
  umd: 'Maryland College Park',
  uconn: 'University of Connecticut',
  lsu: 'Louisiana State',
  asu: 'Arizona State',
  fsu: 'Florida State',
  uf: 'University of Florida',
  ucf: 'University of Central Florida',
  gwu: 'George Washington University',
  bu: 'Boston University',
  bc: 'Boston College',
  washu: 'Washington University in St Louis',
  wustl: 'Washington University in St Louis',
  rit: 'Rochester Institute of Technology',
  sjsu: 'San Jose State',
  sdsu: 'San Diego State',
  'cal poly': 'Polytechnic San Luis Obispo',
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
}

/** The text to send the API: a known short name expanded, anything else as typed. */
export function expandQuery(query: string): string {
  const q = normalize(query)
  return ALIASES[q] ?? query.trim()
}

/** Degree-granting colleges that are open: predominantly associate (2) or
 *  bachelor's (3), which leaves out certificate programs and graduate-only
 *  schools like medical schools. Asks for 20 so a relevance sort has room. */
export function searchUrl(query: string, apiKey: string): string {
  const q = new URLSearchParams({
    api_key: apiKey,
    // Hyphens as spaces: "Massachusetts Amherst" was seen to find
    // "University of Massachusetts-Amherst", so words match across them.
    'school.name': expandQuery(query).replace(/-/g, ' '),
    'school.operating': '1',
    'latest.school.degrees_awarded.predominant__range': '2..3',
    per_page: '20',
    fields: Object.values(F).join(','),
  })
  return `${SCORECARD_API}?${q}`
}

function num(v: unknown, min: number, max: number): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) return null
  return v
}

function int(v: unknown, min: number, max: number): number | null {
  const n = num(v, min, max)
  return n === null ? null : Math.round(n)
}

function sum(a: number | null, b: number | null, min: number, max: number): number | null {
  return a === null || b === null ? null : int(a + b, min, max)
}

function text(v: unknown, limit: number): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t.slice(0, limit) : null
}

export function cleanSchool(raw: Record<string, unknown>): School | null {
  const id = int(raw[F.id], 1, 99_999_999)
  const name = text(raw[F.name], 200)
  if (id === null || !name) return null
  const open = raw[F.openAdmissions] === 1
  return {
    scorecard_id: id,
    name,
    city: text(raw[F.city], 100),
    state: text(raw[F.state], 4),
    admission_rate: num(raw[F.admitRate], 0, 1) ?? (open ? 1 : null),
    sat_25: sum(int(raw[F.satReading25], 200, 800), int(raw[F.satMath25], 200, 800), 400, 1600),
    sat_75: sum(int(raw[F.satReading75], 200, 800), int(raw[F.satMath75], 200, 800), 400, 1600),
    act_25: int(raw[F.act25], 1, 36),
    act_75: int(raw[F.act75], 1, 36),
    net_price: int(raw[F.netPrice], 0, 1_000_000),
    enrollment: int(raw[F.size], 0, 10_000_000),
  }
}

/** Best match first: a name that starts with what they typed, then one that
 *  contains every word of it, then the rest; the biggest school first within
 *  each, which puts the flagship ahead of a same-named branch campus. */
export function cleanResults(json: unknown, query: string, limit = 8): School[] {
  const rows = (json as { results?: unknown })?.results
  if (!Array.isArray(rows)) return []
  const q = normalize(expandQuery(query))
  const words = q.split(' ').filter(Boolean)
  const rank = (s: School) => {
    const n = normalize(s.name)
    if (n.startsWith(q)) return 0
    if (words.every((w) => n.split(' ').includes(w))) return 1
    return 2
  }
  return rows
    .map((r) => (r && typeof r === 'object' ? cleanSchool(r as Record<string, unknown>) : null))
    .filter((s): s is School => s !== null)
    .sort((a, b) => rank(a) - rank(b) || (b.enrollment ?? -1) - (a.enrollment ?? -1))
    .slice(0, limit)
}
