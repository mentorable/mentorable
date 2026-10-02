// Video #1's running order: every scene and its length in frames (30 fps).
// `demo` scenes show invented people or finds, so the brand line carries the
// "demo data" pill.
// Unhurried on purpose: each scene holds its key moment for a second and a
// half or more. Hard cuts between scenes; nothing overlaps. Scene files never
// change these numbers, so the captions in copy.js always land on their scene.

export const SCENES = [
  { id: "hook",          frames: 120 },   // 0    blank email, "Dear Professor" typed and deleted
  { id: "beakerArrives", frames: 90 },   // 4    Beaker flies in and lands
  { id: "outreachWho",   frames: 150, demo: true },   // 7    a goal typed, Beaker's research lines
  { id: "shortlist",     frames: 120, demo: true },   // 12   three people, one tapped
  { id: "draft",         frames: 150, demo: true },   // 16   the draft, its claims and sources
  { id: "review",        frames: 165, demo: true },   // 21   the address and where it was found, Send
  { id: "handoff",       frames: 75 },   // 26.5 Beaker out, Talon in
  { id: "finderBrief",   frames: 150, demo: true },   // 29   lane, brief, Talon's search lines
  { id: "finderBoard",   frames: 135, demo: true },   // 34   the deadline board fills
  { id: "dropped",       frames: 120, demo: true },   // 38.5 what was left out, and why
  { id: "hub",           frames: 105, demo: true },   // 42.5 the hub, two sleeping teasers
  { id: "endCard",       frames: 165 },  // 46   beta, mentorable.net (ends 51.5)
];

let at = 0;
for (const s of SCENES) { s.from = at; at += s.frames; }
export const TOTAL_FRAMES = at;

export const sceneById = Object.fromEntries(SCENES.map((s) => [s.id, s]));
