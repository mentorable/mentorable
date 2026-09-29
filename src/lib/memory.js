// What Mentorable remembers, and the student's controls over it (Profile).
//
// Two kinds of memory, both written by the backend only:
//   * student_memories: their own lines from chat and Quest check-ins, verbatim.
//     A student can read and delete their own rows (RLS); nothing here inserts.
//   * profiles.chat_signals: one-sentence notes, one per chat, that seed the
//     next conversation ("notes from your chats").
// profiles.memory_enabled is the switch: off, nothing new is saved and nothing
// saved is used, by chat or by Quest.

import { supabase } from "./supabase.js";

// A short first page keeps Profile short; "Show more" loads bigger ones.
export const MEMORY_FIRST_PAGE = 10;
export const MEMORY_PAGE = 40;

// One page, newest first. `after` is the last memory already on screen: paging
// from it (rather than by a count) means deleting a row while a page loads can
// never make the next page skip one.
export async function loadMemories(userId, { after = null, limit = MEMORY_PAGE } = {}) {
  let query = supabase
    .from("student_memories")
    .select("id, body, context, source, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (after) {
    const at = `"${after.created_at}"`;
    query = query.or(`created_at.lt.${at},and(created_at.eq.${at},id.lt.${after.id})`);
  }
  const { data, error } = await query.limit(limit + 1); // one extra row says whether there is more
  if (error) throw error;
  const rows = data || [];
  return { items: rows.slice(0, limit), more: rows.length > limit };
}

export async function countMemories(userId) {
  const { count, error } = await supabase
    .from("student_memories")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw error;
  return count || 0;
}

export async function loadMemorySettings(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("memory_enabled, chat_signals")
    .eq("id", userId)
    .single();
  if (error) throw error;
  const notes = Array.isArray(data?.chat_signals)
    ? data.chat_signals.filter((n) => typeof n === "string" && n.trim())
    : [];
  return { enabled: data?.memory_enabled !== false, notes };
}

export async function setMemoryEnabled(userId, enabled) {
  const { error } = await supabase.from("profiles").update({ memory_enabled: !!enabled }).eq("id", userId);
  if (error) throw error;
}

export async function deleteMemory(userId, id) {
  const { error } = await supabase.from("student_memories").delete().eq("id", id).eq("user_id", userId);
  if (error) throw error;
}

// Read, remove, write: re-read first so a note the backend added a moment ago
// is not lost. Returns the notes that remain.
export async function deleteNote(userId, note) {
  const { data, error } = await supabase.from("profiles").select("chat_signals").eq("id", userId).single();
  if (error) throw error;
  const notes = Array.isArray(data?.chat_signals) ? [...data.chat_signals] : [];
  const at = notes.indexOf(note);
  if (at >= 0) notes.splice(at, 1);
  const { error: writeError } = await supabase.from("profiles").update({ chat_signals: notes }).eq("id", userId);
  if (writeError) throw writeError;
  return notes.filter((n) => typeof n === "string" && n.trim());
}

// Every saved line and every note, in one transaction (public.clear_my_memories).
// It also stamps the moment they did it, so a save that was already under way
// when they pressed the button writes nothing; marks their older history as
// handled, so the one-off import of pre-memory check-ins and chats never brings
// any of it back; and removes the advisor's saved chat state, which holds
// copies of the notes.
export async function deleteAllMemories() {
  const { error } = await supabase.rpc("clear_my_memories");
  if (error) throw error;
}

// Where a line was said, in words a student would use.
export function whereSaid(memory) {
  const task = (memory.context || "").trim();
  if (memory.source === "checkin") return task ? `Quest check-in on ${task}` : "Quest check-in";
  if (memory.source === "followup") return task ? `Quest follow-up on ${task}` : "Quest follow-up";
  return "Chat";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function memoryDate(iso, now = new Date()) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const label = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return d.getFullYear() === now.getFullYear() ? label : `${label}, ${d.getFullYear()}`;
}
