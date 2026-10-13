import { openNotes } from "../../../../lib/essay.js";
import { PixelArrow } from "../../../ui/PixelIcons.jsx";
import { BORDER, FOCUS_CLASS, RADIUS, SANS, TEXT, TEXT_MUTED, WHITE, useAgentInk } from "../../../ui/tokens.js";
import { ROW_CLASS, capital, plural, whenLabel } from "./editorUi.js";

// Every review Quill has made of this essay, newest first. Each one belongs
// to the version it read, so opening it shows that version, not today's text.

/** reviews: full rows, newest first. onOpen(id). */
export default function PastReviews({ reviews, onOpen }) {
  const ink = useAgentInk();
  if (!reviews?.length) return null;
  return (
    <section aria-labelledby="qe-past-title" style={{ minWidth: 0 }}>
      <h3 id="qe-past-title" style={{ margin: "0 0 8px", fontFamily: SANS, fontSize: "1.05rem", fontWeight: 800, color: TEXT }}>
        Past reviews
      </h3>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        {reviews.map((r) => {
          const notes = Array.isArray(r.notes) ? r.notes.length : 0;
          const open = openNotes(r).length;
          const facts = [
            Number.isFinite(Number(r.word_count)) ? `${plural(Number(r.word_count), "word")} read` : "",
            notes ? plural(notes, "note") : "no notes",
            notes && open ? `${open} open` : "",
          ].filter(Boolean).join(", ");
          return (
            <li key={r.id}>
              <button type="button" className={`${FOCUS_CLASS} ${ROW_CLASS}`} onClick={() => onOpen?.(r.id)}
                style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", cursor: "pointer",
                  boxSizing: "border-box", minHeight: 52, padding: "8px 12px", background: WHITE,
                  border: `1px solid ${BORDER}`, borderRadius: RADIUS.control, fontFamily: SANS }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: "0.98rem", fontWeight: 700, color: TEXT, lineHeight: 1.4 }}>
                    {capital(whenLabel(r.created_at)) || "A review"}
                  </span>
                  <span style={{ display: "block", fontSize: "0.93rem", fontWeight: 600, color: TEXT_MUTED, lineHeight: 1.45,
                    fontVariantNumeric: "tabular-nums" }}>
                    {facts}
                  </span>
                </span>
                <span aria-hidden="true" style={{ display: "flex", color: ink.text, flexShrink: 0 }}><PixelArrow size={16} /></span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
