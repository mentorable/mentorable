import { AbsoluteFill, useCurrentFrame } from "remotion";
import { BG, BORDER, SANS, TEXT, TEXT_MID, WHITE, useInk } from "../../../brand/brand.js";
import { BEAKER, TALON } from "../../../brand/sprites.js";
import { BetaPill, Wordmark } from "../../../kit/Brand.jsx";
import { pop } from "../../../kit/motion.js";
import { StageBird, depart } from "../../../screens/hub/Stage.jsx";
import { END_CARD } from "../copy.js";

// The end card, the whole frame (no caption card or brand line over it).
// Left-aligned on the same edge as every caption before it: the wordmark and
// BETA pill, the two birds standing together, then the beta line as the
// biggest words in the video, what it means, and where to find it. It pops
// together in the first 15 frames and then holds dead still. In the last 18
// frames Beaker takes off out of the right edge, which is where he comes back
// in from the left a few seconds into the loop.

const U = 10;                      // CSS px per art pixel
const BIRDS_TOP = 400;
const GROUND = BIRDS_TOP + 32 * U;
const TALON_X = 50;                // Talon's art starts two columns in, so he lines up near x 70
const BEAKER_X = 380;
const TAKEOFF = 117;

function parts(text) {
  return text.split(/(\*[^*]+\*)/g).filter(Boolean).map((p) =>
    p.startsWith("*") ? { t: p.slice(1, -1), accent: true } : { t: p, accent: false });
}

export default function EndCard() {
  const frame = useCurrentFrame();
  const ink = useInk();
  const flying = frame >= TAKEOFF;
  const off = depart(frame, { start: TAKEOFF, end: TAKEOFF + 16, fromX: BEAKER_X, fromY: BIRDS_TOP, toX: 1160, toY: 150 });
  return (
    <AbsoluteFill style={{ background: BG, fontFamily: SANS }}>
      <div style={{ position: "absolute", left: 60, top: 262, display: "flex", alignItems: "center", gap: 18, ...pop(frame, 1) }}>
        <Wordmark size={52} />
        <BetaPill size={26} />
      </div>

      <StageBird sprite={TALON} kind="talon" state="idle" x={TALON_X} y={BIRDS_TOP} unit={U} ground={GROUND} offset={6} />
      {!off.gone && (
        <StageBird sprite={BEAKER} kind="beaker" state={flying ? "flying" : "idle"} x={flying ? off.x : BEAKER_X}
          y={flying ? off.y : BIRDS_TOP} unit={U} ground={GROUND} offset={flying ? -TAKEOFF : 0} />
      )}

      <div style={{ position: "absolute", left: 60, top: GROUND + 64, width: 870 }}>
        <div style={{ fontWeight: 800, fontSize: 118, lineHeight: 1.02, letterSpacing: "-0.035em", color: TEXT, ...pop(frame, 3, { rise: 14 }) }}>
          {parts(END_CARD.headline).map((p, i) => (
            <span key={i} style={p.accent ? { color: ink.text } : undefined}>{p.t}</span>
          ))}
        </div>
        <p style={{ margin: "30px 0 0", maxWidth: 820, fontWeight: 600, fontSize: 44, lineHeight: 1.36, color: TEXT_MID,
          ...pop(frame, 7) }}>
          {END_CARD.sub}
        </p>
        <div style={{ marginTop: 46, ...pop(frame, 11) }}>
          <span style={{ display: "inline-block", background: WHITE, border: `2px solid ${BORDER}`, borderRadius: 999,
            padding: "20px 40px 24px", fontWeight: 800, fontSize: 52, letterSpacing: "-0.01em", color: ink.text,
            boxShadow: "0 4px 0 rgba(20,20,19,0.06)" }}>
            {END_CARD.url}
          </span>
        </div>
      </div>
    </AbsoluteFill>
  );
}
