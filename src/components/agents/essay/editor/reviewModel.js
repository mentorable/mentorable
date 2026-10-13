import { CHECKS, splitByHighlights } from "../../../../lib/essay.js";

// A saved review, laid out for the review view. Pure: no React, no DOM.
//
// A review row is the backend's: seven checks, up to twelve notes and, when
// the draft was over its limit, up to six passages that could go. Every quote
// in it was checked in code to be the student's own words, with the place it
// sits in the version Quill read (start and end). This only arranges that for
// the screen: notes numbered in reading order, grouped under their check, and
// the version's text cut into plain runs and highlights.
//
// The row is still read defensively (a list that is not a list, a note with
// no id): a review that was stored oddly should show what it can, never crash
// the page.

const CHECK_KEYS = new Set(CHECKS.map((c) => c.key));
const VERDICTS = new Set(["ok", "flag", "na"]);
const STATES = new Set(["answered", "dismissed"]);
const OTHER_KINDS = { activity: "Your activity entry", award: "Your award entry", essay: "Your other essay" };

const text = (v) => (typeof v === "string" ? v.trim() : "");
/** The items of a list column that have an id, each id once. */
function rows(v) {
  const seen = new Set();
  return (Array.isArray(v) ? v : []).filter((x) => {
    if (!x || typeof x !== "object" || typeof x.id !== "string" || !x.id || seen.has(x.id)) return false;
    seen.add(x.id);
    return true;
  });
}

/** Where a quote sits in the version, as the backend stored it, or null. */
function spanOf(item) {
  const start = Number(item?.start);
  const end = Number(item?.end);
  return Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start ? { start, end } : null;
}

/** Reading order: where each starts in the text, then the order Quill gave.
 *  One with no place comes last. */
function inReadingOrder(list) {
  return list
    .map((item, i) => ({ item, i, at: spanOf(item)?.start ?? Infinity }))
    .sort((a, b) => (a.at === b.at ? a.i - b.i : a.at < b.at ? -1 : 1))
    .map(({ item }) => item);
}

/** The other place an overlap note points to: { where, label, quote }. */
function otherOf(raw) {
  if (!raw || typeof raw !== "object") return null;
  const quote = text(raw.quote);
  const label = text(raw.label);
  if (!quote && !label) return null;
  return { where: OTHER_KINDS[raw.kind] || "Elsewhere", label, quote };
}

/** The student's response to one note ({ state, answer }), or null when there
 *  is none. `responses` is the review's map, whatever came back. */
export function responseOf(responses, id) {
  const r = responses && typeof responses === "object" ? responses[id] : null;
  if (!r || !STATES.has(r.state)) return null;
  return { state: r.state, answer: typeof r.answer === "string" ? r.answer : "" };
}

/** `map` without `key` (a new object). */
export function without(map, key) {
  const out = { ...map };
  delete out[key];
  return out;
}

/**
 * review: { checks, notes, cuts } from an essay_reviews row. body: the text
 * of the version it read, or null when that version cannot be shown.
 *
 * Returns:
 *   notes    [{ id, number, check, quote, observation, question, recordSays, other, span }], in reading order
 *   cuts     [{ id, number, quote, reason, words, span }], in reading order
 *   checks   the seven, in order: { key, label, verdict: "ok" | "flag" | "na" | "none", line, notes }
 *   loose    notes whose check this page does not know (shown last, never dropped)
 *   pieces   the body as [{ text, id | null }] (splitByHighlights), [] without a body
 *   anchor   id -> the id of the highlight to scroll to for it, or null when it has none
 *   byId     id -> the note or cut, with kind "note" | "cut"
 *   cutWords the words the cuts would remove, together
 */
export function buildReview(review, body) {
  const notes = inReadingOrder(rows(review?.notes)).map((n, i) => ({
    id: n.id,
    number: i + 1,
    check: CHECK_KEYS.has(n.check) ? n.check : null,
    quote: text(n.quote),
    observation: text(n.observation),
    question: text(n.question),
    recordSays: text(n.record_says),
    other: otherOf(n.other),
    span: spanOf(n),
  }));
  const cuts = inReadingOrder(rows(review?.cuts)).map((c, i) => ({
    id: c.id,
    number: i + 1,
    quote: text(c.quote),
    reason: text(c.reason),
    words: Number.isFinite(Number(c.words)) ? Math.max(0, Math.trunc(Number(c.words))) : 0,
    span: spanOf(c),
  }));

  const byId = new Map();
  for (const n of notes) if (!byId.has(n.id)) byId.set(n.id, { kind: "note", ...n });
  for (const c of cuts) if (!byId.has(c.id)) byId.set(c.id, { kind: "cut", ...c });

  const spans = [...byId.values()].filter((x) => x.span).map((x) => ({ id: x.id, start: x.span.start, end: x.span.end }));
  const pieces = typeof body === "string" && body ? splitByHighlights(body, spans) : [];
  const marked = new Set(pieces.filter((p) => p.id !== null && p.id !== undefined).map((p) => p.id));

  // A quote that sits wholly inside an earlier highlight gets no piece of its
  // own (see splitByHighlights): its note points at the highlight that holds
  // its words instead.
  const anchor = {};
  for (const s of spans) {
    if (marked.has(s.id)) { anchor[s.id] = s.id; continue; }
    const holder = spans.find((o) => o.id !== s.id && marked.has(o.id) && o.start < s.end && o.end > s.start);
    anchor[s.id] = holder ? holder.id : null;
  }

  const given = new Map();
  for (const c of (Array.isArray(review?.checks) ? review.checks : [])) {
    if (c && typeof c.check === "string" && !given.has(c.check)) given.set(c.check, c);
  }
  const checks = CHECKS.map((c) => {
    const got = given.get(c.key);
    return {
      key: c.key,
      label: c.label,
      verdict: !got ? "none" : VERDICTS.has(got.verdict) ? got.verdict : "na",
      line: text(got?.line),
      notes: notes.filter((n) => n.check === c.key),
    };
  });

  return {
    notes, cuts, checks, pieces, anchor, byId,
    loose: notes.filter((n) => !n.check),
    cutWords: cuts.reduce((sum, c) => sum + c.words, 0),
  };
}
