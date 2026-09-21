import { supabase } from "./supabase.js";

const LANGGRAPH_URL = import.meta.env.VITE_LANGGRAPH_CHAT_URL;

const num = (v) => {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Persist the intake form. Writes the scalar record onto `profiles` and replaces
 * the student's list rows.
 *
 * Replace-not-append: onboarding is a one-shot flow, and if a student backs up and
 * resubmits we want their latest lists, not two merged copies.
 */
export async function saveIntakeForm(userId, v) {
  const now = new Date().toISOString();

  await supabase.from("profiles").upsert({
    id:               userId,
    full_name:        v.fullName?.trim() || null,
    graduation_year:  v.graduationYear || null,
    grade_level:      v.gradeLevel || null,
    location_general: v.state?.trim() || null,
    education_level:  "high_school",
    gpa_unweighted:   v.gpaScale === "not_used" ? null : num(v.gpaUnweighted),
    gpa_weighted:     v.gpaScale === "not_used" ? null : num(v.gpaWeighted),
    gpa_scale:        v.gpaScale || null,
    candidate_majors: v.majors || [],
    target_colleges:  v.colleges || [],
    updated_at:       now,
  }, { onConflict: "id" });

  const wipe = (table) => supabase.from(table).delete().eq("user_id", userId);
  await Promise.all([
    wipe("student_activities"), wipe("student_awards"),
    wipe("student_courses"), wipe("student_test_scores"),
  ]);

  const inserts = [];

  if (v.activities?.length) {
    inserts.push(supabase.from("student_activities").insert(
      v.activities.map((title, i) => ({
        user_id: userId, title, order_index: i, detail_level: "name_only",
      }))
    ));
  }

  if (v.awards?.length) {
    inserts.push(supabase.from("student_awards").insert(
      v.awards.map((title, i) => ({ user_id: userId, title, order_index: i }))
    ));
  }

  if (v.courses?.length) {
    inserts.push(supabase.from("student_courses").insert(
      v.courses.map((c, i) => ({
        user_id: userId, name: c.name, level: c.level || null, order_index: i,
      }))
    ));
  }

  const scores = [];
  if (v.testType === "sat" && num(v.sat?.total) != null) {
    scores.push({
      user_id: userId, test_type: "sat", score: num(v.sat.total),
      section_scores: {
        ...(num(v.sat.rw) != null ? { reading_writing: num(v.sat.rw) } : {}),
        ...(num(v.sat.math) != null ? { math: num(v.sat.math) } : {}),
      },
    });
  }
  if (v.testType === "act" && num(v.act?.composite) != null) {
    scores.push({ user_id: userId, test_type: "act", score: num(v.act.composite), section_scores: {} });
  }
  for (const ap of (v.aps || [])) {
    if (ap.subject?.trim()) {
      scores.push({
        user_id: userId, test_type: "ap", subject: ap.subject.trim(),
        score: ap.score ?? null, section_scores: {},
      });
    }
  }
  if (scores.length) inserts.push(supabase.from("student_test_scores").insert(scores));

  await Promise.all(inserts);
}

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session?.access_token}`,
  };
}

/** The rendered form summary, used to seed the voice agent. */
export async function fetchIntakeContext() {
  const res = await fetch(`${LANGGRAPH_URL}/onboarding/context`, { headers: await authHeaders() });
  if (!res.ok) throw new Error(`Context fetch failed (${res.status})`);
  return res.json();
}

/** Turn a transcript into a reviewable draft. Does not complete onboarding. */
export async function extractIntake(transcript, channel, force = false) {
  const res = await fetch(`${LANGGRAPH_URL}/onboarding/intake/extract`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ transcript, channel, force }),
  });
  if (!res.ok) throw new Error(`Extraction failed (${res.status})`);
  return res.json();
}

/** Commit the student-confirmed draft and finish onboarding. */
export async function commitIntake(draft, channel) {
  const res = await fetch(`${LANGGRAPH_URL}/onboarding/intake/commit`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ draft, channel }),
  });
  if (!res.ok) throw new Error(`Save failed (${res.status})`);
  return res.json();
}

/** The student's activity rows, for labelling the review screen. */
export async function fetchActivities(userId) {
  const { data } = await supabase
    .from("student_activities").select("id, title")
    .eq("user_id", userId).order("order_index");
  return data || [];
}
