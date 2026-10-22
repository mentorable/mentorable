import { useLayoutEffect, useRef } from "react";
import QuestMap from "../quest/QuestMap.jsx";
import SkyBackdrop from "../quest/SkyBackdrop.jsx";
import { StickyHeader, TopBar } from "../quest/QuestPanels.jsx";
import { BG, QuestStyles } from "../quest/questUi.jsx";
import { MobileTabBar } from "./AppChrome.jsx";
import SAMPLE from "./sample.json";

// The Quest home screen as the app draws it on a phone: the real map, sky and
// title bar with the demo student's quest, scrolled so today's task sits in
// the middle, and the bottom tab bar. Laid out at a real 360 x 725 screen;
// the landing page scales it into the phone.

export const QUEST_SHOT = { w: 360, h: 725 };

const STATE = SAMPLE.quest;
const MENU = [{ label: "Change pace", onClick() {} }];
const noop = () => {};

/** An element's top inside `ancestor`, by offsetTop (unaffected by transforms). */
function offsetWithin(el, ancestor) {
  let y = 0;
  let n = el;
  while (n && n !== ancestor) { y += n.offsetTop; n = n.offsetParent; }
  return y;
}

export default function QuestShot() {
  const scroller = useRef(null);
  const todayRef = useRef(null);
  const streakLit = ["done", "rest"].includes(STATE.today_state);

  // Today's callout and stone in the middle of the screen, like the app opens.
  useLayoutEffect(() => {
    const sc = scroller.current;
    if (!sc) return undefined;
    const place = () => {
      const stone = todayRef.current;
      if (!stone) return;
      const slot = stone.closest("[data-slot]") || stone;
      const callout = slot.previousElementSibling;
      const top = offsetWithin(callout || slot, sc);
      const bottom = offsetWithin(stone, sc) + stone.offsetHeight;
      sc.scrollTop = Math.max(0, Math.round((top + bottom) / 2 - sc.clientHeight / 2));
    };
    place();
    // The sky measures itself after the first paint, which can move the map.
    if (typeof ResizeObserver === "undefined") return undefined;
    const watch = new ResizeObserver(place);
    if (sc.firstElementChild) watch.observe(sc.firstElementChild);
    return () => watch.disconnect();
  }, []);

  return (
    <div className="ui-page" style={{ position: "relative", width: QUEST_SHOT.w, height: QUEST_SHOT.h, overflow: "hidden", background: BG,
      textAlign: "left" }}>
      <div ref={scroller} style={{ position: "absolute", inset: 0, overflow: "hidden", padding: "0 16px 104px", boxSizing: "border-box" }}>
        <div style={{ position: "relative", isolation: "isolate", marginTop: 10, padding: "10px 10px 0" }}>
          <QuestStyles />
          <SkyBackdrop isMobile />
          <StickyHeader>
            {/* The page's grey behind the stuck bar, fading into the sky, so the
                map scrolled under it never shows around its edges. */}
            <span aria-hidden="true" style={{ position: "absolute", left: -48, right: -48, top: -10, bottom: -28,
              background: `linear-gradient(to bottom, ${BG} 0, ${BG} calc(100% - 18px), rgba(245,245,245,0) 100%)` }} />
            <div style={{ position: "relative" }}>
              <TopBar title={STATE.quest.title} stats={STATE.stats} streakLit={streakLit} menu={MENU} isMobile headingAs="p" />
            </div>
          </StickyHeader>
          <QuestMap state={STATE} todayRef={todayRef} focusSlot={STATE.today_slot} onOpen={noop} onStartToday={noop}
            onCatchUp={noop} justDone={null} glowMilestone={null} isMobile />
        </div>
      </div>
      <MobileTabBar active="quest" streak={STATE.stats.streak} lit={streakLit} />
    </div>
  );
}
