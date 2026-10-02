import { AbsoluteFill, useCurrentFrame } from "remotion";
import { BG } from "../../../brand/brand.js";
import { PhoneFrame, SCREEN } from "../../../kit/PhoneFrame.jsx";
import { PunchIn } from "../../../kit/PunchIn.jsx";
import { Tap } from "../../../kit/Tap.jsx";
import { ResultsScreen } from "../../../screens/finder/NewFindScreen.jsx";
import { asItems, droppedAsApp } from "../../../screens/finder/data.js";
import { DROPPED, LISTINGS } from "../demoData.js";

// 24.0 to 26.5 s: "charges you to apply? gone."
// The end of Talon's find, scrolled to its foot: the "Left out" box under
// the last result. A tap at 5 opens it: Talon's line (droppedIntro), then
// each listing it dropped with the reason in the backend's own words
// (rules.py DROP_MESSAGES). The application fee is first; punch in on it at
// 22 and hold to the end.
//
// The app lists a dropped listing plainly (its name, then why), with no
// strike-through, so neither does this.

const AT = { open: 5, punch: 22 };
const ANCHOR = 70;                 // the "Left out" box's top, on screen
const S = SCREEN.statusBar;

const ITEMS = asItems(LISTINGS, "new");
const LEFT_OUT = droppedAsApp(DROPPED);

export default function Dropped() {
  const frame = useCurrentFrame();
  const open = frame >= AT.open;
  return (
    <AbsoluteFill style={{ background: BG }}>
      {/* The fee row sits about y 1050 to 1240 on the canvas. Growing from
          above and right of it keeps its text clear of the button rail and
          the phone's top edge below the caption card. */}
      <PunchIn at={AT.punch} scale={1.28} origin={[620, 650]}>
        <PhoneFrame seed="finder-dropped">
          <ResultsScreen items={ITEMS} dropped={LEFT_OUT} open={open}
            pressed={frame >= AT.open && frame < AT.open + 3} anchorY={ANCHOR} />
          <Tap at={AT.open} x={118} y={S + ANCHOR + 27} />
        </PhoneFrame>
      </PunchIn>
    </AbsoluteFill>
  );
}
