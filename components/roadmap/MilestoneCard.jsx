import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const PRIORITY_STYLES = {
  critical: { bg: "rgba(239,68,68,0.18)", color: "#ef4444", label: "CRITICAL" },
  high:     { bg: "rgba(249,115,22,0.18)", color: "#f97316", label: "HIGH" },
  medium:   { bg: "rgba(59,130,246,0.18)",  color: "#3b82f6", label: "MEDIUM" },
  optional: { bg: "rgba(107,114,128,0.18)", color: "#9ca3af", label: "OPTIONAL" },
};

export default function MilestoneCard({ milestone, phaseColor, onToggle }) {
  const isCompleted = milestone.status === "completed";
  const priority = PRIORITY_STYLES[milestone.priority] ?? PRIORITY_STYLES.medium;

  // Critical non-completed milestones start expanded
  const [expanded, setExpanded] = useState(
    !isCompleted && milestone.priority === "critical"
  );

  return (
    <motion.div
      layout
      style={{
        background: isCompleted ? "rgba(16,185,129,0.07)" : "rgba(15,23,42,0.6)",
        border: `1px solid ${isCompleted ? "rgba(16,185,129,0.28)" : "rgba(255,255,255,0.08)"}`,
        borderRadius: 12,
        marginBottom: 10,
        overflow: "hidden",
      }}
    >
      {/* ── Collapsed header (always visible) ── */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          padding: "0.9rem 1.1rem",
          cursor: "pointer",
          display: "flex",
          alignItems: "flex-start",
          gap: "0.75rem",
        }}
      >
        {/* Completion circle */}
        <motion.div
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          whileTap={{ scale: 0.8 }}
          style={{
            width: 22, height: 22,
            borderRadius: "50%",
            border: `2px solid ${isCompleted ? "#10b981" : "rgba(255,255,255,0.28)"}`,
            background: isCompleted ? "#10b981" : "transparent",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0, marginTop: 2, cursor: "pointer",
          }}
        >
          <AnimatePresence>
            {isCompleted && (
              <motion.svg
                initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
                width="12" height="12" viewBox="0 0 12 12" fill="none"
              >
                <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round" />
              </motion.svg>
            )}
          </AnimatePresence>
        </motion.div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Badges row */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.35rem", alignItems: "center" }}>
            <span style={{
              fontSize: "0.68rem", fontWeight: 700, padding: "2px 8px",
              borderRadius: 100, background: priority.bg, color: priority.color,
              letterSpacing: "0.05em",
            }}>
              {priority.label}
            </span>
            {milestone.onetSkillAddressed && (
              <span style={{
                fontSize: "0.68rem", padding: "2px 8px", borderRadius: 100,
                background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.45)",
              }}>
                {milestone.onetSkillAddressed} · {milestone.onetImportance}
              </span>
            )}
          </div>

          {/* Title */}
          <div style={{
            fontSize: "0.925rem", fontWeight: 600,
            color: isCompleted ? "rgba(255,255,255,0.4)" : "white",
            textDecoration: isCompleted ? "line-through" : "none",
          }}>
            {milestone.title}
          </div>

          {!expanded && (
            <div style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.38)", marginTop: "0.2rem" }}>
              {milestone.estimatedTime}
            </div>
          )}
        </div>

        {/* Chevron */}
        <motion.div
          animate={{ rotate: expanded ? 180 : 0 }}
          style={{ color: "rgba(255,255,255,0.35)", flexShrink: 0, marginTop: 3 }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </motion.div>
      </div>

      {/* ── Expanded body ── */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            style={{ overflow: "hidden" }}
          >
            <div style={{ padding: "0 1.1rem 1.1rem" }}>

              {/* Description */}
              {milestone.description && (
                <p style={{
                  fontSize: "0.85rem", color: "rgba(255,255,255,0.58)",
                  lineHeight: 1.65, fontStyle: "italic", marginBottom: "1rem",
                }}>
                  "{milestone.description}"
                </p>
              )}

              {/* Why it matters */}
              {milestone.whyItMatters && (
                <InfoBlock label="Why it matters" body={milestone.whyItMatters} />
              )}

              {/* How to do it */}
              {milestone.howToDoIt?.length > 0 && (
                <div style={{ marginBottom: "1rem" }}>
                  <SectionLabel>How to do it</SectionLabel>
                  <ol style={{ paddingLeft: "1.25rem", margin: 0 }}>
                    {milestone.howToDoIt.map((step, i) => (
                      <li key={i} style={{
                        fontSize: "0.85rem", color: "rgba(255,255,255,0.68)",
                        lineHeight: 1.65, marginBottom: "0.2rem",
                      }}>
                        {step}
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Resources */}
              {milestone.resources?.length > 0 && (
                <div style={{ marginBottom: "1rem" }}>
                  <SectionLabel>Resources</SectionLabel>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                    {milestone.resources.map((res, i) => (
                      <a
                        key={i}
                        href={res.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: "inline-flex", alignItems: "center", gap: "0.4rem",
                          padding: "0.38rem 0.75rem",
                          background: "rgba(255,255,255,0.06)",
                          border: "1px solid rgba(255,255,255,0.11)",
                          borderRadius: 8, fontSize: "0.8rem",
                          color: "rgba(255,255,255,0.75)", textDecoration: "none",
                          transition: "background 0.15s",
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.11)"}
                        onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}
                      >
                        📚 {res.title}
                        {res.free && (
                          <span style={{ fontSize: "0.68rem", color: "#10b981", fontWeight: 700 }}>FREE</span>
                        )}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Completion signal */}
              {milestone.completionSignal && (
                <div style={{
                  padding: "0.55rem 0.85rem",
                  background: "rgba(16,185,129,0.09)",
                  border: "1px solid rgba(16,185,129,0.22)",
                  borderRadius: 8, marginBottom: "0.75rem",
                }}>
                  <span style={{ fontSize: "0.79rem", color: "#10b981" }}>
                    ✓ Done when: {milestone.completionSignal}
                  </span>
                </div>
              )}

              {/* Insight */}
              {milestone.milestoneInsight && (
                <div style={{
                  padding: "0.55rem 0.85rem",
                  background: "rgba(99,102,241,0.1)",
                  border: "1px solid rgba(99,102,241,0.22)",
                  borderRadius: 8, marginBottom: "0.75rem",
                }}>
                  <span style={{ fontSize: "0.79rem", color: "#a5b4fc", fontStyle: "italic" }}>
                    💡 {milestone.milestoneInsight}
                  </span>
                </div>
              )}

              <div style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.35)" }}>
                ⏱ {milestone.estimatedTime}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: "0.7rem", fontWeight: 700, color: "rgba(255,255,255,0.38)",
      textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.4rem",
    }}>
      {children}
    </div>
  );
}

function InfoBlock({ label, body }) {
  return (
    <div style={{ marginBottom: "1rem" }}>
      <SectionLabel>{label}</SectionLabel>
      <p style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.68)", lineHeight: 1.65, margin: 0 }}>
        {body}
      </p>
    </div>
  );
}
