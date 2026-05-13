import { createClient } from 'npm:@supabase/supabase-js'

const CORS_ORIGIN = Deno.env.get('CORS_ORIGIN') || '*'
const corsHeaders = {
  'Access-Control-Allow-Origin': CORS_ORIGIN,
  'Access-Control-Allow-Methods': 'POST',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    // Return existing active roadmap (prevent duplicates)
    const { data: existingRows } = await supabase
      .from('quests')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)

    if (existingRows && existingRows.length > 0) {
      return new Response(JSON.stringify({
        success: true,
        roadmap: existingRows[0],
        firstPhase: null,
        note: 'existing roadmap returned',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Derive mode from profile — career if they have matches, discovery otherwise
    const hasCareerMatches = Array.isArray(profile?.career_matches) && profile.career_matches.length > 0
    const mode = hasCareerMatches ? 'career' : 'discovery'
    const careerDirection = mode === 'career' ? profile.career_matches[0] : null

    const { data: roadmap } = await supabase
      .from('quests')
      .insert({
        user_id: user.id,
        mode,
        career_direction: careerDirection,
        current_phase_number: 1,
        confidence_score: mode === 'career' ? 65 : 40,
        is_active: true,
      })
      .select()
      .single()

    // Generate Phase 1 server-to-server (service role)
    const phaseResponse = await fetch(
      `${Deno.env.get('SUPABASE_URL')}/functions/v1/generate-phase`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({ userId: user.id, roadmapId: roadmap!.id, phaseNumber: 1 }),
      }
    )

    const phaseData = await phaseResponse.json()

    return new Response(JSON.stringify({ success: true, roadmap, firstPhase: phaseData }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('[initialize-roadmap] error:', err)
    return new Response(JSON.stringify({ error: 'Failed to initialize roadmap', details: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
