import { useEffect, useRef, useState } from "react";
import { CONTAINER, GUTTER, MOBILE_MAX, NAV_H, SHADOW, useMedia, useReduce, useSettle, useTimeline } from "../kit.js";
import { Mockup, PlayPill } from "../frames.jsx";
import ChatScreen from "../screens/ChatScreen.jsx";
import HeroImage, { HeroActions, HeroCaption, HeroKicker, HeroSub, HeroTitle } from "./HeroImage.jsx";
import Perch, { PerchLayer, useBox, usePerches } from "./Perch.jsx";
import { useFlight } from "./useFlight.js";

// The hero, "Birds on the window": the copy centred across the page, the
// headline on one line, then a photo plate as wide as the container (a sea
// of clouds at dusk) with the Chat card in its middle, and Beaker, Talon
// and Quill perched on the card's top edge like birds on a wire. The
// student's message is already sent at load; the reply streams from 0.3s
// and the record-edit toast lands by 4.6s. Talon flies in from the plate's
// top right at 0.4s. Tap a bird and it hops and says what it does.

// card: the Chat card's widest; side: the least plate showing either side of it.
const DESK = { card: 880, side: 40, top: 112, bottom: 72, bird: 96, beaker: "6%", quillRight: 20, talonAt: 0.44,
  plateH: "clamp(560px, 72svh, 680px)", radius: 24 };
const PHONE = { card: 9999, side: 12, top: 92, bottom: 56, bird: 64, beaker: "4%", quillRight: 12, talonAt: 0.44,
  plateH: 500, radius: 20 };

const LABEL = "A sample conversation in Mentorable Chat. The student asks the advisor to add her Sunday volunteering at the library "
  + "help desk and whether her college list is okay. The advisor adds it to her Portfolio, then notes that Cincinnati is her only "
  + "likely school, explains net price, and asks what her family can spend each year.";

export default function HeroA() {
  const ref = useRef(null);
  const { settled, poke } = useSettle(ref);
  const reduce = useReduce();
  const stacked = useMedia("(max-width: 1099px)");
  const phone = useMedia(`(max-width: ${MOBILE_MAX}px)`);
  const L = phone ? PHONE : DESK;
  const size = L.bird;

  // The chat timeline starts 300ms after mount: 3.6s of reply, 1s of toast.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setArmed(true), 300);
    return () => clearTimeout(id);
  }, []);
  const tl = useTimeline({ durations: [3600, 1000], play: armed });

  const perches = usePerches();
  const layerRef = useRef(null);
  const layer = useBox(layerRef);
  const plateRef = useRef(null);
  const plateBox = useBox(plateRef);
  const right = Math.max(0, Math.round((plateBox.w - layer.w) / 2));

  // Talon: from the plate's top right corner, half of it past the edge and
  // 40px above it, gliding left and down for 2s from 0.4s, to 44% of the
  // card's width.
  const talon = useFlight({
    from: { x: layer.w + right - size / 2, y: -(L.top + 40 + size) },
    to: { x: Math.round(layer.w * L.talonAt), y: -(size - 4) },
    delay: 400, duration: 2000, play: layer.w > 0 && plateBox.w > 0, reduce,
  });
  // The card sits in the middle of the plate, at most L.card wide.
  const sides = `max(${L.side}px, calc(50% - ${L.card / 2}px))`;

  const onPoke = (agent) => { perches.toggle(agent); poke(); };
  const replay = () => { tl.replay(); poke(); };

  const plate = (
    <div ref={plateRef} style={{ position: "relative", height: L.plateH }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: L.radius, overflow: "hidden", background: "#a9b8cf" }}>
        <HeroImage sizes="(min-width: 1440px) 1312px, 100vw" position="50% 100%" />
        <span aria-hidden="true" style={{ position: "absolute", inset: 0, borderRadius: L.radius, boxShadow: "inset 0 0 0 1px rgba(20,20,19,.06)",
          pointerEvents: "none" }} />
      </div>
      <Mockup label={LABEL} settled={settled}
        style={{ position: "absolute", left: sides, right: sides, top: L.top, bottom: L.bottom, borderRadius: 16,
          boxShadow: SHADOW.device }}>
        <ChatScreen layout={phone ? "mobile" : "desktop"} step={tl.step} t={tl.t} still={settled} />
      </Mockup>
      <PerchLayer open={perches.open} boxRef={layerRef} style={{ left: sides, right: sides, top: L.top, height: 0 }}>
        <Perch agent="beaker" size={size} state="idle" facing="right" settled={settled} onPoke={onPoke} open={perches.open === "beaker"}
          style={{ left: L.beaker, bottom: -4 }} />
        {/* Talon sits between the two in the DOM as well, so Tab moves left to right. */}
        {talon && (
          <Perch agent="talon" size={size} state={talon.phase === "landed" ? "idle" : "flying"} facing="left" settled={settled} onPoke={onPoke}
            open={perches.open === "talon"} style={{ left: talon.x, top: talon.y, opacity: talon.phase === "waiting" ? 0 : 1 }} />
        )}
        <Perch agent="quill" size={size} state="idle" facing="right" settled={settled} onPoke={onPoke} open={perches.open === "quill"}
          style={{ right: L.quillRight, bottom: -4 }} />
      </PerchLayer>
      {tl.done && !reduce && (
        <PlayPill state="done" onReplay={replay} style={{ position: "absolute", right: 16, bottom: 16, zIndex: 5 }} />
      )}
    </div>
  );

  const caption = <HeroCaption lead="A sample conversation in Mentorable Chat." bold="Beaker, Talon and Quill do the legwork. Tap one to meet it."
    style={{ textAlign: "center" }} />;

  // Keyed per layout: a resize across a breakpoint remounts the hero instead
  // of patching one branch's styles onto the other's elements.
  return (
    <section key={stacked ? "stacked" : "wide"} ref={ref} aria-labelledby="lp-hero-title"
      style={{ paddingTop: NAV_H + (stacked ? 24 : 48), paddingBottom: 48, paddingLeft: GUTTER, paddingRight: GUTTER }}>
      <div style={{ maxWidth: CONTAINER, margin: "0 auto" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
          <HeroKicker />
          <HeroTitle style={{ marginTop: stacked ? 16 : 20 }} />
          <HeroSub style={{ marginTop: stacked ? 20 : 24, fontSize: stacked ? "1.0625rem" : "1.2rem", maxWidth: "46rem" }} />
          <HeroActions stacked={phone} style={{ marginTop: stacked ? 24 : 32, justifyContent: "center", alignSelf: phone ? "stretch" : "center" }} />
        </div>
        <div style={{ marginTop: stacked ? 32 : 48 }}>
          {plate}
          {caption}
        </div>
      </div>
    </section>
  );
}
