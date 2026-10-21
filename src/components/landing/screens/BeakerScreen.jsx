import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import BeachScene from "../../agents/outreach/BeachScene.jsx";
import BoardCard from "../../agents/outreach/BoardCard.jsx";
import BoardTabs from "../../agents/outreach/BoardTabs.jsx";
import SourceRail from "../../agents/outreach/SourceRail.jsx";
import { COLUMN_BG } from "../../agents/outreach/BoardUi.js";
import { MAX_WORDS, wordCount } from "../../agents/outreach/options.js";
import { SourceLink, domainOf } from "../../agents/outreach/flowUi.jsx";
import Mascot, { mascotFit } from "../../agents/Mascot.jsx";
import { SpeechBubble, TAB_ROOM, TAIL_AT, TIP } from "../../ui/SpeechBubble.jsx";
import { Button, Card, FieldLabel, INPUT_CLASS, inputStyle } from "../../ui/kit.jsx";
import { PixelStamp } from "../../ui/PixelIcons.jsx";
import { BG, BORDER, RADIUS, SANS, TEXT, TEXT_MID, TEXT_MUTED, WHITE, useAgentInk } from "../../ui/tokens.js";
import { lighten, readableOn } from "../../../lib/theme.js";
import { BEAKER_LINES } from "../../../lib/agents/registry.js";
import { parseDay } from "../../../lib/quest.js";
import { Cursor } from "../frames.jsx";
import { TODAY, clamp01, seg, smooth, useReduce } from "../kit.js";
import { BEAKER_DRAFT_TEXT, BEAKER_SAMPLE } from "../data.js";

// Beaker's screen for the agents band (PLAN.md 6.4.6): the real beach band,
// the board's first four columns with the real cards, then the review of a
// drafted email with two sourced facts highlighted and the real sources
// rail. Everyone in it is made up (example.edu). One step; a pure function
// of t:
//   0     the board: To contact, Drafted, Sent, Heard back
//   .22   the pointer goes to Dr. Okafor's card, .3 presses it
//   .34   cross-fade to the review: Beaker's "Special delivery!", the email
//   .5    the review scrolls to the email itself
//   .62   the pointer goes to the first highlighted fact, .7 presses it
//   .72   that fact deepens and lights up on the rail (on a phone, where the
//         rail sits under the email, the source line shows under the email)
//   .9    Beaker back to idle
// Nothing is sent and no card moves. No clock is read: the board's dates
// are counted from TODAY.

const W8 = 800;   // the app's own heading weight inside the recreated review
const noop = () => {};

// The board's six stages, as lib/outreach.js STAGES names them (copied: that
// module is the board's loader, and the landing never imports loaders).
const STAGES = [
  { key: "to_contact", label: "To contact", hint: "People you'd like to reach." },
  { key: "drafted", label: "Drafted", hint: "Written, not sent yet." },
  { key: "sent", label: "Sent", hint: "On its way. Replies can take a week or two." },
  { key: "heard_back", label: "Heard back", hint: "They wrote back. Keep it going." },
  { key: "meeting", label: "Meeting or done", hint: "A chat is set, or you got what you needed." },
  { key: "closed", label: "Closed", hint: "Finished for now, whatever the outcome." },
];
const SHOWN = STAGES.slice(0, 4);
const OKAFOR = BEAKER_SAMPLE.board.find((c) => c.stage === "drafted") || BEAKER_SAMPLE.board[0];

/** An element's top inside `ancestor`, by offsetTop (unaffected by transforms). */
function offsetWithin(el, ancestor) {
  let y = 0;
  let n = el;
  while (n && n !== ancestor) { y += n.offsetTop; n = n.offsetParent; }
  return y;
}

/** A mascot and its line, laid out as the app's MascotSays, but with the
 *  sprite's frames under the screen's `still` (MascotSays has no such prop). */
function Says({ agent, state, size = 80, stacked = false, animate = true, name, children }) {
  const fit = mascotFit(size, agent);
  const beakY = fit.top + fit.beakRow * fit.scale;
  return (
    <div style={{ display: "flex", flexDirection: stacked ? "column" : "row", alignItems: "flex-start",
      gap: stacked ? 20 : 16, minWidth: 0, paddingTop: TAB_ROOM }}>
      <Mascot agent={agent} state={state} size={size} title="" animate={animate} />
      <SpeechBubble side={stacked ? "top" : "left"} name={name}
        tailAt={stacked ? Math.max(TAIL_AT, Math.round(size / 2 - TIP)) : TAIL_AT}
        style={stacked
          ? { alignSelf: "stretch", marginTop: 0 }
          : { marginTop: Math.max(0, Math.round(beakY - TAIL_AT - TIP)), flex: "0 1 auto", maxWidth: 560 }}>
        {children}
      </SpeechBubble>
    </div>
  );
}

/** One column of the board, as BoardColumn draws a well on desktop. */
function Well({ stage, cards, today }) {
  return (
    <section style={{ background: COLUMN_BG, borderRadius: RADIUS.card, padding: 8, minWidth: 0, boxSizing: "border-box",
      display: "flex", flexDirection: "column", minHeight: 260 }}>
      <div style={{ padding: "4px 4px 0" }}>
        <h3 style={{ margin: 0, display: "flex", alignItems: "baseline", gap: 8, fontFamily: SANS, fontSize: "1.05rem",
          fontWeight: W8, color: TEXT, letterSpacing: "-0.01em", lineHeight: 1.3 }}>
          {stage.label}
          <span style={{ fontWeight: 600, color: TEXT_MUTED, fontVariantNumeric: "tabular-nums" }}>{cards.length}</span>
        </h3>
        <p style={{ margin: "3px 0 10px", fontFamily: SANS, fontSize: "0.9rem", fontWeight: 500, color: TEXT_MUTED, lineHeight: 1.45 }}>
          {stage.hint}
        </p>
      </div>
      <div style={{ flex: 1 }}>
        {cards.length > 0 ? (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {cards.map((card, i) => (
              <BoardCard key={card.id} card={card} today={today} stages={STAGES} style={{ marginTop: i === 0 ? 0 : 8 }}
                onOpen={noop} onDetails={noop} onMove={noop} onReorder={noop} />
            ))}
          </ul>
        ) : (
          <p style={{ margin: 0, padding: "18px 12px", borderRadius: RADIUS.control, textAlign: "center",
            border: "2px dashed #d6d1c9", fontFamily: SANS, fontSize: "0.95rem", fontWeight: 600, color: TEXT_MUTED }}>
            Nothing here yet.
          </p>
        )}
      </div>
    </section>
  );
}

export default function BeakerScreen({ step = 0, t = 0, layout = "desktop", still = false }) {
  void step;   // a single step
  const reduce = useReduce();
  const ink = useAgentInk();
  const mobile = layout === "mobile";
  const tt = clamp01(t);
  const tr = (v) => (reduce ? "none" : v);
  const today = useMemo(() => parseDay(TODAY), []);

  // ── Beats ──────────────────────────────────────────────────────────────────
  const review = tt >= 0.34;
  const boardMounted = tt < 0.4;
  const reviewMounted = tt >= 0.3;
  const active = tt >= 0.72 ? 0 : null;
  const beaker = tt >= 0.34 && tt < 0.9 ? "delivering" : "idle";

  let anchor = "beaker-rest";
  let press = false;
  if (tt >= 0.22 && tt < 0.34) { anchor = "beaker-card"; press = tt >= 0.3 && tt < 0.33; }
  else if (tt >= 0.34 && tt < 0.62) anchor = "beaker-rest-review";
  else if (tt >= 0.62) { anchor = "beaker-claim"; press = tt >= 0.7 && tt < 0.73; }

  // ── The email: the highlights' look, as ClaimEditor draws them ────────────
  const look = useMemo(() => {
    const rest = lighten(ink.accent, 0.72);
    const on = lighten(ink.accent, 0.6);
    return { rest, on, restLine: readableOn(ink.accent, rest, 3), onLine: readableOn(ink.accent, on, 3) };
  }, [ink.accent]);
  const words = useMemo(() => wordCount(BEAKER_DRAFT_TEXT), []);
  const claims = useMemo(() => BEAKER_SAMPLE.claims.map((c) => ({ text: c.text, source_url: BEAKER_SAMPLE.sources[c.source].url })), []);
  const sources = useMemo(() => BEAKER_SAMPLE.sources.map((s) => ({ url: s.url, title: s.title, domain: s.host })), []);
  const activeClaim = active !== null ? claims[active] : null;
  const activeTitle = activeClaim ? sources.find((s) => s.url === activeClaim.source_url)?.title : "";

  const paragraphs = BEAKER_SAMPLE.paragraphs;
  const body = [];
  paragraphs.forEach((spans, pi) => {
    spans.forEach((s, si) => {
      if (s.claim === undefined) { body.push(s.text); return; }
      const on = active === s.claim;
      body.push(
        <mark key={`c${pi}-${si}`} data-lp-anchor={s.claim === 0 ? "beaker-claim" : undefined}
          style={{ color: "inherit", background: on ? look.on : look.rest, borderRadius: 3,
            boxShadow: `inset 0 ${on ? -3 : -2}px 0 ${on ? look.onLine : look.restLine}`,
            transition: tr("background 200ms ease, box-shadow 200ms ease") }}>
          {s.text}
        </mark>,
      );
    });
    // The sign-off's two lines sit together; every other paragraph has a blank line after it.
    if (pi < paragraphs.length - 1) body.push(pi === paragraphs.length - 2 ? "\n" : "\n\n");
  });

  // ── Scrolling: the review scrolls to the email at .5 ──────────────────────
  // On a phone the email is long and its source line sits under it, so the
  // scroll lands on the email's box itself rather than its label.
  const scrollerRef = useRef(null);
  const emailRef = useRef(null);
  const boxRef = useRef(null);
  const latest = useRef(tt);
  latest.current = tt;
  const apply = useCallback((now) => {
    const sc = scrollerRef.current;
    const el = mobile ? boxRef.current : emailRef.current;
    if (!sc) return;
    const max = Math.max(0, sc.scrollHeight - sc.clientHeight);
    const target = el ? Math.max(0, Math.min(max, offsetWithin(el, sc) - (mobile ? 8 : 10))) : 0;
    const y = Math.round(target * smooth(seg(now, 0.5, 0.62)));
    if (sc.scrollTop !== y) sc.scrollTop = y;
  }, [mobile]);
  useLayoutEffect(() => { apply(tt); });
  useLayoutEffect(() => {
    const sc = scrollerRef.current;
    if (!sc || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => apply(latest.current));
    ro.observe(sc);
    if (sc.firstElementChild) ro.observe(sc.firstElementChild);
    return () => ro.disconnect();
  }, [apply, mobile, reviewMounted]);

  // The pointer's first target: Dr. Okafor's card (its name button).
  useLayoutEffect(() => {
    const sc = scrollerRef.current;
    const btn = sc?.querySelector(`[data-card-id="${OKAFOR.id}"] button`);
    if (btn) btn.setAttribute("data-lp-anchor", "beaker-card");
  }, [boardMounted, mobile]);

  // ── Layout ─────────────────────────────────────────────────────────────────
  const pad = mobile ? 12 : 16;
  const side = mobile ? 12 : 24;
  const bandH = mobile ? 150 : 200;
  const lowerTop = pad + bandH + 14;
  const counts = Object.fromEntries(STAGES.map((s) => [s.key, BEAKER_SAMPLE.board.filter((c) => c.stage === s.key).length]));
  const cardsOf = (key) => BEAKER_SAMPLE.board.filter((c) => c.stage === key);

  const board = mobile ? (
    <div>
      <BoardTabs stages={STAGES} counts={counts} value="drafted" onChange={noop} />
      <div style={{ marginTop: 6 }}>
        <p style={{ margin: "0 0 12px", fontFamily: SANS, fontSize: "1rem", fontWeight: 500, color: TEXT_MUTED, lineHeight: 1.5 }}>
          {STAGES[1].hint}
        </p>
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {cardsOf("drafted").map((card) => (
            <BoardCard key={card.id} card={card} today={today} stages={STAGES}
              onOpen={noop} onDetails={noop} onMove={noop} onReorder={noop} />
          ))}
        </ul>
      </div>
    </div>
  ) : (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 196px)", gap: 10 }}>
      {SHOWN.map((s) => <Well key={s.key} stage={s} cards={cardsOf(s.key)} today={today} />)}
    </div>
  );

  const rail = (
    <SourceRail claims={claims} sources={sources} activeIndex={active} onSelect={noop} name={BEAKER_SAMPLE.name} />
  );

  const editorCard = (
    <Card as="section" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <FieldLabel>Subject</FieldLabel>
        <input readOnly value={BEAKER_SAMPLE.subject} className={INPUT_CLASS} style={inputStyle} aria-label="Subject" />
      </div>
      <div ref={emailRef}>
        <FieldLabel>Email</FieldLabel>
        <p style={{ margin: "-2px 0 8px", fontFamily: SANS, fontSize: "0.93rem", color: TEXT_MUTED, lineHeight: 1.5 }}>
          Highlighted words are facts about {BEAKER_SAMPLE.name}. Click one to see its source.
        </p>
        <div ref={boxRef} style={{ background: WHITE, border: `1.5px solid ${BORDER}`, borderRadius: RADIUS.control, padding: "11px 13px",
          fontFamily: SANS, fontSize: "1rem", lineHeight: 1.55, color: TEXT, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
          {body}
        </div>
        {mobile && activeClaim && (
          <p style={{ margin: "8px 0 0", fontFamily: SANS, fontSize: "0.95rem", color: TEXT_MID, lineHeight: 1.5,
            overflowWrap: "anywhere" }}>
            <span style={{ fontWeight: W8, color: TEXT }}>Source for this fact: </span>
            <SourceLink url={activeClaim.source_url} inline>
              {activeTitle ? `${activeTitle} (${domainOf(activeClaim.source_url)})` : undefined}
            </SourceLink>
          </p>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: SANS, fontSize: "0.93rem",
            fontWeight: 700, color: TEXT_MUTED, minHeight: 24 }}>
            <span style={{ color: ink.text, display: "flex" }}><PixelStamp kind="check" size={16} /></span> Saved
          </span>
          <span style={{ fontFamily: SANS, fontSize: "0.93rem", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: TEXT_MUTED }}>
            {words} / {MAX_WORDS} words
          </span>
        </div>
      </div>
    </Card>
  );

  const sendCard = (
    <Card as="section" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <h2 style={{ margin: 0, fontFamily: SANS, fontSize: "1.1rem", fontWeight: W8, color: TEXT }}>Send it</h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <Button kind="primary">Send with Gmail</Button>
        <Button kind="secondary">Copy email</Button>
      </div>
    </Card>
  );

  const reviewView = (
    <div style={{ opacity: review ? 1 : 0, transition: tr("opacity 240ms ease") }}>
      <header style={{ margin: "0 0 16px", position: "relative" }}>
        <span data-lp-anchor="beaker-rest-review" aria-hidden="true"
          style={{ position: "absolute", right: "18%", top: 10, width: 0, height: 0 }} />
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 12px" }}>
          {/* The app's h1, drawn as a <p>: the landing page has one h1, the hero's. */}
          <p style={{ margin: 0, fontFamily: SANS, fontWeight: W8, fontSize: mobile ? "1.8rem" : "2.2rem", color: ink.title,
            letterSpacing: "-0.02em", lineHeight: 1.15, overflowWrap: "anywhere" }}>
            {BEAKER_SAMPLE.name}
          </p>
          <span style={{ fontFamily: SANS, fontSize: "0.9rem", fontWeight: W8, color: ink.onSoft, background: ink.soft,
            borderRadius: RADIUS.pill, padding: "4px 12px", whiteSpace: "nowrap" }}>
            {STAGES[1].label}
          </span>
        </div>
        <p style={{ margin: "4px 0 0", fontFamily: SANS, fontSize: "1.05rem", fontWeight: 600, color: TEXT_MUTED, overflowWrap: "anywhere" }}>
          {BEAKER_SAMPLE.org}
        </p>
      </header>

      <div style={{ marginBottom: 16 }}>
        <Says agent="beaker" state={beaker} size={80} stacked={mobile} animate={!still} name="Beaker">
          {BEAKER_LINES.draftReady}
        </Says>
      </div>

      {mobile ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
          {editorCard}
          <Card>{rail}</Card>
          {sendCard}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: 24, alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
            {editorCard}
            {sendCard}
          </div>
          <aside style={{ position: "sticky", top: 0, background: WHITE, border: `1px solid ${BORDER}`, borderRadius: RADIUS.card,
            padding: "1rem 1.1rem", boxSizing: "border-box" }}>
            {rail}
          </aside>
        </div>
      )}
    </div>
  );

  return (
    <div className="ui-page" style={{ position: "absolute", inset: 0, overflow: "hidden", background: BG, fontFamily: SANS,
      "--ag-ring": ink.ring }}>
      <div style={{ padding: `${pad}px ${side}px 0` }}>
        <BeachScene headingAs="p" isMobile={mobile} animate={!still} state={beaker}
          says={mobile ? null : BEAKER_LINES.boardHello} />
      </div>

      <div ref={scrollerRef} style={{ position: "absolute", top: lowerTop, left: 0, right: 0, bottom: 0, overflow: "hidden",
        padding: `0 ${side}px 24px`, boxSizing: "border-box" }}>
        {boardMounted && (
          <div style={{ position: "absolute", top: 0, left: side, right: side, opacity: review ? 0 : 1,
            transition: tr("opacity 240ms ease") }}>
            <span data-lp-anchor="beaker-rest" aria-hidden="true"
              style={{ position: "absolute", left: "70%", top: 150, width: 0, height: 0 }} />
            {board}
          </div>
        )}
        {reviewMounted && reviewView}
        <Cursor anchor={anchor} press={press} show variant={mobile ? "tap" : "arrow"} />
      </div>
    </div>
  );
}
