import { AbsoluteFill, useCurrentFrame } from "remotion";
import { BEAKER_LINES, BG } from "../../../brand/brand.js";
import { progress } from "../../../kit/motion.js";
import { PhoneFrame } from "../../../kit/PhoneFrame.jsx";
import { PunchIn } from "../../../kit/PunchIn.jsx";
import { Tap } from "../../../kit/Tap.jsx";
import { Keyboard, PhonePage, Swipe, onScreen, scrollAt } from "../../../screens/outreach/ui.jsx";
import {
  EmailCard, FactsChecklist, ReviewHeader, ReviewMascot, SendCard, SourceRail, ToneChips, runsFromParagraphs,
} from "../../../screens/outreach/Review.jsx";
import { CONTACT, GMAIL, SENDS_TODAY } from "../../../screens/outreach/demo001.js";
import { DRAFT } from "../demoData.js";

// 10.5 s, "every fact about them links to a source" (90 frames).
// The draft as it lands on the review screen, at its second paragraph: the
// fact about Dr. Ortiz's lab highlighted the way the editor marks it. A thumb
// taps into it at 10. As on a phone, that focuses the editor (the caret, the
// focus ring) and raises the keyboard; the fact takes the linked look and its
// source shows right under the editor, above the keyboard. Then a flick down
// to Sources (the keyboard stays up, as it does while a page scrolls): both
// facts, each with the page it came from, the tapped one outlined and still
// running the rail's flash. Punch in on the two at 49 and hold.
//
// Page-y positions (CSS px) come from laying the rebuilt page out at the
// app's mobile width; the band a viewer reads is screen y 46 to 422.

const RUNS = runsFromParagraphs(DRAFT.body);
const BODY = 962;          // the second paragraph and, once a fact is linked, its source line above the keyboard
const SOURCES = 1686;      // both facts on the rail (the heading over them scrolled just out of view)
const TAP = 10;
const FLICK = 38;
const PUNCH = 49;
const PUNCH_FROM = [640, 640];   // as the later scenes: the phone's top stays below the caption
// Where the tap lands (page-y) and where the caret goes (characters into the claim).
const ON_FACT = { claim: 1, x: 205, y: 1092, at: 32 };   // "volun|teers"
// The predictive bar with the caret in the middle of "volunteers".
const SUGGESTIONS = ["volunteers", "volunteer", "volunteering"];

/** The page from the top: everything the review screen shows, in order. */
function ReviewScreen({ active, caret, focused, flash }) {
  return (
    <>
      <ReviewHeader contact={CONTACT} stageLabel="Drafted" />
      <ReviewMascot state="delivering" line={BEAKER_LINES.draftReady} />
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <EmailCard contact={CONTACT} runs={RUNS} active={active} caret={caret} focused={focused} />
        <ToneChips left={CONTACT.rewrites_left} />
        <SourceRail contact={CONTACT} active={active} flash={flash} />
        <FactsChecklist facts={CONTACT.facts_to_verify} />
        <SendCard gmail={GMAIL} sendsLeft={SENDS_TODAY} />
      </div>
    </>
  );
}

export default function Draft() {
  const frame = useCurrentFrame();
  const tapped = frame >= TAP;
  const scroll = scrollAt(frame, BODY, [{ at: FLICK, dur: 7, to: SOURCES }]);

  return (
    <AbsoluteFill style={{ background: BG }}>
      <PunchIn at={PUNCH} scale={1.25} origin={PUNCH_FROM}>
        <PhoneFrame seed="outreach-draft">
          <PhonePage scroll={scroll}>
            <ReviewScreen active={tapped ? ON_FACT.claim : null} focused={tapped}
              caret={tapped ? { claim: ON_FACT.claim, at: ON_FACT.at, since: TAP } : null}
              flash={tapped ? { index: ON_FACT.claim, since: TAP } : null} />
          </PhonePage>
          <Keyboard shown={progress(frame, TAP, 7)} suggestions={SUGGESTIONS} />
          {frame < FLICK - 2 && <Tap at={TAP} x={ON_FACT.x} y={onScreen(ON_FACT.y, BODY)} />}
          <Swipe at={FLICK} x={290} y={400} dist={240} len={4} />
        </PhoneFrame>
      </PunchIn>
    </AbsoluteFill>
  );
}
