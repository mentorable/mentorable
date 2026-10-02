import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { BG } from "../../../brand/brand.js";
import { PhoneFrame, SCREEN } from "../../../kit/PhoneFrame.jsx";
import { Tap } from "../../../kit/Tap.jsx";
import { CLAMP, progress } from "../../../kit/motion.js";
import { BoardScreen } from "../../../screens/finder/BoardScreen.jsx";
import { ListingDrawer } from "../../../screens/finder/ListingDrawer.jsx";
import { asItems } from "../../../screens/finder/data.js";
import { LISTINGS } from "../demoData.js";

// 34 to 38.5 s: "it checks every detail against its page".
// Talon's board on the phone, as the app shows it after a find: what Talon
// found waits in the sorting tray ("New finds to sort 4", Save and Dismiss
// on each, the first two showing on a phone), and the timeline below is
// still empty, because nothing moves there until the student saves it.
// Nothing animates in: the board is loaded when the cut lands.
//   0         the top of the board: Talon's hello, "3 of 4 finds left", and
//             the tray's heading at the foot of the screen, held to read
//   42        a slow drag up (34 frames, eased both ends) brings the tray
//             into view; the thumb rides the page the whole way
//   76        the tray at rest, the thumb gone
//   85        a tap on the first find's name; its drawer opens on the
//             release (86) over a third of a second, leading with "Verified
//             on its own page" and when it was checked, high on the screen
//   96        the drawer, open and still, held to the end (49 frames from
//             the open). No push-in: the badge is the first thing under
//             the title, at full size.
// The finds stay unsorted, so the results screen (the dropped scene, with
// Save and Dismiss still on every card) agrees with this board in either
// order.

const AT = { scroll: 42, scrolled: 76, tap: 85, open: 86 };
const OPEN_DUR = 10;
const TOP_Y = 535;           // the tray's top at the cut: the board's top in view
const TRAY_Y = 14;           // and after the scroll
const S = SCREEN.statusBar;
const PICK = 0;              // the first find in the tray: Tidepool Futures
const SCROLL_EASE = Easing.inOut(Easing.cubic);

// What the drawer shows beyond demoData: who it's for and what to send, as
// Talon would have read them on the page (invented, like the listing).
const DETAILS = {
  eligibility: ["High school juniors and seniors", "Volunteers in ocean or coastal conservation"],
  requirements: ["A one-page summary of your volunteer hours", "One letter from a teacher or volunteer supervisor"],
};

const ITEMS = asItems(LISTINGS, "new");

/** A thumb dragging the page, drawn like the kit's Tap (a soft grey disc with
 *  a white edge): it lands a few frames before `at`, moves from `y` to
 *  `y + dy` with the scroll's own easing until `end`, and lifts off. The
 *  page glides a little further than the thumb travels, as a slow scroll
 *  does. */
function Drag({ at, end, x, y, dy, size = 44 }) {
  const frame = useCurrentFrame();
  if (frame < at - 4 || frame > end + 5) return null;
  const opacity = interpolate(frame, [at - 4, at - 1, end, end + 5], [0, 0.42, 0.36, 0], CLAMP);
  const move = interpolate(frame, [at, end], [0, dy], { ...CLAMP, easing: SCROLL_EASE });
  return (
    <div style={{ position: "absolute", left: x - size / 2, top: y + move - size / 2, width: size, height: size,
      borderRadius: "50%", background: "rgba(40,40,40,1)", border: "2px solid rgba(255,255,255,0.7)",
      boxSizing: "border-box", opacity, pointerEvents: "none", zIndex: 50 }} />
  );
}

export default function FinderBoard() {
  const frame = useCurrentFrame();
  const anchorY = interpolate(frame, [AT.scroll, AT.scrolled], [TOP_Y, TRAY_Y], { ...CLAMP, easing: SCROLL_EASE });
  const item = { ...ITEMS[PICK], ...DETAILS };
  const open = progress(frame, AT.open, OPEN_DUR);

  return (
    <AbsoluteFill style={{ background: BG }}>
      <PhoneFrame seed="finder-board">
        <BoardScreen items={ITEMS} anchorY={anchorY}
          pressedId={frame >= AT.tap - 1 && frame < AT.tap + 2 ? item.id : null}
          overlay={frame >= AT.open ? <ListingDrawer item={item} p={open} /> : null} mascotOffset={2} />
        {/* The thumb lands low on the visible screen and drags up with the
            page; it is off the glass before the tap's touch appears (81). */}
        <Drag at={AT.scroll} end={AT.scrolled} x={232} y={S + 540} dy={-380} />
        {/* The first find's name, after the scroll. Lifts as the drawer opens. */}
        {frame < AT.tap + 2 && <Tap at={AT.tap} x={150} y={S + TRAY_Y + 166} />}
      </PhoneFrame>
    </AbsoluteFill>
  );
}
