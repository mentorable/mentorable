// Video #1's running order: every scene and its length in frames (30 fps).
// Unhurried on purpose: each scene holds its key moment for a second and a
// half or more. Hard cuts between scenes; nothing overlaps. Scene files never
// change these numbers, so the captions in copy.js always land on their scene.

export const SCENES = [
  { id: "hook",          frames: 120 },  // 0    blank email, "Dear Professor" typed and deleted
  { id: "beakerArrives", frames: 90  },  // 4    Beaker flies in and lands
  { id: "outreachWho",   frames: 150 },  // 7    a goal typed, Beaker's research lines
  { id: "shortlist",     frames: 120 },  // 12   three people, one tapped
  { id: "draft",         frames: 150 },  // 16   the draft, its claims and sources
  { id: "review",        frames: 165 },  // 21   the address and where it was found, Send
  { id: "handoff",       frames: 75  },  // 26.5 Beaker out, Talon in
  { id: "finderBrief",   frames: 150 },  // 29   lane, brief, Talon's search lines
  { id: "finderBoard",   frames: 135 },  // 34   the deadline board fills
  { id: "dropped",       frames: 120 },  // 38.5 what was left out, and why
  { id: "endCard",       frames: 165 },  // 42.5 beta, mentorable.net (ends 48)
];

let at = 0;
for (const s of SCENES) { s.from = at; at += s.frames; }
export const TOTAL_FRAMES = at;

export const sceneById = Object.fromEntries(SCENES.map((s) => [s.id, s]));
