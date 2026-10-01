// Talon, the opportunity hawk: a scout who spots real scholarships and
// programs. A round, head-heavy hawk in a blue ranger hat with a gold star
// badge (the "Chibi ranger" direction, picked from three), a sibling to
// Beaker's postal cap: the hat leans a little toward azure and the band is the
// darkest blue, so the two read as a set without wearing the same uniform. A
// big glinting eye, a small hooked beak, a cream face and chest, a red tail.
// A 32 by 32 grid, one character per pixel ("." is empty), in the same format
// as Beaker's (sprites/beaker.js) and with its own palette: the mascot keeps
// its colors whatever accent the student picked.
//
// Light comes from the top left: highlights (the hat's crown and brim, the
// back of the head, the wing's top edge) sit top left of each form, shade (the
// brim's underside, the chest's lower edge, the wing scallops) bottom right.
// One dark outline all round.
//
// The poses (standing, wing up, holding a certificate, napping under the hat,
// three wingbeats) are drawn in full; every other frame is a pose plus a small
// overlay (eyes, a "?", z's, sparkles) or a one-pixel breath.

const PALETTE = {
  ".": null,
  k: "#2e2230",   // outline, eye
  w: "#ffffff",   // eye glint, the certificate
  n: "#e2a468",   // feather highlight
  b: "#b9733e",   // feathers
  B: "#8a4c29",   // feather shade, wing scallops, the thinking "?"
  d: "#5c3322",   // brow, flight feather tips
  c: "#fcf0da",   // cream face and chest
  C: "#e9d0a6",   // cream shade, the certificate's rolls
  m: "#f6a38e",   // cheek
  h: "#6c7088",   // beak
  l: "#adb2c8",   // beak shine
  H: "#474a5e",   // beak shade, the hook
  o: "#f7c548",   // cere, legs and toes
  O: "#cf9226",   // leg shade
  g: "#3b7cc6",   // ranger hat
  G: "#265392",   // hat shade, brim underside
  j: "#7fb5ec",   // hat shine
  t: "#1c3d72",   // hat band
  y: "#ffd779",   // the hat's star badge, sparkles
  r: "#cc6640",   // red tail, the certificate's ribbon
  R: "#93401f",   // tail band
  p: "#d8cfbd",   // the certificate's lines of text
  z: "#7c86ad",   // sleepy z's
};

// Standing, wing folded. Rows 28 to 30 are the legs and toes and row 31 their
// outline, so Talon stands on the bottom row like Beaker (a breath drops row
// 29; see `bob`).
const STAND = [
  ".............kkkkkk.............",
  "...........kkjjgggGkk...........",
  "..........kjjgggggggGk..........",
  "..........kjggggggggGk..........",
  ".........kttttttttyyttk.........",
  ".......kkGgggggggggggggGkk......",
  "......kjjggggggggggggggggGk.....",
  ".......kGGGGGGGGGGGGGGGGGk......",
  "........kkkkkkkkkkkkkkkkk.......",
  ".......knbbbbbbbbbBddbbbbk......",
  ".......kbbbbbbbbbccwkccbkkk.....",
  "......kbbbbbbbbbccckkcckollk....",
  "......kbbbbbbbbcccckkcckohhhk...",
  ".......kbbbbbbbcmmccccckhhhhhk..",
  ".......kbbbbbbbccccccccckkHHHk..",
  "........kbbbbbbcccccccccBkkkHk..",
  "........kbbbbbbccccccccck...k...",
  "........kBBbbbbccccccckk........",
  ".......kBnnbbbbCCCcCCCk.........",
  "......kBnnbbbbBcccCcbbk.........",
  "......kBnbbbbbBccccccbbk........",
  "......kBbbbbbbBcccccccbk........",
  ".....krBBbBbBbBCccCccccbk.......",
  "....krrBbbbbbbBccccccccBk.......",
  "...krrRBbBbBbBBcccccccCk........",
  "..krrRRkdBdbbBccCccCCCBk........",
  "..kRRRkddBddBBcccCCCCCk.........",
  "...kkk.kdddbbbcCCCCCCk..........",
  "........kkkkkokBBkokk...........",
  "............kOkkkkOk............",
  "............koook.kook..........",
  "............kkkk..kkkk..........",
];

// The near wing thrown up behind the hat, feathers spread.
const CHEER = [
  ".............kkkkkk.............",
  "...........kkjjgggGkk...........",
  "..........kjjgggggggGk..........",
  "..........kjggggggggGk..........",
  ".........kttttttttyyttk.........",
  "..kk.kkkkGgggggggggggggGkk......",
  ".kddkdkjjggggggggggggggggGk.....",
  "kddddddkGGGGGGGGGGGGGGGGGk......",
  "kdBdBdBdkkkkkkkkkkkkkkkkk.......",
  "knbBbBbBnbbbbbbbbbBddbbbbk......",
  "knbbbbbbbbbbbbbbbccwkccbkkk.....",
  "knbbbbbbbbbbbbbbccckkcckollk....",
  ".knbbbbbbbbbbbbcccckkcckohhhk...",
  ".knbbbbbbbbbbbbcmmccccckhhhhhk..",
  "..knbbbbbbbbbbbccccccccckkHHHk..",
  "..knbbbbkbbbbbbcccccccccBkkkHk..",
  "...knbbbkbbbbbbccccccccck...k...",
  "...knbbbBbkbbbbccccccckk........",
  "....kkkkBbknnbbCCCcCCCk.........",
  "........kknbbbbcccCcbbk.........",
  "........kbbbbbcccccccbbk........",
  "......kkbbbbbcccccccccbk........",
  ".....krkbbbbcccCccCccccbk.......",
  "....krrkbbbbcccccccccccBk.......",
  "...krrRkbbbbccccccccccCk........",
  "..krrRRkbbbbccccCccCCCBk........",
  "..kRRRk.kbbbbccccCCCCCk.........",
  "...kkk...kbbbbcCCCCCCk..........",
  "..........kkkokBBkokk...........",
  "............kOkkkkOk............",
  "............koook.kook..........",
  "............kkkk..kkkk..........",
];

// A find: a rolled certificate tied with a ribbon, held in the hook.
const HOLD = [
  ".............kkkkkk.............",
  "...........kkjjgggGkk...........",
  "..........kjjgggggggGk..........",
  "..........kjggggggggGk..........",
  ".........kttttttttyyttk.........",
  ".......kkGgggggggggggggGkk......",
  "......kjjggggggggggggggggGk.....",
  ".......kGGGGGGGGGGGGGGGGGk......",
  "........kkkkkkkkkkkkkkkkk.......",
  ".......knbbbbbbbbbBddbbbbk......",
  ".......kbbbbbbbbbccwkccbkkk.....",
  "......kbbbbbbbbbccckkcckollk....",
  "......kbbbbbbbbcccckkcckohhhk...",
  ".......kbbbbbbbcmmccccckhhhhhk..",
  ".......kbbbbbbbccccccccckkHHHk..",
  "........kbbbbbbcccccckkkkkkHkk..",
  "........kbbbbbbccccckCwwwrwwwCk.",
  "........kBBbbbbccccckCwpprwppCk.",
  ".......kBnnbbbbCCCcCkCCCCrCCCCk.",
  "......kBnnbbbbBcccCcbkkkrkrkkk..",
  "......kBnbbbbbBccccccbbkk.k.....",
  "......kBbbbbbbBcccccccbk........",
  ".....krBBbBbBbBCccCccccbk.......",
  "....krrBbbbbbbBccccccccBk.......",
  "...krrRBbBbBbBBcccccccCk........",
  "..krrRRkdBdbbBccCccCCCBk........",
  "..kRRRkddBddBBcccCCCCCk.........",
  "...kkk.kdddbbbcCCCCCCk..........",
  "........kkkkkokBBkokk...........",
  "............kOkkkkOk............",
  "............koook.kook..........",
  "............kkkk..kkkk..........",
];

// Napping: the hat tipped down over the eyes.
const NAP = [
  "................................",
  "................................",
  ".............kkkkkk.............",
  "...........kkjjgggGkk...........",
  "..........kjjgggggggGk..........",
  "..........kjggggggggGk..........",
  ".........kttttttttyyttk.........",
  ".......kkGgggggggggggggGkk......",
  "......kjjggggggggggggggggGk.....",
  ".......kGGGGGGGGGGGGGGGGGk......",
  ".......kkkkkkkkkkkkkkkkkkkk.....",
  "......kbbbbbbbbbcckcckckollk....",
  "......kbbbbbbbbcccckkcckohhhk...",
  ".......kbbbbbbbcmmccccckhhhhhk..",
  ".......kbbbbbbbccccccccckkHHHk..",
  "........kbbbbbbcccccccccBkkkHk..",
  "........kbbbbbbccccccccck...k...",
  "........kBBbbbbccccccckk........",
  ".......kBnnbbbbCCCcCCCk.........",
  "......kBnnbbbbBcccCcbbk.........",
  "......kBnbbbbbBccccccbbk........",
  "......kBbbbbbbBcccccccbk........",
  ".....krBBbBbBbBCccCccccbk.......",
  "....krrBbbbbbbBccccccccBk.......",
  "...krrRBbBbBbBBcccccccCk........",
  "..krrRRkdBdbbBccCccCCCBk........",
  "..kRRRkddBddBBcccCCCCCk.........",
  "...kkk.kdddbbbcCCCCCCk..........",
  "........kkkkkokBBkokk...........",
  "............kOkkkkOk............",
  "............koook.kook..........",
  "............kkkk..kkkk..........",
];

// Flying, talons tucked: the same head and hat a little forward, the round
// body held level behind. Wing up (body a pixel low), level, down (body a
// pixel high); the hat stays whole inside the grid on every beat.
const FLY_UP = [
  "................................",
  "................................",
  "...............kkkkkk...........",
  ".............kkjjgggGkk.........",
  "............kjjgggggggGk........",
  "............kjggggggggGk........",
  ".....k.k.k.kttttttttyyttk.......",
  "....kdkdkkkGgggggggggggggGkk....",
  "...kddddkjjggggggggggggggggGk...",
  "...kdBdBdkGGGGGGGGGGGGGGGGGk....",
  "...knbBbBbkkkkkkkkkkkkkkkkk.....",
  "....knbbbbnbbbbbbbbbBddbbbbk....",
  "....knbbbbbbbbbbbbbccwkccbkkk...",
  ".....knbbbbbbbbbbbccckkcckollk..",
  ".....knbbbbbbbbbbcccckkcckohhhk.",
  "......knbbbbbbbbbcmmccccckhhhhhk",
  ".......knbbbbbbbbccccccccckkHHHk",
  "........knbbbbbbbcccccccccBkkkHk",
  "........kkkbbbbbbccccccccck...k.",
  "......kknbbbbbbbbccccccckk......",
  "..kk.knbbbbbbbbbbCCCcCCCk.......",
  "kkrrkbbbbbbbbbbbbbbcCckk........",
  "rrrRrbbbbbbbbcccccccbbk.........",
  "rRRRbbbbbbbccccccccccck.........",
  "krrkkbbbbbcccccccccccck.........",
  ".kk.kbbbbbcccccccccccck.........",
  ".....kbbbbbCCCCCCCCCCCk.........",
  "......kkbbBBBCCCCCCCkk..........",
  "........kkkkkkkkokok............",
  "................k.k.............",
  "................................",
  "................................",
];

const FLY_MID = [
  "................................",
  "...............kkkkkk...........",
  ".............kkjjgggGkk.........",
  "............kjjgggggggGk........",
  "............kjggggggggGk........",
  "...........kttttttttyyttk.......",
  ".........kkGgggggggggggggGkk....",
  "........kjjggggggggggggggggGk...",
  ".........kGGGGGGGGGGGGGGGGGk....",
  "..........kkkkkkkkkkkkkkkkk.....",
  ".........knbbbbbbbbbBddbbbbk....",
  ".........kbbbbbbbbbccwkccbkkk...",
  "........kbbbbbbbbbccckkcckollk..",
  ".kkkk...kbbbbbbbbcccckkcckohhhk.",
  "kddddkkk.kbbbbbbbcmmccccckhhhhhk",
  "kdBdBdddkkbbbbbbbccccccccckkHHHk",
  "kdbBbBbbbbkbbbbbbcccccccccBkkkHk",
  ".knbbbbbbbbbbbbbbccccccccck...k.",
  "..knnbbbbbbbbbbbbccccccckk......",
  "..kkknnbbbbkbbbbbCCCcCCCk.......",
  "kkrrkbbbbbbbbbbbbbbcCckk........",
  "rrrRrbbbbbbbbcccccccbbk.........",
  "rRRRbbbbbbbccccccccccck.........",
  "krrkkbbbbbcccccccccccck.........",
  ".kk.kbbbbbcccccccccccck.........",
  ".....kbbbbbCCCCCCCCCCCk.........",
  "......kkbbBBBCCCCCCCkk..........",
  "........kkkkkkkkokok............",
  "................k.k.............",
  "................................",
  "................................",
  "................................",
];

const FLY_DOWN = [
  "...............kkkkkk...........",
  ".............kkjjgggGkk.........",
  "............kjjgggggggGk........",
  "............kjggggggggGk........",
  "...........kttttttttyyttk.......",
  ".........kkGgggggggggggggGkk....",
  "........kjjggggggggggggggggGk...",
  ".........kGGGGGGGGGGGGGGGGGk....",
  "..........kkkkkkkkkkkkkkkkk.....",
  ".........knbbbbbbbbbBddbbbbk....",
  ".........kbbbbbbbbbccwkccbkkk...",
  "........kbbbbbbbbbccckkcckollk..",
  "........kbbbbbbbbcccckkcckohhhk.",
  ".........kbbbbbbbcmmccccckhhhhhk",
  ".........kbbbbbbbccccccccckkHHHk",
  "..........kbbbbbbcccccccccBkkkHk",
  "........kkkbbbbbbccccccccck...k.",
  "......kknbbbbbbbbccccccckk......",
  "..kk.knbbbbbbbbbbCCCcCCCk.......",
  "kkrrkbbbbbbbbbbbbbbcCckk........",
  "rrrRrbbbbbnbbbbkccccbbk.........",
  "rRRRbbbbbnbbbbbkcccccck.........",
  "krrkkbbbbbbbbbbkcccccck.........",
  ".kk.kbbbdbbbbbkccccccck.........",
  ".....kbbdBbbbkCCCCCCCCk.........",
  "......kdBdbbkCCCCCCCkk..........",
  "......kddBdk.kkkokok............",
  ".....kdddkk.....k.k.............",
  ".....kddk.......................",
  "......kk........................",
  "................................",
  "................................",
];

// ─── Overlays ─────────────────────────────────────────────────────────────────
// { x, y, rows }: drawn over a frame with its top-left corner at (x, y). A
// space leaves the pixel underneath; any other character replaces it.

const BLINK = { x: 19, y: 10, rows: ["cc", "", "cc"] };
const LOOK_UP = { x: 19, y: 10, rows: ["kw", "", "cc"] };
const EYES_HAPPY = { x: 18, y: 10, rows: [" k", "kcck", " cc"] };

const question = (x, y) => ({ x, y, rows: [
  " BBB ",
  "B   B",
  "    B",
  "  BB ",
  "  B  ",
  "     ",
  "  B  ",
] });
const smallZ = (x, y) => ({ x, y, rows: ["zzzz", "  z ", " z  ", "zzzz"] });
const bigZ = (x, y) => ({ x, y, rows: ["zzzzz", "   z ", "  z  ", " z   ", "zzzzz"] });
const sparkle = (x, y) => ({ x, y, rows: [" y ", "ywy", " y "] });
const bigSparkle = (x, y) => ({ x, y, rows: ["  y  ", "  y  ", "yywyy", "  y  ", "  y  "] });

function stamp(base, ...marks) {
  const rows = base.map((r) => r.split(""));
  for (const { x, y, rows: art } of marks) {
    art.forEach((line, dy) => [...line].forEach((ch, dx) => {
      if (ch !== " " && rows[y + dy] && x + dx >= 0 && x + dx < rows[y + dy].length) rows[y + dy][x + dx] = ch;
    }));
  }
  return rows.map((r) => r.join(""));
}

// A breath: everything above the legs drops a pixel and the legs get a pixel
// shorter (row 29, legs only, goes), so the toes stay planted.
const bob = (rows) => [".".repeat(rows[0].length), ...rows.slice(0, 29), ...rows.slice(30)];

const LOOKING = stamp(STAND, LOOK_UP);
const HAPPY = stamp(CHEER, EYES_HAPPY);

// Each state: frames, frames per second, and optionally `sequence`, the order
// frames play in (a blink held once every few seconds rather than every other
// beat). The state names match Beaker's, so any screen can ask either agent
// for the same states.
export const TALON = {
  width: 32,
  height: 32,
  palette: PALETTE,
  // The art row a speech bubble's tail points at (MascotSays, through
  // mascotFit): the middle of the beak, three rows below Beaker's bill, which
  // is the default and needs no entry.
  beakRow: 13,
  states: {
    idle: {
      fps: 4,
      frames: [STAND, bob(STAND), stamp(STAND, BLINK)],
      sequence: [0, 0, 1, 1, 0, 0, 1, 1, 0, 2, 1, 1],
    },
    flying: {
      fps: 8,
      frames: [FLY_UP, FLY_MID, FLY_DOWN],
      sequence: [0, 1, 2, 1],
    },
    thinking: {
      fps: 3,
      frames: [stamp(LOOKING, question(26, 0)), stamp(bob(LOOKING), question(26, 0))],
    },
    delivering: {
      fps: 3,
      frames: [stamp(HOLD, sparkle(27, 22)), stamp(bob(HOLD), sparkle(24, 24), sparkle(29, 22))],
    },
    celebrating: {
      fps: 4,
      frames: [
        stamp(HAPPY, bigSparkle(26, 0), sparkle(27, 19)),
        stamp(bob(HAPPY), sparkle(27, 1), bigSparkle(26, 17)),
      ],
    },
    sleeping: {
      fps: 1.5,
      frames: [stamp(NAP, smallZ(23, 1)), stamp(bob(NAP), smallZ(23, 1), bigZ(27, 0))],
    },
  },
};

export default TALON;
