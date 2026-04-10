import { motion } from "framer-motion";

const FONT = "'Space Grotesk', sans-serif";

export default function CheckpointContent({ phase, onMarkPhaseComplete }) {
  const tasks = phase?.tasks || [];
  const completedCount = tasks.filter((t) => t.status === "completed").length;
  const total = tasks.length;
  const pct = total > 0 ? Math.round((completedCount / total) * 100) : 0;

  return (
    <div style={{
      background: "#ffffff",
      border: "1.5px solid rgba(37,99,235,0.12)",
      borderRadius: "1.25rem",
      padding: "1.75rem",
      marginBottom: "1.25rem",
      boxShadow: "0 4px 24px rgba(37,99,235,0.08), 0 1px 4px rgba(0,0,0,0.04)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.875rem", marginBottom: "1.5rem" }}>
        <div style={{
          width: 46, height: 46, borderRadius: "0.875rem", flexShrink: 0,
          background: "linear-gradient(135deg, #059669, #10b981)",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 4px 14px rgba(16,185,129,0.3)",
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <div>
          <p style={{ fontFamily: FONT, fontWeight: 700, fontSize: "1rem", color: "#0b1340", margin: "0 0 0.15rem" }}>
            Phase Checkpoint
          </p>
          <p style={{ fontFamily: FONT, fontSize: "0.78rem", fontWeight: 500, color: "#9199b8", margin: 0 }}>
            Phase {phase?.phase_number}{phase?.title ? ` — ${phase.title}` : ""}
          </p>
        </div>
      </div>

      {/* Progress */}
      <div style={{
        background: "rgba(37,99,235,0.04)", border: "1px solid rgba(37,99,235,0.1)",
        borderRadius: "0.875rem", padding: "1rem 1.25rem", marginBottom: "1.25rem",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
          <span style={{ fontFamily: FONT, fontSize: "0.8rem", fontWeight: 600, color: "#4b5470" }}>
            Tasks completed
          </span>
          <span style={{ fontFamily: FONT, fontSize: "0.88rem", fontWeight: 700, color: "#0b1340" }}>
            {completedCount} / {total}
          </span>
        </div>
        <div style={{ height: 6, background: "rgba(37,99,235,0.08)", borderRadius: "9999px", overflow: "hidden" }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
            style={{
              height: "100%",
              background: pct === 100
                ? "linear-gradient(90deg, #059669, #10b981)"
                : "linear-gradient(90deg, #1d4ed8, #3b82f6)",
              borderRadius: "9999px",
            }}
          />
        </div>
      </div>

      {phase?.focus && (
        <p style={{ fontFamily: FONT, fontSize: "0.9rem", fontWeight: 500, color: "#4b5470", margin: "0 0 1.5rem", lineHeight: 1.65 }}>
          {phase.focus}
        </p>
      )}

      <button
        onClick={onMarkPhaseComplete}
        style={{
          display: "flex", alignItems: "center", gap: "0.5rem",
          padding: "0.75rem 1.5rem",
          background: "linear-gradient(135deg, #059669, #10b981)",
          border: "none", borderRadius: "0.875rem",
          color: "white", fontFamily: FONT, fontWeight: 700,
          fontSize: "0.9rem", cursor: "pointer",
          boxShadow: "0 4px 16px rgba(16,185,129,0.3)",
          transition: "transform 0.15s, box-shadow 0.15s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 6px 24px rgba(16,185,129,0.45)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "0 4px 16px rgba(16,185,129,0.3)"; }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        Mark Phase Complete
      </button>
    </div>
  );
}
