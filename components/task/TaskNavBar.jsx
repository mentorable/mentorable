import { motion } from "framer-motion";

const FONT = "'Space Grotesk', sans-serif";

export default function TaskNavBar({
  prevTask, nextTask, nextLocked,
  onPrev, onNext, onMarkComplete, onNotForMe,
  completed, notForMe,
}) {
  return (
    <motion.div
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.28, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      style={{
        position: "fixed", bottom: 0, left: "220px", right: 0,
        padding: "0.875rem 1.25rem",
        background: "rgba(255,255,255,0.95)",
        backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
        borderTop: "1px solid rgba(37,99,235,0.1)",
        display: "flex", alignItems: "center",
        justifyContent: "space-between", gap: "0.75rem",
        zIndex: 40, fontFamily: FONT,
      }}
    >
      <button
        onClick={onPrev}
        disabled={!prevTask}
        style={{
          display: "flex", alignItems: "center", gap: 5,
          padding: "0.6rem 1rem",
          background: prevTask ? "rgba(37,99,235,0.07)" : "transparent",
          border: `1.5px solid ${prevTask ? "rgba(37,99,235,0.2)" : "rgba(37,99,235,0.08)"}`,
          borderRadius: "0.75rem", cursor: prevTask ? "pointer" : "not-allowed",
          fontFamily: FONT, fontWeight: 700, fontSize: "0.82rem",
          color: prevTask ? "#1d4ed8" : "#b4bcd4",
          transition: "all 0.15s", whiteSpace: "nowrap",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Prev
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flex: 1, justifyContent: "center" }}>
        {!completed && !notForMe && (
          <>
            <button
              onClick={onMarkComplete}
              style={{
                display: "flex", alignItems: "center", gap: "0.5rem",
                padding: "0.7rem 1.35rem",
                background: "linear-gradient(135deg, #059669, #10b981)",
                border: "none", borderRadius: "0.875rem",
                color: "white", fontFamily: FONT,
                fontWeight: 700, fontSize: "0.88rem", cursor: "pointer",
                boxShadow: "0 4px 16px rgba(16,185,129,0.3)",
                transition: "transform 0.15s, box-shadow 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 6px 24px rgba(16,185,129,0.45)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "0 4px 16px rgba(16,185,129,0.3)"; }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Mark Complete
            </button>
            <button
              onClick={onNotForMe}
              style={{
                padding: "0.7rem 0.9rem",
                background: "rgba(249,115,22,0.06)",
                border: "1.5px solid rgba(249,115,22,0.25)",
                borderRadius: "0.875rem", cursor: "pointer",
                fontFamily: FONT, fontWeight: 700,
                fontSize: "0.82rem", color: "#ea580c",
                transition: "all 0.15s", whiteSpace: "nowrap",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(249,115,22,0.12)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(249,115,22,0.06)"; }}
            >
              Not for me
            </button>
          </>
        )}
        {(completed || notForMe) && (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: "0.4rem",
            fontFamily: FONT, fontSize: "0.85rem", fontWeight: 700,
            color: completed ? "#059669" : "#ea580c",
            background: completed ? "rgba(16,185,129,0.08)" : "rgba(249,115,22,0.07)",
            border: `1.5px solid ${completed ? "rgba(16,185,129,0.2)" : "rgba(249,115,22,0.2)"}`,
            borderRadius: "9999px", padding: "0.4rem 1rem",
          }}>
            {completed ? (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Completed
              </>
            ) : "Skipped"}
          </span>
        )}
      </div>

      <button
        onClick={onNext}
        disabled={!nextTask || nextLocked}
        style={{
          display: "flex", alignItems: "center", gap: 5,
          padding: "0.6rem 1rem",
          background: nextTask && !nextLocked ? "rgba(37,99,235,0.07)" : "transparent",
          border: `1.5px solid ${nextTask && !nextLocked ? "rgba(37,99,235,0.2)" : "rgba(37,99,235,0.08)"}`,
          borderRadius: "0.75rem", cursor: nextTask && !nextLocked ? "pointer" : "not-allowed",
          fontFamily: FONT, fontWeight: 700, fontSize: "0.82rem",
          color: nextTask && !nextLocked ? "#1d4ed8" : "#b4bcd4",
          transition: "all 0.15s", whiteSpace: "nowrap",
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
