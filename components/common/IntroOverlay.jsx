/**
 * IntroOverlay — premium 3-second intro for Mentorable
 *
 * Inspired by headroom.com: one focused moment, deliberate pacing,
 * a single clean visual gesture, then a curtain-rise reveal.
 *
 * Timeline
 * ─────────
 *  0.0s  overlay mounts, blank
 *  0.1s  wordmark rises in
 *  1.0s  path line begins drawing
 *  1.8s  chosen direction highlights in brand indigo
 *  2.5s  onDone() fires → page visible → overlay exits (slides up)
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ─── tokens ────────────────────────────────────────────────────────────────────
const SANS   = "'Space Grotesk', Inter, sans-serif";
const INDIGO = "#4F46E5";
const GRAY   = "#C8CDD6";
const FG     = "#111111";
const BG     = "#F9FAFB";

// ─── SVG path geometry (80 × 24 viewport) ────────────────────────────────────
// A single horizontal guide line with a mid-branch curving up-right.
// Drawn in two parts so each animates independently.
const LINE_START = { x: 6,  y: 12 };
const LINE_MID   = { x: 52, y: 12 };
const LINE_END   = { x: 88, y: 12 };
const BRANCH_END = { x: 72, y: 4  };

// ─── easing ───────────────────────────────────────────────────────────────────
const EASE_OUT  = [0.22, 1, 0.36, 1];
const EASE_SINE = [0.37, 0, 0.63, 1];

// ─── sub-components ───────────────────────────────────────────────────────────

// The path SVG — draws in two phases.
// phase "draw"  → grey line appears left→right
// phase "choose" → right segment + terminus glow turn indigo
function PathMark({ phase }) {
  const isChoose = phase === "choose";
  const show     = phase === "draw" || phase === "choose";

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="pathmark"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.2 } }}
          transition={{ duration: 0.25, ease: EASE_OUT }}
        >
          <svg
            width="96" height="24"
            viewBox="0 0 96 24"
            overflow="visible"
            style={{ display: "block" }}
          >
            {/* ── grey base line  ── */}
            <motion.line
              x1={LINE_START.x} y1={LINE_START.y}
              x2={LINE_END.x}   y2={LINE_END.y}
              stroke={GRAY}
              strokeWidth={1.5}
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.65, ease: EASE_OUT }}
            />

            {/* ── subtle upward branch ── */}
            <motion.path
              d={`M ${LINE_MID.x},${LINE_MID.y} Q 62,8 ${BRANCH_END.x},${BRANCH_END.y}`}
              stroke={GRAY}
              strokeWidth={1}
              fill="none"
              strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 0.45 }}
              transition={{ duration: 0.5, delay: 0.45, ease: EASE_OUT }}
            />

            {/* ── chosen segment highlight ── */}
            <motion.line
              x1={LINE_MID.x} y1={LINE_MID.y}
              x2={LINE_END.x} y2={LINE_END.y}
              stroke={INDIGO}
              strokeWidth={1.75}
              strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={isChoose
                ? { pathLength: 1, opacity: 1 }
                : { pathLength: 0, opacity: 0 }
              }
              transition={{ duration: 0.5, ease: EASE_OUT }}
            />

            {/* ── origin dot ── */}
            <motion.circle
              cx={LINE_START.x} cy={LINE_START.y} r={2.5}
              fill={GRAY}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.3, ease: EASE_OUT }}
              style={{ transformOrigin: `${LINE_START.x}px ${LINE_START.y}px` }}
            />

            {/* ── terminus dot ── */}
            <motion.circle
              cx={LINE_END.x} cy={LINE_END.y} r={3}
              fill={isChoose ? INDIGO : GRAY}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.35, delay: 0.5, ease: EASE_OUT }}
              style={{ transformOrigin: `${LINE_END.x}px ${LINE_END.y}px` }}
            />

            {/* ── terminus pulse ring (fires once on choose) ── */}
            {isChoose && (
              <motion.circle
                cx={LINE_END.x} cy={LINE_END.y} r={3}
                fill="none"
                stroke={INDIGO}
                strokeWidth={1}
                initial={{ scale: 1, opacity: 0.7 }}
                animate={{ scale: 3.5, opacity: 0 }}
                transition={{ duration: 0.75, ease: "easeOut" }}
                style={{ transformOrigin: `${LINE_END.x}px ${LINE_END.y}px` }}
              />
            )}
          </svg>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── main overlay ─────────────────────────────────────────────────────────────
export default function IntroOverlay({ onDone }) {
  // "blank" → "wordmark" → "draw" → "choose" → (onDone fires, exit triggers externally)
  const [phase, setPhase] = useState("blank");

  useEffect(() => {
    const queue = [
      [100,  () => setPhase("wordmark")],
      [1050, () => setPhase("draw")],
      [1850, () => setPhase("choose")],
      [2550, () => { onDone?.(); }],
    ];
    const timers = queue.map(([ms, fn]) => setTimeout(fn, ms));
    return () => timers.forEach(clearTimeout);
  }, [onDone]);

  return (
    // Slides the whole overlay upward when AnimatePresence unmounts it
    <motion.div
      key="intro-overlay"
      initial={{ y: 0 }}
      exit={{
        y: "-100%",
        transition: { duration: 0.7, ease: [0.76, 0, 0.24, 1] },
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9000,
        background: BG,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        // Subtle grain texture via SVG filter
        isolation: "isolate",
      }}
    >
      {/* Grain layer — adds premium tactility */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute", inset: 0, zIndex: 0,
          opacity: 0.022, pointerEvents: "none",
        }}
      >
        <svg width="100%" height="100%">
          <filter id="io-grain">
            <feTurbulence type="fractalNoise" baseFrequency="0.72" numOctaves="4" stitchTiles="stitch"/>
            <feColorMatrix type="saturate" values="0"/>
          </filter>
          <rect width="100%" height="100%" filter="url(#io-grain)"/>
        </svg>
      </div>

      {/* ── centered stage ── */}
      <div
        style={{
          position: "relative", zIndex: 1,
          display: "flex", flexDirection: "column",
          alignItems: "center", gap: "1.75rem",
        }}
      >
        {/* Wordmark */}
        <motion.div
          initial={{ opacity: 0, y: 12, filter: "blur(4px)" }}
          animate={
            phase === "blank"
              ? { opacity: 0, y: 12, filter: "blur(4px)" }
              : { opacity: 1, y: 0,  filter: "blur(0px)" }
          }
          transition={{ duration: 0.85, ease: EASE_OUT }}
          style={{
            fontFamily: SANS,
            fontSize: "1.05rem",
            fontWeight: 600,
            letterSpacing: "-0.03em",
            color: FG,
            userSelect: "none",
          }}
        >
          mentorable
        </motion.div>

        {/* Path graphic */}
        <PathMark phase={phase} />

        {/* Caption — fades in on choose */}
        <AnimatePresence>
          {phase === "choose" && (
            <motion.span
              key="caption"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, ease: EASE_OUT }}
              style={{
                fontFamily: SANS,
                fontSize: "0.65rem",
                fontWeight: 500,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: INDIGO,
                opacity: 0.7,
              }}
            >
              your path
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
