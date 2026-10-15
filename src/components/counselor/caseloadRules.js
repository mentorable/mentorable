// How the caseload is filtered and ordered, and what each cell of its grid
// says. No imports and no React, so the rules can be checked with plain Node.
//
// A row is one linked student as counselor_caseload() returns it. `marksFor`
// gives a row's attention marks (the list attention(row) made), so the rule
// for what needs attention lives in one place, src/lib/counselor.js.

export const SORT_KEYS = ["name", "grade", "attention"];

/** The direction a column starts in the first time it is picked: names and
 *  grades climb, and attention puts the students who need it most first. */
export const FIRST_DIR = { name: "asc", grade: "asc", attention: "desc" };

export const DEFAULT_SORT = { key: "name", dir: "asc" };

/** A saved sort, or the default when what was saved is not one. */
export function cleanSort(value) {
  if (!value || typeof value !== "object" || !SORT_KEYS.includes(value.key)) return DEFAULT_SORT;
  return { key: value.key, dir: value.dir === "desc" ? "desc" : "asc" };
}

/** What a click on a column header does: flip the column already sorted on,
 *  or start a new one in its first direction. */
export function nextSort(sort, key) {
  if (!SORT_KEYS.includes(key)) return sort;
  if (sort.key === key) return { key, dir: sort.dir === "asc" ? "desc" : "asc" };
  return { key, dir: FIRST_DIR[key] };
}

/** A row's grade as a number, or null when none is on file. */
export function gradeOf(row) {
  const v = row?.grade;
  const n = Number(v);
  return v !== null && v !== undefined && v !== "" && Number.isFinite(n) && n > 0 ? n : null;
}

/** The grades anyone on the caseload is in, lowest first. */
export function gradesIn(rows) {
  return [...new Set((rows || []).map(gradeOf).filter((g) => g !== null))].sort((a, b) => a - b);
}

// A waiting request outranks a list with no likely school, which outranks a
// quiet quest; two marks outrank either of the lighter ones alone.
const WEIGHT = { request: 4, no_likely: 2, quest_quiet: 1 };

/** How much a student needs the counselor, from their marks. 0 for none. */
export function attentionScore(marks) {
  const weight = (key) => (Object.prototype.hasOwnProperty.call(WEIGHT, key) ? WEIGHT[key] : 1);
  return (marks || []).reduce((sum, m) => sum + weight(m?.key), 0);
}

const nameOf = (row) => String(row?.name || "");
const byName = (a, b) => nameOf(a).localeCompare(nameOf(b), "en", { sensitivity: "base" });

/**
 * The rows that pass the filters. `grade` is a number, or null for every
 * grade; `onlyAttention` keeps students with at least one mark; `query` is
 * matched against the name, ignoring case.
 */
export function filterRows(rows, { grade = null, onlyAttention = false, query = "" } = {}, marksFor = () => []) {
  const q = String(query || "").trim().toLowerCase();
  return (rows || []).filter((row) => {
    if (grade !== null && gradeOf(row) !== grade) return false;
    if (onlyAttention && attentionScore(marksFor(row)) === 0) return false;
    if (q && !nameOf(row).toLowerCase().includes(q)) return false;
    return true;
  });
}

/**
 * The rows in order. Ties fall back to the name, A to Z, whichever way the
 * column runs; a student with no grade on file comes after the ones with one.
 */
export function sortRows(rows, sort, marksFor = () => []) {
  const { key, dir } = cleanSort(sort);
  const way = dir === "desc" ? -1 : 1;
  const list = [...(rows || [])];
  if (key === "grade") {
    return list.sort((a, b) => {
      const ga = gradeOf(a);
      const gb = gradeOf(b);
      if (ga === null || gb === null) return (ga === null ? 1 : 0) - (gb === null ? 1 : 0) || byName(a, b);
      return (ga - gb) * way || byName(a, b);
    });
  }
  if (key === "attention") {
    return list.sort((a, b) => (attentionScore(marksFor(a)) - attentionScore(marksFor(b))) * way || byName(a, b));
  }
  return list.sort((a, b) => byName(a, b) * way);
}

const count = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.trunc(Number(v))) : 0);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** A shared portfolio's size: "6 activities, 2 awards, 8 courses". */
export function portfolioLine(portfolio) {
  if (!portfolio || typeof portfolio !== "object") return "";
  return [
    plural(count(portfolio.activities), "activity", "activities"),
    plural(count(portfolio.awards), "award", "awards"),
    plural(count(portfolio.courses), "course", "courses"),
  ].join(", ");
}

/** Whether a shared portfolio has anything in it yet. */
export function portfolioEmpty(portfolio) {
  if (!portfolio || typeof portfolio !== "object") return true;
  return count(portfolio.activities) + count(portfolio.awards) + count(portfolio.courses) === 0 && !portfolio.has_gpa;
}

// ─── The grid's cells ─────────────────────────────────────────────────────────
// The caseload is one line per student, so each section is a short value: a
// few small bars with a number or a word beside them, or three counts. Every
// cell also has `words`, the whole of it in a sentence, for a screen reader:
// the bars never carry meaning on their own. The longer details (word counts,
// supplements, the note on a list's balance, the portfolio's counts) are on
// the student's page.

const NOT_SHARED = "Not shared";
const isSection = (v) => !!v && typeof v === "object" && !Array.isArray(v);

/** Whether a student shares none of the four sections. */
export function sharesNothing(row) {
  return !isSection(row?.quest) && !isSection(row?.college_list) && !isSection(row?.essays) && !isSection(row?.portfolio);
}

const QUEST_STATE = { active: "Active", paused: "Paused", completed: "Finished", done: "Finished" };

/** The most milestones drawn as bars. A quest has 3 to 8; past this only the
 *  number shows. */
export const MAX_BARS = 8;

const milestones = (done, total) => `${done} of ${total} ${total === 1 ? "milestone" : "milestones"} done`;

/**
 * The Quest cell: `bars` to draw (0 for none) with `done` of them filled,
 * `held` when the quest is paused, `text` beside them, and `words`. `quiet`
 * when there is nothing to show (not shared, or no quest).
 */
export function questCell(quest) {
  if (!isSection(quest)) return { bars: 0, done: 0, held: false, quiet: true, text: NOT_SHARED, words: NOT_SHARED };
  const state = QUEST_STATE[quest.status];
  if (!state) return { bars: 0, done: 0, held: false, quiet: true, text: "No quest yet", words: "No quest yet" };
  const total = count(quest.milestones_total);
  const bars = total <= MAX_BARS ? total : 0;
  if (state === "Finished") {
    return { bars, done: bars, held: false, quiet: false, text: "Finished",
      words: total > 0 ? `Finished, ${milestones(total, total)}` : "Finished" };
  }
  if (total === 0) return { bars: 0, done: 0, held: false, quiet: false, text: state, words: state };
  const done = Math.min(count(quest.milestones_done), total);
  return { bars, done: bars ? done : 0, held: state === "Paused", quiet: false, text: `${done} of ${total}`,
    words: `${state}, ${milestones(done, total)}` };
}

/** The Streak cell beside it: `text` (often empty) and `words`. A paused
 *  quest says so here, since its bars only show the milestones. */
export function streakCell(quest) {
  if (!isSection(quest)) return { text: "", words: NOT_SHARED };
  const state = QUEST_STATE[quest.status];
  if (!state) return { text: "", words: "No quest yet" };
  if (state === "Paused") return { text: "Paused", words: "Quest paused, no streak" };
  if (state === "Finished") return { text: "", words: "Quest finished, no streak" };
  const days = count(quest.streak);
  if (days === 0) return { text: "", words: "No streak right now" };
  return { text: `${days} ${days === 1 ? "day" : "days"}`, words: `${days} day streak` };
}

const STAGES = { idea: [1, "Idea stage"], drafting: [2, "Drafting"], revising: [3, "Revising"], done: [4, "Done"] };

/** How many stages a personal statement goes through, drawn as that many bars. */
export const ESSAY_STAGES = 4;

/** The Essays cell: the personal statement's stage as `step` of
 *  ESSAY_STAGES bars (`bars` 0 when there are none to draw), `text`, `words`. */
export function essayCell(essays) {
  if (!isSection(essays)) return { bars: 0, step: 0, quiet: true, text: NOT_SHARED, words: NOT_SHARED };
  const ps = essays.personal_statement;
  if (!isSection(ps)) return { bars: 0, step: 0, quiet: true, text: "Not started", words: "Personal statement not started" };
  const stage = Object.prototype.hasOwnProperty.call(STAGES, ps.status) ? STAGES[ps.status] : null;
  if (!stage) return { bars: 0, step: 0, quiet: false, text: "Started", words: "Personal statement started" };
  return { bars: ESSAY_STAGES, step: stage[0], quiet: false, text: stage[1],
    words: `Personal statement: ${stage[1].toLowerCase()}` };
}

/** The College List cell: the three counts, `warn` when a list with schools
 *  has no likely one, `empty` when it has none, and `words`. */
export function listCell(list) {
  if (!isSection(list)) return { shared: false, empty: false, reach: 0, target: 0, likely: 0, warn: false, words: NOT_SHARED };
  const reach = count(list.reach);
  const target = count(list.target);
  const likely = count(list.likely);
  if (reach + target + likely === 0) {
    return { shared: true, empty: true, reach, target, likely, warn: false, words: "No schools yet" };
  }
  return { shared: true, empty: false, reach, target, likely, warn: likely === 0,
    words: `${reach} reach, ${target} target, ${likely} likely` };
}

/** An attention mark said short enough for the grid's last column: "Meeting
 *  request", "2 meeting requests", "No likely school", "No check-in in 9 days".
 *  The full label is for screen readers and the cards. */
export function shortMark(mark) {
  const label = String(mark?.label || "");
  if (mark?.key === "request") {
    const many = /^(\d+) meeting requests/.exec(label);
    return many ? `${many[1]} meeting requests` : "Meeting request";
  }
  if (mark?.key === "no_likely") return "No likely school";
  if (mark?.key === "quest_quiet") {
    const days = /(\d+) days/.exec(label);
    return days ? `No check-in in ${days[1]} days` : "No check-in yet";
  }
  return label;
}
