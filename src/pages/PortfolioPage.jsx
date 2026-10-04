import { useState, useEffect, useRef, useCallback, useId } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
  Button, Card, ChoiceChips, FieldLabel, Heading, INPUT_CLASS, LINK_CLASS, Notice, PageHeader, StampTile, Tip,
  inputStyle, pageStyle, textOnPage,
} from "../components/ui/kit.jsx";
import { PixelStamp } from "../components/ui/PixelIcons.jsx";

// The Portfolio: the student's record (grades, scores, classes, activities,
// awards) and the resume export. Built on the shared kit: white cards with a
// warm 1px border, flat buttons, a pixel mark per section, and the guide
// bubble for nudges and empty sections.

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
  { value: "4.0",      label: "4.0" },
  { value: "5.0",      label: "5.0" },
  { value: "100",      label: "100 point" },
  { value: "other",    label: "Other" },
  { value: "not_used", label: "Not used" },
];

const TIMINGS = [
  { value: "school_year", label: "School year" },
  { value: "summer",      label: "Summer" },
  { value: "all_year",    label: "All year" },
];

const EMPTY_CONTACT = { email: "", phone: "", location: "", links: [] };

const labelFor = (opts, v) => opts.find((o) => o.value === v)?.label || null;

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

/** The label above a row of chips, which is a group rather than one control. */
function GroupLabel({ id, children }) {
  return (
    <span id={id} style={{ display: "block", marginBottom: 6, fontFamily: SANS, fontWeight: 700, fontSize: "1rem", color: TEXT }}>
      {children}
    </span>
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

function Chips({ options, value, onChange, multi = false, labelledBy }) {
  const ink = useAgentInk();
  const arr = multi ? (value || []) : [];
  const isOn = (v) => (multi ? arr.includes(v) : value === v);
  const toggle = (v) => {
    if (!multi) return onChange(value === v ? null : v);
    onChange(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v].sort((a, b) => a - b));
  };
  return (
    <div role="group" aria-labelledby={labelledBy} style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {options.map((o) => {
        const on = isOn(o.value);
        return (
          <button key={o.value} type="button" onClick={() => toggle(o.value)} aria-pressed={on} className={FOCUS_CLASS}
            style={{
              fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700, cursor: "pointer",
              padding: "0 14px", minHeight: 44, lineHeight: 1.2, borderRadius: RADIUS.pill, boxSizing: "border-box",
              border: `1.5px solid ${on ? ink.text : BORDER}`,
              background: on ? ink.softer : WHITE, color: on ? ink.onSoft : TEXT_MID,
              transition: "background 0.15s, border-color 0.15s",
            }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function IconBtn({ onClick, label, danger, children, style, ...rest }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className={FOCUS_CLASS}
      style={{
        flexShrink: 0, width: 44, height: 44, border: "none", background: "none", cursor: "pointer",
        color: TEXT_MUTED, display: "inline-flex", alignItems: "center", justifyContent: "center",
        padding: 0, borderRadius: RADIUS.control, transition: "color 0.15s, background 0.15s", ...style,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = danger ? DANGER : TEXT;
        e.currentTarget.style.background = danger ? "#fdf1f0" : "rgba(20,20,19,0.05)";
      }}
      onMouseLeave={(e) => { e.currentTarget.style.color = TEXT_MUTED; e.currentTarget.style.background = "none"; }}
      {...rest}>
      {children}
    </button>
  );
}

const XIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);
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

/** A record section: the kit card with a pixel mark, the title and count,
 *  an action on the right and a line of guidance under it. */
function SectionCard({ title, stamp, hint, count, action, children }) {
  return (
    <Card as="section" style={{ padding: "1.3rem 1.3rem 1.4rem", marginBottom: "1.25rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
        marginBottom: hint ? 8 : 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <StampTile kind={stamp} />
          <Heading>
            {title}
            {count != null && count > 0 && (
              <span style={{ fontWeight: 700, fontSize: "1rem", color: TEXT_MUTED, marginLeft: 8,
                fontVariantNumeric: "tabular-nums" }}>{count}</span>
            )}
          </Heading>
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

function AddButton({ onClick, children }) {
  return (
    <Button kind="secondary" onClick={onClick} style={{ padding: "8px 14px" }}>
      <PlusIcon />
      {children}
    </Button>
  );
}

/** An empty section: the guide bubble says what goes here. */
function EmptyNote({ children }) {
  return (
    <Tip name="Tip" stamp="sparkle" tone="default" style={{ paddingTop: 0 }}>
      {children}
    </Tip>
  );
}

/** One item in a record section: a smaller card inside the section's. */
const itemCard = { padding: "12px 14px", marginBottom: 10, borderRadius: RADIUS.control };
/** An item whose remove button is pinned to its top-right corner, clear of the fields. */
const pinnedItem = { ...itemCard, position: "relative", paddingRight: 54 };
const pinnedRemove = { position: "absolute", top: 4, right: 4 };

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

function GpaBlock({ profile, onSave }) {
  const ink = useAgentInk();
  const scaleId = useId();
  const [gpaUnweighted, setU] = useState(profile.gpa_unweighted ?? "");
  const [gpaWeighted, setW]   = useState(profile.gpa_weighted ?? "");
  const [gpaScale, setScale]  = useState(profile.gpa_scale || null);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await onSave({ gpaUnweighted, gpaWeighted, gpaScale });
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (e) {
      console.error("[portfolio] GPA save failed:", e);
    } finally { setSaving(false); }
  };

  const notUsed = gpaScale === "not_used";
  return (
    <SectionCard title="GPA" stamp="grade"
      hint="Admissions reads unweighted GPA first, alongside how hard your classes are.">
      <div style={{ marginBottom: 16 }}>
        <GroupLabel id={scaleId}>Scale</GroupLabel>
        <Chips options={GPA_SCALES} value={gpaScale} onChange={setScale} labelledBy={scaleId} />
      </div>
      {!notUsed && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
          <Field label="Unweighted" style={{ flex: 1, minWidth: 140 }}>
            {(id) => <Input id={id} value={gpaUnweighted} onChange={setU} inputMode="decimal" placeholder="3.87" />}
          </Field>
          <Field label="Weighted" style={{ flex: 1, minWidth: 140 }}>
            {(id) => <Input id={id} value={gpaWeighted} onChange={setW} inputMode="decimal" placeholder="Optional" />}
          </Field>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Button kind="primary" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save GPA"}
        </Button>
        <AnimatePresence>
          {saved && (
            <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: SANS, fontSize: "1rem",
                fontWeight: 700, color: ink.text }}>
              <PixelStamp kind="check" size={16} />
              Saved
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </SectionCard>
  );
}

function ScoreRow({ score, onPatch, onDelete }) {
  const isAp = (score.test_type || "").toLowerCase() === "ap";
  const sub = score.section_scores || {};
  return (
    <Card style={pinnedItem}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
        <Field label="Test" style={{ flex: "1 1 110px" }}>
          {(id) => (
            <Select id={id} value={(score.test_type || "").toLowerCase()} placeholder="Type"
              onChange={(v) => onPatch({ test_type: v })}
              options={[{ value: "sat", label: "SAT" }, { value: "act", label: "ACT" },
                        { value: "psat", label: "PSAT" }, { value: "ap", label: "AP" }]} />
          )}
        </Field>
        {isAp && (
          <Field label="Subject" style={{ flex: "2 1 160px" }}>
            {(id) => <Input id={id} value={score.subject} onChange={(v) => onPatch({ subject: v })} placeholder="Chemistry" />}
          </Field>
        )}
        <Field label={isAp ? "Score (1-5)" : "Total"} style={{ flex: "1 1 110px" }}>
          {(id) => (
            <Input id={id} value={score.score} onChange={(v) => onPatch({ score: v === "" ? null : Number(v) })}
              inputMode="numeric" placeholder={isAp ? "5" : "1520"} />
          )}
        </Field>
        {!isAp && (
          <>
            <Field label="Reading/Writing" style={{ flex: "1 1 110px" }}>
              {(id) => (
                <Input id={id} value={sub.reading_writing} inputMode="numeric" placeholder="760"
                  onChange={(v) => onPatch({ section_scores: { ...sub, reading_writing: v === "" ? undefined : Number(v) } })} />
              )}
            </Field>
            <Field label="Math" style={{ flex: "1 1 110px" }}>
              {(id) => (
                <Input id={id} value={sub.math} inputMode="numeric" placeholder="760"
                  onChange={(v) => onPatch({ section_scores: { ...sub, math: v === "" ? undefined : Number(v) } })} />
              )}
            </Field>
          </>
        )}
      </div>
      <IconBtn onClick={onDelete} label={`Remove ${score.test_type || "score"}`} danger style={pinnedRemove}><XIcon /></IconBtn>
    </Card>
  );
}

function CourseRow({ course, onPatch, onDelete }) {
  return (
    <Card style={{ ...pinnedItem, padding: "10px 54px 10px 12px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <div style={{ flex: "3 1 200px", minWidth: 0 }}>
        <Input value={course.name} onChange={(v) => onPatch({ name: v })} placeholder="Course name" aria-label="Course name" />
      </div>
      <div style={{ flex: "1 0 150px" }}>
        <Select value={course.level} onChange={(v) => onPatch({ level: v })} options={COURSE_LEVELS} placeholder="Level"
          aria-label="Course level" />
      </div>
      <IconBtn onClick={onDelete} label={`Remove ${course.name || "course"}`} danger style={{ ...pinnedRemove, top: 12 }}><XIcon /></IconBtn>
    </Card>
  );
}

// ─── ECs / Awards ─────────────────────────────────────────────────────────────

function ActivityCard({ activity, onPatch, onDelete }) {
  const ink = useAgentInk();
  const gradesId = useId();
  const whenId = useId();
  const [open, setOpen] = useState(false);
  const a = activity;
  const meta = [
    a.position, a.organization,
    a.hours_per_week && a.weeks_per_year ? `${a.hours_per_week} hrs/wk, ${a.weeks_per_year} wks/yr` : null,
    (a.grade_levels || []).length ? `Grades ${(a.grade_levels || []).join(", ")}` : null,
  ].filter(Boolean);

  return (
    <Card style={{ ...itemCard, padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "8px 8px 12px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ flex: 1, minWidth: 0, fontFamily: SANS, fontWeight: 700, fontSize: "1.05rem", color: TEXT,
            overflowWrap: "anywhere" }}>
            {a.title || "Untitled activity"}
          </div>
          <IconBtn onClick={() => setOpen((o) => !o)} label="Edit activity" aria-expanded={open}><PencilIcon /></IconBtn>
          <IconBtn onClick={onDelete} label={`Remove ${a.title || "activity"}`} danger><XIcon /></IconBtn>
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
          {!a.description && !a.position && (
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
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }} style={{ overflow: "hidden", background: SURFACE }}>
            <div style={{ padding: "16px 14px", borderTop: `1px solid ${BORDER}` }}>
              <Field label="Name" style={{ marginBottom: 14 }}>
                {(id) => <Input id={id} value={a.title} onChange={(v) => onPatch({ title: v })} placeholder="e.g. Science Olympiad" />}
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
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
                <Field label="Hours / week" style={{ width: 140 }}>
                  {(id) => (
                    <Input id={id} value={a.hours_per_week} inputMode="decimal"
                      onChange={(v) => onPatch({ hours_per_week: v === "" ? null : Number(v) })} />
                  )}
                </Field>
                <Field label="Weeks / year" style={{ width: 140 }}>
                  {(id) => (
                    <Input id={id} value={a.weeks_per_year} inputMode="numeric"
                      onChange={(v) => onPatch({ weeks_per_year: v === "" ? null : Number(v) })} />
                  )}
                </Field>
              </div>
              <div style={{ marginBottom: 14 }}>
                <GroupLabel id={gradesId}>Grades involved</GroupLabel>
                <Chips multi options={[9, 10, 11, 12].map((g) => ({ value: g, label: String(g) }))} labelledBy={gradesId}
                  value={a.grade_levels || []} onChange={(v) => onPatch({ grade_levels: v })} />
              </div>
              <div>
                <GroupLabel id={whenId}>When</GroupLabel>
                <Chips options={TIMINGS} value={a.timing} onChange={(v) => onPatch({ timing: v })} labelledBy={whenId} />
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

function AwardRow({ award, onPatch, onDelete }) {
  return (
    <Card style={pinnedItem}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
        <Field label="Award" style={{ flex: "2 1 220px" }}>
          {(id) => <Input id={id} value={award.title} onChange={(v) => onPatch({ title: v })} placeholder="e.g. State finalist" />}
        </Field>
        <Field label="Level" style={{ flex: "1 1 130px" }}>
          {(id) => <Select id={id} value={award.level} onChange={(v) => onPatch({ level: v })} options={AWARD_LEVELS} placeholder="Level" />}
        </Field>
        <Field label="Year" style={{ flex: "1 1 90px" }}>
          {(id) => (
            <Input id={id} value={award.year} inputMode="numeric" placeholder="2025"
              onChange={(v) => onPatch({ year: v === "" ? null : Number(v) })} />
          )}
        </Field>
      </div>
      <IconBtn onClick={onDelete} label={`Remove ${award.title || "award"}`} danger style={pinnedRemove}><XIcon /></IconBtn>
    </Card>
  );
}

// ─── Modals ───────────────────────────────────────────────────────────────────

const overlayStyle = (z) => ({
  position: "fixed", inset: 0, zIndex: z, background: "rgba(20,20,19,0.45)", backdropFilter: "blur(6px)",
  display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem",
});

const panelStyle = (maxWidth, extra) => ({
  width: "100%", maxWidth, background: BG, borderRadius: RADIUS.card, border: `1px solid ${BORDER}`,
  boxShadow: "0 30px 80px rgba(20,20,19,0.28)", padding: "1.8rem", boxSizing: "border-box", fontFamily: SANS, ...extra,
});

const panelMotion = {
  initial: { opacity: 0, y: 22, scale: 0.96 }, animate: { opacity: 1, y: 0, scale: 1 },
  transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] },
};

const modalLead = { fontFamily: SANS, fontSize: "1rem", color: TEXT_MID, lineHeight: 1.6, margin: "0 0 18px" };

/** A checkable row in a modal: white, the kit's border, the box in the accent. */
const checkRow = {
  display: "flex", alignItems: "center", gap: 12, cursor: "pointer", background: WHITE,
  border: `1px solid ${BORDER}`, borderRadius: RADIUS.control, padding: "11px 14px", minHeight: 44, boxSizing: "border-box",
};

// ─── Upload review ────────────────────────────────────────────────────────────

function ReviewModal({ rows: initial, onConfirm, onClose, saving }) {
  const ink = useAgentInk();
  const [rows, setRows] = useState(() => initial.map((r) => ({ ...r, checked: true })));
  const chosen = rows.filter((r) => r.checked);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={overlayStyle(300)}
      onClick={saving ? undefined : onClose}>
      <motion.div {...panelMotion} onClick={(e) => e.stopPropagation()}
        style={panelStyle(640, { maxHeight: "86vh", overflowY: "auto" })}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <StampTile kind="letter" />
          <Heading style={{ fontSize: "1.4rem" }}>
            We found {initial.length} {initial.length === 1 ? "item" : "items"}
          </Heading>
        </div>
        <p style={modalLead}>
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
          <Button kind="primary" onClick={() => onConfirm(chosen)} disabled={saving || chosen.length === 0}
            style={{ flex: 1 }}>
            {saving ? "Adding…" : `Add ${chosen.length || ""}`.trim()}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function ConfirmDeleteModal({ label, onConfirm, onClose }) {
  const [deleting, setDeleting] = useState(false);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={overlayStyle(320)}
      onClick={deleting ? undefined : onClose}>
      <motion.div {...panelMotion} onClick={(e) => e.stopPropagation()} style={panelStyle(400)}>
        <Heading style={{ fontSize: "1.3rem", marginBottom: 8 }}>
          Remove this?
        </Heading>
        <p style={{ ...modalLead, margin: "0 0 22px" }}>
          {label ? `"${label}" will be removed from your portfolio.` : "This will be removed from your portfolio."} This can't be undone.
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <Button kind="secondary" onClick={onClose} disabled={deleting} style={{ flex: 1 }}>
            Cancel
          </Button>
          <Button kind="danger"
            onClick={async () => { setDeleting(true); await onConfirm(); }}
            disabled={deleting} style={{ flex: 1 }}>
            {deleting ? "Removing…" : "Remove"}
          </Button>
        </div>
      </motion.div>
    </motion.div>
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

function ExportModal({ record, contact: initialContact, exportsLeft, generating, error, onGenerate, onClose }) {
  const ink = useAgentInk();
  const linksId = useId();
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

  const total = Object.values(sel).reduce((n, s) => n + s.size, 0) + (includeGpa ? 1 : 0);
  const blocked = generating || total === 0 || exportsLeft === 0;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={overlayStyle(300)}
      onClick={generating ? undefined : onClose}>
      <motion.div {...panelMotion} onClick={(e) => e.stopPropagation()}
        style={panelStyle(660, { maxHeight: "88vh", overflowY: "auto" })}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <StampTile kind="scroll" />
          <Heading style={{ fontSize: "1.45rem" }}>
            Export as a resume
          </Heading>
        </div>
        <p style={modalLead}>
          A one-page PDF built from whatever you pick, across both tabs.
        </p>

        <Card style={{ marginBottom: 18 }}>
          <Heading level={3} style={{ marginBottom: 12 }}>Contact header</Heading>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {[["email", "Email", "you@example.com"], ["phone", "Phone", "(555) 123-4567"], ["location", "Location", "City, State"]].map(([k, label, ph]) => (
              <Field key={k} label={label} style={{ flex: 1, minWidth: 150 }}>
                {(id) => <Input id={id} value={contact[k]} onChange={(v) => setContact((c) => ({ ...c, [k]: v }))} placeholder={ph} />}
              </Field>
            ))}
          </div>
          <div style={{ marginTop: 14 }} role="group" aria-labelledby={linksId}>
            <GroupLabel id={linksId}>Links</GroupLabel>
            {(contact.links || []).map((link, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                <div style={{ width: 130, flexShrink: 0 }}>
                  <Input value={link.label} placeholder="GitHub" aria-label="Link label"
                    onChange={(v) => setContact((c) => ({ ...c, links: c.links.map((l, j) => j === i ? { ...l, label: v } : l) }))} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Input value={link.url} placeholder="https://…" aria-label="Link address"
                    onChange={(v) => setContact((c) => ({ ...c, links: c.links.map((l, j) => j === i ? { ...l, url: v } : l) }))} />
                </div>
                <IconBtn danger label="Remove link"
                  onClick={() => setContact((c) => ({ ...c, links: c.links.filter((_, j) => j !== i) }))}><XIcon /></IconBtn>
              </div>
            ))}
            <AddButton onClick={() => setContact((c) => ({ ...c, links: [...(c.links || []), { label: "", url: "" }] }))}>
              Add link
            </AddButton>
          </div>
        </Card>

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
          render={(c) => `${c.name}${c.level ? ` (${labelFor(COURSE_LEVELS, c.level) || c.level})` : ""}`} />
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
            ? `${exportsLeft} export${exportsLeft === 1 ? "" : "s"} left in the demo`
            : "No exports left in the demo"}
        </p>
      </motion.div>
    </motion.div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const TABS = [
  { key: "academics", label: "Academics" },
  { key: "ecs",       label: "ECs / Awards" },
];

export default function PortfolioPage({ navigate }) {
  const isMobile = useIsMobile();
  const ink = useAgentInk();
  const { summary: questSummary } = useQuest();
  const [phase, setPhase]   = useState("loading");
  const [tab, setTab]       = useState("academics");
  const [userId, setUserId] = useState(null);
  const [record, setRecord] = useState({ profile: {}, activities: [], awards: [], courses: [], scores: [] });

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
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [collegeCount, setCollegeCount] = useState(null);   // null until known
  const fileRef = useRef(null);

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

  // Local-first edits: patch state immediately and persist in the background.
  // These rows are tiny and a failed write is recoverable by editing again, so
  // this keeps typing smooth instead of awaiting every keystroke.
  const patch = useCallback((table, listKey, id, values) => {
    setRecord((prev) => ({
      ...prev,
      [listKey]: prev[listKey].map((r) => (r.id === id ? { ...r, ...values } : r)),
    }));
    updateRow(table, id, values).catch((e) => console.error(`[portfolio] ${table} update failed:`, e));
  }, []);

  const remove = useCallback(async (table, listKey, id) => {
    setRecord((prev) => ({ ...prev, [listKey]: prev[listKey].filter((r) => r.id !== id) }));
    try { await deleteRow(table, id); }
    catch (e) { console.error(`[portfolio] ${table} delete failed:`, e); }
  }, []);

  const requestDelete = useCallback((table, listKey, id, label) => {
    setConfirmDelete({ table, listKey, id, label });
  }, []);

  const add = useCallback(async (table, listKey, values) => {
    try {
      const row = await addRow(table, userId, values, record[listKey]);
      setRecord((prev) => ({ ...prev, [listKey]: [...prev[listKey], row] }));
    } catch (e) { console.error(`[portfolio] ${table} insert failed:`, e); }
  }, [userId, record]);

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
    } catch (e) {
      console.error("[portfolio] adding extracted rows failed:", e);
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
    return <div data-sidebar-offset className="ui-page" style={{ ...pagePad, display: "flex", alignItems: "center", justifyContent: "center" }}>
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

  // The first quest is offered here, right after onboarding, once the student
  // has seen their record. Hidden for anyone who has had one before.
  const questNudge = isEnabled("quest") && questSummary && !questSummary.ever && !questSummary.has_quest;
  const collegeNudge = isEnabled("colleges") && collegeCount === 0;

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

  return (
    <div data-sidebar-offset className="ui-page" style={pagePad}>
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

        {questNudge && (
          <Tip name="Next step" stamp="flag" tone="accent" style={{ marginBottom: "1.5rem", paddingTop: 0 }}>
            <p style={{ fontFamily: SANS, fontWeight: 800, fontSize: "1.05rem", color: TEXT, margin: "0 0 4px" }}>
              Start your first quest
            </p>
            <p style={{ fontFamily: SANS, fontSize: "1rem", fontWeight: 500, color: TEXT_MID, lineHeight: 1.55, margin: "0 0 12px" }}>
              Pick one project and move it forward a little every day. We'll suggest a few based on your record.
            </p>
            <Button kind="primary" onClick={() => navigate("/quest")}>
              Find a quest
            </Button>
          </Tip>
        )}

        {collegeNudge && (
          <Tip name="Next step" stamp="target" tone="default" style={{ marginBottom: "1.5rem", paddingTop: 0 }}>
            <p style={{ fontFamily: SANS, fontWeight: 800, fontSize: "1.05rem", color: TEXT, margin: "0 0 4px" }}>
              Build your college list
            </p>
            <p style={{ fontFamily: SANS, fontSize: "1rem", fontWeight: 500, color: TEXT_MID, lineHeight: 1.55, margin: "0 0 12px" }}>
              Add the schools you are thinking about, and we will sort them into reach, target and likely using real admissions data.
            </p>
            <Button kind="primary" onClick={() => navigate("/college-list")}>
              Start my list
            </Button>
          </Tip>
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap", marginBottom: "1.5rem" }}>
          <div style={{ flex: isMobile ? "1 1 100%" : "0 1 auto", minWidth: 0 }}>
            <ChoiceChips label="Portfolio section" hideLabel isMobile={isMobile}
              options={tabOptions} value={tab} onChange={setTab} />
          </div>

          <Button kind="secondary" onClick={() => { setExportError(null); setExportOpen(true); }}
            style={isMobile ? { width: "100%" } : undefined}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export resume
          </Button>
        </div>

        {tab === "academics" && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            <GpaBlock profile={record.profile}
              onSave={async (v) => {
                await saveGpa(userId, v);
                setRecord((prev) => ({
                  ...prev,
                  profile: {
                    ...prev.profile,
                    gpa_unweighted: v.gpaScale === "not_used" ? null : v.gpaUnweighted,
                    gpa_weighted:   v.gpaScale === "not_used" ? null : v.gpaWeighted,
                    gpa_scale:      v.gpaScale,
                  },
                }));
              }} />

            <SectionCard title="Test scores" stamp="pencil" count={record.scores.length}
              hint="SAT, ACT, PSAT and AP exam results."
              action={<AddButton onClick={() => add("student_test_scores", "scores", { test_type: "sat", section_scores: {} })}>Add score</AddButton>}>
              {record.scores.length === 0
                ? <EmptyNote>Nothing here yet. Add a score when you have one, or leave it empty if you're going test-optional.</EmptyNote>
                : record.scores.map((s) => (
                    <ScoreRow key={s.id} score={s}
                      onPatch={(v) => patch("student_test_scores", "scores", s.id, v)}
                      onDelete={() => requestDelete("student_test_scores", "scores", s.id, s.test_type || "score")} />
                  ))}
            </SectionCard>

            <SectionCard title="Coursework" stamp="book" count={record.courses.length}
              hint="Course rigor is one of the first things admissions looks at, so tag the level."
              action={<AddButton onClick={() => add("student_courses", "courses", { name: "" })}>Add course</AddButton>}>
              {record.courses.length === 0
                ? <EmptyNote>No classes listed yet.</EmptyNote>
                : record.courses.map((c) => (
                    <CourseRow key={c.id} course={c}
                      onPatch={(v) => patch("student_courses", "courses", c.id, v)}
                      onDelete={() => requestDelete("student_courses", "courses", c.id, c.name || "course")} />
                  ))}
            </SectionCard>
          </motion.div>
        )}

        {tab === "ecs" && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            {/* Upload lives on this tab only: it parses activities and awards, not academics. */}
            <Card style={{ padding: "1.3rem", marginBottom: "1.25rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 220, display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <StampTile kind="letter" />
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
                  <Button kind="primary" busy={uploading}
                    onClick={() => (uploadsLeft > 0 ? fileRef.current?.click() : setLimitModal("portfolio_upload"))}
                    style={isMobile ? { width: "100%" } : undefined}>
                    {uploading ? "Reading it…" : "Upload"}
                  </Button>
                  <p style={{ fontFamily: SANS, fontSize: "0.92rem", fontWeight: 600, color: TEXT_MUTED, textAlign: "center",
                    margin: "7px 0 0", fontVariantNumeric: "tabular-nums" }}>
                    {uploadsLeft} left
                  </p>
                </div>
              </div>
              {uploadError && (
                <Notice tone="error" style={{ marginTop: 14 }}>{uploadError}</Notice>
              )}
            </Card>

            <SectionCard title="Activities" stamp="scroll" count={record.activities.length}
              hint="Clubs, sports, jobs, projects, volunteering, research. Open one to fill in your role, hours and what you actually did."
              action={<AddButton onClick={() => add("student_activities", "activities", { title: "", detail_level: "name_only", grade_levels: [] })}>Add activity</AddButton>}>
              {record.activities.length === 0
                ? <EmptyNote>Nothing here yet. Add an activity, or upload a resume above.</EmptyNote>
                : record.activities.map((a) => (
                    <ActivityCard key={a.id} activity={a}
                      onPatch={(v) => patch("student_activities", "activities", a.id, v)}
                      onDelete={() => requestDelete("student_activities", "activities", a.id, a.title || "activity")} />
                  ))}
            </SectionCard>

            <SectionCard title="Awards and honors" stamp="star" count={record.awards.length}
              hint="Anything you were recognised for, at any level."
              action={<AddButton onClick={() => add("student_awards", "awards", { title: "" })}>Add award</AddButton>}>
              {record.awards.length === 0
                ? <EmptyNote>No awards listed yet.</EmptyNote>
                : record.awards.map((w) => (
                    <AwardRow key={w.id} award={w}
                      onPatch={(v) => patch("student_awards", "awards", w.id, v)}
                      onDelete={() => requestDelete("student_awards", "awards", w.id, w.title || "award")} />
                  ))}
            </SectionCard>
          </motion.div>
        )}
      </div>

      <AnimatePresence>
        {extracted && (
          <ReviewModal rows={extracted} saving={addingExtracted}
            onConfirm={confirmExtracted} onClose={() => setExtracted(null)} />
        )}
        {exportOpen && (
          <ExportModal record={record} contact={record.profile.resume_contact}
            exportsLeft={exportsLeft} generating={exporting} error={exportError}
            onGenerate={handleExport} onClose={() => setExportOpen(false)} />
        )}
        {confirmDelete && (
          <ConfirmDeleteModal label={confirmDelete.label}
            onConfirm={async () => {
              await remove(confirmDelete.table, confirmDelete.listKey, confirmDelete.id);
              setConfirmDelete(null);
            }}
            onClose={() => setConfirmDelete(null)} />
        )}
      </AnimatePresence>

      {limitModal && <LimitModal feature={limitModal} onClose={() => setLimitModal(null)} />}
    </div>
  );
}
