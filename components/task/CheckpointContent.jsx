export default function CheckpointContent({ phase, onMarkPhaseComplete }) {
  const tasks = phase?.tasks || [];
  const completedCount = tasks.filter((t) => t.status === "completed").length;
  const total = tasks.length;

  return (
    <div style={{
      background: "#111827",
      border: "1px solid #1E2D4A",
      borderRadius: 16,
      padding: "1.5rem",
      marginBottom: "1.5rem",
    }}>
      <h3 style={{
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        fontWeight: 700,
        fontSize: "1rem",
        color: "#E8EDF5",
        margin: "0 0 0.5rem 0",
      }}>
        Phase summary
      </h3>
      <p style={{ fontSize: "0.9rem", color: "#94a3b8", margin: "0 0 1rem 0" }}>
        You’ve completed {completedCount} of {total} tasks in this phase.
      </p>
      <p style={{ fontSize: "0.85rem", color: "#64748B", margin: "0 0 1.25rem 0" }}>
        {phase?.focus}
      </p>
      <button
        onClick={onMarkPhaseComplete}
        style={{
          padding: "0.75rem 1.5rem",
          background: "#22C55E",
          border: "none",
          borderRadius: 8,
          color: "#fff",
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          fontWeight: 700,
          fontSize: "0.9rem",
          cursor: "pointer",
        }}
      >
        Mark Phase Complete
      </button>
    </div>
  );
}
