export const LIMITS = {
  chat: 15,
  research: 3,
  quest_gen: 3,
  axis_boost: 5,
}

export async function fetchUsage(supabase) {
  const { data } = await supabase
    .from('usage_tracking')
    .select('chat_messages_used, research_queries_used, quest_generations_used, axis_boosts_used')
    .maybeSingle()
  return data ?? { chat_messages_used: 0, research_queries_used: 0, quest_generations_used: 0, axis_boosts_used: 0 }
}

export function remaining(usage, feature) {
  const map = {
    chat: 'chat_messages_used',
    research: 'research_queries_used',
    quest_gen: 'quest_generations_used',
    axis_boost: 'axis_boosts_used',
  }
  return Math.max(0, LIMITS[feature] - (usage?.[map[feature]] ?? 0))
}
