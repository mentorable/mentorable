import { createClient } from 'npm:@supabase/supabase-js'

const CORS_ORIGIN = Deno.env.get('CORS_ORIGIN') || '*'
const corsHeaders = {
  'Access-Control-Allow-Origin': CORS_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Resolve caller identity from the JWT
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()
    const { taskId, action = 'complete' } = body
    if (!taskId) {
      return new Response(JSON.stringify({ error: 'Missing taskId' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (!['complete', 'flag'].includes(action)) {
      return new Response(JSON.stringify({ error: 'Invalid action' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // ── Verify task exists and belongs to the caller ───────────────────────────
    const { data: task, error: taskErr } = await supabase
      .from('roadmap_tasks')
      .select('id, user_id, status, not_for_me, phase_id')
      .eq('id', taskId)
      .single()

    if (taskErr || !task) {
      return new Response(JSON.stringify({ error: 'Task not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (task.user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Idempotent: already completed
    if (action === 'complete' && task.status === 'completed') {
      return new Response(JSON.stringify({ success: true, note: 'already completed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Load the phase to get roadmap context ──────────────────────────────────
    const { data: phase, error: phaseErr } = await supabase
      .from('roadmap_phases')
      .select('id, roadmap_id, phase_number, status')
      .eq('id', task.phase_id)
      .single()

    if (phaseErr || !phase) {
      return new Response(JSON.stringify({ error: 'Phase not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const isFlag = action === 'flag'
    const newStatus = isFlag ? 'skipped' : 'completed'
    const confidenceDelta = isFlag ? -4 : 3

    // ── Update the task ────────────────────────────────────────────────────────
    const taskUpdate: Record<string, unknown> = {
      status: newStatus,
      completed_at: newStatus === 'completed' ? new Date().toISOString() : null,
    }
    if (isFlag) taskUpdate.not_for_me = true

    await supabase.from('roadmap_tasks').update(taskUpdate).eq('id', taskId)

    // ── Update confidence score ────────────────────────────────────────────────
    const roadmapId = phase.roadmap_id
    const { data: roadmap } = await supabase
      .from('roadmaps')
      .select('confidence_score')
      .eq('id', roadmapId)
      .single()

    const prevScore = roadmap?.confidence_score ?? 0
    const newScore = Math.min(100, Math.max(0, prevScore + confidenceDelta))

    await supabase.from('roadmaps').update({ confidence_score: newScore }).eq('id', roadmapId)
    await supabase.from('confidence_history').insert({
      roadmap_id: roadmapId,
      user_id: user.id,
      previous_score: prevScore,
      new_score: newScore,
      delta: confidenceDelta,
      reason: isFlag
        ? "You flagged a task as not for you — that's useful information."
        : 'You completed a task — great momentum!',
      trigger: isFlag ? 'task_flagged_not_for_me' : 'task_completed',
    })

    // ── Check phase completion ─────────────────────────────────────────────────
    const { data: phaseTasks } = await supabase
      .from('roadmap_tasks')
      .select('status')
      .eq('phase_id', task.phase_id)

    const allDone = (phaseTasks ?? []).every(
      (t: any) => t.status === 'completed' || t.status === 'skipped'
    )

    let phaseCompleted = false
    if (allDone && phase.status !== 'completed') {
      await supabase.from('roadmap_phases').update({ status: 'completed' }).eq('id', task.phase_id)

      // Lock any phases beyond the next one in case they were pre-generated
      await supabase
        .from('roadmap_phases')
        .update({ status: 'locked' })
        .eq('roadmap_id', roadmapId)
        .gt('phase_number', phase.phase_number + 1)
        .in('status', ['active'])

      phaseCompleted = true
    }

    return new Response(JSON.stringify({
      success: true,
      newConfidenceScore: newScore,
      confidenceDelta,
      phaseCompleted,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('complete-task error:', err)
    return new Response(JSON.stringify({ error: err.message || 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
