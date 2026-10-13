import { useEffect, useState } from "react";
import { QUILL_LINES } from "../../../../lib/agents/registry.js";
import Spinner from "../../../common/Spinner.jsx";
import { PixelStamp } from "../../../ui/PixelIcons.jsx";
import { Button, Card, LinkButton, Notice, SR_ONLY } from "../../../ui/kit.jsx";
import {
  AMBER_TEXT, BORDER, FOCUS_CLASS, PRESS_CLASS, RADIUS, SANS, TEXT, TEXT_MID, TEXT_MUTED, useAgentInk,
} from "../../../ui/tokens.js";
import { MascotSays } from "../../SpeechBubble.jsx";
import { QUILL } from "./editorUi.js";

// Quill, small and to the side of the essay, and the one button that spends
// anything on this page: "Ask Quill to read it".
//
// The button is never a dead end. When it is off it says exactly why (no
// prompt yet, under 50 words, nothing changed since the last read, no reviews
// left), and it stays focusable so a keyboard or a screen reader can reach
// the reason. While Quill reads, its lines rotate for flavour only: the one
// thing announced is that it is reading.
//
// A hand-off is not a review. When the writing says the student may be in
// danger, the server sends a message instead of notes, and this shows it
// calmly in a plain card: no notes, nothing counted, nothing else on the page
// changed.

const EVERY_MS = 4500;

function Reading() {
  const lines = Array.isArray(QUILL_LINES.reviewing) && QUILL_LINES.reviewing.length
    ? QUILL_LINES.reviewing : ["Reading your draft."];
  const [at, setAt] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setAt((n) => (n + 1) % lines.length), EVERY_MS);
    return () => clearInterval(t);
  }, [lines.length]);
  return (
    <>
      <MascotSays agent={QUILL} state="thinking" size={64} layout="auto">
        <span aria-hidden="true">{lines[at]}</span>
        <span style={SR_ONLY}>Reading your draft.</span>
      </MascotSays>
      <p role="status" style={SR_ONLY}>Quill is reading your draft. This can take a minute or so.</p>
      <p style={{ margin: "10px 0 0", fontFamily: SANS, fontSize: "0.93rem", fontWeight: 600, color: TEXT_MUTED, lineHeight: 1.5 }}>
        This can take a minute or so. You can keep writing: Quill reads the words you had when you asked.
      </p>
    </>
  );
}

function Handoff({ message, panelRef, onClose }) {
  const ink = useAgentInk();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Card as="section" aria-labelledby="qe-handoff-title"
        style={{ borderStyle: "solid", borderWidth: "1px 1px 1px 4px", borderColor: `${BORDER} ${BORDER} ${BORDER} ${ink.ring}` }}>
        <h3 id="qe-handoff-title" ref={panelRef} tabIndex={-1} className={FOCUS_CLASS}
          style={{ margin: 0, fontFamily: SANS, fontSize: "1.1rem", fontWeight: 800, color: TEXT, borderRadius: 6 }}>
          A note from Quill
        </h3>
        <p style={{ margin: "8px 0 0", fontFamily: SANS, fontSize: "1.05rem", fontWeight: 500, color: TEXT, lineHeight: 1.65,
          overflowWrap: "anywhere" }}>
          {message}
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 14 }}>
          <LinkButton href="tel:988">Call 988</LinkButton>
          <LinkButton href="sms:988">Text 988</LinkButton>
          <Button kind="quiet" onClick={onClose}>Close this note</Button>
        </div>
      </Card>
      <MascotSays agent={QUILL} state="idle" size={64} layout="auto">{QUILL_LINES.handoffNote}</MascotSays>
    </div>
  );
}

/**
 * line: what Quill says while nothing is happening. block: null, or { code,
 * text }: exactly why the button is off. budget: { left, limit } or null when
 * unknown. reviewing: a review is in flight. error: { text, signIn } from the
 * last ask. handoff: the server's hand-off message, or null. headingRef: the
 * section heading, for the page to focus. handoffRef: the hand-off's heading.
 */
export default function AskReview({
  line, block, budget, reviewing, error, handoff, headingRef, handoffRef, onAsk, onDismissError, onSignIn, onCloseHandoff,
}) {
  const ink = useAgentInk();
  const off = !!block || reviewing;
  const spent = block?.code === "no_reviews";
  const left = budget ? QUILL_LINES.reviewsLeft(budget.left, budget.limit) : "";

  return (
    <section aria-labelledby="qe-ask-title" style={{ minWidth: 0 }}>
      <h2 id="qe-ask-title" ref={headingRef} tabIndex={-1} className={FOCUS_CLASS}
        style={{ margin: "0 0 4px", fontFamily: SANS, fontSize: "1.05rem", fontWeight: 800, color: TEXT, borderRadius: 6 }}>
        Ask Quill
      </h2>

      {handoff ? (
        <Handoff message={handoff} panelRef={handoffRef} onClose={onCloseHandoff} />
      ) : reviewing ? (
        <Reading />
      ) : (
        <MascotSays agent={QUILL} state="idle" size={64} layout="auto">{line}</MascotSays>
      )}

      {error && (
        <Notice tone={error.signIn ? "error" : "warn"} onDismiss={onDismissError} style={{ marginTop: 14 }}
          action={error.signIn ? <Button kind="primary" onClick={onSignIn}>Sign in again</Button> : undefined}>
          {error.text}
        </Notice>
      )}

      <div style={{ marginTop: 16 }}>
        <button type="button" className={`${FOCUS_CLASS} ${off ? "" : PRESS_CLASS}`} aria-disabled={off || undefined}
          aria-busy={reviewing || undefined} aria-describedby="qe-ask-why" onClick={() => { if (!off) onAsk?.(); }}
          style={{ width: "100%", minHeight: 48, padding: "10px 18px", display: "inline-flex", alignItems: "center",
            justifyContent: "center", gap: 9, boxSizing: "border-box", borderRadius: RADIUS.control,
            border: off ? `1.5px solid ${BORDER}` : "none", background: off ? "#e9e6e1" : ink.button.bg,
            color: off ? TEXT_MUTED : ink.button.fg, fontFamily: SANS, fontSize: "1.05rem", fontWeight: 800, lineHeight: 1.25,
            cursor: off ? "not-allowed" : "pointer" }}>
          {reviewing ? <Spinner size={16} color={TEXT_MUTED} /> : <PixelStamp kind="scroll" size={16} />}
          {reviewing ? "Quill is reading" : "Ask Quill to read it"}
        </button>
        <div id="qe-ask-why" style={{ marginTop: 8, fontFamily: SANS, lineHeight: 1.5 }}>
          {block && !reviewing && (
            <p style={{ margin: 0, fontSize: "0.98rem", fontWeight: 700, color: spent ? AMBER_TEXT : TEXT_MID }}>
              {block.text}
            </p>
          )}
          {left && !spent && (
            <p style={{ margin: block && !reviewing ? "2px 0 0" : 0, fontSize: "0.93rem", fontWeight: 700, color: TEXT_MUTED,
              fontVariantNumeric: "tabular-nums" }}>
              {left}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
