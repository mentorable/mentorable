import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { BG, SAFE } from "../../../brand/brand.js";
import { PHONE, PhoneFrame } from "../../../kit/PhoneFrame.jsx";
import { PunchIn } from "../../../kit/PunchIn.jsx";
import { CLAMP } from "../../../kit/motion.js";
import { AgentsHubScreen, HUB_LAYOUT } from "../../../screens/hub/AgentsHub.jsx";

// "two more are still asleep". The Agents hub on the phone, opening at the
// top (the title, Beaker's card). A thumb lands, flicks up, and the page
// runs on under momentum past Talon and settles near the page's end, Talon's
// Open button over the two sleeping "???" cards; then one punch-in on them.

// The flick: the thumb drags the page 190px in four frames, lets go, and the
// page coasts the rest of the way, slowing (no bounce at the end).
const TOUCH = 8;     // thumb lands
const LIFT = 14;     // thumb lets go
const SETTLE = 30;   // page at rest
const PUNCH = 32;

// Where the page comes to rest: as near the page's real end as the shot
// allows. A browser stops where the page's last 96px of padding meets the
// bottom of the screen, and this phone's screen runs off the frame, so a true
// stop leaves both sleeping cards under TikTok's bottom UI (below SAFE.bottom).
// So the page stops as low as it can while the punch-in still holds both
// cards inside the safe zone: the second card's bottom edge lands just above
// SAFE.bottom once the punch-in is in. What shows past the page's end is then
// only below SAFE.bottom, under the platform's own UI.
//
// The punch-in grows from ORIGIN_Y, not the cards' middle: any lower and it
// lifts the phone's top edge into the caption card (bottom edge about
// y 425).
const PUNCH_SCALE = 1.2;
const ORIGIN_Y = 1000;
const CARDS_BOTTOM = SAFE.bottom - 12;   // the second sleeping card's bottom edge, punched in
// The bottom edge's screen y before the punch-in, then the scroll that puts it there.
const restBottom = (ORIGIN_Y + (CARDS_BOTTOM - ORIGIN_Y) / PUNCH_SCALE - PHONE.top - PHONE.bezel) / PHONE.scale;
// That lands the status bar's bottom edge in the gap between Talon's tagline
// and his count line, so no line of text is sliced in half under the bar
// (checked in renders; re-check if the cut-offs above change).
const TARGET = Math.ceil(HUB_LAYOUT.pageTop + HUB_LAYOUT.soonBottom - restBottom);
const DRAG = [0, 15, 45, 100, 190];

function scrollAt(frame) {
  if (frame <= LIFT) return interpolate(frame, [LIFT - 4, LIFT - 3, LIFT - 2, LIFT - 1, LIFT], DRAG, CLAMP);
  return interpolate(frame, [LIFT, SETTLE], [DRAG[DRAG.length - 1], TARGET], { ...CLAMP, easing: Easing.out(Easing.quad) });
}

/** The thumb on the glass during a drag: the same grey disc as Tap, which
 *  lands, moves with the page while it holds on, and lifts at release. */
function Thumb({ frame, x, y0, scroll }) {
  if (frame < TOUCH - 2 || frame > LIFT + 6) return null;
  const opacity = interpolate(frame, [TOUCH - 2, TOUCH, LIFT, LIFT + 6], [0, 0.42, 0.38, 0], CLAMP);
  const scale = interpolate(frame, [TOUCH - 2, TOUCH, LIFT, LIFT + 6], [1.15, 0.92, 0.92, 1.3], CLAMP);
  // While the finger is down it moves with the page; after release it drifts on a little as it lifts.
  const held = Math.min(scroll, DRAG[DRAG.length - 1]);
  const drift = frame > LIFT ? (frame - LIFT) * 9 : 0;
  const size = 44;
  return (
    <div style={{ position: "absolute", left: x - size / 2, top: y0 - held - drift - size / 2, width: size, height: size,
      borderRadius: "50%", background: "rgba(40,40,40,1)", border: "2px solid rgba(255,255,255,0.7)", boxSizing: "border-box",
      opacity, transform: `scale(${scale})`, zIndex: 50 }} />
  );
}

export default function Hub() {
  const frame = useCurrentFrame();
  const scroll = scrollAt(frame);
  // A little right of the screen's centre so the cards' right edges stay
  // clear of the button rail.
  return (
    <AbsoluteFill style={{ background: BG }}>
      <PunchIn at={PUNCH} scale={PUNCH_SCALE} origin={[640, ORIGIN_Y]} dur={7}>
        <PhoneFrame seed="hub" time="4:13">
          <AgentsHubScreen scroll={scroll}
            counts={{ outreach: { left: 1, limit: 2 }, finder: { left: 3, limit: 4 } }}
            offsets={{ outreach: 0, finder: 7, owl: 0, heron: 19 }} />
          <Thumb frame={frame} x={262} y0={400} scroll={scroll} />
        </PhoneFrame>
      </PunchIn>
    </AbsoluteFill>
  );
}
