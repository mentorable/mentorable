import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Mascot from "../../agents/Mascot.jsx";
import { C, CONTAINER, MOBILE_MAX, useInView, useMedia, useNear, useSettle, useTimeline } from "../kit.js";
import { BrowserWindow, Laptop, Mockup, Phone, PlayPill, ScreenCard } from "../frames.jsx";
import StepList, { Caption, StoryIntro } from "./StepList.jsx";

// Features c, "Plates" (PLAN.md 6.7): each story a two-column row with its
// device at 1:1 on a tinted plate that runs to the viewport edge, played by
// a clock once the plate is half in view. The same file holds the inline
// layout every option falls back to on smaller screens, and the pieces the
// other options share: the device frame for a story, the clock-driven
// playback with its pill, and a box-size hook.

// ─── Shared pieces ───────────────────────────────────────────────────────────

/** The device frames' sizes at 1:1 (the laptop's lid is 880 wide; its base
 *  overhangs an 880 column by 20px each side). */
export const DEVICE = {
  laptop: { w: 880, h: 578, boxW: 920 },
  window: { w: 880, h: 600, boxW: 880 },
  phone: { w: 384, h: 764, boxW: 384 },
};

/** The scale that fits a device into w x h, 1 at most, never below `min`. */
export function fitScale(kind, w, h, min = 0.85) {
  const d = DEVICE[kind] || DEVICE.window;
  if (!(w > 0) || !(h > 0)) return 1;
  return Math.max(min, Math.min(1, w / d.w, h / d.h));
}

/** An element's box as state, { w, h, x, vw }: its offset size, its left
 *  edge on the page and the viewport's width, kept up to date on resize. */
export function useBox(ref) {
  const [box, setBox] = useState({ w: 0, h: 0, x: 0, vw: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const read = () => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const x = Math.round(el.getBoundingClientRect().left);
      const vw = document.documentElement.clientWidth;
      setBox((b) => (b.w === w && b.h === h && b.x === x && b.vw === vw ? b : { w, h, x, vw }));
    };
    read();
    // The viewport can grow without the box changing size (a capped
    // container), which moves its left edge, so the window is watched too.
    window.addEventListener("resize", read);
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(read);
    ro?.observe(el);
    return () => {
      window.removeEventListener("resize", read);
      ro?.disconnect();
    };
  }, [ref]);
  return box;
}

/**
 * A story's screen in its device. Desktop: the laptop (with the Record
 * sheet in its `paper` anchor), the browser window with the story's
 * address, or the phone at 384 x 764. `inline`: Record, Chat and College in
 * a ScreenCard at the app's mobile layout; Quest keeps its phone with a
 * narrower app area (`appWidth`, 640 tall). `screenProps` is the story's
 * extra control's contribution (the SAT). `paper`: how the Record sheet
 * comes out of the laptop ({ place, rise, inset }, RecordScreen.Paper).
 */
export function DeviceFrame({ story, inline = false, appWidth = 334, screenProps, paper, step, t, still, onBeat }) {
  const { Screen } = story;
  const phoneStory = story.device === "phone";
  const layout = phoneStory || inline ? "mobile" : "desktop";
  const props = { step, t, still, ...story.screenProps, ...screenProps, layout };
  if (typeof onBeat === "function") props.onBeat = onBeat;
  if (inline) {
    if (phoneStory) return <Phone appWidth={appWidth} appHeight={640}><Screen {...props} /></Phone>;
    return <ScreenCard><Screen {...props} /></ScreenCard>;
  }
  if (story.device === "laptop") {
    const Paper = Screen.Paper;
    return <Laptop paper={Paper ? <Paper step={step} t={t} {...paper} /> : null}><Screen {...props} /></Laptop>;
  }
  if (story.device === "window") return <BrowserWindow address={story.address}><Screen {...props} /></BrowserWindow>;
  return <Phone><Screen {...props} /></Phone>;
}

/**
 * Clock-driven playback for one story (plates and the inline layout): the
 * timeline starts once `ref` is half in view, plays every step once and
 * holds the last; the pill pauses, resumes and replays it; step rows jump.
 * `still` follows the 5-second rule: each step start pokes the settle, so
 * nothing inside holds still while it plays, and 5s after it ends (or the
 * visitor leaves it) every sprite and CSS loop pauses.
 */
export function usePlayback(story, ref) {
  const inView = useInView(ref, { amount: 0.5 });
  const [touched, setTouched] = useState(false);
  const tl = useTimeline({ durations: story.steps.map((s) => s.ms), play: inView || touched });
  const { settled, poke } = useSettle(ref);
  const { step, playing, done } = tl;
  useEffect(() => { if (playing) poke(); }, [step, playing, poke]);

  const onPause = useCallback(() => { setTouched(true); tl.pause(); }, [tl]);
  const onPlay = useCallback(() => { setTouched(true); tl.resume(); poke(); }, [tl, poke]);
  const onReplay = useCallback(() => { setTouched(true); tl.replay(); poke(); }, [tl, poke]);
  const jump = useCallback((i) => { setTouched(true); tl.jump(i); poke(); }, [tl, poke]);

  return {
    step, t: tl.t, still: settled, pill: done ? "done" : playing ? "playing" : "paused",
    onPause, onPlay, onReplay, jump, poke,
  };
}

/** The pill for a story's playback. */
function Pill({ pb, style }) {
  return <PlayPill state={pb.pill} onPause={pb.onPause} onPlay={pb.onPlay} onReplay={pb.onReplay} style={style} />;
}

// ─── The inline layout (every option below its desktop query, and phones) ───

function InlineStory({ story, phone }) {
  const ref = useRef(null);
  const colRef = useRef(null);
  const { w } = useBox(colRef);
  const near = useNear(ref);
  const pb = usePlayback(story, ref);
  const extra = story.useExtra ? story.useExtra() : null;   // eslint-disable-line react-hooks/rules-of-hooks
  const appWidth = Math.min(360, Math.max(280, (w || 358) - 24));
  const phoneStory = story.device === "phone";

  return (
    <section id={story.anchor} ref={ref} aria-label={story.signpost} style={{ padding: "64px 16px" }}>
      <div ref={colRef} style={{ maxWidth: phone ? 360 : 640, margin: "0 auto" }}>
        <StoryIntro story={story} phone={phone} />
        {extra?.control && <div style={{ marginTop: 20 }}>{extra.control}</div>}
        <div style={{ marginTop: 24, display: "flex", justifyContent: "center" }}>
          {/* A flex item's width is its content's, so the card's `width: 100%`
              needs a definite width on the wrapper; the phone has its own. */}
          <Mockup label={`${story.signpost} screen, a sample.`} settled={pb.still}
            style={phoneStory ? undefined : { width: "100%", maxWidth: 360 }}>
            {near
              ? <DeviceFrame story={story} inline appWidth={appWidth} screenProps={extra?.screenProps} step={pb.step} t={pb.t} still={pb.still} />
              : (phoneStory ? <Phone appWidth={appWidth} appHeight={640} /> : <ScreenCard />)}
          </Mockup>
        </div>
        <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
          <Pill pb={pb} />
        </div>
        <StepList steps={story.steps} active={pb.step} onPick={pb.jump} />
        <Caption text={story.caption} style={{ marginTop: 16 }} />
      </div>
    </section>
  );
}

/** One column: signpost, h2, body, the extra control, the screen, the pill,
 *  the step list, the caption. Phones get a 360 column, tablets 640. */
export function Inline({ stories = [] }) {
  const phone = useMedia(`(max-width: ${MOBILE_MAX}px)`);
  return (
    <div style={{ padding: "16px 0" }}>
      {stories.map((story) => <InlineStory key={story.id} story={story} phone={phone} />)}
    </div>
  );
}

// ─── Plates (option c on desktop) ────────────────────────────────────────────

const PLATE_H = { record: 640, chat: 640, colleges: 640, quest: 780 };
const COL = (CONTAINER - 11 * 24) / 12;
// The 12-column container with a flexible outer column each side, so a
// plate can run to the viewport edge while the text stays on the grid.
const GRID = `minmax(16px, 1fr) repeat(12, minmax(0, ${COL}px)) minmax(16px, 1fr)`;

// How each device sits in its plate (the plate crops it; the agent on its
// edge needs room above it).
const SEAT = { laptop: { bottom: 0 }, window: { bottom: -24 }, phone: { bottom: 8 } };

/** The one agent on a plate's edge: Quill on the laptop lid, Talon on the
 *  College window, Beaker at the phone's foot. The Chat window gets none.
 *  Each sits where the plate cannot crop it: Talon well in from the window's
 *  right edge (the side the plate crops), Beaker on the phone's outer side,
 *  away from the text, where the plate has room. */
function EdgeAgent({ story, side, step, animate, cheer }) {
  if (story.id === "record") {
    return (
      <div aria-hidden="true" style={{ position: "absolute", left: 68, top: -60 }}>
        <Mascot agent="quill" state={step === 0 ? "thinking" : "idle"} size={64} title="" animate={animate} />
      </div>
    );
  }
  if (story.id === "colleges") {
    return (
      <div aria-hidden="true" style={{ position: "absolute", right: 176, top: -60 }}>
        <Mascot agent="talon" state={step === 1 ? "delivering" : "idle"} size={64} title="" animate={animate} />
      </div>
    );
  }
  if (story.id === "quest") {
    const outer = side === "right" ? { left: DEVICE.phone.w + 8 } : { left: -104 };
    return (
      <div aria-hidden="true" style={{ position: "absolute", bottom: 0, ...outer }}>
        <Mascot agent="beaker" state={cheer ? "celebrating" : "idle"} size={96} title="" animate={animate} />
      </div>
    );
  }
  return null;
}

function PlateStory({ story, side, first }) {
  const ref = useRef(null);
  const near = useNear(ref);
  const pb = usePlayback(story, ref);
  const extra = story.useExtra ? story.useExtra() : null;   // eslint-disable-line react-hooks/rules-of-hooks
  const [cheer, setCheer] = useState(false);
  const cheerTimer = useRef(0);
  useEffect(() => () => clearTimeout(cheerTimer.current), []);
  // One celebrating cycle when the phone's "+10 XP" first shows.
  const onBeat = useCallback((name) => {
    if (name !== "xp") return;
    setCheer(true);
    pb.poke();
    clearTimeout(cheerTimer.current);
    cheerTimer.current = setTimeout(() => setCheer(false), 1200);
  }, [pb]);

  const right = side === "right";
  const H = PLATE_H[story.id] || 640;
  const seat = SEAT[story.device] || SEAT.window;
  // The device sits 48px in from the plate's inner edge (the text's side)
  // when the plate has room. A device wider than the plate sits as far in
  // from the outer edge as the plate allows (16, or the page's outer margin
  // on a left plate), so what the plate crops is always the device's right
  // side, never the start of its lines.
  const { w: plateW } = useBox(ref);
  const boxW = (DEVICE[story.device] || DEVICE.window).boxW;
  const spare = plateW > 0 ? plateW - boxW : 96;
  const fits = spare >= 0;
  const inset = Math.max(right ? 16 : 40, Math.min(48, Math.floor(spare / 2)));
  const place = !right && fits ? { right: inset } : { left: inset };
  // The Record sheet: past the lid's right edge when the plate shows 240px
  // there, otherwise rising out of the lid's top, kept 24px inside the
  // plate's right edge, as high as the plate has room for.
  const lidRight = (place.right !== undefined ? plateW - inset - boxW : inset) + boxW - 20;
  const paper = plateW > 0 && plateW - lidRight >= 248 ? { place: "side" }
    : { place: "top", rise: Math.max(0, Math.min(120, H - DEVICE.laptop.h - 12)), inset: Math.max(24, lidRight - (plateW - 24)) };

  return (
    <section id={story.anchor} aria-label={story.signpost}
      style={{ display: "grid", gridTemplateColumns: GRID, columnGap: 24, alignItems: "center", marginTop: first ? 0 : 160 }}>
      <div style={{ gridColumn: right ? "2 / span 5" : "9 / span 5", gridRow: 1, minWidth: 0 }}>
        <StoryIntro story={story} />
        <StepList steps={story.steps} active={pb.step} onPick={pb.jump} />
        {extra?.control && <div style={{ marginTop: 20 }}>{extra.control}</div>}
        <Caption text={story.caption} style={{ marginTop: 20 }} />
      </div>
      <div ref={ref} style={{ gridColumn: right ? "7 / span 8" : "1 / span 8", gridRow: 1, position: "relative", height: H,
        background: story.tint, borderRadius: right ? "24px 0 0 24px" : "0 24px 24px 0", overflow: "hidden" }}>
        <div style={{ position: "absolute", width: boxW, ...place, ...seat }}>
          <Mockup label={`${story.signpost} screen, a sample.`} settled={pb.still}>
            {near && (
              <DeviceFrame story={story} screenProps={extra?.screenProps} paper={paper} step={pb.step} t={pb.t} still={pb.still}
                onBeat={story.id === "quest" ? onBeat : undefined} />
            )}
          </Mockup>
          {near && <EdgeAgent story={story} side={side} step={pb.step} animate={!pb.still} cheer={cheer} />}
        </div>
        <Pill pb={pb} style={{ position: "absolute", right: 16, bottom: 16, zIndex: 2 }} />
      </div>
    </section>
  );
}

/** Each story a two-column row, alternating sides, 160px apart. */
export default function Plates({ stories = [] }) {
  return (
    <div style={{ padding: "96px 0 32px", background: C.page }}>
      {stories.map((story, i) => (
        <PlateStory key={story.id} story={story} side={i % 2 ? "left" : "right"} first={i === 0} />
      ))}
    </div>
  );
}
