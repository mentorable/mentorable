import { motion } from "framer-motion";

const FONT = "'Space Grotesk', sans-serif";

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

  const barGradient = phase.status === "completed"
    ? "linear-gradient(90deg, #10b981, #34d399)"
    : "linear-gradient(90deg, #1d4ed8, #3b82f6)";

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      style={{
        background: "#ffffff",
        borderRadius: "1.25rem",
        padding: "1.5rem 1.75rem",
        marginBottom: "0",
        position: "relative",
        overflow: "hidden",
        border: "1.5px solid rgba(37,99,235,0.15)",
        boxShadow: "0 4px 24px rgba(37,99,235,0.1), 0 1px 4px rgba(0,0,0,0.04)",
      }}
    >
      {/* Subtle top accent bar */}
      <div style={{
        position: "absolute",
        top: 0, left: 0, right: 0,
        height: 3,
        background: barGradient,
        borderRadius: "1.25rem 1.25rem 0 0",
      }} />

      <div style={{ position: "relative", zIndex: 1 }}>
        {/* Phase label row */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "0.6rem",
          gap: "0.75rem",
        }}>
          <span style={{
            fontFamily: FONT,
            fontSize: "0.72rem",
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "#1d4ed8",
          }}>
            Phase {phase.phase_number}
          </span>

          {/* Duration badge */}
          <span style={{
            fontFamily: FONT,
            fontSize: "0.72rem",
            fontWeight: 600,
            color: "#4b5470",
            background: "rgba(37,99,235,0.06)",
            border: "1px solid rgba(37,99,235,0.12)",
            borderRadius: "9999px",
            padding: "0.18rem 0.65rem",
            whiteSpace: "nowrap",
          }}>
            {totalWeeks} week{totalWeeks !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Title */}
        <h3 style={{
          fontFamily: FONT,
          fontWeight: 700,
          fontSize: "1.45rem",
          color: "#0b1340",
          margin: "0 0 0.45rem 0",
          lineHeight: 1.25,
          letterSpacing: "-0.02em",
        }}>
          {phase.title || `Phase ${phase.phase_number}`}
        </h3>

        {/* Focus sentence */}
        {phase.focus && (
          <p style={{
            fontFamily: FONT,
            fontSize: "0.9rem",
            fontWeight: 500,
            color: "#4b5470",
            margin: "0 0 1.1rem 0",
            lineHeight: 1.6,
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
            <span style={{ fontFamily: FONT, fontSize: "0.7rem", color: "#9199b8", fontWeight: 600 }}>
              Progress
            </span>
            <span style={{ fontFamily: FONT, fontSize: "0.7rem", color: "#4b5470", fontWeight: 700 }}>
              {progressLabel}
            </span>
          </div>
          <div style={{
            height: "6px",
            background: "rgba(37,99,235,0.08)",
            borderRadius: "9999px",
            overflow: "hidden",
          }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
              style={{
                height: "100%",
                background: barGradient,
                borderRadius: "9999px",
              }}
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
