// Beaker, the outreach pelican: a postal carrier whose throat pouch is the
// mail bag. A white pelican with a blue postal cap and an orange pouch holding
// a letter, drawn so every state reads at 1x (the "Classic postie" direction,
// picked from three). A 32 by 32 grid, one character per pixel ("." is empty),
// with its own palette: the mascot keeps its colors whatever accent the
// student picked, like the Quest flame.
//
// Light comes from the top left: highlights (cap shine, bill shine, pouch
// shine) sit top left of each form, shade (under the cap, the pouch's seam and
// bottom, the belly, the wing's lower half) bottom right. One dark outline all
// round; inner edges use the darker tone of what they separate.
//
// The four poses (standing, cheering, holding the letter, flying) are drawn in
// full. Every other frame is a pose plus a small overlay (eyes, a "?",
// sleepy z's, sparkles) or a one-pixel shift, so frames differ only where
// they must and the animation stays smooth.

const PALETTE = {
  ".": null,
  k: "#2b2336",   // outline, eye
  w: "#ffffff",   // eye glint, letter paper
  f: "#efe9df",   // feathers
  s: "#d3c9b9",   // feather shade
  g: "#a89f95",   // feather edge (the wing's outline, tail)
  d: "#5d5668",   // flight feathers
  o: "#f6a93b",   // bill, feet
  O: "#d97c1f",   // bill and leg shade
  y: "#ffd779",   // bill shine, cap badge, sparkles
  p: "#f39562",   // pouch
  P: "#cf6a3f",   // pouch shade
  q: "#ffbf93",   // pouch shine
  b: "#3a6ad1",   // postal cap
  B: "#243f8f",   // cap band and brim, the thinking "?"
  c: "#72a0f2",   // cap shine
  E: "#aab5d0",   // envelope flap and address line
  r: "#e24b4b",   // wax seal
  m: "#f5a3a3",   // cheek
  z: "#7c86ad",   // sleepy z's
};

// Standing, wing folded, a letter peeking out of the pouch.
const STAND = [
  "................................",
  ".........kkkkk..................",
  "........kbccbbk.................",
  ".......kbccbbyBk................",
  "......kbcbbbbyBBkkkk............",
  "......kBBBBBBBBBBBBBk...........",
  "......kssssssssskkkk............",
  ".....kfffffffffffk..............",
  "....kfffffffwkfffkkkkkkkkkk.....",
  "....kfffffffkkffoyyyyyyyyookk...",
  "....kfffffffkkffoooooooooooook..",
  "....kffffffmmfffOOOOOOOOOOOOOOk.",
  ".....kfffffffffPpppppppppppppOk.",
  "......kffffffffPqqqpppppkkkkkkk.",
  "......kffffffffPqqppppppPEwwwEk.",
  ".....kfffffffffPppppppppPwEwEwk.",
  "....kffffffffffPppppppppPwwrwwk.",
  "...kffffffffffffPpppppppkkkkkkk.",
  "..kffffffffffffffPpppppPk.......",
  "..kfffgggggggffffsPPPPPk........",
  ".kffggfffffffgffssssssk.........",
  ".kfgffffffffffgfffffffk.........",
  ".kgssfffffffffgfffffffk.........",
  "kdddgsssssssssgfffffffk.........",
  "kdddddsssssssgfffffffsk.........",
  ".kdddddggggggffffffssk..........",
  "..kdddksssssssssssssk...........",
  "...kkkkkkkkkkkkkkkkk............",
  ".......kOOk..kOOk...............",
  ".......kOOkk.kOOkk..............",
  ".......kOoookkOoook.............",
  ".......kkkkkkkkkkkk.............",
];

// Wing thrown up behind the head (row 0 left empty so the hop has room).
const CHEER = [
  "................................",
  ".kk.kk...kkkkk..................",
  "kddkddk.kbccbbk.................",
  "kddddddkbccbbyBk................",
  "kdddffkbcbbbbyBBkkkk............",
  "kddfffkBBBBBBBBBBBBBk...........",
  "kdffffkssssssssskkkk............",
  "kdfffkfffffffffffk..............",
  "kdffkfffffffwkfffkkkkkkkkkk.....",
  "kdffkfffffffkkffoyyyyyyyyookk...",
  "kdffkfffffffkkffoooooooooooook..",
  "kdffkffffffmmfffOOOOOOOOOOOOOOk.",
  "kdfffkfffffffffPpppppppppppppOk.",
  "kdffffkffffffffPqqqpppppkkkkkkk.",
  "kdfffffkfffffffPqqppppppPEwwwEk.",
  "kdffffffkffffffPppppppppPwEwEwk.",
  ".ksffffffkfffffPppppppppPwwrwwk.",
  "..ksfffffkffffffPpppppppkkkkkkk.",
  "..kssffffkfffffffPpppppPk.......",
  "..kkkkkkkffffffffsPPPPPk........",
  ".kffffffffffffffssssssk.........",
  ".kffffffffffffffffffffk.........",
  ".kffffffffffffffffffffk.........",
  "kggfffffffffffffffffffk.........",
  "kgsssffffffffffffffffsk.........",
  ".ksssffffffffffffffssk..........",
  "..ksssssssssssssssssk...........",
  "...kkkkkkkkkkkkkkkkk............",
  ".......kOOk..kOOk...............",
  ".......kOOkk.kOOkk..............",
  ".......kOoookkOoook.............",
  ".......kkkkkkkkkkkk.............",
];

// The letter out of the pouch, held up by the tip of the bill.
const HOLD = [
  "................................",
  ".........kkkkk..................",
  "........kbccbbk.................",
  ".......kbccbbyBk................",
  "......kbcbbbbyBBkkkk............",
  "......kBBBBBBBBBBBBBk...........",
  "......kssssssssskkkk............",
  ".....kfffffffffffk..............",
  "....kfffffffwkfffkkkkkkkkkk.....",
  "....kfffffffkkffoyyyyyyyyookk...",
  "....kfffffffkkffoooooooooooook..",
  "....kffffffmmfffOOOOOOOOOOOOOOk.",
  ".....kfffffffffPpppppppppppppOk.",
  "......kffffffffPqqqpppppkkkkkOkk",
  "......kffffffffPqqppppppkEwwwwEk",
  ".....kfffffffffPppppppppkwEwwEwk",
  "....kffffffffffPppppppppkwwrrwwk",
  "...kffffffffffffPppppppPkwwwwwwk",
  "..kffffffffffffffPpppppPkwEEEwwk",
  "..kfffgggggggffffsPPPPPkkkkkkkkk",
  ".kffggfffffffgffssssssk.........",
  ".kfgffffffffffgfffffffk.........",
  ".kgssfffffffffgfffffffk.........",
  "kdddgsssssssssgfffffffk.........",
  "kdddddsssssssgfffffffsk.........",
  ".kdddddggggggffffffssk..........",
  "..kdddksssssssssssssk...........",
  "...kkkkkkkkkkkkkkkkk............",
  ".......kOOk..kOOk...............",
  ".......kOOkk.kOOkk..............",
  ".......kOoookkOoook.............",
  ".......kkkkkkkkkkkk.............",
];

// Flying, letter tucked in: the same head on a round body held level.
// Wing up (body a pixel low), level-ish, and down (body a pixel high).
const FLY_UP = [
  "................................",
  "..kk.kk.........................",
  ".kddkddk........................",
  "kdddddddk.....kkkkk.............",
  "kdddddddk....kbccbbk............",
  "kddddfffk...kbccbbyBk...........",
  ".kdddfffk..kbcbbbbyBBkkkk.......",
  ".kdddfffk..kBBBBBBBBBBBBBk......",
  "..kddfffk..kssssssssskkkk.......",
  "..kddfffk.kfffffffffffk.........",
  "...kddfffkfffffffwkfffkkkkkk....",
  "...kddffffkffffffkkffoyyyyookk..",
  "....kddffffkfffffkkffoooooooook.",
  "....kddffffkffffmmfffOOOOOOOOOOk",
  "...kfkddfffkffffffffPpppppppppOk",
  "..kfffkdfffkffffffffPqqqpkkkkkkk",
  ".kfffffkkkkfffffffffPqqppPEwwwEk",
  "kgffffffffffffffffffPppppPwEwEwk",
  "kgffffffffffffffffffPppppPwwrwwk",
  ".kfffffffffffffffffffPppPkkkkkkk",
  ".kfffffffffffffffffffsPPPk......",
  ".kkfffffffffffffffffssssk.......",
  "kOkffffffffffffffffssssk........",
  "kookffffffffffffffssssk.........",
  ".kk.kssffffffffffssssk..........",
  ".....kksssssssssssskk...........",
  ".......kkkkkkkkkkkk.............",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
];

const FLY_MID = [
  "................................",
  "................................",
  "..............kkkkk.............",
  ".............kbccbbk............",
  "..kkk.......kbccbbyBk...........",
  ".kdddk.....kbcbbbbyBBkkkk.......",
  "kddddfk....kBBBBBBBBBBBBBk......",
  "kddddffk...kssssssssskkkk.......",
  "kddddfffk.kfffffffffffk.........",
  "kddddfffkkfffffffwkfffkkkkkk....",
  ".kdddfffffkffffffkkffoyyyyookk..",
  "..kdddffffkffffffkkffoooooooook.",
  "...kdddffffkffffmmfffOOOOOOOOOOk",
  "...kkdddfffkffffffffPpppppppppOk",
  "..kffkdddffkffffffffPqqqpkkkkkkk",
  ".kffffkddddkffffffffPqqppPEwwwEk",
  "kgfffffkkkkfffffffffPppppPwEwEwk",
  "kgffffffffffffffffffPppppPwwrwwk",
  ".kfffffffffffffffffffPppPkkkkkkk",
  ".kfffffffffffffffffffsPPPk......",
  ".kkfffffffffffffffffssssk.......",
  "kOkffffffffffffffffssssk........",
  "kookffffffffffffffssssk.........",
  ".kk.kssffffffffffssssk..........",
  ".....kksssssssssssskk...........",
  ".......kkkkkkkkkkkk.............",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
];

const FLY_DOWN = [
  "................................",
  "..............kkkkk.............",
  ".............kbccbbk............",
  "............kbccbbyBk...........",
  "...........kbcbbbbyBBkkkk.......",
  "...........kBBBBBBBBBBBBBk......",
  "...........kssssssssskkkk.......",
  "..........kfffffffffffk.........",
  ".........kfffffffwkfffkkkkkk....",
  ".......kkffffffffkkffoyyyyookk..",
  ".....kkffffffffffkkffoooooooook.",
  "....kfffffffffffmmfffOOOOOOOOOOk",
  "...kffffffffffffffffPpppppppppOk",
  "..kfffffkkkkffffffffPqqqpkkkkkkk",
  ".kfffffkffffkkffffffPqqppPEwwwEk",
  "kgffffkffffffkffffffPppppPwEwEwk",
  "kgfffkdfffffkfffffffPppppPwwrwwk",
  ".kfffkddffffkffffffffPppPkkkkkkk",
  ".kffkdddffffkffffffffsPPPk......",
  ".kkfkdddfffkffffffffssssk.......",
  "kOkkddddfffkfffffffssssk........",
  "kookddddffkfffffffssssk.........",
  ".kkdddddfkfffffffssssk..........",
  "..kdddddksssssssssskk...........",
  ".kdddddkkkkkkkkkkkk.............",
  ".kddddk.........................",
  ".kdddk..........................",
  ".kddk...........................",
  "..kk............................",
  "................................",
  "................................",
  "................................",
];

// ─── Overlays ─────────────────────────────────────────────────────────────────
// { x, y, rows }: drawn over a frame with its top-left corner at (x, y). A
// space leaves the pixel underneath; any other character replaces it.

const BLINK     = { x: 12, y: 8, rows: ["ff", "kk", "ff"] };
const LOOK_UP   = { x: 12, y: 7, rows: ["wk", "kk", "kk", "ff"] };
const EYES_SHUT = { x: 11, y: 8, rows: ["ffff", "kffk", "fkkf"] };
const EYES_HAPPY = { x: 11, y: 8, rows: ["ffff", "fkkf", "kffk"] };

const question = (y) => ({ x: 21, y, rows: [
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
// shorter (the top leg row goes), so the feet stay planted.
const bob = (rows) => [".".repeat(rows[0].length), ...rows.slice(0, 28), ...rows.slice(29)];
// A hop: the whole bird one pixel higher.
const hop = (rows) => [...rows.slice(1), ".".repeat(rows[0].length)];

const LOOKING = stamp(STAND, LOOK_UP);
const DREAMING = stamp(STAND, EYES_SHUT);
const HAPPY = stamp(CHEER, EYES_HAPPY);

// Each state: frames, frames per second, and optionally `sequence`, the order
// frames play in (a blink held once every few seconds rather than every other
// beat).
export const BEAKER = {
  width: 32,
  height: 32,
  palette: PALETTE,
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
      frames: [stamp(LOOKING, question(0)), stamp(bob(LOOKING), question(0))],
    },
    delivering: {
      fps: 3,
      frames: [stamp(HOLD, sparkle(27, 21)), stamp(bob(HOLD), sparkle(24, 22), sparkle(29, 22))],
    },
    celebrating: {
      fps: 4,
      frames: [
        stamp(hop(HAPPY), bigSparkle(21, 0), sparkle(27, 21)),
        stamp(HAPPY, sparkle(24, 2), bigSparkle(25, 20)),
      ],
    },
    sleeping: {
      fps: 1.5,
      frames: [stamp(DREAMING, smallZ(22, 3)), stamp(bob(DREAMING), smallZ(22, 3), bigZ(27, 0))],
    },
  },
};

export default BEAKER;
