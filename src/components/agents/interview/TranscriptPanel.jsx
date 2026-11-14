import { useId } from "react";
import { Button, SR_ONLY } from "../../ui/kit.jsx";
import { BORDER, FOCUS_CLASS, RADIUS, SANS, TEXT, TEXT_MID, TEXT_MUTED, WHITE, useAgentInk } from "../../ui/tokens.js";
import { MARK_CLASS, TURN_CLASS, markVars, quoteSpan, scrollBehavior, turnsOf } from "./interviewUi.js";

// The whole interview as text, Poise's lines and the student's, in order.
// It is what the backend fetched from the voice call and kept for the
// student alone (the voice service's own copy is deleted once it is read).
//
// A note's quote points here: that turn is marked (a thick edge and a
// "Quoted in a note" label, not colour alone), the quoted words inside it
// are underlined, and it takes focus. "Back to the note" returns to the
// quote that led here.

/** The element id of one turn, for the page to find and focus. */
export const turnId = (i) => `pi-turn-${i}`;

/** Bring turn `i` into view inside the transcript's own scroll box (and the
 *  box into the page's view), then focus it. */
export function showTurn(i) {
  const el = typeof document !== "undefined" ? document.getElementById(turnId(i)) : null;
  if (!el) return;
  const box = el.closest("[data-transcript-box]");
  const behavior = scrollBehavior();
  if (box && box.scrollHeight > box.clientHeight + 1) {
    try { box.scrollTo({ top: Math.max(0, el.offsetTop - 12), behavior }); } catch { box.scrollTop = Math.max(0, el.offsetTop - 12); }
  }
  try { (box || el).scrollIntoView({ block: "nearest", behavior }); } catch { /* old browsers */ }
  el.focus({ preventScroll: true });
}

/** The turn's text with the quoted words marked, when they can be found. */
function Marked({ text, quote }) {
  const span = quote ? quoteSpan(text, quote) : null;
  if (!span) return text;
  const [a, b] = span;
  return (
    <>
      {text.slice(0, a)}
      <mark className={MARK_CLASS}>{text.slice(a, b)}</mark>
      {text.slice(b)}
    </>
  );
}

/**
 * transcript: the stored transcript ([{ who, text }]). highlight: the index
 * of the student turn a note pointed at, or null. quote: the words in it to
 * mark (optional). onBack(): return to the note that led here (optional; the
 * button shows on the marked turn only when it is given).
 */
export default function TranscriptPanel({ transcript, highlight = null, quote = "", onBack }) {
  const uid = useId();
  const ink = useAgentInk();
  const turns = turnsOf(transcript);

  return (
    <section aria-labelledby={`${uid}-h`} style={{ minWidth: 0 }}>
      <h2 id={`${uid}-h`} style={{ margin: 0, fontFamily: SANS, fontSize: "1.3rem", fontWeight: 800, color: TEXT,
        letterSpacing: "-0.01em", lineHeight: 1.3 }}>
        Transcript
      </h2>
      <p style={{ margin: "4px 0 0", fontFamily: SANS, fontSize: "0.95rem", fontWeight: 600, color: TEXT_MUTED, lineHeight: 1.5 }}>
        As the call heard it. Only you can see this.
      </p>
      {turns.length === 0 ? (
        <p style={{ margin: "12px 0 0", fontFamily: SANS, fontSize: "1rem", fontWeight: 500, color: TEXT_MID, lineHeight: 1.6 }}>
          There is no transcript for this call.
        </p>
      ) : (
        <div data-transcript-box tabIndex={0} role="region" aria-label="Transcript of the interview"
          style={{ position: "relative", marginTop: 12, maxHeight: "min(72vh, 760px)", overflowY: "auto", background: WHITE,
            border: `1px solid ${BORDER}`, borderRadius: RADIUS.card, padding: "6px 14px", boxSizing: "border-box",
            ...markVars(ink) }}
          className={FOCUS_CLASS}>
          <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {turns.map((t, i) => {
              const you = t.who === "student";
              const on = highlight === i && you;
              return (
                <li key={i} id={turnId(i)} tabIndex={-1} className={TURN_CLASS}
                  style={{ padding: on ? 10 : "10px 0", margin: on ? "6px -4px" : 0,
                    borderTop: i > 0 && !on ? `1px solid ${BORDER}` : "none",
                    background: on ? ink.softer : "transparent",
                    borderLeft: on ? `5px solid ${ink.ring}` : "none",
                    borderRadius: on ? RADIUS.control : 0 }}>
                  <p style={{ margin: 0, display: "flex", flexWrap: "wrap", alignItems: "center", gap: "2px 10px",
                    fontFamily: SANS, fontSize: "0.9rem", fontWeight: 800, color: you ? TEXT : TEXT_MID, lineHeight: 1.4 }}>
                    <span>{you ? "You" : "Poise"}</span>
                    {on && <span style={{ color: ink.onSoft }}>Quoted in a note</span>}
                  </p>
                  <p style={{ margin: "2px 0 0", fontFamily: SANS, fontSize: "1rem", fontWeight: 500,
                    color: you ? TEXT : TEXT_MID, lineHeight: 1.6, overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>
                    {on ? <Marked text={t.text} quote={quote} /> : t.text}
                  </p>
                  {on && onBack && (
                    <Button kind="quiet" onClick={onBack} style={{ marginTop: 6, marginLeft: -10, padding: "6px 10px" }}>
                      Back to the note<span style={SR_ONLY}> that quoted this</span>
                    </Button>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </section>
  );
}
