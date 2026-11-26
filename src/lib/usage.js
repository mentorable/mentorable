export const LIMITS = {
  chat: 8,
  research: 2,
  axis_boost: 5,
  roadmap_gen: 1,
  phase_gen: 5,
  node_expand: 6,
  roadmap_reeval: 1,
  portfolio_upload: 2,
  resume_export: 1,
}

export async function fetchUsage(supabase) {
  const { data } = await supabase
    .from('usage_tracking')
    .select('chat_messages_used, research_queries_used, quest_generations_used, axis_boosts_used, roadmap_generations_used, phase_generations_used, node_expansions_used, roadmap_reevals_used, portfolio_uploads_used, resume_exports_used')
    .maybeSingle()
  return data ?? { chat_messages_used: 0, research_queries_used: 0, quest_generations_used: 0, axis_boosts_used: 0, roadmap_generations_used: 0, phase_generations_used: 0, node_expansions_used: 0, roadmap_reevals_used: 0, portfolio_uploads_used: 0, resume_exports_used: 0 }
}
