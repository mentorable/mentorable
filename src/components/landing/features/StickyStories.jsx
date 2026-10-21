import { useCallback, useEffect, useRef, useState } from "react";
import { C, CONTAINER, GUTTER, NAV_H, clamp01, quantize, useNear, useReduce, useSettle } from "../kit.js";
import { Mockup, Plate } from "../frames.jsx";
import StepList, { Caption, StoryIntro } from "./StepList.jsx";
import { DEVICE, DeviceFrame, fitScale, useBox } from "./Inline.jsx";

// The sticky stories (PLAN.md 6.5): each story a tall section whose stage
// pins under the nav while the visitor scrolls through its steps. No timers:
// on every scroll frame the section's position gives `step` and `t`, so
// typing, streaming and the Quest climb follow the scroll both ways. Under
// reduced motion the scroll still picks the step and every screen shows
// that step's final state.

// How far RecordScreen.Paper (a 360px sheet, 120px of it behind the lid)
// reaches past the laptop lid's right edge.
const PAPER_OVERHANG = 240;

/**
 * Scroll progress inside a pinned section: p = (64 - top) / (height -
 * stageHeight), f = p * n, step = floor(f), and t over the middle 72% of
 * each step (an 8% dwell at its start, 20% at its end), quantised to .01.
 */
export function readProgress(section, stage, n, reduce) {
  const r = section.getBoundingClientRect();
  const range = Math.max(1, r.height - stage.offsetHeight);
  const p = clamp01((NAV_H - r.top) / range);
  const f = p * n;
  const step = Math.min(n - 1, Math.floor(f));
  const local = f - step;
  const t = reduce ? 1 : quantize(clamp01((local - 0.08) / 0.72), 100);
  return { step, t };
}

/** The page y where a sub-step's range is `at` (0 to 1) of the way through. */
export function scrollTarget(section, stage, n, i, at = 0.5) {
  const r = section.getBoundingClientRect();
  const range = Math.max(0, r.height - stage.offsetHeight);
  return r.top + window.scrollY - NAV_H + ((i + at) / n) * range;
}

/** step and t for a pinned section of n steps, read on scroll and resize. */
function useScrub(sectionRef, stageRef, n) {
  const reduce = useReduce();
  const [pos, setPos] = useState({ step: 0, t: reduce ? 1 : 0 });
  useEffect(() => {
    let raf = 0;
    const read = () => {
      raf = 0;
      const section = sectionRef.current;
      const stage = stageRef.current;
      if (!section || !stage) return;
      const next = readProgress(section, stage, n, reduce);
      setPos((prev) => (prev.step === next.step && prev.t === next.t ? prev : next));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(read); };
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [sectionRef, stageRef, n, reduce]);
  const goTo = useCallback((i, at = 0.5) => {
    const section = sectionRef.current;
    const stage = stageRef.current;
    if (!section || !stage) return;
    window.scrollTo({ top: Math.max(0, scrollTarget(section, stage, n, i, at)), behavior: reduce ? "auto" : "smooth" });
  }, [sectionRef, stageRef, n, reduce]);
  return { ...pos, goTo };
}

function StickyStory({ story }) {
  const ref = useRef(null);
  const stageRef = useRef(null);
  const plateRef = useRef(null);
  const n = story.steps.length;
  const { step, t, goTo } = useScrub(ref, stageRef, n);
  const near = useNear(ref);
  const { settled, poke } = useSettle(ref);
  // Scrolling the story is the visitor moving it: every change keeps it awake.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    poke();
  }, [step, t, poke]);
  const extra = story.useExtra ? story.useExtra() : null;   // eslint-disable-line react-hooks/rules-of-hooks
  const { w, h, x, vw } = useBox(plateRef);
  const laptop = story.device === "laptop";
  const hasPaper = laptop && typeof story.Screen?.Paper === "function";
  let scale = fitScale(story.device, w, h);
  let paper;
  if (hasPaper && w > 0 && vw > 0) {
    // The resume sheet overhangs the lid's right edge by PAPER_OVERHANG and
    // the plate ends near the viewport's edge, so at 1:1 the sheet would
    // leave the viewport. When that happens the laptop is anchored at the
    // plate's left (its lid starting 20px before the plate) and scaled, no
    // lower than .85, so lid plus sheet end 8px inside the viewport. Where
    // even .85 is too wide, the laptop stays centred at its own scale and
    // the sheet rises out of the lid's top into the room above it instead.
    const room = vw - (x - 20) - 8;
    const sideScale = Math.floor((room / (DEVICE.laptop.w + PAPER_OVERHANG)) * 1000) / 1000;
    if (sideScale >= 0.85) {
      scale = Math.max(0.85, Math.min(scale, sideScale));
      paper = { place: "side" };
    } else {
      const above = (h - DEVICE.laptop.h * scale) / 2 - 8;
      paper = { place: "top", rise: Math.max(0, Math.min(120, Math.floor(above / scale))) };
    }
  }
  const anchorLeft = paper?.place === "side" && scale < 1;
  const seat = anchorLeft
    ? { left: -40, top: "50%", transform: `translateY(-50%) scale(${scale})`, transformOrigin: "left center" }
    : { left: "50%", top: "50%", transform: `translate(-50%, -50%) scale(${scale})`, transformOrigin: "center" };
  // The text column is centred on the plate while it fits the stage; when
  // it is taller (a short viewport), it hangs from the top instead.
  const textRef = useRef(null);
  const { h: textH } = useBox(textRef);
  const textAlign = h > 0 && textH > h ? "start" : "center";

  return (
    <section id={story.anchor} ref={ref} aria-label={story.signpost}
      style={{ position: "relative", height: `calc(100svh - ${NAV_H}px + ${n} * 45svh)` }}>
      <div ref={stageRef} style={{ position: "sticky", top: NAV_H, height: `calc(100svh - ${NAV_H}px)`, boxSizing: "border-box",
        padding: `24px ${GUTTER}` }}>
        <div style={{ maxWidth: CONTAINER, height: "100%", margin: "0 auto", display: "grid", gridTemplateColumns: "360px minmax(0, 1fr)",
          columnGap: 72, alignItems: "center" }}>
          <div ref={textRef} style={{ minWidth: 0, alignSelf: textAlign }}>
            <StoryIntro story={story} />
            <StepList steps={story.steps} active={step} onPick={(i) => goTo(i)} />
            {extra?.control && <div style={{ marginTop: 16 }}>{extra.control}</div>}
            <Caption text={story.caption} style={{ marginTop: 16 }} />
          </div>
          <Plate tint={story.tint} style={{ height: "100%", overflow: laptop ? "visible" : "hidden" }}>
            <div ref={plateRef} style={{ position: "absolute", inset: 0 }}>
              <div style={{ position: "absolute", width: DEVICE[story.device]?.boxW, ...seat }}>
                <Mockup label={`${story.signpost} screen, a sample.`} settled={settled}>
                  {near && (
                    <DeviceFrame story={story} screenProps={extra?.screenProps} paper={paper} step={step} t={t} still={settled} />
                  )}
                </Mockup>
              </div>
            </div>
          </Plate>
        </div>
      </div>
    </section>
  );
}

/** The pinned stories, scrubbed by scroll. */
export default function StickyStories({ stories = [] }) {
  return (
    <div style={{ background: C.page }}>
      {stories.map((story) => <StickyStory key={story.id} story={story} />)}
    </div>
  );
}
