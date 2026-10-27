import AgentScene, { Pixels, sceneAnim } from "../scene/AgentScene.jsx";

// Beaker's beach lab: the band across the top of the Outreach board. A bright
// noon sky with a sun and drifting clouds, the sea, and a strip of sand with
// a palm, a lab bench's worth of glassware (a beaker and a flask bubbling, a
// rack of test tubes) and a blue mailbox, because Beaker is a pelican, a
// chemist's namesake and a postal carrier at once. Beaker stands on the sand
// on the right, turned to face what it says.
//
// A fixed scene that does not follow the student's accent.

const SKY = "linear-gradient(to bottom, #2a78bf 0 30%, #3f8fd1 30% 58%, #62a9df 58%)";
const GROUND = { h: 22, mobileH: 16, color: "#f0d49c", top: "#e2bb72" };
const SEA = "#2f86c9";

// ── Pixel props, on a grid of one character a pixel ("." is empty) ──────────

const SUN = [
  "...yyyy...",
  "..yyyyyy..",
  ".yyYYyyyy.",
  "yyYYyyyyyy",
  "yyYyyyyyyy",
  "yyyyyyyyyy",
  "yyyyyyyyyy",
  ".yyyyyyyy.",
  "..yyyyyy..",
  "...yyyy...",
];
const SUN_INK = { y: "#ffd34d", Y: "#fff3b0" };

const CLOUD = [
  "....wwww......",
  "..wwwwwwww.ww.",
  ".wwwwwwwwwwwww",
  "wwwwwwwwwwwwww",
  ".ssssssssssss.",
];
const CLOUD_INK = { w: "#ffffff", s: "#d4e8f8" };

const PALM = [
  "......GG....GG......",
  "...GGGggG..GggGGG...",
  ".GGgggggGGGGgggggGG.",
  "Gggg...gGtTGg...gggG",
  "Gg....gGCtTCGg....gG",
  "G....gG..tT..Gg....G",
  ".....G...tT...G.....",
  ".........tT.........",
  "........tT..........",
  "........tT..........",
  "........tT..........",
  ".......tT...........",
  ".......tT...........",
  ".......tT...........",
  ".......tT...........",
  "......tTt...........",
];
const PALM_INK = { G: "#2b8040", g: "#3fae5a", t: "#b07a46", T: "#8a5a35", C: "#6b4226" };

// A lab beaker, green and bubbling, with its measuring marks.
const GLASS = [
  "kkkkkkkkkk",
  "kwggggggkk",
  ".kwggggggk",
  ".kwgkkgggk",
  ".kwggggggk",
  ".kwgkkgggk",
  ".kllllllLk",
  ".klbllllLk",
  ".kllllblLk",
  ".klllllLLk",
  ".kkkkkkkkk",
];
const GLASS_INK = { k: "#1d2a3a", w: "#ffffff", g: "#d9f1ff", l: "#5fd38d", L: "#37a86a", b: "#c9f7da" };

// A round-bottomed flask, violet.
const FLASK = [
  "....kkkk....",
  "....kwgk....",
  "....kwgk....",
  "...kwgggk...",
  "..kwgggggk..",
  "..kppppppk..",
  ".kpppbpppPk.",
  ".kppppppPPk.",
  "kppbpppppPPk",
  "kkkkkkkkkkkk",
];
const FLASK_INK = { k: "#1d2a3a", w: "#ffffff", g: "#d9f1ff", p: "#a77be8", P: "#7d55c4", b: "#e2d2ff" };

// Three test tubes in a wooden rack.
const RACK = [
  "..kkk.kkk.kkk.",
  "..kwk.kwk.kwk.",
  "..krk.kyk.klk.",
  "kBBBBBBBBBBBBk",
  "..krk.kyk.klk.",
  "..krk.kyk.klk.",
  "..kkk.kkk.kkk.",
  "kBBBBBBBBBBBBk",
  "kBkkkkkkkkkkBk",
  "kBk........kBk",
  "kkk........kkk",
];
const RACK_INK = { k: "#1d2a3a", w: "#d9f1ff", r: "#f07a7a", y: "#f5c542", l: "#5fd38d", B: "#c08a52" };

// The mailbox Beaker's letters go out from.
const MAILBOX = [
  "..kkkkkk..",
  ".kbbbbbbk.",
  "kbbbbbbbbk",
  "kbwwwwwbBk",
  "kbbbbbbbBk",
  "kBBBBBBBBk",
  "kkkkkkkkkk",
  "....kok...",
  "....kok...",
  "....kok...",
  "....kok...",
  "...kkkkk..",
];
const MAILBOX_INK = { k: "#1d2a3a", b: "#3a6fd0", B: "#2b54a3", w: "#ffffff", o: "#8a5a35" };

// Clouds: [left in %, top in px, drift delay in s].
const CLOUDS = [[34, 18, 0], [58, 46, 5], [76, 12, 9]];
// Glints on the water: [left in %, row (0 top, 1 bottom), twinkle delay in s].
const GLINTS = [[6, 0, 0], [18, 1, 1.4], [27, 0, 2.6], [41, 1, 0.8], [52, 0, 3.2], [63, 1, 1.9], [71, 0, 0.4], [88, 1, 2.2]];

function BeachDecor({ px, groundH, isMobile }) {
  const seaH = isMobile ? 18 : 26;
  const clouds = isMobile ? CLOUDS.slice(1) : CLOUDS;
  return (
    <>
      <span style={{ position: "absolute", right: isMobile ? 18 : 28, top: isMobile ? 12 : 18, width: 10 * px, height: 10 * px,
        borderRadius: "50%", boxShadow: "0 0 36px 14px rgba(255,226,120,0.45)" }} />
      <span style={{ position: "absolute", right: isMobile ? 18 : 28, top: isMobile ? 12 : 18 }}>
        <Pixels grid={SUN} ink={SUN_INK} px={px} />
      </span>
      {clouds.map(([x, y, delay]) => (
        <span key={x} className={sceneAnim("drift")}
          style={{ position: "absolute", left: `${x}%`, top: y, animationDelay: `-${delay}s` }}>
          <Pixels grid={CLOUD} ink={CLOUD_INK} px={px} />
        </span>
      ))}

      {/* The sea, with a light line where it meets the sky and glints that come and go. */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: groundH, height: seaH, background: SEA,
        borderTop: "4px solid #8fd0f5" }} />
      {GLINTS.map(([x, row, delay]) => (
        <span key={x} className={sceneAnim("twinkle")}
          style={{ position: "absolute", left: `${x}%`, bottom: groundH + (row ? 6 : seaH - 12), width: 12, height: 4,
            background: "#bfe6fb", animationDelay: `${delay}s` }} />
      ))}

      {/* The sand and what is on it. */}
      <span style={{ position: "absolute", left: isMobile ? 6 : 14, bottom: groundH - 2 }}>
        <Pixels grid={PALM} ink={PALM_INK} px={px} />
      </span>
      <span style={{ position: "absolute", left: isMobile ? 70 : 104, bottom: groundH }}>
        <Pixels grid={RACK} ink={RACK_INK} px={px} />
      </span>
      <span style={{ position: "absolute", left: isMobile ? 120 : 172, bottom: groundH }}>
        <Pixels grid={GLASS} ink={GLASS_INK} px={px} />
        <Bubbles px={px} />
      </span>
      {!isMobile && (
        <>
          <span style={{ position: "absolute", left: 222, bottom: groundH }}>
            <Pixels grid={FLASK} ink={FLASK_INK} px={px} />
            <Bubbles px={px} left={4 * px} />
          </span>
          <span style={{ position: "absolute", left: 286, bottom: groundH }}>
            <Pixels grid={MAILBOX} ink={MAILBOX_INK} px={px} />
          </span>
        </>
      )}
      {/* Specks in the sand. */}
      {[8, 23, 37, 49, 66, 81].map((x) => (
        <span key={x} style={{ position: "absolute", left: `${x}%`, bottom: Math.round(groundH / 2) - 2, width: 4, height: 4,
          background: "#d9b06a" }} />
      ))}
    </>
  );
}

/** Two little bubbles rising out of a piece of glassware. */
function Bubbles({ px, left = 3 * px }) {
  return (
    <>
      {[0, 1.6].map((delay, i) => (
        <span key={delay} className={sceneAnim("rise")}
          style={{ position: "absolute", left: left + i * px * 2, top: -px * 2, width: px, height: px, background: "#e6fff0",
            animationDelay: `${delay}s` }} />
      ))}
    </>
  );
}

/** The scene's sky, ground and props, for drawing it at another size (the
 *  landing page's agent cards). */
export const BEACH_SCENE = { sky: SKY, ground: GROUND, Decor: BeachDecor };

/**
 * title: the page's h1. onBack(): the "Agents" button. state: Beaker's pose.
 * isMobile: the shorter band. says: Beaker's line (wide screens only).
 */
export default function BeachScene({ title = "Outreach", onBack, state = "idle", isMobile = false, says = null }) {
  return (
    <AgentScene title={title} onBack={onBack} agent="beaker" state={state} says={says} isMobile={isMobile}
      sky={SKY} ground={GROUND} backColor="#eaf5ff" flip lift={6} decor={(p) => <BeachDecor {...p} />} />
  );
}
