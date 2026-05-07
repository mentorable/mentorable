import Anthropic from 'npm:@anthropic-ai/sdk'
import { createClient } from 'npm:@supabase/supabase-js'

const CORS_ORIGIN = Deno.env.get('CORS_ORIGIN') || '*'
const corsHeaders = {
  'Access-Control-Allow-Origin': CORS_ORIGIN,
  'Access-Control-Allow-Methods': 'POST',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    // Verify caller
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()
    // phaseId + phaseNumber → phase-level regenerate; otherwise full roadmap
    const { phaseId, phaseNumber, roadmapId: incomingRoadmapId } = body

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // ── Load profile ────────────────────────────────────────────────────────────
    const { data: profile } = await supabase
      .from('profiles').select('*').eq('id', user.id).single()

    // ── Load recent chat history ─────────────────────────────────────────────────
    const { data: chatSessions } = await supabase
      .from('chat_sessions')
      .select('messages, created_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(5)

    const recentMessages: string[] = []
    for (const session of (chatSessions || [])) {
      const msgs = Array.isArray(session.messages) ? session.messages : []
      for (const m of msgs.slice(-6)) {
        if (m?.role && m?.content) {
          recentMessages.push(`${m.role === 'assistant' ? 'Mentorable' : 'Student'}: ${String(m.content).slice(0, 200)}`)
        }
      }
      if (recentMessages.length >= 20) break
    }

    // ── Load research sessions ────────────────────────────────────────────────────
    const { data: researchSessions } = await supabase
      .from('research_sessions')
      .select('query, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10)

    const researchQueries = (researchSessions || []).map((s: any) => s.query).filter(Boolean)

    // ── Active roadmap ─────────────────────────────────────────────────────────────
    const { data: activeRows } = await supabase
      .from('roadmaps')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
    const activeRoadmap = activeRows?.[0] || null

    const roadmapId = incomingRoadmapId || activeRoadmap?.id

    // ── PHASE-LEVEL REGENERATE ─────────────────────────────────────────────────────
    if (phaseId && phaseNumber && roadmapId) {
      // Delete existing tasks for the phase
      await supabase.from('roadmap_tasks').delete().eq('phase_id', phaseId)
      // Delete the phase row itself
      await supabase.from('roadmap_phases').delete().eq('id', phaseId)

      // Re-generate the phase using generate-phase
      const genResponse = await fetch(
        `${Deno.env.get('SUPABASE_URL')}/functions/v1/generate-phase`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          },
          body: JSON.stringify({ userId: user.id, roadmapId, phaseNumber }),
        }
      )
      const genData = await genResponse.json()
      if (!genResponse.ok || genData.error) {
        throw new Error(genData.error || 'Phase regeneration failed')
      }

      return new Response(JSON.stringify({ success: true, type: 'phase', phase: genData.phase }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── FULL ROADMAP REGENERATE ────────────────────────────────────────────────────
    // Use Sonnet to synthesize context and determine direction
    const contextSummary = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      system: `You are analyzing a student's profile, chat history, and research interests to determine the best starting direction for their career roadmap. Output a JSON object with two fields: "startingMode" ("career" or "discovery") and "careerDirection" (a specific career title string if startingMode is "career", otherwise null). Return only valid JSON.`,
      messages: [{
        role: 'user',
        content: `
## Profile
- Strengths: ${JSON.stringify(profile?.strengths)}
- Interests: ${JSON.stringify(profile?.interests)}
- Career matches from onboarding: ${JSON.stringify(profile?.career_matches)}
- Onboarding summary: ${profile?.onboarding_summary || 'N/A'}
- Pre-roadmap certainty: ${profile?.pre_roadmap_certainty || 'N/A'}
- Pre-roadmap career: ${profile?.pre_roadmap_career || 'N/A'}

## Recent chat messages (last 20 excerpts)
${recentMessages.length > 0 ? recentMessages.join('\n') : 'No chat history yet.'}

## Research queries (last 10)
${researchQueries.length > 0 ? researchQueries.join('\n') : 'No research history yet.'}

Based on this student's profile and activity, determine:
1. Should they start in "career" mode (clear direction) or "discovery" mode (exploring)?
2. If career mode, what specific career direction best fits their signals?
`,
      }],
    })

    let synthesis: any = { startingMode: 'discovery', careerDirection: null }
    try {
      const raw = contextSummary.content[0].type === 'text' ? contextSummary.content[0].text : '{}'
      const clean = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      synthesis = JSON.parse(clean)
    } catch {
      // fallback: use profile hints
      if (profile?.pre_roadmap_certainty === 'certain' && profile?.pre_roadmap_career) {
        synthesis = { startingMode: 'career', careerDirection: profile.pre_roadmap_career }
      }
    }

    // Deactivate current roadmap
    if (activeRoadmap) {
      await supabase.from('roadmaps').update({ is_active: false }).eq('id', activeRoadmap.id)
    }

    // If career direction determined, update profile so initialize-roadmap picks it up
    if (synthesis.startingMode === 'career' && synthesis.careerDirection) {
      const existing = profile?.career_matches || []
      const updated = [synthesis.careerDirection, ...existing.filter((c: string) => c !== synthesis.careerDirection)]
      await supabase.from('profiles').update({ career_matches: updated, pre_roadmap_career: synthesis.careerDirection }).eq('id', user.id)
    }

    // Create new roadmap via initialize-roadmap
    const initResponse = await fetch(
      `${Deno.env.get('SUPABASE_URL')}/functions/v1/initialize-roadmap`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({ userId: user.id, startingMode: synthesis.startingMode }),
      }
    )
    const initData = await initResponse.json()
    if (!initResponse.ok || initData.error) {
      throw new Error(initData.error || 'Roadmap initialization failed')
    }

    return new Response(JSON.stringify({ success: true, type: 'roadmap', roadmap: initData.roadmap }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err: any) {
    console.error('[regenerate-roadmap] error:', err)
    return new Response(JSON.stringify({ error: err.message || 'Regeneration failed' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
