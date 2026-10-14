// The schedule's rules and date arithmetic. No imports, so the whole file can
// be checked with plain Node.
//
// Two kinds of date live here, and mixing them up is the classic bug:
//
//   An instant: a meeting's `meeting_at`, a time a student offered, when a
//   request was made. These are timestamps that carry a zone, so
//   `new Date(iso)` is right, and every label is written in the viewer's own
//   zone (the counselor's browser).
//
//   A calendar day: a column of the week, a square of the month. That is a
//   local year, month and day. Days are built from parts and stepped through
//   the Date constructor (`new Date(y, m, d + 1)`), never by adding 24 hours
//   (a day is 23 or 25 hours long twice a year), and a day's key is never
//   read back with `new Date("2026-10-20")`: that is midnight in London,
//   which is the evening before anywhere in the US (see parseDay in
//   lib/quest.js).

/** answer_request refuses a time further ahead than this. */
export const MAX_AHEAD_DAYS = 120;
/** How long a counselor's note may be. */
export const NOTE_MAX = 300;
/** The week grid always shows a school day, 8 AM to 4 PM, and grows to hold
 *  anything earlier or later. */
export const FIRST_HOUR = 8;
export const LAST_HOUR = 16;

const DAY_MS = 86400000;
const LOCALE = "en-US";
const pad = (n) => String(n).padStart(2, "0");
// Newer browsers put a narrow no-break space before AM and PM.
const plainSpaces = (s) => s.replace(/[\u202f\u00a0]/g, " ");

// ─── Instants ─────────────────────────────────────────────────────────────────

/** A timestamp (or a Date) as a Date, or null when it is not one. */
export function toDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") return Number.isFinite(value) ? new Date(value) : null;
  if (typeof value !== "string" || !value.trim()) return null;
  // Postgres can print "2026-10-20 19:30:00+00": make it the form every browser reads.
  const iso = value.trim()
    .replace(/^(\d{4}-\d\d-\d\d) (?=\d\d:)/, "$1T")
    .replace(/(T\d\d:\d\d(?::\d\d(?:\.\d+)?)?[+-]\d\d)$/, "$1:00");
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "2:30 PM", in the viewer's zone. */
export function formatTime(date) {
  return plainSpaces(date.toLocaleTimeString(LOCALE, { hour: "numeric", minute: "2-digit" }));
}

/** The viewer's time zone in words, or "". "Central Time" where the browser
 *  can say it that way (true on both sides of a clock change), else the name
 *  in force on `date` ("Central Daylight Time"). */
export function zoneName(date = new Date()) {
  for (const style of ["longGeneric", "long"]) {
    try {
      const part = new Intl.DateTimeFormat(LOCALE, { timeZoneName: style }).formatToParts(date)
        .find((p) => p.type === "timeZoneName");
      // A zone with no everyday name comes back as an offset ("GMT+05:45"):
      // the long form says more.
      if (part && part.value && !(style === "longGeneric" && /^(GMT|UTC)[+-]/.test(part.value))) return part.value;
    } catch { /* an older browser does not know this style: try the next */ }
  }
  return "";
}

// ─── Calendar days ────────────────────────────────────────────────────────────

/** A day's key, "2026-10-20", from the local date. */
export function dayKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The local day a key names (never `new Date(key)`: see the note above). */
export function parseKey(key) {
  const [y, m, d] = String(key).slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
export const addDays = (date, n) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
export const sameMonth = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();

/** The same day `n` months on, or that month's last day when it has no such
 *  day (January 31 plus one month is the end of February). */
export function addMonths(date, n) {
  const first = new Date(date.getFullYear(), date.getMonth() + n, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return new Date(first.getFullYear(), first.getMonth(), Math.min(date.getDate(), last));
}

/** Weeks run Sunday to Saturday, as US calendars do. */
export const startOfWeek = (date) => addDays(date, -date.getDay());

/** The seven days of the week `anchor` falls in. */
export function weekDays(anchor) {
  const start = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** Every day of the month `anchor` falls in. */
export function monthDays(anchor) {
  const count = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
  return Array.from({ length: count }, (_, i) => new Date(anchor.getFullYear(), anchor.getMonth(), i + 1));
}

/** The month as whole weeks, with the days of the months either side that
 *  fill the first and last row. */
export function monthWeeks(anchor) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const weeks = [];
  for (let start = startOfWeek(first); start <= last; start = addDays(start, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(start, i)));
  }
  return weeks;
}

/** Where Previous and Next take the calendar: a week, or a month. */
export function shiftAnchor(view, anchor, dir) {
  return view === "month" ? addMonths(anchor, dir) : addDays(anchor, 7 * dir);
}

export const weekdayShort = (date) => date.toLocaleDateString(LOCALE, { weekday: "short" });
export const weekdayLong = (date) => date.toLocaleDateString(LOCALE, { weekday: "long" });
export const monthName = (date) => date.toLocaleDateString(LOCALE, { month: "long" });
/** "Tuesday, October 20" */
export const formatDayLong = (date) => date.toLocaleDateString(LOCALE, { weekday: "long", month: "long", day: "numeric" });

/** "8 AM", "12 PM" for an hour of the day, 0 to 23. */
export function hourLabel(hour) {
  const n = hour % 12 === 0 ? 12 : hour % 12;
  return `${n} ${hour < 12 ? "AM" : "PM"}`;
}

/** What the calendar is showing: "October 18 to 24, 2026" or "October 2026". */
export function rangeTitle(view, anchor) {
  if (view === "month") return `${monthName(anchor)} ${anchor.getFullYear()}`;
  const days = weekDays(anchor);
  const a = days[0];
  const b = days[6];
  if (a.getFullYear() !== b.getFullYear()) {
    return `${monthName(a)} ${a.getDate()}, ${a.getFullYear()} to ${monthName(b)} ${b.getDate()}, ${b.getFullYear()}`;
  }
  if (a.getMonth() !== b.getMonth()) {
    return `${monthName(a)} ${a.getDate()} to ${monthName(b)} ${b.getDate()}, ${b.getFullYear()}`;
  }
  return `${monthName(a)} ${a.getDate()} to ${b.getDate()}, ${b.getFullYear()}`;
}

export const meetingCount = (n) => (n === 1 ? "1 meeting" : `${n} meetings`);

/** One line under the title: how much is booked in what is showing. The
 *  week's line names no week ("this week" would be wrong for any other one):
 *  the title above it says which. */
export function rangeSummary(view, anchor, count) {
  const what = count === 0 ? "No confirmed meetings" : count === 1 ? "1 confirmed meeting" : `${count} confirmed meetings`;
  return view === "month" ? `${what} in ${monthName(anchor)}` : what;
}

// ─── Requests ─────────────────────────────────────────────────────────────────

const nameOf = (request) => String(request?.student_name || "Student");

/** Sort the school's requests into the three places they show: waiting
 *  (whoever has waited longest first), confirmed meetings (by time) and the
 *  ones that are closed (newest first). Only a confirmed request with a real
 *  time goes on the calendar. */
export function splitRequests(requests) {
  const pending = [];
  const meetings = [];
  const closed = [];
  for (const r of Array.isArray(requests) ? requests : []) {
    if (!r || typeof r !== "object" || !r.id) continue;
    const at = toDate(r.meeting_at);
    if (r.status === "pending") pending.push(r);
    else if (r.status === "confirmed" && at) meetings.push({ request: r, at });
    else closed.push(r);
  }
  const made = (r) => toDate(r.created_at)?.getTime() ?? 0;
  pending.sort((a, b) => made(a) - made(b));
  meetings.sort((a, b) => a.at.getTime() - b.at.getTime() || nameOf(a.request).localeCompare(nameOf(b.request)));
  closed.sort((a, b) => made(b) - made(a));
  return { pending, meetings, closed };
}

/** Meetings by the local day they fall on: Map of day key to its meetings,
 *  in time order. */
export function meetingsByDay(meetings) {
  const byDay = new Map();
  for (const entry of meetings) {
    const key = dayKey(entry.at);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(entry);
  }
  return byDay;
}

/** The hours the week grid shows for these meetings: the school day, made
 *  longer when a meeting is earlier or later than it. */
export function weekHours(entries) {
  let from = FIRST_HOUR;
  let to = LAST_HOUR;
  for (const entry of entries) {
    const h = entry.at.getHours();
    if (h < from) from = h;
    if (h > to) to = h;
  }
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

/** The times a student offered, in time order, each marked `passed` when it
 *  is no longer ahead of `now`. A time given twice shows once. */
export function offeredTimes(request, now) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(request?.times) ? request.times : []) {
    const at = toDate(raw);
    if (!at || seen.has(at.getTime())) continue;
    seen.add(at.getTime());
    out.push({ key: String(at.getTime()), at, passed: at.getTime() <= now.getTime() });
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** "Asked today", "Asked 3 days ago", "Asked Sep 28": by calendar days, here. */
export function askedAgo(iso, now) {
  const at = toDate(iso);
  if (!at) return "";
  const days = Math.round((startOfDay(now).getTime() - startOfDay(at).getTime()) / DAY_MS);
  if (days <= 0) return "Asked today";
  if (days === 1) return "Asked yesterday";
  if (days < 14) return `Asked ${days} days ago`;
  return `Asked ${at.toLocaleDateString(LOCALE, { month: "short", day: "numeric" })}`;
}

/** A closed request, in a word or two. */
export function statusText(status) {
  if (status === "declined") return "Declined";
  if (status === "cancelled") return "Cancelled by the student";
  if (status === "confirmed") return "Confirmed";
  if (status === "pending") return "Waiting for your answer";
  return "Closed";
}

// ─── Words ────────────────────────────────────────────────────────────────────

/** "Ada C." for a calendar square. The full name is always in the label. */
export function shortName(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "Student";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

/** "Ada" for a square of the month, where there is room for little more. */
export function givenName(name) {
  return String(name || "").trim().split(/\s+/).filter(Boolean)[0] || "Student";
}

/** "Grade 11", or "" when the grade is not on file. */
export function gradeText(grade) {
  const g = Number(grade);
  return grade !== null && grade !== undefined && grade !== "" && Number.isFinite(g) && g > 0 ? `Grade ${Math.trunc(g)}` : "";
}

/** The start of a message, cut at a word, for a row in the waiting list. */
export function firstWords(message, max = 110) {
  const text = String(message || "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  const kept = space > max * 0.6 ? cut.slice(0, space) : cut;
  return `${kept.replace(/[\s.,;:!?-]+$/, "")}...`;
}

// ─── Picking another time ─────────────────────────────────────────────────────
// A datetime-local field speaks in local parts ("2026-10-20T14:30"), with no
// zone. It is read back as that wall-clock time here, which is what the
// counselor meant, and sent on as an instant.

/** A Date as a datetime-local value. */
export function toInputValue(date) {
  return `${dayKey(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** A datetime-local value as a Date, or null when it is not a real one. */
export function fromInputValue(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(value || ""));
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  if (mo < 1 || mo > 12 || h > 23 || mi > 59) return null;
  const date = new Date(y, mo - 1, d, h, mi);
  // February 30 would roll over into March: refuse it instead.
  if (Number.isNaN(date.getTime()) || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return date;
}

/** Why a time cannot be confirmed: "missing", "past", "far" (beyond 120
 *  days), or "" when it can. The database checks again. */
export function timeProblem(date, now) {
  if (!date) return "missing";
  if (date.getTime() <= now.getTime()) return "past";
  if (date.getTime() > now.getTime() + MAX_AHEAD_DAYS * DAY_MS) return "far";
  return "";
}

/** The field steps in five minutes. A browser counts its steps from `min`, so
 *  `min` sits on a five-minute mark or the picker would offer 10:07, 10:12. */
export const INPUT_STEP_SECONDS = 300;

/** The field's earliest and latest values, so the browser's picker greys out
 *  the rest. Both sit inside the allowed range, never on its edge. */
export function inputBounds(now) {
  const step = INPUT_STEP_SECONDS * 1000;
  return {
    min: toInputValue(new Date(Math.ceil((now.getTime() + 60000) / step) * step)),
    max: toInputValue(new Date(Math.floor((now.getTime() + MAX_AHEAD_DAYS * DAY_MS - 60000) / step) * step)),
  };
}
