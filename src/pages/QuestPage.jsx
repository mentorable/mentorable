import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { requireUser } from "../lib/auth.js";
import { questApi, summaryFromState } from "../lib/quest.js";
import { useQuest } from "../lib/QuestContext.jsx";
import { useIsMobile } from "../hooks/useIsMobile.js";
import { SIDEBAR_WIDTH } from "../components/common/Sidebar.jsx";
import Spinner from "../components/common/Spinner.jsx";
import QuestMap from "../components/quest/QuestMap.jsx";
import SkyBackdrop from "../components/quest/SkyBackdrop.jsx";
import CheckInSheet from "../components/quest/CheckInSheet.jsx";
import { QuestSetup, DraftReview } from "../components/quest/QuestSetup.jsx";
import {
  TopBar, StickyHeader, CatchUpBanner, CatchUpPill, DeadlineNotice, RestNote, PausedCard,
  MilestoneCard, FinishCard, ConfirmModal, PaceModal, PortfolioDraftModal,
} from "../components/quest/QuestPanels.jsx";
import { SANS, INK, MUTED, Chunky, QuestStyles, useQuestColors } from "../components/quest/questUi.jsx";
import { Button, Card, SR_ONLY, Toast, pageStyle } from "../components/ui/kit.jsx";

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
  const [notice, setNotice] = useState(null);   // { text, error }: shown in the Toast, in view wherever the tap was
  const [confirmRetire, setConfirmRetire] = useState(false);
  const [confirmBreak, setConfirmBreak] = useState(false);
  const [paceOpen, setPaceOpen] = useState(false);
  const [portfolio, setPortfolio] = useState(null);      // { draft, loading, error }

  const focusRef = useRef(null);
  const scrolledFor = useRef(null);
  const openingToday = useRef(null);
  const headerRef = useRef(null);
  const bannerRef = useRef(null);
  const noticeTimer = useRef(null);
  const [headerH, setHeaderH] = useState(0);
  const [bannerGone, setBannerGone] = useState(false);   // the catch-up banner has scrolled under the bar

  const view = state?.view;
  const showSetup = view === "none" || view === "retired" || (view === "completed" && setupOpen);
  const showMap = ["active", "paused", "completed"].includes(view) && !showSetup;
  const behind = view === "active" && state?.backlog?.count > 0 && !!state?.backlog?.oldest_doable_slot
    && state?.today_state !== "blocked";
  // How much of the top of the screen the stuck bar covers (its 10px offset,
  // the bar, and the catch-up pill under it), and the mobile nav at the foot.
  const coverTop = 10 + headerH + (behind ? 52 : 0);
  const coverBottom = isMobile ? 76 : 0;

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

  // The bar's height, for everything that has to clear it.
  useEffect(() => {
    const el = headerRef.current;
    if (!showMap || !el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => setHeaderH(Math.round(el.getBoundingClientRect().height)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [showMap]);

  // Keyboard focus on the map keeps clear of the stuck bar and the mobile
  // nav, so a focused stone or Start is never hidden under either. A scroll
  // margin on those controls, not scroll-padding on the page: the bar's own
  // controls are sticky, and a page-wide padding made focusing them scroll.
  const coverCss = showMap
    ? `.quest-map-cover [data-slot] .quest-stone, .quest-map-cover [data-today-callout] button {
        scroll-margin-top: ${coverTop + 8}px; scroll-margin-bottom: ${coverBottom + 8}px; }`
    : "";

  // The catch-up pill takes over once the full banner is under the bar.
  useEffect(() => {
    const el = bannerRef.current;
    if (!behind || !el || typeof IntersectionObserver === "undefined") { setBannerGone(false); return undefined; }
    const io = new IntersectionObserver(([e]) => {
      setBannerGone(!e.isIntersecting && e.boundingClientRect.top < (e.rootBounds?.top ?? 0) + 1);
    }, { rootMargin: `-${10 + headerH}px 0px 0px 0px` });
    io.observe(el);
    return () => io.disconnect();
  }, [behind, headerH]);

  // Today's callout and stone, centred in the part of the screen the bar and
  // the nav leave free (plain scrollIntoView centres on the whole window, so
  // the bar covered the callout).
  const scrollToToday = useCallback((behavior = "auto") => {
    const stone = focusRef.current;
    if (!stone) return false;
    const slotEl = stone.closest("[data-slot]") || stone;
    const prev = slotEl.previousElementSibling;
    const callout = prev && prev.hasAttribute("data-today-callout") ? prev : null;
    const top = (callout || slotEl).getBoundingClientRect().top + window.scrollY;
    const bottom = slotEl.getBoundingClientRect().bottom + window.scrollY;
    const free = window.innerHeight - coverTop - coverBottom;
    const y = bottom - top > free - 24 ? top - coverTop - 12 : (top + bottom) / 2 - coverTop - free / 2;
    window.scrollTo({ top: Math.max(0, Math.round(y)), behavior });
    return true;
  }, [coverTop, coverBottom]);

  // Land on today, once per quest per visit. After a long gap the comeback
  // banner, with its offer to count the time away as a break, comes first;
  // any choice there then takes the student to today.
  useEffect(() => {
    if (!state?.quest || !["active", "paused"].includes(state.view)) return;
    const key = state.quest.id;
    if (scrolledFor.current === key) return;
    if (state.welcome_back?.show && state.welcome_back?.offer_break) { scrolledFor.current = key; return; }
    const id = requestAnimationFrame(() => {
      if (scrollToToday()) scrolledFor.current = key;
    });
    return () => cancelAnimationFrame(id);
  }, [state, scrollToToday]);

  const showNotice = (text, { error = false } = {}) => {
    clearTimeout(noticeTimer.current);
    setNotice({ text, error });
    if (!error) noticeTimer.current = setTimeout(() => setNotice(null), 5000);
  };
  const dismissNotice = () => { clearTimeout(noticeTimer.current); setNotice(null); };
  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  // ── Actions ────────────────────────────────────────────────────────────────

  const run = async (fn, { reload = false } = {}) => {
    setBusy(true); dismissNotice();
    try {
      const s = await fn();
      if (s && s.view !== undefined) setState(s);
      else if (reload) await load();
      return s;
    } catch (e) {
      showNotice(e.message || "That did not go through. Try again.", { error: true });
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
      showNotice(currentMilestone ? `Finish Milestone ${currentMilestone.position} to unlock that day.` : "That day is locked.");
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

  // The skip link and the comeback banner's choices: bring today into view
  // and put focus on its Start button (or its stone).
  const goToday = (behavior = "smooth") => {
    scrollToToday(behavior);
    const stone = focusRef.current;
    const callout = stone?.closest("[data-slot]")?.previousElementSibling;
    const start = callout?.querySelector?.("[data-today-start]:not([disabled])");
    (start || (stone?.tagName === "BUTTON" ? stone : null))?.focus({ preventScroll: true });
  };

  const takeBreak = async () => {
    const s = await run(() => questApi.takeBreak(q.id));
    setConfirmBreak(false);
    if (s) requestAnimationFrame(() => goToday("auto"));
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

  // The kit's page frame. The map sets its own top spacing, since the sky
  // scene starts right under the top of the page.
  const pagePad = {
    ...pageStyle({ isMobile, sidebar: SIDEBAR_WIDTH, ink: c }),
    ...(showMap ? { paddingTop: 0 } : null),
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

  const streakLit = ["done", "rest"].includes(state.today_state);
  const hasToday = showMap && view !== "completed" && focusSlotOf(state) != null;

  return (
    <div data-sidebar-offset className="ui-page" style={pagePad}>
      <QuestStyles />
      {coverCss && <style>{coverCss}</style>}
      <div style={{ maxWidth: 880, margin: "0 auto", width: "100%" }}>

        {/* With a quest on the map, the whole section (the bar, the notices
            and the map) sits in the beach-to-space scene. */}
        <div className={showMap ? "quest-map-cover" : undefined} style={showMap ? { position: "relative", isolation: "isolate", marginTop: isMobile ? 10 : 18,
          padding: isMobile ? "10px 10px 0" : "14px 16px 0" } : undefined}>
        {showMap && <SkyBackdrop isMobile={isMobile} />}

        {showMap && (
          <StickyHeader ref={headerRef}>
            <TopBar title={q.title} stats={state.stats} streakLit={streakLit} menu={menu} isMobile={isMobile} />
            {hasToday && <SkipToToday onGo={() => goToday()} />}
            <AnimatePresence>
              {behind && bannerGone && <CatchUpPill key="pill" state={state} onCatchUp={catchUp} />}
            </AnimatePresence>
          </StickyHeader>
        )}

        {showSetup && (
          <QuestSetup
            onPlanned={(s) => { setSetupOpen(false); setState(s); window.scrollTo({ top: 0 }); }}
            canCancel={view === "completed"}
            onCancel={() => setSetupOpen(false)}
          />
        )}

        {view === "draft" && (
          <DraftReview
            state={state} busy={busy}
            onStart={() => run(() => questApi.start(q.id))}
            onDiscard={() => run(() => questApi.discard(q.id))}
          />
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
                <CatchUpBanner ref={bannerRef} state={state} onCatchUp={catchUp}
                  onBreak={() => setConfirmBreak(true)} onGoToday={() => goToday()} />
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
        {confirmBreak && (
          <ConfirmModal key="break" busy={busy}
            title="Count it as a break?"
            body="The days you missed move to start from today, so there is nothing left to catch up on. Your finish date moves later to make room, and your streak starts fresh with today's check-in."
            confirm="Count it as a break" cancel="Not now"
            onClose={() => setConfirmBreak(false)}
            onConfirm={takeBreak} />
        )}
        {paceOpen && q && (
          <PaceModal key="pace" quest={q} isMobile={isMobile} onClose={() => setPaceOpen(false)}
            onSave={async (body) => { const s = await questApi.settings(q.id, body); setState(s); setPaceOpen(false); }} />
        )}
        {portfolio && (
          <PortfolioDraftModal key="portfolio" draft={portfolio.draft} loading={portfolio.loading} error={portfolio.error}
            onSave={savePortfolio} onClose={() => setPortfolio(null)} />
        )}
      </AnimatePresence>

      <Toast notice={notice} onDismiss={dismissNotice} isMobile={isMobile} sidebar={SIDEBAR_WIDTH} />
    </div>
  );
}

/** "Skip to today", for the keyboard: hidden until it has focus, then shown
 *  just under the bar. It sits right after the bar, so it is the first stop
 *  past the quest options. */
function SkipToToday({ onGo }) {
  const [shown, setShown] = useState(false);
  return (
    <div style={shown ? { position: "absolute", top: "calc(100% - 2px)", left: 0, zIndex: 2 } : SR_ONLY}>
      <Button kind="secondary" onClick={onGo} onFocus={() => setShown(true)} onBlur={() => setShown(false)}
        style={{ boxShadow: "0 6px 18px rgba(12,16,44,0.16)" }}>
        Skip to today
      </Button>
    </div>
  );
}
