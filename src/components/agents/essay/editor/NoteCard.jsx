import { useId } from "react";
import { PixelStamp } from "../../../ui/PixelIcons.jsx";
import { Button, INPUT_CLASS, SR_ONLY, inputStyle } from "../../../ui/kit.jsx";
import {
  AMBER_TEXT, BORDER, FOCUS_CLASS, RADIUS, SANS, SURFACE, TEXT, TEXT_MID, TEXT_MUTED, WHITE, useAgentInk,
} from "../../../ui/tokens.js";
import { ANSWER_MAX, plural } from "./editorUi.js";

// One note from a review: the student's own words it points at, what Quill
// noticed there, and the question it leaves. For a clash with the record, the
// record's own wording; for a repeat, the other place that says the same.
//
// A note never carries replacement text, and nothing here can change the
// essay. What a student can do with one: read it, find its place in the text,
// answer it for themselves, or dismiss it. The answer box is theirs alone: it
// is saved beside the review and never sent to Quill or anywhere else.

const label = { margin: 0, fontFamily: SANS, fontSize: "0.9rem", fontWeight: 800, color: TEXT_MUTED, lineHeight: 1.4 };
const prose = { margin: "2px 0 0", fontFamily: SANS, fontSize: "1rem", fontWeight: 500, color: TEXT, lineHeight: 1.55, overflowWrap: "anywhere" };

/** The quoted passage: a button that finds it in the text when it has a
 *  highlight there, plain words when it does not. */
function Quote({ children, onShow, dashed = false }) {
  const ink = useAgentInk();
  const look = {
    display: "block", width: "100%", boxSizing: "border-box", textAlign: "left", margin: 0, padding: "8px 10px",
    background: SURFACE, border: "none", borderLeft: `3px ${dashed ? "dashed" : "solid"} ${ink.ring}`,
    borderRadius: `0 ${RADIUS.control}px ${RADIUS.control}px 0`, fontFamily: SANS, fontSize: "0.98rem", fontWeight: 500,
    color: TEXT_MID, lineHeight: 1.55, overflowWrap: "anywhere",
  };
  if (!children) return null;
  if (!onShow) return <p style={look}>&ldquo;{children}&rdquo;</p>;
  return (
    <button type="button" className={FOCUS_CLASS} onClick={onShow} style={{ ...look, minHeight: 44, cursor: "pointer" }}>
      <span style={SR_ONLY}>Show in the text: </span>
      &ldquo;{children}&rdquo;
    </button>
  );
}

function Chip({ children, quiet = false }) {
  const ink = useAgentInk();
  return (
    <span aria-hidden="true" style={{ flexShrink: 0, padding: "0 7px", borderRadius: 6, fontFamily: SANS, fontSize: "0.9rem",
      fontWeight: 800, lineHeight: 1.5, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums",
      background: quiet ? "#efedea" : ink.button.bg, color: quiet ? TEXT_MID : ink.button.fg }}>
      {children}
    </span>
  );
}

function frame(ink, active) {
  return {
    background: active ? ink.softer : WHITE, borderStyle: "solid", borderColor: active ? ink.ring : BORDER,
    borderWidth: active ? "1.5px 1.5px 1.5px 5px" : "1.5px", borderRadius: RADIUS.control,
    padding: active ? "12px 12px 12px 8.5px" : 12, outlineOffset: 2,
  };
}

/**
 * note: from buildReview. checkLabel: the words for its check. response: the
 * stored { state, answer } or null. answer: what is in the box right now (the
 * stored answer, or words typed and not saved yet). unsaved: the box holds
 * words the database does not have. active: this is the chosen note. onShow:
 * find it in the text (absent when it has no highlight). onAnswer(text),
 * onAnswerBlur(): the box changed, the box lost focus. onDismiss, onRestore:
 * set it aside, bring it back. register(node): the page keeps the card's
 * element, to scroll to and focus. plain: no frame (inside a sheet).
 */
export default function NoteCard({
  note, checkLabel, response, answer, unsaved = false, active = false, onShow, onAnswer, onAnswerBlur, onDismiss, onRestore,
  register, plain = false,
}) {
  const ink = useAgentInk();
  const uid = useId();
  const dismissed = response?.state === "dismissed";
  const answered = response?.state === "answered";
  const name = `Note ${note.number}${checkLabel ? `, ${checkLabel}` : ""}`;

  return (
    <div ref={register} role="group" aria-label={name} tabIndex={-1} className={FOCUS_CLASS}
      style={{ minWidth: 0, ...(plain ? { outline: "none" } : frame(ink, active)) }}>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "4px 8px", marginBottom: 8 }}>
        <Chip quiet={dismissed || answered}>{note.number}</Chip>
        <span style={{ ...label, color: TEXT_MID }}>{checkLabel || "Note"}</span>
        {(dismissed || answered) && (
          <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, fontFamily: SANS,
            fontSize: "0.9rem", fontWeight: 800, color: TEXT_MUTED }}>
            {answered && <PixelStamp kind="check" size={16} />}
            {answered ? "Answered" : "Dismissed"}
          </span>
        )}
      </div>

      <Quote onShow={onShow}>{note.quote}</Quote>

      {dismissed ? (
        <div style={{ marginTop: 8 }}>
          <Button kind="secondary" onClick={onRestore}>Bring it back</Button>
        </div>
      ) : (
        <>
          {note.observation && (
            <div style={{ marginTop: 10 }}>
              <p style={label}>What Quill noticed</p>
              <p style={prose}>{note.observation}</p>
            </div>
          )}
          {note.recordSays && (
            <div style={{ marginTop: 10 }}>
              <p style={label}>Your record says</p>
              <p style={{ ...prose, fontWeight: 600 }}>{note.recordSays}</p>
            </div>
          )}
          {note.other && (
            <div style={{ marginTop: 10 }}>
              <p style={label}>
                {note.other.where}{note.other.label ? `, "${note.other.label}"` : ""}
              </p>
              {note.other.quote && <p style={prose}>&ldquo;{note.other.quote}&rdquo;</p>}
            </div>
          )}
          {note.question && (
            <p style={{ ...prose, margin: "12px 0 0", display: "flex", alignItems: "flex-start", gap: 8, fontWeight: 700 }}>
              <span aria-hidden="true" style={{ display: "flex", marginTop: 4, color: ink.text, flexShrink: 0 }}>
                <PixelStamp kind="question" size={16} />
              </span>
              <span style={{ minWidth: 0 }}>{note.question}</span>
            </p>
          )}

          <div style={{ marginTop: 12 }}>
            <label htmlFor={`${uid}-answer`} style={{ ...label, display: "block", color: TEXT, fontSize: "0.95rem" }}>
              Your answer, just for you
            </label>
            <textarea id={`${uid}-answer`} className={INPUT_CLASS} value={answer} maxLength={ANSWER_MAX} rows={3}
              aria-describedby={`${uid}-hint`} onChange={(e) => onAnswer?.(e.target.value)} onBlur={onAnswerBlur}
              placeholder="Think it through here if it helps."
              style={{ ...inputStyle, marginTop: 4, minHeight: 84, resize: "vertical" }} />
            <p id={`${uid}-hint`} style={{ margin: "4px 0 0", fontFamily: SANS, fontSize: "0.9rem", fontWeight: 600, lineHeight: 1.45,
              color: unsaved ? AMBER_TEXT : TEXT_MUTED }}>
              {unsaved ? "Not saved yet. " : answered ? "Saved. " : ""}
              Only you see this. Quill never reads it.
              {answer.length > ANSWER_MAX * 0.9 ? ` ${plural(ANSWER_MAX - answer.length, "character")} left.` : ""}
            </p>
          </div>
          <div style={{ marginTop: 8 }}>
            <Button kind="secondary" onClick={onDismiss}>Dismiss this note</Button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * A passage that could go, when the draft was over its limit: the quote, why,
 * and how many words it is. Never a replacement, and the cutting is the
 * student's. cut: from buildReview. Other props as NoteCard.
 */
export function CutCard({ cut, active = false, onShow, register, plain = false }) {
  const ink = useAgentInk();
  return (
    <div ref={register} role="group" aria-label={`Passage that could go, ${cut.number}`} tabIndex={-1} className={FOCUS_CLASS}
      style={{ minWidth: 0, ...(plain ? { outline: "none" } : frame(ink, active)) }}>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "4px 8px", marginBottom: 8 }}>
        <Chip>Cut {cut.number}</Chip>
        {cut.words > 0 && (
          <span style={{ ...label, fontVariantNumeric: "tabular-nums" }}>{plural(cut.words, "word")}</span>
        )}
      </div>
      <Quote onShow={onShow} dashed>{cut.quote}</Quote>
      {cut.reason && (
        <div style={{ marginTop: 10 }}>
          <p style={label}>Why Quill points here</p>
          <p style={prose}>{cut.reason}</p>
        </div>
      )}
    </div>
  );
}
