import { useState, useEffect, useCallback } from "react";

const DEBOUNCE_MS = 1500;
const STORAGE_PREFIX = "mentorable_reflection_";
const FONT = "'Space Grotesk', sans-serif";

export default function ReflectionArea({ taskId, userId, prompts, initialResponses = {}, onSave }) {
  const [responses, setResponses] = useState(initialResponses || {});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedKey, setSavedKey] = useState(null);

  useEffect(() => {
    setResponses(initialResponses || {});
  }, [taskId, JSON.stringify(initialResponses)]);

  const save = useCallback(() => {
    if (!taskId || !dirty) return;
    setSaving(true);
    setDirty(false);
    try {
      localStorage.setItem(`${STORAGE_PREFIX}${taskId}`, JSON.stringify(responses));
      if (onSave) onSave(responses);
      setSavedKey(Date.now());
      setTimeout(() => setSavedKey(null), 2000);
    } finally {
      setSaving(false);
    }
  }, [taskId, responses, dirty, onSave]);

  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(save, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [responses, dirty, save]);

  const handleChange = (key, value) => {
    setResponses((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const list = Array.isArray(prompts) && prompts.length > 0
    ? prompts
    : [{ id: "default", label: "What did you learn or reflect on?" }];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {/* Section header */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginTop: "0.5rem" }}>
        <div style={{
          width: 30, height: 30, borderRadius: "0.5rem", flexShrink: 0,
          background: "rgba(37,99,235,0.07)", border: "1px solid rgba(37,99,235,0.15)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <h4 style={{ fontFamily: FONT, fontWeight: 700, fontSize: "1rem", color: "#0b1340", margin: 0 }}>
          Reflection
        </h4>
        {(saving || savedKey) && (
          <span style={{
            marginLeft: "auto", fontFamily: FONT, fontSize: "0.7rem", fontWeight: 600,
            color: savedKey && !saving ? "#059669" : "#9199b8", transition: "color 0.3s",
          }}>
            {saving ? "Saving…" : "Saved ✓"}
          </span>
        )}
      </div>

      {list.map((prompt, i) => {
        const key = prompt.id || `prompt_${i}`;
        const label = typeof prompt === "string" ? prompt : prompt.label || prompt.text;
        const value = responses[key] ?? "";
        return (
          <div key={key} style={{
            background: "#ffffff",
            border: "1.5px solid rgba(37,99,235,0.12)",
            borderRadius: "1.25rem",
            padding: "1.25rem 1.5rem",
            boxShadow: "0 2px 12px rgba(37,99,235,0.06)",
          }}>
            <label style={{
              display: "block", fontFamily: FONT, fontSize: "0.82rem",
              fontWeight: 600, color: "#4b5470", marginBottom: "0.7rem", lineHeight: 1.5,
            }}>
              {label}
            </label>
            <textarea
              value={value}
              onChange={(e) => handleChange(key, e.target.value)}
              placeholder="Type your thoughts here…"
              style={{
                width: "100%", minHeight: 120,
                padding: "0.825rem 1rem",
                background: "#f8faff",
                border: "1.5px solid rgba(37,99,235,0.1)",
                borderRadius: "0.75rem",
                color: "#0b1340", fontSize: "0.9rem",
                fontFamily: FONT, fontWeight: 500,
                lineHeight: 1.65, resize: "vertical",
                outline: "none", transition: "border-color 0.18s",
                boxSizing: "border-box",
              }}
              onFocus={(e) => { e.target.style.borderColor = "rgba(37,99,235,0.35)"; }}
              onBlur={(e) => { e.target.style.borderColor = "rgba(37,99,235,0.1)"; }}
            />
            <div style={{
              display: "flex", justifyContent: "flex-end", marginTop: "0.35rem",
              fontFamily: FONT, fontSize: "0.68rem", fontWeight: 600, color: "#b4bcd4",
            }}>
              {value.length} chars
            </div>
          </div>
        );
      })}
    </div>
  );
}
