import { useState } from "react";
import { motion } from "framer-motion";

import { SANS, TEXT, TEXT2, TEXT3, ACCENT, BORDER, eyebrowStyle, titleStyle } from "./intakeTheme.js";

const TIMINGS = [
  { value: "school_year", label: "School year" },
  { value: "summer",      label: "Summer" },
  { value: "all_year",    label: "All year" },
];

const inputStyle = {
  width: "100%", fontFamily: SANS, fontSize: "1.02rem", color: TEXT,
  border: `1.5px solid ${BORDER}`, borderRadius: 11, padding: "12px 14px",
  outline: "none", background: "#fff", boxSizing: "border-box",
};

const miniLabel = {
  fontFamily: SANS, fontSize: "0.72rem", fontWeight: 700,
  color: TEXT3, display: "block", marginBottom: 5,
};

function CharCount({ value, max }) {
  const n = (value || "").length;
  const over = n > max;
  return (
    <span style={{ fontFamily: SANS, fontSize: "0.72rem", fontWeight: 600, color: over ? "#dc2626" : TEXT3 }}>
      {n}/{max}
    </span>
  );
}

function Section({ title, hint, children }) {
  return (
    <div style={{ marginBottom: "1.6rem" }}>
      <h2 style={{ fontFamily: SANS, fontWeight: 700, fontSize: "1.2rem", color: TEXT, marginBottom: hint ? 5 : 12 }}>
        {title}
      </h2>
      {hint && <p style={{ fontFamily: SANS, fontSize: "0.95rem", color: TEXT3, lineHeight: 1.55, marginBottom: 12 }}>{hint}</p>}
      {children}
    </div>
  );
}

/** Editable list of short strings. */
function EditableList({ items, onChange, placeholder }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: "flex", gap: 7, alignItems: "center" }}>
          <input value={item} placeholder={placeholder}
            onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
            style={inputStyle} onFocus={(e) => (e.target.style.borderColor = ACCENT)} />
          <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))}
            aria-label="Remove" style={{ border: "none", background: "none", cursor: "pointer", color: TEXT3, display: "inline-flex", flexShrink: 0 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...items, ""])}
        style={{ alignSelf: "flex-start", fontFamily: SANS, fontSize: "0.85rem", fontWeight: 700, color: ACCENT, background: "none", border: "none", cursor: "pointer", padding: "4px 0" }}>
        + Add
      </button>
    </div>
  );
}

/**
 * The editable review. Everything here was inferred by the model, not typed by the
 * student, so all of it is correctable before it commits.
 */
export default function IntakeReview({ draft, activities, onConfirm, committing, error }) {
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
      style={{ width: "100%", maxWidth: 820, margin: "0 auto", padding: "0 1.5rem" }}
    >
      <p style={eyebrowStyle}>Almost done</p>
      <h1 style={titleStyle}>Here's what we heard</h1>
      <p style={{ fontFamily: SANS, fontSize: "1.12rem", color: TEXT2, lineHeight: 1.6, marginBottom: "2rem" }}>
        We filled some of this in from the conversation, so check it before we save. Anything here can be edited now or later.
      </p>

      <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 22, padding: "2rem", boxShadow: "0 2px 16px rgba(15,23,42,0.06)" }}>

        <Section title="Your through-line" hint="What we think connects your activities. Reword it if we read it wrong.">
          <textarea value={d.theme} onChange={(e) => set({ theme: e.target.value })} rows={2}
            style={{ ...inputStyle, resize: "vertical" }}
            onFocus={(e) => (e.target.style.borderColor = ACCENT)} />
        </Section>

        {d.enriched_activities.length > 0 && (
          <Section title="What you told us about"
            hint="We wrote these up in Common App format. Hours and roles were inferred from the conversation, so fix anything that's off.">
            <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
              {d.enriched_activities.map((a, i) => (
                <div key={a.id || i} style={{ border: `1px solid ${BORDER}`, borderRadius: 13, padding: "13px 14px", background: "rgba(59,91,252,0.025)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 11 }}>
                    <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: "0.98rem", color: TEXT }}>
                      {titleFor(a.id)}
                    </span>
                    <button type="button" onClick={() => dropActivity(i)}
                      style={{ fontFamily: SANS, fontSize: "0.78rem", fontWeight: 700, color: TEXT3, background: "none", border: "none", cursor: "pointer" }}>
                      Remove
                    </button>
                  </div>

                  <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginBottom: 10 }}>
                    <div style={{ flex: 1, minWidth: 140 }}>
                      <label style={miniLabel}>Your role</label>
                      <input value={a.position || ""} maxLength={50}
                        onChange={(e) => patchActivity(i, { position: e.target.value })}
                        style={inputStyle} onFocus={(e) => (e.target.style.borderColor = ACCENT)} />
                    </div>
                    <div style={{ flex: 1, minWidth: 140 }}>
                      <label style={miniLabel}>Organization</label>
                      <input value={a.organization || ""} maxLength={100}
                        onChange={(e) => patchActivity(i, { organization: e.target.value })}
                        style={inputStyle} onFocus={(e) => (e.target.style.borderColor = ACCENT)} />
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
                      onFocus={(e) => (e.target.style.borderColor = ACCENT)} />
                  </div>

                  <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginBottom: 10 }}>
                    <div style={{ flex: 1, minWidth: 100 }}>
                      <label style={miniLabel}>Hours / week</label>
                      <input value={a.hours_per_week ?? ""} inputMode="decimal"
                        onChange={(e) => patchActivity(i, { hours_per_week: e.target.value === "" ? null : e.target.value })}
                        style={inputStyle} onFocus={(e) => (e.target.style.borderColor = ACCENT)} />
                    </div>
                    <div style={{ flex: 1, minWidth: 100 }}>
                      <label style={miniLabel}>Weeks / year</label>
                      <input value={a.weeks_per_year ?? ""} inputMode="numeric"
                        onChange={(e) => patchActivity(i, { weeks_per_year: e.target.value === "" ? null : e.target.value })}
                        style={inputStyle} onFocus={(e) => (e.target.style.borderColor = ACCENT)} />
                    </div>
                  </div>

                  <div style={{ marginBottom: 10 }}>
                    <label style={miniLabel}>Grades involved</label>
                    <div style={{ display: "flex", gap: 6 }}>
                      {[9, 10, 11, 12].map((g) => {
                        const on = (a.grade_levels || []).includes(g);
                        return (
                          <button key={g} type="button"
                            onClick={() => patchActivity(i, {
                              grade_levels: on
                                ? (a.grade_levels || []).filter((x) => x !== g)
                                : [...(a.grade_levels || []), g].sort((x, y) => x - y),
                            })}
                            style={{
                              width: 40, height: 32, borderRadius: 8, cursor: "pointer",
                              fontFamily: SANS, fontWeight: 700, fontSize: "0.82rem",
                              border: `1.5px solid ${on ? ACCENT : BORDER}`,
                              background: on ? ACCENT : "#fff", color: on ? "#fff" : TEXT2,
                            }}>{g}</button>
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
                          <button key={t.value} type="button"
                            onClick={() => patchActivity(i, { timing: on ? null : t.value })}
                            style={{
                              fontFamily: SANS, fontSize: "0.82rem", fontWeight: 600, cursor: "pointer",
                              padding: "7px 13px", borderRadius: 99,
                              border: `1.5px solid ${on ? ACCENT : BORDER}`,
                              background: on ? ACCENT : "#fff", color: on ? "#fff" : TEXT2,
                            }}>{t.label}</button>
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
      </div>

      {error && (
        <p style={{ fontFamily: SANS, fontSize: "0.9rem", color: "#dc2626", fontWeight: 600, marginTop: 14, textAlign: "center" }}>
          {error}
        </p>
      )}

      <button type="button" onClick={() => onConfirm(d)} disabled={committing}
        style={{
          width: "100%", fontFamily: SANS, fontSize: "1.1rem", fontWeight: 700,
          cursor: committing ? "default" : "pointer", padding: "17px", borderRadius: 14,
          border: "none", marginTop: "1.75rem", background: ACCENT, color: "#fff",
          boxShadow: "0 8px 24px rgba(29,78,216,0.3)",
        }}>
        {committing ? "Saving…" : "Looks right, save it"}
      </button>
    </motion.div>
  );
}
