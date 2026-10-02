import { interpolate, useCurrentFrame } from "remotion";
import { CLAMP } from "./motion.js";

// A touch, drawn the way a phone's own screen recording shows one: a soft grey
// disc that lands a few frames before `at`, presses at `at`, and lifts away.
// x and y are the touch's centre, in whatever coordinates the parent uses
// (inside PhoneFrame, the app's 374px-wide screen).

export function Tap({ at, x, y, size = 44 }) {
  const frame = useCurrentFrame();
  if (frame < at - 4 || frame > at + 14) return null;
  const opacity = interpolate(frame, [at - 4, at - 1, at + 5, at + 14], [0, 0.42, 0.36, 0], CLAMP);
  const scale = interpolate(frame, [at - 4, at, at + 3, at + 14], [1.15, 0.92, 0.92, 1.35], CLAMP);
  return (
    <div style={{ position: "absolute", left: x - size / 2, top: y - size / 2, width: size, height: size, borderRadius: "50%",
      background: "rgba(40,40,40,1)", border: "2px solid rgba(255,255,255,0.7)", boxSizing: "border-box",
      opacity, transform: `scale(${scale})`, pointerEvents: "none", zIndex: 50 }} />
  );
}
