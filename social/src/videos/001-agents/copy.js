// Every caption in video #1, in one place. Sentence case (the first word and
// the names Beaker and Talon capitalized), short and plain; at most about 3
// words a second on screen; no em dashes (house rule). Say "agent" where a
// bird is introduced, or nobody can tell what Beaker and Talon are. A word in
// *stars* is in the accent.
//
// `at` and `frames` are relative to the scene's start (frames default to the
// whole scene). Each caption must stay true to what the product does: see
// .claude/SOCIAL_VIDEO_PLAN.md, "Claims".

export const CAPTIONS = [
  { scene: "hook",          text: "Emailing a professor at 16 is *terrifying*" },
  { scene: "beakerArrives", text: "So we built an *agent* for that" },
  { scene: "outreachWho",   text: "Tell Beaker who you want to *reach*" },
  { scene: "shortlist",     text: "It finds *real people* doing that work" },
  { scene: "draft",         text: "Every fact about them links to a *source*" },
  { scene: "review",        text: "It never *guesses* an email. You press send." },
  { scene: "handoff",       text: "Our second *agent*: Talon" },
  { scene: "finderBrief",   text: "Talon scouts *scholarships* and programs for you" },
  { scene: "finderBoard",   text: "It checks every detail against its *page*" },
  { scene: "dropped",       text: "A scholarship that charges you to apply? *Gone.*" },
  { scene: "hub",           text: "Two more *agents* are still asleep" },
  // endCard: no caption card; the end card says it.
];

export const END_CARD = {
  headline: "Mentorable is in *beta*",
  sub: "It's early, and what you tell us shapes it.",
  url: "mentorable.net",
};
