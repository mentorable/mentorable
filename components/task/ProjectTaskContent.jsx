import { useState } from "react";
import { motion } from "framer-motion";
import ReflectionArea from "./ReflectionArea.jsx";

const FONT = "'Space Grotesk', sans-serif";
const CARD = {
  background: "#ffffff",
  border: "1.5px solid rgba(37,99,235,0.12)",
  borderRadius: "1.25rem",
  padding: "1.5rem 1.75rem",
  marginBottom: "1.25rem",
  boxShadow: "0 4px 24px rgba(37,99,235,0.08), 0 1px 4px rgba(0,0,0,0.04)",
};

export default function ProjectTaskContent({ task, userId, taskResponses, onSaveResponses }) {
  const steps = parseSteps(task?.description);
  const [checked, setChecked] = useState({});
  const toggleStep = (i) => setChecked((prev) => ({ ...prev, [i]: !prev[i] }));
  const checkedCount = Object.values(checked).filter(Boolean).length;

  return (
    <>
      <div style={CARD}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.875rem", marginBottom: "1.25rem" }}>
          <div style={{
            width: 46, height: 46, borderRadius: "0.875rem", flexShrink: 0,
            background: "linear-gradient(135deg, #0f766e, #0d9488)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 14px rgba(15,118,110,0.3)",
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontFamily: FONT, fontWeight: 700, fontSize: "1rem", color: "#0b1340", margin: "0 0 0.15rem" }}>
              Project
            </p>
            <p style={{ fontFamily: FONT, fontSize: "0.78rem", fontWeight: 500, color: "#9199b8", margin: 0 }}>
              {task?.estimated_time || "—"}{steps.length > 0 && ` · ${checkedCount}/${steps.length} steps`}
            </p>
          </div>
          {steps.length > 0 && (
            <div style={{ width: 52, flexShrink: 0 }}>
              <div style={{ height: 5, background: "rgba(37,99,235,0.08)", borderRadius: "9999px", overflow: "hidden" }}>
                <motion.div
                  animate={{ width: `${(checkedCount / steps.length) * 100}%` }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  style={{ height: "100%", background: "linear-gradient(90deg, #059669, #10b981)", borderRadius: "9999px" }}
                />
              </div>
            </div>
          )}
        </div>

        {steps.length > 0 ? (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {steps.map((step, i) => (
              <li key={i} onClick={() => toggleStep(i)}
                style={{
                  display: "flex", alignItems: "flex-start", gap: "0.75rem",
                  cursor: "pointer", padding: "0.6rem 0.75rem", borderRadius: "0.75rem",
                  background: checked[i] ? "rgba(16,185,129,0.05)" : "rgba(37,99,235,0.03)",
                  border: `1px solid ${checked[i] ? "rgba(16,185,129,0.15)" : "rgba(37,99,235,0.08)"}`,
                  transition: "all 0.18s",
                }}
              >
                <motion.div
                  animate={{
                    background: checked[i] ? "linear-gradient(135deg, #059669, #10b981)" : "transparent",
                    borderColor: checked[i] ? "#059669" : "rgba(37,99,235,0.25)",
                  }}
                  transition={{ duration: 0.18 }}
                  style={{
                    width: 20, height: 20, borderRadius: "5px", flexShrink: 0,
                    border: "1.5px solid rgba(37,99,235,0.25)",
                    display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1,
                  }}
                >
                  {checked[i] && (
                    <motion.svg
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", damping: 14, stiffness: 400 }}
                      width="11" height="11" viewBox="0 0 24 24" fill="none"
                      stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </motion.svg>
                  )}
                </motion.div>
                <span style={{
                  fontFamily: FONT, fontSize: "0.88rem", fontWeight: 500,
                  color: checked[i] ? "#9199b8" : "#0b1340", lineHeight: 1.55,
                  textDecoration: checked[i] ? "line-through" : "none", transition: "all 0.18s",
                }}>
                  {step}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ fontFamily: FONT, fontSize: "0.9rem", color: "#4b5470", whiteSpace: "pre-wrap", margin: 0, lineHeight: 1.65 }}>
            {task?.description || "No steps listed."}
          </p>
        )}

        {task?.resource_url && (
          <div style={{ marginTop: "1.25rem", paddingTop: "1.25rem", borderTop: "1px solid rgba(37,99,235,0.08)" }}>
            <a href={task.resource_url} target="_blank" rel="noopener noreferrer"
              style={{
                display: "inline-flex", alignItems: "center", gap: "0.4rem",
                fontFamily: FONT, fontSize: "0.85rem", fontWeight: 700, color: "#1d4ed8",
                textDecoration: "none", transition: "color 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "#1e40af"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "#1d4ed8"; }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              {task.resource_label || "Resource"}
            </a>
          </div>
        )}
      </div>

      <ReflectionArea taskId={task?.id} userId={userId} prompts={[]}
        initialResponses={taskResponses?.responses || {}} onSave={onSaveResponses} />
    </>
  );
}

function parseSteps(desc) {
  if (!desc || typeof desc !== "string") return [];
  return desc.split(/\n/).map((s) => s.replace(/^\s*[\d\-*•.]+\s*/, "").trim()).filter(Boolean);
}
