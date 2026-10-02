import { Easing, useCurrentFrame } from "remotion";
import { progress } from "./motion.js";

// A slow push-in on one detail, the way a camera eases closer, and (if
// `outAt` is given) eases back out. Gradual on purpose: about 1.3 s in, a
// modest scale, and at most two in a video, kept for the moments the caption
// is about. `origin` is the detail's point on the 1080x1920 canvas.

const GENTLE = Easing.inOut(Easing.cubic);

export function PunchIn({ at, scale = 1.14, origin = [540, 1000], dur = 40, outAt, children }) {
  const frame = useCurrentFrame();
  const inP = progress(frame, at, dur, GENTLE);
  const outP = outAt == null ? 0 : progress(frame, outAt, dur, GENTLE);
  const s = 1 + (scale - 1) * (inP - outP);
  return (
    <div style={{ position: "absolute", inset: 0, transform: `scale(${s})`, transformOrigin: `${origin[0]}px ${origin[1]}px` }}>
      {children}
    </div>
  );
}
