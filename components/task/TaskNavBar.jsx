export default function TaskNavBar({
  prevTask,
  nextTask,
  nextLocked,
  onPrev,
  onNext,
  onMarkComplete,
  onNotForMe,
  completed,
  notForMe,
}) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        padding: "1rem 1.25rem",
        background: "rgba(17, 24, 39, 0.98)",
        borderTop: "1px solid #1E2D4A",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "1rem",
        zIndex: 40,
      }}
    >
      <button
        onClick={onPrev}
        disabled={!prevTask}
        style={{
          padding: "0.6rem 1rem",
          background: prevTask ? "rgba(59, 130, 246, 0.15)" : "transparent",
          border: `1px solid ${prevTask ? "#3B82F6" : "#1E2D4A"}`,
          borderRadius: 8,
          color: prevTask ? "#E8EDF5" : "#64748B",
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          fontWeight: 600,
          fontSize: "0.875rem",
          cursor: prevTask ? "pointer" : "not-allowed",
        }}
      >
        ← Previous Task
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        {!completed && !notForMe && (
          <>
            <button
              onClick={onMarkComplete}
              style={{
                padding: "0.6rem 1.25rem",
                background: "#22C55E",
                border: "none",
                borderRadius: 8,
                color: "#fff",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontWeight: 700,
                fontSize: "0.875rem",
                cursor: "pointer",
              }}
            >
              Mark as Complete
            </button>
            <button
              onClick={onNotForMe}
              style={{
                padding: "0.6rem 1rem",
                background: "transparent",
                border: "1px solid #F97316",
                borderRadius: 8,
                color: "#F97316",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontWeight: 600,
                fontSize: "0.875rem",
                cursor: "pointer",
              }}
            >
              Not For Me
            </button>
          </>
        )}
        {(completed || notForMe) && (
          <span style={{ fontSize: "0.875rem", color: "#64748B", fontWeight: 500 }}>
            {completed ? "Completed" : "Not for me"}
          </span>
        )}
      </div>

      <button
        onClick={onNext}
        disabled={!nextTask || nextLocked}
        style={{
          padding: "0.6rem 1rem",
          background: nextTask && !nextLocked ? "rgba(59, 130, 246, 0.15)" : "transparent",
          border: `1px solid ${nextTask && !nextLocked ? "#3B82F6" : "#1E2D4A"}`,
          borderRadius: 8,
          color: nextTask && !nextLocked ? "#E8EDF5" : "#64748B",
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          fontWeight: 600,
          fontSize: "0.875rem",
          cursor: nextTask && !nextLocked ? "pointer" : "not-allowed",
        }}
      >
        Next Task →
      </button>
    </div>
  );
}
