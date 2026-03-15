import { useState } from "react";
import { motion } from "framer-motion";
import { getTaskType } from "../../lib/taskType.js";
import "./MilestoneIcon.css";

const ICON_SIZE = 35;
const ICON_SIZE_CHECKPOINT = 37;
const ICON_SIZE_CHECK = 41;

const STATUS_BACK_COLOR = {
  not_started: "#1E2D4A",
  in_progress: "#3B82F6",
  completed: "#22C55E",
  locked: "#0F172A",
  skipped: "#F97316",
};

function IconVideo({ style = {} }) {
  const { width = ICON_SIZE, height = ICON_SIZE, ...rest } = style;
  return (
    <svg width={width} height={height} viewBox="0 0 24 24" fill="currentColor" style={rest}>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
function IconBook({ style = {} }) {
  const { width = ICON_SIZE, height = ICON_SIZE, ...rest } = style;
  return (
    <svg width={width} height={height} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={rest}>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}
function IconPencil({ style = {} }) {
  const { width = ICON_SIZE, height = ICON_SIZE, ...rest } = style;
  return (
    <svg width={width} height={height} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={rest}>
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  );
}
function IconWrench({ style = {} }) {
  const { width = ICON_SIZE, height = ICON_SIZE, ...rest } = style;
  return (
    <svg width={width} height={height} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={rest}>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}
function IconCheckpoint({ style = {} }) {
  const { width = ICON_SIZE_CHECKPOINT, height = ICON_SIZE_CHECKPOINT, ...rest } = style;
  return (
    <svg width={width} height={height} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={rest}>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}
function IconLock({ style = {} }) {
  const { width = ICON_SIZE, height = ICON_SIZE, ...rest } = style;
  return (
    <svg width={width} height={height} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={rest}>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
function IconCheck({ style = {} }) {
  const { width = ICON_SIZE_CHECK, height = ICON_SIZE_CHECK, ...rest } = style;
  return (
    <svg width={width} height={height} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={rest}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function TypeIcon({ type, locked, status, iconSize = ICON_SIZE }) {
  const size = iconSize === "100%" ? "100%" : iconSize;
  const color = status === "completed" ? "#fff" : status === "skipped" ? "#F97316" : "rgba(232, 237, 245, 0.9)";
  const common = size === "100%" ? { width: "100%", height: "100%" } : { width: size, height: size };
  if (locked) return <IconLock style={{ color: "#94a3b8", ...common }} />;
  if (status === "completed") return <IconCheck style={{ color: "#fff", ...common }} />;
  switch (type) {
    case "video": return <IconVideo style={{ color, ...common }} />;
    case "reading": return <IconBook style={{ color, ...common }} />;
    case "reflection": return <IconPencil style={{ color, ...common }} />;
    case "project": return <IconWrench style={{ color, ...common }} />;
    case "checkpoint": return <IconCheckpoint style={{ color, ...common }} />;
    default: return <IconPencil style={{ color, ...common }} />;
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
  const [shaking, setShaking] = useState(false);

  const status = task.not_for_me ? "skipped" : isLocked ? "locked" : task.status || "not_started";
  const backColor = STATUS_BACK_COLOR[status] ?? STATUS_BACK_COLOR.not_started;
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

  const labelText = isLocked
    ? "Complete previous tasks first"
    : task.estimated_time
      ? `${task.title} · ${task.estimated_time}`
      : task.title;

  return (
    <motion.div
      data-task-id={task.id}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{
        opacity: 1,
        scale: shaking ? [1, 1.05, 0.98, 1.02, 1] : 1,
        x: shaking ? [0, -6, 6, -4, 4, 0] : 0,
      }}
      transition={{
        opacity: { duration: 0.3 },
        scale: shaking ? { duration: 0.4 } : { duration: 0.2 },
        x: shaking ? { duration: 0.4 } : { duration: 0.2 },
      }}
      style={{
        position: "relative",
        zIndex: 1,
        flexShrink: 0,
      }}
    >
      <button
        type="button"
        className="icon-btn"
        onClick={handleClick}
        style={{ cursor: isLocked ? "not-allowed" : "pointer" }}
        aria-label={task.title}
      >
        <span className="icon-btn__back" style={{ backgroundColor: backColor }} />
        <span className="icon-btn__front">
          <span className="icon-btn__icon">
            <TypeIcon type={type} locked={isLocked} status={status} iconSize="100%" />
          </span>
        </span>
        <span className="icon-btn__label">{labelText}</span>
      </button>
    </motion.div>
  );
}
