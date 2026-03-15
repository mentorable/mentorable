import { useState, useEffect, useCallback } from "react";

const DEBOUNCE_MS = 1500;
const STORAGE_PREFIX = "mentorable_reflection_";

export default function ReflectionArea({
  taskId,
  userId,
  prompts,
  initialResponses = {},
  onSave,
}) {
  const [responses, setResponses] = useState(initialResponses || {});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setResponses(initialResponses || {});
  }, [taskId, JSON.stringify(initialResponses)]);

  const save = useCallback(() => {
    if (!taskId || !dirty) return;
    setSaving(true);
    setDirty(false);
    try {
      const key = `${STORAGE_PREFIX}${taskId}`;
      localStorage.setItem(key, JSON.stringify(responses));
      if (onSave) onSave(responses);
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
      <h4 style={{
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        fontWeight: 700,
        fontSize: "0.95rem",
        color: "#E8EDF5",
        margin: "1rem 0 0 0",
      }}>
        Reflection
      </h4>
      {list.map((prompt, i) => {
        const key = prompt.id || `prompt_${i}`;
        const label = typeof prompt === "string" ? prompt : prompt.label || prompt.text;
        const value = responses[key] ?? "";
        return (
          <div
            key={key}
            style={{
              background: "#111827",
              border: "1px solid #1E2D4A",
              borderRadius: 12,
              padding: "1rem 1.25rem",
            }}
          >
            <label style={{
              display: "block",
              fontSize: "0.8rem",
              fontWeight: 600,
              color: "#94a3b8",
              marginBottom: 8,
            }}>
              {label}
            </label>
            <textarea
              value={value}
              onChange={(e) => handleChange(key, e.target.value)}
              placeholder="Type your thoughts here..."
              style={{
                width: "100%",
                minHeight: 120,
                padding: "0.75rem",
                background: "rgba(10, 15, 30, 0.6)",
                border: "1px solid #1E2D4A",
                borderRadius: 8,
                color: "#E8EDF5",
                fontSize: "0.9rem",
                fontFamily: "inherit",
                resize: "vertical",
              }}
            />
            <div style={{
              display: "flex",
              justifyContent: "flex-end",
              marginTop: 6,
              fontSize: "0.7rem",
              color: "#64748B",
            }}>
              {value.length} characters {saving && "· Saving..."}
            </div>
          </div>
        );
      })}
    </div>
  );
}
