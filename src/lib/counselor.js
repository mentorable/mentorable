import { supabase } from "./supabase.js";
import { balance } from "./collegeCategory.js";

// The school link: a student's side (join a school, choose what to share, ask
// for a meeting, leave) and a counselor's side (the caseload, one student's
// shared record, the meeting requests).
//
// Who can do what (see 20261012_counselor.sql): nobody reads or writes the
// counselor tables directly, student or counselor. Every call here is one SQL
// function that reads the signed-in user itself and decides what they may
// see. A counselor gets a section of a student's record only while that
// student is linked to their school and has that section switched on. This
// file adds no access of its own: it passes arguments, tidies what comes
// back, and turns a refusal into words. It never logs what it reads.

// ─── What a student can share ─────────────────────────────────────────────────

/** The four sharing choices, in order. All off until the student turns one on.
 *  `detail` is what the student reads before switching one on, so it says
 *  what the counselor then gets, the note a quiet quest raises (see
 *  attention) included. */
export const SHARES = [
  { key: "college_list", label: "College List", detail: "The schools on your list and how each is sorted" },
  { key: "portfolio", label: "Portfolio", detail: "Your grades, scores, classes, activities, awards and the majors you are considering" },
  {
    key: "quest", label: "Quest",
    detail: "Your quest, its milestones, your streak, how many check-ins you have made and when the last one was. "
      + "Your counselor sees a note when an active quest goes a week without a check-in. Never what you wrote in them.",
  },
  { key: "essays", label: "Essay progress", detail: "Only how far along each essay is and its word count, never a word you wrote" },
];

/** What a counselor sees of every linked student, whatever the switches say. */
export const ALWAYS_SHARED = "Your name, grade and graduation year";

// The limits the database enforces, so a page can say them first.
export const REQUEST_MESSAGE_MAX = 300, REQUEST_TIMES_MAX = 3, OPEN_REQUESTS_MAX = 2;
/** How far ahead a student may offer a time. */
export const REQUEST_DAYS_AHEAD = 60;
/** How far ahead a counselor may confirm one. */
export const CONFIRM_DAYS_AHEAD = 120;

/** What a table cell or a card says for a section the student keeps to themselves. */
export const NOT_SHARED = "Not shared";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v) => typeof v === "string" && UUID_RE.test(v);
const isObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const asText = (v) => (typeof v === "string" ? v : "");
const asList = (v) => (Array.isArray(v) ? v : []);
const count = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.trunc(Number(v))) : 0);

// ─── Refusals, in plain words ─────────────────────────────────────────────────
// The SQL functions refuse with a short code as the whole message. A few codes
// mean different things to a student and to a counselor, so those carry a line
// for each side and one for when the side is not known.

const GENERIC = "Something went wrong. Try again.";

const MESSAGES = {
  not_signed_in: "You are signed out. Sign in again to continue.",
  // Counselor side
  bad_name: "Give the school a name, from 2 to 120 characters.",
  bad_display_name: "Add your name as students will see it, up to 80 characters.",
  already_counselor: "You have already set up a school. Reload the page to open it.",
  not_counselor: "Only a school's counselor can do that. Set up your school first.",
  bad_time: `Pick a time in the future, within the next ${CONFIRM_DAYS_AHEAD} days.`,
  bad_action: "A request can only be confirmed or declined.",
  already_closed: "That request is already closed.",
  try_again: "That did not go through. Try again.",
  // Student side
  too_many_tries: "Too many tries. Wait an hour, then enter the code again.",
  bad_code: "That code did not match a school. Check it with your counselor, who may have a newer one.",
  already_linked: "You are already linked to a school. Leave it first to join another.",
  own_school: "You are a counselor of this school, so you can't join it as a student.",
  bad_message: `Write a message, up to ${REQUEST_MESSAGE_MAX} characters.`,
  bad_times: `Pick 1 to ${REQUEST_TIMES_MAX} times, each in the future and within the next ${REQUEST_DAYS_AHEAD} days.`,
  too_many_open: `You already have ${OPEN_REQUESTS_MAX} requests waiting for an answer. Cancel one, or wait for a reply.`,
  too_many_today: "You have sent 6 meeting requests in the last 24 hours, cancelled ones included. Try again tomorrow.",
  // Both sides
  not_linked: {
    student: "You are no longer linked to a school.",
    counselor: "That student is not linked to your school. They may have left.",
    any: "That link to the school is no longer there.",
  },
  no_request: {
    student: "That request is already closed or no longer exists.",
    counselor: "That request is no longer there. The student may have left the school.",
    any: "That request is no longer there.",
  },
  // Not from the database
  network: "No connection to Mentorable right now. Check your internet and try again.",
  error: GENERIC,
};

const isCode = (v) => typeof v === "string" && Object.prototype.hasOwnProperty.call(MESSAGES, v);
/** A code the database itself refuses with (not this file's own two). */
const isRefusal = (v) => isCode(v) && v !== "network" && v !== "error";

function messageFor(code, side) {
  const entry = isCode(code) ? MESSAGES[code] : GENERIC;
  if (typeof entry === "string") return entry;
  return entry[side] || entry.any;
}

/**
 * A call that was refused or did not land. `code` is the function's own code
 * ("bad_code", "not_linked", ...), "network" when nothing came back, or
 * "error" for anything else. `side` is "student" or "counselor": whose call it
 * was. The message is fit to show.
 *
 * `new CounselorError(message, code, side)`; a known code given alone
 * (`new CounselorError("bad_code")`) writes its own message.
 */
export class CounselorError extends Error {
  constructor(message, code, side = "") {
    const alone = code === undefined && isCode(message);
    const known = alone ? message : (isCode(code) ? code : "error");
    super(alone || !message ? messageFor(known, side) : String(message));
    this.name = "CounselorError";
    this.code = known;
    this.side = side === "student" || side === "counselor" ? side : "";
  }
}

const refusal = (code, side) => new CounselorError(messageFor(code, side), code, side);

/** Plain copy for any failure: a CounselorError, a bare code, or anything else. */
export function counselorErrorMessage(err) {
  if (typeof err === "string") return messageFor(err, "");
  return messageFor(err?.code, err?.side);
}

// ─── The one way out to the database ─────────────────────────────────────────

// A call that gets no answer is given up on, and its request cancelled: a
// switch or a button must never wait forever on a connection that has died.
const CALL_TIMEOUT_MS = 20000;
const NO_ANSWER = { data: null, error: { message: "no answer in time", code: "" }, status: 0 };

/** One SQL function. Resolves to what it returned (null for nothing), or
 *  throws a CounselorError. */
async function call(name, args, side) {
  const control = new AbortController();
  let timer = null;
  let answer;
  try {
    const late = new Promise((resolve) => {
      timer = setTimeout(() => { control.abort(); resolve(NO_ANSWER); }, CALL_TIMEOUT_MS);
    });
    const query = (args ? supabase.rpc(name, args) : supabase.rpc(name)).abortSignal(control.signal);
    answer = await Promise.race([query, late]);
  } catch {
    throw refusal("network", side);
  } finally {
    clearTimeout(timer);
  }
  const { data, error, status } = answer || NO_ANSWER;
  if (!error) {
    // join_school answers a wrong code by returning the refusal with a 400
    // (so the try is still counted). Should one ever arrive as an ordinary
    // answer, it is still a refusal, never a school.
    if (isObject(data) && data.code === "P0001" && isRefusal(data.message)) throw refusal(data.message, side);
    return data ?? null;
  }

  // A refusal's message is exactly its code. Anything else is told apart by
  // how it failed, never by showing the database's own words.
  const said = typeof error.message === "string" ? error.message.trim() : "";
  if (isRefusal(said)) throw refusal(said, side);
  if (status === 401 || error.code === "PGRST301") throw refusal("not_signed_in", side);
  if (!status) throw refusal("network", side);
  throw refusal("error", side);
}

// ─── Tidying what comes back ─────────────────────────────────────────────────

/** A Date or a timestamp string as an ISO string, or null when it is neither. */
function toIso(value) {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** The four switches as booleans. Only a real `true` counts as shared. */
function toSharing(value) {
  const out = {};
  for (const { key } of SHARES) out[key] = isObject(value) && value[key] === true;
  return out;
}

/** A meeting request with its lists and strings always there. */
function toRequest(row) {
  if (!isObject(row)) return null;
  return {
    ...row,
    message: asText(row.message),
    times: asList(row.times).filter((t) => typeof t === "string" && t),
    status: asText(row.status),
    meeting_at: row.meeting_at || null,
    counselor_note: asText(row.counselor_note),
  };
}

/** my_school()'s answer as the Profile card uses it, or null when not linked.
 *  Anything that is neither is an error: a card must never show a link, or the
 *  lack of one, that the database did not report. */
function toMySchool(value) {
  if (value === null || value === undefined) return null;
  if (!isObject(value) || !isObject(value.school)) throw refusal("error", "student");
  return {
    ...value,
    school: { ...value.school, name: asText(value.school.name).trim() || "Your school" },
    counselors: asList(value.counselors).filter((n) => typeof n === "string" && n.trim()),
    linked_at: value.linked_at || null,
    sharing: toSharing(value.sharing),
    requests: asList(value.requests).map(toRequest).filter(Boolean),
  };
}

// ─── Counselor ────────────────────────────────────────────────────────────────

/** { counselor: { display_name }, school: { id, name, join_code, is_demo,
 *  student_count } }, or null when the signed-in user has set up no school. */
export async function counselorMe() {
  const me = await call("counselor_me", null, "counselor");
  return isObject(me) ? me : null;
}

/** Set up a school and become its counselor. Returns what counselorMe does. */
export async function createSchool(name, displayName) {
  return call("create_school", {
    p_name: asText(name).trim(),
    p_display_name: asText(displayName).trim(),
  }, "counselor");
}

/** Replace the school's join code. Students already linked stay linked; the
 *  old code stops working. Returns { join_code }. */
export async function rotateJoinCode() {
  return call("rotate_join_code", null, "counselor");
}

/** One row per linked student, by name. A section the student has not shared
 *  is null. */
export async function loadCaseload() {
  return asList(await call("counselor_caseload", null, "counselor")).filter(isObject);
}

/** One student's shared record. Refused as "not_linked" for anyone who is not
 *  linked to the counselor's school, whatever the reason. */
export async function loadStudent(studentId) {
  if (!isUuid(studentId)) throw refusal("not_linked", "counselor");
  const detail = await call("counselor_student", { p_student: studentId }, "counselor");
  if (!isObject(detail)) throw refusal("not_linked", "counselor");
  return { ...detail, requests: asList(detail.requests).map(toRequest).filter(Boolean) };
}

/** The school's meeting requests: the ones waiting first, oldest first. */
export async function loadRequests() {
  return asList(await call("counselor_requests", null, "counselor")).map(toRequest).filter(Boolean);
}

/** Answer a request. `action` is "confirm" (with `time`, a Date or an ISO
 *  string) or "decline"; `note` is a short line the student will read.
 *  Returns the request as loadRequests gives it. */
export async function answerRequest(id, { action, time, note } = {}) {
  if (!isUuid(id)) throw refusal("no_request", "counselor");
  const row = await call("answer_request", {
    p_id: id,
    p_action: asText(action),
    p_time: toIso(time),
    p_note: asText(note).trim(),
  }, "counselor");
  return toRequest(row);
}

/** Unlink a student from the counselor's school. Their requests there go with
 *  the link. Returns { removed: true }. */
export async function removeStudent(studentId) {
  if (!isUuid(studentId)) throw refusal("not_linked", "counselor");
  return call("remove_student", { p_student: studentId }, "counselor");
}

// ─── Student ──────────────────────────────────────────────────────────────────

/** { school: { name }, counselors: [names], linked_at, sharing, requests }, or
 *  null when the student is not linked to a school. */
export async function mySchool() {
  return toMySchool(await call("my_school", null, "student"));
}

/** Join the school a code belongs to. Every share starts off. Returns what
 *  mySchool does. An empty code is refused here, without spending a try. */
export async function joinSchool(code) {
  const clean = normaliseJoinCode(code);
  if (!clean) throw refusal("bad_code", "student");
  return toMySchool(await call("join_school", { p_code: clean }, "student"));
}

/** Save the switches named in `changes`: any of { college_list, portfolio,
 *  quest, essays }. Only a real `true` shares a section; any other value
 *  stops sharing it. A switch left out is sent as null, which the database
 *  never reads as on, so a save can only share what it names. Returns what
 *  mySchool does: the switches as they are saved now. */
export async function setSharing(changes) {
  const arg = (key) => (
    isObject(changes) && Object.prototype.hasOwnProperty.call(changes, key) ? changes[key] === true : null
  );
  return toMySchool(await call("set_sharing", {
    p_college_list: arg("college_list"),
    p_portfolio: arg("portfolio"),
    p_quest: arg("quest"),
    p_essays: arg("essays"),
  }, "student"));
}

/** Leave the school. The counselor's access ends with this call, and the
 *  student's requests there are removed. */
export async function leaveSchool() {
  return call("leave_school", null, "student");
}

/** Ask for a meeting: a message and 1 to 3 times (Dates or ISO strings), in
 *  the order given. Returns the request. */
export async function requestMeeting(message, times) {
  const isoTimes = [...new Set(asList(times).map(toIso).filter(Boolean))];
  const row = await call("request_meeting", { p_message: asText(message).trim(), p_times: isoTimes }, "student");
  return toRequest(row);
}

/** Cancel one of the student's own requests that is waiting or confirmed.
 *  Returns the request, now cancelled. */
export async function cancelRequest(id) {
  if (!isUuid(id)) throw refusal("no_request", "student");
  return toRequest(await call("cancel_request", { p_id: id }, "student"));
}

// ─── The join code ────────────────────────────────────────────────────────────
// 8 characters from an alphabet with no look-alikes (no I, L or O, no 0 or 1).

export const JOIN_CODE_LENGTH = 8;
const JOIN_CODE_ALPHABET = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]+$/;
const JOIN_CODE_KEY = "mentorable.joinCode";

/** A code as the database compares it: upper case, with spaces, dashes and
 *  anything else that is not a letter or a number taken out. */
export function normaliseJoinCode(code) {
  return asText(code).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, JOIN_CODE_LENGTH * 4);
}

/** Why a typed code cannot be right, as a line to show, or "" when it could
 *  be. Catches a slip before it costs one of the hour's tries. */
export function joinCodeProblem(code) {
  const clean = normaliseJoinCode(code);
  if (!clean) return "Enter the join code your counselor gave you.";
  if (clean.length !== JOIN_CODE_LENGTH) return `A join code has ${JOIN_CODE_LENGTH} letters and numbers. This one has ${clean.length}.`;
  if (!JOIN_CODE_ALPHABET.test(clean)) {
    return "Join codes never use the letters I, L or O, or the numbers 0 and 1. Check the code again.";
  }
  return "";
}

/** The link a counselor hands out: it opens Profile with the code filled in. */
export function joinLink(code) {
  return `${window.location.origin}/join?code=${encodeURIComponent(normaliseJoinCode(code))}`;
}

/** Keep a code from a join link until the student next opens Profile. */
export function rememberJoinCode(code) {
  const clean = normaliseJoinCode(code);
  if (!clean) return;
  try { localStorage.setItem(JOIN_CODE_KEY, clean); } catch { /* private mode: they can type it */ }
}

/** The code a join link left, or "". Reading it removes it. */
export function takeJoinCode() {
  try {
    const clean = normaliseJoinCode(localStorage.getItem(JOIN_CODE_KEY));
    localStorage.removeItem(JOIN_CODE_KEY);
    return clean;
  } catch {
    return "";
  }
}

// ─── The caseload, in words (pure) ────────────────────────────────────────────

/**
 * Why a caseload row may need the counselor, as [{ key, label }]: today only
 * "request" (a meeting request is waiting). Empty when there is nothing.
 */
export function attention(row) {
  const marks = [];
  if (!isObject(row)) return marks;

  const waiting = count(row.pending_requests);
  if (waiting > 0) {
    marks.push({ key: "request", label: waiting === 1 ? "Meeting request waiting" : `${waiting} meeting requests waiting` });
  }
  return marks;
}

/** The balance note for a list's counts ({ reach, target, likely }), the same
 *  one the student sees on their College List, or "" when there is none. */
export function listNote(collegeList) {
  if (!isObject(collegeList)) return "";
  const items = [];
  for (const category of ["reach", "target", "likely"]) {
    const n = Math.min(count(collegeList[category]), 200);
    for (let i = 0; i < n; i += 1) items.push({ category });
  }
  return balance(items).note || "";
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** "2 reach, 3 target, 1 likely", "No schools yet", or "Not shared". */
export function listLine(collegeList) {
  if (!isObject(collegeList)) return NOT_SHARED;
  const reach = count(collegeList.reach);
  const target = count(collegeList.target);
  const likely = count(collegeList.likely);
  if (reach + target + likely === 0) return "No schools yet";
  return `${reach} reach, ${target} target, ${likely} likely`;
}

const QUEST_WORDS = { active: "Active", paused: "Paused", completed: "Finished", done: "Finished" };

/** "Active, 1 of 5 milestones, 4 day streak", "Paused, 2 of 4 milestones",
 *  "Finished", "No quest yet", or "Not shared". */
export function questLine(quest) {
  if (!isObject(quest)) return NOT_SHARED;
  const word = QUEST_WORDS[quest.status];
  if (!word) return "No quest yet";
  const parts = [word];
  const total = count(quest.milestones_total);
  if (total > 0 && word !== "Finished") parts.push(`${Math.min(count(quest.milestones_done), total)} of ${plural(total, "milestone", "milestones")}`);
  const streak = count(quest.streak);
  if (quest.status === "active" && streak > 0) parts.push(`${streak} day streak`);
  return parts.join(", ");
}

const ESSAY_STAGE = { idea: "idea stage", drafting: "drafting", revising: "revising", done: "done" };

/** "Personal statement: revising, 412 words. Supplements: 1 of 3 done",
 *  "No essays yet", or "Not shared". Stage and length only. */
export function essayLine(essays) {
  if (!isObject(essays)) return NOT_SHARED;
  const parts = [];
  const ps = essays.personal_statement;
  if (isObject(ps)) {
    const stage = ESSAY_STAGE[ps.status] || "started";
    parts.push(`Personal statement: ${stage}, ${plural(count(ps.word_count), "word", "words")}`);
  }
  const supplements = count(essays.supplements);
  if (supplements > 0) {
    parts.push(`Supplements: ${Math.min(count(essays.supplements_done), supplements)} of ${supplements} done`);
  }
  if (!parts.length) return "No essays yet";
  if (!isObject(ps)) parts.unshift("No personal statement yet");
  return parts.join(". ");
}

// ─── Dates ────────────────────────────────────────────────────────────────────

/** "Tue, Oct 20 at 2:30 PM" in the viewer's own time zone (with the year when
 *  it is not this one), or "" for no time. Takes a timestamp or a Date. */
export function formatWhen(iso) {
  if (iso === null || iso === undefined || iso === "") return "";
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const day = { weekday: "short", month: "short", day: "numeric" };
  if (d.getFullYear() !== new Date().getFullYear()) day.year = "numeric";
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  // Newer browsers put a narrow no-break space before AM and PM.
  return `${d.toLocaleDateString("en-US", day)} at ${time}`.replace(/[\u202f\u00a0]/g, " ");
}
