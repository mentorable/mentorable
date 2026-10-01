import { MascotSays } from "../SpeechBubble.jsx";
import { PixelStamp } from "../PixelIcons.jsx";
import { AMBER_TEXT, FOCUS_CLASS, RADIUS, SANS, useAgentInk } from "../agentUi.js";
import { SR_ONLY } from "../outreach/flowUi.jsx";
import { TALON_LINES } from "../../../lib/agents/registry.js";
import { daysLeft, deadlineLabel } from "../../../lib/finder.js";
import { TALON } from "./finderUi.js";

// Deadline nudges above the board: Talon names the find that closes soonest,
// and every saved or applying find due within SOON_DAYS gets a link to
// itself. In-app only, never an email. Amber means "soon", never red.

const SHOW = 4;

/** items: due finds, soonest first. onOpen(item): opens its drawer. */
export default function DueSoon({ items, today, onOpen }) {
  const ink = useAgentInk();
  if (!items?.length) return null;
  const first = items[0];
  const shown = items.slice(0, SHOW);
  const more = items.length - shown.length;

  return (
    <section aria-labelledby="tf-soon-title" style={{ marginBottom: 22, maxWidth: 760 }}>
      <h2 id="tf-soon-title" style={{ margin: "0 0 10px", display: "flex", alignItems: "center", gap: 8,
        fontFamily: SANS, fontSize: "1rem", fontWeight: 800, color: AMBER_TEXT }}>
        <PixelStamp kind="clock" size={16} />
        {items.length === 1 ? "A deadline is coming up" : `${items.length} deadlines are coming up`}
      </h2>
      <MascotSays agent={TALON} state="delivering" size={64} layout="auto">
        <span style={{ display: "block" }}>{TALON_LINES.soon(first.title, daysLeft(first, today))}</span>
        <ul style={{ listStyle: "none", margin: "10px 0 2px", padding: 0, display: "flex", flexWrap: "wrap", gap: 8 }}>
          {shown.map((item) => (
            <li key={item.id} style={{ minWidth: 0, maxWidth: "100%" }}>
              <button type="button" className={FOCUS_CLASS} onClick={() => onOpen(item)} aria-haspopup="dialog"
                style={{ minHeight: 44, maxWidth: "100%", padding: "6px 14px", display: "inline-flex", alignItems: "center",
                  gap: 8, flexWrap: "wrap", borderRadius: RADIUS.pill, border: `1.5px solid ${ink.soft}`,
                  background: ink.softer, color: ink.onSoft, fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700,
                  cursor: "pointer", textAlign: "left", overflowWrap: "anywhere" }}>
                <span>{item.title}</span>
                <span style={{ fontWeight: 600 }}>{deadlineLabel(item, today)}</span>
                <span style={SR_ONLY}>. Open the details</span>
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
