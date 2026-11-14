import { useEffect, useRef, useState } from "react";
import AgentScene, { Pixels, Ridge, sceneAnim } from "../scene/AgentScene.jsx";
import { SpeechBubble, TAIL_AT, TIP } from "../../ui/SpeechBubble.jsx";
import { SR_ONLY } from "../../ui/kit.jsx";
import { SANS, TEXT_MID } from "../../ui/tokens.js";
import { POISE } from "./interviewUi.js";

// Poise's marsh at dawn: the band across the top of the interview pages. A
// heron practises stillness, so the scene is a quiet wetland at first light:
// a low sun behind a line of trees, a band of mist on the water, cattails
// and reeds at the edge, lily pads (one in flower), a few rings on the
// water and a dragonfly. Poise stands in the shallows on the right, turned
// to face what it says. The frame (title, back button, bubble) is
// AgentScene's; this file is the marsh.
//
// A fixed scene that does not follow the student's accent. Every drawn thing
// is decoration; the small animations stop under reduced motion.

// Dark enough at the top for the white title (as Talon's dawn), warming to the horizon.
const SKY = "linear-gradient(to bottom, #1e3350 0 26%, #2f4a6b 26% 48%, #6f6a8f 48% 62%, #c98a86 62% 78%, #f0b88a 78%)";
const GROUND = { h: 20, mobileH: 15, color: "#3d6b74", top: "#8cc1c0" };

// ── Pixel props, on a grid of one character a pixel ("." is empty) ──────────

const SUN = [
  "....yyyyyy....",
  "..yyyyyyyyyy..",
  ".yyyyYYyyyyyy.",
  "yyyyYYyyyyyyyy",
  "yyyyyyyyyyyyyy",
];
const SUN_INK = { y: "#ffcf7a", Y: "#fff0c9" };

// Cattails and reed blades at the water's edge: brown heads on green stems.
const CATTAILS = [
  "...b........",
  "..bB....b...",
  "..bB...bB...",
  "..bB...bB...",
  "..bB...bB.b.",
  "..bB...bB.bB",
  "...s...bB.bB",
  "...s....s.bB",
  "g..s....s..s",
  "g..s..g.s..s",
  ".g.s..g.s..s",
  ".g.s.g..s.gs",
  ".g.sg...s.g.",
  "..gs...gs.g.",
  "..gs..g.sg..",
  "..sg..g.sg..",
  "...sg.g.s...",
  "...s.gg.s...",
  "...s..g.s...",
  "...s..gs....",
];
const CATTAIL_INK = { b: "#6b4126", B: "#4a2c1a", s: "#3f6b3a", g: "#5d8a4c" };

const REEDS = [
  "g.....",
  "g...g.",
  ".g..g.",
  ".g.g..",
  ".g.g.g",
  "..gg.g",
  "..gggg",
  "...gg.",
];
const REED_INK = { g: "#4f7d45" };

const LILY = [
  "..gggg.ggg..",
  ".gGGGGgGGGg.",
  "gGGGGGGGGGGg",
  ".gGGGGGGGGg.",
  "..gggggggg..",
];
const LILY_FLOWER = [
  "....p.p.....",
  "...pPpPp....",
  "..gggpggg...",
  ".gGGGGgGGGg.",
  "gGGGGGGGGGGg",
  ".gGGGGGGGGg.",
  "..gggggggg..",
];
const LILY_INK = { g: "#2f5a3c", G: "#4f8a5a", p: "#f4a7b9", P: "#fbd3dc" };

const RING = [".wwww.", "w....w", ".wwww."];

const DRAGONFLY = [
  "w.w.....",
  ".kkkkkkk",
  "w.w.....",
];
const DRAGONFLY_INK = { w: "#cfe8f0", k: "#24414f" };

// Rings on the water: [left in %, delay in s]. Dragonfly: [left in %, top in px].
const RINGS = [[30, 0], [52, 1.6], [68, 3.1]];

// A line of trees on the far shore: rounded crowns nine columns wide, each a
// little taller or shorter than the last (deterministic, no randomness).
const CROWN = [1, 3, 4, 5, 5, 5, 4, 3, 1];
const treeline = (i) => 3 + CROWN[i % 9] + [0, 2, 1, 3, 1][Math.floor(i / 9) % 5];

function MarshDecor({ px, groundH, isMobile }) {
  const cols = 360;
  return (
    <>
      {/* The sun, just up over the trees. */}
      <span style={{ position: "absolute", left: isMobile ? "44%" : "27%", bottom: groundH + 8 * px, width: 14 * px,
        height: 5 * px, boxShadow: "0 0 50px 22px rgba(255,205,140,0.4)", borderRadius: "50% 50% 0 0" }} />
      <span style={{ position: "absolute", left: isMobile ? "44%" : "27%", bottom: groundH + 8 * px }}>
        <Pixels grid={SUN} ink={SUN_INK} px={px} />
      </span>
      <Ridge cols={cols} px={px} color="#2f4c55" heightAt={treeline}
        style={{ position: "absolute", left: 0, bottom: groundH }} />
      {/* Mist lying on the water. */}
      <span style={{ position: "absolute", left: 0, right: 0, bottom: groundH, height: 4 * px,
        background: "linear-gradient(to top, rgba(240,226,222,0.55), rgba(240,226,222,0))" }} />

      {/* On a phone it flies between the back button and the heron, clear of the title. */}
      <span className={sceneAnim("drift")} style={{ position: "absolute", left: isMobile ? "48%" : "46%", top: isMobile ? 34 : 58 }}>
        <Pixels grid={DRAGONFLY} ink={DRAGONFLY_INK} px={isMobile ? 2 : 3} />
      </span>

      {/* At the water's edge. */}
      <span style={{ position: "absolute", left: isMobile ? 8 : 18, bottom: groundH - px }}>
        <Pixels grid={CATTAILS} ink={CATTAIL_INK} px={px} />
      </span>
      <span style={{ position: "absolute", left: isMobile ? 56 : 80, bottom: groundH - px }}>
        <Pixels grid={REEDS} ink={REED_INK} px={px} />
      </span>

      {/* On the water. */}
      <span style={{ position: "absolute", left: isMobile ? 92 : 132, bottom: Math.max(0, groundH - 6 * px) }}>
        <Pixels grid={LILY_FLOWER} ink={LILY_INK} px={isMobile ? px - 1 : px} />
      </span>
      {!isMobile && (
        <span style={{ position: "absolute", left: 210, bottom: Math.max(0, groundH - 5 * px) }}>
          <Pixels grid={LILY} ink={LILY_INK} px={px - 1} />
        </span>
      )}
      {(isMobile ? RINGS.slice(0, 2) : RINGS).map(([x, delay]) => (
        <span key={x} className={sceneAnim("twinkle")}
          style={{ position: "absolute", left: `${x}%`, bottom: Math.max(2, Math.round(groundH / 2) - px), animationDelay: `${delay}s` }}>
          <Pixels grid={RING} ink={{ w: "#cfe8e6" }} px={isMobile ? 2 : 3} />
        </span>
      ))}
    </>
  );
}

/** The scene's sky, ground and props, for drawing it at another size (the
 *  call screen's stage, the landing page's agent cards). */
export const MARSH_SCENE = { sky: SKY, ground: GROUND, Decor: MarshDecor };

/**
 * title: the page's h1. onBack(): the "Agents" button. state: Poise's pose
 * ("idle", "listening", "talking", "celebrating"). isMobile: the shorter band.
 * says: Poise's line (wide screens only; a phone shows it under the band).
 */
export default function MarshScene({ title = "Interviews", onBack, state = "idle", isMobile = false, says = null }) {
  return (
    <AgentScene title={title} onBack={onBack} agent={POISE} state={state} says={says} isMobile={isMobile}
      sky={SKY} ground={GROUND} backColor="#eef0ff" flip lift={6} decor={(p) => <MarshDecor {...p} />} />
  );
}

/**
 * Poise's own voice under a band or a stage: the pixel speech bubble, its
 * tail aimed up at the heron. `center`: how far the heron's middle is from
 * the right edge of the column (MarshScene stands it there), or "middle" for
 * a heron centred above (the call's stage).
 */
export function PoiseSays({ children, center = 62, live = false }) {
  const ref = useRef(null);
  const [wide, setWide] = useState(560);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const read = () => setWide(Math.min(560, el.clientWidth || 560));
    read();
    if (typeof ResizeObserver === "undefined") return undefined;
    const watch = new ResizeObserver(read);
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
  const middle = center === "middle";
  const tailAt = middle ? Math.max(TAIL_AT, Math.round(wide / 2 - TIP)) : Math.max(TAIL_AT, Math.round(wide - center - 5));
  return (
    <div ref={ref} aria-live={live ? "polite" : undefined}
      style={{ display: "flex", justifyContent: middle ? "center" : "flex-end", paddingTop: 18, marginTop: -14 }}>
      <SpeechBubble side="top" tailAt={tailAt} style={{ width: "min(560px, 100%)" }}>
        <span style={SR_ONLY}>Poise says: </span>
        {children}
      </SpeechBubble>
    </div>
  );
}

/** One of Poise's lines as plain text, where the heron is not the one saying
 *  it out loud (a promise row, an empty state). Screen readers hear whose it is. */
export function PoiseLine({ children, style, as: Tag = "p" }) {
  return (
    <Tag style={{ margin: 0, fontFamily: SANS, fontSize: "1rem", fontWeight: 500, color: TEXT_MID, lineHeight: 1.6,
      maxWidth: "62ch", overflowWrap: "anywhere", ...style }}>
      <span style={SR_ONLY}>Poise: </span>
      {children}
    </Tag>
  );
}
