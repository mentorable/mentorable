import { useRef } from "react";
import { C, MOBILE_MAX, NAV_H, useMedia, useSettle } from "../kit.js";
import { Laptop, Mockup, Phone } from "../frames.jsx";
import QuestScreen from "../screens/QuestScreen.jsx";
import HeroImage, { HeroActions, HeroCaption, HeroKicker, HeroSub, HeroTitle } from "./HeroImage.jsx";
import FlyOut from "./FlyOut.jsx";
import { usePerches, useBox } from "./Perch.jsx";

// Hero b, "Through the screen": one big photo plate (a day sky), the copy
// centred across its top with the headline on one line, and a laptop rising
// from the clouds below it with the real Quest map on it. At 0.5s Beaker,
// Talon and Quill fly out of the laptop's screen into the sky either side
// of it, stepping up to the large size as they cross the bezel, then glide
// until the 5s settle. The birds are the same Perch buttons as hero a.

const LAPTOP = { w: 920, h: 578 };
const SHOWN = 0.76;           // how much of the laptop's height rises above the plate's bottom edge

const LABEL = "The Quest map on a laptop: a sample student's quest, BusBuddy, live for your school, on day 4 of 29, with today's task, "
  + "Load route 12's stops and pickup times onto the map.";

// Where each bird starts (fractions of the device's box, where the app's
// sky draws the agents) and where it ends (fractions of the sky it flies
// into), listed left to right so the Tab order reads the same way.
const DESK_SPOTS = [
  { agent: "talon", from: [0.30, 0.30], to: [0.10, 0.62] },
  { agent: "beaker", from: [0.84, 0.62], to: [0.89, 0.80] },
  { agent: "quill", from: [0.72, 0.14], to: [0.90, 0.56] },
];
// On a phone the sky left for the birds is the band between the copy and
// the phone, so these are fractions of that band, not of the whole plate.
const PHONE_SPOTS = [
  { agent: "talon", from: [0.25, 0.30], to: [0.18, 0.62] },
  { agent: "beaker", from: [0.80, 0.55], to: [0.52, 0.38] },
  { agent: "quill", from: [0.72, 0.15], to: [0.84, 0.66] },
];

export default function HeroB() {
  const ref = useRef(null);
  const { settled, poke } = useSettle(ref);
  const phone = useMedia(`(max-width: ${MOBILE_MAX}px)`);
  const perches = usePerches();
  const frameRef = useRef(null);
  const lap = useBox(frameRef);
  const onPoke = (agent) => { perches.toggle(agent); poke(); };

  if (phone) {
    // The plate grows past 640 when the copy needs it: the text on the sky,
    // a band of sky for the birds, then the phone rising from the bottom
    // with its top 420px showing.
    const appH = 640;
    const outerH = appH + 40 + 24;
    // Keyed per layout: a resize across the phone breakpoint remounts the
    // hero instead of patching one branch's styles onto the other's elements.
    return (
      <section key="phone" ref={ref} aria-labelledby="lp-hero-title" style={{ paddingTop: NAV_H, paddingBottom: 32 }}>
        <div style={{ padding: "8px 16px 0" }}>
          <div style={{ position: "relative", width: "100%", minHeight: 640, borderRadius: 20, overflow: "hidden", background: "#a9b8cf",
            display: "flex", flexDirection: "column" }}>
            <HeroImage which="b" sizes="100vw" position="30% 85%" style={{ position: "absolute", inset: 0 }} />
            <div style={{ position: "relative", zIndex: 2, padding: "24px 16px 0" }}>
              <HeroKicker />
              <HeroTitle accent={C.accentDark} style={{ marginTop: 12 }} />
              <HeroSub style={{ marginTop: 14, fontSize: "1rem", fontWeight: 600, color: C.ink, maxWidth: "30rem" }} />
              <HeroActions secondary size="sm" style={{ marginTop: 18 }} />
            </div>
            <div style={{ position: "relative", flex: 1, minHeight: 88 }}>
              <FlyOut frameRef={frameRef} spots={PHONE_SPOTS} small={32} big={64} glide={8} settled={settled} onPoke={onPoke}
                open={perches.open} bubbleWidth={300} />
            </div>
            <div ref={frameRef} style={{ position: "relative", alignSelf: "center", zIndex: 1 }}>
              <Mockup label={LABEL} settled={settled}>
                <Phone appWidth={334} appHeight={appH} cropBottom={outerH - 420}>
                  <QuestScreen variant="phone" layout="mobile" step={0} t={0} still={settled} />
                </Phone>
              </Mockup>
            </div>
          </div>
          <HeroCaption lead="The Quest map on a phone." bold="Beaker, Talon and Quill fly out of it. Tap one to meet it." />
        </div>
      </section>
    );
  }

  const scale = (lap.w || 845) / LAPTOP.w;
  const shownH = Math.round((lap.w || 845) * (LAPTOP.h / LAPTOP.w) * SHOWN);
  return (
    <section key="desktop" ref={ref} aria-labelledby="lp-hero-title" style={{ paddingTop: NAV_H, paddingBottom: 32 }}>
      <div style={{ padding: "8px 16px 0" }}>
        <div style={{ position: "relative", width: "100%", maxWidth: 1600, margin: "0 auto", borderRadius: 28, overflow: "hidden",
          background: "#a9b8cf", display: "flex", flexDirection: "column", alignItems: "center",
          padding: `clamp(40px, 7vh, 80px) clamp(32px, 5vw, 80px) 0`, boxSizing: "border-box" }}>
          <HeroImage which="b" sizes="(min-width: 1632px) 1600px, calc(100vw - 32px)" position="50% 85%" style={{ position: "absolute", inset: 0 }} />
          <div style={{ position: "relative", zIndex: 2, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
            <HeroKicker />
            <HeroTitle line accent={C.accentDark} style={{ marginTop: 16 }} />
            <HeroSub style={{ marginTop: 20, fontSize: "1.2rem", fontWeight: 600, color: C.ink, maxWidth: "46rem" }} />
            <HeroActions secondary style={{ marginTop: 28, justifyContent: "center" }} />
          </div>
          <div style={{ position: "relative", zIndex: 1, width: "min(880px, 64%)", height: shownH, marginTop: 48, overflow: "hidden" }}>
            <div ref={frameRef} style={{ position: "absolute", left: 0, top: 0, width: "100%", aspectRatio: `${LAPTOP.w} / ${LAPTOP.h}` }}>
              <div style={{ width: LAPTOP.w, height: LAPTOP.h, transform: `scale(${scale})`, transformOrigin: "0 0" }}>
                <Mockup label={LABEL} settled={settled}>
                  <Laptop>
                    <QuestScreen variant="desktop" layout="desktop" step={0} t={0} showAgents={false} still={settled} />
                  </Laptop>
                </Mockup>
              </div>
            </div>
          </div>
          <FlyOut frameRef={frameRef} spots={DESK_SPOTS} small={64} big={96} settled={settled} onPoke={onPoke} open={perches.open} />
        </div>
        <HeroCaption lead="The Quest map on a laptop." bold="Beaker, Talon and Quill fly out of it. Tap one to meet it."
          style={{ maxWidth: 1600, margin: "14px auto 0", textAlign: "center" }} />
      </div>
    </section>
  );
}
