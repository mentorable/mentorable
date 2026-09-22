import { supabase } from "./supabase.js";

const LANGGRAPH_URL = import.meta.env.VITE_LANGGRAPH_CHAT_URL;

/**
 * The student's whole college record, which the Portfolio page edits.
 *
 * Academics (GPA, test scores, coursework) and ECs/Awards (activities, awards)
 * are the two tabs. Everything lives in the tables the intake writes, so the
 * portfolio and the intake are the same record rather than two copies.
 */
export async function fetchRecord(userId) {
  const rows = (table, cols, order) =>
    supabase.from(table).select(cols).eq("user_id", userId).order(order);

  const [profile, activities, awards, courses, scores] = await Promise.all([
    supabase.from("profiles")
      .select("full_name, gpa_unweighted, gpa_weighted, gpa_scale, resume_contact")
      .eq("id", userId).maybe_single(),
    rows("student_activities",
      "id, title, category, position, organization, description, grade_levels, timing, " +
      "hours_per_week, weeks_per_year, continue_in_college, detail_level, order_index",
      "order_index"),
    rows("student_awards", "id, title, level, year, description, order_index", "order_index"),
    rows("student_courses", "id, name, level, grade_level, planned, order_index", "order_index"),
    rows("student_test_scores", "id, test_type, score, subject, section_scores, test_date", "test_type"),
  ]);

  return {
    profile:    profile.data || {},
    activities: activities.data || [],
    awards:     awards.data || [],
    courses:    courses.data || [],
    scores:     scores.data || [],
  };
}

const nextIndex = (list) =>
  list.reduce((max, r) => Math.max(max, r.order_index ?? 0), -1) + 1;

/** Insert one row, returning it so the caller can splice it into state. */
export async function addRow(table, userId, values, existing = []) {
  const { data, error } = await supabase
    .from(table)
    .insert({ user_id: userId, order_index: nextIndex(existing), ...values })
    .select().single();
  if (error) throw error;
  return data;
}

export async function updateRow(table, id, patch) {
  const { error } = await supabase
    .from(table)
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteRow(table, id) {
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) throw error;
}

/** GPA lives on profiles, not in a child table. */
export async function saveGpa(userId, { gpaUnweighted, gpaWeighted, gpaScale }) {
  const num = (v) => {
    if (v === null || v === undefined || String(v).trim() === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const { error } = await supabase.from("profiles").update({
    gpa_unweighted: gpaScale === "not_used" ? null : num(gpaUnweighted),
    gpa_weighted:   gpaScale === "not_used" ? null : num(gpaWeighted),
    gpa_scale:      gpaScale || null,
    updated_at:     new Date().toISOString(),
  }).eq("id", userId);
  if (error) throw error;
}

export async function saveContact(userId, contact) {
  const { error } = await supabase.from("profiles")
    .update({ resume_contact: contact, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) throw error;
}

/** Bulk-insert what the upload extractor found, after the student reviews it. */
export async function addExtracted(userId, rows, record) {
  const activities = rows.filter((r) => r.kind === "activity");
  const awards     = rows.filter((r) => r.kind === "award");
  const out = { activities: [], awards: [] };

  if (activities.length) {
    const base = nextIndex(record.activities);
    const { data, error } = await supabase.from("student_activities").insert(
      activities.map((r, i) => ({
        user_id: userId, title: r.title, position: r.position || null,
        organization: r.organization || null, description: r.description || null,
        hours_per_week: r.hours_per_week ?? null, weeks_per_year: r.weeks_per_year ?? null,
        grade_levels: r.grade_levels || [],
        detail_level: r.position || r.description ? "enriched" : "name_only",
        order_index: base + i,
      }))
    ).select();
    if (error) throw error;
    out.activities = data || [];
  }

  if (awards.length) {
    const base = nextIndex(record.awards);
    const { data, error } = await supabase.from("student_awards").insert(
      awards.map((r, i) => ({
        user_id: userId, title: r.title, level: r.level || null,
        year: r.year ?? null, description: r.description || null,
        order_index: base + i,
      }))
    ).select();
    if (error) throw error;
    out.awards = data || [];
  }

  return out;
}

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session?.access_token}`,
  };
}

/** Export the chosen pieces of both tabs as a PDF. Returns a Blob. */
export async function generateResume(selection, contact) {
  const res = await fetch(`${LANGGRAPH_URL}/portfolio/resume/pdf`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ ...selection, contact }),
  });
  if (!res.ok) {
    if (res.status === 429) { const e = new Error("LIMIT_REACHED"); e.limit = true; throw e; }
    const j = await res.json().catch(() => ({}));
    throw new Error(j.detail || `Export failed (${res.status})`);
  }
  return res.blob();
}
