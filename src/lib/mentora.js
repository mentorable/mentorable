import { supabase } from "./supabase.js";
import { withRetry } from "./retry.js";

// ─── Streaming ────────────────────────────────────────────────────────────────

function sanitizeInput(text) {
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").trim();
}

// LangGraph FastAPI service base URL. The system prompt is built server-side —
// the frontend no longer constructs it. This must be set in every environment.
const LANGGRAPH_CHAT_URL = import.meta.env.VITE_LANGGRAPH_CHAT_URL;

export async function streamChatResponse({ history, onChunk, onDone, onEvent, nodeId }) {
  const anthropicMessages = history
    .filter((m) => m.content && m.content.trim())
    .map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: sanitizeInput(m.content) }));

  const normalized = [];
  for (const msg of anthropicMessages) {
    const last = normalized[normalized.length - 1];
    if (last && last.role === msg.role) {
      last.content += "\n\n" + msg.content;
    } else {
      normalized.push({ ...msg });
    }
  }
  if (!normalized.length || normalized[0].role !== "user") return;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  // LangGraph builds the system prompt server-side from the user's JWT.
  const url = `${LANGGRAPH_CHAT_URL}/chat`;
  const body = JSON.stringify({ messages: normalized, node_id: nodeId ?? null });
  const headers = { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}` };

  const res = await withRetry(
    () => fetch(url, { method: "POST", headers, body }),
    { maxAttempts: 3, baseDelayMs: 500 }
  );

  if (!res.ok) {
    let detail = res.statusText;
    try { const j = await res.json(); detail = j.error || detail; } catch {}
    throw new Error(`Chat request failed (${res.status}): ${detail}`);
  }

  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer    = "";
  let fullText  = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6);
      if (data === "[DONE]") break;
      // `parsed` is declared out here on purpose. It used to be a const inside
      // the try, which put it out of scope in the catch that referenced it, so
      // a malformed chunk raised "parsed is not defined" and a server-sent
      // error surfaced as that instead of its own message.
      let parsed;
      try {
        parsed = JSON.parse(data);
      } catch {
        continue;   // a chunk split mid-JSON; the next read completes it
      }
      if (parsed.error) throw new Error(parsed.error);
      if (parsed.text) { fullText += parsed.text; onChunk(parsed.text); }
      if (parsed.event && onEvent) onEvent(parsed);
    }
  }

  await onDone(fullText);
  return fullText;
}
