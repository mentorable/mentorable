// The agents that were not here yet: sleeping birds (birds all the way down,
// like Beaker, Talon, Quill and Poise) in one muted color, eyes closed, a z
// drifting up. Deliberately vague ("???" on the hub): they promised nothing
// about what the agent would do, only that someone was coming. Same format as
// Beaker's frames, 32 by 32, one character per pixel.
//
// Both sleepers have woken: the owl as Quill (sprites/quill.js) and the heron
// as Poise (sprites/poise.js). TEASERS is empty, so the app draws neither and
// the hub shows no "Arriving soon" card; a new teaser is one more entry there.
// The two silhouettes are still exported for one reader outside the app, the
// social videos (social/src/brand/sprites.js re-exports OWL, HERON and
// TEASERS, and an old hub screen there draws them): delete OWL_ROWS,
// HERON_ROWS and their exports here in the same change that drops them there.

const PALETTE = {
  ".": null,
  a: "#aaa5bd",   // the silhouette
  e: "#f1eff6",   // cut-outs: closed eyes, a few lines
  z: "#86809f",   // the z's
};

// An owl asleep on a branch. Not a teaser any more (see the note above).
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

// A heron asleep on one leg in the shallows, bill forward, plume trailing.
// Not a teaser any more (see the note above).
const HERON_ROWS = [
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................aaaa............",
  "..........aaaa.aaaaaa...........",
  "........aa....aaaeeaaaaaaaaaa...",
  "..............aaaaaaaaaaaaa.....",
  "..............aaaaaaaaa.........",
  ".............aaaaaaaaaa.........",
  "............aaaaaaaaaaa.........",
  "...........aaaaaaaaaaaa.........",
  "..........aaaaeaaaaaaaa.........",
  ".........aaaaaaeaaaaaaa.........",
  "........aaaaaaaaeaaaaa..........",
  ".......aaaaaaaaaaeaaaa..........",
  "......aaaaaaaaaaaaeaa...........",
  ".....aaaaaaaaaaaaaaa............",
  "....aaaaa..aaaaaaaa.............",
  "...aaa.......aaaa...............",
  "..............aa................",
  "..............a.................",
  "..............a.................",
  "..............a.................",
  "..............a.................",
  "..............a.................",
  "..............a.................",
  "...........aaaaaa...............",
  ".....aaaa..........aaaaa........",
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

/** Only for the social videos. Not in TEASERS: Poise took this heron's place. */
export const HERON = sleeper(HERON_ROWS, [24, 3], [26, 0]);
/** Only for the social videos. Not in TEASERS: Quill took this owl's place. */
export const OWL = sleeper(OWL_ROWS, [27, 6], [26, 0]);

/** The silhouettes the app can draw (Mascot.jsx), by mascot key. None for
 *  now: every bird on the hub is awake. */
export const TEASERS = {};
