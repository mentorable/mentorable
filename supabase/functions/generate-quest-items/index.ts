import Anthropic from 'npm:@anthropic-ai/sdk'
import { createClient } from 'npm:@supabase/supabase-js'

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') })
const CORS_ORIGIN = Deno.env.get('CORS_ORIGIN') || '*'
const SONNET = 'claude-sonnet-4-6'

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

function parseJson<T>(text: string, fallback: T): T {
  try { return JSON.parse(text) } catch { /* try extraction */ }
  const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/)
  if (match) { try { return JSON.parse(match[0]) } catch { /* fall through */ } }
  return fallback
}

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

    const body = await req.json().catch(() => ({}))
    const count = Math.min(Math.max(parseInt(body.count) || 3, 1), 5)

    // Load all data in parallel
    const [profileRes, existingItemsRes, completedItemsRes, chatSessionsRes, researchSessionsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('quest_items').select('title').eq('user_id', user.id).in('status', ['suggested', 'considered', 'in_progress', 'active']),
      supabase.from('quest_items').select('title, category, completed_at').eq('user_id', user.id).eq('status', 'completed').order('completed_at', { ascending: false }).limit(20),
      supabase.from('chat_sessions').select('messages').eq('user_id', user.id).order('updated_at', { ascending: false }).limit(5),
      supabase.from('research_sessions').select('query').eq('user_id', user.id).order('created_at', { ascending: false }).limit(8),
    ])

    const profile = profileRes.data
    const existingItems = existingItemsRes.data || []
    const completedItems = completedItemsRes.data || []
    const chatSessions = chatSessionsRes.data || []
    const researchSessions = researchSessionsRes.data || []

    const chatSnippets: string[] = []
    for (const session of chatSessions) {
      const messages: any[] = session.messages || []
      const last4 = messages.slice(-4)
      for (const msg of last4) {
        if (chatSnippets.length >= 20) break
        if (msg.content?.trim()) chatSnippets.push(`[${msg.role}]: ${msg.content.slice(0, 200)}`)
      }
      if (chatSnippets.length >= 20) break
    }

    const profileSummary = [
      profile?.full_name ? `Name: ${profile.full_name}` : null,
      profile?.grade_level ? `Grade: ${profile.grade_level}` : null,
      profile?.education_level ? `Education: ${profile.education_level}` : null,
      profile?.location_general ? `Location: ${profile.location_general}` : null,
      profile?.onboarding_summary ? `Background: ${profile.onboarding_summary}` : null,
      Array.isArray(profile?.interests) && profile.interests.length ? `Interests: ${profile.interests.join(', ')}` : null,
      Array.isArray(profile?.strengths) && profile.strengths.length ? `Strengths: ${profile.strengths.join(', ')}` : null,
      Array.isArray(profile?.career_matches) && profile.career_matches.length ? `Career matches: ${profile.career_matches.join(', ')}` : null,
      profile?.work_style ? `Work style: ${profile.work_style}` : null,
    ].filter(Boolean).join('\n')

    const userPrompt = [
      `## Student Profile\n${profileSummary}`,
      existingItems.length
        ? `## Current Quests (avoid duplicating these)\n${existingItems.map(q => `- ${q.title}`).join('\n')}`
        : '## Current Quests\nNone yet.',
      completedItems.length
        ? `## Completed Quests\n${completedItems.map(q => `- ${q.title} (${q.category || 'Other'})`).join('\n')}`
        : '',
      chatSnippets.length ? `## Recent Chat\n${chatSnippets.join('\n')}` : '',
      researchSessions.length ? `## Recent Research\n${researchSessions.map(r => `- ${r.query}`).join('\n')}` : '',
    ].filter(Boolean).join('\n\n')

    const response = await anthropic.messages.create({
      model: SONNET,
      max_tokens: 1600,
      system: `You are Mentorable's quest engine. Generate exactly ${count} specific, actionable quests for a student based on their profile and history.

Quests are standalone challenges — a project to build, a program to apply to, a skill to practice, an opportunity to pursue.

For each quest include:
- title: concise and specific (max 60 chars)
- description: 1-2 sentences with concrete next steps
- category: one of Project, Research, Application, Learning, Other
- estimated_time: realistic estimate like "3–4 days", "1–2 weeks", "3 weeks"
- difficulty: one of Easy, Medium, Hard (Easy = < 1 week low effort, Medium = 1-2 weeks moderate, Hard = 2+ weeks high effort)
- why_it_matters: one short sentence (max 80 chars) explaining how this connects to their goals

Return ONLY valid JSON, no markdown.`,
      messages: [{
        role: 'user',
        content: `${userPrompt}\n\nGenerate exactly ${count} new quests. Return ONLY valid JSON:\n{\n  "quests": [\n    {\n      "title": "...",\n      "description": "...",\n      "category": "Project|Research|Application|Learning|Other",\n      "estimated_time": "1–2 weeks",\n      "difficulty": "Easy|Medium|Hard",\n      "why_it_matters": "..."\n    }\n  ]\n}`,
      }],
    })

    const responseText = response.content[0].type === 'text' ? response.content[0].text : ''
    const parsed = parseJson<{ quests: any[] }>(responseText, { quests: [] })

    if (!Array.isArray(parsed.quests) || parsed.quests.length === 0) {
      return json({ error: 'Failed to generate quests' }, 500)
    }

    const now = new Date().toISOString()
    const insertRows = parsed.quests.slice(0, count).map((q, i) => ({
      user_id: user.id,
      title: q.title,
      description: q.description || null,
      category: q.category || 'Other',
      estimated_time: q.estimated_time || null,
      difficulty: q.difficulty || null,
      why_it_matters: q.why_it_matters || null,
      status: 'suggested',
      order_index: existingItems.length + i,
      created_at: now,
      updated_at: now,
    }))

    const { data: inserted, error: insertError } = await supabase
      .from('quest_items')
      .insert(insertRows)
      .select()

    if (insertError) {
      console.error('[generate-quest-items] insert error:', insertError)
      return json({ error: 'Failed to save quests', details: insertError.message }, 500)
    }

    return json({ success: true, items: inserted })
  } catch (err: any) {
    console.error('[generate-quest-items] error:', err)
    return json({ error: 'Failed to generate quest items', details: err.message }, 500)
  }
})
