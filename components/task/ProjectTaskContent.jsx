import { useState } from "react";
import ReflectionArea from "./ReflectionArea.jsx";

export default function ProjectTaskContent({ task, userId, taskResponses, onSaveResponses }) {
  const steps = parseSteps(task?.description);
  const [checked, setChecked] = useState({});

  const toggleStep = (i) => {
    setChecked((prev) => ({ ...prev, [i]: !prev[i] }));
  };

  return (
    <>
      <div style={{
        background: "#111827",
        border: "1px solid #1E2D4A",
        borderRadius: 16,
        padding: "1.5rem",
        marginBottom: "1rem",
      }}>
        <h3 style={{
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          fontWeight: 700,
          fontSize: "1rem",
          color: "#E8EDF5",
          margin: "0 0 1rem 0",
        }}>
          Steps
        </h3>
        {steps.length > 0 ? (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {steps.map((step, i) => (
              <li
                key={i}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                  marginBottom: 12,
                  cursor: "pointer",
                }}
                onClick={() => toggleStep(i)}
              >
                <div style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  border: `2px solid ${checked[i] ? "#22C55E" : "#1E2D4A"}`,
                  background: checked[i] ? "#22C55E" : "transparent",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                  {checked[i] && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
                <span style={{ fontSize: "0.9rem", color: "#E8EDF5", lineHeight: 1.5 }}>
                  {step}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ fontSize: "0.9rem", color: "#94a3b8", whiteSpace: "pre-wrap", margin: 0 }}>
            {task?.description || "No steps listed."}
          </p>
        )}
      </div>
      {task?.resource_url && (
        <div style={{
          background: "#111827",
          border: "1px solid #1E2D4A",
          borderRadius: 12,
          padding: "1rem",
          marginBottom: "1rem",
        }}>
          <a
            href={task.resource_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#3B82F6", fontSize: "0.875rem", fontWeight: 600 }}
          >
            {task.resource_label || "Resource"} →
          </a>
        </div>
      )}
      <ReflectionArea
        taskId={task?.id}
        userId={userId}
        prompts={[]}
        initialResponses={taskResponses?.responses || {}}
        onSave={onSaveResponses}
      />
    </>
  );
}

function parseSteps(desc) {
  if (!desc || typeof desc !== "string") return [];
  return desc
    .split(/\n/)
    .map((s) => s.replace(/^\s*[\d\-*•.]+\s*/, "").trim())
    .filter(Boolean);
}
