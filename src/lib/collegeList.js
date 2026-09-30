import { supabase } from "./supabase.js";
import { studentStats, suggestCategory } from "./collegeCategory.js";

// College List data. Students read and write their own rows directly (RLS),
// like the Portfolio tables; only the school search goes through the server,
// because the College Scorecard key lives there.

const COLUMNS = "id, scorecard_id, name, city, state, admission_rate, sat_25, sat_75, act_25, act_75, " +
  "net_price, enrollment, category, category_source, created_at";

/** A search or save that failed, with a message fit to show. */
export class CollegeListError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

/** The list, plus what the rule needs from the student's record, plus the
 *  names they typed at onboarding (the seed for a first import). */
export async function loadCollegeList(userId) {
  const [items, profile, scores] = await Promise.all([
    supabase.from("college_list_items").select(COLUMNS).eq("user_id", userId).order("created_at"),
    supabase.from("profiles").select("gpa_unweighted, gpa_scale, target_colleges").eq("id", userId).single(),
    supabase.from("student_test_scores").select("test_type, score").eq("user_id", userId),
  ]);
  if (items.error) throw new CollegeListError("Could not load your list. Refresh to try again.", "load");
  const onboardingNames = Array.isArray(profile.data?.target_colleges)
    ? profile.data.target_colleges.filter((n) => typeof n === "string" && n.trim())
    : [];
  return {
    items: items.data || [],
    stats: studentStats(profile.data, scores.data),
    onboardingNames,
  };
}

/** Real schools matching what they typed, best match first, and the name the
 *  search actually used (a short name like "UMich" comes back expanded). */
export async function searchSchools(query) {
  const { data, error } = await supabase.functions.invoke("college-search", { body: { query } });
  if (error) {
    let body = null;
    try { body = await error.context?.json(); } catch { /* not JSON */ }
    throw new CollegeListError(
      body?.error || "School search is not responding. Try again in a bit.",
      body?.code || "network",
    );
  }
  return {
    schools: Array.isArray(data?.schools) ? data.schools : [],
    searchedFor: typeof data?.searched_for === "string" ? data.searched_for : query,
  };
}

const FACTS = ["scorecard_id", "name", "city", "state", "admission_rate", "sat_25", "sat_75",
  "act_25", "act_75", "net_price", "enrollment"];

/**
 * Add a school. With no `category`, it takes the rule's suggestion; with one,
 * the student chose it (used when the rule has nothing to go on).
 */
export async function addSchool(userId, school, stats, category = null) {
  const suggestion = category ? null : suggestCategory(stats, school);
  if (!category && !suggestion) throw new CollegeListError("Pick a category for this school.", "needs_category");
  const row = {
    user_id: userId,
    ...Object.fromEntries(FACTS.map((k) => [k, school[k] ?? null])),
    category: category || suggestion.category,
    category_source: category ? "student" : suggestion.source,
  };
  const { data, error } = await supabase.from("college_list_items").insert(row).select(COLUMNS).single();
  if (error) {
    if (error.code === "23505") throw new CollegeListError("That school is already on your list.", "duplicate");
    throw new CollegeListError("Could not add that school. Try again.", "save");
  }
  return data;
}

/** The student's own call. The app never changes it after this. */
export async function setCategory(id, category) {
  const { data, error } = await supabase.from("college_list_items")
    .update({ category, category_source: "student", updated_at: new Date().toISOString() })
    .eq("id", id).select(COLUMNS).single();
  if (error) throw new CollegeListError("Could not change that. Try again.", "save");
  return data;
}

/** Hand a school back to the rule: its suggestion, and the app keeps it current again. */
export async function restoreSuggestion(id, suggestion) {
  const { data, error } = await supabase.from("college_list_items")
    .update({ category: suggestion.category, category_source: suggestion.source, updated_at: new Date().toISOString() })
    .eq("id", id).select(COLUMNS).single();
  if (error) throw new CollegeListError("Could not change that. Try again.", "save");
  return data;
}

export async function removeSchool(id) {
  const { error } = await supabase.from("college_list_items").delete().eq("id", id);
  if (error) throw new CollegeListError("Could not remove that school. Try again.", "save");
}

/** The rows whose suggestion no longer matches the student's record. Pure. */
export function suggestionChanges(items, stats) {
  const changes = [];
  for (const it of items) {
    if (it.category_source === "student") continue;
    const s = suggestCategory(stats, it);
    if (s && (s.category !== it.category || s.source !== it.category_source)) {
      changes.push({ id: it.id, category: s.category, category_source: s.source, moved: s.category !== it.category });
    }
  }
  return changes;
}

/**
 * Re-run the rule on every suggested row, so a new SAT moves a school the way
 * it should. A row the student set is never touched. Returns the updated list
 * and how many schools moved.
 */
export async function refreshSuggestions(items, stats) {
  const changes = suggestionChanges(items, stats);
  if (!changes.length) return { items, moved: 0 };
  const saved = await Promise.all(changes.map(({ id, category, category_source }) =>
    supabase.from("college_list_items")
      .update({ category, category_source, updated_at: new Date().toISOString() })
      .eq("id", id).select(COLUMNS).single()));
  const byId = new Map(saved.filter((r) => !r.error && r.data).map((r) => [r.data.id, r.data]));
  return {
    items: items.map((it) => byId.get(it.id) || it),
    moved: changes.filter((c) => c.moved && byId.has(c.id)).length,
  };
}

const normName = (s) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

// The one school whose official name is exactly what was searched (a short
// name like "UMich" already expanded), or null. Anything looser picks wrong
// schools without anyone noticing: "Michigan" would land on Michigan State, and
// "Columbia" on whichever Columbia is biggest. Better to ask the student.
function exactMatch(searchedFor, schools) {
  const want = normName(searchedFor);
  const hits = schools.filter((s) => normName(s.name) === want);
  return hits.length === 1 ? hits[0] : null;
}

/**
 * Turn the free-text names from onboarding into list rows. Each name is
 * searched, and a school is added only when exactly one result's official name
 * is what was searched. Everything else is handed back for the student to
 * search, so a vague name never becomes the wrong school.
 */
export async function importOnboardingNames(userId, names, stats, onProgress,
  { search = searchSchools, add = addSchool } = {}) {
  const added = [];
  const unmatched = [];
  const seen = new Set();
  for (const name of names.slice(0, 20)) {
    onProgress?.(name);
    let found;
    try {
      found = await search(name);
    } catch (e) {
      if (e.code === "NOT_CONFIGURED") throw e;
      unmatched.push(name);
      continue;
    }
    const top = exactMatch(found.searchedFor, found.schools);
    if (!top) { unmatched.push(name); continue; }
    if (seen.has(top.scorecard_id)) continue;   // "NYU" and "New York University" in one list
    seen.add(top.scorecard_id);
    const suggestion = suggestCategory(stats, top);
    if (!suggestion) { unmatched.push(name); continue; }
    try {
      added.push(await add(userId, top, stats));
    } catch (e) {
      if (e.code !== "duplicate") unmatched.push(name);
    }
  }
  return { added, unmatched };
}
