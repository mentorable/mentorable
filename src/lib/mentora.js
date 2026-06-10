import { supabase } from "./supabase.js";
import { withRetry } from "./retry.js";

// ─── Streaming ────────────────────────────────────────────────────────────────

function sanitizeInput(text) {
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").trim();
}

// LangGraph FastAPI service base URL. The system prompt is built server-side —
// the frontend no longer constructs it. This must be set in every environment.
const LANGGRAPH_CHAT_URL = import.meta.env.VITE_LANGGRAPH_CHAT_URL;

// ─── Onboarding extraction ────────────────────────────────────────────────────
// Calls FastAPI POST /onboarding/extract. Returns { sufficient, success?, profile?, error? }.
export async function extractProfile({ transcript }) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const res = await fetch(`${LANGGRAPH_CHAT_URL}/onboarding/extract`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ transcript }),
  });

  if (!res.ok) {
    let detail = res.statusText;
    try { const j = await res.json(); detail = j.detail || j.error || detail; } catch {}
    throw new Error(`Profile extraction failed (${res.status}): ${detail}`);
  }
  return res.json();
}

export async function streamChatResponse({ history, onChunk, onDone, onEvent }) {
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
  const body = JSON.stringify({ messages: normalized });
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
      try {
        const parsed = JSON.parse(data);
        if (parsed.text) { fullText += parsed.text; onChunk(parsed.text); }
        if (parsed.event && onEvent) onEvent(parsed);
        if (parsed.error) throw new Error(parsed.error);
      } catch (e) {
        if (e.message === parsed?.error) throw e;
      }
    }
  }

  await onDone(fullText);
  return fullText;
}
