import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import RidgeScene from "../../agents/finder/RidgeScene.jsx";
import SortingTray from "../../agents/finder/SortingTray.jsx";
import DeadlineTimeline from "../../agents/finder/DeadlineTimeline.jsx";
import { KindTag, TrustBadge } from "../../agents/finder/ListingCard.jsx";
import { checkedLabel, listOf } from "../../agents/finder/finderUi.js";
import { AMBER_TEXT, BG, BORDER, RADIUS, SANS, TEXT, TEXT_MID, TEXT_MUTED, WHITE, useAgentInk } from "../../ui/tokens.js";
import { TALON_LINES } from "../../../lib/agents/registry.js";
import { deadlineLabel, groupByDeadline, isSoon, moneyLine } from "../../../lib/finder.js";
import { parseDay } from "../../../lib/quest.js";
import { Cursor } from "../frames.jsx";
import { TODAY, clamp01, seg, smooth, useReduce } from "../kit.js";
import { FINDER_ITEMS } from "../data.js";

// Talon's screen for the agents band (PLAN.md 6.4.5): the real dawn band,
// the real sorting tray and deadline timeline with the demo student's finds,
// a save that moves Research Science Institute from the tray to the
// timeline, and a recreated slice of the listing drawer. One step; a pure
// function of t:
//   0     the tray holds RSI as a new find; PRIMES-USA and Coolidge on the timeline
//   .2    the pointer goes to RSI's Save, .3 presses it
//   .32   RSI lands in the timeline under December (the board scrolls to it)
//   .45   Talon holds up the find; the drawer slides in over the board
//   .62   the "Verified on its own page" badge stamps in
//   .72   "Why it fits you" appears (the drawer scrolls to it)
//   .9    Talon back to idle
// The band stays put so Talon's pose is always in view; the drawer covers the
// board under it (in the app it covers the whole page). Nothing here reads a
// clock: every "days left" is counted from TODAY.

const W8 = 800;   // the app's own heading weight inside the recreated drawer
const noop = () => {};
const NONE = new Set();
const FOLDS = { closed: false, done: false };
const TRAY_EMPTY = "Nothing new to sort. When Talon finds more, they wait here first.";
const TIMELINE_EMPTY = "Nothing saved yet. Save a find from the tray and it shows up here, under the month it's due.";
const DRAWER_W = 440;
const SLIDE = "cubic-bezier(.22,1,.36,1)";

const CSS = `
@keyframes lp-talon-stamp { from { transform: scale(1.2); } to { transform: scale(1); } }
.lp-talon-stamp { display: inline-flex; transform-origin: 50% 50%; animation: lp-talon-stamp 160ms steps(2, end) both; }
@keyframes lp-talon-in { from { opacity: 0; } to { opacity: 1; } }
.lp-talon-in { animation: lp-talon-in 200ms ease both; }
@media (prefers-reduced-motion: reduce) { .lp-talon-stamp, .lp-talon-in { animation: none; } }
`;
if (typeof document !== "undefined" && !document.querySelector("style[data-lp-talon]")) {
  const el = document.createElement("style");
  el.dataset.lpTalon = "";
  el.textContent = CSS;
  document.head.appendChild(el);
}

const byTitle = (title) => FINDER_ITEMS.find((i) => i.title === title) || null;
const RSI = byTitle("Research Science Institute");
const PRIMES = byTitle("PRIMES-USA");
const COOLIDGE = byTitle("Coolidge Scholarship");

/** An element's top inside `ancestor`, by offsetTop (unaffected by transforms). */
function offsetWithin(el, ancestor) {
  let y = 0;
  let n = el;
  while (n && n !== ancestor) { y += n.offsetTop; n = n.offsetParent; }
  return y;
}

/** The drawer's neutral bullets ("Who it's for"): never a check, since Talon
 *  never compared those lines with the student. */
function Lines({ items }) {
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
      {items.map((text, i) => (
        <li key={`${i}-${text}`} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontFamily: SANS,
          fontSize: "0.98rem", fontWeight: 600, color: TEXT_MID, lineHeight: 1.5, overflowWrap: "anywhere" }}>
          <span aria-hidden="true" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 16,
            height: 16, marginTop: 3, flexShrink: 0 }}>
            <span style={{ width: 6, height: 6, background: TEXT_MUTED }} />
          </span>
          <span>{text}</span>
        </li>
      ))}
    </ul>
  );
}

export default function TalonScreen({ step = 0, t = 0, layout = "desktop", still = false }) {
  void step;   // a single step
  const reduce = useReduce();
  const ink = useAgentInk();
  const mobile = layout === "mobile";
  const tt = clamp01(t);
  const tr = (v) => (reduce ? "none" : v);
  const today = useMemo(() => parseDay(TODAY), []);

  // ── Beats ──────────────────────────────────────────────────────────────────
  const saved = tt >= 0.32;
  const drawerOpen = tt >= 0.45;
  const badgeIn = tt >= 0.62;
  const fitIn = tt >= 0.72;
  const talonState = tt >= 0.45 && tt < 0.9 ? "delivering" : "idle";

  let anchor = "talon-rest";
  let press = false;
  if (tt >= 0.2) { anchor = "talon-save"; press = tt >= 0.3 && tt < 0.33; }
  const showCursor = tt < 0.34;

  // ── The board's data, grouped the way the real page groups it ─────────────
  const rsi = useMemo(() => (RSI ? { ...RSI, status: saved ? "saved" : "new" } : null), [saved]);
  const items = useMemo(() => [PRIMES, COOLIDGE, rsi].filter(Boolean), [rsi]);
  const groups = useMemo(() => groupByDeadline(items, today), [items, today]);

  const facts = useMemo(() => {
    if (!rsi) return [];
    const money = moneyLine(rsi);
    return [
      { label: "Offered by", value: rsi.provider },
      { label: "Deadline", value: deadlineLabel(rsi, today), amber: isSoon(rsi, today) },
      { label: rsi.lane === "scholarship" ? "Amount" : "Cost", value: money || "Not listed on its page" },
      { label: "When", value: rsi.dates_text },
      { label: "Where", value: rsi.location_text },
    ].filter((f) => f.value);
  }, [rsi, today]);
  const eligibility = useMemo(() => listOf(rsi?.eligibility), [rsi]);

  // ── Scrolling: the board to the saved row, the drawer to the fit line ─────
  const boardRef = useRef(null);
  const drawerBodyRef = useRef(null);
  const fitRef = useRef(null);
  const latest = useRef(tt);
  latest.current = tt;

  const apply = useCallback((now) => {
    const sc = boardRef.current;
    if (sc) {
      const max = Math.max(0, sc.scrollHeight - sc.clientHeight);
      const y = Math.round(max * smooth(seg(now, 0.32, 0.44)));
      if (sc.scrollTop !== y) sc.scrollTop = y;
    }
    const body = drawerBodyRef.current;
    const fit = fitRef.current;
    if (body && fit) {
      const max = Math.max(0, body.scrollHeight - body.clientHeight);
      const target = Math.max(0, Math.min(max, offsetWithin(fit, body) - 12));
      const y = Math.round(target * smooth(seg(now, 0.72, 0.82)));
      if (body.scrollTop !== y) body.scrollTop = y;
    }
  }, []);

  useLayoutEffect(() => { apply(tt); });

  // Late layout (fonts arriving, the timeline regrouping): hold the place.
  useLayoutEffect(() => {
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => apply(latest.current));
    [boardRef.current, drawerBodyRef.current].forEach((el) => {
      if (!el) return;
      ro.observe(el);
      if (el.firstElementChild) ro.observe(el.firstElementChild);
    });
    return () => ro.disconnect();
  }, [apply, mobile]);

  // The pointer's target: RSI's Save button in the tray (the title button,
  // then Save, then Dismiss, in the row the real component draws).
  useLayoutEffect(() => {
    const sc = boardRef.current;
    if (!sc || !rsi) return;
    const title = sc.querySelector(`[data-title-for="${rsi.id}"]`);
    const row = title?.closest("li");
    const save = row ? row.querySelectorAll("button")[1] : null;
    if (save) save.setAttribute("data-lp-anchor", "talon-save");
  }, [rsi, mobile]);

  // ── Layout ─────────────────────────────────────────────────────────────────
  const pad = mobile ? 12 : 16;
  const side = mobile ? 12 : 24;
  const bandH = mobile ? 150 : 200;
  const lowerTop = pad + bandH + 14;   // the band plus AgentScene's own 14px under it
  const small = { fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700, color: TEXT_MUTED };

  return (
    <div className="ui-page" style={{ position: "absolute", inset: 0, overflow: "hidden", background: BG, fontFamily: SANS,
      "--ag-ring": ink.ring }}>
      <div style={{ padding: `${pad}px ${side}px 0` }}>
        <RidgeScene headingAs="p" isMobile={mobile} animate={!still} state={talonState}
          says={mobile ? null : TALON_LINES.boardHello} />
      </div>

      {/* The board under the band: its own clipped scroller. */}
      <div ref={boardRef} style={{ position: "absolute", top: lowerTop, left: 0, right: 0, bottom: 0, overflow: "hidden",
        padding: `0 ${side}px 24px`, boxSizing: "border-box" }}>
        <span data-lp-anchor="talon-rest" aria-hidden="true"
          style={{ position: "absolute", left: "56%", top: 40, width: 0, height: 0 }} />
        <SortingTray items={groups.tray} today={today} pending={NONE} limit={3} emptyText={TRAY_EMPTY}
          onOpen={noop} onSave={noop} onDismiss={noop} />
        <div key={saved ? "after" : "before"} className={saved && !reduce ? "lp-talon-in" : undefined}>
          <DeadlineTimeline groups={groups} today={today} open={FOLDS} onToggle={noop} showDismissed={false}
            emptyText={TIMELINE_EMPTY} onOpen={noop} onMove={noop} />
        </div>
        <Cursor anchor={anchor} press={press} show={showCursor} variant={mobile ? "tap" : "arrow"} />
      </div>

      {/* The listing drawer, recreated from ListingDrawer.jsx, over the board. */}
      <div aria-hidden="true" style={{ position: "absolute", top: lowerTop, left: 0, right: 0, bottom: 0,
        background: "rgba(20,20,19,0.3)", opacity: drawerOpen ? 1 : 0, transition: tr("opacity 180ms ease"),
        pointerEvents: "none" }} />
      {rsi && (
        <div style={{ position: "absolute", top: lowerTop, right: 0, bottom: 0, width: mobile ? "100%" : DRAWER_W,
          background: BG, display: "flex", flexDirection: "column", boxSizing: "border-box",
          boxShadow: mobile ? "0 -12px 40px rgba(20,20,19,0.18)" : "-12px 0 40px rgba(20,20,19,0.18)",
          transform: drawerOpen ? "none" : mobile ? "translateY(100%)" : "translateX(100%)",
          transition: tr(`transform 260ms ${SLIDE}`) }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 12px 12px 20px", background: WHITE,
            borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
            <div style={{ flex: 1, minWidth: 0, paddingTop: 4 }}>
              <KindTag kind={rsi.kind} />
              <h2 style={{ margin: "8px 0 0", fontFamily: SANS, fontSize: "1.3rem", fontWeight: W8, color: TEXT,
                letterSpacing: "-0.01em", lineHeight: 1.25, overflowWrap: "anywhere" }}>
                {rsi.title}
              </h2>
            </div>
            <span aria-hidden="true" style={{ flexShrink: 0, width: 44, height: 44, display: "inline-flex", alignItems: "center",
              justifyContent: "center", borderRadius: 10, background: "rgba(20,20,19,0.05)", color: TEXT_MID }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
                strokeLinecap="round" focusable="false">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </span>
          </div>

          <div ref={drawerBodyRef} style={{ position: "relative", flex: 1, minHeight: 0, overflow: "hidden",
            padding: "16px 20px 24px", boxSizing: "border-box" }}>
            {/* Trust and freshness first: where the facts came from, and when. */}
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 12px", minHeight: 30 }}>
              {badgeIn && (
                <span key="badge" className={reduce ? undefined : "lp-talon-stamp"}>
                  <TrustBadge verified />
                </span>
              )}
              <span style={small}>{checkedLabel(rsi, today) || "Not checked yet"}</span>
            </div>

            <dl style={{ margin: "12px 0 0", background: WHITE, border: `1px solid ${BORDER}`, borderRadius: RADIUS.control,
              padding: "4px 14px" }}>
              {facts.map((f, i) => (
                <div key={f.label} style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "128px minmax(0, 1fr)",
                  gap: mobile ? 2 : 12, padding: "10px 0", borderTop: i ? `1px solid ${BORDER}` : "none" }}>
                  <dt style={{ fontFamily: SANS, fontSize: "0.92rem", fontWeight: 700, color: TEXT_MUTED }}>{f.label}</dt>
                  <dd style={{ margin: 0, fontFamily: SANS, fontSize: "1rem", fontWeight: 600, lineHeight: 1.5,
                    color: f.amber ? AMBER_TEXT : TEXT, overflowWrap: "anywhere", fontVariantNumeric: "tabular-nums" }}>
                    {f.value}
                  </dd>
                </div>
              ))}
            </dl>

            <section ref={fitRef} style={{ marginTop: 22, opacity: fitIn ? 1 : 0, transform: fitIn ? "none" : "translateY(6px)",
              transition: tr("opacity 200ms ease, transform 200ms ease") }}>
              <h3 style={{ margin: 0, fontFamily: SANS, fontSize: "1.05rem", fontWeight: W8, color: TEXT }}>Why it fits you</h3>
              <p style={{ margin: "8px 0 0", fontFamily: SANS, fontSize: "1rem", color: TEXT, lineHeight: 1.55,
                overflowWrap: "anywhere" }}>
                {rsi.fit_reason}
              </p>
            </section>
            {eligibility.length > 0 && (
              <section style={{ marginTop: 22, opacity: fitIn ? 1 : 0, transition: tr("opacity 200ms ease") }}>
                <h3 style={{ margin: "0 0 8px", fontFamily: SANS, fontSize: "1.05rem", fontWeight: W8, color: TEXT }}>Who it's for</h3>
                <Lines items={eligibility} />
              </section>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
