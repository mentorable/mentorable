import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { questApi, formatDay } from "../../lib/quest.js";
import Spinner from "../common/Spinner.jsx";
import { BORDER, FOCUS_CLASS, RADIUS, TEXT_MID } from "../ui/tokens.js";
import { Button, Card, ChoiceChips, Heading, INPUT_CLASS, PageHeader, SR_ONLY, StampTile, Tip, inputStyle } from "../ui/kit.jsx";
import { Glyph } from "../ui/Icons.jsx";
import { darken } from "../../lib/theme.js";
import { useIsMobile } from "../../hooks/useIsMobile.js";
import {
  SANS, WHITE, INK, MID, MUTED, LINE,
  Chunky, DayToggles, ErrorLine, useQuestColors,
} from "./questUi.jsx";
import { QuestStone } from "./QuestStone.jsx";
import { MINUTE_OPTIONS } from "./QuestPanels.jsx";

const STARTERS = ["Start a passion project", "Prep for a competition", "Start a research project"];

// Each kind of quest gets the mark its card is known by.
const KIND_STAMP = { passion_project: "rocket", competition_prep: "trophy", research: "notebook" };

function Question({ children, hint, id }) {
  return (
    <div style={{ margin: "24px 0 10px" }}>
      <Heading level={3} id={id}>{children}</Heading>
      {hint && <p style={{ margin: "4px 0 0", fontFamily: SANS, fontSize: "0.95rem", color: MUTED, lineHeight: 1.5 }}>{hint}</p>}
    </div>
  );
}

/** A pickable card: a mark, the content, and a check once chosen.
 *  `bare`: the card's frame is drawn by a wrapper (Write your own, which
 *  opens a text box under it). */
function Choice({ selected, onClick, stamp, bare, children }) {
  const c = useQuestColors();
  return (
    <button type="button" onClick={onClick} aria-pressed={selected} className={FOCUS_CLASS}
      style={{ display: "flex", alignItems: "flex-start", gap: 14, width: "100%", textAlign: "left", cursor: "pointer",
        boxSizing: "border-box", borderRadius: RADIUS.card, padding: "16px 18px",
        ...(bare ? { background: "none", border: "none" }
          : { background: selected ? c.softer : WHITE, border: `1px solid ${selected ? c.text : LINE}` }) }}>
      <StampTile kind={stamp} />
      <span style={{ flex: 1, minWidth: 0 }}>{children}</span>
      <span aria-hidden="true" style={{ flexShrink: 0, width: 24, height: 24, marginTop: 8, color: c.text,
        visibility: selected ? "visible" : "hidden" }}>
        <Glyph kind="check" size={24} />
      </span>
    </button>
  );
}

// The one orchestrated moment: the map's own stones laying themselves down,
// done days first and today's ringed stone last, while the plan is drawn.
function Mapping({ isMobile }) {
  const c = useQuestColors();
  const reduce = useReducedMotion();
  const done = { fill: c.accent, edge: darken(c.accent, 0.28), ink: WHITE, picture: "sparkle" };
  const today = { fill: WHITE, edge: darken(c.accent, 0.28), ink: c.accent, picture: "star", ring: "solid", ringColor: c.accent };
  return (
    <div role="status" aria-live="polite">
      {/* The same page frame as the steps before and after it, so the screen
          does not re-lay out while the plan is drawn. */}
      <PageHeader title="Mapping your quest" isMobile={isMobile}>
        Breaking it into milestones sized to your pace. This takes about 20 seconds.
      </PageHeader>
      <div aria-hidden="true" style={{ display: "flex", flexDirection: "column-reverse", alignItems: "center", gap: 10, padding: "16px 0 32px" }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <motion.span key={i}
            initial={reduce ? false : { scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: reduce ? 0 : i * 0.35, repeat: reduce ? 0 : Infinity, repeatDelay: 1.4, duration: 0.35 }}
            style={{ display: "block", x: Math.round(Math.sin(i * 0.9) * 62) }}>
            <QuestStone size={i === 4 ? 64 : 48} {...(i === 4 ? today : done)} />
          </motion.span>
        ))}
      </div>
    </div>
  );
}

// ─── A few questions before planning ──────────────────────────────────────────
// The advisor asks two to four quick questions, one at a time, so the plan
// points where the student wants to go. The answers become the quest's
// direction. Skippable, and never a dead end: any failure just moves them on.

const toApi = (messages) => messages.map((m) => ({ role: m.role === "advisor" ? "assistant" : "user", content: m.content }));

function Talk({ goal, title, talk, setTalk, onContinue, onBack, isMobile }) {
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
      <PageHeader title="A few quick questions" isMobile={isMobile}>
        {title.replace(/[.!?\s]+$/, "")}. Your answers shape the plan and every day's task.
      </PageHeader>

      <div role="log" aria-live="polite" aria-label="Your advisor's questions"
        style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {talk.messages.map((m, i) => (m.role === "advisor" ? (
          <Tip key={i} stamp="chat" name="Your advisor" style={{ whiteSpace: "pre-wrap" }}>{m.content}</Tip>
        ) : (
          <div key={i} style={{ display: "flex", justifyContent: "flex-end" }}>
            <Card style={{ maxWidth: "85%", padding: "11px 14px", fontFamily: SANS, fontSize: "1rem", fontWeight: 500,
              lineHeight: 1.55, color: INK, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              <span style={SR_ONLY}>You: </span>
              {m.content}
            </Card>
          </div>
        )))}
        {busy && (
          <div role="status">
            <Tip stamp="chat" tone="default">
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <Spinner size={16} color={c.text} /> Thinking...
              </span>
            </Tip>
          </div>
        )}
        <div ref={end} />
      </div>

      {waiting && (
        <div style={{ marginTop: 14 }}>
          <textarea ref={box} rows={2} value={answer} maxLength={400} aria-label="Your answer"
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="A sentence is plenty."
            className={INPUT_CLASS} style={{ ...inputStyle, resize: "vertical" }} />
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
        {!talk.done && <Button kind="quiet" onClick={onContinue}>Skip, just plan it</Button>}
        <Button kind="quiet" onClick={onBack}>Back</Button>
      </div>
    </div>
  );
}

// ─── Pick, then pace ──────────────────────────────────────────────────────────

export function QuestSetup({ onPlanned, onCancel, canCancel, today }) {
  const c = useQuestColors();
  const isMobile = useIsMobile();
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
  // Calendar dates as the server gives them (YYYY-MM-DD), so they compare as text.
  const pastDeadline = hasDeadline && !!deadline && !!today && deadline < today;
  const ownBox = useRef(null);

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

  if (step === "mapping") return <Mapping isMobile={isMobile} />;

  if (step === "talk") {
    return (
      <Talk goal={goal} title={chosen ? chosen.title : own.trim()} talk={talk} setTalk={setTalk} isMobile={isMobile}
        onContinue={() => setStep("pace")} onBack={() => setStep("pick")} />
    );
  }

  if (step === "pace") {
    return (
      <div>
        <PageHeader title="Set your pace" isMobile={isMobile}>
          {chosen ? chosen.title : own.trim()}
        </PageHeader>
        <Card style={{ padding: "1.3rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <StampTile kind="clock" />
          <Heading>Your pace</Heading>
        </div>
        <Question id="quest-pace-minutes" hint="Every task is sized to fit. Less time makes the quest longer, not harder.">
          How much time a day?
        </Question>
        <ChoiceChips label="Time a day" hideLabel options={MINUTE_OPTIONS} value={minutes} onChange={setMinutes} isMobile={isMobile} />
        <Question id="quest-pace-rest" hint="Tap the days you will not work on it. Rest days never break your streak.">
          Any rest days?
        </Question>
        <div role="group" aria-labelledby="quest-pace-rest"><DayToggles value={rest} onChange={setRest} /></div>
        <div style={{ marginTop: 20 }}>
          {!hasDeadline ? (
            <Button kind="quiet" onClick={() => setHasDeadline(true)} style={{ marginLeft: -18, textAlign: "left", justifyContent: "flex-start" }}>
              Add a fixed deadline, like a competition date
            </Button>
          ) : (
            <>
              <Question hint="The plan will be sized to finish before it.">Fixed deadline</Question>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input type="date" value={deadline} min={today || undefined} onChange={(e) => setDeadline(e.target.value)}
                  aria-label="Fixed deadline" aria-invalid={pastDeadline || undefined}
                  className={INPUT_CLASS} style={{ ...inputStyle, width: "auto" }} />
                <Button kind="quiet" onClick={() => { setHasDeadline(false); setDeadline(""); }}>Remove</Button>
              </div>
              {pastDeadline && <ErrorLine>That date has passed. Pick today or a later date.</ErrorLine>}
            </>
          )}
        </div>
        <label style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 20, cursor: "pointer",
          fontFamily: SANS, fontSize: "1rem", fontWeight: 600, color: INK }}>
          <input type="checkbox" checked={addToPortfolio} onChange={(e) => setAddToPortfolio(e.target.checked)}
            className={FOCUS_CLASS} style={{ width: 20, height: 20, accentColor: c.button.bg }} />
          Offer to add it to my activities when I finish
        </label>
        </Card>
        <ErrorLine>{error}</ErrorLine>
        <div style={{ display: "flex", gap: 12, marginTop: 22, alignItems: "center" }}>
          <Chunky onClick={plan} disabled={(hasDeadline && !deadline) || pastDeadline}>Map my quest</Chunky>
          <Button kind="quiet" onClick={() => setStep("talk")}>Back</Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Pick your quest" isMobile={isMobile}>
        One project, moved forward a little every day.
      </PageHeader>

      {ideas === null ? (
        <div role="status">
          <Tip stamp="sparkle" tone="default">
            <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
              <Spinner size={18} color={c.text} /> Finding ideas that fit you...
            </span>
          </Tip>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {ideas.map((s, i) => (
            <Choice key={`${s.title}-${i}`} selected={pick === i} onClick={() => setPick(i)}
              stamp={KIND_STAMP[s.goal_kind] || "star"}>
              <span style={{ display: "block", fontFamily: SANS, fontWeight: 800, fontSize: "1.1rem", color: INK, lineHeight: 1.35 }}>
                {s.title}
              </span>
              <span style={{ display: "block", fontFamily: SANS, fontSize: "1rem", fontWeight: 500, color: MID, lineHeight: 1.5, marginTop: 4 }}>
                {s.why}
              </span>
              <span style={{ display: "block", fontFamily: SANS, fontSize: "0.9rem", fontWeight: 700, color: MUTED, marginTop: 8 }}>
                About {s.weeks} weeks
              </span>
            </Choice>
          ))}
          <div style={{ background: pick === "own" ? c.softer : WHITE, borderRadius: RADIUS.card,
            border: `1px solid ${pick === "own" ? c.text : LINE}` }}>
            <Choice bare selected={pick === "own"} onClick={() => setPick("own")} stamp="scroll">
              <span style={{ display: "block", fontFamily: SANS, fontWeight: 800, fontSize: "1.1rem", color: INK, lineHeight: 1.35, marginTop: 9 }}>
                Write your own
              </span>
            </Choice>
            {pick === "own" && (
              <div style={{ padding: "0 18px 16px" }}>
                <textarea ref={ownBox} autoFocus rows={3} value={own} maxLength={600} onChange={(e) => setOwn(e.target.value)}
                  placeholder="What do you want to build, prepare for or investigate?"
                  aria-label="Your quest"
                  className={INPUT_CLASS} style={{ ...inputStyle, resize: "vertical" }} />
                {/* Starters only while the box is empty, so one never overwrites
                    what the student wrote. Picking one hands focus to the box. */}
                {!own.trim() && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                  {STARTERS.map((s) => (
                    <button key={s} type="button" className={FOCUS_CLASS}
                      onClick={() => { setOwn(s + ": "); requestAnimationFrame(() => {
                        const el = ownBox.current;
                        if (!el) return;
                        el.focus();
                        el.setSelectionRange(el.value.length, el.value.length);
                      }); }}
                      style={{ fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700, color: TEXT_MID, cursor: "pointer",
                        background: WHITE, border: `1.5px solid ${BORDER}`, borderRadius: RADIUS.pill, padding: "0 14px",
                        minHeight: 44, lineHeight: 1.2, boxSizing: "border-box" }}>
                      {s}
                    </button>
                  ))}
                </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {ideas && ideas.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <Button kind="quiet" onClick={() => loadIdeas(true)} disabled={ideasBusy || left === 0} style={{ marginLeft: -18, textAlign: "left", justifyContent: "flex-start" }}>
            {ideasBusy ? "Finding new ideas..." : left === 0 ? "No new ideas left" : (
              <>
                New ideas
                {left != null && (
                  <span style={{ fontWeight: 600, color: MUTED, fontVariantNumeric: "tabular-nums" }}>
                    <span style={SR_ONLY}>, </span>{left} left
                  </span>
                )}
              </>
            )}
          </Button>
        </div>
      )}

      <ErrorLine>{error}</ErrorLine>
      <div style={{ display: "flex", gap: 12, marginTop: 22, alignItems: "center" }}>
        <Chunky disabled={!canContinue} onClick={() => {
          // A different project starts a fresh conversation; the same one picks it back up.
          if (talk.goal !== goal) setTalk({ goal, messages: [], done: false, pending: false, error: null });
          setStep("talk");
        }}>Continue</Chunky>
        {canCancel && <Button kind="quiet" onClick={onCancel}>Cancel</Button>}
      </div>
    </div>
  );
}

// ─── Review the drafted plan ──────────────────────────────────────────────────

export function DraftReview({ state, onStart, onDiscard, busy, error }) {
  const isMobile = useIsMobile();
  const q = state.quest;
  const rest = q.rest_days?.length
    ? ` Rest days: ${q.rest_days.map((d) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d]).join(", ")}.`
    : "";
  return (
    <div>
      <PageHeader title={q.title} isMobile={isMobile} style={{ overflowWrap: "anywhere" }}>
        {q.summary || null}
      </PageHeader>
      {/* The house list pattern (Portfolio's sections, College List's
          groups): a mark, the heading and its count, one line of
          guidance, then the item cards. */}
      <section aria-labelledby="quest-draft-milestones">
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <StampTile kind="flag" />
          <Heading id="quest-draft-milestones">
            Milestones
            <span style={{ fontWeight: 700, fontSize: "1rem", color: MUTED, marginLeft: 8, fontVariantNumeric: "tabular-nums" }}>
              {state.milestones.length}
            </span>
          </Heading>
        </div>
        <p style={{ margin: "0 0 16px", fontFamily: SANS, fontSize: "1rem", fontWeight: 500, color: MUTED, lineHeight: 1.55, maxWidth: "62ch" }}>
          {state.draft.total_days} days at {q.daily_minutes} minutes a day. Start today and you finish around{" "}
          <strong style={{ fontWeight: 700, color: INK }}>{formatDay(state.draft.finish_if_started_today)}</strong>.{rest}
          {q.hard_deadline && <> Your deadline is {formatDay(q.hard_deadline)}.</>}
          {" "}Your advisor can reshape milestones later if the plan stops fitting.
        </p>
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        {state.milestones.map((m) => (
          <Card as="li" key={m.id}>
            <div style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontFamily: SANS, fontWeight: 700, fontSize: "0.9rem", color: MUTED }}>
                Milestone {m.position} · {m.expected_days} day{m.expected_days === 1 ? "" : "s"}
              </span>
              <Heading level={3} style={{ marginTop: 2 }}>{m.title}</Heading>
              {m.description && (
                <span style={{ display: "block", fontFamily: SANS, fontSize: "1rem", fontWeight: 500, color: MID, lineHeight: 1.5, marginTop: 3 }}>
                  {m.description}
                </span>
              )}
            </div>
          </Card>
        ))}
      </ol>
      </section>
      <ErrorLine>{error}</ErrorLine>
      <div style={{ display: "flex", gap: 12, marginTop: 24, alignItems: "center", flexWrap: "wrap" }}>
        <Chunky onClick={onStart} disabled={busy}>{busy ? "Starting..." : "Start quest"}</Chunky>
        <Button kind="quiet" onClick={onDiscard} disabled={busy} style={{ paddingLeft: 12, paddingRight: 12 }}>Discard and pick again</Button>
      </div>
      {/* The cost before the tap, not only in the confirm dialog. */}
      <p style={{ margin: "8px 0 0", fontFamily: SANS, fontSize: "0.9rem", fontWeight: 600, color: MUTED, lineHeight: 1.5, maxWidth: "62ch" }}>
        Picking again maps a new plan, which uses another of this month's plans.
      </p>
    </div>
  );
}
