import ReflectionArea from "./ReflectionArea.jsx";

const FONT = "'Space Grotesk', sans-serif";
const CARD = {
  background: "#ffffff",
  border: "1.5px solid rgba(37,99,235,0.12)",
  borderRadius: "1.25rem",
  padding: "1.5rem 1.75rem",
  marginBottom: "1.25rem",
  boxShadow: "0 4px 24px rgba(37,99,235,0.08), 0 1px 4px rgba(0,0,0,0.04)",
};

export default function VideoTaskContent({ task, userId, taskResponses, onSaveResponses }) {
  const url = task?.resource_url || "";
  const label = task?.resource_label || "Video";
  const prompts = parsePromptsFromDescription(task?.description);

  return (
    <>
      <div style={CARD}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.875rem", marginBottom: "1.25rem" }}>
          <div style={{
            width: 46, height: 46, borderRadius: "0.875rem", flexShrink: 0,
            background: "linear-gradient(135deg, #1d4ed8, #3b82f6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 14px rgba(37,99,235,0.3)",
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
          <div>
            <p style={{ fontFamily: FONT, fontWeight: 700, fontSize: "1rem", color: "#0b1340", margin: "0 0 0.15rem" }}>
              Watch
            </p>
            <p style={{ fontFamily: FONT, fontSize: "0.78rem", fontWeight: 500, color: "#9199b8", margin: 0 }}>
              {label} · {task?.estimated_time || "—"}
            </p>
          </div>
        </div>

        {task?.description && (
          <p style={{ fontFamily: FONT, fontSize: "0.9rem", color: "#4b5470", margin: "0 0 1.25rem", lineHeight: 1.65, fontWeight: 500 }}>
            {task.description.split("\n")[0]}
          </p>
        )}

        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer"
            style={{
              display: "inline-flex", alignItems: "center", gap: "0.5rem",
              padding: "0.65rem 1.35rem",
              background: "linear-gradient(135deg, #1d4ed8, #3b82f6)",
              color: "white", borderRadius: "0.875rem",
              fontFamily: FONT, fontWeight: 700, fontSize: "0.88rem",
              textDecoration: "none", boxShadow: "0 4px 16px rgba(37,99,235,0.3)",
              transition: "transform 0.15s, box-shadow 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 6px 24px rgba(37,99,235,0.45)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "0 4px 16px rgba(37,99,235,0.3)"; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z" /></svg>
            Watch video
          </a>
        ) : (
          <span style={{ fontFamily: FONT, fontSize: "0.82rem", color: "#9199b8", fontWeight: 500 }}>No video link provided</span>
        )}
      </div>

      <ReflectionArea taskId={task?.id} userId={userId} prompts={prompts}
        initialResponses={taskResponses?.responses || {}} onSave={onSaveResponses} />
    </>
  );
}

function parsePromptsFromDescription(desc) {
  if (!desc || typeof desc !== "string") return [];
  const bullets = desc.split(/\n/).map((s) => s.replace(/^[\s\-*•]+/, "").trim()).filter(Boolean);
  if (bullets.length > 0) return bullets.map((text, i) => ({ id: `prompt_${i}`, label: text }));
  return [];
}
