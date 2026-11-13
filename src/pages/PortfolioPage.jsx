import { Children, useState, useEffect, useRef, useId } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { supabase } from "../lib/supabase.js";
import { requireUser } from "../lib/auth.js";
import { fetchUsage, LIMITS } from "../lib/usage.js";
import LimitModal from "../components/common/LimitModal.jsx";
import Spinner from "../components/common/Spinner.jsx";
import { SIDEBAR_WIDTH } from "../components/common/Sidebar.jsx";
import { useIsMobile } from "../hooks/useIsMobile.js";
import {
  fetchRecord, addRow, updateRow, deleteRow, saveGpa, saveContact,
  addExtracted, generateResume,
} from "../lib/portfolio.js";
import {
  BORDER, DANGER, FOCUS_CLASS, RADIUS, SANS, SURFACE, TEXT, TEXT_MID, TEXT_MUTED, WHITE, useAgentInk,
} from "../components/ui/tokens.js";
import {
  Button, Card, ChoiceChips, FieldLabel, Heading, INPUT_CLASS, LINK_CLASS, Notice, PageHeader, RemoveButton, SR_ONLY, Sheet,
  StampTile, Tag, Tip, Toast, inputStyle, pageStyle, tabPanelProps, textOnPage,
} from "../components/ui/kit.jsx";
import { PixelStamp } from "../components/ui/PixelIcons.jsx";

// The Portfolio: the student's record (grades, scores, classes, activities,
// awards) and the resume export. Built on the shared kit: white cards with a
// warm 1px border, flat buttons, a pixel mark per section, and the guide
// line for nudges and empty sections.
//
// Every edit saves itself. Each section's header says when it is saving and
// when it has saved, and a failed write raises a toast with Retry instead of
// vanishing into the console. Remove happens at once with Undo, like College
// List, rather than behind a confirm.

const LANGGRAPH_URL = import.meta.env.VITE_LANGGRAPH_CHAT_URL;

const COURSE_LEVELS = [
  { value: "ap",              label: "AP" },
  { value: "ib",              label: "IB" },
  { value: "honors",          label: "Honors" },
  { value: "dual_enrollment", label: "Dual enrollment" },
  { value: "regular",         label: "Regular" },
];

const AWARD_LEVELS = [
  { value: "school",        label: "School" },
  { value: "regional",      label: "Regional" },
  { value: "state",         label: "State" },
  { value: "national",      label: "National" },
  { value: "international", label: "International" },
];

const GPA_SCALES = [
  { key: "4.0",      label: "4.0" },
  { key: "5.0",      label: "5.0" },
  { key: "100",      label: "100 point" },
  { key: "other",    label: "Other" },
  { key: "not_used", label: "Not used" },
];

const TIMINGS = [
  { key: "school_year", label: "School year" },
  { key: "summer",      label: "Summer" },
  { key: "all_year",    label: "All year" },
];

const GRADES = [9, 10, 11, 12];
const GRADE_OPTIONS = GRADES.map((g) => ({ value: String(g), label: `Grade ${g}` }));
const GRADE_CHIPS = GRADES.map((g) => ({ key: g, label: String(g) }));

const TEST_TYPES = [
  { value: "sat", label: "SAT" }, { value: "act", label: "ACT" },
  { value: "psat", label: "PSAT" }, { value: "ap", label: "AP" },
];

/** What each test's numbers can be. A value outside is never blocked, only
 *  flagged, since a student may know something this table does not. */
const TEST_RANGES = {
  sat:  { total: { min: 400, max: 1600, hint: "SAT totals run from 400 to 1600." },
          section: { min: 200, max: 800, hint: "Each SAT section runs from 200 to 800." }, ph: "e.g. 1450", sph: "e.g. 720" },
  psat: { total: { min: 320, max: 1520, hint: "PSAT totals run from 320 to 1520." },
          section: { min: 160, max: 760, hint: "Each PSAT section runs from 160 to 760." }, ph: "e.g. 1200", sph: "e.g. 600" },
  act:  { total: { min: 1, max: 36, hint: "ACT composites run from 1 to 36." }, ph: "e.g. 30" },
  ap:   { total: { min: 1, max: 5, hint: "AP scores run from 1 to 5." }, ph: "e.g. 4" },
};

const GPA_RANGES = {
  "4.0": { min: 0, max: 4, hint: "Unweighted GPAs on a 4.0 scale usually top out at 4.0. A higher number is often your weighted GPA." },
  "5.0": { min: 0, max: 5, hint: "On a 5.0 scale this usually tops out at 5.0." },
  "100": { min: 0, max: 100, hint: "On a 100 point scale this runs from 0 to 100." },
};

/** Weighted GPAs run past the scale, so only the 4.0 scale has a usual top. */
const WEIGHTED_RANGES = {
  "4.0": { min: 0, max: 5, hint: "Weighted GPAs on a 4.0 scale usually top out around 5.0." },
};
const WEIGHTED_FLOOR = { min: 0, max: Infinity, hint: "A GPA can't be below 0." };

const UPLOAD_TYPES = ["pdf", "docx", "txt", "md"];

const THIS_YEAR = new Date().getFullYear();
const YEAR_RANGE = { min: 2000, max: THIS_YEAR + 1, hint: "Use the year you received it, like 2025." };
const HOURS_RANGE = { min: 0, max: 168, hint: "Use the hours in a typical week, up to 168." };
const WEEKS_RANGE = { min: 0, max: 52, hint: "Use the weeks in a year you spend on it, up to 52." };

const EMPTY_CONTACT = { email: "", phone: "", location: "", links: [] };

const labelFor = (opts, v) => opts.find((o) => o.value === v)?.label || null;

/** The stored scale as one of the chip keys. Older rows hold a bare number. */
function normScale(s) {
  if (s == null || s === "") return null;
  const str = String(s);
  return { "4": "4.0", "4.0": "4.0", "5": "5.0", "5.0": "5.0", "100": "100" }[str] || str;
}

/** A likely scale for a GPA with none set, offered as a suggestion only. */
function guessScale(gpa) {
  const n = Number(gpa);
  if (gpa === "" || gpa == null || !Number.isFinite(n) || n <= 0) return null;
  if (n <= 4) return "4.0";
  if (n <= 5) return "5.0";
  if (n >= 50 && n <= 100) return "100";
  return null;
}

/** What a row is called in "Removed X" and "Couldn't save X". */
function rowName(listKey, r) {
  if (listKey === "scores") {
    const t = (r.test_type || "").toLowerCase();
    if (t === "ap") return r.subject ? `AP ${r.subject}` : "an AP score";
    return t ? `your ${t.toUpperCase()} score` : "a score";
  }
  if (listKey === "courses") return r.name || "a class";
  if (listKey === "activities") return r.title || "an activity";
  return r.title || "an award";
}

// ─── Small shared UI ──────────────────────────────────────────────────────────

/** A labelled field: the kit's label tied to its control by id. `children`
 *  is a function of that id. */
function Field({ label, style, children }) {
  const id = useId();
  return (
    <div style={{ minWidth: 0, overflowWrap: "break-word", ...style }}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {children(id)}
    </div>
  );
}

/** A row of chips is a group, not one control: the visible label is the
 *  kit's, and the group carries the same words for screen readers. */
function ChipField({ label, children, style }) {
  return (
    <div style={style}>
      <div aria-hidden="true"><FieldLabel>{label}</FieldLabel></div>
      {children}
    </div>
  );
}

// Text boxes and dropdowns share one height, so the labels of a row of fields
// line up (a native select otherwise renders a few pixels off an input). The
// kit's own control height.
const CONTROL_HEIGHT = inputStyle.minHeight;

function Input({ value, onChange, style, ...rest }) {
  return (
    <input value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={INPUT_CLASS}
      style={{ ...inputStyle, height: CONTROL_HEIGHT, minHeight: 0, paddingTop: 0, paddingBottom: 0, ...style }} {...rest} />
  );
}

function Select({ value, onChange, options, placeholder = "Not set", ...rest }) {
  return (
    <select value={value || ""} onChange={(e) => onChange(e.target.value || null)} className={INPUT_CLASS}
      style={{ ...inputStyle, height: CONTROL_HEIGHT, minHeight: 0, paddingTop: 0, paddingBottom: 0, cursor: "pointer" }} {...rest}>
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

const fieldHint = { fontFamily: SANS, fontSize: "0.9rem", fontWeight: 600, color: TEXT_MID, lineHeight: 1.45, margin: "6px 0 0" };

/** A number field that keeps what was typed. A number (or a cleared field)
 *  is saved as it is typed; anything else is held back, so NaN is never
 *  written. On blur a hint says what the field expects, without blocking. */
function NumberInput({ id, value, onCommit, onBlur, range, decimal, ...rest }) {
  const hintId = useId();
  const [draft, setDraft] = useState(value ?? "");
  const [hint, setHint] = useState(null);
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setDraft(value ?? ""); }, [value]);

  const parse = (s) => {
    const t = String(s ?? "").trim();
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : NaN;
  };
  const check = (n) => {
    if (Number.isNaN(n)) return "Numbers only, please.";
    if (n != null && range && (n < range.min || n > range.max)) return range.hint;
    return null;
  };

  return (
    <>
      <Input id={id} value={draft} inputMode={decimal ? "decimal" : "numeric"} aria-describedby={hintId}
        onFocus={() => { focused.current = true; }}
        onChange={(v) => {
          setDraft(v);
          const n = parse(v);
          if (!Number.isNaN(n)) onCommit(n);
          if (hint && !check(n)) setHint(null);
        }}
        onBlur={(e) => { focused.current = false; setHint(check(parse(draft))); onBlur?.(e); }}
        {...rest} />
      <p id={hintId} aria-live="polite" style={hint ? fieldHint : { margin: 0 }}>{hint}</p>
    </>
  );
}

const PencilIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);
const PlusIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

/** Opens and closes an item's editor: "Edit", then "Done". The kit's muted
 *  quiet button (TEXT_MID, the accent on hover and focus) rather than the
 *  accent at rest: a long list has one per row, and eleven accent links down
 *  the edge outshout the record itself. Line icons, like Add, Export and
 *  Remove beside it. */
function EditToggle({ open, onClick, name, controls }) {
  return (
    <Button kind="quiet" tone="muted" onClick={onClick} aria-expanded={open} aria-controls={controls}
      aria-label={open ? `Done editing ${name}` : `Edit ${name}`}
      style={{ flexShrink: 0, padding: "0 10px", marginRight: -10 }}>
      {open ? <CheckIcon /> : <PencilIcon />}
      {open ? "Done" : "Edit"}
    </Button>
  );
}

const SAVE_TEXT = { saving: "Saving…", saved: "Saved", error: "Not saved" };

/** The quiet save line. The section header's copy is also the one screen
 *  readers hear (only "Saved" and "Not saved", so a pause in typing is not
 *  read out as "Saving" every time); the copy at an open item is visual only. */
function SaveStatus({ state, announce = true }) {
  return (
    <>
      {state && (
        <span aria-hidden="true" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: SANS,
          fontSize: "0.95rem", fontWeight: 600, color: state === "error" ? DANGER : TEXT_MUTED, whiteSpace: "nowrap" }}>
          {state === "saved" && <PixelStamp kind="check" size={16} />}
          {SAVE_TEXT[state]}
        </span>
      )}
      {announce && (
        <span role="status" style={SR_ONLY}>{state === "saved" || state === "error" ? SAVE_TEXT[state] : ""}</span>
      )}
    </>
  );
}

const hintText = { fontFamily: SANS, fontSize: "1rem", fontWeight: 500, color: TEXT_MUTED, lineHeight: 1.55, maxWidth: "62ch",
  textWrap: "pretty" };

/** A record section: the kit card with a pixel mark, the title, count and
 *  save status, and a line of guidance under it. Its action sits on the
 *  right on a wide screen; on a phone it goes full width at the bottom of
 *  the card, in thumb reach and right under the row it adds. */
function SectionCard({ id, title, stamp, hint, count, status, saves = true, action, isMobile, children }) {
  const headId = useId();
  const hasBody = Children.toArray(children).length > 0;
  const actionBelow = Boolean(action) && isMobile;
  return (
    <Card as="section" id={id ? `sec-${id}` : undefined} tabIndex={id ? -1 : undefined} aria-labelledby={headId}
      className={FOCUS_CLASS} style={{ padding: "1.3rem 1.3rem 1.4rem", marginBottom: "1.25rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
        marginBottom: hint ? 8 : 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flexWrap: "wrap", flex: "1 1 240px" }}>
          {/* A long title wraps beside its mark instead of dropping under it. */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            <StampTile kind={stamp} />
            <Heading id={headId} style={{ minWidth: 0 }}>
              {title}
              {count != null && count > 0 && (
                <span style={{ fontWeight: 700, fontSize: "1rem", color: TEXT_MUTED, marginLeft: 8,
                  fontVariantNumeric: "tabular-nums" }}>{count}</span>
              )}
            </Heading>
          </div>
          {saves && <SaveStatus state={status} />}
        </div>
        {!actionBelow && action}
      </div>
      {hint && <p style={{ ...hintText, margin: hasBody || actionBelow ? "0 0 16px" : 0 }}>{hint}</p>}
      {children}
      {actionBelow && <div style={{ display: "grid", marginTop: hasBody ? 6 : 0 }}>{action}</div>}
    </Card>
  );
}

function AddButton({ onClick, children, busy }) {
  return (
    <Button kind="secondary" onClick={onClick} busy={busy}>
      {!busy && <PlusIcon />}
      {children}
    </Button>
  );
}

/** An empty section: one plain line saying what goes here, as College List's
 *  empty groups do, rather than a card inside the card. It wraps like the
 *  section hint above it ("pretty", the full 62ch measure); "balance" made it
 *  a narrow block that read as a separate element. */
function EmptyNote({ children }) {
  return (
    <p style={{ fontFamily: SANS, fontSize: "1rem", fontWeight: 600, color: TEXT_MUTED, lineHeight: 1.55, margin: 0,
      maxWidth: "62ch", textWrap: "pretty" }}>
      {children}
    </p>
  );
}

const itemName = { fontFamily: SANS, fontWeight: 700, fontSize: "1rem", color: TEXT, minWidth: 0, overflowWrap: "anywhere" };
const itemMeta = { display: "block", fontFamily: SANS, fontSize: "0.95rem", fontWeight: 600, lineHeight: 1.45,
  overflowWrap: "anywhere", fontVariantNumeric: "tabular-nums" };

/** One item in any record list (a score, a class, an activity, an award):
 *  a line that reads as the record (its name and a meta line) with Edit,
 *  and an editor under it with the item's fields, the save line and Remove.
 *  Every list uses this, so Edit, Done and Remove sit in the same places.
 *  `value` is a number read down the right edge (a test score), so a list
 *  of scores scans like a transcript. `children` go under the meta line (an
 *  activity's description); `editor` is the fields. A new item opens on its own (`startOpen`). */
function RecordLine({ id, title, meta, metaMuted, value, name, startOpen, request, status, onRemove, editor, children }) {
  const reduce = useReducedMotion();
  const isMobile = useIsMobile();
  const editId = useId();
  const rowRef = useRef(null);
  const [open, setOpen] = useState(!!startOpen);

  // The read-back's "Set the level" and the like open this row and put the
  // caret in the missing field. `request.n` changes on every press, so a
  // second press on the same row works too.
  const focusField = useRef(null);
  useEffect(() => {
    if (!request) return;
    focusField.current = request.field || "first";
    setOpen(true);
  }, [request?.n]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open || !focusField.current || !rowRef.current) return;
    const f = focusField.current;
    focusField.current = null;
    const el = rowRef.current.querySelector(f === "first" ? "[data-first]" : `[data-field="${f}"]`)
      || rowRef.current.querySelector("[data-first]");
    if (!el) return;
    el.focus({ preventScroll: true });
    rowRef.current.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
  });

  const hasValue = value != null && value !== "";
  // A wide screen keeps the score and Edit beside the whole entry. On a
  // phone they stay on the title's line and the meta runs the full width
  // under it, so "Reading and Writing 690 · Math 760" is one line, not three.
  const span = 1 + (meta ? 1 : 0) + (children ? 1 : 0);
  const side = isMobile ? { gridRow: 1 } : { gridRow: `1 / span ${span}`, alignSelf: children ? "start" : "center" };
  const below = isMobile ? { gridColumn: "1 / -1" } : { gridColumn: 1 };

  return (
    // One entry in a divided list: hairlines between entries, no box of its
    // own, so a section reads as one card, not a card of cards.
    <div ref={rowRef} data-row={id} tabIndex={-1} style={{ borderRadius: RADIUS.control, outlineOffset: 2 }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto auto", columnGap: 8, alignItems: "center",
        padding: "6px 0" }}>
        <span style={{ ...itemName, gridColumn: 1, gridRow: 1, alignSelf: "center" }}>{title}</span>
        {hasValue && (
          <span style={{ ...side, gridColumn: 2, fontFamily: SANS, fontWeight: 800, fontSize: "1.15rem", color: TEXT,
            fontVariantNumeric: "tabular-nums", paddingLeft: 4 }}>
            {value}
          </span>
        )}
        <span style={{ ...side, gridColumn: 3, display: "flex" }}>
          <EditToggle open={open} onClick={() => setOpen((o) => !o)} name={name} controls={editId} />
        </span>
        {meta && (
          <span style={{ ...itemMeta, ...below, gridRow: 2, color: metaMuted ? TEXT_MUTED : TEXT_MID, marginTop: isMobile ? -6 : 0 }}>
            {meta}
          </span>
        )}
        {children && <div style={{ ...below, gridRow: meta ? 3 : 2, minWidth: 0, paddingBottom: 4 }}>{children}</div>}
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div id={editId} initial={reduce ? false : { height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.22 }} style={{ overflow: "hidden" }}>
            <div style={{ padding: "16px 14px 8px", margin: "2px 0 12px", background: SURFACE, borderRadius: RADIUS.control }}>
              {editor}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 10,
                marginRight: -6, minHeight: 44 }}>
                <span><SaveStatus state={status} announce={false} /></span>
                <RemoveButton onClick={onRemove} name={name} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Entries with a hairline between each, none above the first or below the
 *  last: the section card is already the frame. */
function RecordList({ children }) {
  return (
    <div>
      {Children.toArray(children).map((c, i) => (
        <div key={c.key ?? i} style={i ? { borderTop: `1px solid ${BORDER}` } : undefined}>{c}</div>
      ))}
    </div>
  );
}

/** A row of fields that wraps as the card narrows. */
const fieldRow = { display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" };

// ─── Kept for ScorecardPage, which renders this beside its portfolio banner ───
export function LearnMore() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);
  return (
    <span ref={ref} style={{ position: "relative", display: "inline-flex", verticalAlign: "middle" }}>
      <button onClick={() => setOpen((o) => !o)} aria-label="What is the portfolio for?" className={FOCUS_CLASS}
        style={{ width: 24, height: 24, borderRadius: "50%", border: `1.5px solid ${TEXT_MUTED}`, background: WHITE,
          color: TEXT_MUTED, fontFamily: SANS, fontSize: "0.9rem", fontWeight: 800, cursor: "pointer",
          display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0, lineHeight: 1 }}>
        ?
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} transition={{ duration: 0.15 }}
            style={{ position: "absolute", top: 30, left: "50%", transform: "translateX(-50%)", zIndex: 50, width: 290,
              background: WHITE, border: `1px solid ${BORDER}`, borderRadius: RADIUS.control, padding: "12px 14px",
              boxShadow: "0 12px 32px rgba(20,20,19,0.12)" }}>
            <p style={{ fontFamily: SANS, fontSize: "0.95rem", fontWeight: 500, color: TEXT_MID, lineHeight: 1.55, margin: 0 }}>
              Your portfolio is the record Mentorable reasons from: your grades, scores, classes, activities and awards. The more of it is filled in, the more specific its advice can be.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}

// ─── Academics ────────────────────────────────────────────────────────────────

/** GPA saves itself like everything else: when a field loses focus, and as
 *  soon as a scale is picked. */
function GpaBlock({ profile, onSave, status }) {
  const isMobile = useIsMobile();
  const [vals, setVals] = useState(() => ({
    gpaUnweighted: profile.gpa_unweighted ?? "",
    gpaWeighted:   profile.gpa_weighted ?? "",
    gpaScale:      normScale(profile.gpa_scale),
  }));
  const valsRef = useRef(vals);
  valsRef.current = vals;
  const lastSaved = useRef(JSON.stringify(vals));

  const save = (next = {}) => {
    const v = { ...valsRef.current, ...next };
    const key = JSON.stringify(v);
    if (key === lastSaved.current) return;
    lastSaved.current = key;
    onSave(v).then((ok) => { if (!ok) lastSaved.current = null; });
  };
  const set = (k) => (val) => setVals((prev) => ({ ...prev, [k]: val ?? "" }));

  const notUsed = vals.gpaScale === "not_used";
  const guess = !vals.gpaScale ? guessScale(vals.gpaUnweighted) : null;
  const range = GPA_RANGES[vals.gpaScale];
  const weightedRange = WEIGHTED_RANGES[vals.gpaScale] || WEIGHTED_FLOOR;

  return (
    <SectionCard id="gpa" title="GPA" stamp="reportcard" status={status}
      hint="Admissions reads unweighted GPA first, alongside how hard your classes are.">
      {/* On a phone the five scales break 3 + 2 instead of 4 + a lone "Not used". */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ maxWidth: isMobile ? "16rem" : undefined }}>
          <ChoiceChips label="Scale" labelAbove options={GPA_SCALES} value={vals.gpaScale}
            onChange={(k) => { setVals((prev) => ({ ...prev, gpaScale: k })); save({ gpaScale: k }); }} />
        </div>
        {guess && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            <p style={{ ...fieldHint, margin: 0 }}>
              Scale not set. A {vals.gpaUnweighted} looks like a {guess === "100" ? "100 point" : guess} scale, but check your transcript.
            </p>
            <Button kind="quiet" style={{ padding: "6px 10px" }}
              onClick={() => { setVals((prev) => ({ ...prev, gpaScale: guess })); save({ gpaScale: guess }); }}>
              Use {guess === "100" ? "100 point" : guess}
            </Button>
          </div>
        )}
      </div>
      {!notUsed && (
        <div style={{ ...fieldRow, gap: 12 }}>
          <Field label="Unweighted" style={{ flex: 1, minWidth: 140 }}>
            {(id) => (
              <NumberInput id={id} data-gpa-first="" value={vals.gpaUnweighted} decimal placeholder="e.g. 3.8" range={range}
                onCommit={set("gpaUnweighted")} onBlur={() => save()} />
            )}
          </Field>
          <Field label="Weighted" style={{ flex: 1, minWidth: 140 }}>
            {(id) => (
              <NumberInput id={id} value={vals.gpaWeighted} decimal placeholder="Optional" range={weightedRange}
                onCommit={set("gpaWeighted")} onBlur={() => save()} />
            )}
          </Field>
        </div>
      )}
    </SectionCard>
  );
}

/** A score reads as the test over its sections, with the score at the right:
 *  "SAT ... 1450", "AP Chemistry ... 5". */
function ScoreLine({ score, onPatch, onRemove, startOpen, status }) {
  const type = (score.test_type || "").toLowerCase();
  const isAp = type === "ap";
  const r = TEST_RANGES[type] || {};
  const hasSections = type === "sat" || type === "psat";
  const sub = score.section_scores || {};
  const rw = Number(sub.reading_writing), math = Number(sub.math);
  const sum = hasSections && sub.reading_writing != null && sub.math != null && Number.isFinite(rw) && Number.isFinite(math)
    ? rw + math : null;
  const offerSum = sum != null && Number(score.score) !== sum;
  const hasScore = score.score != null && score.score !== "";

  const test = isAp ? (score.subject ? `AP ${score.subject}` : "AP exam") : (labelFor(TEST_TYPES, type) || "New score");
  const sections = hasSections ? [
    sub.reading_writing != null ? `Reading and Writing ${sub.reading_writing}` : null,
    sub.math != null ? `Math ${sub.math}` : null,
  ].filter(Boolean) : [];
  const meta = [
    hasScore ? null : "No score yet",
    isAp && !score.subject ? "Subject not set" : null,
    ...sections,
  ].filter(Boolean).join(" · ");

  return (
    <RecordLine id={score.id} name={rowName("scores", score)} startOpen={startOpen} status={status} onRemove={onRemove}
      title={test} value={hasScore ? score.score : null} meta={meta} metaMuted={!hasScore}
      editor={(
        <>
          <div style={fieldRow}>
            <Field label="Test" style={{ flex: "1 1 120px" }}>
              {(id) => (
                <Select id={id} data-first="" value={type} placeholder="Type" onChange={(v) => onPatch({ test_type: v })}
                  options={TEST_TYPES} />
              )}
            </Field>
            {isAp && (
              <Field label="Subject" style={{ flex: "2 1 180px" }}>
                {(id) => <Input id={id} value={score.subject} onChange={(v) => onPatch({ subject: v })} placeholder="e.g. Chemistry" />}
              </Field>
            )}
            <Field label={isAp ? "Score (1-5)" : "Total"} style={{ flex: "1 1 120px" }}>
              {(id) => (
                <NumberInput id={id} value={score.score} range={r.total} placeholder={r.ph || "Score"}
                  onCommit={(n) => onPatch({ score: n })} />
              )}
            </Field>
          </div>
          {/* The sections get their own row, and each is wide enough for its
              label, so on a phone they stack instead of running together. */}
          {hasSections && (
            <div style={{ ...fieldRow, marginTop: 12 }}>
              <Field label="Reading and Writing" style={{ flex: "1 1 170px" }}>
                {(id) => (
                  <NumberInput id={id} value={sub.reading_writing} range={r.section} placeholder={r.sph}
                    onCommit={(n) => onPatch({ section_scores: { ...sub, reading_writing: n ?? undefined } })} />
                )}
              </Field>
              <Field label="Math" style={{ flex: "1 1 170px" }}>
                {(id) => (
                  <NumberInput id={id} value={sub.math} range={r.section} placeholder={r.sph}
                    onCommit={(n) => onPatch({ section_scores: { ...sub, math: n ?? undefined } })} />
                )}
              </Field>
            </div>
          )}
          {offerSum && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              <p style={{ ...fieldHint, margin: 0 }}>Your sections add up to {sum}.</p>
              <Button kind="quiet" style={{ padding: "6px 10px" }} onClick={() => onPatch({ score: sum })}>
                Use {sum} as the total
              </Button>
            </div>
          )}
        </>
      )} />
  );
}

/** A class reads as its name over its level. The level is left off when the
 *  name already says it ("AP Biology" over "AP" says it twice), so the meta
 *  line only carries what the name does not: Honors on "Chemistry", Planned,
 *  or a muted "Level not set". */
function CourseLine({ course, onPatch, onRemove, onNext, startOpen, request, status }) {
  const c = course;
  const level = labelFor(COURSE_LEVELS, c.level);
  const named = level && (c.name || "").trim().toLowerCase().startsWith(`${level.toLowerCase()} `);
  const meta = [named ? null : level || "Level not set", c.planned ? "Planned" : null].filter(Boolean).join(" · ");
  return (
    <RecordLine id={c.id} name={rowName("courses", c)} startOpen={startOpen} request={request} status={status} onRemove={onRemove}
      title={c.name || "Untitled class"} meta={meta} metaMuted={!c.level}
      editor={(
        <div style={fieldRow}>
          {/* Enter starts the next class in the same year, at the same level,
              so a whole schedule goes in without reaching for Add. */}
          <Field label="Class" style={{ flex: "3 1 200px" }}>
            {(id) => (
              <Input id={id} data-first="" value={c.name} onChange={(v) => onPatch({ name: v })} placeholder="e.g. AP Biology"
                enterKeyHint="next"
                onKeyDown={(e) => {
                  if (e.key !== "Enter" || e.nativeEvent.isComposing || !(c.name || "").trim()) return;
                  e.preventDefault();
                  onNext?.();
                }} />
            )}
          </Field>
          <Field label="Level" style={{ flex: "1 1 140px" }}>
            {(id) => <Select id={id} data-field="level" value={c.level} onChange={(v) => onPatch({ level: v })} options={COURSE_LEVELS} />}
          </Field>
          <Field label="Grade" style={{ flex: "1 1 120px" }}>
            {(id) => (
              <Select id={id} data-field="grade" value={c.grade_level != null ? String(c.grade_level) : ""} options={GRADE_OPTIONS}
                onChange={(v) => onPatch({ grade_level: v ? Number(v) : null })} />
            )}
          </Field>
        </div>
      )} />
  );
}

/** Classes grouped by the year they were taken, since admissions reads rigor
 *  year by year. Each year ends with its own Add, which starts the class in
 *  that year at the level of the one before it. */
function CourseList({ courses, onPatch, onRemove, onAdd, adding, justAdded, request, status }) {
  const inGrade = (c, g) => Number(c.grade_level) === g;
  const groups = [
    ...GRADES.map((g) => ({ key: g, label: `Grade ${g}`, rows: courses.filter((c) => inGrade(c, g)) })),
    { key: "none", label: "Grade not set", rows: courses.filter((c) => !GRADES.some((g) => inGrade(c, g))) },
  ].filter((g) => g.rows.length);
  const titled = groups.length > 1 || groups[0]?.key !== "none";
  return groups.map((g, i) => {
    const grade = g.key === "none" ? null : g.key;
    const last = g.rows[g.rows.length - 1];
    const next = { grade, level: last?.level || null };
    return (
      <div key={g.key} style={{ marginTop: i ? 18 : 0 }}>
        {titled && (
          <Heading level={3} style={{ fontSize: "1rem", color: TEXT_MID, margin: "0 0 2px" }}>{g.label}</Heading>
        )}
        <RecordList>
          {g.rows.map((c) => (
            <CourseLine key={c.id} course={c} startOpen={c.id === justAdded} status={status}
              request={request?.id === c.id ? request : null}
              onNext={() => onAdd({ grade: c.grade_level ?? null, level: c.level || null })}
              onPatch={(v) => onPatch(c, v)} onRemove={() => onRemove(c)} />
          ))}
        </RecordList>
        {grade != null && (
          <Button kind="quiet" tone="muted" onClick={() => onAdd(next)} busy={adding === `courses:${grade}`}
            style={{ padding: "0 10px", marginLeft: -10 }}>
            {adding !== `courses:${grade}` && <PlusIcon />}
            Add a grade {grade} class
          </Button>
        )}
      </div>
    );
  });
}

// ─── Activities & awards ──────────────────────────────────────────────────────

/** An activity reads as its name, role and hours, then what you did. */
function ActivityLine({ activity, onPatch, onRemove, startOpen, request, status }) {
  const a = activity;
  const grades = a.grade_levels || [];
  const meta = [
    a.position, a.organization,
    a.hours_per_week && a.weeks_per_year ? `${a.hours_per_week} hrs/wk, ${a.weeks_per_year} wks/yr` : null,
    grades.length ? `${grades.length === 1 ? "Grade" : "Grades"} ${grades.join(", ")}` : null,
  ].filter(Boolean).join(" · ");
  const thin = !a.description && !a.position;

  return (
    <RecordLine id={a.id} name={rowName("activities", a)} startOpen={startOpen} request={request} status={status} onRemove={onRemove}
      title={a.title || "New activity"} meta={meta}
      editor={(
        <>
          <Field label="Name" style={{ marginBottom: 14 }}>
            {(id) => <Input id={id} data-first="" value={a.title} onChange={(v) => onPatch({ title: v })} placeholder="e.g. Debate team" />}
          </Field>
          <div style={{ ...fieldRow, marginBottom: 14 }}>
            <Field label="Your role" style={{ flex: 1, minWidth: 150 }}>
              {(id) => <Input id={id} data-field="position" value={a.position} maxLength={50} onChange={(v) => onPatch({ position: v })} placeholder="e.g. Captain" />}
            </Field>
            <Field label="Organization" style={{ flex: 1, minWidth: 150 }}>
              {(id) => <Input id={id} value={a.organization} maxLength={100} onChange={(v) => onPatch({ organization: v })} />}
            </Field>
          </div>
          <DescriptionField value={a.description} onChange={(v) => onPatch({ description: v })} />
          <div style={{ ...fieldRow, marginBottom: 14 }}>
            <Field label="Hours / week" style={{ flex: "1 1 120px", maxWidth: 200 }}>
              {(id) => (
                <NumberInput id={id} data-field="hours" value={a.hours_per_week} decimal range={HOURS_RANGE}
                  onCommit={(n) => onPatch({ hours_per_week: n })} />
              )}
            </Field>
            <Field label="Weeks / year" style={{ flex: "1 1 120px", maxWidth: 200 }}>
              {(id) => (
                <NumberInput id={id} data-field="weeks" value={a.weeks_per_year} range={WEEKS_RANGE}
                  onCommit={(n) => onPatch({ weeks_per_year: n })} />
              )}
            </Field>
          </div>
          <div style={{ marginBottom: 14 }}>
            <ChoiceChips label="Grades involved" labelAbove multi options={GRADE_CHIPS} value={grades}
              onChange={(v) => onPatch({ grade_levels: v })} />
          </div>
          <ChoiceChips label="When" labelAbove options={TIMINGS} value={a.timing}
            onChange={(k) => onPatch({ timing: k })} />
        </>
      )}>
      {a.description && (
        <p style={{ fontFamily: SANS, fontSize: "0.95rem", color: TEXT_MUTED, lineHeight: 1.55, margin: "2px 0 0" }}>
          {a.description}
        </p>
      )}
      {thin && <Tag style={{ marginTop: 4 }}>Needs detail</Tag>}
    </RecordLine>
  );
}

/** "What you did", with its character count beside the label. */
function DescriptionField({ value, onChange }) {
  const id = useId();
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
        <FieldLabel htmlFor={id}>What you did</FieldLabel>
        <span style={{ fontFamily: SANS, fontSize: "0.9rem", fontWeight: 600, color: TEXT_MUTED, fontVariantNumeric: "tabular-nums" }}>
          {(value || "").length}/150
        </span>
      </div>
      <textarea id={id} value={value || ""} maxLength={150} rows={2} className={INPUT_CLASS}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...inputStyle, resize: "vertical" }} />
    </div>
  );
}

/** An award reads as its title over "State · 2025". */
function AwardLine({ award, onPatch, onRemove, startOpen, status }) {
  const meta = [labelFor(AWARD_LEVELS, award.level), award.year].filter((x) => x != null && x !== "").join(" · ");
  return (
    <RecordLine id={award.id} name={rowName("awards", award)} startOpen={startOpen} status={status} onRemove={onRemove}
      title={award.title || "New award"} meta={meta || "Level and year not set"} metaMuted={!meta}
      editor={(
        <div style={fieldRow}>
          <Field label="Award" style={{ flex: "2 1 220px" }}>
            {(id) => <Input id={id} data-first="" value={award.title} onChange={(v) => onPatch({ title: v })} placeholder="e.g. State finalist" />}
          </Field>
          <Field label="Level" style={{ flex: "1 1 130px" }}>
            {(id) => <Select id={id} value={award.level} onChange={(v) => onPatch({ level: v })} options={AWARD_LEVELS} placeholder="Level" />}
          </Field>
          <Field label="Year" style={{ flex: "1 1 90px" }}>
            {(id) => (
              <NumberInput id={id} value={award.year} range={YEAR_RANGE} placeholder="e.g. 2025"
                onCommit={(n) => onPatch({ year: n })} />
            )}
          </Field>
        </div>
      )} />
  );
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// ─── Sheets ───────────────────────────────────────────────────────────────────

const sheetLead = { fontFamily: SANS, fontSize: "1rem", color: TEXT_MID, lineHeight: 1.6, margin: "0 0 18px" };

/** A checkable row in a sheet: the kit's border, the box in the accent. */
const checkRow = {
  display: "flex", alignItems: "center", gap: 12, cursor: "pointer", background: WHITE,
  border: `1px solid ${BORDER}`, borderRadius: RADIUS.control, padding: "11px 14px", minHeight: 44, boxSizing: "border-box",
};

function SheetTitle({ id, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
      <StampTile kind="resume" />
      <Heading id={id} style={{ fontSize: "1.4rem" }}>{children}</Heading>
    </div>
  );
}

// ─── Upload review ────────────────────────────────────────────────────────────

function ReviewSheet({ rows: initial, onConfirm, onClose, saving }) {
  const ink = useAgentInk();
  const headId = useId();
  const [rows, setRows] = useState(() => initial.map((r) => ({ ...r, checked: true })));
  const chosen = rows.filter((r) => r.checked);

  return (
    <Sheet onClose={onClose} locked={saving} labelledBy={headId} width={640}>
      <SheetTitle id={headId}>
        We found {initial.length} {initial.length === 1 ? "item" : "items"}
      </SheetTitle>
      <p style={sheetLead}>
        Untick anything you don't want. You can edit the details after adding them.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
        {rows.map((r, i) => (
          <label key={i} style={{ ...checkRow, alignItems: "flex-start", padding: "12px 14px" }}>
            <input type="checkbox" checked={r.checked} className={FOCUS_CLASS}
              onChange={() => setRows((prev) => prev.map((x, j) => (j === i ? { ...x, checked: !x.checked } : x)))}
              style={{ marginTop: 4, width: 18, height: 18, accentColor: ink.button.bg, cursor: "pointer", flexShrink: 0 }} />
            <span style={{ minWidth: 0 }}>
              <Tag stamp={r.kind === "award" ? "star" : "scroll"} style={{ marginBottom: 6 }}>
                {r.kind === "award" ? "Award" : "Activity"}
              </Tag>
              <span style={{ display: "block", fontFamily: SANS, fontWeight: 700, fontSize: "1rem", color: TEXT }}>
                {r.title}
              </span>
              {r.description && (
                <span style={{ display: "block", fontFamily: SANS, fontSize: "0.95rem", color: TEXT_MUTED, lineHeight: 1.5, marginTop: 3 }}>
                  {r.description}
                </span>
              )}
            </span>
          </label>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <Button kind="secondary" onClick={onClose} disabled={saving} style={{ flex: "0 0 auto" }}>
          Cancel
        </Button>
        <Button kind="primary" onClick={() => onConfirm(chosen)} disabled={chosen.length === 0} busy={saving}
          style={{ flex: 1 }}>
          {saving ? "Adding…" : `Add ${chosen.length || ""}`.trim()}
        </Button>
      </div>
    </Sheet>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────

const pickTitle = { fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700, color: TEXT_MID, margin: "0 0 8px" };

function PickGroup({ title, items, selected, onToggle, render }) {
  const ink = useAgentInk();
  if (!items.length) return null;
  return (
    <div style={{ marginBottom: 18 }}>
      <p style={pickTitle}>{title}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map((it) => (
          <label key={it.id} style={checkRow}>
            <input type="checkbox" checked={selected.has(it.id)} onChange={() => onToggle(it.id)} className={FOCUS_CLASS}
              style={{ width: 18, height: 18, accentColor: ink.button.bg, cursor: "pointer", flexShrink: 0 }} />
            <span style={{ fontFamily: SANS, fontSize: "1rem", fontWeight: 600, color: TEXT, minWidth: 0 }}>
              {render(it)}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

// The PDF's own section labels and order (langgraph-service resume.py), so the
// preview reads as the page will.
const RESUME_LEVELS = [["ap", "AP"], ["ib", "IB"], ["dual_enrollment", "Dual Enrollment"], ["honors", "Honors"]];
const num = (v) => { const f = Number(v); return Number.isFinite(f) && f === Math.trunc(f) ? String(Math.trunc(f)) : String(v); };

/** What the resume will say, in the PDF's order: the name and contact line,
 *  Education (GPA, scores, classes by level), Activities, Awards. Built from
 *  the same rules the PDF uses, but it is not the PDF, so the sheet says
 *  that its spacing and page break can differ. */
function ResumePreview({ name, contact, picked }) {
  const { gpa, scores, courses, activities, awards } = picked;
  const contactLine = [contact.phone, contact.email, contact.location,
    ...(contact.links || []).filter((l) => (l.url || "").trim()).map((l) => (l.label || "").trim() || l.url.replace(/^https?:\/\//, ""))]
    .map((x) => (x || "").trim()).filter(Boolean).join(" | ");

  const scoreLine = scores.filter((sc) => sc.score != null && sc.score !== "").map((sc) => {
    const kind = (sc.test_type || "").toUpperCase();
    if (kind === "AP") return `AP ${(sc.subject || "").trim()}: ${sc.score}`.replace("AP : ", "AP: ");
    const sub = sc.section_scores || {};
    const detail = Object.entries(sub).filter(([, v]) => v != null)
      .map(([k, v]) => `${k === "reading_writing" ? "RW" : k === "math" ? "M" : k.replace(/_/g, " ")} ${v}`).join(", ");
    return `${kind}: ${sc.score}${detail ? ` (${detail})` : ""}`;
  }).join(" | ");
  const byLevel = [...RESUME_LEVELS, [null, "Other"]].map(([key, label]) => {
    const names = courses.filter((c) => (key ? c.level === key : !RESUME_LEVELS.some(([k]) => k === c.level)))
      .map((c) => (c.name || "").trim()).filter(Boolean);
    return names.length ? { label, names } : null;
  }).filter(Boolean);
  const education = [gpa, scoreLine].filter(Boolean);

  const page = { fontFamily: SANS, fontSize: "0.95rem", color: TEXT, lineHeight: 1.5 };
  const sectionHead = { fontFamily: SANS, fontSize: "1rem", fontWeight: 800, color: TEXT, margin: "14px 0 6px",
    paddingBottom: 3, borderBottom: `1px solid ${BORDER}` };
  const list = { margin: 0, paddingLeft: "1.2em" };

  return (
    <div style={{ ...page, background: WHITE, border: `1px solid ${BORDER}`, borderRadius: RADIUS.control,
      padding: "18px 18px 14px", overflowWrap: "anywhere" }}>
      <p style={{ fontSize: "1.4rem", fontWeight: 800, textAlign: "center", margin: 0, lineHeight: 1.25 }}>{name || "Your Name"}</p>
      {contactLine && <p style={{ textAlign: "center", color: TEXT_MID, margin: "4px 0 0" }}>{contactLine}</p>}

      {(education.length > 0 || byLevel.length > 0) && (
        <>
          <p style={sectionHead}>Education</p>
          <ul style={list}>
            {education.map((line) => <li key={line}>{line}</li>)}
            {byLevel.map((g) => <li key={g.label}><strong style={{ fontWeight: 700 }}>{g.label}:</strong> {g.names.join(", ")}</li>)}
          </ul>
        </>
      )}

      {activities.length > 0 && (
        <>
          <p style={sectionHead}>Activities &amp; Leadership</p>
          {activities.map((a) => {
            const title = (a.title || "").trim(), role = (a.position || "").trim(), org = (a.organization || "").trim();
            const head = role || title;
            const grades = (a.grade_levels || []).filter(Boolean).sort((x, y) => x - y);
            const trailing = [
              org && org.toLowerCase() !== head.toLowerCase() ? org : title && title.toLowerCase() !== head.toLowerCase() ? title : null,
              a.hours_per_week && a.weeks_per_year ? `${num(a.hours_per_week)} hrs/wk, ${num(a.weeks_per_year)} wks/yr` : null,
              grades.length ? `${grades.length === 1 ? "Grade" : "Grades"} ${grades.join(", ")}` : null,
            ].filter(Boolean);
            return (
              <div key={a.id} style={{ marginBottom: 6 }}>
                <span style={{ fontWeight: 700 }}>{head || "Untitled activity"}</span>
                {trailing.length > 0 && <span style={{ color: TEXT_MID }}> | {trailing.join(" | ")}</span>}
                {(a.description || "").trim() && <ul style={{ ...list, marginTop: 2 }}><li>{a.description.trim()}</li></ul>}
              </div>
            );
          })}
        </>
      )}

      {awards.length > 0 && (
        <>
          <p style={sectionHead}>Awards &amp; Honors</p>
          <ul style={list}>
            {awards.map((w) => {
              const meta = [labelFor(AWARD_LEVELS, w.level), w.year].filter((x) => x != null && x !== "").join(", ");
              return (
                <li key={w.id}>
                  <strong style={{ fontWeight: 700 }}>{(w.title || "").trim() || "Untitled award"}</strong>
                  {meta && ` (${meta})`}{(w.description || "").trim() && `: ${w.description.trim()}`}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

/** Two steps, because a resume export is scarce (LIMITS.resume_export): pick
 *  what goes on it, then read it back in the PDF's order before the one
 *  button that spends an export. Back keeps every choice. */
function ExportSheet({ record, contact: initialContact, exportsLeft, generating, error, onGenerate, onClose }) {
  const ink = useAgentInk();
  const headId = useId();
  const topRef = useRef(null);
  const [step, setStep] = useState("pick");
  const [contact, setContact] = useState(() => ({ ...EMPTY_CONTACT, ...(initialContact || {}) }));
  const hasGpa = Boolean(record.profile.gpa_unweighted || record.profile.gpa_weighted);
  const [includeGpa, setIncludeGpa] = useState(hasGpa);
  const [sel, setSel] = useState(() => ({
    activity_ids: new Set(record.activities.map((r) => r.id)),
    award_ids:    new Set(record.awards.map((r) => r.id)),
    course_ids:   new Set(record.courses.map((r) => r.id)),
    score_ids:    new Set(record.scores.map((r) => r.id)),
  }));

  // A new step starts at its top, with focus on its title, as the sheet
  // itself does when it opens.
  const firstStep = useRef(true);
  useEffect(() => {
    if (firstStep.current) { firstStep.current = false; return; }
    const dialog = topRef.current?.closest("[role=dialog]");
    if (dialog) dialog.scrollTop = 0;
    topRef.current?.focus({ preventScroll: true });
  }, [step]);

  const toggle = (key) => (id) => setSel((prev) => {
    const next = new Set(prev[key]);
    if (next.has(id)) next.delete(id); else next.add(id);
    return { ...prev, [key]: next };
  });
  const setLink = (i, k) => (v) => setContact((c) => ({ ...c, links: c.links.map((l, j) => (j === i ? { ...l, [k]: v } : l)) }));

  const total = Object.values(sel).reduce((n, s) => n + s.size, 0) + (includeGpa ? 1 : 0);
  const blocked = generating || total === 0 || exportsLeft === 0;
  const pr = record.profile;
  const scaleKey = normScale(pr.gpa_scale);
  const gpaLine = includeGpa
    ? `GPA: ${[pr.gpa_unweighted && `${pr.gpa_unweighted} unweighted`, pr.gpa_weighted && `${pr.gpa_weighted} weighted`].filter(Boolean).join(", ")}`
      + (scaleKey && scaleKey !== "not_used" && scaleKey !== "other" ? `, ${scaleKey} scale` : "")
    : null;
  const picked = {
    gpa: gpaLine,
    scores: record.scores.filter((r) => sel.score_ids.has(r.id)),
    courses: record.courses.filter((r) => sel.course_ids.has(r.id)),
    activities: record.activities.filter((r) => sel.activity_ids.has(r.id)),
    awards: record.awards.filter((r) => sel.award_ids.has(r.id)),
  };
  const spendLabel = exportsLeft === 1 ? "Download, uses your 1 export" : `Download, uses 1 of ${exportsLeft} exports`;
  const title = (
    <div ref={topRef} tabIndex={-1} style={{ outline: "none" }}>
      <SheetTitle id={headId}>{step === "pick" ? "Export as a resume" : "Check your resume"}</SheetTitle>
    </div>
  );

  // One Sheet for both steps, so a step change neither replays the opening
  // animation nor hands focus back to the page in between.
  if (step === "check") {
    return (
      <Sheet key="export" onClose={onClose} locked={generating} labelledBy={headId} width={660}>
        {title}
        <p style={sheetLead}>
          This is what goes on it, in order. Check the spelling and your contact line now: the download{" "}
          {exportsLeft === 1 ? "uses your one resume export" : "uses one of your resume exports"}. The PDF's spacing and
          page break can differ a little from this.
        </p>
        {!(pr.full_name || "").trim() && (
          <Notice tone="info" style={{ marginBottom: 12 }}>
            Your name isn't in your profile yet, so the PDF will say "Your Name". Add it on your Profile page first.
          </Notice>
        )}
        <div style={{ marginBottom: 20 }}>
          <ResumePreview name={(pr.full_name || "").trim()} contact={contact} picked={picked} />
        </div>
        {error && <Notice tone="error" style={{ marginBottom: 12 }}>{error}</Notice>}
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Button kind="secondary" onClick={() => setStep("pick")} disabled={generating} style={{ flex: "0 0 auto" }}>
            Back
          </Button>
          <Button kind="primary" disabled={blocked} busy={generating}
            onClick={() => onGenerate({
              activity_ids: [...sel.activity_ids], award_ids: [...sel.award_ids],
              course_ids: [...sel.course_ids], score_ids: [...sel.score_ids],
              include_gpa: includeGpa,
            }, contact)}
            style={{ flex: 1, minWidth: 200 }}>
            {generating ? "Building your PDF…" : spendLabel}
          </Button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet key="export" onClose={onClose} locked={generating} labelledBy={headId} width={660}>
      {title}
      <p style={sheetLead}>
        A one-page PDF built from whatever you pick, across both tabs. You'll see it before anything downloads.{" "}
        <strong style={{ fontWeight: 700, color: TEXT }}>
          {exportsLeft === 1 ? "You can export one resume" : `You can export ${exportsLeft} resumes`}, so add
          everything you want first.
        </strong>
      </p>

      <div style={{ marginBottom: 22 }}>
        <Heading level={3} style={{ marginBottom: 12 }}>Contact header</Heading>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {[["email", "Email", "you@example.com"], ["phone", "Phone", "(555) 123-4567"], ["location", "Location", "City, State"]].map(([k, label, ph]) => (
            <Field key={k} label={label} style={{ flex: 1, minWidth: 150 }}>
              {(id) => <Input id={id} value={contact[k]} onChange={(v) => setContact((c) => ({ ...c, [k]: v }))} placeholder={ph} />}
            </Field>
          ))}
        </div>
        <ChipField label="Links" style={{ marginTop: 14 }}>
          <div role="group" aria-label="Links">
            {(contact.links || []).map((link, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 110px", minWidth: 0 }}>
                  <Input value={link.label} placeholder="e.g. GitHub" aria-label={`Link ${i + 1} label`} onChange={setLink(i, "label")} />
                </div>
                <div style={{ flex: "3 1 180px", minWidth: 0 }}>
                  <Input value={link.url} placeholder="https://…" aria-label={`Link ${i + 1} address`} onChange={setLink(i, "url")} />
                </div>
                <RemoveButton name={link.label ? `the ${link.label} link` : `link ${i + 1}`}
                  onClick={() => setContact((c) => ({ ...c, links: c.links.filter((_, j) => j !== i) }))} />
              </div>
            ))}
            <AddButton onClick={() => setContact((c) => ({ ...c, links: [...(c.links || []), { label: "", url: "" }] }))}>
              Add link
            </AddButton>
          </div>
        </ChipField>
      </div>

      <Heading level={3} style={{ marginBottom: 12 }}>
        What to include
      </Heading>

      {hasGpa && (
        <div style={{ marginBottom: 18 }}>
          <p style={pickTitle}>GPA</p>
          <label style={checkRow}>
            <input type="checkbox" checked={includeGpa} onChange={() => setIncludeGpa((v) => !v)} className={FOCUS_CLASS}
              style={{ width: 18, height: 18, accentColor: ink.button.bg, cursor: "pointer", flexShrink: 0 }} />
            <span style={{ fontFamily: SANS, fontSize: "1rem", fontWeight: 600, color: TEXT }}>
              {[pr.gpa_unweighted && `${pr.gpa_unweighted} unweighted`,
                pr.gpa_weighted && `${pr.gpa_weighted} weighted`].filter(Boolean).join(", ")}
            </span>
          </label>
        </div>
      )}

      <PickGroup title="Test scores" items={record.scores} selected={sel.score_ids} onToggle={toggle("score_ids")}
        render={(s) => (s.test_type || "").toUpperCase() === "AP"
          ? `AP ${s.subject || ""}: ${s.score ?? ""}` : `${(s.test_type || "").toUpperCase()}: ${s.score ?? ""}`} />
      <PickGroup title="Coursework" items={record.courses} selected={sel.course_ids} onToggle={toggle("course_ids")}
        render={(c) => `${c.name || "Untitled class"}${c.level ? ` (${labelFor(COURSE_LEVELS, c.level) || c.level})` : ""}`} />
      <PickGroup title="Activities" items={record.activities} selected={sel.activity_ids} onToggle={toggle("activity_ids")}
        render={(a) => a.title || "Untitled activity"} />
      <PickGroup title="Awards" items={record.awards} selected={sel.award_ids} onToggle={toggle("award_ids")}
        render={(w) => w.title || "Untitled award"} />

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <Button kind="secondary" onClick={onClose} disabled={generating} style={{ flex: "0 0 auto" }}>
          Cancel
        </Button>
        <Button kind="primary" disabled={blocked} onClick={() => setStep("check")} style={{ flex: 1, minWidth: 180 }}>
          {`Check it (${plural(total, "item", "items")})`}
        </Button>
      </div>
    </Sheet>
  );
}

// ─── Saving ───────────────────────────────────────────────────────────────────

/** Per-section save status: "saving" while any write (or a queued edit) is
 *  pending, then "saved" for a moment, or "error" until a write succeeds. */
function useSaveStatus() {
  const [status, setStatus] = useState({});
  const busy = useRef({});
  const errored = useRef(new Set());
  const timers = useRef({});
  const refresh = (key) => {
    const s = busy.current[key] > 0 ? "saving" : errored.current.has(key) ? "error" : "saved";
    clearTimeout(timers.current[key]);
    setStatus((prev) => ({ ...prev, [key]: s }));
    if (s === "saved") {
      timers.current[key] = setTimeout(() => setStatus((prev) => (prev[key] === "saved" ? { ...prev, [key]: null } : prev)), 2500);
    }
  };
  const begin = (key) => { busy.current[key] = (busy.current[key] || 0) + 1; refresh(key); };
  const end = (key, ok) => {
    busy.current[key] = Math.max(0, (busy.current[key] || 0) - 1);
    if (ok) errored.current.delete(key); else errored.current.add(key);
    refresh(key);
  };
  return { status, begin, end };
}

const SAVE_DELAY = 450;

// ─── Page ─────────────────────────────────────────────────────────────────────

const TABS = [
  { key: "academics", label: "Academics",           short: "Academics" },
  { key: "ecs",       label: "Activities & awards", short: "Activities" },
];
// The base id the kit's tablist and its two panels share.
const PF_TABS = "pf-tabs";

export default function PortfolioPage({ navigate }) {
  const isMobile = useIsMobile();
  const reduce = useReducedMotion();
  const ink = useAgentInk();
  const [phase, setPhase]   = useState("loading");
  const [tab, setTab]       = useState("academics");
  const [userId, setUserId] = useState(null);
  const [record, setRecord] = useState({ profile: {}, activities: [], awards: [], courses: [], scores: [] });
  const recordRef = useRef(record);
  recordRef.current = record;

  const [uploadsUsed, setUploadsUsed] = useState(0);
  const [uploading, setUploading]     = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [extracted, setExtracted]     = useState(null);
  const [addingExtracted, setAdding]  = useState(false);

  const [exportsUsed, setExportsUsed] = useState(0);
  const [exportOpen, setExportOpen]   = useState(false);
  const [exporting, setExporting]     = useState(false);
  const [exportError, setExportError] = useState(null);

  const [limitModal, setLimitModal] = useState(null);
  const [notice, setNotice] = useState(null);               // { text, error, action, undo }
  const [adding, setAddingTo] = useState(null);             // the list an Add is waiting on
  const [justAdded, setJustAdded] = useState(null);         // opens the item just added
  const [, setFocusTick] = useState(0);
  const fileRef = useRef(null);
  const focusNext = useRef(null);
  // Focus something after the next render, even when nothing else changes.
  const focusOn = (selector) => { focusNext.current = selector; setFocusTick((t) => t + 1); };
  const { status, begin, end } = useSaveStatus();

  useEffect(() => {
    (async () => {
      try {
        const user = await requireUser();
        if (!user) return;
        setUserId(user.id);
        const [rec, usage] = await Promise.all([fetchRecord(user.id), fetchUsage(supabase)]);
        setRecord(rec);
        setUploadsUsed(usage.portfolio_uploads_used ?? 0);
        setExportsUsed(usage.resume_exports_used ?? 0);
        setPhase("ready");
      } catch (e) {
        // Without this the page sits on the spinner forever and the only trace
        // is an unhandled rejection in the console, which is how a one-word
        // typo in fetchRecord read as "the portfolio never loads".
        console.error("[portfolio] load failed:", e);
        setPhase("error");
      }
    })();
  }, []);

  // After a remove, an add or an undo, focus lands where the student is
  // working: the new row's first field, the next row, or the section.
  useEffect(() => {
    const t = focusNext.current;
    if (!t) return;
    focusNext.current = null;
    const el = document.querySelector(t);
    if (!el) return;
    el.focus({ preventScroll: true });
    (el.closest("[data-row]") || el).scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
  });

  // A notice with nothing to act on clears itself; one with Undo or Retry
  // stays until the next action or a dismiss.
  useEffect(() => {
    if (!notice || notice.error || notice.action || notice.undo) return undefined;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  // Undo (and its Ctrl+Z / Cmd+Z shortcut, outside text fields) is the kit
  // Toast's own: a notice with `undo` draws the button and owns the key.

  // ── Edits: local first, saved a moment after typing stops ──
  // The row updates at once so typing stays smooth; the write follows once
  // the student pauses. A failed write keeps what was typed, says so in a
  // toast with Retry, and rides along with the next edit to that row.
  const queue = useRef(new Map());    // rowKey -> { table, listKey, id, name, values, timer }
  const failed = useRef(new Map());   // rowKey -> the same, for Retry

  const actionBtn = (label, run) => (
    <Button kind="quiet" onClick={run} style={{ padding: "6px 10px", marginLeft: -10 }}>{label}</Button>
  );

  const flushRow = async (rowKey) => {
    const q = queue.current.get(rowKey);
    if (!q) return;
    clearTimeout(q.timer);
    queue.current.delete(rowKey);
    try {
      await updateRow(q.table, q.id, q.values);
      failed.current.delete(rowKey);
      end(q.listKey, true);
      setNotice((n) => (n?.rowKey === rowKey ? null : n));
      healSection(q.listKey);
    } catch (e) {
      console.error(`[portfolio] ${q.table} update failed:`, e);
      failed.current.set(rowKey, { ...q, timer: null });
      end(q.listKey, false);
      setNotice({ error: true, rowKey, text: `Couldn't save ${q.name}. What you typed is still here.`,
        action: actionBtn("Retry", () => retryRow(rowKey)) });
    }
  };

  const retryRow = (rowKey, quiet = false) => {
    const f = failed.current.get(rowKey);
    if (!f) return;
    if (!quiet) setNotice(null);
    failed.current.delete(rowKey);
    if (!queue.current.has(rowKey)) begin(f.listKey);
    const q = queue.current.get(rowKey);
    queue.current.set(rowKey, { ...f, values: { ...f.values, ...(q?.values) } });
    flushRow(rowKey);
  };

  // Once a write in a section goes through again, anything that failed
  // there earlier is resent too, so a dropped connection heals itself even
  // after its toast has been replaced.
  const healSection = (listKey) => {
    for (const [rowKey, f] of failed.current) if (f.listKey === listKey) retryRow(rowKey, true);
  };

  const patch = (table, listKey, row, values) => {
    setRecord((prev) => ({
      ...prev,
      [listKey]: prev[listKey].map((r) => (r.id === row.id ? { ...r, ...values } : r)),
    }));
    const rowKey = `${table}:${row.id}`;
    let q = queue.current.get(rowKey);
    if (!q) {
      begin(listKey);
      q = { table, listKey, id: row.id, values: { ...(failed.current.get(rowKey)?.values) } };
      failed.current.delete(rowKey);
      queue.current.set(rowKey, q);
    }
    clearTimeout(q.timer);
    q.values = { ...q.values, ...values };
    q.name = rowName(listKey, { ...row, ...values });
    q.timer = setTimeout(() => flushRow(rowKey), SAVE_DELAY);
  };

  // Leaving the page (or the tab going to the background) sends what is
  // still waiting rather than dropping it.
  useEffect(() => {
    const flushAll = () => { for (const k of [...queue.current.keys()]) flushRow(k); };
    const onHide = () => { if (document.visibilityState === "hidden") flushAll(); };
    window.addEventListener("pagehide", flushAll);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", flushAll);
      document.removeEventListener("visibilitychange", onHide);
      flushAll();
    };
    // flushRow reads only refs and state setters, so the first one is as good as any.
  }, []);

  const add = async (table, listKey, values, what, busyKey = listKey) => {
    setNotice(null);
    setAddingTo(busyKey);
    begin(listKey);
    try {
      const row = await addRow(table, userId, values, recordRef.current[listKey]);
      end(listKey, true);
      healSection(listKey);
      setRecord((prev) => ({ ...prev, [listKey]: [...prev[listKey], row] }));
      setJustAdded(row.id);
      focusNext.current = `[data-row="${row.id}"] [data-first]`;
    } catch (e) {
      console.error(`[portfolio] ${table} insert failed:`, e);
      end(listKey, false);
      setNotice({ error: true, text: `Couldn't add ${what}. Check your connection and try again.`,
        action: actionBtn("Try again", () => add(table, listKey, values, what, busyKey)) });
    } finally { setAddingTo(null); }
  };

  // Remove at once and offer Undo, rather than asking first: the row comes
  // back as it was, in the same place.
  const restore = async (table, listKey, row, at, name) => {
    setNotice(null);
    const { id: _id, user_id: _u, created_at: _c, updated_at: _up, ...values } = row;
    begin(listKey);
    try {
      const fresh = await addRow(table, userId, values, recordRef.current[listKey]);
      end(listKey, true);
      setRecord((prev) => {
        const list = [...prev[listKey]];
        list.splice(Math.min(at, list.length), 0, fresh);
        return { ...prev, [listKey]: list };
      });
      focusNext.current = `[data-row="${fresh.id}"]`;
      setNotice({ text: `${name.charAt(0).toUpperCase()}${name.slice(1)} is back.` });
    } catch (e) {
      console.error(`[portfolio] ${table} restore failed:`, e);
      end(listKey, false);
      setNotice({ error: true, text: `Couldn't bring back ${name}.`,
        action: actionBtn("Try again", () => restore(table, listKey, row, at, name)) });
    }
  };

  const remove = async (table, listKey, row) => {
    setNotice(null);
    const rowKey = `${table}:${row.id}`;
    const q = queue.current.get(rowKey);
    if (q) { clearTimeout(q.timer); queue.current.delete(rowKey); end(listKey, true); }
    failed.current.delete(rowKey);
    const latest = recordRef.current[listKey].find((r) => r.id === row.id) || row;
    const name = rowName(listKey, latest);
    const at = recordRef.current[listKey].findIndex((r) => r.id === row.id);

    // Focus goes to the next row on screen, or the one before, or the section.
    const section = document.getElementById(`sec-${listKey}`);
    const rows = section ? [...section.querySelectorAll("[data-row]")] : [];
    const i = rows.findIndex((el) => el.dataset.row === row.id);
    const neighbour = rows[i + 1] || rows[i - 1];
    focusNext.current = neighbour ? `[data-row="${neighbour.dataset.row}"]` : `#sec-${listKey}`;

    setRecord((prev) => ({ ...prev, [listKey]: prev[listKey].filter((r) => r.id !== row.id) }));
    begin(listKey);
    try {
      await deleteRow(table, row.id);
      end(listKey, true);
      healSection(listKey);
      const undo = () => restore(table, listKey, latest, at, name);
      setNotice({ text: `Removed ${name}.`, undo });
    } catch (e) {
      console.error(`[portfolio] ${table} delete failed:`, e);
      end(listKey, false);
      setRecord((prev) => {
        const list = [...prev[listKey]];
        list.splice(Math.min(at, list.length), 0, latest);
        return { ...prev, [listKey]: list };
      });
      focusNext.current = `[data-row="${row.id}"]`;
      setNotice({ error: true, text: `Couldn't remove ${name}. It is still in your portfolio.`,
        action: actionBtn("Try again", () => remove(table, listKey, latest)) });
    }
  };

  const saveGpaNow = async (v) => {
    begin("gpa");
    try {
      await saveGpa(userId, v);
      end("gpa", true);
      const num = (x) => (x === "" || x == null ? null : Number(x));
      setRecord((prev) => ({
        ...prev,
        profile: {
          ...prev.profile,
          gpa_unweighted: v.gpaScale === "not_used" ? null : num(v.gpaUnweighted),
          gpa_weighted:   v.gpaScale === "not_used" ? null : num(v.gpaWeighted),
          gpa_scale:      v.gpaScale,
        },
      }));
      return true;
    } catch (e) {
      console.error("[portfolio] GPA save failed:", e);
      end("gpa", false);
      setNotice({ error: true, text: "Couldn't save your GPA. What you typed is still here.",
        action: actionBtn("Retry", () => { setNotice(null); saveGpaNow(v); }) });
      return false;
    }
  };

  const pickFile = () => (uploadsUsed < LIMITS.portfolio_upload ? fileRef.current?.click() : setLimitModal("portfolio_upload"));

  const handleFile = async (file) => {
    if (!file) return;
    setUploadError(null);
    // Caught here, before the upload is spent on a file the reader can't open.
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (!UPLOAD_TYPES.includes(ext) || !file.name.includes(".")) {
      setUploadError(`${file.name} isn't a file we can read. Upload a .pdf, .docx, .txt or .md file instead.`);
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setUploading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${LANGGRAPH_URL}/portfolio/extract`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token}` },
        body: fd,
      });
      if (res.status === 429) { setLimitModal("portfolio_upload"); setUploadsUsed(LIMITS.portfolio_upload); return; }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setUploadError(data.detail || "Upload failed. Please try again."); return; }
      setUploadsUsed((u) => u + 1);
      setExtracted(data.items || []);
    } catch {
      setUploadError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const confirmExtracted = async (rows) => {
    setAdding(true);
    try {
      const added = await addExtracted(userId, rows, record);
      setRecord((prev) => ({
        ...prev,
        activities: [...prev.activities, ...added.activities],
        awards:     [...prev.awards, ...added.awards],
      }));
      setExtracted(null);
      setTab("ecs");
      const n = added.activities.length + added.awards.length;
      setNotice({ text: `Added ${plural(n, "item", "items")} from your file.` });
    } catch (e) {
      console.error("[portfolio] adding extracted rows failed:", e);
      setExtracted(null);
      setUploadError("Could not add those. Please try again.");
    } finally { setAdding(false); }
  };

  const handleExport = async (selection, contact) => {
    setExporting(true);
    setExportError(null);
    try {
      await saveContact(userId, contact);
      setRecord((prev) => ({ ...prev, profile: { ...prev.profile, resume_contact: contact } }));
      const blob = await generateResume(selection, contact);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "resume.pdf";
      a.click();
      URL.revokeObjectURL(a.href);
      setExportsUsed((n) => n + 1);
      setExportOpen(false);
      const items = selection.activity_ids.length + selection.award_ids.length + selection.course_ids.length
        + selection.score_ids.length + (selection.include_gpa ? 1 : 0);
      const spent = exportsUsed + 1 >= LIMITS.resume_export;
      setNotice({ text: `Downloaded resume.pdf with ${plural(items, "item", "items")}.${spent ? " That used your last resume export." : ""}` });
    } catch (e) {
      if (e.limit) { setExportOpen(false); setLimitModal("resume_export"); setExportsUsed(LIMITS.resume_export); }
      else setExportError(e.message || "Could not build the PDF. Please try again.");
    } finally { setExporting(false); }
  };

  const pagePad = pageStyle({ isMobile, sidebar: SIDEBAR_WIDTH, ink });

  if (phase === "loading") {
    return <div data-sidebar-offset className="ui-page" role="status" aria-label="Loading your portfolio"
      style={{ ...pagePad, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Spinner size={26} color={ink.text} />
    </div>;
  }

  if (phase === "error") {
    return <div data-sidebar-offset className="ui-page" style={{ ...pagePad, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Card style={{ textAlign: "center", maxWidth: 440, padding: "1.8rem 1.6rem" }}>
        <p style={{ fontFamily: SANS, fontSize: "1.15rem", fontWeight: 800, color: TEXT, margin: "0 0 8px" }}>
          We couldn't load your portfolio
        </p>
        <p style={{ fontFamily: SANS, fontSize: "1rem", color: TEXT_MUTED, lineHeight: 1.6, margin: "0 0 1.4rem" }}>
          Nothing has been lost. Give it another go in a moment.
        </p>
        <Button kind="primary" onClick={() => window.location.reload()}>
          Try again
        </Button>
      </Card>
    </div>;
  }

  const p = record.profile;
  const hasContent = p.gpa_unweighted != null || p.gpa_weighted != null || record.courses.length > 0
    || record.scores.length > 0 || record.activities.length > 0 || record.awards.length > 0;

  const ecCount = record.activities.length + record.awards.length;
  const acCount = record.courses.length + record.scores.length;
  const exportsLeft = Math.max(0, LIMITS.resume_export - exportsUsed);
  const uploadsLeft = Math.max(0, LIMITS.portfolio_upload - uploadsUsed);

  // On a phone the two pills share the row, so the second one says
  // "Activities" (its sections are Activities and Awards) and neither wraps.
  // The count is read as "11 items", not a bare "11".
  const tabOptions = TABS.map((t) => {
    const n = t.key === "academics" ? acCount : ecCount;
    return {
      key: t.key,
      label: (
        <span style={{ whiteSpace: "nowrap" }}>
          {isMobile ? t.short : t.label}
          {n > 0 && (
            <>
              <span aria-hidden="true" style={{ marginLeft: 7, fontVariantNumeric: "tabular-nums" }}>{n}</span>
              <span style={SR_ONLY}>, {plural(n, "item", "items")}</span>
            </>
          )}
        </span>
      ),
    };
  });

  const tabMotion = reduce ? {} : { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.3 } };
  const rowPatch = (table, listKey) => (row, v) => patch(table, listKey, row, v);
  const rowRemove = (table, listKey) => (row) => remove(table, listKey, row);

  const goToGpa = () => { setTab("academics"); focusOn("[data-gpa-first]"); };
  // A class added from a year's own Add (or the read-back) starts in that
  // year, at the level of the class before it.
  const addCourse = (grade = null, level = null) => {
    const values = { name: "", ...(grade != null && { grade_level: grade }), ...(level && { level }) };
    add("student_courses", "courses", values, "a class", grade != null ? `courses:${grade}` : "courses");
  };
  const openExport = () => {
    if (exportsLeft === 0) { setLimitModal("resume_export"); return; }
    setExportError(null);
    setExportOpen(true);
  };
  // Hidden until there is something to put on a resume: an empty record would
  // only lead to a disabled download.
  // In the header at every width, so it is never 4,800px down a phone. The
  // budget shows on the button itself: there is only LIMITS.resume_export.
  const exportButton = hasContent && (
    <Button kind="secondary" onClick={openExport} style={isMobile ? { width: "100%" } : { flexShrink: 0 }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
      </svg>
      Export resume
      <span style={{ fontWeight: 600, color: TEXT_MUTED, fontVariantNumeric: "tabular-nums" }}>
        <span style={SR_ONLY}>, </span>{exportsLeft > 0 ? `${exportsLeft} left` : "none left"}
      </span>
    </Button>
  );
  const uploadErrorNotice = uploadError && (
    <Notice tone="error" style={{ marginTop: 14 }} onDismiss={() => setUploadError(null)}>{uploadError}</Notice>
  );

  return (
    <div data-sidebar-offset className="ui-page" style={pagePad}>
      <div style={{ maxWidth: 880, margin: "0 auto", width: "100%" }}>

        <PageHeader title="Portfolio" isMobile={isMobile} action={exportButton}>
          <p style={{ margin: 0 }}>
            Your grades, scores, classes, activities and awards, all in one place. Your advisor in{" "}
            <button onClick={() => navigate("/chat")} className={`${FOCUS_CLASS} ${LINK_CLASS}`}
              style={{ fontFamily: SANS, fontSize: "inherit", color: textOnPage(ink), fontWeight: 700, background: "none",
                border: "none", padding: 0, cursor: "pointer", borderRadius: 4 }}>
              Chat
            </button>{" "}
            reads all of it, so the more you fill in, the more specific its advice. Changes save as you type.
          </p>
        </PageHeader>

        {/* One file input for the whole page, so the Start here line and the
            upload card run the same upload from either tab. */}
        <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.md" style={{ display: "none" }}
          onChange={(e) => handleFile(e.target.files?.[0])} />

        {!hasContent && (
          <Tip name="Start here" title="Begin with your grades, or a resume" stamp="scroll" tone="accent"
            style={{ marginBottom: "1.25rem" }}>
            <p style={{ margin: "0 0 12px" }}>
              Add your GPA and this year's classes, or upload a resume and we'll pull out your activities and awards for you to check.
            </p>
            {/* On a phone the two stack full width, as Quest's notices do. */}
            <div style={isMobile ? { display: "grid", gap: 8 } : { display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Button kind="primary" busy={uploading} onClick={pickFile}>
                {uploading ? "Reading it…" : "Upload a file"}
              </Button>
              <Button kind="quiet" onClick={goToGpa}>Add my GPA</Button>
            </div>
            {uploadErrorNotice}
          </Tip>
        )}

        <div style={{ marginBottom: "1.25rem" }}>
          <ChoiceChips label="Portfolio section" hideLabel isMobile={isMobile} tabs={PF_TABS}
            options={tabOptions} value={tab} onChange={(k) => setTab(k)} />
        </div>

        {tab === "academics" && (
          <motion.div key="academics" {...tabMotion} {...tabPanelProps(PF_TABS, "academics")}>
            <GpaBlock profile={record.profile} status={status.gpa} onSave={saveGpaNow} />

            <SectionCard id="scores" title="Test scores" stamp="answersheet" count={record.scores.length} status={status.scores}
              isMobile={isMobile} hint="SAT, ACT, PSAT and AP exam results."
              action={<AddButton busy={adding === "scores"}
                onClick={() => add("student_test_scores", "scores", { test_type: "sat", section_scores: {} }, "a score")}>Add score</AddButton>}>
              {record.scores.length === 0
                ? <EmptyNote>None yet. Add a score when you have one, or leave this empty if you're going test-optional.</EmptyNote>
                : <RecordList>{record.scores.map((s) => (
                    <ScoreLine key={s.id} score={s} startOpen={s.id === justAdded} status={status.scores}
                      onPatch={(v) => patch("student_test_scores", "scores", s, v)}
                      onRemove={() => remove("student_test_scores", "scores", s)} />
                  ))}</RecordList>}
            </SectionCard>

            <SectionCard id="courses" title="Coursework" stamp="notebook" count={record.courses.length} status={status.courses}
              isMobile={isMobile} hint="Admissions reads how hard your classes were, year by year, so tag each one's level and grade."
              action={<AddButton busy={adding === "courses"}
                onClick={() => addCourse()}>Add course</AddButton>}>
              {record.courses.length === 0
                ? <EmptyNote>None yet. Start with this year's classes.</EmptyNote>
                : <CourseList courses={record.courses} justAdded={justAdded} status={status.courses} adding={adding}
                    onAdd={({ grade, level }) => addCourse(grade, level)}
                    onPatch={rowPatch("student_courses", "courses")} onRemove={rowRemove("student_courses", "courses")} />}
            </SectionCard>
          </motion.div>
        )}

        {tab === "ecs" && (
          <motion.div key="ecs" {...tabMotion} {...tabPanelProps(PF_TABS, "ecs")}>
            {/* Upload lives on this tab: it parses activities and awards, not academics. */}
            <SectionCard title="Have a resume or brag sheet?" stamp="resume" saves={false} isMobile={isMobile}
              hint="Upload a .pdf, .docx, .txt or .md file and we'll pull out your activities and awards. You review everything before it's added."
              action={(
                // The budget sits inside the button, as on Export resume.
                <Button kind={hasContent && !record.activities.length ? "primary" : "secondary"} busy={uploading} onClick={pickFile}
                  style={isMobile ? { width: "100%" } : undefined}>
                  {uploading ? "Reading it…" : (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                      Upload a file
                      <span style={{ fontWeight: 600, opacity: hasContent && !record.activities.length ? 0.85 : 1,
                        color: hasContent && !record.activities.length ? "inherit" : TEXT_MUTED, fontVariantNumeric: "tabular-nums" }}>
                        <span style={SR_ONLY}>, </span>{uploadsLeft > 0 ? `${uploadsLeft} left` : "none left"}
                      </span>
                    </>
                  )}
                </Button>
              )}>
              {hasContent && uploadErrorNotice}
            </SectionCard>

            <SectionCard id="activities" title="Activities" stamp="rocket" count={record.activities.length} status={status.activities}
              isMobile={isMobile}
              hint="Clubs, sports, jobs, family responsibilities, projects, volunteering, research. Open one with Edit to fill in your role, hours and what you actually did."
              action={<AddButton busy={adding === "activities"}
                onClick={() => add("student_activities", "activities", { title: "", detail_level: "name_only", grade_levels: [] }, "an activity")}>Add activity</AddButton>}>
              {record.activities.length === 0
                ? <EmptyNote>None yet. Add an activity, or upload a resume above.</EmptyNote>
                : <RecordList>{record.activities.map((a) => (
                    <ActivityLine key={a.id} activity={a} startOpen={a.id === justAdded} status={status.activities}
                      onPatch={(v) => patch("student_activities", "activities", a, v)}
                      onRemove={() => remove("student_activities", "activities", a)} />
                  ))}</RecordList>}
            </SectionCard>

            <SectionCard id="awards" title="Awards and honors" stamp="trophy" count={record.awards.length} status={status.awards}
              isMobile={isMobile} hint="Anything you were recognized for, at any level."
              action={<AddButton busy={adding === "awards"}
                onClick={() => add("student_awards", "awards", { title: "" }, "an award")}>Add award</AddButton>}>
              {record.awards.length === 0
                ? <EmptyNote>None yet, and that's common. Many students have few or none, so add what you have and leave it there.</EmptyNote>
                : <RecordList>{record.awards.map((w) => (
                    <AwardLine key={w.id} award={w} startOpen={w.id === justAdded} status={status.awards}
                      onPatch={(v) => patch("student_awards", "awards", w, v)}
                      onRemove={() => remove("student_awards", "awards", w)} />
                  ))}</RecordList>}
            </SectionCard>
          </motion.div>
        )}

      </div>

      <AnimatePresence>
        {extracted && (
          <ReviewSheet key="review" rows={extracted} saving={addingExtracted}
            onConfirm={confirmExtracted} onClose={() => setExtracted(null)} />
        )}
        {exportOpen && (
          <ExportSheet key="export" record={record} contact={record.profile.resume_contact}
            exportsLeft={exportsLeft} generating={exporting} error={exportError}
            onGenerate={handleExport} onClose={() => setExportOpen(false)} />
        )}
      </AnimatePresence>

      <Toast notice={notice} onDismiss={() => setNotice(null)} isMobile={isMobile} sidebar={SIDEBAR_WIDTH} />

      {limitModal && <LimitModal feature={limitModal} onClose={() => setLimitModal(null)} />}
    </div>
  );
}
