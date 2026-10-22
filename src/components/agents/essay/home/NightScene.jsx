import AgentScene, { Pixels, sceneAnim } from "../../scene/AgentScene.jsx";

// The night desk: the band across the top of Quill's page. A night sky with a
// few stars and a moon, a desk with a lamp, a stack of pages and a pen, and
// Quill perched on the desk's edge. The frame (title, back button, bubble) is
// AgentScene's; this file is the night and the desk.
//
// A fixed dark band that deliberately does not follow the student's accent.

const SKY = "linear-gradient(to bottom, #1b1e3d 0 34%, #23264b 34% 68%, #2c2f5c 68%)";
const GROUND = { h: 16, mobileH: 12, color: "#3b2f52", top: "#5d4c7c" };

// ── Pixel props, on a grid of one character a pixel ──────────────────────────

const BOOKS = [
  "...kkkkkkkkkkkkkkkkk..",
  "..kaaaaaaaaaaaaaaaaak.",
  "..kacccccccccccccccck.",
  "..kaaaaaaaaaaaaaaaaak.",
  "kkkkkkkkkkkkkkkkkkkkkk",
  "kbbbbbbbbbbbbbbbbbbbbk",
  "kbcccccccccccccccccck.",
  "kbcCcCcCcCcCcCcCcCcck.",
  "kbbbbbbbbbbbbbbbbbbbbk",
  "kkkkkkkkkkkkkkkkkkkkkk",
];
const BOOKS_INK = { k: "#12132a", a: "#7daaf2", b: "#d9a441", c: "#fbf3e2", C: "#e7dac2" };

const LAMP = [
  "...kkkkkk...",
  "..kyyyyyyk..",
  ".kyyYYYYyyk.",
  "kyyYYYYYYyyk",
  "kkkkkkkkkkkk",
  "....kmmk....",
  ".....mm.....",
  ".....mm.....",
  ".....mm.....",
  ".....mm.....",
  ".....mm.....",
  "...kkkkkk...",
  "..kmmmmmmk..",
  "..kkkkkkkk..",
];
const LAMP_INK = { k: "#12132a", y: "#e9b949", Y: "#ffe9a8", m: "#8d84a8" };

const PEN = [
  "..kkkkkkkkkkkk..",
  ".kbbbbbbbbbbbykk",
  "..kkkkkkkkkkkk..",
];
const PEN_INK = { k: "#12132a", b: "#7daaf2", y: "#e9b949" };

const MOON = ["...yyyy..", "..yyyyyy.", ".yyyy....", "yyyy.....", "yyyy.....", "yyyy.....", ".yyyy....", "..yyyyyy.", "...yyyy.."];
const STAR = [".y.", "ywy", ".y."];

// Stars: [left in %, top in px, big, twinkle delay in s]. They keep to the
// right of the title, which sits top left.
const STARS = [
  [38, 22, 0, 0], [46, 58, 1, 1.2], [55, 14, 0, 2.4], [63, 42, 0, 0.6], [70, 20, 1, 3.1], [30, 74, 0, 1.8],
  [78, 64, 0, 2.9], [84, 26, 0, 0.3], [49, 94, 0, 3.6], [90, 70, 0, 1.5],
];

function NightDecor({ px, groundH, isMobile }) {
  const stars = isMobile ? STARS.filter((_, i) => i % 2 === 0 && STARS[i][1] < 90) : STARS;
  return (
    <>
      {stars.map(([x, y, big, delay]) => (
        <span key={`${x}-${y}`} className={sceneAnim("twinkle")}
          style={{ position: "absolute", left: `${x}%`, top: y, animationDelay: `${delay}s` }}>
          {big
            ? <Pixels grid={STAR} ink={{ y: "#ffd779", w: "#ffffff" }} px={4} />
            : <span style={{ display: "block", width: 4, height: 4, background: (x + y) % 3 ? "#c9cffb" : "#ffd779" }} />}
        </span>
      ))}
      <span style={{ position: "absolute", right: isMobile ? 18 : 28, top: isMobile ? 14 : 20 }}>
        <Pixels grid={MOON} ink={{ y: "#ffe9a8" }} px={px} />
      </span>
      {/* The lamp's light on the wall. */}
      <span style={{ position: "absolute", left: isMobile ? -10 : 0, bottom: groundH, width: 200, height: 150,
        background: "radial-gradient(ellipse at 30% 100%, rgba(255,215,121,0.22), rgba(255,215,121,0) 70%)" }} />
      <span style={{ position: "absolute", left: isMobile ? 16 : 28, bottom: groundH }}>
        <Pixels grid={LAMP} ink={LAMP_INK} px={px} />
      </span>
      <span style={{ position: "absolute", left: isMobile ? 66 : 96, bottom: groundH }}>
        <Pixels grid={BOOKS} ink={BOOKS_INK} px={px} />
      </span>
      {!isMobile && (
        <span style={{ position: "absolute", left: 200, bottom: groundH }}>
          <Pixels grid={PEN} ink={PEN_INK} px={px} />
        </span>
      )}
    </>
  );
}

/**
 * title: the page's h1, set on the sky. onBack(): the "Agents" button.
 * state: Quill's pose ("idle", "thinking"). isMobile: the shorter band.
 * says: Quill's line, in a bubble to the owl's left (wide screens only).
 */
export default function NightScene({ title = "Essays", onBack, state = "idle", isMobile = false, says = null }) {
  return (
    <AgentScene title={title} onBack={onBack} agent="quill" state={state} says={says} isMobile={isMobile}
      sky={SKY} ground={GROUND} decor={(p) => <NightDecor {...p} />} />
  );
}
