import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { formatDay } from "../../lib/quest.js";
import Spinner from "../common/Spinner.jsx";
import {
  SANS, WHITE, INK, MID, MUTED, FAINT, LINE, AMBER,
  Chunky, ErrorLine, FLAME_GROWS_AT, Flame, GrowingFlame, Sheet, TextButton, fieldStyle, useQuestColors,
} from "./questUi.jsx";

function useCountUp(target, run) {
  const reduce = useReducedMotion();
  const [value, setValue] = useState(run && !reduce ? 0 : target);
  useEffect(() => {
    if (!run || reduce) { setValue(target); return; }
    let raf, start;
    const tick = (t) => {
      start ??= t;
      const p = Math.min(1, (t - start) / 700);
      setValue(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, run, reduce]);
  return value;
}

function Label({ children, color }) {
  return (
    <p style={{ margin: 0, fontFamily: SANS, fontSize: "0.86rem", fontWeight: 800, color }}>{children}</p>
  );
}

function Bubble({ children }) {
  const c = useQuestColors();
  return (
    <div style={{ background: c.wash, borderRadius: "16px 16px 16px 4px", padding: "12px 14px",
      fontFamily: SANS, fontSize: "1rem", color: INK, lineHeight: 1.55 }}>
      {children}
    </div>
  );
}

function TheirWords({ children }) {
  return (
    <div style={{ borderLeft: `3px solid ${LINE}`, padding: "2px 0 2px 12px", fontFamily: SANS,
      fontSize: "0.98rem", color: MID, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
      {children}
    </div>
  );
}

function Reward({ result, streak }) {
  const c = useQuestColors();
  const xp = useCountUp(result.xp_gained, true);
  const leveled = result.level_after > result.level_before;
  const grew = result.on_time && streak === FLAME_GROWS_AT;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, margin: "4px 0 16px" }}>
      <motion.span
        initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 420, damping: 18 }}
        style={{ fontFamily: SANS, fontWeight: 800, fontSize: "1.1rem", color: WHITE, background: c.accent,
          borderRadius: 12, padding: "6px 12px", boxShadow: `0 3px 0 ${c.edge}`, fontVariantNumeric: "tabular-nums" }}>
        +{xp} XP
      </motion.span>
      {result.on_time ? (
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: SANS, fontWeight: 800, fontSize: "1rem", color: INK }}>
          {grew ? <GrowingFlame size={22} streak={streak} /> : <Flame size={22} animate streak={streak} />} {streak} day streak
        </span>
      ) : (
        <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: "0.95rem", color: MUTED }}>
          Caught up. One less to catch up on.
        </span>
      )}
      {leveled && (
        <motion.span
          initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: [0.4, 1.2, 1], opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.25 }}
          style={{ fontFamily: SANS, fontWeight: 800, fontSize: "0.95rem", color: c.accent,
            border: `2px solid ${c.accent}`, borderRadius: 10, padding: "4px 10px" }}>
          Level {result.level_after}
        </motion.span>
      )}
      {grew && (
        <motion.p initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9, duration: 0.3 }}
          style={{ flexBasis: "100%", margin: 0, fontFamily: SANS, fontWeight: 700, fontSize: "0.95rem", color: MUTED }}>
          {FLAME_GROWS_AT} days. Your flame grew.
        </motion.p>
      )}
    </div>
  );
}

function Resources({ slot, task, find, canSearch }) {
  const c = useQuestColors();
  const [found, setFound] = useState(null);      // { resources, left } from a search made in this sheet
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [spent, setSpent] = useState(false);     // the monthly searches are used up

  const list = found ? found.resources : task.resources;   // null: never searched
  const search = async () => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      setFound(await find(slot));
    } catch (e) {
      if (e.code === "QUEST_BUDGET") setSpent(true);
      setError(e.message || "Could not look up resources right now. Try again in a bit.");
    } finally {
      setBusy(false);
    }
  };

  // A finished task shows what was saved and never offers a new search.
  if (list === null && !canSearch) return null;

  return (
    <section aria-label="Resources" style={{ marginTop: 22, paddingTop: 16, borderTop: `2px solid ${LINE}` }}>
      <p style={{ margin: 0, fontFamily: SANS, fontSize: "0.95rem", fontWeight: 800, color: INK }}>
        Resources <span style={{ fontWeight: 600, color: FAINT }}>(optional)</span>
      </p>

      {list === null && !spent && (
        <>
          <p style={{ margin: "4px 0 12px", fontFamily: SANS, fontSize: "0.92rem", color: MUTED, lineHeight: 1.5 }}>
            A few real pages that help with this task.
          </p>
          {busy ? (
            <div role="status" style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
              <Spinner size={18} color={c.accent} />
              <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: "0.92rem", color: MID }}>
                Looking for good pages. This takes a few seconds.
              </span>
            </div>
          ) : (
            <Chunky tone="quiet" small onClick={search}>{error ? "Try again" : "Find resources"}</Chunky>
          )}
        </>
      )}

      {list !== null && list.length === 0 && (
        <p style={{ margin: "6px 0 0", fontFamily: SANS, fontSize: "0.92rem", color: MUTED, lineHeight: 1.5 }}>
          Nothing solid turned up for this one. Your advisor in Chat can help you find a starting point.
        </p>
      )}

      {list !== null && list.length > 0 && (
        <ul style={{ listStyle: "none", margin: "10px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          {list.filter((r) => typeof r.url === "string" && r.url.startsWith("https://")).map((r) => (
            <li key={r.url}>
              <a href={r.url} target="_blank" rel="noopener noreferrer" aria-label={`${r.title}, opens in a new tab`}
                style={{ display: "block", textDecoration: "none", border: `2px solid ${LINE}`, borderRadius: 14, padding: "10px 12px" }}>
                <span style={{ display: "block", fontFamily: SANS, fontWeight: 800, fontSize: "0.98rem", color: c.accent, lineHeight: 1.35 }}>
                  {r.title}
                </span>
                {r.note && (
                  <span style={{ display: "block", marginTop: 3, fontFamily: SANS, fontSize: "0.9rem", color: MID, lineHeight: 1.5 }}>
                    {r.note}
                  </span>
                )}
                <span style={{ display: "block", marginTop: 4, fontFamily: SANS, fontWeight: 700, fontSize: "0.82rem", color: MUTED }}>
                  {r.domain}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}

      {found && found.left !== undefined && (
        <p role="status" style={{ margin: "10px 0 0", fontFamily: SANS, fontSize: "0.85rem", color: MUTED }}>
          {found.left === 1 ? "1 search left" : `${found.left} searches left`} this month.
        </p>
      )}
      <ErrorLine>{error}</ErrorLine>
    </section>
  );
}

export default function CheckInSheet({
  slot, stone, today, task, loading, loadError, onRetry, onSubmit, onAnswer, onFindResources, onClose,
}) {
  const c = useQuestColors();
  const [body, setBody] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [outcome, setOutcome] = useState(null);        // { checkin, result, state }
  const [answered, setAnswered] = useState(null);      // xp gained from the follow-up
  const box = useRef(null);

  const review = task?.status === "done" && !outcome;
  const catchUp = stone && stone.state === "missed";

  useEffect(() => {
    if (task && task.status !== "done" && !outcome) box.current?.focus();
  }, [task, outcome]);

  const submit = async () => {
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true); setError(null);
    try {
      setOutcome(await onSubmit(slot, text));
    } catch (e) {
      setError(e.message || "That did not go through. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const sendAnswer = async () => {
    const text = answer.trim();
    if (!text || busy) return;
    setBusy(true); setError(null);
    try {
      const r = await onAnswer(outcome.checkin.id, text);
      setAnswered(r.xp_gained);
      // The page applies outcome.state when the sheet closes, so the bonus
      // has to land in it or the XP bar and nav chip show the pre-bonus total.
      if (r.stats) {
        setOutcome((prev) => (prev?.state ? { ...prev, state: { ...prev.state, stats: r.stats } } : prev));
      }
    } catch (e) {
      setError(e.message || "That did not go through. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const close = () => onClose(outcome);
  const heading = catchUp
    ? `Catch-up for ${formatDay(stone.date)}`
    : stone && stone.date === today ? "Today" : stone ? formatDay(stone.date) : "";

  return (
    <Sheet onClose={close} locked={busy} label={task ? task.title : "Task"}>
      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "28px 4px" }}>
          <Spinner size={22} color={c.accent} />
          <span style={{ fontFamily: SANS, fontWeight: 700, color: MID }}>Setting up your task...</span>
        </div>
      )}

      {!loading && loadError && (
        <div style={{ padding: "12px 0" }}>
          <ErrorLine>{loadError}</ErrorLine>
          <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
            <Chunky onClick={onRetry}>Try again</Chunky>
            <TextButton onClick={close} color={MUTED}>Close</TextButton>
          </div>
        </div>
      )}

      {!loading && task && (
        <>
          <Label color={catchUp ? AMBER : c.accent}>
            {heading}{!review && !outcome ? `, about ${task.est_minutes} min` : ""}
          </Label>
          <h2 style={{ margin: "6px 0 8px", fontFamily: SANS, fontSize: "1.35rem", fontWeight: 800, color: INK, lineHeight: 1.3 }}>
            {task.title}
          </h2>
          {task.detail && (
            <p style={{ margin: "0 0 16px", fontFamily: SANS, fontSize: "1rem", color: MID, lineHeight: 1.6 }}>
              {task.detail}
            </p>
          )}
          {task.fallback && !review && !outcome && (
            <p style={{ margin: "-6px 0 16px", fontFamily: SANS, fontSize: "0.88rem", color: FAINT }}>
              A simple task this time. The next ones will be tailored to you again.
            </p>
          )}

          {review && task.checkin && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <TheirWords>{task.checkin.body}</TheirWords>
              {task.checkin.reply && <Bubble>{task.checkin.reply}</Bubble>}
              {task.checkin.followup && task.checkin.followup_answer && (
                <>
                  <Bubble>{task.checkin.followup}</Bubble>
                  <TheirWords>{task.checkin.followup_answer}</TheirWords>
                </>
              )}
              <Resources slot={slot} task={task} find={onFindResources} canSearch={false} />
              <div style={{ marginTop: 6 }}><Chunky tone="quiet" full onClick={close}>Close</Chunky></div>
            </div>
          )}

          {!review && !outcome && (
            <>
              <label htmlFor="quest-checkin" style={{ display: "block", fontFamily: SANS, fontWeight: 800,
                fontSize: "0.95rem", color: INK, marginBottom: 8 }}>
                What did you do? Any result?
              </label>
              <textarea
                id="quest-checkin" ref={box} rows={3} value={body} maxLength={1000}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(); }}
                placeholder="One or two lines is plenty."
                style={{ ...fieldStyle, resize: "vertical", minHeight: 88 }}
              />
              <ErrorLine>{error}</ErrorLine>
              <div style={{ marginTop: 16 }}>
                <Chunky full onClick={submit} disabled={!body.trim() || busy}>
                  {busy ? "Checking in..." : "Check in"}
                </Chunky>
              </div>
              <Resources slot={slot} task={task} find={onFindResources} canSearch />
            </>
          )}

          {outcome && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
              {outcome.result && <Reward result={outcome.result} streak={outcome.state?.stats?.streak || 0} />}
              {outcome.already && (
                <p style={{ fontFamily: SANS, fontWeight: 700, color: MUTED, margin: "0 0 12px" }}>
                  This one was already checked in.
                </p>
              )}
              {outcome.checkin?.reply && <Bubble>{outcome.checkin.reply}</Bubble>}

              {outcome.checkin?.followup && !outcome.checkin?.followup_answer && answered === null && (
                <div style={{ marginTop: 14 }}>
                  <Bubble>{outcome.checkin.followup}</Bubble>
                  <textarea
                    rows={2} value={answer} maxLength={500} onChange={(e) => setAnswer(e.target.value)}
                    placeholder="Answer for +5 XP, or skip it."
                    aria-label="Your answer"
                    style={{ ...fieldStyle, marginTop: 10, resize: "vertical" }}
                  />
                  <ErrorLine>{error}</ErrorLine>
                  <div style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "center" }}>
                    <Chunky small onClick={sendAnswer} disabled={!answer.trim() || busy}>
                      {busy ? "Sending..." : "Answer"}
                    </Chunky>
                    <TextButton onClick={close} color={MUTED}>Skip</TextButton>
                  </div>
                </div>
              )}
              {answered !== null && (
                <p style={{ fontFamily: SANS, fontWeight: 800, color: c.accent, margin: "12px 0 0" }}>
                  +{answered} XP. Noted.
                </p>
              )}

              {(answered !== null || !outcome.checkin?.followup || outcome.checkin?.followup_answer) && (
                <div style={{ marginTop: 18 }}>
                  <Chunky full onClick={close}>
                    {outcome.result?.quest_completed ? "See the finish" : outcome.result?.milestone_completed ? "Next" : "Done"}
                  </Chunky>
                </div>
              )}
            </motion.div>
          )}
        </>
      )}
    </Sheet>
  );
}
