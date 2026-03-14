import { createClient } from 'npm:@supabase/supabase-js'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      }
    })
  }

  try {
    const { userId, startingMode } = await req.json()

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    // Return existing roadmap if one already exists (prevent duplicates)
    const { data: existingRows } = await supabase
      .from('roadmaps')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)

    if (existingRows && existingRows.length > 0) {
      return new Response(JSON.stringify({
        success: true,
        roadmap: existingRows[0],
        firstPhase: null,
        note: 'existing roadmap returned'
      }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      })
    }

    const mode = startingMode === 'career' && profile.career_matches?.length > 0
      ? 'career'
      : 'discovery'

    const careerDirection = mode === 'career'
      ? profile.career_matches?.[0] || null
      : null

    // Create roadmap record
    const { data: roadmap } = await supabase
      .from('roadmaps')
      .insert({
        user_id: userId,
        mode,
        career_direction: careerDirection,
        current_phase_number: 1,
        confidence_score: mode === 'career' ? 65 : 40,
        is_active: true
      })
      .select()
      .single()

    // Generate Phase 1 by calling generate-phase
    const phaseResponse = await fetch(
      `${Deno.env.get('SUPABASE_URL')}/functions/v1/generate-phase`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
        },
        body: JSON.stringify({
          userId,
          roadmapId: roadmap!.id,
          phaseNumber: 1
        })
      }
    )

    const phaseData = await phaseResponse.json()

    return new Response(JSON.stringify({
      success: true,
      roadmap,
      firstPhase: phaseData
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })

  } catch (err: any) {
    console.error('Initialize roadmap error:', err)
    return new Response(JSON.stringify({ error: 'Failed to initialize roadmap', details: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })
  }
})
