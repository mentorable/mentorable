import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useTheme } from "../../lib/ThemeContext.jsx";
import {
  AMBER_BG, AMBER_TEXT, BG as UI_BG, BORDER, DANGER as UI_DANGER, FOCUS_CLASS, RADIUS, SANS as UI_SANS, TEXT, TEXT_MID,
  TEXT_MUTED, TEXT_FAINT, WHITE as UI_WHITE, useAgentInk,
} from "../ui/tokens.js";
import { Button, inputStyle, textOnPage } from "../ui/kit.jsx";

// ─── Tokens ───────────────────────────────────────────────────────────────────
// Quest sits on the app's shared kit (src/components/ui): a calm shell of white
// cards with a 1px warm border, flat buttons, and the student's accent through
// useAgentInk. Quest keeps its game pieces (the stones, the streak flame, the
// level chip), but they sit flat now: no solid bottom edges. Amber is reserved
// for "behind", and it is never red: behind is a thing to fix, not a failure.

export const SANS   = UI_SANS;
export const BG     = UI_BG;
export const WHITE  = UI_WHITE;
export const INK    = TEXT;
export const MID    = TEXT_MID;
export const MUTED  = TEXT_MUTED;   // the lightest text colour on the page
export const FAINT  = TEXT_FAINT;   // icons and decoration only, never text
export const LINE   = BORDER;
export const STONE      = "#e6e3de";
export const STONE_EDGE = "#cfcac2";
export const AMBER      = AMBER_TEXT;   // amber as text
export const AMBER_EDGE = "#d97706";    // amber as a line or a dashed stone edge (3:1 on white)
export const AMBER_WASH = AMBER_BG;
export const AMBER_LINE = "#f3d9a4";    // the soft amber border of a banner
export const DANGER     = UI_DANGER;

export const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** The kit's accent colours (useAgentInk), plus the names older Quest code
 *  used: `wash` is the soft tint, `edge` the accent as a readable line. */
export function useQuestColors() {
  const { accentRgb } = useTheme();
  const ink = useAgentInk();
  return useMemo(() => ({ ...ink, accentRgb, edge: ink.text, wash: ink.softer, page: textOnPage(ink) }), [ink, accentRgb]);
}

// ─── Flame ────────────────────────────────────────────────────────────────────
// Real fire colors, never the accent: a blue flame reads as a drop. Below a
// week the flame is a sticker (one tongue, with a dark outline and a darker
// shadow layer under it); from FLAME_GROWS_AT on it becomes a
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

/** Quest's button, drawn as the kit Button. `tone`: accent (the primary
 *  fill), quiet (outlined), amber (flat amber, for catching up) or danger. */
export function Chunky({ children, onClick, disabled, tone = "accent", full, small, type = "button", style, ...rest }) {
  const kind = { accent: "primary", quiet: "secondary", danger: "danger", amber: "secondary" }[tone] || "primary";
  const amber = tone === "amber"
    ? { background: AMBER_BG, color: AMBER_TEXT, border: `1px solid ${AMBER_TEXT}` }
    : null;
  return (
    <Button kind={kind} type={type} onClick={disabled ? undefined : onClick} disabled={disabled}
      style={{ width: full ? "100%" : undefined, fontSize: small ? "0.95rem" : "1rem",
        padding: small ? "8px 16px" : "10px 20px", ...amber, ...style }}
      {...rest}>
      {children}
    </Button>
  );
}

/** A plain text button for secondary actions, at least 44px tall. */
export function TextButton({ children, onClick, color, style, disabled, ...rest }) {
  const c = useQuestColors();
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={FOCUS_CLASS}
      style={{ fontFamily: SANS, fontWeight: 700, fontSize: "0.95rem", color: color || c.page,
        background: "none", border: "none", padding: "6px 8px", minHeight: 44, borderRadius: RADIUS.control,
        cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.55 : 1, ...style }}
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
        fontFamily: SANS, fontWeight: 800, fontSize: "0.9rem", color: c.button.fg, whiteSpace: "nowrap",
        background: c.button.bg, borderRadius: 8, padding: compact ? "2px 7px" : "3px 9px", lineHeight: 1.35,
        fontVariantNumeric: "tabular-nums",
      }}>
        Lv {stats.level}
      </span>
      {!compact && (
        <span aria-hidden="true" style={{ width: 64, height: 8, borderRadius: 99, background: STONE, overflow: "hidden" }}>
          <motion.span
            initial={false}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            style={{ display: "block", height: "100%", background: c.button.bg, borderRadius: 99 }}
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
        style={{ width: "100%", maxWidth: 560, maxHeight: "88vh", overflowY: "auto", outline: "none", boxSizing: "border-box",
          background: WHITE, borderRadius: `${RADIUS.card + 4}px ${RADIUS.card + 4}px 0 0`, padding: "10px 22px 28px",
          border: `1px solid ${BORDER}`, borderBottom: "none",
          paddingBottom: "calc(28px + env(safe-area-inset-bottom, 0px))",
          boxShadow: "0 -12px 40px rgba(20,20,19,0.14)" }}
      >
        <div aria-hidden="true" style={{ width: 44, height: 5, borderRadius: 99, background: BORDER, margin: "0 auto 16px" }} />
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
        display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}
    >
      <motion.div
        ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label={label}
        initial={{ opacity: 0, y: 18, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.98 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: width, maxHeight: "88vh", overflowY: "auto", outline: "none", boxSizing: "border-box",
          background: WHITE, borderRadius: RADIUS.card, border: `1px solid ${BORDER}`, padding: "1.5rem",
          boxShadow: "0 24px 60px rgba(20,20,19,0.18)" }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

// ─── Inputs ───────────────────────────────────────────────────────────────────

/** A pill control's look, chosen or not, as the kit's ChoiceChips draw it. */
export function choiceLook(c, on) {
  return {
    fontFamily: SANS, fontWeight: 700, fontSize: "0.95rem", cursor: "pointer", boxSizing: "border-box",
    minHeight: 44, borderRadius: RADIUS.control, border: `1.5px solid ${on ? c.text : BORDER}`,
    background: on ? c.softer : WHITE, color: on ? c.onSoft : TEXT_MID,
  };
}

export function Segmented({ options, value, onChange, label }) {
  const c = useQuestColors();
  return (
    <div role="radiogroup" aria-label={label} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.value)}
            className={FOCUS_CLASS} style={{ ...choiceLook(c, on), padding: "10px 18px", minWidth: 92 }}>
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
    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
      {DAY_LETTERS.map((l, d) => {
        const rest = set.has(d);
        return (
          <button key={d} type="button" onClick={() => toggle(d)} aria-pressed={rest}
            aria-label={`${DAY_NAMES[d]}${rest ? ", rest day" : ""}`} className={FOCUS_CLASS}
            style={{
              ...choiceLook(c, !rest), width: 44, height: 44, padding: 0,
              ...(rest ? { background: "#f3f1ed", color: TEXT_MUTED } : null),
              textDecoration: rest ? "line-through" : "none",
            }}>
            {l}
          </button>
        );
      })}
    </div>
  );
}

/** The kit's field look. Pair it with the kit's INPUT_CLASS for the focus ring. */
export const fieldStyle = { ...inputStyle };

export function ErrorLine({ children }) {
  if (!children) return null;
  return (
    <p role="alert" style={{ fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700, color: DANGER, margin: "10px 0 0" }}>
      {children}
    </p>
  );
}

/** Styles the Quest page needs, mounted once: the stones' focus ring, in the
 *  page's ring colour (set by ringVar on the page root). */
export function QuestStyles() {
  return (
    <style>{`
      .quest-chunky:focus-visible, .quest-stone:focus-visible { outline: 3px solid var(--ag-ring, #1d4ed8); outline-offset: 3px; }
      .quest-stone:focus:not(:focus-visible) { outline: none; }
    `}</style>
  );
}
