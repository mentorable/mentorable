import { AbsoluteFill, random, useCurrentFrame } from "remotion";
import { BG, TALON_LINES } from "../../../brand/brand.js";
import { PhoneFrame, SCREEN } from "../../../kit/PhoneFrame.jsx";
import { Tap } from "../../../kit/Tap.jsx";
import { Keyboard } from "../../../screens/outreach/ui.jsx";
import { BriefScreen, LaneScreen, SearchScreen } from "../../../screens/finder/NewFindScreen.jsx";
import { progressEarly } from "../../../screens/finder/data.js";
import { FINDER_BRIEF } from "../demoData.js";

// 18.0 to 21.0 s: "talon scouts scholarships and programs for you".
// Talon's new-find flow on the phone, three shots on hard cuts, each held
// long enough to read (20 frames or more):
//   0   the lane choice, Scholarships or Activities; a tap on Scholarships at
//       10 selects it, and "Selected" holds for 10 frames before the cut
//   20  the brief: we cut in as she finishes typing what she's after (one
//       typo), and it rests a few frames once she's done. The box has focus,
//       so the phone's keyboard is up, as in Beaker's goal box before it
//   46  the search: Talon over the scouting sky, the server's checklist, and
//       Talon's own lines (TALON_LINES.searching) turning over at 68
// The real flow has a check step between the brief and the search; the edit
// cuts past it (its dense summary can't be read in a shot this short).
// Nothing scrolls on screen: each shot opens where its detail is, as a cut
// would.

const AT = { laneTap: 10, brief: 20, search: 46, lineTwo: 68 };
const S = SCREEN.statusBar;   // viewport y + S = the phone's own y, for Tap

// Maya's record as the server counts it. Beaker's checklist reads the same
// record (screens/outreach/demo001.js says "4 activities and 1 award"), so
// the two must agree; both should come from demoData's STUDENT once it
// carries these counts.
const RECORD = { activities: 4, awards: 1 };
const PROGRESS = progressEarly(RECORD);

// The want, as she finishes it: the cut lands after "marine ", and
// "biologist" goes in with one slip (p for o, the next key over).
const PREFIX = "scholarships for a future marine ";
const WORD = "biologist";
const TYPO = { at: 4, wrong: "p" };

function typingEvents(seed) {
  const ev = [{ f: 0, value: PREFIX }];
  let f = 0;
  let value = PREFIX;
  [...WORD].forEach((ch, i) => {
    const gap = 1 + (random(`${seed}-${i}`) < 0.45 ? 1 : 0);
    if (i === TYPO.at) {
      f += gap; value += TYPO.wrong; ev.push({ f, value });
      f += 3; value = value.slice(0, -1); ev.push({ f, value });   // notices, one backspace
      f += 2;
    } else {
      f += gap;
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
    const typed = typedAt(frame - AT.brief);
    screen = <BriefScreen brief={{ ...BRIEF, want: typed.value }} typing={typed.typing} focused anchorY={92}
      mascotOffset={3} />;
    // The box has focus, so the phone's keyboard is up for the whole shot;
    // the hard cut to the search takes it away with the field.
    keys = <Keyboard shown={1} suggestions={suggestionsFor(typed.value)} />;
  } else {
    // Seconds since the search started: the cut lands a few seconds in, and
    // Talon's line turns over at 4.5 s, as the app's timer does.
    const t = 4.5 + (frame - AT.lineTwo) / 30;
    const saying = TALON_LINES.searching[t < 4.5 ? 0 : 1];
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
