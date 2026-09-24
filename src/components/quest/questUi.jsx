import { useEffect, useRef, useState } from "react";
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
// Real fire colors, never the accent: a blue flame reads as a drop. Below a
// week the flame is a sticker (one tongue, a dark outline and solid bottom
// edge like the raised Quest buttons); from FLAME_GROWS_AT on it becomes a
// three-tongue campfire, so a long streak looks like one.

export const FLAME_GROWS_AT = 7;

const TONGUE = "M33 3C37 13 51 21 51 39C51 52 43 61 32 61C21 61 13 52 13 40C13 31 18 25 22 20C23 26 25 29 28 31C27 21 29 12 33 3Z";
// Each layer names the beat it moves to: "sway" (the body), "sway-fast"
// (a middle layer swaying the other way, so the layers never move as one)
// and "core" (the yellow heart, stretching fastest).
const STICKER = {
  viewBox: "-3 -3 70 72",
  emberY: 12,
  layers: [
    { beat: "sway", paths: [
      { d: TONGUE, on: "#C24E00", off: "#bdbcb9", transform: "translate(0 4)" },
      { d: TONGUE, on: "#FF8A00", off: "#d6d5d2", stroke: ["#C24E00", "#bdbcb9"] },
    ], glint: true },
    { beat: "core", paths: [
      { d: "M32 27C35 34 42 38 42 47C42 54 37 58 32 58C27 58 22 54 22 47C22 41 28 36 32 27Z", on: "#FFD23F", off: "#eceae7" },
    ] },
  ],
};
const CAMPFIRE = {
  viewBox: "0 0 64 64",
  emberY: 8,
  layers: [
    { beat: "sway", paths: [{ d: "M32 2C38 12 48 16 50 30C54 26 55 20 54 16C60 24 62 34 60 42C58 54 46 62 32 62C18 62 6 54 4 42C2 32 6 24 11 18C11 24 13 28 16 30C16 18 24 10 32 2Z", on: "#F2542D", off: "#cfcecb" }] },
    { beat: "sway-fast", paths: [{ d: "M32 15C36 23 44 27 45 37C48 34 49 31 49 28C53 34 54 40 53 45C51 54 43 59 32 59C21 59 13 54 11 45C10 39 12 34 15 30C16 34 18 37 21 38C21 28 26 22 32 15Z", on: "#FF9A1F", off: "#dcdbd8" }] },
    { beat: "core", paths: [{ d: "M32 31C35 37 41 41 41 48C41 54 37 58 32 58C27 58 23 54 23 48C23 42 29 38 32 31Z", on: "#FFD84A", off: "#eceae7" }] },
  ],
};
// [drift x, start x, delay s, radius]
const EMBERS = [[-6, 27, 0, 3.4], [7, 38, 0.6, 3], [-3, 32, 1.2, 2.6]];

// Plain CSS rather than framer-motion: the flame sits in the nav on every
// page, loops forever, and has up to six moving parts, which CSS runs off the
// main thread. Injected once, so the nav chip does not depend on the Quest
// page's own styles being mounted.
const FLAME_CSS = `
.qf-sway, .qf-sway-fast, .qf-core, .qf-ember { transform-box: fill-box; transform-origin: 50% 100%; }
.qf-live .qf-sway { animation: qf-sway 1.5s ease-in-out infinite; }
.qf-live .qf-sway-fast { animation: qf-sway 1.05s ease-in-out infinite reverse; }
.qf-live .qf-core { animation: qf-core 0.8s ease-in-out infinite; }
.qf-ember { opacity: 0; animation: qf-ember 1.8s ease-out infinite; }
@keyframes qf-sway { 0%, 100% { transform: skewX(0) scaleY(1); } 25% { transform: skewX(-6deg) scaleY(1.06); }
  50% { transform: skewX(2deg) scaleY(0.97); } 75% { transform: skewX(5deg) scaleY(1.05); } }
@keyframes qf-core { 0%, 100% { transform: scale(1, 1); } 30% { transform: scale(0.88, 1.16); } 60% { transform: scale(1.08, 0.92); } }
@keyframes qf-ember { 0% { transform: translate(0, 0) scale(1); opacity: 0; } 15% { opacity: 1; }
  100% { transform: translate(var(--qf-dx), -30px) scale(0.35); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .qf-live * { animation: none !important; } .qf-ember { display: none; } }
`;
if (typeof document !== "undefined" && !document.querySelector("style[data-quest-flame]")) {
  const el = document.createElement("style");
  el.dataset.questFlame = "";
  el.textContent = FLAME_CSS;
  document.head.appendChild(el);
}

export function Flame({ size = 22, lit = true, animate = false, streak = 0 }) {
  const stage = streak >= FLAME_GROWS_AT ? CAMPFIRE : STICKER;
  const live = animate && lit;
  return (
    <svg width={size} height={size} viewBox={stage.viewBox} aria-hidden="true" className={live ? "qf-live" : undefined}
      style={{ display: "block", overflow: "visible" }}>
      {stage.layers.map((layer) => (
        <g key={layer.beat} className={`qf-${layer.beat}`}>
          {layer.paths.map((p, i) => (
            <path key={i} d={p.d} fill={lit ? p.on : p.off} transform={p.transform}
              stroke={p.stroke ? p.stroke[lit ? 0 : 1] : undefined} strokeWidth={p.stroke ? 3.5 : undefined}
              strokeLinejoin="round" />
          ))}
          {layer.glint && (
            <ellipse cx="22" cy="42" rx="3" ry="6" transform="rotate(20 22 42)" fill="#fff" opacity={lit ? 0.7 : 0.5} />
          )}
        </g>
      ))}
      {live && EMBERS.map(([dx, x, delay, r]) => (
        <circle key={x} className="qf-ember" cx={x} cy={stage.emberY} r={r} fill="#FFB020" stroke="#F2542D" strokeWidth="1"
          style={{ "--qf-dx": `${dx}px`, animationDelay: `${delay}s` }} />
      ))}
    </svg>
  );
}

/** The Quest nav icon: a torn treasure map with a dotted trail to an X.
 *  An outline icon like the rest of the nav, so it takes `currentColor`. */
export function TreasureMapIcon({ size = 20, strokeWidth = 2 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 5l3-1.2 3 1.2 3-1.2 3 1.2 3-1.2 3 1.2v14l-3 1.2-3-1.2-3 1.2-3-1.2-3 1.2-3-1.2z" />
      <path d="M7 16c1.8-.8 2.8-.1 4-1.5 1-1.2.8-2.7 2.4-3.6" strokeDasharray="0.1 2.6" />
      <path d="M14.9 7.9l3.2 3.2M18.1 7.9l-3.2 3.2" />
    </svg>
  );
}

/** The streak flame on the day it crosses FLAME_GROWS_AT: starts as the
 *  single tongue, then pops into the campfire. */
export function GrowingFlame({ size = 22, streak }) {
  const reduce = useReducedMotion();
  const [grown, setGrown] = useState(!!reduce);
  useEffect(() => {
    if (reduce) return undefined;
    const t = setTimeout(() => setGrown(true), 650);
    return () => clearTimeout(t);
  }, [reduce]);
  return (
    <motion.span key={grown ? "grown" : "small"} style={{ display: "inline-block", transformOrigin: "50% 90%" }}
      initial={grown && !reduce ? { scale: 0.6 } : false}
      animate={grown && !reduce ? { scale: [0.6, 1.35, 1] } : { scale: 1 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}>
      <Flame size={size} animate={grown} streak={grown ? streak : FLAME_GROWS_AT - 1} />
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
