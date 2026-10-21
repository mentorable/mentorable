import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import QuestMap from "../../quest/QuestMap.jsx";
import SkyBackdrop from "../../quest/SkyBackdrop.jsx";
import { StickyHeader, TopBar } from "../../quest/QuestPanels.jsx";
import {
  BG, Chunky, Flame, INK, LINE, MID, MUTED, QuestStyles, SANS, WHITE, fieldStyle, useQuestColors,
} from "../../quest/questUi.jsx";
import { Cursor, MobileTabBar } from "../frames.jsx";
import { clamp01, seg, smooth, typed, useReduce } from "../kit.js";
import { QUEST } from "../data.js";

// The Quest screen (PLAN.md 6.4.4): the real map, sky and title bar with the
// demo student's quest, in the Quest story's phone. A pure function of (step, t):
//   step 0  Check in        the sheet rises, the check-in is typed, Check in is pressed
//   step 1  Keep the streak +10 XP, the flame lights, the reply, Done, the stone fills
//   step 2  See the whole climb   the scroller climbs from today to the finish line
// The check-in sheet is recreated here (the app's Sheet focuses itself and
// listens on window). Nothing here reads a clock, fetches, or scrolls the page:
// the only scrolling is this screen's own element's scrollTop.

const W8 = 800;   // the app's own heading weight inside the recreated sheet
const MENU = [{ label: "Change pace", onClick() {} }];
const noop = () => {};

/** An element's top inside `ancestor`, by offsetTop (unaffected by transforms). */
function offsetWithin(el, ancestor) {
  let y = 0;
  let n = el;
  while (n && n !== ancestor) { y += n.offsetTop; n = n.offsetParent; }
  return y;
}

export default function QuestScreen({ step = 0, t = 0, still = false }) {
  const reduce = useReduce();
  const c = useQuestColors();
  const tt = clamp01(t);
  const tr = (v) => (reduce ? "none" : v);

  // The map shows the check-in once the sheet has dropped (step 1, t >= .82).
  const after = step >= 2 || (step === 1 && tt >= 0.82);
  const state = after ? QUEST.after : QUEST.opened;
  const task = QUEST.opened.today_task;
  // The title bar and the tab bar light a beat after the stone.
  const chipState = step >= 2 || (step === 1 && tt >= 0.9) ? QUEST.after : QUEST.opened;
  const streakLit = ["done", "rest"].includes(chipState.today_state);
  const justDone = step === 1 && tt >= 0.82 && tt < 0.97 ? state.today_slot : null;

  // ── The sheet's beats ──────────────────────────────────────────────────────
  const sheetMounted = (step === 0 && tt >= 0.18) || (step === 1 && tt < 0.82);
  const sheetOpen = (step === 0 && tt >= 0.2) || (step === 1 && tt < 0.65);
  const focused = step === 0 && tt >= 0.32;
  const body = step === 0 && tt >= 0.35 ? typed(QUEST.checkin.body, seg(tt, 0.35, 0.8)) : "";
  const checkinPressed = step === 0 && tt >= 0.85;
  const afterIn = step === 1 && tt >= 0.04;
  const popped = step === 1 && tt >= 0.05;
  const xp = Math.round(QUEST.checkin.xp_awarded * seg(tt, 0.05, 0.2));
  const donePressed = step === 1 && tt >= 0.6 && tt < 0.68;

  // The pointer: a tap ring on Start, on Check in, then on Done.
  let anchor = null;
  let press = false;
  if (step === 0) {
    if (tt >= 0.15 && tt < 0.75) { anchor = "quest-start"; press = tt < 0.22; }
    else if (tt >= 0.75) { anchor = "quest-checkin"; press = tt >= 0.85; }
  } else if (step === 1 && tt >= 0.5 && tt < 0.82) {
    anchor = "quest-done";
    press = tt >= 0.6 && tt < 0.68;
  }

  // ── Scrolling: today's stone and callout centred, then the climb ──────────
  const scrollerRef = useRef(null);
  const todayRef = useRef(null);
  const bandRef = useRef(null);
  const todayTop = useRef(0);

  const measure = useCallback(() => {
    const sc = scrollerRef.current;
    const stone = todayRef.current;
    if (!sc || !stone) return;
    const slotEl = stone.closest("[data-slot]") || stone;
    const callout = slotEl.previousElementSibling;   // today's callout sits right above today's stone
    const top = offsetWithin(callout || slotEl, sc);
    const bottom = offsetWithin(stone, sc) + stone.offsetHeight;
    todayTop.current = Math.max(0, Math.round((top + bottom) / 2 - sc.clientHeight / 2));
  }, []);

  const apply = useCallback((stepNow, tNow) => {
    const sc = scrollerRef.current;
    if (!sc) return;
    const y = stepNow >= 2 ? Math.round(todayTop.current * (1 - smooth(tNow))) : todayTop.current;
    if (sc.scrollTop !== y) sc.scrollTop = y;
    // The grey behind the bar is only there while something sits under it:
    // at the top of the map the bar is not stuck, and the sky shows round it.
    const band = bandRef.current;
    const o = String(Math.min(1, y / 48));
    if (band && band.style.opacity !== o) band.style.opacity = o;
  }, []);

  const latest = useRef({ step, tt });
  latest.current = { step, tt };

  useLayoutEffect(() => {
    measure();
    apply(step, tt);
  }, [measure, apply, step, tt, state]);

  // Late layout (fonts, the sky measuring itself): measure again and hold the place.
  useLayoutEffect(() => {
    const sc = scrollerRef.current;
    if (!sc || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => { measure(); apply(latest.current.step, latest.current.tt); });
    ro.observe(sc);
    if (sc.firstElementChild) ro.observe(sc.firstElementChild);
    return () => ro.disconnect();
  }, [measure, apply]);

  // The tap ring needs a target: mark the map's own Start button.
  useLayoutEffect(() => {
    const stone = todayRef.current;
    const callout = stone?.closest("[data-slot]")?.previousElementSibling;
    const btn = callout?.querySelector("button");
    if (btn) btn.setAttribute("data-lp-anchor", "quest-start");
  }, [state]);

  // ── The real map, memoised on its beats ────────────────────────────────────
  const sky = useMemo(() => <SkyBackdrop isMobile still={still} />, [still]);
  // The map is scrolled to today, so whatever sits above it would show
  // around the stuck bar: the screen's own grey runs behind the bar and
  // fades into the sky under it (the scroller clips its sides).
  const header = useMemo(() => (
    <StickyHeader>
      <span ref={bandRef} aria-hidden="true" style={{ position: "absolute", left: -48, right: -48, top: -10, bottom: -28,
        background: `linear-gradient(to bottom, ${BG} 0, ${BG} calc(100% - 18px), rgba(245,245,245,0) 100%)` }} />
      <div style={{ position: "relative" }}>
        <TopBar title={chipState.quest.title} stats={chipState.stats} streakLit={streakLit} menu={MENU} isMobile headingAs="p" />
      </div>
    </StickyHeader>
  ), [chipState, streakLit]);
  const map = useMemo(() => (
    <QuestMap state={state} todayRef={todayRef} focusSlot={state.today_slot} onOpen={noop} onStartToday={noop}
      onCatchUp={noop} justDone={justDone} glowMilestone={null} isMobile />
  ), [state, justDone]);

  const mapSection = (
    <div style={{ position: "relative", isolation: "isolate", marginTop: 10, padding: "10px 10px 0" }}>
      <QuestStyles />
      {sky}
      {header}
      {map}
    </div>
  );

  // ── The recreated check-in sheet ───────────────────────────────────────────
  const label = (color) => ({ margin: 0, fontFamily: SANS, fontSize: "0.95rem", fontWeight: W8, color });
  const pressedLook = { filter: "brightness(0.93)", transform: "translateY(1px)" };
  const sheet = sheetMounted && (
    <div style={{ position: "absolute", inset: 0, zIndex: 40, display: "flex", alignItems: "flex-end", justifyContent: "center",
      background: `rgba(20,20,19,${sheetOpen ? 0.42 : 0})`, transition: tr("background 240ms ease") }}>
      <div style={{ width: "100%", maxWidth: 560, maxHeight: "88%", overflow: "hidden", boxSizing: "border-box", background: WHITE,
        borderRadius: "20px 20px 0 0", padding: "10px 22px 28px", border: `1px solid ${LINE}`, borderBottom: "none",
        boxShadow: "0 -12px 40px rgba(20,20,19,0.14)", transform: sheetOpen ? "translateY(0)" : "translateY(100%)",
        transition: tr("transform 320ms cubic-bezier(.2,0,0,1)"), fontFamily: SANS }}>
        <div aria-hidden="true" style={{ width: 44, height: 5, borderRadius: 99, background: LINE, margin: "0 auto 16px" }} />
        <p style={label(c.text)}>{step === 0 ? `Today, about ${task.est_minutes} min` : "Today"}</p>
        <p style={{ margin: "6px 0 8px", fontFamily: SANS, fontSize: "1.35rem", fontWeight: W8, color: INK, lineHeight: 1.3 }}>{task.title}</p>
        <p style={{ margin: "0 0 16px", fontFamily: SANS, fontSize: "1rem", color: MID, lineHeight: 1.6 }}>{task.detail}</p>

        {step === 0 ? (
          <>
            <p style={{ ...label(INK), marginBottom: 8 }}>What did you do? Any result?</p>
            <textarea readOnly rows={3} value={body} placeholder="One or two lines is plenty." aria-label="What did you do? Any result?"
              style={{ ...fieldStyle, resize: "vertical", minHeight: 88, display: "block",
                outline: focused ? "3px solid var(--ag-ring, #1d4ed8)" : "none", outlineOffset: 1 }} />
            <div style={{ marginTop: 16 }}>
              <Chunky full disabled={!body} data-lp-anchor="quest-checkin" style={checkinPressed ? pressedLook : undefined}>Check in</Chunky>
            </div>
            <section aria-label="Resources" style={{ marginTop: 22, paddingTop: 16, borderTop: `1px solid ${LINE}` }}>
              <p style={label(INK)}>Resources <span style={{ fontWeight: 600, color: MUTED }}>(optional)</span></p>
              <p style={{ margin: "4px 0 12px", fontFamily: SANS, fontSize: "0.92rem", color: MUTED, lineHeight: 1.5 }}>
                A few real pages that help with this task.
              </p>
              <Chunky tone="quiet" small>Find resources</Chunky>
            </section>
          </>
        ) : (
          <div style={{ opacity: afterIn ? 1 : 0, transition: tr("opacity 240ms ease") }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, margin: "4px 0 16px" }}>
              <span style={{ display: "inline-block", fontFamily: SANS, fontWeight: W8, fontSize: "1.1rem", color: c.button.fg,
                background: c.button.bg, borderRadius: 12, padding: "6px 12px", fontVariantNumeric: "tabular-nums",
                transform: `scale(${popped ? 1 : 0.6})`, opacity: popped ? 1 : 0,
                transition: tr("transform 240ms cubic-bezier(.2,0,0,1), opacity 240ms ease") }}>
                +{xp} XP
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: SANS, fontWeight: W8, fontSize: "1rem", color: INK }}>
                <Flame size={22} animate={!still} streak={QUEST.after.stats.streak} /> {QUEST.after.stats.streak} day streak
              </span>
            </div>
            <div style={{ background: c.softer, border: `1px solid ${c.soft}`, borderRadius: "16px 16px 16px 4px", padding: "12px 14px",
              fontFamily: SANS, fontSize: "1rem", color: INK, lineHeight: 1.55 }}>
              {QUEST.checkin.reply}
            </div>
            <div style={{ marginTop: 18 }}>
              <Chunky full data-lp-anchor="quest-done" style={donePressed ? pressedLook : undefined}>Done</Chunky>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const root = { position: "absolute", inset: 0, overflow: "hidden", background: BG, fontFamily: SANS, "--ag-ring": c.ring };

  return (
    <div className="ui-page" style={root}>
      <div ref={scrollerRef} style={{ position: "absolute", inset: 0, overflow: "hidden", padding: "0 16px 104px", boxSizing: "border-box" }}>
        {mapSection}
      </div>
      <MobileTabBar active="quest" streak={chipState.stats.streak} lit={streakLit} />
      {sheet}
      <Cursor anchor={anchor} press={press} show variant="tap" />
    </div>
  );
}
