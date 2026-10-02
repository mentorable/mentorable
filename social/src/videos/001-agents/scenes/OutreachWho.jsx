import { AbsoluteFill, Easing, useCurrentFrame } from "remotion";
import { BG } from "../../../brand/brand.js";
import { PhoneFrame } from "../../../kit/PhoneFrame.jsx";
import { Tap } from "../../../kit/Tap.jsx";
import { pressed, progress } from "../../../kit/motion.js";
import { typingLength, useTyping } from "../../../kit/typing.jsx";
import { Keyboard, PhonePage, Swipe, onScreen, scrollAt } from "../../../screens/outreach/ui.jsx";
import {
  BeakerAtWork, NewOutreachPage, SHORTLIST_SAYINGS, WhoStep,
} from "../../../screens/outreach/NewOutreach.jsx";
import { SHORTLIST_PROGRESS, TRIES, progressAt } from "../../../screens/outreach/demo001.js";
import { OUTREACH_GOAL } from "../demoData.js";

// 5.0 s, "tell beaker who you want to reach" (150 frames).
// The Who step with "A goal" picked and the box focused, so the keyboard is
// up (its top shows under the platforms' safe line). The cut lands
// mid-typing: the goal (one typo, x for c, noticed and fixed) is finished at
// TYPED (24) and held. A slow drag (36 to 70) brings up the examples, the
// tries line and "Find people"; a thumb presses it at 78. The box lets go,
// the keyboard drops, and the page changes step, which in the app scrolls
// back to the top (OutreachNewPage: window.scrollTo on every step change).
// So Beaker at work opens on the title and the rail with Beaker on "Pick
// one", then a thumb drags slowly down (6 to 38 after the press) to its
// saying and the real checklist, whose lines land while it is in view and
// hold to the cut. One saying throughout: the app holds each for 4.5 s,
// longer than this shot.
//
// Page-y positions (CSS px from the page's top) come from laying the
// rebuilt page out at the app's mobile width; the readable band is screen
// y 46 to 420.

const TYPE = [{ text: OUTREACH_GOAL, typo: { at: 21, wrong: "x" } }];
const TYPE_SEED = "maya";
const TYPED = 24;             // the last key lands here; the typing starts before the cut
const TYPE_START = TYPED - typingLength(TYPE, TYPE_SEED);
const FIELD_SCROLL = 560;     // "A goal" card, the field and its counter in the band
const BUTTON_SCROLL = 890;    // the examples, the tries line and "Find people"
const DRAG_DOWN = TYPED + 12; // a beat on the finished goal, then the drag
const DRAG_DOWN_FRAMES = 34;
const PRESS = DRAG_DOWN + DRAG_DOWN_FRAMES + 8;   // the button still for a beat first
const FIND_PEOPLE = { x: 106, y: 1223 };   // the button's centre, page-y
// Beaker at work, in frames after the press.
const AT_TOP = 6;             // the new step at the top: title, rail, Beaker flying
const DRAG_FRAMES = 32;
const WORK_SCROLL = 262;      // the saying and the checklist, its newest line above the safe line
const DRAG_EASE = Easing.inOut(Easing.cubic);

// The predictive bar: the word being typed (in quotes, as iOS offers it
// back), then two completions. After a space, the next-word guesses.
const COMPLETE = {
  marine: ["marine", "marina"], biology: ["biology", "biologist"], research: ["research", "researcher"],
  near: ["near", "nearby"], me: ["me", "my"],
};
const NEXT = ["the", "and", "in"];
function suggestionsFor(value) {
  const typedWords = value.split(" ");
  const partial = typedWords[typedWords.length - 1];
  if (!partial) return NEXT;
  const word = OUTREACH_GOAL.split(" ")[typedWords.length - 1] || partial;
  const [whole, other] = COMPLETE[word] || [word, `${word}s`];
  return [`"${partial}"`, whole === partial ? other : whole, whole === partial ? `${other}s` : other];
}

export default function OutreachWho() {
  const frame = useCurrentFrame();
  const typed = useTyping(TYPE, { start: TYPE_START, seed: TYPE_SEED });
  const working = frame >= PRESS;

  if (working) {
    const t = frame - PRESS;
    const scroll = scrollAt(t, 0, [{ at: AT_TOP, dur: DRAG_FRAMES, to: WORK_SCROLL }], DRAG_EASE);
    return (
      <AbsoluteFill style={{ background: BG }}>
        <PhoneFrame seed="outreach-who">
          <PhonePage scroll={scroll}>
            <NewOutreachPage step="shortlist" railOffset={5}>
              <BeakerAtWork saying={SHORTLIST_SAYINGS[0]} lines={progressAt(SHORTLIST_PROGRESS, t)}
                note="Finding real people usually takes under a minute. If you leave, the shortlist waits for you here." />
            </NewOutreachPage>
          </PhonePage>
          {/* The box lost focus with the press: the keyboard drops. */}
          <Keyboard shown={1 - progress(frame, PRESS, 6)} suggestions={suggestionsFor(typed.value)} />
          {/* The thumb lifts as the page changes under it. */}
          {frame < PRESS + 3 && <Tap at={PRESS} x={FIND_PEOPLE.x} y={onScreen(FIND_PEOPLE.y, BUTTON_SCROLL)} />}
          <Swipe at={PRESS + AT_TOP} x={270} y={600} dist={WORK_SCROLL} len={DRAG_FRAMES} easing={DRAG_EASE} />
        </PhoneFrame>
      </AbsoluteFill>
    );
  }

  const scroll = scrollAt(frame, FIELD_SCROLL, [{ at: DRAG_DOWN, dur: DRAG_DOWN_FRAMES, to: BUTTON_SCROLL }], DRAG_EASE);
  return (
    <AbsoluteFill style={{ background: BG }}>
      <PhoneFrame seed="outreach-who">
        <PhonePage scroll={scroll}>
          <NewOutreachPage step="who">
            <WhoStep mode="goal" goal={typed.value} focused typing={typed.typing} tries={TRIES}
              pressed={pressed(frame, PRESS - 1, 2)} />
          </NewOutreachPage>
        </PhonePage>
        <Keyboard shown={1} suggestions={suggestionsFor(typed.value)} />
        {/* Above the keyboard the whole way: it starts low and rides up with the page. */}
        <Swipe at={DRAG_DOWN} x={268} y={430} dist={BUTTON_SCROLL - FIELD_SCROLL} len={DRAG_DOWN_FRAMES} easing={DRAG_EASE} />
        <Tap at={PRESS} x={FIND_PEOPLE.x} y={onScreen(FIND_PEOPLE.y, BUTTON_SCROLL)} />
      </PhoneFrame>
    </AbsoluteFill>
  );
}
