import { MascotSays } from "../SpeechBubble.jsx";
import { PixelStamp } from "../PixelIcons.jsx";
import { AMBER_TEXT, FOCUS_CLASS, RADIUS, SANS, useAgentInk } from "../agentUi.js";
import { BEAKER_LINES } from "../../../lib/agents/registry.js";
import { daysSinceSent } from "../../../lib/outreach.js";
import { SR_ONLY } from "./BoardUi.js";

// Follow-up nudges above the board: Beaker names the person waited on
// longest, and every card that is due gets a link to itself. A card is due
// ten days after the last email, while a follow-up is still allowed
// (followUpDue in lib/outreach.js). Never a scold: a slow reply is normal.

const SHOW = 4;
const days = (n) => `${n} ${n === 1 ? "day" : "days"}`;

export default function BoardNudges({ cards, today, onOpen }) {
  const ink = useAgentInk();
  if (!cards?.length) return null;
  const first = cards[0];
  const shown = cards.slice(0, SHOW);
  const more = cards.length - shown.length;

  return (
    <section aria-labelledby="ob-nudges-title" style={{ marginBottom: 22 }}>
      <h2 id="ob-nudges-title" style={{ margin: "0 0 10px", display: "flex", alignItems: "center", gap: 8,
        fontFamily: SANS, fontSize: "1rem", fontWeight: 800, color: AMBER_TEXT }}>
        <PixelStamp kind="clock" size={16} />
        {cards.length === 1 ? "A follow-up is due" : `${cards.length} follow-ups are due`}
      </h2>
      <MascotSays state="delivering" size={64} layout="auto">
        <span style={{ display: "block" }}>{BEAKER_LINES.nudge(first.name, daysSinceSent(first, today))}</span>
        <ul style={{ listStyle: "none", margin: "10px 0 2px", padding: 0, display: "flex", flexWrap: "wrap", gap: 8 }}>
          {shown.map((card) => (
            <li key={card.id} style={{ minWidth: 0, maxWidth: "100%" }}>
              <button type="button" className={FOCUS_CLASS} onClick={() => onOpen(card)}
                style={{ minHeight: 44, maxWidth: "100%", padding: "6px 14px", display: "inline-flex", alignItems: "center",
                  gap: 8, flexWrap: "wrap", borderRadius: RADIUS.pill, border: `1.5px solid ${ink.soft}`,
                  background: ink.softer, color: ink.onSoft, fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700,
                  cursor: "pointer", textAlign: "left", overflowWrap: "anywhere" }}>
                <span>{card.name}</span>
                <span style={{ fontWeight: 600 }}>{days(daysSinceSent(card, today))}</span>
                <span style={SR_ONLY}> since you wrote. Open the card</span>
              </button>
            </li>
          ))}
        </ul>
        {more > 0 && (
          <span style={{ display: "block", marginTop: 6, fontSize: "0.95rem", fontWeight: 600 }}>
            And {more} more, marked on the board.
          </span>
        )}
      </MascotSays>
    </section>
  );
}
