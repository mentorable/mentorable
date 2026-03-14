import { useState } from "react";
import { motion } from "framer-motion";

export default function TaskCard({ task, onComplete, onFlagNotForMe, isLocked, isCompleted }) {
  const [hovered, setHovered] = useState(false);

  if (!task) return null;

  const notForMe = task.not_for_me;
  const completed = isCompleted || task.status === "completed";
  const skipped = task.status === "skipped" || notForMe;

  // Border color logic
  let borderColor = "#e2e8f0";
  let bgColor = "#ffffff";
  if (completed && !notForMe) { borderColor = "#86efac"; bgColor = "#f0fdf4"; }
  if (notForMe) { borderColor = "#fed7aa"; bgColor = "#fff7ed"; }
  if (isLocked) { borderColor = "#e2e8f0"; bgColor = "#f8fafc"; }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: isLocked ? 0.7 : completed && !notForMe ? 0.65 : 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: bgColor,
        border: `1.5px solid ${borderColor}`,
        borderRadius: "0.875rem",
        padding: "1rem 1.125rem",
        position: "relative",
        filter: isLocked ? "blur(2.5px)" : "none",
        transition: "box-shadow 0.2s, border-color 0.2s",
        boxShadow: hovered && !isLocked
          ? "0 4px 16px rgba(0,0,0,0.07)"
          : "0 1px 4px rgba(0,0,0,0.04)",
        cursor: isLocked ? "not-allowed" : "default",
        userSelect: isLocked ? "none" : "auto",
      }}
    >
      {/* Lock overlay */}
      {isLocked && (
        <div style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "0.875rem",
          background: "rgba(248,250,252,0.5)",
          zIndex: 2,
        }}>
          <div style={{
            background: "rgba(255,255,255,0.9)",
            borderRadius: "50%",
            width: 32,
            height: 32,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
        </div>
      )}

      {/* Completed checkmark badge */}
      {completed && !notForMe && (
        <div style={{
          position: "absolute",
          top: "0.75rem",
          right: "0.875rem",
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: "#10b981",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
      )}

      {/* "Not for me" badge */}
      {notForMe && (
        <div style={{
          position: "absolute",
          top: "0.75rem",
          right: "0.875rem",
          padding: "0.15rem 0.5rem",
          borderRadius: "9999px",
          background: "#fed7aa",
          border: "1px solid #fb923c50",
          fontSize: "0.65rem",
          fontWeight: 700,
          color: "#c2410c",
          letterSpacing: "0.04em",
          textTransform: "uppercase",
        }}>
          Not for me
        </div>
      )}

      {/* Title */}
      <h4 style={{
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        fontWeight: 700,
        fontSize: "0.9rem",
        color: completed || notForMe ? "#94a3b8" : "#0f172a",
        margin: "0 0 0.375rem 0",
        lineHeight: 1.3,
        paddingRight: completed || notForMe ? "5rem" : "0",
        textDecoration: completed && !notForMe ? "line-through" : "none",
      }}>
        {task.title}
      </h4>

      {/* Description */}
      {task.description && (
        <p style={{
          fontSize: "0.82rem",
          color: "#64748b",
          margin: "0 0 0.875rem 0",
          lineHeight: 1.55,
        }}>
          {task.description}
        </p>
      )}

      {/* Pills row */}
      <div style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "0.375rem",
        marginBottom: completed || notForMe ? "0" : "0.875rem",
        alignItems: "center",
      }}>
        {/* Time pill */}
        <span style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.25rem",
          padding: "0.2rem 0.6rem",
          borderRadius: "9999px",
          background: "#f1f5f9",
          border: "1px solid #e2e8f0",
          fontSize: "0.72rem",
          fontWeight: 600,
          color: "#64748b",
        }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          {task.estimated_time || "--"}
        </span>

        {/* Skill pill */}
        <span style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.25rem",
          padding: "0.2rem 0.6rem",
          borderRadius: "9999px",
          background: "#eef2ff",
          border: "1px solid #c7d2fe",
          fontSize: "0.72rem",
          fontWeight: 600,
          color: "#4f46e5",
        }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          {task.skill_gained || "--"}
        </span>

        {/* Resource link */}
        {task.resource_url ? (
          <a
            href={task.resource_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.25rem",
              padding: "0.2rem 0.6rem",
              borderRadius: "9999px",
              background: "#f0fdf4",
              border: "1px solid #bbf7d0",
              fontSize: "0.72rem",
              fontWeight: 600,
              color: "#15803d",
              textDecoration: "none",
            }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            {task.resource_label || "Resource"}
          </a>
        ) : (
          <span style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "0.2rem 0.6rem",
            borderRadius: "9999px",
            background: "#f8fafc",
            border: "1px solid #f1f5f9",
            fontSize: "0.72rem",
            fontWeight: 500,
            color: "#94a3b8",
          }}>
            No resource
          </span>
        )}
      </div>

      {/* Action row — only shown if not locked, not completed, not flagged */}
      {!isLocked && !completed && !notForMe && (
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: "0.625rem",
          borderTop: "1px solid #f1f5f9",
        }}>
          {/* Mark complete */}
          <button
            onClick={() => onComplete && onComplete(task.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              background: "none",
              border: "1.5px solid #e2e8f0",
              borderRadius: "0.625rem",
              padding: "0.4rem 0.875rem",
              cursor: "pointer",
              fontSize: "0.8rem",
              fontWeight: 600,
              color: "#374151",
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              transition: "all 0.18s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#f0fdf4";
              e.currentTarget.style.borderColor = "#86efac";
              e.currentTarget.style.color = "#15803d";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "none";
              e.currentTarget.style.borderColor = "#e2e8f0";
              e.currentTarget.style.color = "#374151";
            }}
          >
            <div style={{
              width: 16,
              height: 16,
              borderRadius: "4px",
              border: "1.5px solid #d1d5db",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            Mark complete
          </button>

          {/* Not for me */}
          <button
            onClick={() => onFlagNotForMe && onFlagNotForMe(task.id)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "0.75rem",
              fontWeight: 500,
              color: "#94a3b8",
              padding: "0.25rem 0.375rem",
              borderRadius: "0.375rem",
              transition: "color 0.18s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "#f97316"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "#94a3b8"; }}
          >
            Not for me
          </button>
        </div>
      )}
    </motion.div>
  );
}
