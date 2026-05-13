import { motion } from "framer-motion";

const C = "rgba(37,99,235,0.13)";   // border/fill color — blue at visible opacity
const C2 = "rgba(99,102,241,0.11)"; // softer indigo variant

// Rings, diamonds, plus-marks and dots confined to page edges.
// Place as the FIRST child of a `position: relative` page container.

const SHAPES = [
  // ── Left edge ────────────────────────────────────────────────
  { id:  0, type: "ring",    size: 100, top: "3%",  left: "0%",   delay: 0   },
  { id:  1, type: "diamond", size:  48, top: "9%",  left: "11%",  delay: 0.4 },
  { id:  2, type: "plus",    size:  22, top: "20%", left: "5%",   delay: 0.8 },
  { id:  3, type: "dot",     size:  10, top: "30%", left: "2%",   delay: 0.5 },
  { id:  4, type: "ring",    size: 150, top: "33%", left: "-4%",  delay: 0.2 },
  { id:  5, type: "diamond", size:  40, top: "46%", left: "9%",   delay: 0.7 },
  { id:  6, type: "plus",    size:  18, top: "57%", left: "3%",   delay: 0.3 },
  { id:  7, type: "ring",    size:  72, top: "68%", left: "1%",   delay: 0.9 },
  { id:  8, type: "diamond", size:  56, top: "78%", left: "12%",  delay: 0.1 },
  { id:  9, type: "dot",     size:  14, top: "88%", left: "4%",   delay: 0.6 },
  // ── Right edge ───────────────────────────────────────────────
  { id: 10, type: "ring",    size: 120, top: "2%",  left: "87%",  delay: 0.3 },
  { id: 11, type: "diamond", size:  44, top: "7%",  left: "77%",  delay: 0.6 },
  { id: 12, type: "plus",    size:  20, top: "17%", left: "93%",  delay: 1.0 },
  { id: 13, type: "dot",     size:   8, top: "27%", left: "90%",  delay: 0.2 },
  { id: 14, type: "ring",    size:  86, top: "36%", left: "93%",  delay: 0.7 },
  { id: 15, type: "diamond", size:  62, top: "47%", left: "81%",  delay: 0.4 },
  { id: 16, type: "plus",    size:  16, top: "60%", left: "90%",  delay: 0.9 },
  { id: 17, type: "ring",    size: 110, top: "70%", left: "86%",  delay: 0.1 },
  { id: 18, type: "diamond", size:  38, top: "81%", left: "79%",  delay: 0.5 },
  { id: 19, type: "dot",     size:  12, top: "91%", left: "91%",  delay: 0.8 },
];

function ShapeEl({ shape }) {
  const base = {
    position: "absolute",
    top: shape.top,
    left: shape.left,
    pointerEvents: "none",
  };

  if (shape.type === "ring") {
    return (
      <motion.div
        key={shape.id}
        animate={{ rotate: 360 }}
        transition={{ duration: 30 + shape.delay * 20, repeat: Infinity, ease: "linear" }}
        style={{
          ...base,
          width: shape.size, height: shape.size,
          borderRadius: "50%",
          border: `1.5px solid ${C}`,
        }}
      />
    );
  }

  if (shape.type === "diamond") {
    return (
      <motion.div
        key={shape.id}
        animate={{ rotate: [45, 45 + 360] }}
        transition={{ duration: 40 + shape.delay * 15, repeat: Infinity, ease: "linear" }}
        style={{
          ...base,
          width: shape.size, height: shape.size,
          border: `1.5px solid ${C2}`,
          borderRadius: "6px",
          transform: "rotate(45deg)",
        }}
      />
    );
  }

  if (shape.type === "plus") {
    return (
      <motion.div
        key={shape.id}
        animate={{ y: [-6, 6, -6] }}
        transition={{ duration: 5 + shape.delay * 3, repeat: Infinity, ease: "easeInOut" }}
        style={{ ...base, width: shape.size, height: shape.size, position: "absolute",
          top: shape.top, left: shape.left }}
      >
        <div style={{
          position: "absolute", left: 0, top: "50%",
          width: "100%", height: 1.5,
          background: C, transform: "translateY(-50%)",
        }} />
        <div style={{
          position: "absolute", top: 0, left: "50%",
          height: "100%", width: 1.5,
          background: C, transform: "translateX(-50%)",
        }} />
      </motion.div>
    );
  }

  if (shape.type === "dot") {
    return (
      <motion.div
        key={shape.id}
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 3 + shape.delay * 2, repeat: Infinity, ease: "easeInOut" }}
        style={{
          ...base,
          width: shape.size, height: shape.size,
          borderRadius: "50%",
          background: C,
        }}
      />
    );
  }

  return null;
}

export default function PageBackground() {
  return (
    <div
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}
    >
      {SHAPES.map((s) => <ShapeEl key={s.id} shape={s} />)}
    </div>
  );
}
