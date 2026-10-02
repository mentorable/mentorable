// The labels and rules Talon's screens show, copied word for word from the
// app because their source files can't be imported here: src/lib/finder.js
// pulls in the Supabase client, and the drop reasons live in the backend
// (langgraph-service/app/nodes/agents/finder/rules.py). Talon's own lines are
// imported from the registry through brand.js, never copied.
//
// Also the date helpers, reduced to what the demo needs: the video's "today"
// is fixed, so every "days left" is the same in every render.

/** src/lib/finder.js LANES */
export const LANES = [
  { key: "scholarship", label: "Scholarships", short: "Scholarship", blurb: "Money for college you can apply for" },
  { key: "activity", label: "Activities", short: "Activity", blurb: "Summer programs, competitions, research and volunteering" },
];

/** src/lib/finder.js KIND_LABELS (the two the demo uses) */
export const KIND_LABELS = { scholarship: "Scholarship", other: "Opportunity" };

/** src/lib/finder.js CITIZENSHIP and EFFORT */
export const CITIZENSHIP = [
  { key: "citizen", label: "US citizen" },
  { key: "permanent_resident", label: "Permanent resident" },
  { key: "other", label: "Something else" },
  { key: "unsure", label: "Not sure / prefer not to say" },
];
export const EFFORT = [
  { key: "quick", label: "Quick to apply" },
  { key: "any", label: "Any length" },
];

export const WANT_MAX = 300;

/** FinderNewPage STEPS */
export const STEPS = [
  { key: "what", label: "What" },
  { key: "details", label: "Details" },
  { key: "check", label: "Check" },
  { key: "search", label: "Search" },
];

/** rules.py DROP_MESSAGES (the ones the demo uses): what the student reads
 *  for each listing Talon left out. The "Left out" list shows `message`
 *  under the title. */
export const DROP_MESSAGES = {
  fee: "Asks for an application fee. Real scholarships don't charge you to apply.",
  past_deadline: "Its deadline has passed.",
  not_your_grade: "Open to a different grade than yours.",
};

/** The demo's dropped listings (demoData DROPPED) with the reason the
 *  backend would give each, in its own words. demoData's paraphrases ("Charges
 *  a $35 application fee.") are not what the app prints. */
export function droppedAsApp(dropped) {
  const reasonOf = (d) => {
    const r = String(d.reason || "").toLowerCase();
    if (r.includes("fee")) return "fee";
    if (r.includes("deadline")) return "past_deadline";
    if (r.includes("college") || r.includes("grade")) return "not_your_grade";
    return "past_deadline";
  };
  return dropped.map((d) => {
    const reason = reasonOf(d);
    return { title: d.title, reason, message: DROP_MESSAGES[reason] };
  });
}

// ─── Dates ───────────────────────────────────────────────────────────────────
// The video's today: October 2, 2026 (demoData's daysLeft are counted from it).

export const TODAY = { year: 2026, month: 9, day: 2 };
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September",
  "October", "November", "December"];

/** "Nov 14" → { year, month, day }, in the year that keeps it ahead of today. */
export function parseDeadline(text) {
  const [m, d] = String(text).split(" ");
  const month = MON.indexOf(m);
  const day = Number(d);
  const year = month < TODAY.month || (month === TODAY.month && day < TODAY.day) ? TODAY.year + 1 : TODAY.year;
  return { year, month, day };
}

/** finder.js shortDay: "Nov 14", or "Jan 9, 2027" in another year. */
function shortDay(dl) {
  const label = `${MON[dl.month]} ${dl.day}`;
  return dl.year === TODAY.year ? label : `${label}, ${dl.year}`;
}

/** finder.js deadlineLabel: "Due Nov 14, 43 days left". */
export function deadlineLabel(item) {
  return `Due ${shortDay(item.deadline)}, ${item.daysLeft} days left`;
}

/** finder.js deadlineShort, for a timeline row: "43 days left". */
export function deadlineShort(item) {
  return `${item.daysLeft} days left`;
}

/** finder.js monthLabel: "November", or "January 2027" in another year. */
export function monthLabel(dl) {
  return dl.year === TODAY.year ? MONTH_NAMES[dl.month] : `${MONTH_NAMES[dl.month]} ${dl.year}`;
}

export const monthShort = (dl) => MON[dl.month];

/** demoData LISTINGS as finder_items rows, the shape the screens read. A
 *  find's results land as "new" (the board's sorting tray); only the
 *  student's Save makes one "saved" (the timeline). */
export function asItems(listings, status = "new") {
  return listings.map((l, i) => ({
    id: `demo-${i}`,
    lane: "scholarship",
    kind: "scholarship",
    status,
    title: l.title,
    provider: l.provider,
    amount_text: l.amount,
    deadline: parseDeadline(l.deadline),
    daysLeft: l.daysLeft,
    fit_reason: l.why,
    verified: !!l.verified,
    checked: "Checked today",
  }));
}

// ─── What Talon is doing, early in a find ───────────────────────────────────
// The server's own checklist lines (finder/service.py and research.py), for a
// find a few seconds in: the record read, the searches being written.

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** finder/service.py _record (outreach/service.py builds the same line):
 *  "Read your record: 4 activities and 1 award". */
export function recordLabel({ activities = 0, awards = 0 }) {
  if (!activities && !awards) return "Read your record, which has no activities yet";
  return `Read your record: ${plural(activities, "activity", "activities")} and ${plural(awards, "award", "awards")}`;
}

/** The checklist a few seconds into a find, for a record of `record`
 *  ({ activities, awards }: the demo student's counts, which Beaker's
 *  checklist must show too, since both read the same record). */
export function progressEarly(record) {
  return {
    done: [{ id: "record", label: recordLabel(record), status: "done" }],
    now: "Writing 3 searches",
  };
}
