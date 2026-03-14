import { motion, AnimatePresence } from "framer-motion";

// Generates random star positions seeded by index
const STARS = Array.from({ length: 18 }, (_, i) => ({
  id: i,
  x: 10 + ((i * 47 + 13) % 80),
  y: 5 + ((i * 31 + 7) % 85),
  size: 4 + (i % 5),
  delay: (i * 0.09) % 0.8,
  color: i % 3 === 0 ? "#6366f1" : i % 3 === 1 ? "#3b82f6" : "#10b981",
}));

export default function PhaseCompleteModal({
  phase,
  confidenceScore,
  confidenceDelta,
  confidenceReason,
  onGenerateNext,
}) {
  if (!phase) return null;

  const completedTasks = (phase.tasks || []).filter(
    (t) => t.status === "completed" || t.status === "skipped"
  ).length;

  return (
    <AnimatePresence>
      <div style={{ position: "fixed", inset: 0, zIndex: 300 }}>
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(15,23,42,0.65)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
          }}
        />

        {/* Floating celebration stars */}
        {STARS.map((star) => (
          <motion.div
            key={star.id}
            initial={{ opacity: 0, scale: 0, x: 0, y: 0 }}
            animate={{
              opacity: [0, 1, 1, 0],
              scale: [0, 1.2, 1, 0.6],
              y: [0, -30 - star.y * 0.4, -60 - star.y * 0.8],
            }}
            transition={{
              duration: 1.8,
              delay: star.delay,
              ease: "easeOut",
            }}
            style={{
              position: "absolute",
              left: `${star.x}%`,
              top: `${star.y}%`,
              width: star.size,
              height: star.size,
              borderRadius: "50%",
              background: star.color,
              boxShadow: `0 0 ${star.size * 2}px ${star.color}`,
              pointerEvents: "none",
              zIndex: 1,
            }}
          />
        ))}

        {/* Modal */}
        <div style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem",
          zIndex: 2,
        }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.88, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 12 }}
            transition={{ type: "spring", damping: 22, stiffness: 260, delay: 0.1 }}
            style={{
              background: "#ffffff",
              borderRadius: "1.5rem",
              boxShadow: "0 32px 80px rgba(0,0,0,0.22), 0 8px 24px rgba(0,0,0,0.08)",
              padding: "2.25rem 2rem",
              width: "min(420px, 100%)",
              textAlign: "center",
              position: "relative",
              overflow: "hidden",
            }}
          >
            {/* Gradient shimmer at top */}
            <div style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: "4px",
              background: "linear-gradient(90deg, #6366f1, #3b82f6, #10b981)",
              borderRadius: "1.5rem 1.5rem 0 0",
            }} />

            {/* Celebration icon */}
            <motion.div
              initial={{ scale: 0, rotate: -15 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", damping: 14, stiffness: 200, delay: 0.2 }}
              style={{ fontSize: "3.5rem", lineHeight: 1, marginBottom: "1rem" }}
            >
              🎉
            </motion.div>

            {/* Title */}
            <motion.h2
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              style={{
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontWeight: 900,
                fontSize: "1.5rem",
                color: "#0f172a",
                margin: "0 0 0.5rem 0",
                lineHeight: 1.25,
              }}
            >
              Phase {phase.phase_number} Complete!
            </motion.h2>

            {/* Subtitle */}
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              style={{
                fontSize: "0.9rem",
                color: "#64748b",
                margin: "0 0 1.5rem 0",
                lineHeight: 1.55,
              }}
            >
              You completed{" "}
              <strong style={{ color: "#0f172a" }}>{completedTasks} task{completedTasks !== 1 ? "s" : ""}</strong>{" "}
              this phase.{" "}
              {phase.title ? `You wrapped up "${phase.title}".` : ""}
            </motion.p>

            {/* Confidence card */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.38 }}
              style={{
                background: "linear-gradient(135deg, #6366f108, #3b82f608)",
                border: "1.5px solid #6366f120",
                borderRadius: "1rem",
                padding: "1.1rem 1.25rem",
                marginBottom: "1.5rem",
              }}
            >
              <p style={{
                fontSize: "0.75rem",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#94a3b8",
                margin: "0 0 0.5rem 0",
              }}>
                Career Confidence
              </p>
              <div style={{
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontWeight: 900,
                fontSize: "2.25rem",
                color: "#6366f1",
                lineHeight: 1,
                marginBottom: "0.5rem",
              }}>
                {confidenceScore ?? 0}%
              </div>

              {confidenceDelta !== undefined && confidenceDelta !== null && (
                <div style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  padding: "0.3rem 0.75rem",
                  borderRadius: "9999px",
                  background: confidenceDelta >= 0 ? "#d1fae510" : "#fee2e210",
                  border: `1px solid ${confidenceDelta >= 0 ? "#10b98130" : "#ef444430"}`,
                  fontSize: "0.8rem",
                  fontWeight: 700,
                  color: confidenceDelta >= 0 ? "#10b981" : "#ef4444",
                }}>
                  <span>{confidenceDelta >= 0 ? "↑" : "↓"} {Math.abs(confidenceDelta)}</span>
                  {confidenceReason && (
                    <span style={{ fontWeight: 500, color: "#374151" }}>— {confidenceReason}</span>
                  )}
                </div>
              )}
            </motion.div>

            {/* CTA button */}
            <motion.button
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45 }}
              onClick={onGenerateNext}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              style={{
                width: "100%",
                padding: "0.875rem 1.25rem",
                borderRadius: "0.875rem",
                border: "none",
                background: "linear-gradient(135deg, #6366f1, #4f46e5)",
                color: "white",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontWeight: 800,
                fontSize: "0.975rem",
                cursor: "pointer",
                boxShadow: "0 4px 16px rgba(99,102,241,0.35)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
              }}
            >
              Generate my next phase
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </motion.button>
          </motion.div>
        </div>
      </div>
    </AnimatePresence>
  );
}
