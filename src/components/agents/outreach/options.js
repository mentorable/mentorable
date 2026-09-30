// The static choices a student makes before Beaker drafts, as the page shows
// them. The keys, labels, hints and example openings mirror the backend's
// langgraph-service/app/nodes/agents/outreach/voices.py: change one, change
// the other. The backend also holds each option's prompt guidance, which the
// page never needs.

import { BEAKER_LINES } from "../../../lib/agents/registry.js";

export const PURPOSES = [
  { key: "research", label: "Research opportunity",
    hint: "How a high school student could start learning their research, or who handles that." },
  { key: "informational", label: "Informational chat",
    hint: "A short conversation about their path and their field." },
  { key: "internship", label: "Internship or job",
    hint: "Whether their organization has anything open to high school students." },
  { key: "mentorship", label: "Mentorship or advice",
    hint: "One piece of advice on what to learn or read next." },
];

export const VOICES = [
  { key: "formal", label: "Formal and polished",
    hint: "Full sentences and titles, no contractions. Good for senior professors and program offices.",
    example: "Dear Professor Alvarez: I am a junior at a public high school in Tucson, and I read your lab's page on desert soil microbes with real interest. Might I ask whether you would be open to a fifteen-minute conversation about how a high school student could learn more about this work?" },
  { key: "warm", label: "Warm and curious",
    hint: "Friendly and natural, with one personal beat. The best place to start.",
    example: "Dear Dr. Alvarez, I'm a high school junior in Tucson, and your lab's page on how soil microbes survive dry spells sent me down a few afternoons of reading. Would you be up for a short chat about how someone my age could start learning this properly?" },
  { key: "direct", label: "Short and direct",
    hint: "Fewest words and one clear question. For very busy people and professionals.",
    example: "Dear Dr. Alvarez, I'm a junior at a public high school in Tucson. I read your lab's page on desert soil microbes and have one question: where would you suggest a high school student start?" },
  { key: "humble", label: "Eager but humble",
    hint: "Names what they are still learning, honestly, without over-apologizing.",
    example: "Dear Dr. Alvarez, I'm a high school junior in Tucson and I know I'm still learning the basics. Your lab's soil microbe page is the first thing that made me keep reading past the abstract, and I'd be grateful for even a one-line pointer on where to start." },
];

export const LENGTHS = [
  { key: "brief", label: "Brief", hint: "About 80 to 110 words" },
  { key: "fuller", label: "Fuller", hint: "About 120 to 160 words" },
];

/** The rewrite chips on the review screen. */
export const TWEAKS = [
  { key: "shorter", label: "Shorter" },
  { key: "warmer", label: "Warmer" },
  { key: "formal", label: "More formal" },
  { key: "smaller_ask", label: "Smaller ask" },
];

export const DEFAULT_VOICE = "warm";
export const DEFAULT_LENGTH = "brief";

// The request limits the backend enforces (service.py), checked here first so
// the student hears about them before anything is spent.
export const GOAL_MIN = 8;
export const GOAL_MAX = 300;
export const NOTE_MAX = 300;
export const ANSWER_MAX = 600;
export const NAME_MAX = 120;
export const ORG_MAX = 160;
export const URL_MAX = 2000;
export const SUBJECT_MAX = 200;
export const BODY_MAX = 4000;
export const FOLLOWUP_MAX = 1500;

/** Word caps: a first email and a follow-up (voices.MAX_WORDS, FOLLOWUP_MAX_WORDS). */
export const MAX_WORDS = 175;
export const FOLLOWUP_MAX_WORDS = 70;

/** Tap-to-fill goals on the Who step. */
export const EXAMPLE_GOALS = [
  "A professor near me who studies marine biology and might talk to a high school student",
  "Someone who works on apps for people with disabilities",
  "A nurse or doctor who could tell me what their first years were like",
];

export const labelOf = (list, key) => list.find((o) => o.key === key)?.label || "";

// ── What is left to spend (GET /agents/outreach/status) ──────────────────────
// A try is one recipient; a research run is one paid search (a goal's
// shortlist, or reading up on one person). Starting a try spends one of each,
// and a pick from a list spends another run. A try whose research fails is
// given back, but its run is not, so runs can run out while tries remain.

/** A { used, limit, left } count from status, or null when missing or malformed. */
export function budgetOf(b) {
  return b && Number.isFinite(b.left) && Number.isFinite(b.limit) ? b : null;
}

/** A goal needs two runs: one to find people, one to read up on the pick. */
export const GOAL_RUNS = 2;

/**
 * Why Beaker cannot start: "tries", "searches" or null. `charge`: false for a
 * pick from a list the student already has (no new try, but still a run).
 * `runs`: how many research runs the step needs.
 */
export function researchBlock(status, { charge = true, runs = 1 } = {}) {
  const tries = budgetOf(status?.tries);
  const searches = budgetOf(status?.searches);
  if (charge && tries && tries.left <= 0) return "tries";
  if (searches && searches.left < runs) return "searches";
  return null;
}

/** The stop, in words, for each reason researchBlock gives: a heading, what
 *  Beaker says, and a short note for beside a disabled button. */
export const BLOCK_COPY = {
  tries: {
    title: "No tries left",
    line: BEAKER_LINES.boardNoTries,
    short: "No tries left. Everything else here still works.",
  },
  searches: {
    title: "No research runs left",
    line: "I've run all the research this demo allows, so I can't start a new search. Everything here still works: add people by hand, edit drafts and send what's ready.",
    short: "No research runs left. Everything else here still works.",
  },
};

/** Words as the backend counts them: whitespace-separated tokens with at
 *  least one letter or digit (draft.word_count). */
export function wordCount(text) {
  if (typeof text !== "string") return 0;
  return text.split(/\s+/).filter((t) => /[A-Za-z0-9]/.test(t)).length;
}
