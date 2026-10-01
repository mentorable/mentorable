import { supabase } from "./supabase.js";

// Talon's board: the scholarships and activities Talon found (finder_items).
//
// Only Talon creates items (the backend writes every fact: the title, the
// deadline, the requirements, the checks). Students read their own rows and
// may change a few columns directly (RLS plus column grants): where an item
// stands, the outcome, their notes, the requirements they ticked off, and its
// place in the list. Every write here is filtered to those columns first
// (sending any other column fails the whole update).
//
// An item read here has the same shape as one the backend returns: every
// column except user_id and canonical_url.

export const LANES = [
  { key: "scholarship", label: "Scholarships", short: "Scholarship", blurb: "Money for college you can apply for" },
  { key: "activity", label: "Activities", short: "Activity", blurb: "Summer programs, competitions, research and volunteering" },
];

/** The board's tabs, in order. "dismissed" is hidden behind a toggle. */
export const STATUSES = [
  { key: "new", label: "New finds" },
  { key: "saved", label: "Saved" },
  { key: "applying", label: "Applying" },
  { key: "applied", label: "Applied" },
  { key: "done", label: "Done" },
];
const STATUS_LABELS = { ...Object.fromEntries(STATUSES.map((s) => [s.key, s.label])), dismissed: "Dismissed" };
const STATUS_KEYS = new Set(Object.keys(STATUS_LABELS));

export const KIND_LABELS = {
  scholarship: "Scholarship",
  summer_program: "Summer program",
  competition: "Competition",
  research: "Research",
  internship: "Internship",
  volunteering: "Volunteering",
  other: "Opportunity",
};

/** The opt-in eligibility chips, the keys of the backend's rules.CHIPS. Used
 *  for one search only: never saved, never guessed. */
export const CHIPS = [
  { key: "first_gen", label: "First in my family to go to college", group: "background" },
  { key: "low_income", label: "From a lower-income family", group: "background" },
  { key: "military_family", label: "Military family", group: "background" },
  { key: "disability", label: "Living with a disability", group: "background" },
  { key: "lgbtq", label: "LGBTQ+", group: "background" },
  { key: "faith", label: "Open to faith-based scholarships", group: "background" },
  { key: "hispanic_latino", label: "Hispanic or Latino", group: "heritage" },
  { key: "black", label: "Black or African American", group: "heritage" },
  { key: "asian_pacific", label: "Asian American or Pacific Islander", group: "heritage" },
  { key: "native", label: "Native American or Alaska Native", group: "heritage" },
  { key: "mena", label: "Middle Eastern or North African", group: "heritage" },
];

export const CITIZENSHIP = [
  { key: "citizen", label: "US citizen" },
  { key: "permanent_resident", label: "Permanent resident" },
  { key: "other", label: "Something else" },
  { key: "unsure", label: "Not sure / prefer not to say" },
];

// The brief's lane fields: budget, travel and timing for activities, effort
// for scholarships. The last option of each is the backend's default.
export const BUDGET = [
  { key: "free", label: "Free only", hint: "Paid programs with financial aid still count." },
  { key: "under_500", label: "Under $500", hint: "Or more, if aid is offered." },
  { key: "any", label: "Any cost", hint: "Free and aided ones still come first." },
];
export const TRAVEL = [
  { key: "local", label: "Near me", hint: "In or around your state." },
  { key: "online", label: "Online", hint: "From home." },
  { key: "anywhere", label: "Anywhere", hint: "Online or in person, near or far." },
];
export const WHEN = [
  { key: "summer", label: "Summer" },
  { key: "school_year", label: "During the school year" },
  { key: "any", label: "Any time" },
];
export const EFFORT = [
  { key: "quick", label: "Quick to apply", hint: "Short or no essay." },
  { key: "any", label: "Any length", hint: "Essays are fine." },
];

// The limits the backend enforces (service.py), so the page can say them first.
export const WANT_MIN = 8;
export const WANT_MAX = 300;
export const RECHECKS_PER_ITEM = 3;
export const STALE_AFTER_DAYS = 14;
/** A saved or applying item due within this many days gets a nudge. */
export const SOON_DAYS = 14;

/** A read or write that failed, with a message fit to show. */
export class FinderError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "FinderError";
    this.code = code;
  }
}

export function statusLabel(key) {
  return STATUS_LABELS[key] || "";
}

/** How it turned out, in the lane's own words. */
export function outcomeLabel(lane, outcome) {
  if (outcome === "yes") return lane === "activity" ? "Got in" : "Awarded";
  if (outcome === "no") return "Not this time";
  return "";
}

// ─── Dates ────────────────────────────────────────────────────────────────────
// `deadline` is a calendar date ("2027-03-01"). `new Date("2027-03-01")` reads
// it as UTC midnight, which is the evening before in US zones, so dates are
// parsed by hand and compared as local calendar days (as outreach.js does).
// `checked_at` is a full timestamp, read as the local day it fell on.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function toDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== "string" || !value) return null;
  const m = DAY_RE.exec(value);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]) ? d : null;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

const dayNumber = (d) => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);

function daysBetween(from, to) {
  const a = toDate(from);
  const b = toDate(to);
  return a && b ? dayNumber(b) - dayNumber(a) : null;
}

/** "Mar 1", or "Mar 1, 2027" in another year than `today`'s. */
function shortDay(d, today) {
  const label = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  const now = toDate(today);
  return now && d.getFullYear() === now.getFullYear() ? label : `${label}, ${d.getFullYear()}`;
}

/** Whole calendar days from `today` to the item's deadline (negative once it
 *  has passed), or null when it has none. */
export function daysLeft(item, today = new Date()) {
  if (!item?.deadline) return null;
  return daysBetween(today, item.deadline);
}

/** The deadline in plain words: "Due Mar 1, 12 days left", "Due tomorrow",
 *  "Due today", "Closed Feb 2", "Rolling deadline", or "Check the site for
 *  the deadline" when Talon found none (it never guesses one). */
export function deadlineLabel(item, today = new Date()) {
  const d = item?.deadline ? toDate(item.deadline) : null;
  const left = d ? daysBetween(today, d) : null;
  if (left === null) {
    return item?.deadline_kind === "rolling" ? "Rolling deadline" : "Check the site for the deadline";
  }
  if (left < 0) return `Closed ${shortDay(d, today)}`;
  if (left === 0) return "Due today";
  if (left === 1) return "Due tomorrow";
  return `Due ${shortDay(d, today)}, ${left} days left`;
}

/** The deadline as a short line for a timeline row, where the month heading
 *  and the date tile already say the day: "12 days left", "Due tomorrow",
 *  "Due today", "Closed Feb 2", "Rolling deadline", or "Check the site for
 *  the deadline". deadlineLabel is the full version for screen readers. */
export function deadlineShort(item, today = new Date()) {
  const left = daysLeft(item, today);
  if (left === null || left <= 1) return deadlineLabel(item, today);
  return `${left} days left`;
}

/** The item's deadline as a local calendar day (never parsed as UTC), or
 *  null when it has none. */
export function deadlineDay(item) {
  return item?.deadline ? toDate(item.deadline) : null;
}

/** True when the deadline is today or within SOON_DAYS. */
export function isSoon(item, today = new Date()) {
  const left = daysLeft(item, today);
  return left !== null && left >= 0 && left <= SOON_DAYS;
}

/** True when a saved or applying item was last checked more than
 *  STALE_AFTER_DAYS ago: worth a recheck before the student applies. */
export function isStale(item, today = new Date()) {
  if (item?.status !== "saved" && item?.status !== "applying") return false;
  const age = daysBetween(item.checked_at, today);
  return age !== null && age > STALE_AFTER_DAYS;
}

// ─── Item rules (pure) ────────────────────────────────────────────────────────

const count = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.trunc(Number(v))) : 0);

export function rechecksLeft(item) {
  return Math.max(0, RECHECKS_PER_ITEM - count(item?.rechecks_used));
}

/** The money line: the award for a scholarship, the cost for an activity
 *  (with "(aid available)" when the page offers aid), or "" when there is none. */
export function moneyLine(item) {
  if (!item) return "";
  const text = (v) => (typeof v === "string" ? v.trim() : "");
  if (item.lane !== "activity") return text(item.amount_text);
  const cost = text(item.cost_text);
  if (item.aid === true) return cost ? `${cost} (aid available)` : "Aid available";
  return cost;
}

const LIST_FIELDS = ["eligibility", "requirements", "confirm", "req_done"];

/** A database row as the page uses it: the list columns always arrays. */
function toItem(row) {
  if (!row) return null;
  const item = { ...row };
  for (const key of LIST_FIELDS) if (!Array.isArray(item[key])) item[key] = [];
  return item;
}

// ─── Ordering (pure) ──────────────────────────────────────────────────────────
// Within a tab: deadlines coming up within SOON_DAYS first, soonest first.
// Then the rest by position, the order Talon ranked them in. Each find
// numbers its own results from the top, so positions are compared within a
// find, and the newest find's results come first.

const pos = (it) => (Number.isFinite(Number(it?.position)) ? Number(it.position) : 0);
const stampOf = (v) => { const t = Date.parse(v || ""); return Number.isNaN(t) ? 0 : t; };

/** { new: [...], saved: [...], applying, applied, done, dismissed }, each in
 *  board order. An item with an unknown status shows under New finds rather
 *  than being lost. */
export function groupByStatus(items, today = new Date()) {
  const out = Object.fromEntries([...STATUS_KEYS].map((k) => [k, []]));
  const list = items || [];

  // When each find landed: its newest item's created_at.
  const findAt = new Map();
  for (const it of list) {
    const key = it.search_id || `item:${it.id}`;
    findAt.set(key, Math.max(findAt.get(key) || 0, stampOf(it.created_at)));
  }
  const keyed = list.map((it) => ({
    it,
    soon: isSoon(it, today) ? daysLeft(it, today) : null,
    find: findAt.get(it.search_id || `item:${it.id}`) || 0,
  }));
  keyed.sort((a, b) => {
    if (a.soon !== null || b.soon !== null) {
      if (a.soon === null) return 1;
      if (b.soon === null) return -1;
      if (a.soon !== b.soon) return a.soon - b.soon;
    }
    return b.find - a.find || pos(a.it) - pos(b.it)
      || stampOf(b.it.created_at) - stampOf(a.it.created_at) || String(a.it.id).localeCompare(String(b.it.id));
  });
  for (const { it } of keyed) (STATUS_KEYS.has(it.status) ? out[it.status] : out.new).push(it);
  return out;
}

// ─── The deadline timeline (pure) ─────────────────────────────────────────────
// The board as a timeline: new finds wait in a tray to be sorted; everything
// the student kept and is still working on is listed by the month its
// deadline falls in. Finds with no set date (rolling, or no date on the page)
// come after the months; ones whose deadline has passed, and finished ones,
// each get a group of their own at the end, never mixed into the months.

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September",
  "October", "November", "December"];

/** The statuses still being worked on, in the order they sort within a day:
 *  started first (it needs work), then saved, then sent. */
const ACTIVE_ORDER = { applying: 0, saved: 1, applied: 2 };
export const ACTIVE_STATUSES = Object.keys(ACTIVE_ORDER);

/** "October", or "January 2027" in another year than `today`'s. */
export function monthLabel(date, today = new Date()) {
  const d = toDate(date);
  if (!d) return "";
  const now = toDate(today);
  const name = MONTH_NAMES[d.getMonth()];
  return now && d.getFullYear() === now.getFullYear() ? name : `${name} ${d.getFullYear()}`;
}

const NO_DATE_LABEL = "No set date";
const CLOSED_LABEL = "Closed";

/**
 * {
 *   tray: new finds, in board order (soonest deadline first, then the newest
 *         find in Talon's ranked order), unknown statuses included;
 *   months: [{ key: "2026-10", label: "October", items }], in date order,
 *         each by deadline, then applying, saved, applied;
 *   undated: saved, applying or applied with no date, applying first;
 *   closed: saved, applying or applied whose deadline has passed, the most
 *         recently closed first;
 *   done: finished ones, the latest deadline first (no date last);
 *   dismissed: in board order.
 * }
 * Ties keep board order (sorts are stable).
 */
export function groupByDeadline(items, today = new Date()) {
  const by = groupByStatus(items, today);
  const rank = (it) => ACTIVE_ORDER[it.status] ?? 3;
  const day = (it) => { const d = deadlineDay(it); return d ? dayNumber(d) : null; };

  const months = new Map();
  const undated = [];
  const closed = [];
  // Board order across the three statuses, so a tie stays where groupByStatus put it.
  const active = ACTIVE_STATUSES.flatMap((k) => by[k]);
  for (const it of active) {
    const d = deadlineDay(it);
    const left = d ? daysBetween(today, d) : null;
    if (left === null) { undated.push(it); continue; }
    if (left < 0) { closed.push(it); continue; }
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!months.has(key)) months.set(key, { key, label: monthLabel(d, today), items: [] });
    months.get(key).items.push(it);
  }

  const monthList = [...months.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  for (const m of monthList) m.items.sort((a, b) => day(a) - day(b) || rank(a) - rank(b));
  undated.sort((a, b) => rank(a) - rank(b));
  closed.sort((a, b) => day(b) - day(a) || rank(a) - rank(b));
  const done = [...by.done].sort((a, b) => {
    const da = day(a);
    const db = day(b);
    if (da === null || db === null) return (da === null) - (db === null);
    return db - da;
  });

  return { tray: by.new, months: monthList, undated, closed, done, dismissed: by.dismissed };
}

/** Where an item shows on the timeline, in the words of its group heading:
 *  "October", "January 2027", "No set date", "Closed", "Done", "Dismissed",
 *  or "New finds" for one still waiting to be sorted. */
export function timelinePlace(item, today = new Date()) {
  if (item?.status === "done") return statusLabel("done");
  if (item?.status === "dismissed") return statusLabel("dismissed");
  if (!ACTIVE_STATUSES.includes(item?.status)) return statusLabel("new");
  const d = deadlineDay(item);
  const left = d ? daysBetween(today, d) : null;
  if (left === null) return NO_DATE_LABEL;
  if (left < 0) return CLOSED_LABEL;
  return monthLabel(d, today);
}

/** The headings timelinePlace and the board share. */
export const TIMELINE_LABELS = { undated: NO_DATE_LABEL, closed: CLOSED_LABEL };

// ─── Writes: only the student's columns ──────────────────────────────────────

// The database's column grants for the `authenticated` role (updated_at too,
// which every write here sets itself).
const UPDATE_COLUMNS = ["status", "outcome", "notes", "req_done", "position"];
const NOTES_MAX = 2000;
const REQ_MAX = 50;   // far more requirement lines than Talon ever keeps

function clean(fields) {
  const out = {};
  for (const key of UPDATE_COLUMNS) {
    if (!Object.prototype.hasOwnProperty.call(fields, key) || fields[key] === undefined) continue;
    const v = fields[key];
    switch (key) {
      case "status":
        if (!STATUS_KEYS.has(v)) throw new FinderError("That isn't a place on your board.", "bad_status");
        out.status = v;
        break;
      case "outcome":
        if (v === null || v === "") { out.outcome = null; break; }
        if (v !== "yes" && v !== "no") throw new FinderError("Pick how it turned out.", "bad_outcome");
        out.outcome = v;
        break;
      case "notes":
        out.notes = (typeof v === "string" ? v : v == null ? "" : String(v)).slice(0, NOTES_MAX);
        break;
      case "req_done": {
        if (!Array.isArray(v)) throw new FinderError("Couldn't save that checklist.", "bad_checklist");
        const done = [...new Set(v.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < REQ_MAX))];
        out.req_done = done.sort((a, b) => a - b);
        break;
      }
      case "position":
        if (!Number.isFinite(Number(v))) throw new FinderError("Couldn't place that find.", "bad_position");
        out.position = Number(v);
        break;
      default:
        break;
    }
  }
  return out;
}

// ─── Reads and writes ─────────────────────────────────────────────────────────

const ITEM_COLUMNS = [
  "id", "search_id", "lane", "kind", "status", "outcome", "title", "provider", "summary", "url", "source_url",
  "verified", "deadline", "deadline_text", "deadline_kind", "amount_text", "amount_usd", "cost_text", "cost_usd",
  "aid", "dates_text", "location_text", "eligibility", "requirements", "confirm", "fit_reason", "record_ref",
  "checked_at", "recheck_note", "rechecks_used", "notes", "req_done", "position", "created_at", "updated_at",
].join(", ");
const BOARD_LIMIT = 500;

/** Every item on the student's board (dismissed ones too), newest first. */
export async function loadItems(userId) {
  const { data, error } = await supabase.from("finder_items").select(ITEM_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(BOARD_LIMIT);
  if (error) throw new FinderError("Couldn't load your board. Try again.", "load");
  return (data || []).map(toItem);
}

/** Change an item. Anything outside the student's columns is dropped. */
export async function updateItem(userId, id, patch) {
  const { data, error } = await supabase.from("finder_items")
    .update({ ...clean(patch || {}), updated_at: new Date().toISOString() })
    .eq("id", id).eq("user_id", userId)
    .select(ITEM_COLUMNS).single();
  if (error) throw new FinderError("Couldn't save that. Try again.", "save");
  return toItem(data);
}

export async function deleteItem(userId, id) {
  const { error } = await supabase.from("finder_items").delete().eq("id", id).eq("user_id", userId);
  if (error) throw new FinderError("Couldn't delete that. Try again.", "delete");
}
