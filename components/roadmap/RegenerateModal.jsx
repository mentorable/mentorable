import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Spinner from "../common/Spinner.jsx";

const FONT = "'Space Grotesk', sans-serif";

export default function RegenerateModal({ onConfirm, onCancel, phaseTitle = null }) {
  const [loading, setLoading] = useState(false);

  const isPhase = !!phaseTitle;
  const title = isPhase
    ? `Regenerate "${phaseTitle}"?`
    : "Regenerate your roadmap?";
  const body = isPhase
    ? "This will replace the tasks in this phase with a fresh set tailored to your current progress and profile. Your other phases are untouched."
    : "This will replace your current roadmap with a new one built from your full profile, chat history, and research sessions. Your profile data is preserved.";

  const handleConfirm = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(15,23,42,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "1.5rem",
      }}
      onClick={(e) => { if (e.target === e.currentTarget && !loading) onCancel(); }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 8 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        style={{
          background: "#ffffff",
          borderRadius: "1.25rem",
          padding: "2rem",
          maxWidth: 420, width: "100%",
          boxShadow: "0 24px 64px rgba(0,0,0,0.22)",
          border: "1px solid rgba(37,99,235,0.12)",
        }}
      >
        {/* Icon */}
        <div style={{
          width: 44, height: 44,
          borderRadius: "0.75rem",
          background: "rgba(37,99,235,0.07)",
          border: "1.5px solid rgba(37,99,235,0.14)",
          display: "flex", alignItems: "center", justifyContent: "center",
          marginBottom: "1.25rem",
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 4v6h-6" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
        </div>

        <h3 style={{ fontFamily: FONT, fontWeight: 700, fontSize: "1.05rem", color: "#0f172a", margin: "0 0 0.5rem" }}>
          {title}
        </h3>
        <p style={{ fontFamily: FONT, fontSize: "0.875rem", color: "#4b5470", lineHeight: 1.6, margin: "0 0 1.5rem" }}>
          {body}
        </p>

        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem", padding: "0.5rem 0" }}
            >
              <Spinner size={24} color="#1d4ed8" />
              <p style={{ fontFamily: FONT, fontSize: "0.85rem", color: "#4b5470", margin: 0 }}>
                {isPhase ? "Regenerating phase…" : "Regenerating roadmap…"}
              </p>
              <p style={{ fontFamily: FONT, fontSize: "0.75rem", color: "#94a3b8", margin: 0 }}>
                This may take a moment…
              </p>
            </motion.div>
          ) : (
            <motion.div key="buttons" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: "flex", gap: "0.625rem" }}>
              <button
                onClick={onCancel}
                style={{
                  flex: 1, padding: "0.7rem",
                  border: "1.5px solid #e2e8f0",
                  borderRadius: "0.75rem",
                  background: "transparent",
                  color: "#4b5470",
                  fontFamily: FONT, fontWeight: 600, fontSize: "0.875rem",
                  cursor: "pointer",
                  transition: "border-color 0.15s",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                style={{
                  flex: 1, padding: "0.7rem",
                  border: "none",
                  borderRadius: "0.75rem",
                  background: "linear-gradient(135deg, #1d4ed8, #3b82f6)",
                  color: "white",
                  fontFamily: FONT, fontWeight: 700, fontSize: "0.875rem",
                  cursor: "pointer",
                  boxShadow: "0 4px 14px rgba(29,78,216,0.35)",
                  transition: "opacity 0.15s",
                }}
              >
                Regenerate
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
