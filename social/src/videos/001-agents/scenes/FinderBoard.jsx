import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { BG } from "../../../brand/brand.js";
import { PhoneFrame, SCREEN } from "../../../kit/PhoneFrame.jsx";
import { PunchIn } from "../../../kit/PunchIn.jsx";
import { Tap } from "../../../kit/Tap.jsx";
import { CLAMP, SNAP, progress } from "../../../kit/motion.js";
import { BoardScreen } from "../../../screens/finder/BoardScreen.jsx";
import { ListingDrawer } from "../../../screens/finder/ListingDrawer.jsx";
import { asItems } from "../../../screens/finder/data.js";
import { LISTINGS } from "../demoData.js";

// 21.0 to 24.0 s: "it checks each one on its own page".
// Talon's board on the phone, as the app shows it after a find: what Talon
// found waits in the sorting tray ("New finds to sort 4", Save and Dismiss
// on each, the first two showing on a phone), and the timeline below is
// still empty, because nothing moves there until the student saves it.
// Nothing animates in: the board is loaded when the cut lands.
//   0         the top of the board: Talon's hello, "3 of 4 finds left", and
//             the tray's heading at the foot of the screen
//   14        a flick up brings the tray into view
//   34        a tap on the first find's name; its drawer opens on the
//             release (35), leading with "Verified on its own page" and when
//             it was checked
//   40        punch in on that badge, held to the end
// The finds stay unsorted, so the results screen (the dropped scene, with
// Save and Dismiss still on every card) agrees with this board in either
// order.

const AT = { flick: 14, scrolled: 23, tap: 34, open: 35, punch: 40 };
const TOP_Y = 535;           // the tray's top at the cut: the board's top in view
const TRAY_Y = 14;           // and after the flick
const S = SCREEN.statusBar;
const PICK = 0;              // the first find in the tray: Tidepool Futures

// What the drawer shows beyond demoData: who it's for and what to send, as
// Talon would have read them on the page (invented, like the listing).
const DETAILS = {
  eligibility: ["High school juniors and seniors", "Volunteers in ocean or coastal conservation"],
  requirements: ["A one-page summary of your volunteer hours", "One letter from a teacher or volunteer supervisor"],
};

const ITEMS = asItems(LISTINGS, "new");

/** A flick on the glass, drawn like the kit's Tap (a soft grey disc with a
 *  white edge): it lands, drags up with the page and lifts off. */
function Flick({ at, x, y, dy, size = 44 }) {
  const frame = useCurrentFrame();
  if (frame < at - 2 || frame > at + 8) return null;
  const opacity = interpolate(frame, [at - 2, at, at + 4, at + 8], [0, 0.42, 0.36, 0], CLAMP);
  const move = interpolate(frame, [at, at + 5], [0, dy], { ...CLAMP, easing: SNAP });
  return (
    <div style={{ position: "absolute", left: x - size / 2, top: y + move - size / 2, width: size, height: size,
      borderRadius: "50%", background: "rgba(40,40,40,1)", border: "2px solid rgba(255,255,255,0.7)",
      boxSizing: "border-box", opacity, pointerEvents: "none", zIndex: 50 }} />
  );
}

export default function FinderBoard() {
  const frame = useCurrentFrame();
  const anchorY = interpolate(frame, [AT.flick, AT.scrolled], [TOP_Y, TRAY_Y], { ...CLAMP, easing: SNAP });
  const item = { ...ITEMS[PICK], ...DETAILS };
  const open = progress(frame, AT.open, 6);

  // The badge sits at the top of the drawer's body, about y 950 on the
  // canvas. The punch-in grows from just under the phone's top edge and right
  // of the badge, so the badge lands lower and bigger, "Checked today" ends
  // short of the button rail (x 930) with the badge still inside the left
  // margin (x 60), and the phone's top stays below the caption card.
  const origin = [680, 640];

  return (
    <AbsoluteFill style={{ background: BG }}>
      <PunchIn at={AT.punch} scale={1.28} origin={origin}>
        <PhoneFrame seed="finder-board">
          <BoardScreen items={ITEMS} anchorY={anchorY}
            pressedId={frame >= AT.tap - 1 && frame < AT.tap + 2 ? item.id : null}
            overlay={frame >= AT.open ? <ListingDrawer item={item} p={open} /> : null} mascotOffset={2} />
          <Flick at={AT.flick} x={232} y={S + 420} dy={-170} />
          {/* The first find's name, after the flick. Lifts as the drawer opens. */}
          {frame < AT.tap + 2 && <Tap at={AT.tap} x={150} y={S + TRAY_Y + 166} />}
        </PhoneFrame>
      </PunchIn>
    </AbsoluteFill>
  );
}
