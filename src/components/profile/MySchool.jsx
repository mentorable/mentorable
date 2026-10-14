import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ALWAYS_SHARED, OPEN_REQUESTS_MAX, REQUEST_DAYS_AHEAD, REQUEST_MESSAGE_MAX, REQUEST_TIMES_MAX, SHARES,
  cancelRequest, counselorErrorMessage, formatWhen, joinCodeProblem, joinSchool, leaveSchool, mySchool,
  requestMeeting, setSharing, takeJoinCode,
} from "../../lib/counselor.js";
import {
  AMBER_BG, AMBER_TEXT, BORDER, DANGER, FOCUS_CLASS, RADIUS, SANS, SURFACE, TEXT, TEXT_MID, TEXT_MUTED, WHITE,
  useAgentInk,
} from "../ui/tokens.js";
import { Button, FieldLabel, Heading, INPUT_CLASS, Notice, SR_ONLY, inputStyle } from "../ui/kit.jsx";
import { PixelStamp } from "../ui/PixelIcons.jsx";

// "My school": the body of a Profile card, and the only place a student meets
// the counselor feature. Not linked, it is one quiet field for a join code.
// Linked, it is the student's control panel over what their counselor can
// see: four switches (all off until they turn one on), meeting requests, and
// the way out. Everything here saves the moment it is changed, unlike the rest
// of Profile (Save changes).
//
// The switches are the student's only view of what is shared, so they never
// guess: a change shows at once, is saved in the order it was made, and when a
// save fails the card reads back what is really saved before it says anything.
// This tab is not the only place a switch can be changed (another tab, a
// phone), so a save never sends a switch as it looked here a while ago: it
// reads what is saved first, and changes only what the student changed.

const REAL_API = { mySchool, joinSchool, setSharing, leaveSchool, requestMeeting, cancelRequest };

const DAY_MS = 86400000;
// After a join link scrolls the card into view, how long it is held there
// while the sections above it finish loading.
const HOLD_IN_VIEW_MS = 4000;
const HANDS_ON = ["wheel", "touchstart", "pointerdown", "keydown"];
// The switch's off track has to be visible against the card (3:1), not just tinted.
const OFF_TRACK = "#86817a";

const LABEL = { fontFamily: SANS, fontSize: "1rem", fontWeight: 700, color: TEXT, margin: 0, lineHeight: 1.4 };
const HINT = { fontFamily: SANS, fontSize: "0.92rem", color: TEXT_MUTED, lineHeight: 1.55, margin: "0.35rem 0 0" };
const BODY = { fontFamily: SANS, fontSize: "1rem", color: TEXT, lineHeight: 1.55, margin: 0, overflowWrap: "anywhere" };
const PROBLEM = { fontFamily: SANS, fontSize: "0.92rem", fontWeight: 700, color: DANGER, lineHeight: 1.5, margin: "0.35rem 0 0" };
const DIVIDED = { marginTop: "1.5rem", paddingTop: "1.25rem", borderTop: `1px solid ${BORDER}` };

const CSS = `
.ms-danger:hover:not(:disabled) { background: #fdf1f0 !important; }
.ms-x:hover:not(:disabled) { color: ${DANGER} !important; background: #fdf1f0 !important; }
@keyframes ms-shimmer { 0% { background-position: -400px 0 } 100% { background-position: 400px 0 } }
@media (prefers-reduced-motion: reduce) { .ms-skel { animation: none !important; } .ms-knob, .ms-track { transition: none !important; } }
`;

// ─── Small pure helpers ───────────────────────────────────────────────────────

const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const upperFirst = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const sameSharing = (a, b) => SHARES.every((s) => !!a?.[s.key] === !!b?.[s.key]);

/**
 * What one save of the switches carries: `sending` is how they should end up,
 * `saved` how the database holds them now. A switch left out of a save can
 * never be turned on by it, and as set_sharing stands it is turned off, so
 * every switch that is on or going on is named. One that is off and staying
 * off is left out.
 */
function saveFor(sending, saved) {
  const out = {};
  for (const { key } of SHARES) {
    if (sending[key] || saved[key]) out[key] = !!sending[key];
  }
  return out;
}

/** "Ms. Rivera", "Ms. Rivera and Mr. Okafor", "A, B and C". */
function nameList(names) {
  if (names.length <= 1) return names[0] || "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** "Oct 12, 2026" in the student's own zone, or "". */
function shortDay(iso) {
  const d = new Date(iso || NaN);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// A date-and-time field speaks in local wall-clock time ("2026-10-20T14:30").
// It is read by hand, in the browser's zone, and checked against what the
// clock really shows: a time skipped when the clocks change is not a time.
const pad = (n) => String(n).padStart(2, "0");
const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;

function toLocalInput(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value) {
  const m = LOCAL_RE.exec(typeof value === "string" ? value : "");
  if (!m) return null;
  const [y, mo, day, h, mi] = m.slice(1).map(Number);
  const d = new Date(y, mo - 1, day, h, mi, 0, 0);
  const real = d.getFullYear() === y && d.getMonth() === mo - 1 && d.getDate() === day
    && d.getHours() === h && d.getMinutes() === mi;
  return real ? d : null;
}

/** "CDT", or "" when the browser will not say. */
function zoneName() {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZoneName: "short" }).formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value || "";
  } catch {
    return "";
  }
}

/**
 * A meeting request checked against what the database checks: a message of 1
 * to 300 characters once trimmed (counted as the database counts, so an emoji
 * is one), and 1 to 3 times, each in the future and within 60 days.
 */
function checkRequest(message, times, now) {
  const text = message.trim();
  const length = Array.from(text).length;
  let messageProblem = "";
  if (!length) messageProblem = "Write a line or two about what you want to talk about.";
  else if (length > REQUEST_MESSAGE_MAX) messageProblem = `Shorten your message to ${REQUEST_MESSAGE_MAX} characters.`;

  const latest = now.getTime() + REQUEST_DAYS_AHEAD * DAY_MS;
  const dates = [];
  const timeProblems = times.map((value) => {
    if (!value) return "";
    const d = fromLocalInput(value);
    if (!d) return "Pick a real date and time.";
    if (d.getTime() <= now.getTime()) return "That time has already passed. Pick one in the future.";
    if (d.getTime() > latest) return `Pick a time within the next ${REQUEST_DAYS_AHEAD} days.`;
    dates.push(d);
    return "";
  });
  const timesProblem = times.some(Boolean) ? "" : "Add at least one day and time that works for you.";
  return {
    text, length, messageProblem, timeProblems, timesProblem, dates,
    ok: !messageProblem && !timesProblem && timeProblems.every((p) => !p),
  };
}

// ─── Small pieces ─────────────────────────────────────────────────────────────

function Tag({ tone, stamp, children }) {
  const ink = useAgentInk();
  const look = tone === "wait" ? { background: AMBER_BG, color: AMBER_TEXT, border: "1px solid #f3d9a4" }
    : tone === "good" ? { background: ink.softer, color: ink.onSoft, border: `1px solid ${ink.soft}` }
      : { background: SURFACE, color: TEXT_MID, border: `1px solid ${BORDER}` };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: RADIUS.pill,
      fontFamily: SANS, fontSize: "0.9rem", fontWeight: 700, lineHeight: 1.3, ...look }}>
      {stamp && <PixelStamp kind={stamp} size={16} />}
      {children}
    </span>
  );
}

function Skeleton() {
  return (
    <div aria-busy="true">
      <span style={SR_ONLY}>Checking your school link</span>
      {[46, 82].map((w, i) => (
        <div key={i} className="ms-skel" style={{ width: `${w}%`, height: 14, borderRadius: 6, marginBottom: 10,
          background: "linear-gradient(90deg, #ece6de 25%, #f5f1ec 50%, #ece6de 75%)",
          backgroundSize: "400px 100%", animation: "ms-shimmer 1.5s infinite" }} />
      ))}
    </div>
  );
}

// ─── Not linked: the join field ───────────────────────────────────────────────

function JoinForm({ api, initialCode, onJoined, onAlreadyLinked }) {
  const [code, setCode] = useState(initialCode || "");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const inputRef = useRef(null);

  // A code from a join link can arrive a moment after the field does.
  useEffect(() => { if (initialCode) setCode((typed) => typed || initialCode); }, [initialCode]);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    // A slip is caught here, before it costs one of the hour's tries.
    const slip = joinCodeProblem(code);
    if (slip) { setProblem(slip); inputRef.current?.focus(); return; }
    setBusy(true);
    setProblem("");
    try {
      onJoined(await api.joinSchool(code));
    } catch (err) {
      setBusy(false);
      if (err?.code === "already_linked") { onAlreadyLinked(); return; }
      setProblem(counselorErrorMessage(err));
    }
  };

  return (
    <div>
      <form onSubmit={submit} noValidate>
        <FieldLabel htmlFor="ms-code" hint="If your school counselor gave you a join code, enter it here.">
          Join code
        </FieldLabel>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
          <input id="ms-code" ref={inputRef} className={INPUT_CLASS} value={code} maxLength={24}
            onChange={(e) => { setCode(e.target.value); setProblem(""); }}
            autoComplete="off" autoCapitalize="characters" autoCorrect="off" spellCheck={false}
            aria-invalid={problem ? true : undefined}
            aria-describedby={problem ? "ms-code-problem ms-code-shares" : "ms-code-shares"}
            style={{ ...inputStyle, flex: "1 1 170px", width: "auto", minWidth: 0, maxWidth: 280, fontWeight: 700,
              letterSpacing: "0.12em", textTransform: "uppercase" }} />
          <Button kind="primary" type="submit" busy={busy} disabled={!code.trim()} style={{ whiteSpace: "nowrap" }}>
            {busy ? "Joining..." : "Join school"}
          </Button>
        </div>
        {problem && (
          <Notice tone="error" style={{ marginTop: 10 }}><span id="ms-code-problem">{problem}</span></Notice>
        )}
      </form>

      <div id="ms-code-shares" style={{ marginTop: "0.9rem" }}>
        <p style={{ ...HINT, marginTop: 0 }}>
          Joining shares one thing with your school's counselors: <strong style={{ color: TEXT }}>{lowerFirst(ALWAYS_SHARED)}</strong>.
          {" "}Everything else stays off until you turn it on, and you can leave whenever you like.
        </p>
        <p style={HINT}>Only enter a code that your own school counselor gave you.</p>
      </div>
    </div>
  );
}

// ─── Linked: the switches ─────────────────────────────────────────────────────

function ShareSwitch({ share, on, onToggle, who }) {
  const ink = useAgentInk();
  const labelId = `ms-share-${share.key}`;
  const detailId = `ms-share-${share.key}-detail`;
  return (
    <li style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, padding: "0.85rem 0",
      borderTop: `1px solid ${BORDER}` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p id={labelId} style={LABEL}>{share.label}</p>
        <p id={detailId} style={{ ...HINT, marginTop: "0.2rem" }}>{share.detail}</p>
        <p aria-hidden="true" style={{ ...HINT, marginTop: "0.2rem", fontWeight: 700, color: on ? TEXT : TEXT_MUTED }}>
          {on ? `Shared with ${who}` : "Not shared"}
        </p>
      </div>
      <button type="button" role="switch" aria-checked={on} aria-labelledby={labelId} aria-describedby={detailId}
        className={FOCUS_CLASS} onClick={onToggle}
        style={{ flexShrink: 0, width: 54, height: 44, padding: 0, border: "none", background: "transparent",
          borderRadius: RADIUS.control, cursor: "pointer", display: "inline-flex", alignItems: "center",
          justifyContent: "center" }}>
        <span aria-hidden="true" className="ms-track" style={{ position: "relative", width: 46, height: 26, borderRadius: 13,
          background: on ? ink.button.bg : OFF_TRACK, transition: "background 0.18s" }}>
          <span className="ms-knob" style={{ position: "absolute", top: 3, left: on ? 23 : 3, width: 20, height: 20,
            borderRadius: "50%", background: WHITE, boxShadow: "0 1px 3px rgba(0,0,0,0.25)", transition: "left 0.18s" }} />
        </span>
      </button>
    </li>
  );
}

// ─── Linked: asking for a meeting ─────────────────────────────────────────────

const TIME_LABELS = ["First time", "Second time", "Third time"];

function MeetingForm({ api, who, onSent, onClose, onGone, onStale }) {
  const [message, setMessage] = useState("");
  const [times, setTimes] = useState([""]);
  const [busy, setBusy] = useState(false);
  const [pressed, setPressed] = useState(false);   // the empty-field problems wait for the first Send
  const [refused, setRefused] = useState("");
  const messageRef = useRef(null);
  const timeRefs = useRef([]);
  const addRef = useRef(null);

  useEffect(() => { messageRef.current?.focus(); }, []);

  const now = new Date();
  const check = checkRequest(message, times, now);
  const over = check.length > REQUEST_MESSAGE_MAX;
  const messageProblem = over || pressed ? check.messageProblem : "";
  const timesProblem = pressed ? check.timesProblem : "";
  const zone = zoneName();

  const setTime = (i, value) => setTimes((list) => list.map((t, at) => (at === i ? value : t)));
  const addTime = () => setTimes((list) => (list.length < REQUEST_TIMES_MAX ? [...list, ""] : list));
  const removeTime = (i) => {
    setTimes((list) => (list.length > 1 ? list.filter((_, at) => at !== i) : list));
    // The row that held the button is gone: the field before it takes the focus.
    requestAnimationFrame(() => (timeRefs.current[Math.max(0, i - 1)] || addRef.current)?.focus?.());
  };

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const sure = checkRequest(message, times, new Date());
    if (!sure.ok) {
      setPressed(true);
      if (sure.messageProblem) messageRef.current?.focus();
      else timeRefs.current[sure.timesProblem ? 0 : sure.timeProblems.findIndex(Boolean)]?.focus?.();
      return;
    }
    setBusy(true);
    setRefused("");
    try {
      onSent(await api.requestMeeting(sure.text, sure.dates));
    } catch (err) {
      setBusy(false);
      if (err?.code === "not_linked") { onGone(); return; }
      // The database had the last word: say what it said.
      setRefused(counselorErrorMessage(err));
      if (err?.code === "too_many_open") onStale();
    }
  };

  const nearLimit = check.length > REQUEST_MESSAGE_MAX * 0.85;

  return (
    <form onSubmit={submit} noValidate aria-labelledby="ms-ask-title"
      style={{ marginTop: "0.9rem", padding: "1rem", background: SURFACE, border: `1px solid ${BORDER}`,
        borderRadius: RADIUS.control, minWidth: 0 }}>
      <Heading level={3} id="ms-ask-title" style={{ marginBottom: "0.9rem" }}>Request a meeting</Heading>

      <FieldLabel htmlFor="ms-msg" hint={`What would you like to talk about? ${upperFirst(who)} will read this.`}>
        Message
      </FieldLabel>
      <textarea id="ms-msg" ref={messageRef} className={INPUT_CLASS} value={message} rows={3}
        onChange={(e) => { setMessage(e.target.value); setRefused(""); }}
        aria-invalid={messageProblem ? true : undefined}
        aria-describedby={messageProblem ? "ms-msg-problem ms-msg-count" : "ms-msg-count"}
        style={{ ...inputStyle, minHeight: 96, resize: "vertical", lineHeight: 1.55, display: "block" }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <p id="ms-msg-problem" aria-live="polite" style={{ ...PROBLEM, flex: 1, minWidth: 0 }}>{messageProblem}</p>
        <p id="ms-msg-count" style={{ ...HINT, flexShrink: 0, fontVariantNumeric: "tabular-nums",
          fontWeight: nearLimit ? 700 : 500, color: over ? DANGER : nearLimit ? AMBER_TEXT : TEXT_MUTED }}>
          {check.length}/{REQUEST_MESSAGE_MAX}<span style={SR_ONLY}> characters</span>
        </p>
      </div>
      <p style={HINT}>
        A request may not be read right away. If something is urgent, talk to an adult you trust, or call or text 988.
      </p>

      <fieldset style={{ border: "none", padding: 0, margin: "1rem 0 0", minWidth: 0 }}>
        <legend style={{ ...LABEL, padding: 0 }}>Times that work for you</legend>
        <p id="ms-times-hint" style={{ ...HINT, marginTop: "0.15rem" }}>
          Offer up to {REQUEST_TIMES_MAX}, within the next {REQUEST_DAYS_AHEAD} days. {upperFirst(who)} can confirm one or
          pick another. Times are in your time zone{zone ? ` (${zone})` : ""}.
        </p>
        {times.map((value, i) => {
          const problem = check.timeProblems[i] || (i === 0 ? timesProblem : "");
          const noteId = `ms-time-${i}-problem`;
          return (
            <div key={i} style={{ marginTop: times.length > 1 ? "0.4rem" : "0.75rem" }}>
              {/* The label and Remove share a line, so the field keeps the full width on a phone. */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                minHeight: times.length > 1 ? 44 : 0, marginBottom: times.length > 1 ? 0 : 4 }}>
                <label htmlFor={`ms-time-${i}`} style={{ fontFamily: SANS, fontSize: "0.92rem", fontWeight: 700, color: TEXT_MID }}>
                  {TIME_LABELS[i] || `Time ${i + 1}`}
                </label>
                {times.length > 1 && (
                  <button type="button" className={`ms-x ${FOCUS_CLASS}`} onClick={() => removeTime(i)}
                    aria-label={`Remove the ${(TIME_LABELS[i] || `time ${i + 1}`).toLowerCase()}`}
                    style={{ flexShrink: 0, minHeight: 44, padding: "0 10px", marginRight: -10, display: "inline-flex",
                      alignItems: "center", borderRadius: RADIUS.control, border: "none", background: "transparent",
                      fontFamily: SANS, fontSize: "0.92rem", fontWeight: 700, color: TEXT_MUTED, cursor: "pointer" }}>
                    Remove
                  </button>
                )}
              </div>
              <input id={`ms-time-${i}`} type="datetime-local" className={INPUT_CLASS} value={value}
                ref={(el) => { timeRefs.current[i] = el; }}
                min={toLocalInput(now)} max={toLocalInput(new Date(now.getTime() + REQUEST_DAYS_AHEAD * DAY_MS))}
                onChange={(e) => { setTime(i, e.target.value); setRefused(""); }}
                aria-invalid={problem ? true : undefined}
                aria-describedby={problem ? `${noteId} ms-times-hint` : "ms-times-hint"}
                style={{ ...inputStyle, display: "block", minWidth: 0, maxWidth: 320 }} />
              <p id={noteId} aria-live="polite" style={problem ? PROBLEM : { ...PROBLEM, margin: 0 }}>{problem}</p>
            </div>
          );
        })}
        {times.length < REQUEST_TIMES_MAX && (
          <Button kind="secondary" ref={addRef} onClick={addTime} style={{ marginTop: "0.75rem" }}>
            Add another time
          </Button>
        )}
      </fieldset>

      {refused && <Notice tone="error" style={{ marginTop: "1rem" }}>{refused}</Notice>}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: "1.1rem" }}>
        <Button kind="primary" type="submit" busy={busy}>{busy ? "Sending..." : "Send request"}</Button>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
      </div>
    </form>
  );
}

// ─── Linked: the student's requests ───────────────────────────────────────────

const STATUS = {
  pending: { label: "Waiting for an answer", tone: "wait", stamp: "clock" },
  confirmed: { label: "Confirmed", tone: "good", stamp: "check" },
  declined: { label: "Declined", tone: "plain" },
  cancelled: { label: "Cancelled", tone: "plain" },
};

function RequestRow({ api, request, who, onCancelled, onGone, onStale }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const rowRef = useRef(null);
  const cancelRef = useRef(null);
  const wasAsking = useRef(false);
  const justCancelled = useRef(false);

  const status = request.status;
  const look = STATUS[status] || { label: "Closed", tone: "plain" };
  const meeting = status === "confirmed" ? formatWhen(request.meeting_at) : "";
  const meetingAt = Date.parse(request.meeting_at || "");
  const over = status === "confirmed" && Number.isFinite(meetingAt) && meetingAt < Date.now();
  const offered = request.times.map((t) => ({ at: Date.parse(t), text: formatWhen(t) })).filter((t) => t.text);
  const theirPick = status === "confirmed" && Number.isFinite(meetingAt) && offered.length > 0
    && !offered.some((t) => t.at === meetingAt);
  const canCancel = (status === "pending" || status === "confirmed") && !over;
  const sent = shortDay(request.created_at);
  const what = status === "confirmed" ? "meeting" : "request";

  // "Keep it" hands the focus back to the button that asked.
  useEffect(() => {
    if (!asking && wasAsking.current) cancelRef.current?.focus?.();
    wasAsking.current = asking;
  }, [asking]);

  // Once cancelled, its buttons are gone: the row itself takes the focus.
  useEffect(() => {
    if (!justCancelled.current) return;
    justCancelled.current = false;
    rowRef.current?.focus?.();
  }, [request.status]);

  const cancel = async () => {
    if (busy) return;
    setBusy(true);
    setProblem("");
    try {
      await api.cancelRequest(request.id);
      justCancelled.current = true;
      wasAsking.current = false;
      setAsking(false);
      setBusy(false);
      onCancelled(request, what);
    } catch (err) {
      setBusy(false);
      if (err?.code === "not_linked") { onGone(); return; }
      setAsking(false);
      setProblem(counselorErrorMessage(err));
      if (err?.code === "no_request") onStale();   // already closed somewhere else: show what is true
    }
  };

  return (
    <li ref={rowRef} tabIndex={-1} className={FOCUS_CLASS}
      style={{ padding: "0.9rem 0", borderTop: `1px solid ${BORDER}`, borderRadius: 4 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px 12px", flexWrap: "wrap" }}>
        <Tag tone={look.tone} stamp={look.stamp}>{look.label}</Tag>
        {sent && <span style={{ ...HINT, margin: 0 }}>Sent {sent}</span>}
      </div>

      {meeting && (
        <p style={{ ...BODY, marginTop: "0.6rem", fontWeight: 700 }}>
          {over ? "Your meeting was " : "Your meeting is "}{meeting}
        </p>
      )}
      {theirPick && !over && (
        <p style={{ ...HINT, marginTop: "0.2rem" }}>
          {upperFirst(who)} picked a time you did not offer. If it doesn't work, cancel and send a new request.
        </p>
      )}

      <p style={{ ...BODY, marginTop: "0.6rem" }}>
        <span style={SR_ONLY}>Your message: </span>{request.message}
      </p>

      {status === "pending" && offered.length > 0 && (
        <div style={{ marginTop: "0.5rem" }}>
          <p style={{ ...HINT, margin: 0, fontWeight: 700 }}>{offered.length === 1 ? "The time you offered" : "The times you offered"}</p>
          <ul style={{ margin: "0.2rem 0 0", paddingLeft: "1.2rem", listStyle: "disc", fontFamily: SANS, fontSize: "1rem", color: TEXT, lineHeight: 1.6 }}>
            {offered.map((t, i) => <li key={`${i}:${t.at}`}>{t.text}</li>)}
          </ul>
        </div>
      )}

      {request.counselor_note && (
        <div style={{ marginTop: "0.6rem", padding: "0.6rem 0.8rem", background: SURFACE, border: `1px solid ${BORDER}`,
          borderRadius: RADIUS.control }}>
          <p style={{ ...HINT, margin: 0, fontWeight: 700 }}>Note from {who}</p>
          <p style={{ ...BODY, marginTop: "0.15rem" }}>{request.counselor_note}</p>
        </div>
      )}

      {problem && <Notice tone="error" style={{ marginTop: "0.75rem" }}>{problem}</Notice>}

      {canCancel && (
        asking ? (
          <div role="group" aria-label={`Cancel this ${what}?`}
            style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: "0.75rem" }}>
            <p style={{ ...LABEL, flex: "1 1 100%" }}>
              Cancel this {what}?{status === "confirmed" ? ` ${upperFirst(who)} will see that you cancelled.` : ""}
            </p>
            <Button autoFocus onClick={() => setAsking(false)} disabled={busy}>Keep it</Button>
            <Button kind="danger" className={`${FOCUS_CLASS} ms-danger`} onClick={cancel} busy={busy}>
              {busy ? "Cancelling..." : "Yes, cancel it"}
            </Button>
          </div>
        ) : (
          <Button ref={cancelRef} onClick={() => { setProblem(""); setAsking(true); }} style={{ marginTop: "0.75rem" }}>
            Cancel {what}
          </Button>
        )
      )}
    </li>
  );
}

// ─── Linked: the whole panel ──────────────────────────────────────────────────

function Linked({ api, link, onLink, onShareWrite, onLeft, onGone, refresh, announce, toast, waitingCode, onDropCode }) {
  const name = link.school.name;
  const who = link.counselors.length > 1 ? "your counselors" : "your counselor";
  const joined = shortDay(link.linked_at);

  // ── The switches ──
  // `shown` is what the student sees, `desired` what they last asked for and
  // `confirmed` what the database last said. Saves go out one at a time, so a
  // slow answer can never undo a newer choice. Each one first reads what is
  // saved now and lays only the student's own changes over it: a switch they
  // did not touch here is never sent as this tab last saw it, which may be
  // from before they changed it somewhere else.
  const [shown, setShown] = useState(link.sharing);
  const [shareProblem, setShareProblem] = useState("");
  const confirmed = useRef(link.sharing);
  const desired = useRef(link.sharing);
  const saving = useRef(false);
  const asked = useRef(new Set());   // the switches changed here, for the line that says what was saved

  // A fresh read of the link carries the saved switches (never during a save,
  // whose own answer is newer).
  useEffect(() => {
    if (saving.current) return;
    confirmed.current = link.sharing;
    desired.current = link.sharing;
    setShown(link.sharing);
  }, [link.sharing]);

  // Back on this tab after time away: a switch may have been changed in
  // another tab or on a phone, so the link is read again and the switches show
  // what is saved before the student touches one. (Not during a save, which
  // reads it for itself.)
  const looking = useRef(false);
  useEffect(() => {
    const onBack = async () => {
      if (document.visibilityState !== "visible" || saving.current || looking.current) return;
      looking.current = true;
      try { await refresh(); } finally { looking.current = false; }
    };
    document.addEventListener("visibilitychange", onBack);
    window.addEventListener("focus", onBack);
    return () => {
      document.removeEventListener("visibilitychange", onBack);
      window.removeEventListener("focus", onBack);
    };
  }, [refresh]);

  const settle = (sharing) => {
    confirmed.current = sharing;
    desired.current = sharing;
    setShown(sharing);
    onLink((prev) => (prev ? { ...prev, sharing } : prev));
  };

  // A newer reading of what is saved (`truth`) takes the place of `base`. The
  // changes the student made on top of `base` are kept on top of it, and
  // every other switch shows what is saved.
  const rebase = (truth, base) => {
    const next = { ...truth };
    for (const { key } of SHARES) {
      if (!!desired.current[key] !== !!base[key]) next[key] = !!desired.current[key];
    }
    confirmed.current = truth;
    desired.current = next;
    setShown(next);
  };

  const flush = async () => {
    if (saving.current) return;
    saving.current = true;
    const before = confirmed.current;
    try {
      while (!sameSharing(desired.current, confirmed.current)) {
        let sending = null;   // set once a save has gone out
        let saved = null;
        let failure = null;
        onShareWrite();
        try {
          // What this tab last saw may be old. Read what is saved now.
          const now = await api.mySchool();
          if (!now) { onGone(); return; }
          rebase(now.sharing, confirmed.current);
          // Already as they asked: they made the same change somewhere else.
          if (sameSharing(desired.current, confirmed.current)) { settle(confirmed.current); continue; }
          sending = desired.current;
          const fresh = await api.setSharing(saveFor(sending, confirmed.current));
          if (!fresh) { onGone(); return; }
          saved = fresh.sharing;
        } catch (err) {
          failure = err;
        } finally {
          onShareWrite();
        }

        if (failure) {
          if (failure.code === "not_linked") { onGone(); return; }
          if (!sending) {
            // The read before the save failed, so nothing was sent.
            settle(confirmed.current);
            setShareProblem(`That change was not saved. ${counselorErrorMessage(failure)}`);
            return;
          }
          // No answer does not mean no change: the save may have landed and
          // only its reply been lost. Read what is saved before saying so.
          let truth = null;
          let read = false;
          try { const now = await api.mySchool(); read = true; truth = now ? now.sharing : null; } catch { read = false; }
          if (read && !truth) { onGone(); return; }
          if (truth && sameSharing(truth, sending)) {
            saved = truth;
          } else {
            settle(truth || confirmed.current);
            setShareProblem(truth
              ? `That change was not saved. The switches show what is shared right now. ${counselorErrorMessage(failure)}`
              : `That change may not have saved. ${counselorErrorMessage(failure)} Reload this page to see what is shared.`);
            return;
          }
        }

        // Nothing newer was asked for while this one was away: show what the
        // database holds. Otherwise the newer choice is kept on top of it,
        // and the loop sends it next.
        if (desired.current === sending) {
          settle(saved);
        } else {
          rebase(saved, sending);
          onLink((prev) => (prev ? { ...prev, sharing: saved } : prev));
        }
      }

      // Only the switches the student changed here are named, not one that
      // moved because it had been changed somewhere else.
      const after = confirmed.current;
      const changed = SHARES.filter((s) => asked.current.has(s.key) && !!before[s.key] !== !!after[s.key]);
      if (changed.length === 1) {
        const s = changed[0];
        const line = after[s.key] ? `${s.label} is now shared with ${who}` : `${s.label} is no longer shared with ${who}`;
        announce(`${line}.`);
        toast(line);
      } else if (changed.length > 1) {
        announce("Your sharing choices are saved.");
        toast("Sharing choices saved");
      }
    } finally {
      asked.current.clear();
      saving.current = false;
    }
  };

  const toggle = (key) => {
    const next = { ...desired.current, [key]: !desired.current[key] };
    desired.current = next;
    asked.current.add(key);
    setShown(next);
    setShareProblem("");
    flush();
  };

  // ── Meetings ──
  const [asking, setAsking] = useState(false);
  const askRef = useRef(null);
  const listRef = useRef(null);
  const focusNext = useRef("");
  const waiting = link.requests.filter((r) => r.status === "pending").length;
  const full = waiting >= OPEN_REQUESTS_MAX;

  useEffect(() => {
    const where = focusNext.current;
    focusNext.current = "";
    if (where === "ask") askRef.current?.focus?.();
    if (where === "list") listRef.current?.focus?.();
  }, [asking]);

  const sent = (request) => {
    focusNext.current = "list";
    setAsking(false);
    if (request?.id) {
      onLink((prev) => (prev
        ? { ...prev, requests: [request, ...prev.requests.filter((r) => r.id !== request.id)].slice(0, 10) }
        : prev));
    }
    announce(`Your request was sent. When ${who} ${link.counselors.length > 1 ? "answer" : "answers"}, it shows here.`);
    toast("Meeting request sent");
    refresh();
  };

  const cancelled = (request, what) => {
    onLink((prev) => (prev
      ? { ...prev, requests: prev.requests.map((r) => (r.id === request.id ? { ...r, status: "cancelled" } : r)) }
      : prev));
    announce(`Your ${what} was cancelled.`);
    toast(what === "meeting" ? "Meeting cancelled" : "Request cancelled");
    refresh();
  };

  // ── Leaving ──
  const [leaving, setLeaving] = useState(false);
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [leaveProblem, setLeaveProblem] = useState("");
  const dialogRef = useRef(null);
  const openerRef = useRef(null);
  const leaveBusyNow = useRef(false);
  useEffect(() => { leaveBusyNow.current = leaveBusy; }, [leaveBusy]);

  // The confirm dialog: Escape closes it, Tab stays inside it, and closing
  // hands focus back to the button that opened it. (It depends on `leaving`
  // alone: re-running while the dialog is open would throw the focus out to
  // the button behind it.)
  useEffect(() => {
    if (!leaving) return undefined;
    const opener = openerRef.current;
    const onKey = (e) => {
      if (e.key === "Escape" && !leaveBusyNow.current) { setLeaving(false); return; }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const buttons = [...dialogRef.current.querySelectorAll("button:not(:disabled)")];
      if (!buttons.length) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      const inside = dialogRef.current.contains(document.activeElement);
      if (!inside || (e.shiftKey && document.activeElement === first)) { e.preventDefault(); (inside ? last : first).focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); opener?.focus?.(); };
  }, [leaving]);

  const leave = async () => {
    if (leaveBusy) return;
    setLeaveBusy(true);
    setLeaveProblem("");
    try {
      await api.leaveSchool();
      onLeft(name);
    } catch (err) {
      if (err?.code === "not_linked") { onGone(); return; }   // already out: the same place, said plainly
      setLeaveBusy(false);
      setLeaveProblem(counselorErrorMessage(err));
    }
  };

  return (
    <div>
      {/* Who they are linked to */}
      <p style={{ ...HINT, margin: 0 }}>You are linked to</p>
      <Heading level={3} style={{ marginTop: "0.1rem", overflowWrap: "anywhere" }}>{name}</Heading>
      <p style={HINT}>
        {link.counselors.length
          ? `${link.counselors.length > 1 ? "Your counselors here are" : "Your counselor here is"} ${nameList(link.counselors)}.`
          : "No counselor is listed for this school right now."}
        {joined ? ` You joined on ${joined}.` : ""}
      </p>

      {waitingCode && (
        <Notice tone="info" onDismiss={onDropCode} style={{ marginTop: "1rem" }}>
          You opened a join link for a school, but you are already linked to {name}. To join another school, leave this one first.
        </Notice>
      )}

      {/* What the counselor can see */}
      <div style={DIVIDED}>
        <p id="ms-shares-title" style={LABEL}>What {who} can see</p>
        <p style={HINT}>
          You choose. Each switch saves as soon as you change it, and turning one off hides that part from {who} right away.
        </p>
        <ul aria-labelledby="ms-shares-title" style={{ listStyle: "none", margin: "0.75rem 0 0", padding: 0 }}>
          <li style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, padding: "0.85rem 0",
            borderTop: `1px solid ${BORDER}` }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={LABEL}>{ALWAYS_SHARED}</p>
              <p style={{ ...HINT, marginTop: "0.2rem" }}>Shared for as long as you are linked, so {who} can tell who you are.</p>
            </div>
            <Tag tone="plain">Always on</Tag>
          </li>
          {SHARES.map((share) => (
            <ShareSwitch key={share.key} share={share} on={!!shown[share.key]} who={who} onToggle={() => toggle(share.key)} />
          ))}
        </ul>
        {shareProblem && (
          <Notice tone="error" onDismiss={() => setShareProblem("")} style={{ marginTop: "0.25rem" }}>{shareProblem}</Notice>
        )}
        <p style={{ ...HINT, marginTop: "0.9rem" }}>
          <strong style={{ color: TEXT }}>Never shared:</strong> your chats with your advisor, what Mentorable remembers, the
          words, titles and prompts of your essays and Quill's notes on them, what you write in Quest check-ins, and Beaker's
          and Talon's boards.
        </p>
        <p style={HINT}>
          {upperFirst(who)} can print or save what you share. Turning a switch off stops them seeing it from then on. It cannot
          take back a copy they already made.
        </p>
      </div>

      {/* Meetings */}
      <div style={DIVIDED}>
        <p style={LABEL}>Meet with {who}</p>
        {asking ? (
          <MeetingForm api={api} who={who} onSent={sent} onGone={onGone} onStale={refresh}
            onClose={() => { focusNext.current = "ask"; setAsking(false); }} />
        ) : !link.counselors.length ? (
          <p style={HINT}>There is no counselor at this school to ask right now.</p>
        ) : full ? (
          <p style={{ ...HINT, color: AMBER_TEXT, fontWeight: 600 }}>
            You have {waiting} requests waiting for an answer, which is the most you can have at once. Cancel one, or wait for
            a reply, to send another.
          </p>
        ) : (
          <>
            <p style={HINT}>
              Send a short message and up to {REQUEST_TIMES_MAX} times that work for you. The message and the times go to {who}.
            </p>
            <Button ref={askRef} onClick={() => setAsking(true)} style={{ marginTop: "0.75rem" }}>
              Request a meeting
            </Button>
          </>
        )}

        {link.requests.length > 0 && (
          <div style={{ marginTop: "1.25rem" }}>
            <p id="ms-requests-title" ref={listRef} tabIndex={-1} className={FOCUS_CLASS} style={{ ...LABEL, borderRadius: 4 }}>
              Your requests
            </p>
            <ul aria-labelledby="ms-requests-title" style={{ listStyle: "none", margin: "0.5rem 0 0", padding: 0 }}>
              {link.requests.map((request) => (
                <RequestRow key={request.id} api={api} request={request} who={who} onCancelled={cancelled}
                  onGone={onGone} onStale={refresh} />
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Leaving */}
      <div style={{ ...DIVIDED, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem 1rem",
        flexWrap: "wrap" }}>
        <p style={{ ...HINT, margin: 0, flex: "1 1 220px" }}>
          Leaving ends {who === "your counselor" ? "your counselor's" : "your counselors'"} access to everything here at once
          and removes your meeting requests.
        </p>
        <Button kind="danger" className={`${FOCUS_CLASS} ms-danger`} ref={openerRef}
          onClick={() => { setLeaveProblem(""); setLeaving(true); }} style={{ whiteSpace: "nowrap" }}>
          Leave this school
        </Button>
      </div>

      <AnimatePresence>
        {leaving && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(20,20,19,0.5)", display: "flex",
              alignItems: "center", justifyContent: "center", padding: "1rem" }}
            onClick={(e) => { if (e.target === e.currentTarget && !leaveBusy) setLeaving(false); }}
          >
            <motion.div
              ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="ms-leave-title" aria-describedby="ms-leave-body"
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: RADIUS.card, padding: "1.5rem",
                width: "100%", maxWidth: 460, maxHeight: "calc(100vh - 2rem)", overflowY: "auto", boxSizing: "border-box",
                boxShadow: "0 18px 48px rgba(20,20,19,0.18)" }}
            >
              <Heading id="ms-leave-title" style={{ marginBottom: "0.5rem", overflowWrap: "anywhere" }}>Leave {name}?</Heading>
              <p id="ms-leave-body" style={{ fontFamily: SANS, fontSize: "1rem", color: TEXT_MUTED, lineHeight: 1.6, margin: "0 0 1.25rem" }}>
                {upperFirst(who)} {link.counselors.length > 1 ? "lose" : "loses"} access at once: your name, everything you
                shared and your meeting requests all go from their view. A copy they already printed or saved stays with
                them. You can join again later with the school's code.
              </p>
              {leaveProblem && <Notice tone="error" style={{ marginBottom: "1rem" }}>{leaveProblem}</Notice>}
              <div style={{ display: "flex", gap: "0.625rem", justifyContent: "flex-end", flexWrap: "wrap" }}>
                <Button autoFocus onClick={() => setLeaving(false)} disabled={leaveBusy}>Stay</Button>
                <Button kind="danger" onClick={leave} disabled={leaveBusy} style={{ background: DANGER, color: WHITE }}>
                  {leaveBusy ? "Leaving..." : "Leave this school"}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── The card ─────────────────────────────────────────────────────────────────

export default function MySchool({ userId, onToast, api = REAL_API }) {
  const [phase, setPhase] = useState("loading");   // "loading" | "failed" | "ready"
  const [link, setLink] = useState(null);          // my_school()'s answer, or null when not linked
  const [waitingCode, setWaitingCode] = useState("");
  const [notice, setNotice] = useState("");
  const [said, setSaid] = useState({ text: "", n: 0 });
  const rootRef = useRef(null);
  const wantFocus = useRef(false);
  const fromLink = useRef(false);   // a join link's code has just been read: bring the card into view
  const alive = useRef(true);
  const reads = useRef(0);          // only the newest read of the link is used
  const shareWrites = useRef(0);    // bumped as each save of the switches starts and ends
  const toastRef = useRef(onToast);

  useEffect(() => { toastRef.current = onToast; }, [onToast]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const toast = useCallback((text) => { toastRef.current?.(text); }, []);
  // The same words twice in a row are still said twice.
  const announce = useCallback((text) => setSaid((prev) => ({ text, n: prev.n + 1 })), []);

  const load = useCallback(async () => {
    const mine = ++reads.current;
    if (!userId) { setPhase("failed"); return; }
    try {
      const value = await api.mySchool();
      if (!alive.current || mine !== reads.current) return;
      setLink(value);
      setPhase("ready");
    } catch {
      if (alive.current && mine === reads.current) setPhase("failed");
    }
  }, [api, userId]);

  useEffect(() => { load(); }, [load]);

  // A code left by a join link. Reading removes it, so it is read only once
  // the link itself has been read, which only a signed-in student can do:
  // Profile sends a signed-out visitor to sign in, and the code has to be
  // waiting when they come back.
  useEffect(() => {
    if (phase !== "ready") return;
    const code = takeJoinCode();
    if (code) { fromLink.current = true; setWaitingCode(code); }
  }, [phase]);

  // A join link is meant to take the student to the code, and this card is a
  // long way down Profile. So it is scrolled into view and the code field
  // takes the focus (already linked, the card does, with its note about the
  // link). The sections above are often still loading and would push the card
  // back out of view as they fill in, so it is held in place for a few
  // seconds, or until the student scrolls, taps or types.
  useEffect(() => {
    if (!waitingCode || !fromLink.current) return undefined;
    fromLink.current = false;
    const root = rootRef.current;
    if (!root) return undefined;
    const show = () => root.scrollIntoView({ block: "start" });
    show();
    (root.querySelector("#ms-code") || root).focus({ preventScroll: true });
    if (typeof ResizeObserver === "undefined") return undefined;
    const watch = new ResizeObserver(show);
    let timer = null;
    const letGo = () => {
      watch.disconnect();
      clearTimeout(timer);
      HANDS_ON.forEach((name) => window.removeEventListener(name, letGo));
    };
    timer = setTimeout(letGo, HOLD_IN_VIEW_MS);
    HANDS_ON.forEach((name) => window.addEventListener(name, letGo, { passive: true }));
    watch.observe(document.body);
    return letGo;
  }, [waitingCode]);

  // After joining or leaving, the control that was used is gone: the card
  // itself takes the focus, so a keyboard or a screen reader stays here.
  useEffect(() => {
    if (!wantFocus.current) return;
    wantFocus.current = false;
    rootRef.current?.focus?.();
  }, [link]);

  // The link was not there when something was tried: a counselor removed them,
  // or they left in another tab.
  const gone = useCallback(() => {
    reads.current += 1;          // a read still on its way is older than this
    wantFocus.current = true;
    setLink(null);
    setNotice("You are no longer linked to a school, so no counselor can see your record. A counselor may have removed you from theirs.");
  }, []);

  // Read the link again after a change. Only the newest read counts, and one
  // that overlapped a save of the switches may be older than that save, so it
  // brings the requests and leaves the switches as they are.
  const refresh = useCallback(async () => {
    const mine = ++reads.current;
    const writes = shareWrites.current;
    try {
      const value = await api.mySchool();
      if (!alive.current || mine !== reads.current) return;
      if (!value) { gone(); return; }
      setLink((prev) => (prev && writes !== shareWrites.current ? { ...value, sharing: prev.sharing } : value));
    } catch { /* what is on screen stays */ }
  }, [api, gone]);

  const joined = (value) => {
    if (!value) { load(); return; }
    reads.current += 1;
    wantFocus.current = true;
    setNotice("");
    setWaitingCode("");
    setLink(value);
    announce(`You joined ${value.school.name}. Your counselor can now see ${lowerFirst(ALWAYS_SHARED)}. Nothing else is shared until you turn it on.`);
    toast(`You joined ${value.school.name}`);
  };

  const left = (name) => {
    reads.current += 1;          // so a read sent before leaving cannot bring the school back on screen
    wantFocus.current = true;
    setNotice("");
    setLink(null);
    announce(`You left ${name}. Nothing of yours is shared with a counselor now.`);
    toast(`You left ${name}`);
  };

  return (
    // The scroll margin leaves the card's own heading, which sits above this, on screen.
    <div ref={rootRef} tabIndex={-1} className={FOCUS_CLASS} style={{ borderRadius: 8, scrollMarginTop: 96 }}>
      <style>{CSS}</style>
      <p aria-live="polite" style={SR_ONLY}>{said.text}{said.n % 2 ? "\u00a0" : ""}</p>

      {phase === "loading" && <Skeleton />}

      {phase === "failed" && (
        <div>
          <p style={{ ...BODY, color: TEXT_MUTED }}>Couldn't check your school link right now.</p>
          <Button onClick={() => { setPhase("loading"); load(); }} style={{ marginTop: "0.75rem" }}>Try again</Button>
        </div>
      )}

      {phase === "ready" && (
        <>
          {notice && (
            <Notice tone="warn" onDismiss={() => setNotice("")} style={{ marginBottom: "1rem" }}>{notice}</Notice>
          )}
          {link ? (
            <Linked api={api} link={link} onLink={setLink} onShareWrite={() => { shareWrites.current += 1; }}
              onLeft={left} onGone={gone} refresh={refresh} announce={announce} toast={toast}
              waitingCode={waitingCode} onDropCode={() => setWaitingCode("")} />
          ) : (
            <JoinForm api={api} initialCode={waitingCode} onJoined={joined} onAlreadyLinked={load} />
          )}
        </>
      )}
    </div>
  );
}
