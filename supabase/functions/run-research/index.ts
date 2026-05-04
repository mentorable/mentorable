import Anthropic from 'npm:@anthropic-ai/sdk'
import { createClient } from 'npm:@supabase/supabase-js'

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') })
const BRAVE_API_KEY = Deno.env.get('BRAVE_API_KEY') || ''
const CORS_ORIGIN = Deno.env.get('CORS_ORIGIN') || '*'

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

    // Cache: same query within 7 days → reuse results from another session
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

    if (cached?.results?.length) {
      await supabase.from('research_sessions')
        .update({ results: cached.results, status: 'completed', updated_at: new Date().toISOString() })
        .eq('id', sessionId)
      return json({ results: cached.results, cached: true })
    }

    // Load full profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('interests, strengths, career_matches, grade_level, age, location_general, onboarding_summary, work_style')
      .eq('id', user.id)
      .single()

    // Load active roadmap + recent tasks
    const { data: roadmap } = await supabase
      .from('roadmaps')
      .select('id, mode, career_direction, confidence_score, current_phase_number')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()

    let recentTasks: any[] = []
    if (roadmap?.id) {
      const { data: phases } = await supabase
        .from('roadmap_phases')
        .select('phase_number, title, tasks:roadmap_tasks(title, status, skill_gained)')
        .eq('roadmap_id', roadmap.id)
        .order('phase_number', { ascending: false })
        .limit(2)
      recentTasks = phases?.flatMap((p: any) => p.tasks || []) || []
    }

    // Brave Search
    let braveResults: Array<{ title: string; url: string; description: string }> = []
    if (!BRAVE_API_KEY) {
      await supabase.from('research_sessions')
        .update({ status: 'error', updated_at: new Date().toISOString() })
        .eq('id', sessionId)
      return json({ error: 'Search service not configured.' }, 503)
    }

    const searchUrl = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(normalizedQuery)}&count=14&search_lang=en&safesearch=moderate`
    const braveRes = await fetch(searchUrl, {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': BRAVE_API_KEY,
      }
    })

    if (braveRes.ok) {
      const data = await braveRes.json()
      braveResults = (data?.web?.results || [])
        .map((r: any) => ({ title: r.title || '', url: r.url || '', description: r.description || '' }))
        .filter((r: any) => r.title && r.url)
    }

    if (braveResults.length === 0) {
      await supabase.from('research_sessions')
        .update({ status: 'error', updated_at: new Date().toISOString() })
        .eq('id', sessionId)
      return json({ error: 'Search returned no results. Try a more specific query.' }, 422)
    }

    const profileBlock = profile ? `
STUDENT PROFILE
- Grade: ${profile.grade_level || 'not specified'}
- Age: ${profile.age || 'not specified'}
- Location: ${profile.location_general || 'not specified'}
- Interests: ${JSON.stringify(profile.interests || [])}
- Strengths: ${JSON.stringify(profile.strengths || [])}
- Career matches: ${JSON.stringify(profile.career_matches || [])}
- Work style: ${profile.work_style || 'not specified'}
- Background: ${profile.onboarding_summary || 'not available'}`.trim() : 'No profile available.'

    const roadmapBlock = roadmap ? `
ROADMAP STATE
- Mode: ${roadmap.mode}
- Direction: ${roadmap.career_direction || 'Exploring'}
- Confidence: ${roadmap.confidence_score}/100
- Current phase: ${roadmap.current_phase_number}
- Recent tasks: ${recentTasks.slice(0, 6).map((t: any) => t.title).join(', ')}`.trim() : ''

    const rawResultsText = braveResults.map((r, i) =>
      `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.description}`
    ).join('\n\n')

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 3000,
      system: `You are a research assistant helping high school students find real opportunities: competitions, internships, scholarships, programs, and resources.

Given raw search results and a student's full profile + roadmap, synthesize the 5–7 most genuinely useful results. For each:
- Classify its type
- Write a clean name and description
- Extract key actionable details (deadline, eligibility, etc.) — only include fields that exist in the source
- Write a personalized relevance note referencing specific things from their profile (their interests, grade, career direction, recent tasks)
- Collect all source URLs in a separate sources list

Return ONLY valid JSON:
{
  "results": [
    {
      "type": "competition|internship|scholarship|program|resource|article",
      "name": "Exact program/opportunity name",
      "description": "2-3 sentences: what it is, what it offers, who runs it",
      "details": {
        "deadline": "Month Day, Year — or omit if unknown",
        "eligibility": "Who can apply — or omit if unknown",
        "location": "Remote/State/City — or omit if not relevant",
        "compensation": "Stipend or award amount — or omit if not applicable"
      },
      "url": "exact URL from the input list",
      "relevance_note": "1 sentence tying this specifically to the student's interests, grade, career direction, or recent roadmap work"
    }
  ],
  "sources": [
    { "title": "page title", "url": "exact URL" }
  ]
}

RULES:
- Only pick genuinely useful results — skip ads, low-quality directories, or irrelevant pages
- Preserve exact URLs from the input — never modify or invent URLs
- Relevance notes must name specific profile details (e.g. "Given your interest in AI and 10th-grade standing…")
- Omit detail fields that you don't actually know — don't write "TBD" or "varies"
- sources should include all results you used, not just the top picks`,
      messages: [{
        role: 'user',
        content: `QUERY: "${normalizedQuery}"\n\n${profileBlock}\n\n${roadmapBlock}\n\nRAW SEARCH RESULTS:\n${rawResultsText}`
      }]
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    let parsed: { results: any[]; sources: any[] } = { results: [], sources: [] }
    try {
      parsed = JSON.parse(text)
    } catch {
      const match = text.match(/\{[\s\S]*\}/)
      if (match) {
        try { parsed = JSON.parse(match[0]) } catch { /* fall through with empty */ }
      }
    }

    // Validate URLs against actual brave results to prevent hallucination
    const validUrls = new Set(braveResults.map(r => r.url))
    parsed.results = (parsed.results || []).filter((r: any) => r.url && validUrls.has(r.url))
    parsed.sources = (parsed.sources || []).filter((s: any) => s.url && validUrls.has(s.url))

    const payload = { results: parsed.results, sources: parsed.sources }

    await supabase.from('research_sessions')
      .update({ results: payload, status: 'completed', updated_at: new Date().toISOString() })
      .eq('id', sessionId)

    return json({ results: payload.results, sources: payload.sources, cached: false })

  } catch (err: any) {
    console.error('run-research error:', err)
    return json({ error: 'Research failed', details: err.message }, 500)
  }
})
