import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { requireUser } from "../lib/auth.js";
import { agentsApi } from "../lib/agentsApi.js";
import { BEAKER_LINES } from "../lib/agents/registry.js";
import {
  STAGES, addContact, defaultFollowUpOn, deleteContact, followUpDue, groupByStage, lastSentAt, loadBoard,
  moveContact, placeAt, sentStampFor, stageLabel, toContact, topPosition, updateContact, daysSinceSent,
} from "../lib/outreach.js";
import { MascotSays } from "../components/agents/SpeechBubble.jsx";
import { PixelArrow, PixelStamp } from "../components/agents/PixelIcons.jsx";
import {
  AMBER_TEXT, BG, BORDER, FOCUS_CLASS, PRESS_CLASS, RADIUS, SANS, TEXT, TEXT_MID, TEXT_MUTED, WHITE, useAgentInk,
} from "../components/agents/agentUi.js";
import BoardColumn from "../components/agents/outreach/BoardColumn.jsx";
import BoardTabs, { PANEL_ID, tabId } from "../components/agents/outreach/BoardTabs.jsx";
import BoardNudges from "../components/agents/outreach/BoardNudges.jsx";
import BoardEmpty from "../components/agents/outreach/BoardEmpty.jsx";
import BoardSkeleton from "../components/agents/outreach/BoardSkeleton.jsx";
import BoardToast from "../components/agents/outreach/BoardToast.jsx";
import ContactDrawer from "../components/agents/outreach/ContactDrawer.jsx";
import { pageLinkIn } from "../components/agents/outreach/ContactForm.jsx";
import { COLUMN_GAP, COLUMN_MIN, SCROLL_CLASS, SR_ONLY, boardRing, triesText } from "../components/agents/outreach/BoardUi.js";
import { BLOCK_COPY, budgetOf, researchBlock } from "../components/agents/outreach/options.js";
import { SIDEBAR_WIDTH } from "../components/common/Sidebar.jsx";
import { useIsMobile } from "../hooks/useIsMobile.js";

// Beaker's board (/agents/outreach): everyone the student is reaching out to,
// from a first idea to a finished conversation, in six stages. Cards come
// from Beaker's tries and from the student's own hand (free). Calm shell,
// playful pelican.
//
// Moves are optimistic: the card jumps at once and jumps back, with a
// message, if the save fails. Desktop drags between columns; every card also
// has a "Move to" menu, the only way on a phone (one stage per tab there).

// The real calls. The page takes them as one object so it can be driven with
// made-up data when checking it by hand (see CollegeListPage).
const REAL_API = {
  requireUser, loadBoard, addContact, updateContact, moveContact, deleteContact,
  status: () => agentsApi.status(),
};

const TAB_KEY = "mentorable.outreachTab";
function readTab() {
  try {
    const v = sessionStorage.getItem(TAB_KEY);
    return STAGES.some((s) => s.key === v) ? v : null;
  } catch { return null; }
}
function writeTab(key) {
  try { sessionStorage.setItem(TAB_KEY, key); } catch { /* storage blocked: the tab just resets */ }
}

// What the Google connect sends back to (see the backend's safe_return_to).
const GMAIL_NOTES = {
  connected: { message: "Gmail is connected. Beaker can send the emails you approve, and nothing else.", tone: "info" },
  denied: { message: "Gmail wasn't connected. You can still copy any email and send it yourself.", tone: "info" },
  error: { message: "Couldn't connect Gmail just now. Try again from a draft.", tone: "error" },
};

const newPath = (params) => {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
  return q ? `/agents/outreach/new?${q}` : "/agents/outreach/new";
};

export default function OutreachBoardPage({ navigate, api = REAL_API }) {
  const isMobile = useIsMobile();
  const ink = useAgentInk();
  const [phase, setPhase] = useState("loading");    // loading | ready | error
  const [userId, setUserId] = useState(null);
  const [cards, setCards] = useState([]);
  const [status, setStatus] = useState(null);       // agentsApi.status(), once it answers
  const [drawer, setDrawer] = useState(null);       // { mode: "add" } | { mode: "edit", id }
  const [pending, setPending] = useState(() => new Set());
  const [drag, setDrag] = useState(null);           // { id, stage, index } while a card is dragged
  const [tab, setTab] = useState(readTab);
  const [toast, setToast] = useState(null);
  const [announce, setAnnounce] = useState("");
  const alive = useRef(true);
  const toastTimer = useRef(null);
  const focusAfterMove = useRef(null);
  const boardHeadingRef = useRef(null);
  const addButtonRef = useRef(null);
  const panelRef = useRef(null);

  const notify = useCallback((message, tone = "info") => {
    clearTimeout(toastTimer.current);
    setToast({ message, tone, key: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), tone === "error" ? 7000 : 4500);
  }, []);

  const load = useCallback(async () => {
    setPhase("loading");
    let user = null;
    try { user = await api.requireUser(); } catch { user = null; }
    if (!alive.current) return;
    if (!user) { navigate?.("/auth"); return; }
    setUserId(user.id);
    // Tries and Gmail come from the backend; the board works without them.
    api.status()
      .then((s) => { if (alive.current) setStatus(s || null); })
      .catch((e) => console.warn("[outreach] status failed:", e));
    try {
      const rows = await api.loadBoard(user.id);
      if (!alive.current) return;
      setCards(rows);
      setPhase("ready");
    } catch (e) {
      console.error("[outreach] board load failed:", e);
      if (alive.current) setPhase("error");
    }
  }, [api, navigate]);

  useEffect(() => {
    alive.current = true;
    load();
    return () => { alive.current = false; clearTimeout(toastTimer.current); };
  }, [load]);

  // Back from connecting Gmail: say how it went, then drop the flag from the URL.
  useEffect(() => {
    let flag = null;
    try { flag = new URLSearchParams(window.location.search).get("gmail"); } catch { flag = null; }
    const note = flag && GMAIL_NOTES[flag];
    if (!note) return;
    notify(note.message, note.tone);
    navigate?.(window.location.pathname, { replace: true });
  }, [navigate, notify]);

  const grouped = useMemo(() => groupByStage(cards), [cards]);
  const today = new Date();
  const tries = budgetOf(status?.tries);
  // Nothing new can start: no tries, or no research runs (which a try whose
  // research failed still used up). Everything else on the board still works.
  const block = researchBlock(status);
  const stop = block ? BLOCK_COPY[block] : null;
  const openTry = status?.open_try?.id ? status.open_try : null;
  const due = cards.filter((c) => followUpDue(c, today))
    .sort((a, b) => (daysSinceSent(b, today) ?? 0) - (daysSinceSent(a, today) ?? 0));
  const activeTab = tab || STAGES.find((s) => grouped[s.key].length)?.key || STAGES[0].key;

  // After a move from the menu, focus follows the card (or, on a phone where
  // it left this tab, lands on the tab's panel).
  useEffect(() => {
    const id = focusAfterMove.current;
    if (!id) return;
    focusAfterMove.current = null;
    const btn = [...document.querySelectorAll("[data-move-for]")].find((el) => el.dataset.moveFor === id);
    if (btn) btn.focus();
    else panelRef.current?.focus();
  }, [cards]);

  const markPending = (ids, on) => setPending((prev) => {
    const next = new Set(prev);
    ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
    return next;
  });

  // ─── Moving ─────────────────────────────────────────────────────────────────

  const move = async (card, stage, index, { fromMenu = false } = {}) => {
    if (!userId || pending.has(card.id)) return;
    const column = grouped[stage] || [];
    const from = column.findIndex((c) => c.id === card.id);
    const list = column.filter((c) => c.id !== card.id);
    const at = Math.max(0, Math.min(index, list.length));
    if (from !== -1 && from === at) return;    // dropped where it already was

    const plan = placeAt(list, at);
    // Renumbering a neighbour whose own save is still in flight could race
    // it; that is rare enough to just skip this drop.
    if (plan.respace.some((r) => pending.has(r.id))) return;
    const extra = sentStampFor(card, stage);
    const shifted = new Map(plan.respace.map((r) => [r.id, r.position]));
    const touched = [card.id, ...shifted.keys()];
    const before = new Map(cards.filter((c) => touched.includes(c.id)).map((c) => [c.id, c]));
    const now = new Date().toISOString();

    setCards((prev) => prev.map((c) => {
      if (c.id === card.id) return toContact({ ...c, ...extra, stage, position: plan.position, updated_at: now });
      return shifted.has(c.id) ? { ...c, position: shifted.get(c.id) } : c;
    }));
    markPending(touched, true);
    if (fromMenu) focusAfterMove.current = card.id;

    try {
      const saved = await api.moveContact(userId, card.id, stage, plan.position, extra);
      if (!alive.current) return;
      setCards((prev) => prev.map((c) => (c.id === saved.id ? saved : c)));
    } catch (e) {
      console.warn("[outreach] move failed:", e);
      if (!alive.current) return;
      if (fromMenu) focusAfterMove.current = card.id;   // back to the card, where it is again
      setCards((prev) => prev.map((c) => before.get(c.id) || c));
      markPending(touched, false);
      notify(`Couldn't move ${card.name}. It's back where it was.`, "error");
      return;
    }

    // Two cards shared a position: the others in the stage were renumbered
    // too. Any of those that did not save goes back to what the server has.
    if (plan.respace.length) {
      const results = await Promise.allSettled(
        plan.respace.map((r) => api.updateContact(userId, r.id, { position: r.position })));
      if (!alive.current) return;
      const byId = new Map(plan.respace.map((r, k) => [r.id, results[k]]));
      setCards((prev) => prev.map((c) => {
        const r = byId.get(c.id);
        if (!r) return c;
        return r.status === "fulfilled" && r.value ? r.value : (before.get(c.id) || c);
      }));
    }
    markPending(touched, false);
    setAnnounce(`${card.name} moved to ${stageLabel(stage)}.`);
  };

  const moveToStage = (card, stage) => move(card, stage, 0, { fromMenu: true });
  const reorder = (card, dir) => {
    const column = grouped[card.stage] || [];
    const i = column.findIndex((c) => c.id === card.id);
    if (i < 0) return;
    move(card, card.stage, dir === "up" ? i - 1 : i + 1, { fromMenu: true });
  };

  const dragProps = {
    dragId: drag?.id ?? null,
    onDragStart: (card) => setDrag({ id: card.id, stage: null, index: null }),
    onDragEnd: () => setDrag(null),
    onDragOverAt: (stage, index) => setDrag((d) => (d && (d.stage !== stage || d.index !== index) ? { ...d, stage, index } : d)),
    onDragLeaveColumn: (stage) => setDrag((d) => (d && d.stage === stage ? { ...d, stage: null, index: null } : d)),
    onDropAt: (stage, index) => {
      const card = drag && cards.find((c) => c.id === drag.id);
      setDrag(null);
      if (card) move(card, stage, index);
    },
  };

  // ─── Opening, adding, editing ─────────────────────────────────────────────

  // A card Beaker made opens its email (the review page); its "..." button
  // opens the drawer for notes, the follow-up date and Delete. A card the
  // student made opens the drawer.
  const openCard = (card) => {
    if (card.created_by === "agent") navigate?.(`/agents/outreach/${card.id}`);
    else setDrawer({ mode: "edit", id: card.id });
  };
  const openDetails = (card) => setDrawer({ mode: "edit", id: card.id });

  const drawerCard = drawer?.mode === "edit" ? cards.find((c) => c.id === drawer.id) : null;

  /** Save the drawer's changes to `card`. Returns { saved, patch }: the card
   *  as saved (the same card, and an empty patch, when nothing changed).
   *  Throws, with a message fit to show. */
  const saveEdit = async (card, values) => {
    const patch = {};
    for (const key of ["name", "title", "organization", "email", "notes", "follow_up_on"]) {
      const was = card[key] ?? "";
      const now = values[key] ?? "";
      if (was !== now) patch[key] = key === "email" || key === "follow_up_on" ? (now || null) : now;
    }
    if (values.stage && values.stage !== card.stage) {
      const stamp = sentStampFor(card, values.stage);
      // The student's own date wins over the one a send would start.
      if ("follow_up_on" in patch) delete stamp.follow_up_on;
      Object.assign(patch, stamp, {
        stage: values.stage,
        position: topPosition((grouped[values.stage] || []).filter((c) => c.id !== card.id)),
      });
    }
    if (!Object.keys(patch).length) return { saved: card, patch };
    const saved = await api.updateContact(userId, card.id, patch);
    if (alive.current) setCards((prev) => prev.map((c) => (c.id === saved.id ? saved : c)));
    return { saved, patch };
  };

  const saveDrawer = async (values) => {
    if (drawer.mode === "add") {
      const stage = values.stage || "to_contact";
      let saved = await api.addContact(userId, { ...values, stage, position: topPosition(grouped[stage]) });
      // A card added straight into Sent was sent by hand: stamp it, which the
      // insert itself is not allowed to do.
      if (stage === "sent" && !lastSentAt(saved)) {
        try {
          saved = await api.updateContact(userId, saved.id, {
            manual_sent_at: new Date().toISOString(),
            ...(values.follow_up_on ? {} : { follow_up_on: defaultFollowUpOn() }),
          });
        } catch (e) {
          console.warn("[outreach] could not stamp a new Sent card:", e);
        }
      }
      if (!alive.current) return;
      setCards((prev) => [saved, ...prev.filter((c) => c.id !== saved.id)]);
      setDrawer(null);
      if (isMobile) { setTab(stage); writeTab(stage); }
      notify(`Added ${saved.name} to ${stageLabel(stage)}.`);
      return;
    }

    const card = drawerCard;
    if (!card) { setDrawer(null); return; }
    const { saved, patch } = await saveEdit(card, values);
    if (!alive.current) return;
    setDrawer(null);
    if (!Object.keys(patch).length) return;
    notify(patch.stage ? `Saved. ${saved.name} is in ${stageLabel(saved.stage)} now.` : "Saved.");
  };

  const deleteDrawerCard = async () => {
    const card = drawerCard;
    if (!card) return;
    await api.deleteContact(userId, card.id);
    if (!alive.current) return;
    setCards((prev) => prev.filter((c) => c.id !== card.id));
    setDrawer(null);
    notify(`Deleted ${card.name}.`);
  };

  // "Draft with Beaker" on a card the student made: what they typed is saved
  // first (a failed save keeps the drawer open, with the message there), then
  // the flow starts from the name, the organization and any link in the
  // notes. Beaker's draft lands on a new card; the drawer says so.
  const draftWithBeaker = async (values) => {
    const card = drawerCard;
    if (card) await saveEdit(card, values);
    if (!alive.current) return;
    setDrawer(null);
    navigate?.(newPath({
      name: values.name.trim(), org: values.organization.trim(), url: pageLinkIn(values.notes),
    }));
  };

  const openEmail = () => {
    const card = drawerCard;
    setDrawer(null);
    if (card) navigate?.(`/agents/outreach/${card.id}`);
  };

  // ─── Layout ─────────────────────────────────────────────────────────────────

  const pagePad = {
    minHeight: "100vh", background: BG, fontFamily: SANS, boxSizing: "border-box",
    // A little narrower at the sides than other pages: six columns want the room.
    padding: isMobile ? "1.25rem 1rem 6rem" : "2.25rem 1.5rem 4rem",
    paddingLeft: isMobile ? "1rem" : `calc(${SIDEBAR_WIDTH}px + 1.5rem)`,
    "--ag-ring": boardRing(ink.accent),
  };

  const header = (
    <>
      <button type="button" className={FOCUS_CLASS} onClick={() => navigate?.("/agents")}
        style={{ minHeight: 44, display: "inline-flex", alignItems: "center", gap: 8, margin: "0 0 4px -8px", padding: "0 8px",
          border: "none", background: "none", borderRadius: 10, cursor: "pointer", fontFamily: SANS, fontSize: "0.95rem",
          fontWeight: 700, color: TEXT_MUTED }}>
        <PixelArrow size={16} style={{ transform: "scaleX(-1)" }} />
        Agents
      </button>
      <h1 style={{ fontFamily: SANS, fontWeight: 800, fontSize: isMobile ? "2.1rem" : "2.5rem", color: ink.title,
        letterSpacing: "-0.03em", margin: "0 0 1rem", lineHeight: 1.1 }}>
        Outreach
      </h1>
    </>
  );

  if (phase !== "ready") {
    return (
      <div data-sidebar-offset style={pagePad}>
        <div style={{ maxWidth: 1400, margin: "0 auto", width: "100%" }}>
          {header}
          {phase === "loading" ? (
            <div aria-busy="true">
              <p role="status" style={SR_ONLY}>Loading your board</p>
              <BoardSkeleton mobile={isMobile} />
            </div>
          ) : (
            <div style={{ maxWidth: 640 }}>
              <MascotSays state="thinking" size={80} layout="auto">
                {BEAKER_LINES.error}
              </MascotSays>
              <button type="button" className={`${FOCUS_CLASS} ${PRESS_CLASS}`} onClick={load}
                style={{ marginTop: 18, minHeight: 44, padding: "0 22px", borderRadius: RADIUS.control, border: "none",
                  background: ink.button.bg, color: ink.button.fg, fontFamily: SANS, fontSize: "1rem", fontWeight: 700,
                  cursor: "pointer" }}>
                Try again
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const empty = cards.length === 0;
  const counts = Object.fromEntries(STAGES.map((s) => [s.key, grouped[s.key].length]));
  const columnProps = {
    today, stages: STAGES, busyIds: pending,
    onOpen: openCard, onDetails: openDetails, onMove: moveToStage, onReorder: reorder,
  };

  return (
    <div data-sidebar-offset style={pagePad}>
      <div style={{ maxWidth: 1400, margin: "0 auto", width: "100%" }}>
        {header}

        {/* One Beaker at a time: when follow-ups are due, the nudge speaks
            instead (unless the student needs to hear about their tries). */}
        {!empty && (stop || due.length === 0) && (
          <div style={{ maxWidth: 760 }}>
            <MascotSays state="idle" size={72} layout="auto">
              {stop ? stop.line : BEAKER_LINES.boardHello}
            </MascotSays>
          </div>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px 12px", margin: "18px 0 22px" }}>
          <button type="button" className={`${FOCUS_CLASS} ${stop ? "" : PRESS_CLASS}`}
            aria-disabled={!!stop || undefined} aria-describedby={tries || stop ? "ob-tries" : undefined}
            onClick={() => { if (!stop) navigate?.(newPath({})); }}
            style={{ minHeight: 48, padding: "0 22px", display: "inline-flex", alignItems: "center", gap: 9,
              borderRadius: RADIUS.control, border: stop ? `1.5px solid ${BORDER}` : "none",
              background: stop ? "#e9e6e1" : ink.button.bg, color: stop ? TEXT_MUTED : ink.button.fg,
              fontFamily: SANS, fontSize: "1.05rem", fontWeight: 800, cursor: stop ? "not-allowed" : "pointer" }}>
            <PixelStamp kind="letter" size={16} />
            New outreach
          </button>
          <button type="button" ref={addButtonRef} className={FOCUS_CLASS} onClick={() => setDrawer({ mode: "add" })}
            style={{ minHeight: 48, padding: "0 18px", borderRadius: RADIUS.control, border: `1.5px solid ${BORDER}`,
              background: WHITE, color: TEXT_MID, fontFamily: SANS, fontSize: "1rem", fontWeight: 700, cursor: "pointer" }}>
            Add a contact
          </button>
          {(tries || stop) && (
            <span id="ob-tries" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: SANS,
              fontSize: "0.95rem", fontWeight: 700, color: stop ? AMBER_TEXT : TEXT_MUTED, fontVariantNumeric: "tabular-nums" }}>
              {stop ? stop.title : triesText(tries.left)}
              {stop && <span style={SR_ONLY}>. {stop.line}</span>}
            </span>
          )}
        </div>

        {openTry && (
          <div style={{ maxWidth: 760, margin: "-6px 0 22px", padding: "12px 12px 12px 16px", background: WHITE,
            borderStyle: "solid", borderWidth: "1px 1px 1px 4px", borderRadius: RADIUS.control,
            borderColor: `${BORDER} ${BORDER} ${BORDER} ${boardRing(ink.accent)}`,
            display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 14px" }}>
            <p style={{ flex: "1 1 260px", margin: 0, fontFamily: SANS, fontSize: "1rem", fontWeight: 600, color: TEXT, lineHeight: 1.5 }}>
              {openTry.pending_question
                ? "Beaker has one quick question before it can write your draft."
                : "You have an outreach in progress."}
            </p>
            <button type="button" className={`${FOCUS_CLASS} ${PRESS_CLASS}`}
              onClick={() => navigate?.(newPath({ try: openTry.id }))}
              style={{ minHeight: 44, padding: "0 16px", display: "inline-flex", alignItems: "center", gap: 8,
                borderRadius: RADIUS.control, border: "none", background: ink.button.bg, color: ink.button.fg,
                fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700, cursor: "pointer" }}>
              Pick up where you left off
              <PixelArrow size={16} />
            </button>
          </div>
        )}

        {empty ? (
          <BoardEmpty stopLine={stop?.line || null} onGoal={(goal) => navigate?.(newPath({ goal }))} />
        ) : (
          <>
            <BoardNudges cards={due} today={today} onOpen={openCard} />

            <h2 ref={boardHeadingRef} tabIndex={-1} style={SR_ONLY}>Your board</h2>
            {isMobile ? (
              <>
                <BoardTabs stages={STAGES} counts={counts} value={activeTab}
                  onChange={(key) => { setTab(key); writeTab(key); }} />
                <div ref={panelRef} id={PANEL_ID} role="tabpanel" aria-labelledby={tabId(activeTab)} tabIndex={-1}
                  style={{ outline: "none", marginTop: 6 }}>
                  <BoardColumn key={activeTab} mobile stage={STAGES.find((s) => s.key === activeTab)}
                    cards={grouped[activeTab]} {...columnProps} />
                </div>
              </>
            ) : (
              // position: relative keeps the screen-reader-only text in the
              // columns inside this scroller, so it never widens the page.
              <div role="region" aria-label="Stages" tabIndex={0} className={`${FOCUS_CLASS} ${SCROLL_CLASS}`}
                style={{ position: "relative", overflowX: "auto", paddingBottom: 10, borderRadius: RADIUS.card }}>
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${STAGES.length}, minmax(${COLUMN_MIN}px, 1fr))`,
                  gap: COLUMN_GAP, alignItems: "stretch" }}>
                  {STAGES.map((s) => (
                    <BoardColumn key={s.key} stage={s} cards={grouped[s.key]} headingId={`ob-col-${s.key}`}
                      {...columnProps} {...dragProps} dropIndex={drag?.stage === s.key ? drag.index : null} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <p aria-live="polite" style={SR_ONLY}>{announce}</p>
      <BoardToast toast={toast} onDismiss={() => { clearTimeout(toastTimer.current); setToast(null); }} />

      <AnimatePresence>
        {drawer && (drawer.mode === "add" || drawerCard) && (
          <ContactDrawer key={drawer.mode === "add" ? "add" : drawer.id} mode={drawer.mode} card={drawerCard}
            canDraft={!stop} draftNote={stop ? stop.short : null}
            onSave={saveDrawer} onDelete={deleteDrawerCard} onDraft={draftWithBeaker} onOpenEmail={openEmail}
            onClose={() => setDrawer(null)} onFallbackFocus={() => (boardHeadingRef.current || addButtonRef.current)?.focus()} />
        )}
      </AnimatePresence>
    </div>
  );
}
