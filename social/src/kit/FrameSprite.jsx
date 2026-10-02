import { useCurrentFrame, useVideoConfig } from "remotion";

// The app's PixelSprite for video: the same run-length drawing (one rect per
// horizontal run of a color), but the frame comes from the video's clock, not
// a timer, so every render of a frame is the same picture.
//
// A state plays at its own sprite fps (4 for idle, 8 for flying), which is
// what keeps the motion choppy and hand-drawn. `offset` (in video frames)
// starts a state partway through its loop, so two birds on screen at once
// don't blink in step. `hold` freezes it on its first frame.

const RUNS = new WeakMap();

function runsFor(rows, palette) {
  let byRows = RUNS.get(palette);
  if (!byRows) { byRows = new WeakMap(); RUNS.set(palette, byRows); }
  let runs = byRows.get(rows);
  if (runs) return runs;
  runs = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      let end = x + 1;
      while (end < row.length && row[end] === ch) end += 1;
      const fill = palette[ch];
      if (fill) runs.push({ x, y, w: end - x, fill });
      x = end;
    }
  });
  byRows.set(rows, runs);
  return runs;
}

/** Which art frame a state shows `frame` video frames in. */
export function spriteFrame(sprite, state, frame, fps, { offset = 0, hold = false } = {}) {
  const st = sprite.states[state] || sprite.states.idle || Object.values(sprite.states)[0];
  const order = st.sequence || st.frames.map((_, i) => i);
  if (hold || order.length < 2) return st.frames[order[0]];
  const step = Math.floor(((frame + offset) / fps) * (st.fps || 4));
  return st.frames[order[((step % order.length) + order.length) % order.length]];
}

/** `scale` is whole CSS pixels per art pixel (rounded down, at least 1). */
export function FrameSprite({ sprite, state = "idle", scale = 8, flip = false, offset = 0, hold = false, style }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rows = spriteFrame(sprite, state, frame, fps, { offset, hold });
  const runs = runsFor(rows, sprite.palette);
  const px = Math.max(1, Math.floor(Number(scale) || 1));
  const w = sprite.width;
  const h = sprite.height;
  return (
    <svg width={w * px} height={h * px} viewBox={`0 0 ${w} ${h}`} shapeRendering="crispEdges"
      style={{ display: "block", flexShrink: 0, overflow: "visible", ...style }}>
      <g transform={flip ? `translate(${w} 0) scale(-1 1)` : undefined}>
        {runs.map((r) => <rect key={`${r.x}-${r.y}`} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />)}
      </g>
    </svg>
  );
}
