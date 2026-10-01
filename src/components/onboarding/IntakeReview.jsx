import { useState, useRef, useLayoutEffect } from "react";
import { motion } from "framer-motion";

import { Button, Card, Notice } from "../ui/kit.jsx";
import {
  BORDER, DANGER, FOCUS_CLASS, INPUT_CLASS, RADIUS, SANS, SURFACE, TEXT, TEXT_MUTED,
  inputStyle as kitInput, miniLabelStyle, pillStyle, squareChoiceStyle, subtitleStyle, titleStyle, useIntakeInk,
} from "./intakeTheme.js";

const TIMINGS = [
  { value: "school_year", label: "School year" },
  { value: "summer",      label: "Summer" },
  { value: "all_year",    label: "All year" },
];

const inputStyle = kitInput;
const miniLabel = miniLabelStyle;

/** A textarea that grows to fit its content instead of scrolling internally. */
function AutoTextarea({ value, onChange, style, ...rest }) {
  const ref = useRef(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea ref={ref} value={value} onChange={onChange}
      style={{ ...style, overflow: "hidden", resize: "none" }} {...rest} />
  );
}

function CharCount({ value, max }) {
  const n = (value || "").length;
  const over = n > max;
  return (
    <span style={{ fontFamily: SANS, fontSize: "0.9rem", fontWeight: 600, color: over ? DANGER : TEXT_MUTED, fontVariantNumeric: "tabular-nums" }}>
      {n}/{max}
    </span>
  );
}

function Section({ title, hint, children }) {
  const ink = useIntakeInk();
  return (
    <div style={{ marginBottom: "1.6rem" }}>
      <h2 style={{ fontFamily: SANS, fontWeight: 800, fontSize: "1.2rem", color: TEXT, letterSpacing: "-0.01em", lineHeight: 1.3, marginBottom: hint ? 4 : 12 }}>
        {title}
      </h2>
      {hint && <p style={{ fontFamily: SANS, fontSize: "0.95rem", fontWeight: 600, color: ink.text, lineHeight: 1.55, marginBottom: 12 }}>{hint}</p>}
      {children}
    </div>
  );
}

/** Editable list of short strings. */
function EditableList({ items, onChange, placeholder }) {
  const ink = useIntakeInk();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: "flex", gap: 7, alignItems: "center" }}>
          <input value={item} placeholder={placeholder}
            onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
            style={inputStyle} className={INPUT_CLASS} />
          <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))}
            aria-label="Remove" className={FOCUS_CLASS}
            style={{ border: "none", background: "none", cursor: "pointer", color: TEXT_MUTED, display: "inline-flex",
              alignItems: "center", justifyContent: "center", width: 40, height: 40, borderRadius: 10, flexShrink: 0 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...items, ""])} className={FOCUS_CLASS}
        style={{ alignSelf: "flex-start", fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700, color: ink.text, background: "none", border: "none", cursor: "pointer", padding: "0 6px", minHeight: 40, borderRadius: 10 }}>
        + Add
      </button>
    </div>
  );
}

/**
 * The editable review. Everything here was inferred by the model, not typed by the
 * student, so all of it is correctable before it commits.
 */
export default function IntakeReview({ draft, activities, onConfirm, committing, error, isMobile }) {
  const ink = useIntakeInk();
  const [d, setD] = useState(() => ({
    theme: "", theme_evidence: [], concerns: [], gaps: [],
    student_voice: [], summary: "", enriched_activities: [], ...(draft || {}),
  }));
  const set = (patch) => setD((prev) => ({ ...prev, ...patch }));

  const titleFor = (id) =>
    (activities || []).find((a) => String(a.id) === String(id))?.title || "Activity";

  const patchActivity = (i, patch) =>
    set({ enriched_activities: d.enriched_activities.map((a, j) => (j === i ? { ...a, ...patch } : a)) });

  const dropActivity = (i) =>
    set({ enriched_activities: d.enriched_activities.filter((_, j) => j !== i) });

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}
      style={{ width: "100%", maxWidth: 820, margin: "0 auto", padding: isMobile ? "0 1rem" : "0 1.5rem", boxSizing: "border-box" }}
    >
      <h1 style={titleStyle(ink, isMobile)}>Here's what we heard</h1>
      <p style={{ ...subtitleStyle(isMobile), marginBottom: "1.6rem" }}>
        We filled some of this in from the conversation, so check it before we save. Anything here can be edited now or later.
      </p>

      <Card style={{ padding: isMobile ? "1.2rem 1.1rem 0.2rem" : "1.6rem 1.6rem 0.4rem" }}>

        <Section title="Your through-line" hint="What we think connects your activities. Reword it if we read it wrong.">
          <AutoTextarea value={d.theme} onChange={(e) => set({ theme: e.target.value })} rows={2}
            style={inputStyle}
            className={INPUT_CLASS} />
        </Section>

        {d.enriched_activities.length > 0 && (
          <Section title="What you told us about"
            hint="We wrote these up in Common App format. Hours and roles were inferred from the conversation, so fix anything that's off.">
            <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
              {d.enriched_activities.map((a, i) => (
                <div key={a.id || i} style={{ border: `1px solid ${BORDER}`, borderRadius: RADIUS.control, padding: "12px 14px 14px", background: SURFACE }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 11 }}>
                    <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: "1.05rem", color: TEXT, minWidth: 0, overflowWrap: "anywhere" }}>
                      {titleFor(a.id)}
                    </span>
                    <button type="button" onClick={() => dropActivity(i)} className={FOCUS_CLASS}
                      style={{ fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700, color: TEXT_MUTED, background: "none", border: "none", cursor: "pointer", minHeight: 40, padding: "0 8px", margin: "-6px -8px -6px 0", borderRadius: 10, flexShrink: 0 }}>
                      Remove
                    </button>
                  </div>

                  <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginBottom: 10 }}>
                    <div style={{ flex: 1, minWidth: 140 }}>
                      <label style={miniLabel}>Your role</label>
                      <input value={a.position || ""} maxLength={50}
                        onChange={(e) => patchActivity(i, { position: e.target.value })}
                        style={inputStyle} className={INPUT_CLASS} />
                    </div>
                    <div style={{ flex: 1, minWidth: 140 }}>
                      <label style={miniLabel}>Organization</label>
                      <input value={a.organization || ""} maxLength={100}
                        onChange={(e) => patchActivity(i, { organization: e.target.value })}
                        style={inputStyle} className={INPUT_CLASS} />
                    </div>
                  </div>

                  <div style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <label style={miniLabel}>Description</label>
                      <CharCount value={a.description} max={150} />
                    </div>
                    <textarea value={a.description || ""} maxLength={150} rows={2}
                      onChange={(e) => patchActivity(i, { description: e.target.value })}
                      style={{ ...inputStyle, resize: "vertical" }}
                      className={INPUT_CLASS} />
                  </div>

                  <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginBottom: 10 }}>
                    <div style={{ flex: 1, minWidth: 100 }}>
                      <label style={miniLabel}>Hours / week</label>
                      <input value={a.hours_per_week ?? ""} inputMode="decimal"
                        onChange={(e) => patchActivity(i, { hours_per_week: e.target.value === "" ? null : e.target.value })}
                        style={inputStyle} className={INPUT_CLASS} />
                    </div>
                    <div style={{ flex: 1, minWidth: 100 }}>
                      <label style={miniLabel}>Weeks / year</label>
                      <input value={a.weeks_per_year ?? ""} inputMode="numeric"
                        onChange={(e) => patchActivity(i, { weeks_per_year: e.target.value === "" ? null : e.target.value })}
                        style={inputStyle} className={INPUT_CLASS} />
                    </div>
                  </div>

                  <div style={{ marginBottom: 10 }}>
                    <label style={miniLabel}>Grades involved</label>
                    <div style={{ display: "flex", gap: 6 }}>
                      {[9, 10, 11, 12].map((g) => {
                        const on = (a.grade_levels || []).includes(g);
                        return (
                          <button key={g} type="button" aria-pressed={on} className={FOCUS_CLASS}
                            onClick={() => patchActivity(i, {
                              grade_levels: on
                                ? (a.grade_levels || []).filter((x) => x !== g)
                                : [...(a.grade_levels || []), g].sort((x, y) => x - y),
                            })}
                            style={squareChoiceStyle(ink, on, 44)}>{g}</button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label style={miniLabel}>When</label>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {TIMINGS.map((t) => {
                        const on = a.timing === t.value;
                        return (
                          <button key={t.value} type="button" aria-pressed={on} className={FOCUS_CLASS}
                            onClick={() => patchActivity(i, { timing: on ? null : t.value })}
                            style={{ ...pillStyle(ink, on), fontSize: "0.95rem", padding: "0 14px" }}>{t.label}</button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        <Section title="What's missing" hint="Honest gaps between where you are and where you're aiming.">
          <EditableList items={d.gaps} onChange={(gaps) => set({ gaps })} placeholder="A gap in your application" />
        </Section>

        <Section title="What you're worried about">
          <EditableList items={d.concerns} onChange={(concerns) => set({ concerns })} placeholder="A concern" />
        </Section>
      </Card>

      {error && (
        <Notice tone="error" style={{ marginTop: 14 }}>
          {error}
        </Notice>
      )}

      <Button kind="primary" onClick={() => onConfirm(d)} busy={committing}
        style={{ width: "100%", minHeight: 52, fontSize: "1.05rem", marginTop: "1.5rem" }}>
        {committing ? "Saving…" : "Looks right, save it"}
      </Button>
    </motion.div>
  );
}
