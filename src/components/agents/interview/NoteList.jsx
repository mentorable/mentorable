import { useId, useMemo } from "react";
import { PixelStamp } from "../../ui/PixelIcons.jsx";
import { Card, SR_ONLY } from "../../ui/kit.jsx";
import { FOCUS_CLASS, RADIUS, SANS, SURFACE, TEXT, TEXT_MID, TEXT_MUTED, useAgentInk } from "../../ui/tokens.js";
import { feedbackOf, turnsOf } from "./interviewUi.js";

// Poise's notes, one card per question it asked: one thing that worked and
// one to try next time, each pointing at the student's own words. Then the
// two or three habits that ran through the whole interview.
//
// Every quote is something the student said (the backend found it in their
// turns before storing it). A quote is a button: it finds that turn in the
// transcript and marks the words. Nothing here is a sample answer, and there
// is no field that could hold one.

const label = { margin: 0, display: "flex", alignItems: "center", gap: 8, fontFamily: SANS, fontSize: "0.95rem",
  fontWeight: 800, color: TEXT_MID, lineHeight: 1.4 };
const prose = { margin: "4px 0 0", fontFamily: SANS, fontSize: "1rem", fontWeight: 500, color: TEXT, lineHeight: 1.6,
  overflowWrap: "anywhere" };

/** The student's words as a button that finds them in the transcript. */
function Quote({ point, onJump }) {
  const ink = useAgentInk();
  if (!point?.quote) return null;
  return (
    <button type="button" className={FOCUS_CLASS} onClick={() => onJump?.(point.turn, point.quote)}
      style={{ display: "block", width: "100%", boxSizing: "border-box", textAlign: "left", margin: "8px 0 0",
        padding: "8px 10px", minHeight: 44, cursor: "pointer", background: SURFACE, border: "none",
        borderLeft: `3px solid ${ink.ring}`, borderRadius: `0 ${RADIUS.control}px ${RADIUS.control}px 0`, fontFamily: SANS,
        fontSize: "0.98rem", fontWeight: 500, color: TEXT_MID, lineHeight: 1.55, overflowWrap: "anywhere" }}>
      <span style={SR_ONLY}>You said, show it in the transcript: </span>
      &ldquo;{point.quote}&rdquo;
    </button>
  );
}

function Point({ title, stamp, point, onJump }) {
  const ink = useAgentInk();
  if (!point) return null;
  return (
    <div style={{ marginTop: 12 }}>
      <p style={label}>
        <span aria-hidden="true" style={{ display: "flex", color: ink.text }}><PixelStamp kind={stamp} size={16} /></span>
        {title}
      </p>
      <p style={prose}>{point.text}</p>
      <Quote point={point} onJump={onJump} />
    </div>
  );
}

/**
 * feedback: the stored feedback ({ questions, habits, thin }). transcript:
 * the stored transcript. onJump(turn, quote): show that student turn in the
 * transcript (and the quoted words in it).
 */
export default function NoteList({ feedback, transcript, onJump }) {
  const uid = useId();
  const ink = useAgentInk();
  const turns = useMemo(() => turnsOf(transcript), [transcript]);
  const { questions, habits } = useMemo(() => feedbackOf(feedback, turns), [feedback, turns]);

  return (
    <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 28 }}>
      <section aria-labelledby={`${uid}-q`} style={{ minWidth: 0 }}>
        <h2 id={`${uid}-q`} style={{ margin: 0, fontFamily: SANS, fontSize: "1.3rem", fontWeight: 800, color: TEXT,
          letterSpacing: "-0.01em", lineHeight: 1.3 }}>
          Notes on each question
        </h2>
        {questions.length === 0 ? (
          <p style={{ ...prose, marginTop: 8, color: TEXT_MID }}>Poise left no notes on single questions this time.</p>
        ) : (
          <ol style={{ listStyle: "none", margin: "12px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 14 }}>
            {questions.map((q, i) => (
              <Card as="li" key={q.key} aria-labelledby={`${uid}-q${i}`}>
                <h3 id={`${uid}-q${i}`} style={{ margin: 0, display: "flex", alignItems: "flex-start", gap: 10, fontFamily: SANS,
                  fontSize: "1.05rem", fontWeight: 800, color: TEXT, lineHeight: 1.4 }}>
                  <span style={{ flexShrink: 0, padding: "0 8px", borderRadius: 6, fontSize: "0.9rem", lineHeight: 1.6,
                    background: ink.button.bg, color: ink.button.fg, fontVariantNumeric: "tabular-nums" }}>
                    <span style={SR_ONLY}>Question </span>{i + 1}
                  </span>
                  <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                    {q.question ? <>Poise asked: &ldquo;{q.question}&rdquo;</> : "A question from the interview"}
                  </span>
                </h3>
                <Point title="What worked" stamp="check" point={q.worked} onJump={onJump} />
                <Point title="To try next time" stamp="sparkle" point={q.next} onJump={onJump} />
              </Card>
            ))}
          </ol>
        )}
      </section>

      {habits.length > 0 && (
        <section aria-labelledby={`${uid}-h`} style={{ minWidth: 0 }}>
          <h2 id={`${uid}-h`} style={{ margin: 0, fontFamily: SANS, fontSize: "1.3rem", fontWeight: 800, color: TEXT,
            letterSpacing: "-0.01em", lineHeight: 1.3 }}>
            Habits across the interview
          </h2>
          <p style={{ margin: "4px 0 0", fontFamily: SANS, fontSize: "0.95rem", fontWeight: 600, color: TEXT_MUTED, lineHeight: 1.5 }}>
            Patterns that showed up in more than one answer.
          </p>
          <ul style={{ listStyle: "none", margin: "12px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
            {habits.map((h, i) => (
              <Card as="li" key={i}>
                <p style={{ ...prose, margin: 0, display: "flex", alignItems: "flex-start", gap: 10, fontWeight: 600 }}>
                  <span aria-hidden="true" style={{ display: "flex", marginTop: 4, flexShrink: 0, color: ink.text }}>
                    <PixelStamp kind="flag" size={16} />
                  </span>
                  <span style={{ minWidth: 0 }}>{h.text}</span>
                </p>
                <Quote point={h} onJump={onJump} />
              </Card>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
