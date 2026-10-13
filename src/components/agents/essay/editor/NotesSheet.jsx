import { FOCUS_CLASS, SANS, TEXT, TEXT_MID } from "../../../ui/tokens.js";
import Sheet from "../../outreach/Sheet.jsx";
import OpenNotesList from "./OpenNotesList.jsx";
import PastReviews from "./PastReviews.jsx";

// "Notes" in the editor's bar opens this: the open notes from Quill's newest
// read, and every review so far. It is a panel over the page (a bottom sheet
// on a phone), not a column beside the essay. Focus goes in, Tab stays inside,
// Escape closes, and focus goes back to the Notes button.
//
// Nothing here is the essay: each row opens its review, which shows the
// version Quill read, not today's text.

/**
 * newest: the newest review (or null). reviews: all of them, newest first.
 * onOpen(reviewId, noteId | null): open a review, at a note when one is given.
 * onClose().
 */
export default function NotesSheet({ newest, reviews, onOpen, onClose }) {
  return (
    <Sheet onClose={onClose} labelledBy="qe-notes-title" width={540}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
        <h2 id="qe-notes-title" style={{ margin: "8px 0 0", fontFamily: SANS, fontSize: "1.3rem", fontWeight: 800, color: TEXT,
          lineHeight: 1.3 }}>
          Quill's notes
        </h2>
        <button type="button" className={FOCUS_CLASS} onClick={onClose} aria-label="Close notes"
          style={{ flexShrink: 0, width: 44, height: 44, display: "inline-flex", alignItems: "center", justifyContent: "center",
            border: "none", borderRadius: 10, background: "rgba(20,20,19,0.05)", color: TEXT_MID, cursor: "pointer" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"
            aria-hidden="true" focusable="false">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {newest && <OpenNotesList review={newest} onOpen={(noteId) => onOpen?.(newest.id, noteId)} />}
        {reviews.length > 0 && <PastReviews reviews={reviews} onOpen={(id) => onOpen?.(id, null)} />}
      </div>
    </Sheet>
  );
}
