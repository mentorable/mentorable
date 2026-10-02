import { AbsoluteFill, useCurrentFrame } from "remotion";
import { BEAKER_LINES, BG, H, LAYOUT } from "../../../brand/brand.js";
import { pressed, progress } from "../../../kit/motion.js";
import { PhoneFrame, SCREEN } from "../../../kit/PhoneFrame.jsx";
import { PunchIn } from "../../../kit/PunchIn.jsx";
import { Tap } from "../../../kit/Tap.jsx";
import { MobileNav, PhonePage, SafariBar } from "../../../screens/outreach/ui.jsx";
import {
  EmailCard, FactsChecklist, ReviewHeader, ReviewMascot, SendCard, SendSheet, SentCopy, SourceRail, ToneChips,
  runsFromParagraphs,
} from "../../../screens/outreach/Review.jsx";
import { CONTACT, GMAIL, SENDS_TODAY, SENT_DAY } from "../../../screens/outreach/demo001.js";
import { DRAFT, STUDENT } from "../demoData.js";

// 13.5 s, two captions (90 frames).
//
// 0 to 44, "it never guesses an email": the review screen with the email
// card's To line in the middle of the band: the address, "Verified", and the
// page it was found on. Punch in on it at 8, from the same point as the
// later scenes' punch-ins, so the phone's top stays below the caption.
//
// 45 to 89, "and only you can press send": a hard cut onto the confirm sheet,
// already up (she pressed Send with Gmail off camera). The cut lands in the
// usual framing, so the caption pops in over the grey above the phone; then
// the hand lifts the phone (47 to 52, same size, its body still running off
// the bottom of the frame) to bring the whole sheet into the band, its top
// edge sliding under the caption card (none of the bezel peeks out above it)
// once the caption is solid. Under the page is Safari's bottom bar, which is
// what puts the sheet's "Send now" on the safe line with the screen's bottom
// edge at the frame's. From, To and "Send now" hold until a thumb presses
// "Send now" at 62, then a hard cut at 64 to the page as the app leaves it:
// back near the top, Beaker cheering, "Sent Oct 2 with Gmail", the bottom nav
// pinned above Safari's bar. 26 frames on that.
//
// Page-y positions (CSS px from the page's top) come from laying the rebuilt
// page out at the app's mobile width.

const RUNS = runsFromParagraphs(DRAFT.body);
const SPLIT = 45;
const ALL_CHECKED = CONTACT.facts_to_verify;   // every fact ticked: the sheet then shows no warning

// Beat 1
const TO_SCROLL = 262;      // Beaker's line, the To line, Verified and where it was found
const PUNCH = 8;
const PUNCH_FROM = [640, 640];

// Beat 2. A phone's confirm sheet sits on the bottom of the page, below the
// usual framing, so the phone is lifted (at the same size as every other
// shot) until the page's bottom is in the band. The page ends at
// VIEWPORT_BOTTOM, above Safari's bar; the screen's bottom edge lands on the
// frame's bottom edge, so the phone still runs off the frame.
// The bezel hides under the caption card: its top a few px below the card's
// top edge, and the phone nudged left and steadied, so the handheld drift
// never shows a sliver of it above or beside the card.
const LIFTED_TOP = 306;
const LIFTED_LEFT = 146;
const LIFTED_DRIFT = 0.5;
// SCREEN y where the page (and the sheet) end. It puts "Send now" on y 1420,
// inside the safe line, and Safari's bar under it reaches the frame's bottom
// edge (home indicator at about y 1890), so the phone still runs off frame.
const VIEWPORT_BOTTOM = 649;
const LIFT = 47;                                         // once the caption is solid (it fades in over 45 to 47)
const LIFT_FRAMES = 5;
const SEND_SCROLL = 2340;   // the page under the sheet, as it was when Send with Gmail was pressed: the ticked facts
const CONFIRM_TAP = 62;
const SENT = 64;
const SENT_SCROLL = 20;     // the Sent page near its top: "Your board" tucked under the caption card, not sliced by it
const SEND_NOW = { x: SCREEN.width / 2, y: VIEWPORT_BOTTOM - 24 - 44 - 10 - 22 };   // over "Not yet" and the sheet's padding

function DraftScreen() {
  return (
    <>
      <ReviewHeader contact={CONTACT} stageLabel="Drafted" />
      <ReviewMascot state="delivering" line={BEAKER_LINES.draftReady} />
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <EmailCard contact={CONTACT} runs={RUNS} />
        <ToneChips left={CONTACT.rewrites_left} />
        <SourceRail contact={CONTACT} />
        <FactsChecklist facts={CONTACT.facts_to_verify} checked={ALL_CHECKED} />
        <SendCard gmail={GMAIL} sendsLeft={SENDS_TODAY} />
      </div>
    </>
  );
}

function SentScreen() {
  return (
    <>
      <ReviewHeader contact={CONTACT} stageLabel="Sent" sentLine={`Sent ${SENT_DAY} with Gmail`} />
      <ReviewMascot state="celebrating" line={BEAKER_LINES.sent} offset={3} />
      <SentCopy subject={CONTACT.subject} body={CONTACT.body} />
    </>
  );
}

export default function Review() {
  const frame = useCurrentFrame();

  if (frame < SPLIT) {
    return (
      <AbsoluteFill style={{ background: BG }}>
        <PunchIn at={PUNCH} scale={1.25} origin={PUNCH_FROM}>
          <PhoneFrame seed="outreach-review">
            <PhonePage scroll={TO_SCROLL}><DraftScreen /></PhonePage>
          </PhoneFrame>
        </PunchIn>
      </AbsoluteFill>
    );
  }

  const sent = frame >= SENT;
  const top = LAYOUT.phoneTop + (LIFTED_TOP - LAYOUT.phoneTop) * progress(frame, LIFT, LIFT_FRAMES);
  // The body runs well past the frame's bottom wherever the phone is.
  const height = H - top + 260;

  return (
    <AbsoluteFill style={{ background: BG }}>
      <PhoneFrame seed="outreach-review-2" drift={LIFTED_DRIFT} style={{ top, height, left: LIFTED_LEFT }}>
        <PhonePage scroll={sent ? SENT_SCROLL : SEND_SCROLL}>
          {sent ? <SentScreen /> : <DraftScreen />}
        </PhonePage>
        <MobileNav bottom={VIEWPORT_BOTTOM} />
        {!sent && (
          <SendSheet from={STUDENT.email} to={DRAFT.to} subject={DRAFT.subject} open={1}
            pressed={pressed(frame, CONFIRM_TAP, 3)} bottom={VIEWPORT_BOTTOM} offset={4} />
        )}
        <SafariBar top={VIEWPORT_BOTTOM} />
        {/* The thumb lifts as the page changes under it. */}
        {frame < SENT + 2 && <Tap at={CONFIRM_TAP} x={SEND_NOW.x} y={SEND_NOW.y} />}
      </PhoneFrame>
    </AbsoluteFill>
  );
}
