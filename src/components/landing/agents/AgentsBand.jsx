import { useEffect, useRef } from "react";
import Mascot from "../../agents/Mascot.jsx";
import { PixelStamp } from "../../ui/PixelIcons.jsx";
import { C, CONTAINER, GUTTER, MOBILE_MAX, SANS, TYPE, useInView, useMedia, useSettle, useTimeline } from "../kit.js";
import { BrowserWindow, Mockup, ScreenCard, Signpost, TextLink, TwoTone } from "../frames.jsx";
import TalonScreen from "../screens/TalonScreen.jsx";
import BeakerScreen from "../screens/BeakerScreen.jsx";
import QuillScreen from "../screens/QuillScreen.jsx";
import { Caption } from "../features/StepList.jsx";
import { useBox } from "../features/Inline.jsx";
import BandEdge from "./BandEdge.jsx";

// The page's one bold moment (PLAN.md 4.5): a full-bleed blue band with a
// grain and stepped edges. An intro with the three sprites inline in one
// sentence, then a spread per agent, ordered as a day (Talon at dawn,
// Beaker in daylight, Quill at night), each a browser window holding that
// agent's screen, which plays once when the window is half in view and
// then offers Replay. A sleeping heron closes it: one more is on the way.

// A tile of fine noise, blended over the blue at 6%.
const GRAIN_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><filter id="g"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/></filter><rect width="180" height="180" filter="url(#g)"/></svg>';
const GRAIN = `url("data:image/svg+xml,${encodeURIComponent(GRAIN_SVG)}")`;

const WINDOW = { w: 880, h: 600 };

const SPREADS = [
  {
    agent: "talon", name: "Talon", role: "Opportunity hawk", side: "right",
    address: "mentorable.net/agents/finder", Screen: TalonScreen, label: "Talon's board, a sample.",
    body: "Talon looks for real scholarships, summer programs, competitions, research and volunteering that fit your record. Each find is checked against its provider's own page, and each one says why it fits you, naming something you've done.",
    rules: [
      "Verified means it read the provider's own page.",
      "Application fees, guaranteed money and requests for bank details are dropped.",
      "No match scores and no odds.",
    ],
    caption: "Talon's board. The programs are real and were read from their providers' pages; dates are as of Oct 20. Mentorable isn't affiliated with them.",
  },
  {
    agent: "beaker", name: "Beaker", role: "Outreach pelican", side: "left",
    address: "mentorable.net/agents/outreach", Screen: BeakerScreen, label: "Beaker's board and review screen, a sample.",
    body: "Name a professor or professional, or describe who you're looking for, and Beaker suggests a short list of real people. It reads up on their work, drafts a short email in the voice you pick, and ties every fact about them to the page it came from. You send it yourself, through your Gmail or by copying it.",
    rules: [
      "Every link is one a search actually returned.",
      "An email address is kept only if a page it read shows it.",
      "Nothing sends until you press Send and confirm.",
    ],
    caption: "Beaker's review screen. The professor and her pages are made up for this page; in the app they are real people and real pages.",
  },
  {
    agent: "quill", name: "Quill", role: "Essay owl", side: "right",
    address: "mentorable.net/agents/essay", Screen: QuillScreen, label: "Quill's review of a sample essay.",
    body: "Quill helps you find what to write about, then reads your drafts and asks what a careful reader would. Every note quotes your own words and ends in a question. It never writes, rewrites or edits a word.",
    rules: [
      "Never writes or edits your essay.",
      "Seven checks on every draft, from answering the prompt to not repeating another essay.",
      "No spelling or grammar notes. A teacher is the right reader for that.",
    ],
    caption: "Quill's notes on a sample personal statement.",
  },
];

/** A sprite set inline in a sentence, with a non-breaking space after it. */
function InlineSprite({ agent, animate }) {
  return (
    <>
      <Mascot agent={agent} state="idle" size={32} title="" animate={animate}
        style={{ display: "inline-block", verticalAlign: -8 }} />
      {"\u00a0"}
    </>
  );
}

function Intro({ stacked }) {
  const ref = useRef(null);
  const { settled } = useSettle(ref);
  const animate = !settled;
  return (
    <div ref={ref} style={{ maxWidth: 880, margin: "0 auto", textAlign: "center" }}>
      <Signpost beak tone="onBlue" style={{ justifyContent: "center" }}>Agents</Signpost>
      <TwoTone tone="onBlue" lead="Three helpers with one job each." rest="They do the legwork, and you decide what goes out."
        style={{ marginTop: 12 }} />
      <div style={{ fontFamily: SANS, fontSize: "1.25rem", fontWeight: 600, lineHeight: 1.75, color: C.onBlue, margin: "28px auto 0",
        maxWidth: stacked ? "100%" : 760 }}>
        <InlineSprite agent="talon" animate={animate} /><strong style={{ fontWeight: 700 }}>Talon</strong> scouts scholarships and programs.{" "}
        <InlineSprite agent="beaker" animate={animate} /><strong style={{ fontWeight: 700 }}>Beaker</strong> helps you write to a professor.{" "}
        <InlineSprite agent="quill" animate={animate} /><strong style={{ fontWeight: 700 }}>Quill</strong> reads your essays and asks questions.
      </div>
    </div>
  );
}

function SpreadText({ spread }) {
  return (
    <div style={{ minWidth: 0 }}>
      <h3 style={{ fontFamily: SANS, fontSize: "1.5rem", fontWeight: 700, lineHeight: 1.2, color: C.onBlue, margin: 0 }}>{spread.name}</h3>
      <p style={{ fontFamily: SANS, fontSize: "1rem", fontWeight: 700, color: C.onBlueSoft, margin: "4px 0 0" }}>{spread.role}</p>
      <p style={{ ...TYPE.body, color: C.onBlue, marginTop: 16 }}>{spread.body}</p>
      <p style={{ fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700, color: C.onBlueSoft, margin: "24px 0 0" }}>Rules it keeps</p>
      <ul style={{ listStyle: "none", margin: "10px 0 0", padding: 0, display: "grid", gap: 10 }}>
        {spread.rules.map((rule) => (
          <li key={rule} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontFamily: SANS, fontSize: "1rem", fontWeight: 600,
            lineHeight: 1.5, color: C.onBlue }}>
            <span aria-hidden="true" style={{ display: "inline-flex", flexShrink: 0, marginTop: 4, color: C.onBlue }}>
              <PixelStamp kind="check" size={16} />
            </span>
            {rule}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Spread({ spread, stacked, phone }) {
  const ref = useRef(null);
  const inView = useInView(ref, { amount: 0.5 });
  const tl = useTimeline({ durations: [4600], play: inView });
  const { settled, poke } = useSettle(ref);
  // Playing is the window moving: keep it awake while it plays.
  useEffect(() => { if (inView) poke(); }, [inView, poke]);
  const replay = () => { tl.replay(); poke(); };
  const { w } = useBox(ref);
  const scale = !stacked && w > 0 ? Math.max(0.85, Math.min(1, w / WINDOW.w)) : 1;
  const shownW = Math.round(WINDOW.w * scale);
  const { Screen } = spread;
  const right = spread.side === "right";

  const under = (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16,
      maxWidth: stacked ? 360 : shownW, margin: stacked ? "12px auto 0" : right ? "12px 0 0" : "12px 0 0 auto" }}>
      <Caption text={spread.caption} tone="onBlue" />
      {tl.done && (
        <TextLink tone="onBlue" arrow={null} onClick={replay} style={{ flexShrink: 0, minHeight: 32 }}
          aria-label={`Replay ${spread.name}'s demo`}>
          Replay
        </TextLink>
      )}
    </div>
  );

  if (stacked) {
    return (
      <div ref={ref} style={{ marginTop: phone ? 80 : 120 }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <SpreadText spread={spread} />
          <div style={{ marginTop: 24, display: "flex", justifyContent: "center" }}>
            {/* The wrapper needs a definite width, or the card's `width: 100%`
                collapses to its content inside the centred flex row. */}
            <Mockup label={spread.label} settled={settled} style={{ width: "100%", maxWidth: 360 }}>
              <ScreenCard><Screen step={0} t={tl.t} layout="mobile" still={settled} /></ScreenCard>
            </Mockup>
          </div>
          {under}
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 120, display: "grid", columnGap: 72, alignItems: "center",
      gridTemplateColumns: right ? "minmax(300px, 1fr) minmax(0, 880px)" : "minmax(0, 880px) minmax(300px, 1fr)" }}>
      <div style={{ gridColumn: right ? 1 : 2, gridRow: 1, minWidth: 0 }}>
        <SpreadText spread={spread} />
      </div>
      {/* This cell fills its track, so `w` is the room the window has (an
          element sized to its content would measure the 880px window itself
          and never scale it); the window sits at the cell's outer edge. */}
      <div ref={ref} style={{ gridColumn: right ? 2 : 1, gridRow: 1, minWidth: 0 }}>
        <div style={{ width: shownW, height: Math.round(WINDOW.h * scale), marginLeft: right ? 0 : "auto",
          overflow: shownW > w && w > 0 ? "hidden" : "visible" }}>
          <div style={{ width: WINDOW.w, height: WINDOW.h, transform: `scale(${scale})`, transformOrigin: right ? "top left" : "top right",
            marginLeft: right ? 0 : shownW - WINDOW.w }}>
            <Mockup label={spread.label} settled={settled}>
              <BrowserWindow address={spread.address}>
                <Screen step={0} t={tl.t} layout="desktop" still={settled} />
              </BrowserWindow>
            </Mockup>
          </div>
        </div>
        {under}
      </div>
    </div>
  );
}

function Heron({ stacked }) {
  const ref = useRef(null);
  const { settled } = useSettle(ref);
  return (
    <div ref={ref} style={{ marginTop: stacked ? 80 : 120, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 16 }}>
      <div aria-hidden="true"><Mascot agent="heron" state="sleeping" size={64} title="" animate={!settled} /></div>
      <p style={{ fontFamily: SANS, fontSize: "0.95rem", fontWeight: 600, lineHeight: 1.5, color: C.onBlueSoft, margin: 0 }}>
        One more is on the way.
      </p>
    </div>
  );
}

// The split rows need 300 of text, the 72 gap and the window at .85 or more
// (748): below about 1240 wide that does not fit, so the spreads stack.
const SPLIT_QUERY = "(min-width: 1240px)";

export default function AgentsBand() {
  const stacked = !useMedia(SPLIT_QUERY);
  const phone = useMedia(`(max-width: ${MOBILE_MAX}px)`);
  return (
    <section id="agents" aria-label="Agents" style={{ position: "relative" }}>
      <BandEdge side="top" />
      <div style={{ position: "relative", background: C.accent, color: C.onBlue, overflow: "hidden" }}>
        <div aria-hidden="true" style={{ position: "absolute", inset: 0, backgroundImage: GRAIN, opacity: 0.06,
          mixBlendMode: "soft-light", pointerEvents: "none" }} />
        {/* The gutter outside, the 1312 container inside, as every other section. */}
        <div style={{ position: "relative", boxSizing: "border-box", padding: `${phone ? 96 : 120}px ${GUTTER} ${phone ? 80 : 96}px` }}>
          <div style={{ maxWidth: CONTAINER, margin: "0 auto" }}>
            <Intro stacked={stacked} />
            {SPREADS.map((spread) => <Spread key={spread.agent} spread={spread} stacked={stacked} phone={phone} />)}
            <Heron stacked={stacked} />
          </div>
        </div>
      </div>
      <BandEdge side="bottom" />
    </section>
  );
}
