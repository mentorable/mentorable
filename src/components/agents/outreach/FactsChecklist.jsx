import { PixelStamp } from "../PixelIcons.jsx";
import { BORDER, RADIUS, SANS, TEXT, TEXT_MID, TEXT_MUTED, WHITE, useAgentInk } from "../agentUi.js";
import { CHOICE_CLASS, SR_ONLY } from "./flowUi.jsx";

// "Facts to check before sending": what Beaker could not be sure of (a
// title, a lab name, the student's own claim it took from their record).
// A checklist the student ticks as they check; it never blocks a send.

export default function FactsChecklist({ facts = [], checked, onToggle }) {
  const ink = useAgentInk();
  if (!facts.length) return null;
  const done = facts.filter((f) => checked.has(f)).length;
  return (
    <section aria-labelledby="oa-facts-title" style={{ fontFamily: SANS }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <h2 id="oa-facts-title" style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: TEXT }}>
          Facts to check before sending
        </h2>
        <span style={{ fontSize: "0.93rem", fontWeight: 700, color: TEXT_MUTED, fontVariantNumeric: "tabular-nums" }}>
          {done} of {facts.length} checked
        </span>
      </div>
      <ul style={{ listStyle: "none", margin: "8px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        {facts.map((fact, i) => {
          const on = checked.has(fact);
          return (
            <li key={`${i}-${fact}`}>
              <label className={CHOICE_CLASS} style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer",
                background: WHITE, border: `1px solid ${BORDER}`, borderRadius: RADIUS.control, padding: "10px 12px",
                minHeight: 44, boxSizing: "border-box" }}>
                <input type="checkbox" checked={on} onChange={() => onToggle(fact)} style={SR_ONLY} />
                <span aria-hidden="true" style={{ flexShrink: 0, width: 22, height: 22, marginTop: 1, borderRadius: 6,
                  border: `2px solid ${on ? ink.ring : "#8a857c"}`, background: on ? ink.button.bg : WHITE, color: ink.button.fg,
                  display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box" }}>
                  {on && <PixelStamp kind="check" size={16} />}
                </span>
                <span style={{ fontSize: "0.98rem", fontWeight: 600, lineHeight: 1.5, color: on ? TEXT_MUTED : TEXT_MID,
                  overflowWrap: "anywhere" }}>
                  {fact}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
