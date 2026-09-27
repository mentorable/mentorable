import { createClient } from 'npm:@supabase/supabase-js'
import { cleanResults, expandQuery, searchUrl } from '../_shared/scorecard.ts'

// College List's school search: a signed-in student's query, answered from the
// College Scorecard with the API key kept on the server. Free government data,
// so there is no budget; signing in is the only gate, as with onet-proxy.

const CORS_ORIGIN = Deno.env.get('CORS_ORIGIN') || '*'
const corsHeaders = {
  'Access-Control-Allow-Origin': CORS_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return reply({ error: 'Unauthorized' }, 401)
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return reply({ error: 'Unauthorized' }, 401)

  const apiKey = Deno.env.get('COLLEGE_SCORECARD_API_KEY')?.trim()
  if (!apiKey) {
    return reply({ error: 'School search is not set up yet.', code: 'NOT_CONFIGURED' }, 503)
  }

  let query = ''
  try {
    const body = await req.json()
    query = typeof body?.query === 'string' ? body.query.trim() : ''
  } catch {
    return reply({ error: 'Invalid JSON body' }, 400)
  }
  if (query.length < 2 || query.length > 100) {
    return reply({ error: 'Type at least two letters of the school name.', code: 'BAD_QUERY' }, 422)
  }

  try {
    const res = await fetch(searchUrl(query, apiKey), { signal: AbortSignal.timeout(8000) })
    if (res.status === 429) {
      return reply({ error: 'School search is busy. Try again in a minute.', code: 'RATE_LIMIT' }, 429)
    }
    if (!res.ok) {
      console.warn('college-search: Scorecard error', res.status, (await res.text()).slice(0, 300))
      return reply({ error: 'School search is not responding. Try again in a bit.', code: 'UPSTREAM' }, 502)
    }
    // searched_for: the name actually searched, after a short name like
    // "UMich" is expanded, so the caller can judge a match against it.
    return reply({ schools: cleanResults(await res.json(), query), searched_for: expandQuery(query) })
  } catch (e) {
    // The request URL carries the API key, and a network error's message can
    // quote the URL, so the key is scrubbed before anything is logged.
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
    console.error('college-search: fetch failed', msg.split(apiKey).join('[key]').slice(0, 300))
    return reply({ error: 'School search is not responding. Try again in a bit.', code: 'UPSTREAM' }, 502)
  }
})
