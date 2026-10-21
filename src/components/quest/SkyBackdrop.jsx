import { useLayoutEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import Mascot from "../agents/Mascot.jsx";

// The scene behind the Quest map: the climb starts on a beach and goes all the
// way up to space. Sand and sea at the bottom; a day sky with gulls, a kite,
// clouds and Beaker on the wing; higher up a hot air balloon, a plane and
// Talon soaring; dusk where Quill flies; then night and space with stars, a
// moon, planets, a satellite and rockets at the finish line.
//
// Drawn smooth (gradients and rounded shapes, like the agents' scene bands),
// not on a pixel grid. Everything moves a little: gulls flap and fly across,
// waves roll, clouds drift, the plane crosses, the kite and the palm sway,
// rockets rise with flickering flames, the satellite turns, stars twinkle and
// a shooting star passes now and then; under reduced motion it holds still.
//
// It is measured to the section it sits in (the Quest page's bar, notices and
// map), so its height follows the quest's length, and on a wide screen it runs
// past the column to the page's content edges. Things sit to the sides, clear of the path of stones in the
// middle. Everything is decoration: drawn behind the stones and plates,
// aria-hidden, and its small motions stop under reduced motion.

const SKY_CLASS = "qs-sky";
const SKY_CSS = `
.${SKY_CLASS}-twinkle { animation: qs-twinkle 4.5s ease-in-out infinite; }
@keyframes qs-twinkle { 0%, 100% { opacity: 0.35; } 50% { opacity: 1; } }
.${SKY_CLASS}-drift { animation: qs-drift 22s ease-in-out infinite alternate; }
@keyframes qs-drift { from { transform: translateX(-24px); } to { transform: translateX(24px); } }
.${SKY_CLASS}-bob { animation: qs-bob 3.6s ease-in-out infinite alternate; }
@keyframes qs-bob { from { transform: translateY(0); } to { transform: translateY(-8px); } }
.${SKY_CLASS}-sway { animation: qs-sway 5s ease-in-out infinite alternate; transform-box: fill-box; }
@keyframes qs-sway { from { transform: rotate(-5deg); } to { transform: rotate(5deg); } }
.${SKY_CLASS}-fly { animation: qs-fly var(--dur, 30s) linear infinite; }
@keyframes qs-fly { from { transform: translateX(var(--from)); } to { transform: translateX(var(--to)); } }
.${SKY_CLASS}-wave { animation: qs-wave var(--dur, 3s) linear infinite; }
@keyframes qs-wave { from { transform: translateX(0); } to { transform: translateX(var(--step, -40px)); } }
.${SKY_CLASS}-lap { animation: qs-lap 3.2s ease-in-out infinite alternate; }
@keyframes qs-lap { from { transform: translateY(0); } to { transform: translateY(5px); } }
.${SKY_CLASS}-flame { animation: qs-flame 0.28s ease-in-out infinite alternate; transform-box: fill-box; transform-origin: 50% 0; }
@keyframes qs-flame { from { transform: scaleY(0.75); opacity: 0.8; } to { transform: scaleY(1.15); opacity: 1; } }
.${SKY_CLASS}-rise { animation: qs-rise 4.5s ease-in-out infinite alternate; }
@keyframes qs-rise { from { transform: translate(0, 0); } to { transform: translate(10px, -22px); } }
.${SKY_CLASS}-turn { animation: qs-turn 8s ease-in-out infinite alternate; transform-box: fill-box; transform-origin: center; }
@keyframes qs-turn { from { transform: rotate(-10deg); } to { transform: rotate(10deg); } }
.${SKY_CLASS}-glow { animation: qs-glow 4s ease-in-out infinite alternate; transform-box: fill-box; transform-origin: center; }
@keyframes qs-glow { from { transform: scale(0.94); opacity: 0.8; } to { transform: scale(1.06); opacity: 1; } }
.${SKY_CLASS}-shoot { animation: qs-shoot 9s ease-out infinite; opacity: 0; }
@keyframes qs-shoot { 0% { opacity: 0; transform: translate(0, 0); } 3% { opacity: 1; } 14% { opacity: 0; transform: translate(-280px, 130px); } 100% { opacity: 0; transform: translate(-280px, 130px); } }
.${SKY_CLASS}-glide { animation: qs-glide 9s ease-in-out infinite alternate; }
@keyframes qs-glide { from { transform: translate(-36px, 6px); } to { transform: translate(36px, -6px); } }
@media (prefers-reduced-motion: reduce) {
  .${SKY_CLASS}-twinkle, .${SKY_CLASS}-drift, .${SKY_CLASS}-bob, .${SKY_CLASS}-sway, .${SKY_CLASS}-fly,
  .${SKY_CLASS}-wave, .${SKY_CLASS}-lap, .${SKY_CLASS}-flame, .${SKY_CLASS}-rise, .${SKY_CLASS}-turn,
  .${SKY_CLASS}-glow, .${SKY_CLASS}-glide { animation: none; }
  .${SKY_CLASS}-shoot { animation: none; opacity: 0; }
}
.${SKY_CLASS}-still .${SKY_CLASS}-twinkle, .${SKY_CLASS}-still .${SKY_CLASS}-drift, .${SKY_CLASS}-still .${SKY_CLASS}-bob,
.${SKY_CLASS}-still .${SKY_CLASS}-sway, .${SKY_CLASS}-still .${SKY_CLASS}-fly, .${SKY_CLASS}-still .${SKY_CLASS}-wave,
.${SKY_CLASS}-still .${SKY_CLASS}-lap, .${SKY_CLASS}-still .${SKY_CLASS}-flame, .${SKY_CLASS}-still .${SKY_CLASS}-rise,
.${SKY_CLASS}-still .${SKY_CLASS}-turn, .${SKY_CLASS}-still .${SKY_CLASS}-glow, .${SKY_CLASS}-still .${SKY_CLASS}-glide,
.${SKY_CLASS}-still .${SKY_CLASS}-shoot { animation-play-state: paused; }
`;
if (typeof document !== "undefined" && !document.querySelector("style[data-quest-sky]")) {
  const el = document.createElement("style");
  el.dataset.questSky = "";
  el.textContent = SKY_CSS;
  document.head.appendChild(el);
}

const SAND_H = 130;     // px of beach at the bottom
const SEA_H = 70;       // px of sea above it

// The same scattered numbers every render.
function rnd(i) {
  const s = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

// ── The props, each drawn around its own origin ──────────────────────────────

function Cloud({ x, y, s = 1, o = 0.95 }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} opacity={o}>
      <ellipse cx="0" cy="10" rx="62" ry="16" fill="#dcebf8" />
      <circle cx="-30" cy="0" r="22" fill="#ffffff" />
      <circle cx="0" cy="-12" r="30" fill="#ffffff" />
      <circle cx="32" cy="-2" r="22" fill="#ffffff" />
      <ellipse cx="0" cy="6" rx="58" ry="14" fill="#ffffff" />
    </g>
  );
}

function Gull({ x, y, s = 1, c = "#3d4a66", still = false, delay = 0 }) {
  const up = "M-12 0 Q-6 -8 0 0 Q6 -8 12 0";
  const down = "M-12 -2 Q-6 4 0 0 Q6 4 12 -2";
  return (
    <path transform={`translate(${x} ${y}) scale(${s})`} d={up}
      fill="none" stroke={c} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      {!still && <animate attributeName="d" dur="0.7s" values={`${up};${down};${up}`} repeatCount="indefinite" begin={`${-delay}s`} />}
    </path>
  );
}

function Kite({ x, y }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(12)`}>
      <path d="M0 -34 L22 0 L0 30 L-22 0 Z" fill="#f2a65e" />
      <path d="M0 -34 L22 0 L0 0 Z" fill="#f7c58f" />
      <path d="M0 0 L0 30 L-22 0 Z" fill="#e3874a" />
      <path d="M0 30 Q8 54 -4 78 Q-14 100 4 126" fill="none" stroke="#e3874a" strokeWidth="1.8" />
      {[50, 80, 108].map((t) => <path key={t} d={`M-6 ${t} l6 -5 l6 5 l-6 5 Z`} fill="#3a6fd0" />)}
    </g>
  );
}

function Balloon({ x, y }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M0 -58 C34 -58 46 -30 40 -6 C34 18 12 34 8 46 L-8 46 C-12 34 -34 18 -40 -6 C-46 -30 -34 -58 0 -58 Z" fill="#e86f6f" />
      <path d="M0 -58 C14 -58 18 -30 16 -6 C14 18 6 34 4 46 L-4 46 C-6 34 -14 18 -16 -6 C-18 -30 -14 -58 0 -58 Z" fill="#f7e2a6" />
      <path d="M-40 -6 C-34 18 -12 34 -8 46" fill="none" stroke="#c95656" strokeWidth="1.5" />
      <path d="M-8 46 L-9 60 M8 46 L9 60" stroke="#8a5a35" strokeWidth="1.4" />
      <rect x="-10" y="60" width="20" height="14" rx="3" fill="#b07a46" />
    </g>
  );
}

function Plane({ x, y }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(-8)`}>
      <path d="M-46 0 Q-48 -8 -36 -8 L36 -8 Q52 -8 54 0 Q52 8 36 8 L-36 8 Q-48 8 -46 0 Z" fill="#f4f6fb" />
      <path d="M-4 -6 L-22 -34 L-10 -34 L18 -6 Z" fill="#c9d3e6" />
      <path d="M-4 6 L-16 22 L-6 22 L14 6 Z" fill="#c9d3e6" />
      <path d="M-44 -6 L-50 -22 L-40 -22 L-32 -6 Z" fill="#3a6fd0" />
      {[-24, -12, 0, 12, 24].map((wx) => <circle key={wx} cx={wx} cy="-2" r="2.2" fill="#7d8db0" />)}
      <path d="M-50 0 Q-120 4 -190 0" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" opacity="0.7" />
    </g>
  );
}

function Rocket({ x, y, s = 1, angle = -32 }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle}) scale(${s})`}>
      <path className={`${SKY_CLASS}-flame`} d="M0 46 Q-12 74 0 98 Q12 74 0 46 Z" fill="url(#qs-flame)" />
      <path d="M-16 20 L-30 46 L-14 40 Z" fill="#e86f6f" />
      <path d="M16 20 L30 46 L14 40 Z" fill="#e86f6f" />
      <path d="M0 -58 C20 -36 22 0 16 46 L-16 46 C-22 0 -20 -36 0 -58 Z" fill="#f4f6fb" />
      <path d="M0 -58 C8 -48 14 -38 17 -26 L-17 -26 C-14 -38 -8 -48 0 -58 Z" fill="#e86f6f" />
      <circle cx="0" cy="-6" r="9" fill="#3a6fd0" stroke="#c9d3e6" strokeWidth="3" />
      <path d="M-15 30 L15 30" stroke="#c9d3e6" strokeWidth="3" />
    </g>
  );
}

function Satellite({ x, y }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(-18)`}>
      <rect x="-56" y="-12" width="38" height="24" rx="2" fill="#3a6fd0" />
      <rect x="18" y="-12" width="38" height="24" rx="2" fill="#3a6fd0" />
      {[-46, -36, -26, 28, 38, 48].map((lx) => <path key={lx} d={`M${lx} -12 V12`} stroke="#7daaf2" strokeWidth="1.2" />)}
      <path d="M-18 0 H18" stroke="#c9d3e6" strokeWidth="3" />
      <rect x="-12" y="-14" width="24" height="28" rx="4" fill="#e9e3d6" />
      <circle cx="0" cy="-22" r="6" fill="none" stroke="#e9e3d6" strokeWidth="2.5" />
    </g>
  );
}

function Planet({ x, y, r = 40, ring = true }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {ring && <ellipse cx="0" cy="0" rx={r * 1.85} ry={r * 0.42} fill="none" stroke="#e7c98f" strokeWidth={r * 0.14} transform="rotate(-16)" opacity="0.9" />}
      <circle cx="0" cy="0" r={r} fill="url(#qs-planet)" />
      <path d={`M${-r * 0.9} ${-r * 0.2} Q0 ${-r * 0.36} ${r * 0.9} ${-r * 0.2}`} stroke="#f2b77d" strokeWidth={r * 0.12} fill="none" opacity="0.6" />
      <path d={`M${-r * 0.8} ${r * 0.35} Q0 ${r * 0.2} ${r * 0.8} ${r * 0.35}`} stroke="#c97a5a" strokeWidth={r * 0.1} fill="none" opacity="0.5" />
      {ring && <path d={`M${-r * 1.78} ${r * 0.5} A ${r * 1.85} ${r * 0.42} -16 0 0 ${r * 1.78} ${-r * 0.5}`} fill="none" stroke="#e7c98f" strokeWidth={r * 0.14} transform="rotate(0)" opacity="0.95" />}
    </g>
  );
}

function Moon({ x, y, r = 34 }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r={r * 1.7} fill="#fff6d5" opacity="0.05" />
      <circle r={r} fill="#fff1c2" />
      <circle cx={-r * 0.3} cy={-r * 0.25} r={r * 0.18} fill="#f1deaa" />
      <circle cx={r * 0.35} cy={r * 0.2} r={r * 0.12} fill="#f1deaa" />
      <circle cx={-r * 0.1} cy={r * 0.45} r={r * 0.09} fill="#f1deaa" />
    </g>
  );
}

function Palm({ x, y }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M0 0 C-4 -40 6 -90 22 -128" stroke="#a9763f" strokeWidth="10" fill="none" strokeLinecap="round" />
      {[-24, -48, -72, -96].map((t) => <path key={t} d={`M${-3 + t * -0.12} ${t} q7 -3 13 0`} stroke="#8a5d30" strokeWidth="2" fill="none" />)}
      <g transform="translate(22 -128)"><g className={`${SKY_CLASS}-sway`} style={{ transformOrigin: "50% 60%", animationDuration: "4.2s" }}>
        <path d="M0 0 C-30 -22 -64 -10 -82 14 C-56 -2 -30 -2 0 0 Z" fill="#3f9a5a" />
        <path d="M0 0 C-22 -40 -54 -48 -76 -36 C-48 -30 -24 -18 0 0 Z" fill="#4fb36a" />
        <path d="M0 0 C16 -38 46 -48 70 -40 C42 -30 20 -18 0 0 Z" fill="#4fb36a" />
        <path d="M0 0 C30 -18 64 -8 84 16 C56 0 30 0 0 0 Z" fill="#3f9a5a" />
        <path d="M0 0 C4 -30 -2 -60 -14 -76 C-2 -52 0 -26 0 0 Z" fill="#5cc078" />
        <circle cx="-4" cy="6" r="6" fill="#7a4e26" />
        <circle cx="6" cy="8" r="6" fill="#6b4220" />
      </g></g>
    </g>
  );
}

function Umbrella({ x, y }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M0 -96 L4 0" stroke="#8a5d30" strokeWidth="4" strokeLinecap="round" />
      <path d="M-62 -84 Q0 -150 62 -84 Q46 -96 31 -88 Q16 -100 0 -90 Q-16 -100 -31 -88 Q-46 -96 -62 -84 Z" fill="#e86f6f" />
      <path d="M-31 -88 Q-20 -128 0 -136 Q-6 -112 0 -90 Q-16 -100 -31 -88 Z" fill="#fbf3e2" />
      <path d="M31 -88 Q20 -128 0 -136 Q6 -112 0 -90 Q16 -100 31 -88 Z" fill="#fbf3e2" />
      <ellipse cx="44" cy="-6" rx="34" ry="8" fill="#3a6fd0" opacity="0.85" />
    </g>
  );
}

function Castle({ x, y }) {
  return (
    <g transform={`translate(${x} ${y})`} fill="#e0b86f">
      <rect x="-26" y="-22" width="52" height="22" rx="2" />
      <rect x="-30" y="-40" width="16" height="22" rx="2" />
      <rect x="14" y="-40" width="16" height="22" rx="2" />
      <rect x="-8" y="-52" width="16" height="32" rx="2" />
      <path d="M0 -52 V-66 L12 -61 L0 -57" stroke="#8a5d30" strokeWidth="1.5" fill="#e86f6f" />
      <rect x="-5" y="-14" width="10" height="14" rx="5" fill="#c99a52" />
    </g>
  );
}

function Shell({ x, y, c = "#f3c9b8" }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M-9 4 Q0 -14 9 4 Z" fill={c} />
      {[-5, 0, 5].map((sx) => <path key={sx} d={`M0 -8 L${sx} 4`} stroke="#d99f87" strokeWidth="1" />)}
    </g>
  );
}

function Starfish({ x, y }) {
  return (
    <path transform={`translate(${x} ${y}) scale(0.9)`} fill="#f08a6a"
      d="M0 -12 L3.5 -4 L12 -3.5 L5.5 2.5 L7.5 11 L0 6.5 L-7.5 11 L-5.5 2.5 L-12 -3.5 L-3.5 -4 Z" />
  );
}

// ── The scene ────────────────────────────────────────────────────────────────

/** Measures the map (and how far past its column the page reaches) and draws
 *  the climb behind it. Rendered as the map's first child.
 *  showAgents: draw the three agents on the wing. still: hold every motion
 *  (the landing page sets it once a mockup has settled or is off screen). */
export default function SkyBackdrop({ isMobile = false, showAgents = true, still: hold = false }) {
  const still = useReducedMotion() || hold;
  const ref = useRef(null);
  const [box, setBox] = useState(null);   // { w, h, l, r }

  useLayoutEffect(() => {
    const el = ref.current;
    const map = el?.parentElement;
    if (!map) return undefined;
    const measure = () => {
      const mr = map.getBoundingClientRect();
      const page = map.closest("[data-sidebar-offset]");
      let l = 0, r = 0;
      if (page) {
        const pr = page.getBoundingClientRect();
        const cs = getComputedStyle(page);
        // Out to the page's content edges (inside its padding), clear of the sidebar.
        l = Math.max(0, Math.round(mr.left - (pr.left + parseFloat(cs.paddingLeft))));
        r = Math.max(0, Math.round(pr.right - parseFloat(cs.paddingRight) - mr.right));
      }
      const next = { w: Math.round(mr.width) + l + r, h: Math.round(mr.height), l, r };
      setBox((prev) => (prev && prev.w === next.w && prev.h === next.h && prev.l === next.l && prev.r === next.r ? prev : next));
    };
    measure();
    window.addEventListener("resize", measure);
    const watch = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    watch?.observe(map);
    return () => { window.removeEventListener("resize", measure); watch?.disconnect(); };
  }, []);

  const W = box?.w || 0;
  const H = box?.h || 0;
  // The sides, clear of the stones down the middle (the map's centre column).
  const midL = (box?.l || 0) + (W - (box?.l || 0) - (box?.r || 0)) / 2;
  const left = (f) => Math.max(40, (midL - 230) * f);            // f in 0..1 across the left side
  const right = (f) => Math.min(W - 40, midL + 230 + (W - midL - 230) * f);
  const at = (f) => H * f;                                       // f: 0 top (space) .. 1 bottom (beach)
  const ground = H - SAND_H;
  const sea = ground - SEA_H;
  const mascot = isMobile ? 44 : 72;
  // Where each agent flies: in the side margins, or hugging the edges on a phone.
  const onLeft = (f) => (isMobile ? 4 + mascot / 2 : left(f));
  const onRight = (f) => (isMobile ? W - 4 - mascot / 2 : right(f));

  // Stars thin out as the sky gets light.
  const stars = [];
  if (box) {
    const n = Math.round((W * H * 0.4) / 9000);
    for (let i = 0; i < n; i++) {
      const fy = Math.pow(rnd(i * 3.1), 1.6) * 0.42;
      stars.push({ x: rnd(i * 7.7) * W, y: at(fy), r: 0.8 + rnd(i * 5.3) * 1.6, d: (rnd(i) * 4).toFixed(2), tw: i % 3 === 0 });
    }
  }

  return (
    <div ref={ref} aria-hidden="true" className={hold ? `${SKY_CLASS}-still` : undefined}
      style={{ position: "absolute", top: 0, bottom: 0, left: -(box?.l || 0), right: -(box?.r || 0),
      zIndex: -1, pointerEvents: "none", overflow: "hidden", borderRadius: 28 }}>
      {box && (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block", position: "absolute", inset: 0 }}>
          <defs>
            <linearGradient id="qs-sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#0d1433" />
              <stop offset="0.16" stopColor="#1c2457" />
              <stop offset="0.3" stopColor="#3d3f86" />
              <stop offset="0.4" stopColor="#8d6aa8" />
              <stop offset="0.47" stopColor="#e7a3a0" />
              <stop offset="0.54" stopColor="#f6cfa8" />
              <stop offset="0.6" stopColor="#b9dcf6" />
              <stop offset="0.8" stopColor="#8fc6f0" />
              <stop offset="1" stopColor="#cfeafb" />
            </linearGradient>
            <linearGradient id="qs-sea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#4aa3dc" />
              <stop offset="1" stopColor="#2f86c9" />
            </linearGradient>
            <linearGradient id="qs-sand" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#f6dfae" />
              <stop offset="1" stopColor="#ecc98a" />
            </linearGradient>
            <radialGradient id="qs-planet" cx="0.35" cy="0.35" r="0.75">
              <stop offset="0" stopColor="#ffd7a0" />
              <stop offset="1" stopColor="#d9805c" />
            </radialGradient>
            <radialGradient id="qs-planet2" cx="0.35" cy="0.35" r="0.8">
              <stop offset="0" stopColor="#b9d8ff" />
              <stop offset="1" stopColor="#5b78d6" />
            </radialGradient>
            <linearGradient id="qs-flame" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ffe08a" />
              <stop offset="1" stopColor="#f27a3a" stopOpacity="0" />
            </linearGradient>
            <radialGradient id="qs-sun" cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor="#fff3c4" />
              <stop offset="0.45" stopColor="#ffd77a" />
              <stop offset="1" stopColor="#ffd77a" stopOpacity="0" />
            </radialGradient>
          </defs>

          <rect width={W} height={H} fill="url(#qs-sky)" />

          {/* Space */}
          {stars.map((st, i) => (
            <circle key={i} cx={st.x} cy={st.y} r={st.r} fill="#ffffff" className={st.tw ? `${SKY_CLASS}-twinkle` : undefined}
              style={st.tw ? { animationDelay: `${st.d}s` } : undefined} opacity={st.tw ? undefined : 0.75} />
          ))}
          {[[0.82, 0.04, 0], [0.4, 0.13, -4.5]].map(([fx, fy, delay]) => (
            <g key={fx} className={`${SKY_CLASS}-shoot`} style={{ animationDelay: `${delay}s` }}>
              <path d={`M${W * fx} ${at(fy)} l46 -21`} stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" opacity="0.9" />
            </g>
          ))}
          <g className={`${SKY_CLASS}-bob`} style={{ animationDuration: "7s" }}><Planet x={right(0.55)} y={at(0.05)} r={isMobile ? 26 : 40} /></g>
          <Moon x={left(0.45)} y={at(0.11)} r={isMobile ? 22 : 32} />
          <g transform={`translate(${left(0.8)} ${at(0.035)})`}><circle r={isMobile ? 9 : 14} fill="url(#qs-planet2)" /></g>
          <g className={`${SKY_CLASS}-glide`} style={{ animationDuration: "14s" }}>
            <g className={`${SKY_CLASS}-turn`}><Satellite x={right(0.35)} y={at(0.17)} /></g>
          </g>
          <g className={`${SKY_CLASS}-rise`}><Rocket x={left(0.6)} y={at(0.24)} s={isMobile ? 0.7 : 0.9} /></g>
          <g className={`${SKY_CLASS}-rise`} style={{ animationDelay: "-2s", animationDuration: "5.5s" }}>
            <Rocket x={right(0.7)} y={at(0.3)} s={isMobile ? 0.45 : 0.55} angle={-48} />
          </g>

          {/* Dusk */}
          <g className={`${SKY_CLASS}-drift`} style={{ animationDuration: "30s" }}><Cloud x={right(0.4)} y={at(0.43)} s={0.9} o={0.55} /></g>
          <g className={`${SKY_CLASS}-drift`} style={{ animationDuration: "26s", animationDelay: "-9s" }}><Cloud x={left(0.35)} y={at(0.49)} s={0.75} o={0.6} /></g>
          <g className={`${SKY_CLASS}-glow`}><circle cx={right(0.75)} cy={at(0.5)} r={isMobile ? 46 : 70} fill="url(#qs-sun)" opacity="0.9" /></g>

          {/* Day */}
          <g className={`${SKY_CLASS}-drift`}><Cloud x={left(0.55)} y={at(0.58)} s={1.1} /></g>
          <g className={`${SKY_CLASS}-fly`} style={{ "--from": `${-W * 0.25}px`, "--to": `${W * 0.35}px`, "--dur": "38s" }}>
            <Plane x={right(0.45)} y={at(0.6)} />
          </g>
          <g className={`${SKY_CLASS}-bob`}>
            <g className={`${SKY_CLASS}-sway`} style={{ transformOrigin: "50% 0", animationDuration: "6s" }}><Balloon x={left(0.25)} y={at(0.67)} /></g>
          </g>
          <g className={`${SKY_CLASS}-drift`} style={{ animationDelay: "-8s" }}><Cloud x={right(0.6)} y={at(0.7)} s={0.85} /></g>
          <g className={`${SKY_CLASS}-drift`} style={{ animationDuration: "28s", animationDelay: "-14s" }}><Cloud x={left(0.7)} y={at(0.77)} s={0.7} o={0.85} /></g>
          {/* Two little flocks crossing the sky, wings flapping. */}
          <g className={`${SKY_CLASS}-fly`} style={{ "--from": `${-W * 0.6}px`, "--to": `${W * 0.6}px`, "--dur": "26s" }}>
            <Gull x={right(0.3)} y={at(0.8)} still={still} />
            <Gull x={right(0.3) + 26} y={at(0.8) + 14} s={0.75} still={still} delay={0.25} />
            <Gull x={right(0.3) - 22} y={at(0.8) + 18} s={0.7} still={still} delay={0.4} />
          </g>
          <g className={`${SKY_CLASS}-fly`} style={{ "--from": `${W * 0.5}px`, "--to": `${-W * 0.7}px`, "--dur": "34s", animationDelay: "-12s" }}>
            <Gull x={left(0.4)} y={at(0.84)} s={0.85} still={still} delay={0.15} />
            <Gull x={left(0.4) + 24} y={at(0.84) - 10} s={0.65} still={still} delay={0.5} />
          </g>
          <g className={`${SKY_CLASS}-fly`} style={{ "--from": `${-W * 0.3}px`, "--to": `${W * 0.5}px`, "--dur": "22s", animationDelay: "-6s" }}>
            <Gull x={left(0.5)} y={at(0.63)} s={0.8} c="#4b5878" still={still} delay={0.3} />
          </g>
          <g className={`${SKY_CLASS}-sway`} style={{ transformOrigin: "50% 100%", animationDuration: "3.4s" }}>
            <Kite x={right(0.8)} y={sea - 120} />
          </g>

          {/* The sea, its waves rolling, and the beach */}
          <rect x="0" y={sea} width={W} height={SEA_H + 8} fill="url(#qs-sea)" />
          <g className={`${SKY_CLASS}-wave`} style={{ "--dur": "2.8s", "--step": "-40px" }}>
            <path d={`M-40 ${sea} ${Array.from({ length: Math.ceil(W / 40) + 3 }, (_, i) => `Q${i * 40 - 20} ${sea - 7} ${i * 40} ${sea}`).join(" ")} V${sea + 8} H-40 Z`} fill="#8fd0f5" />
          </g>
          <g className={`${SKY_CLASS}-wave`} style={{ "--dur": "7s", "--step": "-90px" }}>
            {Array.from({ length: Math.ceil(W / 90) + 2 }, (_, i) => (
              <path key={i} d={`M${i * 90 + (i % 2) * 30} ${sea + 22 + (i % 3) * 12} q10 -5 20 0`} stroke="#bfe6fb" strokeWidth="2.4" fill="none" strokeLinecap="round" />
            ))}
          </g>
          <g className={`${SKY_CLASS}-lap`}>
            <g className={`${SKY_CLASS}-wave`} style={{ "--dur": "5s", "--step": "-60px" }}>
              <path d={`M-60 ${ground + 4} ${Array.from({ length: Math.ceil(W / 60) + 3 }, (_, i) => `Q${i * 60 - 30} ${ground - 10} ${i * 60} ${ground + 4}`).join(" ")} V${ground + 30} H-60 Z`} fill="#ffffff" opacity="0.85" />
            </g>
          </g>
          <rect x="0" y={ground + 6} width={W} height={SAND_H} fill="url(#qs-sand)" />
          {Array.from({ length: Math.ceil(W / 26) }, (_, i) => (
            <circle key={i} cx={(rnd(i * 2.2) * W)} cy={ground + 20 + rnd(i * 3.3) * (SAND_H - 30)} r="1.6" fill="#d9ad66" opacity="0.7" />
          ))}
          <Palm x={left(0.3)} y={ground + 70} />
          <Umbrella x={right(0.55)} y={ground + 74} />
          <Castle x={left(0.75)} y={ground + 92} />
          <Shell x={right(0.2)} y={ground + 96} />
          <Starfish x={left(0.55)} y={ground + 108} />
          <Shell x={right(0.85)} y={ground + 60} c="#f6dfe0" />
        </svg>
      )}

      {/* Our agents along the way: Beaker over the beach, Talon high in the
          day sky, Quill out at dusk. */}
      {box && showAgents && (
        <>
          <div className={`${SKY_CLASS}-glide`} style={{ position: "absolute", left: onRight(0.25) - mascot / 2, top: at(isMobile ? 0.77 : 0.74) - mascot / 2 }}>
            <Mascot agent="beaker" state="flying" size={mascot} title="" animate={!hold} style={{ transform: "scaleX(-1)" }} />
          </div>
          <div className={`${SKY_CLASS}-glide`} style={{ position: "absolute", left: onLeft(0.6) - mascot / 2, top: at(isMobile ? 0.6 : 0.535) - mascot / 2, animationDelay: "-1.4s" }}>
            <Mascot agent="talon" state="flying" size={mascot} title="" animate={!hold} />
          </div>
          <div className={`${SKY_CLASS}-glide`} style={{ position: "absolute", left: onRight(0.6) - mascot / 2, top: at(isMobile ? 0.44 : 0.37) - mascot / 2, animationDelay: "-2.6s" }}>
            <Mascot agent="quill" state="flying" size={mascot} title="" animate={!hold} style={{ transform: "scaleX(-1)" }} />
          </div>
        </>
      )}
    </div>
  );
}
