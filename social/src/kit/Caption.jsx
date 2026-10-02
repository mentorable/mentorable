import { useCurrentFrame } from "remotion";
import { BORDER, SAFE, LAYOUT, SANS, TEXT, WHITE, useInk } from "../brand/brand.js";
import { pop } from "./motion.js";

// The caption card: the app's own card (white, a 1px warm border, round
// corners) holding one short line in Raleway 800, lowercase, the way a person
// types a caption, not a headline. A word wrapped in *stars* is in the accent
// (as readable text on white). It lands at full opacity on the cut (a fade
// would leave the scene's first frame with no caption, and frame 0 is the
// loop seam), rises the last few px, and leaves on a hard cut. Lives in the
// top third, clear of TikTok's and Reels' own UI.

function parts(text) {
  return text.split(/(\*[^*]+\*)/g).filter(Boolean).map((p) =>
    p.startsWith("*") ? { t: p.slice(1, -1), accent: true } : { t: p, accent: false });
}

export function Caption({ text, top = LAYOUT.captionTop, size = 64 }) {
  const frame = useCurrentFrame();
  const ink = useInk();
  return (
    <div style={{ position: "absolute", left: SAFE.left, top, width: SAFE.right - SAFE.left, ...pop(frame, 0, { rise: 12 }), opacity: 1 }}>
      <div style={{ display: "inline-block", background: WHITE, border: `2px solid ${BORDER}`, borderRadius: 30,
        padding: "22px 32px 26px", boxShadow: "0 4px 0 rgba(20,20,19,0.06)", fontFamily: SANS, fontWeight: 800,
        fontSize: size, lineHeight: 1.14, letterSpacing: "-0.02em", color: TEXT }}>
        {parts(text).map((p, i) => (
          <span key={i} style={p.accent ? { color: ink.text } : undefined}>{p.t}</span>
        ))}
      </div>
    </div>
  );
}
