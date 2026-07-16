import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../lib/supabase.js";
import { getCache, setCache, getKnownUserId, setKnownUserId } from "../lib/cache.js";
import { getQuestGenerating, setQuestGenerating } from "../lib/liveState.js";
import { fetchUsage, LIMITS } from "../lib/usage.js";
import LimitModal from "../components/common/LimitModal.jsx";
import { SIDEBAR_WIDTH } from "../components/common/Sidebar.jsx";
import { useIsMobile } from "../hooks/useIsMobile.js";

const LANGGRAPH_URL = import.meta.env.VITE_LANGGRAPH_CHAT_URL;

// ─── Design tokens ────────────────────────────────────────────────────────────
const BG          = "#faf9f5";
const WHITE       = "#ffffff";
const BLUE        = "#1d4ed8";
const BLUE_MID    = "#3b82f6";
const BLUE_SOFT   = "#dbeafe";
const BLUE_TINT   = "#f0f5ff";
const GREEN       = "#059669";
const GREEN_SOFT  = "#d1fae5";
const AMBER       = "#d97706";
const AMBER_SOFT  = "#fef3c7";
const RED         = "#dc2626";
const RED_SOFT    = "#fee2e2";
const PURPLE      = "#7c3aed";
const PURPLE_SOFT = "#ede9fe";
const PURPLE_MID  = "#c4b5fd";
const TEXT        = "#141413";
const TEXT_MID    = "#3d3d3a";
const TEXT_MUTED  = "#494742";
const TEXT_FAINT  = "#6a6760";
const BORDER      = "#e6dfd8";
const FONT        = "'Raleway', sans-serif";
const SERIF       = "'Raleway', sans-serif";

const AXIS_LABELS = {
  communication: "Communication", leadership: "Leadership", technicality: "Technicality",
  resourcefulness: "Resourcefulness", execution: "Execution",
};

// ─── Column config ────────────────────────────────────────────────────────────
const COLUMNS = [
  {
    status: "suggested",
    label: "Suggestions",
    accent: BLUE,
    soft: BLUE_TINT,
    border: BLUE_SOFT,
    emptyText: "Hit Generate to get your first quest suggestions.",
  },
  {
    status: "considered",
    label: "Considered",
    accent: PURPLE,
    soft: PURPLE_SOFT,
    border: PURPLE_MID,
    emptyText: "Drag quests here when you're thinking about them.",
  },
  {
    status: "in_progress",
    label: "In Progress",
    accent: AMBER,
    soft: AMBER_SOFT,
    border: "#fcd34d",
    emptyText: "Move quests here once you start working on them.",
  },
  {
    status: "completed",
    label: "Completed",
    accent: GREEN,
    soft: GREEN_SOFT,
    border: "#6ee7b7",
    emptyText: "Drag quests here when you finish them.",
  },
];

// ─── Badge configs ────────────────────────────────────────────────────────────
const CATEGORY_STYLES = {
  Project:     { bg: BLUE_TINT,   color: BLUE },
  Research:    { bg: AMBER_SOFT,  color: AMBER },
  Application: { bg: GREEN_SOFT,  color: GREEN },
  Learning:    { bg: PURPLE_SOFT, color: PURPLE },
  Other:       { bg: BORDER,      color: TEXT_MUTED },
};

const DIFFICULTY_STYLES = {
  Easy:   { bg: GREEN_SOFT, color: GREEN },
  Medium: { bg: AMBER_SOFT, color: AMBER },
  Hard:   { bg: RED_SOFT,   color: RED },
};

// ─── Confetti ─────────────────────────────────────────────────────────────────
const CONFETTI_COLORS = [BLUE, GREEN, AMBER, PURPLE, "#f43f5e", "#06b6d4", "#f59e0b"];

function Confetti() {
  const particles = Array.from({ length: 32 }, (_, i) => {
    const side = Math.random() - 0.5;
    return {
      id: i,
      x: window.innerWidth / 2 + side * 120,
      y: window.innerHeight * 0.4,
      dx: side * (80 + Math.random() * 220),
      dy: -(60 + Math.random() * 160),
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      rotation: (Math.random() - 0.5) * 900,
      size: 5 + Math.random() * 7,
      isCircle: Math.random() > 0.4,
      duration: 1.1 + Math.random() * 0.9,
      delay: Math.random() * 0.25,
    };
  });

  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 9999 }}>
      {particles.map(p => (
        <motion.div
          key={p.id}
          initial={{ x: p.x, y: p.y, opacity: 1, rotate: 0, scale: 1 }}
          animate={{
            x: p.x + p.dx,
            y: p.y + p.dy + 300 + Math.random() * 150,
            opacity: 0,
            rotate: p.rotation,
            scale: 0.2,
          }}
          transition={{ duration: p.duration, delay: p.delay, ease: "easeOut" }}
          style={{
            position: "fixed",
            width: p.size,
            height: p.isCircle ? p.size : p.size * 1.6,
            borderRadius: p.isCircle ? "50%" : 2,
            background: p.color,
          }}
        />
      ))}
    </div>
  );
}

// ─── Skeleton card ────────────────────────────────────────────────────────────
function SkeletonCard({ delay = 0 }) {
  return (
    <div style={{
      background: WHITE, borderRadius: 14,
      border: `1px solid ${BORDER}`, padding: "14px 16px",
      animation: `quest-pulse 1.6s ease-in-out ${delay}s infinite`,
    }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        <div style={{ height: 18, width: 60, background: BORDER, borderRadius: 6 }} />
        <div style={{ height: 18, width: 44, background: BORDER, borderRadius: 6 }} />
      </div>
      <div style={{ height: 13, background: BORDER, borderRadius: 4, marginBottom: 6 }} />
      <div style={{ height: 13, background: BORDER, borderRadius: 4, width: "75%", marginBottom: 10 }} />
      <div style={{ height: 11, background: BORDER, borderRadius: 4, width: "55%" }} />
    </div>
  );
}

// ─── Quest card ───────────────────────────────────────────────────────────────
function QuestCard({ item, isDragging, onDragStart, onDragEnd, isMobile, onMove, isDismissing, onOpen }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const catStyle  = CATEGORY_STYLES[item.category] || CATEGORY_STYLES.Other;
  const diffStyle = item.difficulty ? (DIFFICULTY_STYLES[item.difficulty] || null) : null;
  const otherCols = COLUMNS.filter(c => c.status !== item.status);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: isDragging ? 0.35 : 1, y: 0, scale: isDragging ? 1.03 : 1 }}
      exit={isDismissing
        ? { opacity: 0, scaleX: 0.6, scaleY: 0, rotate: -4, transition: { duration: 0.28, ease: [0.4, 0, 1, 1] } }
        : { opacity: 0, scale: 0.94, y: -4, transition: { duration: 0.18 } }
      }
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      draggable={!isMobile}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; onDragStart(item.id); }}
      onDragEnd={onDragEnd}
      onClick={() => onOpen?.(item)}
      title="Click for full details"
      style={{
        background: WHITE,
        borderRadius: 14,
        border: `1px solid ${BORDER}`,
        padding: "13px 14px",
        boxShadow: isDragging
          ? "0 10px 32px rgba(0,0,0,0.13)"
          : "0 1px 3px rgba(15,23,42,0.04)",
        cursor: isMobile ? "pointer" : "grab",
        userSelect: "none",
        position: "relative",
        transformOrigin: "top center",
      }}
    >
      {/* Badges row */}
      <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
        <span style={{
          fontFamily: FONT, fontSize: 10, fontWeight: 700,
          letterSpacing: "0.05em", textTransform: "uppercase",
          background: catStyle.bg, color: catStyle.color,
          borderRadius: 5, padding: "2px 7px",
        }}>
          {item.category || "Other"}
        </span>
        {item.roadmap_node_id && (
          <span style={{
            fontFamily: FONT, fontSize: 10, fontWeight: 700,
            letterSpacing: "0.04em", textTransform: "uppercase",
            background: "#eef2ff", color: BLUE,
            borderRadius: 5, padding: "2px 7px",
            display: "inline-flex", alignItems: "center", gap: 3,
          }}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>
            </svg>
            Roadmap
          </span>
        )}
        {diffStyle && (
          <span style={{
            fontFamily: FONT, fontSize: 10, fontWeight: 700,
            letterSpacing: "0.04em", textTransform: "uppercase",
            background: diffStyle.bg, color: diffStyle.color,
            borderRadius: 5, padding: "2px 7px",
          }}>
            {item.difficulty}
          </span>
        )}
        {item.estimated_time && (
          <span style={{
            fontFamily: FONT, fontSize: 10, fontWeight: 600,
            color: TEXT_FAINT, background: BG,
            borderRadius: 5, padding: "2px 7px",
            border: `1px solid ${BORDER}`, marginLeft: "auto",
          }}>
            {item.estimated_time}
          </span>
        )}
      </div>

      {/* Title */}
      <div style={{
        fontFamily: FONT, fontWeight: 700, fontSize: 13.5,
        color: TEXT, lineHeight: 1.38,
        marginBottom: (item.description || item.why_it_matters) ? 5 : 0,
      }}>
        {item.title}
      </div>

      {/* Description */}
      {item.description && (
        <p style={{
          fontFamily: FONT, fontSize: 12.5, color: TEXT_MUTED,
          lineHeight: 1.5, margin: "0 0 5px",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}>
          {item.description}
        </p>
      )}

      {/* Why it matters */}
      {item.why_it_matters && (
        <p style={{
          fontFamily: FONT, fontSize: 11.5, color: TEXT_FAINT,
          lineHeight: 1.45, margin: 0, fontStyle: "italic",
        }}>
          {item.why_it_matters}
        </p>
      )}

      {/* Completed date */}
      {item.status === "completed" && item.completed_at && (
        <div style={{
          marginTop: 8, fontFamily: FONT, fontSize: 11,
          color: GREEN, fontWeight: 600,
        }}>
          ✓ {new Date(item.completed_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        </div>
      )}

      {/* Mobile: move menu */}
      {isMobile && (
        <div style={{ marginTop: 10, position: "relative" }} ref={menuRef} onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setMenuOpen(v => !v)}
            style={{
              fontFamily: FONT, fontSize: 12, fontWeight: 600,
              color: TEXT_MUTED, background: BG,
              border: `1px solid ${BORDER}`, borderRadius: 8,
              padding: "5px 10px", cursor: "pointer",
              display: "inline-flex", alignItems: "center", gap: 4,
            }}
          >
            Move to
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>

          <AnimatePresence>
            {menuOpen && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.95 }}
                transition={{ duration: 0.13 }}
                style={{
                  position: "absolute", bottom: "calc(100% + 6px)", left: 0,
                  background: WHITE, border: `1px solid ${BORDER}`,
                  borderRadius: 12, padding: 5,
                  boxShadow: "0 6px 20px rgba(0,0,0,0.09)",
                  zIndex: 50, minWidth: 150,
                }}
              >
                {otherCols.map(col => (
                  <button
                    key={col.status}
                    onClick={() => { onMove(item.id, col.status); setMenuOpen(false); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 7,
                      width: "100%", fontFamily: FONT, fontSize: 13, fontWeight: 600,
                      color: col.accent, background: "none",
                      border: "none", borderRadius: 8,
                      padding: "7px 10px", cursor: "pointer", textAlign: "left",
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = col.soft}
                    onMouseLeave={e => e.currentTarget.style.background = "none"}
                  >
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: col.accent, flexShrink: 0 }} />
                    {col.label}
                  </button>
                ))}
                <div style={{ height: 1, background: BORDER, margin: "3px 0" }} />
                <button
                  onClick={() => { onMove(item.id, "deleted"); setMenuOpen(false); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 7,
                    width: "100%", fontFamily: FONT, fontSize: 13, fontWeight: 600,
                    color: TEXT_FAINT, background: "none",
                    border: "none", borderRadius: 8,
                    padding: "7px 10px", cursor: "pointer", textAlign: "left",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = RED_SOFT; e.currentTarget.style.color = RED; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = TEXT_FAINT; }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                  </svg>
                  Not interested
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
}

// ─── Quest detail modal ───────────────────────────────────────────────────────
function QuestDetailModal({ item, onClose }) {
  if (!item) return null;
  const catStyle  = CATEGORY_STYLES[item.category] || CATEGORY_STYLES.Other;
  const diffStyle = item.difficulty ? (DIFFICULTY_STYLES[item.difficulty] || null) : null;
  const Badge = ({ bg, color, children }) => (
    <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", background: bg, color, borderRadius: 6, padding: "3px 9px" }}>{children}</span>
  );
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(20,20,19,0.45)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}
    >
      <motion.div
        initial={{ opacity: 0, y: 22, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.97 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 520, maxHeight: "85vh", overflowY: "auto", background: WHITE, borderRadius: 20, border: `1px solid ${BORDER}`, boxShadow: "0 30px 80px rgba(0,0,0,0.3)", padding: "1.75rem" }}
      >
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 14, alignItems: "center" }}>
          <Badge bg={catStyle.bg} color={catStyle.color}>{item.category || "Other"}</Badge>
          {diffStyle && <Badge bg={diffStyle.bg} color={diffStyle.color}>{item.difficulty}</Badge>
          }
          {item.target_axis && <Badge bg={BLUE_TINT} color={BLUE}>Builds {AXIS_LABELS[item.target_axis] || item.target_axis}</Badge>}
          {item.estimated_time && <span style={{ marginLeft: "auto", fontFamily: FONT, fontSize: 12, fontWeight: 600, color: TEXT_FAINT }}>{item.estimated_time}</span>}
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.5rem", lineHeight: 1, color: TEXT_FAINT, padding: 0, marginLeft: item.estimated_time ? 8 : "auto" }}>×</button>
        </div>

        <h2 style={{ fontFamily: FONT, fontWeight: 700, fontSize: "1.4rem", color: TEXT, letterSpacing: "-0.01em", lineHeight: 1.25, marginBottom: item.description ? 12 : 0 }}>
          {item.title}
        </h2>

        {item.description && (
          <p style={{ fontFamily: FONT, fontSize: "0.98rem", color: TEXT_MID, lineHeight: 1.6, margin: 0 }}>{item.description}</p>
        )}

        {item.why_it_matters && (
          <div style={{ marginTop: 16, padding: "0.9rem 1.1rem", background: BLUE_TINT, borderRadius: 12, borderLeft: `3px solid ${BLUE}` }}>
            <p style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: BLUE, marginBottom: 5 }}>Why it matters</p>
            <p style={{ fontFamily: FONT, fontSize: "0.92rem", color: TEXT_MID, lineHeight: 1.55, margin: 0 }}>{item.why_it_matters}</p>
          </div>
        )}

        {item.status === "completed" && item.completed_at && (
          <p style={{ marginTop: 16, fontFamily: FONT, fontSize: "0.85rem", color: GREEN, fontWeight: 600 }}>
            Completed {new Date(item.completed_at).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
          </p>
        )}
      </motion.div>
    </motion.div>
  );
}

// ─── Trash drop zone ──────────────────────────────────────────────────────────
function TrashZone({ visible, isOver, onDragOver, onDragLeave, onDrop }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          onDragOver={e => { e.preventDefault(); onDragOver(); }}
          onDragLeave={onDragLeave}
          onDrop={e => { e.preventDefault(); onDrop(); }}
          style={{
            position: "fixed",
            bottom: 28,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 200,
            padding: isOver ? "13px 44px" : "11px 36px",
            background: isOver ? RED_SOFT : "rgba(255,255,255,0.96)",
            border: `2px ${isOver ? "solid" : "dashed"} ${isOver ? RED : "#d1d5db"}`,
            borderRadius: 100,
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            boxShadow: isOver
              ? "0 8px 36px rgba(220,38,38,0.22)"
              : "0 4px 24px rgba(0,0,0,0.09)",
            display: "flex", alignItems: "center", gap: 9,
            transition: "all 0.15s ease",
            pointerEvents: "all",
          }}
        >
          <motion.span
            animate={{ scale: isOver ? 1.3 : 1 }}
            transition={{ duration: 0.15 }}
            style={{ lineHeight: 1, color: isOver ? RED : TEXT_MUTED, display: "inline-flex" }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
            </svg>
          </motion.span>
          <span style={{
            fontFamily: FONT, fontSize: 13, fontWeight: 700,
            color: isOver ? RED : TEXT_MUTED,
            whiteSpace: "nowrap",
            transition: "color 0.15s",
          }}>
            {isOver ? "Release to dismiss" : "Drop here to dismiss"}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Count picker popover ─────────────────────────────────────────────────────
function CountPicker({ onSelect, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.88, y: -6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.88, y: -6 }}
      transition={{ duration: 0.14 }}
      style={{
        position: "absolute", top: "calc(100% + 7px)", right: 0,
        background: WHITE, border: `1px solid ${BORDER}`,
        borderRadius: 14, padding: "10px 10px 8px",
        boxShadow: "0 6px 24px rgba(0,0,0,0.1)",
        zIndex: 60,
      }}
    >
      <div style={{
        fontFamily: FONT, fontSize: 11, fontWeight: 600,
        color: TEXT_FAINT, marginBottom: 8, whiteSpace: "nowrap",
      }}>
        How many quests?
      </div>
      <div style={{ display: "flex", gap: 5 }}>
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            onClick={() => onSelect(n)}
            style={{
              width: 32, height: 32,
              fontFamily: FONT, fontWeight: 700, fontSize: 14,
              color: BLUE, background: BLUE_TINT,
              border: `1.5px solid ${BLUE_SOFT}`, borderRadius: 8,
              cursor: "pointer", transition: "all 0.12s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = BLUE; e.currentTarget.style.color = WHITE; e.currentTarget.style.borderColor = BLUE; }}
            onMouseLeave={e => { e.currentTarget.style.background = BLUE_TINT; e.currentTarget.style.color = BLUE; e.currentTarget.style.borderColor = BLUE_SOFT; }}
          >
            {n}
          </button>
        ))}
      </div>
    </motion.div>
  );
}

// ─── QuestPage ────────────────────────────────────────────────────────────────
export default function QuestPage({ navigate }) {
  const isMobile = useIsMobile();
  const [userId, setUserId]           = useState(getKnownUserId);
  const [items, setItems]             = useState(() => getCache(`quest_items:${getKnownUserId()}`) || []);
  const [loading, setLoading]         = useState(() => !getCache(`quest_items:${getKnownUserId()}`));
  const [generating, setGenerating]   = useState(() => getQuestGenerating(getKnownUserId()));
  const [draggingId, setDraggingId]   = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);
  const [dragOverTrash, setDragOverTrash] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [showPicker, setShowPicker]   = useState(false);
  const [mobileTab, setMobileTab]     = useState("suggested");
  const [dismissingId, setDismissingId] = useState(null);
  const [questGenUsed, setQuestGenUsed] = useState(0);
  const [limitModal, setLimitModal]     = useState(false);
  const [scoreToast, setScoreToast]     = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const scoreToastTimer = useRef(null);
  const userIdRef = useRef(null);

  // ── Data loading ────────────────────────────────────────────────────────────
  const loadItems = useCallback(async (uid) => {
    const { data } = await supabase
      .from("quest_items")
      .select("*")
      .eq("user_id", uid)
      .neq("status", "deleted")
      .order("created_at", { ascending: true });
    if (data) {
      const normalized = data.map(i => i.status === "active" ? { ...i, status: "in_progress" } : i);
      setItems(normalized);
      setCache(`quest_items:${uid}`, normalized);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/auth"; return; }
      if (cancelled) return;
      setUserId(user.id);
      setKnownUserId(user.id);
      userIdRef.current = user.id;

      await loadItems(user.id);
      fetchUsage(supabase).then((u) => setQuestGenUsed(u.quest_generations_used));
      if (!cancelled) setLoading(false);

      // If a generation was still running when we left, keep showing the
      // spinner and reload items when it finishes (it persists server-side).
      if (getQuestGenerating(user.id)) {
        setGenerating(true);
        const started = Date.now();
        const poll = setInterval(async () => {
          if (!getQuestGenerating(user.id) || Date.now() - started > 90_000) {
            clearInterval(poll);
            if (cancelled) return;
            setGenerating(false);
            await loadItems(user.id);
            fetchUsage(supabase).then((u) => setQuestGenUsed(u.quest_generations_used));
          }
        }, 1500);
      }
    })();
    return () => { cancelled = true; };
  }, [loadItems]);

  // ── Generate ────────────────────────────────────────────────────────────────
  const handleGenerate = useCallback(async (count = 3) => {
    if (!userIdRef.current || generating) return;
    setGenerating(true);
    setQuestGenerating(userIdRef.current, true);  // survives navigation away mid-gen
    setShowPicker(false);
    try {
      // Route through LangGraph FastAPI
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${LANGGRAPH_URL}/quests/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session?.access_token}` },
        body: JSON.stringify({ count }),
      });
      if (res.status === 429) { setLimitModal(true); setQuestGenUsed(LIMITS.quest_gen); return; }
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.detail || "Quest generation failed"); }
      await loadItems(userIdRef.current);
      setQuestGenUsed((prev) => Math.min(prev + 1, LIMITS.quest_gen));
    } catch (e) {
      console.error("[Quest] generate error:", e);
    } finally {
      setGenerating(false);
      setQuestGenerating(userIdRef.current, false);
    }
  }, [generating, loadItems]);

  // ── Move / dismiss ──────────────────────────────────────────────────────────
  const handleMove = useCallback(async (itemId, newStatus) => {
    if (newStatus === "deleted") {
      setDismissingId(itemId);
      await new Promise(r => setTimeout(r, 320));
      setItems(prev => prev.filter(i => i.id !== itemId));
      setDismissingId(null);
      supabase.functions.invoke("update-quest-item", { body: { itemId, action: "delete" } })
        .catch(console.error);
      return;
    }

    if (newStatus === "completed") {
      setCelebrating(true);
      setTimeout(() => setCelebrating(false), 2800);
    }

    const now = new Date().toISOString();
    setItems(prev => prev.map(i =>
      i.id !== itemId ? i : {
        ...i, status: newStatus,
        completed_at: newStatus === "completed" ? now : i.completed_at,
      }
    ));

    const { data: resp, error: moveErr } = await supabase.functions.invoke("update-quest-item", {
      body: { itemId, action: newStatus === "completed" ? "complete" : "move", status: newStatus },
    });
    if (moveErr) {
      console.error("[Quest] move error:", moveErr);
      if (userIdRef.current) await loadItems(userIdRef.current);
      return;
    }
    // Surface the score gain when a quest is completed (with an undo window).
    if (newStatus === "completed" && resp?.award?.delta > 0) {
      setScoreToast({ itemId, axis: resp.award.axis, delta: resp.award.delta });
      if (scoreToastTimer.current) clearTimeout(scoreToastTimer.current);
      scoreToastTimer.current = setTimeout(() => setScoreToast(null), 6500);
    }
  }, [loadItems]);

  const handleUndo = useCallback(async (toast) => {
    if (!toast) return;
    if (scoreToastTimer.current) clearTimeout(scoreToastTimer.current);
    setScoreToast(null);
    // Optimistically move the card back to In Progress.
    setItems(prev => prev.map(i => i.id !== toast.itemId ? i : { ...i, status: "in_progress", completed_at: null }));
    const { error } = await supabase.functions.invoke("update-quest-item", {
      body: { itemId: toast.itemId, action: "uncomplete", axis: toast.axis, delta: toast.delta },
    });
    if (error) {
      console.error("[Quest] undo error:", error);
      if (userIdRef.current) await loadItems(userIdRef.current);
    }
  }, [loadItems]);

  // ── Drag handlers ───────────────────────────────────────────────────────────
  const handleDragStart = useCallback((itemId) => setDraggingId(itemId), []);

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
    setDragOverCol(null);
    setDragOverTrash(false);
  }, []);

  const handleColDrop = useCallback((targetStatus) => {
    if (!draggingId) return;
    const item = items.find(i => i.id === draggingId);
    if (item && item.status !== targetStatus) handleMove(draggingId, targetStatus);
    setDraggingId(null);
    setDragOverCol(null);
  }, [draggingId, items, handleMove]);

  const handleTrashDrop = useCallback(() => {
    if (!draggingId) return;
    handleMove(draggingId, "deleted");
    setDraggingId(null);
    setDragOverTrash(false);
  }, [draggingId, handleMove]);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const colItems = (status) => items.filter(i => i.status === status);

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{
        minHeight: "100vh", background: BG,
        paddingLeft: isMobile ? 0 : SIDEBAR_WIDTH,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <GlobalStyles />
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
          style={{ width: 34, height: 34, borderRadius: "50%", border: `3px solid ${BLUE_SOFT}`, borderTopColor: BLUE }}
        />
      </div>
    );
  }

  // Floating "+N Axis" gain toast, shown on quest completion (both layouts).
  const scoreToastEl = (
    <AnimatePresence>
      {scoreToast && (
        <motion.div
          initial={{ opacity: 0, y: 18, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.95 }}
          transition={{ type: "spring", stiffness: 360, damping: 24 }}
          style={{
            position: "fixed",
            bottom: isMobile ? "calc(72px + env(safe-area-inset-bottom, 0px))" : 24,
            right: isMobile ? 12 : 24, zIndex: 9999,
            display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
            maxWidth: "calc(100vw - 24px)",
            background: "#141413", color: "#fff", padding: "12px 18px", borderRadius: 14,
            boxShadow: "0 14px 36px rgba(0,0,0,0.3)", fontFamily: FONT,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#34d399" stroke="none" style={{ flexShrink: 0 }}>
            <path d="M13 2L4.5 13.5H11l-1 8.5L19.5 10H13l1-8z"/>
          </svg>
          <span style={{ fontWeight: 700, fontSize: "1.1rem", color: "#34d399" }}>+{scoreToast.delta}</span>
          <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>{AXIS_LABELS[scoreToast.axis] || scoreToast.axis}</span>
          <button onClick={() => handleUndo(scoreToast)}
            style={{ marginLeft: 4, background: "transparent", border: "1px solid rgba(255,255,255,0.3)", color: "#fff", fontFamily: FONT, fontWeight: 700, fontSize: 12, padding: "4px 10px", borderRadius: 8, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
            Undo
          </button>
          <button onClick={() => navigate("/scorecard")}
            style={{ background: "rgba(255,255,255,0.16)", border: "none", color: "#fff", fontFamily: FONT, fontWeight: 700, fontSize: 12, padding: "4px 10px", borderRadius: 8, cursor: "pointer" }}>
            Scorecard →
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );

  // Quest detail modal (shared by both layouts).
  const detailModalEl = (
    <AnimatePresence>
      {selectedItem && <QuestDetailModal item={selectedItem} onClose={() => setSelectedItem(null)} />}
    </AnimatePresence>
  );

  // ── Mobile layout ──────────────────────────────────────────────────────────
  if (isMobile) {
    const activeCol = COLUMNS.find(c => c.status === mobileTab) || COLUMNS[0];
    const tabItems  = colItems(mobileTab);

    return (
      <div style={{ minHeight: "100vh", background: BG, paddingBottom: 100 }}>
        <GlobalStyles />

        {/* Sticky header + tabs */}
        <div style={{
          position: "sticky", top: 0, zIndex: 20,
          background: "rgba(250,249,245,0.93)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          borderBottom: `1px solid rgba(29,78,216,0.08)`,
        }}>
          <div style={{ padding: "16px 16px 0" }}>
            <h1 style={{
              fontFamily: FONT, fontWeight: 700, fontSize: 26,
              margin: "0 0 14px", letterSpacing: "-0.02em", color: TEXT,
            }}>
              Quest
            </h1>
          </div>
          <div style={{ display: "flex", overflowX: "auto", padding: "0 16px", marginBottom: -1, gap: 0 }}>
            {COLUMNS.map(col => {
              const isActive = mobileTab === col.status;
              const cnt = colItems(col.status).length;
              return (
                <button
                  key={col.status}
                  onClick={() => setMobileTab(col.status)}
                  style={{
                    fontFamily: FONT, fontWeight: 700, fontSize: 13,
                    color: isActive ? col.accent : TEXT_FAINT,
                    background: "none", border: "none",
                    borderBottom: `2px solid ${isActive ? col.accent : "transparent"}`,
                    padding: "8px 14px 10px",
                    cursor: "pointer", whiteSpace: "nowrap",
                    display: "flex", alignItems: "center", gap: 5,
                    transition: "color 0.15s, border-color 0.15s",
                  }}
                >
                  {col.label}
                  {cnt > 0 && (
                    <span style={{
                      background: isActive ? col.soft : BORDER,
                      color: isActive ? col.accent : TEXT_FAINT,
                      borderRadius: 5, padding: "1px 5px", fontSize: 10,
                      fontWeight: 700, transition: "all 0.15s",
                    }}>
                      {cnt}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ padding: "16px 16px" }}>
          {/* Generate button for Suggestions tab */}
          {mobileTab === "suggested" && (
            <div style={{ marginBottom: 14 }}>
              <button
                onClick={() => questGenUsed >= LIMITS.quest_gen ? setLimitModal(true) : setShowPicker(v => !v)}
                disabled={generating}
                style={{
                  width: "100%", fontFamily: FONT, fontSize: 14, fontWeight: 700,
                  color: WHITE, background: generating ? BLUE_MID : `linear-gradient(135deg, ${BLUE}, ${BLUE_MID})`,
                  border: "none", borderRadius: 12, padding: "13px 16px",
                  cursor: generating ? "default" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                  opacity: generating ? 0.8 : 1,
                  boxShadow: "0 3px 14px rgba(29,78,216,0.2)",
                  transition: "opacity 0.15s",
                }}
              >
                {generating ? (
                  <>
                    <span style={{
                      width: 13, height: 13, borderRadius: "50%",
                      border: "2px solid rgba(255,255,255,0.3)", borderTopColor: WHITE,
                      animation: "quest-spin 0.7s linear infinite", display: "inline-block",
                    }} />
                    Generating quests…
                  </>
                ) : (
                  <>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    Generate more quests
                  </>
                )}
              </button>
              <AnimatePresence>
                {showPicker && !generating && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.15 }}
                    style={{
                      marginTop: 8, background: WHITE,
                      border: `1px solid ${BORDER}`, borderRadius: 14,
                      padding: "12px 14px",
                      boxShadow: "0 4px 16px rgba(0,0,0,0.07)",
                    }}
                  >
                    <div style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, color: TEXT_MUTED, marginBottom: 10 }}>
                      How many quests?
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      {[1, 2, 3, 4, 5].map(n => (
                        <button
                          key={n}
                          onClick={() => handleGenerate(n)}
                          style={{
                            flex: 1, height: 44, fontFamily: FONT, fontWeight: 700, fontSize: 16,
                            color: BLUE, background: BLUE_TINT,
                            border: `1.5px solid ${BLUE_SOFT}`, borderRadius: 10, cursor: "pointer",
                          }}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              {(() => {
                const left = Math.max(0, LIMITS.quest_gen - questGenUsed);
                return (
                  <div style={{ textAlign: "center", marginTop: 6 }}>
                    <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 600,
                      color: left === 0 ? "#dc2626" : "#9ca3af" }}>
                      {left === 0 ? "No generations remaining" : `${left} generation${left === 1 ? "" : "s"} remaining`}
                    </span>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Generating skeletons */}
          {generating && mobileTab === "suggested" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[0, 0.2, 0.4].map((d, i) => <SkeletonCard key={i} delay={d} />)}
            </div>
          )}

          {/* Cards */}
          <AnimatePresence mode="popLayout">
            {tabItems.map(item => (
              <motion.div key={item.id} layout style={{ marginBottom: 10 }}>
                <QuestCard
                  item={item}
                  isDragging={false}
                  onDragStart={() => {}}
                  onDragEnd={() => {}}
                  isMobile={true}
                  onMove={handleMove}
                  isDismissing={dismissingId === item.id}
                  onOpen={setSelectedItem}
                />
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Empty state */}
          {tabItems.length === 0 && !generating && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              style={{ padding: "48px 24px", textAlign: "center" }}
            >
              <div style={{
                width: 52, height: 52, borderRadius: 14,
                background: activeCol.soft,
                margin: "0 auto 14px",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <div style={{ width: 16, height: 16, borderRadius: "50%", background: `${activeCol.accent}35` }} />
              </div>
              <p style={{ fontFamily: FONT, fontSize: 15.5, fontWeight: 500, color: TEXT_MUTED, lineHeight: 1.6, margin: "0 auto", maxWidth: 280 }}>
                {activeCol.emptyText}
              </p>
            </motion.div>
          )}
        </div>

        {celebrating && <Confetti />}
        {scoreToastEl}
        {detailModalEl}
      </div>
    );
  }

  // ── Desktop Kanban ──────────────────────────────────────────────────────────
  return (
    <div style={{
      height: "100vh",
      background: BG,
      backgroundImage: "radial-gradient(circle, rgba(29,78,216,0.055) 1px, transparent 1px)",
      backgroundSize: "28px 28px",
      paddingLeft: SIDEBAR_WIDTH,
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    }}>
      <GlobalStyles />

      {/* Page header */}
      <div style={{
        padding: "16px 24px 13px",
        borderBottom: `1px solid rgba(29,78,216,0.07)`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexShrink: 0,
        background: "rgba(250,249,245,0.85)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
      }}>
        <h1 style={{
          fontFamily: FONT, fontWeight: 700, fontSize: 28, margin: 0,
          letterSpacing: "-0.02em", color: TEXT,
        }}>
          Quest
        </h1>
        <span style={{ fontFamily: FONT, fontSize: 12, color: TEXT_FAINT }}>
          {items.filter(i => i.status !== "completed").length} active
          {" · "}
          {items.filter(i => i.status === "completed").length} completed
        </span>
      </div>

      {/* Kanban columns */}
      <div style={{
        flex: 1, display: "flex",
        overflow: "hidden",
        borderTop: `1px solid ${BORDER}`,
      }}>
        {COLUMNS.map((col, idx) => {
          const cards    = colItems(col.status);
          const isOver   = dragOverCol === col.status;
          const isSugg   = col.status === "suggested";
          const isLast   = idx === COLUMNS.length - 1;

          return (
            <div
              key={col.status}
              onDragOver={e => { e.preventDefault(); setDragOverCol(col.status); }}
              onDragLeave={(e) => {
                // Only clear if leaving the column entirely
                if (!e.currentTarget.contains(e.relatedTarget)) setDragOverCol(null);
              }}
              onDrop={e => { e.preventDefault(); handleColDrop(col.status); }}
              style={{
                flex: 1,
                minWidth: 200,
                display: "flex",
                flexDirection: "column",
                borderRight: isLast ? "none" : `1px solid ${BORDER}`,
                background: isOver ? col.soft : "transparent",
                transition: "background 0.14s",
                overflow: "hidden",
              }}
            >
              {/* Column header */}
              <div style={{
                padding: "13px 14px 10px",
                borderBottom: `2px solid ${isOver ? col.border : BORDER}`,
                transition: "border-color 0.14s",
                flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "space-between",
                minHeight: 50,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <div style={{ width: 9, height: 9, borderRadius: "50%", background: col.accent }} />
                  <span style={{
                    fontFamily: FONT, fontWeight: 700, fontSize: 13,
                    color: TEXT, letterSpacing: "0.05em", textTransform: "uppercase",
                  }}>
                    {col.label}
                  </span>
                  <span style={{
                    fontFamily: FONT, fontWeight: 700, fontSize: 11,
                    color: col.accent, background: col.soft,
                    borderRadius: 5, padding: "1px 7px",
                  }}>
                    {cards.length}
                  </span>
                </div>

                {/* Generate button (Suggestions only) */}
                {isSugg && (
                  <div style={{ position: "relative" }}>
                    <button
                      onClick={() => questGenUsed >= LIMITS.quest_gen ? setLimitModal(true) : setShowPicker(v => !v)}
                      disabled={generating}
                      style={{
                        fontFamily: FONT, fontSize: 11, fontWeight: 700,
                        color: WHITE,
                        background: generating ? "#93c5fd" : BLUE,
                        border: "none", borderRadius: 7,
                        padding: "4px 9px",
                        cursor: generating ? "default" : "pointer",
                        display: "flex", alignItems: "center", gap: 3,
                        opacity: generating ? 0.8 : 1,
                        transition: "opacity 0.15s",
                      }}
                    >
                      {generating ? (
                        <span style={{
                          width: 9, height: 9, borderRadius: "50%",
                          border: "1.5px solid rgba(255,255,255,0.35)", borderTopColor: WHITE,
                          animation: "quest-spin 0.7s linear infinite", display: "inline-block",
                        }} />
                      ) : (
                        <>
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                          </svg>
                          Generate
                        </>
                      )}
                    </button>
                    <AnimatePresence>
                      {showPicker && !generating && (
                        <CountPicker
                          onSelect={handleGenerate}
                          onClose={() => setShowPicker(false)}
                        />
                      )}
                    </AnimatePresence>
                  </div>
                )}
                {isSugg && (() => {
                  const left = Math.max(0, LIMITS.quest_gen - questGenUsed);
                  return (
                    <span style={{ fontFamily: FONT, fontSize: 10, fontWeight: 600,
                      color: left === 0 ? "#dc2626" : "#9ca3af", whiteSpace: "nowrap" }}>
                      {left === 0 ? "No generations left" : `${left} left`}
                    </span>
                  );
                })()}
              </div>

              {/* Cards list */}
              <div style={{
                flex: 1, overflowY: "auto",
                padding: "10px 10px 16px",
                display: "flex", flexDirection: "column", gap: 8,
              }}>
                <AnimatePresence mode="popLayout">
                  {cards.map(item => (
                    <QuestCard
                      key={item.id}
                      item={item}
                      isDragging={draggingId === item.id}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      isMobile={false}
                      onMove={handleMove}
                      isDismissing={dismissingId === item.id}
                      onOpen={setSelectedItem}
                    />
                  ))}
                </AnimatePresence>

                {/* Generating skeletons */}
                {generating && isSugg && (
                  <>
                    {[0, 0.2, 0.4].map((d, i) => <SkeletonCard key={i} delay={d} />)}
                  </>
                )}

                {/* Empty state */}
                {cards.length === 0 && !(generating && isSugg) && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    style={{
                      flex: 1, display: "flex", flexDirection: "column",
                      alignItems: "center", justifyContent: "center",
                      padding: "28px 14px", textAlign: "center",
                    }}
                  >
                    <div style={{
                      width: 46, height: 46, borderRadius: 12,
                      background: col.soft,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      marginBottom: 14,
                    }}>
                      <div style={{ width: 16, height: 16, borderRadius: "50%", background: `${col.accent}45` }} />
                    </div>
                    <p style={{
                      fontFamily: FONT, fontSize: 14.5, fontWeight: 500, color: TEXT_MUTED,
                      lineHeight: 1.55, margin: 0, maxWidth: 200,
                    }}>
                      {col.emptyText}
                    </p>
                  </motion.div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Trash zone */}
      <TrashZone
        visible={!!draggingId}
        isOver={dragOverTrash}
        onDragOver={() => setDragOverTrash(true)}
        onDragLeave={() => setDragOverTrash(false)}
        onDrop={handleTrashDrop}
      />

      {celebrating && <Confetti />}
      {scoreToastEl}
      {detailModalEl}
      {limitModal && <LimitModal feature="quest_gen" onClose={() => setLimitModal(false)} />}
    </div>
  );
}

// ─── Global styles ────────────────────────────────────────────────────────────
function GlobalStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Raleway:wght@400;500;600;700&display=swap');
      @keyframes quest-spin { to { transform: rotate(360deg); } }
      @keyframes quest-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
      * { box-sizing: border-box; }
    `}</style>
  );
}
