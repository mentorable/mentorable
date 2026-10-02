import { AbsoluteFill, useCurrentFrame } from "remotion";
import { BEAKER_LINES, BG, H } from "../../../brand/brand.js";
import { pressed, progress } from "../../../kit/motion.js";
import { PhoneFrame, SCREEN } from "../../../kit/PhoneFrame.jsx";
import { Tap } from "../../../kit/Tap.jsx";
import { MobileNav, PhonePage, SafariBar, onScreen } from "../../../screens/outreach/ui.jsx";
import {
  EmailCard, FactsChecklist, ReviewHeader, ReviewMascot, SendCard, SendSheet, SentCopy, SourceRail, ToneChips,
  runsFromParagraphs,
} from "../../../screens/outreach/Review.jsx";
import { CONTACT, GMAIL, SENDS_TODAY, SENT_DAY } from "../../../screens/outreach/demo001.js";
import { DRAFT, STUDENT } from "../demoData.js";

// 13.5 s, one caption over the whole scene: "It never guesses an email.
// You press send." (165 frames). No push-in: the framing does the work.
//
// 0 to 58: the review screen, held still, scrolled so the email card's To
// line sits in the middle of the band: the address, "Verified", and the page
// it was found on, with Beaker's line above it.
//
// 58 to 165: a hard cut to the bottom of the page. A phone's confirm sheet
// sits on the bottom of the page, below the usual framing, so this shot is
// framed higher (the phone lifted at the same size, its body still running
// off the bottom of the frame, its top edge under the caption card). The Send
// card is in the band; a thumb presses "Send with Gmail" at 68 and the
// confirm sheet rises (69 to 77): From and To, both addresses, and "Send
// now". It holds until a thumb presses "Send now" at 118, then a hard cut at
// 120 to the page as the app leaves it: back near the top, Beaker cheering,
// "Sent Oct 2 with Gmail", the bottom nav pinned above Safari's bar. 45
// frames on that.
//
// Page-y positions (CSS px from the page's top) come from laying the rebuilt
// page out at the app's mobile width.

const RUNS = runsFromParagraphs(DRAFT.body);
const ALL_CHECKED = CONTACT.facts_to_verify;   // every fact ticked: the sheet then shows no warning

// Beat 1: the To line, held.
const TO_SCROLL = 262;      // Beaker's line, the To line, Verified and where it was found
const SPLIT = 58;

// Beat 2. The phone lifted (at the same size as every other shot) until the
// page's bottom is in the band. The page ends at VIEWPORT_BOTTOM, above
// Safari's bar; the screen's bottom edge lands on the frame's bottom edge,
// so the phone still runs off the frame. The bezel hides under the caption
// card: its top a few px below the card's top edge, and the phone nudged
// left and steadied, so the handheld drift never shows a sliver of it above
// or beside the card.
const LIFTED_TOP = 306;
const LIFTED_LEFT = 146;
const LIFTED_DRIFT = 0.5;
// SCREEN y where the page (and the sheet) end. It puts "Send now" on y 1420,
// inside the safe line, and Safari's bar under it reaches the frame's bottom
// edge (home indicator at about y 1890), so the phone still runs off frame.
const VIEWPORT_BOTTOM = 649;
const SEND_SCROLL = 2290;   // the ticked facts and the Send card, the page's end just above the nav
const SEND_GMAIL_TAP = SPLIT + 10;               // a beat on the Send card first
const SEND_GMAIL = { x: 118, y: 2504 };          // "Send with Gmail", page-y
const SHEET_UP = SEND_GMAIL_TAP + 1;
const SHEET_FRAMES = 8;
const CONFIRM_TAP = SHEET_UP + SHEET_FRAMES + 41; // the sheet held, both addresses read
const SENT = CONFIRM_TAP + 2;
const SENT_SCROLL = 20;     // the Sent page near its top: "Your board" tucked under the caption card, not sliced by it
const SEND_NOW = { x: SCREEN.width / 2, y: VIEWPORT_BOTTOM - 24 - 44 - 10 - 22 };   // over "Not yet" and the sheet's padding

function DraftScreen({ sendPressed = false }) {
  return (
    <>
      <ReviewHeader contact={CONTACT} stageLabel="Drafted" />
      <ReviewMascot state="delivering" line={BEAKER_LINES.draftReady} />
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <EmailCard contact={CONTACT} runs={RUNS} />
        <ToneChips left={CONTACT.rewrites_left} />
        <SourceRail contact={CONTACT} />
        <FactsChecklist facts={CONTACT.facts_to_verify} checked={ALL_CHECKED} />
        <SendCard gmail={GMAIL} sendsLeft={SENDS_TODAY} pressed={sendPressed} />
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
        <PhoneFrame seed="outreach-review">
          <PhonePage scroll={TO_SCROLL}><DraftScreen /></PhonePage>
        </PhoneFrame>
      </AbsoluteFill>
    );
  }

  const sent = frame >= SENT;
  // The body runs well past the frame's bottom.
  const height = H - LIFTED_TOP + 260;

  return (
    <AbsoluteFill style={{ background: BG }}>
      <PhoneFrame seed="outreach-review-2" drift={LIFTED_DRIFT} style={{ top: LIFTED_TOP, height, left: LIFTED_LEFT }}>
        <PhonePage scroll={sent ? SENT_SCROLL : SEND_SCROLL}>
          {sent ? <SentScreen /> : <DraftScreen sendPressed={pressed(frame, SEND_GMAIL_TAP, 3)} />}
        </PhonePage>
        <MobileNav bottom={VIEWPORT_BOTTOM} />
        {!sent && frame >= SHEET_UP && (
          <SendSheet from={STUDENT.email} to={DRAFT.to} subject={DRAFT.subject} open={progress(frame, SHEET_UP, SHEET_FRAMES)}
            pressed={pressed(frame, CONFIRM_TAP, 3)} bottom={VIEWPORT_BOTTOM} offset={4} />
        )}
        <SafariBar top={VIEWPORT_BOTTOM} />
        {/* The thumb lifts as the sheet rises over it. */}
        {frame <= SHEET_UP && <Tap at={SEND_GMAIL_TAP} x={SEND_GMAIL.x} y={onScreen(SEND_GMAIL.y, SEND_SCROLL)} />}
        {/* The thumb lifts as the page changes under it. */}
        {frame < SENT + 2 && <Tap at={CONFIRM_TAP} x={SEND_NOW.x} y={SEND_NOW.y} />}
      </PhoneFrame>
    </AbsoluteFill>
  );
}
