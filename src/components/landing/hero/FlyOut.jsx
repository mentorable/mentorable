import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useReduce } from "../kit.js";
import Perch, { PerchLayer, useBox } from "./Perch.jsx";

// A flight: from one point to another over `duration` ms after `delay`,
// ease-out, lifted along a gentle arc, every position rounded to whole
// multiples of `grid` px (the sprite's own pixel size). Under reduced
// motion the bird is at its final spot at once. Driven by rAF; state only
// changes when the rounded position does.
//
// `FlyOut` (hero b) sends the three agents out of a device frame into the
// photo's sky: each starts small inside the screen and steps to the large
// size in one frame as it crosses the bezel, then glides until settled.
// The birds are the same Perch buttons as hero a.

const snap = (v, grid) => Math.round(v / grid) * grid;

/** -> null until it can start, then { x, y, phase: "waiting" | "flying" | "landed" }. */
export function useFlight({ from, to, delay = 0, duration = 2000, arc = 0, grid = 3, play = true, reduce = false }) {
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
      const y = fy + (ty - fy) * e - arc * Math.sin(Math.PI * p);
      const next = { x: snap(x, grid), y: snap(y, grid), phase: p >= 1 ? "landed" : "flying" };
      setPos((prev) => (prev && prev.x === next.x && prev.y === next.y && prev.phase === next.phase ? prev : next));
      if (p >= 1) { landed.current = true; return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [play, reduce, fx, fy, tx, ty, delay, duration, arc, grid]);

  return pos;
}

/** A frame's box in the layer's coordinates, kept current. */
function useFrameBox(frameRef, layerRef, layer) {
  const [box, setBox] = useState({ x: 0, y: 0, w: 0, h: 0 });
  useLayoutEffect(() => {
    const f = frameRef?.current;
    const l = layerRef?.current;
    if (!f || !l) return;
    const fr = f.getBoundingClientRect();
    const lr = l.getBoundingClientRect();
    const next = { x: Math.round(fr.left - lr.left), y: Math.round(fr.top - lr.top), w: Math.round(fr.width), h: Math.round(fr.height) };
    setBox((b) => (b.x === next.x && b.y === next.y && b.w === next.w && b.h === next.h ? b : next));
  }, [frameRef, layerRef, layer.w, layer.h]);
  return box;
}

function FlyingBird({ spot, index, frame, layer, small, big, delay, gap, duration, arc, glide, settled, reduce, onPoke, open, bubbleWidth }) {
  const ready = layer.w > 0 && frame.w > 0;
  const from = { x: frame.x + frame.w * spot.from[0], y: frame.y + frame.h * spot.from[1] };
  const to = { x: layer.w * spot.to[0], y: layer.h * spot.to[1] };
  const pos = useFlight({ from, to, delay: delay + index * gap, duration, arc, play: ready, reduce });
  if (!pos) return null;
  const inside = pos.phase !== "landed" && pos.x > frame.x && pos.x < frame.x + frame.w && pos.y > frame.y && pos.y < frame.y + frame.h;
  const size = inside ? small : big;
  const facing = to.x < from.x ? "left" : "right";
  const gliding = pos.phase === "landed" && !reduce;
  return (
    <Perch agent={spot.agent} size={size} state="flying" facing={facing} settled={settled} onPoke={onPoke}
      open={open === spot.agent} bubbleWidth={bubbleWidth} className={gliding ? "lp-glide" : undefined}
      style={{ left: pos.x - size / 2, top: pos.y - size / 2, opacity: pos.phase === "waiting" ? 0 : 1,
        "--lp-glide": `${glide}px`, animationPlayState: settled ? "paused" : "running" }} />
  );
}

/**
 * frameRef: the device the birds leave (its box is measured). spots:
 * [{ agent, from: [fx, fy] (fractions of the frame), to: [tx, ty] (fractions
 * of the layer) }]. small / big: the sizes inside and outside the frame.
 * The layer fills its parent; the heroes place it over the plate.
 */
export default function FlyOut({ frameRef, spots, small = 64, big = 96, delay = 500, gap = 250, duration = 1400, arc = 60, glide = 12,
  settled = false, onPoke, open = null, bubbleWidth = 340, style }) {
  const reduce = useReduce();
  const layerRef = useRef(null);
  const layer = useBox(layerRef);
  const frame = useFrameBox(frameRef, layerRef, layer);
  return (
    <PerchLayer open={open} boxRef={layerRef} style={{ inset: 0, ...style }}>
      {spots.map((spot, i) => (
        <FlyingBird key={spot.agent} spot={spot} index={i} frame={frame} layer={layer} small={small} big={big} delay={delay} gap={gap}
          duration={duration} arc={arc} glide={glide} settled={settled} reduce={reduce} onPoke={onPoke} open={open} bubbleWidth={bubbleWidth} />
      ))}
    </PerchLayer>
  );
}
