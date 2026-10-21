import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Mascot from "../../agents/Mascot.jsx";
import { SpeechBubble, TIP } from "../../ui/SpeechBubble.jsx";
import { FOCUS_CLASS } from "../../ui/tokens.js";
import { SR_ONLY } from "../../ui/kit.jsx";
import { BEAKER_LINES, QUILL_LINES, TALON_LINES } from "../../../lib/agents/registry.js";
import { useReduce } from "../kit.js";

// A perched agent: a real <button> holding the sprite. Tap it and it hops
// (6px up in two 3px steps over 120ms and back, no easing), switches to the
// `delivering` pose for 5s, and the real pixel SpeechBubble opens under it
// with the registry's hub tagline. The birds sit outside every Mockup, so
// they stay interactive while the screens behind them are inert.
//
// `usePerches` keeps one bubble open at a time (Escape, a tap elsewhere or
// another bird closes it); `PerchLayer` is the box the birds are placed in
// and carries the polite live region that mirrors the open bubble's text.
// `useBox` measures an element, for the hero, which places birds in px.

export const PERCH_AGENTS = {
  beaker: { name: "Beaker", role: "the outreach pelican", line: BEAKER_LINES.hubTagline },
  talon: { name: "Talon", role: "the opportunity hawk", line: TALON_LINES.hubTagline },
  quill: { name: "Quill", role: "the essay owl", line: QUILL_LINES.hubTagline },
};

const POSE_MS = 5000;
const HOP_MS = 240;
const BUBBLE_W = 340;

const PERCH_CSS = `
@keyframes lp-hop { 0%, 100% { transform: translateY(0); } 25% { transform: translateY(-3px); } 50% { transform: translateY(-6px); } 75% { transform: translateY(-3px); } }
.lp-hop { animation: lp-hop ${HOP_MS}ms steps(1, end); }
@media (prefers-reduced-motion: reduce) { .lp-hop { animation: none; } }
`;
if (typeof document !== "undefined" && !document.querySelector("style[data-lp-perch]")) {
  const el = document.createElement("style");
  el.dataset.lpPerch = "";
  el.textContent = PERCH_CSS;
  document.head.appendChild(el);
}

/** One bubble open at a time. -> { open, toggle(agent), close() }. */
export function usePerches() {
  const [open, setOpen] = useState(null);
  const close = useCallback(() => setOpen(null), []);
  const toggle = useCallback((agent) => setOpen((cur) => (cur === agent ? null : agent)), []);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setOpen(null); };
    const onDown = (e) => {
      const el = e.target instanceof Element ? e.target : null;
      if (!el || !el.closest("[data-lp-perch]")) setOpen(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);
  return { open, toggle, close };
}

/** An element's size in whole px, kept current. -> { w, h }. */
export function useBox(ref) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const read = () => {
      const r = el.getBoundingClientRect();
      const next = { w: Math.round(r.width), h: Math.round(r.height) };
      setBox((b) => (b.w === next.w && b.h === next.h ? b : next));
    };
    read();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", read);
      return () => window.removeEventListener("resize", read);
    }
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return box;
}

/** The box the birds are placed in (absolute; the hero sets its bounds).
 *  Bubbles are kept inside it, and it carries the live region. */
export function PerchLayer({ open, children, style, boxRef }) {
  const info = open ? PERCH_AGENTS[open] : null;
  return (
    <div ref={boxRef} data-lp-perch-layer="" style={{ position: "absolute", pointerEvents: "none", zIndex: 4, ...style }}>
      {children}
      <div aria-live="polite" style={SR_ONLY}>{info ? `${info.name} says: ${info.line}` : ""}</div>
    </div>
  );
}

/**
 * agent: "beaker" | "talon" | "quill". size: the button's box (96 or 64).
 * state: the resting pose. facing: "right" (as drawn) or "left" (mirrored).
 * settled: sprites hold frame 0. onPoke(agent): the tap, after the hop
 * starts. open: whether this bird's bubble shows (at most 340 wide, and
 * never wider than the layer less 24). style: placement.
 */
export default function Perch({ agent = "beaker", size = 96, state = "idle", facing = "right", settled = false, onPoke,
  open = false, style }) {
  const reduce = useReduce();
  const info = PERCH_AGENTS[agent] || PERCH_AGENTS.beaker;
  const wrap = useRef(null);
  const [hop, setHop] = useState(0);
  const [posed, setPosed] = useState(false);
  const poseTimer = useRef(0);
  const [bubble, setBubble] = useState(null);

  useEffect(() => () => clearTimeout(poseTimer.current), []);

  const onClick = () => {
    if (!reduce) setHop((n) => n + 1);
    setPosed(true);
    clearTimeout(poseTimer.current);
    poseTimer.current = setTimeout(() => setPosed(false), POSE_MS);
    if (onPoke) onPoke(agent);
  };

  // Where the bubble goes: just under the bird, its tail at the bird's
  // centre, kept 12px inside the layer on both sides.
  useLayoutEffect(() => {
    if (!open) { setBubble(null); return; }
    const el = wrap.current;
    if (!el) return;
    const layer = el.closest("[data-lp-perch-layer]");
    const r = el.getBoundingClientRect();
    const lr = layer ? layer.getBoundingClientRect() : r;
    const w = Math.max(160, Math.min(BUBBLE_W, Math.round(lr.width) - 24));
    const center = r.left + r.width / 2;
    const minLeft = lr.left + 12;
    const maxLeft = Math.max(minLeft, lr.right - 12 - w);
    const pageLeft = Math.max(minLeft, Math.min(maxLeft, center - w / 2));
    setBubble({ left: Math.round(pageLeft - r.left), width: w, tailAt: Math.round(center - pageLeft - TIP) });
  }, [open, size]);

  return (
    <div ref={wrap} data-lp-perch=""
      style={{ position: "absolute", width: size, height: size, pointerEvents: "auto", ...style }}>
      <button type="button" className={FOCUS_CLASS} onClick={onClick} aria-expanded={open}
        aria-label={`${info.name}, ${info.role}. Show what ${info.name} does.`}
        style={{ display: "block", width: size, height: size, padding: 0, margin: 0, border: "none", background: "transparent",
          cursor: "pointer", borderRadius: 8, minWidth: 44, minHeight: 44 }}>
        <span key={hop} className={hop ? "lp-hop" : undefined} style={{ display: "block", width: size, height: size }}>
          <Mascot agent={agent} state={posed ? "delivering" : state} size={size} title="" animate={!settled}
            style={{ transform: facing === "left" ? "scaleX(-1)" : undefined }} />
        </span>
      </button>
      {open && bubble && (
        // The bubble holds no controls, so taps pass through it: a bird under
        // it can still be tapped, and a tap on the page behind closes it.
        <div style={{ position: "absolute", top: size + 12, left: bubble.left, width: bubble.width, zIndex: 6, pointerEvents: "none" }}>
          <SpeechBubble name={info.name} side="top" tailAt={bubble.tailAt}>{info.line}</SpeechBubble>
        </div>
      )}
    </div>
  );
}
