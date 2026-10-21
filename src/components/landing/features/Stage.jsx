import { useEffect, useMemo, useRef } from "react";
import { AnimatePresence, motion, useAnimationControls } from "framer-motion";
import { PixelStamp } from "../../ui/PixelIcons.jsx";
import { FOCUS_CLASS } from "../../ui/tokens.js";
import { C, CONTAINER, EASE, GUTTER, NAV_H, SANS, TINT, TYPE, useNear, useReduce, useSettle } from "../kit.js";
import { Laptop, Mockup, Phone, TwoTone } from "../frames.jsx";
import StepList, { Caption } from "./StepList.jsx";
import { useBox } from "./Plates.jsx";
import { useScrub } from "./StickyStories.jsx";

// Features b, "One stage" (PLAN.md 6.6): one pinned section for every
// story, a rail of chapters on the left and a laptop and phone pair on the
// right, both showing the same student. The scroll scrubs K sub-steps (two
// a chapter) with the sticky stories' formula; on a chapter change both
// screens cross-fade and the phone dips. The nav's anchors are invisible
// spacers over each chapter's scroll range.

const PAIR = { w: 920 + 384 - 200, h: 764, phoneLeft: 920 - 200 };

/**
 * The chapter map: for each story, two sub-steps, each naming the rail row
 * (an index into the story's steps) and what the laptop and the phone
 * show. A slot with `live` follows the scroll's `t`; otherwise it holds
 * `t` (1 unless given).
 */
function chaptersFor(stories) {
  const record = stories.find((s) => s.id === "record");
  return stories.map((story) => {
    const S = story.Screen;
    const base = story.screenProps || {};
    const desk = (p) => ({ ...base, ...p, layout: "desktop" });
    const mob = (p) => ({ ...base, ...p, layout: "mobile" });
    let subs;
    if (story.id === "record") {
      subs = [
        { row: 0, laptop: { Screen: S, props: desk(), step: 0, live: true }, phone: { Screen: S, props: mob(), step: 1, t: 1 } },
        { row: 2, laptop: { Screen: S, props: desk(), step: 2, live: true }, phone: { Screen: S, props: mob(), step: 2, live: true } },
      ];
    } else if (story.id === "chat") {
      subs = [
        { row: 0, laptop: { Screen: S, props: desk(), step: 0, live: true }, phone: { Screen: S, props: mob(), step: 0, live: true } },
        { row: 1, laptop: { Screen: S, props: desk(), step: 1, live: true },
          phone: { Screen: record.Screen, props: { ...record.screenProps, withChatRow: true, layout: "mobile" }, step: 2, t: 1 } },
      ];
    } else if (story.id === "quest") {
      subs = [
        { row: 0, laptop: { Screen: S, props: desk({ variant: "desktop" }), step: 0, t: 0 }, phone: { Screen: S, props: mob({ variant: "phone" }), step: 0, live: true } },
        { row: 1, laptop: { Screen: S, props: desk({ variant: "desktop" }), step: 1, live: true }, phone: { Screen: S, props: mob({ variant: "phone" }), step: 1, live: true } },
      ];
    } else {
      subs = [
        { row: 0, laptop: { Screen: S, props: desk(), step: 0, live: true }, phone: { Screen: S, props: mob(), step: 0, live: true } },
        { row: 1, laptop: { Screen: S, props: desk(), step: 1, live: true }, phone: { Screen: S, props: mob(), step: 1, live: true } },
      ];
    }
    return { story, subs };
  });
}

/** One device's screen, cross-faded on a chapter change (an instant cut
 *  under reduced motion). */
function Slot({ slot, chapter, t, still, extraProps, reduce }) {
  const { Screen } = slot;
  return (
    <AnimatePresence initial={false}>
      <motion.div key={chapter} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: reduce ? 0 : 0.24, ease: EASE }} style={{ position: "absolute", inset: 0 }}>
        <Screen {...slot.props} {...extraProps} step={slot.step} t={slot.live ? t : (slot.t ?? 1)} still={still} />
      </motion.div>
    </AnimatePresence>
  );
}

function RailChapter({ chapter, index, active, sub, onChapter, onStep, control }) {
  const { story, subs } = chapter;
  return (
    <div style={{ borderTop: index ? `1px solid ${C.line}` : "none", padding: active ? "8px 0 14px" : "2px 0" }}>
      <button type="button" className={FOCUS_CLASS} onClick={() => onChapter(index)} aria-current={active ? "true" : undefined}
        style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 44, padding: "4px 4px", margin: 0, background: "none",
          border: "none", borderRadius: 8, cursor: "pointer", fontFamily: SANS, fontSize: "1.125rem", fontWeight: 700,
          color: active ? C.accent : C.muted, textAlign: "left" }}>
        <span aria-hidden="true" style={{ display: "inline-flex", flexShrink: 0 }}><PixelStamp kind={story.stamp} size={16} /></span>
        {story.signpost}
      </button>
      {active && (
        <div style={{ paddingLeft: 4 }}>
          <TwoTone lead={story.lead} rest={story.rest} style={{ fontSize: "1.75rem", marginTop: 6 }} />
          <p style={{ ...TYPE.body, fontSize: "1rem", lineHeight: 1.5, marginTop: 10 }}>{story.body}</p>
          <StepList steps={subs.map((s) => story.steps[s.row])} active={sub} onPick={(j) => onStep(index * 2 + j)} style={{ marginTop: 12 }} />
          {control && <div style={{ marginTop: 12 }}>{control}</div>}
          <Caption text={story.caption} style={{ marginTop: 12 }} />
        </div>
      )}
    </div>
  );
}

export default function Stage({ stories = [] }) {
  const reduce = useReduce();
  const ref = useRef(null);
  const stageRef = useRef(null);
  const plateRef = useRef(null);
  const chapters = useMemo(() => chaptersFor(stories), [stories]);
  const K = chapters.length * 2;
  const { step: sub, t, goTo } = useScrub(ref, stageRef, K);
  const near = useNear(ref);
  const { settled, poke } = useSettle(ref);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    poke();
  }, [sub, t, poke]);
  // One hook per story that has one (the SAT slider); the list never changes.
  const extras = stories.map((s) => (s.useExtra ? s.useExtra() : null));   // eslint-disable-line react-hooks/rules-of-hooks

  const chapter = Math.min(chapters.length - 1, Math.floor(sub / 2));
  const subIn = sub - chapter * 2;
  const current = chapters[chapter];
  const beat = current.subs[subIn] || current.subs[0];
  const extraProps = extras[chapter]?.screenProps;

  const { w, h } = useBox(plateRef);
  const scale = w && h ? Math.max(0.85, Math.min(1, (w - 48) / PAIR.w, (h - 48) / PAIR.h)) : 1;
  // The rail is centred on the plate while it fits; taller, it hangs from the top.
  const railRef = useRef(null);
  const { h: railH } = useBox(railRef);
  const railAlign = h > 0 && railH > h ? "start" : "center";

  // The phone dips 16px and back on a chapter change.
  const dip = useAnimationControls();
  const lastChapter = useRef(chapter);
  useEffect(() => {
    if (lastChapter.current === chapter) return;
    lastChapter.current = chapter;
    if (reduce) return;
    dip.start({ y: [0, 16, 0], transition: { duration: 0.45, ease: EASE } });
  }, [chapter, reduce, dip]);

  return (
    <section ref={ref} aria-label="Features" style={{ position: "relative", height: `calc(100svh - ${NAV_H}px + ${K} * 45svh)`, background: C.page }}>
      {chapters.map((c, i) => (
        <div key={c.story.id} id={c.story.anchor} aria-hidden="true"
          style={{ position: "absolute", left: 0, width: 1, top: `calc(${i * 90}svh)`, height: `calc(135svh - ${NAV_H}px)`,
            pointerEvents: "none", opacity: 0 }} />
      ))}
      <div ref={stageRef} style={{ position: "sticky", top: NAV_H, height: `calc(100svh - ${NAV_H}px)`, boxSizing: "border-box",
        padding: `24px ${GUTTER}` }}>
        <div style={{ maxWidth: CONTAINER, height: "100%", margin: "0 auto", display: "grid", gridTemplateColumns: "300px minmax(0, 1fr)",
          columnGap: 48, alignItems: "center" }}>
          <div ref={railRef} style={{ minWidth: 0, alignSelf: railAlign }}>
            {chapters.map((c, i) => (
              <RailChapter key={c.story.id} chapter={c} index={i} active={i === chapter} sub={i === chapter ? subIn : 0}
                onChapter={(ci) => goTo(ci * 2, 0.1)} onStep={(s) => goTo(s)} control={extras[i]?.control} />
            ))}
          </div>
          <div ref={plateRef} style={{ position: "relative", height: "100%", borderRadius: 24, overflow: "hidden",
            background: current.story.tint || TINT.morning, transition: reduce ? "none" : "background-color 400ms ease" }}>
            <div style={{ position: "absolute", left: "50%", top: "50%", width: PAIR.w, height: PAIR.h,
              transform: `translate(-50%, -50%) scale(${scale})`, transformOrigin: "center" }}>
              <Mockup label="The features on a laptop and a phone, a sample." settled={settled} style={{ width: PAIR.w, height: PAIR.h }}>
                <div style={{ position: "absolute", left: 0, bottom: 0 }}>
                  <Laptop>
                    {near && <Slot slot={beat.laptop} chapter={chapter} t={t} still={settled} extraProps={extraProps} reduce={reduce} />}
                  </Laptop>
                </div>
                <motion.div animate={dip} initial={false} style={{ position: "absolute", left: PAIR.phoneLeft, bottom: 0 }}>
                  <Phone>
                    {near && <Slot slot={beat.phone} chapter={chapter} t={t} still={settled} extraProps={extraProps} reduce={reduce} />}
                  </Phone>
                </motion.div>
              </Mockup>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
