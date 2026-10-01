import { useEffect, useState } from "react";
import ProgressChecklist from "../outreach/ProgressChecklist.jsx";
import { MascotSays } from "../SpeechBubble.jsx";
import { SANS, TEXT_MUTED } from "../agentUi.js";
import { Button } from "../outreach/flowUi.jsx";
import { TALON_LINES } from "../../../lib/agents/registry.js";
import { TALON } from "./finderUi.js";

// Step 4, while the search runs: Talon scouting from above, saying its
// searching lines in turn, over the real checklist the backend streams. The
// lines rotate on a timer only; the checklist is the truth about what is
// happening, and the one live region here. Leaving is fine: the search runs
// on the server and lands on the board.

const EVERY_MS = 4500;

/** lines: the merged progress lines. onLeave(): back to the board. */
export default function TalonAtWork({ lines, onLeave }) {
  const sayings = TALON_LINES.searching;
  const [at, setAt] = useState(0);
  useEffect(() => {
    if (!Array.isArray(sayings) || sayings.length < 2) return undefined;
    const t = setInterval(() => setAt((i) => (i + 1) % sayings.length), EVERY_MS);
    return () => clearInterval(t);
  }, [sayings]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
      <MascotSays agent={TALON} state="flying" size={96} layout="auto">
        {(Array.isArray(sayings) && sayings[at % sayings.length]) || ""}
      </MascotSays>
      <ProgressChecklist lines={lines} label="What Talon is doing" />
      <p style={{ margin: 0, fontFamily: SANS, fontSize: "0.95rem", color: TEXT_MUTED, lineHeight: 1.55 }}>
        This usually takes a minute or two. You can leave this page: Talon keeps going, and what it finds lands on
        your board.
      </p>
      {onLeave && (
        <div>
          <Button kind="secondary" onClick={onLeave}>Go to your board</Button>
        </div>
      )}
    </div>
  );
}
