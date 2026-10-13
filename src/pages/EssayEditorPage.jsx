import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { requireUser } from "../lib/auth.js";
import { agentsApi, essayErrorMessage, needsSignIn } from "../lib/agentsApi.js";
import { QUILL_LINES } from "../lib/agents/registry.js";
import {
  REVIEW_MIN_WORDS, VERSIONS_MAX, countWords, deleteEssay, deleteReview, deleteVersion, essayStamp, lengthState, loadEssay,
  loadVersion, saveEssay, saveResponses, wordBounds,
} from "../lib/essay.js";
import { MascotSays } from "../components/agents/SpeechBubble.jsx";
import AskReview from "../components/agents/essay/editor/AskReview.jsx";
import DraftPaper from "../components/agents/essay/editor/DraftPaper.jsx";
import EditorHeader, { BackLink } from "../components/agents/essay/editor/EditorHeader.jsx";
import OpenNotesList from "../components/agents/essay/editor/OpenNotesList.jsx";
import PastReviews from "../components/agents/essay/editor/PastReviews.jsx";
import PromptPanel from "../components/agents/essay/editor/PromptPanel.jsx";
import ReviewView from "../components/agents/essay/editor/ReviewView.jsx";
import VersionsDrawer from "../components/agents/essay/editor/VersionsDrawer.jsx";
import { HOME_PATH, QUILL, budgetOf, newestFirst, plural, short } from "../components/agents/essay/editor/editorUi.js";
import { without } from "../components/agents/essay/editor/reviewModel.js";
import useAutosave, { draftKey, readDraft } from "../components/agents/essay/editor/useAutosave.js";
import BoardToast from "../components/agents/outreach/BoardToast.jsx";
import Sheet from "../components/agents/outreach/Sheet.jsx";
import { SIDEBAR_WIDTH } from "../components/common/Sidebar.jsx";
import Spinner from "../components/common/Spinner.jsx";
import { Button, Card, Notice, SR_ONLY, pageStyle } from "../components/ui/kit.jsx";
import { PixelStamp } from "../components/ui/PixelIcons.jsx";
import { BORDER, DANGER, FOCUS_CLASS, SANS, TEXT, TEXT_MID, TEXT_MUTED, useAgentInk } from "../components/ui/tokens.js";
import { useIsMobile } from "../hooks/useIsMobile.js";

// One essay (/agents/essay/:essayId): a writing-first page. The textarea is
// the page, the prompt sits above it, and Quill is small and to the side with
// the one thing that spends anything here, "Ask Quill to read it". After a
// review the same page shows it beside the version it read (ReviewView), and
// "Keep writing" comes back to the text with a slim list of open notes.
//
// What this page promises, and how:
//   * The words are never lost. Everything typed goes through one autosave
//     (useAutosave): saved a second after typing stops, when the textarea
//     loses focus and before leaving; kept on screen and retried when a save
//     fails; never overwritten by what a save returns. A restored version
//     goes in through the same door. That holds across tabs and devices too:
//     a page left open catches up when it is looked at again, and a save
//     never lands on a copy this page has not seen. When two copies exist,
//     saving pauses and the student chooses (the other one is kept as a saved
//     version first).
//   * Quill never edits. Nothing a review returns is ever put into the
//     textarea: a review is notes about a saved version, shown read-only, and
//     the live text carries no highlights.
//   * A hand-off is not a review: the message is shown calmly, and nothing
//     else on the page changes.
//
// Writing, saving and versions are free. Only a review is counted.

// The real calls. The page takes them as one object so it can be driven with
// made-up data when checking it by hand (see CollegeListPage).
const REAL_API = {
  requireUser, loadEssay, loadVersion, saveEssay, essayStamp, deleteEssay, deleteVersion, deleteReview, saveResponses,
  status: () => agentsApi.essayStatus(),
  snapshot: (id) => agentsApi.essaySnapshot(id),
  review: (id) => agentsApi.essayReview(id),
};

// Refusals after which a review may have landed anyway (the answer was lost on
// the way back, an earlier ask is still being read, or another tab asked): the
// page reads the essay's reviews again before believing them.
const UNSURE = new Set(["", "network", "busy", "unchanged", "server_error", "error"]);
// After "the connection dropped" or "already reading", Quill may still finish:
// look again every so often for a couple of minutes.
const WATCH_EVERY_MS = 10000;
const WATCH_TRIES = 12;
// A button that waits for a save says so once the save has taken this long.
const SLOW_SAVE_MS = 4000;
// Coming back to the tab, the page asks whether the essay was changed
// somewhere else, at most this often.
const CATCH_UP_EVERY_MS = 5000;
// Why Quill will not read the same words twice. The server's own line for
// this says "nothing has changed", which is false for a student who has just
// changed the prompt, so the page words it itself wherever it is shown.
const ALREADY_READ = "Quill has already read these exact words. Change the draft, then ask again.";

const WRITE = { name: "write" };

/** A review row as the page uses it (as src/lib/essay.js reads them): the
 *  lists always arrays, the responses always an object. Rows from the backend
 *  (a review that just landed) pass through here. */
function asReview(row) {
  if (!row || typeof row !== "object" || !row.id) return null;
  return {
    ...row,
    checks: Array.isArray(row.checks) ? row.checks : [],
    notes: Array.isArray(row.notes) ? row.notes : [],
    cuts: Array.isArray(row.cuts) ? row.cuts : [],
    responses: row.responses && typeof row.responses === "object" && !Array.isArray(row.responses) ? row.responses : {},
  };
}

/** Two timestamps for the same moment, however each is written. Anything
 *  unreadable counts as the same: no reason to act on it. */
function sameMoment(a, b) {
  const x = Date.parse(a || "");
  const y = Date.parse(b || "");
  return !Number.isFinite(x) || !Number.isFinite(y) || x === y;
}

/** A prompt's words, for telling two prompts apart. */
const promptWords = (text) => (typeof text === "string" ? text.replace(/\s+/g, " ").trim() : "");

/** The prompt a review was read against, when its row says: { key, text }, or
 *  null for a review that carries none. */
function promptRead(review) {
  const text = promptWords(review?.prompt_text);
  if (!text) return null;
  return { key: typeof review.prompt_key === "string" && review.prompt_key ? review.prompt_key : null, text: review.prompt_text.trim() };
}

/** The student is in a field (the essay, its title, an answer to a note):
 *  whatever arrives now must not move them out of it. */
function inField() {
  const el = typeof document !== "undefined" ? document.activeElement : null;
  if (!el || el === document.body) return false;
  return el.tagName === "TEXTAREA" || el.tagName === "INPUT" || el.tagName === "SELECT" || el.isContentEditable === true;
}

/** A version as the list holds it: everything but its text. */
function asVersionRow(v) {
  return { id: v.id, essay_id: v.essay_id, word_count: v.word_count, source: v.source, created_at: v.created_at };
}

const sectionRule = { height: 1, background: BORDER, border: "none", margin: 0 };

// The server sends the hand-off's words (rules.HANDOFF in the backend). This
// is the same message, word for word, for the one case where its answer says
// "hand-off" and carries none.
const HANDOFF_FALLBACK = "This sounds like more than an essay. Please talk to an adult you trust or your school counselor "
  + "today. If you are in crisis or thinking about hurting yourself, call or text 988, the Suicide and Crisis Lifeline, "
  + "any time. Your writing is saved, and Quill will be here after.";

export default function EssayEditorPage({ navigate, essayId, api = REAL_API }) {
  const isMobile = useIsMobile();
  // Below this the side column goes under the text: beside it, the essay's
  // measure would fall under about 55 characters.
  const narrow = useIsMobile(1240);
  const ink = useAgentInk();

  const [phase, setPhase] = useState("loading");       // loading | ready | missing | error
  const [userId, setUserId] = useState(null);
  const [essay, setEssay] = useState(null);            // the row's fixed facts (kind, school). What can be edited lives in the autosave.
  const [versions, setVersions] = useState([]);        // newest first, without their text
  const [reviews, setReviews] = useState([]);          // full rows, newest first
  const [status, setStatus] = useState(null);          // agentsApi.essayStatus(), once it answers
  const [bodies, setBodies] = useState({});            // version id -> { state: "loading" | "ready" | "gone" | "error", body }
  const [view, setView] = useState(WRITE);             // WRITE, or { name: "review", id, note }
  const [reviewing, setReviewing] = useState(false);
  const [askError, setAskError] = useState(null);      // { text, signIn }
  const [handoff, setHandoff] = useState(null);        // the server's hand-off message
  const [drawerOpen, setDrawerOpen] = useState(false); // the saved versions
  const [sheet, setSheet] = useState(null);            // null | "delete"
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [notice, setNotice] = useState(null);          // { tone, text, leave }
  const [gone, setGone] = useState(false);             // the essay was deleted somewhere else
  const [settling, setSettling] = useState(false);     // "Keep this page's words" is being carried out
  const [sureTheirs, setSureTheirs] = useState(false); // "Load the other copy" was pressed once: it drops words, so it asks again
  const [settleError, setSettleError] = useState(null);
  const [toast, setToast] = useState(null);
  const [said, setSaid] = useState(null);              // { text, n }: the latest line for screen readers

  // The view as it is right now. A review lands long after the render that
  // asked for it, and that render's `view` still says "write".
  const viewRef = useRef(view);
  viewRef.current = view;

  const alive = useRef(true);
  const loadSeq = useRef(0);
  const userRef = useRef(null);
  const leaving = useRef(false);          // the essay is being deleted from here: failures on the way out are not news
  const reviewsRef = useRef([]);          // the reviews as they are right now (see putReviews)
  const bodiesRef = useRef({});
  const versionLoads = useRef(new Map()); // version id -> its load in flight
  const respRuns = useRef(new Map());     // per review: its response saves in flight, one at a time (see changeResponse)
  const respConfirmed = useRef(new Map()); // per review: the responses the database last took
  const toastTimer = useRef(null);
  const watchTimer = useRef(null);
  const scrollBack = useRef(0);           // where the editor was scrolled to when a review opened
  const focusAfter = useRef(null);        // "review" | "write" | "ask" | "text" | "handoff", once the view has rendered
  const textRef = useRef(null);
  const askHeading = useRef(null);
  const reviewHeading = useRef(null);
  const handoffRef = useRef(null);
  const lastLength = useRef(null);
  const onGone = useRef(null);
  const onClash = useRef(null);
  const clashRef = useRef(null);          // the notice that asks which of two copies stays
  const lastCatchUp = useRef(0);

  // ── The essay's words ──────────────────────────────────────────────────────

  const {
    values, state: saveState, other, adopt, edit, saveNow, settle, isDirty, holds, isIdle, rowStamp, current, stop,
  } = useAutosave({
    // `guard` names the copy of the essay the words were typed on, so a save
    // never lands on one this page has not seen (see saveEssay).
    save: (patch, guard) => api.saveEssay(userRef.current, essayId, patch, guard),
    storageKey: draftKey(userId, essayId),
    // A refusal that trying again will not change: the essay is gone, a field
    // the database will not take, or a copy saved somewhere else.
    isFinal: (e) => e?.name === "EssayError" && e.code !== "save",
    onFailed: (count, e) => {
      if (leaving.current) return;
      // The save may be finishing after the page was left: a deleted essay
      // still ends it there, and nothing else is news to a page that is gone.
      if (e?.code === "no_essay") { onGone.current?.(); return; }
      if (!alive.current) return;
      if (e?.code === "conflict") onClash.current?.();
      else if (e?.name === "EssayError" && e.code !== "save") setNotice({ tone: "warn", text: essayErrorMessage(e) });
    },
  });
  const saveStateRef = useRef(saveState);
  saveStateRef.current = saveState;

  // Screen readers hear what just happened through one polite live region
  // that is always on the page. A new key re-reads a repeat.
  const announce = useCallback((text) => setSaid((prev) => ({ text, n: (prev?.n || 0) + 1 })), []);

  const notify = useCallback((message, tone = "info") => {
    clearTimeout(toastTimer.current);
    setToast({ message, tone, key: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), tone === "error" ? 7000 : 4500);
  }, []);

  /** The essay was deleted somewhere else. Saving stops; the words stay on
   *  the page so they can still be copied. */
  const markGone = useCallback(() => {
    stop();
    setGone(true);
    setDrawerOpen(false);
    setSheet(null);
  }, [stop]);
  onGone.current = markGone;
  // A save found the essay changed somewhere else. The choice is at the top
  // of the page, which may be far above the line being typed: say so here.
  onClash.current = () => {
    notify("This essay was changed somewhere else, so saving is paused. The note at the top of the page has your choices.", "error");
  };

  // The reviews live in a ref as well as in state: two answers saved in the
  // same moment must each build on the other, not on the last render.
  const putReviews = useCallback((update) => {
    reviewsRef.current = typeof update === "function" ? update(reviewsRef.current) : update;
    setReviews(reviewsRef.current);
  }, []);

  const putBody = useCallback((id, entry) => {
    bodiesRef.current = entry ? { ...bodiesRef.current, [id]: entry } : without(bodiesRef.current, id);
    if (alive.current) setBodies(bodiesRef.current);
    return entry;
  }, []);

  /** The text of a saved version, fetched once and kept: resolves to
   *  { state: "ready", body }, { state: "gone" } or { state: "error" }. */
  const ensureVersion = useCallback((id, { again = false } = {}) => {
    const uid = userRef.current;
    if (!id || !uid) return Promise.resolve({ state: "gone" });
    const have = bodiesRef.current[id];
    if (have && have.state !== "loading" && !(again && have.state === "error")) return Promise.resolve(have);
    if (versionLoads.current.has(id)) return versionLoads.current.get(id);
    putBody(id, { state: "loading" });
    const load = api.loadVersion(uid, id).then(
      (row) => putBody(id, row && typeof row.body === "string" ? { state: "ready", body: row.body } : { state: "gone" }),
      (e) => {
        if (e?.code !== "no_version") console.warn("[essay] could not load a version:", e);
        return putBody(id, { state: e?.code === "no_version" ? "gone" : "error" });
      },
    ).finally(() => { versionLoads.current.delete(id); });
    versionLoads.current.set(id, load);
    return load;
  }, [api, putBody]);

  // ── Load ───────────────────────────────────────────────────────────────────

  const refreshStatus = useCallback(() => {
    api.status()
      .then((s) => { if (alive.current) setStatus(s || null); })
      .catch((e) => console.warn("[essay] status failed:", e));
  }, [api]);

  const load = useCallback(async () => {
    const mine = loadSeq.current + 1;
    loadSeq.current = mine;
    const still = () => alive.current && loadSeq.current === mine;
    setPhase("loading");
    let user = null;
    try { user = await api.requireUser(); } catch { user = null; }
    if (!still()) return;
    if (!user) { navigate?.("/auth"); return; }
    userRef.current = user.id;
    setUserId(user.id);
    // Reviews left come from the backend; the editor works without them.
    refreshStatus();
    try {
      const data = await api.loadEssay(user.id, essayId);
      if (!still()) return;
      if (!data?.essay) { setPhase("missing"); return; }
      // Words typed here last time that never reached the database: only ever
      // this student's, for this essay (readDraft looks nowhere else).
      const mine = String(data.essay.id).toLowerCase() === String(essayId).toLowerCase();
      const kept = mine ? readDraft(user.id, data.essay) : null;
      setEssay(data.essay);
      setVersions(newestFirst(data.versions));
      putReviews(newestFirst(data.reviews).map(asReview).filter(Boolean));
      adopt(data.essay, kept ? kept.body : null, kept ? { clash: kept.clash, mine: kept.mine } : undefined);
      // (Kept words typed on a copy that was changed somewhere else since are
      // shown too, and the page asks which copy stays: see the notices.)
      if (kept && !kept.clash) {
        setNotice({ tone: "info", text: "Some of your words hadn't saved when this page last closed. They're back, and saving now." });
      }
      setPhase("ready");
    } catch (e) {
      console.error("[essay] could not load the essay:", e);
      if (still()) setPhase("error");
    }
  }, [api, essayId, navigate, refreshStatus, putReviews, adopt]);

  useEffect(() => {
    alive.current = true;
    load();
    return () => {
      alive.current = false;
      clearTimeout(toastTimer.current);
      clearInterval(watchTimer.current);
    };
  }, [load]);

  // ── What shows ─────────────────────────────────────────────────────────────

  const live = useMemo(() => (essay ? { ...essay, ...values } : null), [essay, values]);
  const words = useMemo(() => countWords(values.body), [values.body]);
  const bounds = wordBounds(live);
  const length = lengthState(live, words);
  const personal = essay?.kind === "personal_statement";
  const newest = reviews[0] || null;
  const openReview = view.name === "review" ? reviews.find((r) => r.id === view.id) || null : null;
  const openVersionId = openReview?.version_id || null;

  // The version the newest review read, to know when nothing has changed
  // since; and the version of the review being shown.
  useEffect(() => {
    if (phase === "ready" && newest?.version_id) ensureVersion(newest.version_id);
  }, [phase, newest?.version_id, ensureVersion]);
  useEffect(() => {
    if (phase === "ready" && openVersionId) ensureVersion(openVersionId);
  }, [phase, openVersionId, ensureVersion]);

  // Crossing the word limit is said once, not on every keystroke.
  useEffect(() => {
    if (phase !== "ready") return;
    const before = lastLength.current;
    lastLength.current = length;
    if (before === null || before === length) return;
    if (length === "over") announce("You are over the word limit.");
    else if (before === "over") announce("Back within the word limit.");
  }, [phase, length, announce]);

  // After the view changes, put focus (and the scroll) where the student is
  // now: the review's heading, or back in the text where they left it.
  useEffect(() => {
    const target = focusAfter.current;
    if (!target) return;
    focusAfter.current = null;
    if (target === "review") {
      try { window.scrollTo({ top: 0 }); } catch { /* old browsers */ }
      reviewHeading.current?.focus?.({ preventScroll: true });
    } else if (target === "write") {
      try { window.scrollTo({ top: scrollBack.current || 0 }); } catch { /* old browsers */ }
      // On a phone, focusing the text would throw the keyboard up unasked.
      (isMobile ? askHeading.current : textRef.current)?.focus?.({ preventScroll: true });
    } else if (target === "ask") {
      askHeading.current?.focus?.({ preventScroll: true });
    } else if (target === "text") {
      textRef.current?.focus?.({ preventScroll: true });
    } else if (target === "handoff") {
      handoffRef.current?.focus?.();
    }
  });

  const showReview = (id, note = null) => {
    if (view.name === "write") scrollBack.current = window.scrollY || 0;
    focusAfter.current = "review";
    setView({ name: "review", id, note });
  };
  const keepWriting = useCallback(() => {
    focusAfter.current = "write";
    setView(WRITE);
  }, []);

  // ── Asking for a review ────────────────────────────────────────────────────

  const reviewsBudget = budgetOf(status?.reviews);
  const minWords = Number(status?.limits?.review_min_words) || REVIEW_MIN_WORDS;
  const lastRead = newest ? bodies[newest.version_id] : null;
  // The same words Quill read last time, against the same prompt. A review
  // that says which prompt it was read against lets a changed prompt count as
  // a change; one that does not is told apart by its words alone.
  const lastPrompt = promptRead(newest);
  const unchanged = !!lastRead && lastRead.state === "ready" && lastRead.body === values.body
    && (!lastPrompt || promptWords(lastPrompt.text) === promptWords(values.prompt_text));

  // Exactly why the button is off, one reason at a time, in the order the
  // server checks them (with "no reviews left" first: no amount of writing
  // changes that one).
  let block = null;
  if (gone) block = { code: "gone", text: "This essay was deleted." };
  else if (saveState === "conflict") {
    block = { code: "conflict", text: "Saving is paused. Choose which copy of this essay stays, at the top of the page, first." };
  } else if (reviewsBudget && reviewsBudget.left <= 0) {
    block = { code: "no_reviews", text: QUILL_LINES.reviewsLeft(0, reviewsBudget.limit) };
  } else if (!values.prompt_text.trim()) {
    block = { code: "no_prompt", text: personal ? "Pick the prompt you are answering first." : "Add the school's prompt first." };
  } else if (words < minWords) {
    block = { code: "too_short", text: `Write at least ${minWords} words before asking Quill to read it. You have ${words}.` };
  } else if (unchanged) {
    block = { code: "unchanged", text: ALREADY_READ };
  }

  let quillLine = QUILL_LINES.editorHello;
  if (block?.code === "no_reviews") quillLine = QUILL_LINES.noReviews;
  else if (length === "over") quillLine = QUILL_LINES.overLimit(words - bounds.max);
  else if (length === "under" && bounds.min !== null && words >= minWords) quillLine = QUILL_LINES.underMin(bounds.min - words);
  else if (!block) quillLine = QUILL_LINES.reviewAsk;

  const applyUsage = (usage) => {
    if (usage && Number.isFinite(usage.left) && Number.isFinite(usage.limit)) setStatus((s) => ({ ...(s || {}), reviews: usage }));
  };

  const addVersion = useCallback((version) => {
    if (!version?.id) return;
    setVersions((prev) => newestFirst([asVersionRow(version), ...prev.filter((v) => v.id !== version.id)]));
    if (typeof version.body === "string") putBody(version.id, { state: "ready", body: version.body });
  }, [putBody]);

  /** Read the essay's reviews and versions again. The text on the page is
   *  left alone: the row comes back with the answer ({ reviews, essay }), and
   *  only catchUp ever puts one on screen. Resolves to null when it could not
   *  be read. */
  const syncMeta = useCallback(async () => {
    const uid = userRef.current;
    if (!uid) return null;
    try {
      const data = await api.loadEssay(uid, essayId);
      if (!alive.current || !data?.essay) return null;
      const fresh = newestFirst(data.reviews).map(asReview).filter(Boolean);
      // Answers being saved right now are newer than what was just read.
      putReviews((prev) => fresh.map((r) => {
        const mine = respRuns.current.has(r.id) ? prev.find((p) => p.id === r.id) : null;
        return mine ? { ...r, responses: mine.responses } : r;
      }));
      setVersions(newestFirst(data.versions));
      return { reviews: fresh, essay: data.essay };
    } catch (e) {
      console.warn("[essay] could not look again:", e?.code || e?.name || "error");
      return null;
    }
  }, [api, essayId, putReviews]);

  // ── Two copies of one essay ────────────────────────────────────────────────

  /** A page left open while the essay was changed somewhere else (another
   *  tab, a phone) catches up when it is looked at again: with nothing
   *  unsaved here, the newer copy simply replaces what the page shows. With
   *  unsaved words it does nothing: the next save finds the newer copy and
   *  the page asks which stays. */
  const catchUp = useCallback(async () => {
    const uid = userRef.current;
    if (!uid || !api.essayStamp || !isIdle()) return;
    const now = Date.now();
    if (now - lastCatchUp.current < CATCH_UP_EVERY_MS) return;
    lastCatchUp.current = now;
    try {
      const at = await api.essayStamp(uid, essayId);
      if (!alive.current || !at || !isIdle() || sameMoment(at, rowStamp())) return;
      const found = await syncMeta();
      if (!alive.current || !found?.essay || !isIdle() || sameMoment(found.essay.updated_at, rowStamp())) return;
      adopt(found.essay);
      setEssay(found.essay);
      notify("This essay was changed somewhere else. This page now shows the newest copy.");
    } catch (e) {
      console.warn("[essay] could not check for a newer copy:", e?.code || e?.name || "error");
    }
  }, [api, essayId, isIdle, rowStamp, syncMeta, adopt, notify]);

  useEffect(() => {
    if (phase !== "ready") return undefined;
    const onShown = () => { if (document.visibilityState === "visible") catchUp(); };
    window.addEventListener("focus", onShown);
    document.addEventListener("visibilitychange", onShown);
    return () => {
      window.removeEventListener("focus", onShown);
      document.removeEventListener("visibilitychange", onShown);
    };
  }, [phase, catchUp]);

  // The choice between two copies starts over each time one is found.
  useEffect(() => {
    if (saveState !== "conflict") { setSureTheirs(false); setSettleError(null); }
  }, [saveState]);

  const showClash = () => {
    try { clashRef.current?.scrollIntoView({ block: "center" }); } catch { clashRef.current?.scrollIntoView?.(); }
    clashRef.current?.focus?.({ preventScroll: true });
  };

  /** Keep what this page has. When that replaces the other copy's text, the
   *  other copy becomes a saved version first, so the choice loses nothing;
   *  then this page's changes are saved on top. */
  const keepMine = async () => {
    if (settling || !other) return;
    setSettling(true);
    setSettleError(null);
    setSureTheirs(false);
    try {
      const theirs = typeof other.body === "string" ? other.body : "";
      let keptTheirs = false;
      if (theirs.trim() && holds("body") && theirs !== current().body) {
        try {
          const res = await api.snapshot(essayId);
          if (alive.current) addVersion(res?.version);
        } catch (e) {
          // "unchanged": that copy is already the newest saved version.
          if (e?.code !== "unchanged") throw e;
        }
        keptTheirs = true;
      }
      if (!alive.current) return;
      const landed = await settle("mine");
      if (!alive.current) return;
      focusAfter.current = isMobile ? "ask" : "text";
      if (landed) notify(keptTheirs ? "Saved this page's words. The other copy is in your saved versions." : "Saved this page's words.");
    } catch (e) {
      if (!alive.current) return;
      if (e?.code === "no_essay") markGone();
      else setSettleError(essayErrorMessage(e));
    } finally {
      if (alive.current) setSettling(false);
    }
  };

  /** Show the other copy instead. This page's unsaved words go, so the first
   *  press only asks. */
  const takeTheirs = () => {
    if (settling || !other) return;
    if (!sureTheirs) { setSureTheirs(true); return; }
    const row = other;
    settle("theirs");
    if (row.id) setEssay(row);
    focusAfter.current = isMobile ? "ask" : "text";
    notify("This page now shows the other copy.");
    syncMeta();
  };

  const watchForReview = (known) => {
    clearInterval(watchTimer.current);
    let tries = 0;
    watchTimer.current = setInterval(async () => {
      tries += 1;
      if (!alive.current || tries > WATCH_TRIES) { clearInterval(watchTimer.current); return; }
      const found = await syncMeta();
      if (!alive.current || !found?.reviews.some((r) => !known.has(r.id))) return;
      clearInterval(watchTimer.current);
      setAskError(null);
      refreshStatus();
      // The student may be mid-sentence: say so, and leave them where they are.
      notify("Quill finished reading your draft. Its review is under Past reviews.");
    }, WATCH_EVERY_MS);
  };

  /** A review landed. `askedBody`: the essay's words as they were saved when
   *  it was asked for (null when that is not known). */
  const arrive = (review, askedBody = null) => {
    const count = Array.isArray(review.notes) ? review.notes.length : 0;
    announce(count ? `Quill's review is ready, with ${plural(count, "note")}.` : "Quill's review is ready. It left no notes.");
    // The review opens by itself only for a student who is waiting for it.
    // "You can keep writing", the page said while Quill read. A student who
    // did is mid-sentence: opening the review would hide the essay and send
    // the next keystrokes nowhere. One who has written on since asking, or
    // who went to read an older review meanwhile, is in the middle of
    // something too. They are told, and left where they are.
    const elsewhere = viewRef.current.name !== "write";
    const wroteOn = typeof askedBody === "string" && current().body !== askedBody;
    if (elsewhere || wroteOn || inField()) {
      notify("Quill finished reading your draft. Its review is under Past reviews.");
      return;
    }
    showReview(review.id);
  };

  /** saveNow, for a button that waits on it. A save can take a while on a bad
   *  connection: past a few seconds `onSlow` runs, so the page says what it is
   *  waiting for instead of sitting silent. Resolves as saveNow does. */
  const saveWatched = async (onSlow) => {
    const slow = setTimeout(() => { if (alive.current) onSlow(); }, SLOW_SAVE_MS);
    try {
      return await saveNow();
    } finally {
      clearTimeout(slow);
    }
  };

  const askReview = async () => {
    if (reviewing || block) return;
    setReviewing(true);
    setAskError(null);
    setHandoff(null);
    clearInterval(watchTimer.current);
    const known = new Set(reviewsRef.current.map((r) => r.id));
    let askedBody = null;   // the words Quill was asked to read, to know later whether the student wrote on
    try {
      // Quill reads what is saved, so what is typed is saved first.
      const saved = await saveWatched(() => setAskError({
        text: "Still saving your latest words, which is taking longer than usual. Quill starts reading as soon as they are saved.",
      }));
      if (!alive.current) return;
      if (!saved) {
        setAskError({ text: "Your latest words haven't saved yet, so Quill can't read them. Wait until it says Saved, then ask again." });
        return;
      }
      setAskError(null);
      askedBody = current().body;
      const res = await api.review(essayId);
      if (!alive.current) return;
      applyUsage(res?.usage);
      if (res?.type === "handoff") {
        // Not a review: the message, calmly, and nothing else changes.
        setHandoff(typeof res.message === "string" && res.message.trim() ? res.message.trim() : HANDOFF_FALLBACK);
        focusAfter.current = "handoff";
        return;
      }
      const review = res?.type === "review" ? asReview(res.review) : null;
      if (!review) throw new Error("the answer held no review");
      putReviews((prev) => newestFirst([review, ...prev.filter((r) => r.id !== review.id)]));
      addVersion(res.version);
      arrive(review, askedBody);
      // At the cap the server made room for this version: catch the list up.
      syncMeta();
    } catch (e) {
      if (!alive.current) return;
      console.warn("[essay] review failed:", e);
      const code = e?.code || "";
      if (code === "no_essay") { markGone(); return; }
      if (code === "no_reviews") setStatus((s) => (s?.reviews ? { ...s, reviews: { ...s.reviews, left: 0 } } : s));
      if (UNSURE.has(code)) {
        const found = await syncMeta();
        if (!alive.current) return;
        const fresh = found?.reviews.find((r) => !known.has(r.id));
        if (fresh) { arrive(fresh, askedBody); return; }
        if (code === "network" || code === "busy") watchForReview(known);
      }
      setAskError({ text: code === "unchanged" ? ALREADY_READ : essayErrorMessage(e), signIn: needsSignIn(e) });
    } finally {
      if (alive.current) {
        setReviewing(false);
        refreshStatus();
      }
    }
  };

  // ── A student's own answers to a review's notes ────────────────────────────

  /** Set one note's response ({ state, answer }), or clear it with null, at
   *  once, and put it back if the save fails.
   *
   *  The whole map is saved each time. Saves to one review run one at a time,
   *  in order, and the newest settles it: when it fails, the review goes back
   *  to the last map the database took, with a message. An older save that
   *  fails while a newer one waits changes nothing (the newer one carries
   *  this change too). Resolves true when this save landed. Never sent to
   *  Quill: it goes to the review's `responses` column and nowhere else. */
  const changeResponse = useCallback(async (reviewId, noteId, value) => {
    const uid = userRef.current;
    const row = reviewsRef.current.find((r) => r.id === reviewId);
    if (!uid || !row) return false;
    const before = row.responses && typeof row.responses === "object" ? row.responses : {};
    const next = value ? { ...before, [noteId]: value } : without(before, noteId);
    if (!respRuns.current.has(reviewId)) respConfirmed.current.set(reviewId, before);
    const run = respRuns.current.get(reviewId) || { n: 0, tail: Promise.resolve() };
    respRuns.current.set(reviewId, run);
    const n = run.n + 1;
    run.n = n;
    const save = run.tail.then(() => api.saveResponses(uid, reviewId, next));
    run.tail = save.then(() => undefined, () => undefined);
    putReviews((prev) => prev.map((r) => (r.id === reviewId ? { ...r, responses: next } : r)));

    let failed = null;
    try { await save; } catch (e) { failed = e || new Error("save failed"); }
    const last = respRuns.current.get(reviewId) === run && run.n === n;
    if (last) respRuns.current.delete(reviewId);
    if (!failed) {
      respConfirmed.current.set(reviewId, next);
      return true;
    }
    console.warn("[essay] could not save a response:", failed);
    if (!last || !alive.current) return false;
    const base = respConfirmed.current.get(reviewId) || {};
    putReviews((prev) => prev.map((r) => (r.id === reviewId ? { ...r, responses: base } : r)));
    const typed = value && typeof value.answer === "string" && value.answer.trim();
    notify(failed.code && failed.code !== "save" ? essayErrorMessage(failed)
      : typed ? "Couldn't save your answer. It's still in its box, so try again in a moment."
        : "Couldn't save that. The note is back as it was.", "error");
    return false;
  }, [api, putReviews, notify]);

  // ── Versions ───────────────────────────────────────────────────────────────

  const versionsMax = Number(status?.limits?.versions_per_essay) || VERSIONS_MAX;
  const saveBlock = gone ? "This essay was deleted."
    : !values.body.trim() ? "There is nothing to save yet."
      : versions.length >= versionsMax ? `This essay has ${versionsMax} saved versions. Delete one to save another.`
        : null;
  const reviewed = useMemo(() => new Set(reviews.map((r) => r.version_id)), [reviews]);

  /** Save the essay as it stands as a version. Throws a message fit to show. */
  const saveVersionNow = async () => {
    if (!(await saveNow())) throw new Error("Couldn't save your latest words first. Wait until it says Saved, then try again.");
    try {
      const res = await api.snapshot(essayId);
      if (alive.current) addVersion(res?.version);
    } catch (e) {
      if (e?.code === "no_essay") markGone();
      throw new Error(essayErrorMessage(e));
    }
  };

  /** Replace the essay's text with a saved version. What is there now is kept
   *  first (saved, then saved as a version of its own), and the old text goes
   *  in through `edit`, the same way typing does. Throws a message fit to show. */
  const restoreVersion = async (version) => {
    const entry = await ensureVersion(version.id, { again: true });
    if (entry?.state !== "ready") {
      throw new Error(entry?.state === "gone"
        ? "That version is no longer here. It may have been deleted."
        : "Couldn't open that version just now. Try again.");
    }
    const now = current().body;
    if (entry.body === now) {
      setDrawerOpen(false);
      notify("Your essay already matches that version.");
      return;
    }
    const keep = !!now.trim();
    if (keep) {
      if (!(await saveNow())) {
        throw new Error("Couldn't save what you have now, so nothing was replaced. Wait until it says Saved, then try again.");
      }
      try {
        const res = await api.snapshot(essayId);
        if (alive.current) addVersion(res?.version);
      } catch (e) {
        // "unchanged": what is there now is already the newest saved version.
        // Anything else and the current text has no copy, so nothing is replaced.
        if (e?.code !== "unchanged") {
          if (e?.code === "no_essay") markGone();
          throw new Error(essayErrorMessage(e));
        }
      }
    }
    if (!alive.current) return;
    edit({ body: entry.body });
    const landed = await saveNow();
    if (!alive.current) return;
    setDrawerOpen(false);
    if (landed) notify(keep ? "Restored. What you had before is in your saved versions." : "Restored.");
    else notify("Restored on this page, but it hasn't saved yet. Saving will keep trying.", "error");
    announce("Version restored.");
  };

  const removeVersion = async (version) => {
    try {
      await api.deleteVersion(userRef.current, version.id);
    } catch (e) {
      throw new Error(essayErrorMessage(e));
    }
    if (!alive.current) return;
    setVersions((prev) => prev.filter((v) => v.id !== version.id));
    // A review goes with the version it read (the database deletes them together).
    putReviews((prev) => prev.filter((r) => r.version_id !== version.id));
    putBody(version.id, null);
  };

  // ── Deleting ───────────────────────────────────────────────────────────────

  const removeReview = async (review) => {
    try {
      await api.deleteReview(userRef.current, review.id);
    } catch (e) {
      throw new Error(essayErrorMessage(e));
    }
    if (!alive.current) return;
    respRuns.current.delete(review.id);
    respConfirmed.current.delete(review.id);
    putReviews((prev) => prev.filter((r) => r.id !== review.id));
    keepWriting();
    notify("Deleted that review.");
  };

  const removeEssay = async () => {
    setDeleting(true);
    setDeleteError(null);
    leaving.current = true;
    try {
      await api.deleteEssay(userRef.current, essayId);
    } catch (e) {
      leaving.current = false;
      if (alive.current) {
        setDeleteError(essayErrorMessage(e));
        setDeleting(false);
      }
      return;
    }
    // Nothing left to save, and no "unsaved words" question on the way out
    // (stop also removes the copy kept in this tab).
    stop();
    navigate?.(HOME_PATH);
  };

  /** Back to Quill's desk, once what is typed is saved. */
  const goBack = async () => {
    if (gone || !isDirty()) { navigate?.(HOME_PATH); return; }
    const saved = await saveWatched(() => setNotice({ tone: "info", leave: true,
      text: "Still saving your latest words, which is taking longer than usual. Stay a moment and this page will take you back as soon as they are saved." }));
    if (!alive.current) return;
    if (saved) navigate?.(HOME_PATH);
    else if (saveStateRef.current === "conflict") {
      setNotice({ tone: "warn", leave: true,
        text: "Saving is paused, because this essay was changed somewhere else. Choose which copy stays before you leave, or the words on this page may be lost." });
    } else {
      setNotice({ tone: "warn", leave: true,
        text: "Your latest words haven't saved yet. Stay until this page says Saved. If you leave now, the last of them may be lost." });
    }
  };

  // ── Layout ─────────────────────────────────────────────────────────────────

  const pagePad = pageStyle({ isMobile, sidebar: SIDEBAR_WIDTH, ink });
  const liveRegion = (
    <div role="status" aria-live="polite" aria-atomic="true" style={SR_ONLY}>
      {said && <span key={said.n}>{said.text}</span>}
    </div>
  );

  if (phase !== "ready" || !live) {
    return (
      <div data-sidebar-offset className="ui-page" style={pagePad}>
        <div style={{ maxWidth: 640, margin: "0 auto", width: "100%" }}>
          <BackLink onClick={() => navigate?.(HOME_PATH)}>Quill's desk</BackLink>
          {phase === "missing" ? (
            <Card style={{ marginTop: 12 }}>
              <h1 style={{ margin: 0, fontFamily: SANS, fontSize: "1.5rem", fontWeight: 800, color: TEXT, lineHeight: 1.25 }}>
                This essay isn't here
              </h1>
              <p style={{ margin: "8px 0 16px", fontFamily: SANS, fontSize: "1.05rem", color: TEXT_MID, lineHeight: 1.6 }}>
                It may have been deleted, or the link may be wrong. Your other essays are on Quill's desk.
              </p>
              <Button kind="primary" onClick={() => navigate?.(HOME_PATH)}>Back to Quill's desk</Button>
            </Card>
          ) : phase === "error" ? (
            <div style={{ marginTop: 12 }}>
              <h1 style={SR_ONLY}>Your essay couldn't be opened</h1>
              <MascotSays agent={QUILL} state="thinking" size={72} layout="auto">{QUILL_LINES.error}</MascotSays>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 18 }}>
                <Button kind="primary" onClick={load}>Try again</Button>
                <Button kind="secondary" onClick={() => navigate?.(HOME_PATH)}>Back to Quill's desk</Button>
              </div>
            </div>
          ) : (
            <div aria-busy="true" style={{ minHeight: "40vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <p role="status" style={{ display: "flex", alignItems: "center", gap: 10, margin: 0, fontFamily: SANS, fontSize: "1rem",
                fontWeight: 600, color: TEXT_MUTED }}>
                <Spinner size={22} color={ink.text} />
                Opening your essay
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  const school = typeof essay.school_name === "string" ? essay.school_name.trim() : "";
  const kindLine = personal ? "Personal statement" : school ? `Supplement for ${school}` : "Supplement";

  /** The prompt shown with a review. One that says which prompt it was read
   *  against shows that prompt. One that does not can only show the essay's
   *  prompt as it is today, which may no longer be the one Quill read against,
   *  so the box says "now" rather than pass it off as what Quill read. */
  const reviewPrompt = (review) => {
    const read = promptRead(review);
    if (read) {
      const which = personal ? (read.key ? `Prompt ${read.key}` : "") : (school ? `Prompt from ${school}` : "");
      return { promptName: which || "The prompt Quill read", promptText: read.text };
    }
    const now = values.prompt_text.trim();
    const which = personal ? (values.prompt_key && now ? `Prompt ${values.prompt_key}` : "") : school;
    return { promptName: which ? `Your prompt now: ${which}` : "Your prompt now", promptText: now || "None picked." };
  };
  const menuItems = [
    { key: "versions", label: `Saved versions (${versions.length})`, onSelect: () => setDrawerOpen(true) },
    { key: "delete", label: "Delete this essay", danger: true, onSelect: () => { setDeleteError(null); setSheet("delete"); } },
  ];

  const notices = (
    <>
      {gone && (
        <Notice tone="warn" style={{ marginBottom: 16 }}
          action={<Button kind="secondary" onClick={() => navigate?.(HOME_PATH)}>Back to Quill's desk</Button>}>
          This essay was deleted, so there is nowhere to save it. Your words are still on this page: copy them now if you
          want to keep them.
        </Notice>
      )}
      {saveState === "conflict" && !gone && (
        <div ref={clashRef} tabIndex={-1} className={FOCUS_CLASS} style={{ marginBottom: 16, borderRadius: 10 }}>
          <Notice tone="warn"
            action={(
              <span style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <Button kind="secondary" busy={settling} onClick={keepMine}>Keep this page's words</Button>
                <Button kind="secondary" disabled={settling} onClick={takeTheirs}>
                  {sureTheirs ? "Yes, replace this page's words" : "Load the other copy"}
                </Button>
              </span>
            )}>
            This essay was also changed somewhere else, in another tab or on another device, so there are now two copies.
            Saving is paused so that neither is written over, and your words are still on this page. Keeping this page's
            words puts the other copy in your saved versions first. Loading the other copy replaces what this page shows.
            {sureTheirs && (
              <span style={{ display: "block", marginTop: 6, fontWeight: 800 }}>
                The words on this page that never saved will be gone. Copy anything you want to keep first, then press again.
              </span>
            )}
            {settleError && (
              <span role="alert" style={{ display: "block", marginTop: 6, fontWeight: 800 }}>
                {settleError} Nothing was changed.
              </span>
            )}
          </Notice>
        </div>
      )}
      {notice && !gone && (
        <Notice tone={notice.tone} onDismiss={() => setNotice(null)} style={{ marginBottom: 16 }}
          action={notice.leave
            ? <Button kind="secondary" onClick={() => navigate?.(HOME_PATH)}>Leave anyway</Button>
            : undefined}>
          {notice.text}
        </Notice>
      )}
    </>
  );

  const side = (
    <>
      <AskReview line={quillLine} block={block} budget={reviewsBudget} reviewing={reviewing} error={askError}
        handoff={handoff} headingRef={askHeading} handoffRef={handoffRef} onAsk={askReview}
        onDismissError={() => setAskError(null)} onSignIn={() => navigate?.("/auth")}
        onCloseHandoff={() => { focusAfter.current = "ask"; setHandoff(null); }} />

      {newest && (
        <>
          <hr style={sectionRule} />
          <OpenNotesList review={newest} onOpen={(noteId) => showReview(newest.id, noteId)} />
        </>
      )}
      {reviews.length > 0 && (
        <>
          <hr style={sectionRule} />
          <PastReviews reviews={reviews} onOpen={(id) => showReview(id)} />
        </>
      )}

      <hr style={sectionRule} />
      <div>
        {!gone && (
          <Button kind="secondary" onClick={() => setDrawerOpen(true)} style={{ width: "100%" }}>
            Saved versions ({versions.length})
          </Button>
        )}
        <p style={{ margin: "12px 0 0", display: "flex", alignItems: "flex-start", gap: 8, fontFamily: SANS, fontSize: "0.93rem",
          fontWeight: 600, color: TEXT_MUTED, lineHeight: 1.5 }}>
          <span aria-hidden="true" style={{ display: "flex", marginTop: 3, flexShrink: 0 }}><PixelStamp kind="lock" size={16} /></span>
          <span>
            <span style={SR_ONLY}>Quill says: </span>
            {QUILL_LINES.neverWrites}
          </span>
        </p>
      </div>
    </>
  );

  return (
    <div data-sidebar-offset className="ui-page" style={pagePad}>
      {openReview && (
        <div style={{ maxWidth: 1120, margin: "0 auto", width: "100%" }}>
          <ReviewView key={openReview.id} review={openReview} version={bodies[openReview.version_id]}
            title={values.title} {...reviewPrompt(openReview)}
            changedSince={bodies[openReview.version_id]?.state === "ready" && bodies[openReview.version_id].body !== values.body}
            narrow={narrow} isMobile={isMobile} startNote={view.note || null} headingRef={reviewHeading}
            onBack={keepWriting} onRespond={(noteId, value) => changeResponse(openReview.id, noteId, value)}
            onDelete={() => removeReview(openReview)}
            onRetryVersion={() => ensureVersion(openReview.version_id, { again: true })} />
        </div>
      )}

      {/* The editor stays mounted, only hidden, while a review is open: the
          textarea keeps its caret and its undo history, so "Keep writing"
          really does pick up where the student left off. */}
      <div hidden={!!openReview}
        style={{ maxWidth: narrow ? 736 : 1120, margin: "0 auto", width: "100%", display: openReview ? "none" : "block" }}>
        <EditorHeader title={values.title} status={values.status} kindLine={kindLine} locked={gone}
          onTitle={(title) => edit({ title })} onStatus={(next) => edit({ status: next })} onBack={goBack}
          menuItems={menuItems} />
        {notices}
        <div style={narrow
          ? { display: "flex", flexDirection: "column", gap: 20 }
          : { display: "grid", gridTemplateColumns: "minmax(0, 736px) minmax(280px, 1fr)", gap: 28, alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
            <PromptPanel essay={live} locked={gone} onChange={(patch) => { edit(patch); saveNow(); }} />
            <DraftPaper value={values.body} onChange={(body) => edit({ body })} onBlur={() => { saveNow(); }}
              textRef={textRef} words={words} bounds={bounds} length={length} saveState={saveState}
              onRetry={() => { saveNow(); }} onConflict={showClash} isMobile={isMobile} locked={gone} />
          </div>
          <aside aria-label="Quill, your notes and your versions"
            style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0,
              ...(narrow ? null : { position: "sticky", top: 24, maxHeight: "calc(100vh - 48px)", overflowY: "auto",
                padding: 4, margin: -4, boxSizing: "border-box" }) }}>
            {side}
          </aside>
        </div>
      </div>

      {liveRegion}
      <BoardToast toast={toast} onDismiss={() => { clearTimeout(toastTimer.current); setToast(null); }} />

      <AnimatePresence>
        {drawerOpen && (
          <VersionsDrawer key="versions" versions={versions} bodies={bodies} reviewed={reviewed} max={versionsMax}
            saveBlock={saveBlock} onClose={() => setDrawerOpen(false)} onLoad={(id) => { ensureVersion(id, { again: true }); }}
            onSaveNow={saveVersionNow} onRestore={restoreVersion} onDelete={removeVersion} />
        )}
        {sheet === "delete" && (
          <Sheet key="delete" onClose={() => setSheet(null)} locked={deleting} labelledBy="qe-delete-title" width={480}>
            <h2 id="qe-delete-title" style={{ margin: "0 0 8px", fontFamily: SANS, fontSize: "1.3rem", fontWeight: 800,
              color: TEXT, lineHeight: 1.3, overflowWrap: "anywhere" }}>
              Delete &ldquo;{short(values.title, 60) || "this essay"}&rdquo;?
            </h2>
            <p style={{ margin: 0, fontFamily: SANS, fontSize: "1.02rem", color: TEXT_MID, lineHeight: 1.6 }}>
              Its text, every saved version and all of Quill's notes on it are deleted for good. This can't be undone, and
              it does not give any reviews back.
            </p>
            {deleteError && (
              <p role="alert" style={{ margin: "12px 0 0", fontFamily: SANS, fontSize: "0.98rem", fontWeight: 700,
                color: DANGER, lineHeight: 1.45 }}>
                {deleteError}
              </p>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 18 }}>
              <Button kind="secondary" data-autofocus disabled={deleting} onClick={() => setSheet(null)}
                style={{ flex: "1 1 140px" }}>
                Keep it
              </Button>
              <Button kind="danger" busy={deleting} onClick={removeEssay} style={{ flex: "1 1 140px" }}>
                Delete this essay
              </Button>
            </div>
          </Sheet>
        )}
      </AnimatePresence>
    </div>
  );
}
