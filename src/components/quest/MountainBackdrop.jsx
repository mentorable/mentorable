import { useLayoutEffect, useMemo, useRef, useState } from "react";

// The mountain behind the Quest map, climbed from the meadow at the start,
// through forest and rock, to the snow at the finish line. A layer fills in
// with colour and detail once the student has reached it; one still ahead is
// a pale silhouette. The layers' edges are measured from the stones, so each
// sits behind the days whose pictures belong to it (zoneOf in PixelStone.jsx),
// and a worn trail runs from stone to stone.
//
// The shape is a summit with two far peaks behind it and spurs running down
// the face, each lit from the left and shaded on the right, so the face has
// ridgelines instead of being one flat fill. Layers meet over a ragged,
// dithered band rather than a straight line, and the sides and foot fade out
// into the page. On a wide screen the art runs past the map's column to the
// page's edges, so it is a mountainside, not a tall strip.
//
// Everything here is decoration: faint enough that the stones, the plates
// and the callout always read first, drawn behind them, and aria-hidden.

const PEAK = 7;          // rows from the top to the summit, so it sits behind the finish line plate
const BAND = 9;          // rows over which one layer dithers into the next

const LAYERS = [
  { lit: "#e6eedd", shade: "#dee8d4", ridge: "#d5e1c9" },   // meadow
  { lit: "#dfe9d8", shade: "#d6e2ce", ridge: "#cbd9c1" },   // forest
  { lit: "#ecebe7", shade: "#e4e2dd", ridge: "#d9d6cf" },   // rock
  { lit: "#f9fafb", shade: "#eef1f4", ridge: "#e3e7ec" },   // snow
];
const GHOST = { lit: "#f0efec", shade: "#ebeae6", ridge: "#e3e1dc" };   // a layer still ahead
const GRASS = "#d3dfc6";
const FLOWERS = ["#ecdfe7", "#ebe5cc", "#e1def0"];
const TREE = { lit: "#c9d8c0", shade: "#c0d0b6" };
const STRATA = "#dedbd5";
const TRAIL = "#e3dbcd";
const TRAIL_AHEAD = "#e4e2dd";



function noise(i) {
  const s = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}
/** A scattered threshold in 0..1 per cell, so edges look worn rather than patterned. */
const scatter = (x, y) => noise(x * 12.37 + y * 71.13);

/** Smooth value noise in 0..1 along one axis, changing over about `wave` cells. */
function smooth(v, seed, wave) {
  const t = v / wave, i = Math.floor(t), f = t - i;
  const a = noise(i * 17.13 + seed), b = noise((i + 1) * 17.13 + seed);
  return a + (b - a) * f * f * (3 - 2 * f);
}

const PINE_SMALL = ["..x..", ".xxx.", "..x..", ".xxx.", "xxxxx", "..x.."];
const PINE_TALL = ["...x...", "..xxx..", "...x...", "..xxx..", ".xxxxx.", "..xxx..", ".xxxxx.", "xxxxxxx", "...x..."];

/** The landforms, back to front: two far peaks, the summit, then spurs down the face. */
function landforms(C, R) {
  const m = [
    { cx: C * 0.12, peak: PEAK + R * 0.05, s: 0.85, far: true, seed: 1 },
    { cx: C * 0.9, peak: PEAK + R * 0.075, s: 0.75, far: true, seed: 2 },
    { cx: C * 0.5, peak: PEAK, s: 1.2, drift: 0.12, seed: 3 },
  ];
  const n = Math.max(4, Math.round(R / 34));
  for (let i = 0; i < n; i++) {
    const side = i % 2 ? 1 : -1;
    m.push({
      cx: C * 0.5 + side * C * (0.16 + noise(i * 4.1) * 0.24),
      peak: PEAK + R * (0.1 + (i / n) * 0.82) + (noise(i * 2.3) - 0.5) * R * 0.04,
      s: 0.65 + noise(i * 7.7) * 0.6,
      drift: (noise(i * 5.5) - 0.5) * 0.6,
      seed: 10 + i,
    });
  }
  return m;
}

function draw(C, R, edges, reached, trail) {
  const forms = landforms(C, R);
  const topOf = (f, x) => f.peak + Math.abs(x + 0.5 - f.cx) * f.s
    + (smooth(x, f.seed * 31, 3) - 0.5) * 3 + (noise(x * 1.7 + f.seed) - 0.5) * 1.2;
  const tops = forms.map((f) => Array.from({ length: C }, (_, x) => topOf(f, x)));

  // Where each layer begins, per column: the measured edge, wandering a few rows.
  const edgeAt = edges.map((e, i) => Array.from({ length: C }, (_, x) =>
    e + (smooth(x, 50 + i * 13, 10) - 0.5) * 12 + (noise(x * 3.1 + i) - 0.5) * 2));
  const layerAt = (x, y) => {
    let k = 0;
    for (let i = 0; i < edgeAt.length; i++) if (edgeAt[i][x] - y > (scatter(x, y) - 0.5) * BAND) k = i + 1;
    return k;
  };

  // The sides and the foot fade out into the page over a ragged dithered edge.
  const left = Array.from({ length: R }, (_, y) => smooth(y, 91, 16) * 9);
  const right = Array.from({ length: R }, (_, y) => C - smooth(y, 97, 16) * 9);
  const kept = (x, y) => {
    const d = Math.min(x - left[y], right[y] - x, R - 1 - y);
    return d >= 3 || (d > 0 && scatter(x, y) < d / 3);
  };

  const color = Array.from({ length: R }, () => new Array(C).fill(null));
  const layer = Array.from({ length: R }, () => new Array(C).fill(-1));
  const shaded = Array.from({ length: R }, () => new Array(C).fill(false));

  for (let x = 0; x < C; x++) {
    for (let y = 0; y < R; y++) {
      let f = -1;
      for (let i = forms.length - 1; i >= 0; i--) if (y >= tops[i][x]) { f = i; break; }
      if (f < 0 || !kept(x, y)) continue;
      const form = forms[f];
      const ridge = y - tops[f][x] < 1;
      // Lit from the left: the side right of the form's crest is in shade. The
      // crest runs down and a little sideways from the peak, and the shadow
      // dithers away lower down, so no seam runs the height of the face.
      const depth = y - form.peak;
      const crest = form.cx + depth * (form.drift || 0) + (smooth(y, form.seed * 7, 6) - 0.5) * 4;
      const reach = depth < 45 ? 1 : depth < 70 ? 1 - (depth - 45) / 25 : 0;
      const shade = x + 0.5 > crest && scatter(x, y) < reach;
      let k = layerAt(x, y);
      // Snow settles on the ridgelines a little below the snow line.
      if (ridge && k === 2 && y < edgeAt[2][x] + 14 && reached >= 3) k = 3;
      const ink = k <= reached ? LAYERS[k] : GHOST;
      let c = ridge ? ink.ridge : shade ? ink.shade : ink.lit;
      if (form.far && !ridge) c = shade ? GHOST.shade : GHOST.lit;
      color[y][x] = c;
      layer[y][x] = k;
      shaded[y][x] = shade;
    }
  }

  const solid = (x, y) => x >= 0 && x < C && y >= 0 && y < R && color[y][x] !== null;
  const put = (art, x0, y0, ink) => art.forEach((row, dy) => [...row].forEach((ch, dx) => {
    const x = x0 + dx, y = y0 + dy;
    if (ch === "x" && solid(x, y)) color[y][x] = typeof ink === "function" ? ink(x, y) : ink;
  }));
  const reachedAt = (x, y) => solid(x, y) && layer[y][x] <= reached;

  // Rock: broken strata lines that follow the slope a little, and boulders.
  for (let y = 0; y < R; y++) for (let x = 0; x < C; x++) {
    if (!reachedAt(x, y) || layer[y][x] !== 2) continue;
    // A dash only where a slow wave along the row is high, so lines come in short broken runs.
    if ((y + Math.floor(smooth(x, 5, 9) * 6)) % 9 === 0 && smooth(x, y * 3.1, 5) > 0.7) color[y][x] = STRATA;
  }
  // Scattered detail on a jittered grid, thinning out toward the edges of its layer.
  for (let gy = 0; gy < R; gy += 5) for (let gx = 0; gx < C; gx += 4) {
    const r = noise(gx * 1.31 + gy * 7.77);
    const x = gx + Math.floor(noise(gx * 3.7 + gy) * 4), y = gy + Math.floor(noise(gy * 5.3 + gx) * 5);
    if (!reachedAt(x, y)) continue;
    const k = layer[y][x];
    if (k === 1 || (k === 0 && y < edgeAt[0][x] + 16) || (k === 2 && y > edgeAt[1][x] - 10)) {
      // Trees: thick in the forest, a few straggling into the meadow and up to the treeline.
      const density = k === 1 ? 0.5 : 0.14;
      if (r < density && gx % 8 === (gy % 10 === 0 ? 0 : 4)) {
        const tall = noise(x * 9.1 + y) > 0.55;
        put(tall ? PINE_TALL : PINE_SMALL, x - (tall ? 3 : 2), y - (tall ? 8 : 5),
          (px) => (shaded[y][px] ? TREE.shade : TREE.lit));
        continue;
      }
    }
    if (k === 0) {
      // Nudged off the grid's rows, so the tufts do not line up.
      if (r < 0.22) put(["x.x"], x - 1, y + Math.floor(noise(x * 2.9) * 3) - 1, GRASS);
      else if (r < 0.4) put(["x"], x, y, FLOWERS[Math.floor(noise(x + y * 3) * FLOWERS.length)]);
    } else if (k === 2 && r < 0.05 && !shaded[y][x]) {
      put(["xx", "xx"], x, y, LAYERS[2].ridge);
    }
  }

  // The trail, stone to stone, a dotted two-cell path: worn where the student has walked.
  for (let i = 1; i < trail.length; i++) {
    const a = trail[i - 1], b = trail[i];
    const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y), 1);
    for (let s = 0; s <= steps; s++) {
      if (s % 3 === 2) continue;
      const x = Math.round(a.x + ((b.x - a.x) * s) / steps), y = Math.round(a.y + ((b.y - a.y) * s) / steps);
      const ink = b.walked ? TRAIL : TRAIL_AHEAD;
      if (solid(x, y)) color[y][x] = ink;
      if (solid(x + 1, y)) color[y][x + 1] = ink;
    }
  }

  const paths = new Map();
  color.forEach((row, y) => {
    let x = 0;
    while (x < C) {
      const c = row[x];
      let end = x + 1;
      while (end < C && row[end] === c) end += 1;
      if (c) paths.set(c, (paths.get(c) || "") + `M${x} ${y}h${end - x}v1h${x - end}z`);
      x = end;
    }
  });
  return [...paths];
}

/** Sits as the first child of the map (position: relative, isolation: isolate)
 *  and fills it, bleeding sideways to the page's edges. `stones`: the quest's
 *  stones, `zoneOfSlot(slot)`: which layer a day belongs to, `reached`: the
 *  highest layer the student has got to. */
export default function MountainBackdrop({ stones, zoneOfSlot, reached, px = 8 }) {
  const ref = useRef(null);
  // { w, h, l, r, edges: px from the top where layers 1..3 start, trail: stone centres }
  const [box, setBox] = useState(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const map = el?.parentElement;
    if (!map) return undefined;
    const measure = () => {
      const mr = map.getBoundingClientRect();
      // How far the art can run past the map: to the page's content edge on
      // the left (clear of the sidebar) and to the page's right edge.
      const page = map.closest("[data-sidebar-offset]");
      let l = 0, r = 0;
      if (page) {
        const pr = page.getBoundingClientRect();
        const cs = getComputedStyle(page);
        l = Math.max(0, Math.round(mr.left - (pr.left + parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight))));
        r = Math.max(0, Math.round(pr.right - mr.right));
      }
      const centre = {};
      map.querySelectorAll("[data-slot]").forEach((n) => {
        const b = (n.querySelector("button") || n).getBoundingClientRect();
        centre[n.dataset.slot] = { x: b.left + b.width / 2 - mr.left + l, y: b.top + b.height / 2 - mr.top };
      });
      // A layer starts halfway between its lowest day and the highest day of the layer below.
      const edges = [];
      for (let k = 1; k < 4; k++) {
        const first = stones.find((s) => zoneOfSlot(s.slot) >= k);
        const a = first && centre[first.slot], b = first && centre[first.slot - 1];
        edges.push(a && b ? (a.y + b.y) / 2 : mr.height * (1 - k / 4));
      }
      const walked = (s) => s.state === "done" || s.state === "late" || s.state === "today";
      const trail = stones.filter((s) => centre[s.slot]).map((s) => ({ ...centre[s.slot], walked: walked(s) }));
      const next = { w: Math.round(mr.width) + l + r, h: Math.round(mr.height), l, r, edges, trail };
      setBox((prev) => (prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    measure();
    window.addEventListener("resize", measure);
    const watch = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    watch?.observe(map);
    return () => { window.removeEventListener("resize", measure); watch?.disconnect(); };
  }, [stones, zoneOfSlot]);

  const C = box ? Math.ceil(box.w / px) : 0;
  const R = box ? Math.ceil(box.h / px) : 0;
  // Redrawn only when something it draws changes, in whole cells.
  const key = box ? JSON.stringify([C, R, reached, box.edges.map((e) => Math.round(e / px)),
    box.trail.map((t) => [Math.round(t.x / px), Math.round(t.y / px), t.walked])]) : "";
  const paths = useMemo(() => {
    if (!key) return [];
    const [c, r, k, edges, trail] = JSON.parse(key);
    return draw(c, r, edges, k, trail.map(([x, y, walked]) => ({ x, y, walked })));
  }, [key]);

  return (
    <div ref={ref} aria-hidden="true" style={{ position: "absolute", top: 0, bottom: 0, left: -(box?.l || 0), right: -(box?.r || 0),
      zIndex: -1, pointerEvents: "none", overflow: "hidden" }}>
      {box && (
        <svg width={C * px} height={R * px} viewBox={`0 0 ${C} ${R}`} shapeRendering="crispEdges"
          focusable="false" style={{ display: "block" }}>
          {paths.map(([c, d]) => <path key={c} d={d} fill={c} />)}
        </svg>
      )}
    </div>
  );
}
