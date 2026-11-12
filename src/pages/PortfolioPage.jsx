import { useState, useEffect, useRef, useId } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { supabase } from "../lib/supabase.js";
import { requireUser } from "../lib/auth.js";
import { fetchUsage, LIMITS } from "../lib/usage.js";
import LimitModal from "../components/common/LimitModal.jsx";
import Spinner from "../components/common/Spinner.jsx";
import { SIDEBAR_WIDTH } from "../components/common/Sidebar.jsx";
import { useIsMobile } from "../hooks/useIsMobile.js";
import { useQuest } from "../lib/QuestContext.jsx";
import { isEnabled } from "../lib/features.js";
import {
  fetchRecord, addRow, updateRow, deleteRow, saveGpa, saveContact,
  addExtracted, generateResume,
} from "../lib/portfolio.js";
import {
  BG, BORDER, DANGER, FOCUS_CLASS, RADIUS, SANS, SURFACE, TEXT, TEXT_MID, TEXT_MUTED, WHITE, useAgentInk,
} from "../components/ui/tokens.js";
import {
  Button, Card, ChoiceChips, FieldLabel, Heading, INPUT_CLASS, LINK_CLASS, Notice, PageHeader, RemoveButton, Sheet,
  StampTile, Tip, Toast, inputStyle, pageStyle, textOnPage,
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

// Hover and keyboard focus share one tint, so a keyboard user sees what a
// mouse user sees. Built from the kit's tokens.
const PAGE_CSS = `
.pf-quiet { color: ${TEXT_MID}; background: none; transition: color 0.15s, background 0.15s; }
.pf-quiet:hover, .pf-quiet:focus-visible { color: ${TEXT}; background: ${BG}; }
`;

// ─── Small shared UI ──────────────────────────────────────────────────────────

/** A labelled field: the kit's label tied to its control by id. `children`
 *  is a function of that id. */
function Field({ label, style, children }) {
  const id = useId();
  return (
    <div style={{ minWidth: 0, ...style }}>
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
// line up (a native select otherwise renders a few pixels off an input).
const CONTROL_HEIGHT = 48;

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

const fieldHint = { fontFamily: SANS, fontSize: "0.92rem", fontWeight: 600, color: TEXT_MID, lineHeight: 1.45, margin: "6px 0 0" };

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

const quietCtl = {
  flexShrink: 0, minHeight: 44, minWidth: 44, padding: "0 10px", border: "none", borderRadius: RADIUS.control,
  cursor: "pointer", fontFamily: SANS, fontWeight: 700, fontSize: "0.95rem", display: "inline-flex",
  alignItems: "center", justifyContent: "center", gap: 6, boxSizing: "border-box",
};

/** Opens and closes an item's editor: "Edit", then "Done". */
function EditToggle({ open, onClick, name, controls }) {
  return (
    <button type="button" onClick={onClick} aria-expanded={open} aria-controls={controls}
      aria-label={open ? `Done editing ${name}` : `Edit ${name}`} className={`${FOCUS_CLASS} pf-quiet`} style={quietCtl}>
      {open ? <PixelStamp kind="check" size={16} /> : <PencilIcon />}
      {open ? "Done" : "Edit"}
    </button>
  );
}

/** The quiet save line in a section header, beside the count. */
function SaveStatus({ state }) {
  if (!state) return null;
  const text = { saving: "Saving…", saved: "Saved", error: "Not saved" }[state];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: SANS, fontSize: "0.95rem",
      fontWeight: 600, color: state === "error" ? DANGER : TEXT_MUTED, whiteSpace: "nowrap" }}>
      {state === "saved" && <PixelStamp kind="check" size={16} />}
      {text}
    </span>
  );
}

/** A record section: the kit card with a pixel mark, the title, count and
 *  save status, an action on the right and a line of guidance under it. */
function SectionCard({ id, title, stamp, hint, count, status, action, children }) {
  const headId = useId();
  return (
    <Card as="section" id={id ? `sec-${id}` : undefined} tabIndex={id ? -1 : undefined} aria-labelledby={headId}
      className={FOCUS_CLASS} style={{ padding: "1.3rem 1.3rem 1.4rem", marginBottom: "1.25rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
        marginBottom: hint ? 8 : 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flexWrap: "wrap" }}>
          <StampTile kind={stamp} />
          <Heading id={headId}>
            {title}
            {count != null && count > 0 && (
              <span style={{ fontWeight: 700, fontSize: "1rem", color: TEXT_MUTED, marginLeft: 8,
                fontVariantNumeric: "tabular-nums" }}>{count}</span>
            )}
          </Heading>
          <SaveStatus state={status} />
        </div>
        {action}
      </div>
      {hint && (
        <p style={{ fontFamily: SANS, fontSize: "1rem", fontWeight: 500, color: TEXT_MUTED, lineHeight: 1.55,
          margin: "0 0 16px", maxWidth: "62ch" }}>
          {hint}
        </p>
      )}
      {children}
    </Card>
  );
}

function AddButton({ onClick, children, busy }) {
  return (
    <Button kind="secondary" onClick={onClick} busy={busy} style={{ padding: "8px 14px" }}>
      {!busy && <PlusIcon />}
      {children}
    </Button>
  );
}

/** An empty section: the guide line says what goes here. */
function EmptyNote({ children }) {
  return (
    <Tip name="Tip" stamp="scroll" tone="default" style={{ paddingTop: 0 }}>
      {children}
    </Tip>
  );
}

/** One item in a record section: a smaller card inside the section's. */
const itemCard = { padding: "12px 14px", marginBottom: 10, borderRadius: RADIUS.control };
/** The top line of an always-open item: what it is, and Remove. */
const itemHead = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, margin: "-6px -8px 6px 0" };
const itemName = { fontFamily: SANS, fontWeight: 700, fontSize: "1rem", color: TEXT, minWidth: 0, overflowWrap: "anywhere" };

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

  return (
    <SectionCard id="gpa" title="GPA" stamp="reportcard" status={status}
      hint="Admissions reads unweighted GPA first, alongside how hard your classes are.">
      <div style={{ marginBottom: 16 }}>
        <ChoiceChips label="Scale" labelAbove options={GPA_SCALES} value={vals.gpaScale}
          onChange={(k) => { setVals((prev) => ({ ...prev, gpaScale: k })); save({ gpaScale: k }); }} />
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
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
          <Field label="Unweighted" style={{ flex: 1, minWidth: 140 }}>
            {(id) => (
              <NumberInput id={id} value={vals.gpaUnweighted} decimal placeholder="e.g. 3.8" range={range}
                onCommit={set("gpaUnweighted")} onBlur={() => save()} />
            )}
          </Field>
          <Field label="Weighted" style={{ flex: 1, minWidth: 140 }}>
            {(id) => (
              <NumberInput id={id} value={vals.gpaWeighted} decimal placeholder="Optional"
                onCommit={set("gpaWeighted")} onBlur={() => save()} />
            )}
          </Field>
        </div>
      )}
    </SectionCard>
  );
}

function ScoreRow({ score, onPatch, onRemove }) {
  const type = (score.test_type || "").toLowerCase();
  const isAp = type === "ap";
  const r = TEST_RANGES[type] || {};
  const hasSections = type === "sat" || type === "psat";
  const sub = score.section_scores || {};
  const rw = Number(sub.reading_writing), math = Number(sub.math);
  const sum = hasSections && sub.reading_writing != null && sub.math != null && Number.isFinite(rw) && Number.isFinite(math)
    ? rw + math : null;
  const offerSum = sum != null && Number(score.score) !== sum;
  const name = rowName("scores", score);

  return (
    <Card data-row={score.id} tabIndex={-1} style={itemCard}>
      <div style={itemHead}>
        <span style={itemName}>
          {isAp ? (score.subject ? `AP ${score.subject}` : "AP exam") : (labelFor(TEST_TYPES, type) || "New score")}
        </span>
        <RemoveButton onClick={onRemove} name={name} />
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
        <Field label="Test" style={{ flex: "1 1 110px" }}>
          {(id) => (
            <Select id={id} data-first="" value={type} placeholder="Type" onChange={(v) => onPatch({ test_type: v })}
              options={TEST_TYPES} />
          )}
        </Field>
        {isAp && (
          <Field label="Subject" style={{ flex: "2 1 160px" }}>
            {(id) => <Input id={id} value={score.subject} onChange={(v) => onPatch({ subject: v })} placeholder="e.g. Chemistry" />}
          </Field>
        )}
        <Field label={isAp ? "Score (1-5)" : "Total"} style={{ flex: "1 1 110px" }}>
          {(id) => (
            <NumberInput id={id} value={score.score} range={r.total} placeholder={r.ph || "Score"}
              onCommit={(n) => onPatch({ score: n })} />
          )}
        </Field>
        {hasSections && (
          <>
            <Field label="Reading/Writing" style={{ flex: "1 1 110px" }}>
              {(id) => (
                <NumberInput id={id} value={sub.reading_writing} range={r.section} placeholder={r.sph}
                  onCommit={(n) => onPatch({ section_scores: { ...sub, reading_writing: n ?? undefined } })} />
              )}
            </Field>
            <Field label="Math" style={{ flex: "1 1 110px" }}>
              {(id) => (
                <NumberInput id={id} value={sub.math} range={r.section} placeholder={r.sph}
                  onCommit={(n) => onPatch({ section_scores: { ...sub, math: n ?? undefined } })} />
              )}
            </Field>
          </>
        )}
      </div>
      {offerSum && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
          <p style={{ ...fieldHint, margin: 0 }}>Your sections add up to {sum}.</p>
          <Button kind="quiet" style={{ padding: "6px 10px" }} onClick={() => onPatch({ score: sum })}>
            Use {sum} as the total
          </Button>
        </div>
      )}
    </Card>
  );
}

/** A class reads as one line (its name and level) until Edit opens it. */
function CourseLine({ course, onPatch, onRemove, startOpen }) {
  const [open, setOpen] = useState(!!startOpen);
  const editId = useId();
  const c = course;
  const name = rowName("courses", c);
  const meta = [labelFor(COURSE_LEVELS, c.level) || "Level not set", c.planned ? "Planned" : null].filter(Boolean).join(" · ");
  return (
    <Card data-row={c.id} tabIndex={-1} style={{ ...itemCard, padding: 0, overflow: "hidden", marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 6px 6px 14px" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ ...itemName, display: "block" }}>{c.name || "Untitled class"}</span>
          <span style={{ display: "block", fontFamily: SANS, fontSize: "0.95rem", fontWeight: 600,
            color: c.level ? TEXT_MID : TEXT_MUTED, lineHeight: 1.45 }}>
            {meta}
          </span>
        </div>
        <EditToggle open={open} onClick={() => setOpen((o) => !o)} name={c.name || "class"} controls={editId} />
      </div>
      {open && (
        <div id={editId} style={{ padding: "14px", borderTop: `1px solid ${BORDER}`, background: SURFACE }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
            <Field label="Class" style={{ flex: "3 1 200px" }}>
              {(id) => <Input id={id} data-first="" value={c.name} onChange={(v) => onPatch({ name: v })} placeholder="e.g. AP Biology" />}
            </Field>
            <Field label="Level" style={{ flex: "1 1 140px" }}>
              {(id) => <Select id={id} value={c.level} onChange={(v) => onPatch({ level: v })} options={COURSE_LEVELS} />}
            </Field>
            <Field label="Grade" style={{ flex: "1 1 120px" }}>
              {(id) => (
                <Select id={id} value={c.grade_level != null ? String(c.grade_level) : ""} options={GRADE_OPTIONS}
                  onChange={(v) => onPatch({ grade_level: v ? Number(v) : null })} />
              )}
            </Field>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8, marginRight: -6 }}>
            <RemoveButton onClick={onRemove} name={name} />
          </div>
        </div>
      )}
    </Card>
  );
}

/** Classes grouped by the year they were taken, since admissions reads rigor
 *  year by year. */
function CourseList({ courses, onPatch, onRemove, justAdded }) {
  const inGrade = (c, g) => Number(c.grade_level) === g;
  const groups = [
    ...GRADES.map((g) => ({ key: g, label: `Grade ${g}`, rows: courses.filter((c) => inGrade(c, g)) })),
    { key: "none", label: "Grade not set", rows: courses.filter((c) => !GRADES.some((g) => inGrade(c, g))) },
  ].filter((g) => g.rows.length);
  const titled = groups.length > 1 || groups[0]?.key !== "none";
  return groups.map((g) => (
    <div key={g.key} style={{ marginBottom: 14 }}>
      {titled && (
        <Heading level={3} style={{ fontSize: "1rem", color: TEXT_MID, margin: "0 0 8px" }}>{g.label}</Heading>
      )}
      {g.rows.map((c) => (
        <CourseLine key={c.id} course={c} startOpen={c.id === justAdded}
          onPatch={(v) => onPatch(c, v)} onRemove={() => onRemove(c)} />
      ))}
    </div>
  ));
}

// ─── ECs / Awards ─────────────────────────────────────────────────────────────

function ActivityCard({ activity, onPatch, onRemove, startOpen }) {
  const ink = useAgentInk();
  const reduce = useReducedMotion();
  const editId = useId();
  const [open, setOpen] = useState(!!startOpen);
  const a = activity;
  const meta = [
    a.position, a.organization,
    a.hours_per_week && a.weeks_per_year ? `${a.hours_per_week} hrs/wk, ${a.weeks_per_year} wks/yr` : null,
    (a.grade_levels || []).length ? `${(a.grade_levels || []).length === 1 ? "Grade" : "Grades"} ${(a.grade_levels || []).join(", ")}` : null,
  ].filter(Boolean);

  return (
    <Card data-row={a.id} tabIndex={-1} style={{ ...itemCard, padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "8px 8px 12px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ flex: 1, minWidth: 0, fontFamily: SANS, fontWeight: 700, fontSize: "1.05rem", color: TEXT,
            overflowWrap: "anywhere" }}>
            {a.title || "New activity"}
          </div>
          <EditToggle open={open} onClick={() => setOpen((o) => !o)} name={a.title || "activity"} controls={editId} />
        </div>
        <div style={{ paddingRight: 6 }}>
          {meta.length > 0 && (
            <div style={{ fontFamily: SANS, fontSize: "0.95rem", fontWeight: 600, color: TEXT_MID, lineHeight: 1.5 }}>
              {meta.join(" · ")}
            </div>
          )}
          {a.description && (
            <p style={{ fontFamily: SANS, fontSize: "0.95rem", color: TEXT_MUTED, lineHeight: 1.55, margin: "7px 0 0" }}>
              {a.description}
            </p>
          )}
          {!a.description && !a.position && !open && (
            <span style={{ display: "inline-block", fontFamily: SANS, fontSize: "0.9rem", fontWeight: 700, color: ink.onSoft,
              background: ink.softer, border: `1px solid ${ink.soft}`, borderRadius: RADIUS.pill, padding: "3px 10px",
              marginTop: 8 }}>
              Needs detail
            </span>
          )}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div id={editId} initial={reduce ? false : { height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.22 }} style={{ overflow: "hidden", background: SURFACE }}>
            <div style={{ padding: "16px 14px", borderTop: `1px solid ${BORDER}` }}>
              <Field label="Name" style={{ marginBottom: 14 }}>
                {(id) => <Input id={id} data-first="" value={a.title} onChange={(v) => onPatch({ title: v })} placeholder="e.g. Debate team" />}
              </Field>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
                <Field label="Your role" style={{ flex: 1, minWidth: 150 }}>
                  {(id) => <Input id={id} value={a.position} maxLength={50} onChange={(v) => onPatch({ position: v })} placeholder="e.g. Captain" />}
                </Field>
                <Field label="Organization" style={{ flex: 1, minWidth: 150 }}>
                  {(id) => <Input id={id} value={a.organization} maxLength={100} onChange={(v) => onPatch({ organization: v })} />}
                </Field>
              </div>
              <DescriptionField value={a.description} onChange={(v) => onPatch({ description: v })} />
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start", marginBottom: 14 }}>
                <Field label="Hours / week" style={{ flex: "1 1 120px", maxWidth: 200 }}>
                  {(id) => (
                    <NumberInput id={id} value={a.hours_per_week} decimal range={HOURS_RANGE}
                      onCommit={(n) => onPatch({ hours_per_week: n })} />
                  )}
                </Field>
                <Field label="Weeks / year" style={{ flex: "1 1 120px", maxWidth: 200 }}>
                  {(id) => (
                    <NumberInput id={id} value={a.weeks_per_year} range={WEEKS_RANGE}
                      onCommit={(n) => onPatch({ weeks_per_year: n })} />
                  )}
                </Field>
              </div>
              <div style={{ marginBottom: 14 }}>
                <ChoiceChips label="Grades involved" labelAbove multi options={GRADE_CHIPS} value={a.grade_levels || []}
                  onChange={(v) => onPatch({ grade_levels: v })} />
              </div>
              <ChoiceChips label="When" labelAbove options={TIMINGS} value={a.timing}
                onChange={(k) => onPatch({ timing: k })} />
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12, marginRight: -6 }}>
                <RemoveButton onClick={onRemove} name={rowName("activities", a)} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
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

function AwardRow({ award, onPatch, onRemove }) {
  return (
    <Card data-row={award.id} tabIndex={-1} style={itemCard}>
      <div style={itemHead}>
        <span style={itemName}>{award.title || "New award"}</span>
        <RemoveButton onClick={onRemove} name={rowName("awards", award)} />
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
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
    </Card>
  );
}

// ─── Read-back ────────────────────────────────────────────────────────────────

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** What the current tab holds and what is thin, said plainly. Null when the
 *  tab is empty, since each empty section already says what goes there. */
function readBack(tab, record) {
  const { profile, courses, scores, activities } = record;
  if (tab === "academics") {
    const hasGpa = profile.gpa_unweighted != null || profile.gpa_weighted != null;
    const gpaNotUsed = normScale(profile.gpa_scale) === "not_used";
    if (!hasGpa && !gpaNotUsed && !courses.length && !scores.length) return null;
    const gaps = [];
    if (!hasGpa && !gpaNotUsed) gaps.push("No GPA yet. Add it, or choose Not used if your school doesn't give one.");
    const noLevel = courses.filter((c) => !c.level).length;
    if (noLevel) gaps.push(`${plural(noLevel, "class has", "classes have")} no level yet.`);
    const noGrade = courses.filter((c) => !GRADES.includes(Number(c.grade_level))).length;
    if (noGrade) gaps.push(`${plural(noGrade, "class has", "classes have")} no grade yet, so ${noGrade === 1 ? "it isn't" : "they aren't"} placed in a year.`);
    const aside = scores.length ? null : "No test scores, which is fine if you're applying test-optional.";
    const done = courses.length ? "Your GPA is in, and every class has a level and grade." : "Your GPA is in. Add your classes below.";
    return { gaps, aside, done };
  }
  // Awards alone have nothing to read back, and an empty Activities section
  // already says what goes there.
  if (!activities.length) return null;
  const gaps = [];
  const thin = activities.filter((a) => !a.description && !a.position).length;
  if (thin) gaps.push(`${plural(thin, "activity still needs", "activities still need")} a role or what you did.`);
  const noHours = activities.filter((a) => !a.hours_per_week || !a.weeks_per_year).length;
  if (noHours) gaps.push(`${plural(noHours, "activity has", "activities have")} no hours yet. Applications ask for hours a week and weeks a year.`);
  return { gaps, aside: null, done: "Every activity has its details filled in." };
}

function ReadBack({ data }) {
  if (!data) return null;
  const { gaps, aside, done } = data;
  return (
    <Tip name="Your record" stamp={gaps.length ? "scroll" : "check"} tone="default" style={{ marginBottom: "1.25rem", paddingTop: 0 }}>
      {gaps.length ? (
        <>
          <p style={{ margin: "0 0 4px", fontWeight: 800 }}>
            {gaps.length === 1 ? "One thing to fill in" : `${gaps.length} things to fill in`}
          </p>
          <ul style={{ margin: 0, paddingLeft: "1.2em", fontWeight: 500, color: TEXT_MID, lineHeight: 1.55 }}>
            {gaps.map((g) => <li key={g}>{g}</li>)}
          </ul>
          {aside && <p style={{ margin: "6px 0 0", fontWeight: 500, color: TEXT_MID }}>{aside}</p>}
        </>
      ) : (
        <>
          <span style={{ fontWeight: 800 }}>{done}</span>
          {aside && <span style={{ fontWeight: 500, color: TEXT_MID }}> {aside}</span>}
        </>
      )}
    </Tip>
  );
}

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
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: SANS, fontSize: "0.9rem",
                fontWeight: 700, color: ink.onSoft, background: ink.softer, border: `1px solid ${ink.soft}`,
                borderRadius: RADIUS.pill, padding: "2px 10px", marginBottom: 6 }}>
                <PixelStamp kind={r.kind === "award" ? "star" : "scroll"} size={16} />
                {r.kind === "award" ? "Award" : "Activity"}
              </span>
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

function ExportSheet({ record, contact: initialContact, exportsLeft, generating, error, onGenerate, onClose }) {
  const ink = useAgentInk();
  const headId = useId();
  const [contact, setContact] = useState(() => ({ ...EMPTY_CONTACT, ...(initialContact || {}) }));
  const hasGpa = Boolean(record.profile.gpa_unweighted || record.profile.gpa_weighted);
  const [includeGpa, setIncludeGpa] = useState(hasGpa);
  const [sel, setSel] = useState(() => ({
    activity_ids: new Set(record.activities.map((r) => r.id)),
    award_ids:    new Set(record.awards.map((r) => r.id)),
    course_ids:   new Set(record.courses.map((r) => r.id)),
    score_ids:    new Set(record.scores.map((r) => r.id)),
  }));

  const toggle = (key) => (id) => setSel((prev) => {
    const next = new Set(prev[key]);
    if (next.has(id)) next.delete(id); else next.add(id);
    return { ...prev, [key]: next };
  });
  const setLink = (i, k) => (v) => setContact((c) => ({ ...c, links: c.links.map((l, j) => (j === i ? { ...l, [k]: v } : l)) }));

  const total = Object.values(sel).reduce((n, s) => n + s.size, 0) + (includeGpa ? 1 : 0);
  const blocked = generating || total === 0 || exportsLeft === 0;

  return (
    <Sheet onClose={onClose} locked={generating} labelledBy={headId} width={660}>
      <SheetTitle id={headId}>Export as a resume</SheetTitle>
      <p style={sheetLead}>
        A one-page PDF built from whatever you pick, across both tabs.
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
              {[record.profile.gpa_unweighted && `${record.profile.gpa_unweighted} unweighted`,
                record.profile.gpa_weighted && `${record.profile.gpa_weighted} weighted`].filter(Boolean).join(", ")}
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

      {error && (
        <Notice tone="error" style={{ marginBottom: 12 }}>{error}</Notice>
      )}

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <Button kind="secondary" onClick={onClose} disabled={generating} style={{ flex: "0 0 auto" }}>
          Cancel
        </Button>
        <Button kind="primary" disabled={blocked} busy={generating}
          onClick={() => onGenerate({
            activity_ids: [...sel.activity_ids], award_ids: [...sel.award_ids],
            course_ids: [...sel.course_ids], score_ids: [...sel.score_ids],
            include_gpa: includeGpa,
          }, contact)}
          style={{ flex: 1, minWidth: 180 }}>
          {generating ? "Building your PDF…" : `Download PDF (${total})`}
        </Button>
      </div>
      <p style={{ fontFamily: SANS, fontSize: "0.92rem", fontWeight: 600, color: TEXT_MUTED, textAlign: "center", margin: "12px 0 0" }}>
        {exportsLeft > 0
          ? `You can export ${plural(exportsLeft, "more resume", "more resumes")}.`
          : "You have used all your resume exports."}
      </p>
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
  { key: "academics", label: "Academics" },
  { key: "ecs",       label: "ECs / Awards" },
];

export default function PortfolioPage({ navigate }) {
  const isMobile = useIsMobile();
  const reduce = useReducedMotion();
  const ink = useAgentInk();
  const { summary: questSummary } = useQuest();
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
  const [collegeCount, setCollegeCount] = useState(null);   // null until known
  const [notice, setNotice] = useState(null);               // { text, error, action, undo }
  const [adding, setAddingTo] = useState(null);             // the list an Add is waiting on
  const [justAdded, setJustAdded] = useState(null);         // opens a new class or activity
  const fileRef = useRef(null);
  const focusNext = useRef(null);
  const { status, begin, end } = useSaveStatus();

  useEffect(() => {
    (async () => {
      try {
        const user = await requireUser();
        if (!user) return;
        setUserId(user.id);
        const [rec, usage] = await Promise.all([fetchRecord(user.id), fetchUsage(supabase)]);
        setRecord(rec);
        // Only decides whether to offer College List, so a failure hides the
        // card rather than the page.
        if (isEnabled("colleges")) {
          supabase.from("college_list_items").select("id", { count: "exact", head: true }).eq("user_id", user.id)
            .then(({ count, error }) => { if (!error) setCollegeCount(count ?? 0); }, () => {});
        }
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

  const add = async (table, listKey, values, what) => {
    setNotice(null);
    setAddingTo(listKey);
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
        action: actionBtn("Try again", () => add(table, listKey, values, what)) });
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

  const handleFile = async (file) => {
    if (!file) return;
    setUploadError(null);
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

  // One next step under the header, once there is a record to build on. The
  // first quest comes first (it is offered right after onboarding, and only
  // to someone who has never had one), then the college list.
  const questNudge = isEnabled("quest") && questSummary && !questSummary.ever && !questSummary.has_quest;
  const collegeNudge = isEnabled("colleges") && collegeCount === 0;
  const nextStep = !hasContent ? null
    : questNudge ? {
        stamp: "flag", title: "Start your first quest", to: "/quest", cta: "Find a quest",
        body: "Pick one project and move it forward a little every day. We'll suggest a few based on your record.",
      }
    : collegeNudge ? {
        stamp: "target", title: "Build your college list", to: "/college-list", cta: "Start my list",
        body: "Add the schools you are thinking about, and we will sort them into reach, target and likely using real admissions data.",
      }
    : null;

  const ecCount = record.activities.length + record.awards.length;
  const acCount = record.courses.length + record.scores.length;
  const exportsLeft = Math.max(0, LIMITS.resume_export - exportsUsed);
  const uploadsLeft = Math.max(0, LIMITS.portfolio_upload - uploadsUsed);

  const tabOptions = TABS.map((t) => {
    const n = t.key === "academics" ? acCount : ecCount;
    return {
      key: t.key,
      label: (
        <>
          {t.label}
          {n > 0 && <span style={{ marginLeft: 7, fontVariantNumeric: "tabular-nums" }}>{n}</span>}
        </>
      ),
    };
  });

  const tabMotion = reduce ? {} : { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.3 } };
  const rowPatch = (table, listKey) => (row, v) => patch(table, listKey, row, v);
  const rowRemove = (table, listKey) => (row) => remove(table, listKey, row);

  return (
    <div data-sidebar-offset className="ui-page" style={pagePad}>
      <style>{PAGE_CSS}</style>
      <div style={{ maxWidth: 880, margin: "0 auto", width: "100%" }}>

        <PageHeader title="Portfolio" isMobile={isMobile} style={{ marginBottom: "1.75rem" }}>
          <p style={{ margin: 0 }}>
            Your grades, scores, classes, activities and awards, all in one place. Your advisor in{" "}
            <button onClick={() => navigate("/chat")} className={`${FOCUS_CLASS} ${LINK_CLASS}`}
              style={{ fontFamily: SANS, fontSize: "inherit", color: textOnPage(ink), fontWeight: 700, background: "none",
                border: "none", padding: 0, cursor: "pointer", borderRadius: 4 }}>
              Chat
            </button>{" "}
            reads all of it, so the more you fill in, the more specific its advice.
          </p>
        </PageHeader>

        {nextStep && (
          <Tip name="Next step" stamp={nextStep.stamp} tone="accent" style={{ marginBottom: "1.5rem", paddingTop: 0 }}>
            <p style={{ fontFamily: SANS, fontWeight: 800, fontSize: "1.05rem", color: TEXT, margin: "0 0 4px" }}>
              {nextStep.title}
            </p>
            <p style={{ fontFamily: SANS, fontSize: "1rem", fontWeight: 500, color: TEXT_MID, lineHeight: 1.55, margin: "0 0 12px" }}>
              {nextStep.body}
            </p>
            <Button kind="primary" onClick={() => navigate(nextStep.to)}>
              {nextStep.cta}
            </Button>
          </Tip>
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap", marginBottom: "1.25rem" }}>
          <div style={{ flex: isMobile ? "1 1 100%" : "0 1 auto", minWidth: 0 }}>
            <ChoiceChips label="Portfolio section" hideLabel isMobile={isMobile}
              options={tabOptions} value={tab} onChange={(k) => { setTab(k); setJustAdded(null); }} />
          </div>

          <Button kind="secondary" onClick={() => { setExportError(null); setExportOpen(true); }}
            style={isMobile ? { width: "100%" } : undefined}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export resume
          </Button>
        </div>

        <ReadBack data={readBack(tab, record)} />

        {tab === "academics" && (
          <motion.div key="academics" {...tabMotion}>
            <GpaBlock profile={record.profile} status={status.gpa} onSave={saveGpaNow} />

            <SectionCard id="scores" title="Test scores" stamp="answersheet" count={record.scores.length} status={status.scores}
              hint="SAT, ACT, PSAT and AP exam results."
              action={<AddButton busy={adding === "scores"}
                onClick={() => add("student_test_scores", "scores", { test_type: "sat", section_scores: {} }, "a score")}>Add score</AddButton>}>
              {record.scores.length === 0
                ? <EmptyNote>Nothing here yet. Add a score when you have one, or leave it empty if you're going test-optional.</EmptyNote>
                : record.scores.map((s) => (
                    <ScoreRow key={s.id} score={s}
                      onPatch={(v) => patch("student_test_scores", "scores", s, v)}
                      onRemove={() => remove("student_test_scores", "scores", s)} />
                  ))}
            </SectionCard>

            <SectionCard id="courses" title="Coursework" stamp="notebook" count={record.courses.length} status={status.courses}
              hint="Admissions reads how hard your classes were, year by year, so tag each one's level and grade."
              action={<AddButton busy={adding === "courses"}
                onClick={() => add("student_courses", "courses", { name: "" }, "a class")}>Add course</AddButton>}>
              {record.courses.length === 0
                ? <EmptyNote>No classes listed yet. Start with this year's.</EmptyNote>
                : <CourseList courses={record.courses} justAdded={justAdded}
                    onPatch={rowPatch("student_courses", "courses")} onRemove={rowRemove("student_courses", "courses")} />}
            </SectionCard>
          </motion.div>
        )}

        {tab === "ecs" && (
          <motion.div key="ecs" {...tabMotion}>
            {/* Upload lives on this tab only: it parses activities and awards, not academics. */}
            <Card style={{ padding: "1.3rem", marginBottom: "1.25rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 220, display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <StampTile kind="resume" />
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontFamily: SANS, fontWeight: 800, fontSize: "1.1rem", color: TEXT, margin: "0 0 4px" }}>
                      Have a resume or brag sheet?
                    </p>
                    <p style={{ fontFamily: SANS, fontSize: "1rem", color: TEXT_MUTED, lineHeight: 1.55, margin: 0 }}>
                      Upload it and we'll pull out your activities and awards. You review everything before it's added.
                    </p>
                  </div>
                </div>
                <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center",
                  width: isMobile ? "100%" : undefined }}>
                  <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.md" style={{ display: "none" }}
                    onChange={(e) => handleFile(e.target.files?.[0])} />
                  <Button kind={record.activities.length ? "secondary" : "primary"} busy={uploading}
                    onClick={() => (uploadsLeft > 0 ? fileRef.current?.click() : setLimitModal("portfolio_upload"))}
                    style={isMobile ? { width: "100%" } : undefined}>
                    {uploading ? "Reading it…" : "Upload a file"}
                  </Button>
                  <p style={{ fontFamily: SANS, fontSize: "0.92rem", fontWeight: 600, color: TEXT_MUTED, textAlign: "center",
                    margin: "7px 0 0", fontVariantNumeric: "tabular-nums" }}>
                    {uploadsLeft > 0 ? `You can upload ${plural(uploadsLeft, "more file", "more files")}.` : "No uploads left."}
                  </p>
                </div>
              </div>
              {uploadError && (
                <Notice tone="error" style={{ marginTop: 14 }} onDismiss={() => setUploadError(null)}>{uploadError}</Notice>
              )}
            </Card>

            <SectionCard id="activities" title="Activities" stamp="rocket" count={record.activities.length} status={status.activities}
              hint="Clubs, sports, jobs, family responsibilities, projects, volunteering, research. Open one with Edit to fill in your role, hours and what you actually did."
              action={<AddButton busy={adding === "activities"}
                onClick={() => add("student_activities", "activities", { title: "", detail_level: "name_only", grade_levels: [] }, "an activity")}>Add activity</AddButton>}>
              {record.activities.length === 0
                ? <EmptyNote>Nothing here yet. Add an activity, or upload a resume above.</EmptyNote>
                : record.activities.map((a) => (
                    <ActivityCard key={a.id} activity={a} startOpen={a.id === justAdded}
                      onPatch={(v) => patch("student_activities", "activities", a, v)}
                      onRemove={() => remove("student_activities", "activities", a)} />
                  ))}
            </SectionCard>

            <SectionCard id="awards" title="Awards and honors" stamp="trophy" count={record.awards.length} status={status.awards}
              hint="Anything you were recognised for, at any level."
              action={<AddButton busy={adding === "awards"}
                onClick={() => add("student_awards", "awards", { title: "" }, "an award")}>Add award</AddButton>}>
              {record.awards.length === 0
                ? <EmptyNote>No awards yet, and that's common. Many students have few or none, so add what you have and leave it there.</EmptyNote>
                : record.awards.map((w) => (
                    <AwardRow key={w.id} award={w}
                      onPatch={(v) => patch("student_awards", "awards", w, v)}
                      onRemove={() => remove("student_awards", "awards", w)} />
                  ))}
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
