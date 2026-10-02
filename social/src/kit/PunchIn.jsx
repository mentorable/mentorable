import { useCurrentFrame } from "remotion";
import { progress } from "./motion.js";

// A punch-in: the whole frame snaps closer on one detail in a few frames, the
// way an editor zooms on the thing they want you to see, and (if `outAt` is
// given) snaps back. `origin` is the detail's point on the 1080x1920 canvas.

export function PunchIn({ at, scale = 1.28, origin = [540, 1000], dur = 7, outAt, children }) {
  const frame = useCurrentFrame();
  const inP = progress(frame, at, dur);
  const outP = outAt == null ? 0 : progress(frame, outAt, dur);
  const s = 1 + (scale - 1) * (inP - outP);
  return (
    <div style={{ position: "absolute", inset: 0, transform: `scale(${s})`, transformOrigin: `${origin[0]}px ${origin[1]}px` }}>
      {children}
    </div>
  );
}
