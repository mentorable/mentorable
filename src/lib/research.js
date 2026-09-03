import { supabase } from "./supabase.js";

const LANGGRAPH_URL = import.meta.env.VITE_LANGGRAPH_CHAT_URL;

export class ResearchLimitError extends Error {}

// Runs one research query end-to-end: creates the backing research_sessions
// row /research needs (for its 7-day cache + cross-feature memory writes),
// calls the LangGraph endpoint, and reads out its SSE keep-alive + result
// stream. Mirrors what the old standalone Research page did.
export async function runResearch(query) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { data: newSession, error: insertErr } = await supabase
    .from("research_sessions")
    .insert({ user_id: user.id, query, status: "pending" })
    .select("id")
    .single();
  if (insertErr) throw insertErr;
  const sessionId = newSession.id;

  const { data: { session } } = await supabase.auth.getSession();

  const res = await fetch(`${LANGGRAPH_URL}/research`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
    body: JSON.stringify({ query, session_id: sessionId }),
  });

  if (res.status === 429) throw new ResearchLimitError("LIMIT_REACHED");
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    await supabase.from("research_sessions").update({ status: "error", updated_at: new Date().toISOString() }).eq("id", sessionId);
    throw new Error(j.detail || "Research failed");
  }

  // /research streams SSE: periodic ": keep-alive" comments while the
  // pipeline runs (keeps the connection alive past a minute), then a
  // single "data: {...}" result payload followed by "data: [DONE]".
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let data = null;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6);
      if (payload === "[DONE]") continue;
      try { data = JSON.parse(payload); } catch {}
    }
  }

  if (!data) {
    await supabase.from("research_sessions").update({ status: "error", updated_at: new Date().toISOString() }).eq("id", sessionId);
    throw new Error("Research failed");
  }
  if (data.error) {
    await supabase.from("research_sessions").update({ status: "error", updated_at: new Date().toISOString() }).eq("id", sessionId);
    if (data.error === "LIMIT_REACHED") throw new ResearchLimitError("LIMIT_REACHED");
    throw new Error(data.error);
  }

  return { results: data.results || [], sources: data.sources || [], cached: !!data.cached };
}

// Plain-text rendition of a research turn's results, used as the message's
// `content` when sent back to /chat as history — lets the AI actually
// understand what was found for natural follow-up questions.
export function summarizeResearchForHistory(query, results) {
  if (!results?.length) return `I searched for "${query}" but didn't find clear results.`;
  const lines = results.slice(0, 8).map((r, i) => {
    const bits = [r.name || r.title];
    if (r.type) bits.push(`(${r.type})`);
    if (r.details?.deadline) bits.push(`— deadline: ${r.details.deadline}`);
    if (r.description) bits.push(`— ${r.description}`);
    return `${i + 1}. ${bits.join(" ")}`;
  });
  return `Found ${results.length} result${results.length === 1 ? "" : "s"} for "${query}":\n${lines.join("\n")}`;
}
