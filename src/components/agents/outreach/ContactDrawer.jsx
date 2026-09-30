import { useEffect, useId, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import ContactForm, { formValues } from "./ContactForm.jsx";
import { BG, BORDER, FOCUS_CLASS, SANS, TEXT, TEXT_MID, WHITE, useAgentInk } from "../agentUi.js";
import { DRAWER_Z, boardRing } from "./BoardUi.js";
import { useIsMobile } from "../../../hooks/useIsMobile.js";

// The side drawer for a card: every field of one the student added by hand
// (and for adding one), or, for a card Beaker made, the student's own notes,
// follow-up date and Delete (its email is edited on the review page).
// A modal dialog: focus moves in, Tab stays inside, Escape closes (or first
// backs out of a delete confirm), and closing hands focus back to whatever
// opened it (the card's name or "..." button, or "Add a contact"). If that is
// gone, because the card was just deleted, `onFallbackFocus` picks somewhere
// sensible.
//
// Mount it to open it (inside AnimatePresence for the slide out).

const FOCUSABLE = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), " +
  "textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

/** onDraft(values): async; saves `values`, then leaves for the outreach flow
 *  (it throws, and the drawer stays open with the message, if the save
 *  fails). onOpenEmail(): a card Beaker made, to its review page. */
export default function ContactDrawer({
  mode, card, canDraft, draftNote, onSave, onDelete, onDraft, onOpenEmail, onClose, onFallbackFocus,
}) {
  const ink = useAgentInk();
  const isMobile = useIsMobile();
  const reduce = useReducedMotion();
  const titleId = useId();
  const panelRef = useRef(null);
  const titleRef = useRef(null);
  const firstFieldRef = useRef(null);
  const [busy, setBusy] = useState(null);          // "save" | "delete" | "draft" while waiting
  const [error, setError] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [initial] = useState(() => formValues(mode === "edit" ? card : null));
  const editing = mode === "edit";
  const agent = editing && card?.created_by === "agent";

  // Where focus goes in, and back out. The latest fallback is kept in a ref,
  // so the unmount cleanup never calls a stale one.
  const fallback = useRef(onFallbackFocus);
  fallback.current = onFallbackFocus;
  useEffect(() => {
    const opener = document.activeElement;
    // Adding: straight to the name. Editing: the heading, so a phone keyboard
    // does not jump up over the card being read.
    if (editing) titleRef.current?.focus();
    else firstFieldRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
      if (opener && opener !== document.body && document.contains(opener)) opener.focus();
      else fallback.current?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => { if (!busy) onClose(); };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (busy) return;
      if (confirming) setConfirming(false);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, confirming, onClose]);

  const trapTab = (e) => {
    if (e.key !== "Tab" || !panelRef.current) return;
    const items = [...panelRef.current.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const inside = panelRef.current.contains(document.activeElement);
    if (e.shiftKey && (document.activeElement === first || !inside || document.activeElement === titleRef.current)) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
      e.preventDefault(); first.focus();
    }
  };

  const save = async (values) => {
    setBusy("save"); setError(null);
    try {
      await onSave(values);
    } catch (e) {
      setError(e?.message || "Couldn't save that. Try again.");
      setBusy(null);
    }
  };

  const draft = async (values) => {
    setBusy("draft"); setError(null);
    try {
      await onDraft(values);
    } catch (e) {
      // A field the database refused says which one; anything else is the save.
      setError(e?.message && e?.code && e.code !== "save"
        ? `${e.message} Beaker hasn't started.`
        : "Couldn't save your changes, so Beaker hasn't started. Try again.");
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy("delete"); setError(null);
    try {
      await onDelete();
    } catch (e) {
      setError(e?.message || "Couldn't delete that contact. Try again.");
      setConfirming(false);
      setBusy(null);
    }
  };

  const slide = reduce ? { opacity: 0 } : { x: isMobile ? 0 : 48, y: isMobile ? 32 : 0, opacity: 0 };

  return (
    <div style={{ "--ag-ring": boardRing(ink.accent), position: "fixed", inset: 0, zIndex: DRAWER_Z }}>
      <motion.div aria-hidden="true" onClick={close}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0.01 : 0.18 }}
        style={{ position: "absolute", inset: 0, background: "rgba(20,20,19,0.42)" }} />
      <motion.div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={trapTab}
        initial={slide} animate={{ x: 0, y: 0, opacity: 1 }} exit={slide}
        transition={{ duration: reduce ? 0.01 : 0.26, ease: [0.22, 1, 0.36, 1] }}
        style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: isMobile ? "100%" : 480, maxWidth: "100%",
          background: BG, boxShadow: "-12px 0 40px rgba(20,20,19,0.18)", display: "flex", flexDirection: "column",
          boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 12px 12px 20px", background: WHITE,
          borderBottom: `1px solid ${BORDER}`, paddingTop: "calc(12px + env(safe-area-inset-top, 0px))" }}>
          <h2 id={titleId} ref={titleRef} tabIndex={-1}
            style={{ flex: 1, minWidth: 0, margin: 0, fontFamily: SANS, fontSize: "1.25rem", fontWeight: 800, color: TEXT,
              letterSpacing: "-0.01em", outline: "none", overflowWrap: "anywhere" }}>
            {agent ? `Details for ${initial.name || "this contact"}` : editing ? `Edit ${initial.name || "contact"}` : "Add a contact"}
          </h2>
          <button type="button" className={FOCUS_CLASS} onClick={close} aria-label="Close"
            style={{ flexShrink: 0, width: 44, height: 44, display: "inline-flex", alignItems: "center", justifyContent: "center",
              border: "none", borderRadius: 10, background: "rgba(20,20,19,0.05)", color: TEXT_MID, cursor: "pointer" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
              strokeLinecap="round" aria-hidden="true" focusable="false">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <ContactForm mode={mode} initial={initial} busy={busy} error={error} confirming={confirming} agent={agent}
          canDraft={canDraft} draftNote={draftNote} firstFieldRef={firstFieldRef}
          onSubmit={save} onCancel={close}
          onAskDelete={() => { setError(null); setConfirming(true); }}
          onCancelDelete={() => setConfirming(false)} onConfirmDelete={remove}
          onDraft={draft} onOpenEmail={() => { if (!busy) onOpenEmail?.(); }} />
      </motion.div>
    </div>
  );
}
