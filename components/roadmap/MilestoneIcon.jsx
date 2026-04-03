import { useState } from "react";
import { motion } from "framer-motion";
import { getTaskType } from "../../lib/taskType.js";
import "./MilestoneIcon.css";

const SIZE      = 90;
const SIZE_ACTIVE = 100;
const ICON      = 40;

const STATUS_STYLES = {
  not_started: {
    size:      SIZE,
    bg:        "linear-gradient(180deg, #6366f1 0%, #4f46e5 100%)",
    shadow:    "0 6px 0 0 #3730a3",
    iconColor: "#fff",
    nodeClass: "",
    wrapClass: "",
  },
  in_progress: {
    size:      SIZE_ACTIVE,
    bg:        "linear-gradient(180deg, #818cf8 0%, #6366f1 100%)",
    shadow:    "0 6px 0 0 #4338ca",
    iconColor: "#fff",
    nodeClass: "m-node-glow",
    wrapClass: "",
  },
  completed: {
    size:      SIZE,
    bg:        "linear-gradient(180deg, #34d399 0%, #10b981 100%)",
    shadow:    "0 6px 0 0 #059669",
    iconColor: "#fff",
    nodeClass: "",
    wrapClass: "",
  },
  locked: {
    size:      SIZE,
    bg:        "linear-gradient(180deg, #e2e8f0 0%, #cbd5e1 100%)",
    shadow:    "0 4px 0 0 #94a3b8",
    iconColor: "#94a3b8",
    nodeClass: "",
    wrapClass: "m-wrap-float",
  },
  skipped: {
    size:      SIZE,
    bg:        "linear-gradient(180deg, #fb923c 0%, #f97316 100%)",
    shadow:    "0 4px 0 0 #ea580c",
    iconColor: "#fff",
    nodeClass: "",
    wrapClass: "",
  },
};

/* ── SVG icons ──────────────────────────────────────────────────────────────── */
function IconVideo({ size, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
function IconBook({ size, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}
function IconPencil({ size, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  );
}
function IconWrench({ size, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}
function IconStar({ size, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}
function IconLock({ size, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
function IconCheck({ size, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function NodeIcon({ type, status, locked, color }) {
  const s = Math.round(ICON);
  if (locked)                  return <IconLock   size={s} color={color} />;
  if (status === "completed")  return <IconCheck  size={s} color={color} />;
  if (status === "skipped")    return <IconStar   size={s} color={color} />;
  switch (type) {
    case "video":      return <IconVideo  size={s} color={color} />;
    case "reading":    return <IconBook   size={s} color={color} />;
    case "project":    return <IconWrench size={s} color={color} />;
    case "checkpoint": return <IconStar   size={s} color={color} />;
    default:           return <IconPencil size={s} color={color} />;
  }
}

/* ── Component ──────────────────────────────────────────────────────────────── */
export default function MilestoneIcon({ task, taskType, isLocked, isActive, navigate, index }) {
  const [shaking, setShaking] = useState(false);

  const status  = task.not_for_me ? "skipped" : isLocked ? "locked" : (task.status || "not_started");
  const s       = STATUS_STYLES[status] ?? STATUS_STYLES.not_started;
  const type    = taskType || getTaskType(task);

  const handleClick = () => {
    if (isLocked) {
      setShaking(true);
      setTimeout(() => setShaking(false), 420);
      return;
    }
    if (navigate) navigate(`/roadmap/task/${task.id}`);
    else window.location.href = `/roadmap/task/${task.id}`;
  };

  const label = isLocked
    ? "Complete previous tasks first"
    : task.estimated_time
      ? `${task.title} · ${task.estimated_time}`
      : task.title;

  return (
    <motion.div
      data-task-id={task.id}
      className={`m-node-wrap ${s.wrapClass}`}
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{
        opacity: 1,
        scale: shaking ? [1, 1.06, 0.97, 1.03, 1] : 1,
        x:     shaking ? [0, -8, 8, -5, 5, 0]    : 0,
      }}
      transition={{
        opacity: { duration: 0.3 },
        scale:   shaking ? { duration: 0.42 } : { duration: 0.25 },
        x:       shaking ? { duration: 0.42 } : {},
      }}
    >
      <motion.button
        type="button"
        onClick={handleClick}
        className={s.nodeClass}
        whileHover={{ scale: isLocked ? 1 : 1.08, y: isLocked ? 0 : -4 }}
        whileTap={{ scale: isLocked ? 1 : 0.95 }}
        disabled={isLocked}
        aria-label={task.title}
        style={{
          width:        s.size,
          height:       s.size,
          borderRadius: "50%",
          background:   s.bg,
          border:       "none",
          boxShadow:    s.shadow,
          cursor:       isLocked ? "not-allowed" : "pointer",
          display:      "grid",
          placeItems:   "center",
          outline:      "none",
          flexShrink:   0,
          transition:   "transform 0.18s ease",
        }}
      >
        <NodeIcon type={type} status={status} locked={isLocked} color={s.iconColor} />
      </motion.button>

      <span className="m-label">{label}</span>
    </motion.div>
  );
}
