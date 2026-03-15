import ReflectionArea from "./ReflectionArea.jsx";

export default function ReadingTaskContent({ task, userId, taskResponses, onSaveResponses }) {
  const url = task?.resource_url || "";
  const label = task?.resource_label || "Article";
  const prompts = parsePromptsFromDescription(task?.description);

  return (
    <>
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
          Read
        </h3>
        <p style={{ fontSize: "0.9rem", color: "#E8EDF5", margin: "0 0 0.25rem 0" }}>
          {task?.title}
        </p>
        <p style={{ fontSize: "0.8rem", color: "#64748B", margin: "0 0 1rem 0" }}>
          {label} · {task?.estimated_time || "—"}
        </p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "0.6rem 1.25rem",
            background: "transparent",
            border: "1px solid #3B82F6",
            color: "#3B82F6",
            borderRadius: 8,
            fontWeight: 600,
            fontSize: "0.875rem",
            textDecoration: "none",
          }}
        >
          Read Article →
        </a>
      </div>
      <ReflectionArea
        taskId={task?.id}
        userId={userId}
        prompts={prompts}
        initialResponses={taskResponses?.responses || {}}
        onSave={onSaveResponses}
      />
    </>
  );
}

function parsePromptsFromDescription(desc) {
  if (!desc || typeof desc !== "string") return [];
  const bullets = desc.split(/\n/).map((s) => s.replace(/^[\s\-*•]+/, "").trim()).filter(Boolean);
  if (bullets.length > 0) return bullets.map((text, i) => ({ id: `prompt_${i}`, label: text }));
  return [];
}
