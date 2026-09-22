import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../lib/supabase.js";
import { requireUser } from "../lib/auth.js";
import { fetchUsage, LIMITS } from "../lib/usage.js";
import LimitModal from "../components/common/LimitModal.jsx";
import Spinner from "../components/common/Spinner.jsx";
import { SIDEBAR_WIDTH } from "../components/common/Sidebar.jsx";
import { useIsMobile } from "../hooks/useIsMobile.js";
import { useTheme } from "../lib/ThemeContext.jsx";
import {
  fetchRecord, addRow, updateRow, deleteRow, saveGpa, saveContact,
  addExtracted, generateResume,
} from "../lib/portfolio.js";

const LANGGRAPH_URL = import.meta.env.VITE_LANGGRAPH_CHAT_URL;

const SANS       = "'Raleway', sans-serif";
const BG         = "#F5F5F5";
const WHITE      = "#ffffff";
const TEXT       = "#141413";
const TEXT_MID   = "#3d3d3a";
const TEXT_MUTED = "#494742";
const TEXT_FAINT = "#6a6760";
const BORDER     = "#e6dfd8";
const DANGER     = "#dc2626";

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

const inputStyle = {
  width: "100%", fontFamily: SANS, fontSize: "0.98rem", color: TEXT,
  border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: "11px 13px",
  outline: "none", background: WHITE, boxSizing: "border-box",
};

const miniLabel = {
  fontFamily: SANS, fontSize: "0.74rem", fontWeight: 700,
  color: TEXT_FAINT, display: "block", marginBottom: 5,
};

function Input({ value, onChange, ...rest }) {
  const { accent } = useTheme();
  return (
    <input value={value ?? ""} onChange={(e) => onChange(e.target.value)} style={inputStyle}
      onFocus={(e) => (e.target.style.borderColor = accent)}
      onBlur={(e) => (e.target.style.borderColor = BORDER)} {...rest} />
  );
}

function Select({ value, onChange, options, placeholder = "Not set" }) {
  return (
    <select value={value || ""} onChange={(e) => onChange(e.target.value || null)}
      style={{ ...inputStyle, cursor: "pointer" }}>
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function Chips({ options, value, onChange, multi = false }) {
  const { accent } = useTheme();
  const arr = multi ? (value || []) : [];
  const isOn = (v) => (multi ? arr.includes(v) : value === v);
  const toggle = (v) => {
    if (!multi) return onChange(value === v ? null : v);
    onChange(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v].sort((a, b) => a - b));
  };
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
      {options.map((o) => {
        const on = isOn(o.value);
        return (
          <button key={o.value} type="button" onClick={() => toggle(o.value)}
            style={{
              fontFamily: SANS, fontSize: "0.88rem", fontWeight: 600, cursor: "pointer",
              padding: "7px 14px", borderRadius: 99,
              border: `1.5px solid ${on ? accent : BORDER}`,
              background: on ? accent : WHITE, color: on ? WHITE : TEXT_MID,
              transition: "all 0.15s",
            }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function IconBtn({ onClick, label, danger, children }) {
  return (
    <button type="button" onClick={onClick} aria-label={label}
      style={{
        flexShrink: 0, border: "none", background: "none", cursor: "pointer",
        color: TEXT_FAINT, display: "inline-flex", alignItems: "center",
        padding: 6, borderRadius: 8, transition: "color 0.15s, background 0.15s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = danger ? DANGER : TEXT;
        e.currentTarget.style.background = danger ? "rgba(220,38,38,0.08)" : "rgba(20,20,19,0.05)";
      }}
      onMouseLeave={(e) => { e.currentTarget.style.color = TEXT_FAINT; e.currentTarget.style.background = "none"; }}>
      {children}
    </button>
  );
}

const XIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);
const PencilIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);

function SectionCard({ title, hint, count, action, children }) {
  return (
    <div style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 18, padding: "1.5rem", marginBottom: "1.25rem" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: hint ? 5 : 14 }}>
        <h2 style={{ fontFamily: SANS, fontWeight: 700, fontSize: "1.15rem", color: TEXT, margin: 0 }}>
          {title}
          {count != null && count > 0 && (
            <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: "0.9rem", color: TEXT_FAINT, marginLeft: 8 }}>{count}</span>
          )}
        </h2>
        {action}
      </div>
      {hint && <p style={{ fontFamily: SANS, fontSize: "0.9rem", color: TEXT_FAINT, lineHeight: 1.55, margin: "0 0 14px" }}>{hint}</p>}
      {children}
    </div>
  );
}

function AddButton({ onClick, children }) {
  const { accent } = useTheme();
  return (
    <button type="button" onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: 7,
        fontFamily: SANS, fontSize: "0.92rem", fontWeight: 700, color: accent,
        background: "rgba(var(--accent-rgb),0.08)", border: "none",
        borderRadius: 10, padding: "9px 14px", cursor: "pointer",
      }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
        <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
      </svg>
      {children}
    </button>
  );
}

function EmptyNote({ children }) {
  return (
    <p style={{ fontFamily: SANS, fontSize: "0.95rem", color: TEXT_FAINT, lineHeight: 1.6, margin: 0 }}>
      {children}
    </p>
  );
}

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
    <span ref={ref} style={{ position: "relative", display: "inline-flex" }}>
      <button onClick={() => setOpen((o) => !o)} aria-label="What is the portfolio for?"
        style={{ width: 17, height: 17, borderRadius: "50%", border: `1.5px solid ${TEXT_FAINT}`, background: "transparent",
          color: TEXT_FAINT, fontFamily: SANS, fontSize: 10.5, fontWeight: 700, cursor: "pointer",
          display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0, lineHeight: 1 }}>
        ?
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} transition={{ duration: 0.15 }}
            style={{ position: "absolute", top: 24, left: "50%", transform: "translateX(-50%)", zIndex: 50, width: 270,
              background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "12px 14px",
              boxShadow: "0 12px 32px rgba(0,0,0,0.12)" }}>
            <p style={{ fontFamily: SANS, fontSize: 12.5, color: TEXT_MID, lineHeight: 1.55, margin: 0 }}>
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
    <SectionCard title="GPA" hint="Admissions reads unweighted GPA first, alongside how hard your classes are.">
      <div style={{ marginBottom: 14 }}>
        <label style={miniLabel}>Scale</label>
        <Chips options={GPA_SCALES} value={gpaScale} onChange={setScale} />
      </div>
      {!notUsed && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
          <div style={{ flex: 1, minWidth: 130 }}>
            <label style={miniLabel}>Unweighted</label>
            <Input value={gpaUnweighted} onChange={setU} inputMode="decimal" placeholder="3.87" />
          </div>
          <div style={{ flex: 1, minWidth: 130 }}>
            <label style={miniLabel}>Weighted</label>
            <Input value={gpaWeighted} onChange={setW} inputMode="decimal" placeholder="Optional" />
          </div>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button type="button" onClick={save} disabled={saving}
          style={{
            fontFamily: SANS, fontSize: "0.92rem", fontWeight: 700, cursor: saving ? "default" : "pointer",
            padding: "10px 18px", borderRadius: 10, border: "none",
            background: "var(--accent)", color: WHITE,
          }}>
          {saving ? "Saving…" : "Save GPA"}
        </button>
        <AnimatePresence>
          {saved && (
            <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ fontFamily: SANS, fontSize: "0.88rem", fontWeight: 600, color: "#059669" }}>
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
    <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, padding: "12px 14px", marginBottom: 9 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ width: 120 }}>
          <label style={miniLabel}>Test</label>
          <Select value={(score.test_type || "").toLowerCase()} placeholder="Type"
            onChange={(v) => onPatch({ test_type: v })}
            options={[{ value: "sat", label: "SAT" }, { value: "act", label: "ACT" },
                      { value: "psat", label: "PSAT" }, { value: "ap", label: "AP" }]} />
        </div>
        {isAp && (
          <div style={{ flex: 1, minWidth: 140 }}>
            <label style={miniLabel}>Subject</label>
            <Input value={score.subject} onChange={(v) => onPatch({ subject: v })} placeholder="Chemistry" />
          </div>
        )}
        <div style={{ width: 110 }}>
          <label style={miniLabel}>{isAp ? "Score (1-5)" : "Total"}</label>
          <Input value={score.score} onChange={(v) => onPatch({ score: v === "" ? null : Number(v) })}
            inputMode="numeric" placeholder={isAp ? "5" : "1520"} />
        </div>
        {!isAp && (
          <>
            <div style={{ width: 130 }}>
              <label style={miniLabel}>Reading/Writing</label>
              <Input value={sub.reading_writing} inputMode="numeric" placeholder="760"
                onChange={(v) => onPatch({ section_scores: { ...sub, reading_writing: v === "" ? undefined : Number(v) } })} />
            </div>
            <div style={{ width: 100 }}>
              <label style={miniLabel}>Math</label>
              <Input value={sub.math} inputMode="numeric" placeholder="760"
                onChange={(v) => onPatch({ section_scores: { ...sub, math: v === "" ? undefined : Number(v) } })} />
            </div>
          </>
        )}
        <IconBtn onClick={onDelete} label={`Remove ${score.test_type || "score"}`} danger><XIcon /></IconBtn>
      </div>
    </div>
  );
}

function CourseRow({ course, onPatch, onDelete }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", border: `1px solid ${BORDER}`, borderRadius: 12, padding: "10px 12px", marginBottom: 9 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Input value={course.name} onChange={(v) => onPatch({ name: v })} placeholder="Course name" />
      </div>
      <div style={{ width: 160, flexShrink: 0 }}>
        <Select value={course.level} onChange={(v) => onPatch({ level: v })} options={COURSE_LEVELS} placeholder="Level" />
      </div>
      <IconBtn onClick={onDelete} label={`Remove ${course.name || "course"}`} danger><XIcon /></IconBtn>
    </div>
  );
}

// ─── ECs / Awards ─────────────────────────────────────────────────────────────

function ActivityCard({ activity, onPatch, onDelete }) {
  const { accent } = useTheme();
  const [open, setOpen] = useState(false);
  const a = activity;
  const meta = [
    a.position, a.organization,
    a.hours_per_week && a.weeks_per_year ? `${a.hours_per_week} hrs/wk, ${a.weeks_per_year} wks/yr` : null,
    (a.grade_levels || []).length ? `Grades ${(a.grade_levels || []).join(", ")}` : null,
  ].filter(Boolean);

  return (
    <div style={{ border: `1px solid ${BORDER}`, borderRadius: 13, marginBottom: 10, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "13px 14px" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: "1.02rem", color: TEXT, marginBottom: meta.length ? 4 : 0 }}>
            {a.title || "Untitled activity"}
          </div>
          {meta.length > 0 && (
            <div style={{ fontFamily: SANS, fontSize: "0.86rem", color: TEXT_FAINT, lineHeight: 1.5 }}>
              {meta.join(" · ")}
            </div>
          )}
          {a.description && (
            <p style={{ fontFamily: SANS, fontSize: "0.9rem", color: TEXT_MUTED, lineHeight: 1.55, margin: "7px 0 0" }}>
              {a.description}
            </p>
          )}
          {!a.description && !a.position && (
            <span style={{ display: "inline-block", fontFamily: SANS, fontSize: "0.78rem", fontWeight: 700, color: accent,
              background: "rgba(var(--accent-rgb),0.09)", borderRadius: 7, padding: "3px 8px", marginTop: 7 }}>
              Needs detail
            </span>
          )}
        </div>
        <IconBtn onClick={() => setOpen((o) => !o)} label="Edit activity"><PencilIcon /></IconBtn>
        <IconBtn onClick={onDelete} label={`Remove ${a.title || "activity"}`} danger><XIcon /></IconBtn>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }} style={{ overflow: "hidden", background: BG }}>
            <div style={{ padding: "14px", borderTop: `1px solid ${BORDER}` }}>
              <div style={{ marginBottom: 12 }}>
                <label style={miniLabel}>Name</label>
                <Input value={a.title} onChange={(v) => onPatch({ title: v })} placeholder="e.g. Science Olympiad" />
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                <div style={{ flex: 1, minWidth: 150 }}>
                  <label style={miniLabel}>Your role</label>
                  <Input value={a.position} maxLength={50} onChange={(v) => onPatch({ position: v })} placeholder="e.g. Captain" />
                </div>
                <div style={{ flex: 1, minWidth: 150 }}>
                  <label style={miniLabel}>Organization</label>
                  <Input value={a.organization} maxLength={100} onChange={(v) => onPatch({ organization: v })} />
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <label style={miniLabel}>What you did</label>
                  <span style={{ fontFamily: SANS, fontSize: "0.74rem", fontWeight: 600, color: TEXT_FAINT }}>
                    {(a.description || "").length}/150
                  </span>
                </div>
                <textarea value={a.description || ""} maxLength={150} rows={2}
                  onChange={(e) => onPatch({ description: e.target.value })}
                  style={{ ...inputStyle, resize: "vertical" }} />
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                <div style={{ width: 130 }}>
                  <label style={miniLabel}>Hours / week</label>
                  <Input value={a.hours_per_week} inputMode="decimal"
                    onChange={(v) => onPatch({ hours_per_week: v === "" ? null : Number(v) })} />
                </div>
                <div style={{ width: 130 }}>
                  <label style={miniLabel}>Weeks / year</label>
                  <Input value={a.weeks_per_year} inputMode="numeric"
                    onChange={(v) => onPatch({ weeks_per_year: v === "" ? null : Number(v) })} />
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={miniLabel}>Grades involved</label>
                <Chips multi options={[9, 10, 11, 12].map((g) => ({ value: g, label: String(g) }))}
                  value={a.grade_levels || []} onChange={(v) => onPatch({ grade_levels: v })} />
              </div>
              <div>
                <label style={miniLabel}>When</label>
                <Chips options={TIMINGS} value={a.timing} onChange={(v) => onPatch({ timing: v })} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AwardRow({ award, onPatch, onDelete }) {
  return (
    <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, padding: "12px 14px", marginBottom: 9 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <label style={miniLabel}>Award</label>
          <Input value={award.title} onChange={(v) => onPatch({ title: v })} placeholder="e.g. State finalist" />
        </div>
        <div style={{ width: 150 }}>
          <label style={miniLabel}>Level</label>
          <Select value={award.level} onChange={(v) => onPatch({ level: v })} options={AWARD_LEVELS} placeholder="Level" />
        </div>
        <div style={{ width: 100 }}>
          <label style={miniLabel}>Year</label>
          <Input value={award.year} inputMode="numeric" placeholder="2025"
            onChange={(v) => onPatch({ year: v === "" ? null : Number(v) })} />
        </div>
        <IconBtn onClick={onDelete} label={`Remove ${award.title || "award"}`} danger><XIcon /></IconBtn>
      </div>
    </div>
  );
}

// ─── Upload review ────────────────────────────────────────────────────────────

function ReviewModal({ rows: initial, onConfirm, onClose, saving }) {
  const { accent } = useTheme();
  const [rows, setRows] = useState(() => initial.map((r) => ({ ...r, checked: true })));
  const chosen = rows.filter((r) => r.checked);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(20,20,19,0.45)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}
      onClick={saving ? undefined : onClose}>
      <motion.div initial={{ opacity: 0, y: 22, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }} onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 640, maxHeight: "86vh", overflowY: "auto", background: BG,
          borderRadius: 20, border: `1px solid ${BORDER}`, boxShadow: "0 30px 80px rgba(0,0,0,0.3)", padding: "1.9rem" }}>
        <h2 style={{ fontFamily: SANS, fontWeight: 700, fontSize: "1.45rem", color: TEXT, marginBottom: 7 }}>
          We found {initial.length} {initial.length === 1 ? "item" : "items"}
        </h2>
        <p style={{ fontFamily: SANS, fontSize: "1rem", color: TEXT_MID, lineHeight: 1.6, marginBottom: 18 }}>
          Untick anything you don't want. You can edit the details after adding them.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
          {rows.map((r, i) => (
            <label key={i} style={{
              display: "flex", alignItems: "flex-start", gap: 11, cursor: "pointer",
              background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "12px 14px",
            }}>
              <input type="checkbox" checked={r.checked}
                onChange={() => setRows((prev) => prev.map((x, j) => (j === i ? { ...x, checked: !x.checked } : x)))}
                style={{ marginTop: 3, width: 17, height: 17, accentColor: accent, cursor: "pointer", flexShrink: 0 }} />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "inline-block", fontFamily: SANS, fontSize: "0.74rem", fontWeight: 700,
                  color: accent, background: "rgba(var(--accent-rgb),0.09)", borderRadius: 6, padding: "2px 7px", marginBottom: 5 }}>
                  {r.kind === "award" ? "Award" : "Activity"}
                </span>
                <span style={{ display: "block", fontFamily: SANS, fontWeight: 700, fontSize: "0.98rem", color: TEXT }}>
                  {r.title}
                </span>
                {r.description && (
                  <span style={{ display: "block", fontFamily: SANS, fontSize: "0.88rem", color: TEXT_MUTED, lineHeight: 1.5, marginTop: 3 }}>
                    {r.description}
                  </span>
                )}
              </span>
            </label>
          ))}
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" onClick={onClose} disabled={saving}
            style={{ flex: "0 0 auto", fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700, cursor: "pointer",
              padding: "13px 20px", borderRadius: 11, border: `1.5px solid ${BORDER}`, background: WHITE, color: TEXT_MID }}>
            Cancel
          </button>
          <button type="button" onClick={() => onConfirm(chosen)} disabled={saving || chosen.length === 0}
            style={{ flex: 1, fontFamily: SANS, fontSize: "0.98rem", fontWeight: 700,
              cursor: saving || !chosen.length ? "not-allowed" : "pointer", padding: "13px", borderRadius: 11, border: "none",
              background: chosen.length ? "var(--accent)" : "#c7d2e8", color: WHITE }}>
            {saving ? "Adding…" : `Add ${chosen.length || ""}`.trim()}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────

function PickGroup({ title, items, selected, onToggle, render }) {
  const { accent } = useTheme();
  if (!items.length) return null;
  return (
    <div style={{ marginBottom: 18 }}>
      <p style={{ fontFamily: SANS, fontSize: "0.78rem", fontWeight: 700, color: TEXT_FAINT, marginBottom: 8 }}>{title}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map((it) => (
          <label key={it.id} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
            background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "10px 12px" }}>
            <input type="checkbox" checked={selected.has(it.id)} onChange={() => onToggle(it.id)}
              style={{ width: 16, height: 16, accentColor: accent, cursor: "pointer", flexShrink: 0 }} />
            <span style={{ fontFamily: SANS, fontSize: "0.94rem", fontWeight: 600, color: TEXT, minWidth: 0 }}>
              {render(it)}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

function ExportModal({ record, contact: initialContact, exportsLeft, generating, error, onGenerate, onClose }) {
  const { accent } = useTheme();
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
      style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(20,20,19,0.45)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}
      onClick={generating ? undefined : onClose}>
      <motion.div initial={{ opacity: 0, y: 22, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }} onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 660, maxHeight: "88vh", overflowY: "auto", background: BG,
          borderRadius: 20, border: `1px solid ${BORDER}`, boxShadow: "0 30px 80px rgba(0,0,0,0.3)", padding: "1.9rem" }}>
        <h2 style={{ fontFamily: SANS, fontWeight: 700, fontSize: "1.5rem", color: TEXT, marginBottom: 7 }}>
          Export as a resume
        </h2>
        <p style={{ fontFamily: SANS, fontSize: "1rem", color: TEXT_MID, lineHeight: 1.6, marginBottom: 18 }}>
          A one-page PDF built from whatever you pick, across both tabs.
        </p>

        <div style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "1.2rem", marginBottom: 18 }}>
          <p style={{ fontFamily: SANS, fontSize: "0.82rem", fontWeight: 700, color: TEXT_FAINT, marginBottom: 12 }}>Contact header</p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {[["email", "Email", "you@example.com"], ["phone", "Phone", "(555) 123-4567"], ["location", "Location", "City, State"]].map(([k, label, ph]) => (
              <div key={k} style={{ flex: 1, minWidth: 150 }}>
                <label style={miniLabel}>{label}</label>
                <Input value={contact[k]} onChange={(v) => setContact((c) => ({ ...c, [k]: v }))} placeholder={ph} />
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12 }}>
            <label style={miniLabel}>Links</label>
            {(contact.links || []).map((link, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 7 }}>
                <div style={{ width: 130 }}>
                  <Input value={link.label} placeholder="GitHub"
                    onChange={(v) => setContact((c) => ({ ...c, links: c.links.map((l, j) => j === i ? { ...l, label: v } : l) }))} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Input value={link.url} placeholder="https://…"
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
        </div>

        <p style={{ fontFamily: SANS, fontSize: "0.82rem", fontWeight: 700, color: TEXT, marginBottom: 12 }}>
          What to include
        </p>

        {hasGpa && (
          <div style={{ marginBottom: 18 }}>
            <p style={{ fontFamily: SANS, fontSize: "0.78rem", fontWeight: 700, color: TEXT_FAINT, marginBottom: 8 }}>GPA</p>
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
              background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "10px 12px" }}>
              <input type="checkbox" checked={includeGpa} onChange={() => setIncludeGpa((v) => !v)}
                style={{ width: 16, height: 16, accentColor: accent, cursor: "pointer" }} />
              <span style={{ fontFamily: SANS, fontSize: "0.94rem", fontWeight: 600, color: TEXT }}>
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
          <p style={{ fontFamily: SANS, fontSize: "0.92rem", color: DANGER, fontWeight: 600, marginBottom: 12 }}>{error}</p>
        )}

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" onClick={onClose} disabled={generating}
            style={{ flex: "0 0 auto", fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700, cursor: "pointer",
              padding: "13px 20px", borderRadius: 11, border: `1.5px solid ${BORDER}`, background: WHITE, color: TEXT_MID }}>
            Cancel
          </button>
          <button type="button" disabled={blocked}
            onClick={() => onGenerate({
              activity_ids: [...sel.activity_ids], award_ids: [...sel.award_ids],
              course_ids: [...sel.course_ids], score_ids: [...sel.score_ids],
              include_gpa: includeGpa,
            }, contact)}
            style={{ flex: 1, minWidth: 180, fontFamily: SANS, fontSize: "0.98rem", fontWeight: 700,
              cursor: blocked ? "not-allowed" : "pointer",
              padding: "13px", borderRadius: 11, border: "none",
              background: blocked ? "#c7d2e8" : "var(--accent)", color: WHITE }}>
            {generating ? "Building your PDF…" : `Download PDF (${total})`}
          </button>
        </div>
        <p style={{ fontFamily: SANS, fontSize: "0.85rem", color: TEXT_FAINT, textAlign: "center", marginTop: 12 }}>
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
  const { accent } = useTheme();
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
  const fileRef = useRef(null);

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

  const pagePad = {
    minHeight: "100vh", background: BG, fontFamily: SANS,
    padding: isMobile ? "1.5rem 1rem 5rem" : "2.5rem 2rem 4rem",
    paddingLeft: isMobile ? "1rem" : `calc(${SIDEBAR_WIDTH}px + 2rem)`,
  };

  if (phase === "loading") {
    return <div data-sidebar-offset style={{ ...pagePad, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Spinner size={26} color={accent} />
    </div>;
  }

  if (phase === "error") {
    return <div data-sidebar-offset style={{ ...pagePad, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", maxWidth: 420 }}>
        <p style={{ fontFamily: SANS, fontSize: "1.05rem", fontWeight: 700, color: TEXT, marginBottom: 8 }}>
          We couldn't load your portfolio
        </p>
        <p style={{ fontFamily: SANS, fontSize: "0.98rem", color: TEXT_MUTED, lineHeight: 1.6, marginBottom: "1.4rem" }}>
          Nothing has been lost. Give it another go in a moment.
        </p>
        <button onClick={() => window.location.reload()}
          style={{
            fontFamily: SANS, fontSize: "0.98rem", fontWeight: 700, cursor: "pointer",
            padding: "11px 22px", borderRadius: 10, border: "none",
            background: accent, color: WHITE,
          }}>
          Try again
        </button>
      </div>
    </div>;
  }

  const ecCount = record.activities.length + record.awards.length;
  const acCount = record.courses.length + record.scores.length;
  const exportsLeft = Math.max(0, LIMITS.resume_export - exportsUsed);
  const uploadsLeft = Math.max(0, LIMITS.portfolio_upload - uploadsUsed);

  return (
    <div data-sidebar-offset style={pagePad}>
      <div style={{ maxWidth: 900, margin: "0 auto", width: "100%" }}>

        <p style={{ fontFamily: SANS, fontSize: "0.82rem", fontWeight: 700, letterSpacing: "0.02em", color: TEXT, marginBottom: 9 }}>
          Your record
        </p>
        <h1 style={{ fontFamily: SANS, fontWeight: 700, fontSize: "2.4rem", color: accent, letterSpacing: "-0.03em", marginBottom: "0.6rem" }}>
          Portfolio
        </h1>
        <p style={{ fontFamily: SANS, fontSize: "1.05rem", color: TEXT_MUTED, lineHeight: 1.6, marginBottom: "0.4rem", maxWidth: 660 }}>
          Your grades, scores, classes, activities and awards, all in one place. <LearnMore />
        </p>
        <p style={{ fontFamily: SANS, fontSize: "1.05rem", color: TEXT_MUTED, lineHeight: 1.6, marginBottom: "1.75rem", maxWidth: 660 }}>
          You can reference all of this directly in the{" "}
          <button onClick={() => navigate("/chat")}
            style={{ fontFamily: SANS, fontSize: "1.05rem", color: accent, fontWeight: 700, background: "none",
              border: "none", padding: 0, cursor: "pointer", textDecoration: "underline" }}>
            chat page
          </button>.
        </p>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap", marginBottom: "1.5rem" }}>
          <div style={{ display: "flex", gap: 6, background: "rgba(20,20,19,0.04)", borderRadius: 12, padding: 5 }}>
            {TABS.map((t) => {
              const on = tab === t.key;
              const n = t.key === "academics" ? acCount : ecCount;
              return (
                <button key={t.key} onClick={() => setTab(t.key)}
                  style={{
                    fontFamily: SANS, fontSize: "1rem", fontWeight: 700, cursor: "pointer",
                    padding: "10px 18px", borderRadius: 9, border: "none",
                    background: on ? WHITE : "transparent", color: on ? accent : TEXT_MID,
                    boxShadow: on ? "0 1px 4px rgba(15,23,42,0.08)" : "none",
                    transition: "all 0.15s",
                  }}>
                  {t.label}
                  {n > 0 && <span style={{ color: on ? accent : TEXT_FAINT, marginLeft: 7, fontSize: "0.88rem" }}>{n}</span>}
                </button>
              );
            })}
          </div>

          <button onClick={() => { setExportError(null); setExportOpen(true); }}
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700, cursor: "pointer",
              padding: "11px 18px", borderRadius: 11, border: `2px solid ${TEXT}`,
              background: WHITE, color: TEXT,
            }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export resume
          </button>
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

            <SectionCard title="Test scores" count={record.scores.length}
              hint="SAT, ACT, PSAT and AP exam results."
              action={<AddButton onClick={() => add("student_test_scores", "scores", { test_type: "sat", section_scores: {} })}>Add score</AddButton>}>
              {record.scores.length === 0
                ? <EmptyNote>Nothing here yet. Add a score when you have one, or leave it empty if you're going test-optional.</EmptyNote>
                : record.scores.map((s) => (
                    <ScoreRow key={s.id} score={s}
                      onPatch={(v) => patch("student_test_scores", "scores", s.id, v)}
                      onDelete={() => remove("student_test_scores", "scores", s.id)} />
                  ))}
            </SectionCard>

            <SectionCard title="Coursework" count={record.courses.length}
              hint="Course rigor is one of the first things admissions looks at, so tag the level."
              action={<AddButton onClick={() => add("student_courses", "courses", { name: "" })}>Add course</AddButton>}>
              {record.courses.length === 0
                ? <EmptyNote>No classes listed yet.</EmptyNote>
                : record.courses.map((c) => (
                    <CourseRow key={c.id} course={c}
                      onPatch={(v) => patch("student_courses", "courses", c.id, v)}
                      onDelete={() => remove("student_courses", "courses", c.id)} />
                  ))}
            </SectionCard>
          </motion.div>
        )}

        {tab === "ecs" && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            {/* Upload lives on this tab only: it parses activities and awards, not academics. */}
            <div style={{ background: WHITE, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: "1.3rem 1.5rem", marginBottom: "1.25rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <p style={{ fontFamily: SANS, fontWeight: 700, fontSize: "1.05rem", color: TEXT, marginBottom: 4 }}>
                    Have a resume or brag sheet?
                  </p>
                  <p style={{ fontFamily: SANS, fontSize: "0.92rem", color: TEXT_MUTED, lineHeight: 1.55, margin: 0 }}>
                    Upload it and we'll pull out your activities and awards. You review everything before it's added.
                  </p>
                </div>
                <div style={{ flexShrink: 0 }}>
                  <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.md" style={{ display: "none" }}
                    onChange={(e) => handleFile(e.target.files?.[0])} />
                  <button onClick={() => (uploadsLeft > 0 ? fileRef.current?.click() : setLimitModal("portfolio_upload"))}
                    disabled={uploading}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 8,
                      fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700,
                      cursor: uploading ? "default" : "pointer",
                      padding: "11px 18px", borderRadius: 11, border: "none",
                      background: "var(--accent)", color: WHITE,
                    }}>
                    {uploading && <Spinner size={15} color="#fff" />}
                    {uploading ? "Reading it…" : "Upload"}
                  </button>
                  <p style={{ fontFamily: SANS, fontSize: "0.82rem", color: TEXT_FAINT, textAlign: "center", marginTop: 7 }}>
                    {uploadsLeft} left
                  </p>
                </div>
              </div>
              {uploadError && (
                <p style={{ fontFamily: SANS, fontSize: "0.9rem", color: DANGER, fontWeight: 600, margin: "12px 0 0" }}>{uploadError}</p>
              )}
            </div>

            <SectionCard title="Activities" count={record.activities.length}
              hint="Clubs, sports, jobs, projects, volunteering, research. Open one to fill in your role, hours and what you actually did."
              action={<AddButton onClick={() => add("student_activities", "activities", { title: "", detail_level: "name_only", grade_levels: [] })}>Add activity</AddButton>}>
              {record.activities.length === 0
                ? <EmptyNote>Nothing here yet. Add an activity, or upload a resume above.</EmptyNote>
                : record.activities.map((a) => (
                    <ActivityCard key={a.id} activity={a}
                      onPatch={(v) => patch("student_activities", "activities", a.id, v)}
                      onDelete={() => remove("student_activities", "activities", a.id)} />
                  ))}
            </SectionCard>

            <SectionCard title="Awards and honors" count={record.awards.length}
              hint="Anything you were recognised for, at any level."
              action={<AddButton onClick={() => add("student_awards", "awards", { title: "" })}>Add award</AddButton>}>
              {record.awards.length === 0
                ? <EmptyNote>No awards listed yet.</EmptyNote>
                : record.awards.map((w) => (
                    <AwardRow key={w.id} award={w}
                      onPatch={(v) => patch("student_awards", "awards", w.id, v)}
                      onDelete={() => remove("student_awards", "awards", w.id)} />
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
      </AnimatePresence>

      {limitModal && <LimitModal feature={limitModal} onClose={() => setLimitModal(null)} />}
    </div>
  );
}
