// A shared record, in words: how a GPA, a test score, a course, an activity
// or an essay's progress is written on the counselor's pages and on the
// printed record. No imports and no React, so it can be checked with plain
// Node. It only words what counselor_student() returned; it reads nothing.

const text = (v) => (typeof v === "string" ? v.trim() : "");
const list = (v) => (Array.isArray(v) ? v : []);
const num = (v) => {
  const n = Number(v);
  return v !== null && v !== undefined && v !== "" && Number.isFinite(n) ? n : null;
};
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
/** A word from one of the tables below, for a key that came from the
 *  database: only the table's own entries count, never an inherited one. */
const own = (table, key) => (Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined);

// ─── Grades ───────────────────────────────────────────────────────────────────

const SCALE_WORDS = { "4.0": "on a 4.0 scale", "5.0": "on a 5.0 scale", "100": "on a 100 point scale" };

/** A GPA as it is said: 3.87, 4.0, 3.5, and 92 or 92.5 on a 100-point scale. */
export function gpaNumber(value, scale) {
  const n = num(value);
  if (n === null || n <= 0) return "";
  if (scale === "100" || n > 10) return n.toFixed(1).replace(/\.0$/, "");
  const s = n.toFixed(2);
  return s.endsWith("0") ? s.slice(0, -1) : s;
}

/**
 * The GPA lines of a shared portfolio: [{ label, value }], empty when none is
 * on file. A school that does not use GPA says so in one line.
 */
export function gpaLines(portfolio) {
  const scale = text(portfolio?.gpa_scale);
  if (scale === "not_used") return [{ label: "GPA", value: "Their school does not use GPA" }];
  const words = own(SCALE_WORDS, scale) ? ` ${own(SCALE_WORDS, scale)}` : "";
  const out = [];
  const unweighted = gpaNumber(portfolio?.gpa_unweighted, scale);
  const weighted = gpaNumber(portfolio?.gpa_weighted, scale);
  if (unweighted) out.push({ label: "Unweighted GPA", value: `${unweighted}${words}` });
  if (weighted) out.push({ label: "Weighted GPA", value: unweighted ? weighted : `${weighted}${words}` });
  return out;
}

/** The majors a student is considering, as plain names. */
export function majorsOf(portfolio) {
  return list(portfolio?.majors).map((m) => (typeof m === "string" ? m : m?.name)).map(text).filter(Boolean);
}

// ─── Test scores ──────────────────────────────────────────────────────────────

const TEST_ORDER = ["sat", "act", "psat", "ap"];
const TEST_NAMES = { sat: "SAT", act: "ACT", psat: "PSAT", ap: "AP" };

/** "SAT", "AP Chemistry", or the type as typed for anything else. */
export function testName(score) {
  const type = text(score?.test_type).toLowerCase();
  const name = own(TEST_NAMES, type) || text(score?.test_type).toUpperCase() || "Test";
  const subject = text(score?.subject);
  return subject ? `${name} ${subject}` : name;
}

/** Scores in the order a counselor reads them: SAT, ACT, PSAT, then AP by
 *  subject, then anything else; the best of each first. */
export function sortScores(scores) {
  const rank = (s) => {
    const at = TEST_ORDER.indexOf(text(s?.test_type).toLowerCase());
    return at === -1 ? TEST_ORDER.length : at;
  };
  return [...list(scores)].sort((a, b) => rank(a) - rank(b)
    || text(a?.subject).localeCompare(text(b?.subject), "en")
    || (num(b?.score) ?? 0) - (num(a?.score) ?? 0));
}

// ─── Courses ──────────────────────────────────────────────────────────────────

const COURSE_LEVELS = { ap: "AP", ib: "IB", honors: "Honors", dual_enrollment: "Dual enrollment" };

/** "AP", "Honors"... or "" for a regular course or none given. */
export const courseLevel = (course) => own(COURSE_LEVELS, text(course?.level).toLowerCase()) || "";

/**
 * Courses grouped by the grade they were taken in: [{ key, label, courses }],
 * grade 9 first, then any with no grade on file.
 */
export function coursesByGrade(courses) {
  const groups = new Map();
  for (const c of list(courses)) {
    if (!text(c?.name)) continue;
    const g = num(c?.grade_level);
    const key = g !== null && g > 0 ? g : 0;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === 0 ? 99 : a) - (b === 0 ? 99 : b))
    .map(([key, items]) => ({ key: String(key), label: key ? `Grade ${key}` : "Grade not given", courses: items }));
}

// ─── Activities and awards ────────────────────────────────────────────────────

/** "Captain, Riverbend Robotics": the role and where, whichever are given. */
export function activityRole(activity) {
  return [text(activity?.position), text(activity?.organization)].filter(Boolean).join(", ");
}

/** The smaller facts of an activity, each its own short phrase:
 *  ["Robotics", "Grades 10, 11", "6 hours a week, 30 weeks a year"]. */
export function activityFacts(activity) {
  const out = [];
  if (text(activity?.category)) out.push(text(activity.category));
  const grades = list(activity?.grade_levels).map(num).filter((g) => g !== null).sort((a, b) => a - b);
  if (grades.length) out.push(`${grades.length === 1 ? "Grade" : "Grades"} ${grades.join(", ")}`);
  const hours = num(activity?.hours_per_week);
  const weeks = num(activity?.weeks_per_year);
  const time = [
    hours !== null && hours > 0 ? `${plural(hours, "hour", "hours")} a week` : "",
    weeks !== null && weeks > 0 ? `${plural(weeks, "week", "weeks")} a year` : "",
  ].filter(Boolean).join(", ");
  if (time) out.push(time);
  return out;
}

const AWARD_LEVELS = { school: "School", regional: "Regional", state: "State", national: "National", international: "International" };

/** An award's smaller facts: ["State", "Grade 11"] or ["National", "2026"]. */
export function awardFacts(award) {
  const out = [];
  const level = own(AWARD_LEVELS, text(award?.level).toLowerCase());
  if (level) out.push(level);
  const grade = num(award?.grade_level);
  const year = num(award?.year);
  if (grade !== null && grade > 0) out.push(`Grade ${grade}`);
  else if (year !== null && year > 0) out.push(String(year));
  return out;
}

// ─── Essays (progress only) ───────────────────────────────────────────────────

const ESSAY_STAGES = { idea: "idea stage", drafting: "drafting", revising: "revising", done: "done" };

/**
 * One line per essay, with nothing of the essay itself: "Personal statement,
 * revising, 412 of 650 words". Personal statements first, then supplements,
 * numbered in the order they came. A counselor is never given a title, a
 * school, a prompt or a word of the text, so there is none to show.
 * Returns [{ key, name, stage, words, line }].
 */
export function essayLines(essays) {
  const rows = list(essays).filter((e) => e && typeof e === "object");
  const statements = rows.filter((e) => e.kind === "personal_statement");
  const supplements = rows.filter((e) => e.kind !== "personal_statement");
  const many = statements.length > 1;
  const word = (e, name, key) => {
    const stage = own(ESSAY_STAGES, text(e.status).toLowerCase()) || "started";
    const count = Math.max(0, Math.trunc(num(e.word_count) ?? 0));
    const limit = num(e.word_limit);
    const words = limit !== null && limit > 0 ? `${count} of ${plural(limit, "word", "words")}` : plural(count, "word", "words");
    return { key, name, stage, words, line: `${name}, ${stage}, ${words}` };
  };
  return [
    ...statements.map((e, i) => word(e, many ? `Personal statement ${i + 1}` : "Personal statement", `ps-${i}`)),
    ...supplements.map((e, i) => word(e, `Supplement ${i + 1}`, `supp-${i}`)),
  ];
}

// ─── College list ─────────────────────────────────────────────────────────────

/** The facts of a school on a shared list, each its own short phrase:
 *  ["Ann Arbor, MI", "18% admitted", "$19,205 average net price"]. */
export function schoolFacts(school) {
  const out = [];
  const place = [text(school?.city), text(school?.state)].filter(Boolean).join(", ");
  if (place) out.push(place);
  const rate = num(school?.admission_rate);
  if (rate !== null && rate >= 0) out.push(rate >= 1 ? "Open admission" : `${Math.round(rate * 100)}% admitted`);
  const price = num(school?.net_price);
  if (price !== null && price >= 0) out.push(`$${Math.round(price).toLocaleString("en-US")} average net price`);
  return out;
}

const SOURCE_WORDS = {
  student: "Sorted here by the student",
  suggested: "Sorted here by their scores and the school's admit rate",
  rough: "A rough guess, with no test score to compare",
};

/** How a school came to be in its group, or "". */
export const sourceLine = (school) => own(SOURCE_WORDS, text(school?.category_source)) || "";

/** How many schools sit in each group, for the balance note. */
export function listCounts(schools) {
  const n = { reach: 0, target: 0, likely: 0 };
  for (const s of list(schools)) if (Object.prototype.hasOwnProperty.call(n, s?.category)) n[s.category] += 1;
  return { ...n, total: n.reach + n.target + n.likely };
}
