import { AbsoluteFill, Sequence } from "remotion";
import { BG, DEFAULT_ACCENT, InkProvider, inkFor } from "../../brand/brand.js";
import { RALEWAY } from "../../brand/fonts.js";
import { BrandBug } from "../../kit/Brand.jsx";
import { Caption } from "../../kit/Caption.jsx";
import { SafeZoneGuide } from "../../kit/SafeZoneGuide.jsx";
import { CAPTIONS } from "./copy.js";
import { SCENES, TOTAL_FRAMES, sceneById } from "./timeline.js";

import Hook from "./scenes/Hook.jsx";
import BeakerArrives from "./scenes/BeakerArrives.jsx";
import OutreachWho from "./scenes/OutreachWho.jsx";
import Shortlist from "./scenes/Shortlist.jsx";
import Draft from "./scenes/Draft.jsx";
import Review from "./scenes/Review.jsx";
import Handoff from "./scenes/Handoff.jsx";
import FinderBrief from "./scenes/FinderBrief.jsx";
import FinderBoard from "./scenes/FinderBoard.jsx";
import Dropped from "./scenes/Dropped.jsx";
import Hub from "./scenes/Hub.jsx";
import EndCard from "./scenes/EndCard.jsx";

// Video #1, "Meet Beaker and Talon": the Agents launch, about 33 seconds.
// Scenes play back to back on hard cuts; the captions and the brand line sit
// on top, timed from timeline.js and copy.js.

const COMPONENTS = {
  hook: Hook, beakerArrives: BeakerArrives, outreachWho: OutreachWho, shortlist: Shortlist, draft: Draft,
  review: Review, handoff: Handoff, finderBrief: FinderBrief, finderBoard: FinderBoard, dropped: Dropped,
  hub: Hub, endCard: EndCard,
};

export const AGENTS_001 = {
  id: "Agents001",
  durationInFrames: TOTAL_FRAMES,
  defaultProps: { accent: DEFAULT_ACCENT, guides: false },
};

export function Agents001({ accent = DEFAULT_ACCENT, guides = false }) {
  return (
    <InkProvider value={inkFor(accent)}>
      <AbsoluteFill style={{ background: BG, fontFamily: RALEWAY }}>
        {SCENES.map((s) => {
          const Scene = COMPONENTS[s.id];
          return (
            <Sequence key={s.id} name={s.id} from={s.from} durationInFrames={s.frames}>
              <Scene />
            </Sequence>
          );
        })}
        {SCENES.filter((s) => s.id !== "endCard").map((s) => (
          <Sequence key={`brand-${s.id}`} name="brand" from={s.from} durationInFrames={s.frames}>
            <BrandBug demo={!!s.demo} />
          </Sequence>
        ))}
        {CAPTIONS.map((c, i) => {
          const s = sceneById[c.scene];
          return (
            <Sequence key={i} name={`caption: ${c.text}`} from={s.from + (c.at || 0)} durationInFrames={c.frames || s.frames - (c.at || 0)}>
              <Caption text={c.text} />
            </Sequence>
          );
        })}
        {guides && <SafeZoneGuide />}
      </AbsoluteFill>
    </InkProvider>
  );
}
