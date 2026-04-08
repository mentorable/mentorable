import { useState, useEffect, useCallback } from "react";

const DEBOUNCE_MS = 1500;
const STORAGE_PREFIX = "mentorable_reflection_";

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
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginTop: "0.75rem" }}>
        <div style={{
          width: 32, height: 32, borderRadius: "0.6rem", flexShrink: 0,
          background: "rgba(99,102,241,0.2)",
          border: "1px solid rgba(99,102,241,0.3)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#a5b4fc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <h4 style={{
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          fontWeight: 800, fontSize: "1.05rem", color: "white", margin: 0,
        }}>
          Reflection
        </h4>
        {(saving || savedKey) && (
          <span style={{
            marginLeft: "auto",
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: "0.72rem", fontWeight: 600,
            color: savedKey && !saving ? "#34d399" : "rgba(165,180,252,0.6)",
            transition: "color 0.3s",
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
          <div
            key={key}
            style={{
              background: "linear-gradient(135deg, rgba(45,40,148,0.5) 0%, rgba(30,27,75,0.7) 100%)",
              border: "1.5px solid rgba(99,102,241,0.25)",
              borderRadius: "1.25rem",
              padding: "1.25rem 1.5rem",
              boxShadow: "0 4px 20px rgba(67,56,202,0.15)",
            }}
          >
            <label style={{
              display: "block",
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontSize: "0.83rem", fontWeight: 700,
              color: "rgba(165,180,252,0.85)",
              marginBottom: "0.75rem", lineHeight: 1.5,
            }}>
              {label}
            </label>
            <textarea
              value={value}
              onChange={(e) => handleChange(key, e.target.value)}
              placeholder="Type your thoughts here…"
              style={{
                width: "100%", minHeight: 120,
                padding: "0.875rem 1rem",
                background: "rgba(15,12,60,0.5)",
                border: "1.5px solid rgba(99,102,241,0.2)",
                borderRadius: "0.875rem",
                color: "rgba(199,210,254,0.95)",
                fontSize: "0.92rem", fontWeight: 500,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                lineHeight: 1.65, resize: "vertical",
                outline: "none", transition: "border-color 0.2s",
                boxSizing: "border-box",
              }}
              onFocus={(e) => { e.target.style.borderColor = "rgba(99,102,241,0.5)"; }}
              onBlur={(e) => { e.target.style.borderColor = "rgba(99,102,241,0.2)"; }}
            />
            <div style={{
              display: "flex", justifyContent: "flex-end",
              marginTop: "0.4rem",
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontSize: "0.68rem", fontWeight: 600,
              color: "rgba(129,140,248,0.45)",
            }}>
              {value.length} chars
            </div>
          </div>
        );
      })}
    </div>
  );
}
