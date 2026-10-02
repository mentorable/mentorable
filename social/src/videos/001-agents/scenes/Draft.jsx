import { AbsoluteFill, useCurrentFrame } from "remotion";
import { BEAKER_LINES, BG } from "../../../brand/brand.js";
import { progress } from "../../../kit/motion.js";
import { PhoneFrame } from "../../../kit/PhoneFrame.jsx";
import { PunchIn } from "../../../kit/PunchIn.jsx";
import { Tap } from "../../../kit/Tap.jsx";
import { Keyboard, PhonePage, onScreen } from "../../../screens/outreach/ui.jsx";
import {
  EmailCard, FactsChecklist, ReviewHeader, ReviewMascot, SendCard, SourceRail, ToneChips, runsFromParagraphs,
} from "../../../screens/outreach/Review.jsx";
import { CONTACT, GMAIL, SENDS_TODAY } from "../../../screens/outreach/demo001.js";
import { DRAFT } from "../demoData.js";

// 10.5 s, "every fact about them links to a source" (150 frames).
// The draft as it lands on the review screen, at its second paragraph: the
// fact about Dr. Ortiz's lab highlighted the way the editor marks it, held
// while it reads (0 to 44). A thumb taps into it at 44. As on a phone, that
// focuses the editor (the caret, the focus ring) and raises the keyboard;
// the fact takes the linked look and its source shows right under the
// editor, above the keyboard. Once that has settled, the video's one slow
// push-in on the fact and its source (62 to 106), held to the cut.
//
// Page-y positions (CSS px) come from laying the rebuilt page out at the
// app's mobile width; the band a viewer reads is screen y 46 to 422.

const RUNS = runsFromParagraphs(DRAFT.body);
const BODY = 962;          // the second paragraph and, once a fact is linked, its source line above the keyboard
const TAP = 44;
const KEYBOARD_FRAMES = 9;
const PUSH = 62;           // once the linked look and the source line have settled
const PUSH_FRAMES = 44;
const PUSH_SCALE = 1.14;
// On the phone's centre line, high enough that its top stays below the
// caption card and the source line stays above the safe line.
const PUSH_FROM = [540, 700];
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

  return (
    <AbsoluteFill style={{ background: BG }}>
      <PunchIn at={PUSH} scale={PUSH_SCALE} dur={PUSH_FRAMES} origin={PUSH_FROM}>
        <PhoneFrame seed="outreach-draft">
          <PhonePage scroll={BODY}>
            <ReviewScreen active={tapped ? ON_FACT.claim : null} focused={tapped}
              caret={tapped ? { claim: ON_FACT.claim, at: ON_FACT.at, since: TAP } : null}
              flash={tapped ? { index: ON_FACT.claim, since: TAP } : null} />
          </PhonePage>
          <Keyboard shown={progress(frame, TAP, KEYBOARD_FRAMES)} suggestions={SUGGESTIONS} />
          <Tap at={TAP} x={ON_FACT.x} y={onScreen(ON_FACT.y, BODY)} />
        </PhoneFrame>
      </PunchIn>
    </AbsoluteFill>
  );
}
