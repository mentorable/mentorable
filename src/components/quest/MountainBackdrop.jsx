import { useLayoutEffect, useMemo, useRef, useState } from "react";

// The mountain behind the Quest map, built in four layers from the bottom:
// meadow, forest, rock, and snow at the top. A layer fills in once the
// student has reached it; one still ahead is only a dotted outline. The
// layers' edges are measured from the stones, so each one sits behind the
// days whose pictures belong to it (see zoneOf in PixelStone.jsx).
//
// Everything here is decoration: faint enough that the stones, the plates
// and the callout always read first, and drawn behind them (aria-hidden).

const LAYERS = [
  { fill: "#e8efe0", dot: "#d6e2cb" },   // meadow
  { fill: "#e2eadc", dot: "#d0dcc6" },   // forest
  { fill: "#eeede9", dot: "#e1dfd9" },   // rock
  { fill: "#ffffff", dot: "#e9e7e3" },   // snow
];
const AHEAD = "#e6e4df";                 // the dotted outline of a layer still to come
const PINE = "#d0dcc6";
const FLOWER = "#dcd6e8";
const PEAK = 7;                          // rows from the top to the summit

function noise(i) {
  const s = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

// A 5 by 6 pixel pine, for the forest once it is reached.
const PINE_ART = ["..x..", ".xxx.", "..x..", ".xxx.", "xxxxx", "..x.."];

/** Every cell's colour, as one path per colour (a rect per run of a row). */
function draw(cols, rows, edges, reached) {
  const c = cols / 2;
  // The ridge: one broad peak at the top, widening fast, with two shoulders
  // and a little roughness so it reads as rock rather than a cone.
  const top = new Array(cols);
  for (let x = 0; x < cols; x++) {
    const d = Math.abs(x + 0.5 - c) / c;                              // 0 at the middle, 1 at the sides
    const main = rows * Math.pow(Math.max(0, (d - 0.1) / 0.9), 1.7);
    const shoulder = (sx) => rows * 0.42 + rows * 1.6 * Math.pow(Math.abs(x + 0.5 - sx) / cols, 1.4);
    const t = Math.min(main, shoulder(cols * 0.18), shoulder(cols * 0.82));
    // PEAK rows down, so the tip sits behind the finish line plate.
    top[x] = Math.max(PEAK, Math.round(PEAK + t + (noise(x) - 0.5) * 3));
  }
  // The row each layer starts at, roughened by a cell or so per column.
  const layerAt = (x, y) => {
    let k = 0;
    for (let i = 0; i < edges.length; i++) {
      const jag = Math.round((noise(x * 7 + i * 31) - 0.5) * 2);
      if (y < edges[i] + jag) k = i + 1;
    }
    return Math.min(LAYERS.length - 1, k);
  };

  const grid = Array.from({ length: rows }, () => new Array(cols).fill(null));
  for (let x = 0; x < cols; x++) {
    for (let y = top[x]; y < rows; y++) {
      const k = layerAt(x, y);
      if (k <= reached) grid[y][x] = LAYERS[k].fill;
      // Still ahead: the ridge line, and a sparse staggered dot inside.
      else if (y === top[x] || (y % 4 === 0 && (x + (y % 8 === 0 ? 0 : 2)) % 4 === 0)) grid[y][x] = AHEAD;
    }
    // The snow's top edge, so white still shows against the grey page.
    if (layerAt(x, top[x]) === 3 && reached >= 3) grid[top[x]][x] = LAYERS[3].dot;
  }
  // Pines in the forest and specks of flowers in the meadow, once reached.
  const put = (art, x0, y0, color) => art.forEach((row, dy) => [...row].forEach((ch, dx) => {
    const y = y0 + dy, x = x0 + dx;
    if (ch === "x" && grid[y]?.[x] && y >= top[x]) grid[y][x] = color;
  }));
  for (let i = 0; i < cols * rows / 90; i++) {
    const x = Math.floor(noise(i * 3.7) * cols), y = Math.floor(noise(i * 5.3 + 1) * rows);
    if (y < top[x] + 2) continue;
    const k = layerAt(x, y);
    if (k > reached) continue;
    if (k === 1 && i % 2 === 0) put(PINE_ART, x - 2, y, PINE);
    else if (k === 0 && i % 3 === 0) put(["x"], x, y, FLOWER);
  }
  const paths = new Map();
  grid.forEach((row, y) => {
    let x = 0;
    while (x < cols) {
      const color = row[x];
      let end = x + 1;
      while (end < cols && row[end] === color) end += 1;
      if (color) paths.set(color, (paths.get(color) || "") + `M${x} ${y}h${end - x}v1h${x - end}z`);
      x = end;
    }
  });
  return [...paths];
}

/** Sits as the first child of the map (position: relative, isolation: isolate)
 *  and fills it. `stones`: the quest's stones, `zoneOfSlot(slot)`: which layer
 *  a day belongs to, `reached`: the highest layer the student has got to. */
export default function MountainBackdrop({ stones, zoneOfSlot, reached, px = 8 }) {
  const ref = useRef(null);
  const [box, setBox] = useState(null);   // { w, h, edges: px from the top where layers 1..3 start }

  useLayoutEffect(() => {
    const el = ref.current;
    const map = el?.parentElement;
    if (!map) return undefined;
    const measure = () => {
      const centre = {};
      map.querySelectorAll("[data-slot]").forEach((n) => { centre[n.dataset.slot] = n.offsetTop + n.offsetHeight / 2; });
      // A layer starts halfway between its lowest day and the highest day of the layer below.
      const edges = [];
      for (let k = 1; k < 4; k++) {
        const first = stones.find((s) => zoneOfSlot(s.slot) >= k);
        const before = first && stones.find((s) => s.slot === first.slot - 1);
        if (first && before && centre[first.slot] != null && centre[before.slot] != null) {
          edges.push((centre[first.slot] + centre[before.slot]) / 2);
        } else {
          edges.push(map.offsetHeight * (1 - k / 4));
        }
      }
      setBox((prev) => {
        const next = { w: map.offsetWidth, h: map.offsetHeight, edges };
        return prev && prev.w === next.w && prev.h === next.h && prev.edges.every((v, i) => Math.abs(v - edges[i]) < 1) ? prev : next;
      });
    };
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const watch = new ResizeObserver(measure);
    watch.observe(map);
    return () => watch.disconnect();
  }, [stones, zoneOfSlot]);

  const cols = box ? Math.ceil(box.w / px) : 0;
  const rows = box ? Math.ceil(box.h / px) : 0;
  const edgesKey = box ? box.edges.map((e) => Math.round(e / px)).join(",") : "";
  const paths = useMemo(
    () => (box ? draw(cols, rows, edgesKey.split(",").map(Number), reached) : []),
    [box, cols, rows, edgesKey, reached],
  );

  return (
    <div ref={ref} aria-hidden="true" style={{ position: "absolute", inset: 0, zIndex: -1, pointerEvents: "none", overflow: "hidden" }}>
      {box && (
        <svg width={cols * px} height={rows * px} viewBox={`0 0 ${cols} ${rows}`} shapeRendering="crispEdges"
          focusable="false" style={{ display: "block" }}>
          {paths.map(([color, d]) => <path key={color} d={d} fill={color} />)}
        </svg>
      )}
    </div>
  );
}
