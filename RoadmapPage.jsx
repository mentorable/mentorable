import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "./lib/supabase.js";
import { SIDEBAR_WIDTH } from "./components/common/Sidebar.jsx";
import { useIsMobile } from "./hooks/useIsMobile.js";

// ─── Design tokens ────────────────────────────────────────────────────────────
const BG        = "#faf9f5";
const WHITE     = "#ffffff";
const BLUE      = "#1d4ed8";
const BLUE_MID  = "#3b82f6";
const BLUE_SOFT = "#dbeafe";
const BLUE_TINT = "#f0f5ff";
const GREEN     = "#059669";
const GREEN_SOFT= "#d1fae5";
const AMBER     = "#d97706";
const AMBER_SOFT= "#fef3c7";
const RED_SOFT  = "#fee2e2";
const RED       = "#dc2626";
const TEXT      = "#141413";
const TEXT_MID  = "#3d3d3a";
const TEXT_MUTED= "#6c6a64";
const TEXT_FAINT= "#8e8b82";
const BORDER    = "#e6dfd8";
const BORDER_MID= "#d4ccbf";
const FONT      = "'Inter', -apple-system, sans-serif";
const BODY      = "'Inter', -apple-system, sans-serif";
const SERIF     = "'Cormorant Garamond', Georgia, serif";

const TASK_TYPE_ICONS = {
  video:    "▶",
  reading:  "📖",
  project:  "🔨",
  pencil:   "✍",
  reflect:  "✍",
  research: "🔍",
  default:  "✦",
};

function taskIcon(title = "") {
  const t = title.toLowerCase();
  if (t.startsWith("watch") || t.includes("video"))   return TASK_TYPE_ICONS.video;
  if (t.startsWith("read") || t.includes("article"))  return TASK_TYPE_ICONS.reading;
  if (t.startsWith("build") || t.includes("project")) return TASK_TYPE_ICONS.project;
  if (t.startsWith("reflect") || t.startsWith("write") || t.includes("journal")) return TASK_TYPE_ICONS.pencil;
  if (t.startsWith("research") || t.startsWith("find") || t.includes("search")) return TASK_TYPE_ICONS.research;
  return TASK_TYPE_ICONS.default;
}

// ─── Animated XP counter ─────────────────────────────────────────────────────
function XPCounter({ value }) {
  const [displayed, setDisplayed] = useState(value);
  const prev = useRef(value);

  useEffect(() => {
    if (value === prev.current) return;
    const diff = value - prev.current;
    const steps = Math.abs(diff);
    const dir = diff > 0 ? 1 : -1;
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setDisplayed(prev.current + dir * i);
      if (i >= steps) {
        clearInterval(interval);
        prev.current = value;
      }
    }, 40);
    return () => clearInterval(interval);
  }, [value]);

  return <span>{displayed}</span>;
}

// ─── Circular progress ring ───────────────────────────────────────────────────
function ProgressRing({ value, max, size = 48, stroke = 4, color = BLUE, trackColor }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={trackColor || BORDER} strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ}
        strokeDashoffset={circ * (1 - pct)}
        strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.6s cubic-bezier(0.34,1.56,0.64,1)" }}
      />
    </svg>
  );
}

// ─── Animated checkbox ────────────────────────────────────────────────────────
function TaskCheckbox({ done, flagged, loading, onComplete, onFlag }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
      <motion.button
        whileTap={{ scale: 0.85 }}
        transition={{ type: "spring", stiffness: 400, damping: 17 }}
        onClick={onComplete}
        disabled={loading || done || flagged}
        style={{
          width: 26, height: 26,
          borderRadius: 8,
          border: `2px solid ${done ? BLUE : flagged ? AMBER : BORDER_MID}`,
          background: done ? BLUE : flagged ? AMBER_SOFT : WHITE,
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: done || flagged ? "default" : "pointer",
          flexShrink: 0,
          transition: "all 0.18s ease",
        }}
      >
        <AnimatePresence>
          {done && (
            <motion.svg
              key="check"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 20 }}
              width="13" height="13" viewBox="0 0 13 13" fill="none"
            >
              <path d="M2 6.5L5.2 9.5L11 3.5" stroke={WHITE} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </motion.svg>
          )}
          {flagged && !done && (
            <motion.span
              key="flag"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              style={{ fontSize: 12 }}
            >🚩</motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  );
}

// ─── Individual task row ──────────────────────────────────────────────────────
function TaskRow({ task, onAction, actioningId }) {
  const [expanded, setExpanded] = useState(false);
  const loading = actioningId === task.id;
  const done    = task.status === "completed";
  const flagged = task.status === "skipped" || task.not_for_me;
  const inactive = done || flagged;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      style={{
        background: done ? BLUE_TINT : flagged ? "#fffbeb" : WHITE,
        borderRadius: 16,
        border: `1px solid ${done ? BLUE_SOFT : flagged ? "#fde68a" : BORDER}`,
        borderLeft: done ? `3px solid ${BLUE}` : flagged ? `3px solid ${AMBER}` : `3px solid transparent`,
        padding: "16px 18px",
        opacity: inactive ? 0.75 : 1,
        transition: "background 0.2s, border 0.2s, opacity 0.2s, box-shadow 0.2s",
        boxShadow: done ? "0 0 0 0 transparent, 0 1px 6px rgba(29,78,216,0.06)" : "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        {/* Checkbox */}
        <TaskCheckbox
          done={done} flagged={flagged} loading={loading}
          onComplete={() => !inactive && onAction(task.id, "complete")}
          onFlag={() => !inactive && onAction(task.id, "flag")}
        />

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <button
            onClick={() => setExpanded(e => !e)}
            style={{
              background: "none", border: "none", padding: 0,
              cursor: "pointer", textAlign: "left", width: "100%",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, opacity: 0.55 }}>{taskIcon(task.title)}</span>
              <span style={{
                fontFamily: FONT, fontWeight: 700, fontSize:  16,
                color: done ? TEXT_MUTED : TEXT,
                textDecoration: inactive ? "line-through" : "none",
                lineHeight: 1.3,
              }}>
                {task.title}
              </span>
            </div>
          </button>

          <AnimatePresence>
            {expanded && task.description && (
              <motion.p
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                style={{
                  margin: "6px 0 0",
                  fontFamily: BODY, fontSize:  15, color: TEXT_MID,
                  lineHeight: 1.6, overflow: "hidden",
                }}
              >
                {task.description}
              </motion.p>
            )}
          </AnimatePresence>

          {task.resource_url && (
            <a
              href={task.resource_url}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                marginTop: 6,
                fontFamily: FONT, fontSize: 12, fontWeight: 600,
                color: BLUE_MID,
                textDecoration: "none",
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
              {task.resource_label || "Open resource"}
            </a>
          )}
        </div>

        {/* Right side badges + flag */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
          {task.estimated_time && (
            <span style={{
              fontFamily: FONT, fontSize: 11, fontWeight: 700,
              color: TEXT_FAINT, letterSpacing: "0.03em",
              background: "#faf9f5", borderRadius: 6,
              padding: "2px 7px", border: `1px solid ${BORDER}`,
            }}>
              {task.estimated_time}
            </span>
          )}
          {!inactive && (
            <motion.button
              whileTap={{ scale: 0.85 }}
              onClick={() => onAction(task.id, "flag")}
              disabled={loading}
              title="Not for me"
              style={{
                width: 26, height: 26, borderRadius: 7,
                border: `1px solid ${BORDER}`,
                background: "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", fontSize: 12,
                color: TEXT_FAINT,
              }}
            >
              🚩
            </motion.button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Phase card ───────────────────────────────────────────────────────────────
function PhaseCard({ phase, isActive, isCompleted, isLocked, onAction, actioningId, onGenerateNext, generatingPhase }) {
  const [open, setOpen] = useState(isActive);

  const tasks = Array.isArray(phase.tasks) ? phase.tasks : [];
  const weeks = [...new Set(tasks.map(t => t.week_number))].sort((a, b) => a - b);
  const doneTasks = tasks.filter(t => t.status === "completed" || t.status === "skipped").length;
  const totalTasks = tasks.length;
  const allDone = totalTasks > 0 && doneTasks === totalTasks;

  const borderColor = isCompleted ? GREEN : isActive ? BLUE : BORDER;
  const headerBg    = isCompleted ? GREEN_SOFT : isActive ? BLUE_SOFT : "#faf9f5";
  const headerColor = isCompleted ? GREEN : isActive ? BLUE : TEXT_FAINT;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      style={{
        background: isLocked ? "#f5f7fa" : WHITE,
        borderRadius: 20,
        border: isActive
          ? `1px solid rgba(29,78,216,0.2)`
          : isCompleted
          ? `1px solid rgba(5,150,105,0.2)`
          : `1px solid rgba(15,23,42,0.07)`,
        borderLeft: `4px solid ${borderColor}`,
        overflow: "hidden",
        boxShadow: isActive
          ? "0 0 0 1px rgba(29,78,216,0.06), 0 8px 40px rgba(29,78,216,0.12), 0 2px 8px rgba(29,78,216,0.08)"
          : isCompleted
          ? "0 4px 20px rgba(5,150,105,0.08), 0 1px 4px rgba(5,150,105,0.05)"
          : "0 1px 4px rgba(15,23,42,0.04)",
        transition: "box-shadow 0.25s, border-color 0.25s",
      }}
    >
      {/* Phase header */}
      <button
        onClick={() => !isLocked && setOpen(o => !o)}
        style={{
          width: "100%", border: "none", cursor: isLocked ? "default" : "pointer",
          background: headerBg, padding: "18px 22px",
          display: "flex", alignItems: "center", gap: 12,
          textAlign: "left",
        }}
      >
        {/* Icon / lock */}
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: isCompleted ? GREEN : isActive ? BLUE : "#e6dfd8",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
          boxShadow: isActive
            ? "0 0 0 3px rgba(29,78,216,0.15), 0 4px 14px rgba(29,78,216,0.3)"
            : isCompleted
            ? "0 0 0 3px rgba(5,150,105,0.15), 0 4px 14px rgba(5,150,105,0.25)"
            : "none",
        }}>
          {isLocked
            ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={TEXT_FAINT} strokeWidth="2.2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            : isCompleted
              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={WHITE} strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>
              : <span style={{ fontFamily: FONT, fontWeight: 800, fontSize: 14, color: WHITE }}>{phase.phase_number}</span>
          }
        </div>

        {/* Title + meta */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontFamily: FONT, fontWeight: 800, fontSize:  18, color: isLocked ? TEXT_FAINT : TEXT }}>
              {isLocked ? `Phase ${phase.phase_number}` : phase.title}
            </span>
            <span style={{
              fontFamily: FONT, fontSize: 10, fontWeight: 700,
              letterSpacing: "0.08em", textTransform: "uppercase",
              color: headerColor,
              background: isCompleted ? "#bbf7d0" : isActive ? BLUE_SOFT : "#f5f0e8",
              borderRadius: 6, padding: "2px 7px",
            }}>
              {isLocked ? "Locked" : isCompleted ? "Done" : "Active"}
            </span>
          </div>
          {!isLocked && phase.focus && (
            <p style={{ margin: "3px 0 0", fontFamily: BODY, fontSize:  15, color: TEXT_MUTED, lineHeight: 1.4 }}>
              {phase.focus}
            </p>
          )}
          {isLocked && (
            <p style={{ margin: "3px 0 0", fontFamily: BODY, fontSize:  15, color: TEXT_FAINT }}>
              Complete Phase {phase.phase_number - 1} to unlock
            </p>
          )}
        </div>

        {/* Progress ring + chevron */}
        {!isLocked && totalTasks > 0 && (
          <div style={{ position: "relative", flexShrink: 0 }}>
            <ProgressRing value={doneTasks} max={totalTasks} color={isCompleted ? GREEN : BLUE} />
            <span style={{
              position: "absolute", inset: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: FONT, fontSize: 10, fontWeight: 800,
              color: isCompleted ? GREEN : BLUE,
            }}>
              {Math.round((doneTasks / totalTasks) * 100)}%
            </span>
          </div>
        )}

        {!isLocked && (
          <svg
            width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={TEXT_MUTED}
            strokeWidth="2" strokeLinecap="round"
            style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}
          >
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        )}
      </button>

      {/* Phase body */}
      <AnimatePresence initial={false}>
        {open && !isLocked && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            style={{ overflow: "hidden" }}
          >
            <div style={{ padding: "4px 18px 18px" }}>
              {weeks.map(weekNum => {
                const weekTasks = tasks
                  .filter(t => t.week_number === weekNum)
                  .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
                return (
                  <div key={weekNum} style={{ marginTop: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      <span style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: BLUE, opacity: 0.7 }}>
                        Week {weekNum}
                      </span>
                      <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, rgba(29,78,216,0.2), transparent)` }} />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {weekTasks.map(task => (
                        <TaskRow
                          key={task.id}
                          task={task}
                          onAction={onAction}
                          actioningId={actioningId}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}

              {/* Generate next phase CTA */}
              {isActive && allDone && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.96, y: 12 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ delay: 0.25, type: "spring", stiffness: 300, damping: 24 }}
                  style={{
                    marginTop: 20,
                    padding: "24px 24px",
                    borderRadius: 20,
                    background: "linear-gradient(135deg, #1d4ed8 0%, #2563eb 50%, #3b82f6 100%)",
                    border: "none",
                    display: "flex", flexDirection: "column", alignItems: "center",
                    gap: 10, textAlign: "center",
                    boxShadow: "0 8px 32px rgba(29,78,216,0.3)",
                  }}
                >
                  <motion.div
                    animate={{ rotate: [0, -10, 10, -10, 0] }}
                    transition={{ duration: 0.6, delay: 0.4 }}
                    style={{ fontSize: 32 }}
                  >🎉</motion.div>
                  <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 17, color: WHITE, letterSpacing: "-0.02em" }}>
                    Phase {phase.phase_number} complete!
                  </div>
                  <p style={{ fontFamily: BODY, fontSize: 13, color: "rgba(255,255,255,0.8)", margin: 0, lineHeight: 1.5, maxWidth: 280 }}>
                    You're building serious momentum. Ready for what's next?
                  </p>
                  <motion.button
                    whileHover={{ scale: 1.04, background: "#faf9f5" }}
                    whileTap={{ scale: 0.97 }}
                    onClick={onGenerateNext}
                    disabled={generatingPhase}
                    style={{
                      marginTop: 6,
                      padding: "13px 28px",
                      borderRadius: 12,
                      border: "none",
                      background: WHITE,
                      color: BLUE,
                      fontFamily: FONT, fontWeight: 800, fontSize: 14,
                      cursor: generatingPhase ? "default" : "pointer",
                      display: "flex", alignItems: "center", gap: 8,
                      boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
                      transition: "transform 0.15s",
                    }}
                  >
                    {generatingPhase ? (
                      <>
                        <span style={{ width: 14, height: 14, borderRadius: "50%", border: `2.5px solid rgba(29,78,216,0.2)`, borderTopColor: BLUE, animation: "quest-spin 0.7s linear infinite", display: "inline-block" }} />
                        Building Phase {phase.phase_number + 1}…
                      </>
                    ) : (
                      <>Unlock Phase {phase.phase_number + 1} →</>
                    )}
                  </motion.button>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Empty / loading state ────────────────────────────────────────────────────
const BOOT_STEPS = [
  "Scanning your profile…",
  "Pulling real career data from O*NET…",
  "Building your first phase…",
  "Personalising your weekly missions…",
];

const REGEN_STEPS = [
  "Reading your recent conversations…",
  "Analysing your research interests…",
  "Synthesising your current direction…",
  "Building your new Quest…",
];

function QuestBoot({ regenerating = false }) {
  const [step, setStep] = useState(0);
  const steps = regenerating ? REGEN_STEPS : BOOT_STEPS;

  useEffect(() => {
    setStep(0);
    const t = setInterval(() => setStep(s => Math.min(s + 1, steps.length - 1)), 1800);
    return () => clearInterval(t);
  }, [regenerating]);

  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", minHeight: "60vh", gap: 24, padding: "0 24px",
      background: "radial-gradient(ellipse at 50% 40%, rgba(29,78,216,0.08) 0%, transparent 70%)",
    }}>
      <div style={{ position: "relative", width: 64, height: 64 }}>
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "linear" }}
          style={{
            position: "absolute", inset: 0, borderRadius: "50%",
            border: `2px solid transparent`,
            borderTopColor: BLUE,
            borderRightColor: BLUE_SOFT,
          }}
        />
        <motion.div
          animate={{ scale: [1, 1.15, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          style={{
            position: "absolute", inset: 12, borderRadius: "50%",
            background: `linear-gradient(135deg, ${BLUE}, ${BLUE_MID})`,
            boxShadow: "0 0 20px rgba(29,78,216,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            {regenerating
              ? <><path d="M1 4v6h6"/><path d="M23 20v-6h-6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></>
              : <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            }
          </svg>
        </motion.div>
      </div>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 16, color: TEXT, letterSpacing: "-0.02em" }}>
          {regenerating ? "Rebuilding your Quest" : "Building your Quest"}
        </div>
        <AnimatePresence mode="wait">
          <motion.p
            key={step}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.3 }}
            style={{ fontFamily: BODY, fontSize: 13, color: TEXT_MUTED, margin: "6px 0 0" }}
          >
            {steps[step]}
          </motion.p>
        </AnimatePresence>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {steps.map((_, i) => (
          <div key={i} style={{
            width: i === step ? 20 : 6, height: 6,
            borderRadius: 99,
            background: i <= step ? BLUE : BORDER,
            transition: "all 0.3s ease",
          }} />
        ))}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function RoadmapPage({ navigate }) {
  const isMobile = useIsMobile();
  const [userId, setUserId]           = useState(null);
  const [roadmap, setRoadmap]         = useState(null);
  const [phases, setPhases]           = useState([]);
  const [loading, setLoading]         = useState(true);
  const [initializing, setInitializing] = useState(false);
  const [actioningId, setActioningId] = useState(null);
  const [generatingPhase, setGeneratingPhase] = useState(false);
  const [regenerating, setRegenerating]       = useState(false);
  const [regenConfirm, setRegenConfirm]       = useState(false);
  const [xp, setXp]                   = useState(0);
  const [xpPop, setXpPop]             = useState(null); // "+3 XP" toast

  const loadRoadmap = useCallback(async (uid) => {
    const { data } = await supabase
      .from("quests")
      .select(`
        *,
        phases:quest_phases(
          *,
          tasks:quest_tasks(*)
        )
      `)
      .eq("user_id", uid)
      .eq("is_active", true)
      .order("phase_number", { referencedTable: "quest_phases", ascending: true })
      .maybeSingle();

    if (data) {
      const sorted = (data.phases || [])
        .sort((a, b) => a.phase_number - b.phase_number)
        .map(phase => ({
          ...phase,
          tasks: (phase.tasks || []).sort((a, b) => {
            if (a.week_number !== b.week_number) return a.week_number - b.week_number;
            return (a.order_index ?? 0) - (b.order_index ?? 0);
          }),
        }));
      setRoadmap(data);
      setPhases(sorted);
      setXp(data.confidence_score ?? 0);
    }
    return data;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/auth"; return; }
      if (cancelled) return;
      setUserId(user.id);

      const existing = await loadRoadmap(user.id);
      if (!existing) {
        setInitializing(true);
        try {
          await supabase.functions.invoke("initialize-roadmap", { body: {} });
          if (!cancelled) await loadRoadmap(user.id);
        } catch (e) {
          console.error("[Quest] init error:", e);
        } finally {
          if (!cancelled) setInitializing(false);
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [loadRoadmap]);

  const handleTaskAction = useCallback(async (taskId, action) => {
    setActioningId(taskId);

    // Optimistic update
    setPhases(prev => prev.map(phase => ({
      ...phase,
      tasks: phase.tasks.map(t => t.id !== taskId ? t : {
        ...t,
        status: action === "complete" ? "completed" : "skipped",
        not_for_me: action === "flag" ? true : t.not_for_me,
      }),
    })));

    try {
      const { data, error } = await supabase.functions.invoke("complete-task", {
        body: { taskId, action },
      });
      if (error) throw error;

      if (data?.newConfidenceScore !== undefined) {
        const delta = data.confidenceDelta ?? 0;
        setXp(data.newConfidenceScore);
        setXpPop({ delta, id: Date.now() });
        setTimeout(() => setXpPop(null), 2000);
      }
    } catch (e) {
      console.error("[Quest] task action error:", e);
      // Revert optimistic update
      await loadRoadmap(userId);
    } finally {
      setActioningId(null);
    }
  }, [userId, loadRoadmap]);

  const handleGenerateNextPhase = useCallback(async () => {
    if (!roadmap || !userId) return;
    const activePhase = phases.find(p => p.status === "active" || p.status === "not_started");
    if (!activePhase) return;
    const nextNum = activePhase.phase_number + 1;

    setGeneratingPhase(true);
    try {
      await supabase.functions.invoke("generate-phase", {
        body: { userId, roadmapId: roadmap.id, phaseNumber: nextNum },
      });
      await loadRoadmap(userId);
    } catch (e) {
      console.error("[Quest] generate phase error:", e);
    } finally {
      setGeneratingPhase(false);
    }
  }, [roadmap, userId, phases, loadRoadmap]);

  const handleRegenerate = useCallback(async () => {
    setRegenConfirm(false);
    setRegenerating(true);
    try {
      await supabase.functions.invoke("regenerate-roadmap", { body: {} });
      setRoadmap(null);
      setPhases([]);
      setXp(0);
      await loadRoadmap(userId);
    } catch (e) {
      console.error("[Quest] regenerate error:", e);
    } finally {
      setRegenerating(false);
    }
  }, [userId, loadRoadmap]);

  // ── Derived stats ──────────────────────────────────────────────────────────
  const allTasks = phases.flatMap(p => p.tasks || []);
  const activePhase = phases.find(p => p.status === "active") || phases.find(p => {
    const tasks = p.tasks || [];
    return tasks.length > 0 && tasks.some(t => t.status === "not_started");
  });
  const activeTasks   = activePhase?.tasks || [];
  const doneInPhase   = activeTasks.filter(t => t.status === "completed" || t.status === "skipped").length;
  const totalInPhase  = activeTasks.length;
  const doneThisWeek  = allTasks.filter(t => {
    if (t.status !== "completed" || !t.completed_at) return false;
    return (Date.now() - new Date(t.completed_at)) < 7 * 86400000;
  }).length;

  const modeLabel = roadmap?.mode === "career"
    ? roadmap.career_direction || "Career"
    : "Discovery";

  if (loading || initializing || regenerating) {
    return (
      <div style={{
        minHeight: "100vh", background: BG,
        paddingLeft: isMobile ? 0 : SIDEBAR_WIDTH,
      }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
          @keyframes quest-spin { to { transform: rotate(360deg); } }
        `}</style>
        <QuestBoot regenerating={regenerating} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: BG, paddingLeft: isMobile ? 0 : SIDEBAR_WIDTH, paddingBottom: isMobile ? 96 : 48, backgroundImage: "radial-gradient(circle, rgba(29,78,216,0.07) 1px, transparent 1px)", backgroundSize: "28px 28px", backgroundAttachment: "local", position: "relative" }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        @keyframes quest-spin { to { transform: rotate(360deg); } }
        @keyframes quest-pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(29,78,216,0.4); } 50% { box-shadow: 0 0 0 6px rgba(29,78,216,0); } }
        * { box-sizing: border-box; }
      `}</style>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: isMobile ? "0 16px" : "0 24px", position: "relative" }}>

        {/* ── Sticky header ─────────────────────────────────────────────── */}
        <div style={{
          position: "sticky", top: 0, zIndex: 20,
          background: "rgba(238,244,255,0.88)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          padding: isMobile ? "14px 0 12px" : "18px 0 14px",
          borderBottom: `1px solid rgba(29,78,216,0.12)`,
          marginBottom: 24,
          boxShadow: "0 1px 0 0 rgba(29,78,216,0.06), 0 4px 24px rgba(29,78,216,0.04)",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <h1 style={{ fontFamily: SERIF, fontWeight: 600, fontSize: isMobile ? 26 : 32, margin: 0, letterSpacing: "-0.01em", background: "linear-gradient(135deg, #0f172a 30%, #1d4ed8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                  Quest
                </h1>
                <span style={{
                  fontFamily: FONT, fontSize: 10, fontWeight: 700,
                  letterSpacing: "0.07em", textTransform: "uppercase",
                  color: BLUE, background: BLUE_TINT,
                  border: `1px solid ${BLUE_SOFT}`,
                  borderRadius: 8, padding: "3px 9px",
                  boxShadow: "0 0 10px rgba(29,78,216,0.1)",
                }}>
                  {modeLabel}
                </span>
              </div>
              {activePhase && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                  <motion.span
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    style={{ width: 6, height: 6, borderRadius: "50%", background: BLUE, display: "inline-block", boxShadow: "0 0 6px rgba(29,78,216,0.6)" }}
                  />
                  <p style={{ fontFamily: BODY, fontSize: 13, color: TEXT_MUTED, margin: 0 }}>
                    Phase {activePhase.phase_number} · {doneInPhase}/{totalInPhase} tasks done
                  </p>
                </div>
              )}
            </div>

            {/* XP pill */}
            <div style={{ position: "relative" }}>
              <motion.div
                whileHover={{ scale: 1.05 }}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  background: `linear-gradient(135deg, #1d4ed8, #3b82f6)`,
                  borderRadius: 16, padding: "10px 16px",
                  boxShadow: "0 4px 18px rgba(29,78,216,0.28)",
                }}
              >
                <ProgressRing value={xp} max={100} size={36} stroke={3} color={WHITE} trackColor="rgba(255,255,255,0.25)" />
                <div>
                  <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 20, color: WHITE, lineHeight: 1 }}>
                    <XPCounter value={xp} />
                  </div>
                  <div style={{ fontFamily: FONT, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.65)" }}>
                    XP
                  </div>
                </div>
              </motion.div>

              {/* XP pop toast */}
              <AnimatePresence>
                {xpPop && (
                  <motion.div
                    key={xpPop.id}
                    initial={{ opacity: 0, y: 4, scale: 0.7 }}
                    animate={{ opacity: 1, y: -36, scale: 1 }}
                    exit={{ opacity: 0, y: -52, scale: 0.85 }}
                    transition={{ type: "spring", stiffness: 500, damping: 22 }}
                    style={{
                      position: "absolute", top: 0, right: 0,
                      fontFamily: FONT, fontWeight: 800, fontSize: 15,
                      color: WHITE,
                      background: xpPop.delta > 0 ? GREEN : RED,
                      borderRadius: 10, padding: "4px 10px",
                      boxShadow: xpPop.delta > 0 ? "0 4px 14px rgba(5,150,105,0.4)" : "0 4px 14px rgba(220,38,38,0.4)",
                      pointerEvents: "none", whiteSpace: "nowrap",
                    }}
                  >
                    {xpPop.delta > 0 ? `+${xpPop.delta}` : xpPop.delta} XP
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Stats row */}
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
            {[
              { value: doneThisWeek, label: "this week" },
              { value: phases.length, label: `phase${phases.length !== 1 ? "s" : ""}` },
              { value: allTasks.filter(t => t.status === "completed").length, label: "complete" },
            ].map(stat => (
              <div key={stat.label} style={{
                display: "flex", alignItems: "baseline", gap: 4,
                fontFamily: FONT, fontSize: 12, fontWeight: 600, color: TEXT_MUTED,
                background: WHITE, borderRadius: 9, padding: "5px 12px",
                border: `1px solid ${BORDER}`,
              }}>
                <span style={{ fontWeight: 800, fontSize: 14, color: TEXT }}>{stat.value}</span>
                {stat.label}
              </div>
            ))}
            <motion.button
              onClick={() => setRegenConfirm(v => !v)}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              style={{
                marginLeft: "auto",
                display: "flex", alignItems: "center", gap: 5,
                fontFamily: FONT, fontSize: 11, fontWeight: 700,
                color: regenConfirm ? BLUE : TEXT_MUTED,
                background: regenConfirm ? BLUE_TINT : WHITE,
                border: `1px solid ${regenConfirm ? BLUE_SOFT : BORDER}`,
                borderRadius: 9, padding: "5px 11px",
                cursor: "pointer", transition: "all 0.15s",
                letterSpacing: "0.02em",
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 4v6h6"/><path d="M23 20v-6h-6"/>
                <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
              </svg>
              New Quest
            </motion.button>
          </div>
        </div>

        {/* ── Regenerate confirm card ───────────────────────────────────── */}
        <AnimatePresence>
          {regenConfirm && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              style={{
                background: WHITE,
                border: `1.5px solid ${BLUE_SOFT}`,
                borderRadius: 18,
                padding: "20px 22px",
                marginBottom: 16,
                boxShadow: "0 4px 24px rgba(29,78,216,0.1)",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                  background: BLUE_TINT, border: `1px solid ${BLUE_SOFT}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 4v6h6"/><path d="M23 20v-6h-6"/>
                    <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
                  </svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14, color: TEXT, marginBottom: 5 }}>
                    Generate a new Quest?
                  </div>
                  <p style={{ fontFamily: BODY, fontSize: 13, color: TEXT_MUTED, lineHeight: 1.6, margin: "0 0 14px" }}>
                    We'll read your latest profile, recent conversations, and research searches to figure out where you are now and build a fresh roadmap around it. Your current Quest will be replaced.
                  </p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <motion.button
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={handleRegenerate}
                      style={{
                        padding: "9px 20px", borderRadius: 10, border: "none",
                        background: `linear-gradient(135deg, ${BLUE}, ${BLUE_MID})`,
                        color: WHITE, fontFamily: FONT, fontWeight: 700, fontSize: 13,
                        cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                        boxShadow: "0 4px 14px rgba(29,78,216,0.28)",
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 4v6h6"/><path d="M23 20v-6h-6"/>
                        <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
                      </svg>
                      Regenerate Quest
                    </motion.button>
                    <button
                      onClick={() => setRegenConfirm(false)}
                      style={{
                        padding: "9px 16px", borderRadius: 10,
                        border: `1px solid ${BORDER}`, background: "transparent",
                        color: TEXT_MUTED, fontFamily: FONT, fontWeight: 600, fontSize: 13,
                        cursor: "pointer",
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── No roadmap fallback ────────────────────────────────────────── */}
        {phases.length === 0 && (
          <div style={{ textAlign: "center", padding: "48px 24px" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🗺️</div>
            <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 18, color: TEXT, marginBottom: 8 }}>
              Your Quest is on its way
            </div>
            <p style={{ fontFamily: BODY, fontSize: 14, color: TEXT_MUTED }}>
              Hang tight — we're generating your personalised phases.
            </p>
          </div>
        )}

        {/* ── Phase cards ────────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {phases.map(phase => {
            const isCompleted = phase.status === "completed";
            const isLocked    = phase.status === "locked";
            const isActive    = !isCompleted && !isLocked;

            return (
              <PhaseCard
                key={phase.id}
                phase={phase}
                isActive={isActive}
                isCompleted={isCompleted}
                isLocked={isLocked}
                onAction={handleTaskAction}
                actioningId={actioningId}
                onGenerateNext={handleGenerateNextPhase}
                generatingPhase={generatingPhase}
              />
            );
          })}
        </div>

        {/* ── Ask AI nudge ────────────────────────────────────────────────── */}
        {phases.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            style={{
              marginTop: 28,
              padding: "20px 22px",
              borderRadius: 18,
              background: "linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)",
              border: `1.5px solid ${BLUE_SOFT}`,
              display: "flex", alignItems: "center",
              justifyContent: "space-between", gap: 14,
              boxShadow: "0 2px 12px rgba(29,78,216,0.06)",
            }}
          >
            <div>
              <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 14, color: TEXT, marginBottom: 3 }}>
                Stuck or need guidance?
              </div>
              <p style={{ fontFamily: BODY, fontSize: 13, color: TEXT_MUTED, margin: 0, lineHeight: 1.5 }}>
                Ask Mentora for personalised advice on any task in your Quest.
              </p>
            </div>
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => navigate("/chat")}
              style={{
                flexShrink: 0,
                padding: "11px 20px", borderRadius: 12,
                border: "none",
                background: "linear-gradient(135deg, #1d4ed8, #3b82f6)",
                color: WHITE,
                fontFamily: FONT, fontWeight: 700, fontSize: 13,
                cursor: "pointer",
                display: "flex", alignItems: "center", gap: 7,
                boxShadow: "0 3px 14px rgba(29,78,216,0.28)",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              Ask Mentora
            </motion.button>
          </motion.div>
        )}
      </div>
    </div>
  );
}
