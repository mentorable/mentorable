import { useState } from "react";
import { SHARES, joinLink } from "../../lib/counselor.js";
import { Button, Card, Heading, SR_ONLY, StampTile } from "../ui/kit.jsx";
import { BORDER, RADIUS, SANS, SURFACE, TEXT, TEXT_MID, TEXT_MUTED } from "../ui/tokens.js";
import { JoinCode, useCopy } from "./counselorUi.jsx";

// A school with no students yet. This is where a counselor learns how it
// works: students join with the code, and each one decides what to share.

const step = { fontFamily: SANS, fontSize: "1rem", color: TEXT_MID, lineHeight: 1.6 };
const stepTitle = { margin: 0, fontFamily: SANS, fontSize: "1.05rem", fontWeight: 800, color: TEXT, lineHeight: 1.4 };

function sectionList() {
  const names = SHARES.map((s) => s.label);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names.join("");
}

/** code: the school's join code. */
export default function CaseloadEmpty({ code }) {
  const [copied, copy] = useCopy();
  const [failed, setFailed] = useState(false);
  const link = code ? joinLink(code) : "";
  const run = async (key, text) => setFailed(!(await copy(key, text)));
  return (
    <Card style={{ maxWidth: 760, padding: "1.4rem 1.4rem 1.5rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <StampTile kind="person" size={40} />
        <Heading>No students yet</Heading>
      </div>
      <p style={{ ...step, margin: "10px 0 0" }}>
        Students join your school with your join code. Once they do, they show up here, and each one chooses what
        to share with you.
      </p>

      <ol style={{ listStyle: "none", margin: "18px 0 0", padding: 0, display: "grid", gap: 16 }}>
        <li>
          <p style={stepTitle}>1. Give students your join code</p>
          <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 14px", background: SURFACE,
            border: `1px solid ${BORDER}`, borderRadius: RADIUS.control, padding: "10px 14px" }}>
            <JoinCode code={code} size="1.5rem" />
            <Button kind="primary" onClick={() => run("code", code)}>{copied === "code" ? "Copied" : "Copy code"}</Button>
          </div>
          <p style={{ ...step, margin: "10px 0 0" }}>
            Or send this link, which fills the code in for them:
          </p>
          <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 14px" }}>
            <span style={{ fontFamily: SANS, fontSize: "0.95rem", fontWeight: 600, color: TEXT, overflowWrap: "anywhere",
              minWidth: 0, userSelect: "all" }}>
              {link}
            </span>
            <Button kind="secondary" onClick={() => run("link", link)}>{copied === "link" ? "Copied" : "Copy link"}</Button>
          </div>
          {/* The button's own label says "Copied"; a screen reader hears it here. */}
          <p aria-live="polite" style={failed ? { ...step, margin: "8px 0 0", fontSize: "0.95rem", color: TEXT_MUTED } : SR_ONLY}>
            {failed ? "Couldn't copy. Select it and copy it by hand."
              : copied === "code" ? "Join code copied." : copied === "link" ? "Join link copied." : ""}
          </p>
        </li>
        <li>
          <p style={stepTitle}>2. They enter it in Mentorable</p>
          <p style={{ ...step, margin: "4px 0 0" }}>
            A student opens their Profile, finds My school, and types the code. The link above takes them straight there.
          </p>
        </li>
        <li>
          <p style={stepTitle}>3. They choose what to share</p>
          <p style={{ ...step, margin: "4px 0 0" }}>
            You always see a linked student's name, grade and graduation year. They can also share their {sectionList()}.
            A section they have not shared reads "Not shared" here, and they can change their mind at any time.
          </p>
        </li>
      </ol>
    </Card>
  );
}
