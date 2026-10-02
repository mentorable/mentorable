// Video #1's running order: every scene and its length in frames (30 fps).
// `demo` scenes show invented people or finds, so the brand line carries the
// "demo data" pill.
// Hard cuts between scenes; nothing overlaps. Scene files never change these
// numbers, so the captions in copy.js always land on their scene.

export const SCENES = [
  { id: "hook",          frames: 90 },   // 0.0  blank email, "Dear Professor" typed and deleted
  { id: "beakerArrives", frames: 60 },   // 3.0  Beaker flies in and lands
  { id: "outreachWho",   frames: 90, demo: true },   // 5.0  a goal typed, Beaker's research lines
  { id: "shortlist",     frames: 75, demo: true },   // 8.0  three people, one tapped
  { id: "draft",         frames: 90, demo: true },   // 10.5 the draft, its claims and sources
  { id: "review",        frames: 90, demo: true },   // 13.5 the address and where it was found, Send
  { id: "handoff",       frames: 45 },   // 16.5 Beaker out, Talon in
  { id: "finderBrief",   frames: 90, demo: true },   // 18.0 lane, brief, Talon's search lines
  { id: "finderBoard",   frames: 90, demo: true },   // 21.0 the deadline board fills
  { id: "dropped",       frames: 75, demo: true },   // 24.0 what was left out, and why
  { id: "hub",           frames: 75, demo: true },   // 26.5 the hub, two sleeping teasers
  { id: "endCard",       frames: 135 },  // 29.0 beta, mentorable.net (ends 33.5)
];

let at = 0;
for (const s of SCENES) { s.from = at; at += s.frames; }
export const TOTAL_FRAMES = at;

export const sceneById = Object.fromEntries(SCENES.map((s) => [s.id, s]));
