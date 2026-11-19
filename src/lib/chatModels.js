// The chat's model picker. The keys must match CHAT_MODELS in
// langgraph-service/app/models.py, which decides what each key really runs
// (an unknown key gets the default there). Stored per browser so a student's
// pick survives a reload; nothing depends on it being there.

export const CHAT_MODELS = [
  { key: "sonnet-5",      label: "Sonnet 5",      maker: "Claude" },
  { key: "haiku-5-5",     label: "Haiku 5.5",     maker: "Claude" },
  { key: "sonnet-5-5",    label: "Sonnet 5.5",    maker: "Claude" },
  { key: "gpt-6-2-sol",   label: "GPT-6.2 Sol",   maker: "ChatGPT" },
  { key: "gpt-6-1-terra", label: "GPT-6.1 Terra", maker: "ChatGPT" },
  { key: "gpt-6-luna",    label: "GPT-6 Luna",    maker: "ChatGPT" },
];

export const DEFAULT_CHAT_MODEL = "sonnet-5";

const STORAGE_KEY = "mentorable_chat_model";

export function modelLabel(key) {
  return CHAT_MODELS.find((m) => m.key === key)?.label ?? null;
}

export function loadChatModel() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (CHAT_MODELS.some((m) => m.key === saved)) return saved;
  } catch { /* storage blocked: use the default */ }
  return DEFAULT_CHAT_MODEL;
}

export function saveChatModel(key) {
  try { localStorage.setItem(STORAGE_KEY, key); } catch { /* not kept; fine */ }
}
