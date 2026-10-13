import { openNotes } from "../../../../lib/essay.js";
import { PixelArrow } from "../../../ui/PixelIcons.jsx";
import { Button } from "../../../ui/kit.jsx";
import { BORDER, FOCUS_CLASS, RADIUS, SANS, TEXT, TEXT_MID, TEXT_MUTED, WHITE, useAgentInk } from "../../../ui/tokens.js";
import { ROW_CLASS, short, whenLabel } from "./editorUi.js";

// In the notes panel the bar opens: the notes from the newest review that the
// student has neither answered nor dismissed, each as its quote and Quill's
// question. A slim list, and deliberately nothing more: the live text carries
// no highlights (they belong to the version Quill read, which the essay has
// moved on from), so each row opens that review at its note instead.

/** review: the newest review, or null. onOpen(noteId | null): open it, at a
 *  note when one is given. */
export default function OpenNotesList({ review, onOpen }) {
  const ink = useAgentInk();
  if (!review) return null;
  const open = openNotes(review);
  const total = Array.isArray(review.notes) ? review.notes.length : 0;
  const when = whenLabel(review.created_at);

  return (
    <section aria-labelledby="qe-open-title" style={{ minWidth: 0 }}>
      <h3 id="qe-open-title" style={{ margin: 0, fontFamily: SANS, fontSize: "1.05rem", fontWeight: 800, color: TEXT,
        fontVariantNumeric: "tabular-nums" }}>
        Open notes ({open.length})
      </h3>
      <p style={{ margin: "2px 0 10px", fontFamily: SANS, fontSize: "0.93rem", fontWeight: 600, color: TEXT_MUTED, lineHeight: 1.5 }}>
        {open.length > 0
          ? `From Quill's read${when ? ` ${when}` : ""}. They point at the version it read, not at what you have typed since.`
          : total > 0
            ? "You've answered or dismissed every note from Quill's last read."
            : "Quill left no notes on its last read."}
      </p>

      {open.length > 0 && (
        <ul style={{ listStyle: "none", margin: "0 0 8px", padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {open.map((note) => {
            const quote = short(note.quote, 110);
            const asks = typeof note.question === "string" && note.question.trim() ? note.question.trim()
              : short(note.observation, 160);
            return (
              <li key={note.id}>
                <button type="button" className={`${FOCUS_CLASS} ${ROW_CLASS}`} onClick={() => onOpen?.(note.id)}
                  style={{ display: "block", width: "100%", textAlign: "left", cursor: "pointer", boxSizing: "border-box",
                    minHeight: 44, padding: "9px 12px", background: WHITE, borderStyle: "solid", borderWidth: "1px 1px 1px 3px",
                    borderColor: `${BORDER} ${BORDER} ${BORDER} ${ink.ring}`, borderRadius: RADIUS.control, fontFamily: SANS }}>
                  {quote && (
                    <span style={{ display: "block", fontSize: "0.93rem", fontWeight: 500, color: TEXT_MUTED, lineHeight: 1.5,
                      overflowWrap: "anywhere" }}>
                      &ldquo;{quote}&rdquo;
                    </span>
                  )}
                  {asks && (
                    <span style={{ display: "block", marginTop: quote ? 3 : 0, fontSize: "0.98rem", fontWeight: 700,
                      color: TEXT_MID, lineHeight: 1.45, overflowWrap: "anywhere" }}>
                      {asks}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Button kind="quiet" onClick={() => onOpen?.(null)} style={{ padding: "10px 6px" }}>
        Open the full review
        <PixelArrow size={16} />
      </Button>
    </section>
  );
}
