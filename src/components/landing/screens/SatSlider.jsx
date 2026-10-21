import { useEffect, useId, useRef, useState } from "react";
import { balance, suggestCategory } from "../../../lib/collegeCategory.js";
import { SR_ONLY } from "../../ui/kit.jsx";
import { C, SANS, clamp01, useInView, useReduce } from "../kit.js";
import { TextLink } from "../frames.jsx";
import { COLLEGES } from "../data.js";

// The live SAT slider under the College List story (PLAN.md 6.4.2): the one
// control on the page that drives a mockup. It sits outside the inert screen
// and is fully interactive; the screen recomputes every suggested category
// with the app's real rule (`suggestCategory`) from the value it is handed.
//
// `useSat()` is the story's `useExtra`: it owns the value and returns the
// screen prop and the control.

const MIN = 1150;
const MAX = 1600;
const STEP = 10;
const DEFAULT = 1450;

const SLIDER_CSS = `
.lp-sat { -webkit-appearance: none; appearance: none; width: 100%; height: 44px; margin: 0; padding: 0; background: transparent;
  cursor: pointer; display: block; }
.lp-sat:focus { outline: none; }
.lp-sat:focus-visible { outline: 3px solid ${C.accent}; outline-offset: 2px; border-radius: 4px; }
.lp-sat::-webkit-slider-runnable-track { height: 4px; border-radius: 0;
  background: linear-gradient(to right, ${C.accent} 0 var(--lp-fill, 0%), ${C.line} var(--lp-fill, 0%) 100%); }
.lp-sat::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 20px; height: 20px; border-radius: 0;
  background: ${C.accent}; border: 0; margin-top: -8px; }
.lp-sat::-moz-range-track { height: 4px; border-radius: 0; background: ${C.line}; }
.lp-sat::-moz-range-progress { height: 4px; background: ${C.accent}; }
.lp-sat::-moz-range-thumb { width: 20px; height: 20px; border-radius: 0; background: ${C.accent}; border: 0; }
`;
if (typeof document !== "undefined" && !document.querySelector("style[data-lp-sat]")) {
  const el = document.createElement("style");
  el.dataset.lpSat = "";
  el.textContent = SLIDER_CSS;
  document.head.appendChild(el);
}

// The list as the College screen last showed it (with Ohio University once it
// is added, and Case Western where the student put it), so the announcement
// counts the list as it stands at the current step. Before the screen has
// rendered, the six list schools plus the one the story adds.
let latestList = null;
const listeners = new Set();
/** Called by CollegeScreen whenever its list changes. */
export function publishList(items) {
  latestList = Array.isArray(items) ? items : null;
  listeners.forEach((fn) => fn(latestList));
}
function currentList() {
  return latestList || [...COLLEGES.list, COLLEGES.added];
}

/** "2 reach, 3 target, 2 likely" for `sat` over `items`, by the real rule and the real `balance()`. */
export function countsLine(sat, items) {
  const stats = { sat, act: null, gpa: COLLEGES.stats.gpa };
  const list = items.map((row) => {
    if (row.category_source === "student") return row;
    const s = suggestCategory(stats, row);
    return s ? { ...row, category: s.category } : row;
  });
  const b = balance(list);
  return `${b.reach} reach, ${b.target} target, ${b.likely} likely`;
}

const snap = (v) => Math.max(MIN, Math.min(MAX, Math.round(Number(v) / STEP) * STEP));

export default function SatSlider({ value = DEFAULT, onChange }) {
  const reduce = useReduce();
  const ref = useRef(null);
  const id = useId();
  const inView = useInView(ref, { amount: 0.5, once: true });
  const [announce, setAnnounce] = useState("");
  const nudged = useRef(false);
  const latest = useRef(onChange);
  latest.current = onChange;

  // On first view, once: the thumb nudges 1450 to 1470 and back over 900ms,
  // so the slider reads as something to move. Not under reduced motion.
  useEffect(() => {
    if (!inView || reduce || nudged.current) return undefined;
    nudged.current = true;
    const base = snap(value);
    const start = performance.now();
    let raf = 0;
    const tick = (now) => {
      const p = clamp01((now - start) / 900);
      latest.current?.(p >= 1 ? base : snap(base + 20 * Math.sin(Math.PI * p)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, reduce]);

  const set = (v) => {
    const next = snap(v);
    onChange?.(next);
    setAnnounce(`SAT ${next}: ${countsLine(next, currentList())}`);
  };
  const fill = `${((snap(value) - MIN) / (MAX - MIN)) * 100}%`;

  return (
    <div ref={ref} style={{ marginTop: 20, maxWidth: 360 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <label htmlFor={id} style={{ fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700, color: C.ink }}>Try another SAT score</label>
        <span aria-hidden="true" style={{ fontFamily: SANS, fontSize: "1.5rem", fontWeight: 700, color: C.accent, lineHeight: 1.2,
          fontVariantNumeric: "lining-nums tabular-nums" }}>{snap(value)}</span>
      </div>
      <input id={id} className="lp-sat" type="range" min={MIN} max={MAX} step={STEP} value={snap(value)}
        aria-valuetext={`SAT ${snap(value)}`} onChange={(e) => set(e.target.value)} style={{ "--lp-fill": fill }} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: -4 }}>
        <span style={{ fontFamily: SANS, fontSize: "0.95rem", fontWeight: 600, color: C.muted }}>{MIN} to {MAX}</span>
        <TextLink arrow={null} onClick={() => set(DEFAULT)} aria-label="Reset the SAT score to 1450">Reset</TextLink>
      </div>
      <p aria-live="polite" style={SR_ONLY}>{announce}</p>
    </div>
  );
}

/** The College List story's `useExtra`: the screen prop and the control. */
export function useSat() {
  const [sat, setSat] = useState(DEFAULT);
  return { screenProps: { sat }, control: <SatSlider value={sat} onChange={setSat} /> };
}
