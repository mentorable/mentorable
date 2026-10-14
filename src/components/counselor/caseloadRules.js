// How the caseload is filtered and ordered, and a few of its lines in words.
// No imports and no React, so the rules can be checked with plain Node.
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
