import { motion } from "framer-motion";

function getLabel(score) {
  if (score <= 35) return { text: "Still exploring", color: "#94a3b8" };
  if (score <= 60) return { text: "Building direction", color: "#3b82f6" };
  if (score <= 80) return { text: "Getting clearer", color: "#6366f1" };
  return { text: "Strong career fit", color: "#10b981" };
}

export default function ConfidenceMeter({ score, onClick }) {
  const { text, color } = getLabel(score ?? 0);

  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.97 }}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.4rem",
        padding: "0.35rem 0.875rem",
        borderRadius: "9999px",
        border: `1.5px solid ${color}50`,
        background: `${color}12`,
        cursor: "pointer",
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        fontSize: "0.82rem",
        fontWeight: 700,
        color: color,
        whiteSpace: "nowrap",
        transition: "background 0.2s, border-color 0.2s",
        outline: "none",
      }}
    >
      <span style={{ fontSize: "0.85rem" }}>🎯</span>
      <span>{score ?? 0}%</span>
      <span style={{ fontWeight: 500, color: color, opacity: 0.85 }}>{text}</span>
    </motion.button>
  );
}
