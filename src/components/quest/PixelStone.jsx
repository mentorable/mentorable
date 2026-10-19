// A day on the map as a pixel stone: a stepped disc on a 4px grid, raised by
// one pixel row of its edge colour, with an 8 by 8 picture inside. The
// pictures follow the climb (meadow at the start, then forest, rocks, and the
// snowy top near the finish), so a stone says roughly how high up it sits.

export const UNIT = 4;                      // CSS px per pixel, the stamps' own grid at 32px
const PIC = 8;

// "x" is the picture's main tone, "o" its soft tone.
const PICTURES = {
  tulip: [
    ".x.xx.x.",
    ".xxxxxx.",
    ".xxxxxx.",
    "..xxxx..",
    "...oo...",
    "oo.oo.oo",
    ".oooooo.",
    "...oo...",
  ],
  mushroom: [
    "..xxxx..",
    ".xxoxxx.",
    "xxxxxxox",
    "xoxxxxxx",
    "...oo...",
    "...oo...",
    "...oo...",
    ".oooooo.",
  ],
  pine: [
    "...xx...",
    "..xxxx..",
    "...xx...",
    "..xxxx..",
    ".xxxxxx.",
    "xxxxxxxx",
    "...oo...",
    "...oo...",
  ],
  tree: [
    "..xxxx..",
    ".xxxxxx.",
    "xxxxxxxx",
    "xxxxxxxx",
    ".xxxxxx.",
    "...oo...",
    "...oo...",
    "..oooo..",
  ],
  rock: [
    "........",
    "...xxx..",
    "..xoxxx.",
    ".xooxxxx",
    ".xxxxxxx",
    "xxxxxxxx",
    "xxxxxxxx",
    "........",
  ],
  pebbles: [
    "........",
    "........",
    "....xxx.",
    "...xxoxx",
    ".xx.xxxx",
    "xoxxxxxx",
    "xxxxxxxx",
    "........",
  ],
  summit: [
    "...xx...",
    "..xoox..",
    "..xxxx..",
    ".xxxxxx.",
    ".xxxxxxx",
    "xxxxxxxx",
    "xxxxxxxx",
    "........",
  ],
  cloud: [
    "........",
    "...xx...",
    "..xxxx..",
    ".xxxxxxx",
    "xxxxxxxx",
    "xxxxxxxx",
    ".oooooo.",
    "........",
  ],
  star: [
    "...xx...",
    "...xx...",
    "..xxxx..",
    "xxxxxxxx",
    ".xxxxxx.",
    "..xxxx..",
    ".xxxxxx.",
    ".xx..xx.",
  ],
  lock: [
    "..xxxx..",
    ".x....x.",
    ".x....x.",
    "xxxxxxxx",
    "xxx..xxx",
    "xxx..xxx",
    "xxxxxxxx",
    "........",
  ],
};

// Bottom to top: two pictures a stretch, alternating stone to stone.
const ZONES = [["tulip", "mushroom"], ["pine", "tree"], ["rock", "pebbles"], ["summit", "cloud"]];

/** The picture for a stone `height` of the way up the quest (0 at the start, 1 at the finish). */
export function pictureFor(slot, height) {
  const zone = ZONES[Math.min(ZONES.length - 1, Math.floor(Math.max(0, height) * ZONES.length))];
  return zone[slot % 2];
}

// One path per shape: a 1-pixel-tall rectangle per run of cells.
function runs(test, w, h, dx = 0, dy = 0) {
  let d = "";
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      if (!test(x, y)) { x += 1; continue; }
      let end = x;
      while (end < w && test(end, y)) end += 1;
      d += `M${x + dx} ${y + dy}h${end - x}v1h${x - end}z`;
      x = end;
    }
  }
  return d;
}

const CACHE = new Map();
function shapes(n, picture) {
  const key = `${n}:${picture}`;
  if (CACHE.has(key)) return CACHE.get(key);
  const r = n / 2;
  const dist = (x, y) => Math.hypot(x + 0.5 - r, y + 0.5 - r);
  const inDisc = (x, y) => dist(x, y) <= r - 0.15;
  // The outline: a disc cell with any of its eight neighbours outside, so the
  // ring has no gaps where the steps go diagonal.
  const inRing = (x, y) => inDisc(x, y) && [-1, 0, 1].some((dx) => [-1, 0, 1].some((dy) => !inDisc(x + dx, y + dy)));
  // A dashed ring: every other run of cells around the edge, by angle.
  const dashed = (x, y) => inRing(x, y)
    && Math.floor(((Math.atan2(y + 0.5 - r, x + 0.5 - r) + Math.PI) / (2 * Math.PI)) * 16) % 2 === 0;
  const grid = PICTURES[picture];
  const off = (n - PIC) / 2;
  const s = {
    disc: runs(inDisc, n, n),
    edge: runs(inDisc, n, n, 0, 1),
    ring: runs(inRing, n, n),
    dashed: runs(dashed, n, n),
    pic: grid ? runs((x, y) => grid[y][x] === "x", PIC, PIC, off, off) : "",
    soft: grid ? runs((x, y) => grid[y][x] === "o", PIC, PIC, off, off) : "",
  };
  CACHE.set(key, s);
  return s;
}

/** `cells`: the disc's width in pixels. `ring`: "solid", "dashed" or none. */
export function PixelStone({ cells, picture, fill, edge, ink, ring, ringColor }) {
  const s = shapes(cells, picture);
  return (
    <svg width={cells * UNIT} height={(cells + 1) * UNIT} viewBox={`0 0 ${cells} ${cells + 1}`}
      shapeRendering="crispEdges" aria-hidden="true" focusable="false" style={{ display: "block" }}>
      <path d={s.edge} fill={edge} />
      <path d={s.disc} fill={fill} />
      {ring && <path d={ring === "dashed" ? s.dashed : s.ring} fill={ringColor} />}
      <path d={s.pic} fill={ink} />
      {s.soft && <path d={s.soft} fill={ink} opacity={0.5} />}
    </svg>
  );
}
