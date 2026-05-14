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

    // Load all data in parallel
    const [profileRes, activeItemsRes, completedItemsRes, chatSessionsRes, researchSessionsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('quest_items').select('*').eq('user_id', user.id).eq('status', 'active'),
      supabase.from('quest_items').select('title, category, completed_at').eq('user_id', user.id).eq('status', 'completed').order('completed_at', { ascending: false }).limit(20),
      supabase.from('chat_sessions').select('messages').eq('user_id', user.id).order('updated_at', { ascending: false }).limit(5),
      supabase.from('research_sessions').select('query').eq('user_id', user.id).order('created_at', { ascending: false }).limit(8),
    ])

    const profile = profileRes.data
    const activeItems = activeItemsRes.data || []
    const completedItems = completedItemsRes.data || []
    const chatSessions = chatSessionsRes.data || []
    const researchSessions = researchSessionsRes.data || []

    // Build recent chat history snippet (last 4 messages from each session, max 20 total)
    const chatSnippets: string[] = []
    for (const session of chatSessions) {
      const messages: any[] = session.messages || []
      const last4 = messages.slice(-4)
      for (const msg of last4) {
        if (chatSnippets.length >= 20) break
        if (msg.content?.trim()) {
          chatSnippets.push(`[${msg.role}]: ${msg.content.slice(0, 200)}`)
        }
      }
      if (chatSnippets.length >= 20) break
    }

    // Build profile summary
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
      activeItems.length
        ? `## Currently Active Quests (avoid duplicating these)\n${activeItems.map(q => `- ${q.title}`).join('\n')}`
        : '## Currently Active Quests\nNone yet.',
      completedItems.length
        ? `## Completed Quests (context of what they've already done)\n${completedItems.map(q => `- ${q.title} (${q.category || 'Other'})`).join('\n')}`
        : '',
      chatSnippets.length
        ? `## Recent Chat Snippets\n${chatSnippets.join('\n')}`
        : '',
      researchSessions.length
        ? `## Recent Research Interests\n${researchSessions.map(r => `- ${r.query}`).join('\n')}`
        : '',
    ].filter(Boolean).join('\n\n')

    const response = await anthropic.messages.create({
      model: SONNET,
      max_tokens: 1200,
      system: `You are Mentorable's quest engine. Generate exactly 3 specific, actionable quests for a student based on their profile and history. Quests are standalone challenges (not tasks in a hierarchy) — think: a project to build, a program to apply to, a skill to practice. Each quest should have a realistic time estimate (days or weeks) like '3–4 days', '1–2 weeks', '3 weeks'. Return ONLY valid JSON, no markdown.`,
      messages: [{
        role: 'user',
        content: `${userPrompt}\n\nGenerate exactly 3 new quests. Return ONLY valid JSON:\n{\n  "quests": [\n    { "title": "...", "description": "...", "category": "Project|Research|Application|Learning|Other", "estimated_time": "1–2 weeks" },\n    ...\n  ]\n}`,
      }],
    })

    const responseText = response.content[0].type === 'text' ? response.content[0].text : ''
    const parsed = parseJson<{ quests: Array<{ title: string; description: string; category: string; estimated_time: string }> }>(
      responseText,
      { quests: [] }
    )

    if (!Array.isArray(parsed.quests) || parsed.quests.length === 0) {
      return json({ error: 'Failed to generate quests' }, 500)
    }

    const now = new Date().toISOString()
    const insertRows = parsed.quests.slice(0, 3).map((q, i) => ({
      user_id: user.id,
      title: q.title,
      description: q.description || null,
      category: q.category || 'Other',
      estimated_time: q.estimated_time || null,
      status: 'active',
      order_index: activeItems.length + i,
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
