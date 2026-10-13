import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { QUILL_LINES } from "../../../../lib/agents/registry.js";
import { CHECKS } from "../../../../lib/essay.js";
import { useIsMobile } from "../../../../hooks/useIsMobile.js";
import Spinner from "../../../common/Spinner.jsx";
import { PixelStamp } from "../../../ui/PixelIcons.jsx";
import { Button, Card, Notice, SR_ONLY } from "../../../ui/kit.jsx";
import {
  BG, BORDER, DANGER, FOCUS_CLASS, RADIUS, SANS, SURFACE, TEXT, TEXT_MID, TEXT_MUTED, useAgentInk,
} from "../../../ui/tokens.js";
import { MascotSays } from "../../SpeechBubble.jsx";
import Sheet from "../../outreach/Sheet.jsx";
import ChecksStrip from "./ChecksStrip.jsx";
import { BackLink } from "./EditorHeader.jsx";
import NoteCard, { CutCard } from "./NoteCard.jsx";
import { NoteRow, Stepper } from "./NoteRow.jsx";
import ReviewCopy from "./ReviewCopy.jsx";
import { QUILL, plural, pulse, scrollBehavior, scrollInside, whenLabel } from "./editorUi.js";
import { buildReview, responseOf, without } from "./reviewModel.js";

// One review, read beside the version it was made on.
//
// Under the review's heading, the seven checks run along one strip. Below
// that, a read-only copy of the version Quill read, with the quoted passages
// highlighted, and Quill's notes in the margin beside it: one open at a time,
// the rest folded to a row each. Choosing a highlight opens its note, choosing
// a note finds its highlight, and next and previous step through the notes.
//
// A margin cannot sit beside the text on a phone or a small window (`narrow`):
// there the notes are a list under the text, and one opens as a bottom sheet
// (with the same next and previous).
//
// Nothing on this screen edits the essay. There is no text field for it, the
// highlights come from the version's own text (never from what the student
// has typed since), and a note has no field that could hold new essay text.
// The one thing a student writes here is their own answer to a note: kept in
// a box, saved to the review's `responses`, and never sent to Quill.

const ANSWER_SAVE_MS = 1200;
const CHECK_LABELS = Object.fromEntries(CHECKS.map((c) => [c.key, c.label]));

const h3 = { margin: 0, fontFamily: SANS, fontSize: "1.1rem", fontWeight: 800, color: TEXT, lineHeight: 1.3 };
const list = { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 };
const quiet = { margin: 0, fontFamily: SANS, fontSize: "0.95rem", fontWeight: 600, color: TEXT_MUTED, lineHeight: 1.55 };

/**
 * review: the essay_reviews row, with `responses` as the page holds them.
 * version: { state: "loading" | "ready" | "gone" | "error", body } for the
 * version it read (undefined while the page has not asked yet). title: the
 * essay's, as it is now. promptName, promptText: the prompt shown with it,
 * and what to call it (the one this review was read against when its row
 * says, the essay's prompt as it is now otherwise, named as such).
 * changedSince: the essay's text is no longer this version's. narrow: no
 * room for a margin, so a note opens as a sheet. startNote: a note to open at.
 * headingRef: the heading the page focuses on arrival.
 * onBack(): Keep writing. onRespond(noteId, { state, answer } | null):
 * resolves true when it saved (the page rolls back and says so when it did
 * not). onDelete(): resolves when the review is gone, throws an Error whose
 * message is fit to show. onRetryVersion(): load the version again.
 */
export default function ReviewView({
  review, version, title, promptName, promptText, changedSince = false, narrow = false, isMobile = false, startNote = null,
  headingRef, onBack, onRespond, onDelete, onRetryVersion,
}) {
  const ink = useAgentInk();
  // Seven marks and their words need about 700px; under that, marks alone.
  const compactStrip = useIsMobile(700);
  const versionState = version?.state || "loading";
  const body = versionState === "ready" && typeof version.body === "string" ? version.body : null;
  const { notes: rawNotes, cuts: rawCuts, checks: rawChecks, responses } = review;
  const model = useMemo(
    () => buildReview({ notes: rawNotes, cuts: rawCuts, checks: rawChecks }, body),
    [rawNotes, rawCuts, rawChecks, body],
  );
  // Stepping goes through the notes, then the passages that could go.
  const order = useMemo(() => [...model.notes.map((n) => n.id), ...model.cuts.map((c) => c.id)], [model]);

  const [active, setActive] = useState(() => startNote || (narrow ? null : order[0] || null));
  const [picked, setPicked] = useState(null);        // a check chosen in the strip, until a note is chosen
  const [sheetId, setSheetId] = useState(null);
  const [tick, setTick] = useState(0);
  const [said, setSaid] = useState(null);            // { text, n }: the latest line for screen readers
  const [drafts, setDrafts] = useState({});          // note id -> words in its box the database does not have yet
  const [stuck, setStuck] = useState(() => new Set());   // note ids whose last save failed
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  const marks = useRef(new Map());     // highlight id -> its element in the text
  const cards = useRef(new Map());     // note or cut id -> its open card in the margin
  const rail = useRef(null);
  const sheetCard = useRef(null);
  const pending = useRef(null);        // what to do once the chosen note has rendered: { id, mark, focus }
  const draftsRef = useRef({});
  const timers = useRef(new Map());
  const sending = useRef(new Map());   // note id -> the words of its box that are being saved right now
  const jumped = useRef(false);
  const mounted = useRef(true);
  const responsesRef = useRef(responses);
  responsesRef.current = responses;
  const respondRef = useRef(onRespond);
  respondRef.current = onRespond;

  // ── The student's own answers ──────────────────────────────────────────────
  // A box's words are a draft here until the page has stored them, so they
  // survive a failed save (the page rolls the stored answer back; the box
  // keeps what was typed and the next pause or blur sends it again).

  const setDraft = useCallback((id, text) => {
    draftsRef.current = text === undefined ? without(draftsRef.current, id) : { ...draftsRef.current, [id]: text };
    if (mounted.current) setDrafts(draftsRef.current);
  }, []);

  const markStuck = useCallback((id, on) => {
    if (!mounted.current) return;
    setStuck((prev) => {
      if (prev.has(id) === on) return prev;
      const next = new Set(prev);
      if (on) next.add(id); else next.delete(id);
      return next;
    });
  }, []);

  /** Send a note's response and settle its box. `typed` is the draft the
   *  response was made from: it is cleared only if the box still holds it. */
  const send = useCallback(async (id, next, typed) => {
    if (typed !== undefined) sending.current.set(id, typed);
    const ok = await respondRef.current?.(id, next);
    if (sending.current.get(id) === typed) sending.current.delete(id);
    markStuck(id, ok === false);
    if (ok && typed !== undefined && draftsRef.current[id] === typed) setDraft(id, undefined);
    return ok;
  }, [markStuck, setDraft]);

  const flush = useCallback((id) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    const typed = draftsRef.current[id];
    if (typed === undefined) return;
    // These very words are on their way already. The page shows an answer as
    // stored before the database has answered, so comparing with it now would
    // call the box saved and let go of the words: if that save then failed,
    // they would be nowhere. The save that is out settles the box.
    if (sending.current.get(id) === typed) return;
    const now = responseOf(responsesRef.current, id);
    const answer = typed.trim() ? typed : "";
    if (answer === (now?.answer || "")) { setDraft(id, undefined); return; }
    const dismissed = now?.state === "dismissed";
    send(id, answer ? { state: dismissed ? "dismissed" : "answered", answer } : dismissed ? { state: "dismissed", answer: "" } : null, typed);
  }, [send, setDraft]);

  const type = (id, text) => {
    setDraft(id, text);
    clearTimeout(timers.current.get(id));
    timers.current.set(id, setTimeout(() => flush(id), ANSWER_SAVE_MS));
  };

  // Leaving the review (Keep writing, another review, another page): send
  // whatever is still only in a box.
  useEffect(() => {
    mounted.current = true;
    const waiting = timers.current;
    return () => {
      mounted.current = false;
      for (const t of waiting.values()) clearTimeout(t);
      waiting.clear();
      for (const id of Object.keys(draftsRef.current)) flush(id);
    };
  }, [flush]);

  // An answer waits a moment after the last keystroke before it is saved, and
  // a tab can close inside that moment. So, as the essay itself does:
  //   * the page going out of sight (another app on a phone, another tab)
  //     sends whatever is still only in a box, at once. The page is still
  //     alive then, so the save lands;
  //   * a tab that is closing asks first, while any box holds words the
  //     database has not confirmed. A save started as a tab closes is usually
  //     cut off, so the question is what protects those words, not the send.
  useEffect(() => {
    const sendAll = () => { for (const id of Object.keys(draftsRef.current)) flush(id); };
    const onVisibility = () => { if (document.visibilityState === "hidden") sendAll(); };
    const onBeforeUnload = (e) => {
      if (!Object.keys(draftsRef.current).length) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("pagehide", sendAll);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("pagehide", sendAll);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [flush]);

  /** After Dismiss or Bring it back the button that was pressed is gone:
   *  focus stays on the note. */
  const refocus = (id) => requestAnimationFrame(() => {
    (sheetCard.current || cards.current.get(id))?.focus?.({ preventScroll: true });
  });

  const dismiss = (id) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    const typed = draftsRef.current[id];
    const kept = typed !== undefined ? (typed.trim() ? typed : "") : (responseOf(responsesRef.current, id)?.answer || "");
    send(id, { state: "dismissed", answer: kept }, typed);
    refocus(id);
  };

  const restore = (id) => {
    const answer = responseOf(responsesRef.current, id)?.answer || "";
    send(id, answer.trim() ? { state: "answered", answer } : null, undefined);
    refocus(id);
  };

  // ── Choosing: a note finds its highlight, a highlight finds its note ───────

  const announce = useCallback((text) => setSaid((prev) => ({ text, n: (prev?.n || 0) + 1 })), []);

  /** "Note 2 of 4" or "Passage that could go 1 of 2". */
  const where = (id) => {
    const item = model.byId.get(id);
    if (!item) return "";
    return item.kind === "cut"
      ? `Passage that could go ${item.number} of ${model.cuts.length}`
      : `Note ${item.number} of ${model.notes.length}`;
  };

  /** Open one in the margin (a wide screen). `mark`: bring its highlight into
   *  view. `focus`: "card" or "mark" to move focus there, or null to leave it
   *  where it is (a stepping button keeps it). It runs once the card has
   *  rendered: until then the item is only a folded row. */
  const select = useCallback((id, { mark = true, focus = null } = {}) => {
    setPicked(null);
    setActive(id);
    pending.current = { id, mark, focus };
    setTick((n) => n + 1);
  }, []);

  useEffect(() => {
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    const card = cards.current.get(p.id);
    const markEl = marks.current.get(model.anchor[p.id]);
    if (!narrow && card) scrollInside(rail.current, card);
    if (p.mark && markEl) {
      try { markEl.scrollIntoView({ block: "center", behavior: scrollBehavior() }); } catch { markEl.scrollIntoView(); }
      pulse(markEl, ink.accent, { mark: true });
    }
    if (p.focus === "card" && card) {
      card.focus({ preventScroll: true });
      pulse(card, ink.accent);
    } else if (p.focus === "mark" && markEl) {
      markEl.focus({ preventScroll: true });
    }
  }, [tick, narrow, model, ink.accent]);

  // A wide screen always has one note open.
  useEffect(() => {
    if (!narrow && order.length && (!active || !model.byId.has(active))) setActive(order[0]);
  }, [narrow, active, order, model]);

  /** Open one from a row, the strip, or a highlight. A wide screen opens it in
   *  the margin; a narrow one opens the sheet. */
  const open = (id, { mark = true } = {}) => {
    if (narrow) {
      setPicked(null);
      setActive(id);
      setSheetId(id);
    } else {
      select(id, { mark, focus: "card" });
    }
  };

  /** A highlight in the text was chosen. */
  const chooseHighlight = (id) => {
    // A tap does not always focus what it lands on. The sheet hands focus
    // back to whatever had it when it opened, and that should be this highlight.
    if (narrow) marks.current.get(id)?.focus?.({ preventScroll: true });
    open(id, { mark: false });
  };

  const closeSheet = (reveal = false) => {
    const id = sheetId;
    if (id) flush(id);
    setSheetId(null);
    if (reveal && id) {
      requestAnimationFrame(() => {
        const el = marks.current.get(model.anchor[id]);
        if (!el) return;
        try { el.scrollIntoView({ block: "center", behavior: scrollBehavior() }); } catch { el.scrollIntoView(); }
      });
    }
  };

  /** Next (1) or previous (-1), wrapping round. */
  const go = (dir) => {
    if (order.length < 2) return;
    const at = order.indexOf(narrow ? sheetId : active);
    const next = order[at < 0 ? (dir > 0 ? 0 : order.length - 1) : (at + dir + order.length) % order.length];
    announce(`${where(next)}, open.`);
    if (narrow) {
      if (sheetId) flush(sheetId);
      setPicked(null);
      setActive(next);
      setSheetId(next);
    } else {
      select(next, { mark: true, focus: null });
    }
  };

  // Opened at a note (from the editor's open notes): go to it once the text
  // is in, after the page has put focus on the heading.
  const arrive = useRef(null);
  arrive.current = () => {
    if (!model.byId.has(startNote)) return;
    select(startNote, { mark: true, focus: marks.current.get(model.anchor[startNote]) ? "mark" : "card" });
  };
  useEffect(() => {
    if (!startNote || jumped.current || versionState === "loading") return undefined;
    const frame = requestAnimationFrame(() => {
      jumped.current = true;
      arrive.current?.();
    });
    return () => cancelAnimationFrame(frame);
  }, [startNote, versionState]);

  // ── Deleting the review ────────────────────────────────────────────────────

  const remove = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await onDelete?.();
    } catch (e) {
      if (!mounted.current) return;
      setDeleteError(e?.message || "Couldn't delete that review. Try again.");
      setConfirming(false);
      setDeleting(false);
    }
  };

  // ── What shows ─────────────────────────────────────────────────────────────

  const count = model.notes.length;
  // A read with no notes is only "nothing to flag" when nothing else on the
  // page says otherwise: no check flagged (length is flagged by count alone,
  // and a note can be dropped while its check stays flagged) and no passages
  // listed to cut.
  const flagged = model.checks.some((c) => c.verdict === "flag") || model.cuts.length > 0;
  const when = whenLabel(review.created_at);
  const wordsRead = Number.isFinite(Number(review.word_count)) ? plural(Number(review.word_count), "word") : "";
  const summary = typeof review.summary === "string" ? review.summary.trim() : "";
  const prompt = typeof promptText === "string" ? promptText.trim() : "";
  const sheetItem = sheetId ? model.byId.get(sheetId) || null : null;
  const activeItem = active ? model.byId.get(active) || null : null;
  // The check whose line is open in the strip: the one chosen there, else the
  // open note's, else the first that is flagged.
  const shownCheck = picked
    || (activeItem ? (activeItem.kind === "cut" ? "length" : activeItem.check) : null)
    || (model.checks.find((c) => c.verdict === "flag") || model.checks[0] || {}).key
    || null;

  const registerMark = (id, node) => { if (node) marks.current.set(id, node); else marks.current.delete(id); };
  const registerCard = (id) => (node) => { if (node) cards.current.set(id, node); else cards.current.delete(id); };

  const noteProps = (note) => {
    const response = responseOf(responses, note.id);
    const typed = drafts[note.id];
    return {
      note,
      checkLabel: CHECK_LABELS[note.check] || "",
      response,
      answer: typed !== undefined ? typed : (response?.answer || ""),
      unsaved: stuck.has(note.id) && typed !== undefined,
      active: active === note.id,
      onAnswer: (text) => type(note.id, text),
      onAnswerBlur: () => flush(note.id),
      onDismiss: () => dismiss(note.id),
      onRestore: () => restore(note.id),
    };
  };
  const finder = (id) => (model.anchor[id] ? () => select(id, { mark: true, focus: "mark" }) : undefined);

  /** One item in the margin: the open one in full, the others as a row. */
  const marginItem = (id) => {
    const item = model.byId.get(id);
    if (!item) return null;
    if (active === id) {
      return item.kind === "cut"
        ? <CutCard cut={item} active onShow={finder(id)} register={registerCard(id)} />
        : <NoteCard {...noteProps(item)} onShow={finder(id)} register={registerCard(id)} />;
    }
    return (
      <NoteRow item={item} checkLabel={CHECK_LABELS[item.check] || ""} response={item.kind === "cut" ? null : responseOf(responses, id)}
        onOpen={() => open(id)} />
    );
  };

  /** A row that opens a sheet (a narrow screen). */
  const sheetRow = (id) => {
    const item = model.byId.get(id);
    if (!item) return null;
    return (
      <NoteRow item={item} checkLabel={CHECK_LABELS[item.check] || ""} response={item.kind === "cut" ? null : responseOf(responses, id)}
        popup onOpen={() => open(id)} />
    );
  };

  const stepLabel = (id) => where(id) || "";
  const stepper = order.length > 1 ? (
    <Stepper label={stepLabel(narrow ? sheetId : active) || `${plural(order.length, "note")}`} what={model.cuts.length ? "item" : "note"}
      onPrev={() => go(-1)} onNext={() => go(1)} />
  ) : null;

  const proofread = (
    <p style={{ ...quiet, margin: "22px 0 0", paddingTop: 14, borderTop: `1px solid ${BORDER}`, display: "flex",
      alignItems: "flex-start", gap: 8 }}>
      <span aria-hidden="true" style={{ display: "flex", marginTop: 3, flexShrink: 0 }}><PixelStamp kind="scroll" size={16} /></span>
      <span>
        <span style={SR_ONLY}>Quill says: </span>
        {QUILL_LINES.proofread}
      </span>
    </p>
  );

  const cutsIntro = (
    <p style={{ ...quiet, margin: "4px 0 10px", fontVariantNumeric: "tabular-nums" }}>
      {model.cutWords > 0 ? `These would remove about ${plural(model.cutWords, "word")}. ` : ""}
      Quill only points. What to cut, and whether to, is yours to decide.
    </p>
  );

  // The notes beside the text (a wide screen).
  const margin = (
    <aside ref={rail} aria-label="Quill's notes"
      style={{ position: "sticky", top: 16, maxHeight: "calc(100vh - 32px)", overflowY: "auto", padding: 4, margin: -4,
        boxSizing: "border-box", minWidth: 0 }}>
      <section aria-labelledby="qr-notes-title">
        <h3 id="qr-notes-title" style={{ ...h3, fontVariantNumeric: "tabular-nums" }}>
          Quill's notes{count ? ` (${count})` : ""}
        </h3>
        {count === 0 ? (
          <p style={{ ...quiet, marginTop: 6 }}>Quill left no notes on this read.</p>
        ) : (
          <>
            <p style={{ ...quiet, margin: "4px 0 10px" }}>
              {body !== null
                ? "Notes sit beside the words they point at. One is open at a time, and each number matches a highlight in the text."
                : "One note is open at a time."}
            </p>
            {stepper && (
              <div style={{ position: "sticky", top: 0, zIndex: 2, background: BG, padding: "4px 0 10px" }}>{stepper}</div>
            )}
            <ul style={list}>
              {model.notes.map((n) => <li key={n.id}>{marginItem(n.id)}</li>)}
            </ul>
          </>
        )}
      </section>

      {model.cuts.length > 0 && (
        <section aria-labelledby="qr-cuts-title" style={{ marginTop: 22 }}>
          <h3 id="qr-cuts-title" style={h3}>Passages that could go</h3>
          {cutsIntro}
          {count === 0 && stepper && <div style={{ padding: "0 0 10px" }}>{stepper}</div>}
          <ul style={list}>
            {model.cuts.map((c) => <li key={c.id}>{marginItem(c.id)}</li>)}
          </ul>
        </section>
      )}
      {proofread}
    </aside>
  );

  // The notes under the text (a narrow screen): rows, each opening a sheet.
  const below = (
    <Card as="aside" aria-label="Quill's notes" style={{ padding: isMobile ? 16 : "1.1rem 1.2rem" }}>
      <section aria-labelledby="qr-notes-title">
        <h3 id="qr-notes-title" style={{ ...h3, fontVariantNumeric: "tabular-nums" }}>
          Quill's notes{count ? ` (${count})` : ""}
        </h3>
        {count === 0 ? (
          <p style={{ ...quiet, marginTop: 6 }}>Quill left no notes on this read.</p>
        ) : (
          <>
            <p style={{ ...quiet, margin: "4px 0 10px" }}>
              Choose a note to read it. Each number matches a highlight in the text, and choosing a highlight opens its note.
            </p>
            <ul style={list}>
              {model.notes.map((n) => <li key={n.id}>{sheetRow(n.id)}</li>)}
            </ul>
          </>
        )}
      </section>
      {model.cuts.length > 0 && (
        <section aria-labelledby="qr-cuts-title" style={{ marginTop: 22 }}>
          <h3 id="qr-cuts-title" style={h3}>Passages that could go</h3>
          {cutsIntro}
          <ul style={list}>
            {model.cuts.map((c) => <li key={c.id}>{sheetRow(c.id)}</li>)}
          </ul>
        </section>
      )}
      {proofread}
    </Card>
  );

  const copy = (
    <Card as="section" aria-labelledby="qr-copy-title" style={{ padding: isMobile ? 16 : "24px 28px", minWidth: 0 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "6px 12px" }}>
        <h3 id="qr-copy-title" style={h3}>The version Quill read</h3>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: RADIUS.pill,
          background: SURFACE, border: `1px solid ${BORDER}`, fontFamily: SANS, fontSize: "0.9rem", fontWeight: 800,
          color: TEXT_MUTED, whiteSpace: "nowrap" }}>
          <PixelStamp kind="lock" size={16} />
          Read only
        </span>
      </div>

      {(promptName || prompt) && (
        <div style={{ margin: "12px 0 0", padding: "10px 12px", background: SURFACE, border: `1px solid ${BORDER}`,
          borderRadius: RADIUS.control, fontFamily: SANS }}>
          <p style={{ margin: 0, fontSize: "0.9rem", fontWeight: 800, color: TEXT_MUTED }}>{promptName || "The prompt"}</p>
          {prompt && (
            <p style={{ margin: "2px 0 0", fontSize: "0.95rem", fontWeight: 500, color: TEXT_MID, lineHeight: 1.55,
              whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {prompt}
            </p>
          )}
        </div>
      )}

      {/* What the second sentence points at has to be on the page: with no
          notes and nothing marked, it only says which words these are. */}
      {changedSince && body !== null && (
        <p style={{ ...quiet, marginTop: 12 }}>
          {count > 0
            ? "You've changed your essay since Quill read this. The notes point at the words below, not at what you have now."
            : model.cuts.length > 0
              ? "You've changed your essay since Quill read this. The marked passages are in the words below, not in what you have now."
              : "You've changed your essay since Quill read this. This is the version it read."}
        </p>
      )}

      <div style={{ marginTop: 16 }}>
        {versionState === "loading" && (
          <p role="status" style={{ ...quiet, display: "flex", alignItems: "center", gap: 10 }}>
            <Spinner size={18} color={ink.text} />
            Opening the version Quill read
          </p>
        )}
        {versionState === "gone" && (
          <Notice tone="info">
            The version Quill read has been deleted, so its notes are shown without the text around them.
          </Notice>
        )}
        {versionState === "error" && (
          <Notice tone="warn" action={<Button kind="secondary" onClick={onRetryVersion}>Try again</Button>}>
            Couldn't open the version Quill read just now. Its notes are still here.
          </Notice>
        )}
        {body !== null && (
          <ReviewCopy pieces={model.pieces} byId={model.byId} responses={responses} active={active}
            onSelect={chooseHighlight} register={registerMark} />
        )}
      </div>
    </Card>
  );

  return (
    <div style={{ minWidth: 0 }}>
      <BackLink onClick={onBack}>Keep writing</BackLink>
      <header style={{ margin: "0 0 14px" }}>
        <h1 style={{ margin: 0, fontFamily: SANS, fontWeight: 800, fontSize: isMobile ? "1.6rem" : "2rem", color: ink.title,
          letterSpacing: "-0.02em", lineHeight: 1.15, overflowWrap: "anywhere" }}>
          {title || "Your essay"}
        </h1>
        <h2 ref={headingRef} tabIndex={-1} className={FOCUS_CLASS}
          style={{ margin: "8px 0 0", fontFamily: SANS, fontSize: "1.3rem", fontWeight: 800, color: TEXT, borderRadius: 6,
            display: "inline-block" }}>
          Quill's review
        </h2>
        {(when || wordsRead) && (
          <p style={{ ...quiet, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
            {[when ? `Read ${when}` : "", wordsRead].filter(Boolean).join(", ")}
          </p>
        )}
      </header>

      <div style={{ maxWidth: 720 }}>
        <MascotSays agent={QUILL} state={count ? "delivering" : "idle"} size={64} layout="auto">
          {count ? QUILL_LINES.reviewReady(count) : flagged ? QUILL_LINES.reviewNoNotes : QUILL_LINES.reviewClean}
        </MascotSays>
      </div>

      {summary && (
        <Card as="section" aria-labelledby="qr-summary-title" style={{ margin: "16px 0 0", maxWidth: 720 }}>
          <h3 id="qr-summary-title" style={{ ...h3, fontSize: "0.95rem", color: TEXT_MUTED }}>What Quill read</h3>
          <p style={{ margin: "4px 0 0", fontFamily: SANS, fontSize: "1.05rem", fontWeight: 500, color: TEXT, lineHeight: 1.6,
            overflowWrap: "anywhere" }}>
            {summary}
          </p>
        </Card>
      )}

      <div style={{ marginTop: 18 }}>
        <ChecksStrip checks={model.checks} shown={shownCheck} compact={compactStrip} onPick={setPicked}
          onOpenNote={(id) => open(id)} />
      </div>

      {narrow ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 20, marginTop: 18 }}>
          {copy}
          {below}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(320px, 380px)", gap: 24, alignItems: "start",
          marginTop: 18 }}>
          {copy}
          {margin}
        </div>
      )}

      <div style={{ marginTop: 24, display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between",
        gap: "12px 16px" }}>
        <Button kind="primary" onClick={onBack}>Keep writing</Button>
        <div style={{ flex: "1 1 280px", maxWidth: 520, display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          {deleteError && (
            <p role="alert" style={{ margin: "0 0 8px", fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700, color: DANGER,
              lineHeight: 1.45 }}>
              {deleteError}
            </p>
          )}
          {confirming ? (
            <div role="group" aria-labelledby="qr-delete-ask" style={{ width: "100%" }}>
              <p id="qr-delete-ask" style={{ margin: "0 0 10px", fontFamily: SANS, fontSize: "1rem", fontWeight: 700,
                color: TEXT, lineHeight: 1.5 }}>
                Delete this review? Quill's notes and your answers on it go with it. The version it read stays in your saved
                versions, and deleting does not give the review back.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                <Button kind="secondary" autoFocus disabled={deleting} onClick={() => setConfirming(false)}>Keep it</Button>
                <Button kind="danger" busy={deleting} onClick={remove}>Delete this review</Button>
              </div>
            </div>
          ) : (
            <Button kind="quiet" onClick={() => { setDeleteError(null); setConfirming(true); }}
              style={{ color: DANGER, padding: "10px 6px" }}>
              Delete this review
            </Button>
          )}
        </div>
      </div>

      {/* Stepping from note to note says where it landed. */}
      <div role="status" aria-live="polite" aria-atomic="true" style={SR_ONLY}>
        {said && <span key={said.n}>{said.text}</span>}
      </div>

      <AnimatePresence>
        {narrow && sheetItem && (
          <Sheet key="note" onClose={() => closeSheet(false)} labelledBy="qr-sheet-title" width={560}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
              <h2 id="qr-sheet-title" style={{ margin: "8px 0 0", fontFamily: SANS, fontSize: "1.2rem", fontWeight: 800, color: TEXT,
                lineHeight: 1.3 }}>
                {sheetItem.kind === "cut"
                  ? `Passage that could go, ${sheetItem.number}`
                  : `Note ${sheetItem.number}${CHECK_LABELS[sheetItem.check] ? `: ${CHECK_LABELS[sheetItem.check]}` : ""}`}
              </h2>
              <button type="button" className={FOCUS_CLASS} onClick={() => closeSheet(false)} aria-label="Close"
                style={{ flexShrink: 0, width: 44, height: 44, display: "inline-flex", alignItems: "center",
                  justifyContent: "center", border: "none", borderRadius: 10, background: "rgba(20,20,19,0.05)",
                  color: TEXT_MID, cursor: "pointer" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
                  strokeLinecap="round" aria-hidden="true" focusable="false">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            {stepper && <div style={{ margin: "0 0 12px" }}>{stepper}</div>}
            {sheetItem.kind === "cut"
              ? <CutCard key={sheetItem.id} cut={sheetItem} plain />
              : <NoteCard key={sheetItem.id} {...noteProps(sheetItem)} plain register={(node) => { sheetCard.current = node; }} />}
            <div style={{ marginTop: 16 }}>
              <Button kind="primary" onClick={() => closeSheet(true)} style={{ width: "100%" }}>Back to the text</Button>
            </div>
          </Sheet>
        )}
      </AnimatePresence>
    </div>
  );
}
