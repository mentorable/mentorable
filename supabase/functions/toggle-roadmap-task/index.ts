// toggle-roadmap-task — check / uncheck one roadmap checklist task.
// On check: award a small amount on the parent node's target_axis (award_axis_points is
// service-role only), store the exact awarded delta on the task for a clean revert, and roll the
// node's state up to 'done' when all its tasks are checked. On uncheck: revert that exact delta
// and drop the node back to 'opened'. Mirrors the pattern in update-quest-item.
import { createClient } from 'npm:@supabase/supabase-js'

const CORS_ORIGIN = Deno.env.get('CORS_ORIGIN') || '*'
const corsHeaders = {
  'Access-Control-Allow-Origin': CORS_ORIGIN,
  'Access-Control-Allow-Methods': 'POST',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders } })

const TASK_POINTS = 2  // small per-task base; award_axis_points applies diminishing returns + cap

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

    const { taskId, action } = await req.json()
    if (!taskId) return json({ error: 'taskId is required' }, 400)
    if (action !== 'check' && action !== 'uncheck') return json({ error: "action must be 'check' or 'uncheck'" }, 400)

    const { data: task } = await supabase
      .from('roadmap_tasks')
      .select('id, node_id, done, axis_delta')
      .eq('id', taskId).eq('user_id', user.id).single()
    if (!task) return json({ error: 'Task not found' }, 404)

    const { data: node } = await supabase
      .from('roadmap_nodes')
      .select('id, title, target_axis, state')
      .eq('id', task.node_id).eq('user_id', user.id).single()
    const axis = (node?.target_axis as string) || 'execution'
    const now = new Date().toISOString()

    let award = null
    if (action === 'check' && !task.done) {
      const { data: awardData, error: awardErr } = await supabase.rpc('award_axis_points', {
        p_user_id: user.id,
        p_axis: axis,
        p_base: TASK_POINTS,
        p_reason: node?.title ? `Roadmap task in: ${node.title}` : 'Roadmap checklist task',
        p_source: 'roadmap_task',
      })
      const delta = (!awardErr && awardData?.delta) ? Number(awardData.delta) : 0
      if (awardErr) console.error('[toggle-roadmap-task] award error:', awardErr)
      else award = awardData
      await supabase.from('roadmap_tasks').update({ done: true, axis_delta: delta, updated_at: now }).eq('id', taskId).eq('user_id', user.id)
    } else if (action === 'uncheck' && task.done) {
      const delta = Number(task.axis_delta) || 0
      if (delta > 0) {
        const { error: revertErr } = await supabase.rpc('revert_axis_points', {
          p_user_id: user.id, p_axis: axis, p_delta: delta, p_source: 'roadmap_task',
        })
        if (revertErr) console.error('[toggle-roadmap-task] revert error:', revertErr)
      }
      await supabase.from('roadmap_tasks').update({ done: false, axis_delta: 0, updated_at: now }).eq('id', taskId).eq('user_id', user.id)
    }

    // Roll node state up from its tasks: all done → 'done', else 'opened' (never downgrade explore).
    const { data: siblings } = await supabase
      .from('roadmap_tasks').select('done').eq('node_id', task.node_id).eq('user_id', user.id)
    const total = siblings?.length ?? 0
    const doneCount = (siblings ?? []).filter((t: any) => t.done).length
    const newState = total > 0 && doneCount === total ? 'done' : 'opened'
    if (node && node.state !== newState) {
      await supabase.from('roadmap_nodes').update({ state: newState, updated_at: now }).eq('id', task.node_id).eq('user_id', user.id)
    }

    return json({ success: true, award, axis, node_state: newState, done_count: doneCount, total })
  } catch (err: any) {
    console.error('[toggle-roadmap-task] error:', err)
    return json({ error: 'Failed to toggle task', details: err.message }, 500)
  }
})
