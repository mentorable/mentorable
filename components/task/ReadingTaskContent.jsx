import ReflectionArea from "./ReflectionArea.jsx";

const CARD = {
  background: "linear-gradient(135deg, rgba(45,40,148,0.55) 0%, rgba(30,27,75,0.75) 100%)",
  border: "1.5px solid rgba(99,102,241,0.3)",
  borderRadius: "1.25rem",
  padding: "1.5rem 1.75rem",
  marginBottom: "1.25rem",
  boxShadow: "0 8px 32px rgba(67,56,202,0.2)",
};

export default function ReadingTaskContent({ task, userId, taskResponses, onSaveResponses }) {
  const url = task?.resource_url || "";
  const label = task?.resource_label || "Article";
  const prompts = parsePromptsFromDescription(task?.description);

  return (
    <>
      <div style={CARD}>
        {/* Header row */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.875rem", marginBottom: "1.25rem" }}>
          <div style={{
            width: 48, height: 48, borderRadius: "0.875rem", flexShrink: 0,
            background: "linear-gradient(135deg, #312e81, #4338ca)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 16px rgba(67,56,202,0.4)",
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
          </div>
          <div>
            <p style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontWeight: 800, fontSize: "1.05rem", color: "white", margin: "0 0 0.2rem",
            }}>
              Read
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
              background: "rgba(99,102,241,0.15)",
              border: "1.5px solid rgba(99,102,241,0.45)",
              color: "#a5b4fc", borderRadius: "0.875rem",
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontWeight: 700, fontSize: "0.9rem", textDecoration: "none",
              transition: "all 0.18s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(99,102,241,0.25)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(99,102,241,0.15)"; e.currentTarget.style.transform = ""; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            Open article
          </a>
        ) : (
          <span style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: "0.82rem", color: "rgba(165,180,252,0.5)", fontWeight: 500,
          }}>
            No article link provided
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
