import { PixelStamp } from "../PixelIcons.jsx";
import { AMBER_TEXT, DANGER, RADIUS, SANS, TEXT, TEXT_MUTED, useAgentInk } from "../agentUi.js";
import { FieldLabel, INPUT_CLASS, SourceLink, domainOf, inputStyle } from "./flowUi.jsx";
import { looksPersonal, validEmail } from "./mailTools.js";

// The "To" line. An address Beaker found is shown with where it was found
// ("Verified on usf.edu", linked). With none, Beaker says so plainly (it
// never guesses one), and the student can paste one they trust or open the
// person's page to look. Editing it is always allowed; the tag only stays
// while the address is still the one Beaker verified.

export default function RecipientField({ value, onChange, verifiedEmail, emailSourceUrl, lookUrl, readOnly = false }) {
  const ink = useAgentInk();
  const v = value.trim();
  const verified = !!verifiedEmail && v.toLowerCase() === verifiedEmail.trim().toLowerCase();
  const bad = !!v && !validEmail(v);

  let note = null;
  if (verified) {
    note = (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap", color: TEXT_MUTED, fontWeight: 600 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: ink.soft, color: ink.onSoft,
          borderRadius: RADIUS.pill, padding: "3px 10px", fontWeight: 800 }}>
          <PixelStamp kind="check" size={16} />
          Verified
        </span>
        <span>
          Found on{" "}
          {emailSourceUrl ? <SourceLink url={emailSourceUrl}>{domainOf(emailSourceUrl)}</SourceLink> : "their own page"}
        </span>
      </span>
    );
  } else if (!v && !readOnly) {
    note = (
      <span style={{ color: AMBER_TEXT, fontWeight: 600 }}>
        No public email found. Beaker never guesses one. Paste an address you trust, or open their page to look.
        {lookUrl && <> <SourceLink url={lookUrl}>Open their page</SourceLink></>}
      </span>
    );
  } else if (bad && !readOnly) {
    note = <span style={{ color: DANGER, fontWeight: 700 }}>That doesn't look like an email address yet.</span>;
  } else if (!readOnly && looksPersonal(v)) {
    note = (
      <span style={{ color: AMBER_TEXT, fontWeight: 600 }}>
        That looks like a personal address. Beaker only sends to a school or work address, or one on their own page.
        You can still copy the email.
      </span>
    );
  } else if (!readOnly && v) {
    note = <span style={{ color: TEXT_MUTED, fontWeight: 600 }}>You added this address. Check it's right before you send.</span>;
  }

  return (
    <div>
      <FieldLabel htmlFor="oa-to">To</FieldLabel>
      {readOnly ? (
        <p id="oa-to" style={{ margin: 0, fontFamily: SANS, fontSize: "1rem", fontWeight: 600, color: TEXT, overflowWrap: "anywhere" }}>
          {v || "No address saved"}
        </p>
      ) : (
        <input id="oa-to" className={INPUT_CLASS} type="email" inputMode="email" autoComplete="off" spellCheck={false}
          value={value} maxLength={254} onChange={(e) => onChange(e.target.value)} aria-invalid={bad || undefined}
          aria-describedby={note ? "oa-to-note" : undefined} placeholder="name@university.edu" style={inputStyle} />
      )}
      {note && (
        <p id="oa-to-note" style={{ margin: "6px 0 0", fontFamily: SANS, fontSize: "0.95rem", lineHeight: 1.55 }}>{note}</p>
      )}
    </div>
  );
}
