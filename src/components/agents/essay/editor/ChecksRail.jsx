import { PixelStamp } from "../../../ui/PixelIcons.jsx";
import {
  AMBER_BG, AMBER_TEXT, BORDER, FOCUS_CLASS, RADIUS, SANS, SURFACE, TEXT, TEXT_MID, TEXT_MUTED, useAgentInk,
} from "../../../ui/tokens.js";
import { plural } from "./editorUi.js";

// The seven checks of a review, always all seven and always in the same
// order, whatever the review found: answers the prompt, specific details, you
// are in it, the point, length, matches your record, not a repeat.
//
// Each has a mark that is not colour alone: a different pixel shape and a
// word for each verdict. Amber marks a flag (never red: a flag is a question
// to think about, not a mistake).

const WORDS = { ok: "Nothing flagged", flag: "Flagged", na: "Nothing to compare", none: "Not checked" };

function Mark({ verdict }) {
  const ink = useAgentInk();
  const look = {
    ok: { bg: ink.softer, line: ink.soft, fg: ink.onSoft },
    flag: { bg: AMBER_BG, line: "#f3d9a4", fg: AMBER_TEXT },
    na: { bg: SURFACE, line: BORDER, fg: TEXT_MUTED },
    none: { bg: SURFACE, line: BORDER, fg: TEXT_MUTED },
  }[verdict];
  return (
    <span aria-hidden="true" style={{ flexShrink: 0, width: 32, height: 32, marginTop: 1, borderRadius: RADIUS.control,
      background: look.bg, border: `1px solid ${look.line}`, color: look.fg, display: "inline-flex", alignItems: "center",
      justifyContent: "center", boxSizing: "border-box" }}>
      {verdict === "ok" && <PixelStamp kind="check" size={16} />}
      {verdict === "flag" && <PixelStamp kind="flag" size={16} />}
      {verdict === "none" && <PixelStamp kind="question" size={16} />}
      {verdict === "na" && <span style={{ width: 10, height: 2, background: "currentColor" }} />}
    </span>
  );
}

/** checks: the seven from buildReview. onJump(noteId): go to a check's first
 *  note. */
export default function ChecksRail({ checks, onJump }) {
  const ink = useAgentInk();
  return (
    <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column" }}>
      {checks.map((c, i) => {
        const flagged = c.verdict === "flag";
        return (
          <li key={c.key} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 0",
            borderTop: i ? `1px solid ${BORDER}` : "none", minWidth: 0 }}>
            <Mark verdict={c.verdict} />
            <div style={{ flex: 1, minWidth: 0, fontFamily: SANS }}>
              <p style={{ margin: 0, display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "0 10px", lineHeight: 1.4 }}>
                <span style={{ fontSize: "1rem", fontWeight: 800, color: TEXT }}>{c.label}</span>
                <span style={{ fontSize: "0.9rem", fontWeight: 800, color: flagged ? AMBER_TEXT : c.verdict === "ok" ? ink.text : TEXT_MUTED }}>
                  {WORDS[c.verdict]}
                </span>
              </p>
              {c.line && (
                <p style={{ margin: "2px 0 0", fontSize: "0.95rem", fontWeight: 500, color: TEXT_MID, lineHeight: 1.5,
                  overflowWrap: "anywhere" }}>
                  {c.line}
                </p>
              )}
              {c.notes.length > 0 && (
                <button type="button" className={FOCUS_CLASS} onClick={() => onJump?.(c.notes[0].id)}
                  style={{ margin: "0 0 -8px -6px", padding: "10px 6px", minHeight: 44, border: "none", background: "none",
                    borderRadius: 8, cursor: "pointer", fontFamily: SANS, fontSize: "0.93rem", fontWeight: 800, color: ink.text,
                    textDecoration: "underline", textUnderlineOffset: 3 }}>
                  {c.notes.length === 1 ? "See the note" : `See the ${plural(c.notes.length, "note")}`}
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
