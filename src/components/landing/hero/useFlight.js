import { useEffect, useRef, useState } from "react";

// A flight: from one point to another over `duration` ms after `delay`,
// ease-out, every position rounded to whole multiples of `grid` px (the
// sprite's own pixel size). Under reduced motion the bird is at its final
// spot at once. Driven by rAF; state only changes when the rounded position
// does. The hero uses it for Talon flying in.

const snap = (v, grid) => Math.round(v / grid) * grid;

/** -> null until it can start, then { x, y, phase: "waiting" | "flying" | "landed" }. */
export function useFlight({ from, to, delay = 0, duration = 2000, grid = 3, play = true, reduce = false }) {
  const [pos, setPos] = useState(null);
  const landed = useRef(false);
  const fx = from ? from.x : undefined;
  const fy = from ? from.y : undefined;
  const tx = to ? to.x : undefined;
  const ty = to ? to.y : undefined;

  useEffect(() => {
    if (!play || tx === undefined || ty === undefined || fx === undefined || fy === undefined) return undefined;
    if (reduce || landed.current) {
      landed.current = true;
      setPos({ x: snap(tx, grid), y: snap(ty, grid), phase: "landed" });
      return undefined;
    }
    let raf = 0;
    const start = performance.now() + delay;
    setPos({ x: snap(fx, grid), y: snap(fy, grid), phase: "waiting" });
    const tick = (now) => {
      if (now < start) { raf = requestAnimationFrame(tick); return; }
      const p = Math.min(1, (now - start) / duration);
      const e = 1 - (1 - p) ** 3;
      const x = fx + (tx - fx) * e;
      const y = fy + (ty - fy) * e;
      const next = { x: snap(x, grid), y: snap(y, grid), phase: p >= 1 ? "landed" : "flying" };
      setPos((prev) => (prev && prev.x === next.x && prev.y === next.y && prev.phase === next.phase ? prev : next));
      if (p >= 1) { landed.current = true; return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [play, reduce, fx, fy, tx, ty, delay, duration, grid]);

  return pos;
}
