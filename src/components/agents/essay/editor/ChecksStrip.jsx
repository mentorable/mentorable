import { PixelStamp } from "../../../ui/PixelIcons.jsx";
import { Button, Card, SR_ONLY } from "../../../ui/kit.jsx";
import {
  AMBER_BG, AMBER_TEXT, BORDER, FOCUS_CLASS, RADIUS, SANS, SURFACE, TEXT, TEXT_MUTED, useAgentInk,
} from "../../../ui/tokens.js";

// The seven checks of a review as one strip: always all seven, always in the
// same order, whatever the review found (answers the prompt, specific details,
// you are in it, the point, length, matches your record, not a repeat).
//
// Each is a button with a mark that is not colour alone (a different pixel
// shape for each verdict) and a word. Choosing one shows its line under the
// strip, and the notes that belong to it can be opened from there. Hovering
// shows the line too (a title), and a screen reader hears it with the button.
// Amber marks a flag (never red: a flag is a question to think about, not a
// mistake).
//
// On a phone the seven cannot carry their words, so each is its mark (at least
// 44 pixels wide, with its name for a screen reader) and, under a flagged one,
// the number of its note; the words show for the one chosen.

export const VERDICT_WORDS = { ok: "Nothing flagged", flag: "Flagged", na: "Nothing to compare", none: "Not checked" };

function Mark({ verdict }) {
  const ink = useAgentInk();
  const look = {
    ok: { bg: ink.softer, line: ink.soft, fg: ink.onSoft },
    flag: { bg: AMBER_BG, line: "#f3d9a4", fg: AMBER_TEXT },
    na: { bg: SURFACE, line: BORDER, fg: TEXT_MUTED },
    none: { bg: SURFACE, line: BORDER, fg: TEXT_MUTED },
  }[verdict];
  return (
    <span aria-hidden="true" style={{ flexShrink: 0, width: 32, height: 32, borderRadius: RADIUS.control, background: look.bg,
      border: `1px solid ${look.line}`, color: look.fg, display: "inline-flex", alignItems: "center", justifyContent: "center",
      boxSizing: "border-box" }}>
      {verdict === "ok" && <PixelStamp kind="check" size={16} />}
      {verdict === "flag" && <PixelStamp kind="flag" size={16} />}
      {verdict === "none" && <PixelStamp kind="question" size={16} />}
      {verdict === "na" && <span style={{ width: 10, height: 2, background: "currentColor" }} />}
    </span>
  );
}

const noteWords = (c) => (c.notes.length === 1 ? `Note ${c.notes[0].number}` : `Notes ${c.notes.map((n) => n.number).join(", ")}`);

/**
 * checks: the seven from buildReview. shown: the key of the one whose line is
 * open. onPick(key): one was chosen. onOpenNote(id): open one of its notes.
 * compact: marks only (a phone).
 */
export default function ChecksStrip({ checks, shown, onPick, onOpenNote, compact = false }) {
  const ink = useAgentInk();
  const cur = checks.find((c) => c.key === shown) || checks[0];
  if (!cur) return null;
  const flaggedCur = cur.verdict === "flag";

  return (
    <Card as="section" aria-labelledby="qr-checks-title" style={{ padding: compact ? "10px 4px 12px" : "10px 12px 12px" }}>
      <h3 id="qr-checks-title" style={{ margin: 0, padding: compact ? "4px 10px 6px" : "4px 6px 6px", fontFamily: SANS, fontSize: "1.1rem", fontWeight: 800,
        color: TEXT, lineHeight: 1.3 }}>
        The seven checks
      </h3>
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", gap: compact ? 0 : 4 }}>
        {checks.map((c) => {
          const on = c.key === cur.key;
          const flagged = c.verdict === "flag";
          const status = c.notes.length ? noteWords(c) : VERDICT_WORDS[c.verdict];
          const heard = [compact ? c.label : "", compact && c.notes.length ? noteWords(c) : "", VERDICT_WORDS[c.verdict], c.line]
            .filter(Boolean).join(". ");
          return (
            <li key={c.key} style={{ flex: "1 1 0", minWidth: 0, display: "flex" }}>
              <button type="button" className={FOCUS_CLASS} aria-pressed={on} title={`${c.label}: ${c.line || VERDICT_WORDS[c.verdict]}`}
                onClick={() => onPick?.(c.key)}
                style={{ flex: 1, minWidth: 0, minHeight: 44, boxSizing: "border-box", display: "flex", flexDirection: "column",
                  alignItems: compact ? "center" : "flex-start", justifyContent: compact ? "center" : "flex-start",
                  gap: 6, padding: compact ? "6px 0" : "10px 10px 9px", textAlign: "left", cursor: "pointer", fontFamily: SANS,
                  borderRadius: RADIUS.control, border: `1.5px solid ${on ? ink.ring : "transparent"}`,
                  background: on ? ink.softer : "transparent" }}>
                <Mark verdict={c.verdict} />
                {compact && flagged && c.notes.length > 0 && (
                  <span aria-hidden="true" style={{ maxWidth: "100%", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
                    fontSize: "0.9rem", fontWeight: 800, lineHeight: 1.2, color: AMBER_TEXT, fontVariantNumeric: "tabular-nums" }}>
                    {c.notes.map((n) => n.number).join(",")}
                  </span>
                )}
                {!compact && (
                  <>
                    <span style={{ fontSize: "0.95rem", fontWeight: 800, color: TEXT, lineHeight: 1.25, overflowWrap: "anywhere" }}>
                      {c.label}
                    </span>
                    <span style={{ fontSize: "0.9rem", fontWeight: 800, lineHeight: 1.3, overflowWrap: "anywhere",
                      color: flagged ? AMBER_TEXT : c.verdict === "ok" ? ink.text : TEXT_MUTED }}>
                      {status}
                    </span>
                  </>
                )}
                <span style={SR_ONLY}>{heard}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <div style={{ margin: compact ? "8px 10px 0" : "8px 6px 0", paddingTop: 10, borderTop: `1px solid ${BORDER}`, fontFamily: SANS }}>
        {/* The button above already says all of this to a screen reader. */}
        <p aria-hidden="true" style={{ margin: 0, fontSize: "1rem", fontWeight: 500, color: TEXT, lineHeight: 1.5,
          overflowWrap: "anywhere" }}>
          <span style={{ fontWeight: 800 }}>{cur.label}.</span>{" "}
          {(compact || !cur.line) && (
            <span style={{ fontWeight: 800, color: flaggedCur ? AMBER_TEXT : TEXT_MUTED }}>{VERDICT_WORDS[cur.verdict]}. </span>
          )}
          {cur.line}
        </p>
        {cur.notes.length > 0 && (
          <div role="group" aria-label={`Notes for ${cur.label}`} style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
            {cur.notes.map((n) => (
              <Button key={n.id} kind="secondary" onClick={() => onOpenNote?.(n.id)} style={{ padding: "8px 14px", fontSize: "0.95rem" }}>
                Open note {n.number}
              </Button>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
