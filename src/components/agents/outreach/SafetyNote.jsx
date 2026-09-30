import { PixelStamp } from "../PixelIcons.jsx";
import { SANS, SURFACE, BORDER, RADIUS, TEXT, TEXT_MID, useAgentInk } from "../agentUi.js";

// The ground rules for writing to someone you don't know, shown once before
// the first outreach (in the Gmail sheet) and linkable from the review
// screen. Plain instructions, no puns: this is the part that keeps a student
// safe.

export const SAFETY_RULES = [
  "Use your school email, or one your family approves.",
  "Tell a parent or teacher who you're writing to.",
  "If you meet, meet in public or on campus, never somewhere private.",
  "Never share your phone number or home address, and stop and tell an adult if someone asks for personal details or photos.",
];

export default function SafetyNote({ headingId = "oa-safety-title", compact = false }) {
  const ink = useAgentInk();
  return (
    <section aria-labelledby={headingId}
      style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: RADIUS.control,
        padding: compact ? "12px 14px" : "14px 16px", fontFamily: SANS }}>
      <h3 id={headingId} style={{ margin: 0, fontSize: "1.05rem", fontWeight: 800, color: TEXT }}>
        A few ground rules
      </h3>
      <ul style={{ listStyle: "none", margin: "8px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        {SAFETY_RULES.map((rule) => (
          <li key={rule} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: "0.98rem", color: TEXT_MID,
            lineHeight: 1.5 }}>
            <span style={{ color: ink.text, marginTop: 3, flexShrink: 0 }}><PixelStamp kind="check" size={16} /></span>
            <span>{rule}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
