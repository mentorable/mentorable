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

export default function ReadingTaskContent({ task, userId, taskResponses, onSaveResponses }) {
  const url = task?.resource_url || "";
  const label = task?.resource_label || "Article";
  const prompts = parsePromptsFromDescription(task?.description);

  return (
    <>
      <div style={CARD}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.875rem", marginBottom: "1.25rem" }}>
          <div style={{
            width: 46, height: 46, borderRadius: "0.875rem", flexShrink: 0,
            background: "linear-gradient(135deg, #0369a1, #0284c7)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 14px rgba(3,105,161,0.3)",
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
          </div>
          <div>
            <p style={{ fontFamily: FONT, fontWeight: 700, fontSize: "1rem", color: "#0b1340", margin: "0 0 0.15rem" }}>
              Read
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
              background: "rgba(3,105,161,0.08)",
              border: "1.5px solid rgba(3,105,161,0.25)",
              color: "#0369a1", borderRadius: "0.875rem",
              fontFamily: FONT, fontWeight: 700, fontSize: "0.88rem",
              textDecoration: "none", transition: "all 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(3,105,161,0.14)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(3,105,161,0.08)"; e.currentTarget.style.transform = ""; }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            Open article
          </a>
        ) : (
          <span style={{ fontFamily: FONT, fontSize: "0.82rem", color: "#9199b8", fontWeight: 500 }}>No article link provided</span>
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
