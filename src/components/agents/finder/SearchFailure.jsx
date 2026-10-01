import ProgressChecklist from "../outreach/ProgressChecklist.jsx";
import { MascotSays } from "../SpeechBubble.jsx";
import { SANS, TEXT, TEXT_MUTED } from "../agentUi.js";
import { Button, Card } from "../outreach/flowUi.jsx";
import { TALON_LINES } from "../../../lib/agents/registry.js";
import { TALON } from "./finderUi.js";

// Step 4, when a find ends without results: what Talon says, the server's
// own message (shown as written), whether the find was given back, what
// Talon got through, and the ways on. The page decides the actions, so a
// retry is only offered when it can help.

// What Talon says above the message, by the final event's code.
function lineFor(code) {
  if (code === "nothing_new") return TALON_LINES.nothingNew;
  if (code === "nothing_found") return "I scanned far and wide, but nothing I found could be checked against its own page.";
  if (code === "stream_lost") return "I lost sight of you for a moment, but I keep searching when you leave.";
  return TALON_LINES.error;
}

/**
 * failure: { code, message, refunded }. lines: the progress lines so far.
 * actions: [{ label, onClick, kind }].
 */
export default function SearchFailure({ failure, lines, actions = [] }) {
  const code = failure?.code;
  const message = String(failure?.message || "");
  // Some messages say the find was given back already ("Your find was given
  // back."); the rest get it said here. A lost stream has not ended, so
  // nothing is settled yet.
  const settledNote = code === "stream_lost" || code === "auth" ? null
    : failure?.refunded ? (/given back/i.test(message) ? null : "Your find was given back, so this one didn't count.")
    : "Anything Talon saved is on your board.";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <MascotSays agent={TALON} state="thinking" size={80} layout="auto">{lineFor(code)}</MascotSays>
      <Card role="alert">
        <p style={{ margin: 0, fontFamily: SANS, fontSize: "1.05rem", fontWeight: 700, color: TEXT, lineHeight: 1.55 }}>
          {message}
        </p>
        {settledNote && (
          <p style={{ margin: "6px 0 0", fontFamily: SANS, fontSize: "0.95rem", color: TEXT_MUTED, lineHeight: 1.5 }}>
            {settledNote}
          </p>
        )}
      </Card>
      {lines?.length > 0 && <ProgressChecklist lines={lines} label="What Talon got through" />}
      {actions.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {actions.map((a) => (
            <Button key={a.label} kind={a.kind || "secondary"} onClick={a.onClick}>{a.label}</Button>
          ))}
        </div>
      )}
    </div>
  );
}
