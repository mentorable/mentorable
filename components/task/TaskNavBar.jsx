import { motion } from "framer-motion";

export default function TaskNavBar({
  prevTask, nextTask, nextLocked,
  onPrev, onNext, onMarkComplete, onNotForMe,
  completed, notForMe,
}) {
  return (
    <motion.div
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.3, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        padding: "0.875rem 1.25rem",
        background: "rgba(26,22,96,0.95)",
        backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
        borderTop: "1px solid rgba(99,102,241,0.2)",
        display: "flex", alignItems: "center",
        justifyContent: "space-between", gap: "0.75rem",
        zIndex: 40, fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}
    >
      {/* Prev */}
      <button
        onClick={onPrev}
        disabled={!prevTask}
        style={{
          display: "flex", alignItems: "center", gap: 5,
          padding: "0.6rem 1rem",
          background: prevTask ? "rgba(99,102,241,0.15)" : "transparent",
          border: `1.5px solid ${prevTask ? "rgba(99,102,241,0.4)" : "rgba(99,102,241,0.12)"}`,
          borderRadius: "0.75rem", cursor: prevTask ? "pointer" : "not-allowed",
          fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700,
          fontSize: "0.82rem",
          color: prevTask ? "#a5b4fc" : "rgba(99,102,241,0.3)",
          transition: "all 0.18s", whiteSpace: "nowrap",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Prev
      </button>

      {/* Center actions */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", flex: 1, justifyContent: "center" }}>
        {!completed && !notForMe && (
          <>
            <button
              onClick={onMarkComplete}
              style={{
                display: "flex", alignItems: "center", gap: "0.5rem",
                padding: "0.7rem 1.4rem",
                background: "linear-gradient(135deg, #059669, #10b981)",
                border: "none", borderRadius: "0.875rem",
                color: "white", fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontWeight: 800, fontSize: "0.9rem", cursor: "pointer",
                boxShadow: "0 4px 20px rgba(16,185,129,0.4)",
                transition: "transform 0.15s, box-shadow 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 6px 28px rgba(16,185,129,0.55)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "0 4px 20px rgba(16,185,129,0.4)"; }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Mark Complete
            </button>
            <button
              onClick={onNotForMe}
              style={{
                padding: "0.7rem 1rem",
                background: "rgba(249,115,22,0.1)",
                border: "1.5px solid rgba(249,115,22,0.35)",
                borderRadius: "0.875rem", cursor: "pointer",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontWeight: 700, fontSize: "0.82rem", color: "#fb923c",
                transition: "all 0.18s", whiteSpace: "nowrap",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(249,115,22,0.18)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(249,115,22,0.1)"; }}
            >
              Not for me
            </button>
          </>
        )}
        {(completed || notForMe) && (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: "0.4rem",
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: "0.85rem", fontWeight: 700,
            color: completed ? "#34d399" : "#fb923c",
            background: completed ? "rgba(52,211,153,0.12)" : "rgba(249,115,22,0.1)",
            border: `1.5px solid ${completed ? "rgba(52,211,153,0.3)" : "rgba(249,115,22,0.25)"}`,
            borderRadius: "9999px", padding: "0.4rem 1rem",
          }}>
            {completed ? (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Completed
              </>
            ) : "Skipped"}
          </span>
        )}
      </div>

      {/* Next */}
      <button
        onClick={onNext}
        disabled={!nextTask || nextLocked}
        style={{
          display: "flex", alignItems: "center", gap: 5,
          padding: "0.6rem 1rem",
          background: nextTask && !nextLocked ? "rgba(99,102,241,0.15)" : "transparent",
          border: `1.5px solid ${nextTask && !nextLocked ? "rgba(99,102,241,0.4)" : "rgba(99,102,241,0.12)"}`,
          borderRadius: "0.75rem", cursor: nextTask && !nextLocked ? "pointer" : "not-allowed",
          fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700,
          fontSize: "0.82rem",
          color: nextTask && !nextLocked ? "#a5b4fc" : "rgba(99,102,241,0.3)",
          transition: "all 0.18s", whiteSpace: "nowrap",
        }}
      >
        Next
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    </motion.div>
  );
}
