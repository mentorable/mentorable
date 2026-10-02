import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { BG, SAFE } from "../../../brand/brand.js";
import { PHONE, PhoneFrame } from "../../../kit/PhoneFrame.jsx";
import { CLAMP } from "../../../kit/motion.js";
import { AgentsHubScreen, HUB_LAYOUT } from "../../../screens/hub/AgentsHub.jsx";

// "Two more agents are still asleep". The Agents hub on the phone, opening
// at the top (the title, Beaker's card) and holding there for 20 frames. Then
// one slow, smooth scroll (36 frames, easing in and out) carries the page
// past Talon to the two sleeping "???" cards, and the page holds still on
// them for the last 49 frames. No zoom: the cards are read at the phone's own
// scale.

const SCROLL_AT = 20;
const SCROLL_FRAMES = 36;
const GLIDE = Easing.inOut(Easing.cubic);

// Where the page comes to rest: both sleeping cards well inside the readable
// band, clear of the platform's bottom UI (the page's true end would put them
// under it), with the second card's bottom edge 84px above SAFE.bottom. That
// lands the status bar's bottom edge in the gap between Talon's tagline and
// his count line, so no line of text is sliced in half under the bar
// (checked in renders; 12px above SAFE.bottom sliced a tagline line).
const CARDS_BOTTOM = SAFE.bottom - 84;
// That edge's screen y, then the scroll that puts it there.
const restBottom = (CARDS_BOTTOM - PHONE.top - PHONE.bezel) / PHONE.scale;
const TARGET = Math.ceil(HUB_LAYOUT.pageTop + HUB_LAYOUT.soonBottom - restBottom);

function scrollAt(frame) {
  return interpolate(frame, [SCROLL_AT, SCROLL_AT + SCROLL_FRAMES], [0, TARGET], { ...CLAMP, easing: GLIDE });
}

export default function Hub() {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: BG }}>
      <PhoneFrame seed="hub" time="4:13">
        <AgentsHubScreen scroll={scrollAt(frame)}
          counts={{ outreach: { left: 1, limit: 2 }, finder: { left: 3, limit: 4 } }}
          offsets={{ outreach: 0, finder: 7, owl: 0, heron: 19 }} />
      </PhoneFrame>
    </AbsoluteFill>
  );
}
