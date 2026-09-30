import { PixelArrow } from "../PixelIcons.jsx";
import { MascotSays } from "../SpeechBubble.jsx";
import { BEAKER_LINES } from "../../../lib/agents/registry.js";
import { BORDER, RADIUS, SANS, TEXT, TEXT_MID, TEXT_MUTED, WHITE } from "../agentUi.js";
import { Button, SourceLink, domainOf } from "./flowUi.jsx";

// Pick one person: the shortlist a goal turned into, or the look-alikes
// when a name matched more than one person. Every card shows the page the
// search really returned, so the student can check it is the right person.

/** "Write to Maria, Dr. Maria Lee, University of South Florida": it starts
 *  with the words on the button, so a voice-control user can say what they
 *  see, and it names the full person and place, which tells apart people
 *  who share a name. */
function pickLabel(first, person) {
  const name = String(person.name || "").trim();
  return [`Write to ${first}`, name && name !== first ? name : "", String(person.organization || "").trim()]
    .filter(Boolean).join(", ");
}

function Candidate({ person, index, onPick, busy, kind }) {
  const role = [person.title, person.organization].filter(Boolean).join(", ");
  const first = String(person.name || "").trim().replace(/^(dr|prof|professor|mr|ms|mrs|mx)\.?\s+/i, "").split(/\s+/)[0] || "them";
  const headingId = `oa-cand-${index}`;
  return (
    <li aria-labelledby={headingId} style={{ listStyle: "none", background: WHITE, border: `1px solid ${BORDER}`,
      borderRadius: RADIUS.card, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
      <div style={{ minWidth: 0 }}>
        <h3 id={headingId} style={{ margin: 0, fontFamily: SANS, fontWeight: 800, fontSize: "1.2rem", color: TEXT,
          lineHeight: 1.3, overflowWrap: "anywhere" }}>
          {person.name}
        </h3>
        {role && (
          <p style={{ margin: "3px 0 0", fontFamily: SANS, fontWeight: 600, fontSize: "0.98rem", color: TEXT_MUTED,
            lineHeight: 1.45, overflowWrap: "anywhere" }}>
            {role}
          </p>
        )}
      </div>
      {person.why && kind === "shortlist" && (
        <p style={{ margin: 0, fontFamily: SANS, fontSize: "1rem", color: TEXT_MID, lineHeight: 1.55 }}>{person.why}</p>
      )}
      {person.source_url && (
        <p style={{ margin: 0, fontFamily: SANS, fontSize: "0.95rem", color: TEXT_MUTED, lineHeight: 1.5 }}>
          Source:{" "}
          <SourceLink url={person.source_url}>
            {person.source_title ? `${person.source_title} (${domainOf(person.source_url)})` : domainOf(person.source_url)}
          </SourceLink>
        </p>
      )}
      <div style={{ marginTop: 4 }}>
        <Button kind="primary" disabled={busy} onClick={() => onPick(index)} aria-label={pickLabel(first, person)}>
          Write to {first}
          <PixelArrow size={16} />
        </Button>
      </div>
    </li>
  );
}

/** kind: "shortlist" (from a goal) or "ambiguous" (a name that matched several). */
export default function ShortlistStep({ candidates, kind = "shortlist", goal, onPick, onBack, backLabel, busy }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <MascotSays state={kind === "ambiguous" ? "thinking" : "delivering"} size={80} layout="auto">
        {kind === "ambiguous" ? BEAKER_LINES.ambiguous : BEAKER_LINES.shortlist}
      </MascotSays>
      {goal && kind === "shortlist" && (
        <p style={{ margin: 0, fontFamily: SANS, fontSize: "0.98rem", color: TEXT_MUTED, lineHeight: 1.5 }}>
          Your goal: <span style={{ color: TEXT, fontWeight: 600 }}>{goal}</span>
        </p>
      )}
      <ul aria-label={kind === "ambiguous" ? "People with that name" : "People who fit"}
        style={{ margin: 0, padding: 0, display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
        {candidates.map((c, i) => (
          <Candidate key={`${c.name}-${i}`} person={c} index={i} onPick={onPick} busy={busy} kind={kind} />
        ))}
      </ul>
      {onBack && (
        <div>
          <Button kind="quiet" onClick={onBack} disabled={busy}>{backLabel || "None of these"}</Button>
        </div>
      )}
    </div>
  );
}
