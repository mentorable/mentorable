import { Easing, interpolate } from "remotion";

// Motion that reads as edited by a person, not generated: things snap into
// place in a handful of frames (no long floaty eases), cuts are hard, and
// anything "random" is seeded so every render is identical.

export const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" };

/** A quick settle: most of the move in the first few frames. */
export const SNAP = Easing.bezier(0.2, 0.9, 0.25, 1);

/** 0 → 1 over `dur` frames starting at `at`, with SNAP. */
export function progress(frame, at, dur = 6, easing = SNAP) {
  return interpolate(frame, [at, at + dur], [0, 1], { ...CLAMP, easing });
}

/** Style for an element popping in at `at`: fades in over 3 frames, rises
 *  `rise` px and grows from `from` over `dur` frames. Before `at`, hidden. */
export function pop(frame, at, { dur = 5, rise = 10, from = 0.96 } = {}) {
  const p = progress(frame, at, dur);
  return {
    opacity: interpolate(frame, [at, at + 3], [0, 1], CLAMP),
    transform: `translateY(${(1 - p) * rise}px) scale(${from + (1 - from) * p})`,
  };
}

/** True for `len` frames from `at`: a button held down by a tap. */
export function pressed(frame, at, len = 4) {
  return frame >= at && frame < at + len;
}

/** Linear position along a path of [frame, x, y] keys, eased per leg. */
export function along(frame, keys, easing = Easing.inOut(Easing.quad)) {
  const frames = keys.map((k) => k[0]);
  return {
    x: interpolate(frame, frames, keys.map((k) => k[1]), { ...CLAMP, easing }),
    y: interpolate(frame, frames, keys.map((k) => k[2]), { ...CLAMP, easing }),
  };
}
