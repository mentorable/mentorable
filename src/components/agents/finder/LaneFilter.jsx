import { BORDER, FOCUS_CLASS, RADIUS, SANS, TEXT, TEXT_MID, WHITE, useAgentInk } from "../agentUi.js";
import { CHOICE_CLASS, SR_ONLY } from "../outreach/flowUi.jsx";
import { LANES } from "../../../lib/finder.js";

// The board's two quiet controls above the tabs: which lane to show (All,
// Scholarships, Activities, a radio group so arrow keys move through it),
// and whether dismissed finds get a tab of their own.

/** value: "all" | a lane key. counts: { all, scholarship, activity }. */
export default function LaneFilter({ value, counts, onChange }) {
  const ink = useAgentInk();
  const options = [{ key: "all", label: "All" }, ...LANES.map((l) => ({ key: l.key, label: l.label }))];
  return (
    <fieldset style={{ border: "none", margin: 0, padding: 0, minWidth: 0 }}>
      <legend style={SR_ONLY}>Show</legend>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {options.map((o) => {
          const on = value === o.key;
          const n = counts?.[o.key] ?? 0;
          return (
            <label key={o.key} className={CHOICE_CLASS}
              style={{ display: "inline-flex", alignItems: "center", gap: 8, minHeight: 44, padding: "0 14px",
                borderRadius: RADIUS.pill, cursor: "pointer", boxSizing: "border-box", fontFamily: SANS,
                fontSize: "0.95rem", fontWeight: 700, whiteSpace: "nowrap",
                border: `1.5px solid ${on ? ink.ring : BORDER}`, background: on ? ink.softer : WHITE,
                color: on ? ink.onSoft : TEXT_MID }}>
              <input type="radio" name="tf-lane-filter" value={o.key} checked={on} onChange={() => onChange(o.key)}
                style={SR_ONLY} />
              {o.label}
              <span aria-hidden="true" style={{ fontWeight: 800, color: on ? ink.onSoft : TEXT, fontVariantNumeric: "tabular-nums" }}>
                {n}
              </span>
              <span style={SR_ONLY}>, {n}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** on: dismissed finds have a tab. n: how many there are (in this lane). */
export function DismissedToggle({ on, n, onToggle }) {
  const ink = useAgentInk();
  return (
    <button type="button" className={FOCUS_CLASS} aria-pressed={on} onClick={onToggle}
      style={{ minHeight: 44, padding: "0 14px", display: "inline-flex", alignItems: "center", gap: 10,
        borderRadius: RADIUS.pill, border: `1.5px solid ${BORDER}`, background: WHITE, color: TEXT_MID,
        fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
      {/* A small switch: its knob side and fill say on or off, and so does aria-pressed. */}
      <span aria-hidden="true" style={{ position: "relative", width: 30, height: 18, borderRadius: 99, flexShrink: 0,
        background: on ? ink.button.bg : "#8a857c" }}>
        <span style={{ position: "absolute", top: 3, left: on ? 15 : 3, width: 12, height: 12, borderRadius: 99,
          background: WHITE }} />
      </span>
      Show dismissed
      <span style={{ fontWeight: 800, color: TEXT, fontVariantNumeric: "tabular-nums" }}>{n}</span>
    </button>
  );
}
