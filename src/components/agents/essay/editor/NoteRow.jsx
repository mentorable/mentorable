import { PixelArrow, PixelStamp } from "../../../ui/PixelIcons.jsx";
import { SR_ONLY } from "../../../ui/kit.jsx";
import { BORDER, FOCUS_CLASS, RADIUS, SANS, TEXT, TEXT_MID, TEXT_MUTED, WHITE } from "../../../ui/tokens.js";
import { ROW_CLASS, short } from "./editorUi.js";
import { Chip } from "./NoteCard.jsx";

// The parts of the margin that are not a whole note: a note folded to one row
// (the others in the margin while one is open), and the stepper that moves to
// the previous or next note.
//
// Nothing here shows or holds essay text. A row holds the question Quill left
// (or what it noticed), which is Quill's own line.

/**
 * item: a note or a cut from buildReview. checkLabel: the words for a note's
 * check. response: the stored { state, answer } or null. onOpen(): open it.
 * popup: opening it opens a sheet, not the margin.
 */
export function NoteRow({ item, checkLabel = "", response = null, onOpen, popup = false }) {
  const cut = item.kind === "cut";
  const settled = response?.state === "dismissed" ? "Dismissed" : response?.state === "answered" ? "Answered" : "";
  const text = cut ? item.reason || item.quote : item.question || item.observation || item.quote;
  const name = cut ? "Passage that could go" : checkLabel || "Note";
  return (
    <button type="button" className={`${FOCUS_CLASS} ${ROW_CLASS}`} onClick={onOpen}
      aria-haspopup={popup ? "dialog" : undefined} aria-expanded={popup ? undefined : false}
      style={{ display: "flex", alignItems: "flex-start", gap: 10, width: "100%", minHeight: 44, boxSizing: "border-box",
        textAlign: "left", cursor: "pointer", padding: "10px 12px", background: WHITE, border: `1.5px solid ${BORDER}`,
        borderRadius: RADIUS.control, fontFamily: SANS }}>
      <Chip quiet={!!settled}>{cut ? `Cut ${item.number}` : item.number}</Chip>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0 8px", fontSize: "0.9rem", fontWeight: 800,
          color: TEXT_MID, lineHeight: 1.5 }}>
          <span style={SR_ONLY}>{cut ? `Passage that could go ${item.number}: ` : `Note ${item.number}: `}</span>
          {name}
          {settled && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: TEXT_MUTED }}>
              {settled === "Answered" && <PixelStamp kind="check" size={16} />}
              {settled}
            </span>
          )}
        </span>
        {text && (
          <span style={{ display: "block", fontSize: "0.98rem", fontWeight: 700, color: TEXT, lineHeight: 1.45, overflowWrap: "anywhere" }}>
            {short(text, 150)}
          </span>
        )}
      </span>
      <span aria-hidden="true" style={{ display: "flex", color: TEXT_MID, marginTop: 6, flexShrink: 0 }}>
        <PixelArrow size={16} style={{ transform: "rotate(90deg)" }} />
      </span>
    </button>
  );
}

const square = {
  width: 44, height: 44, display: "inline-flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box",
  borderRadius: RADIUS.control, border: `1.5px solid ${BORDER}`, background: WHITE, color: TEXT_MID, cursor: "pointer",
};

/**
 * label: "Note 2 of 4". what: "note" or "item" (what the buttons step
 * through). onPrev(), onNext(): they wrap round at the ends.
 */
export function Stepper({ label, what = "note", onPrev, onNext, style }) {
  return (
    <div role="group" aria-label={`Step through the ${what}s`}
      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, ...style }}>
      <p aria-hidden="true" style={{ margin: 0, fontFamily: SANS, fontSize: "1.05rem", fontWeight: 800, color: TEXT,
        fontVariantNumeric: "tabular-nums" }}>
        {label}
      </p>
      <span style={{ display: "inline-flex", gap: 8 }}>
        <button type="button" className={FOCUS_CLASS} onClick={onPrev} aria-label={`Previous ${what}`} style={square}>
          <PixelArrow size={16} style={{ transform: "scaleX(-1)" }} />
        </button>
        <button type="button" className={FOCUS_CLASS} onClick={onNext} aria-label={`Next ${what}`} style={square}>
          <PixelArrow size={16} />
        </button>
      </span>
    </div>
  );
}
