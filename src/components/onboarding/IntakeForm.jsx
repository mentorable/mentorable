import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import RecordPanel, { sectionsFromForm } from "./RecordPanel.jsx";
import { Button, Card, Tip } from "../ui/kit.jsx";
import {
  BORDER, DANGER, FOCUS_CLASS, INPUT_CLASS, PRESS_CLASS, RADIUS, SANS, SURFACE, TEXT, TEXT_MUTED, WHITE,
  inputStyle, labelStyle, pillStyle, squareChoiceStyle, titleStyle, useIntakeInk,
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

// Column widths for the three-column layout.
const FORM_W  = 640;
const PANEL_W = 340;

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

/**
 * What a list holds once the text still sitting in its box is counted. A student
 * who types an entry and goes straight to Next has still told us about it, so
 * the + is a shortcut and never a requirement. Each returns `items` untouched
 * when the box is empty.
 */
function addNames(items, draft, max) {
  const merged = [...items];
  for (const e of splitEntries(draft)) {
    if (max != null && merged.length >= max) break;
    if (!merged.some((i) => i.toLowerCase() === e.toLowerCase())) merged.push(e);
  }
  return merged;
}
const addCourses = (items, draft) => [...items, ...splitEntries(draft).map((name) => ({ name, level: null }))];
const addAps = (items, draft) => [...items, ...splitEntries(draft).map((subject) => ({ subject, score: null }))];

// What each box feeds: the field it fills and how its text joins the list.
const DRAFT_FIELDS = {
  courses:    (items, draft) => addCourses(items, draft),
  aps:        (items, draft) => addAps(items, draft),
  activities: (items, draft) => addNames(items, draft, 15),
  awards:     (items, draft) => addNames(items, draft, 15),
  majors:     (items, draft) => addNames(items, draft, 6),
  colleges:   (items, draft) => addNames(items, draft, 20),
};

function withDrafts(values, drafts) {
  const patch = {};
  for (const [field, join] of Object.entries(DRAFT_FIELDS)) {
    if (splitEntries(drafts[field]).length) patch[field] = join(values[field] || [], drafts[field]);
  }
  return { ...values, ...patch };
}

// ─── Shared bits ──────────────────────────────────────────────────────────────

function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom: "1.6rem" }}>
      <label style={labelStyle}>{label}</label>
      {children}
      {hint && (
        <p style={{ fontFamily: SANS, fontSize: "0.92rem", color: TEXT_MUTED, marginTop: 8, lineHeight: 1.5 }}>
          {hint}
        </p>
      )}
    </div>
  );
}

function Pills({ options, value, onChange }) {
  const ink = useIntakeInk();
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button key={o.value} type="button" aria-pressed={active} className={FOCUS_CLASS}
            onClick={() => onChange(active ? null : o.value)}
            style={pillStyle(ink, active)}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function RemoveButton({ onClick, label }) {
  return (
    <button type="button" onClick={onClick} aria-label={`Remove ${label}`} className={FOCUS_CLASS}
      style={{
        flexShrink: 0, border: "none", background: "none", cursor: "pointer",
        color: TEXT_MUTED, display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 40, height: 40, margin: "-4px -4px -4px 0", borderRadius: 10, transition: "color 0.15s, background 0.15s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = DANGER; e.currentTarget.style.background = "#fdf1f0"; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = TEXT_MUTED; e.currentTarget.style.background = "none"; }}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  );
}

/** Input with a visible + button. Enter also works, and so does Next: nothing depends on knowing any of them. */
function AddRow({ value, onChange, onAdd, placeholder, disabled }) {
  const ink = useIntakeInk();
  const canAdd = !disabled && value.trim().length > 0;
  return (
    <>
    <div style={{ position: "relative" }}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onAdd(); } }}
        placeholder={placeholder}
        disabled={disabled}
        className={INPUT_CLASS}
        style={{ ...inputStyle, paddingRight: 58, opacity: disabled ? 0.6 : 1 }}
      />
      <button type="button" onClick={onAdd} disabled={!canAdd} aria-label="Add"
        className={`${FOCUS_CLASS} ${canAdd ? PRESS_CLASS : ""}`}
        style={{
          position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
          width: 38, height: 38, borderRadius: 10, border: "none",
          background: canAdd ? ink.button.bg : SURFACE,
          color: canAdd ? ink.button.fg : TEXT_MUTED,
          cursor: canAdd ? "pointer" : "not-allowed",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          transition: "background 0.15s, color 0.15s",
        }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
    </div>
    {canAdd && (
      <p style={{ fontFamily: SANS, fontSize: "0.92rem", fontWeight: 600, color: ink.text, margin: "8px 0 0" }}>
        Press + to add it to your list. Next adds it too.
      </p>
    )}
    </>
  );
}

function ItemRow({ children, onRemove, label }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        background: WHITE, border: `1px solid ${BORDER}`,
        borderRadius: RADIUS.control, padding: "10px 10px 10px 14px", minWidth: 0,
      }}>
      {children}
      <RemoveButton onClick={onRemove} label={label} />
    </motion.div>
  );
}

/** Name-only list: type, hit +, item appears as its own removable row. */
function ItemList({ items, onChange, placeholder, max, draft, setDraft }) {
  const atMax = max != null && items.length >= max;

  const add = () => {
    if (!splitEntries(draft).length || atMax) return;
    onChange(addNames(items, draft, max));
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
                <span style={{ fontFamily: SANS, fontSize: "1rem", fontWeight: 600, color: TEXT, flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>
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
function CourseList({ items, onChange, draft, setDraft }) {
  const ink = useIntakeInk();
  const add = () => {
    if (!splitEntries(draft).length) return;
    onChange(addCourses(items, draft));
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
                  className={INPUT_CLASS}
                  style={{
                    fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700, color: c.level ? ink.text : TEXT_MUTED,
                    border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: "0 10px", minHeight: 40,
                    background: WHITE, cursor: "pointer", flexShrink: 0,
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
function ApList({ items, onChange, draft, setDraft }) {
  const ink = useIntakeInk();
  const add = () => {
    if (!splitEntries(draft).length) return;
    onChange(addAps(items, draft));
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
                    <button key={n} type="button" aria-pressed={ap.score === n} className={FOCUS_CLASS}
                      onClick={() => onChange(items.map((x, j) => j === i ? { ...x, score: x.score === n ? null : n } : x))}
                      style={squareChoiceStyle(ink, ap.score === n, 36)}>{n}</button>
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

/**
 * Autosave to localStorage so an accidental refresh mid-form doesn't wipe
 * everything the student has typed.
 *
 * Deliberately local rather than a per-keystroke DB write: this is a draft,
 * not a record, and the real save happens once on submit. Keyed by user id so
 * a shared browser never restores someone else's answers.
 */
const DRAFT_PREFIX = "mentorable_intake_form:";

export function draftKey(userId) {
  return `${DRAFT_PREFIX}${userId || "anon"}`;
}

function loadDraft(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;   // private mode, cleared storage, or corrupt JSON
  }
}

export function clearDraft(userId) {
  try { localStorage.removeItem(draftKey(userId)); } catch { /* nothing to do */ }
}

export const EMPTY_INTAKE = {
  fullName: "", graduationYear: null, gradeLevel: null, state: "",
  gpaUnweighted: "", gpaWeighted: "", gpaScale: null,
  testType: null, sat: { total: "", rw: "", math: "" }, act: { composite: "" },
  aps: [], courses: [], activities: [], awards: [], majors: [], colleges: [],
};

const STEPS = [
  { id: "identity",  stamp: "person", title: "Let's start with the basics",  blurb: "Just enough to know where you are in the process." },
  { id: "academics", stamp: "scroll", title: "Your grades and classes",      blurb: "Skip anything that doesn't apply to you yet." },
  { id: "testing",   stamp: "check",  title: "Any test scores?",             blurb: "Plenty of students don't have these yet. That's completely fine." },
  { id: "record",    stamp: "star",   title: "What you've been doing",       blurb: "Just the names for now. We'll talk through the details right after." },
  { id: "direction", stamp: "flag",   title: "Where you're headed",          blurb: "Rough guesses are genuinely useful here." },
];

export default function IntakeForm({ initial, startAt, onComplete, submitting, isMobile, userId }) {
  const ink = useIntakeInk();
  const key = draftKey(userId);
  // Restored values win over `initial`: they're the newer edit.
  const restored = loadDraft(key);
  const [step, setStep] = useState(() => {
    // Sent back to add something ("Add one" on the channel page): open that step,
    // not the last one the saved draft remembers.
    const asked = STEPS.findIndex((s) => s.id === startAt);
    if (asked >= 0) return asked;
    const n = restored?.step;
    return Number.isInteger(n) && n >= 0 && n < STEPS.length ? n : 0;
  });
  const [v, setV] = useState(() => ({ ...EMPTY_INTAKE, ...(initial || {}), ...(restored?.values || {}) }));
  const set = (patch) => setV((prev) => ({ ...prev, ...patch }));
  // The text in each list's box, kept here (not in the list) so Next can count it.
  const [drafts, setDrafts] = useState({});
  const draftOf = (field) => ({ draft: drafts[field] || "", setDraft: (text) => setDrafts((d) => ({ ...d, [field]: text })) });

  // Persist on every change. The payload is a few hundred bytes, so there's no
  // need to debounce.
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify({ values: v, step })); }
    catch { /* storage full or blocked: the form still works, just won't restore */ }
  }, [key, v, step]);

  // Steps vary a lot in height, so without this you land mid-page (or below the
  // content entirely) after advancing from a tall step to a short one.
  useEffect(() => { window.scrollTo({ top: 0, behavior: "smooth" }); }, [step]);

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  // Only the first step gates progress; everything after it is legitimately skippable.
  const canAdvance = step > 0 || (v.fullName.trim() && v.graduationYear);

  // Whatever is still typed in a box joins its list before the form moves on.
  const next = () => {
    const merged = withDrafts(v, drafts);
    if (Object.keys(DRAFT_FIELDS).some((f) => merged[f] !== v[f])) {
      setV(merged);
      setDrafts({});
    }
    return isLast ? onComplete(merged) : setStep((s) => s + 1);
  };

  return (
    // Three columns: an empty spacer, the form, then the record panel. The spacer
    // matches the panel's width so the form sits genuinely centred in the
    // viewport rather than being shoved left by the panel. The spacer collapses
    // first on narrower screens, so the form drifts instead of overflowing.
    <div style={{
      display: "grid",
      gridTemplateColumns: isMobile ? "1fr" : `minmax(0, ${PANEL_W}px) minmax(0, ${FORM_W}px) ${PANEL_W}px`,
      gap: isMobile ? "2rem" : "2rem",
      alignItems: "start", justifyContent: "center",
      width: "100%", margin: "0 auto", padding: isMobile ? "0 1rem" : "0 1.5rem", boxSizing: "border-box",
    }}>
      {!isMobile && <div aria-hidden="true" />}

      {/* ── Centre: the step ── */}
      <div style={{ minWidth: 0, width: "100%" }}>
        <div style={{ display: "flex", gap: 7, marginBottom: "2rem" }}>
          {STEPS.map((s, i) => (
            <div key={s.id} style={{
              flex: 1, height: 6, borderRadius: RADIUS.pill,
              background: i <= step ? ink.accent : BORDER,
              transition: "background 0.3s",
            }} />
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={current.id}
            initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -14 }}
            transition={{ duration: 0.28 }}>

            <h1 style={titleStyle(ink, isMobile)}>{current.title}</h1>
            <Tip name="Mentorable" stamp={current.stamp} tone="default" style={{ marginBottom: "1.4rem" }}>
              {current.blurb}
            </Tip>

            <Card style={{ padding: isMobile ? "1.2rem 1.1rem 0.2rem" : "1.6rem 1.6rem 0.4rem" }}>
              {current.id === "identity" && (
                <>
                  <Field label="Your name">
                    <input value={v.fullName} onChange={(e) => set({ fullName: e.target.value })}
                      placeholder="First and last" style={inputStyle} className={INPUT_CLASS} />
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
                      placeholder="State or country" style={inputStyle} className={INPUT_CLASS} />
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
                            inputMode="decimal" placeholder="3.87" style={inputStyle} className={INPUT_CLASS} />
                        </Field>
                      </div>
                      <div style={{ flex: 1, minWidth: 160 }}>
                        <Field label="Weighted GPA">
                          <input value={v.gpaWeighted} onChange={(e) => set({ gpaWeighted: e.target.value })}
                            inputMode="decimal" placeholder="Optional" style={inputStyle} className={INPUT_CLASS} />
                        </Field>
                      </div>
                    </div>
                  )}
                  <Field label="Courses you're taking or plan to take"
                    hint="Add them one at a time, or paste a comma separated list and we'll split it for you.">
                    <CourseList items={v.courses} onChange={(courses) => set({ courses })} {...draftOf("courses")} />
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
                              inputMode="numeric" placeholder={ph} style={inputStyle} className={INPUT_CLASS} />
                          </Field>
                        </div>
                      ))}
                    </div>
                  )}
                  {v.testType === "act" && (
                    <Field label="Composite score">
                      <input value={v.act.composite} onChange={(e) => set({ act: { composite: e.target.value } })}
                        inputMode="numeric" placeholder="34" style={inputStyle} className={INPUT_CLASS} />
                    </Field>
                  )}
                  <Field label="AP exams you've taken" hint="Optional. Add the subject, then tap the score you got.">
                    <ApList items={v.aps} onChange={(aps) => set({ aps })} {...draftOf("aps")} />
                  </Field>
                </>
              )}

              {current.id === "record" && (
                <>
                  <Field label="Activities"
                    hint="Clubs, sports, jobs, projects, volunteering, research. One per entry, or paste a list and we'll split it.">
                    <ItemList items={v.activities} onChange={(activities) => set({ activities })}
                      placeholder="e.g. Science Olympiad" max={15} {...draftOf("activities")} />
                  </Field>
                  <Field label="Awards and honors" hint="Anything you were recognised for, at any level.">
                    <ItemList items={v.awards} onChange={(awards) => set({ awards })}
                      placeholder="e.g. State finalist" max={15} {...draftOf("awards")} />
                  </Field>
                </>
              )}

              {current.id === "direction" && (
                <>
                  <Field label="Majors you're considering" hint="Even if you're not sure. Two or three guesses is plenty.">
                    <ItemList items={v.majors} onChange={(majors) => set({ majors })}
                      placeholder="e.g. Computer Science" max={6} {...draftOf("majors")} />
                  </Field>
                  <Field label="Colleges you're thinking about"
                    hint="Skip it if you have no idea yet. We'll help you build a real list later.">
                    <ItemList items={v.colleges} onChange={(colleges) => set({ colleges })}
                      placeholder="e.g. Georgia Tech" max={20} {...draftOf("colleges")} />
                  </Field>
                </>
              )}
            </Card>

            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: "1.5rem" }}>
              {step > 0 && (
                <Button kind="secondary" onClick={() => setStep((s) => s - 1)} disabled={submitting}
                  style={{ minHeight: 52, padding: "12px 24px", fontSize: "1.05rem" }}>
                  Back
                </Button>
              )}
              <Button kind="primary" onClick={next} disabled={!canAdvance} busy={submitting}
                style={{ flex: 1, minHeight: 52, fontSize: "1.05rem" }}>
                {submitting ? "Saving…" : isLast ? "Continue" : "Next"}
              </Button>
            </div>

            <p style={{ fontFamily: SANS, fontSize: "0.95rem", fontWeight: 600, color: TEXT_MUTED, textAlign: "center", marginTop: 14 }}>
              Step {step + 1} of {STEPS.length}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Right: the record building up ── */}
      <div style={{ minWidth: 0, width: "100%" }}>
        <RecordPanel sections={sectionsFromForm(v)} sticky={!isMobile} />
      </div>
    </div>
  );
}
