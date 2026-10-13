import Mascot from "../../Mascot.jsx";
import { PixelArrow } from "../../../ui/PixelIcons.jsx";
import { SANS } from "../../../ui/tokens.js";

// The night desk: a short band across the top of Quill's page. A night sky
// with a few stars and a moon, a desk with a lamp, a stack of pages and a
// pen, and Quill perched on the desk's edge. It is drawn the way the mascots
// are (crisp SVG rects from character grids).
//
// It is a fixed dark band that deliberately does not follow the student's
// accent; the page below it is the calm light shell. Everything in it is
// decoration (aria-hidden) except the back button and the page's title, which
// sit on the sky in light text. Stars twinkle slowly, and not at all under
// reduced motion.

const SKY = "linear-gradient(to bottom, #1b1e3d 0 34%, #23264b 34% 68%, #2c2f5c 68%)";
const DESK_TOP = "#5d4c7c";
const DESK = "#3b2f52";

const NIGHT_CLASS = "nd-night";
const NIGHT_CSS = `
.${NIGHT_CLASS}-star { animation: nd-twinkle 5s ease-in-out infinite; }
@keyframes nd-twinkle { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
.${NIGHT_CLASS}-focus:focus-visible { outline: 3px solid #ffffff; outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { .${NIGHT_CLASS}-star { animation: none; } }
`;
if (typeof document !== "undefined" && !document.querySelector("style[data-quill-night]")) {
  const el = document.createElement("style");
  el.dataset.quillNight = "";
  el.textContent = NIGHT_CSS;
  document.head.appendChild(el);
}

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

/** A grid as crisp rects. Decorative. */
function Pixels({ grid, ink, px, style }) {
  const rects = [];
  grid.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      let end = x + 1;
      while (end < row.length && row[end] === ch) end += 1;
      if (ink[ch]) rects.push(<rect key={`${y}-${x}`} x={x} y={y} width={end - x} height={1} fill={ink[ch]} />);
      x = end;
    }
  });
  return (
    <svg aria-hidden="true" focusable="false" width={grid[0].length * px} height={grid.length * px}
      viewBox={`0 0 ${grid[0].length} ${grid.length}`} shapeRendering="crispEdges" style={{ display: "block", ...style }}>
      {rects}
    </svg>
  );
}

// Stars: [left in %, top in px, big, twinkle delay in s]. They keep to the
// right of the title, which sits top left.
const STARS = [
  [38, 22, 0, 0], [46, 58, 1, 1.2], [55, 14, 0, 2.4], [63, 42, 0, 0.6], [70, 20, 1, 3.1], [30, 74, 0, 1.8],
  [78, 64, 0, 2.9], [84, 26, 0, 0.3], [49, 94, 0, 3.6], [90, 70, 0, 1.5],
];

/**
 * title: the page's h1, set on the sky. onBack(): the "Agents" button.
 * state: Quill's pose ("idle", "thinking"). isMobile: the shorter band.
 */
export default function NightScene({ title = "Essays", onBack, state = "idle", isMobile = false }) {
  const px = isMobile ? 3 : 4;
  const height = isMobile ? 150 : 200;
  const deskH = isMobile ? 12 : 16;
  const quill = isMobile ? 96 : 128;
  const stars = isMobile ? STARS.filter((_, i) => i % 2 === 0 && STARS[i][1] < 90) : STARS;

  return (
    <header style={{ position: "relative", height, marginBottom: 14, borderRadius: 16, overflow: "hidden",
      background: SKY, boxSizing: "border-box" }}>
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        {stars.map(([x, y, big, delay]) => (
          <span key={`${x}-${y}`} className={`${NIGHT_CLASS}-star`}
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
        <span style={{ position: "absolute", left: isMobile ? -10 : 0, bottom: deskH, width: 200, height: 150,
          background: "radial-gradient(ellipse at 30% 100%, rgba(255,215,121,0.22), rgba(255,215,121,0) 70%)" }} />

        {/* The desk and what is on it. */}
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: deskH, boxSizing: "border-box",
          background: DESK, borderTop: `4px solid ${DESK_TOP}` }} />
        <span style={{ position: "absolute", left: isMobile ? 16 : 28, bottom: deskH }}>
          <Pixels grid={LAMP} ink={LAMP_INK} px={px} />
        </span>
        <span style={{ position: "absolute", left: isMobile ? 66 : 96, bottom: deskH }}>
          <Pixels grid={BOOKS} ink={BOOKS_INK} px={px} />
        </span>
        {!isMobile && (
          <span style={{ position: "absolute", left: 200, bottom: deskH }}>
            <Pixels grid={PEN} ink={PEN_INK} px={px} />
          </span>
        )}
        {/* Quill, perched on the desk's edge. */}
        <div style={{ position: "absolute", right: isMobile ? 14 : 56, bottom: deskH - 4 }}>
          <Mascot agent="quill" state={state} size={quill} title="" />
        </div>
      </div>

      <div style={{ position: "relative", padding: isMobile ? "4px 16px 0" : "10px 26px 0" }}>
        <button type="button" className={`${NIGHT_CLASS}-focus`} onClick={onBack}
          style={{ minHeight: 44, display: "inline-flex", alignItems: "center", gap: 8, margin: "0 0 2px -8px", padding: "0 8px",
            border: "none", background: "none", borderRadius: 10, cursor: "pointer", fontFamily: SANS, fontSize: "0.95rem",
            fontWeight: 700, color: "#e4e6ff" }}>
          <PixelArrow size={16} style={{ transform: "scaleX(-1)" }} />
          Agents
        </button>
        <h1 style={{ margin: 0, fontFamily: SANS, fontWeight: 800, fontSize: isMobile ? "2.1rem" : "2.5rem", color: "#ffffff",
          letterSpacing: "-0.03em", lineHeight: 1.1 }}>
          {title}
        </h1>
      </div>
    </header>
  );
}
