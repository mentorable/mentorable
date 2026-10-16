// An unnamed mascot, kept for reference only: not an agent and not used on
// any screen yet. A pelican-shaped bird drawn from the Agents nav icon
// (PixelBeakIcon: round head, long bill, sagging pouch, long neck) in a navy
// graduation cap with a gold tassel. White feathers, an orange bill and a
// gold pouch. A 32 by 32 grid, one character per pixel ("." is empty), in the
// same format as Beaker's, Talon's and Quill's sprites, facing right like
// Beaker and Talon. One pose so far; add states before using it anywhere.

const PALETTE = {
  ".": null,
  k: "#2b2433",   // outline, eye
  w: "#ffffff",   // feathers
  n: "#e2dfe8",   // feather shade
  b: "#c3bdd0",   // wing
  B: "#9d96b1",   // wing shade
  o: "#f29a2e",   // bill, legs
  O: "#c8701c",   // bill shade
  y: "#f9bf3a",   // pouch, tassel
  c: "#1f2a52",   // cap band
  C: "#33468a",   // cap board
};

const STAND = [
"................................",
"......kkkkkkkkkkkkk.............",
"....kkCCCCCCCCCCCCCkk...........",
"..kkCCCCCCCCCCCCCCCCCkk.........",
"....kkcccccccccccccckkyk........",
"......kkkcccccccckkk..yk........",
".......kcccccccccck...yk........",
"......knkkkkkkkkkknk..yyk.......",
".....knwwwwwwwwwwwwnk.yyk.......",
".....knwwwwwwwwwkwwwnk..........",
"....knwwwwwwwwwkkkwwnkkkkkkkkkk.",
"....knwwwwwwwwwkkkwwkooooooooook",
"....knnwwwwwwwwwwwwwkOOOOOOOOOOk",
"....kbnnwwwwwwwwwwwwkyyyyyyyyOk.",
".....kbnnwwwwwwwwwwwkyyyyyyyyk..",
"......kbnnwwwwwwwwnkyyyyyyyk....",
".......kbnnwwwwwnnkkkyyyyk......",
"........kbnnwwwwnk...kkkk.......",
"........kbnnwwwwnk..............",
"........kbnnwwwwwnk.............",
".......kbnnwwwwwwwnk............",
".....kkbnnwwwwwwwwwnk...........",
"....kbbbnnnwwwwwwwwwnk..........",
"...kbbBbbnnnwwwwwwwwwnk.........",
"..kbBbBbbbnnnwwwwwwwwnk.........",
"..kbbBbBbbbnnnwwwwwwnk..........",
"..kBbbBbBbbbnnnwwwwnk...........",
"...kBBbbBbbbbnnnnnnk............",
"....kkBBBBbbbbbbbkk.............",
"......kkkkokkkokkk..............",
"..........o...o.................",
".........ooo.ooo................",
];

export const GRAD_BIRD = {
  palette: PALETTE,
  beakRow: 11,
  states: {
    idle: { fps: 1, frames: [STAND] },
  },
};

export default GRAD_BIRD;
