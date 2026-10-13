import { useCallback, useEffect, useRef, useState } from "react";
import { BODY_MAX, ESSAY_STATUS, PS_MAX } from "../../../../lib/essay.js";

// The essay's autosave. One rule above the rest: the words on screen are the
// truth, and nothing here ever writes over them.
//
//   * `latest` is what the student sees, updated as it is typed. `baseline` is
//     what the database is known to hold. A save sends only the difference,
//     and when it lands the baseline moves to what was SENT. The row the
//     database returns is never put back into the textarea, so a slow save
//     cannot undo newer typing.
//   * Saves run one at a time, in order. Typing during a save is picked up by
//     the next one, which reads `latest` afresh, so the newest text always
//     settles last.
//   * A save goes out about a second after typing stops, when the page asks
//     (the textarea losing focus, before a review, before leaving), when the
//     tab is hidden, and when the page unmounts.
//   * A save that fails keeps everything where it is and tries again, a little
//     later each time, and at once when the connection comes back. Closing or
//     reloading the tab with unsaved words asks first.
//   * A save says which copy of the essay it was typed on (the row's
//     updated_at, `stamp`). When the essay was changed somewhere else since
//     (another tab, a phone), nothing is written over that copy. Where the
//     two changed different things they are simply put together. Where both
//     changed the same thing, saving pauses ("conflict"), every word stays
//     on screen, and the student chooses which copy stays (`settle`).
//   * Leaving the page inside the app does not end the job. Words that have
//     not landed keep being retried from the page that was left, and the tab
//     still asks before it closes, until they land or the same essay is
//     opened again and that page takes over (readDraft).
//   * A restored version goes through `edit` like typing does: there is no
//     second way to write an essay's text.
//
// A copy of unsaved text is also held in this tab's sessionStorage (see
// readDraft), for the cases no save can cover: the browser discarding a
// background tab, a reload while offline. It is only ever the student's own
// words, in their own browser, kept under the student and the essay they
// belong to and given back to no other. It is removed as soon as the save
// lands and when the student signs out (dropAllDrafts), and it is gone when
// the tab closes.

export const SAVE_AFTER_MS = 1000;
const KEEP_AFTER_MS = 300;
const RETRY_MS = [2000, 4000, 8000, 15000, 30000];
// Timed retries from a page that has been left. After these, the connection
// coming back or the tab being shown again still tries.
const LEFT_TRIES = 8;
// How many unanswered saves are remembered (see `lost`).
const LOST_MAX = 12;
// How many times one save may be put on top of a copy that changed under it
// before it counts as a failed save and waits its turn like any other.
const MERGES_MAX = 3;

/** The columns a student edits here (src/lib/essay.js sends nothing else). */
const FIELDS = ["title", "status", "prompt_key", "prompt_text", "word_limit", "body"];
const STATUS_KEYS = new Set(ESSAY_STATUS.map((s) => s.key));
const BLANK = Object.freeze({ title: "", status: "idea", prompt_key: null, prompt_text: "", word_limit: PS_MAX, body: "" });

/** An essay row's editable fields, as the page holds them. */
function fieldsOf(row) {
  const limit = Number(row?.word_limit);
  return {
    title: typeof row?.title === "string" ? row.title : "",
    status: STATUS_KEYS.has(row?.status) ? row.status : "idea",
    prompt_key: typeof row?.prompt_key === "string" && row.prompt_key ? row.prompt_key : null,
    prompt_text: typeof row?.prompt_text === "string" ? row.prompt_text : "",
    word_limit: Number.isFinite(limit) ? limit : PS_MAX,
    body: typeof row?.body === "string" ? row.body : "",
  };
}

// ── The copy kept in this tab ────────────────────────────────────────────────

const DRAFT_PREFIX = "mentorable.essayDraft.";

// Pages that were left with words not saved yet and are still at it (see the
// hook's cleanup): the key of their kept copy -> stop that page for good.
const leftBehind = new Map();

/** Where one student's unsaved words for one essay are kept, or null. */
export function draftKey(userId, essayId) {
  return userId && essayId ? `${DRAFT_PREFIX}${userId}.${String(essayId).toLowerCase()}` : null;
}

function writeDraft(key, record) {
  try { sessionStorage.setItem(key, JSON.stringify(record)); } catch { /* storage blocked or full: the save itself is what counts */ }
}

export function dropDraft(key) {
  if (!key) return;
  try { sessionStorage.removeItem(key); } catch { /* storage blocked: nothing was kept */ }
}

/**
 * Signing out: every kept copy in this tab is removed, and a page that was
 * left still trying to save stops. Called before the session ends (Log out,
 * Delete my account), so an essay's unsaved words never outlive it on a
 * shared computer. `keep`: a student whose copies stay. The app passes the
 * student who is signed in now, so that anyone else's copies go the moment a
 * different student is known to be using this tab.
 */
export function dropAllDrafts({ keep = null } = {}) {
  const kept = keep ? `${DRAFT_PREFIX}${keep}.` : null;
  const spared = (key) => !!kept && key.startsWith(kept);
  for (const [key, retire] of [...leftBehind]) if (!spared(key)) retire();
  try {
    const keys = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(DRAFT_PREFIX) && !spared(key)) keys.push(key);
    }
    for (const key of keys) sessionStorage.removeItem(key);
  } catch { /* storage blocked: nothing was kept */ }
}

/**
 * Words typed on this essay that never reached the database (the tab was
 * reloaded or discarded inside the save delay, or while saves were failing).
 * `userId` is the student signed in now and `row` the essay just loaded: the
 * copy is looked up under exactly that student and that essay, and one that
 * says it belongs anywhere else is dropped, so words only ever come back onto
 * the essay and the student they were typed for.
 *
 * Returns null, or { body, clash, mine }:
 *   clash false  the row is still the copy the words were typed on (or this
 *                tab's own last save of it): they go straight back.
 *   clash true   the essay was changed somewhere else and these words were
 *                typed after that, on a copy that was already old. Neither is
 *                dropped: the page shows the words and asks which stays.
 *   mine         the stamps of this tab's saves that were never answered.
 * Words older than a change made somewhere else are dropped.
 */
export function readDraft(userId, row) {
  const key = draftKey(userId, row?.id);
  if (!key) return null;
  let rec = null;
  try { rec = JSON.parse(sessionStorage.getItem(key) || "null"); } catch { rec = null; }
  if (!rec || typeof rec !== "object") return null;
  // The page that typed them may still be saving in the background. The page
  // opening now has the words and takes over from here.
  leftBehind.get(key)?.();
  const rowBody = typeof row.body === "string" ? row.body : "";
  if (rec.key !== key || typeof rec.body !== "string" || rec.body === rowBody || rec.body.length > BODY_MAX) {
    dropDraft(key);
    return null;
  }
  const rowAt = Date.parse(row.updated_at || "");
  const typedAt = Date.parse(rec.at || "");
  const mine = (Array.isArray(rec.mine) ? rec.mine : []).filter((s) => typeof s === "string").slice(-LOST_MAX);
  const sameCopy = (!!rec.base && Date.parse(rec.base) === rowAt) || mine.some((s) => Date.parse(s) === rowAt);
  if (sameCopy && rec.clash !== true) return { body: rec.body, clash: false, mine };
  const newer = Number.isFinite(typedAt) && Number.isFinite(rowAt) && typedAt > rowAt;
  if (!newer && rec.clash !== true) { dropDraft(key); return null; }
  return { body: rec.body, clash: true, mine };
}

// ── The hook ─────────────────────────────────────────────────────────────────

/**
 * save(patch, guard): writes the changed fields and resolves to the row (the
 * page passes saveEssay bound to this student and essay; `guard` is its
 * { expect, stamp, mine }). storageKey: from draftKey, once the student is
 * known. isFinal(error): true for a refusal no retry will change (the essay
 * is gone, a field the database will not take), so the hook stops retrying
 * and waits for the next edit. onFailed(count, error): every failed save, for
 * the page to explain.
 *
 * Returns:
 *   values            the editable fields as they are on screen
 *   state             "idle" | "saving" | "saved" | "retrying" | "stuck" | "conflict" | "stopped"
 *   other             while "conflict": the row as it was saved somewhere else
 *   adopt(row, kept, { clash, mine })
 *                     start from a loaded row (and words kept from last time,
 *                     as readDraft returned them)
 *   edit(patch)       the student changed something (typing, a restore, the title)
 *   saveNow()         save whatever is unsaved; resolves true when it all landed
 *   settle(choice)    end a conflict. "mine": what this page changed is saved
 *                     on top of the other copy. "theirs": the other copy is
 *                     shown and this page's unsaved words go. Resolves true
 *                     when it is settled and saved.
 *   isDirty()         something on screen is not in the database yet
 *   holds(field)      this page changed that field and has not saved it
 *   isIdle()          nothing unsaved, nothing in flight, nothing paused
 *   rowStamp()        the updated_at of the copy this page is working on
 *   current()         the fields as they are right now (not a render behind)
 *   stop()            the essay is gone: no more saves, no leave warning
 */
export default function useAutosave({ save, storageKey = null, isFinal, onFailed }) {
  const [values, setValues] = useState(BLANK);
  const [state, setState] = useState("idle");
  const [other, setOther] = useState(null);

  const latest = useRef(BLANK);       // what is on screen
  const baseline = useRef(null);      // what the database holds, as far as this page knows; null until adopt
  const stamp = useRef(null);         // that row's updated_at: the copy every save says it was typed on
  const lost = useRef([]);            // the updated_at of each save sent from here whose answer has not come back
  const clash = useRef(null);         // the row someone else saved, until the student chooses between the two
  const timer = useRef(null);         // the save a second after typing stops
  const retryTimer = useRef(null);
  const keepTimer = useRef(null);
  const pump = useRef(null);          // the saves in flight, as one promise
  const again = useRef(false);        // asked to save while one was in flight
  const fails = useRef(0);
  const leftFails = useRef(0);        // failed saves since the page was left
  const stopped = useRef(false);
  const retired = useRef(false);      // left, and taken over (the essay reopened, or a sign-out): nothing more is sent or kept
  const alive = useRef(true);
  const detach = useRef(null);        // takes this page's window listeners off
  const io = useRef({});
  io.current = { save, storageKey, isFinal, onFailed };
  const runRef = useRef(null);

  const pending = useCallback(() => {
    const base = baseline.current;
    const patch = {};
    if (!base) return patch;
    for (const key of FIELDS) if (latest.current[key] !== base[key]) patch[key] = latest.current[key];
    return patch;
  }, []);

  const isDirty = useCallback(() => Object.keys(pending()).length > 0, [pending]);
  const holds = useCallback((field) => Object.prototype.hasOwnProperty.call(pending(), field), [pending]);

  /** Bring the kept copy up to date: the unsaved body, or nothing once the
   *  database has it. */
  const keepNow = useCallback(() => {
    clearTimeout(keepTimer.current);
    keepTimer.current = null;
    if (retired.current) return;
    const key = io.current.storageKey;
    const base = baseline.current;
    if (!key || !base) return;
    if (!stopped.current && latest.current.body !== base.body) {
      writeDraft(key, {
        key, body: latest.current.body, at: new Date().toISOString(), base: stamp.current, mine: lost.current,
        clash: !!clash.current,
      });
    } else {
      dropDraft(key);
    }
  }, []);

  /** A page that was left has nothing more to do: its listeners come off. */
  const rest = useCallback(() => {
    if (!alive.current) detach.current?.();
  }, []);

  const run = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = null;
    clearTimeout(retryTimer.current);
    retryTimer.current = null;
    // Gone, taken over, or waiting for the student to choose between two copies.
    if (stopped.current || retired.current || clash.current) return Promise.resolve(false);
    // One save at a time. The one in flight goes round again when it lands,
    // and whoever asked waits for that too.
    if (pump.current) { again.current = true; return pump.current; }
    if (!isDirty()) return Promise.resolve(true);
    // A retry keeps saying "couldn't save" until one lands, rather than
    // flickering between the two.
    if (alive.current && fails.current === 0) setState("saving");

    let final = false;
    const loop = (async () => {
      let ok = true;
      let merges = 0;
      do {
        again.current = false;
        const patch = pending();
        if (!Object.keys(patch).length) break;
        // The save names the copy it was typed on and carries a stamp of its
        // own, remembered until it is answered: if only the answer is lost,
        // the next try can tell this page's own save from someone else's.
        const at = new Date().toISOString();
        const earlier = lost.current;
        lost.current = [...earlier, at].slice(-LOST_MAX);
        try {
          const row = await io.current.save(patch, { expect: stamp.current, stamp: at, mine: earlier });
          // What was sent is what the database has now. Anything typed since
          // is still different from it, and the next round sends that.
          baseline.current = { ...baseline.current, ...patch };
          stamp.current = row?.updated_at || (stamp.current ? at : null);
          lost.current = [];
          fails.current = 0;
        } catch (thrown) {
          let e = thrown;
          let theirs = e?.name === "EssayError" && e.code === "conflict" && e.row && typeof e.row === "object" ? e.row : null;
          const held = theirs ? fieldsOf(theirs) : null;
          const base = baseline.current;
          const mineNow = latest.current;
          // Two copies only clash where both changed the same thing to
          // different words (the essay's text, nearly always).
          if (held && !FIELDS.some((key) => held[key] !== base[key] && mineNow[key] !== base[key] && held[key] !== mineNow[key])) {
            if (merges < MERGES_MAX) {
              // Changed somewhere else, but not what this page changed (a new
              // status in another tab, this tab's own earlier page saving the
              // same words): nothing to choose. The page takes that copy for
              // everything it did not touch, and its own changes go on top.
              merges += 1;
              const merged = { ...held };
              for (const key of FIELDS) if (mineNow[key] !== base[key]) merged[key] = mineNow[key];
              baseline.current = held;
              latest.current = merged;
              stamp.current = theirs.updated_at || null;
              lost.current = [];
              fails.current = 0;
              if (alive.current) setValues(merged);
              again.current = true;
              continue;
            }
            // It keeps changing under this save: an ordinary failure, tried
            // again a little later, and never a choice between copies.
            theirs = null;
            e = Object.assign(new Error("the essay kept changing"), { name: "EssayError", code: "save" });
          }
          // The code only: an error can carry the essay's words (a conflict does).
          console.warn("[essay] autosave failed:", e?.code || e?.name || "error");
          ok = false;
          fails.current += 1;
          if (theirs) {
            clash.current = theirs;
            final = true;
          } else {
            try { final = !!io.current.isFinal?.(e); } catch { final = false; }
          }
          // A refusal was certainly not written. Anything else may have
          // landed with only its answer lost, so its stamp stays remembered.
          if (final) lost.current = earlier;
          try { io.current.onFailed?.(fails.current, e); } catch (err) { console.warn("[essay] onFailed threw:", err?.name || "error"); }
        }
      } while (ok && again.current && !stopped.current && !retired.current);
      return ok;
    })();

    const done = loop.then((ok) => {
      pump.current = null;
      again.current = false;
      if (retired.current) return false;
      keepNow();
      if (stopped.current) { rest(); return false; }
      if (!ok) {
        if (clash.current) {
          if (alive.current) { setOther(clash.current); setState("conflict"); }
          return false;
        }
        if (alive.current) setState(final ? "stuck" : "retrying");
        else leftFails.current += 1;
        if (final) { rest(); return false; }
        // A page that was left keeps trying too, for a while (see LEFT_TRIES).
        if (alive.current || leftFails.current < LEFT_TRIES) {
          const wait = RETRY_MS[Math.min(fails.current, RETRY_MS.length) - 1] || RETRY_MS[0];
          retryTimer.current = setTimeout(() => runRef.current?.(), wait);
        }
        return false;
      }
      if (!isDirty()) {
        if (alive.current) setState("saved");
        else rest();
      } else if (!timer.current) {
        // Typed on while it saved: the delay that typing started will save it.
        timer.current = setTimeout(() => runRef.current?.(), SAVE_AFTER_MS);
      }
      return true;
    });
    pump.current = done;
    return done;
  }, [isDirty, pending, keepNow, rest]);
  runRef.current = run;

  const edit = useCallback((patch) => {
    if (!baseline.current || !patch) return;
    latest.current = { ...latest.current, ...patch };
    setValues(latest.current);
    if (stopped.current) return;          // gone: the words stay on screen to be copied, nothing is sent
    if (Object.prototype.hasOwnProperty.call(patch, "body")) {
      clearTimeout(keepTimer.current);
      keepTimer.current = setTimeout(keepNow, KEEP_AFTER_MS);
    }
    if (clash.current) return;            // paused until the student chooses: the words stay here and in the kept copy
    clearTimeout(timer.current);
    timer.current = null;
    if (!isDirty()) {
      // Typed back to exactly what is saved: nothing left to send or retry.
      clearTimeout(retryTimer.current);
      retryTimer.current = null;
      if (!pump.current) { fails.current = 0; setState("saved"); }
      return;
    }
    if (fails.current === 0) setState("saving");
    timer.current = setTimeout(() => runRef.current?.(), SAVE_AFTER_MS);
  }, [isDirty, keepNow]);

  const adopt = useCallback((row, kept = null, { clash: clashing = false, mine = [] } = {}) => {
    const base = fieldsOf(row);
    baseline.current = base;
    stamp.current = row?.updated_at || null;
    latest.current = typeof kept === "string" ? { ...base, body: kept } : base;
    lost.current = Array.isArray(mine) ? mine.slice(-LOST_MAX) : [];
    clash.current = null;
    fails.current = 0;
    stopped.current = false;
    setValues(latest.current);
    for (const t of [timer, retryTimer]) { clearTimeout(t.current); t.current = null; }
    if (!isDirty()) {
      setOther(null);
      setState("idle");
    } else if (clashing) {
      // Kept words that were typed on a copy someone else has since changed:
      // they are shown, and nothing is saved until the student chooses.
      clash.current = row;
      setOther(row);
      setState("conflict");
    } else {
      setOther(null);
      setState("saving");
      timer.current = setTimeout(() => runRef.current?.(), 0);
    }
  }, [isDirty]);

  const settle = useCallback((choice) => {
    const theirs = clash.current;
    if (!theirs || stopped.current || retired.current) return Promise.resolve(false);
    if (choice === "theirs") {
      adopt(theirs);
      dropDraft(io.current.storageKey);
      return Promise.resolve(true);
    }
    // What this page changed, on top of the other copy: a field the student
    // did not touch here keeps what the other copy says.
    const mineOnly = pending();
    const base = fieldsOf(theirs);
    clash.current = null;
    baseline.current = base;
    stamp.current = theirs.updated_at || null;
    latest.current = { ...base, ...mineOnly };
    lost.current = [];
    fails.current = 0;
    setValues(latest.current);
    setOther(null);
    if (!isDirty()) {
      setState("saved");
      keepNow();
      return Promise.resolve(true);
    }
    return runRef.current();
  }, [adopt, isDirty, keepNow, pending]);

  const stop = useCallback(() => {
    stopped.current = true;
    clash.current = null;
    for (const t of [timer, retryTimer, keepTimer]) { clearTimeout(t.current); t.current = null; }
    dropDraft(io.current.storageKey);
    if (alive.current) {
      setOther(null);
      setState("stopped");
    } else {
      detach.current?.();
    }
  }, []);

  const current = useCallback(() => latest.current, []);
  const rowStamp = useCallback(() => stamp.current, []);
  const isIdle = useCallback(
    () => !!baseline.current && !stopped.current && !clash.current && !pump.current && !isDirty(),
    [isDirty],
  );

  useEffect(() => {
    alive.current = true;
    leftFails.current = 0;
    detach.current?.();                 // listeners from an earlier mount of this same page
    const unsaved = () => !stopped.current && !retired.current && (!!pump.current || isDirty());
    // Closing or reloading with words that are not saved yet: the browser asks.
    const onBeforeUnload = (e) => {
      if (!unsaved()) return;
      keepNow();
      e.preventDefault();
      e.returnValue = "";
    };
    // Hidden or on its way out: save now. A request cut off by the tab closing
    // is what the kept copy is for.
    const onHide = () => {
      keepNow();
      if (!stopped.current && isDirty()) runRef.current?.();
    };
    const onOnline = () => { if (!stopped.current && isDirty()) runRef.current?.(); };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") onHide();
      else if (!alive.current) onOnline();   // a page that was left: being looked at again is a reason to try
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("pagehide", onHide);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibility);

    let leftAs = null;                  // the key this page is listed under in leftBehind, once it has been left
    const off = () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
      if (leftAs && leftBehind.get(leftAs) === retire) leftBehind.delete(leftAs);
      leftAs = null;
      if (detach.current === off) detach.current = null;
    };
    // The essay was opened again (that page has the kept words and saves
    // them), or the student signed out: this page sends and keeps nothing more.
    function retire() {
      retired.current = true;
      for (const t of [timer, retryTimer, keepTimer]) { clearTimeout(t.current); t.current = null; }
      off();
    }
    detach.current = off;

    return () => {
      alive.current = false;
      for (const t of [timer, retryTimer]) { clearTimeout(t.current); t.current = null; }
      // Leaving the page inside the app: save what is unsaved. The kept copy
      // is written after the save has started, so it knows that save's stamp.
      if (!stopped.current && isDirty()) runRef.current?.();
      keepNow();
      if (!unsaved()) { off(); return; }
      // Not landed yet. The listeners stay, so the save is retried, the
      // connection coming back tries at once and the tab still asks before it
      // closes, until the words land (see `rest`).
      leftAs = io.current.storageKey;
      if (leftAs) leftBehind.set(leftAs, retire);
    };
  }, [isDirty, keepNow]);

  return { values, state, other, adopt, edit, saveNow: run, settle, isDirty, holds, isIdle, rowStamp, current, stop };
}
