import { MascotSays } from "../SpeechBubble.jsx";
import { PixelArrow, PixelStamp } from "../PixelIcons.jsx";
import { BORDER, FOCUS_CLASS, RADIUS, SANS, TEXT, TEXT_MUTED, WHITE, useAgentInk } from "../agentUi.js";
import { Notice } from "../outreach/flowUi.jsx";
import { TALON_LINES } from "../../../lib/agents/registry.js";
import { LANES } from "../../../lib/finder.js";
import { TALON } from "./finderUi.js";

// Step 1: what to look for. Two large choices, one tap each: the step is a
// single decision, so choosing moves straight on to the details.

/** lane: the current choice or null. onPick(key): choose and continue. */
export default function LaneStep({ lane, onPick, error }) {
  const ink = useAgentInk();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <MascotSays agent={TALON} state="idle" size={80} layout="auto">{TALON_LINES.laneAsk}</MascotSays>
      {error && <Notice tone="error">{error}</Notice>}
      <ul aria-label="What should Talon look for?" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 12,
        gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))" }}>
        {LANES.map((l) => {
          const on = lane === l.key;
          return (
            <li key={l.key} style={{ minWidth: 0 }}>
              <button type="button" className={FOCUS_CLASS} aria-pressed={on} onClick={() => onPick(l.key)}
                style={{ width: "100%", height: "100%", minHeight: 132, padding: "18px 18px 16px", boxSizing: "border-box",
                  display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 10, textAlign: "left",
                  borderRadius: RADIUS.card, cursor: "pointer", fontFamily: SANS,
                  border: `2px solid ${on ? ink.ring : BORDER}`, background: on ? ink.softer : WHITE }}>
                <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 10, background: ink.soft, color: ink.onSoft,
                  display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <PixelStamp kind={l.key === "scholarship" ? "star" : "sparkle"} size={24} />
                </span>
                <span style={{ fontSize: "1.25rem", fontWeight: 800, color: TEXT, letterSpacing: "-0.01em" }}>{l.label}</span>
                <span style={{ fontSize: "0.98rem", fontWeight: 600, color: TEXT_MUTED, lineHeight: 1.5 }}>{l.blurb}</span>
                <span aria-hidden="true" style={{ marginTop: "auto", display: "inline-flex", alignItems: "center", gap: 6,
                  fontSize: "0.95rem", fontWeight: 800, color: on ? ink.onSoft : ink.text }}>
                  {on ? "Selected" : "Choose"} <PixelArrow size={16} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
