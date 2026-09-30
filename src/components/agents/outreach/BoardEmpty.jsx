import { MascotSays } from "../SpeechBubble.jsx";
import { PixelArrow } from "../PixelIcons.jsx";
import { BORDER, FOCUS_CLASS, RADIUS, SANS, TEXT, TEXT_MUTED, WHITE, useAgentInk } from "../agentUi.js";
import { BEAKER_LINES } from "../../../lib/agents/registry.js";
import { SR_ONLY } from "./BoardUi.js";

// The board before its first card: Beaker's invitation and two example goals
// that open the flow already filled in. When nothing new can start (no tries,
// or no research runs) the examples would lead nowhere, so Beaker says why
// instead (adding people by hand still works).

export const EXAMPLE_GOALS = [
  "A marine biology professor near me who works with high school students",
  "Someone who works in game design and could tell me how they got started",
];

/** `stopLine`: what Beaker says when nothing new can start, or null. */
export default function BoardEmpty({ stopLine = null, onGoal }) {
  const stopped = !!stopLine;
  const ink = useAgentInk();
  return (
    <section aria-labelledby="ob-empty-title" style={{ background: WHITE, border: `1px dashed ${BORDER}`,
      borderRadius: RADIUS.card, padding: "1.4rem 1.3rem 1.5rem", maxWidth: 760 }}>
      <h2 id="ob-empty-title" style={{ margin: "0 0 14px", fontFamily: SANS, fontSize: "1.2rem", fontWeight: 800, color: TEXT }}>
        Your board is empty
      </h2>
      <MascotSays state={stopped ? "idle" : "delivering"} size={96} layout="auto">
        {stopped ? stopLine : BEAKER_LINES.boardEmpty}
      </MascotSays>
      {!stopped && (
        <div style={{ marginTop: 20 }}>
          <p id="ob-examples" style={{ margin: "0 0 10px", fontFamily: SANS, fontSize: "1rem", fontWeight: 700, color: TEXT_MUTED }}>
            Try a goal like one of these:
          </p>
          <ul aria-labelledby="ob-examples" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
            {EXAMPLE_GOALS.map((goal) => (
              <li key={goal}>
                <button type="button" className={FOCUS_CLASS} onClick={() => onGoal(goal)}
                  style={{ width: "100%", minHeight: 44, padding: "10px 14px", display: "flex", alignItems: "center",
                    justifyContent: "space-between", gap: 12, borderRadius: RADIUS.control, textAlign: "left",
                    border: `1.5px solid ${ink.soft}`, background: ink.softer, color: TEXT, fontFamily: SANS,
                    fontSize: "1rem", fontWeight: 600, lineHeight: 1.45, cursor: "pointer" }}>
                  <span>{goal}<span style={SR_ONLY}>. Start with this goal</span></span>
                  <span aria-hidden="true" style={{ color: ink.onSoft, display: "inline-flex" }}><PixelArrow size={16} /></span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
