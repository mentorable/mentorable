import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import Spinner from "../common/Spinner.jsx";
import Sheet from "../agents/outreach/Sheet.jsx";
import { PixelArrow, PixelStamp } from "../ui/PixelIcons.jsx";
import { Button, Card, Heading, Notice, SR_ONLY, StampTile } from "../ui/kit.jsx";
import {
  AMBER_BG, AMBER_TEXT, BORDER, FOCUS_CLASS, RADIUS, SANS, SURFACE, TEXT, TEXT_MID, TEXT_MUTED, WHITE, useAgentInk,
} from "../ui/tokens.js";

// The counselor pages' shared pieces: their paths, the few rules inline
// styles cannot express (row hover, the skip link, what a printed page leaves
// out), the small parts every page repeats (a pill, the attention marks, the
// "Not shared" note, a confirm sheet) and how a date or a grade is written.
//
// A counselor sees only what a linked student chose to share. Nothing here
// reads data: it lays out what the SQL functions returned.

// ─── Paths ────────────────────────────────────────────────────────────────────

export const ENTRY_PATH = "/counselor";
export const SCHEDULE_PATH = "/counselor/schedule";
export const studentPath = (id) => `/counselor/students/${encodeURIComponent(id)}`;
export const recordPath = (id) => `${studentPath(id)}/record`;

// A counselor page to come back to after signing in. Only ever a path under
// /counselor/ made of plain characters, so a link can never send them elsewhere.
const NEXT_OK = /^\/counselor\/[A-Za-z0-9/_-]{1,120}$/;
const safeNext = (next) => (typeof next === "string" && NEXT_OK.test(next) && !next.includes("//") ? next : null);

/** The entry page, remembering the counselor page that sent them there. */
export function entryPath(next) {
  const to = safeNext(next);
  return to ? `${ENTRY_PATH}?next=${encodeURIComponent(to)}` : ENTRY_PATH;
}

/** The page to return to after signing in, from this page's address, or null. */
export function nextFromUrl() {
  try {
    return safeNext(new URLSearchParams(window.location.search).get("next") || "");
  } catch {
    return null;
  }
}

/** An in-app link: a real href, so it opens in a new tab like any link, that
 *  changes page without a reload on a plain click. */
export function linkProps(navigate, to) {
  return {
    href: to,
    onClick: (e) => {
      if (!navigate || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      navigate(to);
    },
  };
}

// ─── Rules inline styles cannot express ───────────────────────────────────────

export const SHELL_CLASS = "co-shell";
export const BAR_CLASS = "co-bar";
export const MAIN_CLASS = "co-main";
export const NAV_CLASS = "co-nav";
export const ROW_CLASS = "co-row";
export const SKIP_CLASS = "co-skip";
export const CLAMP_CLASS = "co-clamp";
/** Anything with this class is left off a printed page (bars, buttons, toasts). */
export const NO_PRINT = "co-noprint";
export const SKEL_CLASS = "co-skel";

const COUNSELOR_CSS = `
.${SKIP_CLASS} { position: absolute; left: 12px; top: -80px; z-index: 500; padding: 12px 16px; border-radius: 12px;
  background: ${WHITE}; color: ${TEXT}; border: 1.5px solid ${BORDER}; font-weight: 700; text-decoration: none; }
.${SKIP_CLASS}:focus { top: 8px; }
.${NAV_CLASS}:not([aria-current]):hover { background: rgba(20,20,19,0.05); }
.${ROW_CLASS} { transition: background 0.12s; }
.${ROW_CLASS}:hover, .${ROW_CLASS}:focus-within { background: ${SURFACE}; }
.${CLAMP_CLASS} { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.${SKEL_CLASS} { background: linear-gradient(90deg, #e3e0db 25%, #eeebe7 50%, #e3e0db 75%); background-size: 480px 100%;
  animation: co-shimmer 1.4s linear infinite; }
@keyframes co-shimmer { 0% { background-position: -480px 0; } 100% { background-position: 480px 0; } }
@media (prefers-reduced-motion: reduce) {
  .${ROW_CLASS} { transition: none; }
  .${SKEL_CLASS} { animation: none; }
}
@media print {
  html, body { background: #fff !important; }
  .${BAR_CLASS}, .${NO_PRINT}, .${SKIP_CLASS} { display: none !important; }
  .${SHELL_CLASS} { background: #fff !important; min-height: 0 !important; }
  .${MAIN_CLASS} { max-width: none !important; padding: 0 !important; margin: 0 !important; }
}
`;
if (typeof document !== "undefined" && !document.querySelector("style[data-counselor-ui]")) {
  const el = document.createElement("style");
  el.dataset.counselorUi = "";
  el.textContent = COUNSELOR_CSS;
  document.head.appendChild(el);
}

// ─── Words ────────────────────────────────────────────────────────────────────

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A timestamp, or a calendar date ("2026-03-14", read as that day here, not
 *  as midnight in London), as a Date. Null when it is neither. */
export function toDate(value) {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  const d = day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "Oct 3, 2026", or "" for no date. */
export function shortDate(value) {
  const d = toDate(value);
  return d ? `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}` : "";
}

/** "Mar 2026", or "". */
export function monthYear(value) {
  const d = toDate(value);
  return d ? `${MONTHS[d.getMonth()]} ${d.getFullYear()}` : "";
}

export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const wholeNumber = (v) => {
  const n = Number(v);
  return v !== null && v !== undefined && v !== "" && Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
};

/** "Grade 11, class of 2028", with whichever half is on file. */
export function gradeLine(student) {
  const grade = wholeNumber(student?.grade);
  const year = wholeNumber(student?.graduation_year);
  const parts = [];
  if (grade) parts.push(`Grade ${grade}`);
  if (year) parts.push(`${parts.length ? "class" : "Class"} of ${year}`);
  return parts.join(", ") || "Grade not on file";
}

/** The name to use in a sentence about a student. */
export function firstName(name) {
  const n = String(name || "").trim();
  if (!n || n === "Student") return "This student";
  return n.split(/\s+/)[0];
}

/** A join code in two groups of four, easier to read aloud. */
export const spacedCode = (code) => String(code || "").replace(/(.{4})(?=.)/g, "$1 ");

// ─── Copying ──────────────────────────────────────────────────────────────────

/** Put text on the clipboard. Resolves to whether it worked. */
export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* blocked or not allowed here: try the older way */ }
  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    el.remove();
    return ok;
  } catch {
    return false;
  }
}

/** `[copied, copy]`: `copy(key, text)` copies and resolves to whether it
 *  worked; `copied` is that key for a couple of seconds after, for a "Copied"
 *  label. */
export function useCopy() {
  const [copied, setCopied] = useState(null);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = useCallback(async (key, text) => {
    const ok = await copyText(text);
    clearTimeout(timer.current);
    setCopied(ok ? key : null);
    if (ok) timer.current = setTimeout(() => setCopied(null), 2200);
    return ok;
  }, []);
  return [copied, copy];
}

// ─── Small parts ──────────────────────────────────────────────────────────────

/** A join code as it is shown: spaced for the eye, letter by letter for a
 *  screen reader. Selecting it selects the whole code. */
export function JoinCode({ code, size = "1.1rem", color = TEXT }) {
  const c = String(code || "");
  return (
    <span style={{ fontFamily: SANS, fontSize: size, fontWeight: 800, color, letterSpacing: "0.08em",
      fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
      <span aria-hidden="true" style={{ userSelect: "all" }}>{spacedCode(c)}</span>
      <span style={SR_ONLY}>{c.split("").join(" ")}</span>
    </span>
  );
}

/** A small label. tone: "neutral", "amber" (waiting, behind) or "accent". */
export function Pill({ tone = "neutral", children, style }) {
  const ink = useAgentInk();
  const look = tone === "amber" ? { background: AMBER_BG, color: AMBER_TEXT, border: "1px solid #f3d9a4" }
    : tone === "accent" ? { background: ink.softer, color: ink.onSoft, border: `1px solid ${ink.soft}` }
    : { background: SURFACE, color: TEXT_MID, border: `1px solid ${BORDER}` };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0, borderRadius: RADIUS.pill,
      padding: "2px 10px", fontFamily: SANS, fontSize: "0.9rem", fontWeight: 700, lineHeight: 1.4, whiteSpace: "nowrap",
      ...look, ...style }}>
      {children}
    </span>
  );
}

const MARK_STAMP = { request: "letter" };

/** Why a student may need the counselor: each mark an icon and its words, in
 *  amber. `marks` is attention(row)'s list. Nothing when it is empty. */
export function AttentionMarks({ marks, style }) {
  if (!marks?.length) return null;
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 4, ...style }}>
      {marks.map((m) => (
        <li key={m.key} style={{ display: "flex", alignItems: "flex-start", gap: 6, fontFamily: SANS, fontSize: "0.92rem",
          fontWeight: 700, color: AMBER_TEXT, lineHeight: 1.35 }}>
          <span aria-hidden="true" style={{ display: "flex", marginTop: 2 }}>
            <PixelStamp kind={Object.prototype.hasOwnProperty.call(MARK_STAMP, m.key) ? MARK_STAMP[m.key] : "clock"} size={16} />
          </span>
          <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{m.label}</span>
        </li>
      ))}
    </ul>
  );
}

/** A section the student keeps to themselves: said quietly, with why. Never
 *  an error. `who` is the name to use in the sentence. */
export function NotShared({ who = "This student", style }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12, background: SURFACE, border: `1px solid ${BORDER}`,
      borderRadius: RADIUS.control, padding: "12px 14px", fontFamily: SANS, ...style }}>
      <span aria-hidden="true" style={{ display: "flex", marginTop: 4, color: TEXT_MUTED }}>
        <PixelStamp kind="lock" size={16} />
      </span>
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: TEXT_MID, lineHeight: 1.4 }}>Not shared</p>
        <p style={{ margin: "2px 0 0", fontSize: "0.95rem", fontWeight: 500, color: TEXT_MUTED, lineHeight: 1.5 }}>
          {who} has not shared this section. Each student chooses what their counselor sees, and can change it at any time.
        </p>
      </div>
    </div>
  );
}

/** The link back up a level, above a page's title. */
export function BackLink({ navigate, to, children }) {
  return (
    <a {...linkProps(navigate, to)} className={`${FOCUS_CLASS} ${NO_PRINT}`}
      style={{ minHeight: 44, display: "inline-flex", alignItems: "center", gap: 8, margin: "0 0 4px -8px", padding: "0 8px",
        borderRadius: 10, fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700, color: TEXT_MUTED, textDecoration: "none" }}>
      <PixelArrow size={16} style={{ transform: "scaleX(-1)" }} />
      {children}
    </a>
  );
}

/** One section of a student's page: a card with its pixel mark and heading. */
export function SectionCard({ id, title, stamp, aside, children, style }) {
  return (
    <Card as="section" aria-labelledby={id} style={{ padding: "1.1rem 1.2rem 1.25rem", ...style }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        {stamp && <StampTile kind={stamp} size={40} />}
        <Heading id={id} style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{title}</Heading>
        {aside}
      </div>
      {children}
    </Card>
  );
}

/** While a page's data is on its way. */
export function LoadingBlock({ label = "Loading" }) {
  const ink = useAgentInk();
  return (
    <div role="status" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, padding: "4rem 0",
      fontFamily: SANS, fontSize: "1rem", fontWeight: 600, color: TEXT_MUTED }}>
      <Spinner size={20} color={ink.text} />
      {label}
    </div>
  );
}

/** A page that could not load, or a student who is not there: what happened,
 *  and what to do next. `children` are its buttons. */
export function StateCard({ title, children, actions, alert = false }) {
  return (
    <Card role={alert ? "alert" : undefined} style={{ maxWidth: 560, padding: "1.4rem 1.4rem 1.5rem" }}>
      <Heading>{title}</Heading>
      <div style={{ margin: "8px 0 0", fontFamily: SANS, fontSize: "1rem", color: TEXT_MID, lineHeight: 1.6 }}>{children}</div>
      {actions && <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 18 }}>{actions}</div>}
    </Card>
  );
}

/** A yes-or-no sheet for something that cannot be quietly undone. It stays
 *  open, saying why, when the action fails. */
export function ConfirmSheet({
  open, titleId, title, children, confirmLabel, cancelLabel = "Cancel", kind = "primary", busy = false, error = "",
  onConfirm, onClose,
}) {
  return (
    <AnimatePresence>
      {open && (
        <Sheet key={titleId} labelledBy={titleId} onClose={onClose} locked={busy} width={460}>
          <Heading id={titleId}>{title}</Heading>
          <div style={{ margin: "10px 0 0", fontFamily: SANS, fontSize: "1rem", color: TEXT_MID, lineHeight: 1.6 }}>
            {children}
          </div>
          {error && <Notice tone="error" style={{ marginTop: 14 }}>{error}</Notice>}
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
            <Button kind="secondary" onClick={onClose} disabled={busy} data-autofocus>{cancelLabel}</Button>
            <Button kind={kind} onClick={onConfirm} busy={busy}>{confirmLabel}</Button>
          </div>
        </Sheet>
      )}
    </AnimatePresence>
  );
}
