import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { questApi, formatDay } from "../../lib/quest.js";
import Spinner from "../common/Spinner.jsx";
import { FOCUS_CLASS, RADIUS } from "../ui/tokens.js";
import { INPUT_CLASS, Tip } from "../ui/kit.jsx";
import {
  SANS, WHITE, INK, MID, MUTED, LINE,
  Chunky, DayToggles, ErrorLine, Segmented, TextButton, fieldStyle, useQuestColors,
} from "./questUi.jsx";
import { MINUTE_OPTIONS } from "./QuestPanels.jsx";

const STARTERS = ["Start a passion project", "Prep for a competition", "Start a research project"];

function Title({ children }) {
  const c = useQuestColors();
  return (
    <h1 style={{ margin: "0 0 0.5rem", fontFamily: SANS, fontWeight: 800, fontSize: "clamp(2.1rem, 5vw, 2.5rem)",
      color: c.title, letterSpacing: "-0.03em", lineHeight: 1.1, overflowWrap: "anywhere" }}>
      {children}
    </h1>
  );
}

function Lead({ children }) {
  return (
    <p style={{ margin: "0 0 24px", fontFamily: SANS, fontSize: "1.1rem", color: MUTED, lineHeight: 1.6, maxWidth: "62ch" }}>
      {children}
    </p>
  );
}

function Question({ children, hint }) {
  return (
    <div style={{ margin: "22px 0 10px" }}>
      <p style={{ margin: 0, fontFamily: SANS, fontWeight: 800, fontSize: "1.05rem", color: INK }}>{children}</p>
      {hint && <p style={{ margin: "4px 0 0", fontFamily: SANS, fontSize: "0.92rem", color: MUTED, lineHeight: 1.5 }}>{hint}</p>}
    </div>
  );
}

function Choice({ selected, onClick, children }) {
  const c = useQuestColors();
  return (
    <button type="button" onClick={onClick} aria-pressed={selected} className={FOCUS_CLASS}
      style={{ display: "block", width: "100%", textAlign: "left", cursor: "pointer", boxSizing: "border-box",
        background: selected ? c.softer : WHITE, borderRadius: RADIUS.card, padding: "16px 18px",
        border: selected ? `1.5px solid ${c.text}` : `1px solid ${LINE}` }}>
      {children}
    </button>
  );
}

// The one orchestrated moment: stones laying themselves down while the plan is drawn.
function Mapping() {
  const c = useQuestColors();
  const reduce = useReducedMotion();
  return (
    <div style={{ minHeight: "60vh", display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", textAlign: "center", padding: "32px 0" }} role="status" aria-live="polite">
      <div style={{ display: "flex", flexDirection: "column-reverse", alignItems: "center", gap: 14, marginBottom: 30 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <motion.span key={i}
            initial={reduce ? false : { scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: reduce ? 0 : i * 0.35, repeat: reduce ? 0 : Infinity, repeatDelay: 1.4, duration: 0.35 }}
            style={{ width: 46, height: 46, borderRadius: "50%", background: i === 4 ? WHITE : c.button.bg,
              border: i === 4 ? `1.5px solid ${c.text}` : "none", boxShadow: i === 4 ? `0 0 0 5px ${c.soft}` : "none",
              x: Math.round(Math.sin(i * 0.9) * 62), boxSizing: "border-box" }} />
        ))}
      </div>
      <p style={{ margin: 0, fontFamily: SANS, fontWeight: 800, fontSize: "1.5rem", color: INK }}>Mapping your quest</p>
      <p style={{ margin: "8px 0 0", fontFamily: SANS, fontSize: "1.1rem", color: MUTED, maxWidth: 420 }}>
        Breaking it into milestones sized to your pace. This takes about 20 seconds.
      </p>
    </div>
  );
}

// ─── A few questions before planning ──────────────────────────────────────────
// The advisor asks two to four quick questions, one at a time, so the plan
// points where the student wants to go. The answers become the quest's
// direction. Skippable, and never a dead end: any failure just moves them on.

const toApi = (messages) => messages.map((m) => ({ role: m.role === "advisor" ? "assistant" : "user", content: m.content }));

function Talk({ goal, title, talk, setTalk, onContinue, onBack }) {
  const c = useQuestColors();
  const [answer, setAnswer] = useState("");
  const box = useRef(null);
  const end = useRef(null);
  // Pending and error live in the parent's talk state, so leaving this step
  // mid-request and coming back shows the right thing instead of a dead end.
  const busy = !!talk.pending;

  const ask = async (messages) => {
    // A reply for a project they have since switched away from is dropped.
    const forGoal = goal;
    setTalk((t) => ({ ...t, pending: true, error: null }));
    try {
      const r = await questApi.talk({ goal, messages: toApi(messages) });
      setTalk((t) => (t.goal !== forGoal ? t : {
        ...t, pending: false, done: !!r.done,
        messages: [...messages, { role: "advisor", content: r.message }],
      }));
    } catch (e) {
      setTalk((t) => (t.goal !== forGoal ? t : {
        ...t, pending: false, error: e.message || "Could not reach your advisor. Try again, or skip and plan it.",
      }));
    }
  };

  // On opening the step: ask the first question, or pick up after an answer
  // whose reply never arrived. Once per mount: StrictMode runs this effect
  // twice in development, and each run would be a paid call.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    const last = talk.messages[talk.messages.length - 1];
    if (talk.done || talk.pending || talk.error) return;
    if (!last || last.role === "student") ask(talk.messages);
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    end.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    if (!busy && !talk.done) box.current?.focus();
  }, [talk.messages.length, busy, talk.done]);

  const send = () => {
    const text = answer.trim();
    if (!text || busy) return;
    const messages = [...talk.messages, { role: "student", content: text }];
    setTalk((t) => ({ ...t, messages }));
    setAnswer("");
    ask(messages);
  };

  const last = talk.messages[talk.messages.length - 1];
  const waiting = !talk.done && last?.role === "advisor";

  return (
    <div>
      <Title>A few quick questions</Title>
      <Lead>{title.replace(/[.!?\s]+$/, "")}. Your answers shape the plan and every day's task.</Lead>

      <div role="log" aria-live="polite" aria-label="Your advisor's questions"
        style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {talk.messages.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "advisor" ? "flex-start" : "flex-end" }}>
            <p style={{ margin: 0, maxWidth: "85%", minWidth: 0, fontFamily: SANS, fontSize: "1rem", lineHeight: 1.55, color: INK,
              padding: "11px 14px", whiteSpace: "pre-wrap", overflowWrap: "anywhere",
              ...(m.role === "advisor"
                ? { background: c.softer, border: `1px solid ${c.soft}`, borderRadius: "16px 16px 16px 4px", fontWeight: 600 }
                : { background: WHITE, border: `1px solid ${LINE}`, borderRadius: "16px 16px 4px 16px" }) }}>
              {m.content}
            </p>
          </div>
        ))}
        {busy && (
          <p role="status" style={{ display: "flex", alignItems: "center", gap: 8, margin: "2px 0 0", fontFamily: SANS,
            fontSize: "0.95rem", fontWeight: 700, color: MUTED }}>
            <Spinner size={16} color={c.text} /> Thinking...
          </p>
        )}
        <div ref={end} />
      </div>

      {waiting && (
        <div style={{ marginTop: 14 }}>
          <textarea ref={box} rows={2} value={answer} maxLength={400} aria-label="Your answer"
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="A sentence is plenty."
            className={INPUT_CLASS} style={{ ...fieldStyle, resize: "vertical" }} />
        </div>
      )}
      <ErrorLine>{talk.error}</ErrorLine>

      <div style={{ display: "flex", gap: 12, marginTop: 18, alignItems: "center", flexWrap: "wrap" }}>
        {talk.done ? (
          <Chunky onClick={onContinue}>Continue</Chunky>
        ) : talk.error && !busy ? (
          <Chunky onClick={() => ask(talk.messages)}>Try again</Chunky>
        ) : (
          <Chunky onClick={send} disabled={!waiting || busy || !answer.trim()}>Send</Chunky>
        )}
        {/* Never a dead end: both stay available while a reply is on its way. */}
        {!talk.done && <TextButton onClick={onContinue} color={MUTED}>Skip, just plan it</TextButton>}
        <TextButton onClick={onBack} color={MUTED}>Back</TextButton>
      </div>
    </div>
  );
}

// ─── Pick, then pace ──────────────────────────────────────────────────────────

export function QuestSetup({ onPlanned, onCancel, canCancel }) {
  const c = useQuestColors();
  const [step, setStep] = useState("pick");
  const [ideas, setIdeas] = useState(null);
  const [left, setLeft] = useState(null);
  const [ideasBusy, setIdeasBusy] = useState(false);
  const [pick, setPick] = useState(null);           // index of a suggestion, or "own"
  const [own, setOwn] = useState("");
  const [minutes, setMinutes] = useState(30);
  const [rest, setRest] = useState([]);
  const [hasDeadline, setHasDeadline] = useState(false);
  const [deadline, setDeadline] = useState("");
  const [addToPortfolio, setAddToPortfolio] = useState(true);
  const [error, setError] = useState(null);
  // The talk before planning, kept here so Back from the pace step returns to it.
  const [talk, setTalk] = useState({ goal: null, messages: [], done: false, pending: false, error: null });

  const loadIdeas = async (refresh = false) => {
    setIdeasBusy(true); setError(null);
    try {
      const r = await questApi.suggestions(refresh);
      setIdeas(r.suggestions || []);
      setLeft(r.refreshes_left);
      if (refresh) setPick(null);
    } catch (e) {
      if (!ideas) setIdeas([]);
      setError(e.message);
    } finally {
      setIdeasBusy(false);
    }
  };

  useEffect(() => { loadIdeas(false); }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const chosen = pick === "own" ? null : ideas?.[pick];
  const goal = pick === "own" ? own.trim() : chosen ? `${chosen.title}. ${chosen.why}` : "";
  const canContinue = pick === "own" ? own.trim().length >= 3 : chosen != null;

  const plan = async () => {
    setStep("mapping"); setError(null);
    try {
      const state = await questApi.plan({
        goal, daily_minutes: minutes, rest_days: rest,
        hard_deadline: hasDeadline && deadline ? deadline : null,
        add_to_portfolio: addToPortfolio, from_suggestion: pick !== "own",
        // Only a conversation they took part in: a lone unanswered question tells the planner nothing.
        conversation: talk.goal === goal && talk.messages.some((m) => m.role === "student") ? toApi(talk.messages) : [],
      });
      onPlanned(state);
    } catch (e) {
      setError(e.message);
      setStep("pace");
    }
  };

  if (step === "mapping") return <Mapping />;

  if (step === "talk") {
    return (
      <Talk goal={goal} title={chosen ? chosen.title : own.trim()} talk={talk} setTalk={setTalk}
        onContinue={() => setStep("pace")} onBack={() => setStep("pick")} />
    );
  }

  if (step === "pace") {
    return (
      <div>
        <Title>Set your pace</Title>
        <Lead>
          {chosen ? chosen.title : own.trim()}
        </Lead>
        <Question hint="Every task is sized to fit. Less time makes the quest longer, not harder.">
          How much time a day?
        </Question>
        <Segmented options={MINUTE_OPTIONS} value={minutes} onChange={setMinutes} label="Time a day" />
        <Question hint="Tap the days you will not work on it. Rest days never break your streak.">
          Any rest days?
        </Question>
        <DayToggles value={rest} onChange={setRest} />
        <div style={{ marginTop: 20 }}>
          {!hasDeadline ? (
            <TextButton onClick={() => setHasDeadline(true)} style={{ paddingLeft: 0 }}>
              Add a fixed deadline, like a competition date
            </TextButton>
          ) : (
            <>
              <Question hint="The plan will be sized to finish before it.">Fixed deadline</Question>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)}
                  aria-label="Fixed deadline" className={INPUT_CLASS} style={{ ...fieldStyle, width: "auto" }} />
                <TextButton onClick={() => { setHasDeadline(false); setDeadline(""); }} color={MUTED}>Remove</TextButton>
              </div>
            </>
          )}
        </div>
        <label style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 20, cursor: "pointer",
          fontFamily: SANS, fontSize: "0.98rem", color: INK }}>
          <input type="checkbox" checked={addToPortfolio} onChange={(e) => setAddToPortfolio(e.target.checked)}
            className={FOCUS_CLASS} style={{ width: 20, height: 20, accentColor: c.button.bg }} />
          Offer to add it to my activities when I finish
        </label>
        <ErrorLine>{error}</ErrorLine>
        <div style={{ display: "flex", gap: 12, marginTop: 26, alignItems: "center" }}>
          <Chunky onClick={plan} disabled={hasDeadline && !deadline}>Map my quest</Chunky>
          <TextButton onClick={() => setStep("talk")} color={MUTED}>Back</TextButton>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Title>Pick your quest</Title>
      <Lead>
        One project moved forward a little every day. These suggestions come from what we know about you, or you
        can write your own.
      </Lead>

      {ideas === null ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "20px 0" }}>
          <Spinner size={20} color={c.text} />
          <span style={{ fontFamily: SANS, fontWeight: 700, color: MID }}>Finding ideas that fit you...</span>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {ideas.map((s, i) => (
            <Choice key={`${s.title}-${i}`} selected={pick === i} onClick={() => setPick(i)}>
              <span style={{ display: "block", fontFamily: SANS, fontWeight: 800, fontSize: "1.05rem", color: INK, lineHeight: 1.35 }}>
                {s.title}
              </span>
              <span style={{ display: "block", fontFamily: SANS, fontSize: "0.95rem", color: MID, lineHeight: 1.5, marginTop: 4 }}>
                {s.why}
              </span>
              <span style={{ display: "block", fontFamily: SANS, fontSize: "0.92rem", fontWeight: 700, color: MUTED, marginTop: 8 }}>
                About {s.weeks} weeks
              </span>
            </Choice>
          ))}
          <div style={{ background: pick === "own" ? c.softer : WHITE, borderRadius: RADIUS.card,
            border: pick === "own" ? `1.5px solid ${c.text}` : `1px solid ${LINE}` }}>
            <button type="button" onClick={() => setPick("own")} aria-pressed={pick === "own"} className={FOCUS_CLASS}
              style={{ display: "block", width: "100%", textAlign: "left", cursor: "pointer", background: "none",
                borderRadius: RADIUS.card,
                border: "none", padding: "16px 18px", fontFamily: SANS, fontWeight: 800, fontSize: "1.05rem", color: INK }}>
              Write your own
            </button>
            {pick === "own" && (
              <div style={{ padding: "0 18px 16px" }}>
                <textarea autoFocus rows={3} value={own} maxLength={600} onChange={(e) => setOwn(e.target.value)}
                  placeholder="What do you want to build, prepare for or investigate?"
                  aria-label="Your quest"
                  className={INPUT_CLASS} style={{ ...fieldStyle, resize: "vertical" }} />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                  {STARTERS.map((s) => (
                    <button key={s} type="button" onClick={() => setOwn(s + ": ")} className={FOCUS_CLASS}
                      style={{ fontFamily: SANS, fontSize: "0.92rem", fontWeight: 700, color: c.text, cursor: "pointer",
                        background: WHITE, border: `1.5px solid ${LINE}`, borderRadius: RADIUS.pill, padding: "6px 13px",
                        minHeight: 40 }}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {ideas && ideas.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <TextButton onClick={() => loadIdeas(true)} disabled={ideasBusy || left === 0} style={{ paddingLeft: 0 }}>
            {ideasBusy ? "Finding new ideas..." : left === 0 ? "No new ideas left" : `New ideas${left != null ? ` (${left} left)` : ""}`}
          </TextButton>
        </div>
      )}

      <ErrorLine>{error}</ErrorLine>
      <div style={{ display: "flex", gap: 12, marginTop: 22, alignItems: "center" }}>
        <Chunky disabled={!canContinue} onClick={() => {
          // A different project starts a fresh conversation; the same one picks it back up.
          if (talk.goal !== goal) setTalk({ goal, messages: [], done: false, pending: false, error: null });
          setStep("talk");
        }}>Continue</Chunky>
        {canCancel && <TextButton onClick={onCancel} color={MUTED}>Cancel</TextButton>}
      </div>
    </div>
  );
}

// ─── Review the drafted plan ──────────────────────────────────────────────────

export function DraftReview({ state, onStart, onDiscard, busy, error }) {
  const c = useQuestColors();
  const q = state.quest;
  const rest = q.rest_days?.length
    ? ` Rest days: ${q.rest_days.map((d) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d]).join(", ")}.`
    : "";
  return (
    <div>
      <Title>{q.title}</Title>
      {q.summary && <Lead>{q.summary}</Lead>}
      {q.direction && (
        <div style={{ background: c.softer, border: `1px solid ${c.soft}`, borderRadius: RADIUS.control,
          padding: "12px 15px", margin: "0 0 18px", maxWidth: 640 }}>
          <p style={{ margin: 0, fontFamily: SANS, fontWeight: 800, fontSize: "0.95rem", color: INK }}>Where this is headed</p>
          <p style={{ margin: "4px 0 0", fontFamily: SANS, fontSize: "1rem", color: INK, lineHeight: 1.55 }}>{q.direction}</p>
        </div>
      )}
      <p style={{ margin: "0 0 18px", fontFamily: SANS, fontSize: "0.98rem", color: MID, lineHeight: 1.6 }}>
        {state.draft.total_days} days at {q.daily_minutes} minutes a day. Start today and you finish around{" "}
        <strong style={{ color: INK }}>{formatDay(state.draft.finish_if_started_today)}</strong>.{rest}
        {q.hard_deadline && <> Your deadline is {formatDay(q.hard_deadline)}.</>}
      </p>
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        {state.milestones.map((m) => (
          <li key={m.id} style={{ display: "flex", gap: 14, alignItems: "flex-start", background: WHITE,
            borderRadius: RADIUS.card, padding: "14px 16px", border: `1px solid ${LINE}` }}>
            <span style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, display: "flex", alignItems: "center",
              justifyContent: "center", background: c.softer, border: `1px solid ${c.soft}`, color: c.onSoft,
              fontFamily: SANS, fontWeight: 800, boxSizing: "border-box" }}>
              {m.position}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontFamily: SANS, fontWeight: 800, fontSize: "1rem", color: INK, lineHeight: 1.35 }}>
                {m.title}
              </span>
              {m.description && (
                <span style={{ display: "block", fontFamily: SANS, fontSize: "0.93rem", color: MID, lineHeight: 1.5, marginTop: 3 }}>
                  {m.description}
                </span>
              )}
            </span>
            <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: "0.9rem", color: MUTED, whiteSpace: "nowrap" }}>
              {m.expected_days} day{m.expected_days === 1 ? "" : "s"}
            </span>
          </li>
        ))}
      </ol>
      <ErrorLine>{error}</ErrorLine>
      <div style={{ display: "flex", gap: 12, marginTop: 24, alignItems: "center", flexWrap: "wrap" }}>
        <Chunky onClick={onStart} disabled={busy}>{busy ? "Starting..." : "Start quest"}</Chunky>
        <TextButton onClick={onDiscard} color={MUTED} disabled={busy}>Pick something else</TextButton>
      </div>
      <Tip name="Tip" stamp="chat" tone="default" style={{ marginTop: 14 }}>
        Your advisor can reshape milestones later if the plan stops fitting.
      </Tip>
    </div>
  );
}
