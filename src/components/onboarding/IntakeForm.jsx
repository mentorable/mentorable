import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import RecordPanel, { sectionsFromForm } from "./RecordPanel.jsx";
import {
  SANS, TEXT, TEXT2, TEXT3, ACCENT, BORDER, CARD,
  eyebrowStyle, titleStyle, subtitleStyle, labelStyle, inputStyle,
  cardStyle, primaryButton,
} from "./intakeTheme.js";

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

/**
 * Split whatever the student typed or pasted into separate items.
 *
 * This is the fix for the most confusing thing about the first version: with an
 * Enter-only input, typing "debate, robotics, track" produced one nonsense entry.
 * Now commas and newlines split, so the natural mistake just works.
 */
function splitEntries(raw) {
  return String(raw || "")
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// ─── Shared bits ──────────────────────────────────────────────────────────────

function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom: "1.9rem" }}>
      <label style={labelStyle}>{label}</label>
      {children}
      {hint && (
        <p style={{ fontFamily: SANS, fontSize: "0.9rem", color: TEXT3, marginTop: 9, lineHeight: 1.5 }}>
          {hint}
        </p>
      )}
    </div>
  );
}

function Pills({ options, value, onChange }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button key={o.value} type="button"
            onClick={() => onChange(active ? null : o.value)}
            style={{
              fontFamily: SANS, fontSize: "1rem", fontWeight: 600, cursor: "pointer",
              padding: "11px 20px", borderRadius: 99,
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

function RemoveButton({ onClick, label }) {
  return (
    <button type="button" onClick={onClick} aria-label={`Remove ${label}`}
      style={{
        flexShrink: 0, border: "none", background: "none", cursor: "pointer",
        color: TEXT3, display: "inline-flex", alignItems: "center",
        padding: 6, borderRadius: 8, transition: "color 0.15s, background 0.15s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = "#dc2626"; e.currentTarget.style.background = "rgba(220,38,38,0.08)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = TEXT3; e.currentTarget.style.background = "none"; }}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  );
}

/** Input with a visible + button. Enter also works, but nothing depends on knowing that. */
function AddRow({ value, onChange, onAdd, placeholder, disabled }) {
  const canAdd = !disabled && value.trim().length > 0;
  return (
    <div style={{ position: "relative" }}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onAdd(); } }}
        placeholder={placeholder}
        disabled={disabled}
        style={{ ...inputStyle, paddingRight: 58, opacity: disabled ? 0.6 : 1 }}
        onFocus={(e) => (e.target.style.borderColor = ACCENT)}
        onBlur={(e) => (e.target.style.borderColor = BORDER)}
      />
      <button type="button" onClick={onAdd} disabled={!canAdd} aria-label="Add"
        style={{
          position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
          width: 38, height: 38, borderRadius: 10, border: "none",
          background: canAdd ? ACCENT : "rgba(59,91,252,0.12)",
          color: canAdd ? "#fff" : TEXT3,
          cursor: canAdd ? "pointer" : "not-allowed",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          transition: "all 0.15s",
        }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
    </div>
  );
}

function ItemRow({ children, onRemove, label }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        background: "#fff", border: `1px solid ${BORDER}`,
        borderRadius: 12, padding: "12px 12px 12px 16px",
      }}>
      {children}
      <RemoveButton onClick={onRemove} label={label} />
    </motion.div>
  );
}

/** Name-only list: type, hit +, item appears as its own removable row. */
function ItemList({ items, onChange, placeholder, max }) {
  const [draft, setDraft] = useState("");
  const atMax = max != null && items.length >= max;

  const add = () => {
    const entries = splitEntries(draft);
    if (!entries.length || atMax) return;
    const merged = [...items];
    for (const e of entries) {
      if (max != null && merged.length >= max) break;
      if (!merged.some((i) => i.toLowerCase() === e.toLowerCase())) merged.push(e);
    }
    onChange(merged);
    setDraft("");
  };

  return (
    <div>
      <AddRow value={draft} onChange={setDraft} onAdd={add} disabled={atMax}
        placeholder={atMax ? "Limit reached" : placeholder} />
      {items.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
          <AnimatePresence initial={false}>
            {items.map((item, i) => (
              <ItemRow key={`${item}-${i}`} label={item}
                onRemove={() => onChange(items.filter((_, j) => j !== i))}>
                <span style={{ fontFamily: SANS, fontSize: "1rem", fontWeight: 600, color: TEXT, flex: 1, minWidth: 0 }}>
                  {item}
                </span>
              </ItemRow>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

/** Courses carry a level, because course rigor is a primary academic signal. */
function CourseList({ items, onChange }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const entries = splitEntries(draft);
    if (!entries.length) return;
    onChange([...items, ...entries.map((name) => ({ name, level: null }))]);
    setDraft("");
  };
  return (
    <div>
      <AddRow value={draft} onChange={setDraft} onAdd={add}
        placeholder="e.g. AP Calculus BC" />
      {items.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
          <AnimatePresence initial={false}>
            {items.map((c, i) => (
              <ItemRow key={`${c.name}-${i}`} label={c.name}
                onRemove={() => onChange(items.filter((_, j) => j !== i))}>
                <span style={{ fontFamily: SANS, fontWeight: 600, fontSize: "1rem", color: TEXT, flex: 1, minWidth: 90 }}>
                  {c.name}
                </span>
                <select
                  value={c.level || ""}
                  onChange={(e) => onChange(items.map((x, j) => j === i ? { ...x, level: e.target.value || null } : x))}
                  style={{
                    fontFamily: SANS, fontSize: "0.9rem", fontWeight: 600, color: c.level ? ACCENT : TEXT3,
                    border: `1.5px solid ${BORDER}`, borderRadius: 9, padding: "8px 11px",
                    background: "#fff", cursor: "pointer", flexShrink: 0,
                  }}>
                  <option value="">Level</option>
                  {COURSE_LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </ItemRow>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

/** AP exams as subject + score. */
function ApList({ items, onChange }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const entries = splitEntries(draft);
    if (!entries.length) return;
    onChange([...items, ...entries.map((subject) => ({ subject, score: null }))]);
    setDraft("");
  };
  return (
    <div>
      <AddRow value={draft} onChange={setDraft} onAdd={add} placeholder="AP subject" />
      {items.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
          <AnimatePresence initial={false}>
            {items.map((ap, i) => (
              <ItemRow key={`${ap.subject}-${i}`} label={ap.subject}
                onRemove={() => onChange(items.filter((_, j) => j !== i))}>
                <span style={{ fontFamily: SANS, fontWeight: 600, fontSize: "1rem", color: TEXT, flex: 1, minWidth: 80 }}>
                  {ap.subject}
                </span>
                <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button"
                      onClick={() => onChange(items.map((x, j) => j === i ? { ...x, score: x.score === n ? null : n } : x))}
                      style={{
                        width: 34, height: 34, borderRadius: 9, cursor: "pointer",
                        fontFamily: SANS, fontWeight: 700, fontSize: "0.92rem",
                        border: `1.5px solid ${ap.score === n ? ACCENT : BORDER}`,
                        background: ap.score === n ? ACCENT : "#fff",
                        color: ap.score === n ? "#fff" : TEXT2,
                      }}>{n}</button>
                  ))}
                </div>
              </ItemRow>
            ))}
          </AnimatePresence>
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
  { id: "identity",  eyebrow: "Getting started", title: "Let's start with the basics",  blurb: "Just enough to know where you are in the process." },
  { id: "academics", eyebrow: "Academics",       title: "Your grades and classes",      blurb: "Skip anything that doesn't apply to you yet." },
  { id: "testing",   eyebrow: "Testing",         title: "Any test scores?",             blurb: "Plenty of students don't have these yet. That's completely fine." },
  { id: "record",    eyebrow: "Your record",     title: "What you've been doing",       blurb: "Just the names for now. We'll talk through the details right after." },
  { id: "direction", eyebrow: "Direction",       title: "Where you're headed",          blurb: "Rough guesses are genuinely useful here." },
];

export default function IntakeForm({ initial, onComplete, submitting, isMobile }) {
  const [step, setStep] = useState(0);
  const [v, setV] = useState({ ...EMPTY_INTAKE, ...(initial || {}) });
  const set = (patch) => setV((prev) => ({ ...prev, ...patch }));

  // Steps vary a lot in height, so without this you land mid-page (or below the
  // content entirely) after advancing from a tall step to a short one.
  useEffect(() => { window.scrollTo({ top: 0, behavior: "smooth" }); }, [step]);

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  // Only the first step gates progress; everything after it is legitimately skippable.
  const canAdvance = step > 0 || (v.fullName.trim() && v.graduationYear);

  const next = () => (isLast ? onComplete(v) : setStep((s) => s + 1));

  return (
    <div style={{
      display: "flex", gap: "2.5rem", alignItems: "flex-start",
      width: "100%", maxWidth: 1240, margin: "0 auto", padding: "0 1.5rem",
      flexDirection: isMobile ? "column" : "row",
    }}>
      {/* ── Left: the step ── */}
      <div style={{ flex: "1 1 0", minWidth: 0, width: "100%" }}>
        <div style={{ display: "flex", gap: 7, marginBottom: "2rem" }}>
          {STEPS.map((s, i) => (
            <div key={s.id} style={{
              flex: 1, height: 5, borderRadius: 99,
              background: i <= step ? ACCENT : "rgba(59,91,252,0.15)",
              transition: "background 0.3s",
            }} />
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={current.id}
            initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -14 }}
            transition={{ duration: 0.28 }}>

            <p style={eyebrowStyle}>{current.eyebrow}</p>
            <h1 style={titleStyle}>{current.title}</h1>
            <p style={subtitleStyle}>{current.blurb}</p>

            <div style={cardStyle}>
              {current.id === "identity" && (
                <>
                  <Field label="Your name">
                    <input value={v.fullName} onChange={(e) => set({ fullName: e.target.value })}
                      placeholder="First and last" style={inputStyle}
                      onFocus={(e) => (e.target.style.borderColor = ACCENT)}
                      onBlur={(e) => (e.target.style.borderColor = BORDER)} />
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
                      onFocus={(e) => (e.target.style.borderColor = ACCENT)}
                      onBlur={(e) => (e.target.style.borderColor = BORDER)} />
                  </Field>
                </>
              )}

              {current.id === "academics" && (
                <>
                  <Field label="What scale is your GPA on?">
                    <Pills options={GPA_SCALES} value={v.gpaScale} onChange={(s) => set({ gpaScale: s })} />
                  </Field>
                  {v.gpaScale !== "not_used" && (
                    <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                      <div style={{ flex: 1, minWidth: 160 }}>
                        <Field label="Unweighted GPA">
                          <input value={v.gpaUnweighted} onChange={(e) => set({ gpaUnweighted: e.target.value })}
                            inputMode="decimal" placeholder="3.87" style={inputStyle}
                            onFocus={(e) => (e.target.style.borderColor = ACCENT)}
                            onBlur={(e) => (e.target.style.borderColor = BORDER)} />
                        </Field>
                      </div>
                      <div style={{ flex: 1, minWidth: 160 }}>
                        <Field label="Weighted GPA">
                          <input value={v.gpaWeighted} onChange={(e) => set({ gpaWeighted: e.target.value })}
                            inputMode="decimal" placeholder="Optional" style={inputStyle}
                            onFocus={(e) => (e.target.style.borderColor = ACCENT)}
                            onBlur={(e) => (e.target.style.borderColor = BORDER)} />
                        </Field>
                      </div>
                    </div>
                  )}
                  <Field label="Courses you're taking or plan to take"
                    hint="Add them one at a time, or paste a comma separated list and we'll split it for you.">
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
                    <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                      {[
                        ["Total", "total", "1520"],
                        ["Reading & Writing", "rw", "760"],
                        ["Math", "math", "760"],
                      ].map(([label, key, ph]) => (
                        <div key={key} style={{ flex: 1, minWidth: 130 }}>
                          <Field label={label}>
                            <input value={v.sat[key]} onChange={(e) => set({ sat: { ...v.sat, [key]: e.target.value } })}
                              inputMode="numeric" placeholder={ph} style={inputStyle}
                              onFocus={(e) => (e.target.style.borderColor = ACCENT)}
                              onBlur={(e) => (e.target.style.borderColor = BORDER)} />
                          </Field>
                        </div>
                      ))}
                    </div>
                  )}
                  {v.testType === "act" && (
                    <Field label="Composite score">
                      <input value={v.act.composite} onChange={(e) => set({ act: { composite: e.target.value } })}
                        inputMode="numeric" placeholder="34" style={inputStyle}
                        onFocus={(e) => (e.target.style.borderColor = ACCENT)}
                        onBlur={(e) => (e.target.style.borderColor = BORDER)} />
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
                    hint="Clubs, sports, jobs, projects, volunteering, research. One per entry, or paste a list and we'll split it.">
                    <ItemList items={v.activities} onChange={(activities) => set({ activities })}
                      placeholder="e.g. Science Olympiad" max={15} />
                  </Field>
                  <Field label="Awards and honors" hint="Anything you were recognised for, at any level.">
                    <ItemList items={v.awards} onChange={(awards) => set({ awards })}
                      placeholder="e.g. State finalist" max={15} />
                  </Field>
                </>
              )}

              {current.id === "direction" && (
                <>
                  <Field label="Majors you're considering" hint="Even if you're not sure. Two or three guesses is plenty.">
                    <ItemList items={v.majors} onChange={(majors) => set({ majors })}
                      placeholder="e.g. Computer Science" max={6} />
                  </Field>
                  <Field label="Colleges you're thinking about"
                    hint="Skip it if you have no idea yet. We'll help you build a real list later.">
                    <ItemList items={v.colleges} onChange={(colleges) => set({ colleges })}
                      placeholder="e.g. Georgia Tech" max={20} />
                  </Field>
                </>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: "1.75rem" }}>
              {step > 0 && (
                <button type="button" onClick={() => setStep((s) => s - 1)} disabled={submitting}
                  style={{
                    fontFamily: SANS, fontSize: "1.05rem", fontWeight: 700, cursor: "pointer",
                    padding: "16px 26px", borderRadius: 14,
                    border: `1.5px solid ${BORDER}`, background: "#fff", color: TEXT2,
                  }}>
                  Back
                </button>
              )}
              <button type="button" onClick={next} disabled={!canAdvance || submitting}
                style={primaryButton(canAdvance && !submitting)}>
                {submitting ? "Saving…" : isLast ? "Continue" : "Next"}
              </button>
            </div>

            <p style={{ fontFamily: SANS, fontSize: "0.92rem", color: TEXT3, textAlign: "center", marginTop: 15 }}>
              Step {step + 1} of {STEPS.length}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Right: the record building up ── */}
      <div style={{ flex: isMobile ? "1 1 auto" : "0 0 340px", width: "100%", maxWidth: isMobile ? "none" : 340 }}>
        <RecordPanel sections={sectionsFromForm(v)} sticky={!isMobile} />
      </div>
    </div>
  );
}
