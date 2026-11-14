import { lighten, readableOn } from "../../../lib/theme.js";

// Small shared bits for Poise's three pages (home, call, report) and their
// parts, on top of the app's kit (components/ui) and the Agents pieces that
// are not one agent's alone (MascotSays, Sheet, AgentScene).
//
// Nothing here writes an answer for a student or judges one. It lays out what
// the student said and what Poise's checked notes point at, and it keeps the
// call's credential out of every place but memory (see src/lib/interview.js).

/** The mascot key for Poise (components/agents/Mascot.jsx). */
export const POISE = "poise";

export const HOME_PATH = "/agents/interview";
/** The call screen for one mock. Holds no credential: the signed URL stays in memory. */
export const callPath = (id) => `${HOME_PATH}/${encodeURIComponent(id)}/call`;
/** The report for one mock. */
export const reportPath = (id) => `${HOME_PATH}/${encodeURIComponent(id)}`;

// The lengths the database and the backend check (20261113_agents_interview.sql,
// service.start_mock), so the sheet can say them first.
export const TARGET_MAX = 120;
export const ROLE_MAX = 120;
export const DETAILS_MAX = 1500;

// Fallbacks only: the server's own numbers come with status and with the start.
export const MOCKS_LIMIT = 3;
export const MAX_SECONDS = 600;
export const WARN_SECONDS = 540;
export const FEEDBACK_TRIES_MAX = 2;

/** After the call: ask the server to finish every this often, for this long. */
export const FINISH_EVERY_MS = 3000;
export const FINISH_FOR_MS = 120000;
/** Hanging up before this many seconds asks first. */
export const END_CONFIRM_SECONDS = 60;
/** Live captions kept on screen (in memory, never stored). */
export const CAPTIONS_MAX = 200;

/** A mock the server has not finished yet. */
export const UNFINISHED = new Set(["live", "scoring"]);

export const MODES = [
  { key: "college", label: "College interview", detail: "An alumni or admissions interview for one school." },
  { key: "internship", label: "Internship or program", detail: "An internship, a summer program or a first job." },
];

export const modeLabel = (mode) => (mode === "internship" ? "Internship interview" : "College interview");

/** What the mock was for, in a few words: "Rice University", or "Lab assistant at the city zoo". */
export function targetLine(mock) {
  const target = clean(mock?.target) || "an interview";
  const role = clean(mock?.role);
  return mock?.mode === "internship" && role ? `${role} at ${target}` : target;
}

const clean = (s) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "");

// ── Words ────────────────────────────────────────────────────────────────────

/** "1 mock", "3 mocks". */
export function plural(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/** Text short enough for a toast or a heading. */
export function short(text, n = 60) {
  const s = clean(String(text || ""));
  return s.length > n ? `${s.slice(0, n - 3).trimEnd()}...` : s;
}

/** A call clock: "0:07", "9:00", "10:00". */
export function clock(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** The same clock read aloud: "3 minutes 12 seconds". */
export function clockWords(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (!m) return plural(r, "second");
  return r ? `${plural(m, "minute")} ${plural(r, "second")}` : plural(m, "minute");
}

/** How long a call ran, for a list or a report: "under a minute", "7 min". */
export function minutesLabel(seconds) {
  if (seconds == null || seconds === "") return "";
  const s = Number(seconds);
  if (!Number.isFinite(s) || s < 0) return "";
  if (s < 60) return "under a minute";
  return `${Math.round(s / 60)} min`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayNumber = (d) => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);

/** When a mock happened, in the student's own day: "today", "yesterday",
 *  "Nov 9" (with the year when it is not this one), or "". These are
 *  timestamps, not calendar dates, so new Date() reads them correctly. */
export function dayLabel(raw, now = new Date()) {
  const d = raw ? new Date(raw) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  const days = dayNumber(now) - dayNumber(d);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  const day = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return d.getFullYear() === now.getFullYear() ? day : `${day}, ${d.getFullYear()}`;
}

// ── What the rows hold, read defensively ─────────────────────────────────────
// The backend writes these columns from checked output (rules.validate_feedback),
// so the shapes are known. The page still reads them as if they might not be:
// a field it cannot read is left out, never shown as "undefined".

/** The transcript as [{ who: "interviewer" | "student", text }]. */
export function turnsOf(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((t) => ({
    who: t?.who === "student" ? "student" : "interviewer",
    text: typeof t?.text === "string" ? t.text : "",
  }));
}

function pointOf(raw, turns) {
  const text = clean(raw?.text);
  if (!text) return null;
  const quote = clean(raw?.quote);
  const turn = Number.isInteger(raw?.turn) && turns[raw.turn]?.who === "student" ? raw.turn : null;
  return { text, quote: quote && turn !== null ? quote : "", turn: quote && turn !== null ? turn : null };
}

/** The stored feedback as { questions, habits, thin }, each point
 *  { text, quote, turn } with a quote only where it has a student turn. */
export function feedbackOf(raw, turns) {
  const f = raw && typeof raw === "object" ? raw : {};
  const questions = (Array.isArray(f.questions) ? f.questions : []).map((q, i) => {
    const turn = Number.isInteger(q?.turn) ? q.turn : null;
    const asked = clean(q?.question) || (turn !== null && turns[turn]?.who === "interviewer" ? clean(turns[turn].text) : "");
    return { key: `q${i}`, turn, question: asked, worked: pointOf(q?.worked, turns), next: pointOf(q?.try, turns) };
  }).filter((q) => q.worked || q.next);
  const habits = (Array.isArray(f.habits) ? f.habits : []).map((h) => pointOf(h, turns)).filter(Boolean);
  return { questions, habits, thin: f.thin === true };
}

/** One rubric score as { score, reason }, or null when it cannot be read. */
export function scoreOf(scores, key) {
  const s = scores && typeof scores === "object" ? scores[key] : null;
  const n = s?.score;
  if (!Number.isInteger(n) || n < 1 || n > 5) return null;
  return { score: n, reason: clean(s?.reason) };
}

/** Who said a line, from the voice SDK's message: the student is "user"
 *  (role, or the older `source`), anything else is the interviewer. The same
 *  reading as onboarding's voice call. */
export function whoOf(msg) {
  const role = msg?.role ?? (msg?.source === "ai" ? "agent" : "user");
  return role === "user" ? "student" : "interviewer";
}

// ── Finding a quote in a turn ────────────────────────────────────────────────
// The backend matched every quote against the student's words case-blind,
// with curly quotes straightened and runs of space read as one. This finds the
// same passage again, as offsets into the turn as it is stored, to mark it.

const STRAIGHT = { "‘": "'", "’": "'", "‚": "'", "‛": "'", "“": "\"", "”": "\"", "„": "\"", "′": "'" };

function folded(text) {
  const chars = [];
  const at = [];
  let space = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      if (!space && chars.length) { chars.push(" "); at.push(i); }
      space = true;
      continue;
    }
    space = false;
    chars.push((STRAIGHT[ch] || ch).toLowerCase());
    at.push(i);
  }
  if (chars[chars.length - 1] === " ") { chars.pop(); at.pop(); }
  return { text: chars.join(""), at };
}

/** [start, end) of `quote` inside `text`, or null when it is not there. */
export function quoteSpan(text, quote) {
  if (typeof text !== "string" || typeof quote !== "string") return null;
  const hay = folded(text);
  const needle = folded(quote).text;
  if (!needle) return null;
  const k = hay.text.indexOf(needle);
  if (k < 0) return null;
  return [hay.at[k], hay.at[k + needle.length - 1] + 1];
}

// ── The microphone ───────────────────────────────────────────────────────────

/** Ask for the microphone and let it go again at once (the voice call takes
 *  its own). "ok", "denied", "missing" (no microphone found) or "unsupported"
 *  (this browser, or a page not served over https, has no microphone API). */
export async function micCheck() {
  const media = typeof navigator !== "undefined" ? navigator.mediaDevices : null;
  if (!media || typeof media.getUserMedia !== "function") return "unsupported";
  try {
    const stream = await media.getUserMedia({ audio: true });
    for (const track of stream.getTracks()) { try { track.stop(); } catch { /* already stopped */ } }
    return "ok";
  } catch (e) {
    return e?.name === "NotFoundError" || e?.name === "OverconstrainedError" ? "missing" : "denied";
  }
}

// ── A line for the report, carried across one navigation ─────────────────────
// When a mock finishes on the call page with something to say ("this one
// still counts"), the report it opens shows it once. Memory only, like the
// call itself: a refresh simply loses the line.

const notes = new Map();
export function holdNote(id, text) {
  if (id && typeof text === "string" && text.trim()) notes.set(String(id), text.trim());
}
export function takeNote(id) {
  const key = String(id || "");
  const text = notes.get(key) || null;
  notes.delete(key);
  return text;
}

// ── Motion ───────────────────────────────────────────────────────────────────

export function reducedMotion() {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}

/** "smooth", or "auto" for a student who asked for less motion. */
export const scrollBehavior = () => (reducedMotion() ? "auto" : "smooth");

export const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

// ── The few rules inline styles cannot express ───────────────────────────────
// A quoted turn in the transcript, and the passage inside it. Told apart
// without colour: the turn gets a thick left edge and a "Quoted" label, the
// passage an underline. The tint is extra.

export const TURN_CLASS = "pi-turn";
export const MARK_CLASS = "pi-mark";

const INTERVIEW_CSS = `
.${TURN_CLASS}:focus { outline: none; }
.${TURN_CLASS}:focus-visible { outline: 3px solid var(--ag-ring, #1d4ed8); outline-offset: 2px; }
.${MARK_CLASS} { background: var(--pi-tint, #dbe4fb); color: inherit; border-radius: 3px; padding: 2px 0;
  text-decoration-line: underline; text-decoration-color: var(--pi-line, #1d4ed8); text-decoration-thickness: 3px;
  text-underline-offset: 4px; -webkit-box-decoration-break: clone; box-decoration-break: clone; }
`;
if (typeof document !== "undefined" && !document.querySelector("style[data-poise-ui]")) {
  const el = document.createElement("style");
  el.dataset.poiseUi = "";
  el.textContent = INTERVIEW_CSS;
  document.head.appendChild(el);
}

/** The highlight colours for the student's accent, as CSS variables for the
 *  element that holds the marks: a real tint (ink text stays readable on it)
 *  and an underline in the accent at 3:1 or better on that tint. */
export function markVars(ink) {
  const tint = lighten(ink.accent, 0.72);
  return { "--pi-tint": tint, "--pi-line": readableOn(ink.accent, tint, 3) };
}
