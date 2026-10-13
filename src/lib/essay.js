import { supabase } from "./supabase.js";

// Quill's desk: the student's essays, their saved versions, Quill's reviews,
// and the ideas board (essays, essay_versions, essay_reviews, essay_topics).
//
// Who writes what (RLS plus column grants; see 20261011_agents_essay.sql):
//   * An essay is created by the backend (so the cap of 8 holds). After that
//     its words are the student's: this file saves the title, the prompt, the
//     word limit, the body, the status and the idea it grew from.
//   * Versions and reviews are written by the backend only. A student reads
//     and deletes their own, and on a review may change one column: the
//     `responses` map, their own answers to Quill's notes, which never leave
//     the database.
//   * An idea card can be the student's own (added here) or Quill's (from
//     their record or a brainstorm). Either way the student may rename it,
//     write notes on it, move it and delete it; the evidence and the questions
//     are the backend's.
// Every write here is filtered to the student's columns first (sending any
// other column fails the whole update).
//
// Nothing in this file reads, checks or changes the words of an essay. It
// counts them and stores them.

// ─── The Common App prompts (the one copy in the repo) ────────────────────────
// The essay row stores the chosen `prompt_key` and the `prompt_text` copied
// from here, so the backend reads prompt_text only. Show PROMPTS_NOTE wherever
// these are shown.

export const COMMON_APP_PROMPTS = [
  {
    key: "1",
    short: "Background, identity, interest or talent",
    text: "Some students have a background, identity, interest, or talent that is so meaningful they believe their application would be incomplete without it. If this sounds like you, then please share your story.",
  },
  {
    key: "2",
    short: "A challenge, setback or failure",
    text: "The lessons we take from obstacles we encounter can be fundamental to later success. Recount a time when you faced a challenge, setback, or failure. How did it affect you, and what did you learn from the experience?",
  },
  {
    key: "3",
    short: "A belief or idea you questioned",
    text: "Reflect on a time when you questioned or challenged a belief or idea. What prompted your thinking? What was the outcome?",
  },
  {
    key: "4",
    short: "Something someone did for you",
    text: "Reflect on something that someone has done for you that has made you happy or thankful in a surprising way. How has this gratitude affected or motivated you?",
  },
  {
    key: "5",
    short: "An accomplishment, event or realization",
    text: "Discuss an accomplishment, event, or realization that sparked a period of personal growth and a new understanding of yourself or others.",
  },
  {
    key: "6",
    short: "A topic, idea or concept that captivates you",
    text: "Describe a topic, idea, or concept you find so engaging that it makes you lose all track of time. Why does it captivate you? What or who do you turn to when you want to learn more?",
  },
  {
    key: "7",
    short: "A topic of your choice",
    text: "Share an essay on any topic of your choice. It can be one you've already written, one that responds to a different prompt, or one of your own design.",
  },
];

export const PROMPTS_NOTE = "Common App sets these each year. Check commonapp.org for this cycle's wording.";

// The limits the backend enforces (rules.py and service.py), so the page can
// say them first.
export const PS_MIN = 250, PS_MAX = 650, LIMIT_MIN = 50, LIMIT_MAX = 1000, REVIEW_MIN_WORDS = 50, BODY_MAX = 20000,
  ESSAYS_MAX = 8, VERSIONS_MAX = 30, TALK_QUESTIONS = 6;

export const KINDS = [
  { key: "personal_statement", label: "Personal statement" },
  { key: "supplement", label: "Supplement" },
];

export const ESSAY_STATUS = [
  { key: "idea", label: "Idea" },
  { key: "drafting", label: "Drafting" },
  { key: "revising", label: "Revising" },
  { key: "done", label: "Done" },
];

export const TOPIC_STATUS = [
  { key: "exploring", label: "Exploring" },
  { key: "chosen", label: "Writing about it" },
  { key: "parked", label: "Set aside" },
];

/** The seven checks of a review, in order, with the words a student sees. */
export const CHECKS = [
  { key: "prompt", label: "Answers the prompt" },
  { key: "specificity", label: "Specific details" },
  { key: "presence", label: "You are in it" },
  { key: "point", label: "The point" },
  { key: "length", label: "Length" },
  { key: "consistency", label: "Matches your record" },
  { key: "overlap", label: "Not a repeat" },
];

/** Where a brainstorm can begin: the keys and words of the backend's
 *  rules.TALK_STARTS, in its order. */
export const TALK_STARTS = [
  { key: "personal", label: "Something personal about who you are" },
  { key: "challenge", label: "A challenge, setback or failure" },
  { key: "growth", label: "A time you changed or grew" },
  { key: "curiosity", label: "Something you can't stop thinking about" },
  { key: "people", label: "Your family, a community, or someone who shaped you" },
  { key: "open", label: "Not sure yet" },
];

const PROMPT_KEYS = new Set(COMMON_APP_PROMPTS.map((p) => p.key));
const ESSAY_STATUS_KEYS = new Set(ESSAY_STATUS.map((s) => s.key));
const TOPIC_STATUS_KEYS = new Set(TOPIC_STATUS.map((s) => s.key));

// Column lengths the database checks.
const TITLE_MAX = 120;
const PROMPT_MAX = 1500;
const AREA_MIN = 2;
const AREA_MAX = 80;
const TOPIC_NOTES_MAX = 6000;
// A student's answer to one note, and the whole map (the column refuses much
// over 16 KB, so the map is measured before it is sent).
const ANSWER_MAX = 800;
const RESPONSES_MAX_BYTES = 15000;

/** A read or write that failed, with a message fit to show. */
export class EssayError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "EssayError";
    this.code = code;
  }
}

// ─── Words and length (pure) ──────────────────────────────────────────────────

// The backend counts with Python's `len(text.split())`. This is the same set
// of whitespace characters, so the live counter and a review never disagree
// by a word. (JavaScript's own \s is close but not equal: it counts a
// byte-order mark as a space and misses a few control characters.)
const WHITESPACE = /[\t\n\v\f\r\x1c-\x1f \x85\xa0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+/;

/** Words separated by any whitespace; 0 for nothing. */
export function countWords(text) {
  if (typeof text !== "string" || !text) return 0;
  let n = 0;
  for (const word of text.split(WHITESPACE)) if (word) n += 1;
  return n;
}

/** { min, max }: 250 and 650 for a personal statement whatever its row says,
 *  { min: null, max: word_limit } for a supplement. */
export function wordBounds(essay) {
  if (essay?.kind === "personal_statement") return { min: PS_MIN, max: PS_MAX };
  const limit = Math.trunc(Number(essay?.word_limit));
  return { min: null, max: Number.isFinite(limit) && limit >= LIMIT_MIN && limit <= LIMIT_MAX ? limit : PS_MAX };
}

/** "empty" | "under" | "ok" | "over". Only a personal statement has a minimum
 *  to be under. */
export function lengthState(essay, words) {
  const n = Number(words) || 0;
  if (n <= 0) return "empty";
  const { min, max } = wordBounds(essay);
  if (n > max) return "over";
  if (min !== null && n < min) return "under";
  return "ok";
}

/** What the essay answers, in a few words: "Prompt 2" for a personal
 *  statement, the school's name for a supplement, or "No prompt yet". */
export function promptLabel(essay) {
  if (!essay) return "No prompt yet";
  if (essay.kind === "supplement") {
    const school = typeof essay.school_name === "string" ? essay.school_name.trim() : "";
    return school || "No prompt yet";
  }
  return PROMPT_KEYS.has(essay.prompt_key) ? `Prompt ${essay.prompt_key}` : "No prompt yet";
}

// ─── Review helpers (pure) ────────────────────────────────────────────────────

const RESPONSE_STATES = new Set(["answered", "dismissed"]);

/** The notes of a review the student has neither answered nor dismissed. */
export function openNotes(review) {
  const notes = Array.isArray(review?.notes) ? review.notes : [];
  const responses = review?.responses && typeof review.responses === "object" ? review.responses : {};
  return notes.filter((n) => n && !RESPONSE_STATES.has(responses[n.id]?.state));
}

// Quill's offsets count characters the way Python does (code points). A
// JavaScript string counts UTF-16 units, so one emoji is two. For a body with
// such characters, this is where each code point starts, with the body's
// length as the last entry; null when the two counts agree.
function codePointStarts(body) {
  if (!/[\uD800-\uDBFF][\uDC00-\uDFFF]/.test(body)) return null;
  const starts = [];
  let at = 0;
  for (const ch of body) { starts.push(at); at += ch.length; }
  starts.push(at);
  return starts;
}

/**
 * The body cut into pieces for a read-only view with highlighted quotes:
 * [{ text, id }], `id` the span's id or null for plain text. `spans` are
 * notes and cuts ({ id, start, end }, offsets as the backend stored them).
 *
 * The pieces, joined, are always exactly the body: no character is lost or
 * shown twice, whatever the spans say. Spans may come in any order. One that
 * runs past the end is cut to fit; an empty, backwards or id-less one is
 * ignored. Where two overlap, the one that starts earlier in the text keeps
 * the shared words (the first given wins a tie) and the later one keeps only
 * what is left after it, so every id marks at most one piece. A span that
 * sits wholly inside an earlier one gets no piece: its note has no highlight
 * to scroll to.
 */
export function splitByHighlights(body, spans) {
  const text = typeof body === "string" ? body : "";
  if (!text) return [];
  const starts = codePointStarts(text);
  const count = starts ? starts.length - 1 : text.length;        // characters, as the backend counts
  const unit = (i) => (starts ? starts[i] : i);                  // where character i starts in `text`

  const wanted = [];
  (Array.isArray(spans) ? spans : []).forEach((span, order) => {
    if (!span || (typeof span.id !== "string" && typeof span.id !== "number") || span.id === "") return;
    const start = Number(span.start);
    const end = Number(span.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return;
    const from = Math.min(count, Math.max(0, Math.trunc(start)));
    const to = Math.min(count, Math.max(0, Math.trunc(end)));
    if (to > from) wanted.push({ id: span.id, from, to, order });
  });
  wanted.sort((a, b) => a.from - b.from || a.order - b.order);

  const pieces = [];
  const seen = new Set();
  let at = 0;   // the first character not yet in a piece
  for (const span of wanted) {
    if (seen.has(span.id)) continue;             // the same id given twice: its first place stands
    const from = Math.max(span.from, at);
    if (span.to <= from) continue;               // swallowed by an earlier span
    if (from > at) pieces.push({ text: text.slice(unit(at), unit(from)), id: null });
    pieces.push({ text: text.slice(unit(from), unit(span.to)), id: span.id });
    seen.add(span.id);
    at = span.to;
  }
  if (at < count) pieces.push({ text: text.slice(unit(at)), id: null });
  return pieces;
}

// ─── Writes: only the student's columns ──────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v) => typeof v === "string" && UUID_RE.test(v);
const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key) && obj[key] !== undefined;
const asText = (v) => (typeof v === "string" ? v : v == null ? "" : String(v));

// The database's column grants on essays for the `authenticated` role
// (word_count and updated_at too, which saveEssay sets itself).
const ESSAY_UPDATE_COLUMNS = ["title", "prompt_key", "prompt_text", "word_limit", "body", "status", "topic_id"];

function cleanEssay(fields) {
  const out = {};
  for (const key of ESSAY_UPDATE_COLUMNS) {
    if (!has(fields, key)) continue;
    const v = fields[key];
    switch (key) {
      case "title": {
        // An emptied title is left as it was rather than refused: the database
        // will not take one, and a title box caught mid-edit must never hold
        // up the save of the essay's words travelling in the same patch.
        const title = asText(v).replace(/\s+/g, " ").trim().slice(0, TITLE_MAX);
        if (title) out.title = title;
        break;
      }
      case "prompt_key":
        if (v === null || v === "") { out.prompt_key = null; break; }
        if (!PROMPT_KEYS.has(String(v))) throw new EssayError("Pick one of the seven prompts.", "bad_prompt");
        out.prompt_key = String(v);
        break;
      case "prompt_text":
        out.prompt_text = asText(v).slice(0, PROMPT_MAX);
        break;
      case "word_limit": {
        const limit = Number(v);
        if (!Number.isInteger(limit) || limit < LIMIT_MIN || limit > LIMIT_MAX) {
          throw new EssayError(`Set the word limit, from ${LIMIT_MIN} to ${LIMIT_MAX}.`, "bad_limit");
        }
        out.word_limit = limit;
        break;
      }
      case "body": {
        // Never clipped: an essay that lost its ending without a word would
        // be worse than one that would not save.
        const body = asText(v);
        if (body.length > BODY_MAX) {
          throw new EssayError(`This is longer than ${BODY_MAX.toLocaleString("en-US")} characters, the most Quill can keep in one essay.`, "too_long");
        }
        out.body = body;
        out.word_count = countWords(body);
        break;
      }
      case "status":
        if (!ESSAY_STATUS_KEYS.has(v)) throw new EssayError("That isn't a stage an essay can be at.", "bad_status");
        out.status = v;
        break;
      case "topic_id":
        if (v === null || v === "") { out.topic_id = null; break; }
        if (!isUuid(v)) throw new EssayError("That idea was not found.", "bad_topic");
        out.topic_id = v;
        break;
      default:
        break;
    }
  }
  // A picked prompt always travels with its wording: the backend reads
  // prompt_text alone, so a key saved without it would leave Quill with no
  // prompt to read the essay against.
  if (out.prompt_key && !has(fields, "prompt_text")) {
    out.prompt_text = COMMON_APP_PROMPTS.find((p) => p.key === out.prompt_key).text;
  }
  return out;
}

// The grants on essay_topics: a student's own fields on any card.
const TOPIC_UPDATE_COLUMNS = ["area", "notes", "status", "position"];

/** How many characters the database will count in `text` (Postgres's
 *  char_length counts code points). A JavaScript string's own length counts
 *  UTF-16 units, so it calls one emoji two. */
export function countChars(text) {
  return typeof text === "string" ? Array.from(text).length : 0;
}

function cleanArea(v) {
  const area = asText(v).replace(/\s+/g, " ").trim();
  // Trimmed first, then counted the way the column's CHECK counts. By its own
  // length a name of one emoji is two long: it passed here, the database
  // refused it, and the student was told to "try again" with the same name.
  const n = countChars(area);
  if (n < AREA_MIN || n > AREA_MAX) {
    throw new EssayError(`Name the idea in ${AREA_MIN} to ${AREA_MAX} characters.`, "bad_area");
  }
  return area;
}

function cleanTopicNotes(v) {
  const notes = asText(v);
  if (notes.length > TOPIC_NOTES_MAX) {
    throw new EssayError(`These notes are longer than ${TOPIC_NOTES_MAX.toLocaleString("en-US")} characters, the most one card holds.`, "too_long");
  }
  return notes;
}

function cleanTopic(fields) {
  const out = {};
  for (const key of TOPIC_UPDATE_COLUMNS) {
    if (!has(fields, key)) continue;
    const v = fields[key];
    switch (key) {
      case "area":
        out.area = cleanArea(v);
        break;
      case "notes":
        out.notes = cleanTopicNotes(v);
        break;
      case "status":
        if (!TOPIC_STATUS_KEYS.has(v)) throw new EssayError("That isn't a place an idea can be.", "bad_status");
        out.status = v;
        break;
      case "position":
        if (!Number.isFinite(Number(v))) throw new EssayError("Couldn't place that idea.", "bad_position");
        out.position = Number(v);
        break;
      default:
        break;
    }
  }
  return out;
}

const NOTE_ID_RE = /^[a-z]{1,3}\d{1,3}$/;   // "n1".."n12" for notes, "c1".."c6" for cuts

/** The responses map as the column may hold it: a known state and a clipped
 *  answer per note id, nothing else. */
function cleanResponses(responses) {
  if (!responses || typeof responses !== "object" || Array.isArray(responses)) {
    throw new EssayError("Couldn't save your answers. Try again.", "bad_responses");
  }
  const out = {};
  for (const [id, r] of Object.entries(responses)) {
    if (!NOTE_ID_RE.test(id) || !r || !RESPONSE_STATES.has(r.state)) continue;
    out[id] = { state: r.state, answer: asText(r.answer).slice(0, ANSWER_MAX) };
  }
  if (new TextEncoder().encode(JSON.stringify(out)).length > RESPONSES_MAX_BYTES) {
    throw new EssayError("Your answers on this review are too long to save together. Shorten one and try again.", "too_long");
  }
  return out;
}

// ─── Reads ────────────────────────────────────────────────────────────────────
// Rows read here have the shape the backend returns: every column except
// user_id.

const ESSAY_LIST_COLUMNS = "id, kind, title, prompt_key, prompt_text, college_id, school_name, word_limit, "
  + "word_count, status, topic_id, created_at, updated_at";
const ESSAY_COLUMNS = `${ESSAY_LIST_COLUMNS}, body`;
const TOPIC_COLUMNS = "id, area, source, evidence, questions, notes, status, position, created_at, updated_at";
const VERSION_LIST_COLUMNS = "id, essay_id, word_count, source, created_at";
const VERSION_COLUMNS = `${VERSION_LIST_COLUMNS}, body`;
// A review is read whole (id, essay_id, version_id, summary, word_count,
// word_limit, word_min, checks, notes, cuts, responses, created_at), and with
// it the prompt it was read against (prompt_key, prompt_text) on rows that
// carry one. Naming those two here would fail every read against a table
// without them, so the row is asked for as it is and user_id is dropped.
const REVIEW_COLUMNS = "*";
const HOME_LIMIT = 100;      // far more than the 8 essays and the handful of ideas a student keeps
const REVIEW_LIMIT = 50;

const NOT_FOUND = "PGRST116";   // PostgREST: .single() matched no row

// A write that gets no answer is given up on after this long, and its request
// is cancelled: a connection that has died without saying so would otherwise
// hold every later save behind it, and a request left alive could still reach
// the database after a newer one and put older words back.
const WRITE_TIMEOUT_MS = 20000;
const TIMED_OUT = { data: null, error: { code: "timeout", message: "no answer in time" } };

/** One Supabase request with a deadline. `build(signal)` returns the query;
 *  resolves to its { data, error }, or to an error when the time is up. */
async function bounded(build, ms = WRITE_TIMEOUT_MS) {
  const control = new AbortController();
  let timer = null;
  const late = new Promise((resolve) => {
    timer = setTimeout(() => { control.abort(); resolve(TIMED_OUT); }, ms);
  });
  try {
    return await Promise.race([build(control.signal), late]);
  } finally {
    clearTimeout(timer);
  }
}

/** Two timestamps for the same moment, however each is written. */
function sameMoment(a, b) {
  const x = Date.parse(a || "");
  return Number.isFinite(x) && x === Date.parse(b || "");
}

/** A topic row as the page uses it: the list columns always arrays. */
function toTopic(row) {
  if (!row) return null;
  return {
    ...row,
    evidence: Array.isArray(row.evidence) ? row.evidence : [],
    questions: Array.isArray(row.questions) ? row.questions : [],
    notes: typeof row.notes === "string" ? row.notes : "",
  };
}

/** A review row as the page uses it: the lists always arrays, the responses
 *  always an object. */
function toReview(row) {
  if (!row) return null;
  const out = {
    ...row,
    checks: Array.isArray(row.checks) ? row.checks : [],
    notes: Array.isArray(row.notes) ? row.notes : [],
    cuts: Array.isArray(row.cuts) ? row.cuts : [],
    responses: row.responses && typeof row.responses === "object" && !Array.isArray(row.responses) ? row.responses : {},
  };
  delete out.user_id;
  return out;
}

/**
 * Quill's desk: { essays, topics }. Essays come without their text, the one
 * last worked on first, each with `last_review_at` (when Quill last read it,
 * null when it never has, or undefined when that could not be read). Topics
 * come in board order.
 */
export async function loadHome(userId) {
  const [essays, topics, reviews] = await Promise.all([
    supabase.from("essays").select(ESSAY_LIST_COLUMNS).eq("user_id", userId)
      .order("updated_at", { ascending: false }).limit(HOME_LIMIT),
    supabase.from("essay_topics").select(TOPIC_COLUMNS).eq("user_id", userId)
      .order("position", { ascending: true }).order("created_at", { ascending: false }).limit(HOME_LIMIT),
    supabase.from("essay_reviews").select("essay_id, created_at").eq("user_id", userId)
      .order("created_at", { ascending: false }).limit(HOME_LIMIT),
  ]);
  if (essays.error || topics.error) throw new EssayError("Couldn't load your essays. Try again.", "load");

  // The newest review of each essay. A failed read only leaves the dates off
  // (undefined, so a card never says "not read yet" about an essay Quill read).
  const lastRead = new Map();
  for (const r of (reviews.error ? [] : reviews.data || [])) {
    if (!lastRead.has(r.essay_id)) lastRead.set(r.essay_id, r.created_at);
  }
  const readAt = (id) => (reviews.error ? undefined : lastRead.get(id) || null);
  return {
    essays: (essays.data || []).map((e) => ({ ...e, last_review_at: readAt(e.id) })),
    topics: (topics.data || []).map(toTopic),
  };
}

/**
 * One essay with its text: { essay, versions, reviews }, or null when it is
 * not the student's or no longer exists. Versions come without their text
 * ({ id, essay_id, word_count, source, created_at }; loadVersion fetches
 * one), reviews whole; both newest first.
 */
export async function loadEssay(userId, id) {
  if (!isUuid(id)) return null;
  const [essay, versions, reviews] = await Promise.all([
    supabase.from("essays").select(ESSAY_COLUMNS).eq("id", id).eq("user_id", userId).maybeSingle(),
    supabase.from("essay_versions").select(VERSION_LIST_COLUMNS).eq("essay_id", id).eq("user_id", userId)
      .order("created_at", { ascending: false }).limit(VERSIONS_MAX + 10),
    supabase.from("essay_reviews").select(REVIEW_COLUMNS).eq("essay_id", id).eq("user_id", userId)
      .order("created_at", { ascending: false }).limit(REVIEW_LIMIT),
  ]);
  if (essay.error || versions.error || reviews.error) {
    throw new EssayError("Couldn't load this essay. Try again.", "load");
  }
  if (!essay.data) return null;
  return {
    essay: essay.data,
    versions: versions.data || [],
    reviews: (reviews.data || []).map(toReview),
  };
}

/** One saved version, text included. */
export async function loadVersion(userId, id) {
  const gone = () => new EssayError("That version was not found. It may have been deleted.", "no_version");
  if (!isUuid(id)) throw gone();
  const { data, error } = await supabase.from("essay_versions").select(VERSION_COLUMNS)
    .eq("id", id).eq("user_id", userId).maybeSingle();
  if (error) throw new EssayError("Couldn't load that version. Try again.", "load");
  if (!data) throw gone();
  return data;
}

// ─── Essays ───────────────────────────────────────────────────────────────────

/** When an essay was last saved (its updated_at), or null when it is not the
 *  student's or no longer exists. One small read, for a page that was left
 *  open to find out whether it still shows the newest copy. */
export async function essayStamp(userId, id) {
  if (!isUuid(id)) return null;
  const { data, error } = await bounded((signal) => supabase.from("essays").select("id, updated_at")
    .eq("id", id).eq("user_id", userId).abortSignal(signal).maybeSingle());
  if (error) throw new EssayError("Couldn't load this essay. Try again.", "load");
  return data?.updated_at || null;
}

/**
 * Save a student's changes to an essay and return the row. Only title,
 * prompt_key, prompt_text, word_limit, body, status and topic_id are sent;
 * word_count is recounted whenever the body is, and updated_at is set. A
 * prompt_key saved without a prompt_text takes that prompt's wording with it,
 * and an empty title is left as it was.
 *
 * A save never writes over a copy the page has not seen. `guard` says which
 * copy the changes were made on:
 *   expect  the row's updated_at as the page last knew it. The write lands
 *           only while the row still carries it. Left out, nothing is checked.
 *   stamp   the updated_at this save writes (now, when left out).
 *   mine    the stamps of this page's earlier saves whose answers never came
 *           back. One of them on the row means that save did land and only
 *           its answer was lost, so this one is written on top of it.
 * When the row was changed by anyone else since `expect`, nothing is written
 * and a "conflict" is thrown with that newer row on it (`row`).
 *
 * Throws an EssayError the page can show: a refused field before anything is
 * sent ("bad_limit", "bad_prompt", "bad_status", "bad_topic", "too_long"),
 * "no_essay" when the essay is gone, "conflict" as above, and "save" when the
 * write did not land or got no answer in time (the page keeps the text and
 * retries).
 */
export async function saveEssay(userId, id, patch, guard = {}) {
  const fields = cleanEssay(patch || {});
  const expect = typeof guard?.expect === "string" && guard.expect ? guard.expect : null;
  const at = typeof guard?.stamp === "string" && guard.stamp ? guard.stamp : new Date().toISOString();
  const mine = Array.isArray(guard?.mine) ? guard.mine : [];
  const failed = () => new EssayError("Couldn't save that. Try again.", "save");
  const gone = () => new EssayError("That essay was not found. It may have been deleted.", "no_essay");
  const write = (onCopy) => bounded((signal) => {
    let query = supabase.from("essays").update({ ...fields, updated_at: at }).eq("id", id).eq("user_id", userId);
    if (onCopy) query = query.eq("updated_at", onCopy);
    return query.select(ESSAY_COLUMNS).abortSignal(signal).single();
  });

  const first = await write(expect);
  if (!first.error) return first.data;
  if (first.error.code !== NOT_FOUND) throw failed();
  if (!expect) throw gone();

  // No row matched. Either the essay is gone, or it is no longer the copy
  // this page was working on: look before deciding which.
  const now = await bounded((signal) => supabase.from("essays").select(ESSAY_COLUMNS)
    .eq("id", id).eq("user_id", userId).abortSignal(signal).maybeSingle());
  if (now.error) throw failed();
  const row = now.data;
  if (!row) throw gone();
  // Still the copy this page expected, and yet the write matched nothing: not
  // someone else's change, whatever it was. A failed save, to be tried again.
  if (sameMoment(row.updated_at, expect)) throw failed();
  if (mine.some((stamp) => sameMoment(stamp, row.updated_at))) {
    // An earlier save from this page did land, and only its answer was lost.
    const again = await write(row.updated_at);
    if (!again.error) return again.data;
    throw failed();   // changed once more in between: the next try looks again
  }
  // Changed somewhere else: nothing is written over it.
  const clash = new EssayError("This essay was changed somewhere else since this page opened.", "conflict");
  // The newer copy, for the page to offer. Not enumerable: an error that is
  // logged must never carry an essay's words with it.
  Object.defineProperty(clash, "row", { value: row, enumerable: false });
  throw clash;
}

/** Delete an essay, and with it every saved version and review of it. */
export async function deleteEssay(userId, id) {
  const { error } = await supabase.from("essays").delete().eq("id", id).eq("user_id", userId);
  if (error) throw new EssayError("Couldn't delete that essay. Try again.", "delete");
}

/** Delete one saved version (and any review that read it). */
export async function deleteVersion(userId, id) {
  const { error } = await supabase.from("essay_versions").delete().eq("id", id).eq("user_id", userId);
  if (error) throw new EssayError("Couldn't delete that version. Try again.", "delete");
}

/** Delete one review: Quill's notes on a version, and the student's answers. */
export async function deleteReview(userId, id) {
  const { error } = await supabase.from("essay_reviews").delete().eq("id", id).eq("user_id", userId);
  if (error) throw new EssayError("Couldn't delete that review. Try again.", "delete");
}

/**
 * Save the student's answers to a review's notes: the whole map,
 * { noteId: { state: "answered" | "dismissed", answer } }. They are stored
 * beside the review and sent nowhere else. Returns the map as saved.
 */
export async function saveResponses(userId, reviewId, responses) {
  const map = cleanResponses(responses);
  // With a deadline: answers to one review are saved one after another, and a
  // request that never comes back would hold every later one behind it.
  const { data, error } = await bounded((signal) => supabase.from("essay_reviews")
    .update({ responses: map })
    .eq("id", reviewId).eq("user_id", userId)
    .select("id, responses").abortSignal(signal).single());
  if (error) {
    if (error.code === NOT_FOUND) throw new EssayError("That review was not found. It may have been deleted.", "no_review");
    throw new EssayError("Couldn't save your answer. Try again.", "save");
  }
  return toReview(data).responses;
}

// ─── Ideas ────────────────────────────────────────────────────────────────────

/** A student's own idea card: a name and, if they like, some notes. It goes
 *  to the top of the board. Free: no model reads it. */
export async function addTopic(userId, { area, notes } = {}) {
  const row = { user_id: userId, area: cleanArea(area), notes: cleanTopicNotes(notes) };
  // Above the card that is first now. A failed read just leaves it at 0.
  const top = await supabase.from("essay_topics").select("position").eq("user_id", userId)
    .order("position", { ascending: true }).limit(1);
  const first = Number(top.data?.[0]?.position);
  row.position = !top.error && top.data?.length && Number.isFinite(first) ? first - 1 : 0;
  const { data, error } = await supabase.from("essay_topics").insert(row).select(TOPIC_COLUMNS).single();
  if (error) throw new EssayError("Couldn't add that idea. Try again.", "save");
  return toTopic(data);
}

/** Change an idea card: its name, notes, status or place. Anything else in
 *  the patch is dropped. Returns the row. */
export async function updateTopic(userId, id, patch) {
  const fields = cleanTopic(patch || {});
  const { data, error } = await supabase.from("essay_topics")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id).eq("user_id", userId)
    .select(TOPIC_COLUMNS).single();
  if (error) {
    if (error.code === NOT_FOUND) throw new EssayError("That idea was not found. It may have been deleted.", "no_topic");
    throw new EssayError("Couldn't save that. Try again.", "save");
  }
  return toTopic(data);
}

/** Delete an idea card. An essay that grew from it stays, without the link. */
export async function deleteTopic(userId, id) {
  const { error } = await supabase.from("essay_topics").delete().eq("id", id).eq("user_id", userId);
  if (error) throw new EssayError("Couldn't delete that idea. Try again.", "delete");
}
