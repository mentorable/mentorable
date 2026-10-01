import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { requireUser } from "../lib/auth.js";
import { agentsApi, finderErrorMessage } from "../lib/agentsApi.js";
import { TALON_LINES } from "../lib/agents/registry.js";
import {
  LANES, RECHECKS_PER_ITEM, daysLeft, deleteItem, groupByDeadline, isSoon, loadItems, statusLabel, timelinePlace,
  updateItem,
} from "../lib/finder.js";
import { MascotSays } from "../components/agents/SpeechBubble.jsx";
import { PixelArrow, PixelStamp } from "../components/agents/PixelIcons.jsx";
import {
  AMBER_TEXT, BG, BORDER, FOCUS_CLASS, PRESS_CLASS, RADIUS, SANS, TEXT, TEXT_MUTED, WHITE, ringVar, useAgentInk,
} from "../components/agents/agentUi.js";
import { Button, SR_ONLY } from "../components/agents/outreach/flowUi.jsx";
import BoardToast from "../components/agents/outreach/BoardToast.jsx";
import ListingDrawer from "../components/agents/finder/ListingDrawer.jsx";
import FinderEmpty from "../components/agents/finder/FinderEmpty.jsx";
import DueSoon from "../components/agents/finder/DueSoon.jsx";
import LaneFilter, { DismissedToggle } from "../components/agents/finder/LaneFilter.jsx";
import SortingTray from "../components/agents/finder/SortingTray.jsx";
import DeadlineTimeline, { TimelineSkeleton } from "../components/agents/finder/DeadlineTimeline.jsx";
import {
  TALON, blockCopy, budgetOf, findsBlock, laneLabel, newPath, topPosition,
} from "../components/agents/finder/finderUi.js";
import { SIDEBAR_WIDTH } from "../components/common/Sidebar.jsx";
import { useIsMobile } from "../hooks/useIsMobile.js";

// Talon's board (/agents/finder), a deadline timeline: new finds wait in a
// sorting tray at the top (Save or Dismiss each), and everything the student
// kept is listed under the month its deadline falls in, with where it stands
// as a chip. Finds with no set date come after the months; ones whose
// deadline has passed and finished ones fold away at the end; dismissed ones
// show last, behind a toggle. Calm shell, keen-eyed hawk.
//
// Moves are optimistic: a card changes at once and changes back, with a
// message, if the save fails. Everything here is free; only a new find (the
// flow) and a recheck spend anything.

// The real calls. The page takes them as one object so it can be driven with
// made-up data when checking it by hand (see CollegeListPage).
const REAL_API = {
  requireUser, loadItems, updateItem, deleteItem,
  status: () => agentsApi.finderStatus(),
  recheck: (id) => agentsApi.finderRecheck(id),
};

// The lane filter, the dismissed toggle and which folds are open, for this
// browser tab only. Nothing about the student's brief is kept here.
const PREFS_KEY = "mentorable.finderBoard";
function readPrefs() {
  try {
    const v = JSON.parse(sessionStorage.getItem(PREFS_KEY) || "null");
    return v && typeof v === "object" ? v : {};
  } catch { return {}; }
}
function writePrefs(prefs) {
  try { sessionStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* storage blocked: the board just resets */ }
}

/** How many new finds the tray shows before "Show all": enough to sort, few
 *  enough that the timeline stays in reach. */
const TRAY_SHOW = 3;
const TRAY_SHOW_PHONE = 2;

const reducedMotion = () => {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
};

const short = (t, n = 60) => {
  const s = String(t || "this find");
  return s.length > n ? `${s.slice(0, n - 3).trimEnd()}...` : s;
};

export default function FinderBoardPage({ navigate, api = REAL_API }) {
  const isMobile = useIsMobile();
  const ink = useAgentInk();
  const [prefs] = useState(readPrefs);
  const [phase, setPhase] = useState("loading");    // loading | ready | error
  const [userId, setUserId] = useState(null);
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState(null);       // agentsApi.finderStatus(), once it answers
  const [drawerId, setDrawerId] = useState(null);
  const [pending, setPending] = useState(() => new Set());
  const [rechecking, setRechecking] = useState(null);   // the id being rechecked
  const [lane, setLane] = useState(() => (LANES.some((l) => l.key === prefs.lane) ? prefs.lane : "all"));
  const [showDismissed, setShowDismissed] = useState(!!prefs.dismissed);
  // Closed and Done start folded: the timeline is for what is still ahead.
  const [open, setOpen] = useState(() => ({ closed: !!prefs.open?.closed, done: !!prefs.open?.done }));
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState(null);
  const [announce, setAnnounce] = useState("");
  const alive = useRef(true);
  const toastTimer = useRef(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const runs = useRef(new Map());         // per card: its saves in flight, one at a time (see changeItem)
  const confirmed = useRef(new Map());    // per card: the row as the database last returned it
  const unsavedNotes = useRef(new Map()); // per card: notes whose save failed, for the drawer to offer again
  // What to focus after a move from the tray or a status chip, once the board
  // has re-rendered: { chip: id, titles: [ids], fallback: "tray" | "timeline" },
  // tried in that order (see the effect below).
  const focusAfter = useRef(null);
  const drawerFrom = useRef({ id: null, where: "timeline" });  // the open drawer's find, for focus if it moves
  const revealDismissed = useRef(false);  // bring the dismissed group into view once it renders
  const trayHeadingRef = useRef(null);
  const timelineHeadingRef = useRef(null);

  const notify = useCallback((message, tone = "info") => {
    clearTimeout(toastTimer.current);
    setToast({ message, tone, key: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), tone === "error" ? 7000 : 4500);
  }, []);

  const refreshStatus = useCallback(() => {
    api.status()
      .then((s) => { if (alive.current) setStatus(s || null); })
      .catch((e) => console.warn("[finder] status failed:", e));
  }, [api]);

  const load = useCallback(async () => {
    setPhase("loading");
    let user = null;
    try { user = await api.requireUser(); } catch { user = null; }
    if (!alive.current) return;
    if (!user) { navigate?.("/auth"); return; }
    setUserId(user.id);
    // Finds left come from the backend; the board works without them.
    refreshStatus();
    try {
      const rows = await api.loadItems(user.id);
      if (!alive.current) return;
      const list = Array.isArray(rows) ? rows : [];
      confirmed.current = new Map(list.map((r) => [r.id, r]));
      setItems(list);
      setPhase("ready");
    } catch (e) {
      console.error("[finder] board load failed:", e);
      if (alive.current) setPhase("error");
    }
  }, [api, navigate, refreshStatus]);

  useEffect(() => {
    alive.current = true;
    load();
    return () => { alive.current = false; clearTimeout(toastTimer.current); };
  }, [load]);

  useEffect(() => { writePrefs({ lane, dismissed: showDismissed, open }); }, [lane, showDismissed, open]);

  // A search still running when the board opened: look again without the skeleton.
  const refresh = async () => {
    if (!userId || refreshing) return;
    setRefreshing(true);
    try {
      const [rows, s] = await Promise.all([api.loadItems(userId), api.status().catch(() => null)]);
      if (!alive.current) return;
      const list = Array.isArray(rows) ? rows : [];
      confirmed.current = new Map(list.map((r) => [r.id, r]));
      setItems(list);
      if (s) setStatus(s);
      setAnnounce(s?.running?.id ? "Talon is still searching." : "Your board is up to date.");
    } catch (e) {
      console.warn("[finder] refresh failed:", e);
      if (alive.current) notify("Couldn't load your board just now. Try again in a minute.", "error");
    } finally {
      if (alive.current) setRefreshing(false);
    }
  };

  // ── What shows ────────────────────────────────────────────────────────────

  const today = new Date();
  const dayKey = today.toDateString();   // regroup when the day turns, not on every render
  const inLane = useMemo(() => (lane === "all" ? items : items.filter((i) => i.lane === lane)), [items, lane]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const groups = useMemo(() => groupByDeadline(inLane, today), [inLane, dayKey]);
  const tray = groups.tray;
  // The timeline's rows top to bottom, as they show now (folded groups and
  // hidden dismissed ones are not on screen, so focus never goes to them).
  const rowOrder = [
    ...groups.months.flatMap((m) => m.items), ...groups.undated,
    ...(open.closed ? groups.closed : []), ...(open.done ? groups.done : []),
    ...(showDismissed ? groups.dismissed : []),
  ];
  const laneCounts = {
    all: items.filter((i) => i.status !== "dismissed").length,
    ...Object.fromEntries(LANES.map((l) => [l.key, items.filter((i) => i.lane === l.key && i.status !== "dismissed").length])),
  };
  const dismissedCount = groups.dismissed.length;
  const laneWord = lane === "all" ? "" : (laneLabel(lane) || "").toLowerCase();
  const trayEmpty = laneWord
    ? `No new ${laneWord} to sort. When Talon finds more, they wait here first.`
    : "Nothing new to sort. When Talon finds more, they wait here first.";
  const timelineEmpty = `${laneWord ? `No ${laneWord} saved yet.` : "Nothing saved yet."} Save a find from the tray `
    + "and it shows up here, under the month it's due.";
  const due = items
    .filter((i) => (i.status === "saved" || i.status === "applying") && isSoon(i, today))
    .sort((a, b) => (daysLeft(a, today) ?? 99) - (daysLeft(b, today) ?? 99));

  const finds = budgetOf(status?.finds);
  const stop = blockCopy(findsBlock(status));
  const running = status?.running?.id ? status.running : null;
  const empty = items.length === 0;
  const drawerItem = drawerId ? items.find((i) => i.id === drawerId) : null;

  // After a Save or Dismiss from the tray the card leaves it: focus moves to
  // its neighbour, or to the tray's heading when it was the last one. After a
  // status change from a chip, focus stays on that chip if its row is still
  // in view (it may have moved within the timeline), else goes to the row
  // that was next to it, else to the timeline's heading.
  useEffect(() => {
    const target = focusAfter.current;
    if (!target) return;
    focusAfter.current = null;
    const byAttr = (attr, id) => (id == null ? null
      : [...document.querySelectorAll(`[${attr}]`)].find((n) => n.getAttribute(attr) === String(id)) || null);
    const el = byAttr("data-chip-for", target.chip)
      || (target.titles || []).map((id) => byAttr("data-title-for", id)).find(Boolean);
    if (el) el.focus();
    else (target.fallback === "tray" ? trayHeadingRef : timelineHeadingRef).current?.focus();
  }, [items]);

  // Turning on Show dismissed brings their group (at the very end) into view.
  useEffect(() => {
    if (!showDismissed || !revealDismissed.current) return;
    revealDismissed.current = false;
    try {
      document.getElementById("tf-g-dismissed")?.scrollIntoView({ block: "start", behavior: reducedMotion() ? "auto" : "smooth" });
    } catch { /* old browsers: the group is still there to scroll to */ }
  }, [showDismissed]);

  // A drawer takes its card's unsaved notes into its box as it opens; from
  // then on it owns them. As it closes it sends what is in the box if that
  // differs from what was stored, and only a save failing after that (in
  // onDrawerChange) leaves notes here for the next open. So a box cleared
  // back to the stored notes never gets the old text offered again.
  useEffect(() => {
    if (!drawerId) return undefined;
    unsavedNotes.current.delete(drawerId);
    return () => { unsavedNotes.current.delete(drawerId); };
  }, [drawerId]);

  const markPending = (id, on) => setPending((prev) => {
    const next = new Set(prev);
    if (on) next.add(id); else next.delete(id);
    return next;
  });

  // ── Changes ───────────────────────────────────────────────────────────────

  /** Save `patch` to `item` at once, and put it back if the save fails. A
   *  status change also moves the card to the top of its new tab.
   *
   *  Saves to one card run one at a time, in order (ticking requirements
   *  quickly queues them), and the newest one settles the card: when it lands
   *  the card becomes the row the database returned, and when it fails every
   *  field changed since the last row the database returned goes back to
   *  that row. An older save that fails while a newer one waits changes
   *  nothing yet; the newer one decides, and says so if the older change was
   *  lost. Resolves to true when this save landed. */
  const changeItem = async (item, patch, { okMessage, failMessage, onFail } = {}) => {
    if (!userId) return false;
    const id = item.id;
    const current = itemsRef.current.find((i) => i.id === id) || item;
    const full = { ...patch };
    if (patch.status && patch.status !== current.status) {
      full.position = topPosition(itemsRef.current.filter((i) => i.status === patch.status && i.id !== id));
    }
    // With nothing in flight the card is what the database last returned.
    if (!runs.current.has(id) && !confirmed.current.has(id)) confirmed.current.set(id, current);
    const run = runs.current.get(id) || { n: 0, tail: Promise.resolve(), touched: new Set(), lost: null };
    runs.current.set(id, run);
    const n = run.n + 1;
    run.n = n;
    for (const k of Object.keys(full)) run.touched.add(k);
    const save = run.tail.then(() => api.updateItem(userId, id, full));
    run.tail = save.then(() => undefined, () => undefined);
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...full } : i)));
    markPending(id, true);

    let saved = null;
    let failed = null;
    try { saved = await save; } catch (e) { failed = e || new Error("save failed"); }
    const last = runs.current.get(id) === run && run.n === n;
    if (last) {
      runs.current.delete(id);
      if (alive.current) markPending(id, false);
    }

    if (!failed) {
      if (saved?.id) confirmed.current.set(id, saved);
      if (!last || !alive.current) return true;
      if (saved?.id) setItems((prev) => prev.map((i) => (i.id === saved.id ? saved : i)));
      // An older save failed and this one did not send its fields again:
      // the card now shows what the database has, so say what was lost.
      if (run.lost && [...run.lost.keys].some((k) => !(k in full))) notify(run.lost.message, "error");
      else if (okMessage) notify(okMessage);
      else if (patch.status) setAnnounce(`Moved to ${statusLabel(patch.status) || "Dismissed"}.`);
      return true;
    }

    console.warn("[finder] save failed:", failed);
    const message = failMessage || `Couldn't save that change to "${short(current.title)}". It's back as it was.`;
    if (!last) {
      run.lost = { keys: new Set([...(run.lost?.keys || []), ...Object.keys(full)]), message };
      return false;
    }
    if (!alive.current) return false;
    const base = confirmed.current.get(id) || current;
    setItems((prev) => prev.map((i) => {
      if (i.id !== id) return i;
      const back = { ...i };
      for (const k of run.touched) back[k] = base[k];
      return back;
    }));
    onFail?.();
    notify(message, "error");
    return false;
  };

  const dismissedMessage = (item) => (showDismissed
    ? `Dismissed "${short(item.title)}". It's under Dismissed, at the end of your timeline.`
    : `Dismissed "${short(item.title)}". Turn on Show dismissed to see it again.`);

  /** Save or Dismiss from the sorting tray: the card leaves the tray. */
  const moveFromTray = (item, next) => {
    const at = tray.findIndex((i) => i.id === item.id);
    const neighbour = tray[at + 1] || tray[at - 1] || null;
    focusAfter.current = { titles: neighbour ? [neighbour.id] : [], fallback: "tray" };
    changeItem(item, { status: next }, {
      okMessage: next === "saved"
        ? `Saved "${short(item.title)}". It's on your timeline under ${timelinePlace({ ...item, status: next }, today)}.`
        : dismissedMessage(item),
      // Back where it was: focus returns to it too.
      onFail: () => { focusAfter.current = { titles: [item.id], fallback: "tray" }; },
    });
  };

  /** A status picked from a row's chip. The row may move to another group
   *  (Done folds away; Dismissed hides unless shown), so a move that changes
   *  its group says where it went. */
  const moveFromTimeline = (item, next) => {
    if (next === item.status) return;
    const at = rowOrder.findIndex((i) => i.id === item.id);
    focusAfter.current = {
      chip: item.id,
      titles: [rowOrder[at + 1]?.id, rowOrder[at - 1]?.id].filter(Boolean),
      fallback: "timeline",
    };
    const from = timelinePlace(item, today);
    const to = timelinePlace({ ...item, status: next }, today);
    const okMessage = next === "dismissed" ? dismissedMessage(item)
      : next === "done" ? `Moved "${short(item.title)}" to Done. Open it there to say how it went.`
      : from !== to ? `Moved "${short(item.title)}" to ${statusLabel(next)}. It's under ${to} now.`
      : undefined;
    changeItem(item, { status: next }, {
      okMessage,
      onFail: () => { focusAfter.current = { chip: item.id, titles: [item.id], fallback: "timeline" }; },
    });
  };

  const openDrawer = (item) => {
    drawerFrom.current = { id: item.id, where: item.status === "new" ? "tray" : "timeline" };
    setDrawerId(item.id);
  };

  /** The drawer closed and what opened it is gone (its find moved group, or
   *  left the view): focus its find where it is now, else the heading of the
   *  part of the board it was in. */
  const drawerFallbackFocus = () => {
    const { id, where } = drawerFrom.current;
    const moved = [...document.querySelectorAll("[data-title-for]")].find((n) => n.getAttribute("data-title-for") === String(id));
    if (moved) moved.focus();
    else (where === "tray" ? trayHeadingRef : timelineHeadingRef).current?.focus();
  };

  /** A change from the drawer. Resolves to true when it saved, so the drawer
   *  can try its notes again on the next blur. Notes that could not be saved
   *  are kept here too, so a drawer reopened on the card offers them again
   *  (the drawer that typed them may have closed by the time the save fails). */
  const onDrawerChange = (patch) => {
    if (!drawerItem) return Promise.resolve(false);
    const item = drawerItem;
    const notes = Object.prototype.hasOwnProperty.call(patch, "notes");
    const opts = patch.status === "dismissed"
      ? { okMessage: dismissedMessage(item) }
      : notes
        ? { failMessage: `Couldn't save your notes on "${short(item.title)}". What you typed is still in its notes box, so try again in a moment.` }
        : {};
    const result = changeItem(item, patch, opts);
    if (notes) {
      // Saves to a card settle in order, so the last one to answer wins.
      result.then((ok) => {
        if (ok) unsavedNotes.current.delete(item.id);
        else unsavedNotes.current.set(item.id, patch.notes);
      });
    }
    return result;
  };

  const recheckItem = async (item) => {
    setRechecking(item.id);
    try {
      const res = await api.recheck(item.id);
      if (res?.item?.id) confirmed.current.set(res.item.id, res.item);
      if (alive.current && res?.item?.id) setItems((prev) => prev.map((i) => (i.id === res.item.id ? res.item : i)));
      return res;
    } catch (e) {
      // A failed read still used up one of this card's rechecks; the server's
      // count is behind the card here, so catch it up.
      if (alive.current && (e?.code === "recheck_failed" || e?.code === "rechecks_spent")) {
        setItems((prev) => prev.map((i) => (i.id !== item.id ? i : {
          ...i,
          rechecks_used: e.code === "rechecks_spent" ? RECHECKS_PER_ITEM : (Number(i.rechecks_used) || 0) + 1,
        })));
      }
      throw new Error(finderErrorMessage(e));
    } finally {
      if (alive.current) { setRechecking(null); refreshStatus(); }
    }
  };

  const deleteDrawerItem = async (item) => {
    await api.deleteItem(userId, item.id);
    if (!alive.current) return;
    confirmed.current.delete(item.id);
    unsavedNotes.current.delete(item.id);
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    setDrawerId(null);
    notify(`Deleted "${short(item.title)}".`);
  };

  const toggleDismissed = () => {
    const on = !showDismissed;
    revealDismissed.current = on;
    setShowDismissed(on);
    setAnnounce(on ? "Dismissed finds now show at the end of your timeline." : "Dismissed finds are hidden.");
  };
  const toggleFold = (key) => setOpen((prev) => ({ ...prev, [key]: !prev[key] }));

  // ── Layout ────────────────────────────────────────────────────────────────

  const pagePad = {
    minHeight: "100vh", background: BG, fontFamily: SANS, boxSizing: "border-box",
    padding: isMobile ? "1.25rem 1rem 6rem" : "2.25rem 2rem 4rem",
    paddingLeft: isMobile ? "1rem" : `calc(${SIDEBAR_WIDTH}px + 2rem)`,
    ...ringVar(ink),
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
        Opportunities
      </h1>
    </>
  );

  if (phase !== "ready") {
    return (
      <div data-sidebar-offset style={pagePad}>
        <div style={{ maxWidth: 1120, margin: "0 auto", width: "100%" }}>
          {header}
          {phase === "loading" ? (
            <div aria-busy="true">
              <p role="status" style={SR_ONLY}>Loading your board</p>
              <TimelineSkeleton />
            </div>
          ) : (
            <div style={{ maxWidth: 640 }}>
              <MascotSays agent={TALON} state="thinking" size={80} layout="auto">
                {TALON_LINES.error}
              </MascotSays>
              <Button kind="primary" onClick={load} style={{ marginTop: 18 }}>Try again</Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div data-sidebar-offset style={pagePad}>
      <div style={{ maxWidth: 1120, margin: "0 auto", width: "100%" }}>
        {header}

        {/* One Talon at a time: when deadlines are close the nudge speaks
            instead (unless the student needs to hear that finds ran out). */}
        {!empty && (stop || due.length === 0) && (
          <div style={{ maxWidth: 760 }}>
            <MascotSays agent={TALON} state="idle" size={72} layout="auto">
              {stop ? stop.line : TALON_LINES.boardHello}
            </MascotSays>
          </div>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px 14px", margin: "18px 0 22px" }}>
          <button type="button" className={`${FOCUS_CLASS} ${stop ? "" : PRESS_CLASS}`}
            aria-disabled={!!stop || undefined} aria-describedby={finds || stop ? "tf-finds" : undefined}
            onClick={() => { if (!stop) navigate?.(newPath(lane === "all" ? null : lane)); }}
            style={{ minHeight: 48, padding: "0 22px", display: "inline-flex", alignItems: "center", gap: 9,
              borderRadius: RADIUS.control, border: stop ? `1.5px solid ${BORDER}` : "none",
              background: stop ? "#e9e6e1" : ink.button.bg, color: stop ? TEXT_MUTED : ink.button.fg,
              fontFamily: SANS, fontSize: "1.05rem", fontWeight: 800, cursor: stop ? "not-allowed" : "pointer" }}>
            <PixelStamp kind="sparkle" size={16} />
            Find opportunities
          </button>
          {(finds || stop) && (
            <span id="tf-finds" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: SANS,
              fontSize: "0.95rem", fontWeight: 700, color: stop ? AMBER_TEXT : TEXT_MUTED, fontVariantNumeric: "tabular-nums" }}>
              {stop ? stop.short : TALON_LINES.findsLeft(finds.left, finds.limit)}
            </span>
          )}
        </div>

        {running && (
          <div role="status" style={{ maxWidth: 760, margin: "-6px 0 22px", padding: "12px 12px 12px 16px", background: WHITE,
            borderStyle: "solid", borderWidth: "1px 1px 1px 4px", borderRadius: RADIUS.control,
            borderColor: `${BORDER} ${BORDER} ${BORDER} ${ink.ring}`,
            display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 14px" }}>
            <p style={{ flex: "1 1 260px", margin: 0, fontFamily: SANS, fontSize: "1rem", fontWeight: 600, color: TEXT, lineHeight: 1.5 }}>
              Talon is still working on your last search. What it finds lands here, usually within a couple of minutes.
            </p>
            <Button kind="secondary" busy={refreshing} onClick={refresh}>Check again</Button>
          </div>
        )}

        {empty ? (
          <FinderEmpty stopLine={stop?.line || null} onLane={(key) => navigate?.(newPath(key))} />
        ) : (
          <>
            <DueSoon items={due} today={today} onOpen={openDrawer} />

            {/* The filter governs the tray and the timeline alike, so it sits above both. */}
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between",
              gap: 10, marginBottom: 16, maxWidth: 900 }}>
              <LaneFilter value={lane} counts={laneCounts} onChange={setLane} />
              <DismissedToggle on={showDismissed} n={dismissedCount} onToggle={toggleDismissed} />
            </div>

            <SortingTray items={tray} today={today} pending={pending} limit={isMobile ? TRAY_SHOW_PHONE : TRAY_SHOW}
              headingRef={trayHeadingRef} emptyText={trayEmpty} onOpen={openDrawer}
              onSave={(it) => moveFromTray(it, "saved")} onDismiss={(it) => moveFromTray(it, "dismissed")} />

            <DeadlineTimeline groups={groups} today={today} open={open} onToggle={toggleFold}
              showDismissed={showDismissed} headingRef={timelineHeadingRef} emptyText={timelineEmpty}
              onOpen={openDrawer} onMove={moveFromTimeline} />
          </>
        )}
      </div>

      <p aria-live="polite" style={SR_ONLY}>{announce}</p>
      <BoardToast toast={toast} onDismiss={() => { clearTimeout(toastTimer.current); setToast(null); }} />

      <AnimatePresence>
        {drawerItem && (
          <ListingDrawer key={drawerItem.id} item={drawerItem} today={today}
            draftNotes={unsavedNotes.current.get(drawerItem.id)}
            onClose={() => setDrawerId(null)} onChange={onDrawerChange}
            onRecheck={recheckItem} onDelete={deleteDrawerItem}
            rechecking={rechecking === drawerItem.id} recheckBudget={budgetOf(status?.rechecks)}
            onFallbackFocus={drawerFallbackFocus} />
        )}
      </AnimatePresence>
    </div>
  );
}
