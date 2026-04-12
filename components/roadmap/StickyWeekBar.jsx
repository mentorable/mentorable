import { motion } from "framer-motion";

export default function StickyWeekBar({ phase, currentWeek, tasks, onScrollToCurrent }) {
  if (!phase || !tasks) return null;

  const totalMinutes = tasks.reduce((sum, t) => {
    const match = String(t.estimated_time || "").match(/(\d+)/);
    return sum + (match ? parseInt(match[1], 10) : 0);
  }, 0);

  const completedCount = tasks.filter(
    (t) => t.status === "completed" || t.status === "skipped"
  ).length;

  const totalCount = tasks.length;

  const formattedTime = totalMinutes > 0
    ? totalMinutes >= 60
      ? `~${Math.round(totalMinutes / 60)}h`
      : `~${totalMinutes} mins`
    : null;

  return (
    <motion.div
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 80, opacity: 0 }}
      transition={{ type: "spring", damping: 26, stiffness: 280 }}
      onClick={onScrollToCurrent}
      style={{
        position: "fixed",
        bottom: 0,
        left: "220px",
        right: 0,
        zIndex: 100,
        cursor: "pointer",
      }}
    >
      <div style={{
        background: "rgba(255,255,255,0.97)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        boxShadow: "0 -4px 24px rgba(0,0,0,0.1), 0 -1px 0 rgba(0,0,0,0.06)",
        borderRadius: "1.25rem 1.25rem 0 0",
        padding: "0.875rem 1.5rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "1rem",
        maxWidth: "680px",
        margin: "0 auto",
        borderTop: "1.5px solid #e2e8f0",
      }}>
        {/* Left: label */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem", minWidth: 0 }}>
          <span style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontWeight: 800,
            fontSize: "0.875rem",
            color: "#0f172a",
            lineHeight: 1.2,
          }}>
            This week
          </span>
          <span style={{
            fontSize: "0.77rem",
            color: "#64748b",
            lineHeight: 1.2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}>
            Phase {phase.phase_number}, Week {currentWeek}
          </span>
        </div>

        {/* Center: stats */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          flex: 1,
          justifyContent: "center",
        }}>
          <span style={{
            fontSize: "0.8rem",
            color: "#475569",
            fontWeight: 500,
            whiteSpace: "nowrap",
          }}>
            {totalCount} task{totalCount !== 1 ? "s" : ""}
            {formattedTime ? ` · ${formattedTime} total` : ""}
          </span>
          {totalCount > 0 && (
            <span style={{
              fontSize: "0.8rem",
              color: completedCount === totalCount ? "#10b981" : "#6366f1",
              fontWeight: 700,
              whiteSpace: "nowrap",
            }}>
              {completedCount}/{totalCount} done
              {completedCount === totalCount ? " ✓" : ""}
            </span>
          )}
        </div>

        {/* Right: arrow */}
        <div style={{
          flexShrink: 0,
          width: 32,
          height: 32,
          borderRadius: "50%",
          background: "#f1f5f9",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </div>
      </div>
    </motion.div>
  );
}
