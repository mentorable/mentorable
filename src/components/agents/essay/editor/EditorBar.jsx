import { useIsMobile } from "../../../../hooks/useIsMobile.js";
import Spinner from "../../../common/Spinner.jsx";
import { PixelStamp } from "../../../ui/PixelIcons.jsx";
import { Button, Card, SR_ONLY } from "../../../ui/kit.jsx";
import { BG, BORDER, FOCUS_CLASS, PRESS_CLASS, RADIUS, SANS, TEXT_MUTED, useAgentInk } from "../../../ui/tokens.js";
import Mascot from "../../Mascot.jsx";
import { QUILL } from "./editorUi.js";
import SaveLine from "./SaveLine.jsx";
import WordMeter, { WordBar } from "./WordMeter.jsx";

// The bar over the page: the word count, where the words are saved, the open
// notes, and "Ask Quill". One row at every width, and it stays at the top of
// the screen while the essay scrolls under it.
//
// It is sticky inside the editor's own column, so it never reaches the app's
// sidebar (the page is padded clear of it) and a phone's nav is at the bottom.
// Quill is a small owl in it, quiet until asked.
//
// "Ask Quill" is never a dead end. When it is off it stays focusable, says it
// is off to a screen reader, is described by the reason that sits just under
// the bar (qe-ask-why, drawn by AskStatus), and pressing it says the reason
// again where the student is looking (onBlocked).

/**
 * words, bounds, length: the live count (see WordMeter). saveState, onRetry,
 * onConflict: see SaveLine. reviewing: a review is in flight. off: the button
 * is off (a reason, or reading). hasNotes: there is a review to read, so Notes
 * shows; notesCount: how many of its notes are still open; notesOpen: the
 * notes panel is open. onNotes(): open it. onAsk(), onBlocked(): ask, or say
 * why that is not possible. askRef: the button, for the page to focus.
 */
export default function EditorBar({
  words, bounds, length, saveState, onRetry, onConflict, reviewing, off, hasNotes, notesCount, notesOpen, onNotes, onAsk,
  onBlocked, askRef,
}) {
  const ink = useAgentInk();
  const compact = useIsMobile(640);

  return (
    <div style={{ position: "sticky", top: 0, zIndex: 40, margin: "0 0 14px", padding: "8px 0 0", background: BG }}>
      <Card as="section" aria-label="Word count, saving, notes and Ask Quill"
        style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "8px 12px",
          padding: compact ? "8px 10px" : "8px 14px 8px 12px", boxShadow: "0 6px 18px rgba(20,20,19,0.07)" }}>
        {!compact && <Mascot agent={QUILL} state={reviewing ? "thinking" : "idle"} size={48} title="" />}

        <div style={{ flex: "1 1 120px", minWidth: 0 }}>
          <WordMeter id="qe-count" words={words} bounds={bounds} state={length} compact align="start" />
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "2px 12px", marginTop: 2 }}>
            {!compact && <WordBar words={words} bounds={bounds} state={length} width={180} />}
            <SaveLine state={saveState} onRetry={onRetry} onConflict={onConflict} />
          </div>
        </div>

        {hasNotes && (
          <Button kind="secondary" onClick={onNotes} aria-haspopup="dialog" aria-expanded={!!notesOpen}
            aria-label={`Notes (${notesCount})`}
            style={{ flexShrink: 0, padding: compact ? "0 10px" : "10px 14px", gap: 8, minWidth: 44,
              fontSize: "0.98rem", borderColor: notesOpen ? ink.ring : BORDER }}>
            <PixelStamp kind="chat" size={16} />
            <span aria-hidden="true" style={{ fontVariantNumeric: "tabular-nums" }}>{compact ? notesCount : `Notes (${notesCount})`}</span>
          </Button>
        )}

        <button ref={askRef} type="button" className={`${FOCUS_CLASS} ${off ? "" : PRESS_CLASS}`} aria-disabled={off || undefined}
          aria-busy={reviewing || undefined} aria-describedby="qe-ask-why"
          onClick={() => { if (!off) onAsk?.(); else if (!reviewing) onBlocked?.(); }}
          style={{ flexShrink: 0, minHeight: 44, padding: compact ? "8px 12px" : "8px 18px", display: "inline-flex",
            alignItems: "center", justifyContent: "center", gap: 8, boxSizing: "border-box", borderRadius: RADIUS.control,
            border: off ? `1.5px solid ${BORDER}` : "none", background: off ? "#e9e6e1" : ink.button.bg,
            color: off ? TEXT_MUTED : ink.button.fg, fontFamily: SANS, fontSize: "1rem", fontWeight: 800, lineHeight: 1.25,
            cursor: off ? "not-allowed" : "pointer" }}>
          {reviewing ? <Spinner size={16} color={TEXT_MUTED} /> : <PixelStamp kind="scroll" size={16} />}
          {reviewing ? "Quill is reading" : <span>Ask Quill<span style={SR_ONLY}> to read it</span></span>}
        </button>
      </Card>
    </div>
  );
}
