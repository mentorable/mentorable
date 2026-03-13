import { useState } from "react";
import { motion } from "framer-motion";
import MilestoneCard from "./MilestoneCard.jsx";

function hexToRgb(hex) {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return r ? `${parseInt(r[1], 16)},${parseInt(r[2], 16)},${parseInt(r[3], 16)}` : "99,102,241";
}

export default function PhaseSection({ phase, phaseIndex, onToggleMilestone }) {
  const isLocked = phase.status === "locked";
  const [collapsed, setCollapsed] = useState(isLocked);

  const milestones = phase.milestones ?? [];
  const completed = milestones.filter(m => m.status === "completed").length;
  const total = milestones.length;
  const progress = total > 0 ? (completed / total) * 100 : 0;

  const color = phase.color ?? "#6366f1";
  const rgb = hexToRgb(color);

  return (
    <motion.div
      id={`phase-${phase.id}`}
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.45, delay: phaseIndex * 0.07 }}
      style={{ marginBottom: "1.25rem" }}
    >
      {/* ── Phase header ── */}
      <div
        onClick={() => !isLocked && setCollapsed(c => !c)}
        style={{
          background: "rgba(15,23,42,0.88)",
          backdropFilter: "blur(20px)",
          border: `1px solid ${isLocked ? "rgba(255,255,255,0.06)" : `rgba(${rgb},0.28)`}`,
          borderLeft: isLocked ? "3px solid rgba(255,255,255,0.1)" : `3px solid ${color}`,
          borderRadius: 12,
          padding: "1.2rem 1.4rem",
          cursor: isLocked ? "default" : "pointer",
          marginBottom: collapsed || isLocked ? 0 : "0.6rem",
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.75rem" }}>
          <div style={{ flex: 1 }}>
            {/* Phase label row */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.3rem", flexWrap: "wrap" }}>
              <span style={{
                fontSize: "0.68rem", fontWeight: 800,
                color: isLocked ? "rgba(255,255,255,0.25)" : color,
                letterSpacing: "0.12em", textTransform: "uppercase",
              }}>
                PHASE {phase.phaseNumber}
              </span>
              {isLocked && <span style={{ fontSize: "0.85rem" }}>🔒</span>}
              {phase.duration && (
                <span style={{
                  fontSize: "0.72rem", padding: "2px 10px", borderRadius: 100,
                  background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.45)",
                }}>
                  {phase.duration}
                </span>
              )}
            </div>

            {/* Phase name */}
            <div style={{
              fontSize: "1.1rem", fontWeight: 700,
              color: isLocked ? "rgba(255,255,255,0.28)" : "white",
              marginBottom: "0.2rem",
            }}>
              {phase.name}
            </div>

            {phase.tagline && (
              <div style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.4)", fontStyle: "italic" }}>
                "{phase.tagline}"
              </div>
            )}
          </div>

          {!isLocked && (
            <motion.div
              animate={{ rotate: collapsed ? 0 : 180 }}
              transition={{ duration: 0.2 }}
              style={{ color: "rgba(255,255,255,0.38)", flexShrink: 0, marginTop: 2 }}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M5 7L9 11L13 7" stroke="currentColor" strokeWidth="1.5"
                  strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </motion.div>
          )}
        </div>

        {/* Progress bar */}
        {!isLocked && total > 0 && (
          <div style={{ marginTop: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.3rem" }}>
              <span style={{ fontSize: "0.73rem", color: "rgba(255,255,255,0.38)" }}>
                {completed} of {total} complete
              </span>
              <span style={{ fontSize: "0.73rem", color: color, fontWeight: 600 }}>
                {Math.round(progress)}%
              </span>
            </div>
            <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden" }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.9, ease: "easeOut", delay: phaseIndex * 0.1 }}
                style={{ height: "100%", background: color, borderRadius: 2 }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Milestones ── */}
      {!collapsed && !isLocked && milestones.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25 }}
        >
          {milestones.map(milestone => (
            <MilestoneCard
              key={milestone.id}
              milestone={milestone}
              phaseColor={color}
              onToggle={() => onToggleMilestone(phase.id, milestone.id)}
            />
          ))}
        </motion.div>
      )}
    </motion.div>
  );
}
