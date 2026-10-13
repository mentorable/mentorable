// Quill, the essay owl: a reader who asks more than it tells. A round,
// head-heavy owl seen from the front (an owl turns its head, so it looks at
// you while Beaker and Talon face right), with ear tufts, a pale facial disc,
// big amber eyes with a glint, and a blue quill pen tucked behind one ear: the
// blue that ties it to Beaker's postal cap and Talon's ranger hat, so the
// three read as a set without wearing the same uniform. Dusk-grey feathers, a
// cream face and belly. A 32 by 32 grid, one character per pixel ("." is
// empty), in the same format as Beaker's and Talon's (sprites/beaker.js,
// sprites/talon.js) and with its own palette: the mascot keeps its colors
// whatever accent the student picked.
//
// Light comes from the top left: highlights (the crown, the left ear, the top
// of the left wing, the quill's upper edge) sit top left of each form, shade
// (the right side of the head and of the disc, under the chin, the right
// wing's outer edge, the bottom of the belly) bottom right. One dark outline
// all round; inner edges use the darker tone of what they separate.
//
// The poses (standing, both wings up, holding a page, three wingbeats) are
// drawn in full; every other frame is a pose plus a small overlay (eyes, a
// "?", z's, sparkles) or a one-pixel breath. The quill never leaves the ear in
// any of them: Quill reads and asks, and does not write.

const PALETTE = {
  ".": null,
  k: "#2b2433",   // outline, pupils
  w: "#ffffff",   // eye glint, the quill's shaft, the page
  n: "#b8b1c9",   // feather highlight
  b: "#8e87a6",   // feathers
  B: "#6a6383",   // feather shade, wing scallops
  d: "#48425a",   // ear tuft tips, flight feather tips
  c: "#fbf3e2",   // facial disc and belly
  C: "#e7dac2",   // cream shade, belly flecks
  y: "#f9bf3a",   // iris
  o: "#f29a2e",   // beak, legs and toes, the top of the iris (in the brow's shade)
  O: "#c8701c",   // beak and leg shade
  m: "#f5a3a3",   // cheek
  g: "#3a6fd0",   // the quill's plume, the thinking "?"
  j: "#7daaf2",   // plume shine
  h: "#ffd779",   // the gleam low in the iris, sparkles, the highlighted line on the page
  p: "#c5c1d3",   // the page's lines of text
  z: "#7c86ad",   // sleepy z's
};

// Standing, wings folded. Rows 28 to 30 are the legs and toes and row 31 their
// outline, so Quill stands on the bottom row like Beaker and Talon (a breath
// drops row 29; see `bob`).
const STAND = [
  "kkk.............................",
  "kjgk.kk..................kk.....",
  "kgjgkkdk................kdk.....",
  "kggjgkdnk..kkkkkkkkkk..kbdk.....",
  ".kggwknbbkknnnbbnbbnbkkbbBk.....",
  "..kkwknbbcccccbbbbcccccbbBk.....",
  "....kknccckkkccbbcckkkcccBk.....",
  ".....kbcckoookcccckoookcCBk.....",
  ".....kbckywkkykcckywkkykCBk.....",
  ".....kbckykkkykcckykkkykCBk.....",
  ".....kbckykkkhkcckykkkhkCBk.....",
  ".....kbcckyhhkoooOkyhhkcCBk.....",
  ".....kbbcckkkccoOcckkkccbBk.....",
  ".....kbbcmmccccccccccmmcbBk.....",
  "......kbbCccccccccccccCbBk......",
  ".......kbBCCCCCCCCCCCCBBk.......",
  ".......knnbBBBBBBBBBBbbBk.......",
  "......knnbbBccccccccBbbbBk......",
  ".....knbbbbBcCcCccccBbbbbBk.....",
  ".....knbbbbBccCccCcCBbbbbBk.....",
  ".....kbBbBbBccccccCcBbBbBBk.....",
  ".....kbbbbBccCcCcccccBbbbBk.....",
  ".....kbBbBBcccCccCcCcBBbBBk.....",
  ".....kbbbBccccccccCcccBbbBk.....",
  "......kdbBccccccccccccBbdk......",
  ".......kdBccccccccccccBdk.......",
  "........kdCccccccccccCdk........",
  ".........kCCCCCCCCCCCCk.........",
  "..........kkokkkkkkokk..........",
  "...........kOk....kOk...........",
  "..........koook..koook..........",
  "..........kkkkk..kkkkk..........",
];

// Both wings thrown up beside the head, the belly showing.
const CHEER = [
  "kkk.............................",
  "kjgk.kk..................kk.....",
  "kgjgkkdk................kdk.....",
  "kggjgkdnk..kkkkkkkkkk..kbdk.....",
  ".kggwknbbkknnnbbnbbnbkkbbBk.....",
  "..kkwknbbcccccbbbbcccccbbBk.....",
  "....kknccckkkccbbcckkkcccBk.....",
  ".kk..kbcckoookcccckoookcCBk..kk.",
  "kddkkkbckywkkykcckywkkykCBkkkddk",
  "kdbddkbckykkkykcckykkkykCBkddbdk",
  "knbdbkbckykkkhkcckykkkhkCBkbdbBk",
  "knbbbkbcckyhhkoooOkyhhkcCBkbbbBk",
  "knbbBkbbcckkkccoOcckkkccbBkBbbBk",
  "kbbbBkbbcmmccccccccccmmcbBkBbbbk",
  ".kbbbBkbbCccccccccccccCbBkBbbbk.",
  "..kbbbBkbBCCCCCCCCCCCCBBkBbbbk..",
  "...kkbbbbbBBBBBBBBBBBBbBbbbkk...",
  ".....kkkbBccccccccccccBBkkk.....",
  "......kbBccccCcCcccccccBBk......",
  "......kbBcccccCccCcCcccBBk......",
  "......kbBcccccccccCccccBBk......",
  "......kbBccccCcCcccccccBBk......",
  "......kbBcccccCccCcCcccBBk......",
  ".......kbBccccccccCcccBBk.......",
  ".......kbBccccccccccccBBk.......",
  "........kBccccccccccccBk........",
  "........kBCccccccccccCBk........",
  ".........kCCCCCCCCCCCCk.........",
  "..........kkokkkkkkokk..........",
  "...........kOk....kOk...........",
  "..........koook..koook..........",
  "..........kkkkk..kkkkk..........",
];

// A page held up against the chest, a wing tip on each edge: lines of text,
// one of them highlighted, the way a review marks a passage.
const HOLD = [
  "kkk.............................",
  "kjgk.kk..................kk.....",
  "kgjgkkdk................kdk.....",
  "kggjgkdnk..kkkkkkkkkk..kbdk.....",
  ".kggwknbbkknnnbbnbbnbkkbbBk.....",
  "..kkwknbbcccccbbbbcccccbbBk.....",
  "....kknccckkkccbbcckkkcccBk.....",
  ".....kbcckoookcccckoookcCBk.....",
  ".....kbckywkkykcckywkkykCBk.....",
  ".....kbckykkkykcckykkkykCBk.....",
  ".....kbckykkkhkcckykkkhkCBk.....",
  ".....kbcckyhhkoooOkyhhkcCBk.....",
  ".....kbbcckkkccoOcckkkccbBk.....",
  ".....kbbcmmccccccccccmmcbBk.....",
  "......kbbCccccccccccccCbBk......",
  ".......kbBCCCCCCCCCCCCBBk.......",
  ".......knnbBBBBBBBBBBbbBk.......",
  "......knnbkkkkkkkkkkBbbbBk......",
  ".....knbbbkwwwwwwwwpkbbbbBk.....",
  ".....knbbbkwppppwwwppkbbbBk.....",
  ".....kbBbBbwwwwwwwwwwbBbBBk.....",
  ".....kbbbbbdppppppppdbbbbBk.....",
  ".....kbBbBbddhhhhppddbBbBBk.....",
  ".....kbbbBbdppppppppdbBbbBk.....",
  "......kdbBkwpppppwwwwkBbdk......",
  ".......kdBkwwwwwwwwwwkBdk.......",
  "........kdkkkkkkkkkkkkdk........",
  ".........kCCCCCCCCCCCCk.........",
  "..........kkokkkkkkokk..........",
  "...........kOk....kOk...........",
  "..........koook..koook..........",
  "..........kkkkk..kkkkk..........",
];

// Flying, talons tucked, seen from the front. Wings high (body two pixels low;
// the left wing passes in front of the quill), level (a pixel low), and down
// (body at its highest).
const FLY_UP = [
  "................................",
  "................................",
  ".kk..........................kk.",
  "kddk.kk..................kk.kddk",
  "kdbdkkdk................kdkkdbdk",
  "kdbbdkdnk..kkkkkkkkkk..kbdkdbbdk",
  "knbbbknbbkknnnbbnbbnbkkbbBkbbbBk",
  "knbbbknbbcccccbbbbcccccbbBkbbbBk",
  "knbBbknccckkkccbbcckkkcccBkbBbBk",
  "knbbbkbcckoookcccckoookcCBkbbbBk",
  "knbbBkbckywkkykcckywkkykCBkBbbBk",
  "knbbbkbckykkkykcckykkkykCBkbbbBk",
  "kbbBbkbckykkkhkcckykkkhkCBkbBbbk",
  "kbbbBkbcckyhhkoooOkyhhkcCBkBbbbk",
  "kbbbBkbbcckkkccoOcckkkccbBkBbbbk",
  "kbbbBkbbcmmccccccccccmmcbBkBbbbk",
  ".kbbbBkbbCccccccccccccCbBkBbbbk.",
  "..kbbbBkbBCCCCCCCCCCCCBBkBbbbk..",
  "...kkbbbbbBBBBBBBBBBBBbBbbbkk...",
  ".....kkkbBccccccccccccBBkkk.....",
  "......kbBccccCcCcccccccBBk......",
  "......kbBcccccCccCcCcccBBk......",
  "......kbBcccccccccCccccBBk......",
  "......kbBccccCcCcccccccBBk......",
  "......kbBcccccCccCcCcccBBk......",
  ".......kbBccccccccCcccBBk.......",
  ".......kbBccccccccccccBBk.......",
  "........kBccccccccccccBk........",
  "........kBCccccccccccCBk........",
  ".........kCCCCCCCCCCCCk.........",
  "..........kkoookkoookk..........",
  "............kkk..kkk............",
];

const FLY_MID = [
  "................................",
  "kkk.............................",
  "kjgk.kk..................kk.....",
  "kgjgkkdk................kdk.....",
  "kggjgkdnk..kkkkkkkkkk..kbdk.....",
  ".kggwknbbkknnnbbnbbnbkkbbBk.....",
  "..kkwknbbcccccbbbbcccccbbBk.....",
  "....kknccckkkccbbcckkkcccBk.....",
  ".....kbcckoookcccckoookcCBk.....",
  ".....kbckywkkykcckywkkykCBk.....",
  ".....kbckykkkykcckykkkykCBk.....",
  ".....kbckykkkhkcckykkkhkCBk.....",
  ".....kbcckyhhkoooOkyhhkcCBk.....",
  "..kkkkbbcckkkccoOcckkkccbBkkkk..",
  ".knnnkbbcmmccccccccccmmcbBkBBBk.",
  "knnbbbkbbCccccccccccccCbBkbbbBBk",
  "knbbbbbkbBCCCCCCCCCCCCBBkbbbbbBk",
  "kbbbbbbbbbBBBBBBBBBBBBbBbbbbbbbk",
  "kbBbBbbbbBccccccccccccBBbbbBbBbk",
  "kdbdbdkbBccccCcCcccccccBBkdbdbdk",
  ".kdkdkkbBcccccCccCcCcccBBkkdkdk.",
  "..k.k.kbBcccccccccCccccBBk.k.k..",
  "......kbBccccCcCcccccccBBk......",
  "......kbBcccccCccCcCcccBBk......",
  ".......kbBccccccccCcccBBk.......",
  ".......kbBccccccccccccBBk.......",
  "........kBccccccccccccBk........",
  "........kBCccccccccccCBk........",
  ".........kCCCCCCCCCCCCk.........",
  "..........kkoookkoookk..........",
  "............kkk..kkk............",
  "................................",
];

const FLY_DOWN = [
  "kkk.............................",
  "kjgk.kk..................kk.....",
  "kgjgkkdk................kdk.....",
  "kggjgkdnk..kkkkkkkkkk..kbdk.....",
  ".kggwknbbkknnnbbnbbnbkkbbBk.....",
  "..kkwknbbcccccbbbbcccccbbBk.....",
  "....kknccckkkccbbcckkkcccBk.....",
  ".....kbcckoookcccckoookcCBk.....",
  ".....kbckywkkykcckywkkykCBk.....",
  ".....kbckykkkykcckykkkykCBk.....",
  ".....kbckykkkhkcckykkkhkCBk.....",
  ".....kbcckyhhkoooOkyhhkcCBk.....",
  ".....kbbcckkkccoOcckkkccbBk.....",
  ".....kbbcmmccccccccccmmcbBk.....",
  "......kbbCccccccccccccCbBk......",
  ".......kbBCCCCCCCCCCCCBBk.......",
  "....kkkkbbBBBBBBBBBBBBbBkkkk....",
  "...knnbbbBccccccccccccBBbbBBk...",
  "..knbbbbBccccCcCcccccccBBbbbBk..",
  ".knbbbkbBcccccCccCcCcccBBkbbbBk.",
  ".kbbBbkbBcccccccccCccccBBkbBbbk.",
  "knbBbbkbBccccCcCcccccccBBkbbBbBk",
  "kbbbBbkbBcccccCccCcCcccBBkbBbbbk",
  "kdbBbbkkbBccccccccCcccBBkkbbBbdk",
  "kdbdbBkkbBccccccccccccBBkkBbdbdk",
  "kdkdbdk.kBccccccccccccBk.kdbdkdk",
  ".k.kdk..kBCccccccccccCBk..kdk.k.",
  "....k....kCCCCCCCCCCCCk....k....",
  "..........kkoookkoookk..........",
  "............kkk..kkk............",
  "................................",
  "................................",
];

// ─── Overlays ─────────────────────────────────────────────────────────────────
// { x, y, rows }: drawn over a frame with its top-left corner at (x, y). A
// space leaves the pixel underneath; any other character replaces it.

// Each eye is a 7 by 7 ring, the left one's corner at (8, 6) and the right
// one's at (17, 6), so one drawing serves both.
const eyes = (rows) => [{ x: 8, y: 6, rows }, { x: 17, y: 6, rows }];

// Closed: the lower half of the ring stays as the lash line, over a lid.
const EYES_SHUT = eyes(["  CCC  ", " CCCCC ", "CCCCCCC", "CCCCCCC", "kCCCCCk", " kCCCk ", "  kkk  "]);
// Glad: the upper half stays instead, an arch.
const EYES_HAPPY = eyes(["  kkk  ", " kCCCk ", "kCCCCCk", "CCCCCCC", "CCCCCCC", " CCCCC ", "  CCC  "]);
const LOOK_UP = eyes(["", "  wkk  ", " ykkky ", " ykkky ", " yyyyh "]);
const LOOK_RIGHT = eyes(["", "", " yywkk ", " yykkk ", " yykkk "]);

// Four pixels wide, a column narrower than Beaker's and Talon's: the head
// leaves five columns free beside it, and the mark keeps one clear of the ear.
const question = (x, y) => ({ x, y, rows: [
  " gg ",
  "g  g",
  "   g",
  "  g ",
  " g  ",
  "    ",
  " g  ",
] });
const smallZ = (x, y) => ({ x, y, rows: ["zzzz", "  z ", " z  ", "zzzz"] });
const bigZ = (x, y) => ({ x, y, rows: ["zzzzz", "   z ", "  z  ", " z   ", "zzzzz"] });
const sparkle = (x, y) => ({ x, y, rows: [" h ", "hwh", " h "] });
const bigSparkle = (x, y) => ({ x, y, rows: ["  h  ", "  h  ", "hhwhh", "  h  ", "  h  "] });

function stamp(base, ...marks) {
  const rows = base.map((r) => r.split(""));
  for (const { x, y, rows: art } of marks.flat()) {
    art.forEach((line, dy) => [...line].forEach((ch, dx) => {
      if (ch !== " " && rows[y + dy] && x + dx >= 0 && x + dx < rows[y + dy].length) rows[y + dy][x + dx] = ch;
    }));
  }
  return rows.map((r) => r.join(""));
}

// A breath: everything above the legs drops a pixel and the legs get a pixel
// shorter (row 29, legs only, goes), so the toes stay planted.
const bob = (rows) => [".".repeat(rows[0].length), ...rows.slice(0, 29), ...rows.slice(30)];

const BLINKING = stamp(STAND, EYES_SHUT);
const GLANCING = stamp(STAND, LOOK_RIGHT);
const LOOKING = stamp(STAND, LOOK_UP);
const GLAD = stamp(CHEER, EYES_HAPPY);

// Each state: frames, frames per second, and optionally `sequence`, the order
// frames play in. The state names match Beaker's and Talon's, so any screen
// can ask any agent for the same states.
export const QUILL = {
  width: 32,
  height: 32,
  palette: PALETTE,
  // The art row a speech bubble's tail points at (MascotSays, through
  // mascotFit): the beak, in the middle of the face, a row below Beaker's bill.
  beakRow: 11,
  states: {
    // Six seconds: a slow blink (held for two beats, as owls do) a third of
    // the way in, and a glance to the side near the end.
    idle: {
      fps: 4,
      frames: [STAND, bob(STAND), BLINKING, GLANCING, bob(GLANCING)],
      sequence: [0, 0, 1, 1, 0, 0, 1, 1, 2, 2, 1, 1, 0, 0, 1, 1, 3, 3, 4, 4, 0, 0, 1, 1],
    },
    flying: {
      fps: 8,
      frames: [FLY_UP, FLY_MID, FLY_DOWN],
      sequence: [0, 1, 2, 1],
    },
    thinking: {
      fps: 3,
      frames: [stamp(LOOKING, question(28, 0)), stamp(bob(LOOKING), question(28, 0))],
    },
    delivering: {
      fps: 3,
      frames: [stamp(HOLD, sparkle(28, 17)), stamp(bob(HOLD), sparkle(1, 21), sparkle(28, 23))],
    },
    celebrating: {
      fps: 4,
      frames: [
        stamp(GLAD, sparkle(28, 1), bigSparkle(0, 21)),
        stamp(bob(GLAD), bigSparkle(27, 21), sparkle(1, 23)),
      ],
    },
    sleeping: {
      fps: 1.5,
      frames: [stamp(BLINKING, smallZ(28, 6)), stamp(bob(BLINKING), smallZ(28, 6), bigZ(27, 0))],
    },
  },
};

export default QUILL;
