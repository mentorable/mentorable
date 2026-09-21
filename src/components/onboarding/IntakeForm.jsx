import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

// Design tokens mirror OnboardingPage's palette.
const SANS    = "'Raleway', sans-serif";
const TEXT    = "#0e1019";
const TEXT2   = "#4b5470";
const TEXT3   = "#5b6188";
const ACCENT  = "#1d4ed8";
const BORDER  = "rgba(59,91,252,0.18)";
const CARD    = "#ffffff";

const GPA_SCALES = [
  { value: "4.0",      label: "4.0 scale" },
  { value: "5.0",      label: "5.0 scale" },
  { value: "100",      label: "100 point" },
  { value: "other",    label: "Other" },
  { value: "not_used", label: "My school doesn't use GPA" },
];

const COURSE_LEVELS = [
  { value: "ap",              label: "AP" },
  { value: "ib",              label: "IB" },
  { value: "honors",          label: "Honors" },
  { value: "dual_enrollment", label: "Dual enrollment" },
  { value: "regular",         label: "Regular" },
];

const currentYear = new Date().getFullYear();
const GRAD_YEARS = Array.from({ length: 6 }, (_, i) => currentYear + i);

// ─── Small shared inputs ──────────────────────────────────────────────────────

const labelStyle = {
  fontFamily: SANS, fontSize: "0.82rem", fontWeight: 700,
  color: ACCENT, display: "block", marginBottom: 8,
};

const inputStyle = {
  width: "100%", fontFamily: SANS, fontSize: "1rem", color: TEXT,
  border: `1.5px solid ${BORDER}`, borderRadius: 11, padding: "12px 14px",
  outline: "none", background: "#fff", boxSizing: "border-box",
};

function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom: "1.4rem" }}>
      <label style={labelStyle}>{label}</label>
      {children}
      {hint && (
        <p style={{ fontFamily: SANS, fontSize: "0.8rem", color: TEXT3, marginTop: 7, lineHeight: 1.45 }}>
          {hint}
        </p>
      )}
    </div>
  );
}

function Pills({ options, value, onChange, allowClear = true }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button key={o.value} type="button"
            onClick={() => onChange(active && allowClear ? null : o.value)}
            style={{
              fontFamily: SANS, fontSize: "0.9rem", fontWeight: 600, cursor: "pointer",
              padding: "8px 15px", borderRadius: 99,
              border: `1.5px solid ${active ? ACCENT : BORDER}`,
              background: active ? ACCENT : "#fff",
              color: active ? "#fff" : TEXT2, transition: "all 0.15s",
            }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Name-only list input. Type and press Enter (or comma) to add.
 * Deliberately has no description field: depth is the conversation's job.
 */
function ChipList({ items, onChange, placeholder, max }) {
  const [draft, setDraft] = useState("");
  const atMax = max != null && items.length >= max;

  const add = (raw) => {
    const value = (raw ?? draft).trim().replace(/,$/, "");
    if (!value || atMax) return;
    if (items.some((i) => i.toLowerCase() === value.toLowerCase())) { setDraft(""); return; }
    onChange([...items, value]);
    setDraft("");
  };

  return (
    <div>
      <input
        value={draft}
        onChange={(e) => {
          const v = e.target.value;
          if (v.endsWith(",")) add(v.slice(0, -1));
          else setDraft(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); add(); }
          if (e.key === "Backspace" && !draft && items.length) onChange(items.slice(0, -1));
        }}
        onBlur={() => add()}
        placeholder={atMax ? "Limit reached" : placeholder}
        disabled={atMax}
        style={{ ...inputStyle, opacity: atMax ? 0.6 : 1 }}
        onFocus={(e) => (e.target.style.borderColor = ACCENT)}
      />
      {items.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 11 }}>
          {items.map((item, i) => (
            <motion.span key={`${item}-${i}`}
              initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }}
              style={{
                display: "inline-flex", alignItems: "center", gap: 7,
                fontFamily: SANS, fontSize: "0.88rem", fontWeight: 600, color: TEXT,
                background: "rgba(59,91,252,0.07)", border: `1px solid ${BORDER}`,
                borderRadius: 9, padding: "6px 10px",
              }}>
              {item}
              <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))}
                aria-label={`Remove ${item}`}
                style={{ border: "none", background: "none", cursor: "pointer", color: TEXT3, padding: 0, display: "inline-flex" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </motion.span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Courses carry a level because course rigor is a primary academic signal. */
function CourseList({ items, onChange }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const name = draft.trim();
    if (!name) return;
    onChange([...items, { name, level: null }]);
    setDraft("");
  };
  return (
    <div>
      <input
        value={draft} onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
        onBlur={add}
        placeholder="e.g. AP Calculus BC, then press Enter"
        style={inputStyle}
        onFocus={(e) => (e.target.style.borderColor = ACCENT)}
      />
      {items.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 12 }}>
          {items.map((c, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
              background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 11, padding: "10px 12px",
            }}>
              <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: "0.92rem", color: TEXT, flex: 1, minWidth: 120 }}>
                {c.name}
              </span>
              <select
                value={c.level || ""}
                onChange={(e) => onChange(items.map((x, j) => j === i ? { ...x, level: e.target.value || null } : x))}
                style={{ fontFamily: SANS, fontSize: "0.84rem", color: TEXT2, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "6px 9px", background: "#fff", cursor: "pointer" }}>
                <option value="">Level</option>
                {COURSE_LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
              <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))}
                aria-label={`Remove ${c.name}`}
                style={{ border: "none", background: "none", cursor: "pointer", color: TEXT3, display: "inline-flex" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** AP exams as subject + score pairs. */
function ApList({ items, onChange }) {
  const [subject, setSubject] = useState("");
  const add = () => {
    const s = subject.trim();
    if (!s) return;
    onChange([...items, { subject: s, score: null }]);
    setSubject("");
  };
  return (
    <div>
      <input
        value={subject} onChange={(e) => setSubject(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
        onBlur={add}
        placeholder="AP subject, then press Enter"
        style={inputStyle}
        onFocus={(e) => (e.target.style.borderColor = ACCENT)}
      />
      {items.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 12 }}>
          {items.map((ap, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 11, padding: "10px 12px" }}>
              <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: "0.92rem", color: TEXT, flex: 1 }}>{ap.subject}</span>
              <div style={{ display: "flex", gap: 5 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button"
                    onClick={() => onChange(items.map((x, j) => j === i ? { ...x, score: x.score === n ? null : n } : x))}
                    style={{
                      width: 30, height: 30, borderRadius: 8, cursor: "pointer",
                      fontFamily: SANS, fontWeight: 700, fontSize: "0.85rem",
                      border: `1.5px solid ${ap.score === n ? ACCENT : BORDER}`,
                      background: ap.score === n ? ACCENT : "#fff",
                      color: ap.score === n ? "#fff" : TEXT2,
                    }}>{n}</button>
                ))}
              </div>
              <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))}
                aria-label={`Remove ${ap.subject}`}
                style={{ border: "none", background: "none", cursor: "pointer", color: TEXT3, display: "inline-flex" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── The form ─────────────────────────────────────────────────────────────────

export const EMPTY_INTAKE = {
  fullName: "", graduationYear: null, gradeLevel: null, state: "",
  gpaUnweighted: "", gpaWeighted: "", gpaScale: null,
  testType: null, sat: { total: "", rw: "", math: "" }, act: { composite: "" },
  aps: [], courses: [], activities: [], awards: [], majors: [], colleges: [],
};

const STEPS = [
  { id: "identity",  title: "Let's start with the basics",   blurb: "Just enough to know where you are in the process." },
  { id: "academics", title: "Your academics",                blurb: "Skip anything that doesn't apply to you yet." },
  { id: "testing",   title: "Testing",                       blurb: "Plenty of students don't have scores yet. That's fine." },
  { id: "record",    title: "What you've been doing",        blurb: "Just the names. We'll talk through the details next." },
  { id: "direction", title: "Where you're headed",           blurb: "Rough guesses are genuinely useful here." },
];

export default function IntakeForm({ initial, onComplete, submitting }) {
  const [step, setStep] = useState(0);
  const [v, setV] = useState({ ...EMPTY_INTAKE, ...(initial || {}) });
  const set = (patch) => setV((prev) => ({ ...prev, ...patch }));

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  // Only the first step gates progress: everything after it is legitimately skippable.
  const canAdvance = step > 0 || (v.fullName.trim() && v.graduationYear);

  const next = () => (isLast ? onComplete(v) : setStep((s) => s + 1));

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}
      style={{ width: "100%", maxWidth: 620, margin: "0 auto", padding: "0 1.25rem" }}
    >
      {/* Progress */}
      <div style={{ display: "flex", gap: 6, marginBottom: "1.75rem" }}>
        {STEPS.map((s, i) => (
          <div key={s.id} style={{
            flex: 1, height: 4, borderRadius: 99,
            background: i <= step ? ACCENT : "rgba(59,91,252,0.15)",
            transition: "background 0.3s",
          }} />
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={current.id}
          initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -14 }}
          transition={{ duration: 0.28 }}>

          <h1 style={{ fontFamily: SANS, fontWeight: 700, fontSize: "1.9rem", color: TEXT, letterSpacing: "-0.02em", marginBottom: "0.5rem" }}>
            {current.title}
          </h1>
          <p style={{ fontFamily: SANS, fontSize: "1rem", color: TEXT2, lineHeight: 1.6, marginBottom: "2rem" }}>
            {current.blurb}
          </p>

          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 18, padding: "1.6rem", boxShadow: "0 2px 12px rgba(15,23,42,0.05)" }}>

            {current.id === "identity" && (
              <>
                <Field label="Your name">
                  <input value={v.fullName} onChange={(e) => set({ fullName: e.target.value })}
                    placeholder="First and last" style={inputStyle}
                    onFocus={(e) => (e.target.style.borderColor = ACCENT)} />
                </Field>
                <Field label="When do you graduate high school?">
                  <Pills options={GRAD_YEARS.map((y) => ({ value: y, label: String(y) }))}
                    value={v.graduationYear} onChange={(y) => set({ graduationYear: y })} />
                </Field>
                <Field label="What grade are you in?">
                  <Pills options={[9, 10, 11, 12].map((g) => ({ value: g, label: `${g}th` }))}
                    value={v.gradeLevel} onChange={(g) => set({ gradeLevel: g })} />
                </Field>
                <Field label="Where are you based?" hint="Optional. It affects in-state options and some opportunities.">
                  <input value={v.state} onChange={(e) => set({ state: e.target.value })}
                    placeholder="State or country" style={inputStyle}
                    onFocus={(e) => (e.target.style.borderColor = ACCENT)} />
                </Field>
              </>
            )}

            {current.id === "academics" && (
              <>
                <Field label="What scale is your GPA on?">
                  <Pills options={GPA_SCALES} value={v.gpaScale} onChange={(s) => set({ gpaScale: s })} />
                </Field>
                {v.gpaScale !== "not_used" && (
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 150 }}>
                      <Field label="Unweighted GPA">
                        <input value={v.gpaUnweighted} onChange={(e) => set({ gpaUnweighted: e.target.value })}
                          inputMode="decimal" placeholder="3.87" style={inputStyle}
                          onFocus={(e) => (e.target.style.borderColor = ACCENT)} />
                      </Field>
                    </div>
                    <div style={{ flex: 1, minWidth: 150 }}>
                      <Field label="Weighted GPA">
                        <input value={v.gpaWeighted} onChange={(e) => set({ gpaWeighted: e.target.value })}
                          inputMode="decimal" placeholder="Optional" style={inputStyle}
                          onFocus={(e) => (e.target.style.borderColor = ACCENT)} />
                      </Field>
                    </div>
                  </div>
                )}
                <Field label="Courses you're taking or plan to take"
                  hint="Course rigor is one of the first things admissions looks at. Tag the level where you know it.">
                  <CourseList items={v.courses} onChange={(courses) => set({ courses })} />
                </Field>
              </>
            )}

            {current.id === "testing" && (
              <>
                <Field label="Have you taken the SAT or ACT?">
                  <Pills
                    options={[
                      { value: "sat",  label: "SAT" },
                      { value: "act",  label: "ACT" },
                      { value: "none", label: "Not yet" },
                    ]}
                    value={v.testType} onChange={(t) => set({ testType: t })} />
                </Field>
                {v.testType === "sat" && (
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 110 }}>
                      <Field label="Total">
                        <input value={v.sat.total} onChange={(e) => set({ sat: { ...v.sat, total: e.target.value } })}
                          inputMode="numeric" placeholder="1520" style={inputStyle}
                          onFocus={(e) => (e.target.style.borderColor = ACCENT)} />
                      </Field>
                    </div>
                    <div style={{ flex: 1, minWidth: 110 }}>
                      <Field label="Reading & Writing">
                        <input value={v.sat.rw} onChange={(e) => set({ sat: { ...v.sat, rw: e.target.value } })}
                          inputMode="numeric" placeholder="760" style={inputStyle}
                          onFocus={(e) => (e.target.style.borderColor = ACCENT)} />
                      </Field>
                    </div>
                    <div style={{ flex: 1, minWidth: 110 }}>
                      <Field label="Math">
                        <input value={v.sat.math} onChange={(e) => set({ sat: { ...v.sat, math: e.target.value } })}
                          inputMode="numeric" placeholder="760" style={inputStyle}
                          onFocus={(e) => (e.target.style.borderColor = ACCENT)} />
                      </Field>
                    </div>
                  </div>
                )}
                {v.testType === "act" && (
                  <Field label="Composite score">
                    <input value={v.act.composite} onChange={(e) => set({ act: { composite: e.target.value } })}
                      inputMode="numeric" placeholder="34" style={inputStyle}
                      onFocus={(e) => (e.target.style.borderColor = ACCENT)} />
                  </Field>
                )}
                <Field label="AP exams you've taken" hint="Optional. Add the subject, then tap the score you got.">
                  <ApList items={v.aps} onChange={(aps) => set({ aps })} />
                </Field>
              </>
            )}

            {current.id === "record" && (
              <>
                <Field label="Activities"
                  hint="Clubs, sports, jobs, projects, volunteering, research. Names only, we'll get into the detail in a moment.">
                  <ChipList items={v.activities} onChange={(activities) => set({ activities })}
                    placeholder="e.g. Science Olympiad, then press Enter" max={15} />
                </Field>
                <Field label="Awards and honors" hint="Anything you were recognised for, at any level.">
                  <ChipList items={v.awards} onChange={(awards) => set({ awards })}
                    placeholder="e.g. State finalist, then press Enter" max={15} />
                </Field>
              </>
            )}

            {current.id === "direction" && (
              <>
                <Field label="Majors you're considering" hint="Even if you're not sure. Two or three guesses is plenty.">
                  <ChipList items={v.majors} onChange={(majors) => set({ majors })}
                    placeholder="e.g. Computer Science, then press Enter" max={6} />
                </Field>
                <Field label="Colleges you're thinking about"
                  hint="Skip it if you have no idea yet. We'll help you build a real list later.">
                  <ChipList items={v.colleges} onChange={(colleges) => set({ colleges })}
                    placeholder="e.g. Georgia Tech, then press Enter" max={20} />
                </Field>
              </>
            )}
          </div>

          {/* Nav */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: "1.5rem" }}>
            {step > 0 && (
              <button type="button" onClick={() => setStep((s) => s - 1)} disabled={submitting}
                style={{ fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700, cursor: "pointer", padding: "13px 20px", borderRadius: 12, border: `1.5px solid ${BORDER}`, background: "#fff", color: TEXT2 }}>
                Back
              </button>
            )}
            <button type="button" onClick={next} disabled={!canAdvance || submitting}
              style={{
                flex: 1, fontFamily: SANS, fontSize: "1rem", fontWeight: 700,
                cursor: canAdvance && !submitting ? "pointer" : "not-allowed",
                padding: "14px", borderRadius: 12, border: "none",
                background: canAdvance ? ACCENT : "#c7d2e8", color: "#fff",
                boxShadow: canAdvance ? `0 6px 20px rgba(29,78,216,0.28)` : "none",
                transition: "all 0.15s",
              }}>
              {submitting ? "Saving…" : isLast ? "Continue" : "Next"}
            </button>
          </div>

          <p style={{ fontFamily: SANS, fontSize: "0.84rem", color: TEXT3, textAlign: "center", marginTop: 13 }}>
            Step {step + 1} of {STEPS.length}
          </p>
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}
