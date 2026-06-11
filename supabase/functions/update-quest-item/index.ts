import { createClient } from 'npm:@supabase/supabase-js'

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

const VALID_STATUSES = ['suggested', 'considered', 'in_progress', 'completed', 'deleted']

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

    const { itemId, action, status } = await req.json()
    if (!itemId) return json({ error: 'itemId is required' }, 400)

    const validActions = ['complete', 'delete', 'move']
    if (!validActions.includes(action)) {
      return json({ error: `action must be one of: ${validActions.join(', ')}` }, 400)
    }

    // Fetch current state first — needed to award axis points exactly once on
    // the transition into "completed", and to know the quest's target axis.
    const { data: existing } = await supabase
      .from('quest_items')
      .select('status, target_axis, difficulty, title')
      .eq('id', itemId)
      .eq('user_id', user.id)
      .single()

    const now = new Date().toISOString()
    const updatePayload: Record<string, any> = { updated_at: now }

    if (action === 'complete') {
      updatePayload.status = 'completed'
      updatePayload.completed_at = now
    } else if (action === 'delete') {
      updatePayload.status = 'deleted'
    } else if (action === 'move') {
      if (!status || !VALID_STATUSES.includes(status)) {
        return json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` }, 400)
      }
      updatePayload.status = status
      if (status === 'completed') updatePayload.completed_at = now
    }

    const { error: updateError } = await supabase
      .from('quest_items')
      .update(updatePayload)
      .eq('id', itemId)
      .eq('user_id', user.id)

    if (updateError) {
      console.error('[update-quest-item] update error:', updateError)
      return json({ error: 'Failed to update quest item', details: updateError.message }, 500)
    }

    // Award axis points on a genuine transition into completed (not a re-complete).
    let award = null
    const becameCompleted = updatePayload.status === 'completed' && existing?.status !== 'completed'
    if (becameCompleted) {
      const DIFF_POINTS: Record<string, number> = { Easy: 3, Medium: 5, Hard: 8 }
      const base = DIFF_POINTS[existing?.difficulty as string] ?? 5
      const axis = (existing?.target_axis as string) || 'execution'  // legacy untagged → Execution
      const { data: awardData, error: awardErr } = await supabase.rpc('award_axis_points', {
        p_user_id: user.id,
        p_axis: axis,
        p_base: base,
        p_reason: existing?.title ? `Completed: ${existing.title}` : 'Completed a quest',
        p_source: 'quest',
      })
      if (awardErr) console.error('[update-quest-item] award_axis_points error:', awardErr)
      else award = awardData  // { ok, axis, value, delta }
    }

    return json({ success: true, award })
  } catch (err: any) {
    console.error('[update-quest-item] error:', err)
    return json({ error: 'Failed to update quest item', details: err.message }, 500)
  }
})
