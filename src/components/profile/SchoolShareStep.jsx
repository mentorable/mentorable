import { ALWAYS_SHARED } from "../../lib/counselor.js";
import { BORDER, FOCUS_CLASS, SANS, SURFACE, TEXT, TEXT_MID, TEXT_MUTED, useAgentInk } from "../ui/tokens.js";
import { Button, Notice, SR_ONLY } from "../ui/kit.jsx";
import { PixelStamp } from "../ui/PixelIcons.jsx";

// The one question the My school card asks right after a student joins: is
// there anything else they want their counselor to see? Joining has already
// happened, with every section off, so this screen only ever adds to what is
// shared, and only what the student turns on. The four switches are the
// linked card's own (MySchool's Linked), so each one saves the moment it is
// flipped, with the same read-back when a save fails. Nothing here waits for a
// button: Profile's own Save changes covers the rest of the page, never this
// card, and Done only ends the step. Done with everything off keeps
// everything else private.
//
// Until they answer, the card keeps asking, even after a reload. What is
// remembered in this browser is only that the question is still open (the
// time of the link it belongs to), never what they picked.

const STEPS = ["Join code", "What to share"];
const OWED_KEY = "mentorable.schoolChoiceOwed.";

const LABEL = { fontFamily: SANS, fontSize: "1rem", fontWeight: 700, color: TEXT, margin: 0, lineHeight: 1.4 };
const HINT = { fontFamily: SANS, fontSize: "0.92rem", color: TEXT_MUTED, lineHeight: 1.55, margin: "0.35rem 0 0" };

/** What a counselor never sees, whatever the student switches on: the rest
 *  of the card's "Never shared:" line, here and once linked. */
export const NEVER_SHARED = "your chats with your advisor, what Mentorable remembers, the words, titles and prompts of "
  + "your essays and Quill's notes on them, what you write in Quest check-ins, and Beaker's and Talon's boards.";

const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);

/** "A", "A and B", "A, B and C". */
function andList(items) {
  if (items.length <= 1) return items[0] || "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

// ─── The open question, remembered per student ───────────────────────────────
// The mark is the link's own `linked_at`, so a question left open for a link
// that has since gone (they left on another device) never comes back for a
// new one. Storage that throws (a private window) just means the question is
// asked for as long as the page stays open.

const markFor = (link) => (link?.linked_at ? String(link.linked_at) : "linked");

/** Remember that `userId` still owes the sharing choice for `link`. */
export function oweChoice(userId, link) {
  if (!userId) return;
  try { localStorage.setItem(OWED_KEY + userId, markFor(link)); } catch { /* asked until the page closes */ }
}

/** Whether `userId` still owes the sharing choice for this very link. */
export function choiceOwed(userId, link) {
  if (!userId || !link) return false;
  try { return localStorage.getItem(OWED_KEY + userId) === markFor(link); } catch { return false; }
}

/** The choice was made, skipped, or no longer applies. */
export function forgetChoice(userId) {
  if (!userId) return;
  try { localStorage.removeItem(OWED_KEY + userId); } catch { /* nothing kept */ }
}

// ─── The two steps, shown above the code field and above the choices ─────────

export function JoinSteps({ at }) {
  const ink = useAgentInk();
  return (
    <ol aria-label="Joining your school"
      style={{ listStyle: "none", margin: "0 0 1.1rem", padding: 0, display: "flex", alignItems: "center",
        flexWrap: "wrap", gap: "8px" }}>
      {STEPS.map((label, i) => {
        const n = i + 1;
        const done = n < at;
        const here = n === at;
        return (
          <li key={label} aria-current={here ? "step" : undefined}
            style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            {i > 0 && (
              <span aria-hidden="true" style={{ width: 16, height: 2, borderRadius: 1, flexShrink: 0,
                background: done || here ? ink.text : BORDER }} />
            )}
            <span aria-hidden="true" style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, boxSizing: "border-box",
              display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: SANS, fontSize: "0.9rem",
              fontWeight: 800, fontVariantNumeric: "tabular-nums",
              background: here ? ink.button.bg : done ? ink.softer : SURFACE,
              color: here ? ink.button.fg : done ? ink.onSoft : TEXT_MUTED,
              border: `1.5px solid ${here ? ink.button.bg : done ? ink.soft : BORDER}` }}>
              {done ? <PixelStamp kind="check" size={16} /> : n}
            </span>
            <span style={{ fontFamily: SANS, fontSize: "0.95rem", fontWeight: here ? 800 : 700, lineHeight: 1.3,
              color: here ? TEXT : TEXT_MUTED, whiteSpace: "nowrap" }}>
              <span style={SR_ONLY}>Step {n} of {STEPS.length}: </span>
              {label}
              {done && <span style={SR_ONLY}>, done</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// ─── The step ─────────────────────────────────────────────────────────────────

/**
 * `link` is my_school()'s answer for a link made moments ago (or one whose
 * question is still open after a reload), and `who` "your counselor" or
 * "your counselors". `switches` are the four switch rows (list items), each
 * saving as it is flipped, and `problem` what to show when a save failed.
 * `onDone()` ends the step and saves nothing.
 */
export default function SchoolShareStep({ link, who, switches, problem, onDone, waitingCode, onDropCode }) {
  const name = link.school.name;
  const seer = link.counselors.length ? andList(link.counselors) : "Your school's counselors";
  const Who = who.charAt(0).toUpperCase() + who.slice(1);

  return (
    <div>
      <JoinSteps at={2} />

      {waitingCode && (
        <Notice tone="info" onDismiss={onDropCode} style={{ marginBottom: "1rem" }}>
          You opened a join link for a school, but you are already linked to {name}. To join another school, leave this one first.
        </Notice>
      )}

      <h3 id="ms-step-title" tabIndex={-1} className={FOCUS_CLASS}
        style={{ margin: 0, fontFamily: SANS, fontWeight: 800, fontSize: "1.2rem", lineHeight: 1.3, letterSpacing: "-0.01em",
          color: TEXT, overflowWrap: "anywhere", borderRadius: 4 }}>
        You joined {name}
      </h3>
      <p style={{ fontFamily: SANS, fontSize: "1rem", color: TEXT_MID, lineHeight: 1.55, margin: "0.4rem 0 0" }}>
        {seer} can now see <strong style={{ color: TEXT }}>{lowerFirst(ALWAYS_SHARED)}</strong>. Is there anything else
        you want to share? All four are off until you turn one on, and each switch saves as soon as you change it.
      </p>

      <p id="ms-step-list" style={{ ...LABEL, marginTop: "1.1rem" }}>What else to share</p>
      <ul aria-labelledby="ms-step-list" style={{ listStyle: "none", margin: "0.6rem 0 0", padding: 0 }}>
        {switches}
      </ul>
      {problem}

      <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: "0.9rem" }}>
        <p style={{ ...HINT, marginTop: 0 }}>
          <strong style={{ color: TEXT }}>Never shared:</strong> {NEVER_SHARED}
        </p>
        <p style={HINT}>
          {Who} can print or save what you share. Turning a switch off later stops them seeing it from then on. It
          cannot take back a copy they already made.
        </p>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "10px 14px", flexWrap: "wrap", marginTop: "1.1rem" }}>
        <Button kind="primary" onClick={onDone} style={{ minWidth: 132 }}>Done</Button>
        <p style={{ ...HINT, margin: 0, flex: "1 1 200px" }}>
          Done works with everything off. You can change these any time, here on your Profile.
        </p>
      </div>
    </div>
  );
}
