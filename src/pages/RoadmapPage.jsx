import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../lib/supabase.js";
import { setKnownUserId } from "../lib/cache.js";
import { fetchUsage, LIMITS } from "../lib/usage.js";
import LimitModal from "../components/common/LimitModal.jsx";
import { SIDEBAR_WIDTH } from "../components/common/Sidebar.jsx";
import { useIsMobile } from "../hooks/useIsMobile.js";
import { useTheme } from "../lib/ThemeContext.jsx";

const LANGGRAPH_URL = import.meta.env.VITE_LANGGRAPH_CHAT_URL;

// ─── Design tokens (shared app palette) ───────────────────────────────────────
const SANS        = "'Raleway', sans-serif";
const BG          = "#F5F5F5";
const WHITE       = "#ffffff";
const BLUE        = "#1d4ed8";
const BLUE_MID    = "#3b82f6";
const BLUE_TINT   = "#f0f5ff";
const GREEN       = "#059669";
const GREEN_SOFT  = "#d1fae5";
const AMBER       = "#d97706";
const AMBER_SOFT  = "#fef3c7";
const PURPLE      = "#7c3aed";
const PURPLE_SOFT = "#ede9fe";
const TEXT        = "#141413";
const TEXT_MID    = "#3d3d3a";
const TEXT_MUTED  = "#494742";
const TEXT_FAINT  = "#6a6760";
const BORDER      = "#e6dfd8";

const PILLAR_STYLES = {
  Project:  { bg: BLUE_TINT,   color: BLUE,   dot: BLUE },
  Research: { bg: AMBER_SOFT,  color: AMBER,  dot: AMBER },
  Activity: { bg: GREEN_SOFT,  color: GREEN,  dot: GREEN },
  Club:     { bg: PURPLE_SOFT, color: PURPLE, dot: PURPLE },
};
const pillarStyle = (p) => PILLAR_STYLES[p] || PILLAR_STYLES.Project;

// Light Quest-feature tints, cycled per phase for variety.
const PHASE_PALETTE = [
  { bg: "#d1fae5", accent: "#047857", border: "#a7f3d0" }, // green
  { bg: "#dbeafe", accent: "#1d4ed8", border: "#bfdbfe" }, // blue
  { bg: "#fef3c7", accent: "#b45309", border: "#fde68a" }, // amber
  { bg: "#ede9fe", accent: "#6d28d9", border: "#ddd6fe" }, // purple
  { bg: "#ffe4e6", accent: "#be123c", border: "#fecdd3" }, // rose
  { bg: "#cffafe", accent: "#0e7490", border: "#a5f3fc" }, // cyan
];
const phasePalette = (i) => PHASE_PALETTE[i % PHASE_PALETTE.length];

// End-month picker bounds.
function monthValue(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }
function addMonths(base, n) { return new Date(base.getFullYear(), base.getMonth() + n, 1); }
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function prettyMonth(val) {
  if (!val) return "";
  const [y, m] = val.split("-").map(Number);
  return `${MONTH_NAMES[(m - 1) % 12]} ${y}`;
}

// Subtle technical-depth hint.
function DepthPips({ depth }) {
  if (!depth) return null;
  return (
    <span title={`Difficulty ${depth}/5`} style={{ display: "inline-flex", gap: 3, alignItems: "center" }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: i <= depth ? BLUE_MID : BORDER }} />
      ))}
    </span>
  );
}

// ─── Goal-capture entry (empty state) ─────────────────────────────────────────
function GoalEntry({ onStart, starting, atLimit, onLimit }) {
  const { accent } = useTheme();
  const [goal, setGoal] = useState("");
  const [decide, setDecide] = useState(true);
  const [endMonth, setEndMonth] = useState("");

  const today = new Date();
  const minMonth = monthValue(addMonths(today, 3));
  const maxMonth = monthValue(addMonths(today, 24));
  const validMonth = decide || (endMonth && endMonth >= minMonth && endMonth <= maxMonth);
  const canGo = goal.trim().length >= 4 && validMonth && !starting;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
      style={{ maxWidth: 680, margin: "0 auto", width: "100%", textAlign: "center", paddingTop: "2rem" }}
    >
      <h1 style={{ fontFamily: SANS, fontWeight: 700, fontSize: "2.4rem", color: accent, letterSpacing: "-0.03em", marginBottom: "0.7rem" }}>
        Build Your Roadmap
      </h1>
      <p style={{ fontFamily: SANS, fontSize: "1.08rem", color: TEXT_MUTED, lineHeight: 1.6, marginBottom: "2.25rem", maxWidth: 520, marginLeft: "auto", marginRight: "auto" }}>
        Tell Mentorable your ultimate goal. You'll get a path built in phases, the broad stages you
        move through. You unlock and shape each phase as you go.
      </p>

      <div style={{ textAlign: "left", background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 20, padding: "2rem", boxShadow: "0 2px 12px rgba(15,23,42,0.05)" }}>
        <label style={{ fontFamily: SANS, fontSize: "0.82rem", fontWeight: 700, letterSpacing: "0.02em", color: accent, display: "block", marginBottom: 9 }}>
          Your Ultimate Goal
        </label>
        <textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="e.g. Get into a top CS program and build a standout portfolio"
          rows={3}
          style={{
            width: "100%", fontFamily: SANS, fontSize: "1.05rem", color: TEXT, lineHeight: 1.55,
            border: `1.5px solid ${BORDER}`, borderRadius: 12, padding: "13px 15px", resize: "vertical",
            outline: "none", background: BG, marginBottom: "1.4rem",
          }}
          onFocus={(e) => (e.target.style.borderColor = accent)}
          onBlur={(e) => (e.target.style.borderColor = BORDER)}
        />

        <label style={{ fontFamily: SANS, fontSize: "0.82rem", fontWeight: 700, letterSpacing: "0.02em", color: accent, display: "block", marginBottom: 9 }}>
          When Do You Want to Reach It?
        </label>
        <div style={{ display: "flex", gap: 9, marginBottom: "0.7rem", flexWrap: "wrap" }}>
          <button onClick={() => setDecide(true)}
            style={{ fontFamily: SANS, fontSize: "0.92rem", fontWeight: 600, cursor: "pointer", padding: "8px 16px", borderRadius: 99, border: `1.5px solid ${decide ? accent : BORDER}`, background: decide ? accent : WHITE, color: decide ? WHITE : TEXT_MID, transition: "all 0.15s" }}>
            Let Mentorable Decide
          </button>
          <button onClick={() => setDecide(false)}
            style={{ fontFamily: SANS, fontSize: "0.92rem", fontWeight: 600, cursor: "pointer", padding: "8px 16px", borderRadius: 99, border: `1.5px solid ${!decide ? accent : BORDER}`, background: !decide ? accent : WHITE, color: !decide ? WHITE : TEXT_MID, transition: "all 0.15s" }}>
            Pick a Target Month
          </button>
        </div>
        {!decide && (
          <div style={{ marginBottom: "0.4rem" }}>
            <input type="month" value={endMonth} min={minMonth} max={maxMonth}
              onChange={(e) => setEndMonth(e.target.value)}
              style={{ fontFamily: SANS, fontSize: "1rem", color: TEXT, background: BG, border: `1.5px solid ${endMonth && !validMonth ? "#dc2626" : BORDER}`, borderRadius: 10, padding: "11px 13px", outline: "none", width: "100%" }} />
            <p style={{ fontFamily: SANS, fontSize: "0.78rem", color: TEXT_MID, marginTop: 7 }}>
              Anywhere from {prettyMonth(minMonth)} to {prettyMonth(maxMonth)}. Mastery takes time.
            </p>
          </div>
        )}

        <button
          onClick={() => { if (atLimit) { onLimit(); return; } if (canGo) onStart(goal.trim(), decide ? null : `${endMonth}-01`); }}
          disabled={!canGo}
          style={{ width: "100%", fontFamily: SANS, fontSize: "1.05rem", fontWeight: 700, cursor: canGo ? "pointer" : "not-allowed", padding: "15px", borderRadius: 12, border: "none", marginTop: "1.1rem", background: canGo ? "var(--accent)" : "#c7d2e8", color: WHITE, boxShadow: canGo ? "0 6px 20px rgba(var(--accent-rgb),0.3)" : "none", transition: "all 0.15s" }}>
          {starting ? "Setting up…" : "Continue"}
        </button>
        <p style={{ fontFamily: SANS, fontSize: "0.84rem", color: TEXT_MID, textAlign: "center", marginTop: 11 }}>
          A couple of quick questions next. The demo includes one roadmap.
        </p>
      </div>
      <p style={{ fontFamily: SANS, fontSize: "0.98rem", color: TEXT_MID, textAlign: "center", marginTop: "1.3rem" }}>
        Tip: the more specific and detailed your goal, the better your roadmap will be. Give context, like where you're starting from and what you've already tried.
      </p>
    </motion.div>
  );
}

// ─── Intake questionnaire (<=3 gap-only questions, skippable) ──────────────────
function QuestionnaireStep({ questions, generating, onSubmit, onSkip }) {
  const { accent } = useTheme();
  const [answers, setAnswers] = useState({});
  const setAns = (id, v) => setAnswers((a) => ({ ...a, [id]: v }));
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}
      style={{ maxWidth: 680, margin: "0 auto", width: "100%", paddingTop: "2rem" }}
    >
      <div style={{ textAlign: "center", marginBottom: "2rem" }}>
        <h1 style={{ fontFamily: SANS, fontWeight: 700, fontSize: "2rem", color: accent, letterSpacing: "-0.02em", marginBottom: "0.6rem" }}>A Couple of Quick Things</h1>
        <p style={{ fontFamily: SANS, fontSize: "1.02rem", color: TEXT_MUTED, lineHeight: 1.6 }}>This helps Mentorable tailor your roadmap. Answer what you like, and skip any you want.</p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 18, marginBottom: "1.75rem" }}>
        {questions.map((q) => (
          <div key={q.id} style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 16, padding: "1.3rem 1.4rem" }}>
            <p style={{ fontFamily: SANS, fontWeight: 700, fontSize: "1.05rem", color: TEXT, marginBottom: 14, lineHeight: 1.4 }}>{q.prompt}</p>
            {q.type === "mcq" ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 9 }}>
                {q.options.map((opt) => {
                  const active = answers[q.id] === opt;
                  return (
                    <button key={opt} onClick={() => setAns(q.id, active ? undefined : opt)}
                      style={{ fontFamily: SANS, fontSize: "0.92rem", fontWeight: 600, cursor: "pointer", padding: "8px 16px", borderRadius: 99, border: `1.5px solid ${active ? accent : BORDER}`, background: active ? accent : WHITE, color: active ? WHITE : TEXT_MID, transition: "all 0.15s" }}>
                      {opt}
                    </button>
                  );
                })}
              </div>
            ) : (
              <input type="text" value={answers[q.id] || ""} onChange={(e) => setAns(q.id, e.target.value)} placeholder="Your answer (optional)"
                style={{ width: "100%", fontFamily: SANS, fontSize: "1.02rem", color: TEXT, background: BG, border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: "11px 13px", outline: "none" }}
                onFocus={(e) => (e.target.style.borderColor = accent)} onBlur={(e) => (e.target.style.borderColor = BORDER)} />
            )}
          </div>
        ))}
      </div>
      <button
        onClick={() => {
          const clean = {};
          for (const [k, v] of Object.entries(answers)) {
            const q = questions.find((x) => x.id === k);
            if (v != null && String(v).trim()) clean[q?.prompt || k] = String(v).trim();
          }
          onSubmit(clean);
        }}
        disabled={generating}
        style={{ width: "100%", fontFamily: SANS, fontSize: "1.05rem", fontWeight: 700, cursor: generating ? "default" : "pointer", padding: "15px", borderRadius: 12, border: "none", background: "var(--accent)", color: WHITE, boxShadow: "0 6px 20px rgba(var(--accent-rgb),0.3)", transition: "all 0.15s" }}>
        {generating ? "Building your roadmap…" : "Build my roadmap"}
      </button>
      <button onClick={onSkip} disabled={generating}
        style={{ width: "100%", fontFamily: SANS, fontSize: "0.9rem", fontWeight: 600, cursor: "pointer", color: TEXT_MID, background: "none", border: "none", marginTop: 13 }}>
        Skip and build
      </button>
    </motion.div>
  );
}

// ─── Shared loading screen (every roadmap wait state) ─────────────────────────
const LOADING_CSS = `
  @keyframes rm-spin    { to { transform: rotate(360deg) } }
  @keyframes rm-breathe { 0% { transform: scale(0.92); opacity: 0.5 } 70%, 100% { transform: scale(1.5); opacity: 0 } }
  @keyframes rm-rail    { 0% { left: -40% } 100% { left: 100% } }
  @keyframes rm-bar     { 0%, 100% { transform: scaleY(0.35) } 50% { transform: scaleY(1) } }
`;

// The accent orb used by every loading state, so they all feel like one thing.
function LoadingOrb({ size = 62 }) {
  const ring = Math.max(2.5, size * 0.05);
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "rgba(var(--accent-rgb),0.2)", animation: "rm-breathe 2.6s ease-out infinite" }} />
      <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `${ring}px solid rgba(var(--accent-rgb),0.16)`, borderTopColor: "var(--accent)", animation: "rm-spin 0.95s linear infinite" }} />
      <div style={{ position: "absolute", inset: size * 0.19, borderRadius: "50%", border: `${ring}px solid rgba(var(--accent-rgb),0.1)`, borderBottomColor: "var(--accent)", animation: "rm-spin 1.6s linear infinite reverse" }} />
    </div>
  );
}

// A generic "working on it" visual: doesn't mimic any specific page layout,
// so it never looks mismatched with whatever screen appears once loading ends.
function LoadingBars() {
  const heights = [0.5, 0.85, 0.65, 1, 0.7];
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 8, height: 46 }}>
      {heights.map((h, i) => (
        <span key={i} style={{
          width: 9, height: `${h * 46}px`, borderRadius: 5,
          background: "linear-gradient(180deg, var(--accent), var(--accent-light))",
          transformOrigin: "bottom", animation: "rm-bar 1.1s ease-in-out infinite",
          animationDelay: `${i * 0.12}s`,
        }} />
      ))}
    </div>
  );
}

function RoadmapLoading({ title, subtitle, messages = [] }) {
  const { accent } = useTheme();
  const [idx, setIdx] = useState(0);
  const count = messages.length;

  useEffect(() => {
    setIdx(0);
    if (count < 2) return;
    const id = setInterval(() => setIdx((i) => Math.min(i + 1, count - 1)), 3400);
    return () => clearInterval(id);
  }, [count, title]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      style={{ maxWidth: 680, margin: "0 auto", width: "100%", paddingTop: "2.5rem" }}
    >
      <style>{LOADING_CSS}</style>

      <div style={{ display: "flex", justifyContent: "center", marginBottom: "1.5rem" }}>
        <LoadingOrb />
      </div>

      <h1 style={{ fontFamily: SANS, fontWeight: 700, fontSize: "2rem", color: accent, letterSpacing: "-0.02em", textAlign: "center", marginBottom: 10 }}>
        {title}
      </h1>
      <p style={{ fontFamily: SANS, fontSize: "1.02rem", color: TEXT_MUTED, lineHeight: 1.6, textAlign: "center", marginBottom: "1.4rem" }}>
        {subtitle}
      </p>

      {count > 0 && (
        <div style={{ height: 22, marginBottom: "1.5rem", position: "relative" }}>
          <AnimatePresence mode="wait">
            <motion.p key={idx}
              initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -7 }} transition={{ duration: 0.3 }}
              style={{ fontFamily: SANS, fontSize: "0.94rem", fontWeight: 600, color: TEXT_MID, textAlign: "center", margin: 0, position: "absolute", inset: 0 }}>
              {messages[idx]}
            </motion.p>
          </AnimatePresence>
        </div>
      )}

      {/* Indeterminate progress rail */}
      <div style={{ position: "relative", height: 4, borderRadius: 99, background: "rgba(var(--accent-rgb),0.13)", overflow: "hidden", marginBottom: "2.2rem" }}>
        <span style={{ position: "absolute", top: 0, bottom: 0, width: "40%", borderRadius: 99, background: "linear-gradient(90deg, transparent, var(--accent), transparent)", animation: "rm-rail 1.6s ease-in-out infinite" }} />
      </div>

      <LoadingBars />
    </motion.div>
  );
}

// ─── Full-plan modal (the broad outline, re-viewable any time) ─────────────────
function PlanModal({ roadmap, onClose }) {
  const phases = roadmap.phases || [];
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(20,20,19,0.45)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}
      onClick={onClose}>
      <motion.div initial={{ opacity: 0, y: 22, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 640, maxHeight: "85vh", overflowY: "auto", background: BG, borderRadius: 20, border: `1px solid ${BORDER}`, boxShadow: "0 30px 80px rgba(0,0,0,0.3)", padding: "1.9rem" }}>
        <p style={{ fontFamily: SANS, fontSize: "0.8rem", fontWeight: 700, letterSpacing: "0.02em", color: TEXT, marginBottom: 7 }}>The Big Picture</p>
        <h2 style={{ fontFamily: SANS, fontWeight: 700, fontSize: "1.5rem", color: TEXT, letterSpacing: "-0.02em", marginBottom: 18 }}>{roadmap.display_title || roadmap.goal}</h2>
        {phases.map((p, i) => {
          const pal = phasePalette(i);
          return (
            <div key={i} style={{ background: pal.bg, border: `1.5px solid ${pal.border}`, borderRadius: 15, padding: "16px 18px", marginBottom: 13 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 7 }}>
                <span style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, color: pal.accent, background: "rgba(255,255,255,0.65)", borderRadius: 7, padding: "3px 9px" }}>{p.month_count} mo</span>
                <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 17, color: TEXT }}>{p.title}</span>
              </div>
              {p.blurb && <p style={{ fontFamily: SANS, fontSize: 14.5, color: TEXT_MID, lineHeight: 1.5, margin: "0 0 9px" }}>{p.blurb}</p>}
              {(p.month_focuses || []).filter(Boolean).length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                  {(p.month_focuses || []).filter(Boolean).map((f, j) => (
                    <span key={j} style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 600, color: pal.accent, background: "rgba(255,255,255,0.55)", borderRadius: 7, padding: "4px 9px" }}>{f}</span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <button onClick={onClose} style={{ width: "100%", fontFamily: SANS, fontSize: "1rem", fontWeight: 700, cursor: "pointer", padding: "13px", borderRadius: 11, border: "none", background: "var(--accent)", color: WHITE, marginTop: 7 }}>Got it</button>
      </motion.div>
    </motion.div>
  );
}

// ─── Delete confirmation ──────────────────────────────────────────────────────
const DANGER = "#dc2626";

function DeleteRoadmapModal({ title, canRebuild, deleting, onConfirm, onCancel }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: "fixed", inset: 0, zIndex: 320, background: "rgba(20,20,19,0.45)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}
      onClick={deleting ? undefined : onCancel}>
      <motion.div initial={{ opacity: 0, y: 22, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 520, background: BG, borderRadius: 20, border: `1px solid ${BORDER}`, boxShadow: "0 30px 80px rgba(0,0,0,0.3)", padding: "1.9rem" }}>
        <p style={{ fontFamily: SANS, fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.02em", color: DANGER, marginBottom: 7 }}>Delete Roadmap</p>
        <h2 style={{ fontFamily: SANS, fontWeight: 700, fontSize: "1.4rem", color: TEXT, letterSpacing: "-0.02em", marginBottom: 11, lineHeight: 1.25 }}>
          Delete "{title}"?
        </h2>
        <p style={{ fontFamily: SANS, fontSize: "1rem", color: TEXT_MID, lineHeight: 1.6, marginBottom: canRebuild ? 17 : 14 }}>
          This clears the whole roadmap: every phase, all of its steps, and everything you have checked off. It cannot be undone.
        </p>
        {!canRebuild && (
          <div style={{ background: AMBER_SOFT, border: `1.5px solid ${AMBER}55`, borderRadius: 12, padding: "12px 14px", marginBottom: 17 }}>
            <p style={{ fontFamily: SANS, fontSize: "0.92rem", fontWeight: 600, color: "#7c4a03", lineHeight: 1.5, margin: 0 }}>
              The demo includes one roadmap, and you have used it. Deleting this one means you will not be able to build another.
            </p>
          </div>
        )}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCancel} disabled={deleting}
            style={{ flex: 1, fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700, cursor: deleting ? "default" : "pointer", padding: "12px", borderRadius: 11, border: `1.5px solid ${BORDER}`, background: WHITE, color: TEXT_MID }}>
            Keep it
          </button>
          <button onClick={onConfirm} disabled={deleting}
            style={{ flex: 1, fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700, cursor: deleting ? "default" : "pointer", padding: "12px", borderRadius: 11, border: "none", background: DANGER, color: WHITE, boxShadow: "0 6px 18px rgba(220,38,38,0.28)" }}>
            {deleting ? "Deleting…" : "Delete roadmap"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Reflection modal (required before the next phase) ─────────────────────────
function ReflectModal({ phase, nodeTitles, submitting, onSubmit, onCancel }) {
  const { accent } = useTheme();
  const [text, setText] = useState("");
  const names = nodeTitles.length ? nodeTitles.join(", ") : "the activities in this phase";
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(20,20,19,0.45)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}
      onClick={submitting ? undefined : onCancel}>
      <motion.div initial={{ opacity: 0, y: 22, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 560, background: BG, borderRadius: 20, border: `1px solid ${BORDER}`, boxShadow: "0 30px 80px rgba(0,0,0,0.3)", padding: "1.9rem" }}>
        <p style={{ fontFamily: SANS, fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.02em", color: accent, marginBottom: 7 }}>Before You Go Further</p>
        <h2 style={{ fontFamily: SANS, fontWeight: 700, fontSize: "1.4rem", color: TEXT, letterSpacing: "-0.02em", marginBottom: 11 }}>How did "{phase.title}" go?</h2>
        <p style={{ fontFamily: SANS, fontSize: "1rem", color: TEXT_MID, lineHeight: 1.6, marginBottom: 17 }}>
          You worked on {names}. Tell us how it went and how successful you were. This shapes your next phase.
        </p>
        <textarea
          value={text} onChange={(e) => setText(e.target.value)} rows={5} autoFocus
          placeholder="What went well, what was hard, what you actually finished…"
          style={{ width: "100%", fontFamily: SANS, fontSize: "1.02rem", color: TEXT, lineHeight: 1.55, border: `1.5px solid ${BORDER}`, borderRadius: 12, padding: "13px 15px", resize: "vertical", outline: "none", background: WHITE, marginBottom: 17 }}
          onFocus={(e) => (e.target.style.borderColor = accent)} onBlur={(e) => (e.target.style.borderColor = BORDER)} />
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCancel} disabled={submitting}
            style={{ flex: "0 0 auto", fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700, cursor: "pointer", padding: "12px 18px", borderRadius: 11, border: `1.5px solid ${BORDER}`, background: WHITE, color: TEXT_MID }}>
            Not yet
          </button>
          <button onClick={() => onSubmit(text.trim())} disabled={submitting || text.trim().length < 2}
            style={{ flex: 1, fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700, cursor: submitting || text.trim().length < 2 ? "not-allowed" : "pointer", padding: "12px", borderRadius: 11, border: "none", background: text.trim().length < 2 ? "#c7d2e8" : "var(--accent)", color: WHITE, boxShadow: text.trim().length < 2 ? "none" : "0 6px 18px rgba(var(--accent-rgb),0.3)" }}>
            {submitting ? "Generating next phase…" : "Submit and continue"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── RoadmapPage ──────────────────────────────────────────────────────────────
export default function RoadmapPage({ navigate }) {
  const isMobile = useIsMobile();
  const { accent } = useTheme();
  const [phase, setPhase] = useState("loading");  // loading | empty | intake | generating | reveal | phasing | ready | error
  const [roadmap, setRoadmap] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [taskCounts, setTaskCounts] = useState({});   // node_id → {done, total}
  const [roadmapUsed, setRoadmapUsed] = useState(0);
  const [phaseUsed, setPhaseUsed] = useState(0);
  const [limitModal, setLimitModal] = useState(false);
  const [limitFeature, setLimitFeature] = useState("roadmap_gen");
  const [starting, setStarting] = useState(false);
  const [intakeQs, setIntakeQs] = useState([]);
  const [expanded, setExpanded] = useState(new Set());   // phase indexes expanded in the tracker
  const [planModal, setPlanModal] = useState(false);
  const [reflectFor, setReflectFor] = useState(null);    // phase index pending reflection
  const [reflecting, setReflecting] = useState(false);
  const [phaseBusy, setPhaseBusy] = useState(false);     // a phase is being generated
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const pendingRef = useRef({ goal: "", endMonth: null });
  const userIdRef = useRef(null);

  const showLimit = (feature) => { setLimitFeature(feature); setLimitModal(true); };

  // Detect a legacy (pre-v3) roadmap: phases without a status field, or none + nodes.
  const isLegacy = (rm, nd) => {
    const ph = Array.isArray(rm?.phases) ? rm.phases : [];
    if (ph.length === 0) return (nd?.length || 0) > 0;     // old all-at-once roadmap
    return ph[0] && ph[0].status === undefined;            // v2.1 phases had no status
  };

  const loadTasks = useCallback(async (nodeList) => {
    const ids = nodeList.map((n) => n.id);
    if (!ids.length) { setTaskCounts({}); return; }
    const { data } = await supabase.from("roadmap_tasks").select("node_id, done").in("node_id", ids);
    const counts = {};
    for (const t of (data || [])) {
      const c = counts[t.node_id] || { done: 0, total: 0 };
      c.total += 1; if (t.done) c.done += 1;
      counts[t.node_id] = c;
    }
    setTaskCounts(counts);
  }, []);

  // Initial load.
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/auth"; return; }
      userIdRef.current = user.id;
      setKnownUserId(user.id);

      const [{ data: rms }, usage] = await Promise.all([
        supabase.from("roadmaps").select("*").eq("user_id", user.id).eq("status", "active").order("created_at", { ascending: false }).limit(1),
        fetchUsage(supabase),
      ]);
      setRoadmapUsed(usage.roadmap_generations_used ?? 0);
      setPhaseUsed(usage.phase_generations_used ?? 0);

      const rm = (rms || [])[0];
      if (!rm) { setPhase("empty"); return; }
      const { data: nd } = await supabase.from("roadmap_nodes").select("*").eq("roadmap_id", rm.id).order("month_index", { ascending: true }).order("order_index", { ascending: true });
      if (isLegacy(rm, nd)) {
        await supabase.from("roadmaps").update({ status: "archived" }).eq("id", rm.id);
        setPhase("empty");
        return;
      }
      setRoadmap(rm);
      setNodes(nd || []);
      await loadTasks(nd || []);
      const activeIdx = (rm.phases || []).findIndex((p) => p.status === "active");
      setExpanded(new Set([activeIdx >= 0 ? activeIdx : 0]));
      setPhase("ready");
    })();
  }, [loadTasks]);

  // Step 1: goal captured → fetch intake questions.
  const handleStart = useCallback(async (goal, endMonth) => {
    pendingRef.current = { goal, endMonth };
    setStarting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${LANGGRAPH_URL}/roadmap/intake`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ goal, end_month: endMonth }),
      });
      const data = res.ok ? await res.json().catch(() => ({ questions: [] })) : { questions: [] };
      const qs = Array.isArray(data.questions) ? data.questions : [];
      setStarting(false);
      if (qs.length === 0) { handleGenerateOutline({}); return; }
      setIntakeQs(qs);
      setPhase("intake");
    } catch (e) {
      console.error("[Roadmap] intake error:", e);
      setStarting(false);
      handleGenerateOutline({});
    }
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  // Step 2: generate the broad outline (once), then auto-generate phase 0.
  const handleGenerateOutline = useCallback(async (intakeAnswers) => {
    const { goal, endMonth } = pendingRef.current;
    setPhase("generating");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${LANGGRAPH_URL}/roadmap/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ goal, end_month: endMonth, intake_answers: intakeAnswers || {} }),
      });
      if (res.status === 429) { setRoadmapUsed(LIMITS.roadmap_gen); showLimit("roadmap_gen"); setPhase("empty"); return; }
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.detail || "Generation failed"); }
      const data = await res.json();
      setRoadmap(data.roadmap);
      setNodes([]);
      setTaskCounts({});
      setExpanded(new Set([0]));
      setRoadmapUsed((n) => n + 1);
      setPhase("reveal");
      generatePhase(data.roadmap.id, 0);   // auto-start phase 1 in the background
    } catch (e) {
      console.error("[Roadmap] generate error:", e);
      setPhase("error");
    }
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  // Generate one phase's nodes.
  const generatePhase = useCallback(async (roadmapId, phaseIndex) => {
    setPhaseBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${LANGGRAPH_URL}/roadmap/phase/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ roadmap_id: roadmapId, phase_index: phaseIndex }),
      });
      if (res.status === 429) { setPhaseUsed(LIMITS.phase_gen); showLimit("phase_gen"); setPhaseBusy(false); return false; }
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.detail || "Phase generation failed"); }
      const data = await res.json();
      setRoadmap(data.roadmap);
      setNodes((prev) => {
        const others = prev.filter((n) => !(data.nodes || []).some((x) => x.id === n.id));
        return [...others, ...(data.nodes || [])].sort((a, b) => a.month_index - b.month_index || a.order_index - b.order_index);
      });
      setPhaseUsed((n) => n + 1);
      setExpanded(new Set([phaseIndex]));
      setPhaseBusy(false);
      return true;
    } catch (e) {
      console.error("[Roadmap] phase generate error:", e);
      setPhaseBusy(false);
      return false;
    }
  }, []);

  // "Start Phase 1" pressed while phase 1 is still generating: hold on the loading
  // screen until it lands (generatePhase clears phaseBusy on success and on failure).
  useEffect(() => {
    if (phase === "phasing" && !phaseBusy) setPhase("ready");
  }, [phase, phaseBusy]);

  // Delete the roadmap. Archiving is how the app already retires a roadmap (the
  // legacy sweep on load does the same), so the nodes/tasks rows stay intact and
  // the user simply lands back on the goal-entry screen.
  const handleDelete = useCallback(async () => {
    if (!roadmap) return;
    setDeleting(true);
    const { error } = await supabase.from("roadmaps").update({ status: "archived" }).eq("id", roadmap.id);
    setDeleting(false);
    if (error) { console.error("[Roadmap] delete error:", error); return; }
    setDeleteModal(false);
    setPlanModal(false);
    setReflectFor(null);
    setRoadmap(null);
    setNodes([]);
    setTaskCounts({});
    setExpanded(new Set());
    setPhase("empty");
  }, [roadmap]);

  const openNode = useCallback((node) => navigate(`/roadmap/node/${node.id}`), [navigate]);

  // Submit a phase reflection → score it, then generate the next phase.
  const submitReflection = useCallback(async (phaseIndex, text) => {
    if (!roadmap) return;
    setReflecting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${LANGGRAPH_URL}/roadmap/phase/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ roadmap_id: roadmap.id, phase_index: phaseIndex, reflection_text: text }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.detail || "Reflection failed"); }
      const data = await res.json();

      // Optimistically mark this phase completed locally.
      setRoadmap((rm) => {
        const ph = (rm.phases || []).map((p) => p.index === phaseIndex
          ? { ...p, status: "completed", reflection: { readiness_score: data.readiness_score, summary: data.summary } }
          : p);
        return { ...rm, phases: ph };
      });

      const hasNext = phaseIndex + 1 < (roadmap.phases || []).length;
      if (hasNext) {
        if (phaseUsed >= LIMITS.phase_gen) { setReflectFor(null); setReflecting(false); showLimit("phase_gen"); return; }
        // Keep the modal up (button shows "Generating next phase…") until the phase is ready.
        await generatePhase(roadmap.id, phaseIndex + 1);
      }
      setReflectFor(null);
      setReflecting(false);
    } catch (e) {
      console.error("[Roadmap] reflection error:", e);
      setReflectFor(null);
      setReflecting(false);
    }
  }, [roadmap, phaseUsed, generatePhase]);

  const phases = roadmap?.phases || [];
  const phaseNodes = (p) => nodes.filter((n) => n.month_index >= p.month_start && n.month_index < p.month_start + p.month_count)
    .sort((a, b) => a.month_index - b.month_index || a.order_index - b.order_index);

  const pagePad = { minHeight: "100vh", background: BG, fontFamily: SANS, padding: isMobile ? "1.5rem 1rem 5rem" : "2.5rem 2rem 4rem", paddingLeft: isMobile ? "1rem" : `calc(${SIDEBAR_WIDTH}px + 2rem)` };

  if (phase === "loading") {
    return <div data-sidebar-offset style={{ ...pagePad, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <LoadingOrb size={44} />
      <style>{LOADING_CSS}</style>
    </div>;
  }

  // Node row inside an expanded phase.
  const NodeRow = ({ node }) => {
    const ps = pillarStyle(node.pillar);
    const tc = taskCounts[node.id];
    const isDone = node.state === "done";
    let progress;
    if (isDone) progress = { text: "Done", color: GREEN, bg: GREEN_SOFT };
    else if (tc && tc.total) progress = { text: `${tc.done}/${tc.total}`, color: "var(--accent)", bg: "rgba(var(--accent-rgb),0.14)" };
    else progress = { text: "Open", color: TEXT_FAINT, bg: BG };
    return (
      <motion.button layout whileHover={{ y: -1 }} onClick={() => openNode(node)}
        style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", textAlign: "left", cursor: "pointer", background: WHITE, border: `1px solid ${BORDER}`, borderLeft: `3px solid ${ps.dot}`, borderRadius: 13, padding: "14px 16px", marginBottom: 11 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5, flexWrap: "wrap" }}>
            <span style={{ fontFamily: SANS, fontSize: 11.5, fontWeight: 700, letterSpacing: "0.02em", background: ps.bg, color: ps.color, borderRadius: 6, padding: "3px 9px" }}>{node.pillar}</span>
            <span style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 600, color: TEXT_MID }}>{node.month_label}</span>
            <DepthPips depth={node.technical_depth} />
          </div>
          <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 16.5, color: isDone ? TEXT_MUTED : TEXT, lineHeight: 1.3, textDecoration: isDone ? "line-through" : "none" }}>{node.title}</div>
          {node.blurb && <p style={{ fontFamily: SANS, fontSize: 13.5, color: TEXT_MUTED, lineHeight: 1.45, margin: "5px 0 0" }}>{node.blurb}</p>}
        </div>
        <span style={{ flexShrink: 0, fontFamily: SANS, fontSize: 12.5, fontWeight: 700, color: progress.color, background: progress.bg, borderRadius: 8, padding: "5px 10px" }}>{progress.text}</span>
      </motion.button>
    );
  };

  return (
    <div data-sidebar-offset style={pagePad}>

      {phase === "empty" && !starting && (
        <GoalEntry onStart={handleStart} starting={starting} atLimit={roadmapUsed >= LIMITS.roadmap_gen} onLimit={() => showLimit("roadmap_gen")} />
      )}

      {phase === "empty" && starting && (
        <RoadmapLoading
          title="Reading Your Goal"
          subtitle="Mentorable is working out the few things it still needs to ask you."
          messages={["Taking in what you wrote", "Checking what Mentorable already knows about you", "Picking the questions that matter"]}
        />
      )}

      {phase === "intake" && (
        <QuestionnaireStep questions={intakeQs} generating={false} onSubmit={handleGenerateOutline} onSkip={() => handleGenerateOutline({})} />
      )}

      {phase === "generating" && (
        <RoadmapLoading
          title="Mapping Your Phases"
          subtitle="Laying out the broad stages of your path. This takes a moment."
          messages={["Shaping the stages you'll move through", "Pacing them across your timeline", "Setting a focus for every month", "Putting it all together"]}
        />
      )}

      {phase === "phasing" && (
        <RoadmapLoading
          title="Preparing Phase 1"
          subtitle="Turning the first stage into the concrete work you'll actually do."
          messages={["Breaking the phase into real steps", "Choosing projects, research and activities", "Tuning the depth to where you are", "Nearly ready"]}
        />
      )}

      {phase === "error" && (
        <div style={{ maxWidth: 520, margin: "3rem auto 0", textAlign: "center" }}>
          <p style={{ fontFamily: SANS, fontSize: "1.05rem", color: "#dc2626", fontWeight: 600, marginBottom: 9 }}>Couldn't build your roadmap.</p>
          <button onClick={() => setPhase("empty")} style={{ fontFamily: SANS, fontSize: "1rem", color: accent, background: "none", border: "none", cursor: "pointer", fontWeight: 700, textDecoration: "underline" }}>Try again</button>
        </div>
      )}

      {/* One-time broad-plan reveal */}
      {phase === "reveal" && roadmap && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
          style={{ maxWidth: 820, margin: "0 auto", width: "100%" }}>
          <p style={{ fontFamily: SANS, fontSize: "0.8rem", fontWeight: 700, letterSpacing: "0.02em", color: TEXT, marginBottom: 9 }}>Your Big Picture</p>
          <h1 style={{ fontFamily: SANS, fontWeight: 700, fontSize: "2.3rem", color: accent, letterSpacing: "-0.025em", lineHeight: 1.15, marginBottom: 12 }}>{roadmap.display_title || roadmap.goal}</h1>
          <p style={{ fontFamily: SANS, fontSize: "1.05rem", color: TEXT_MID, lineHeight: 1.6, marginBottom: "2.25rem" }}>
            Here is the whole path, the phases you'll move through. You'll work one phase at a time, and it adapts as you go. This overview is shown once.
          </p>
          {phases.map((p, i) => {
            const pal = phasePalette(i);
            return (
              <div key={i} style={{ background: pal.bg, border: `1.5px solid ${pal.border}`, borderRadius: 18, padding: "20px 22px", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
                  <span style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, color: pal.accent, background: "rgba(255,255,255,0.65)", borderRadius: 7, padding: "4px 10px" }}>Phase {i + 1} · {p.month_count} month{p.month_count > 1 ? "s" : ""}</span>
                </div>
                <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 21, color: TEXT, letterSpacing: "-0.01em", marginBottom: p.blurb ? 7 : 9 }}>{p.title}</div>
                {p.blurb && <p style={{ fontFamily: SANS, fontSize: 15, color: TEXT_MID, lineHeight: 1.55, margin: "0 0 11px" }}>{p.blurb}</p>}
                {(p.month_focuses || []).filter(Boolean).length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                    {(p.month_focuses || []).filter(Boolean).map((f, j) => (
                      <span key={j} style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 600, color: pal.accent, background: "rgba(255,255,255,0.55)", borderRadius: 7, padding: "4px 10px" }}>{f}</span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <button onClick={() => setPhase(phaseBusy ? "phasing" : "ready")}
            style={{ width: "100%", fontFamily: SANS, fontSize: "1.05rem", fontWeight: 700, cursor: "pointer", padding: "15px", borderRadius: 12, border: "none", marginTop: "0.6rem", background: "var(--accent)", color: WHITE, boxShadow: "0 6px 20px rgba(var(--accent-rgb),0.3)" }}>
            Start Phase 1
          </button>
        </motion.div>
      )}

      {/* Ongoing phase tracker */}
      {phase === "ready" && roadmap && (
        <div style={{ maxWidth: 900, margin: "0 auto", width: "100%" }}>
          {/* Disclaimer note, top-right */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
            <span style={{ fontFamily: SANS, fontSize: "0.84rem", color: TEXT_MID, textAlign: "right", maxWidth: 320, lineHeight: 1.4 }}>
              Take the suggested time per phase. Pacing beats rushing.
            </span>
          </div>

          {/* Header */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} style={{ marginBottom: "2.5rem" }}>
            <p style={{ fontFamily: SANS, fontSize: "0.82rem", fontWeight: 700, letterSpacing: "0.02em", color: TEXT, marginBottom: 9 }}>
              Your Roadmap · {roadmap.timeframe_months} months
            </p>
            <h1 style={{ fontFamily: SANS, fontWeight: 700, fontSize: "2.3rem", color: accent, letterSpacing: "-0.025em", lineHeight: 1.15 }}>
              {roadmap.display_title || roadmap.goal}
            </h1>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 10, flexWrap: "wrap" }}>
              <button onClick={() => setPlanModal(true)}
                style={{ fontFamily: SANS, fontSize: "0.92rem", fontWeight: 600, color: TEXT_MID, background: "none", border: "none", cursor: "pointer", padding: 0, display: "inline-flex", alignItems: "center", gap: 5 }}>
                View full plan
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
              <span style={{ width: 4, height: 4, borderRadius: "50%", background: BORDER, flexShrink: 0 }} />
              <button onClick={() => setDeleteModal(true)}
                style={{ fontFamily: SANS, fontSize: "0.92rem", fontWeight: 600, color: TEXT_MID, background: "none", border: "none", cursor: "pointer", padding: 0, display: "inline-flex", alignItems: "center", gap: 5, transition: "color 0.15s" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = DANGER)}
                onMouseLeave={(e) => (e.currentTarget.style.color = TEXT_MID)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                Delete roadmap
              </button>
            </div>
          </motion.div>

          {/* Phases */}
          {phases.map((p, i) => {
            const pal = phasePalette(i);
            const status = p.status || "locked";
            const isActive = status === "active";
            const isCompleted = status === "completed";
            const isOpen = expanded.has(i);
            const pn = phaseNodes(p);
            const nextToUnlock = status === "locked" && i === phases.findIndex((x) => x.status === "active") + 1
              && phases.some((x) => x.status === "active");

            return (
              <div key={i} style={{ marginBottom: 16 }}>
                <button
                  onClick={() => { if (status === "locked") return; setExpanded((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; }); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left",
                    cursor: status === "locked" ? "default" : "pointer",
                    background: isActive ? pal.bg : WHITE, border: `1.5px solid ${isActive ? pal.border : BORDER}`,
                    borderRadius: 16, padding: "17px 20px", opacity: status === "locked" ? 0.6 : 1,
                  }}>
                  {/* status glyph */}
                  <span style={{ flexShrink: 0, width: 26, height: 26, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center",
                    background: isCompleted ? GREEN : isActive ? pal.accent : "transparent",
                    border: status === "locked" ? `2px solid ${BORDER}` : "none" }}>
                    {isCompleted ? (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={WHITE} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    ) : isActive ? (
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: WHITE }} />
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={TEXT_FAINT} strokeWidth="2.4" strokeLinecap="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
                    )}
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontFamily: SANS, fontSize: 11.5, fontWeight: 700, letterSpacing: "0.02em", color: isActive ? pal.accent : TEXT_MID }}>Phase {i + 1} · {p.month_count} mo</span>
                      {isActive && <span style={{ fontFamily: SANS, fontSize: 11.5, fontWeight: 700, letterSpacing: "0.02em", background: pal.accent, color: WHITE, borderRadius: 6, padding: "3px 9px" }}>Active</span>}
                      {isCompleted && p.reflection?.readiness_score != null && (
                        <span style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 700, color: GREEN }}>Readiness {p.reflection.readiness_score}</span>
                      )}
                    </div>
                    <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 18, color: status === "locked" ? TEXT_MUTED : TEXT, lineHeight: 1.25, marginTop: 3 }}>{p.title}</div>
                  </div>
                  {status !== "locked" && (
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={TEXT_MID} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 0.2s" }}><polyline points="9 18 15 12 9 6"/></svg>
                  )}
                </button>

                {nextToUnlock && (
                  <p style={{ fontFamily: SANS, fontSize: "0.88rem", color: TEXT_MID, margin: "9px 0 0 12px" }}>Unlocks after you complete the current phase.</p>
                )}

                <AnimatePresence initial={false}>
                  {isOpen && status !== "locked" && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.25 }}
                      style={{ overflow: "hidden", paddingLeft: 8, marginTop: 13 }}>
                      {p.blurb && <p style={{ fontFamily: SANS, fontSize: "0.98rem", color: TEXT_MID, lineHeight: 1.55, margin: "0 0 13px" }}>{p.blurb}</p>}
                      {isActive && phaseBusy && pn.length === 0 ? (
                        <p style={{ fontFamily: SANS, fontSize: "0.98rem", color: TEXT_MID, marginBottom: 13 }}>Generating this phase…</p>
                      ) : (
                        pn.map((node) => <NodeRow key={node.id} node={node} />)
                      )}
                      {isCompleted && p.reflection?.summary && (
                        <p style={{ fontFamily: SANS, fontSize: "0.94rem", color: TEXT_MUTED, fontStyle: "italic", lineHeight: 1.5, margin: "4px 0 0", paddingLeft: 12, borderLeft: `2px solid ${BORDER}` }}>{p.reflection.summary}</p>
                      )}
                      {isActive && pn.length > 0 && (
                        <button onClick={() => setReflectFor(i)} disabled={phaseBusy}
                          style={{ width: "100%", fontFamily: SANS, fontSize: "1.02rem", fontWeight: 700, cursor: "pointer", padding: "14px", borderRadius: 12, border: "none", marginTop: 8, background: pal.accent, color: WHITE, boxShadow: `0 5px 16px ${pal.accent}40` }}>
                          {i + 1 < phases.length ? "Complete phase & continue" : "Complete final phase"}
                        </button>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {planModal && roadmap && <PlanModal roadmap={roadmap} onClose={() => setPlanModal(false)} />}
        {deleteModal && roadmap && (
          <DeleteRoadmapModal
            title={roadmap.display_title || roadmap.goal}
            canRebuild={roadmapUsed < LIMITS.roadmap_gen}
            deleting={deleting}
            onConfirm={handleDelete}
            onCancel={() => setDeleteModal(false)}
          />
        )}
        {reflectFor != null && phases[reflectFor] && (
          <ReflectModal
            phase={phases[reflectFor]}
            nodeTitles={phaseNodes(phases[reflectFor]).map((n) => n.title)}
            submitting={reflecting}
            onSubmit={(text) => submitReflection(reflectFor, text)}
            onCancel={() => setReflectFor(null)}
          />
        )}
      </AnimatePresence>

      {/* Global phase-generation indicator (covers cases without the reflection modal) */}
      <AnimatePresence>
        {phaseBusy && phase === "ready" && reflectFor == null && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
            style={{ position: "fixed", bottom: isMobile ? "calc(72px + env(safe-area-inset-bottom, 0px))" : 24, left: "50%", transform: "translateX(-50%)", zIndex: 400, display: "flex", alignItems: "center", gap: 10, maxWidth: "calc(100vw - 24px)", background: "#141413", color: "#fff", padding: "11px 18px", borderRadius: 12, boxShadow: "0 10px 30px rgba(0,0,0,0.25)" }}>
            <span style={{ width: 16, height: 16, borderRadius: "50%", border: "2.5px solid rgba(255,255,255,0.25)", borderTopColor: "#fff", animation: "rm-spin 0.7s linear infinite" }} />
            <span style={{ fontFamily: SANS, fontWeight: 600, fontSize: "0.9rem" }}>Generating your next phase…</span>
            <style>{`@keyframes rm-spin { to { transform: rotate(360deg) } }`}</style>
          </motion.div>
        )}
      </AnimatePresence>

      {limitModal && <LimitModal feature={limitFeature} onClose={() => setLimitModal(false)} />}
    </div>
  );
}
