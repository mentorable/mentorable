import { useEffect, useRef, useState } from "react";
import { PixelStone } from "../../quest/PixelStone.jsx";
import { Chunky } from "../../quest/questUi.jsx";
import { C, CONTAINER, GUTTER, MOBILE_MAX, SANS, useMedia, useReduce, useSettle, useTimeline } from "../kit.js";
import { Mockup, Phone, PlayPill } from "../frames.jsx";
import { QUEST } from "../data.js";
import QuestScreen from "../screens/QuestScreen.jsx";
import HeroImage, { HeroActions, HeroCaption, HeroKicker, HeroSub, HeroTitle } from "./HeroImage.jsx";
import Perch, { PerchLayer, usePerches } from "./Perch.jsx";

// Hero c, "Check-in on the shore": the copy on the page, the headline on
// one line from edge to edge and the subline and actions under it, then a
// wide photo plate (a beach at sunrise) with the Quest phone standing on the sand,
// Beaker beside it, Quill perched on its top edge and Talon gliding in the
// sky. The phone plays the check-in once (steps 0 and 1 of the Quest
// screen); when the +10 XP pill shows, Beaker cheers. On phones the Quest
// phone gives way to a copy of Quest's own Today card standing on the sand
// above today's stone, and nothing plays.

const PHONE_W = 384;          // the Phone frame's outer width (360 + 2 x 12)
const PHONE_SHOWN = 520;      // how much of the phone stands above the plate's bottom edge
const PHONE_OUTER_H = 700 + 40 + 24;
const W8 = 800;               // the app's own heading weight inside the recreated Today card

const TASK = QUEST.opened.today_task || {};
const LABEL = "A sample student's Quest on a phone, day 4 of 29: the task for today, "
  + `${TASK.title || "today's task"}, is checked in with a line about what she did, her streak goes to 4 days and she earns 10 XP.`;
const CALLOUT_LABEL = `Quest's Today card: Today, about ${TASK.est_minutes || 25} min. ${TASK.title || ""} Start.`;

/** Quest's own Today callout (QuestMap.jsx TodayCallout, open state), with the pointer under it. */
function TodayCallout() {
  return (
    <div style={{ position: "relative", width: "100%", background: "#ffffff", borderRadius: 16, padding: "14px 16px 16px", boxSizing: "border-box",
      border: `1px solid ${C.soft}` }}>
      <p style={{ margin: 0, fontFamily: SANS, fontSize: "0.95rem", fontWeight: W8, color: C.accent }}>
        Today{TASK.est_minutes ? `, about ${TASK.est_minutes} min` : ""}
      </p>
      <p style={{ margin: "4px 0 12px", fontFamily: SANS, fontSize: "1.06rem", fontWeight: W8, color: C.ink, lineHeight: 1.35 }}>{TASK.title}</p>
      <Chunky full>Start</Chunky>
      <span aria-hidden="true" style={{ position: "absolute", left: "calc(50% - 9px)", bottom: -9, width: 16, height: 16, background: "#ffffff",
        transform: "rotate(45deg)", borderRight: `1px solid ${C.soft}`, borderBottom: `1px solid ${C.soft}` }} />
    </div>
  );
}

export default function HeroC() {
  const ref = useRef(null);
  const { settled, poke } = useSettle(ref);
  const reduce = useReduce();
  const phone = useMedia(`(max-width: ${MOBILE_MAX}px)`);
  const perches = usePerches();

  // The check-in plays once, 300ms after mount, on desktop only.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setArmed(true), 300);
    return () => clearTimeout(id);
  }, []);
  const tl = useTimeline({ durations: [2400, 2300], play: armed && !phone });

  // Beaker's one celebrating cycle when the +10 XP pill first shows.
  const [cheer, setCheer] = useState(false);
  const cheerTimer = useRef(0);
  useEffect(() => () => clearTimeout(cheerTimer.current), []);
  // A scripted beat, not a visitor's poke: it never restarts the 5s settle,
  // and it lands at about 3s, inside the window the sprites still animate.
  const onBeat = (name) => {
    if (name !== "xp" || reduce) return;
    setCheer(true);
    clearTimeout(cheerTimer.current);
    cheerTimer.current = setTimeout(() => setCheer(false), 1200);
  };

  const onPoke = (agent) => { perches.toggle(agent); poke(); };
  const replay = () => { tl.replay(); poke(); };
  const caption = <HeroCaption lead="A sample student's Quest on a phone: day 4 of 29." bold="Beaker, Talon and Quill do the legwork. Tap one to meet it." />;

  // Keyed per layout: a resize across the phone breakpoint remounts the hero
  // instead of patching one branch's styles onto the other's elements.
  if (phone) {
    return (
      <section key="phone" ref={ref} aria-labelledby="lp-hero-title" style={{ padding: `120px ${GUTTER} 48px` }}>
        <HeroKicker />
        <HeroTitle style={{ marginTop: 16 }} />
        <HeroSub style={{ marginTop: 20, fontSize: "1.0625rem" }} />
        <HeroActions stacked style={{ marginTop: 24 }} />
        <div style={{ position: "relative", width: "100%", height: 560, borderRadius: 20, overflow: "hidden", background: "#d9c7b0", marginTop: 32 }}>
          <HeroImage which="c" sizes="100vw" position="40% 62%" style={{ position: "absolute", inset: 0 }} />
          <Mockup label={CALLOUT_LABEL} settled={settled} style={{ position: "absolute", left: "50%", top: 200, width: "min(320px, calc(100% - 32px))",
            transform: "translateX(-50%)", zIndex: 1 }}>
            <TodayCallout />
          </Mockup>
          <div aria-hidden="true" style={{ position: "absolute", left: "calc(50% - 28px)", top: 372, zIndex: 1 }}>
            <PixelStone cells={14} picture="star" fill="#ffffff" edge={C.accentDark} ink={C.accent} ring="solid" ringColor={C.accent} />
          </div>
          <PerchLayer open={perches.open} style={{ inset: 0 }}>
            <Perch agent="beaker" size={64} state="idle" facing="right" settled={settled} onPoke={onPoke} open={perches.open === "beaker"}
              bubbleWidth={300} style={{ left: 36, top: 368 }} />
            <Perch agent="quill" size={64} state="idle" facing="left" settled={settled} onPoke={onPoke} open={perches.open === "quill"}
              bubbleWidth={300} style={{ left: "calc(50% + 72px)", top: 140 }} />
            <Perch agent="talon" size={64} state="flying" facing="right" settled={settled} onPoke={onPoke} open={perches.open === "talon"}
              bubbleWidth={300} className={reduce ? undefined : "lp-glide"}
              style={{ left: 16, top: 56, "--lp-glide": "12px", animationPlayState: settled ? "paused" : "running" }} />
          </PerchLayer>
        </div>
        {caption}
      </section>
    );
  }

  return (
    <section key="desktop" ref={ref} aria-labelledby="lp-hero-title" style={{ padding: `120px ${GUTTER} 48px` }}>
      <div style={{ maxWidth: CONTAINER, margin: "0 auto" }}>
        <HeroKicker />
        <HeroTitle line style={{ marginTop: 20 }} />
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "24px 48px", marginTop: 24 }}>
          <HeroSub style={{ fontSize: "1.2rem", maxWidth: "44rem" }} />
          <HeroActions />
        </div>
        <div style={{ position: "relative", marginTop: 40, height: "clamp(500px, calc(100svh - 300px), 620px)", borderRadius: 24, overflow: "hidden",
          background: "#d9c7b0" }}>
          <HeroImage which="c" sizes="(min-width: 1440px) 1312px, calc(100vw - 2 * clamp(16px, 4.4vw, 64px))" position="50% 62%"
            style={{ position: "absolute", inset: 0 }} />
          <Mockup label={LABEL} settled={settled} style={{ position: "absolute", left: `calc(58% - ${PHONE_W / 2}px)`, bottom: 0, zIndex: 1 }}>
            <Phone cropBottom={PHONE_OUTER_H - PHONE_SHOWN}>
              <QuestScreen variant="phone" layout="mobile" step={tl.step} t={tl.t} still={settled} onBeat={onBeat} />
            </Phone>
          </Mockup>
          <PerchLayer open={perches.open} style={{ inset: 0 }}>
            <Perch agent="beaker" size={128} state={cheer ? "celebrating" : "idle"} facing="right" settled={settled} onPoke={onPoke}
              open={perches.open === "beaker"} style={{ left: `calc(58% - ${PHONE_W / 2 + 24 + 128}px)`, bottom: "8%" }} />
            <Perch agent="quill" size={64} state="idle" facing="left" settled={settled} onPoke={onPoke} open={perches.open === "quill"}
              style={{ left: `calc(58% - ${PHONE_W / 2 - 56}px)`, bottom: PHONE_SHOWN - 4 }} />
            <Perch agent="talon" size={96} state="flying" facing="right" settled={settled} onPoke={onPoke} open={perches.open === "talon"}
              className={reduce ? undefined : "lp-glide"}
              style={{ left: "22%", top: "14%", "--lp-glide": "24px", animationPlayState: settled ? "paused" : "running" }} />
          </PerchLayer>
          {tl.done && !reduce && (
            <PlayPill state="done" onReplay={replay} style={{ position: "absolute", right: 16, bottom: 16, zIndex: 5 }} />
          )}
        </div>
        {caption}
      </div>
    </section>
  );
}
