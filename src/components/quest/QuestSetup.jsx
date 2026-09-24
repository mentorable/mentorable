import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { questApi, formatDay } from "../../lib/quest.js";
import Spinner from "../common/Spinner.jsx";
import {
  SANS, WHITE, INK, MID, MUTED, FAINT, LINE,
  Chunky, DayToggles, ErrorLine, Segmented, TextButton, fieldStyle, useQuestColors,
} from "./questUi.jsx";
import { MINUTE_OPTIONS } from "./QuestPanels.jsx";

const STARTERS = ["Start a passion project", "Prep for a competition", "Start a research project"];

function Title({ children }) {
  const c = useQuestColors();
  return (
    <h1 style={{ margin: "0 0 8px", fontFamily: SANS, fontWeight: 800, fontSize: "2rem", color: c.accent,
      letterSpacing: "-0.02em", lineHeight: 1.15 }}>
      {children}
    </h1>
  );
}

function Lead({ children }) {
  return (
    <p style={{ margin: "0 0 22px", fontFamily: SANS, fontSize: "1.05rem", color: MID, lineHeight: 1.6, maxWidth: 520 }}>
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
    <button type="button" onClick={onClick} aria-pressed={selected}
      style={{ display: "block", width: "100%", textAlign: "left", cursor: "pointer", boxSizing: "border-box",
        background: selected ? c.wash : WHITE, borderRadius: 18, padding: "16px 18px",
        border: `2px solid ${selected ? c.accent : LINE}`, boxShadow: `0 4px 0 ${selected ? c.edge : LINE}` }}>
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
            style={{ width: 46, height: 46, borderRadius: "50%", background: i === 4 ? WHITE : c.accent,
              border: i === 4 ? `4px solid ${c.accent}` : "none", boxShadow: `0 4px 0 ${c.edge}`,
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
      });
      onPlanned(state);
    } catch (e) {
      setError(e.message);
      setStep("pace");
    }
  };

  if (step === "mapping") return <Mapping />;

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
                  aria-label="Fixed deadline" style={{ ...fieldStyle, width: "auto" }} />
                <TextButton onClick={() => { setHasDeadline(false); setDeadline(""); }} color={MUTED}>Remove</TextButton>
              </div>
            </>
          )}
        </div>
        <label style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 20, cursor: "pointer",
          fontFamily: SANS, fontSize: "0.98rem", color: INK }}>
          <input type="checkbox" checked={addToPortfolio} onChange={(e) => setAddToPortfolio(e.target.checked)}
            style={{ width: 18, height: 18, accentColor: c.accent }} />
          Offer to add it to my activities when I finish
        </label>
        <ErrorLine>{error}</ErrorLine>
        <div style={{ display: "flex", gap: 12, marginTop: 26, alignItems: "center" }}>
          <Chunky onClick={plan} disabled={hasDeadline && !deadline}>Map my quest</Chunky>
          <TextButton onClick={() => setStep("pick")} color={MUTED}>Back</TextButton>
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
          <Spinner size={20} color={c.accent} />
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
              <span style={{ display: "block", fontFamily: SANS, fontSize: "0.85rem", fontWeight: 700, color: FAINT, marginTop: 8 }}>
                About {s.weeks} weeks
              </span>
            </Choice>
          ))}
          <div style={{ background: pick === "own" ? c.wash : WHITE, borderRadius: 18,
            border: `2px solid ${pick === "own" ? c.accent : LINE}`, boxShadow: `0 4px 0 ${pick === "own" ? c.edge : LINE}` }}>
            <button type="button" onClick={() => setPick("own")} aria-pressed={pick === "own"}
              style={{ display: "block", width: "100%", textAlign: "left", cursor: "pointer", background: "none",
                border: "none", padding: "16px 18px", fontFamily: SANS, fontWeight: 800, fontSize: "1.05rem", color: INK }}>
              Write your own
            </button>
            {pick === "own" && (
              <div style={{ padding: "0 18px 16px" }}>
                <textarea autoFocus rows={3} value={own} maxLength={600} onChange={(e) => setOwn(e.target.value)}
                  placeholder="What do you want to build, prepare for or investigate?"
                  aria-label="Your quest"
                  style={{ ...fieldStyle, resize: "vertical" }} />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                  {STARTERS.map((s) => (
                    <button key={s} type="button" onClick={() => setOwn(s + ": ")}
                      style={{ fontFamily: SANS, fontSize: "0.85rem", fontWeight: 700, color: c.accent, cursor: "pointer",
                        background: WHITE, border: `2px solid ${LINE}`, borderRadius: 99, padding: "5px 11px" }}>
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
            {ideasBusy ? "Finding new ideas..." : left === 0 ? "No new ideas left this month" : `New ideas${left != null ? ` (${left} left this month)` : ""}`}
          </TextButton>
        </div>
      )}

      <ErrorLine>{error}</ErrorLine>
      <div style={{ display: "flex", gap: 12, marginTop: 22, alignItems: "center" }}>
        <Chunky onClick={() => setStep("pace")} disabled={!canContinue}>Continue</Chunky>
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
      <p style={{ margin: "0 0 18px", fontFamily: SANS, fontSize: "0.98rem", color: MID, lineHeight: 1.6 }}>
        {state.draft.total_days} days at {q.daily_minutes} minutes a day. Start today and you finish around{" "}
        <strong style={{ color: INK }}>{formatDay(state.draft.finish_if_started_today)}</strong>.{rest}
        {q.hard_deadline && <> Your deadline is {formatDay(q.hard_deadline)}.</>}
      </p>
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        {state.milestones.map((m) => (
          <li key={m.id} style={{ display: "flex", gap: 14, alignItems: "flex-start", background: WHITE,
            borderRadius: 16, padding: "14px 16px", border: `2px solid ${LINE}` }}>
            <span style={{ width: 32, height: 32, borderRadius: 10, flexShrink: 0, display: "flex", alignItems: "center",
              justifyContent: "center", background: c.wash, color: c.accent, fontFamily: SANS, fontWeight: 800 }}>
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
            <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: "0.88rem", color: FAINT, whiteSpace: "nowrap" }}>
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
      <p style={{ margin: "14px 0 0", fontFamily: SANS, fontSize: "0.88rem", color: c.accent, lineHeight: 1.5 }}>
        Your advisor can reshape milestones later if the plan stops fitting.
      </p>
    </div>
  );
}
