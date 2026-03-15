import { useState } from "react";
import { motion } from "framer-motion";
import { getTaskType } from "../../lib/taskType.js";

const SIZE = 80;
const ICON_SIZE = 29;
const ICON_SIZE_CHECKPOINT = 31;
const ICON_SIZE_CHECK = 34;

const STATUS_STYLES = {
  not_started: {
    border: "#1E2D4A",
    bg: "rgba(17, 24, 39, 0.8)",
    opacity: 1,
  },
  in_progress: {
    border: "#3B82F6",
    bg: "rgba(17, 24, 39, 0.9)",
    opacity: 1,
    glow: "0 0 12px rgba(59, 130, 246, 0.5)",
  },
  completed: {
    border: "#22C55E",
    bg: "#22C55E",
    opacity: 1,
  },
  skipped: {
    border: "#F97316",
    bg: "rgba(249, 115, 22, 0.25)",
    opacity: 1,
  },
  locked: {
    border: "#1E2D4A",
    bg: "rgba(17, 24, 39, 0.6)",
    opacity: 0.4,
  },
};

function IconVideo() {
  return (
    <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
function IconBook() {
  return (
    <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}
function IconPencil() {
  return (
    <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  );
}
function IconWrench() {
  return (
    <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}
function IconCheckpoint() {
  return (
    <svg width={ICON_SIZE_CHECKPOINT} height={ICON_SIZE_CHECKPOINT} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}
function IconLock() {
  return (
    <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
function IconCheck() {
  return (
    <svg width={ICON_SIZE_CHECK} height={ICON_SIZE_CHECK} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function TypeIcon({ type, locked, status }) {
  const color = status === "completed" ? "#fff" : status === "skipped" ? "#F97316" : "rgba(232, 237, 245, 0.9)";
  if (locked) return <IconLock style={{ color: "#94a3b8" }} />;
  if (status === "completed") return <IconCheck style={{ color: "#fff" }} />;
  switch (type) {
    case "video": return <IconVideo style={{ color }} />;
    case "reading": return <IconBook style={{ color }} />;
    case "reflection": return <IconPencil style={{ color }} />;
    case "project": return <IconWrench style={{ color }} />;
    case "checkpoint": return <IconCheckpoint style={{ color }} />;
    default: return <IconPencil style={{ color }} />;
  }
}

export default function MilestoneIcon({
  task,
  taskType,
  isLocked,
  isActive,
  navigate,
  index,
}) {
  const [hovered, setHovered] = useState(false);
  const [shaking, setShaking] = useState(false);

  const status = task.not_for_me ? "skipped" : isLocked ? "locked" : task.status || "not_started";
  const style = STATUS_STYLES[status] || STATUS_STYLES.not_started;
  const type = taskType || getTaskType(task);

  const handleClick = () => {
    if (isLocked) {
      setShaking(true);
      setTimeout(() => setShaking(false), 400);
      return;
    }
    if (navigate) navigate(`/roadmap/task/${task.id}`);
    else window.location.href = `/roadmap/task/${task.id}`;
  };

  return (
    <motion.div
      data-task-id={task.id}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{
        opacity: style.opacity,
        scale: shaking ? [1, 1.05, 0.98, 1.02, 1] : 1,
        x: shaking ? [0, -6, 6, -4, 4, 0] : 0,
      }}
      transition={{
        opacity: { duration: 0.3 },
        scale: shaking ? { duration: 0.4 } : { duration: 0.2 },
        x: shaking ? { duration: 0.4 } : { duration: 0.2 },
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={handleClick}
      style={{
        position: "relative",
        zIndex: 1,
        cursor: isLocked ? "not-allowed" : "pointer",
        flexShrink: 0,
      }}
    >
      <motion.div
        animate={{
          scale: hovered && !isLocked ? 1.1 : 1,
          boxShadow:
            status === "in_progress"
              ? "0 0 16px rgba(59, 130, 246, 0.5)"
              : status === "in_progress" && hovered
                ? "0 0 20px rgba(59, 130, 246, 0.6)"
                : "none",
        }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        style={{
          width: SIZE,
          height: SIZE,
          borderRadius: "50%",
          border: `2px solid ${style.border}`,
          background: style.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: style.glow || "none",
        }}
      >
        {status === "in_progress" && (
          <motion.div
            animate={{ opacity: [0.4, 0.8, 0.4] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            style={{
              position: "absolute",
              inset: -4,
              borderRadius: "50%",
              border: "2px solid rgba(59, 130, 246, 0.4)",
              pointerEvents: "none",
            }}
          />
        )}
        <TypeIcon type={type} locked={isLocked} status={status} />
      </motion.div>

      {hovered && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: "50%",
            transform: "translateX(-50%)",
            marginTop: 8,
            padding: "6px 10px",
            background: "#111827",
            border: "1px solid #1E2D4A",
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            color: "#E8EDF5",
            whiteSpace: "nowrap",
            maxWidth: 220,
            overflow: "hidden",
            textOverflow: "ellipsis",
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            zIndex: 10,
            pointerEvents: "none",
          }}
        >
          {task.title}
          {task.estimated_time && (
            <span style={{ color: "#64748B", fontWeight: 500, marginLeft: 4 }}>
              · {task.estimated_time}
            </span>
          )}
          {isLocked && (
            <div style={{ fontSize: 11, color: "#F97316", marginTop: 2 }}>
              Complete previous tasks first
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
