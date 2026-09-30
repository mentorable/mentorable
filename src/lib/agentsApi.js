import { supabase } from "./supabase.js";

// The Agents API: Beaker's calls and the Gmail connection. JSON calls work
// like Quest's (src/lib/quest.js). The two long ones, shortlist and draft,
// stream Server-Sent Events: progress lines for the checklist, then one final
// event, then [DONE]. The server keeps working if the page goes away, so a
// try that was paid for always ends on the board or refunded.

const BASE = import.meta.env.VITE_LANGGRAPH_CHAT_URL;

/** A refusal or failure from the Agents API. `code` is the server's
 *  detail.error ("no_tries", "gmail_not_connected", ...), or one of this
 *  file's own: "auth", "network", "stream_lost". `message` is fit to show. */
export class AgentApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "AgentApiError";
    this.status = status;
    this.code = code;
  }
}

const NETWORK = "Could not reach Mentorable. Check your connection and try again.";
const STREAM_LOST = "The connection dropped while Beaker was working. Beaker keeps going without you, so check your board in a minute.";
const SIGN_IN = "Your session ended. Sign in again.";

// The server decides what day it is from the zone saved on the profile. The
// browser's zone is only sent so the first visit has something to save.
function browserZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    return "";
  }
}

async function headers() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new AgentApiError(401, "auth", SIGN_IN);
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.access_token}`,
    "X-Timezone": browserZone(),
  };
}

/** The error a non-2xx response carries: {"detail": {"error", "message"}}.
 *  A 401 is always "auth": the server refused the sign-in itself (revoked or
 *  expired on its side while this browser's session still looks fine), and
 *  its detail is a plain string that no retry will change. */
async function refusal(res) {
  if (res.status === 401) return new AgentApiError(401, "auth", SIGN_IN);
  let json = null;
  try { json = await res.json(); } catch { /* empty or not JSON */ }
  const d = json?.detail;
  return new AgentApiError(
    res.status,
    (d && d.error) || "error",
    (d && d.message) || (typeof d === "string" ? d : "Something went wrong. Try again."),
  );
}

async function call(path, { method = "GET", body, signal } = {}) {
  const h = await headers();
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method, headers: h, signal,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    if (e?.name === "AbortError") throw e;
    throw new AgentApiError(0, "network", NETWORK);
  }
  if (!res.ok) throw await refusal(res);
  try {
    return await res.json();
  } catch {
    return null;
  }
}

const post = (path, body = {}) => call(path, { method: "POST", body });

/** Parse one SSE block ("data: ...\n\n"). Returns the data string, or null
 *  for a comment-only block (": ping"). Multi-line data joins with "\n". */
function blockData(block) {
  const data = [];
  for (const line of block.split("\n")) {
    if (!line || line.startsWith(":")) continue;          // blank or a keep-alive comment
    if (line.startsWith("data:")) data.push(line.slice(line[5] === " " ? 6 : 5));
  }
  return data.length ? data.join("\n") : null;
}

/**
 * POST a JSON body and read the event stream. `onEvent` gets every event,
 * progress lines included, in order. Resolves with the final event (the
 * last one that is not a progress line). A refusal before the stream starts
 * (no tries left, a bad body, busy) throws AgentApiError with its code; a
 * stream that ends without a final event throws "stream_lost".
 */
async function stream(path, body, onEvent, { signal } = {}) {
  const h = await headers();
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: "POST", headers: { ...h, Accept: "text/event-stream" }, body: JSON.stringify(body), signal,
    });
  } catch (e) {
    if (e?.name === "AbortError") throw e;
    throw new AgentApiError(0, "network", NETWORK);
  }
  if (!res.ok) throw await refusal(res);
  if (!res.body) throw new AgentApiError(0, "stream_lost", STREAM_LOST);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let final = null;
  let done = false;

  const handle = (block) => {
    const data = blockData(block);
    if (data === null) return;
    if (data === "[DONE]") { done = true; return; }
    // `event` is declared out here so the catch below never references a
    // name scoped to the try (see the note in mentora.js).
    let event;
    try {
      event = JSON.parse(data);
    } catch {
      return;   // not JSON: nothing the page can use
    }
    if (!event || typeof event !== "object") return;
    try { onEvent?.(event); } catch (e) { console.warn("[agents] onEvent threw:", e); }
    if (event.type !== "progress") final = event;
  };

  try {
    while (!done) {
      const { done: ended, value } = await reader.read();
      if (ended) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n?/g, "\n");
      let cut = buffer.indexOf("\n\n");
      while (cut !== -1 && !done) {
        handle(buffer.slice(0, cut));
        buffer = buffer.slice(cut + 2);
        cut = buffer.indexOf("\n\n");
      }
    }
    if (!done && buffer.trim()) handle(buffer);   // a last block without its blank line
  } catch (e) {
    if (e?.name === "AbortError") throw e;
    if (!final) throw new AgentApiError(0, "stream_lost", STREAM_LOST);
  } finally {
    try { reader.releaseLock(); } catch { /* already released */ }
  }

  if (!final) throw new AgentApiError(0, "stream_lost", STREAM_LOST);
  return final;
}

export const agentsApi = {
  /** Tries, today's sends, the per-card limits, Gmail, and any open try. */
  status:           ()                 => call("/agents/outreach/status"),
  googleStatus:     ()                 => call("/agents/google/status"),
  /** -> { url }. The caller sends the browser there (window.location.href). */
  googleConnect:    (returnTo)         => post("/agents/google/connect", { return_to: returnTo }),
  googleDisconnect: ()                 => post("/agents/google/disconnect"),
  /** Saves the connection Google just granted, as the signed-in student. */
  googleFinish:     (code)             => post("/agents/google/finish", { code }),
  /** SSE. Resolves to {type: "shortlist"} or {type: "error"}. */
  shortlist:        (body, onEvent, opts) => stream("/agents/outreach/shortlist", body, onEvent, opts),
  /** SSE. Resolves to {type: "draft" | "question" | "ambiguous" | "error"}. */
  draft:            (body, onEvent, opts) => stream("/agents/outreach/draft", body, onEvent, opts),
  rewrite:          (id, body)         => post(`/agents/outreach/contacts/${encodeURIComponent(id)}/rewrite`, body),
  followup:         (id)               => post(`/agents/outreach/contacts/${encodeURIComponent(id)}/followup`),
  send:             (id, body)         => post(`/agents/outreach/contacts/${encodeURIComponent(id)}/send`, body),
};

// ── Plain copy for every refusal ──────────────────────────────────────────────
// What the student reads when a call is refused. Where the server's message
// carries a detail this cannot know (a date, the address, which rule the
// email broke), the server's words are shown instead.

const COPY = {
  auth: SIGN_IN,
  network: NETWORK,
  stream_lost: STREAM_LOST,
  server_error: "Something went wrong. Try again.",
  error: "Something went wrong. Try again.",
  not_available: "Beaker is not available right now.",
  busy: "Beaker is already working on this. Give it a moment.",
  budget_unavailable: "Beaker couldn't check your limits just now. Try again in a minute.",
  timed_out: "Beaker took too long this time. Please try again.",
  changed: "That email changed while Beaker was working, so Beaker left it alone. Try again if you still want a rewrite.",
  too_short: "That email is already short. Try another rewrite, or edit it yourself.",

  // Starting an outreach
  no_tries: "You have used both of your tries. Your board still works: add people by hand, edit drafts and send what's ready.",
  no_searches: "Beaker has run all the searches this demo allows. Your board still works: add people by hand, edit your drafts and send what's ready.",
  bad_goal: "Describe your goal in 8 to 300 characters.",
  bad_person: "Add the name of the person you want to write to.",
  bad_purpose: "Pick what you would like from this person.",
  bad_candidate: "Pick one of the people on the list.",
  no_try: "That outreach was not found. Start a new one.",
  try_closed: "That outreach is already finished. Start a new one.",
  card_deleted: "That card was deleted, so Beaker cannot finish this one.",
  search_failed: "Beaker could not finish searching just now. Please try again in a minute.",
  no_candidates: "Beaker could not find anyone who fits that goal. Try describing it another way.",
  not_found: "Beaker could not find enough about that person to write an email with sources.",
  draft_failed: "Beaker could not write a draft that follows the rules this time. Please try again.",

  // The draft
  no_contact: "That contact was not found. It may have been deleted.",
  bad_style: "Pick one of the rewrite options.",
  no_research: "Beaker can only rewrite an email it researched.",
  already_sent: "This email has already been sent, so it can't be rewritten.",
  empty: "There is no email to rewrite yet. Write a few lines first.",
  rewrites_spent: "You've used all 3 rewrites for this email. You can still edit it yourself.",
  rewrite_failed: "Beaker couldn't rewrite it just now. Your email is unchanged, and the rewrite wasn't counted.",
  no_writes: "You've used all the rewrites and follow-up drafts this demo allows. You can still edit the email yourself.",

  // Follow-ups
  not_sent: "Send your first email, or mark it as sent, before drafting a follow-up.",
  followups_spent: "You've sent both follow-ups for this contact.",
  followup_drafts_spent: "You've used all 3 follow-up drafts for this contact. You can still write one yourself.",
  no_email: "Add the email you sent to this card first, so Beaker can follow up on it.",
  followup_failed: "Beaker couldn't write a follow-up just now. It wasn't counted, so try again in a minute.",
  too_soon: "It's too soon to follow up. Give them at least 10 days after your last email.",

  // Sending
  gmail_not_connected: "Connect Gmail to send from your own address.",
  gmail_reconnect: "Your Gmail connection stopped working. Connect Gmail again to send.",
  not_configured: "Sending with Gmail isn't set up yet. You can still copy the email or open it in your mail app.",
  bad_kind: "Something went wrong. Try again.",
  bad_content: "Beaker can't send this as it is. Check that the subject and body are filled in, under the word limit, and free of phone numbers, addresses and [placeholders].",
  bad_address: "That email address does not look right. Check it and try again.",
  personal_address: "That looks like a personal address. Beaker only sends to a school or work address, or to one published on the person's own page.",
  already_emailed: "You've already emailed this person. Beaker sends one first email to each address.",
  SEND_LIMIT: "You've sent 5 emails today, the most Beaker sends in a day. You can send more later today.",
  send_failed: "Gmail didn't send the email. Nothing went out, so try again in a minute.",
  send_unconfirmed: "Gmail didn't confirm the send, so it may have gone out. Beaker won't send this one again. Check your Gmail Sent folder, and if it isn't there, copy the email or open it in your mail app, then press Mark as sent.",

  // Connecting Gmail
  expired: "That Gmail connection took too long to finish. Connect again.",
  wrong_account: "That Gmail connection was started from a different Mentorable account, so it was not saved. Connect Gmail again from your own account.",
};

// ── Back from Google ──────────────────────────────────────────────────────────
// Google returns the browser with ?gmail=confirm&code=... when the student
// granted access, or ?gmail=denied|error. A confirm is finished here, as the
// signed-in student: the server only saves it if they are the one who started
// it. One call per code, even if the page mounts twice.

const finishing = new Map();

/** "connected" | "denied" | "error" | "expired" | "wrong_account", or "" when
 *  the page was not opened by Google's redirect. */
export async function finishGmailReturn(search, api = agentsApi) {
  let q;
  try { q = new URLSearchParams(search || ""); } catch { return ""; }
  const g = q.get("gmail") || "";
  if (g === "denied" || g === "error") return g;
  if (g !== "confirm") return "";
  const code = (q.get("code") || "").slice(0, 200);
  if (!code) return "error";
  if (!finishing.has(code)) {
    finishing.set(code, api.googleFinish(code).then(
      () => "connected",
      (e) => (e?.code === "wrong_account" || e?.code === "expired" ? e.code : "error"),
    ));
  }
  return finishing.get(code);
}

// Refusals whose server message names the specifics (the date, the address,
// the rule the email broke). Shown as the server wrote them.
const SERVER_WORDS = new Set([
  "bad_goal", "bad_content", "bad_address", "personal_address", "already_emailed", "too_soon", "SEND_LIMIT",
  "not_sent", "card_deleted", "followups_spent", "search_failed", "no_candidates", "not_found", "draft_failed",
  "timed_out", "no_searches", "changed", "too_short", "already_sent", "budget_unavailable",
]);

/** The copy to show for an AgentApiError, a final {type: "error"} event, or
 *  anything else thrown. */
export function agentErrorMessage(err) {
  if (!err) return COPY.error;
  const code = err.code || err.error || "";
  const server = typeof err.message === "string" ? err.message.trim() : "";
  if (SERVER_WORDS.has(code) && server) return server;
  if (COPY[code]) return COPY[code];
  return server || COPY.error;
}

/** True when the refusal means the sign-in itself is gone: the page should
 *  offer the way back to /auth rather than "try again". */
export function needsSignIn(err) {
  return (err?.code || err?.error) === "auth";
}

/** True for the refusals that mean "connect (or reconnect) Gmail first". */
export function needsGmail(err) {
  const code = err?.code || err?.error;
  return code === "gmail_not_connected" || code === "gmail_reconnect";
}
