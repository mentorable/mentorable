import { useState } from "react";
import { motion } from "framer-motion";
import ReflectionArea from "./ReflectionArea.jsx";

const CARD = {
  background: "linear-gradient(135deg, rgba(45,40,148,0.55) 0%, rgba(30,27,75,0.75) 100%)",
  border: "1.5px solid rgba(99,102,241,0.3)",
  borderRadius: "1.25rem",
  padding: "1.5rem 1.75rem",
  marginBottom: "1.25rem",
  boxShadow: "0 8px 32px rgba(67,56,202,0.2)",
};

export default function ProjectTaskContent({ task, userId, taskResponses, onSaveResponses }) {
  const steps = parseSteps(task?.description);
  const [checked, setChecked] = useState({});
  const toggleStep = (i) => setChecked((prev) => ({ ...prev, [i]: !prev[i] }));
  const checkedCount = Object.values(checked).filter(Boolean).length;

  return (
    <>
      <div style={CARD}>
        {/* Header row */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.875rem", marginBottom: "1.25rem" }}>
          <div style={{
            width: 48, height: 48, borderRadius: "0.875rem", flexShrink: 0,
            background: "linear-gradient(135deg, #2d2894, #4338ca)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 16px rgba(45,40,148,0.5)",
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <p style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontWeight: 800, fontSize: "1.05rem", color: "white", margin: "0 0 0.2rem",
            }}>
              Project
            </p>
            <p style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontSize: "0.78rem", fontWeight: 600,
              color: "rgba(165,180,252,0.65)", margin: 0,
            }}>
              {task?.estimated_time || "—"}
              {steps.length > 0 && ` · ${checkedCount}/${steps.length} steps`}
            </p>
          </div>
          {/* Mini progress bar */}
          {steps.length > 0 && (
            <div style={{ width: 56, flexShrink: 0 }}>
              <div style={{ height: 5, background: "rgba(255,255,255,0.1)", borderRadius: "9999px", overflow: "hidden" }}>
                <motion.div
                  animate={{ width: `${(checkedCount / steps.length) * 100}%` }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  style={{
                    height: "100%",
                    background: "linear-gradient(90deg, #10b981, #34d399)",
                    borderRadius: "9999px",
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Steps */}
        {steps.length > 0 ? (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.625rem" }}>
            {steps.map((step, i) => (
              <li
                key={i}
                onClick={() => toggleStep(i)}
                style={{
                  display: "flex", alignItems: "flex-start", gap: "0.875rem",
                  cursor: "pointer", padding: "0.625rem 0.75rem",
                  borderRadius: "0.75rem",
                  background: checked[i] ? "rgba(16,185,129,0.08)" : "rgba(99,102,241,0.07)",
                  border: `1px solid ${checked[i] ? "rgba(52,211,153,0.2)" : "rgba(99,102,241,0.15)"}`,
                  transition: "all 0.2s",
                }}
              >
                <motion.div
                  animate={{
                    background: checked[i] ? "linear-gradient(135deg, #10b981, #34d399)" : "transparent",
                    borderColor: checked[i] ? "#10b981" : "rgba(129,140,248,0.5)",
                    boxShadow: checked[i] ? "0 0 10px rgba(16,185,129,0.35)" : "none",
                  }}
                  transition={{ duration: 0.2 }}
                  style={{
                    width: 22, height: 22, borderRadius: "6px", flexShrink: 0,
                    border: `2px solid rgba(129,140,248,0.5)`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    marginTop: 1,
                  }}
                >
                  {checked[i] && (
                    <motion.svg
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", damping: 15, stiffness: 400 }}
                      width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </motion.svg>
                  )}
                </motion.div>
                <span style={{
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  fontSize: "0.9rem", fontWeight: 500,
                  color: checked[i] ? "rgba(165,180,252,0.55)" : "rgba(199,210,254,0.9)",
                  lineHeight: 1.55,
                  textDecoration: checked[i] ? "line-through" : "none",
                  transition: "all 0.2s",
                }}>
                  {step}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: "0.92rem", color: "rgba(199,210,254,0.8)",
            whiteSpace: "pre-wrap", margin: 0, lineHeight: 1.65,
          }}>
            {task?.description || "No steps listed."}
          </p>
        )}

        {/* Resource link */}
        {task?.resource_url && (
          <div style={{ marginTop: "1.25rem", paddingTop: "1.25rem", borderTop: "1px solid rgba(99,102,241,0.2)" }}>
            <a
              href={task.resource_url} target="_blank" rel="noopener noreferrer"
              style={{
                display: "inline-flex", alignItems: "center", gap: "0.4rem",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontSize: "0.85rem", fontWeight: 700, color: "#a5b4fc",
                textDecoration: "none", transition: "color 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "white"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "#a5b4fc"; }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              {task.resource_label || "Resource"}
            </a>
          </div>
        )}
      </div>

      <ReflectionArea
        taskId={task?.id} userId={userId}
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
