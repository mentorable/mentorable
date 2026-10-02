import { AbsoluteFill, useCurrentFrame } from "remotion";
import { BG, BORDER, COLUMN, SANS, TEXT, TEXT_MUTED, WHITE, useInk } from "../../../brand/brand.js";
import { typingLength, useTyping } from "../../../kit/typing.jsx";

// "emailing a professor at 16 is terrifying". A plain compose card, no
// phone and no brand's mail app: the app's own card (white, warm border,
// round corners) with To and Subject rows and a body, drawn big so the typing
// is the whole picture. The address in To stops at the @, a guess abandoned
// halfway. "Dear Professor" goes in with a thumb's uneven rhythm and one
// doubled letter fixed, sits there, then a held backspace eats it, and the
// caret blinks alone in the empty body until the cut.
//
// No phone frame on purpose: the hook has under a second to land while the
// feed is still moving, and at phone scale the body text would be 30px on
// the canvas. Here it is 66px, and the card still reads as a screen.

const SCRIPT = [
  { text: "Dear Professor", typo: { at: 9, wrong: "f" } },  // "Proff", noticed, fixed
  { pause: 10 },
  { erase: true },
];
const START = 2;
const SEED = "dear";
// The frame the last backspace lands, read off the script itself, so a new
// script, seed or typing rhythm keeps the caret's blink in step (72 today).
const EMPTY_AT = START + typingLength(SCRIPT, SEED);

const CARD = { left: COLUMN.beside.left, top: 590, width: COLUMN.beside.width, height: 800 };   // centred, clear of the button rail
const PAD = 44;

function Row({ label, children }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 26, padding: `30px ${PAD}px`, borderBottom: `2px solid ${BORDER}` }}>
      <span style={{ width: 132, flexShrink: 0, fontWeight: 700, fontSize: 36, color: TEXT_MUTED }}>{label}</span>
      <span style={{ fontWeight: 500, fontSize: 40, color: TEXT, minWidth: 0 }}>{children}</span>
    </div>
  );
}

export default function Hook() {
  const frame = useCurrentFrame();
  const ink = useInk();
  const typed = useTyping(SCRIPT, { start: START, seed: SEED });

  // The caret: solid while keys land, then the usual blink, timed from the
  // moment the body went empty so the last beat shows it go off and come back.
  const caretOn = frame < EMPTY_AT + 5 || Math.floor((frame - EMPTY_AT - 5) / 8) % 2 === 1;
  const hasText = typed.value.length > 0;

  return (
    <AbsoluteFill style={{ background: BG }}>
      <div style={{ position: "absolute", ...CARD, background: WHITE, border: `2px solid ${BORDER}`, borderRadius: 32,
        boxSizing: "border-box", overflow: "hidden", fontFamily: SANS, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: `32px ${PAD}px 28px`, borderBottom: `2px solid ${BORDER}`, fontWeight: 800, fontSize: 40,
          color: TEXT, letterSpacing: "-0.01em" }}>
          New email
        </div>
        <Row label="To">lena.ortiz@</Row>
        <Row label="Subject" />
        <div style={{ flex: 1, padding: `${PAD}px ${PAD}px`, fontWeight: 500, fontSize: 66, color: TEXT, lineHeight: 1.25,
          whiteSpace: "pre" }}>
          {typed.value}
          <span style={{ display: "inline-block", width: 5, height: 78, background: ink.accent, marginLeft: 3,
            verticalAlign: "-14px", opacity: caretOn ? 1 : 0 }} />
        </div>
        <div style={{ padding: `0 ${PAD}px ${PAD}px`, display: "flex", justifyContent: "flex-end" }}>
          <span style={{ fontWeight: 700, fontSize: 36, padding: "22px 48px", borderRadius: 24, background: ink.button.bg,
            color: ink.button.fg, opacity: hasText ? 1 : 0.55 }}>
            Send
          </span>
        </div>
      </div>
    </AbsoluteFill>
  );
}
