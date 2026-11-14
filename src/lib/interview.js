import { supabase } from "./supabase.js";

// Poise's practice room: the student's mock interviews (interview_mocks).
//
// Who writes what (RLS plus grants; see 20261113_agents_interview.sql):
//   * Every row is written by the backend: it is created when a mock starts
//     (so the cap of 3 holds), and the transcript, the notes and the scores
//     are added when the call has been read (agentsApi.interviewStart and
//     interviewFinish).
//   * A student reads their own rows and may delete one. Nothing else.
// So this file only reads and deletes. Every query is scoped by user_id as
// well as by id, though RLS already holds the line.
//
// A transcript and its notes are the student's alone: nothing here logs them,
// stores them in the browser, or sends them anywhere but the screen.

/** Every column a report shows (all but user_id and the backend's bookkeeping). */
export const MOCK_COLUMNS = "id, mode, target, role, details, status, refund_reason, started_at, ended_at, duration_s, student_words, transcript, feedback, scores, feedback_tries, created_at";

/** What the list of past mocks needs: no transcript, no notes. */
export const LIST_COLUMNS = "id, mode, target, role, status, refund_reason, started_at, duration_s, scores, created_at";

// Three mocks and up to three given back makes six rows at most for a demo
// student; the cap only keeps a bad day from loading a thousand.
const LIST_LIMIT = 50;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v) => typeof v === "string" && UUID_RE.test(v);

/** A read or delete that failed, with a message fit to show. */
export class InterviewError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "InterviewError";
    this.code = code;
  }
}

/** The four things a report scores, in the backend's fixed order
 *  (rules.RUBRIC), with the words a student sees. `hint` is one line, or one
 *  per mode where the mode changes the question. */
export const RUBRIC = [
  { key: "examples", label: "Specific examples", hint: "Real moments, not general claims" },
  { key: "structure", label: "Clear structure", hint: "Gets to the point, then backs it up" },
  { key: "why", label: "Knows why", hint: { college: "Why this school", internship: "Why this role" } },
  { key: "conversation", label: "Conversation", hint: "Answers what was asked, sounds like you, asks back" },
];

const isObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);

/** A row as the pages use it: the transcript always an array, the notes and
 *  the scores an object or null. */
function toMock(row) {
  if (!row) return null;
  const out = {
    ...row,
    transcript: Array.isArray(row.transcript) ? row.transcript : [],
    feedback: isObject(row.feedback) ? row.feedback : null,
    scores: isObject(row.scores) ? row.scores : null,
  };
  delete out.user_id;
  return out;
}

/** The student's mocks, newest first, without their transcripts. */
export async function listMocks(userId) {
  const { data, error } = await supabase.from("interview_mocks").select(LIST_COLUMNS)
    .eq("user_id", userId).order("created_at", { ascending: false }).limit(LIST_LIMIT);
  if (error) throw new InterviewError("Couldn't load your practice interviews. Try again.", "load");
  return (data || []).map(toMock);
}

/** One mock with its transcript and notes, or null when it is not the
 *  student's or no longer exists. A failed read throws, so a page never says
 *  "not found" about a report that is there. */
export async function getMock(userId, id) {
  if (!isUuid(id)) return null;
  const { data, error } = await supabase.from("interview_mocks").select(MOCK_COLUMNS)
    .eq("id", id).eq("user_id", userId).maybeSingle();
  if (error) throw new InterviewError("Couldn't load this practice interview. Try again.", "load");
  return toMock(data);
}

/** Delete a mock: its transcript, notes and scores. It does not give the
 *  mock back. */
export async function deleteMock(userId, id) {
  if (!isUuid(id)) throw new InterviewError("That practice interview was not found.", "not_found");
  const { error } = await supabase.from("interview_mocks").delete().eq("id", id).eq("user_id", userId);
  if (error) throw new InterviewError("Couldn't delete that practice interview. Try again.", "delete");
  return true;
}

// ─── The call's credential ────────────────────────────────────────────────────
// The signed URL is a credential: it lives in memory only, never in storage
// or the URL. The home page holds start's answer here for the moment it takes
// to open the call page, which takes it once. A refresh, a second tab or a
// link opened directly finds nothing, and the call page treats the mock as
// ended. Only one call is held at a time, and an answer nobody took is
// dropped after HOLD_MS (ElevenLabs' signed URLs are short-lived anyway).

const held = new Map();
const HOLD_MS = 5 * 60 * 1000;

/** Keep start_mock's answer (`payload`) for the call page. */
export function holdCall(mockId, payload) {
  held.clear();
  if (!mockId || !payload) return;
  held.set(String(mockId), { payload, at: Date.now() });
}

/** start_mock's answer for this mock, or null; either way it is forgotten. */
export function takeCall(mockId) {
  const key = String(mockId || "");
  const entry = held.get(key);
  held.delete(key);
  if (!entry || Date.now() - entry.at > HOLD_MS) return null;
  return entry.payload;
}
