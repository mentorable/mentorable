import { motion } from "framer-motion";

const NODE_SIZE  = 88;
const ACTIVE_SIZE = 96;
const ICON_SIZE  = 38;

const STATE_STYLES = {
  active: {
    size:       ACTIVE_SIZE,
    bg:         "linear-gradient(180deg, #818cf8 0%, #6366f1 100%)",
    shadow:     "0 6px 0 0 #3730a3",
    iconColor:  "#fff",
    nodeClass:  "m-node-active-glow",
    wrapClass:  "m-node-active-bounce",
  },
  completed: {
    size:      NODE_SIZE,
    bg:        "linear-gradient(180deg, #34d399 0%, #10b981 100%)",
    shadow:    "0 6px 0 0 #059669",
    iconColor: "#fff",
    nodeClass: "",
    wrapClass: "",
  },
  locked: {
    size:      NODE_SIZE,
    bg:        "linear-gradient(180deg, #e2e8f0 0%, #cbd5e1 100%)",
    shadow:    "0 4px 0 0 #94a3b8",
    iconColor: "#94a3b8",
    nodeClass: "",
    wrapClass: "m-node-locked-float",
  },
  chest: {
    size:      NODE_SIZE,
    bg:        "linear-gradient(180deg, #e2e8f0 0%, #cbd5e1 100%)",
    shadow:    "0 4px 0 0 #94a3b8",
    iconColor: "#94a3b8",
    nodeClass: "",
    wrapClass: "m-node-locked-float",
  },
};

/* ── Icons ─────────────────────────────────────────────────── */
function StarSvg({ size, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}
function CheckSvg({ size, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
function TrophySvg({ size, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>
      <path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22"/>
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22"/>
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
    </svg>
  );
}
function ChestSvg({ size, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2"/>
      <path d="M16 7V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v3"/>
      <line x1="12" y1="11" x2="12" y2="15"/><circle cx="12" cy="13" r="1"/>
    </svg>
  );
}
function LockSvg({ size, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  );
}

function NodeIcon({ type, state, color }) {
  const s = ICON_SIZE;
  if (state === "active")     return <StarSvg   size={s + 4} color={color} />;
  if (state === "completed")  return <CheckSvg  size={s}     color={color} />;
  if (type  === "trophy")     return <TrophySvg size={s}     color={color} />;
  if (type  === "chest")      return <ChestSvg  size={s}     color={color} />;
  if (state === "locked")     return <LockSvg   size={s}     color={color} />;
  return <StarSvg size={s} color={color} />;
}

/* ── Component ─────────────────────────────────────────────── */
export default function LessonNode({ lesson, offset = 0, onClick }) {
  const s = STATE_STYLES[lesson.state] || STATE_STYLES.locked;

  return (
    <motion.div
      className={`relative flex w-full justify-center ${s.wrapClass}`}
      animate={{ x: offset }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Badge above active node */}
      {lesson.badge && (
        <div
          style={{
            position:    "absolute",
            top:         -44,
            zIndex:      10,
            background:  "#fff",
            border:      "2px solid rgb(var(--m-border))",
            borderBottom:"4px solid rgb(var(--m-indigo))",
            borderRadius: "0.75rem",
            padding:     "0.25rem 1rem",
            fontSize:    "0.78rem",
            fontWeight:  800,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color:       "rgb(var(--m-indigo))",
            boxShadow:   "0 2px 8px rgba(0,0,0,0.06)",
            fontFamily:  "'Plus Jakarta Sans', sans-serif",
          }}
        >
          {lesson.badge}
        </div>
      )}

      <motion.button
        type="button"
        onClick={() => onClick?.(lesson)}
        whileHover={{ scale: lesson.state === "locked" ? 1 : 1.08, y: lesson.state === "locked" ? 0 : -4 }}
        whileTap={{ scale: lesson.state === "locked" ? 1 : 0.95 }}
        disabled={lesson.state === "locked"}
        className={s.nodeClass}
        style={{
          width:        s.size,
          height:       s.size,
          borderRadius: "50%",
          background:   s.bg,
          border:       "none",
          boxShadow:    s.shadow,
          cursor:       lesson.state === "locked" ? "default" : "pointer",
          display:      "grid",
          placeItems:   "center",
          outline:      "none",
          transition:   "transform 0.18s ease, box-shadow 0.18s ease",
        }}
      >
        <NodeIcon type={lesson.type} state={lesson.state} color={s.iconColor} />
      </motion.button>
    </motion.div>
  );
}
