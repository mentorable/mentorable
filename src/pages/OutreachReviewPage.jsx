import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { requireUser } from "../lib/auth.js";
import { agentsApi, agentErrorMessage, finishGmailReturn, needsSignIn } from "../lib/agentsApi.js";
import {
  STAGES, defaultFollowUpOn, getContact, lastSentAt, markSentByHand, updateContact,
} from "../lib/outreach.js";
import { BEAKER_LINES } from "../lib/agents/registry.js";
import { MascotSays } from "../components/agents/SpeechBubble.jsx";
import { PixelArrow, PixelStamp } from "../components/agents/PixelIcons.jsx";
import {
  AMBER_TEXT, BG, BORDER, DANGER, FOCUS_CLASS, RADIUS, SANS, TEXT, TEXT_MID, TEXT_MUTED, ringVar, useAgentInk,
} from "../components/agents/agentUi.js";
import {
  Button, Card, FieldLabel, INPUT_CLASS, LinkButton, Notice, SR_ONLY, SourceLink, domainOf, inputStyle, readLocal,
  writeLocal,
} from "../components/agents/outreach/flowUi.jsx";
import ClaimEditor, { findClaimRanges } from "../components/agents/outreach/ClaimEditor.jsx";
import SourceRail from "../components/agents/outreach/SourceRail.jsx";
import ToneChips from "../components/agents/outreach/ToneChips.jsx";
import FactsChecklist from "../components/agents/outreach/FactsChecklist.jsx";
import RecipientField from "../components/agents/outreach/RecipientField.jsx";
import SendSheet from "../components/agents/outreach/SendSheet.jsx";
import GmailConnectSheet from "../components/agents/outreach/GmailConnectSheet.jsx";
import FollowUpPanel from "../components/agents/outreach/FollowUpPanel.jsx";
import { copyText, emailAsText, mailtoHref, sendProblems, validEmail } from "../components/agents/outreach/mailTools.js";
import { BODY_MAX, MAX_WORDS, TWEAKS, labelOf, wordCount } from "../components/agents/outreach/options.js";
import Spinner from "../components/common/Spinner.jsx";
import { SIDEBAR_WIDTH } from "../components/common/Sidebar.jsx";
import { useIsMobile } from "../hooks/useIsMobile.js";

// Review and send: the one screen where an email leaves. To (the verified
// address and where it was found, or a field to paste one), subject and
// body, with every claim about the recipient highlighted and tied to its
// source on the rail. Rewrite chips, the facts to check, and the ways out:
// Send with Gmail (after a confirm), Copy, Open in my mail app, or Mark as
// sent. Edits save to the card as the student types. Once it's sent, the
// follow-up lives here too.

// The real calls. The page takes them as one object so it can be driven with
// made-up data when checking it by hand (see CollegeListPage).
const REAL_API = { requireUser, ...agentsApi, getContact, updateContact, markSentByHand };

const BOARD = "/agents/outreach";
const SAVE_AFTER_MS = 900;
const FACTS_KEY = (id) => `mentorable.outreachFacts.${id}`;
const FOLLOW_KEY = (id) => `mentorable.outreachFollowup.${id}`;
// Edits typed but not saved yet (see readDraft).
const DRAFT_KEY = (id) => `mentorable.outreachDraft.${id}`;
// The facts that go with the text an Undo brought back (see readGround).
const GROUND_KEY = (id) => `mentorable.outreachGrounding.${id}`;
// Follow-ups the student sent from their own mail (see readHand).
const HAND_KEY = (id) => `mentorable.outreachHandSent.${id}`;

// A first email's subject as the backend will send it (draft.email_problems):
// 12 words and 120 characters at most. The card's column holds more, so the
// check is here, before Send, not only in Gmail's refusal after it.
const SEND_SUBJECT_CHARS = 120;
const SEND_SUBJECT_WORDS = 12;

// Refusals where the email may have gone out anyway (the answer was lost, or
// Gmail didn't confirm). The page reads the card again before believing them.
const UNSURE = new Set(["network", "send_unconfirmed", "already_emailed", "server_error", "error", "busy"]);

// Gmail's state when the status call failed: unknown, not "off". Send stays
// on offer, and the send itself says if Gmail needs connecting.
const GMAIL_UNKNOWN = { configured: null, connected: null, email: null };

const GMAIL_RETURN = {
  connected: { tone: "success", text: (email) => `Gmail is connected${email ? ` as ${email}` : ""}. Press Send when your email is ready.` },
  denied: { tone: "warn", text: () => "Gmail wasn't connected. That's okay: copy the email or open it in your mail app. To send from here, connect again and leave the send box ticked." },
  error: { tone: "warn", text: () => "Google didn't finish connecting your Gmail. Try again, or copy the email instead." },
  expired: { tone: "warn", text: () => "That Gmail connection took too long to finish. Connect again when you're ready to send." },
  wrong_account: { tone: "warn", text: () => "That Gmail connection was started from a different Mentorable account, so it wasn't saved. Connect Gmail again from your own account." },
};

// ── The card as the page needs it ────────────────────────────────────────────
// A card read straight from Supabase has the raw counters (and the research,
// which students can read); one from the backend has the derived fields
// already (section 4.8). Fill in whatever is missing, the way the backend does.

const pad2 = (n) => String(n).padStart(2, "0");
const isoDay = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function withDerived(row, limits) {
  if (!row || typeof row !== "object") return row;
  const L = {
    rewrites: limits?.rewrites_per_card ?? 3, drafts: limits?.followup_drafts_per_card ?? 3,
    followups: limits?.followups_per_card ?? 2, after: limits?.followup_after_days ?? 10,
  };
  const out = { ...row };
  if (out.email_verified === undefined) {
    const v = out.research?.verified_email;
    out.email_verified = !!(out.email && typeof v === "string" && v.trim().toLowerCase() === String(out.email).trim().toLowerCase());
  }
  if (out.rewrites_left === undefined) out.rewrites_left = Math.max(0, L.rewrites - num(out.rewrites_used));
  if (out.followup_drafts_left === undefined) out.followup_drafts_left = Math.max(0, L.drafts - num(out.followup_drafts_used));
  if (out.followups_left === undefined) out.followups_left = Math.max(0, L.followups - num(out.follow_ups_sent));
  if (out.next_followup_on === undefined) {
    const raw = lastSentAt(out);
    const last = raw ? new Date(raw) : null;
    if (last && !Number.isNaN(last.getTime()) && out.followups_left > 0) {
      const due = new Date(last.getFullYear(), last.getMonth(), last.getDate() + L.after);
      out.next_followup_on = isoDay(due);
    } else {
      out.next_followup_on = null;
    }
  }
  return out;
}

function shortDay(raw) {
  const d = raw ? new Date(raw) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
}

/** "Sent Oct 1 with Gmail", "Marked as sent Oct 1. Followed up Oct 12". The
 *  first date is always the first email's, never a later follow-up's. */
function sentLine(c) {
  const at = (raw) => { const d = shortDay(raw); return d ? ` ${d}` : ""; };
  if (c.sent_at && c.sent_via === "gmail") {
    const more = Number(c.follow_ups_sent) > 0 && c.last_sent_at ? `. Followed up${at(c.last_sent_at)}` : "";
    return `Sent${at(c.sent_at)} with Gmail${more}`;
  }
  if (c.hand) return `Marked as sent${at(c.hand.first)}. Followed up${at(c.manual_sent_at)}`;
  return `Marked as sent${at(lastSentAt(c))}`;
}

/** What the subject breaks of the send rule, in plain words. */
function subjectProblems(subject) {
  const s = String(subject || "").trim();
  const out = [];
  const n = wordCount(s);
  if (n > SEND_SUBJECT_WORDS) out.push(`The subject has ${n} words. Keep it to ${SEND_SUBJECT_WORDS} or fewer.`);
  if (s.length > SEND_SUBJECT_CHARS) out.push(`The subject is ${s.length} characters. Keep it to ${SEND_SUBJECT_CHARS} or fewer.`);
  return out;
}

function dropLocal(key) {
  try { localStorage.removeItem(key); } catch { /* storage blocked: nothing was kept */ }
}

function readJson(key) {
  try { return JSON.parse(readLocal(key) || "null"); } catch { return null; }
}

const sameInstant = (a, b) => !!a && !!b && Date.parse(a) === Date.parse(b);

const cleanClaims = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x.text === "string") : []);
const cleanFacts = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()) : []);

/** The facts the card holds, as one comparable string. */
function groundingOf(c) {
  return JSON.stringify([
    (Array.isArray(c?.claims) ? c.claims : []).map((x) => [String(x?.text ?? ""), String(x?.source_url ?? "")]),
    (Array.isArray(c?.facts_to_verify) ? c.facts_to_verify : []).map(String),
  ]);
}

/**
 * The facts to show for the text an Undo brought back. Only the backend can
 * write a card's facts, so after "Undo the rewrite" the card still holds the
 * rewrite's while its text is the one before it. The page keeps the facts
 * that go with that text here, for as long as the card still holds the facts
 * the undo set aside: a new rewrite replaces them, and this is forgotten.
 */
function readGround(c) {
  const rec = readJson(GROUND_KEY(c.id));
  if (!rec) return null;
  if (rec.over !== groundingOf(c)) { dropLocal(GROUND_KEY(c.id)); return null; }
  return { claims: cleanClaims(rec.claims), facts: cleanFacts(rec.facts) };
}

/**
 * Follow-ups sent from the student's own mail ("I sent it"). The card has no
 * column a student can write that counts them, so this browser keeps them:
 * { first: when the first email went, sends: [when each follow-up went] }.
 * The card's manual_sent_at moves to the latest (so the board times its next
 * nudge from it); the record only counts while that is still so.
 */
function readHand(c) {
  if (!c?.id || c.sent_at || !c.manual_sent_at) return null;
  const rec = readJson(HAND_KEY(c.id));
  if (!rec || typeof rec.first !== "string" || !Array.isArray(rec.sends) || !rec.sends.length) return null;
  return sameInstant(rec.sends[rec.sends.length - 1], c.manual_sent_at) ? rec : null;
}

/** The card with this browser's hand-sent follow-ups counted, once: `hand`
 *  is set (to the record, or null for none) after the first look. */
function withHand(c) {
  if (!c || c.hand !== undefined) return c;
  const rec = readHand(c);
  if (!rec) return { ...c, hand: null };
  const left = Math.max(0, (Number.isFinite(c.followups_left) ? c.followups_left : 0) - rec.sends.length);
  return { ...c, hand: { first: rec.first, count: rec.sends.length }, followups_left: left,
    next_followup_on: left > 0 ? c.next_followup_on : null };
}

/**
 * Edits typed on this card that never reached it (the tab closed or reloaded
 * inside the save delay, or the save failed). Kept on every keystroke, and
 * brought back on load when newer than the card: the card hasn't changed
 * since they were typed, or they were typed after its last change.
 */
function readDraft(c) {
  const rec = readJson(DRAFT_KEY(c.id));
  if (!rec || typeof rec.subject !== "string" || typeof rec.body !== "string" || typeof rec.to !== "string") return null;
  const newer = sameInstant(rec.base, c.updated_at) || Date.parse(rec.at) > Date.parse(c.updated_at || "");
  const same = rec.subject === (c.subject || "") && rec.body === (c.body || "") && rec.to === (c.email || "");
  if (c.sent_at || c.manual_sent_at || !newer || same) { dropLocal(DRAFT_KEY(c.id)); return null; }
  return rec;
}

function readSet(key) {
  try {
    const v = JSON.parse(readLocal(key) || "[]");
    return new Set(Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

function readParams(search) {
  try { return new URLSearchParams(search || "").get("gmail") || ""; } catch { return ""; }
}

// ── Small pieces ──────────────────────────────────────────────────────────────

function SaveState({ state, onRetry }) {
  const ink = useAgentInk();
  return (
    <span role="status" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: SANS, fontSize: "0.93rem",
      fontWeight: 700, color: state === "error" ? DANGER : TEXT_MUTED, minHeight: 24 }}>
      {state === "saving" && <><Spinner size={13} color={ink.text} /> Saving...</>}
      {state === "saved" && <><span style={{ color: ink.text, display: "flex" }}><PixelStamp kind="check" size={16} /></span> Saved</>}
      {state === "error" && (
        <>
          Couldn't save.
          <button type="button" className="ag-focus" onClick={onRetry}
            style={{ border: "none", background: "none", padding: "10px 4px", margin: "-10px 0", cursor: "pointer",
              fontFamily: SANS, fontSize: "0.93rem", fontWeight: 800, color: ink.text, textDecoration: "underline" }}>
            Try again
          </button>
        </>
      )}
    </span>
  );
}

function SentCopy({ subject, body }) {
  return (
    <Card as="section" aria-label="The email you sent">
      <p style={{ margin: 0, fontFamily: SANS, fontSize: "0.9rem", fontWeight: 800, color: TEXT_MUTED }}>Subject</p>
      <p style={{ margin: "2px 0 12px", fontFamily: SANS, fontSize: "1.05rem", fontWeight: 700, color: TEXT, overflowWrap: "anywhere" }}>
        {subject || "(no subject)"}
      </p>
      <p style={{ margin: 0, fontFamily: SANS, fontSize: "1rem", color: TEXT_MID, lineHeight: 1.65, whiteSpace: "pre-wrap",
        overflowWrap: "anywhere" }}>
        {body}
      </p>
    </Card>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function OutreachReviewPage({ navigate, contactId, api = REAL_API, search }) {
  const isMobile = useIsMobile();
  const narrow = useIsMobile(1100);
  const ink = useAgentInk();
  const gmailParam = useMemo(() => readParams(search ?? (typeof window !== "undefined" ? window.location.search : "")), [search]);

  const [phase, setPhase] = useState("loading");   // loading | ready | missing | error
  const [userId, setUserId] = useState(null);
  const [status, setStatus] = useState(null);
  const [contact, setContact] = useState(null);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [claims, setClaims] = useState([]);
  const [facts, setFacts] = useState([]);
  const [verifiedEmail, setVerifiedEmail] = useState(null);
  const [save, setSave] = useState("idle");        // idle | saving | saved | error
  const [notice, setNotice] = useState(null);      // { tone, text }

  const [active, setActive] = useState(null);
  const [editorFocus, setEditorFocus] = useState(null);   // { index, nonce }
  const [railFlash, setRailFlash] = useState(null);       // { index, nonce }

  const [rewriting, setRewriting] = useState(null);
  const [rewriteError, setRewriteError] = useState(null);
  const [undo, setUndo] = useState(null);          // { subject, body, claims, facts, label }
  const [checked, setChecked] = useState(() => new Set());

  const [sheet, setSheet] = useState(null);        // null | "send" | "followup" | "gmail"
  const [gmailReason, setGmailReason] = useState("send");
  const [justSent, setJustSent] = useState(false);
  const [copied, setCopied] = useState(null);      // "first" | "followup", for a moment after copying
  const [marking, setMarking] = useState(false);
  const [checking, setChecking] = useState(false); // asking for the status again
  const [sendDoubt, setSendDoubt] = useState(false); // Gmail didn't confirm this card's first email
  const [said, setSaid] = useState(null);          // { text, n }: the latest line for screen readers

  const [followText, setFollowText] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [followError, setFollowError] = useState(null);

  // Null status after loading means the call failed: Gmail is unknown, not off.
  const gmail = status?.gmail || GMAIL_UNKNOWN;
  const limits = status?.limits;
  const maxWords = limits?.max_words || MAX_WORDS;

  // Screen readers hear what just happened (a send, a mark, a copy) through
  // one polite live region that is always on the page; a region that appears
  // with its message is often not read at all. A new key re-reads a repeat.
  const announce = (text) => setSaid((prev) => ({ text, n: (prev?.n || 0) + 1 }));
  const heading = useRef(null);
  // After a send or a mark the button that was pressed is gone, and focus
  // would fall to the page itself. Put it on the page heading instead.
  const focusTop = () => {
    try { window.scrollTo({ top: 0 }); } catch { /* old browsers */ }
    requestAnimationFrame(() => heading.current?.focus?.());
  };
  // A busy button is disabled, which drops focus, and may be gone once the
  // work is done. `refocus(selector)` puts focus there after the render the
  // change causes, unless the student has already moved it somewhere real.
  const focusAfter = useRef(null);
  useEffect(() => {
    const selector = focusAfter.current;
    if (!selector) return;
    focusAfter.current = null;
    const now = document.activeElement;
    if (!now || now === document.body || !now.isConnected || now.disabled) document.querySelector(selector)?.focus?.();
  });
  const refocus = (selector) => { focusAfter.current = selector; };
  const showSignIn = () => setNotice({ tone: "error", text: agentErrorMessage({ code: "auth" }), signIn: true });

  // ── Adopting a card (on load, and from every backend reply) ────────────────

  // What is saved on the card now, and for which card. The autosave compares
  // the editor against it; a rewrite or a send moves it.
  const baseline = useRef({ id: null, email: "", subject: "", body: "", updatedAt: null });
  const latest = useRef({ to: "", subject: "", body: "" });
  latest.current = { to, subject, body };
  const timer = useRef(null);
  const inflight = useRef(null);
  const seq = useRef(0);

  const adopt = useCallback((row, { keepTo = false } = {}) => {
    const c = withHand(withDerived(row, limits));
    if (!c) return;
    setContact(c);
    setSubject(c.subject || "");
    setBody(c.body || "");
    const kept = readGround(c);
    setClaims(kept ? kept.claims : cleanClaims(c.claims));
    setFacts(kept ? kept.facts : cleanFacts(c.facts_to_verify));
    setVerifiedEmail((prev) => {
      const v = c.research?.verified_email;
      if (typeof v === "string" && v.trim()) return v.trim();
      return c.email_verified && c.email ? c.email : prev;
    });
    baseline.current = {
      id: c.id, subject: c.subject || "", body: c.body || "", updatedAt: c.updated_at || null,
      email: keepTo && baseline.current.id === c.id ? baseline.current.email : (c.email || ""),
    };
    if (!keepTo) setTo(c.email || "");
    // Match `latest` now too, so a save timer that fires before the next
    // render compares the new text with the new baseline, not the old text.
    latest.current = { to: keepTo ? latest.current.to : (c.email || ""), subject: c.subject || "", body: c.body || "" };
    // The editor shows the card's own text now; anything still unsaved (only
    // ever the To line, with keepTo) is kept again by the autosave below.
    dropLocal(DRAFT_KEY(c.id));
    // The follow-up in the editor: the student's unsent edits, if they were
    // made to the draft that is still on the card.
    let text = c.followup_body || "";
    try {
      const kept = JSON.parse(readLocal(FOLLOW_KEY(c.id)) || "null");
      if (kept && kept.base === (c.followup_body || "") && typeof kept.text === "string") text = kept.text;
    } catch { /* nothing kept */ }
    setFollowText(text);
  }, [limits]);

  // ── Autosave ───────────────────────────────────────────────────────────────

  const sent = !!(contact && (contact.sent_at || contact.manual_sent_at));
  const editable = phase === "ready" && !!contact && !sent;

  const pendingPatch = () => {
    const b = baseline.current;
    const cur = latest.current;
    const patch = {};
    if (cur.subject !== b.subject) patch.subject = cur.subject;
    if (cur.body !== b.body) patch.body = cur.body;
    const email = cur.to.trim();
    if (email !== b.email && (email === "" || validEmail(email))) patch.email = email || null;
    return patch;
  };

  const flush = async () => {
    clearTimeout(timer.current);
    timer.current = null;
    const target = baseline.current.id;
    if (!userId || !target) return;
    const patch = pendingPatch();
    if (!Object.keys(patch).length) return;
    const mine = ++seq.current;
    setSave("saving");
    const run = (async () => {
      const saved = await api.updateContact(userId, target, patch);
      if (baseline.current.id === target) {
        baseline.current = {
          ...baseline.current,
          ...(saved?.updated_at ? { updatedAt: saved.updated_at } : {}),
          ...(patch.subject !== undefined ? { subject: patch.subject } : {}),
          ...(patch.body !== undefined ? { body: patch.body } : {}),
          ...(patch.email !== undefined ? { email: patch.email || "" } : {}),
        };
      }
    })();
    inflight.current = run;
    try {
      await run;
      if (mine === seq.current) setSave("saved");
      // Everything typed is on the card now: nothing left to bring back.
      if (baseline.current.id === target && !Object.keys(pendingPatch()).length) dropLocal(DRAFT_KEY(target));
    } catch (e) {
      console.warn("[outreach] autosave failed:", e);
      if (mine === seq.current) setSave("error");
    } finally {
      if (inflight.current === run) inflight.current = null;
    }
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;

  useEffect(() => {
    if (!editable) return;
    if (!Object.keys(pendingPatch()).length) return;
    // Kept in this browser at once, before the save: a request sent while
    // the tab closes or reloads can be cut off, and this brings it back.
    const id = baseline.current.id;
    if (id) {
      writeLocal(DRAFT_KEY(id), JSON.stringify({
        to, subject, body, at: new Date().toISOString(), base: baseline.current.updatedAt,
      }));
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => flushRef.current(), SAVE_AFTER_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to, subject, body, editable]);

  // Leaving the tab: try to save now (the copy kept above covers a request
  // the browser cuts off).
  useEffect(() => {
    const onHide = () => { if (timer.current) flushRef.current(); };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, []);

  // ── Load ───────────────────────────────────────────────────────────────────

  /** Ask for the status again. True when it answered. A failure keeps what
   *  the page had (if it had nothing, Gmail stays "couldn't check"). */
  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await api.status());
      return true;
    } catch (e) {
      if (needsSignIn(e)) setNotice({ tone: "error", text: agentErrorMessage(e), signIn: true });
      return false;
    }
  }, [api]);

  const checkAgain = async () => {
    if (checking) return;
    setChecking(true);
    const ok = await refreshStatus();
    setChecking(false);
    announce(ok ? "Checked. Your Gmail status is up to date." : "Still couldn't check your Gmail. You can press Send anyway.");
    // The button was disabled while checking (and is gone once it worked).
    refocus(ok ? "section[aria-labelledby=oa-send-heading] button:not([disabled])" : "[data-oa-check]");
  };

  useEffect(() => {
    let cancelled = false;
    setPhase("loading");
    setNotice(null); setJustSent(false); setUndo(null); setActive(null); setRewriteError(null); setFollowError(null);
    setSheet(null); setSave("idle"); setSendDoubt(false);
    (async () => {
      let user = null;
      try { user = await api.requireUser(); } catch { user = null; }
      if (cancelled) return;
      if (!user) { navigate?.("/auth"); return; }
      setUserId(user.id);
      // Back from Google: finish the connection first, so the status below sees it.
      const gmailOutcome = gmailParam ? await finishGmailReturn(search ?? window.location.search, api) : "";
      if (cancelled) return;
      let row = null;
      let s = null;
      let statusError = null;
      try {
        [row, s] = await Promise.all([
          api.getContact(user.id, contactId),
          api.status().catch((e) => { console.warn("[outreach] status failed:", e); statusError = e; return null; }),
        ]);
      } catch (e) {
        if (cancelled) return;
        const gone = e?.code === "PGRST116" || e?.status === 404 || e?.code === "no_contact";
        if (!gone) console.error("[outreach] could not load the card:", e);
        setPhase(gone ? "missing" : "error");
        return;
      }
      if (cancelled) return;
      if (!row) { setPhase("missing"); return; }
      setStatus(s);
      const c = withDerived(row, s?.limits);
      const kept = readDraft(c);   // before adopt, which clears it
      adopt(c);
      setChecked(readSet(FACTS_KEY(c.id)));
      if (kept) {
        setTo(kept.to); setSubject(kept.subject); setBody(kept.body);
        latest.current = { to: kept.to, subject: kept.subject, body: kept.body };
      }
      const back = GMAIL_RETURN[gmailOutcome];
      if (statusError && needsSignIn(statusError)) {
        setNotice({ tone: "error", text: agentErrorMessage(statusError), signIn: true });
      } else if (back) {
        setNotice({ tone: back.tone, text: back.text(s?.gmail?.email) });
      } else if (kept) {
        setNotice({ tone: "info", text: "Your last edits hadn't saved when you left, so they're back and saving now." });
      }
      if (back) navigate?.(`${BOARD}/${contactId}`, { replace: true });
      setPhase("ready");
    })();
    return () => {
      cancelled = true;
      // Leaving this card (for another, or the page): save what was typed.
      if (timer.current) flushRef.current?.();
    };
    // gmailParam is read on arrival only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, contactId]);

  /** Save anything typed and wait for it, before a call that reads the card. */
  const settle = async () => {
    if (timer.current) await flushRef.current();
    if (inflight.current) { try { await inflight.current; } catch { /* the call below still sends the current text */ } }
  };

  // ── Claims and the rail ────────────────────────────────────────────────────

  const { ranges, missing } = useMemo(() => findClaimRanges(body, claims), [body, claims]);
  const sources = Array.isArray(contact?.sources) ? contact.sources.filter((s) => s && typeof s.url === "string") : [];
  const hasRail = claims.length > 0 || sources.length > 0 || !!contact?.email_source_url;

  const selectFromRail = (index) => {
    setActive(index);
    setEditorFocus({ index, nonce: Date.now() });
  };
  // The rail only moves inside its own column (SourceRail); under the email
  // on a narrow screen, the fact's source shows under the editor instead.
  const activateFromEditor = (index) => {
    setActive(index);
    setRailFlash({ index, nonce: Date.now() });
  };

  // ── Rewrites ───────────────────────────────────────────────────────────────

  const rewrite = async (style) => {
    if (rewriting || !contact) return;
    setRewriting(style); setRewriteError(null);
    const before = { subject, body, claims, facts, label: labelOf(TWEAKS, style) };
    try {
      await settle();
      const res = await api.rewrite(contact.id, { style, subject, body });
      if (!res?.contact) throw new Error("no contact");
      // New facts from the backend: whatever an earlier undo kept is over.
      dropLocal(GROUND_KEY(contact.id));
      setUndo(before);
      adopt(res.contact, { keepTo: true });
      setActive(null);
      setSave("saved");
    } catch (e) {
      if (needsSignIn(e)) showSignIn(); else setRewriteError(agentErrorMessage(e));
      if (e?.code === "rewrites_spent") setContact((c) => (c ? { ...c, rewrites_left: 0 } : c));
    } finally {
      setRewriting(null);
    }
  };

  const undoRewrite = () => {
    if (!undo || !contact) return;
    setSubject(undo.subject); setBody(undo.body); setClaims(undo.claims); setFacts(undo.facts);
    // The card keeps the rewrite's facts (only the backend writes them), and
    // the text going back to the card is the one before it. Keep the facts
    // that belong to that text, so a reload or a send still shows them.
    writeLocal(GROUND_KEY(contact.id), JSON.stringify({
      over: groundingOf(contact), claims: undo.claims, facts: undo.facts,
    }));
    setUndo(null);
    announce("Rewrite undone. Your email is back the way it was.");
  };

  const editSubject = (v) => { setSubject(v); setUndo(null); };
  const editBody = (v) => { setBody(v); setUndo(null); };

  const toggleFact = (fact) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(fact)) next.delete(fact); else next.add(fact);
      if (contact) writeLocal(FACTS_KEY(contact.id), JSON.stringify([...next]));
      return next;
    });
  };

  // ── Sending ────────────────────────────────────────────────────────────────

  // Unknown (the status call failed) is not "off": only a known "no" stops here.
  const openGmail = (reason) => {
    if (gmail.configured === false) {
      setNotice({ tone: "warn", text: agentErrorMessage({ code: "not_configured" }) });
      return;
    }
    setGmailReason(reason);
    setSheet("gmail");
  };

  const pressSend = () => {
    if (gmail.connected === false) { openGmail("send"); return; }
    setSheet("send");
  };

  /**
   * Send, and when the refusal leaves it unclear whether the email went out
   * (the answer was lost, Gmail didn't confirm, "already emailed"), read the
   * card again: if it did go, that's a send, not an error. Otherwise the
   * refusal goes back to the sheet to show, with the card up to date.
   */
  const sendChecked = async (kind, payload) => {
    const before = lastSentAt(contact);
    try {
      return await api.send(contact.id, payload);
    } catch (e) {
      if (needsSignIn(e)) showSignIn();
      if (e?.code === "not_configured") {
        setStatus((st) => ({ ...(st || {}), gmail: { ...(st?.gmail || {}), configured: false, connected: false } }));
      }
      if (!UNSURE.has(e?.code)) throw e;
      let row = null;
      try { row = await api.getContact(userId, contact.id); } catch { row = null; }
      refreshStatus();
      const went = row && (kind === "first" ? !!row.sent_at : !!lastSentAt(row) && !sameInstant(lastSentAt(row), before));
      if (went) return { contact: row };
      if (row) adopt(row, { keepTo: true });
      if (kind === "first" && e?.code === "send_unconfirmed") setSendDoubt(true);
      throw e;
    }
  };

  const confirmSend = async () => {
    await settle();
    const where = to.trim();
    const res = await sendChecked("first", { kind: "first", to: where, subject: subject.trim(), body });
    if (res?.contact) adopt(res.contact);
    setSheet(null);
    setJustSent(true);
    setUndo(null);
    setSendDoubt(false);
    refreshStatus();
    announce(`Sent to ${res?.contact?.email || where} with Gmail.`);
    focusTop();
  };

  const confirmFollowup = async () => {
    const res = await sendChecked("followup", {
      kind: "followup", to: contact.email || to.trim(), subject: contact.subject || subject, body: followText.trim(),
    });
    if (res?.contact) adopt(res.contact, { keepTo: true });
    writeLocal(FOLLOW_KEY(contact.id), "null");
    setFollowText("");
    setSheet(null);
    setNotice({ tone: "success", text: "Follow-up sent in the same thread. That's the right amount of nudging." });
    refreshStatus();
    announce("Follow-up sent in the same thread.");
    focusTop();
  };

  const needGmail = (err) => {
    // Gmail refused because it isn't connected, so it is set up on the server.
    setStatus((s) => ({ ...(s || {}), gmail: { ...(s?.gmail || {}), configured: true, connected: false } }));
    openGmail(err?.code === "gmail_reconnect" ? "reconnect" : "send");
  };

  const connectGmail = async () => {
    await settle();
    const res = await api.googleConnect(`${BOARD}/${contact.id}`);
    if (!res?.url) throw new Error("Google did not answer. Try again.");
    window.location.href = res.url;
  };

  const copy = async (which, text) => {
    const ok = await copyText(text);
    if (!ok) {
      setNotice({ tone: "warn", text: "Your browser blocked copying. Select the text in the email and copy it yourself." });
      return;
    }
    setCopied(which);
    announce(which === "followup" ? "Follow-up copied." : "Email copied, with its subject line.");
    setTimeout(() => setCopied((c) => (c === which ? null : c)), 2500);
  };

  const markSent = async () => {
    if (marking || !contact || !userId) return;
    setMarking(true);
    try {
      await settle();
      const row = await api.markSentByHand(userId, contact.id);
      dropLocal(HAND_KEY(contact.id));
      adopt(row && typeof row === "object" ? row : { ...contact, stage: "sent", manual_sent_at: new Date().toISOString() }, { keepTo: true });
      setJustSent(true);
      setSendDoubt(false);
      announce("Marked as sent. It's in Sent on your board now.");
      focusTop();
    } catch (e) {
      console.warn("[outreach] mark as sent failed:", e);
      setNotice({ tone: "error", text: "Couldn't mark it as sent. Try again." });
      refocus("[data-oa-mark]");
    } finally {
      setMarking(false);
    }
  };

  /** "I sent it" for a follow-up the student sent from their own mail. The
   *  first email's date stays as it was (kept here, see readHand); the card's
   *  hand-sent stamp moves to now, so the next follow-up is timed from this
   *  one, and after the second there is no date left to nudge on. */
  const markFollowupSent = async () => {
    if (marking || !contact || !userId) return;
    setMarking(true);
    try {
      const now = new Date();
      const prev = readHand(contact);
      const leftAfter = Math.max(0, (Number.isFinite(contact.followups_left) ? contact.followups_left : 0) - 1);
      const row = await api.updateContact(userId, contact.id, {
        stage: "sent", manual_sent_at: now.toISOString(), follow_up_on: leftAfter > 0 ? defaultFollowUpOn(now) : null,
      });
      writeLocal(HAND_KEY(contact.id), JSON.stringify({
        first: prev?.first || contact.manual_sent_at, sends: [...(prev?.sends || []), now.toISOString()],
      }));
      // The follow-up is gone; the next one starts empty, not from these words.
      writeLocal(FOLLOW_KEY(contact.id), JSON.stringify({ base: contact.followup_body || "", text: "" }));
      adopt(row && typeof row === "object" ? row : { ...contact, hand: undefined, manual_sent_at: now.toISOString() }, { keepTo: true });
      setNotice({ tone: "success", text: leftAfter > 0
        ? "Follow-up marked as sent. If they still haven't replied in 10 days, one more is fair."
        : "Follow-up marked as sent. That's both of them, and that's the right amount of nudging." });
      announce("Follow-up marked as sent.");
      focusTop();
    } catch (e) {
      console.warn("[outreach] mark follow-up as sent failed:", e);
      setNotice({ tone: "error", text: "Couldn't mark the follow-up as sent. Try again." });
      refocus("[data-oa-mark-followup]");
    } finally {
      setMarking(false);
    }
  };

  const draftFollowup = async () => {
    if (drafting || !contact) return;
    setDrafting(true); setFollowError(null);
    try {
      const res = await api.followup(contact.id);
      if (res?.contact) adopt(res.contact, { keepTo: true });
    } catch (e) {
      if (needsSignIn(e)) showSignIn(); else setFollowError(agentErrorMessage(e));
    } finally {
      setDrafting(false);
    }
  };

  const editFollow = (v) => {
    setFollowText(v);
    if (contact) writeLocal(FOLLOW_KEY(contact.id), JSON.stringify({ base: contact.followup_body || "", text: v }));
  };

  // ── Layout ─────────────────────────────────────────────────────────────────

  const pagePad = {
    minHeight: "100vh", background: BG, fontFamily: SANS, boxSizing: "border-box",
    padding: isMobile ? "1.25rem 1rem 6rem" : "2.25rem 2rem 4rem",
    paddingLeft: isMobile ? "1rem" : `calc(${SIDEBAR_WIDTH}px + 2rem)`,
    ...ringVar(ink),
  };

  const backLink = (
    <button type="button" className="ag-focus" onClick={() => navigate?.(BOARD)}
      style={{ display: "inline-flex", alignItems: "center", gap: 8, minHeight: 44, padding: "0 6px", marginLeft: -6,
        border: "none", background: "none", cursor: "pointer", fontFamily: SANS, fontSize: "0.98rem", fontWeight: 700,
        color: ink.text, borderRadius: 10 }}>
      <PixelArrow size={16} style={{ transform: "scaleX(-1)" }} />
      Your board
    </button>
  );

  if (phase !== "ready" || !contact) {
    return (
      <div data-sidebar-offset style={pagePad}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          {backLink}
          <div style={{ minHeight: "50vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {phase === "loading" ? (
              <div role="status" style={{ display: "flex", alignItems: "center", gap: 10, color: TEXT_MUTED, fontWeight: 600 }}>
                <Spinner size={22} color={ink.text} /> Loading your draft
              </div>
            ) : (
              <div style={{ width: "100%" }}>
                <MascotSays state="thinking" size={80} layout="auto">
                  {phase === "missing"
                    ? "I can't find that letter. It may have been deleted from your board."
                    : BEAKER_LINES.error}
                </MascotSays>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 18 }}>
                  {phase === "error" && <Button kind="primary" onClick={() => window.location.reload()}>Try again</Button>}
                  <Button kind={phase === "missing" ? "primary" : "secondary"} onClick={() => navigate?.(BOARD)}>
                    Back to your board
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const stage = STAGES?.find?.((s) => s.key === contact.stage)?.label || "";
  const role = [contact.title, contact.organization].filter(Boolean).join(", ");
  const byAgent = contact.created_by === "agent";
  const words = wordCount(body);
  const problems = [...sendProblems({ to, subject, body, maxWords }), ...subjectProblems(subject)];
  const unchecked = facts.filter((f) => !checked.has(f)).length;
  const lookUrl = contact.research?.person?.profile_url || sources[0]?.url || "";
  const open = status?.open_try;
  const waiting = open && open.contact_id === contact.id && open.pending_question && !body.trim() ? open : null;
  const sendsLeft = status?.sends_today && Number.isFinite(status.sends_today.left) ? status.sends_today : null;
  // An agent card Beaker hasn't written yet (it asked a question first, or
  // never got that far): no draft to praise, rewrite or check.
  const noDraft = byAgent && !body.trim() && !String(contact.body || "").trim();
  const statusKnown = !!status;

  let mascot;
  if (justSent) mascot = { state: "celebrating", line: BEAKER_LINES.sent };
  else if (sent && contact.stage === "heard_back") mascot = { state: "celebrating", line: "They wrote back! Keep the conversation going from your email, and move this card along your board as it goes." };
  else if (sent && contact.stage === "meeting") mascot = { state: "celebrating", line: "A meeting, or just what you needed. That's a delivery well made." };
  else if (sent && contact.stage === "closed") mascot = { state: "idle", line: "This one's closed. Every letter is practice for the next one." };
  else if (sent) mascot = { state: "idle", line: "Delivered. I'll keep an eye on the calendar so you know when a follow-up is fair." };
  else if (waiting) mascot = { state: "thinking", line: BEAKER_LINES.question };
  else if (noDraft) mascot = { state: "idle", line: "There's no draft here yet. You can write this one yourself, and I'll keep it safe on your board." };
  else if (byAgent) mascot = { state: "delivering", line: BEAKER_LINES.draftReady };
  else mascot = { state: "idle", line: "This one's yours to write. Write it here and I'll keep it safe on your board." };

  const rail = hasRail ? (
    <SourceRail claims={claims} missing={missing} sources={sources} activeIndex={active} onSelect={selectFromRail}
      flashRequest={railFlash} emailSourceUrl={contact.email_source_url} name={contact.name} sent={sent} />
  ) : null;

  // Under the email on a narrow screen the rail is out of sight, so the fact
  // the caret is in shows its source right under the editor.
  const activeClaim = narrow && active !== null && !missing.includes(active) ? claims[active] : null;
  const activeTitle = activeClaim ? sources.find((x) => x.url === activeClaim.source_url)?.title : "";

  const editorCard = (
    <Card as="section" aria-label="Your email" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <RecipientField value={to} onChange={setTo} verifiedEmail={verifiedEmail} emailSourceUrl={contact.email_source_url}
        lookUrl={lookUrl} />
      <div>
        <FieldLabel htmlFor="oa-subject">Subject</FieldLabel>
        <input id="oa-subject" className={INPUT_CLASS} value={subject} maxLength={SEND_SUBJECT_CHARS}
          onChange={(e) => editSubject(e.target.value)} readOnly={!!rewriting} style={inputStyle} />
      </div>
      <div>
        <FieldLabel htmlFor="oa-body">Email</FieldLabel>
        {claims.length > 0 && (
          <p id="oa-body-hint" style={{ margin: "-2px 0 8px", fontFamily: SANS, fontSize: "0.93rem", color: TEXT_MUTED, lineHeight: 1.5 }}>
            Highlighted words are facts about {contact.name}. Click one to see its source.
          </p>
        )}
        <ClaimEditor id="oa-body" value={body} onChange={editBody} ranges={ranges} activeIndex={active}
          onActivate={activateFromEditor} focusRequest={editorFocus} readOnly={!!rewriting} maxLength={BODY_MAX}
          describedBy={claims.length > 0 ? "oa-body-hint oa-body-count" : "oa-body-count"} />
        {activeClaim && (
          <p style={{ margin: "8px 0 0", fontFamily: SANS, fontSize: "0.95rem", color: TEXT_MID, lineHeight: 1.5,
            overflowWrap: "anywhere" }}>
            <span style={{ fontWeight: 800, color: TEXT }}>Source for this fact: </span>
            <SourceLink url={activeClaim.source_url} inline>
              {activeTitle ? `${activeTitle} (${domainOf(activeClaim.source_url)})` : undefined}
            </SourceLink>
          </p>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
          <SaveState state={save} onRetry={() => flushRef.current()} />
          <span id="oa-body-count" style={{ fontFamily: SANS, fontSize: "0.93rem", fontWeight: 700, fontVariantNumeric: "tabular-nums",
            color: words > maxWords ? AMBER_TEXT : TEXT_MUTED }}>
            {words} / {maxWords} words
          </span>
        </div>
      </div>
    </Card>
  );

  const chips = byAgent && !noDraft ? (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <ToneChips left={contact.rewrites_left} limit={limits?.rewrites_per_card || 3} busyKey={rewriting} onPick={rewrite}
        disabled={!body.trim()} />
      {rewriteError && <Notice tone="error" onDismiss={() => setRewriteError(null)}>{rewriteError}</Notice>}
      {undo && (
        <Notice tone="success" action={<Button kind="secondary" onClick={undoRewrite}>Undo the rewrite</Button>}>
          Rewritten: {undo.label}. Read it through; it's still yours to change.
        </Notice>
      )}
    </div>
  ) : null;

  const actions = (
    <Card as="section" aria-labelledby="oa-send-heading" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <h2 id="oa-send-heading" style={{ margin: 0, fontFamily: SANS, fontSize: "1.1rem", fontWeight: 800, color: TEXT }}>
        Send it
      </h2>
      {problems.length > 0 && (
        <div role="status" style={{ fontFamily: SANS, fontSize: "0.96rem", color: AMBER_TEXT, fontWeight: 600, lineHeight: 1.55 }}>
          <p style={{ margin: 0, fontWeight: 800 }}>Before Beaker can send it:</p>
          <ul style={{ listStyle: "disc", margin: "4px 0 0", paddingLeft: "1.25rem" }}>
            {problems.map((p) => <li key={p}>{p}</li>)}
          </ul>
        </div>
      )}
      {sendDoubt && (
        <Notice tone="warn">
          Gmail didn't confirm your email, so it may have gone out. Check your Gmail Sent folder. If it isn't there,
          copy it or open it in your mail app, then press Mark as sent.
        </Notice>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {gmail.connected !== false ? (
          <Button kind="primary" disabled={problems.length > 0 || !!rewriting || sendDoubt} onClick={pressSend}>
            Send with Gmail
          </Button>
        ) : gmail.configured ? (
          <Button kind="primary" onClick={() => openGmail("send")}>Connect Gmail to send</Button>
        ) : null}
        <Button kind="secondary" disabled={!body.trim()} onClick={() => copy("first", emailAsText({ subject, body }))}>
          {copied === "first" ? "Copied" : "Copy email"}
        </Button>
        <LinkButton href={mailtoHref({ to: validEmail(to) ? to : "", subject, body })} disabled={!body.trim()}>
          Open in my mail app
        </LinkButton>
        <Button kind="secondary" busy={marking} onClick={markSent} data-oa-mark>Mark as sent</Button>
      </div>
      <p style={{ margin: 0, fontFamily: SANS, fontSize: "0.93rem", color: TEXT_MUTED, lineHeight: 1.55 }}>
        {!statusKnown
          ? "Beaker couldn't check your Gmail connection just now. You can still press Send, and it will tell you if Gmail needs connecting. Or copy it, or open it in your mail app, then press Mark as sent."
          : gmail.connected
            ? `From ${gmail.email || "your Gmail"}.${sendsLeft ? ` ${sendsLeft.left} of ${sendsLeft.limit} sends left today.` : ""} Sent yourself? Press Mark as sent so your board keeps track.`
            : gmail.configured
              ? "Or copy it, or open it in your mail app, then press Mark as sent so your board keeps track."
              : "Sending from Mentorable isn't set up yet. Copy it or open it in your mail app, then press Mark as sent."}
      </p>
      {!statusKnown && (
        <div>
          <Button kind="quiet" busy={checking} onClick={checkAgain} style={{ padding: "10px 6px" }} data-oa-check>
            {checking ? "Checking..." : "Check Gmail again"}
          </Button>
        </div>
      )}
    </Card>
  );

  const sentView = (
    <>
      <SentCopy subject={contact.subject || subject} body={contact.body || body} />
      <FollowUpPanel contact={contact} gmail={gmail} text={followText} onText={editFollow} drafting={drafting}
        onDraft={draftFollowup} error={followError} onSendGmail={() => setSheet("followup")}
        onConnectGmail={() => openGmail("send")} onCopy={() => copy("followup", followText)} copied={copied === "followup"}
        mailto={mailtoHref({ to: contact.email || "", subject: `Re: ${contact.subject || ""}`, body: followText })}
        onMarkSent={markFollowupSent} marking={marking} today={new Date()} />
      <div>
        <Button kind="secondary" onClick={() => navigate?.(BOARD)}>Back to your board</Button>
      </div>
    </>
  );

  const main = sent ? (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
      {sentView}
      {narrow && rail && <Card>{rail}</Card>}
    </div>
  ) : (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
      {editorCard}
      {chips}
      {narrow && rail && <Card>{rail}</Card>}
      <FactsChecklist facts={facts} checked={checked} onToggle={toggleFact} />
      {actions}
    </div>
  );

  return (
    <div data-sidebar-offset style={pagePad}>
      <div style={{ maxWidth: hasRail && !narrow ? 1120 : 780, margin: "0 auto", width: "100%" }}>
        {backLink}
        <header style={{ margin: "6px 0 16px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 12px" }}>
            <h1 ref={heading} tabIndex={-1} className={FOCUS_CLASS}
              style={{ margin: 0, fontFamily: SANS, fontWeight: 800, fontSize: isMobile ? "1.8rem" : "2.2rem", color: ink.title,
                letterSpacing: "-0.02em", lineHeight: 1.15, overflowWrap: "anywhere", borderRadius: 6 }}>
              {contact.name}
            </h1>
            {stage && (
              <span style={{ fontFamily: SANS, fontSize: "0.9rem", fontWeight: 800, color: ink.onSoft, background: ink.soft,
                borderRadius: RADIUS.pill, padding: "4px 12px", whiteSpace: "nowrap" }}>
                {stage}
              </span>
            )}
          </div>
          {role && (
            <p style={{ margin: "4px 0 0", fontFamily: SANS, fontSize: "1.05rem", fontWeight: 600, color: TEXT_MUTED, overflowWrap: "anywhere" }}>
              {role}
            </p>
          )}
          {sent && (
            <p style={{ margin: "4px 0 0", fontFamily: SANS, fontSize: "0.98rem", fontWeight: 700, color: TEXT_MID }}>{sentLine(contact)}</p>
          )}
        </header>

        <MascotSays state={mascot.state} size={80} layout="auto" style={{ marginBottom: 16 }}>{mascot.line}</MascotSays>

        <div role="status" aria-live="polite" aria-atomic="true" style={SR_ONLY}>
          {said && <span key={said.n}>{said.text}</span>}
        </div>

        {notice && (
          <Notice tone={notice.tone} onDismiss={() => setNotice(null)} style={{ marginBottom: 16 }}
            action={notice.signIn ? <Button kind="primary" onClick={() => navigate?.("/auth")}>Sign in again</Button> : undefined}>
            {notice.text}
          </Notice>
        )}
        {waiting && (
          <Notice tone="warn" style={{ marginBottom: 16 }}
            action={<Button kind="secondary" onClick={() => navigate?.(`${BOARD}/new?try=${encodeURIComponent(waiting.id)}`)}>Answer Beaker's question</Button>}>
            Beaker is waiting on one answer from you before it writes this email.
          </Notice>
        )}

        {hasRail && !narrow ? (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: 24, alignItems: "start" }}>
            {main}
            <aside aria-label="Sources" data-rail-scroll style={{ position: "sticky", top: 24, maxHeight: "calc(100vh - 48px)", overflowY: "auto",
              background: "#ffffff", border: `1px solid ${BORDER}`, borderRadius: RADIUS.card, padding: "1rem 1.1rem",
              boxSizing: "border-box" }}>
              {rail}
            </aside>
          </div>
        ) : main}
      </div>

      <AnimatePresence>
        {sheet === "send" && (
          <SendSheet key="send" kind="first" from={gmail.email} to={to.trim()} subject={subject.trim()} uncheckedCount={unchecked}
            onConfirm={confirmSend} onClose={() => setSheet(null)} onNeedGmail={needGmail} />
        )}
        {sheet === "followup" && (
          <SendSheet key="followup" kind="followup" from={gmail.email} to={contact.email || to.trim()}
            subject={`Re: ${contact.subject || subject}`} onConfirm={confirmFollowup} onClose={() => setSheet(null)}
            onNeedGmail={needGmail} />
        )}
        {sheet === "gmail" && (
          <GmailConnectSheet key="gmail" reason={gmailReason} gmail={{ ...gmail, connected: false }} showSafety={false}
            onConnect={connectGmail} onClose={() => setSheet(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
