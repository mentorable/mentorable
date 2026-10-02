import { AbsoluteFill, random, useCurrentFrame } from "remotion";
import { BG, TALON_LINES } from "../../../brand/brand.js";
import { PhoneFrame, SCREEN } from "../../../kit/PhoneFrame.jsx";
import { Tap } from "../../../kit/Tap.jsx";
import { Keyboard } from "../../../screens/outreach/ui.jsx";
import { BriefScreen, LaneScreen, SearchScreen } from "../../../screens/finder/NewFindScreen.jsx";
import { progressEarly } from "../../../screens/finder/data.js";
import { FINDER_BRIEF } from "../demoData.js";

// 29.0 to 34.0 s: "Talon scouts scholarships and programs for you".
// Talon's new-find flow on the phone, three shots on hard cuts, each held
// long enough to read (45 frames or more):
//   0   the lane choice, Scholarships or Activities; a tap on Scholarships at
//       14 selects it, and "Selected" holds for 30 frames before the cut
//   44  the brief: we cut in as she finishes typing what she's after, at the
//       kit's thumb pace (2 to 4 frames a key, one typo noticed and fixed),
//       from 48, done at 83 and resting 21 frames till the cut. The box has focus, so
//       the phone's keyboard is up, as in Beaker's goal box before it
//   104 the search: Talon over the scouting sky, the server's checklist, and
//       Talon's first line (TALON_LINES.searching[0]), held to the end. One
//       line only: a second would get less than a second and a half.
// The real flow has a check step between the brief and the search; the edit
// cuts past it (its dense summary can't be read in a shot this short).
// Nothing scrolls on screen: each shot opens where its detail is, as a cut
// would.

const AT = { laneTap: 14, brief: 44, typeFrom: 48, search: 104 };
const S = SCREEN.statusBar;   // viewport y + S = the phone's own y, for Tap

// Maya's record as the server counts it. Beaker's checklist reads the same
// record (screens/outreach/demo001.js says "4 activities and 1 award"), so
// the two must agree; both should come from demoData's STUDENT once it
// carries these counts.
const RECORD = { activities: 4, awards: 1 };
const PROGRESS = progressEarly(RECORD);

// The want, as she finishes it: the cut lands after "marine ", and
// "biologist" goes in with one slip (p for o, the next key over). Cutting
// in on a word break keeps the last word from hopping between lines.
const WORD = "biologist";
const PREFIX = "scholarships for a future marine ";
const REST = WORD;
const TYPO = { at: 4, wrong: "p" };

// The same rhythm as the kit's typing (kit/typing.jsx): 2 to 4 frames a key,
// a wrong key noticed after 7 frames and backspaced 3 later.
function typingEvents(seed) {
  const ev = [{ f: 0, value: PREFIX }];
  let f = 0;
  let value = PREFIX;
  const gap = (n) => 2 + Math.floor(random(`${seed}-${n}`) * 2.6);
  [...REST].forEach((ch, i) => {
    if (i === TYPO.at) {
      f += gap(`typo-${i}`); value += TYPO.wrong; ev.push({ f, value });
      f += 7; value = value.slice(0, -1); ev.push({ f, value });   // notices, one backspace
      f += 3;
    } else {
      f += gap(i);
    }
    value += ch;
    ev.push({ f, value });
  });
  return ev;
}
const EVENTS = typingEvents("fw5");
const TYPED_END = EVENTS[EVENTS.length - 1].f;

function typedAt(t) {
  let i = 0;
  while (i + 1 < EVENTS.length && EVENTS[i + 1].f <= t) i += 1;
  return { value: EVENTS[i].value, typing: t >= 0 && t <= TYPED_END + 2 };
}

// The predictive bar under her thumb, as Beaker's goal box shows it: the
// word being typed in quotes, then two completions. Right after "marine "
// it guesses the next word; on the slip ("biolp") it offers the fix.
function suggestionsFor(value) {
  const partial = value.slice(value.lastIndexOf(" ") + 1);
  if (!partial) return ["biology", "life", "biologist"];
  if (partial === WORD) return [`"${WORD}"`, `${WORD}s`, "biology"];
  if (WORD.startsWith(partial)) return [`"${partial}"`, WORD, `${WORD}s`];
  return [`"${partial}"`, "biology", WORD];
}

const BRIEF = {
  want: FINDER_BRIEF.want,
  interests: FINDER_BRIEF.interests.split(",").map((s) => s.trim()).filter(Boolean),
  grade: Number.parseInt(FINDER_BRIEF.grade, 10) || null,
  state: FINDER_BRIEF.state,
  citizenship: "unsure",
  effort: "any",
};

export default function FinderBrief() {
  const frame = useCurrentFrame();
  let screen;
  let keys = null;
  if (frame < AT.brief) {
    const picked = frame >= AT.laneTap ? FINDER_BRIEF.lane : null;
    screen = <LaneScreen lane={picked} pressedKey={frame >= AT.laneTap && frame < AT.laneTap + 3 ? "scholarship" : null}
      anchorY={263} mascotOffset={3} />;
  } else if (frame < AT.search) {
    const typed = typedAt(frame - AT.typeFrom);
    screen = <BriefScreen brief={{ ...BRIEF, want: typed.value }} typing={typed.typing} focused anchorY={92}
      mascotOffset={3} />;
    // The box has focus, so the phone's keyboard is up for the whole shot;
    // the hard cut to the search takes it away with the field.
    keys = <Keyboard shown={1} suggestions={suggestionsFor(typed.value)} />;
  } else {
    // Seconds since the search started: the cut lands a second in, and the
    // shot ends before 4.5 s, when the app's timer would turn Talon's line.
    const t = 1 + (frame - AT.search) / 30;
    const saying = TALON_LINES.searching[0];
    screen = <SearchScreen t={t} progress={PROGRESS} saying={saying} anchorY={20} />;
  }

  return (
    <AbsoluteFill style={{ background: BG }}>
      <PhoneFrame seed="finder-brief">
        {screen}
        {keys}
        {/* Scholarships, near the middle of its card. Gone at the cut. */}
        {frame < AT.brief && <Tap at={AT.laneTap} x={150} y={S + 335} />}
      </PhoneFrame>
    </AbsoluteFill>
  );
}
