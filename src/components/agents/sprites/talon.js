// Talon, the opportunity hawk: a scout who spots real scholarships and
// programs from up high. A red-tailed hawk with a cream chest, a golden eye
// and a scout's red bandana, perched on a twig, drawn so every state reads at
// 1x. A 32 by 32 grid, one character per pixel ("." is empty), in the same
// format as Beaker's (sprites/beaker.js) and with its own palette: the mascot
// keeps its colors whatever accent the student picked.
//
// Light comes from the top left: highlights (the crown, the wing's top edge,
// the bandana's shine, the beak's shine) sit top left of each form, shade
// (the chest's lower edge, the wing bars, the bandana's folds, the hook)
// bottom right. One dark outline all round; inner edges use the darker tone
// of what they separate.
//
// The three poses (perched, wing up, flying) are drawn in full. Every other
// frame is a pose plus a small overlay (eyes, a "?", sleepy z's, sparkles,
// the find card held in the hook) or a one-pixel shift, so frames differ only
// where they must and the animation stays smooth.

const PALETTE = {
  ".": null,
  k: "#2b2129",   // outline, pupil, talons
  w: "#ffffff",   // eye glint, the find card
  n: "#d49a5e",   // feather highlight
  b: "#a8673a",   // brown feathers
  B: "#7d4727",   // feather shade, wing bars, the thinking "?"
  d: "#4f2d20",   // brow, flight feather tips
  c: "#f8ead0",   // cream face and chest
  C: "#e0c79c",   // cream shade
  e: "#f5b52b",   // golden eye
  m: "#f3a48c",   // cheek
  l: "#b3b8cc",   // beak shine
  h: "#737891",   // beak
  H: "#4c4f66",   // beak shade, the hook
  o: "#f6c544",   // cere, legs and toes, the star on the card
  O: "#c98f25",   // star shade
  r: "#dc4637",   // bandana
  R: "#a52f28",   // bandana shade and knot
  q: "#f58c74",   // bandana shine
  t: "#c4602f",   // red tail
  T: "#8e3e1d",   // tail band
  p: "#d8cfbd",   // the card's line of text
  v: "#9b7a57",   // twig
  g: "#86bf5f",   // leaf
  G: "#4f8a3f",   // leaf shade
  y: "#ffd779",   // sparkles
  z: "#7c86ad",   // sleepy z's
};

// Perched on the twig, wing folded, bandana knotted at the back of the neck.
// Rows 27 and 28 are the legs (a breath drops row 28; see `bob`).
const PERCHED = [
  "................................",
  "...........kkkkkkk..............",
  ".........kknnnnnnnkk............",
  "........knnnnnnnbbbbk...........",
  ".......knnnnnbbbbbbbbk..........",
  ".......knnnbbbbbbbbbbbk.........",
  ".......knnbbbbbbbbbbkkkk........",
  ".......knbbbbddddddboollk.......",
  ".......kbbbbbbewkeccoohhhk......",
  ".......kbbbbbcekkecckkkhhHk.....",
  ".......kbbbbccceeccchhkkHHk.....",
  ".....kk.kbbbcmmccccckk..kHk.....",
  "....kqrRRRqqqrrrrrrrRk...k......",
  "...kRrknbRrrrrrrrrrrrRk.........",
  "....kknnbbbbbBcRrrrrRcCk........",
  ".....knbbbbbbBccRrrRccCk........",
  "....knbbbbbbbbBccRRccccCk.......",
  "....kBBbbbbbbbBccccccccCk.......",
  "....kbbBBBBbbbBccbccbccCk.......",
  "....kbbBbbBbbbBccbccbccCk.......",
  "....kBbBbbBbbBccbccbccCk........",
  "....kdBBbbbbBcccbccbcCCk........",
  "...ktkddBBbbBcccccbccCCk........",
  "..kttTkddBBBccccccccCk..........",
  ".kttTtkkdCCCCccccCCCk...........",
  "kttTttkkCCCCCCCCCCkk............",
  "kTTTTTk.kkkkkkkkkk..............",
  ".knnnk.......kok..kok...........",
  ".............kok..kok...........",
  "....kkkkkkkoooookoooookkkkkkk...",
  "...kvvvvvvvvvvvvkvvvvvkvvvvvvk..",
  "....kkkkkkkkkkkkkkkkkkkkkkkkk...",
];

// The near wing thrown straight up behind the head, primaries spread.
const CHEER = [
  ".kk.kk..........................",
  "kddkddk....kkkkkkk..............",
  "kddddddk.kknnnnnnnkk............",
  "kdBdBdBkknnnnnnnbbbbk...........",
  "knBbBbBknnnnnbbbbbbbbk..........",
  "knbbbbbknnnbbbbbbbbbbbk.........",
  "knbbbbbknnbbbbbbbbbbkkkk........",
  "knbbbbbknbbbbddddddboollk.......",
  ".knbbbbkbbbbbbewkeccoohhhk......",
  ".knbbbbkbbbbbcekkecckkkhhHk.....",
  ".knbbbbkbbbbccceeccchhkkHHk.....",
  "..knbbbbkbbbcmmccccckk..kHk.....",
  "..knbbbbbRqqqrrrrrrrRk...k......",
  "...knbbbbRrrrrrrrrrrrRk.........",
  "....knbbbbbBcccRrrrrRcCk........",
  ".....knbbbbBccccRrrRccCk........",
  "....knbbbbBccccccRRccccCk.......",
  "....kbbbbBcccccccccccccCk.......",
  "....kbbbBcccccbccbccbccCk.......",
  "....kbbBccccccbccbccbccCk.......",
  "....kbBccccccbccbccbccCk........",
  "....kBcccccccbccbccbcCCk........",
  "...ktkCcccccccccccbccCCk........",
  "..kttTkCCcccccccccccCk..........",
  ".kttTtkkCCCCCccccCCCk...........",
  "kttTttkkCCCCCCCCCCkk............",
  "kTTTTTk.kkkkkkkkkk..............",
  ".knnnk.......kok..kok...........",
  ".............kok..kok...........",
  "....kkkkkkkoooookoooookkkkkkk...",
  "...kvvvvvvvvvvvvkvvvvvkvvvvvvk..",
  "....kkkkkkkkkkkkkkkkkkkkkkkkk...",
];

// Flying, talons tucked: the same head on a body held level, tail fanned
// behind. Wing up (body a pixel low), level-ish, and down (body a pixel high).
const FLY_UP = [
  "................................",
  "....k.k.k.k.....................",
  "...kdkdkdkdk....................",
  "...kddddddddk...................",
  "...kdBdBdBdBk...................",
  "....kBbBbBbBbk..................",
  "....kbbbbbbbbk..................",
  ".....kbbbbbbbbk.kkkkkkk.........",
  ".....kbbbbbbbbkknnnnnnnkk.......",
  "......knbbbbbknnnnnnnbbbbk......",
  "......knbbbbknnnnnbbbbbbbbk.....",
  ".......knbbbknnnbbbbbbbbbbbk....",
  ".......knnbbknnbbbbbbbbbbkkkk...",
  "......kkknnnknbbbbddddddboollk..",
  ".....knnbbbbkbbbbbbewkeccoohhhk.",
  "....knbbbbbbkbbbbbcekkecckkkhhHk",
  "kk.kbbbbbbbbkbbbbccceeccchhkkHHk",
  "knkkbbbbbbbbbkbbbcmmccccckk..kHk",
  "knTtbbbbbbbbkRqqqrrrrrrRk.....k.",
  "knTttBbbbbbbkRrrrrrrrrrRk.......",
  "knTtkBBbbbbbbbkRrrrrRkccck......",
  "knkk.kBBbbbbbbbkRrRkccbcCk......",
  "kk....kBBBbbbbbckkbccbCk........",
  ".......kkBBBCCCCcccCCk..........",
  ".........kkkkkkkkokkokk.........",
  "..............kook.kook.........",
  "...............kk...kk..........",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
];

const FLY_MID = [
  "................................",
  "................................",
  "................................",
  "..kkk...........................",
  ".kdddkk.........................",
  "kddBddBk........................",
  "kdBbBbBbk.......kkkkkkk.........",
  "kdBbbbbbbk....kknnnnnnnkk.......",
  ".kBbbbbbbbk..knnnnnnnbbbbk......",
  "..kbbbbbbbbkknnnnnbbbbbbbbk.....",
  "...kbbbbbbbbknnnbbbbbbbbbbbk....",
  "....knbbbbbbknnbbbbbbbbbbkkkk...",
  ".....knnbbbbknbbbbddddddboollk..",
  ".....kknnnbbkbbbbbbewkeccoohhhk.",
  "....knbbbbbbkbbbbbcekkecckkkhhHk",
  "kk.kbbbbbbbbkbbbbccceeccchhkkHHk",
  "knkkbbbbbbbbbkbbbcmmccccckk..kHk",
  "knTtbbbbbbbbkRqqqrrrrrrRk.....k.",
  "knTttBbbbbbbkRrrrrrrrrrRk.......",
  "knTtkBBbbbbbbbkRrrrrRkccck......",
  "knkk.kBBbbbbbbbkRrRkccbcCk......",
  "kk....kBBBbbbbbckkbccbCk........",
  ".......kkBBBCCCCcccCCk..........",
  ".........kkkkkkkkokkokk.........",
  "..............kook.kook.........",
  "...............kk...kk..........",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
];

const FLY_DOWN = [
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................kkkkkkk.........",
  "..............kknnnnnnnkk.......",
  ".............knnnnnnnbbbbk......",
  "............knnnnnbbbbbbbbk.....",
  "............knnnbbbbbbbbbbbk....",
  "........kkkkknnbbbbbbbbbbkkkk...",
  "......kknnnnknbbbbddddddboollk..",
  ".....knnbbbbkbbbbbbewkeccoohhhk.",
  "....knbbbbbbkbbbbbcekkecckkkhhHk",
  "kk.kbbbbbbbbkbbbbccceeccchhkkHHk",
  "knkkbbbbbbbbbkbbbcmmccccckk..kHk",
  "knTtbbbbbbknnnnnkrrrrrrRk.....k.",
  "knTttBbbbknbbbbbbkrrrrrRk.......",
  "knTtkBBbknbbbbbbbkrrRkccck......",
  "knkk.kBBkbbbbbbbkrRkccbcCk......",
  "kk....kkbbbbbbbbkkbccbCk........",
  ".......kbbBbbbbkcccCCk..........",
  "......kbBbBbbbkkkokkokk.........",
  "......kBbBbbbkkook.kook.........",
  ".....kdBdBbbk..kk...kk..........",
  ".....kddBdBk....................",
  "....kdddddk.....................",
  "....kdkdkdk.....................",
  "....k.k.k.k.....................",
  "................................",
  "................................",
  "................................",
];

// ─── Overlays ─────────────────────────────────────────────────────────────────
// { x, y, rows }: drawn over a frame with its top-left corner at (x, y). A
// space leaves the pixel underneath; any other character replaces it.

const BLINK      = { x: 14, y: 8, rows: ["cccc", "kkkk", "cccc"] };
const LOOK_UP    = { x: 14, y: 8, rows: ["eewk", "eekk"] };
// Shut eyes soften the brow too, so a sleeping or cheering hawk never looks stern.
const EYES_SHUT  = { x: 13, y: 7, rows: ["BBBBBB", " cccc", " kcck", " ckkc"] };
const EYES_HAPPY = { x: 13, y: 7, rows: ["BBBBBB", " cccc", " ckkc", " kcck"] };

// A find: a card with a gold star, its top edge caught on the tip of the hook.
const CARD = { x: 23, y: 12, rows: [
  "kkHkkkkkk",
  "kwkwwwwwk",
  "kwwwowwwk",
  "kwwooowwk",
  "kwooooOwk",
  "kwwooOwwk",
  "kwwowOwwk",
  "kwwwwwwwk",
  "kwppppwwk",
  "kkkkkkkkk",
] };

// A leaf on the twig. Stamped last, so it stays put while the hawk breathes.
const LEAF = { x: 25, y: 26, rows: ["   kk", "  kggk", " kgGk", " Gk"] };

const question = (y) => ({ x: 24, y, rows: [
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
      if (ch !== " " && rows[y + dy] && x + dx < rows[y + dy].length) rows[y + dy][x + dx] = ch;
    }));
  }
  return rows.map((r) => r.join(""));
}

// A breath: everything above the legs drops a pixel and the legs get a pixel
// shorter (row 28, legs only, goes), so the talons keep their grip on the twig.
const bob = (rows) => [".".repeat(rows[0].length), ...rows.slice(0, 28), ...rows.slice(29)];
// A cock of the head: the crown leans back a pixel, as if looking up at the "?".
const tilt = (rows) => rows.map((r, y) => (y >= 1 && y <= 5 ? `${r.slice(1)}.` : r));
// Every perched frame gets the leaf last.
const perch = (rows, ...marks) => stamp(rows, LEAF, ...marks);

const HOLD = stamp(PERCHED, CARD);
const LOOKING = stamp(tilt(PERCHED), LOOK_UP);
const DOZING = stamp(PERCHED, EYES_SHUT);
const HAPPY = stamp(CHEER, EYES_HAPPY);

// Each state: frames, frames per second, and optionally `sequence`, the order
// frames play in (a blink held once every few seconds rather than every other
// beat). The state names match Beaker's, so any screen can ask either agent
// for the same states.
export const TALON = {
  width: 32,
  height: 32,
  palette: PALETTE,
  states: {
    idle: {
      fps: 4,
      frames: [perch(PERCHED), perch(bob(PERCHED)), perch(PERCHED, BLINK)],
      sequence: [0, 0, 1, 1, 0, 0, 1, 1, 0, 2, 1, 1],
    },
    flying: {
      fps: 8,
      frames: [FLY_UP, FLY_MID, FLY_DOWN],
      sequence: [0, 1, 2, 1],
    },
    thinking: {
      fps: 3,
      frames: [perch(LOOKING, question(0)), perch(bob(LOOKING), question(0))],
    },
    delivering: {
      fps: 3,
      frames: [perch(HOLD, sparkle(28, 23)), perch(bob(HOLD), sparkle(24, 25), sparkle(29, 24))],
    },
    celebrating: {
      fps: 4,
      frames: [
        perch(HAPPY, bigSparkle(24, 0), sparkle(27, 15)),
        perch(bob(HAPPY), sparkle(25, 2), bigSparkle(26, 14)),
      ],
    },
    sleeping: {
      fps: 1.5,
      frames: [perch(DOZING, smallZ(23, 2)), perch(bob(DOZING), smallZ(23, 2), bigZ(27, 0))],
    },
  },
};

export default TALON;
