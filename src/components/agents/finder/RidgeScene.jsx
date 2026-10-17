import AgentScene, { Pixels, Ridge, sceneAnim } from "../scene/AgentScene.jsx";

// Talon's lookout at dawn: the band across the top of the Opportunities board.
// A hawk in a ranger's hat scouts for what is out there, so the scene is a
// high ledge at first light: a sun coming up behind two ranges of mountains, a
// line of pines, a few birds on the wind, and on the ledge a trail sign
// pointing two ways (scholarships and activities), binoculars on a rock and a
// small flag on the spot it has picked out. Talon stands on the right, turned
// to face what it says.
//
// A fixed scene that does not follow the student's accent.

const SKY = "linear-gradient(to bottom, #1f2f57 0 26%, #34437a 26% 48%, #8a5f86 48% 64%, #d77c62 64% 80%, #f2a65e 80%)";
const GROUND = { h: 20, mobileH: 15, color: "#3b4a3f", top: "#5b7458" };

// ── Pixel props, on a grid of one character a pixel ("." is empty) ──────────

const SUN = [
  "....yyyyyy....",
  "..yyyyyyyyyy..",
  ".yyyyYYyyyyyy.",
  "yyyyYYyyyyyyyy",
  "yyyyyyyyyyyyyy",
];
const SUN_INK = { y: "#ffcf6b", Y: "#fff0bf" };

const PINE = [
  "...G...",
  "..GGG..",
  "..GgG..",
  ".GGGGG.",
  ".GGgGG.",
  "GGGGGGG",
  ".GGGGG.",
  "GGGgGGG",
  "GGGGGGG",
  "...t...",
  "...t...",
];
const PINE_INK = { G: "#1d3a3e", g: "#2a524f", t: "#2a1f1c" };

const BIRD = ["k...k", ".k.k.", "..k.."];

// A trail sign, one board each way.
const SIGN = [
  "......pp........",
  "kkkkkkkkkkkkkk..",
  "kwwwwwwwwwwwwwk.",
  "kwWWWWWwWWWWwwwk",
  "kwwwwwwwwwwwwwk.",
  "kkkkkkkkkkkkkk..",
  "......pp........",
  "..kkkkkkkkkkkkkk",
  ".kwwwwwwwwwwwwwk",
  "kwwwWWWWwWWWWWwk",
  ".kwwwwwwwwwwwwwk",
  "..kkkkkkkkkkkkkk",
  "......pp........",
  "......pp........",
  "......pp........",
  ".....kppk.......",
];
const SIGN_INK = { k: "#2a1f1c", w: "#d9a35f", W: "#a8743b", p: "#8a5a35" };

const BINOCULARS = [
  ".kkk....kkk.",
  "kbbbk..kbbbk",
  "kbBbkkkkbBbk",
  "kbbbkcckbbbk",
  "kbbbk..kbbbk",
  "kwwwk..kwwwk",
  ".kkk....kkk.",
];
const BINOCULARS_INK = { k: "#1b2230", b: "#4a5568", B: "#6b7a90", c: "#8a5a35", w: "#9fd3ff" };

const ROCK = [
  "....kkkkkkk.....",
  "..kkrrrrrrrkk...",
  ".krrRrrrrrrrrk..",
  "krrrrrrrRrrrrrk.",
  "krrrrrrrrrrrrrrk",
  "kkkkkkkkkkkkkkkk",
];
const ROCK_INK = { k: "#2b2f38", r: "#8b8f9c", R: "#a9adb9" };

const FLAG = [
  "kffff.",
  "kfFfff",
  "kffff.",
  "k.....",
  "k.....",
  "k.....",
  "k.....",
];
const FLAG_INK = { k: "#2a1f1c", f: "#3a6fd0", F: "#7daaf2" };

// Pines: [left in %, scale step (0 small, 1 big)].
const PINES = [[12, 0], [19, 1], [27, 0], [46, 1], [53, 0], [61, 1], [69, 0]];
// Birds: [left in %, top in px, drift delay in s].
const BIRDS = [[40, 30, 0], [47, 18, 4], [58, 40, 8]];

// Two ranges of peaks, as heights per column (deterministic, no randomness).
const farRange = (i) => 7 + 6 * Math.abs(Math.sin(i / 11)) + 3 * Math.abs(Math.sin(i / 4.3));
const nearRange = (i) => 3 + 4 * Math.abs(Math.sin(i / 7 + 1.3)) + 2 * Math.abs(Math.sin(i / 2.7));

function RidgeDecor({ px, groundH, isMobile }) {
  const cols = 360;
  const pines = isMobile ? PINES.filter((_, i) => i % 2 === 1) : PINES;
  return (
    <>
      {/* The sun, just up over the far range. */}
      <span style={{ position: "absolute", left: isMobile ? "48%" : "38%", bottom: groundH + 13 * px, width: 14 * px,
        height: 5 * px, boxShadow: "0 0 50px 22px rgba(255,200,110,0.4)", borderRadius: "50% 50% 0 0" }} />
      <span style={{ position: "absolute", left: isMobile ? "48%" : "38%", bottom: groundH + 13 * px }}>
        <Pixels grid={SUN} ink={SUN_INK} px={px} />
      </span>
      {BIRDS.map(([x, y, delay]) => (
        <span key={x} className={sceneAnim("drift")}
          style={{ position: "absolute", left: `${x}%`, top: y, animationDelay: `-${delay}s` }}>
          <Pixels grid={BIRD} ink={{ k: "#2a2440" }} px={isMobile ? 2 : 3} />
        </span>
      ))}

      <Ridge cols={cols} px={px} color="#5a527a" heightAt={farRange}
        style={{ position: "absolute", left: 0, bottom: groundH }} />
      <Ridge cols={cols} px={px} color="#33395a" heightAt={nearRange}
        style={{ position: "absolute", left: 0, bottom: groundH }} />
      {pines.map(([x, big]) => (
        <span key={x} style={{ position: "absolute", left: `${x}%`, bottom: groundH }}>
          <Pixels grid={PINE} ink={PINE_INK} px={big ? px : px - 1} />
        </span>
      ))}

      {/* On the ledge. */}
      <span style={{ position: "absolute", left: isMobile ? 14 : 26, bottom: groundH }}>
        <Pixels grid={SIGN} ink={SIGN_INK} px={px} />
      </span>
      <span style={{ position: "absolute", left: isMobile ? 82 : 116, bottom: groundH }}>
        <Pixels grid={ROCK} ink={ROCK_INK} px={px} />
      </span>
      <span className={sceneAnim("bob")}
        style={{ position: "absolute", left: isMobile ? 90 : 126, bottom: groundH + 6 * px - px }}>
        <Pixels grid={BINOCULARS} ink={BINOCULARS_INK} px={px} />
      </span>
      {!isMobile && (
        <span style={{ position: "absolute", left: 206, bottom: groundH }}>
          <Pixels grid={FLAG} ink={FLAG_INK} px={px} />
        </span>
      )}
    </>
  );
}

/**
 * title: the page's h1. onBack(): the "Agents" button. state: Talon's pose.
 * isMobile: the shorter band. says: Talon's line (wide screens only).
 */
export default function RidgeScene({ title = "Opportunities", onBack, state = "idle", isMobile = false, says = null }) {
  return (
    <AgentScene title={title} onBack={onBack} agent="talon" state={state} says={says} isMobile={isMobile}
      sky={SKY} ground={GROUND} backColor="#eef0ff" flip lift={6} decor={(p) => <RidgeDecor {...p} />} />
  );
}
