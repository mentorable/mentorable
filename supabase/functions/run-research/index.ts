import Anthropic from 'npm:@anthropic-ai/sdk'
import { createClient } from 'npm:@supabase/supabase-js'
import { buildBoardSummary } from '../_shared/ourMind.ts'

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') })
const BRAVE_API_KEY = Deno.env.get('BRAVE_API_KEY') || ''
const CORS_ORIGIN = Deno.env.get('CORS_ORIGIN') || '*'
const SONNET = 'claude-sonnet-4-6'
const TOP_N = 5 // pages to fetch and enrich

const corsHeaders = {
  'Access-Control-Allow-Origin': CORS_ORIGIN,
  'Access-Control-Allow-Methods': 'POST',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })

// ── Utilities ─────────────────────────────────────────────────────────────────

function parseJson<T>(text: string, fallback: T): T {
  try { return JSON.parse(text) } catch { /* try extraction */ }
  const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/)
  if (match) { try { return JSON.parse(match[0]) } catch { /* fall through */ } }
  return fallback
}

async function braveSearch(query: string, count = 10): Promise<Array<{ title: string; url: string; description: string }>> {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}&search_lang=en&safesearch=moderate`
  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': BRAVE_API_KEY,
      },
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data?.web?.results || [])
      .map((r: any) => ({ title: r.title || '', url: r.url || '', description: r.description || '' }))
      .filter((r: any) => r.title && r.url)
  } catch { return [] }
}

async function fetchPageText(url: string): Promise<{ text: string; ok: boolean }> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 6000)
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Mentorable-Research/1.0)',
        Accept: 'text/html,application/xhtml+xml,*/*',
      },
    })
    clearTimeout(timeoutId)
    if (!res.ok) return { text: '', ok: false }
    const html = await res.text()
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
      .replace(/<header[\s\S]*?<\/header>/gi, ' ')
      .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim()
    return { text: text.slice(0, 3500), ok: true }
  } catch { return { text: '', ok: false } }
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Unauthorized' }, 401)

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) return json({ error: 'Unauthorized' }, 401)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { query, sessionId } = await req.json()
    if (!query?.trim()) return json({ error: 'Query is required' }, 400)
    if (!sessionId) return json({ error: 'sessionId is required' }, 400)

    const normalizedQuery = query.trim()

    // ── Cache check ────────────────────────────────────────────────────────────
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data: cached } = await supabase
      .from('research_sessions')
      .select('id, results')
      .eq('user_id', user.id)
      .eq('query', normalizedQuery)
      .eq('status', 'completed')
      .gte('created_at', sevenDaysAgo)
      .neq('id', sessionId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (cached?.results) {
      const cp = cached.results
      const hasResults = Array.isArray(cp) ? cp.length > 0 : (cp?.results?.length ?? 0) > 0
      if (hasResults) {
        await supabase.from('research_sessions')
          .update({ results: cp, status: 'completed', updated_at: new Date().toISOString() })
          .eq('id', sessionId)
        const r = Array.isArray(cp) ? cp : cp.results
        const s = Array.isArray(cp) ? [] : (cp.sources || [])
        return json({ results: r, sources: s, cached: true })
      }
    }

    if (!BRAVE_API_KEY) {
      await supabase.from('research_sessions')
        .update({ status: 'error', updated_at: new Date().toISOString() })
        .eq('id', sessionId)
      return json({ error: 'Search service not configured.' }, 503)
    }

    // ── Load profile + Our Mind snapshot ───────────────────────────────────────
    const [profileRes, mindRes, completedQuestsRes] = await Promise.all([
      supabase.from('profiles')
        .select('interests, strengths, career_matches, grade_level, age, location_general, onboarding_summary, work_style')
        .eq('id', user.id)
        .single(),
      supabase.from('student_canvas')
        .select('nodes, edges')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase.from('quest_items')
        .select('title, category, completed_at')
        .eq('user_id', user.id)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(15),
    ])

    const profile = profileRes.data
    const ourMindNodes = Array.isArray(mindRes.data?.nodes) ? mindRes.data.nodes : []
    const completedQuests = completedQuestsRes.data || []

    const profileBlock = `STUDENT PROFILE
- Grade: ${profile?.grade_level || 'not specified'}
- Age: ${profile?.age || 'not specified'}
- Location: ${profile?.location_general || 'not specified'}
- Interests: ${JSON.stringify(profile?.interests || [])}
- Strengths: ${JSON.stringify(profile?.strengths || [])}
- Career matches: ${JSON.stringify(profile?.career_matches || [])}
- Work style: ${profile?.work_style || 'not specified'}
- Background: ${profile?.onboarding_summary || 'not available'}`

    const mindBlock = ourMindNodes.length
      ? `OUR MIND SNAPSHOT
${buildBoardSummary(ourMindNodes)}`
      : ''

    const completedQuestsBlock = completedQuests.length > 0
      ? `COMPLETED QUESTS\nThe student has completed these quests — use them as context for where they are in their journey:\n${completedQuests.map((q: any) => `- ${q.title} (${q.category || 'Other'}, completed ${q.completed_at ? new Date(q.completed_at).toLocaleDateString() : 'recently'})`).join('\n')}`
      : ''

    // ── Step 1: Decompose query into targeted sub-queries ──────────────────────
    const decomposeRes = await anthropic.messages.create({
      model: SONNET,
      max_tokens: 400,
      system: `You generate targeted search queries to find opportunities for high school students.
Given the student's original query and their profile, produce 2–4 specific sub-queries that together cover the full intent.
Make each query distinct — vary the angle (e.g. program-name specific, eligibility-focused, deadline-focused, alternate opportunity types).
Return ONLY valid JSON: { "subQueries": ["query1", "query2", ...] }`,
      messages: [{
        role: 'user',
        content: `ORIGINAL QUERY: "${normalizedQuery}"\n\n${profileBlock}\n\n${mindBlock}${completedQuestsBlock ? '\n\n' + completedQuestsBlock : ''}`,
      }],
    })

    const decomposeText = decomposeRes.content[0].type === 'text' ? decomposeRes.content[0].text : ''
    const { subQueries } = parseJson<{ subQueries: string[] }>(decomposeText, { subQueries: [normalizedQuery] })
    const queries = Array.isArray(subQueries) && subQueries.length > 0
      ? subQueries.slice(0, 4)
      : [normalizedQuery]

    // ── Step 2: Parallel Brave searches ───────────────────────────────────────
    const searchResults = await Promise.all(queries.map(q => braveSearch(q, 10)))

    // Deduplicate by URL across all sub-queries
    const seenUrls = new Set<string>()
    const allBraveResults: Array<{ title: string; url: string; description: string }> = []
    for (const batch of searchResults) {
      for (const r of batch) {
        if (!seenUrls.has(r.url)) {
          seenUrls.add(r.url)
          allBraveResults.push(r)
        }
      }
    }

    if (allBraveResults.length === 0) {
      await supabase.from('research_sessions')
        .update({ status: 'error', updated_at: new Date().toISOString() })
        .eq('id', sessionId)
      return json({ error: 'Search returned no results. Try a more specific query.' }, 422)
    }

    const validUrls = new Set(allBraveResults.map(r => r.url))
    const rawResultsText = allBraveResults.map((r, i) =>
      `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.description}`
    ).join('\n\n')

    // ── Step 3: Synthesize and rank across all results ─────────────────────────
    const synthesisRes = await anthropic.messages.create({
      model: SONNET,
      max_tokens: 4000,
      system: `You are a research curator helping high school students find real career opportunities.
Given raw search results from multiple targeted searches and a student's profile + current mind snapshot, select and structure the 6–8 most genuinely useful results.

For each result:
- Classify type: competition, internship, scholarship, program, resource, or article
- Write the exact program name and a clear 2–3 sentence description
- Extract any available details (deadline, eligibility, location, compensation) — only include fields you actually know
- Write a 1-sentence relevance note that references specific details from the student's profile or current mind (their interests, grade, career matches, weekly missions, open questions)
- Use only exact URLs from the input list

Return ONLY valid JSON:
{
  "results": [
    {
      "type": "...",
      "name": "Exact program name",
      "description": "2–3 sentences",
      "details": { "deadline": "...", "eligibility": "...", "location": "...", "compensation": "..." },
      "url": "exact URL from input",
      "relevance_note": "..."
    }
  ],
  "sources": [{ "title": "...", "url": "..." }]
}

Rules: skip ads, generic directories, and low-quality pages. Omit detail fields you don't know — never write "varies" or "TBD".`,
      messages: [{
        role: 'user',
        content: `QUERY: "${normalizedQuery}"\n\n${profileBlock}\n\n${mindBlock}${completedQuestsBlock ? '\n\n' + completedQuestsBlock : ''}\n\nRAW RESULTS (${allBraveResults.length} unique, from ${queries.length} sub-queries):\n${rawResultsText}`,
      }],
    })

    const synthesisText = synthesisRes.content[0].type === 'text' ? synthesisRes.content[0].text : ''
    const synthesized = parseJson<{ results: any[]; sources: any[] }>(synthesisText, { results: [], sources: [] })
    synthesized.results = (synthesized.results || []).filter((r: any) => r.url && validUrls.has(r.url))
    synthesized.sources = (synthesized.sources || []).filter((s: any) => s.url && validUrls.has(s.url))

    if (synthesized.results.length === 0) {
      await supabase.from('research_sessions')
        .update({ status: 'error', updated_at: new Date().toISOString() })
        .eq('id', sessionId)
      return json({ error: 'Could not identify relevant results. Try a different query.' }, 422)
    }

    // ── Step 4: Fetch top N pages in parallel ──────────────────────────────────
    const topResults = synthesized.results.slice(0, TOP_N)
    const pageContents = await Promise.all(topResults.map(r => fetchPageText(r.url)))

    // ── Step 5: Enrich + generate application strategies (single call) ─────────
    const pagesBlock = topResults.map((r, i) => {
      const page = pageContents[i]
      const snippet = allBraveResults.find(a => a.url === r.url)?.description || ''
      return [
        `RESULT ${i} — ${r.name}`,
        `URL: ${r.url}`,
        page.ok
          ? `PAGE CONTENT:\n${page.text}`
          : `PAGE UNAVAILABLE. Use this snippet: ${snippet}`,
      ].join('\n')
    }).join('\n\n---\n\n')

    const enrichRes = await anthropic.messages.create({
      model: SONNET,
      max_tokens: 5000,
      system: `You extract structured data from web pages and write personalized application strategies for high school students.

For EACH of the ${TOP_N} results provided:

1. EXTRACT from the page content (or snippet if page unavailable):
   - Official program name (exact, from the page itself)
   - Eligibility requirements (grade level, age, location, GPA, citizenship, etc.)
   - Application deadline (exact date if stated)
   - Direct application URL (if different from the page URL)
   - Award or benefit (scholarship amount, stipend, certificate, experience, etc.)
   - Key selection criteria (what they actually look for in applicants)

2. Write a "gamePlan" — 3–4 sentences tailored specifically to this student:
   - Name their actual interests, strengths, or career matches and explain how they fit this opportunity
   - Mention something specific from their current mind or weekly missions if relevant
   - Identify one thing to emphasize in the application based on the selection criteria
   - Close with one concrete first step they can take this week

Return ONLY a valid JSON array, one object per result in the same order:
[
  {
    "index": 0,
    "enriched": {
      "name": "exact official name, or null if same as provided",
      "description": "improved 2–3 sentence description using page data, or null if no improvement",
      "details": {
        "deadline": "Month Day, Year",
        "eligibility": "specific requirements",
        "location": "remote / city / state / country",
        "compensation": "exact amount or benefit",
        "applicationLink": "direct apply URL if different from main",
        "selectionCriteria": "what they look for"
      },
      "pageEnriched": true
    },
    "gamePlan": "3–4 sentence personalized strategy..."
  }
]

Rules:
- Only include detail fields you have actual evidence for on the page
- pageEnriched = false when the page was unavailable
- gamePlan MUST reference specific student details (name their interests, career matches, or recent work) — never write generic advice`,
      messages: [{
        role: 'user',
        content: `STUDENT:\n${profileBlock}\n\n${mindBlock}${completedQuestsBlock ? '\n\n' + completedQuestsBlock : ''}\n\n${'─'.repeat(40)}\n\nRESULTS TO ENRICH:\n${pagesBlock}`,
      }],
    })

    const enrichText = enrichRes.content[0].type === 'text' ? enrichRes.content[0].text : ''
    const enrichments = parseJson<Array<{ index: number; enriched: any; gamePlan: string }>>(enrichText, [])

    // ── Step 6: Merge enrichment into final results ────────────────────────────
    const finalResults = synthesized.results.map((r, i) => {
      if (i >= TOP_N) return r
      const enrich = Array.isArray(enrichments) ? enrichments.find((e: any) => e.index === i) : null
      if (!enrich) return r
      return {
        ...r,
        name: enrich.enriched?.name || r.name,
        description: enrich.enriched?.description || r.description,
        details: { ...r.details, ...(enrich.enriched?.details || {}) },
        pageEnriched: enrich.enriched?.pageEnriched ?? false,
        gamePlan: enrich.gamePlan ?? null,
      }
    })

    const payload = { results: finalResults, sources: synthesized.sources }

    await supabase.from('research_sessions')
      .update({ results: payload, status: 'completed', updated_at: new Date().toISOString() })
      .eq('id', sessionId)

    return json({ results: payload.results, sources: payload.sources, cached: false })

  } catch (err: any) {
    console.error('run-research error:', err)
    return json({ error: 'Research failed', details: err.message }, 500)
  }
})
