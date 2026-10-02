import { AbsoluteFill, Easing, useCurrentFrame } from "remotion";
import { BG } from "../../../brand/brand.js";
import { PhoneFrame } from "../../../kit/PhoneFrame.jsx";
import { Tap } from "../../../kit/Tap.jsx";
import { pressed } from "../../../kit/motion.js";
import { PhonePage, Swipe, onScreen, scrollAt } from "../../../screens/outreach/ui.jsx";
import { NewOutreachPage, ShortlistStep } from "../../../screens/outreach/NewOutreach.jsx";
import { CANDIDATES } from "../../../screens/outreach/demo001.js";
import { OUTREACH_GOAL, PICKED } from "../demoData.js";

// 8.0 s, "it finds real people doing that work" (75 frames).
// The shortlist as it lands: Beaker holding up a letter over its line, the
// goal, the first person's name. One slow drag down (8 to 26) to the first
// card whole, with the next person's name and role under it, and a hold
// there (26 to 67): who she is, what she works on, and the page the search
// found her on. A thumb presses "Write to Lena" at 71 and the scene cuts on
// the press (the app moves to Details the moment it lands).
//
// Page-y positions (CSS px) are from laying the rebuilt page out at the
// app's mobile width; the band a viewer reads is screen y 46 to 422.

const TOP = 241;          // Beaker, its line, the goal, the first card's name and role
const PICK = 486;         // the first card whole, the second's name and role
const DRAG = 8;
const DRAG_FRAMES = 18;
const PRESS = 71;
const WRITE_TO = { x: 115, y: 721 };   // "Write to Lena", page-y, on the first card

// A drag, not a fling: the page follows the thumb, easing in and out.
const DRAG_EASE = Easing.inOut(Easing.quad);

export default function Shortlist() {
  const frame = useCurrentFrame();
  const scroll = scrollAt(frame, TOP, [{ at: DRAG, dur: DRAG_FRAMES, to: PICK }], DRAG_EASE);
  return (
    <AbsoluteFill style={{ background: BG }}>
      <PhoneFrame seed="outreach-shortlist">
        <PhonePage scroll={scroll}>
          <NewOutreachPage step="shortlist" railOffset={3}>
            <ShortlistStep candidates={CANDIDATES} goal={OUTREACH_GOAL} offset={2}
              pressedIndex={pressed(frame, PRESS, 4) ? PICKED : null} />
          </NewOutreachPage>
        </PhonePage>
        {/* The thumb rides the page up as it drags. */}
        <Swipe at={DRAG} x={282} y={392} dist={PICK - TOP} len={DRAG_FRAMES} easing={DRAG_EASE} />
        <Tap at={PRESS} x={WRITE_TO.x} y={onScreen(WRITE_TO.y, PICK)} />
      </PhoneFrame>
    </AbsoluteFill>
  );
}
