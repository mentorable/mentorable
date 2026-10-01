import { MascotSays } from "../SpeechBubble.jsx";
import { PixelArrow, PixelStamp } from "../PixelIcons.jsx";
import { BORDER, FOCUS_CLASS, RADIUS, SANS, TEXT, TEXT_MUTED, WHITE, useAgentInk } from "../agentUi.js";
import { SR_ONLY } from "../outreach/flowUi.jsx";
import { TALON_LINES } from "../../../lib/agents/registry.js";
import { LANES } from "../../../lib/finder.js";
import { TALON } from "./finderUi.js";

// Talon's board before its first find: the invitation and the two lanes,
// each opening the flow already pointed at it. When no find can start (no
// finds, or no searches) the lanes would lead nowhere, so Talon says why
// instead.

/** `stopLine`: what Talon says when nothing new can start, or null.
 *  onLane(key): open the flow on that lane. */
export default function FinderEmpty({ stopLine = null, onLane }) {
  const ink = useAgentInk();
  const stopped = !!stopLine;
  return (
    <section aria-labelledby="tf-empty-title" style={{ background: WHITE, border: `1px dashed ${BORDER}`,
      borderRadius: RADIUS.card, padding: "1.4rem 1.3rem 1.5rem", maxWidth: 760 }}>
      <h2 id="tf-empty-title" style={{ margin: "0 0 14px", fontFamily: SANS, fontSize: "1.2rem", fontWeight: 800, color: TEXT }}>
        Your board is empty
      </h2>
      <MascotSays agent={TALON} state={stopped ? "idle" : "delivering"} size={96} layout="auto">
        {stopped ? stopLine : TALON_LINES.boardEmpty}
      </MascotSays>
      {!stopped && (
        <div style={{ marginTop: 20 }}>
          <p id="tf-lanes" style={{ margin: "0 0 10px", fontFamily: SANS, fontSize: "1rem", fontWeight: 700, color: TEXT_MUTED }}>
            Start with one of these:
          </p>
          <ul aria-labelledby="tf-lanes" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10,
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))" }}>
            {LANES.map((lane) => (
              <li key={lane.key}>
                <button type="button" className={FOCUS_CLASS} onClick={() => onLane(lane.key)}
                  style={{ width: "100%", height: "100%", minHeight: 44, padding: "12px 14px", display: "flex",
                    alignItems: "center", justifyContent: "space-between", gap: 12, borderRadius: RADIUS.control,
                    textAlign: "left", border: `1.5px solid ${ink.soft}`, background: ink.softer, color: TEXT,
                    fontFamily: SANS, cursor: "pointer", boxSizing: "border-box" }}>
                  <span style={{ display: "flex", gap: 10, alignItems: "flex-start", minWidth: 0 }}>
                    <span aria-hidden="true" style={{ color: ink.onSoft, display: "flex", marginTop: 3 }}>
                      <PixelStamp kind={lane.key === "scholarship" ? "star" : "sparkle"} size={16} />
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: "1.05rem", fontWeight: 800 }}>{lane.label}</span>
                      <span style={{ display: "block", marginTop: 2, fontSize: "0.95rem", fontWeight: 600, color: TEXT_MUTED,
                        lineHeight: 1.45 }}>
                        {lane.blurb}
                      </span>
                    </span>
                  </span>
                  <span aria-hidden="true" style={{ color: ink.onSoft, display: "inline-flex" }}><PixelArrow size={16} /></span>
                  <span style={SR_ONLY}>. Start a find</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
