import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { requireUser } from "../lib/auth.js";
import { agentsApi, essayErrorMessage, needsSignIn } from "../lib/agentsApi.js";
import { QUILL_LINES } from "../lib/agents/registry.js";
import {
  ESSAYS_MAX, TALK_QUESTIONS, TALK_STARTS, TOPIC_STATUS, addTopic, deleteTopic, loadHome, updateTopic,
} from "../lib/essay.js";
import { loadCollegeList } from "../lib/collegeList.js";
import { PixelStamp } from "../components/ui/PixelIcons.jsx";
import { AMBER_TEXT, BORDER, RADIUS, SANS, TEXT, TEXT_MID, WHITE, useAgentInk } from "../components/ui/tokens.js";
import { Button, SR_ONLY, Toast, pageStyle } from "../components/ui/kit.jsx";
import IdeasSection from "../components/agents/essay/home/IdeasSection.jsx";
import EssaysSection, { NewEssayButton } from "../components/agents/essay/home/EssaysSection.jsx";
import NightScene from "../components/agents/essay/home/NightScene.jsx";
import DeskTabs, { panelId, tabId } from "../components/agents/essay/home/DeskTabs.jsx";
import { DeskInvitation } from "../components/agents/essay/home/DeskResume.jsx";
import BrainstormSheet from "../components/agents/essay/home/BrainstormSheet.jsx";
import NewEssaySheet from "../components/agents/essay/home/NewEssaySheet.jsx";
import { DeskSkeleton, QuillLine, QuillSays } from "../components/agents/essay/home/homeParts.jsx";
import {
  AREA_MAX, NOTES_MAX, appendNotes, asTopic, budgetOf, clip, essayPath, plural, refusalTone, short, sortTopics,
} from "../components/agents/essay/home/homeUi.js";
import { SIDEBAR_WIDTH } from "../components/common/Sidebar.jsx";
import { useIsMobile } from "../hooks/useIsMobile.js";

// Quill's night desk (/agents/essay): a pixel night scene across the top, the
// essay in progress first, then the other essays and the ideas behind a
// two-tab switch (Essays | Ideas).
//
// The ideas a student is turning over, and the essays they are writing. Ideas come three ways (Quill reads the record and
// names areas with questions, a guided brainstorm, or a card of the student's
// own); each essay opens on its own page (/agents/essay/<id>), where the
// writing and Quill's reviews live.
//
// Quill asks, points and flags. Nothing on this page writes, rewrites or
// corrects a word of an essay, and none of it shows an essay's text.
//
// Changes to a card are optimistic: a status moves at once and moves back,
// with a message, if the save fails. Notes are the exception: the card's box
// owns its text, so a failed save leaves every word in place and the card
// says so. Everything here is free except a search of the record and a
// brainstorm turn, which the backend counts.

// The real calls. The page takes them as one object so it can be driven with
// made-up data when checking it by hand (see CollegeListPage).
const REAL_API = {
  requireUser, loadHome, addTopic, updateTopic, deleteTopic, loadCollegeList,
  status: () => agentsApi.essayStatus(),
  findTopics: () => agentsApi.essayFindTopics(),
  talk: (body) => agentsApi.essayTalk(body),
  createEssay: (body) => agentsApi.essayCreate(body),
};

const TAB_KEY = "quill-desk-tab";
const TAB_PREFIX = "eq-desk";
/** The tab the student last chose this session, or null. */
function storedTab() {
  try {
    const v = window.sessionStorage.getItem(TAB_KEY);
    return v === "essays" || v === "ideas" ? v : null;
  } catch { return null; }
}

const titleOf = (id) => [...document.querySelectorAll("[data-topic-title]")]
  .find((n) => n.getAttribute("data-topic-title") === String(id)) || null;

/** The student is in a field (a card's notes box, most often): focus is not
 *  taken from them, whatever has just arrived on the board. */
function inField() {
  const el = document.activeElement;
  if (!el || el === document.body) return false;
  return el.tagName === "TEXTAREA" || el.tagName === "INPUT" || el.tagName === "SELECT" || el.isContentEditable === true;
}

export default function EssayHomePage({ navigate, api = REAL_API }) {
  const isMobile = useIsMobile();
  const ink = useAgentInk();
  const [phase, setPhase] = useState("loading");    // loading | ready | error
  const [userId, setUserId] = useState(null);
  const [topics, setTopics] = useState([]);
  const [essays, setEssays] = useState([]);
  const [status, setStatus] = useState(null);       // agentsApi.essayStatus(), once it answers
  const [sheet, setSheet] = useState(null);         // { kind: "brainstorm" | "essay", topicId }
  const [composing, setComposing] = useState(false);
  const [finding, setFinding] = useState(false);
  const [findNote, setFindNote] = useState(null);   // { message, tone, signIn }
  const [tabChoice, setTabChoice] = useState(storedTab);   // "essays" | "ideas", null until the student picks
  const [fresh, setFresh] = useState(() => new Set());
  const [toast, setToast] = useState(null);
  const [announce, setAnnounce] = useState("");
  const alive = useRef(true);
  const toastTimer = useRef(null);
  const topicsRef = useRef(topics);
  topicsRef.current = topics;
  const runs = useRef(new Map());         // per card: its saves in flight, one at a time (see changeTopic)
  const confirmed = useRef(new Map());    // per card: the row as the database last returned it
  const unsaved = useRef(new Set());      // what holds words the database does not have yet (card ids, "talk")
  const focusAfter = useRef(null);        // after the next render: { topic: id } or { ideas: true }
  const afterSheet = useRef(null);        // once the open sheet has gone: { topic: id }
  const ideasHeadingRef = useRef(null);

  const notify = useCallback((text, error = false) => {
    clearTimeout(toastTimer.current);
    setToast({ text, error });
    toastTimer.current = setTimeout(() => setToast(null), error ? 7000 : 4500);
  }, []);

  const refreshStatus = useCallback(() => {
    api.status()
      .then((s) => { if (alive.current) setStatus(s || null); })
      .catch((e) => console.warn("[essay] status failed:", e?.code || e?.name || "error"));
  }, [api]);

  const load = useCallback(async () => {
    setPhase("loading");
    let user = null;
    try { user = await api.requireUser(); } catch { user = null; }
    if (!alive.current) return;
    if (!user) { navigate?.("/auth"); return; }
    setUserId(user.id);
    // What is left to spend comes from the backend; the desk works without it.
    refreshStatus();
    try {
      const home = await api.loadHome(user.id);
      if (!alive.current) return;
      const list = sortTopics((Array.isArray(home?.topics) ? home.topics : []).map(asTopic).filter(Boolean));
      confirmed.current = new Map(list.map((t) => [t.id, t]));
      setTopics(list);
      setEssays((Array.isArray(home?.essays) ? home.essays : []).filter((e) => e && e.id));
      setPhase("ready");
    } catch (e) {
      console.error("[essay] desk load failed:", e?.code || e?.name || "error");
      if (alive.current) setPhase("error");
    }
  }, [api, navigate, refreshStatus]);

  useEffect(() => {
    alive.current = true;
    load();
    return () => { alive.current = false; clearTimeout(toastTimer.current); };
  }, [load]);

  // Closing the tab with words not saved yet (a notes box mid-sentence, a
  // brainstorm in progress) asks first.
  useEffect(() => {
    const warn = (e) => {
      if (!unsaved.current.size) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  const onDirty = useCallback((id, on) => {
    if (on) unsaved.current.add(id); else unsaved.current.delete(id);
  }, []);
  const onHolding = useCallback((on) => onDirty("talk", on), [onDirty]);

  // After a card arrives or leaves: focus the card (or the section's heading)
  // once the board has re-rendered. Flows that end by closing a sheet use
  // afterSheet instead, since the sheet hands focus back as it goes.
  //
  // Not while the student is typing somewhere, though. A search of the record
  // can land half a minute after it was asked for, with the cards editable
  // all the while: moving focus (and the page) then would send the rest of a
  // sentence nowhere. The arrival is still announced, and the cards are
  // tagged "New".
  useEffect(() => {
    const target = focusAfter.current;
    if (!target || sheet) return;
    focusAfter.current = null;
    if (inField()) return;
    ((target.topic && titleOf(target.topic)) || ideasHeadingRef.current)?.focus();
  }, [topics, sheet, composing, tabChoice]);

  const onSheetGone = () => {
    const next = afterSheet.current;
    afterSheet.current = null;
    if (!next?.topic) return;
    // The sheet returns focus to whatever opened it as it unmounts, a moment
    // after this runs. So the card takes focus now, and takes it back once if
    // the opener gets it in the next instant. (No timing is assumed: the
    // hand-back is caught as it happens.)
    const go = () => { if (alive.current) (titleOf(next.topic) || ideasHeadingRef.current)?.focus(); };
    let timer = null;
    const done = () => { document.removeEventListener("focusin", back, true); clearTimeout(timer); };
    function back(e) {
      if (e.target === titleOf(next.topic)) return;
      done();
      setTimeout(go, 0);
    }
    go();
    document.addEventListener("focusin", back, true);
    timer = setTimeout(done, 400);
  };

  // ── What shows ────────────────────────────────────────────────────────────

  const today = new Date();
  const reviews = budgetOf(status?.reviews);
  const talkBudget = budgetOf(status?.talk);
  const essayBudget = budgetOf(status?.essays);
  const essayLimit = essayBudget?.limit || ESSAYS_MAX;
  const essaysFull = essays.length >= essayLimit || (!!essayBudget && essayBudget.left <= 0);
  const noReviews = !!reviews && reviews.left <= 0;
  const talkQuestions = Number(status?.limits?.talk_questions) > 0 ? Number(status.limits.talk_questions) : TALK_QUESTIONS;
  const deskEmpty = topics.length === 0 && essays.length === 0;
  // With no essay yet the desk opens on ideas; the student's own pick wins.
  const tab = tabChoice || (essays.length > 0 ? "essays" : "ideas");
  const resuming = essays[0] || null;
  const sheetTopic = sheet?.topicId ? topics.find((t) => t.id === sheet.topicId) || null : null;
  // The essays that grew from each idea, for the line on its card.
  const linked = useMemo(() => {
    const map = new Map();
    for (const e of essays) {
      if (!e.topic_id) continue;
      map.set(e.topic_id, [...(map.get(e.topic_id) || []), { id: e.id, title: e.title }]);
    }
    return map;
  }, [essays]);

  // ── Cards arriving ────────────────────────────────────────────────────────

  /** Put rows on the board (new ones, or a card whose notes a brainstorm
   *  added to). Only cards that were not there before get the "New" tag. */
  const landTopics = (rows) => {
    const known = new Set(topicsRef.current.map((t) => t.id));
    for (const r of rows) confirmed.current.set(r.id, r);
    setTopics((prev) => sortTopics([...rows, ...prev.filter((t) => !rows.some((r) => r.id === t.id))]));
    const arrived = rows.filter((r) => !known.has(r.id)).map((r) => r.id);
    if (arrived.length) setFresh((prev) => new Set([...prev, ...arrived]));
  };

  const findAreas = async () => {
    if (finding) return;
    setFinding(true); setFindNote(null);
    try {
      const res = await api.findTopics();
      if (!alive.current) return;
      const rows = sortTopics((Array.isArray(res?.topics) ? res.topics : []).map(asTopic).filter(Boolean));
      if (!rows.length) {
        setFindNote({ message: "Quill didn't find an area that isn't already on your board.", tone: "warn", signIn: false });
        return;
      }
      landTopics(rows);
      focusAfter.current = { topic: rows[0].id };
      setAnnounce(`Quill found ${plural(rows.length, "area")} in your record. The first is "${short(rows[0].area)}".`);
    } catch (e) {
      // Refused or failed: the server says which, in its own words (and
      // whether the search was given back).
      if (alive.current) setFindNote({ message: essayErrorMessage(e), tone: refusalTone(e), signIn: needsSignIn(e) });
    } finally {
      if (alive.current) { setFinding(false); refreshStatus(); }
    }
  };

  const addIdea = async ({ area, notes }) => {
    let row = null;
    try {
      row = asTopic(await api.addTopic(userId, { area, notes }));
    } catch (e) {
      throw new Error(essayErrorMessage(e));
    }
    if (!row) throw new Error("Couldn't add that idea. Try again.");
    if (!alive.current) return;
    landTopics([row]);
    setComposing(false);
    focusAfter.current = { topic: row.id };
    setAnnounce(`Added "${short(row.area)}" to your ideas.`);
  };

  // ── Changes to a card ─────────────────────────────────────────────────────

  /** Save `patch` (status, notes) to a card. A status shows at once and goes
   *  back if the save fails; notes never show early, because the card's box
   *  owns its text and its stored notes only change when a save lands.
   *
   *  Saves to one card run one at a time, in order, and the newest one
   *  settles the card: when it lands the card becomes the row the database
   *  returned, and when it fails every field changed since the last row the
   *  database returned goes back to that row. An older save that fails while
   *  a newer one waits changes nothing yet; the newer one decides, and says
   *  so if the older change was lost. Resolves to true when this save landed.
   *  `quiet`: no toast on failure (the notes box says it itself). */
  const changeTopic = async (topic, patch, { quiet = false } = {}) => {
    if (!userId) return false;
    const id = topic.id;
    const current = topicsRef.current.find((t) => t.id === id);
    if (!current) return false;   // deleted since
    const shown = { ...patch };
    delete shown.notes;
    // With nothing in flight the card is what the database last returned.
    if (!runs.current.has(id) && !confirmed.current.has(id)) confirmed.current.set(id, current);
    const run = runs.current.get(id) || { n: 0, tail: Promise.resolve(), touched: new Set(), lost: null };
    runs.current.set(id, run);
    const n = run.n + 1;
    run.n = n;
    for (const k of Object.keys(patch)) run.touched.add(k);
    const save = run.tail.then(() => api.updateTopic(userId, id, patch));
    run.tail = save.then(() => undefined, () => undefined);
    if (Object.keys(shown).length) setTopics((prev) => prev.map((t) => (t.id === id ? { ...t, ...shown } : t)));

    let saved = null;
    let failed = null;
    try { saved = asTopic(await save); } catch (e) { failed = e || new Error("save failed"); }
    const last = runs.current.get(id) === run && run.n === n;
    if (last) runs.current.delete(id);

    if (!failed) {
      if (saved) confirmed.current.set(id, saved);
      if (!last || !alive.current) return true;
      if (saved) setTopics((prev) => prev.map((t) => (t.id === id ? saved : t)));
      // An older save failed and this one did not send its fields again: the
      // card now shows what the database has, so say what was lost.
      if (run.lost && [...run.lost.keys].some((k) => !(k in patch))) notify(run.lost.message, true);
      return true;
    }

    console.warn("[essay] idea save failed:", failed?.code || failed?.name || "error");
    const message = "notes" in patch
      ? `Couldn't save your notes on "${short(current.area)}". They are back as they were last saved.`
      : `Couldn't save that change to "${short(current.area)}". It's back as it was.`;
    if (!last) {
      if (!quiet) run.lost = { keys: new Set([...(run.lost?.keys || []), ...Object.keys(patch)]), message };
      return false;
    }
    if (!alive.current) return false;
    const base = confirmed.current.get(id) || current;
    setTopics((prev) => prev.map((t) => {
      if (t.id !== id) return t;
      const back = { ...t };
      for (const k of run.touched) back[k] = base[k];
      return back;
    }));
    if (!quiet) notify(message, true);
    return false;
  };

  const setTopicStatus = (topic, key) => {
    const label = TOPIC_STATUS.find((s) => s.key === key)?.label || "";
    changeTopic(topic, { status: key }).then((ok) => {
      if (!ok || !alive.current) return;
      setAnnounce(key === "parked"
        ? `Set aside "${short(topic.area)}". Open its card to bring it back.`
        : `"${short(topic.area)}" is now marked ${label}.`);
    });
  };

  // Quiet while the card is open (its box says so itself). Once the card has
  // closed on words it could not save, nothing else would, so that one says so.
  const saveNotes = (topic, text, opts) => changeTopic(topic, { notes: text }, { quiet: !opts?.leaving });

  const removeTopic = async (topic) => {
    try {
      await api.deleteTopic(userId, topic.id);
    } catch (e) {
      throw new Error(essayErrorMessage(e));
    }
    if (!alive.current) return;
    const list = topicsRef.current;
    const at = list.findIndex((t) => t.id === topic.id);
    const neighbour = at === -1 ? null : list[at + 1] || list[at - 1] || null;
    focusAfter.current = neighbour ? { topic: neighbour.id } : { ideas: true };
    confirmed.current.delete(topic.id);
    runs.current.delete(topic.id);
    unsaved.current.delete(topic.id);
    setTopics((prev) => prev.filter((t) => t.id !== topic.id));
    // An essay that grew from it stays, without the link (the database does the same).
    setEssays((prev) => prev.map((e) => (e.topic_id === topic.id ? { ...e, topic_id: null } : e)));
    notify(`Deleted "${short(topic.area)}".`);
  };

  // ── The sheets ────────────────────────────────────────────────────────────

  const chooseTab = (key) => {
    setTabChoice(key);
    try { window.sessionStorage.setItem(TAB_KEY, key); } catch { /* the tab just forgets itself */ }
  };
  /** The way in from an essay-side empty state: the Ideas tab, with focus on its heading. */
  const goToIdeas = () => {
    // Already on Ideas: nothing will re-render, so focus the heading now
    // rather than leave a request waiting for some later change.
    if (tab === "ideas") { ideasHeadingRef.current?.focus(); return; }
    focusAfter.current = { ideas: true };
    chooseTab("ideas");
  };

  const closeSheet = () => { setSheet(null); refreshStatus(); };
  const signIn = () => navigate?.("/auth");

  const openBrainstorm = (topicId) => {
    if (talkBudget && talkBudget.left <= 0) {
      notify("You've used all the brainstorm turns this demo allows. You can still add your own ideas.");
      return;
    }
    setSheet({ kind: "brainstorm", topicId: topicId || null });
  };

  const openNewEssay = (topic) => {
    if (essaysFull) {
      // A toast would sit behind an open sheet, so put the sheet away first.
      setSheet(null);
      notify(`You have ${essayLimit} essays, the most Quill keeps. Open one and delete it to start another.`);
      return;
    }
    if (sheet) refreshStatus();   // coming straight from a brainstorm, which spent turns
    setSheet({ kind: "essay", topicId: topic?.id || null });
  };

  /** A brainstorm stopped before Quill closed it: keep the answers on a card
   *  ourselves, the way the backend does (a new card named for where the talk
   *  started, or the same lines added to the card it was about). Throws an
   *  error essayErrorMessage can word. */
  const keepAnswers = async ({ start, topicId, lines }) => {
    const card = topicId ? topicsRef.current.find((t) => t.id === topicId) : null;
    let area = TALK_STARTS.find((s) => s.key === start)?.label || "A brainstorm";
    if (card) {
      const joined = appendNotes((confirmed.current.get(card.id) || card).notes, lines);
      if (joined.length <= NOTES_MAX) return api.updateTopic(userId, card.id, { notes: joined });
      // No room left on that card: the answers go on a card of their own
      // under the same name, so none of the student's words are cut.
      area = card.area || area;
    }
    return api.addTopic(userId, { area: clip(area, AREA_MAX), notes: clip(lines, NOTES_MAX) });
  };

  const onTalkSaved = (row) => {
    const topic = asTopic(row);
    if (!topic) return;
    const isNew = !topicsRef.current.some((t) => t.id === topic.id);
    chooseTab("ideas");
    landTopics([topic]);
    setAnnounce(isNew
      ? `Your answers are on a new idea card, "${short(topic.area)}".`
      : `Your answers were added to "${short(topic.area)}".`);
  };

  const seeCard = (topicId) => {
    afterSheet.current = { topic: topicId };
    chooseTab("ideas");
    closeSheet();
  };

  const onCreated = (essay) => {
    setEssays((prev) => [{ ...essay, last_review_at: null }, ...prev.filter((e) => e.id !== essay.id)]);
    setSheet(null);
    navigate?.(essayPath(essay.id));
  };

  const openEssay = (essayOrId) => {
    const id = typeof essayOrId === "string" ? essayOrId : essayOrId?.id;
    if (id) navigate?.(essayPath(id));
  };

  // ── Layout ────────────────────────────────────────────────────────────────

  const pagePad = pageStyle({ isMobile, sidebar: SIDEBAR_WIDTH, ink });

  const hello = noReviews ? QUILL_LINES.noReviews : deskEmpty ? QUILL_LINES.homeEmpty : QUILL_LINES.homeHello;

  const scene = (
    <NightScene title="Essays" isMobile={isMobile} state={finding ? "thinking" : "idle"} onBack={() => navigate?.("/agents")}
      says={phase === "ready" ? hello : null} />
  );

  if (phase !== "ready") {
    return (
      <div data-sidebar-offset className="ui-page" style={pagePad}>
        <div style={{ maxWidth: 1120, margin: "0 auto", width: "100%" }}>
          {scene}
          {phase === "loading" ? (
            <div aria-busy="true">
              <p role="status" style={SR_ONLY}>Loading your desk</p>
              <DeskSkeleton />
            </div>
          ) : (
            <div style={{ maxWidth: 640 }}>
              <div style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: RADIUS.card, padding: "1.1rem 1.2rem",
                boxSizing: "border-box" }}>
                <QuillLine style={{ fontWeight: 600, color: TEXT }}>{QUILL_LINES.error}</QuillLine>
              </div>
              <Button kind="primary" onClick={load} style={{ marginTop: 18 }}>Try again</Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const full = essaysFull;

  return (
    <div data-sidebar-offset className="ui-page" style={pagePad}>
      <div style={{ maxWidth: 1120, margin: "0 auto", width: "100%" }}>
        {/* The promise on the left, the reviews left on the right, above the desk. */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between",
          gap: "8px 24px", margin: "0 0 14px" }}>
          <p style={{ display: "flex", alignItems: "flex-start", gap: 8, margin: 0, fontFamily: SANS, fontSize: "0.95rem",
            fontWeight: 500, lineHeight: 1.5, color: TEXT_MID, maxWidth: "70ch", flex: "1 1 320px" }}>
            <span aria-hidden="true" style={{ display: "flex", marginTop: 3, flexShrink: 0 }}><PixelStamp kind="lock" size={16} /></span>
            <span>
              <span style={SR_ONLY}>Quill: </span>
              {QUILL_LINES.neverWrites}
            </span>
          </p>
          {reviews && (
            <p style={{ display: "flex", alignItems: "flex-start", gap: 8, margin: 0, fontFamily: SANS,
              fontSize: "0.95rem", fontWeight: 700, lineHeight: 1.45, color: noReviews ? AMBER_TEXT : TEXT_MID,
              fontVariantNumeric: "tabular-nums", textAlign: "right" }}>
              <span aria-hidden="true" style={{ display: "flex", marginTop: 2 }}><PixelStamp kind="scroll" size={16} /></span>
              <span>
                {QUILL_LINES.reviewsLeft(reviews.left, reviews.limit)}
                <span style={{ fontWeight: 500 }}>. Writing and saving never use one.</span>
              </span>
            </p>
          )}
        </div>
        {scene}

        {/* Quill's line is the one pixel bubble: inside the desk scene on a wide screen, under it on a phone. */}
        {isMobile && <QuillSays center={62}>{hello}</QuillSays>}
        {/* With no essay yet, the invitation to start one. */}
        {!resuming && (
          <DeskInvitation onNew={() => openNewEssay(null)} onFindIdeas={goToIdeas} onBrainstorm={() => openBrainstorm(null)} />
        )}

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "10px 16px",
          marginTop: 24 }}>
          <DeskTabs prefix={TAB_PREFIX} value={tab} onChange={chooseTab}
            tabs={[
              { key: "essays", label: `Essays, ${essays.length} of ${essayLimit}` },
              { key: "ideas", label: `Ideas, ${topics.length}` },
            ]} />
          {/* With no essay yet the invitation above already offers New essay. */}
          {resuming && (
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 14px", flex: full ? "1 1 320px" : "0 0 auto",
              justifyContent: "flex-end" }}>
              <NewEssayButton full={full} limit={essayLimit} onNew={() => openNewEssay(null)} />
            </div>
          )}
        </div>

        <div role="tabpanel" id={panelId(TAB_PREFIX, "essays")} aria-labelledby={tabId(TAB_PREFIX, "essays")}
          hidden={tab !== "essays"} style={{ marginTop: 18 }}>
          <EssaysSection essays={essays} status={status} today={today}
            onNew={() => openNewEssay(null)} onOpen={openEssay} />
        </div>
        <div role="tabpanel" id={panelId(TAB_PREFIX, "ideas")} aria-labelledby={tabId(TAB_PREFIX, "ideas")}
          hidden={tab !== "ideas"} style={{ marginTop: 18 }}>
          <IdeasSection key="ideas" topics={topics} linked={linked} fresh={fresh} status={status}
            finding={finding} findNote={findNote} onDismissFindNote={() => setFindNote(null)}
            composing={composing} onCompose={() => setComposing(true)}
            onCancelCompose={() => { focusAfter.current = { ideas: true }; setComposing(false); }}
            onAddIdea={addIdea} onFind={findAreas} onBrainstorm={openBrainstorm} onSignIn={signIn}
            onStatus={setTopicStatus} onSaveNotes={saveNotes} onDelete={removeTopic}
            onStartEssay={openNewEssay} onOpenEssay={openEssay} onDirty={onDirty} headingRef={ideasHeadingRef} />
        </div>
      </div>

      <p aria-live="polite" style={SR_ONLY}>{announce}</p>
      <Toast notice={toast} onDismiss={() => { clearTimeout(toastTimer.current); setToast(null); }}
        isMobile={isMobile} sidebar={SIDEBAR_WIDTH} />

      {/* One sheet at a time ("wait"): when one opens from another, the first
          has handed focus back to the page before the second takes it. */}
      <AnimatePresence mode="wait" onExitComplete={onSheetGone}>
        {sheet?.kind === "brainstorm" && (
          <BrainstormSheet key="brainstorm" topics={topics} initialTopicId={sheet.topicId} turns={talkBudget}
            maxQuestions={talkQuestions} onTalk={api.talk} onKeep={keepAnswers} onSaved={onTalkSaved}
            onClose={closeSheet} onSeeCard={seeCard} onStartEssay={openNewEssay} onSignIn={signIn}
            onHolding={onHolding} />
        )}
        {sheet?.kind === "essay" && (
          <NewEssaySheet key="essay" userId={userId} topic={sheetTopic} essays={essayBudget}
            loadSchools={api.loadCollegeList} onCreate={api.createEssay} onCreated={onCreated}
            onClose={closeSheet} onSignIn={signIn} />
        )}
      </AnimatePresence>
    </div>
  );
}
