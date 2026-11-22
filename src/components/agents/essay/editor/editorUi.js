import { hexToRgbString, lighten, readableOn } from "../../../../lib/theme.js";
import { budgetOf } from "../../outreach/options.js";

// Small shared bits for Quill's editor (the page, the paper, the review view
// and their parts), on top of the app's kit (components/ui) and the Agents
// pieces that are not one agent's alone (MascotSays, Sheet, BoardToast).
//
// Nothing here reads, checks or changes the words of an essay. It lays them
// out, and marks the passages a review quoted.

/** The mascot key for Quill (components/agents/Mascot.jsx). */
export const QUILL = "quill";

/** Quill's desk: the ideas board and the list of essays. */
export const HOME_PATH = "/agents/essay";

export { budgetOf };

// The lengths the database and the backend check (20261011_agents_essay.sql,
// service.create_essay, src/lib/essay.js), so the page can say them first.
export const TITLE_MAX = 120;
export const PROMPT_MIN = 10;
export const PROMPT_MAX = 1500;
export const ANSWER_MAX = 800;      // a student's own answer to one note

// ── The few rules inline styles cannot express ───────────────────────────────
// The essay's type (shared by the textarea and the read-only copy of a
// version, so a version reads the way it was written), the paper's focus
// edge, and the highlights of a review. Injected once, like the kit's.

export const TYPE_CLASS = "qe-type";
export const TEXT_CLASS = "qe-text";
export const PAPER_CLASS = "qe-paper";
export const MARK_CLASS = "qe-mark";
export const CHIP_CLASS = "qe-chip";
export const ROW_CLASS = "qe-row";

// The measure: Raleway at this size and weight runs about 0.46em a character
// in English prose (measured in the browser), so 31.5em is a line of about 68
// characters. The text is centred on its paper with that as its widest.
//
// A highlight is told apart without colour: an underline (dashed for a
// passage that could go), a numbered chip in front, and a thicker line when it
// is the one chosen. The tint is extra. index.css holds every textarea at
// 16px on a phone (no iOS zoom), so the read-only copy follows it there.
const EDITOR_CSS = `
.${TYPE_CLASS} { font-size: 1.125rem; line-height: 1.75; font-weight: 500; letter-spacing: 0; color: #141413;
  max-width: 31.5em; margin-left: auto; margin-right: auto; }
@media (max-width: 768px) { .${TYPE_CLASS} { font-size: 16px; } }
.${TEXT_CLASS} { display: block; width: 100%; box-sizing: border-box; margin-top: 0; margin-bottom: 0; padding: 0; border: 0; border-radius: 4px;
  resize: none; overflow: hidden; background: transparent; outline: none; }
.${TEXT_CLASS}::placeholder { color: #494742; opacity: 1; }
.${TEXT_CLASS}:focus-visible { outline: 3px solid var(--ag-ring, #1d4ed8); outline-offset: 8px; }
.${PAPER_CLASS} { transition: border-color 0.15s, box-shadow 0.15s; }
@supports selector(:has(*)) {
  .${TEXT_CLASS}:focus-visible { outline: none; }
  .${PAPER_CLASS}:has(.${TEXT_CLASS}:focus-visible) { border-color: var(--ag-ring, #1d4ed8); box-shadow: 0 0 0 1px var(--ag-ring, #1d4ed8); }
}
.${MARK_CLASS} { background: var(--qe-tint, #dbe4fb); color: inherit; border-radius: 3px; padding: 2px 0; cursor: pointer;
  text-decoration-line: underline; text-decoration-style: solid; text-decoration-color: var(--qe-line, #1d4ed8);
  text-decoration-thickness: 2px; text-underline-offset: 4px;
  -webkit-box-decoration-break: clone; box-decoration-break: clone; }
.${MARK_CLASS}[data-cut] { text-decoration-style: dashed; }
.${MARK_CLASS}[data-quiet] { background: transparent; text-decoration-color: #8a857c; }
.${MARK_CLASS}[data-on] { background: var(--qe-tint-on, #c5d3f8); text-decoration-color: var(--qe-line-on, #1d4ed8);
  text-decoration-thickness: 4px; }
.${MARK_CLASS}:focus-visible { outline: 3px solid var(--ag-ring, #1d4ed8); outline-offset: 2px; }
.${MARK_CLASS}:focus:not(:focus-visible) { outline: none; }
.${CHIP_CLASS} { display: inline-block; margin: 0 5px 0 1px; padding: 0 6px; border-radius: 6px; font-size: 0.9rem;
  font-weight: 800; line-height: 1.35; vertical-align: 0.08em; white-space: nowrap; font-variant-numeric: tabular-nums;
  background: var(--qe-chip, #1d4ed8); color: #ffffff; }
.${MARK_CLASS}[data-quiet] .${CHIP_CLASS} { background: #efedea; color: #3d3d3a; }
.${ROW_CLASS}:hover { background: rgba(20,20,19,0.04); }
@media (prefers-reduced-motion: reduce) { .${PAPER_CLASS} { transition: none; } }
`;
if (typeof document !== "undefined" && !document.querySelector("style[data-quill-editor]")) {
  const el = document.createElement("style");
  el.dataset.quillEditor = "";
  el.textContent = EDITOR_CSS;
  document.head.appendChild(el);
}

/** The highlight colours for the student's accent, as CSS variables for the
 *  element that holds the marks. The same recipe as Beaker's claim editor:
 *  a real tint (ink text stays 11:1 or better on it) and an underline in the
 *  accent at 3:1 or better on that tint. */
export function markVars(ink) {
  const rest = lighten(ink.accent, 0.72);
  const on = lighten(ink.accent, 0.6);
  return {
    "--qe-tint": rest,
    "--qe-tint-on": on,
    "--qe-line": readableOn(ink.accent, rest, 3),
    "--qe-line-on": readableOn(ink.accent, on, 3),
    "--qe-chip": ink.button.bg,
  };
}

// ── Motion ───────────────────────────────────────────────────────────────────

export function reducedMotion() {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}

/** "smooth", or "auto" for a student who asked for less motion. */
export const scrollBehavior = () => (reducedMotion() ? "auto" : "smooth");

/** A short pulse that says "this one": a ring that fades for a card, a brief
 *  darkening for a highlight in the text. Nothing under reduced motion. */
export function pulse(el, accent, { mark = false } = {}) {
  if (!el || typeof el.animate !== "function" || reducedMotion()) return;
  try {
    if (mark) {
      el.animate([{ filter: "none" }, { filter: "brightness(0.82)" }, { filter: "none" }],
        { duration: 450, iterations: 3, easing: "ease-in-out" });
      return;
    }
    const rgb = hexToRgbString(accent || "#1d4ed8");
    el.animate([{ boxShadow: `0 0 0 0 rgba(${rgb}, 0.55)` }, { boxShadow: `0 0 0 10px rgba(${rgb}, 0)` }],
      { duration: 900, iterations: 2, easing: "ease-out" });
  } catch { /* an old browser: the chosen one is still marked */ }
}

/**
 * Bring `el` into view inside its own scroll box (the rail beside the text).
 * Nothing moves when it is already in full view. Otherwise the box scrolls to
 * put it at the top, which is the part of a sticky rail that is on screen
 * even before the rail has stuck. Only when that still leaves it below the
 * screen (the last cards of a rail that hangs below the fold) does the page
 * come down, and only as far as it takes.
 */
export function scrollInside(box, el) {
  if (!box || !el) return;
  const b = box.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const height = window.innerHeight || 0;
  const shown = r.top >= Math.max(b.top, 0) && r.bottom <= Math.min(b.bottom, height);
  if (shown) return;
  const behavior = scrollBehavior();
  const room = box.scrollHeight - box.clientHeight - box.scrollTop;
  const by = Math.max(-box.scrollTop, Math.min(r.top - b.top - 8, room));
  if (by) box.scrollBy?.({ top: by, behavior });
  const topAfter = r.top - by;
  const lowest = height - 160;
  if (topAfter > lowest && b.top > 24) {
    try { window.scrollBy({ top: Math.min(topAfter - lowest, b.top - 24), behavior }); } catch { /* old browsers */ }
  }
}

// ── Words ────────────────────────────────────────────────────────────────────

/** "1 word", "3 words". */
export function plural(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/** Text short enough for a toast or a list row. */
export function short(text, n = 60) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  return s.length > n ? `${s.slice(0, n - 3).trimEnd()}...` : s;
}

export const capital = (s) => (s ? s[0].toUpperCase() + s.slice(1) : "");

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayNumber = (d) => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);

/** When a version was saved or a review made, in the student's own day:
 *  "today at 3:40 PM", "yesterday at 9:05 AM", "Oct 9 at 3:40 PM" (with the
 *  year when it is not this one), or "" when the stamp cannot be read. These
 *  are timestamps, not calendar dates, so new Date() reads them correctly. */
export function whenLabel(raw, now = new Date()) {
  const d = raw ? new Date(raw) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  let time = "";
  try { time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }); } catch { time = ""; }
  const at = time ? ` at ${time}` : "";
  const days = dayNumber(now) - dayNumber(d);
  if (days === 0) return `today${at}`;
  if (days === 1) return `yesterday${at}`;
  const day = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return `${d.getFullYear() === now.getFullYear() ? day : `${day}, ${d.getFullYear()}`}${at}`;
}

/** Rows newest first by created_at (a new array). */
export function newestFirst(rows) {
  const stamp = (r) => { const t = Date.parse(r?.created_at || ""); return Number.isNaN(t) ? 0 : t; };
  return (Array.isArray(rows) ? rows : []).filter((r) => r && r.id).sort((a, b) => stamp(b) - stamp(a));
}
