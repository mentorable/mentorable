import { motion, AnimatePresence } from "framer-motion";
import { SANS, TEXT, TEXT2, TEXT3, ACCENT, BORDER, PANEL } from "./intakeTheme.js";

/**
 * The right-hand panel that shows the student's record building up as they go.
 *
 * It exists for two reasons: it fills the page (the flow otherwise floats in
 * empty space on a wide screen), and it makes it visually obvious that list
 * items are *separate entries* rather than one blob of text, which is the
 * single most confusing thing about the first version of the form.
 *
 * Callers pass already-shaped sections so this stays dumb: the form feeds it
 * in-progress local state, the interview screens feed it saved rows.
 */
export default function RecordPanel({ sections, sticky = true }) {
  const live = (sections || []).filter((s) => (s.items || []).length > 0);
  const total = live.reduce((n, s) => n + s.items.length, 0);

  return (
    <aside style={{
      width: "100%", background: PANEL, border: `1px solid ${BORDER}`,
      borderRadius: 22, padding: "1.75rem",
      position: sticky ? "sticky" : "static", top: 32,
      maxHeight: sticky ? "calc(100vh - 64px)" : undefined,
      overflowY: "auto",
    }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: "1.4rem" }}>
        <span style={{ fontFamily: SANS, fontSize: "0.82rem", fontWeight: 700, letterSpacing: "0.02em", color: TEXT }}>
          Your record
        </span>
        {total > 0 && (
          <span style={{ fontFamily: SANS, fontSize: "0.82rem", fontWeight: 700, color: ACCENT }}>
            {total} {total === 1 ? "item" : "items"}
          </span>
        )}
      </div>

      {live.length === 0 ? (
        <p style={{ fontFamily: SANS, fontSize: "0.95rem", color: TEXT3, lineHeight: 1.6, margin: 0 }}>
          Everything you add shows up here, so you can see it building as you go.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.3rem" }}>
          <AnimatePresence initial={false}>
            {live.map((section) => (
              <motion.div key={section.key}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}>
                <div style={{ fontFamily: SANS, fontSize: "0.76rem", fontWeight: 700, letterSpacing: "0.03em", color: TEXT3, marginBottom: 8 }}>
                  {section.label}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <AnimatePresence initial={false}>
                    {section.items.map((item, i) => {
                      const text = typeof item === "string" ? item : item.text;
                      const detail = typeof item === "string" ? null : item.detail;
                      return (
                        <motion.div key={`${text}-${i}`}
                          initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                          transition={{ duration: 0.22 }}
                          style={{
                            display: "flex", alignItems: "baseline", gap: 8,
                            background: "#fff", border: `1px solid ${BORDER}`,
                            borderRadius: 10, padding: "9px 12px",
                          }}>
                          <span style={{ fontFamily: SANS, fontSize: "0.92rem", fontWeight: 600, color: TEXT, flex: 1, minWidth: 0, lineHeight: 1.4 }}>
                            {text}
                          </span>
                          {detail && (
                            <span style={{ fontFamily: SANS, fontSize: "0.78rem", fontWeight: 600, color: ACCENT, flexShrink: 0 }}>
                              {detail}
                            </span>
                          )}
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </aside>
  );
}

/** Shape the in-progress form state into panel sections. */
export function sectionsFromForm(v) {
  const scores = [];
  if (v.testType === "sat" && v.sat?.total) scores.push(`SAT ${v.sat.total}`);
  if (v.testType === "act" && v.act?.composite) scores.push(`ACT ${v.act.composite}`);
  for (const ap of v.aps || []) {
    if (ap.subject?.trim()) scores.push(`AP ${ap.subject}${ap.score ? `: ${ap.score}` : ""}`);
  }

  const gpa = [];
  if (v.gpaScale !== "not_used") {
    if (v.gpaUnweighted) gpa.push(`${v.gpaUnweighted} unweighted`);
    if (v.gpaWeighted) gpa.push(`${v.gpaWeighted} weighted`);
  }

  return [
    { key: "gpa",        label: "GPA",        items: gpa },
    { key: "scores",     label: "Testing",    items: scores },
    { key: "courses",    label: "Courses",    items: (v.courses || []).map((c) => ({
        text: c.name, detail: c.level ? c.level.replace("_", " ") : null })) },
    { key: "activities", label: "Activities", items: v.activities || [] },
    { key: "awards",     label: "Awards",     items: v.awards || [] },
    { key: "majors",     label: "Majors",     items: v.majors || [] },
    { key: "colleges",   label: "Colleges",   items: v.colleges || [] },
  ];
}

/** Shape saved DB rows into panel sections, for the interview screens. */
export function sectionsFromRecord(record) {
  if (!record) return [];
  const { activities = [], awards = [], courses = [], scores = [], profile = {} } = record;

  return [
    { key: "activities", label: "Activities", items: activities.map((a) => ({
        text: a.title,
        detail: a.detail_level === "enriched" ? "detailed" : null })) },
    { key: "awards",     label: "Awards",     items: awards.map((a) => a.title) },
    { key: "courses",    label: "Courses",    items: courses.map((c) => ({
        text: c.name, detail: c.level ? c.level.replace("_", " ") : null })) },
    { key: "scores",     label: "Testing",    items: scores.map((s) =>
        (s.test_type || "").toUpperCase() === "AP"
          ? `AP ${s.subject || ""}${s.score ? `: ${s.score}` : ""}`.trim()
          : `${(s.test_type || "").toUpperCase()} ${s.score ?? ""}`.trim()) },
    { key: "majors",     label: "Majors",     items: profile.candidate_majors || [] },
    { key: "colleges",   label: "Colleges",   items: profile.target_colleges || [] },
  ];
}
