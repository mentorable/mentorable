import { motion, AnimatePresence } from "framer-motion";

function getLabel(score) {
  if (score <= 35) return { text: "Still exploring", color: "#94a3b8" };
  if (score <= 60) return { text: "Building direction", color: "#3b82f6" };
  if (score <= 80) return { text: "Getting clearer", color: "#6366f1" };
  return { text: "Strong career fit", color: "#10b981" };
}

function timeAgo(dateString) {
  if (!dateString) return "just now";
  const diff = Date.now() - new Date(dateString).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  const weeks = Math.floor(days / 7);
  if (mins < 2) return "just now";
  if (hours < 1) return `${mins} minutes ago`;
  if (days < 1) return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
  if (weeks < 1) return `${days} day${days !== 1 ? "s" : ""} ago`;
  return `${weeks} week${weeks !== 1 ? "s" : ""} ago`;
}

export default function ConfidencePanel({ score, history, onClose }) {
  const { text, color } = getLabel(score ?? 0);
  const recentHistory = (history || []).slice(0, 3);

  return (
    <AnimatePresence>
      <div style={{ position: "fixed", inset: 0, zIndex: 200 }}>
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(15,23,42,0.45)",
            backdropFilter: "blur(2px)",
            WebkitBackdropFilter: "blur(2px)",
          }}
        />

        {/* Slide-in panel */}
        <motion.div
          initial={{ x: 340, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 340, opacity: 0 }}
          transition={{ type: "spring", damping: 28, stiffness: 280 }}
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            width: "min(360px, 100vw)",
            background: "#ffffff",
            boxShadow: "-8px 0 40px rgba(0,0,0,0.14)",
            display: "flex",
            flexDirection: "column",
            overflowY: "auto",
          }}
        >
          {/* Header */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "1.25rem 1.5rem",
            borderBottom: "1px solid #f1f5f9",
          }}>
            <h2 style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontWeight: 800,
              fontSize: "1.05rem",
              color: "#0f172a",
              margin: 0,
            }}>
              Career Confidence
            </h2>
            <button
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "0.25rem",
                borderRadius: "0.5rem",
                color: "#64748b",
                display: "flex",
                alignItems: "center",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div style={{ padding: "1.5rem", flex: 1 }}>
            {/* Score display */}
            <div style={{
              background: `${color}10`,
              border: `1.5px solid ${color}30`,
              borderRadius: "1rem",
              padding: "1.25rem",
              marginBottom: "1.5rem",
              textAlign: "center",
            }}>
              <div style={{
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontWeight: 900,
                fontSize: "3rem",
                color: color,
                lineHeight: 1,
                marginBottom: "0.25rem",
              }}>
                {score ?? 0}%
              </div>
              <div style={{
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontWeight: 600,
                fontSize: "0.85rem",
                color: color,
                opacity: 0.85,
              }}>
                {text}
              </div>
            </div>

            {/* Progress bar */}
            <div style={{ marginBottom: "1.5rem" }}>
              <div style={{
                height: "10px",
                background: "#f1f5f9",
                borderRadius: "9999px",
                overflow: "hidden",
              }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${score ?? 0}%` }}
                  transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                  style={{
                    height: "100%",
                    background: color,
                    borderRadius: "9999px",
                  }}
                />
              </div>
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: "0.4rem",
              }}>
                <span style={{ fontSize: "0.7rem", color: "#94a3b8", fontWeight: 500 }}>0%</span>
                <span style={{ fontSize: "0.7rem", color: "#94a3b8", fontWeight: 500 }}>100%</span>
              </div>
            </div>

            {/* History */}
            {recentHistory.length > 0 && (
              <div style={{ marginBottom: "1.5rem" }}>
                <p style={{
                  fontSize: "0.7rem",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "#94a3b8",
                  marginBottom: "0.75rem",
                }}>
                  Recent changes
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {recentHistory.map((item, i) => {
                    const positive = (item.delta || 0) >= 0;
                    return (
                      <motion.div
                        key={item.id || i}
                        initial={{ opacity: 0, x: 12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.07 }}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: "0.75rem",
                          padding: "0.75rem",
                          background: "#f8fafc",
                          borderRadius: "0.75rem",
                          border: "1px solid #f1f5f9",
                        }}
                      >
                        <span style={{
                          fontWeight: 800,
                          fontSize: "0.85rem",
                          color: positive ? "#10b981" : "#ef4444",
                          flexShrink: 0,
                          minWidth: "3rem",
                        }}>
                          {positive ? "↑" : "↓"} {Math.abs(item.delta || 0)}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{
                            fontSize: "0.82rem",
                            color: "#374151",
                            lineHeight: 1.45,
                            margin: 0,
                            marginBottom: "0.2rem",
                          }}>
                            {item.reason}
                          </p>
                          <p style={{ fontSize: "0.72rem", color: "#94a3b8", margin: 0 }}>
                            {timeAgo(item.created_at)}
                          </p>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            )}

            {recentHistory.length === 0 && (
              <div style={{
                padding: "1rem",
                background: "#f8fafc",
                borderRadius: "0.75rem",
                textAlign: "center",
                marginBottom: "1.5rem",
              }}>
                <p style={{ fontSize: "0.83rem", color: "#94a3b8" }}>
                  Complete tasks to see your confidence grow.
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: "1rem 1.5rem",
            borderTop: "1px solid #f1f5f9",
            background: "#fafafa",
          }}>
            <p style={{
              fontSize: "0.77rem",
              color: "#94a3b8",
              lineHeight: 1.55,
              margin: 0,
              fontStyle: "italic",
            }}>
              This score reflects how clearly your career direction is emerging — it goes up and down naturally.
            </p>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
