/** O*NET Web Services API v2 — shared by Edge Functions. */

export const ONET_API_BASE = 'https://api-v2.onetcenter.org'

export type MnmCareerItem = {
  href: string
  code: string
  title: string
  tags: { bright_outlook?: boolean }
}

export type MnmSearchResponse = {
  start: number
  end: number
  total: number
  prev?: string
  next?: string
  career: MnmCareerItem[]
}

/**
 * My Next Move keyword search. Returns null if ONET_API_KEY is unset or the request fails (logged).
 * Throws Error with message RATE_LIMIT when upstream returns 429.
 */
export async function mnmSearch(
  keyword: string,
  opts?: { start?: number; end?: number }
): Promise<MnmSearchResponse | null> {
  const apiKey = Deno.env.get('ONET_API_KEY')?.trim()
  if (!apiKey || !keyword.trim()) return null

  const q = new URLSearchParams({ keyword: keyword.trim() })
  if (opts?.start != null) q.set('start', String(opts.start))
  if (opts?.end != null) q.set('end', String(opts.end))

  const url = `${ONET_API_BASE}/mnm/search?${q}`
  const res = await fetch(url, { headers: { 'X-API-Key': apiKey } })

  if (res.status === 429) {
    const err = new Error('RATE_LIMIT')
    err.name = 'OnetRateLimit'
    throw err
  }

  if (!res.ok) {
    const body = await res.text()
    console.warn('O*NET mnm/search error', res.status, body.slice(0, 500))
    return null
  }

  return (await res.json()) as MnmSearchResponse
}

/** Compact lines for LLM context from search results. */
export function mnmSearchSummaryForPrompt(data: MnmSearchResponse | null): string | null {
  if (!data?.career?.length) return null
  const lines = data.career.slice(0, 8).map((c) => `- ${c.title} (O*NET-SOC ${c.code})`)
  return lines.join('\n')
}
