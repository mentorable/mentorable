import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { requireUser } from "../lib/auth.js";
import { questApi, summaryFromState } from "../lib/quest.js";
import { useQuest } from "../lib/QuestContext.jsx";
import { useIsMobile } from "../hooks/useIsMobile.js";
import { SIDEBAR_WIDTH } from "../components/common/Sidebar.jsx";
import Spinner from "../components/common/Spinner.jsx";
import QuestMap from "../components/quest/QuestMap.jsx";
import CheckInSheet from "../components/quest/CheckInSheet.jsx";
import { QuestSetup, DraftReview } from "../components/quest/QuestSetup.jsx";
import {
  TopBar, StickyHeader, CatchUpBanner, WelcomeBack, DeadlineNotice, RestNote, PausedCard, Notice,
  MilestoneCard, FinishCard, ConfirmModal, PaceModal, PortfolioDraftModal,
} from "../components/quest/QuestPanels.jsx";
import { BG, SANS, INK, MUTED, Chunky, QuestStyles, useQuestColors } from "../components/quest/questUi.jsx";
import { ringVar } from "../components/ui/tokens.js";
import { Card } from "../components/ui/kit.jsx";

// Quest: one project, a small step every day. The page is a thin shell around
// the server's state: every rule about days, streaks and gates is decided by
// the backend, and this renders what it says and sends the student's actions.

function focusSlotOf(state) {
  if (!state?.stones?.length) return null;
  if (state.today_slot) return state.today_slot;
  const next = state.stones.find((s) => s.state === "future");
  return next ? next.slot : state.stones[state.stones.length - 1].slot;
}

export default function QuestPage({ navigate }) {
  const isMobile = useIsMobile();
  const c = useQuestColors();
  const { setSummary } = useQuest();

  const [phase, setPhase] = useState("loading");         // loading | ready | error
  const [state, setState] = useState(null);
  const [setupOpen, setSetupOpen] = useState(false);     // "start a new quest" from the finish card
  const [sheet, setSheet] = useState(null);              // { slot, stone, task, loading, error }
  const [milestoneCard, setMilestoneCard] = useState(null);
  const [justDone, setJustDone] = useState(null);
  const [glow, setGlow] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);   // { text, tone }: "error", or "lock" (amber: a locked day is not a failure)
  const [confirmRetire, setConfirmRetire] = useState(false);
  const [paceOpen, setPaceOpen] = useState(false);
  const [portfolio, setPortfolio] = useState(null);      // { draft, loading, error }

  const focusRef = useRef(null);
  const scrolledFor = useRef(null);
  const openingToday = useRef(null);

  // ── Loading ────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    try {
      const s = await questApi.state();
      setState(s);
      setPhase("ready");
    } catch (e) {
      console.error("[quest] load failed:", e);
      setPhase("error");
    }
  }, []);

  // The quest request goes out alongside the sign-in check rather than after
  // it: the backend validates the token anyway, and waiting would add a full
  // round trip to every visit.
  useEffect(() => {
    load();
    requireUser().then((user) => { if (!user) navigate("/auth"); });
  }, [load, navigate]);

  useEffect(() => { if (state) setSummary(summaryFromState(state)); }, [state, setSummary]);

  // Today's task is set up as soon as the page opens, so the callout can show
  // what it is instead of a button that makes the student wait.
  useEffect(() => {
    if (!state || state.view !== "active" || state.today_state !== "open" || state.today_task) return;
    const key = `${state.today}:${state.today_slot}`;
    if (openingToday.current === key) return;
    openingToday.current = key;
    questApi.openTask(state.today_slot)
      .then(({ task }) => setState((prev) => (prev && prev.today_slot === task.slot ? {
        ...prev,
        today_task: task,
        stones: prev.stones.map((s) => (s.slot === task.slot ? { ...s, task: { id: task.id, title: task.title } } : s)),
      } : prev)))
      .catch((e) => { openingToday.current = null; console.warn("[quest] could not set up today's task:", e.message); });
  }, [state]);

  // Land on today, once per quest per visit. Not on a comeback visit, though:
  // then the welcome back card at the top, with its offer to count the time
  // away as a break, is the thing to see first.
  useEffect(() => {
    if (!state?.quest || !["active", "paused"].includes(state.view)) return;
    const key = state.quest.id;
    if (scrolledFor.current === key) return;
    if (state.welcome_back?.show) { scrolledFor.current = key; return; }
    const id = requestAnimationFrame(() => {
      if (focusRef.current) {
        focusRef.current.scrollIntoView({ block: "center", behavior: "auto" });
        scrolledFor.current = key;
      }
    });
    return () => cancelAnimationFrame(id);
  }, [state]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const run = async (fn, { reload = false } = {}) => {
    setBusy(true); setNotice(null);
    try {
      const s = await fn();
      if (s && s.view !== undefined) setState(s);
      else if (reload) await load();
      return s;
    } catch (e) {
      setNotice({ text: e.message, tone: "error" });
      return null;
    } finally {
      setBusy(false);
    }
  };

  const currentMilestone = state?.milestones?.find((m) => m.state === "current");

  const openStone = async (stone) => {
    if (!state || stone.state === "future") return;
    const reviewing = stone.state === "done" || stone.state === "late";
    if (!reviewing && state.view !== "active") return;
    if (!stone.doable && (stone.state === "missed" || stone.state === "today")) {
      if (stone.state === "today") { catchUp(); return; }
      setNotice({ text: currentMilestone ? `Finish Milestone ${currentMilestone.position} to unlock that day.` : "That day is locked.", tone: "lock" });
      return;
    }
    const cached = stone.slot === state.today_slot && state.today_task ? state.today_task : null;
    setSheet({ slot: stone.slot, stone, task: cached, loading: !cached, error: null });
    if (cached) return;
    try {
      const { task } = await questApi.openTask(stone.slot);
      // Links found while this response was in flight are newer than it is.
      setSheet((prev) => (prev && prev.slot === stone.slot
        ? { ...prev, task: { ...task, resources: prev.task?.resources ?? task.resources }, loading: false } : prev));
    } catch (e) {
      setSheet((prev) => (prev && prev.slot === stone.slot ? { ...prev, loading: false, error: e.message } : prev));
    }
  };

  const catchUp = () => {
    const slot = state?.backlog?.oldest_doable_slot;
    if (!slot) return;
    openStone(state.stones[slot - 1]);
  };

  const startToday = () => {
    if (!state?.today_slot) return;
    openStone(state.stones[state.today_slot - 1]);
  };

  // Saved on the task, so it is kept in both places the task is held: the open
  // sheet, and today's cached task the map hands to a reopened sheet.
  const findResources = async (slot) => {
    const r = await questApi.resources(slot);
    const withLinks = (t) => (t && t.slot === slot ? { ...t, resources: r.resources } : t);
    setSheet((prev) => (prev && prev.slot === slot ? { ...prev, task: withLinks(prev.task) } : prev));
    setState((prev) => (prev ? { ...prev, today_task: withLinks(prev.today_task) } : prev));
    return r;
  };

  const submitCheckIn = (slot, body) => questApi.checkIn(slot, body);
  const answerFollowup = (id, answer) => questApi.followup(id, answer);

  // The map only updates once the sheet closes, so the student sees the stone
  // fill and the milestone light up instead of it happening behind the sheet.
  const closeSheet = (outcome) => {
    const slot = sheet?.slot;
    setSheet(null);
    if (!outcome?.state) return;
    setState(outcome.state);
    if (outcome.result) {
      setJustDone(slot);
      setTimeout(() => setJustDone(null), 1200);
      const ms = outcome.result.milestone_completed;
      if (ms && !outcome.result.quest_completed) {
        setGlow(ms.position);
        setTimeout(() => setGlow(null), 2400);
        const next = outcome.state.milestones?.find((m) => m.position === ms.position + 1);
        setMilestoneCard({ milestone: ms, next });
      }
      if (outcome.result.quest_completed) window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (outcome.already) {
      load();
    }
  };

  const q = state?.quest;
  const menu = q && state.view === "active" ? [
    { label: "Change pace", onClick: () => setPaceOpen(true) },
    { label: "Pause quest", onClick: () => run(() => questApi.pause(q.id)) },
    { label: "Retire quest", onClick: () => setConfirmRetire(true), danger: true },
  ] : q && state.view === "paused" ? [
    { label: "Change pace", onClick: () => setPaceOpen(true) },
    { label: "Retire quest", onClick: () => setConfirmRetire(true), danger: true },
  ] : [];

  const openPortfolioDraft = async () => {
    setPortfolio({ draft: null, loading: true, error: null });
    try {
      const { draft } = await questApi.portfolioDraft(q.id);
      setPortfolio({ draft, loading: false, error: null });
    } catch (e) {
      setPortfolio({ draft: null, loading: false, error: e.message });
    }
  };

  const savePortfolio = async (fields) => {
    await questApi.portfolioSave(q.id, fields);
    setPortfolio(null);
    await load();
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const pagePad = {
    minHeight: "100vh", background: BG, fontFamily: SANS, boxSizing: "border-box",
    padding: isMobile ? "0 1rem 6.5rem" : "0 2rem 4rem",
    paddingLeft: isMobile ? "1rem" : `calc(${SIDEBAR_WIDTH}px + 2rem)`,
    ...ringVar(c),
  };

  if (phase === "loading") {
    return (
      <div data-sidebar-offset className="ui-page" style={{ ...pagePad, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Spinner size={26} color={c.page} />
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div data-sidebar-offset className="ui-page" style={{ ...pagePad, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Card style={{ textAlign: "center", maxWidth: 420, width: "100%", padding: "1.6rem 1.4rem" }}>
          <p style={{ fontFamily: SANS, fontSize: "1.1rem", fontWeight: 800, color: INK, margin: "0 0 8px" }}>
            We could not load your quest
          </p>
          <p style={{ fontFamily: SANS, fontSize: "1rem", color: MUTED, lineHeight: 1.6, margin: "0 0 18px" }}>
            Your progress is saved. Try again in a moment.
          </p>
          <Chunky onClick={() => { setPhase("loading"); load(); }}>Try again</Chunky>
        </Card>
      </div>
    );
  }

  const view = state.view;
  const showSetup = view === "none" || view === "retired" || (view === "completed" && setupOpen);
  const showMap = ["active", "paused", "completed"].includes(view) && !showSetup;
  const streakLit = ["done", "rest"].includes(state.today_state);

  return (
    <div data-sidebar-offset className="ui-page" style={pagePad}>
      <QuestStyles />
      <div style={{ maxWidth: 880, margin: "0 auto", width: "100%" }}>

        {showMap && (
          <StickyHeader>
            <TopBar title={q.title} stats={state.stats} streakLit={streakLit} menu={menu} isMobile={isMobile} />
            {view === "active" && <CatchUpBanner state={state} onCatchUp={catchUp} />}
          </StickyHeader>
        )}

        <Notice tone={notice?.tone}>{notice?.text}</Notice>

        {showSetup && (
          <div style={{ paddingTop: isMobile ? 24 : 48 }}>
            <QuestSetup
              onPlanned={(s) => { setSetupOpen(false); setState(s); window.scrollTo({ top: 0 }); }}
              canCancel={view === "completed"}
              onCancel={() => setSetupOpen(false)}
            />
          </div>
        )}

        {view === "draft" && (
          <div style={{ paddingTop: isMobile ? 24 : 48 }}>
            <DraftReview
              state={state} busy={busy}
              onStart={() => run(() => questApi.start(q.id))}
              onDiscard={() => run(() => questApi.discard(q.id))}
            />
          </div>
        )}

        {showMap && (
          <>
            {view === "paused" && (
              <PausedCard state={state} busy={busy}
                onResume={() => run(() => questApi.resume(q.id))}
                onRetire={() => setConfirmRetire(true)} />
            )}
            {view === "active" && (
              <>
                <WelcomeBack state={state} busy={busy} onCatchUp={catchUp}
                  onBreak={() => run(() => questApi.takeBreak(q.id))}
                  onLighter={() => run(() => questApi.settings(q.id, { daily_minutes: 15 }))} />
                <DeadlineNotice state={state} onAskAdvisor={() => navigate("/chat")} />
                <RestNote state={state} />
              </>
            )}
            {view === "completed" && (
              <FinishCard state={state} busy={busy}
                onAddToPortfolio={openPortfolioDraft}
                onDismissPortfolio={() => run(() => questApi.portfolioDismiss(q.id), { reload: true })}
                onNewQuest={() => { setSetupOpen(true); window.scrollTo({ top: 0 }); }} />
            )}
            <QuestMap
              state={state}
              todayRef={focusRef}
              focusSlot={focusSlotOf(state)}
              onOpen={openStone}
              onStartToday={startToday}
              onCatchUp={catchUp}
              justDone={justDone}
              glowMilestone={glow}
              isMobile={isMobile}
            />
          </>
        )}
      </div>

      <AnimatePresence>
        {sheet && (
          <CheckInSheet
            key={`sheet-${sheet.slot}`}
            slot={sheet.slot} stone={sheet.stone} today={state.today}
            task={sheet.task} loading={sheet.loading} loadError={sheet.error}
            onRetry={() => openStone(sheet.stone)}
            onSubmit={submitCheckIn} onAnswer={answerFollowup} onFindResources={findResources} onClose={closeSheet}
          />
        )}
        {milestoneCard && (
          <MilestoneCard key="milestone" milestone={milestoneCard.milestone} next={milestoneCard.next}
            onClose={() => setMilestoneCard(null)} />
        )}
        {confirmRetire && (
          <ConfirmModal key="retire" danger busy={busy}
            title="Retire this quest?"
            body="It ends here. You keep all your XP and your streak, and you can start a new quest right away."
            confirm="Retire quest"
            onClose={() => setConfirmRetire(false)}
            onConfirm={async () => { await run(() => questApi.retire(q.id)); setConfirmRetire(false); }} />
        )}
        {paceOpen && q && (
          <PaceModal key="pace" quest={q} onClose={() => setPaceOpen(false)}
            onSave={async (body) => { const s = await questApi.settings(q.id, body); setState(s); setPaceOpen(false); }} />
        )}
        {portfolio && (
          <PortfolioDraftModal key="portfolio" draft={portfolio.draft} loading={portfolio.loading} error={portfolio.error}
            onSave={savePortfolio} onClose={() => setPortfolio(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
