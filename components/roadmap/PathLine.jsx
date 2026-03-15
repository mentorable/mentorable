/**
 * Vertical path line: completed segment (bright) and upcoming segment (muted).
 * @param {number} completedPct - 0–100, percentage of path height that is "completed"
 */
export default function PathLine({ completedPct = 0 }) {
  const pct = Math.min(100, Math.max(0, completedPct));
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        left: "50%",
        marginLeft: -1.5,
        width: 3,
        background: `linear-gradient(180deg, #3B82F6 0%, #22C55E ${pct}%, rgba(30, 45, 74, 0.6) ${pct}%, rgba(30, 45, 74, 0.3) 100%)`,
        borderRadius: 9999,
        zIndex: 0,
      }}
    />
  );
}
