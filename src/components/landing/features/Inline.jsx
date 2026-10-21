import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { MOBILE_MAX, useInView, useMedia, useNear, useSettle, useTimeline } from "../kit.js";
import { BrowserWindow, Laptop, Mockup, Phone, PlayPill, ScreenCard } from "../frames.jsx";
import StepList, { Caption, StoryIntro } from "./StepList.jsx";

// The inline layout: the features in one column below the sticky stories'
// query (and on phones), each story played by a clock once it is half in
// view. The same file holds the pieces the sticky stories share: the device
// frame for a story, the device sizes and a box-size hook.

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
 * address, or the phone at 384 x 764. `inline`: Record and College in a
 * ScreenCard at the app's mobile layout; Quest keeps its phone with a
 * narrower app area (`appWidth`, 640 tall). `screenProps` is the story's
 * extra control's contribution (the SAT). `paper`: how the Record sheet
 * comes out of the laptop ({ place, rise }, RecordScreen.Paper).
 */
export function DeviceFrame({ story, inline = false, appWidth = 334, screenProps, paper, step, t, still }) {
  const { Screen } = story;
  const phoneStory = story.device === "phone";
  const layout = phoneStory || inline ? "mobile" : "desktop";
  const props = { step, t, still, ...story.screenProps, ...screenProps, layout };
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
 * Clock-driven playback for one story in the inline layout: the timeline
 * starts once `ref` is half in view, plays every step once and holds the
 * last; the pill pauses, resumes and replays it; step rows jump. `still`
 * follows the 5-second rule: each step start pokes the settle, so nothing
 * inside holds still while it plays, and 5s after it ends (or the visitor
 * leaves it) every sprite and CSS loop pauses.
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

  // The clock waits for the story to come into view, so until then the pill
  // offers Play rather than Pause.
  const running = playing && (inView || touched);
  return {
    step, t: tl.t, still: settled, pill: done ? "done" : running ? "playing" : "paused",
    onPause, onPlay, onReplay, jump,
  };
}

/** The pill for a story's playback. */
function Pill({ pb }) {
  return <PlayPill state={pb.pill} onPause={pb.onPause} onPlay={pb.onPlay} onReplay={pb.onReplay} />;
}

// ─── The inline layout (below the sticky query, and phones) ──────────────────

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
export default function Inline({ stories = [] }) {
  const phone = useMedia(`(max-width: ${MOBILE_MAX}px)`);
  return (
    <div style={{ padding: "16px 0" }}>
      {stories.map((story) => <InlineStory key={story.id} story={story} phone={phone} />)}
    </div>
  );
}
