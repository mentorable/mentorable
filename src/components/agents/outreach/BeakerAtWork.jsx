import { useEffect, useState } from "react";
import ProgressChecklist from "./ProgressChecklist.jsx";
import { MascotSays } from "../SpeechBubble.jsx";
import { BEAKER_LINES } from "../../../lib/agents/registry.js";
import { SANS, TEXT_MUTED } from "../agentUi.js";

// The wait while Beaker searches or writes: Beaker flying its delivery
// route, saying its researching lines in turn, over the real checklist the
// backend streams. The lines rotate on a timer only; the checklist is the
// truth about what is happening, and it is the one live region here. No
// aria-busy around it: some screen readers hold back a busy region's updates
// until it is done, which would silence the checklist for the whole run.

const EVERY_MS = 4500;

export default function BeakerAtWork({ lines, sayings = BEAKER_LINES.researching, note, checklistLabel }) {
  const [at, setAt] = useState(0);
  useEffect(() => {
    if (!sayings?.length || sayings.length < 2) return undefined;
    const t = setInterval(() => setAt((i) => (i + 1) % sayings.length), EVERY_MS);
    return () => clearInterval(t);
  }, [sayings]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
      <MascotSays state="flying" size={96} layout="auto">
        {sayings?.[at % (sayings?.length || 1)] || ""}
      </MascotSays>
      <ProgressChecklist lines={lines} label={checklistLabel} />
      {note && (
        <p style={{ margin: 0, fontFamily: SANS, fontSize: "0.95rem", color: TEXT_MUTED, lineHeight: 1.55 }}>{note}</p>
      )}
    </div>
  );
}
