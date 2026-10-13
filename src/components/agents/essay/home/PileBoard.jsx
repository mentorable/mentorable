import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { RADIUS, SANS, TEXT, TEXT_MID, TEXT_MUTED } from "../../../ui/tokens.js";
import { TOPIC_STATUS } from "../../../../lib/essay.js";
import Sheet from "../../outreach/Sheet.jsx";
import BoardTabs, { PANEL_ID, tabId } from "../../outreach/BoardTabs.jsx";
import { COLUMN_BG } from "../../outreach/BoardUi.js";
import { SR_ONLY } from "../../../ui/kit.jsx";
import { SheetHeader } from "./homeParts.jsx";
import { PILE_EMPTY } from "./IdeaParts.jsx";
import PileCard from "./PileCard.jsx";
import TopicCard from "./TopicCard.jsx";

// The ideas as three piles (exploring, writing about it, set aside), one
// column each on a wide screen and one pile at a time, under tabs, on a
// phone. A card moves between piles with its "Move to" menu (a drag is never
// needed). The move itself is the page's: it shows the card in its new pile
// at once and puts it back, with a message, if the save fails.
//
// "Open" shows the whole card (record evidence, questions, notes, the ways
// on) in a drawer. The drawer holds the one editable copy of a card, so a
// card's notes box exists only while it is open.

function Pile({ stage, cards, mobile, headingId, render }) {
  const empty = cards.length === 0;
  const body = (
    <>
      {empty && (
        <p style={{ margin: 0, padding: "10px 12px 14px", fontFamily: SANS, fontSize: "0.95rem", fontWeight: 600,
          color: TEXT_MID, lineHeight: 1.5 }}>
          {PILE_EMPTY[stage.key]}
        </p>
      )}
      {!empty && (
        <ul aria-labelledby={mobile ? tabId(stage.key) : headingId}
          style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          {cards.map((t) => <li key={t.id} style={{ minWidth: 0 }}>{render(t)}</li>)}
        </ul>
      )}
    </>
  );
  // One pile at a time: the tabs name it, and a hidden heading keeps the
  // levels in order (Ideas, the pile, then each card).
  if (mobile) {
    return (
      <>
        <h3 id={headingId} style={SR_ONLY}>{stage.label}</h3>
        {body}
      </>
    );
  }
  return (
    <section aria-labelledby={headingId}
      style={{ background: COLUMN_BG, borderRadius: RADIUS.card, padding: "12px 10px 14px", minWidth: 0, minHeight: 180,
        boxSizing: "border-box" }}>
      <h3 id={headingId} style={{ margin: 0, display: "flex", alignItems: "baseline", gap: 8, padding: "0 6px 10px",
        fontFamily: SANS, fontSize: "1.05rem", fontWeight: 800, color: TEXT }}>
        {stage.label}
        <span style={{ fontSize: "0.95rem", fontWeight: 600, color: TEXT_MUTED, fontVariantNumeric: "tabular-nums" }}>
          {cards.length}
        </span>
      </h3>
      {body}
    </section>
  );
}

/**
 * topics: the cards in board order. linked: Map of topic id to essays.
 * fresh: Set of ids that arrived this visit. mobile: one pile at a time.
 * The rest are the page's handlers, as IdeasSection receives them.
 */
export default function PileBoard({
  topics, linked, fresh, mobile, onStatus, onSaveNotes, onDelete, onBrainstorm, onStartEssay, onOpenEssay, onDirty,
}) {
  const uid = useId();
  const rootRef = useRef(null);
  const [tab, setTab] = useState("exploring");
  const [openId, setOpenId] = useState(null);
  const pendingFocus = useRef(null);
  const cancelAsk = useRef(null);       // the open card's way out of its delete question, or null

  // Cards that just arrived (a search, a brainstorm) should be on the screen:
  // on a phone, show the pile of the first one. Done while rendering, so the
  // page's own "focus the new card" finds it already there.
  const freshKey = fresh && fresh.size ? [...fresh].sort().join(",") : "";
  const [seenFresh, setSeenFresh] = useState(freshKey);
  if (freshKey !== seenFresh) {
    setSeenFresh(freshKey);
    const first = topics.find((t) => fresh?.has(t.id));
    if (first && first.status !== tab) setTab(first.status);
  }

  // After a move, focus follows the card to where it landed.
  useEffect(() => {
    const id = pendingFocus.current;
    if (!id) return;
    const el = [...(rootRef.current?.querySelectorAll("[data-topic-title]") || [])]
      .find((n) => n.getAttribute("data-topic-title") === id);
    if (el) { pendingFocus.current = null; el.focus(); }
  }, [topics, tab]);

  const move = (topic, key) => {
    if (key === topic.status) return;
    pendingFocus.current = topic.id;
    if (mobile) setTab(key);
    onStatus?.(topic, key);
  };

  const open = openId ? topics.find((t) => t.id === openId) || null : null;
  const openerOf = (id) => [...(rootRef.current?.querySelectorAll("[data-open-for]") || [])]
    .find((n) => n.getAttribute("data-open-for") === id);
  // The drawer closes before another sheet opens; focus goes to the card's
  // Open button first, so that is where the next sheet hands it back.
  const leaveFor = (topic, go) => () => {
    openerOf(topic.id)?.focus();
    setOpenId(null);
    go?.(topic);
  };

  const closeDrawer = () => {
    if (cancelAsk.current) { cancelAsk.current(); return; }
    if (open) openerOf(open.id)?.focus();
    setOpenId(null);
  };

  const counts = {};
  for (const s of TOPIC_STATUS) counts[s.key] = topics.filter((t) => t.status === s.key).length;
  const known = new Set(TOPIC_STATUS.map((s) => s.key));
  const inPile = (key) => topics.filter((t) => (known.has(t.status) ? t.status : "exploring") === key);

  const render = (t) => (
    <PileCard topic={t} essays={linked?.get(t.id) || []} fresh={!!fresh?.has(t.id)}
      onOpen={() => setOpenId(t.id)} onMove={(key) => move(t, key)} onOpenEssay={onOpenEssay} />
  );
  const stage = TOPIC_STATUS.find((s) => s.key === tab) || TOPIC_STATUS[0];

  return (
    <div ref={rootRef}>
      {mobile ? (
        <>
          <BoardTabs stages={TOPIC_STATUS} counts={counts} value={stage.key} onChange={setTab} />
          <div id={PANEL_ID} role="tabpanel" aria-labelledby={tabId(stage.key)}
            style={{ background: COLUMN_BG, borderRadius: RADIUS.card, padding: 10, boxSizing: "border-box" }}>
            <Pile stage={stage} cards={inPile(stage.key)} mobile headingId={`${uid}-${stage.key}`} render={render} />
          </div>
        </>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, alignItems: "start" }}>
          {TOPIC_STATUS.map((s) => (
            <Pile key={s.key} stage={s} cards={inPile(s.key)} mobile={false} headingId={`${uid}-${s.key}`} render={render} />
          ))}
        </div>
      )}

      <AnimatePresence>
        {open && (
          <Sheet key={open.id} labelledBy={`${uid}-drawer`} width={600} onClose={closeDrawer}>
            <SheetHeader id={`${uid}-drawer`} title="Idea card" onClose={closeDrawer} />
            <TopicCard inDrawer topic={open} essays={linked?.get(open.id) || []} fresh={false}
              onStatus={(key) => onStatus?.(open, key)}
              onSaveNotes={(text, opts) => onSaveNotes?.(open, text, opts)}
              onConfirming={(cancel) => { cancelAsk.current = cancel; }}
              onDelete={async () => { await onDelete?.(open); setOpenId(null); }}
              onBrainstorm={leaveFor(open, (t) => onBrainstorm?.(t.id))}
              onStartEssay={leaveFor(open, (t) => onStartEssay?.(t))}
              onOpenEssay={(id) => { setOpenId(null); onOpenEssay?.(id); }}
              onDirty={onDirty} />
          </Sheet>
        )}
      </AnimatePresence>
    </div>
  );
}
