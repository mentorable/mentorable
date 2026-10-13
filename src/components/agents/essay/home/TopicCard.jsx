import { useEffect, useId, useRef, useState } from "react";
import { PixelArrow, PixelStamp } from "../../../ui/PixelIcons.jsx";
import {
  AMBER_BG, AMBER_TEXT, BORDER, DANGER, FOCUS_CLASS, RADIUS, SANS, SURFACE, TEXT, TEXT_MID, TEXT_MUTED, WHITE,
  useAgentInk,
} from "../../../ui/tokens.js";
import { Button, CHOICE_CLASS, INPUT_CLASS, LINK_CLASS, SR_ONLY, inputStyle } from "../../../ui/kit.jsx";
import { FLASH_CLASS } from "../../outreach/flowUi.jsx";
import { TOPIC_STATUS } from "../../../../lib/essay.js";
import { CharCount, Chevron, SmallLabel } from "./homeParts.jsx";
import { NOTES_MAX, RULE, clip, evidenceOf, listOf, ruledStyle } from "./homeUi.js";

// One idea on Quill's desk: a part of the student's life worth a closer look.
// A card from their record carries what in the record points there (the
// record's own wording, copied by the backend) and two or three questions. A
// card from a brainstorm carries their answers in its notes. Any card can be
// the student's own. None of them is a thesis, an opening or an outline:
// Quill names areas and asks, and the thinking in the notes box is theirs.
//
// The notes save when the box loses focus. The box owns its text: a save
// that fails leaves every word where it was, says so, and is sent again on
// the next blur or with "Try again". If the card's stored notes change from
// outside the box (a brainstorm added its answers), words not yet saved are
// kept and what was added goes after them.
//
// A card that is set aside folds to its title. Deleting asks first.

const SOURCES = {
  record: { stamp: "scroll", label: "From your record" },
  talk: { stamp: "chat", label: "From a brainstorm" },
  student: { stamp: "sparkle", label: "Your own idea" },
};

function Tag({ children, style }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: RADIUS.pill,
      fontFamily: SANS, fontSize: "0.9rem", fontWeight: 800, lineHeight: 1.35, maxWidth: "100%", boxSizing: "border-box",
      ...style }}>
      {children}
    </span>
  );
}

/**
 * topic: an essay_topics row. essays: the essays that grew from it
 * ([{ id, title }]). fresh: it arrived during this visit.
 * onStatus(key): move it (exploring, chosen, parked).
 * onSaveNotes(text): resolves to true once the database has the text, false
 * when the save failed (it never throws).
 * onDelete(): async; throws an Error whose message is fit to show.
 * onBrainstorm(), onStartEssay(), onOpenEssay(id): the card's ways out.
 * onDirty(id, unsaved): the box holds words the database does not have yet.
 */
export default function TopicCard({
  topic, essays = [], fresh = false, onStatus, onSaveNotes, onDelete, onBrainstorm, onStartEssay, onOpenEssay, onDirty,
}) {
  const ink = useAgentInk();
  const uid = useId();
  const id = (k) => `${uid}-${k}`;
  const topicId = topic.id;
  const cardRef = useRef(null);
  const foldRef = useRef(null);

  // ── Notes ──────────────────────────────────────────────────────────────────

  const stored = topic.notes || "";                 // what the database holds, as far as the page knows
  const [notes, setNotes] = useState(stored);
  const [save, setSave] = useState("idle");         // idle | saving | saved | failed
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const storedRef = useRef(stored);
  const sentRef = useRef(null);                     // the text of this box's last save
  const inFlight = useRef(false);
  const focused = useRef(false);
  const mounted = useRef(true);
  const saveRef = useRef(onSaveNotes);
  saveRef.current = onSaveNotes;
  const dirtyRef = useRef(onDirty);
  dirtyRef.current = onDirty;
  const unsaved = notes !== stored;

  // The stored notes changed. Our own save landing changes nothing in the
  // box (it may have moved on since). Anything else came from outside it.
  useEffect(() => {
    const prev = storedRef.current;
    if (stored === prev) return;
    storedRef.current = stored;
    if (stored === sentRef.current) return;
    setNotes((cur) => {
      if (cur === prev) return stored;
      if (!stored.startsWith(prev)) return cur;
      // Words not yet saved stay, and what was added goes after them.
      const added = stored.slice(prev.length);
      const gap = !cur || /\n\s*$/.test(cur) || /^\s*\n/.test(added) ? "" : "\n\n";
      return clip(cur + gap + added, NOTES_MAX);
    });
  }, [stored]);

  const flush = async () => {
    const text = notesRef.current;
    if (text === storedRef.current || inFlight.current) return;
    inFlight.current = true;
    sentRef.current = text;
    setSave("saving");
    let ok = false;
    try { ok = (await saveRef.current?.(text)) === true; } catch { ok = false; }
    inFlight.current = false;
    if (ok) storedRef.current = text;
    if (!mounted.current) {
      // The card went away while it saved, with more typed since: that goes too.
      if (notesRef.current !== storedRef.current) Promise.resolve(saveRef.current?.(notesRef.current)).catch(() => {});
      return;
    }
    setSave(ok ? "saved" : "failed");
    // More was typed while it saved, and the box has been left since: that goes too.
    if (ok && notesRef.current !== text && !focused.current) flush();
  };

  useEffect(() => { dirtyRef.current?.(topicId, unsaved); }, [topicId, unsaved]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // Leaving with words not yet saved (a link pressed mid-sentence): send
      // them on the way out.
      if (notesRef.current !== storedRef.current && !inFlight.current) {
        Promise.resolve(saveRef.current?.(notesRef.current)).catch(() => {});
      }
      dirtyRef.current?.(topicId, false);
    };
  }, [topicId]);

  // ── Folding, status, delete ────────────────────────────────────────────────

  const [open, setOpen] = useState(topic.status !== "parked");
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);
  const refocusFold = useRef(false);
  const wasConfirming = useRef(false);

  // Setting a card aside folds it, which removes the control that had focus.
  useEffect(() => {
    if (!refocusFold.current) return;
    refocusFold.current = false;
    foldRef.current?.focus();
  }, [open]);

  // Backing out of the delete question (or a delete that failed) hands focus
  // back to Delete.
  useEffect(() => {
    if (wasConfirming.current && !confirming) cardRef.current?.querySelector("[data-delete]")?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);

  const pickStatus = (key) => {
    if (key === topic.status) return;
    if (key === "parked") { refocusFold.current = true; setOpen(false); }
    onStatus?.(key);
  };

  const remove = async () => {
    setDeleting(true); setError(null);
    try {
      await onDelete?.();
    } catch (e) {
      if (!mounted.current) return;
      setError(e?.message || "Couldn't delete that idea. Try again.");
      setConfirming(false);
      setDeleting(false);
    }
  };

  // ── What shows ─────────────────────────────────────────────────────────────

  const source = SOURCES[topic.source] || SOURCES.student;
  const evidence = evidenceOf(topic);
  const questions = listOf(topic.questions);
  const chosen = topic.status === "chosen";
  const parked = topic.status === "parked";
  const area = topic.area || "Untitled idea";
  const text = { margin: 0, fontFamily: SANS, fontSize: "0.98rem", lineHeight: 1.55, color: TEXT_MID, overflowWrap: "anywhere" };

  return (
    <article ref={cardRef} aria-labelledby={id("title")} className={fresh ? FLASH_CLASS : undefined}
      style={{ background: WHITE, borderRadius: RADIUS.card, boxSizing: "border-box", minWidth: 0,
        padding: "14px 16px 16px 18px",
        // The left edge is the page's margin line: stronger once this is the
        // idea being written about, dashed all round when it is set aside.
        ...(parked
          ? { border: "1.5px dashed #b9b3aa" }
          : { borderStyle: "solid", borderWidth: "1px 1px 1px 4px",
            borderColor: `${BORDER} ${BORDER} ${BORDER} ${chosen ? ink.ring : ink.soft}` }) }}>
      <header style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
            <Tag style={{ background: SURFACE, color: TEXT_MID, border: `1px solid ${BORDER}` }}>
              <PixelStamp kind={source.stamp} size={16} />
              {source.label}
            </Tag>
            {chosen && (
              <Tag style={{ background: ink.softer, color: ink.onSoft, border: `1px solid ${ink.soft}` }}>
                <PixelStamp kind="check" size={16} />
                Writing about it
              </Tag>
            )}
            {parked && <Tag style={{ background: WHITE, color: TEXT_MID, border: "1px dashed #8a857c" }}>Set aside</Tag>}
            {fresh && <Tag style={{ background: ink.soft, color: ink.onSoft }}>New</Tag>}
          </div>
          <h3 id={id("title")} tabIndex={-1} data-topic-title={topicId}
            style={{ margin: "8px 0 0", fontFamily: SANS, fontSize: "1.2rem", fontWeight: 800, color: TEXT,
              letterSpacing: "-0.01em", lineHeight: 1.3, overflowWrap: "anywhere", outline: "none" }}>
            {area}
          </h3>
        </div>
        <button ref={foldRef} type="button" className={FOCUS_CLASS} aria-expanded={open} aria-controls={id("body")}
          aria-label={`${open ? "Fold" : "Open"} the card for ${area}`} onClick={() => setOpen((v) => !v)}
          style={{ flexShrink: 0, width: 44, height: 44, margin: "-4px -6px 0 0", display: "inline-flex",
            alignItems: "center", justifyContent: "center", border: "none", borderRadius: 10,
            background: "rgba(20,20,19,0.05)", color: TEXT_MID, cursor: "pointer" }}>
          <Chevron up={open} />
        </button>
      </header>

      <div id={id("body")} hidden={!open}>
        {evidence.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <SmallLabel id={id("evidence")}>What in your record points here</SmallLabel>
            <ul aria-labelledby={id("evidence")} style={{ listStyle: "none", margin: "6px 0 0", padding: 0, display: "flex",
              flexDirection: "column", gap: 4 }}>
              {evidence.map((e, i) => (
                <li key={`${i}-${e.text}`} style={{ ...text, fontSize: "0.95rem", fontWeight: 500 }}>
                  <span style={{ fontWeight: 700, color: TEXT_MUTED }}>{e.label}: </span>
                  {e.quote ? <>&ldquo;{e.text}&rdquo;</> : e.text}
                </li>
              ))}
            </ul>
          </div>
        )}

        {questions.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <SmallLabel id={id("questions")}>Questions to turn over</SmallLabel>
            <ul aria-labelledby={id("questions")} style={{ listStyle: "none", margin: "6px 0 0", padding: 0, display: "flex",
              flexDirection: "column", gap: 6 }}>
              {questions.map((q, i) => (
                <li key={`${i}-${q}`} style={{ ...text, display: "flex", alignItems: "flex-start", gap: 10, fontSize: "1rem",
                  fontWeight: 600, color: TEXT }}>
                  <span aria-hidden="true" style={{ display: "flex", marginTop: 4, flexShrink: 0, color: ink.text }}>
                    <PixelStamp kind="question" size={16} />
                  </span>
                  <span>{q}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
            <label htmlFor={id("notes")} style={{ fontFamily: SANS, fontSize: "0.95rem", fontWeight: 800, color: TEXT_MID }}>
              Your notes
              <span style={SR_ONLY}> on {area}</span>
            </label>
            {notes.length > NOTES_MAX * 0.9 && <CharCount n={notes.length} max={NOTES_MAX} />}
          </div>
          <textarea id={id("notes")} className={INPUT_CLASS} value={notes} maxLength={NOTES_MAX} rows={4}
            aria-describedby={id("notes-state")}
            onChange={(e) => { setNotes(e.target.value); if (save !== "saving") setSave("idle"); }}
            onFocus={() => { focused.current = true; }}
            onBlur={() => { focused.current = false; flush(); }}
            placeholder="Whatever comes to mind. Half sentences are fine."
            style={{ ...inputStyle, ...ruledStyle, display: "block", marginTop: 6, minHeight: RULE * 4 + 20, resize: "vertical" }} />
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 12px", marginTop: 4, minHeight: 26 }}>
            <p id={id("notes-state")} role="status"
              style={{ margin: 0, display: "flex", alignItems: "center", gap: 6, fontFamily: SANS, fontSize: "0.92rem",
                fontWeight: 600, lineHeight: 1.45, color: save === "failed" ? AMBER_TEXT : TEXT_MUTED }}>
              {save === "saving" && "Saving..."}
              {save === "failed" && "Couldn't save your notes just now. Every word is still in the box."}
              {save === "saved" && !unsaved && (
                <>
                  <span aria-hidden="true" style={{ display: "flex", color: ink.text }}><PixelStamp kind="check" size={16} /></span>
                  Saved
                </>
              )}
              {(save === "idle" || (save === "saved" && unsaved)) && "Saves when you click away."}
            </p>
            {save === "failed" && (
              <Button kind="secondary" onClick={() => flush()}
                style={{ background: AMBER_BG, border: "1.5px solid #f3d9a4", color: AMBER_TEXT }}>
                Try again
              </Button>
            )}
          </div>
        </div>

        {essays.length > 0 && (
          <p style={{ ...text, marginTop: 6, fontWeight: 600 }}>
            {essays.length === 1 ? "You started an essay from this: " : "You started essays from this: "}
            {essays.map((e, i) => (
              <span key={e.id}>
                {i > 0 && ", "}
                <button type="button" className={`${FOCUS_CLASS} ${LINK_CLASS}`} onClick={() => onOpenEssay?.(e.id)}
                  style={{ display: "inline-flex", alignItems: "center", minHeight: 44, maxWidth: "100%", padding: 0,
                    border: "none", background: "none", cursor: "pointer", borderRadius: 4, fontFamily: SANS,
                    fontSize: "0.98rem", fontWeight: 700, color: ink.text, textAlign: "left", overflowWrap: "anywhere" }}>
                  {e.title || "Untitled essay"}
                </button>
              </span>
            ))}
          </p>
        )}

        <div aria-hidden="true" style={{ height: 2, margin: "14px 0 12px",
          background: "linear-gradient(90deg, #d6d1c9 50%, transparent 50%) left top / 4px 2px repeat-x" }} />

        <fieldset style={{ border: "none", margin: 0, padding: 0, minWidth: 0 }}>
          <legend style={{ padding: 0, marginBottom: 6, fontFamily: SANS, fontSize: "0.95rem", fontWeight: 800, color: TEXT_MID }}>
            Where this idea stands
          </legend>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {TOPIC_STATUS.map((s) => {
              const on = topic.status === s.key;
              return (
                <label key={s.key} className={CHOICE_CLASS}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 44, padding: "0 14px",
                    borderRadius: RADIUS.pill, cursor: "pointer", boxSizing: "border-box", fontFamily: SANS,
                    fontSize: "0.95rem", fontWeight: 700, border: `1.5px solid ${on ? ink.ring : BORDER}`,
                    background: on ? ink.softer : WHITE, color: on ? ink.onSoft : TEXT_MID }}>
                  <input type="radio" name={id("status")} checked={on} onChange={() => pickStatus(s.key)} style={SR_ONLY} />
                  {on && <PixelStamp kind="check" size={16} />}
                  {s.label}
                </label>
              );
            })}
          </div>
        </fieldset>

        {error && (
          <p role="alert" style={{ margin: "12px 0 0", fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700, color: DANGER,
            lineHeight: 1.45 }}>
            {error}
          </p>
        )}

        {confirming ? (
          <div role="group" aria-labelledby={id("confirm")} style={{ marginTop: 14 }}
            onKeyDown={(e) => { if (e.key === "Escape" && !deleting) { e.stopPropagation(); setConfirming(false); } }}>
            <p id={id("confirm")} style={{ margin: "0 0 10px", fontFamily: SANS, fontSize: "1rem", fontWeight: 700, color: TEXT,
              lineHeight: 1.45 }}>
              Delete this idea? Your notes on it go with it.
              {essays.length > 0 && " The essay you started from it stays."}
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <Button kind="secondary" autoFocus disabled={deleting} onClick={() => setConfirming(false)}
                style={{ flex: "1 1 120px" }}>
                Keep it
              </Button>
              <Button kind="danger" busy={deleting} onClick={remove} style={{ flex: "1 1 120px" }}>
                {deleting ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 14 }}>
            <Button kind="secondary" onClick={onBrainstorm} aria-describedby={id("title")}>
              <PixelStamp kind="chat" size={16} />
              Brainstorm this
            </Button>
            <Button kind="secondary" onClick={onStartEssay} aria-describedby={id("title")}>
              Start an essay from this
              <PixelArrow size={16} />
            </Button>
            <Button kind="quiet" data-delete onClick={() => { setError(null); setConfirming(true); }}
              aria-describedby={id("title")} style={{ marginLeft: "auto", color: TEXT_MID }}>
              Delete
            </Button>
          </div>
        )}
      </div>
    </article>
  );
}
