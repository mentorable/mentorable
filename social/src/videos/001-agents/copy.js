// Every caption in video #1, in one place. Lowercase, the way a person types a
// caption; at most about 3 words a second on screen; no em dashes (house
// rule). A word in *stars* is in the accent.
//
// `at` and `frames` are relative to the scene's start (frames default to the
// whole scene). Each caption must stay true to what the product does: see
// .claude/SOCIAL_VIDEO_PLAN.md, "Claims".

export const CAPTIONS = [
  { scene: "hook",          text: "emailing a professor at 16 is *terrifying*" },
  { scene: "beakerArrives", text: "so we hired a *pelican*" },
  { scene: "outreachWho",   text: "tell beaker who you want to *reach*" },
  { scene: "shortlist",     text: "it finds *real people* doing that work" },
  { scene: "draft",         text: "every fact about them links to a *source*" },
  { scene: "review",        text: "it never *guesses* an email. you press send." },
  { scene: "handoff",       text: "and this is *talon*" },
  { scene: "finderBrief",   text: "talon scouts *scholarships* and programs for you" },
  { scene: "finderBoard",   text: "it checks every detail against its *page*" },
  { scene: "dropped",       text: "a scholarship that charges you to apply? *gone.*" },
  { scene: "hub",           text: "two more are still *asleep*" },
  // endCard: no caption card; the end card says it.
];

export const END_CARD = {
  headline: "mentorable is in *beta*",
  sub: "it's early, and what you tell us shapes it.",
  url: "mentorable.net",
};
