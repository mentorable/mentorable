import { AbsoluteFill, useCurrentFrame } from "remotion";
import { BG } from "../../../brand/brand.js";
import { PhoneFrame, SCREEN } from "../../../kit/PhoneFrame.jsx";
import { PunchIn } from "../../../kit/PunchIn.jsx";
import { Tap } from "../../../kit/Tap.jsx";
import { ResultsScreen } from "../../../screens/finder/NewFindScreen.jsx";
import { asItems, droppedAsApp } from "../../../screens/finder/data.js";
import { DROPPED, LISTINGS } from "../demoData.js";

// 38.5 to 42.5 s: "a scholarship that charges you to apply? gone."
// The end of Talon's find, scrolled to its foot: the "Left out" box under
// the last result.
//   0    the box, closed, under the last result's Save and Dismiss
//   18   a tap on "Left out (3)" opens it: Talon's line (droppedIntro), then
//        each listing it dropped with the reason in the backend's own words
//        (rules.py DROP_MESSAGES), the application fee first
//   50   once the list has sat still for a second, a slow push-in (the
//        kit's gentle default: 1.14 over 40 frames, eased both ends) on the
//        fee row
//   90   held there to the end (30 frames)
// This is one of the video's two push-ins.
//
// The app lists a dropped listing plainly (its name, then why), with no
// strike-through, so neither does this.

const AT = { open: 18, punch: 50 };
const ANCHOR = 70;                 // the "Left out" box's top, on screen
const S = SCREEN.statusBar;

const ITEMS = asItems(LISTINGS, "new");
const LEFT_OUT = droppedAsApp(DROPPED);

export default function Dropped() {
  const frame = useCurrentFrame();
  const open = frame >= AT.open;
  return (
    <AbsoluteFill style={{ background: BG }}>
      {/* The fee row sits about x 230 to 845, y 1050 to 1240 on the canvas.
          Growing from above it (y 900) brings it closer without letting the
          phone's top edge rise into the caption card, and keeps its text
          short of the button rail (x 930). */}
      <PunchIn at={AT.punch} origin={[560, 900]}>
        <PhoneFrame seed="finder-dropped">
          <ResultsScreen items={ITEMS} dropped={LEFT_OUT} open={open}
            pressed={frame >= AT.open && frame < AT.open + 3} anchorY={ANCHOR} />
          <Tap at={AT.open} x={118} y={S + ANCHOR + 27} />
        </PhoneFrame>
      </PunchIn>
    </AbsoluteFill>
  );
}
