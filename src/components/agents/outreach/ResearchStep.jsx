import { useEffect, useRef, useState } from "react";
import BeakerAtWork from "./BeakerAtWork.jsx";
import ProgressChecklist from "./ProgressChecklist.jsx";
import { MascotSays } from "../SpeechBubble.jsx";
import { PixelArrow } from "../PixelIcons.jsx";
import { BEAKER_LINES } from "../../../lib/agents/registry.js";
import { DANGER, SANS, TEXT, TEXT_MUTED } from "../agentUi.js";
import { Button, Card, Counter, FieldLabel, INPUT_CLASS, inputStyle } from "./flowUi.jsx";
import { ANSWER_MAX } from "./options.js";

// Step 4: research and draft. While the stream runs, Beaker flies over the
// real checklist. Then one of: Beaker's one question (answer and continue,
// no extra cost), or an error with a way back. A draft goes straight to the
// review screen, and a name that matched several people goes back to the
// pick (the page handles both).

function Question({ question, answer, onAnswer, onSubmit, onSkip, busy, error }) {
  const [tried, setTried] = useState(false);
  const fieldRef = useRef(null);
  const empty = !answer.trim();

  // The wait just ended in a question, which nothing else announces. Focus
  // goes to the answer box, whose label is the question, so a screen reader
  // reads it out. After a frame, so it lands after the page's own focus on
  // the step heading when a saved question is picked up again.
  useEffect(() => {
    const id = requestAnimationFrame(() => fieldRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);

  const submit = (e) => {
    e.preventDefault();
    setTried(true);
    if (empty || busy) return;
    onSubmit();
  };
  return (
    <form onSubmit={submit} noValidate style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <MascotSays state="thinking" size={80} layout="auto">{BEAKER_LINES.question}</MascotSays>
      <Card>
        <FieldLabel htmlFor="oa-answer">{question}</FieldLabel>
        <textarea id="oa-answer" ref={fieldRef} className={INPUT_CLASS} rows={3} maxLength={ANSWER_MAX} value={answer}
          aria-describedby="oa-answer-count" aria-invalid={tried && empty}
          onChange={(e) => onAnswer(e.target.value)} style={{ ...inputStyle, resize: "vertical", minHeight: 90 }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 4 }}>
          <span style={{ fontFamily: SANS, fontSize: "0.93rem", color: TEXT_MUTED }}>
            Only what's true. Beaker won't add anything you didn't say.
          </span>
          <Counter id="oa-answer-count" n={answer.length} max={ANSWER_MAX} />
        </div>
        {tried && empty && (
          <p role="alert" style={{ margin: "8px 0 0", fontFamily: SANS, fontWeight: 700, fontSize: "0.98rem", color: DANGER }}>
            Write a short answer, or skip the question.
          </p>
        )}
      </Card>
      {error}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <Button kind="primary" type="submit" busy={busy} style={{ minWidth: 160 }}>
          Continue {!busy && <PixelArrow size={16} />}
        </Button>
        <Button kind="secondary" onClick={onSkip} disabled={busy}>Skip, write it without this</Button>
        <span style={{ fontFamily: SANS, fontSize: "0.95rem", fontWeight: 600, color: TEXT_MUTED }}>No extra cost.</span>
      </div>
    </form>
  );
}

/**
 * view: "running" | "question" | "error".
 * failure: { code, message, refunded } for "error".
 * actions: [{ label, onClick, kind }] under an error.
 */
export default function ResearchStep({
  view, lines, question, answer, onAnswer, onSubmitAnswer, onSkip, busy, failure, actions = [], answerError,
}) {
  if (view === "question") {
    return (
      <Question question={question} answer={answer} onAnswer={onAnswer} onSubmit={onSubmitAnswer} onSkip={onSkip}
        busy={busy} error={answerError} />
    );
  }

  if (view === "error") {
    const line = failure?.code === "not_found" ? BEAKER_LINES.notFound
      : failure?.code === "stream_lost" ? "The line went quiet on my end, but I keep working when you leave."
      : BEAKER_LINES.error;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <MascotSays state="thinking" size={80} layout="auto">{line}</MascotSays>
        <Card role="alert">
          <p style={{ margin: 0, fontFamily: SANS, fontSize: "1.05rem", fontWeight: 700, color: TEXT, lineHeight: 1.55 }}>
            {failure?.message}
          </p>
          {failure?.refunded === false && failure?.code !== "stream_lost" && failure?.code !== "card_deleted" && (
            <p style={{ margin: "6px 0 0", fontFamily: SANS, fontSize: "0.95rem", color: TEXT_MUTED, lineHeight: 1.5 }}>
              Anything Beaker saved is on your board.
            </p>
          )}
        </Card>
        {lines?.length > 0 && <ProgressChecklist lines={lines} label="What Beaker got through" />}
        {actions.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {actions.map((a) => (
              <Button key={a.label} kind={a.kind || "secondary"} onClick={a.onClick}>{a.label}</Button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <BeakerAtWork lines={lines}
      note="This usually takes under a minute. You can leave this page: Beaker keeps working, and the draft lands on your board." />
  );
}
