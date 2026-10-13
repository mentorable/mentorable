import { budgetOf } from "../../outreach/options.js";
import { SURFACE } from "../../../ui/tokens.js";

// Small shared bits for Quill's home (the page, its two sections, the cards
// and the two sheets), on top of the app's kit (components/ui) and the Agents
// pieces that are not one agent's alone (MascotSays, Sheet).
//
// Nothing here reads, checks or changes the words of an essay. The brainstorm
// helpers only lay a student's own answers out as the plain lines a card keeps.

/** The mascot key for Quill (components/agents/Mascot.jsx). */
export const QUILL = "quill";

export const HOME_PATH = "/agents/essay";
/** The editor for one essay. */
export const essayPath = (id) => `${HOME_PATH}/${encodeURIComponent(id)}`;

export { budgetOf };

// The lengths the database and the backend check (20261011_agents_essay.sql,
// service.create_essay, talk.clean_messages), so the page can say them first.
export const AREA_MIN = 2;
export const AREA_MAX = 80;
export const NOTES_MAX = 6000;
export const ANSWER_MAX = 600;      // one brainstorm answer
export const SCHOOL_MIN = 2;
export const SCHOOL_MAX = 200;
export const PROMPT_MIN = 10;
export const PROMPT_MAX = 1500;
export const TITLE_MAX = 120;

/** `text` cut to `max` characters, never through the middle of an emoji. */
export function clip(text, max) {
  const s = typeof text === "string" ? text : "";
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  return /[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut;
}

/** A title short enough for a toast. */
export function short(text, n = 60) {
  const s = String(text || "this idea");
  return s.length > n ? `${s.slice(0, n - 3).trimEnd()}...` : s;
}

/** "1 answer", "3 answers". */
export function plural(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/** A JSON list column as plain strings, whatever came back. */
export function listOf(value) {
  return Array.isArray(value) ? value.filter((s) => typeof s === "string" && s.trim()) : [];
}

// Refusals that are a plain "not now" or "fix this first" rather than
// something breaking: shown in amber, never as an error.
const NOT_NOW = new Set([
  "thin_record", "no_topic_finds", "nothing_new", "busy", "essays_full", "budget_unavailable", "not_available",
  "bad_kind", "bad_school", "bad_prompt", "bad_limit", "bad_start",
]);
/** "warn" for a refusal the student can wait out or fix, "error" for a failure. */
export function refusalTone(err) {
  return NOT_NOW.has(err?.code || err?.error) ? "warn" : "error";
}

// ── Ideas ────────────────────────────────────────────────────────────────────

/** A topic row as the page uses it (as src/lib/essay.js reads them): the list
 *  columns always arrays, the notes always text. null for anything that is
 *  not a row. Rows from the backend (a find, a brainstorm) pass through here. */
export function asTopic(row) {
  if (!row || typeof row !== "object" || !row.id) return null;
  return {
    ...row,
    area: typeof row.area === "string" ? row.area : "",
    evidence: Array.isArray(row.evidence) ? row.evidence : [],
    questions: Array.isArray(row.questions) ? row.questions : [],
    notes: typeof row.notes === "string" ? row.notes : "",
    status: typeof row.status === "string" ? row.status : "exploring",
  };
}

/** Board order, as loadHome reads it: by position, newest first within a tie. */
export function sortTopics(list) {
  const pos = (t) => (Number.isFinite(Number(t.position)) ? Number(t.position) : 0);
  return [...list].sort((a, b) => pos(a) - pos(b)
    || String(b.created_at || "").localeCompare(String(a.created_at || "")));
}

const EVIDENCE_LABELS = {
  activity: "Activity", award: "Award", course: "Course", major: "Major",
  theme: "From your interview", voice: "In your words",
};

/** What in the record points to an idea, as [{ label, text, quote }]. The
 *  text is the record's own wording (the backend copies it from the row);
 *  `quote` marks the student's own words from their interview. */
export function evidenceOf(topic) {
  const out = [];
  for (const e of (Array.isArray(topic?.evidence) ? topic.evidence : [])) {
    const text = e && typeof e.text === "string" ? e.text.trim() : "";
    if (!text) continue;
    out.push({ label: EVIDENCE_LABELS[e.kind] || "Your record", text, quote: e.kind === "voice" });
  }
  return out;
}

// ── The brainstorm ───────────────────────────────────────────────────────────
// The page holds the conversation as [{ role: "advisor" | "student", content }]
// and sends all of it back each turn. When a talk stops before Quill closes
// it, the page keeps the answers on a card itself, in the same plain lines
// the backend writes (service.talk).

/** One line of a brainstorm as it is sent and kept: single spaces, no line
 *  breaks (the backend flattens them the same way), cut to `max`. */
export function oneLine(text, max) {
  return clip(String(text || "").replace(/\s+/g, " ").trim(), max);
}

/** A brainstorm as the lines kept on a card: "Quill asked: ..." then "You
 *  said: ...", pair by pair. A last question nobody answered is left out. */
export function talkLines(messages) {
  const out = [];
  const list = Array.isArray(messages) ? messages : [];
  for (let i = 0; i + 1 < list.length; i += 2) {
    const q = list[i];
    const a = list[i + 1];
    if (q?.role !== "advisor" || a?.role !== "student") break;
    out.push(`Quill asked: ${q.content}`, `You said: ${a.content}`);
  }
  return out.join("\n");
}

/** A card's notes with a brainstorm's lines added after a blank line. Not
 *  cut: the caller checks it against NOTES_MAX, so no words are dropped
 *  without anyone deciding to. */
export function appendNotes(notes, lines) {
  const base = (typeof notes === "string" ? notes : "").trimEnd();
  return base ? `${base}\n\n${lines}` : lines;
}

// ── Dates ────────────────────────────────────────────────────────────────────
// last_review_at is a timestamp (not a calendar date), so new Date() reads it
// correctly; it is shown as the student's own calendar day.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayNumber = (d) => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);

/** "today", "yesterday", "on Oct 1" (with the year when it is not this one),
 *  or "" when the date cannot be read. */
export function dayPhrase(value, today = new Date()) {
  const d = value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  const diff = dayNumber(today) - dayNumber(d);
  if (diff === 0) return "today";
  if (diff === 1) return "yesterday";
  const label = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return `on ${d.getFullYear() === today.getFullYear() ? label : `${label}, ${d.getFullYear()}`}`;
}

// ── The notebook look ────────────────────────────────────────────────────────
// A notes box is ruled like a page: one faint line under each line of text.
// The rules scroll with the words (background-attachment: local) and start
// under the first line, below the box's top padding.

/** One ruled line, in px: the notes' line height. */
export const RULE = 28;
const RULE_PAD = 9;
const RULE_LINE = "#e9e2d7";

/** Spread over the kit's inputStyle on a notes textarea. */
export const ruledStyle = {
  lineHeight: `${RULE}px`,
  padding: `${RULE_PAD}px 14px ${RULE_PAD + 2}px`,
  background: `repeating-linear-gradient(to bottom, transparent 0, transparent ${RULE - 1}px, ${RULE_LINE} ${RULE - 1}px, `
    + `${RULE_LINE} ${RULE}px) 0 ${RULE_PAD}px no-repeat local, ${SURFACE}`,
};

/** An empty well on a progress meter. */
export const STONE = "#ebe8e3";
