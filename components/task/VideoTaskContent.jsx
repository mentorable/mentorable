import ReflectionArea from "./ReflectionArea.jsx";

const CARD = {
  background: "linear-gradient(135deg, rgba(45,40,148,0.55) 0%, rgba(30,27,75,0.75) 100%)",
  border: "1.5px solid rgba(99,102,241,0.3)",
  borderRadius: "1.25rem",
  padding: "1.5rem 1.75rem",
  marginBottom: "1.25rem",
  boxShadow: "0 8px 32px rgba(67,56,202,0.2)",
};

export default function VideoTaskContent({ task, userId, taskResponses, onSaveResponses }) {
  const url = task?.resource_url || "";
  const label = task?.resource_label || "Video";
  const prompts = parsePromptsFromDescription(task?.description);

  return (
    <>
      <div style={CARD}>
        {/* Header row */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.875rem", marginBottom: "1.25rem" }}>
          <div style={{
            width: 48, height: 48, borderRadius: "0.875rem", flexShrink: 0,
            background: "linear-gradient(135deg, #4338ca, #6366f1)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 16px rgba(99,102,241,0.4)",
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
          <div>
            <p style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontWeight: 800, fontSize: "1.05rem", color: "white", margin: "0 0 0.2rem",
            }}>
              Watch
            </p>
            <p style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontSize: "0.78rem", fontWeight: 600,
              color: "rgba(165,180,252,0.65)", margin: 0,
            }}>
              {label} · {task?.estimated_time || "—"}
            </p>
          </div>
        </div>

        {/* Description */}
        {task?.description && (
          <p style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: "0.92rem", color: "rgba(199,210,254,0.85)",
            margin: "0 0 1.25rem", lineHeight: 1.65, fontWeight: 500,
          }}>
            {task.description.split("\n")[0]}
          </p>
        )}

        {/* CTA */}
        {url ? (
          <a
            href={url} target="_blank" rel="noopener noreferrer"
            style={{
              display: "inline-flex", alignItems: "center", gap: "0.5rem",
              padding: "0.7rem 1.4rem",
              background: "linear-gradient(135deg, #4338ca, #6366f1)",
              color: "white", borderRadius: "0.875rem",
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontWeight: 700, fontSize: "0.9rem", textDecoration: "none",
              boxShadow: "0 4px 20px rgba(99,102,241,0.45)",
              transition: "transform 0.15s, box-shadow 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 28px rgba(99,102,241,0.6)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "0 4px 20px rgba(99,102,241,0.45)"; }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="white">
              <path d="M8 5v14l11-7z" />
            </svg>
            Watch video
          </a>
        ) : (
          <span style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: "0.82rem", color: "rgba(165,180,252,0.5)", fontWeight: 500,
          }}>
            No video link provided
          </span>
        )}
      </div>

      <ReflectionArea
        taskId={task?.id} userId={userId}
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
