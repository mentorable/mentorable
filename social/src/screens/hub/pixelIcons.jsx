// The app's small pixel icons (src/components/ui/PixelIcons.jsx), copied
// grid for grid: the app's file is JSX that would resolve React from the
// app's own node_modules, and two Reacts in one render is a bad time. Same
// drawing: one path of 1-pixel-tall runs, drawn in currentColor, whole CSS
// pixels per grid pixel.

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

function pathFor(grid) {
  let d = "";
  grid.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (row[x] !== "x") { x += 1; continue; }
      let end = x;
      while (end < row.length && row[end] === "x") end += 1;
      d += `M${x} ${y}h${end - x}v1h${x - end}z`;
      x = end;
    }
  });
  return d;
}

function GridIcon({ grid, size, style }) {
  const w = grid[0].length;
  const h = grid.length;
  const unit = size >= w ? Math.floor(size / w) : size / w;
  const view = size / unit;
  const padX = (view - w) / 2;
  const padY = (view - h) / 2;
  return (
    <svg width={size} height={size} viewBox={`${-padX} ${-padY} ${view} ${view}`} shapeRendering="crispEdges"
      style={{ display: "block", flexShrink: 0, ...style }}>
      <path d={pathFor(grid)} fill="currentColor" />
    </svg>
  );
}

/** kind: "letter" | "star" (the two the hub uses). */
export function PixelStamp({ kind, size = 16, style }) {
  return <GridIcon grid={STAMPS[kind] || STAMPS.star} size={size} style={style} />;
}

/** The small pixel arrow on "Open" buttons. */
export function PixelArrow({ size = 16, style }) {
  return <GridIcon grid={ARROW} size={size} style={style} />;
}
