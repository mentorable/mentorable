import { useEffect, useState } from "react";
import { QUILL_LINES } from "../../../../lib/agents/registry.js";
import { Button, Card, LinkButton, Notice, SR_ONLY } from "../../../ui/kit.jsx";
import { AMBER_TEXT, BORDER, FOCUS_CLASS, SANS, TEXT, TEXT_MID, TEXT_MUTED, useAgentInk } from "../../../ui/tokens.js";
import { MascotSays } from "../../SpeechBubble.jsx";
import { QUILL } from "./editorUi.js";

// What Quill has to say under the bar (EditorBar holds the "Ask Quill" button
// itself): why the button is off, how many reviews are left, how a read is
// going, and what went wrong.
//
// The reason is never hidden. It is always the description of the button (the
// element qe-ask-why), whatever else is on screen. While Quill reads, its lines
// rotate for flavour only: the one thing announced is that it is reading.
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
 * line, speaks: what Quill says, and whether it says it now (it speaks when
 * there is something to know, not all the time). block: null, or { code,
 * text }: exactly why the button is off. budget: { left, limit } or null when
 * unknown. reviewing: a review is in flight. error: { text, signIn } from the
 * last ask. handoff: the server's hand-off message, or null. handoffRef: the
 * hand-off's heading, for the page to focus.
 */
export default function AskStatus({
  line, speaks = false, block, budget, reviewing, error, handoff, handoffRef, onDismissError, onSignIn, onCloseHandoff,
}) {
  const spent = block?.code === "no_reviews";
  const left = budget ? QUILL_LINES.reviewsLeft(budget.left, budget.limit) : "";

  return (
    <section aria-labelledby="qe-ask-title" style={{ minWidth: 0, margin: "0 0 14px" }}>
      <h2 id="qe-ask-title" style={SR_ONLY}>Ask Quill</h2>

      {handoff ? (
        <Handoff message={handoff} panelRef={handoffRef} onClose={onCloseHandoff} />
      ) : reviewing ? (
        <Reading />
      ) : speaks && line ? (
        <MascotSays agent={QUILL} state="idle" size={64} layout="auto">{line}</MascotSays>
      ) : null}

      {error && (
        <Notice tone={error.signIn ? "error" : "warn"} onDismiss={onDismissError} style={{ marginTop: 14 }}
          action={error.signIn ? <Button kind="primary" onClick={onSignIn}>Sign in again</Button> : undefined}>
          {error.text}
        </Notice>
      )}

      <div id="qe-ask-why" style={{ margin: handoff || reviewing || speaks || error ? "12px 0 0" : 0, fontFamily: SANS, lineHeight: 1.5 }}>
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
    </section>
  );
}
