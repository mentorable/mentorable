import { DRAFT, SHORTLIST, STUDENT } from "../../videos/001-agents/demoData.js";

// What video #1's outreach scenes need beyond demoData.js, in the shapes the
// app's own data has (the backend's candidate, card and progress events).
// Invented like the rest: the domains and page titles below were searched
// and belong to no real lab, school or institute (harborstate.edu is
// demoData's own).

/** The shortlist as the backend returns it: every person with the page the
 *  search really found them on (research.clean_candidates). */
export const CANDIDATES = SHORTLIST.map((p, i) => ({
  name: p.name,
  title: p.title,
  organization: p.org,
  why: p.why,
  ...[
    { source_url: "https://harborstate.edu/ortiz-lab", source_title: "The Ortiz Lab" },
    { source_url: "https://baylineocean.org/people/hale", source_title: "Marcus Hale" },
    { source_url: "https://westcove.edu/biology/takahara", source_title: "Ines Takahara, Biology" },
  ][i],
}));

/** The checklist a goal's shortlist run streams (service._record, then
 *  research.find_people), each line as it is at a frame offset from the
 *  moment "Find people" is pressed. The labels are the server's formats
 *  (_found_label, "Searching: <query>"); the query is short enough to sit on
 *  one line, so the newest line lands inside the safe area. Spaced for a
 *  calm read: the record line ticks while the thumb's drag (6 to 38) brings
 *  the list into view, and the search line arrives early and holds to the
 *  cut (the shortlist itself is the next shot). */
export const SHORTLIST_PROGRESS = [
  { at: 0, id: "record", label: "Reading your record", status: "active" },
  { at: 10, id: "record", label: "Read your record: 4 activities and 1 award", status: "done" },
  { at: 14, id: "search-1", label: "Searching the web", status: "active" },
  { at: 20, id: "search-1", label: "Searching: marine biology research labs California", status: "active" },
];

/** The checklist at `t` frames after the run started (mergeProgress). */
export function progressAt(events, t) {
  const lines = [];
  for (const e of events) {
    if (e.at > t) break;
    const i = lines.findIndex((l) => l.id === e.id);
    if (i === -1) lines.push({ id: e.id, label: e.label, status: e.status });
    else lines[i] = { ...lines[i], label: e.label || lines[i].label, status: e.status };
  }
  return lines;
}

const SOURCES = [
  { url: "https://harborstate.edu/ortiz-lab", title: "The Ortiz Lab" },
  { url: "https://harborstate.edu/ortiz-lab/join", title: "Join the lab" },
  { url: `https://${DRAFT.emailFoundOn}`, title: "Lab people" },
  { url: "https://harborstate.edu/news/kelp-after-the-heatwave", title: "Kelp after the heatwave" },
];

const bodyText = DRAFT.body.map((para) => para.map((r) => r.t).join("")).join("\n\n");

/** The card the review screen loads, as the backend writes it. */
export const CONTACT = {
  name: SHORTLIST[0].name,
  title: SHORTLIST[0].title,
  organization: SHORTLIST[0].org,
  stage: "drafted",
  email: DRAFT.to,
  email_source_url: `https://${DRAFT.emailFoundOn}`,
  subject: DRAFT.subject,
  body: bodyText,
  claims: DRAFT.body.flat().filter((r) => r.source).map((r) => ({ text: r.t, source_url: `https://${r.source}` })),
  sources: SOURCES,
  rewrites_left: 3,
  // What the draft asks her to check before sending (draft._facts_to_verify
  // never returns an empty list): how to address the recipient, and what it
  // took from her own record. Each under 20 words, as the prompt asks.
  facts_to_verify: [
    "Check the spelling of Dr. Ortiz's name, and that Dr. is how she likes to be addressed.",
    "Confirm it was two summers volunteering at the aquarium's tide pool exhibit.",
    "Confirm you're taking AP Biology this year.",
  ],
};

export const GMAIL = { connected: true, email: STUDENT.email };
export const SENDS_TODAY = { left: 5, limit: 5 };
export const TRIES = { limit: 2, left: 2 };
/** The day it goes out, as the review screen's "Sent Oct 2 with Gmail" says it. */
export const SENT_DAY = "Oct 2";
