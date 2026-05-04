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

interface BraveResult {
  title: string
  url: string
  description: string
}

interface ResearchResult {
  title: string
  description: string
  url: string
  relevance_note: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { query } = await req.json()
    if (!query?.trim()) return new Response(JSON.stringify({ error: 'Query is required' }), { status: 400, headers: corsHeaders })

    const normalizedQuery = query.trim()

    // Cache: return existing result if same query run within last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data: cached } = await supabase
      .from('research_history')
      .select('id, results, created_at')
      .eq('user_id', user.id)
      .eq('query', normalizedQuery)
      .gte('created_at', sevenDaysAgo)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (cached) {
      return new Response(JSON.stringify({ results: cached.results, cached: true, historyId: cached.id }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      })
    }

    // Load user profile for personalization
    const { data: profile } = await supabase
      .from('profiles')
      .select('interests, strengths, career_matches, grade_level, onboarding_summary')
      .eq('id', user.id)
      .single()

    // Brave Search
    let braveResults: BraveResult[] = []
    if (BRAVE_API_KEY) {
      const searchUrl = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(normalizedQuery)}&count=12&search_lang=en&safesearch=moderate`
      const braveRes = await fetch(searchUrl, {
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': BRAVE_API_KEY,
        }
      })
      if (braveRes.ok) {
        const data = await braveRes.json()
        braveResults = (data?.web?.results || []).map((r: any) => ({
          title: r.title || '',
          url: r.url || '',
          description: r.description || '',
        })).filter((r: BraveResult) => r.title && r.url)
      }
    }

    if (braveResults.length === 0) {
      return new Response(JSON.stringify({ error: 'Search returned no results. Please try a different query.' }), {
        status: 422, headers: { 'Content-Type': 'application/json', ...corsHeaders }
      })
    }

    const profileContext = profile ? `
Student profile:
- Grade level: ${profile.grade_level || 'not specified'}
- Interests: ${JSON.stringify(profile.interests || [])}
- Strengths: ${JSON.stringify(profile.strengths || [])}
- Career matches: ${JSON.stringify(profile.career_matches || [])}
- Background: ${profile.onboarding_summary || 'not available'}
`.trim() : 'No profile available.'

    const rawResultsText = braveResults.map((r, i) =>
      `[${i + 1}] Title: ${r.title}\nURL: ${r.url}\nDescription: ${r.description}`
    ).join('\n\n')

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      system: `You are a research assistant helping high school students find real opportunities — programs, scholarships, internships, competitions, and resources.

Given raw search results and a student's profile, you:
1. Select the 5-7 most genuinely useful and relevant results
2. Write a concise, personalized relevance note for each explaining WHY it fits this specific student
3. Return ONLY valid JSON, no markdown, no explanation

Output format:
{
  "results": [
    {
      "title": "...",
      "description": "1-2 sentence summary of what this is",
      "url": "exact URL from input",
      "relevance_note": "1 sentence explaining why this fits this student specifically"
    }
  ]
}

Rules:
- Only include results that are genuinely useful for a student (not ads, low-quality spam, or irrelevant pages)
- Keep descriptions factual and brief
- Relevance notes must reference the student's actual profile details (their interests, grade, strengths)
- Preserve the exact URL from the input — never modify or invent URLs`,
      messages: [{
        role: 'user',
        content: `Query: "${normalizedQuery}"\n\n${profileContext}\n\nSearch results:\n${rawResultsText}`
      }]
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    let results: ResearchResult[] = []
    try {
      const parsed = JSON.parse(text)
      results = parsed.results || []
    } catch {
      const match = text.match(/\{[\s\S]*\}/)
      if (match) {
        try { results = JSON.parse(match[0]).results || [] } catch { results = [] }
      }
    }

    // Validate URLs against original brave results to prevent hallucination
    const validUrls = new Set(braveResults.map(r => r.url))
    results = results.filter(r => r.url && validUrls.has(r.url))

    // Save to research_history
    const { data: saved } = await supabase
      .from('research_history')
      .insert({ user_id: user.id, query: normalizedQuery, results })
      .select('id')
      .single()

    return new Response(JSON.stringify({ results, cached: false, historyId: saved?.id }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    })

  } catch (err: any) {
    console.error('run-research error:', err)
    return new Response(JSON.stringify({ error: 'Research failed', details: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders }
    })
  }
})
