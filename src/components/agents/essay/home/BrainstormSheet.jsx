import { useEffect, useId, useRef, useState } from "react";
import Sheet from "../../outreach/Sheet.jsx";
import { MascotSays } from "../../SpeechBubble.jsx";
import { PixelArrow } from "../../../ui/PixelIcons.jsx";
import {
  AMBER_TEXT, BORDER, FOCUS_CLASS, RADIUS, SANS, SURFACE, TEXT, TEXT_MID, TEXT_MUTED, WHITE, useAgentInk,
} from "../../../ui/tokens.js";
import { Button, Card, ChoiceChips, INPUT_CLASS, LinkButton, Notice, inputStyle } from "../../../ui/kit.jsx";
import Spinner from "../../../common/Spinner.jsx";
import { QUILL_LINES } from "../../../../lib/agents/registry.js";
import { essayErrorMessage, needsSignIn } from "../../../../lib/agentsApi.js";
import { TALK_QUESTIONS, TALK_STARTS, TOPIC_STATUS } from "../../../../lib/essay.js";
import { CharCount, QuillLine, RadioRow, SheetHeader, SmallLabel } from "./homeParts.jsx";
import { ANSWER_MAX, QUILL, asTopic, budgetOf, oneLine, talkLines } from "./homeUi.js";

// The guided brainstorm: Quill asks one short question at a time and the
// student answers in their own words. Quill never offers a topic, a thesis,
// an opening or a sentence; it only asks, and what the student says is kept
// as notes on an idea card.
//
// The sheet holds the conversation and sends all of it back each turn (the
// server keeps none of it between turns). It is held in memory only: never
// in browser storage, never logged.
//
// How a talk ends:
//   * Quill closes it (it has heard enough, or the question cap is reached,
//     or no turns are left): the server puts the answers on a card and the
//     sheet shows Quill's closing line and that card.
//   * "That's enough for now", always there. The conversation goes back once
//     more ending on Quill's own unanswered question, which is how the server
//     hears that the student stopped: Quill closes from what was said and the
//     server writes the card. An answer still in the box is sent first, like
//     any other. If that last call fails, the page keeps the answers on a
//     card itself (onKeep), in the same plain lines the server writes.
//   * A hand-off: the answer said the student may be in danger. The message
//     shows in a plain panel (with 988 a tap away), nothing from the talk is
//     kept anywhere, and no further question is asked.
// A turn that fails keeps what was said and offers to try again. Closing the
// sheet mid-talk is "That's enough for now", so nothing typed is dropped.

const FROM = [
  { key: "new", label: "Somewhere new" },
  { key: "card", label: "One of my ideas" },
];

// The hand-off, in the page's own words. The server sends its message too
// (rules.HANDOFF), but that one ends "Your writing is saved", which is true of
// a draft in the editor and false here: a brainstorm that ends this way keeps
// nothing, on the server or in this sheet. So this is what a brainstorm shows.
const HANDOFF = "This sounds like more than an essay. Please talk to an adult you trust or your school "
  + "counselor today. If you are in crisis or thinking about hurting yourself, call or text 988, the Suicide and "
  + "Crisis Lifeline, any time.";

const asText = (v) => (typeof v === "string" ? v.trim() : "");

/**
 * topics: the student's idea cards (a talk can pick one back up).
 * initialTopicId: open on that card.
 * turns: the talk budget from status ({ left, limit }), or null.
 * maxQuestions: the most questions one talk asks.
 * onTalk(body): one turn, { start, topic_id?, conversation } ->
 *   { done, message, fallback, handoff, topic, usage }; throws on a refusal.
 * onKeep({ start, topicId, lines }): the page writes the answers to a card
 *   and resolves to its row; throws an error essayErrorMessage can word.
 * onSaved(topic): a card was written, by the server or by onKeep.
 * onClose(): put the sheet away. onSeeCard(id): and go to that card.
 * onStartEssay(topic): and open the new-essay sheet on it. onSignIn().
 * onHolding(bool): the sheet holds answers that are saved nowhere yet.
 */
export default function BrainstormSheet({
  topics = [], initialTopicId = null, turns = null, maxQuestions = TALK_QUESTIONS,
  onTalk, onKeep, onSaved, onClose, onSeeCard, onStartEssay, onSignIn, onHolding,
}) {
  const ink = useAgentInk();
  const uid = useId();
  const id = (k) => `${uid}-${k}`;
  const hasInitial = !!initialTopicId && topics.some((t) => t.id === initialTopicId);

  const [view, setView] = useState("start");         // start | talk | done | handoff
  const [from, setFrom] = useState(hasInitial ? "card" : "new");
  const [start, setStart] = useState(null);          // a TALK_STARTS key
  const [topicId, setTopicId] = useState(hasInitial ? initialTopicId : null);
  const [messages, setMessages] = useState([]);      // [{ role: "advisor" | "student", content }]
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);           // a turn is with Quill
  const [stopping, setStopping] = useState(false);   // "That's enough" was pressed while one was
  const [saving, setSaving] = useState(false);       // the page is keeping the answers itself
  const [error, setError] = useState(null);          // a failed turn: { message, signIn }
  const [keepError, setKeepError] = useState(null);  // a failed keep, in words
  const [ending, setEnding] = useState(null);        // the done view: { message, fallback, topic, lines }
  const [left, setLeft] = useState(() => budgetOf(turns));
  
  const alive = useRef(true);
  const talk = useRef({ start: "open", topicId: null });   // fixed when the talk starts
  const stopAfter = useRef(false);
  const pendingKeep = useRef(null);
  const firstView = useRef(true);
  const topRef = useRef(null);
  const boxRef = useRef(null);
  const endRef = useRef(null);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const asked = messages.filter((m) => m.role === "advisor").length;
  const answers = messages.filter((m) => m.role === "student").length;
  const last = messages[messages.length - 1];
  const ended = saving || !!keepError;                 // the talk is over; only the card is left to write
  const waiting = view === "talk" && !busy && !ended && last?.role === "advisor";
  const question = last?.role === "advisor" ? last.content : "";
  const clean = oneLine(answer, ANSWER_MAX);
  const noTurns = !!left && left.left <= 0;

  // While answers (or words in the box) live only in this sheet, the page
  // asks before the tab closes.
  const holdingRef = useRef(onHolding);
  holdingRef.current = onHolding;
  const holding = view === "talk" && (answers > 0 || !!clean);
  useEffect(() => {
    holdingRef.current?.(holding);
    return () => holdingRef.current?.(false);
  }, [holding]);

  // A new view: focus goes to its top, so a screen reader hears where it is.
  useEffect(() => {
    if (firstView.current) { firstView.current = false; return; }
    topRef.current?.focus?.({ preventScroll: true });
  }, [view]);

  // A new question: straight to the answer box.
  useEffect(() => {
    if (waiting) boxRef.current?.focus();
  }, [waiting, messages.length]);

  // The thread follows the newest line. scrollIntoView moves no focus, so the
  // answer box keeps whatever the student is typing.
  useEffect(() => {
    if (view !== "talk") return;
    const calm = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    // The answer box is sticky over the bottom of the sheet, so the marker
    // alone would count as visible while it sits under the box. Scroll the
    // sheet itself to its end instead: the thread then ends just above it.
    const panel = endRef.current?.closest?.("[role='dialog']");
    if (panel?.scrollTo) panel.scrollTo({ top: panel.scrollHeight, behavior: calm ? "auto" : "smooth" });
    else endRef.current?.scrollIntoView?.({ block: "end", behavior: calm ? "auto" : "smooth" });
  }, [view, messages.length, busy, !!error, ended]);

  // ── The talk ───────────────────────────────────────────────────────────────

  const finish = (end) => { setStopping(false); setEnding(end); setView("done"); };

  /** Keep the answers on a card ourselves: the closing call failed, or the
   *  server closed the talk but could not write the card. */
  const keep = async (conversation) => {
    const lines = talkLines(conversation);
    if (!lines) { onClose?.(); return; }
    pendingKeep.current = conversation;
    setStopping(false); setSaving(true); setKeepError(null);
    try {
      const row = asTopic(await onKeep({ start: talk.current.start, topicId: talk.current.topicId, lines }));
      if (!alive.current) return;
      if (!row) throw new Error("no card came back");
      onSaved?.(row);
      pendingKeep.current = null;
      setSaving(false);
      finish({ message: "", fallback: false, topic: row, lines });
    } catch (e) {
      if (!alive.current) return;
      setSaving(false);
      setKeepError(essayErrorMessage(e));
    }
  };

  /** One turn. `closing`: the conversation ends on Quill's own unanswered
   *  question, so the server closes the talk and writes the card. */
  const ask = async (conversation, closing = false) => {
    setBusy(true); setError(null);
    const { start: key, topicId: card } = talk.current;
    let res = null;
    let failed = null;
    try {
      res = await onTalk({ start: key, ...(card ? { topic_id: card } : {}), conversation });
    } catch (e) {
      failed = e || new Error("failed");
    }
    if (!alive.current) return;
    setBusy(false);
    const usage = budgetOf(res?.usage) || budgetOf(res?.usage?.talk);
    if (usage) setLeft(usage);
    const stop = closing || stopAfter.current;   // "That's enough" is in play
    stopAfter.current = false;
    const answered = conversation.some((m) => m.role === "student");

    if (failed || !res || typeof res !== "object") {
      // Stopping anyway: what they said is kept here, without a closing line.
      if (stop) {
        if (answered) keep(conversation); else onClose?.();
        return;
      }
      setError({ message: essayErrorMessage(failed), signIn: needsSignIn(failed) });
      return;
    }
    if (res.handoff) {
      // Nothing from this talk is kept, here or on the server.
      setStopping(false);
      setMessages([]); setAnswer("");
      setView("handoff");
      return;
    }
    if (res.done) {
      const topic = asTopic(res.topic);
      if (topic) {
        onSaved?.(topic);
        finish({ message: asText(res.message), fallback: !!res.fallback, topic, lines: talkLines(conversation) });
      } else if (answered) {
        keep(conversation);   // the server closed the talk but wrote no card
      } else {
        finish({ message: asText(res.message), fallback: !!res.fallback, topic: null, lines: "" });
      }
      return;
    }
    const next = oneLine(res.message, 400);
    if (stop) {
      if (!answered) { onClose?.(); return; }
      // Asked to close and it asked again, or sent nothing usable: keep the answers ourselves.
      if (closing || !next) { keep(conversation); return; }
      // "That's enough" was pressed while this turn was out. The question it
      // brought stays unanswered, and that goes back as the stop.
      ask([...conversation, { role: "advisor", content: next }], true);
      return;
    }
    if (!next) { setError({ message: essayErrorMessage(null), signIn: false }); return; }
    setMessages([...conversation, { role: "advisor", content: next }]);
  };

  const begin = () => {
    const card = from === "card" ? topicId : null;
    if (noTurns || (from === "card" ? !card : !start)) return;
    // A card brings its own subject; the server still wants a start, so it gets the open one.
    talk.current = { start: from === "card" ? "open" : start, topicId: card };
    setView("talk");
    ask([]);
  };

  const send = () => {
    if (!clean || !waiting) return;
    const conversation = [...messages, { role: "student", content: clean }];
    setMessages(conversation); setAnswer("");
    ask(conversation);
  };

  /** "That's enough for now": end the talk and keep what was said. */
  const stop = () => {
    if (saving || keepError || stopping) return;
    if (view !== "talk") { onClose?.(); return; }
    if (busy) { stopAfter.current = true; setStopping(true); return; }   // the turn in flight lands first
    if (clean && waiting) {
      // An answer still in the box is sent first, like any other, so nothing
      // reaches a card without having been read the same way.
      stopAfter.current = true; setStopping(true);
      const conversation = [...messages, { role: "student", content: clean }];
      setMessages(conversation); setAnswer("");
      ask(conversation);
      return;
    }
    if (!answers) { onClose?.(); return; }   // nothing said: nothing to close or keep
    setStopping(true);
    if (last?.role === "advisor") {
      ask(messages, true);
    } else {
      // The last answer's turn failed: it goes once more, then the talk closes.
      stopAfter.current = true;
      ask(messages);
    }
  };

  const retryKeep = () => {
    if (pendingKeep.current) keep(pendingKeep.current);
  };

  // ── What shows ─────────────────────────────────────────────────────────────

  const startChoice = from === "card" ? !!topicId : !!start;
  const title = view === "handoff" ? "Let's pause here" : "Brainstorm with Quill";
  const small = { margin: 0, fontFamily: SANS, fontSize: "0.92rem", fontWeight: 600, color: TEXT_MUTED, lineHeight: 1.5 };
  const turnsLine = (mt = 16) => left ? (
    <p style={{ ...small, marginTop: mt, fontVariantNumeric: "tabular-nums", color: noTurns ? AMBER_TEXT : TEXT_MUTED }}>
      {noTurns ? "No brainstorm turns left." : `${left.left} of ${left.limit} brainstorm turns left.`}
    </p>
  ) : null;

  // The whole talk, oldest first: Quill's questions on the left in plain
  // cards, the student's answers on the right in a tint of their accent.
  // Quill's newest unanswered question is shown by the mascot instead.
  const shown = waiting ? messages.slice(0, -1) : messages;
  const thread = (
    <div role="log" aria-label="Your conversation with Quill" aria-live="polite" aria-relevant="additions text"
      style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
      {shown.map((m, i) => (m.role === "advisor" ? (
        <div key={i} style={{ maxWidth: "88%", alignSelf: "flex-start", background: SURFACE, border: `1px solid ${BORDER}`,
          borderRadius: "12px 12px 12px 4px", padding: "9px 12px", boxSizing: "border-box" }}>
          <p style={{ margin: 0, fontFamily: SANS, fontSize: "0.9rem", fontWeight: 800, color: TEXT_MUTED, lineHeight: 1.4 }}>
            Quill asked
          </p>
          <p style={{ margin: "2px 0 0", fontFamily: SANS, fontSize: "1rem", fontWeight: 600, color: TEXT_MID, lineHeight: 1.5,
            overflowWrap: "anywhere" }}>
            {m.content}
          </p>
        </div>
      ) : (
        <div key={i} style={{ maxWidth: "88%", alignSelf: "flex-end", background: ink.softer, border: `1px solid ${ink.soft}`,
          borderRadius: "12px 12px 4px 12px", padding: "9px 12px", boxSizing: "border-box" }}>
          <p style={{ margin: 0, fontFamily: SANS, fontSize: "0.9rem", fontWeight: 800, color: ink.onSoft, lineHeight: 1.4 }}>
            You said
          </p>
          <p style={{ margin: "2px 0 0", fontFamily: SANS, fontSize: "1rem", fontWeight: 500, color: TEXT, lineHeight: 1.55,
            overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>
            {m.content}
          </p>
        </div>
      )))}
      {(busy || waiting) && (
        <div style={{ marginTop: shown.length ? 4 : 0 }}>
          <MascotSays agent={QUILL} state={busy ? "thinking" : "idle"} size={64} layout="auto">
            {busy ? (
              <span role="status">
                {stopping ? "One moment while I finish up."
                  : asked === 0 ? "Let me think about where to begin."
                  : "Thinking about what you said."}
              </span>
            ) : (
              <span id={id("question")}>{question}</span>
            )}
          </MascotSays>
        </div>
      )}
      {error && !ended && (
        <Notice tone="error"
          action={(
            <span style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <Button kind="secondary" onClick={() => ask(messages)}>Try again</Button>
              {error.signIn && <Button kind="secondary" onClick={() => onSignIn?.()}>Sign in again</Button>}
            </span>
          )}>
          {error.message}
          {answers > 0 && " What you said is still here."}
        </Notice>
      )}
      <div ref={endRef} aria-hidden="true" style={{ height: 1 }} />
    </div>
  );

  return (
    <Sheet onClose={stop} locked={saving || !!keepError} labelledBy={id("title")} width={580}>
      <SheetHeader id={id("title")} title={title} onClose={stop} closeOff={saving || !!keepError || stopping}
        closeLabel={view === "talk" && answers > 0 ? "Close. Your answers are kept" : "Close"} />

      {view === "start" && (
        <div>
          <MascotSays agent={QUILL} state="idle" size={64} layout="auto">{QUILL_LINES.talkIntro}</MascotSays>

          {topics.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <ChoiceChips label="Start from" options={FROM} value={from} onChange={setFrom} />
            </div>
          )}

          <fieldset style={{ border: "none", margin: "14px 0 0", padding: 0, minWidth: 0 }}>
            <legend style={{ padding: 0, marginBottom: 8, fontFamily: SANS, fontSize: "1rem", fontWeight: 800, color: TEXT }}>
              {from === "card" ? "Which idea should we keep going on?" : "Where would you like to start?"}
            </legend>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {from === "card"
                ? topics.map((t, i) => (
                  <RadioRow key={t.id} name={id("card")} checked={topicId === t.id} onChange={() => setTopicId(t.id)}
                    autoFocusMark={i === 0} label={t.area || "Untitled idea"}
                    detail={t.status === "parked" ? TOPIC_STATUS.find((s) => s.key === "parked")?.label : null} />
                ))
                : TALK_STARTS.map((s, i) => (
                  <RadioRow key={s.key} name={id("start")} checked={start === s.key} onChange={() => setStart(s.key)}
                    autoFocusMark={i === 0} label={s.label} />
                ))}
            </div>
          </fieldset>

          {noTurns && (
            <Notice tone="warn" style={{ marginTop: 14 }}>
              You&apos;ve used all the brainstorm turns this demo allows. You can still add your own ideas.
            </Notice>
          )}

          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 18 }}>
            <Button kind="primary" disabled={!startChoice || noTurns} onClick={begin} style={{ flex: "1 1 180px" }}>
              Start
              <PixelArrow size={16} />
            </Button>
            <Button kind="secondary" onClick={() => onClose?.()} style={{ flex: "1 1 140px" }}>Not now</Button>
          </div>
          {turnsLine()}
        </div>
      )}

      {view === "talk" && (
        <div ref={topRef} tabIndex={-1}
          style={{ outline: "none", display: "flex", flexDirection: "column", minHeight: "min(calc(80vh - 90px), 620px)" }}>
          {!ended && (
            <p id={id("count")} style={{ ...small, fontWeight: 700, color: TEXT_MID, margin: "0 0 12px", display: "flex",
              alignItems: "center", gap: 12, fontVariantNumeric: "tabular-nums" }}>
              Question {Math.max(1, asked)} of up to {maxQuestions}
              <span aria-hidden="true" style={{ display: "inline-flex", gap: 5 }}>
                {Array.from({ length: maxQuestions }, (_, i) => (
                  <span key={i} style={{ width: i + 1 === Math.max(1, asked) ? 22 : 10, height: 10, borderRadius: 3,
                    background: i + 1 <= Math.max(1, asked) ? ink.accent : BORDER }} />
                ))}
              </span>
            </p>
          )}

          {ended && saving && (
            <p role="status" style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 0 12px", fontFamily: SANS,
              fontSize: "1rem", fontWeight: 700, color: TEXT_MID }}>
              <Spinner size={18} color={ink.text} /> Putting your answers on a card...
            </p>
          )}
          {ended && keepError && (
            <div style={{ marginBottom: 14 }}>
              <Notice tone="error">
                {keepError} Your answers are still here, below, and nothing is lost while this stays open.
              </Notice>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 14 }}>
                <Button kind="primary" onClick={retryKeep} data-autofocus style={{ flex: "1 1 180px" }}>Try again</Button>
                <Button kind="secondary" onClick={() => onClose?.()} style={{ flex: "1 1 180px" }}>
                  Close without saving
                </Button>
              </div>
            </div>
          )}

          {thread}

          {!ended && (
            <div style={{ position: "sticky", bottom: 0, zIndex: 1, marginTop: "auto", paddingTop: 12, background: WHITE }}>
              <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 12 }}>
                {waiting && (
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                        <label htmlFor={id("answer")} style={{ fontFamily: SANS, fontSize: "1rem", fontWeight: 800, color: TEXT }}>
                          Your answer
                        </label>
                        <CharCount id={id("chars")} n={answer.length} max={ANSWER_MAX} />
                      </div>
                      <textarea ref={boxRef} id={id("answer")} className={INPUT_CLASS} rows={3} value={answer}
                        maxLength={ANSWER_MAX} aria-describedby={`${id("count")} ${id("question")} ${id("chars")} ${id("hint")}`}
                        onChange={(e) => setAnswer(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
                        }}
                        placeholder="Say it however it comes out. A few sentences is plenty."
                        style={{ ...inputStyle, display: "block", marginTop: 6, minHeight: 84, maxHeight: "30vh", resize: "vertical" }} />
                    </div>
                    <Button kind="primary" disabled={!clean} onClick={send} aria-label="Send your answer"
                      style={{ minHeight: 84, padding: "10px 16px", flexShrink: 0 }}>
                      Send
                      <PixelArrow size={16} />
                    </Button>
                  </div>
                )}
                {waiting && (
                  <p id={id("hint")} style={{ ...small, marginTop: 6, fontWeight: 500 }}>
                    Enter sends. Shift and Enter starts a new line.
                  </p>
                )}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
                  marginTop: 8 }}>
                  {turnsLine(0) || <span />}
                  <Button kind="secondary" disabled={stopping} onClick={stop}>
                    {stopping ? "Finishing up..." : "That's enough for now"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {view === "done" && ending && (
        <div ref={topRef} tabIndex={-1} style={{ outline: "none" }}>
          <MascotSays agent={QUILL} state="delivering" size={72} layout="auto">
            {ending.message && <span style={{ display: "block" }}>{ending.message}</span>}
            {ending.topic && !ending.fallback && (
              <span style={{ display: "block", marginTop: ending.message ? 8 : 0 }}>{QUILL_LINES.talkDone}</span>
            )}
            {!ending.message && !ending.topic && "We can pick this up whenever you like."}
          </MascotSays>

          {ending.topic ? (
            <Card style={{ marginTop: 16, borderStyle: "solid", borderWidth: "1px 1px 1px 4px",
              borderColor: `${BORDER} ${BORDER} ${BORDER} ${ink.ring}` }}>
              <SmallLabel stamp="chat">
                {ending.topic.id === talk.current.topicId ? "Added to your idea" : "On a new idea card"}
              </SmallLabel>
              <p style={{ margin: "6px 0 0", fontFamily: SANS, fontSize: "1.15rem", fontWeight: 800, color: TEXT,
                lineHeight: 1.3, overflowWrap: "anywhere" }}>
                {ending.topic.area || "Untitled idea"}
              </p>
              {ending.lines && (
                <div role="group" aria-label="What this brainstorm added to its notes" tabIndex={0} className={FOCUS_CLASS}
                  style={{ marginTop: 10, maxHeight: 200, overflowY: "auto", whiteSpace: "pre-wrap", background: SURFACE,
                    border: `1px solid ${BORDER}`, borderRadius: RADIUS.control, padding: "10px 12px", fontFamily: SANS,
                    fontSize: "0.98rem", fontWeight: 500, color: TEXT, lineHeight: 1.6, overflowWrap: "anywhere" }}>
                  {ending.lines}
                </div>
              )}
            </Card>
          ) : (
            <p style={{ ...small, marginTop: 14, fontSize: "1rem", color: TEXT_MID }}>
              Nothing was saved, because there were no answers yet.
            </p>
          )}

          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 18 }}>
            {ending.topic ? (
              <>
                <Button kind="primary" data-autofocus onClick={() => onSeeCard?.(ending.topic.id)} style={{ flex: "1 1 180px" }}>
                  See it on my desk
                </Button>
                <Button kind="secondary" onClick={() => onStartEssay?.(ending.topic)} style={{ flex: "1 1 180px" }}>
                  Start an essay from this
                </Button>
              </>
            ) : (
              <Button kind="primary" data-autofocus onClick={() => onClose?.()}>Close</Button>
            )}
          </div>
        </div>
      )}

      {view === "handoff" && (
        // A plain panel: no mascot, no card, no further question.
        <div ref={topRef} tabIndex={-1} style={{ outline: "none" }}>
          <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: RADIUS.card, padding: "1.1rem 1.2rem",
            boxSizing: "border-box" }}>
            <p style={{ margin: 0, fontFamily: SANS, fontSize: "1.08rem", fontWeight: 600, color: TEXT, lineHeight: 1.65,
              overflowWrap: "anywhere" }}>
              {HANDOFF}
            </p>
            {/* The same two ways to reach 988 as the editor's hand-off. */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 14 }}>
              <LinkButton href="tel:988">Call 988</LinkButton>
              <LinkButton href="sms:988">Text 988</LinkButton>
            </div>
          </div>
          <QuillLine style={{ marginTop: 14 }}>{QUILL_LINES.handoffNote}</QuillLine>
          <div style={{ marginTop: 18 }}>
            <Button kind="primary" onClick={() => onClose?.()}>Close</Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
