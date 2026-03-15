import { motion } from "framer-motion";

export default function PhaseHeader({ phase, currentWeek, completedMilestones, totalMilestones }) {
  if (!phase) return null;

  const useMilestones = typeof completedMilestones === "number" && typeof totalMilestones === "number" && totalMilestones > 0;
  const completedWeeks = currentWeek ? currentWeek - 1 : 0;
  const totalWeeks = phase.duration_weeks || 4;
  const progressPct = useMilestones
    ? Math.min(100, Math.round((completedMilestones / totalMilestones) * 100))
    : Math.min(100, Math.round((completedWeeks / totalWeeks) * 100));
  const progressLabel = useMilestones
    ? `${completedMilestones}/${totalMilestones} milestones`
    : `${completedWeeks}/${totalWeeks} weeks`;

  const statusColors = {
    completed: { bar: "#10b981", bg: "#d1fae5", text: "#059669" },
    active: { bar: "#6366f1", bg: "#e0e7ff", text: "#4f46e5" },
    locked: { bar: "#94a3b8", bg: "#f1f5f9", text: "#64748b" },
  };
  const colors = statusColors[phase.status] || statusColors.locked;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      style={{
        background: "#1e1b4b",
        borderRadius: "1rem",
        padding: "1.25rem 1.5rem",
        marginBottom: "0",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Subtle gradient overlay */}
      <div style={{
        position: "absolute",
        inset: 0,
        background: "linear-gradient(135deg, rgba(99,102,241,0.18) 0%, transparent 70%)",
        pointerEvents: "none",
        borderRadius: "1rem",
      }} />

      <div style={{ position: "relative", zIndex: 1 }}>
        {/* Phase label row */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "0.375rem",
          gap: "0.75rem",
        }}>
          <span style={{
            fontSize: "0.68rem",
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "rgba(165,180,252,0.8)",
          }}>
            Phase {phase.phase_number}
          </span>

          {/* Duration badge */}
          <span style={{
            fontSize: "0.7rem",
            fontWeight: 600,
            color: "rgba(255,255,255,0.5)",
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: "9999px",
            padding: "0.15rem 0.6rem",
            whiteSpace: "nowrap",
          }}>
            {totalWeeks} week{totalWeeks !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Title */}
        <h3 style={{
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          fontWeight: 800,
          fontSize: "1.15rem",
          color: "white",
          margin: "0 0 0.4rem 0",
          lineHeight: 1.25,
        }}>
          {phase.title || `Phase ${phase.phase_number}`}
        </h3>

        {/* Focus sentence */}
        {phase.focus && (
          <p style={{
            fontSize: "0.83rem",
            color: "rgba(255,255,255,0.6)",
            margin: "0 0 1rem 0",
            lineHeight: 1.5,
          }}>
            {phase.focus}
          </p>
        )}

        {/* Progress bar */}
        <div>
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "0.4rem",
          }}>
            <span style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.45)", fontWeight: 500 }}>
              Progress
            </span>
            <span style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.55)", fontWeight: 600 }}>
              {progressLabel}
            </span>
          </div>
          <div style={{
            height: "6px",
            background: "rgba(255,255,255,0.1)",
            borderRadius: "9999px",
            overflow: "hidden",
          }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
              style={{
                height: "100%",
                background: phase.status === "completed"
                  ? "linear-gradient(90deg, #10b981, #34d399)"
                  : "linear-gradient(90deg, #6366f1, #818cf8)",
                borderRadius: "9999px",
              }}
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
