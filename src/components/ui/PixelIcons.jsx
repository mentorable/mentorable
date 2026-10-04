// Small one-color pixel icons, drawn in `currentColor` so they take the color
// of the text or nav item around them. Each is a grid ("x" filled, "."
// empty) turned into a single crisp path.

// The Agents nav icon: a pelican's head, big bill and sagging pouch, on a
// 20 by 20 grid with 2px strokes so it sits beside the Sidebar's line icons.
const BEAK = [
  "....................",
  ".....xxxx...........",
  "...xxxxxxxx.........",
  "..xxx....xxx........",
  "..xx.......xxxxxxxxx",
  ".xx...xx....xxxxxxxx",
  ".xx...xx.........xxx",
  ".xx........xxxxxxxx.",
  "..xx.......xxxxxx...",
  "..xx...........xx...",
  "..xx..........xx....",
  "..xx.....xx...xx....",
  "..xx....xxxx..xx....",
  "..xx...xx..xxxxx....",
  "..xx...xx...xxx.....",
  "..xx...xx...........",
  "..xx...xx...........",
  "..xx...xx...........",
  "..xx...xx...........",
  "..xx...xx...........",
];

// 8 by 8 stamps: whole pixels at 16px (and 24, 32...).
const STAMPS = {
  letter: [
    "........",
    "xxxxxxxx",
    "xx....xx",
    "x.x..x.x",
    "x..xx..x",
    "x......x",
    "xxxxxxxx",
    "........",
  ],
  check: [
    "........",
    "......xx",
    ".....xx.",
    "x...xx..",
    "xx.xx...",
    ".xxx....",
    "..x.....",
    "........",
  ],
  clock: [
    "..xxxx..",
    ".x....x.",
    "x..x...x",
    "x..x...x",
    "x..xxx.x",
    "x......x",
    ".x....x.",
    "..xxxx..",
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
  sparkle: [
    "...xx...",
    "...xx...",
    "..xxxx..",
    "xxxxxxxx",
    "xxxxxxxx",
    "..xxxx..",
    "...xx...",
    "...xx...",
  ],
  // College List groups, Quest and the other pages' marks.
  peak: [
    "........",
    "...x....",
    "..xxx...",
    "..xxx.x.",
    ".xxxxxxx",
    ".xxxxxxx",
    "xxxxxxxx",
    "........",
  ],
  target: [
    "..xxxx..",
    ".x....x.",
    "x..xx..x",
    "x.x..x.x",
    "x.x..x.x",
    "x..xx..x",
    ".x....x.",
    "..xxxx..",
  ],
  flag: [
    ".x......",
    ".xxxxxx.",
    ".xxxxx..",
    ".xxxxxx.",
    ".x......",
    ".x......",
    ".x......",
    "xxx.....",
  ],
  scroll: [
    ".xxxxxx.",
    "x.....xx",
    ".x.xx.x.",
    ".x....x.",
    ".x.xx.x.",
    ".x....x.",
    "xx.....x",
    ".xxxxxx.",
  ],
  chat: [
    "xxxxxxxx",
    "x......x",
    "x.x.x..x",
    "x......x",
    "xxxxxxxx",
    ".xx.....",
    ".x......",
    "........",
  ],
  person: [
    "...xx...",
    "..xxxx..",
    "..xxxx..",
    "...xx...",
    ".xxxxxx.",
    "xxxxxxxx",
    "xxxxxxxx",
    "........",
  ],
  // 16 by 16, two-tone ("o" is the soft shade): Portfolio's record sections.
  reportcard: [
    "................",
    "..xxxxxxxxxxxx..",
    "..x..........x..",
    "..x...xx.....x..",
    "..x..x..x....x..",
    "..x..x..x..x.x..",
    "..x..xxxx.xxxx..",
    "..x..x..x..x.x..",
    "..x..x..x....x..",
    "..x..........x..",
    "..x.oooooooo.x..",
    "..x..........x..",
    "..x.oooooo...x..",
    "..x..........x..",
    "..xxxxxxxxxxxx..",
    "................",
  ],
  answersheet: [
    "................",
    "..xxxxxxxxxxxx..",
    "..x..........x..",
    "..x.xx.oo.oo.x..",
    "..x.xx.oo.oo.x..",
    "..x..........x..",
    "..x.oo.xx.oo.x..",
    "..x.oo.xx.oo.x..",
    "..x..........x..",
    "..x.oo.oo.xx.x..",
    "..x.oo.oo.xx.x..",
    "..x..........x..",
    "..x.xx.oo.oo.x..",
    "..x.xx.oo.oo.x..",
    "..xxxxxxxxxxxx..",
    "................",
  ],
  notebook: [
    "................",
    "...xxxxxxxxxx...",
    "..xx........x...",
    "...x.oooooo.x...",
    "..xx........x...",
    "...x.oooooo.x...",
    "..xx........x...",
    "...x.oooooo.x...",
    "..xx........x...",
    "...x.oooo...x...",
    "..xx........x...",
    "...x........x...",
    "..xx........x...",
    "...xxxxxxxxxx...",
    "................",
    "................",
  ],
  rocket: [
    ".......xx.......",
    "......xxxx......",
    "......xxxx......",
    ".....xxxxxx.....",
    ".....xxooxx.....",
    ".....xxooxx.....",
    ".....xxxxxx.....",
    ".....xxxxxx.....",
    "....xxxxxxxx....",
    "...xxxxxxxxxx...",
    "...xx.xxxx.xx...",
    "......xxxx......",
    ".......oo.......",
    "......o..o......",
    ".......oo.......",
    "................",
  ],
  trophy: [
    "................",
    "..xxxxxxxxxxxx..",
    "xxxooooooooooxxx",
    "x.xoooooooooox.x",
    "x.xoooooooooox.x",
    ".xxooooooooooxx.",
    "...xoooooooox...",
    "....xoooooox....",
    ".....xxxxxx.....",
    ".......xx.......",
    ".......xx.......",
    ".....xxxxxx.....",
    "....xoooooox....",
    "....xxxxxxxx....",
    "................",
    "................",
  ],
  resume: [
    "................",
    "..xxxxxxxxx.....",
    "..x.......xx....",
    "..x.ooo...x.x...",
    "..x.ooo...xxxx..",
    "..x.ooo......x..",
    "..x..........x..",
    "..x.xxxxxxx..x..",
    "..x..........x..",
    "..x.ooooooo..x..",
    "..x.ooooo....x..",
    "..x..........x..",
    "..x.ooooooo..x..",
    "..xxxxxxxxxxxx..",
    "................",
    "................",
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
  question: [
    "..xxxx..",
    ".xx..xx.",
    ".....xx.",
    "....xx..",
    "...xx...",
    "...xx...",
    "........",
    "...xx...",
  ],
};

const ARROW = [
  "........",
  "...x....",
  "...xx...",
  "xxxxxx..",
  "xxxxxx..",
  "...xx...",
  "...x....",
  "........",
];

// One path per tone for the whole grid: a 1-pixel-tall rectangle per run of
// "x" (the main tone) or "o" (the soft tone, drawn as a tint of the same colour).
const PATHS = new WeakMap();
function pathFor(grid, ch = "x") {
  let byTone = PATHS.get(grid);
  if (!byTone) { byTone = {}; PATHS.set(grid, byTone); }
  if (byTone[ch] !== undefined) return byTone[ch];
  let d = "";
  grid.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (row[x] !== ch) { x += 1; continue; }
      let end = x;
      while (end < row.length && row[end] === ch) end += 1;
      d += `M${x} ${y}h${end - x}v1h${x - end}z`;
      x = end;
    }
  });
  byTone[ch] = d;
  return d;
}

// The box is always `size` square; the art inside is drawn at a whole number
// of CSS pixels per grid pixel and centered, so a 20-pixel icon asked for at
// 22px stays crisp instead of smearing across uneven pixels.
function GridIcon({ grid, size, title, style }) {
  const w = grid[0].length;
  const h = grid.length;
  const unit = size >= w ? Math.floor(size / w) : size / w;
  const view = size / unit;
  const padX = (view - w) / 2;
  const padY = (view - h) / 2;
  return (
    <svg width={size} height={size} viewBox={`${-padX} ${-padY} ${view} ${view}`} shapeRendering="crispEdges" focusable="false"
      role={title ? "img" : undefined} aria-label={title || undefined} aria-hidden={title ? undefined : true}
      style={{ display: "block", flexShrink: 0, ...style }}>
      {title && <title>{title}</title>}
      <path d={pathFor(grid)} fill="currentColor" />
      {grid.some((r) => r.includes("o")) && <path d={pathFor(grid, "o")} fill="currentColor" opacity={0.42} />}
    </svg>
  );
}

/** The Agents nav icon. Decorative: the nav item's label names it. */
export function PixelBeakIcon({ size = 20 }) {
  return <GridIcon grid={BEAK} size={size} />;
}

/** kind: "letter" | "check" | "clock" | "star" | "sparkle" | "question" |
 *  "peak" | "target" | "flag" | "scroll" | "chat" | "person" | "lock", and the 16 by 16 two-tone
 *  "reportcard" | "answersheet" | "notebook" | "rocket" | "trophy" | "resume".
 *  Decorative unless given a `title`. */
export function PixelStamp({ kind, size = 16, title, style }) {
  const grid = STAMPS[kind] || STAMPS.sparkle;
  return <GridIcon grid={grid} size={size} title={title} style={style} />;
}

/** A small pixel arrow pointing right, for "Open" and "Continue" buttons. */
export function PixelArrow({ size = 16, style }) {
  return <GridIcon grid={ARROW} size={size} style={style} />;
}

/** The grid width of a stamp: 8 for the classic marks, 16 for the detailed ones. */
export function stampWidth(kind) {
  return (STAMPS[kind] || STAMPS.sparkle)[0].length;
}
