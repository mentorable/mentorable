import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { QUILL_LINES } from "../../../../lib/agents/registry.js";
import { CHECKS } from "../../../../lib/essay.js";
import Spinner from "../../../common/Spinner.jsx";
import { PixelStamp } from "../../../ui/PixelIcons.jsx";
import { Button, Card, Notice, SR_ONLY } from "../../../ui/kit.jsx";
import {
  BORDER, DANGER, FOCUS_CLASS, RADIUS, SANS, SURFACE, TEXT, TEXT_MID, TEXT_MUTED, WHITE, useAgentInk,
} from "../../../ui/tokens.js";
import { MascotSays } from "../../SpeechBubble.jsx";
import Sheet from "../../outreach/Sheet.jsx";
import ChecksRail from "./ChecksRail.jsx";
import { BackLink } from "./EditorHeader.jsx";
import NoteCard, { CutCard } from "./NoteCard.jsx";
import ReviewCopy from "./ReviewCopy.jsx";
import { QUILL, plural, pulse, scrollBehavior, scrollInside, whenLabel } from "./editorUi.js";
import { buildReview, responseOf, without } from "./reviewModel.js";

// One review, read beside the version it was made on.
//
// On the left, a read-only copy of that version with the quoted passages
// highlighted. On the right (below, on a narrower screen), the seven checks,
// then Quill's notes grouped by check, then any passages that could go.
// Choosing a note finds and marks its highlight; choosing a highlight selects
// its note (on a narrow screen the rail is far below the text, so the note
// opens as a sheet instead).
//
// Nothing on this screen edits the essay. There is no text field for it, the
// highlights come from the version's own text (never from what the student
// has typed since), and a note has no field that could hold new essay text.
// The one thing a student writes here is their own answer to a note: kept in
// a box, saved to the review's `responses`, and never sent to Quill.

const ANSWER_SAVE_MS = 1200;
const CHECK_LABELS = Object.fromEntries(CHECKS.map((c) => [c.key, c.label]));

const h3 = { margin: 0, fontFamily: SANS, fontSize: "1.1rem", fontWeight: 800, color: TEXT, lineHeight: 1.3 };
const h4 = { margin: "14px 0 8px", fontFamily: SANS, fontSize: "0.95rem", fontWeight: 800, color: TEXT_MUTED, lineHeight: 1.3 };
const list = { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 };
const quiet = { margin: 0, fontFamily: SANS, fontSize: "0.95rem", fontWeight: 600, color: TEXT_MUTED, lineHeight: 1.55 };

/**
 * review: the essay_reviews row, with `responses` as the page holds them.
 * version: { state: "loading" | "ready" | "gone" | "error", body } for the
 * version it read (undefined while the page has not asked yet). title: the
 * essay's, as it is now. promptName, promptText: the prompt shown with it,
 * and what to call it (the one this review was read against when its row
 * says, the essay's prompt as it is now otherwise, named as such).
 * changedSince: the essay's text is no longer this version's. narrow: one
 * column, and a highlight opens its note as a sheet. startNote: a note to
 * open at. headingRef: the heading the page focuses on arrival.
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
  const versionState = version?.state || "loading";
  const body = versionState === "ready" && typeof version.body === "string" ? version.body : null;
  const { notes: rawNotes, cuts: rawCuts, checks: rawChecks, responses } = review;
  const model = useMemo(
    () => buildReview({ notes: rawNotes, cuts: rawCuts, checks: rawChecks }, body),
    [rawNotes, rawCuts, rawChecks, body],
  );

  const [active, setActive] = useState(startNote);
  const [sheetId, setSheetId] = useState(null);
  const [drafts, setDrafts] = useState({});          // note id -> words in its box the database does not have yet
  const [stuck, setStuck] = useState(() => new Set());   // note ids whose last save failed
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  const marks = useRef(new Map());     // highlight id -> its element in the text
  const cards = useRef(new Map());     // note or cut id -> its card in the rail
  const rail = useRef(null);
  const sheetCard = useRef(null);
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

  const showInText = useCallback((id) => {
    setActive(id);
    const el = marks.current.get(model.anchor[id]);
    if (!el) return;
    el.focus({ preventScroll: true });
    try { el.scrollIntoView({ block: "center", behavior: scrollBehavior() }); } catch { el.scrollIntoView(); }
    pulse(el, ink.accent, { mark: true });
  }, [model, ink.accent]);

  const showCard = useCallback((id) => {
    setActive(id);
    const el = cards.current.get(id);
    if (!el) return;
    if (narrow) {
      try { el.scrollIntoView({ block: "start", behavior: scrollBehavior() }); } catch { el.scrollIntoView(); }
    } else {
      scrollInside(rail.current, el);
    }
    el.focus({ preventScroll: true });
    pulse(el, ink.accent);
  }, [narrow, ink.accent]);

  /** A highlight in the text was chosen. */
  const chooseHighlight = (id) => {
    if (!narrow) { showCard(id); return; }
    // A tap does not always focus what it lands on. The sheet hands focus
    // back to whatever had it when it opened, and that should be this highlight.
    marks.current.get(id)?.focus?.({ preventScroll: true });
    setActive(id);
    setSheetId(id);
  };

  const closeSheet = () => {
    if (sheetId) flush(sheetId);
    setSheetId(null);
  };

  // Opened at a note (from the editor's open notes): go to it once the text
  // is in, after the page has put focus on the heading.
  const arrive = useRef(null);
  arrive.current = () => {
    if (marks.current.get(model.anchor[startNote])) showInText(startNote);
    else showCard(startNote);
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
  const finder = (id) => (model.anchor[id] ? () => showInText(id) : undefined);

  const noteGroup = (key, heading, notes) => (
    <div key={key} role="group" aria-labelledby={`qr-group-${key}`}>
      <h4 id={`qr-group-${key}`} style={h4}>{heading}</h4>
      <ul style={list}>
        {notes.map((n) => (
          <li key={n.id}>
            <NoteCard {...noteProps(n)} onShow={finder(n.id)} register={registerCard(n.id)} />
          </li>
        ))}
      </ul>
    </div>
  );

  const railContent = (
    <>
      <section aria-labelledby="qr-checks-title">
        <h3 id="qr-checks-title" style={h3}>The seven checks</h3>
        <div style={{ marginTop: 6 }}>
          <ChecksRail checks={model.checks} onJump={showCard} />
        </div>
      </section>

      <section aria-labelledby="qr-notes-title" style={{ marginTop: 22 }}>
        <h3 id="qr-notes-title" style={{ ...h3, fontVariantNumeric: "tabular-nums" }}>
          Quill's notes{count ? ` (${count})` : ""}
        </h3>
        {count === 0 ? (
          <p style={{ ...quiet, marginTop: 6 }}>Quill left no notes on this read.</p>
        ) : (
          <>
            {body !== null && (
              <p style={{ ...quiet, marginTop: 4 }}>
                Each number matches a highlight in the text. Choose a quote to find it there.
              </p>
            )}
            {model.checks.filter((c) => c.notes.length > 0).map((c) => noteGroup(c.key, c.label, c.notes))}
            {model.loose.length > 0 && noteGroup("other", "Other notes", model.loose)}
          </>
        )}
      </section>

      {model.cuts.length > 0 && (
        <section aria-labelledby="qr-cuts-title" style={{ marginTop: 22 }}>
          <h3 id="qr-cuts-title" style={h3}>Passages that could go</h3>
          <p style={{ ...quiet, margin: "4px 0 10px", fontVariantNumeric: "tabular-nums" }}>
            {model.cutWords > 0 ? `These would remove about ${plural(model.cutWords, "word")}. ` : ""}
            Quill only points. What to cut, and whether to, is yours to decide.
          </p>
          <ul style={list}>
            {model.cuts.map((c) => (
              <li key={c.id}>
                <CutCard cut={c} active={active === c.id} onShow={finder(c.id)} register={registerCard(c.id)} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <p style={{ ...quiet, margin: "22px 0 0", paddingTop: 14, borderTop: `1px solid ${BORDER}`, display: "flex",
        alignItems: "flex-start", gap: 8 }}>
        <span aria-hidden="true" style={{ display: "flex", marginTop: 3, flexShrink: 0 }}><PixelStamp kind="scroll" size={16} /></span>
        <span>
          <span style={SR_ONLY}>Quill says: </span>
          {QUILL_LINES.proofread}
        </span>
      </p>
    </>
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

      {narrow ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 20, marginTop: 20 }}>
          {copy}
          <aside aria-label="Quill's checks and notes" style={{ background: WHITE, border: `1px solid ${BORDER}`,
            borderRadius: RADIUS.card, padding: isMobile ? 16 : "1.1rem 1.2rem", boxSizing: "border-box", minWidth: 0 }}>
            {railContent}
          </aside>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(300px, 360px)", gap: 24,
          alignItems: "start", marginTop: 20 }}>
          {copy}
          <aside ref={rail} aria-label="Quill's checks and notes"
            style={{ position: "sticky", top: 24, maxHeight: "calc(100vh - 48px)", overflowY: "auto", background: WHITE,
              border: `1px solid ${BORDER}`, borderRadius: RADIUS.card, padding: "1.1rem 1.2rem", boxSizing: "border-box",
              minWidth: 0 }}>
            {railContent}
          </aside>
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

      <AnimatePresence>
        {sheetItem && (
          <Sheet key={sheetItem.id} onClose={closeSheet} labelledBy="qr-sheet-title" width={560}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
              <h2 id="qr-sheet-title" style={{ margin: "8px 0 0", fontFamily: SANS, fontSize: "1.2rem", fontWeight: 800, color: TEXT,
                lineHeight: 1.3 }}>
                {sheetItem.kind === "cut"
                  ? `Passage that could go, ${sheetItem.number}`
                  : `Note ${sheetItem.number}${CHECK_LABELS[sheetItem.check] ? `: ${CHECK_LABELS[sheetItem.check]}` : ""}`}
              </h2>
              <button type="button" className={FOCUS_CLASS} onClick={closeSheet} aria-label="Close"
                style={{ flexShrink: 0, width: 44, height: 44, display: "inline-flex", alignItems: "center",
                  justifyContent: "center", border: "none", borderRadius: 10, background: "rgba(20,20,19,0.05)",
                  color: TEXT_MID, cursor: "pointer" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
                  strokeLinecap="round" aria-hidden="true" focusable="false">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            {sheetItem.kind === "cut"
              ? <CutCard cut={sheetItem} plain />
              : <NoteCard {...noteProps(sheetItem)} plain register={(node) => { sheetCard.current = node; }} />}
            <div style={{ marginTop: 16 }}>
              <Button kind="primary" onClick={closeSheet} style={{ width: "100%" }}>Back to the text</Button>
            </div>
          </Sheet>
        )}
      </AnimatePresence>
    </div>
  );
}
