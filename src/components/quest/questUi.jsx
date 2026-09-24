import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useTheme } from "../../lib/ThemeContext.jsx";
import { darken, lighten } from "../../lib/theme.js";

// ─── Tokens ───────────────────────────────────────────────────────────────────
// The Quest page is the one place the app gets bold: raised buttons and stones
// with a solid bottom edge, all derived from the student's own accent. Amber
// is reserved for "behind", and it is never red: behind is a thing to fix,
// not a failure.

export const SANS   = "'Raleway', sans-serif";
export const BG     = "#F5F5F5";
export const WHITE  = "#ffffff";
export const INK    = "#141413";
export const MID    = "#3d3d3a";
export const MUTED  = "#5d5b55";
export const FAINT  = "#8a877f";
export const LINE   = "#e4e2dd";
export const STONE      = "#e3e3e1";
export const STONE_EDGE = "#cfcfcc";
export const AMBER      = "#b45309";
export const AMBER_EDGE = "#f59e0b";
export const AMBER_WASH = "#fff7e6";
export const DANGER     = "#b42318";

export const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Accent-derived colors for the raised style. */
export function useQuestColors() {
  const { accent, accentRgb } = useTheme();
  return {
    accent,
    accentRgb,
    edge: darken(accent, 0.28),
    soft: lighten(accent, 0.55),
    wash: `rgba(${accentRgb},0.08)`,
  };
}

// ─── Flame ────────────────────────────────────────────────────────────────────

export function Flame({ size = 22, lit = true, animate = false }) {
  const { accent } = useTheme();
  const reduce = useReducedMotion();
  const top = lit ? lighten(accent, 0.45) : "#dcdcda";
  const bottom = lit ? accent : "#bdbdba";
  const id = `flame-${size}-${lit ? "l" : "d"}`;
  const svg = (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ display: "block" }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={top} />
          <stop offset="100%" stopColor={bottom} />
        </linearGradient>
      </defs>
      <path
        d="M12.4 2.2c.4 2.9-1 4.6-2.4 6.2-1.3 1.5-2.6 3-2.6 5.5 0 1.3.4 2.4 1.1 3.3-.5-2.1.4-3.6 1.6-4.8.2 1.4 1 2.3 1.9 2.9.9-2.4.6-4.2 0-5.9 2.9 1.7 5.2 4.4 5.2 7.6 0 3.2-2.7 5.3-6 5.3S5 20.2 5 16.4c0-4.8 3.3-7 5-9.7.8-1.4 1.5-2.9 2.4-4.5Z"
        fill={`url(#${id})`}
      />
    </svg>
  );
  if (!animate || !lit || reduce) return svg;
  return (
    <motion.span
      style={{ display: "inline-block", transformOrigin: "50% 90%" }}
      animate={{ scaleY: [1, 1.07, 0.97, 1.04, 1], rotate: [0, -2, 1.5, -1, 0] }}
      transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
    >
      {svg}
    </motion.span>
  );
}

// ─── Buttons ──────────────────────────────────────────────────────────────────

/** The raised Quest button. `tone` picks accent, amber or quiet white. */
export function Chunky({ children, onClick, disabled, tone = "accent", full, small, type = "button", style, ...rest }) {
  const c = useQuestColors();
  const palette = {
    accent: { bg: c.accent, fg: WHITE, edge: c.edge },
    amber:  { bg: AMBER_EDGE, fg: "#3b2503", edge: "#c27c05" },
    quiet:  { bg: WHITE, fg: INK, edge: "#d6d4cf" },
  }[tone];
  const off = disabled;
  return (
    <button
      type={type}
      onClick={off ? undefined : onClick}
      disabled={off}
      className="quest-chunky"
      style={{
        fontFamily: SANS, fontWeight: 800, letterSpacing: "0.01em",
        fontSize: small ? "0.9rem" : "1rem",
        padding: small ? "9px 16px" : "13px 22px",
        width: full ? "100%" : undefined,
        borderRadius: 14,
        border: tone === "quiet" ? `2px solid ${palette.edge}` : "none",
        background: off ? "#e6e6e4" : palette.bg,
        color: off ? "#9a9892" : palette.fg,
        boxShadow: off ? "0 4px 0 #d2d2cf" : `0 4px 0 ${palette.edge}`,
        cursor: off ? "not-allowed" : "pointer",
        transform: "translateY(0)",
        transition: "transform 0.08s, box-shadow 0.08s",
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

/** A plain text button for secondary actions. */
export function TextButton({ children, onClick, color, style, ...rest }) {
  const c = useQuestColors();
  return (
    <button type="button" onClick={onClick}
      style={{ fontFamily: SANS, fontWeight: 700, fontSize: "0.92rem", color: color || c.accent,
        background: "none", border: "none", padding: "6px 4px", cursor: "pointer", ...style }}
      {...rest}>
      {children}
    </button>
  );
}

// ─── Level ────────────────────────────────────────────────────────────────────

export function LevelChip({ stats, compact }) {
  const c = useQuestColors();
  if (!stats) return null;
  const pct = stats.level_span ? Math.min(100, Math.round((stats.into_level / stats.level_span) * 100)) : 0;
  return (
    <div title={`${stats.into_level} of ${stats.level_span} XP to level ${stats.level + 1}`}
      style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{
        fontFamily: SANS, fontWeight: 800, fontSize: compact ? "0.78rem" : "0.86rem", color: WHITE,
        background: c.accent, borderRadius: 8, padding: compact ? "2px 7px" : "3px 8px",
        boxShadow: `0 2px 0 ${c.edge}`, fontVariantNumeric: "tabular-nums",
      }}>
        Lv {stats.level}
      </span>
      {!compact && (
        <span aria-hidden="true" style={{ width: 64, height: 8, borderRadius: 99, background: STONE, overflow: "hidden" }}>
          <motion.span
            initial={false}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            style={{ display: "block", height: "100%", background: c.accent, borderRadius: 99 }}
          />
        </span>
      )}
    </div>
  );
}

// ─── Overlays ─────────────────────────────────────────────────────────────────

function useEscape(onClose, active = true) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, active]);
}

/** Bottom sheet over the map. Closes on the backdrop and on Escape unless `locked`. */
export function Sheet({ children, onClose, locked, label }) {
  const reduce = useReducedMotion();
  const panel = useRef(null);
  useEscape(onClose, !locked);
  useEffect(() => { panel.current?.focus(); }, []);
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={locked ? undefined : onClose}
      style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(20,20,19,0.42)",
        display: "flex", alignItems: "flex-end", justifyContent: "center" }}
    >
      <motion.div
        ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label={label}
        initial={reduce ? { opacity: 0 } : { y: "100%" }}
        animate={reduce ? { opacity: 1 } : { y: 0 }}
        exit={reduce ? { opacity: 0 } : { y: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 320 }}
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 560, maxHeight: "88vh", overflowY: "auto", outline: "none",
          background: WHITE, borderRadius: "24px 24px 0 0", padding: "10px 22px 28px",
          paddingBottom: "calc(28px + env(safe-area-inset-bottom, 0px))",
          boxShadow: "0 -12px 40px rgba(0,0,0,0.18)" }}
      >
        <div aria-hidden="true" style={{ width: 44, height: 5, borderRadius: 99, background: LINE, margin: "0 auto 16px" }} />
        {children}
      </motion.div>
    </motion.div>
  );
}

/** Centered modal, for the milestone card, confirmations and forms. */
export function Modal({ children, onClose, locked, label, width = 440 }) {
  useEscape(onClose, !locked);
  const panel = useRef(null);
  useEffect(() => { panel.current?.focus(); }, []);
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={locked ? undefined : onClose}
      style={{ position: "fixed", inset: 0, zIndex: 420, background: "rgba(20,20,19,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: "1.25rem" }}
    >
      <motion.div
        ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label={label}
        initial={{ opacity: 0, y: 18, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.98 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: width, maxHeight: "88vh", overflowY: "auto", outline: "none",
          background: WHITE, borderRadius: 22, padding: "1.6rem", boxShadow: "0 30px 80px rgba(0,0,0,0.28)" }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

// ─── Inputs ───────────────────────────────────────────────────────────────────

export function Segmented({ options, value, onChange, label }) {
  const c = useQuestColors();
  return (
    <div role="radiogroup" aria-label={label} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.value)}
            style={{
              fontFamily: SANS, fontWeight: 800, fontSize: "0.98rem", cursor: "pointer",
              padding: "12px 18px", borderRadius: 14, minWidth: 92,
              border: `2px solid ${on ? c.accent : LINE}`, background: on ? c.wash : WHITE,
              color: on ? c.accent : MID, boxShadow: `0 3px 0 ${on ? c.edge : LINE}`,
            }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function DayToggles({ value, onChange }) {
  const c = useQuestColors();
  const set = new Set(value);
  const toggle = (d) => {
    const next = new Set(set);
    if (next.has(d)) next.delete(d);
    else if (next.size < 6) next.add(d);        // a quest needs at least one day
    onChange([...next].sort());
  };
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {DAY_LETTERS.map((l, d) => {
        const rest = set.has(d);
        return (
          <button key={d} type="button" onClick={() => toggle(d)} aria-pressed={rest}
            aria-label={`${DAY_NAMES[d]}${rest ? ", rest day" : ""}`}
            style={{
              width: 42, height: 42, borderRadius: 12, cursor: "pointer",
              fontFamily: SANS, fontWeight: 800, fontSize: "0.95rem",
              border: `2px solid ${rest ? LINE : c.accent}`,
              background: rest ? "#f1f1ef" : c.wash,
              color: rest ? FAINT : c.accent,
              textDecoration: rest ? "line-through" : "none",
            }}>
            {l}
          </button>
        );
      })}
    </div>
  );
}

export const fieldStyle = {
  width: "100%", boxSizing: "border-box", fontFamily: SANS, fontSize: "1rem", color: INK,
  padding: "12px 14px", borderRadius: 12, border: `2px solid ${LINE}`, background: WHITE,
  outline: "none", lineHeight: 1.5,
};

export function ErrorLine({ children }) {
  if (!children) return null;
  return (
    <p role="alert" style={{ fontFamily: SANS, fontSize: "0.92rem", fontWeight: 700, color: DANGER, margin: "10px 0 0" }}>
      {children}
    </p>
  );
}

/** Keyframes the Quest page needs, mounted once. */
export function QuestStyles() {
  return (
    <style>{`
      .quest-chunky:not(:disabled):active { transform: translateY(3px) !important; box-shadow: 0 1px 0 transparent !important; }
      .quest-chunky:focus-visible, .quest-stone:focus-visible { outline: 3px solid rgba(var(--accent-rgb),0.45); outline-offset: 3px; }
    `}</style>
  );
}
