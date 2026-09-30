import { supabase } from "./supabase.js";

// Beaker's board: the student's outreach pipeline (outreach_contacts).
//
// Students read and write their own cards directly (RLS), like the College
// List. The database also limits WHICH columns they may write: the agent's
// research, the claims and the counters that cap rewrites are the backend's
// alone, so every write here is filtered to the student's columns first
// (sending any other column fails the whole insert or update).
//
// A card read here has the same shape as one the backend returns
// (ContactPayload): every column except user_id and research, plus
// email_verified and what is left of each per-card allowance.

export const STAGES = [
  { key: "to_contact", label: "To contact",      hint: "People you'd like to reach." },
  { key: "drafted",    label: "Drafted",         hint: "Written, not sent yet." },
  { key: "sent",       label: "Sent",            hint: "On its way. Replies can take a week or two." },
  { key: "heard_back", label: "Heard back",      hint: "They wrote back. Keep it going." },
  { key: "meeting",    label: "Meeting or done", hint: "A chat is set, or you got what you needed." },
  { key: "closed",     label: "Closed",          hint: "Finished for now, whatever the outcome." },
];
const STAGE_KEYS = new Set(STAGES.map((s) => s.key));

export function stageLabel(key) {
  return STAGES.find((s) => s.key === key)?.label || "";
}

// Per-card allowances, the same numbers the backend enforces (service.py), so
// a card read here carries the same "left" counts as one the backend sends.
export const LIMITS = {
  rewritesPerCard: 3,
  followupDraftsPerCard: 3,
  followupsPerCard: 2,
  followupAfterDays: 10,
};

// Never user_id or research. The one thing the page needs from research is
// whether the card's address is the one Beaker verified, so only that field
// is read out of it (aliased, and turned into email_verified below).
const VERIFIED = "verified_email:research->>verified_email";
const BOARD_COLUMNS = [
  "id", "stage", "created_by", "name", "title", "organization", "email", "email_source_url",
  "purpose", "notes", "follow_up_on", "position", "rewrites_used", "followup_drafts_used", "follow_ups_sent",
  "sent_via", "sent_at", "last_sent_at", "manual_sent_at", "created_at", "updated_at", VERIFIED,
].join(", ");
const CONTACT_COLUMNS = [
  BOARD_COLUMNS, "voice", "length", "student_note", "why", "subject", "body", "claims", "sources",
  "facts_to_verify", "followup_body", "gmail_thread_id", "message_id_header",
].join(", ");

// The database's column grants for the `authenticated` role.
const INSERT_COLUMNS = ["stage", "name", "title", "organization", "email", "notes", "follow_up_on", "position"];
const UPDATE_COLUMNS = ["stage", "name", "title", "organization", "email", "subject", "body", "notes",
  "follow_up_on", "position", "manual_sent_at"];
const MAX = { name: 120, title: 160, organization: 160, email: 254, subject: 200, body: 4000, notes: 2000 };
// The same shape the table's CHECK accepts.
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const BOARD_LIMIT = 500;

/** True for an address the table would accept (forms check before saving). */
export function isEmail(value) {
  const v = typeof value === "string" ? value.trim() : "";
  return v.length >= 3 && v.length <= MAX.email && EMAIL_RE.test(v);
}

/** The follow-up date a send starts: ten days from `now`, "YYYY-MM-DD". */
export function defaultFollowUpOn(now = new Date()) {
  return isoDay(addDays(now, LIMITS.followupAfterDays));
}

/** A read or write that failed, with a message fit to show. */
export class OutreachError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

// ─── Dates ────────────────────────────────────────────────────────────────────
// follow_up_on is a calendar date ("2026-10-11"). `new Date("2026-10-11")`
// reads it as UTC midnight, which is the evening before in US zones, so dates
// are parsed by hand and compared as local calendar days.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const pad = (n) => String(n).padStart(2, "0");

/** A Date as a local calendar date, "YYYY-MM-DD". */
export function isoDay(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== "string" || !value) return null;
  const m = DAY_RE.exec(value);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]) ? d : null;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

const dayNumber = (d) => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Whole calendar days from `from` to `to` (negative if `to` is earlier), or null. */
export function daysBetween(from, to) {
  const a = toDate(from);
  const b = toDate(to);
  return a && b ? dayNumber(b) - dayNumber(a) : null;
}

/** "today", "tomorrow", "yesterday", "Oct 11", or "Oct 11, 2027" in another year. */
export function dayLabel(value, today = new Date()) {
  const d = toDate(value);
  if (!d) return "";
  const diff = daysBetween(today, d);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";
  const label = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return d.getFullYear() === today.getFullYear() ? label : `${label}, ${d.getFullYear()}`;
}

// ─── Card rules (pure) ────────────────────────────────────────────────────────

const count = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.trunc(Number(v))) : 0);

/** When the last email on this card went out, by Gmail or by hand (an ISO string), or null. */
export function lastSentAt(card) {
  return card?.last_sent_at || card?.sent_at || card?.manual_sent_at || null;
}

/** True when Beaker should nudge: a Sent card, a follow-up still allowed, and
 *  at least 10 days since the last email. */
export function followUpDue(card, today = new Date()) {
  if (!card || card.stage !== "sent") return false;
  if (count(card.follow_ups_sent) >= LIMITS.followupsPerCard) return false;
  const days = daysBetween(lastSentAt(card), today);
  return days !== null && days >= LIMITS.followupAfterDays;
}

/** Days since the last email, or null if none was sent. */
export function daysSinceSent(card, today = new Date()) {
  return daysBetween(lastSentAt(card), today);
}

// The student's own follow-up date, once it has come. Sent cards use the
// follow-up rule instead (the backend sets their date to the day it allows).
function dateDue(card, today) {
  if (!card?.follow_up_on || card.stage === "sent" || card.stage === "meeting" || card.stage === "closed") return false;
  const days = daysBetween(today, card.follow_up_on);
  return days !== null && days <= 0;
}

/** The amber marker on a card ("Follow-up due", "Due today", "Due Oct 3"), or null. */
export function dueMarker(card, today = new Date()) {
  if (followUpDue(card, today)) return "Follow-up due";
  if (dateDue(card, today)) return `Due ${dayLabel(card.follow_up_on, today)}`;
  return null;
}

/** Where a card stands, in plain words ("Draft ready", "Sent Oct 1, follow up Oct 11"). */
export function stageLine(card, today = new Date()) {
  const due = dueMarker(card, today) !== null;
  const date = (v) => dayLabel(v, today);
  switch (card?.stage) {
    case "to_contact":
      if (card.follow_up_on && !due) return `Reach out by ${date(card.follow_up_on)}`;
      return card.created_by === "agent" ? "No draft yet" : "Not contacted yet";
    case "drafted":
      return "Draft ready";
    case "sent": {
      const followed = count(card.follow_ups_sent) > 0;
      const when = followed ? lastSentAt(card) : (card.sent_at || card.manual_sent_at);
      const head = when ? `${followed ? "Followed up" : "Sent"} ${date(when)}` : "Sent";
      const next = card.follow_up_on || card.next_followup_on;
      const left = LIMITS.followupsPerCard - count(card.follow_ups_sent);
      return !due && left > 0 && next ? `${head}, follow up ${date(next)}` : head;
    }
    case "heard_back":
      return card.follow_up_on && !due ? `Reply by ${date(card.follow_up_on)}` : "They wrote back";
    case "meeting":
      return card.follow_up_on ? `Next step ${date(card.follow_up_on)}` : "Meeting set, or done";
    case "closed":
      return "Closed";
    default:
      return "";
  }
}

/**
 * What else changes when a card moves to `stage` (merge it into the write).
 * Moving a card into Sent with no send on record means the student sent it
 * themselves, so it is stamped like "Mark as sent" (which also starts the
 * 10-day follow-up clock). A date the student already set for later than
 * that is theirs and stays; an earlier one (a "reach out by" date the send
 * just met) gives way to the follow-up date. Moving a hand-sent card back
 * before Sent takes the stamp off again, so the card stops counting as sent,
 * and takes the follow-up date with it when the stamp is what set it. A Gmail
 * send is never undone here.
 */
export function sentStampFor(card, stage, now = new Date()) {
  if (!card || card.stage === stage) return {};
  if (stage === "sent" && !lastSentAt(card)) {
    const stamp = { manual_sent_at: now.toISOString() };
    const due = defaultFollowUpOn(now);
    const own = typeof card.follow_up_on === "string" && DAY_RE.test(card.follow_up_on) && toDate(card.follow_up_on)
      ? card.follow_up_on : null;
    // "YYYY-MM-DD" strings compare in date order.
    if (!own || own < due) stamp.follow_up_on = due;
    return stamp;
  }
  if ((stage === "to_contact" || stage === "drafted") && card.manual_sent_at && !card.sent_at && !card.last_sent_at) {
    const unstamp = { manual_sent_at: null };
    const stamped = toDate(card.manual_sent_at);
    if (stamped && card.follow_up_on && card.follow_up_on === defaultFollowUpOn(stamped)) unstamp.follow_up_on = null;
    return unstamp;
  }
  return {};
}

/** A database row (or a card) as the page uses it: ContactPayload's shape. */
export function toContact(row) {
  if (!row) return null;
  const { verified_email: verified, user_id: _u, research: _r, ...card } = row;
  if ("verified_email" in row) {
    const email = typeof card.email === "string" ? card.email.trim().toLowerCase() : "";
    const good = typeof verified === "string" ? verified.trim().toLowerCase() : "";
    card.email_verified = !!email && email === good;
  } else {
    card.email_verified = !!card.email_verified;
  }
  card.rewrites_left = Math.max(0, LIMITS.rewritesPerCard - count(card.rewrites_used));
  card.followup_drafts_left = Math.max(0, LIMITS.followupDraftsPerCard - count(card.followup_drafts_used));
  card.followups_left = Math.max(0, LIMITS.followupsPerCard - count(card.follow_ups_sent));
  const last = toDate(lastSentAt(card));
  card.next_followup_on = last && card.followups_left > 0 ? isoDay(addDays(last, LIMITS.followupAfterDays)) : null;
  return card;
}

// ─── Ordering (pure) ──────────────────────────────────────────────────────────
// Within a stage: position, lowest first, then the most recently updated. A
// card the agent makes starts at 0; a card the student adds or moves goes to
// the top, or between the two cards it was dropped between.

const pos = (c) => (Number.isFinite(Number(c?.position)) ? Number(c.position) : 0);
const stamp = (c) => { const t = Date.parse(c?.updated_at || ""); return Number.isNaN(t) ? 0 : t; };

export function compareCards(a, b) {
  return pos(a) - pos(b) || stamp(b) - stamp(a) || String(a.id).localeCompare(String(b.id));
}

/** { to_contact: [...], drafted: [...], ... }, each in board order. A card
 *  with an unknown stage is shown under To contact rather than lost. */
export function groupByStage(cards) {
  const out = Object.fromEntries(STAGES.map((s) => [s.key, []]));
  for (const c of cards || []) (STAGE_KEYS.has(c.stage) ? out[c.stage] : out.to_contact).push(c);
  for (const key of Object.keys(out)) out[key].sort(compareCards);
  return out;
}

/** The position that puts a card at the top of `list` (a stage, in board order). */
export function topPosition(list) {
  return list?.length ? pos(list[0]) - 1 : 0;
}

/**
 * Where a card lands when inserted at `index` of `list` (the target stage in
 * board order, without the card being moved): halfway between its new
 * neighbours. When they share a position (agent cards all start at 0) or
 * there is no room left between them, the stage is renumbered 0, 1, 2... and
 * `respace` lists the other cards whose position has to change with it.
 */
export function placeAt(list, index) {
  const cards = list || [];
  const i = Math.max(0, Math.min(Number.isInteger(index) ? index : 0, cards.length));
  const above = i > 0 ? pos(cards[i - 1]) : null;
  const below = i < cards.length ? pos(cards[i]) : null;
  if (above === null && below === null) return { position: 0, respace: [] };
  if (above === null) return { position: below - 1, respace: [] };
  if (below === null) return { position: above + 1, respace: [] };
  const mid = (above + below) / 2;
  if (above < mid && mid < below) return { position: mid, respace: [] };
  const respace = [];
  cards.forEach((c, k) => {
    const p = k < i ? k : k + 1;
    if (pos(c) !== p) respace.push({ id: c.id, position: p });
  });
  return { position: i, respace };
}

// ─── Writes: only the student's columns ──────────────────────────────────────

function text(value, max) {
  return (typeof value === "string" ? value : value == null ? "" : String(value)).slice(0, max);
}

function clean(fields, allowed) {
  const out = {};
  for (const key of allowed) {
    if (!Object.prototype.hasOwnProperty.call(fields, key) || fields[key] === undefined) continue;
    const v = fields[key];
    switch (key) {
      case "name": {
        const name = text(v, 1000).trim().slice(0, MAX.name);
        if (!name) throw new OutreachError("Add a name.", "name_required");
        out.name = name;
        break;
      }
      case "title":
      case "organization":
        out[key] = text(v, 1000).trim().slice(0, MAX[key]);
        break;
      case "email": {
        const email = text(v, 1000).trim();
        if (!email) { out.email = null; break; }
        if (email.length > MAX.email || !EMAIL_RE.test(email)) {
          throw new OutreachError("That email address doesn't look right.", "bad_email");
        }
        out.email = email;
        break;
      }
      case "subject":
      case "body":
      case "notes":
        out[key] = text(v, MAX[key]);
        break;
      case "follow_up_on": {
        if (v === null || v === "") { out.follow_up_on = null; break; }
        const d = typeof v === "string" && DAY_RE.test(v) ? toDate(v) : null;
        if (!d) throw new OutreachError("That date doesn't look right.", "bad_date");
        out.follow_up_on = v;
        break;
      }
      case "stage":
        if (!STAGE_KEYS.has(v)) throw new OutreachError("That stage doesn't exist.", "bad_stage");
        out.stage = v;
        break;
      case "position":
        if (!Number.isFinite(Number(v))) throw new OutreachError("Couldn't place that card.", "bad_position");
        out.position = Number(v);
        break;
      case "manual_sent_at": {
        if (v === null) { out.manual_sent_at = null; break; }
        const d = toDate(v);
        if (!d) throw new OutreachError("That date doesn't look right.", "bad_date");
        out.manual_sent_at = d.toISOString();
        break;
      }
      default:
        break;
    }
  }
  return out;
}

// ─── Reads and writes ─────────────────────────────────────────────────────────

/** Every card on the student's board, in board order within each stage. */
export async function loadBoard(userId) {
  const { data, error } = await supabase.from("outreach_contacts").select(BOARD_COLUMNS)
    .eq("user_id", userId)
    .order("position", { ascending: true })
    .order("updated_at", { ascending: false })
    .limit(BOARD_LIMIT);
  if (error) throw new OutreachError("Couldn't load your board. Try again.", "load");
  return (data || []).map(toContact);
}

/** One card with everything the review page needs, or null if it is not theirs. */
export async function getContact(userId, id) {
  const { data, error } = await supabase.from("outreach_contacts").select(CONTACT_COLUMNS)
    .eq("id", id).eq("user_id", userId).maybeSingle();
  if (error) throw new OutreachError("Couldn't open that card. Try again.", "load");
  return toContact(data);
}

/** A card the student adds by hand (free, outside the tries). */
export async function addContact(userId, fields) {
  const row = { user_id: userId, stage: "to_contact", ...clean(fields || {}, INSERT_COLUMNS) };
  if (!row.name) throw new OutreachError("Add a name.", "name_required");
  const { data, error } = await supabase.from("outreach_contacts").insert(row).select(CONTACT_COLUMNS).single();
  if (error) throw new OutreachError("Couldn't add that contact. Try again.", "save");
  return toContact(data);
}

async function update(userId, id, patch, message) {
  const { data, error } = await supabase.from("outreach_contacts")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id).eq("user_id", userId)
    .select(CONTACT_COLUMNS).single();
  if (error) throw new OutreachError(message, "save");
  return toContact(data);
}

/** Change a card. Anything outside the student's columns is dropped. */
export async function updateContact(userId, id, patch) {
  return update(userId, id, clean(patch || {}, UPDATE_COLUMNS), "Couldn't save that. Try again.");
}

/** Move a card to `stage` at `position`. `extra` is merged into the same write
 *  (see sentStampFor), filtered to the student's columns like any update. */
export async function moveContact(userId, id, stage, position, extra = {}) {
  const patch = clean({ ...extra, stage, position }, UPDATE_COLUMNS);
  return update(userId, id, patch, "Couldn't move that card. Try again.");
}

export async function deleteContact(userId, id) {
  const { error } = await supabase.from("outreach_contacts").delete().eq("id", id).eq("user_id", userId);
  if (error) throw new OutreachError("Couldn't delete that contact. Try again.", "delete");
}

/** "I sent it myself" (after Copy or the mail app): Sent, stamped now, with
 *  the 10-day follow-up date the backend would set after a Gmail send. */
export async function markSentByHand(userId, id) {
  const now = new Date();
  return update(userId, id, {
    stage: "sent",
    manual_sent_at: now.toISOString(),
    follow_up_on: defaultFollowUpOn(now),
  }, "Couldn't mark that as sent. Try again.");
}
