import { motion } from "framer-motion";

export default function CheckpointContent({ phase, onMarkPhaseComplete }) {
  const tasks = phase?.tasks || [];
  const completedCount = tasks.filter((t) => t.status === "completed").length;
  const total = tasks.length;
  const pct = total > 0 ? Math.round((completedCount / total) * 100) : 0;

  return (
    <div style={{
      background: "linear-gradient(135deg, rgba(45,40,148,0.55) 0%, rgba(30,27,75,0.75) 100%)",
      border: "1.5px solid rgba(99,102,241,0.3)",
      borderRadius: "1.25rem",
      padding: "1.75rem",
      marginBottom: "1.25rem",
      boxShadow: "0 8px 32px rgba(67,56,202,0.2)",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.875rem", marginBottom: "1.5rem" }}>
        <div style={{
          width: 48, height: 48, borderRadius: "0.875rem", flexShrink: 0,
          background: "linear-gradient(135deg, #059669, #10b981)",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 4px 16px rgba(16,185,129,0.4)",
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="14.5 2 20 11 14.5 20 3 20 3 11 3 2" />
          </svg>
        </div>
        <div>
          <p style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontWeight: 800, fontSize: "1.05rem", color: "white", margin: "0 0 0.2rem",
          }}>
            Phase Checkpoint
          </p>
          <p style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: "0.78rem", fontWeight: 600,
            color: "rgba(165,180,252,0.65)", margin: 0,
          }}>
            Phase {phase?.phase_number}{phase?.title ? ` — ${phase.title}` : ""}
          </p>
        </div>
      </div>

      {/* Progress */}
      <div style={{
        background: "rgba(99,102,241,0.1)",
        border: "1px solid rgba(99,102,241,0.2)",
        borderRadius: "0.875rem",
        padding: "1rem 1.25rem",
        marginBottom: "1.5rem",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
          <span style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: "0.82rem", fontWeight: 700, color: "rgba(199,210,254,0.85)",
          }}>
            Tasks completed
          </span>
          <span style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: "0.9rem", fontWeight: 800, color: "#a5b4fc",
          }}>
            {completedCount} / {total}
          </span>
        </div>
        <div style={{ height: 7, background: "rgba(255,255,255,0.1)", borderRadius: "9999px", overflow: "hidden" }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
            style={{
              height: "100%",
              background: pct === 100
                ? "linear-gradient(90deg, #10b981, #34d399)"
                : "linear-gradient(90deg, #818cf8, #a5b4fc)",
              borderRadius: "9999px",
              boxShadow: pct === 100
                ? "0 0 10px rgba(52,211,153,0.5)"
                : "0 0 10px rgba(129,140,248,0.4)",
            }}
          />
        </div>
      </div>

      {/* Focus */}
      {phase?.focus && (
        <p style={{
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          fontSize: "0.92rem", fontWeight: 500,
          color: "rgba(199,210,254,0.75)",
          margin: "0 0 1.5rem", lineHeight: 1.65,
        }}>
          {phase.focus}
        </p>
      )}

      {/* CTA */}
      <button
        onClick={onMarkPhaseComplete}
        style={{
          display: "flex", alignItems: "center", gap: "0.5rem",
          padding: "0.8rem 1.5rem",
          background: "linear-gradient(135deg, #059669, #10b981)",
          border: "none", borderRadius: "0.875rem",
          color: "white", fontFamily: "'Plus Jakarta Sans', sans-serif",
          fontWeight: 800, fontSize: "0.95rem", cursor: "pointer",
          boxShadow: "0 4px 20px rgba(16,185,129,0.4)",
          transition: "transform 0.15s, box-shadow 0.15s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 8px 28px rgba(16,185,129,0.55)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "0 4px 20px rgba(16,185,129,0.4)"; }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        Mark Phase Complete
      </button>
    </div>
  );
}
