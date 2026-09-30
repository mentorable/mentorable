// The agents that are not here yet: sleeping silhouettes in one muted color,
// eyes closed, a z drifting up. Deliberately vague ("???" on the hub): they
// promise nothing about what the agent will do, only that someone is coming.
// Same format as Beaker's frames, 32 by 32, one character per pixel.

const PALETTE = {
  ".": null,
  a: "#aaa5bd",   // the silhouette
  e: "#f1eff6",   // cut-outs: closed eyes, a few lines
  z: "#86809f",   // the z's
};

// An owl asleep on a branch.
const OWL_ROWS = [
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  ".......aa..............aa.......",
  ".......aaa............aaa.......",
  ".......aaaa..........aaaa.......",
  ".......aaaaaaaaaaaaaaaaaa.......",
  "......aaaaaaaaaaaaaaaaaaaa......",
  "......aaaaaaaaaaaaaaaaaaaa......",
  "......aaaaaaaaaaaaaaaaaaaa......",
  "......aaaeaaaaeaaeaaaaeaaa......",
  "......aaaaeeeeaaaaeeeeaaaa......",
  "......aaaaaaaaaaaaaaaaaaaa......",
  "......aaaaaaaaaeeaaaaaaaaa......",
  ".....aaaaaaaaaaeeaaaaaaaaaa.....",
  ".....aaaaaaaaaaaaaaaaaaaaaa.....",
  ".....aaaeaaaaaaaaaaaaaaeaaa.....",
  ".....aaaeaaaaaaaaaaaaaaeaaa.....",
  ".....aaaeaaaaeaaaeaaaaaeaaa.....",
  ".....aaaaeaaaaaeaaaaaaeaaaa.....",
  ".....aaaaeaaaaaaaaaaaaeaaaa.....",
  ".....aaaaaeaaaeaeaaaaeaaaaa.....",
  "......aaaaaeaaaaaaaaeaaaaa......",
  ".......aaaaaaaaaaaaaaaaaa.......",
  "........aaaaaaaaaaaaaaaa........",
  "..........aaaaaaaaaaaa..........",
  "...........aaa....aaa...........",
  "..aaaaaaaaaaaaaaaaaaaaaaaaaaaa..",
  "........................aaa.....",
  "................................",
];

// A fox curled up, tail round the front.
const FOX_ROWS = [
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "..................a......a......",
  "..................aa....aa......",
  "..................aea..aea......",
  ".................aaaa..aaaa.....",
  ".................aaaaaaaaaa.....",
  "................aaaaaaaaaaaa....",
  "................aaaaeaaeaaaaa...",
  "................aaaaaeeaaaaaaa..",
  "................aaaaaaaaaaaaaaa.",
  "...............aaaaaaaaaaaaaaaaa",
  ".........aaaaaaaaaaaaaaaaaaaaa..",
  "......aaaaaaaaaaaaaaaaaaaaaa....",
  ".....aaaaaaaaaaaaaaaaaeeeeea....",
  "....aeaaaaaaaaaaaaaaaaeeeeea....",
  "...aaeaaaaaaaaaaaaaaaaaeeeea....",
  "...aaeaaaaaaaaaaaaaaaaaaeeea....",
  "..aaaeaaaaaaaaaaaaaaaeaaaaaa....",
  "..aaaaeaaaaaaaaaaaaaeaaaaaaa....",
  "..aaaaaeaaaaaaaaaaaeaaaaaaaa....",
  "..aaaaaaeeeeeeeeeeeaaaaaaaaa....",
  "...aaaaaaaaaaaaaaaaaaaaaaaaa....",
  "....aaaaaaaaaaaaaaaaaaaaaaa.....",
  "......aaaaaaaaaaaaaaaaaaa.......",
  "................................",
  "................................",
  "................................",
  "................................",
];

// A turtle with its head down.
const TURTLE_ROWS = [
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "...........aaaaaaa..............",
  ".........aaaaaaaaaaa............",
  ".......aaaaaaaaaaaaaaa..........",
  "......aaaaaeaaaaaeaaaaa.........",
  ".....aaaaaaeaaaaaeaaaaaa........",
  ".....aaaaaaeaaaaaeaaaaaa........",
  "....aaaaaaaeaaaaaeaaaaaaa.......",
  "....aaaeeeeeeeeeeeeeeeaaa.......",
  "....aaaaeaaaaaeaaaaaeaaaa.aaa...",
  "...aaaaaeaaaaaeaaaaaeaaaaaeaaea.",
  "...aaaaaeaaaaaeaaaaaeaaaaaaeeaa.",
  "aaaaeeeeeeeeeeeeeeeeeeeeeaaaaaa.",
  "..aaaaaaaaaaaaaaaaaaaaaaaaaaaa..",
  "...aaaa.............aaaa........",
  "...aaaa.............aaaa........",
  "..aaaaaa...........aaaaaa.......",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
];

const SMALL_Z = ["zzzz", "  z ", " z  ", "zzzz"];
const BIG_Z = ["zzzzz", "   z ", "  z  ", " z   ", "zzzzz"];

function withZ(base, art, x, y) {
  const rows = base.map((r) => r.split(""));
  art.forEach((line, dy) => [...line].forEach((ch, dx) => {
    if (ch !== " ") rows[y + dy][x + dx] = ch;
  }));
  return rows.map((r) => r.join(""));
}

// A small z, then a bigger one higher up: two slow frames. Every state name
// falls back to this one, so a silhouette never tries to fly.
function sleeper(base, small, big) {
  const sleeping = { fps: 1.2, frames: [withZ(base, SMALL_Z, ...small), withZ(base, BIG_Z, ...big)] };
  return { width: 32, height: 32, palette: PALETTE, states: { sleeping, idle: sleeping } };
}

export const OWL = sleeper(OWL_ROWS, [27, 6], [26, 0]);
export const FOX = sleeper(FOX_ROWS, [28, 4], [26, 0]);
export const TURTLE = sleeper(TURTLE_ROWS, [26, 13], [25, 7]);

export const TEASERS = { owl: OWL, fox: FOX, turtle: TURTLE };
