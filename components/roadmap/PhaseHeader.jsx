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
        background: "linear-gradient(135deg, #2d2894 0%, #1e1b4b 100%)",
        borderRadius: "1.25rem",
        padding: "1.5rem 1.75rem",
        marginBottom: "0",
        position: "relative",
        overflow: "hidden",
        border: "1.5px solid rgba(129,140,248,0.35)",
        boxShadow: "0 8px 32px rgba(67,56,202,0.4), 0 0 0 1px rgba(99,102,241,0.1)",
      }}
    >
      {/* Vibrant gradient overlay */}
      <div style={{
        position: "absolute",
        inset: 0,
        background: "linear-gradient(135deg, rgba(129,140,248,0.22) 0%, rgba(99,102,241,0.08) 50%, transparent 100%)",
        pointerEvents: "none",
        borderRadius: "1.25rem",
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
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: "0.78rem",
            fontWeight: 800,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "#a5b4fc",
          }}>
            Phase {phase.phase_number}
          </span>

          {/* Duration badge */}
          <span style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: "0.75rem",
            fontWeight: 700,
            color: "rgba(199,210,254,0.9)",
            background: "rgba(129,140,248,0.18)",
            border: "1px solid rgba(129,140,248,0.3)",
            borderRadius: "9999px",
            padding: "0.2rem 0.75rem",
            whiteSpace: "nowrap",
          }}>
            {totalWeeks} week{totalWeeks !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Title */}
        <h3 style={{
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          fontWeight: 900,
          fontSize: "1.55rem",
          color: "white",
          margin: "0 0 0.5rem 0",
          lineHeight: 1.2,
          letterSpacing: "-0.02em",
          textShadow: "0 2px 12px rgba(99,102,241,0.4)",
        }}>
          {phase.title || `Phase ${phase.phase_number}`}
        </h3>

        {/* Focus sentence */}
        {phase.focus && (
          <p style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: "0.97rem",
            fontWeight: 500,
            color: "rgba(199,210,254,0.9)",
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
            marginBottom: "0.45rem",
          }}>
            <span style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontSize: "0.73rem",
              color: "rgba(165,180,252,0.75)",
              fontWeight: 600,
              letterSpacing: "0.03em",
            }}>
              Progress
            </span>
            <span style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontSize: "0.73rem",
              color: "rgba(199,210,254,0.9)",
              fontWeight: 700,
            }}>
              {progressLabel}
            </span>
          </div>
          <div style={{
            height: "7px",
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
                  : "linear-gradient(90deg, #818cf8, #a5b4fc)",
                borderRadius: "9999px",
                boxShadow: phase.status === "completed"
                  ? "0 0 8px rgba(52,211,153,0.6)"
                  : "0 0 8px rgba(129,140,248,0.6)",
              }}
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
