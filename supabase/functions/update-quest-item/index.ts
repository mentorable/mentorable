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

    const { itemId, action } = await req.json()
    if (!itemId) return json({ error: 'itemId is required' }, 400)
    if (action !== 'complete' && action !== 'delete') return json({ error: 'action must be "complete" or "delete"' }, 400)

    const now = new Date().toISOString()
    const updatePayload: Record<string, any> = { updated_at: now }

    if (action === 'complete') {
      updatePayload.status = 'completed'
      updatePayload.completed_at = now
    } else {
      updatePayload.status = 'deleted'
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

    return json({ success: true })
  } catch (err: any) {
    console.error('[update-quest-item] error:', err)
    return json({ error: 'Failed to update quest item', details: err.message }, 500)
  }
})
