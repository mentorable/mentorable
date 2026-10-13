import { useEffect, useId, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useIsMobile } from "../../../../hooks/useIsMobile.js";
import Spinner from "../../../common/Spinner.jsx";
import { PixelArrow, PixelStamp } from "../../../ui/PixelIcons.jsx";
import { Notice } from "../../../ui/kit.jsx";
import {
  AMBER_TEXT, BG, BORDER, DANGER, FOCUS_CLASS, PRESS_CLASS, RADIUS, SANS, SURFACE, TEXT, TEXT_MID, TEXT_MUTED, WHITE,
  ringVar, useAgentInk,
} from "../../../ui/tokens.js";
import { DRAWER_Z } from "../../outreach/BoardUi.js";
import { TYPE_CLASS, capital, plural, whenLabel } from "./editorUi.js";

// The saved versions of one essay, in a side drawer: the ones Quill saved
// when it read a draft, and the ones the student saved themselves. Each can
// be viewed (read-only), restored or deleted, and "Save a version now" keeps
// the essay as it stands.
//
// A modal dialog like Talon's listing drawer: focus moves to the heading, Tab
// stays inside, Escape closes (or first backs out of a confirm, or out of a
// version being viewed), and closing hands focus back to what opened it.
//
// The drawer does none of the work itself. Saving, restoring and deleting go
// up to the page, which owns the essay's text: a restore goes through the
// same save path as typing, after the current text has been kept as a version
// of its own. Each handler resolves when it is done, or throws an Error whose
// message is fit to show.
//
// Mount it to open it (inside AnimatePresence for the slide out).

const FOCUSABLE = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), "
  + "textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

const secondary = {
  minHeight: 44, padding: "0 14px", borderRadius: RADIUS.control, border: `1.5px solid ${BORDER}`, background: WHITE,
  color: TEXT_MID, fontFamily: SANS, fontSize: "0.98rem", fontWeight: 700, cursor: "pointer", lineHeight: 1.25,
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, boxSizing: "border-box",
};
const say = { margin: 0, fontFamily: SANS, fontSize: "1rem", color: TEXT, lineHeight: 1.55, overflowWrap: "anywhere" };

function SourceTag({ source }) {
  const byQuill = source === "review";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "2px 10px", borderRadius: RADIUS.pill,
      background: SURFACE, border: `1px solid ${BORDER}`, fontFamily: SANS, fontSize: "0.9rem", fontWeight: 800,
      color: TEXT_MUTED, whiteSpace: "nowrap" }}>
      <PixelStamp kind={byQuill ? "scroll" : "check"} size={16} />
      {byQuill ? "Read by Quill" : "Saved by you"}
    </span>
  );
}

/**
 * versions: [{ id, word_count, source, created_at }], newest first. bodies:
 * version id -> { state: "loading" | "ready" | "gone" | "error", body }.
 * reviewed: a Set of the version ids a review was made on. max: how many an
 * essay keeps. saveBlock: null, or why "Save a version now" is off.
 * onLoad(id): fetch a version's text. onSaveNow(), onRestore(version),
 * onDelete(version): see the note above.
 */
export default function VersionsDrawer({
  versions, bodies, reviewed, max, saveBlock = null, onClose, onLoad, onSaveNow, onRestore, onDelete,
}) {
  const ink = useAgentInk();
  const isMobile = useIsMobile();
  const reduce = useReducedMotion();
  const uid = useId();
  const id = (k) => `${uid}-${k}`;
  const panelRef = useRef(null);
  const titleRef = useRef(null);
  const [viewing, setViewing] = useState(null);       // the id of the version being read
  const [confirm, setConfirm] = useState(null);       // { id, kind: "restore" | "delete" }
  const [busy, setBusy] = useState(null);             // "save" | "restore" | "delete"
  const [error, setError] = useState(null);           // { id: version id or "save", text }
  const [done, setDone] = useState("");               // the last thing that worked, for the status line
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    const opener = document.activeElement;
    titleRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      alive.current = false;
      document.body.style.overflow = previous;
      if (opener && opener !== document.body && document.contains(opener)) opener.focus();
    };
  }, []);

  const close = () => { if (!busy) onClose?.(); };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (busy) return;
      if (confirm) setConfirm(null);
      else if (viewing) { setViewing(null); titleRef.current?.focus(); }
      else onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

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

  // ── Actions ────────────────────────────────────────────────────────────────

  const view = (version) => {
    setConfirm(null);
    setError(null);
    setViewing(version.id);
    onLoad?.(version.id);
    titleRef.current?.focus();
  };

  const saveNow = async () => {
    if (busy || saveBlock) return;
    setBusy("save"); setError(null); setDone("");
    try {
      await onSaveNow?.();
      if (alive.current) setDone("Saved your essay as a version.");
    } catch (e) {
      if (alive.current) setError({ id: "save", text: e?.message || "Couldn't save a version just now. Try again." });
    } finally {
      if (alive.current) setBusy(null);
    }
  };

  const restore = async (version) => {
    if (busy) return;
    setBusy("restore"); setError(null); setDone("");
    try {
      await onRestore?.(version);   // the page closes the drawer when it worked
    } catch (e) {
      if (!alive.current) return;
      setError({ id: version.id, text: e?.message || "Couldn't restore that version. Your essay is unchanged." });
      setConfirm(null);
    } finally {
      if (alive.current) setBusy(null);
    }
  };

  const remove = async (version) => {
    if (busy) return;
    setBusy("delete"); setError(null); setDone("");
    try {
      await onDelete?.(version);
      if (!alive.current) return;
      setConfirm(null);
      setViewing(null);
      setDone("Deleted that version.");
      titleRef.current?.focus();
    } catch (e) {
      if (!alive.current) return;
      setError({ id: version.id, text: e?.message || "Couldn't delete that version. Try again." });
      setConfirm(null);
    } finally {
      if (alive.current) setBusy(null);
    }
  };

  // ── Pieces ─────────────────────────────────────────────────────────────────

  /** View, Restore and Delete for one version, or the question that guards
   *  the last two. */
  const actions = (version, { withView = true } = {}) => {
    const asking = confirm?.id === version.id ? confirm.kind : null;
    const problem = error?.id === version.id ? error.text : "";
    return (
      <div style={{ marginTop: 10 }}>
        {problem && (
          <p role="alert" style={{ ...say, marginBottom: 8, fontSize: "0.95rem", fontWeight: 700, color: DANGER }}>{problem}</p>
        )}
        {asking ? (
          <div role="group" aria-labelledby={id(`ask-${version.id}`)}>
            <p id={id(`ask-${version.id}`)} style={{ ...say, marginBottom: 10, fontWeight: 700 }}>
              {asking === "restore"
                ? "Replace your essay with this version? What you have now is saved as a version first, so nothing is lost."
                : `Delete this version? It can't be brought back.${reviewed?.has(version.id) ? " Quill's notes on it are deleted with it." : ""}`}
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button type="button" autoFocus className={FOCUS_CLASS} disabled={!!busy} onClick={() => setConfirm(null)}
                style={{ ...secondary, flex: "1 1 120px" }}>
                {asking === "restore" ? "Keep what I have" : "Keep it"}
              </button>
              {asking === "restore" ? (
                <button type="button" className={`${FOCUS_CLASS} ${PRESS_CLASS}`} disabled={!!busy} onClick={() => restore(version)}
                  style={{ ...secondary, flex: "1 1 120px", border: "none", background: ink.button.bg, color: ink.button.fg,
                    cursor: busy ? "default" : "pointer" }}>
                  {busy === "restore" ? "Restoring..." : "Restore it"}
                </button>
              ) : (
                <button type="button" className={`${FOCUS_CLASS} ${PRESS_CLASS}`} disabled={!!busy} onClick={() => remove(version)}
                  style={{ ...secondary, flex: "1 1 120px", border: "none", background: DANGER, color: WHITE,
                    cursor: busy ? "default" : "pointer" }}>
                  {busy === "delete" ? "Deleting..." : "Delete"}
                </button>
              )}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {withView && (
              <button type="button" className={FOCUS_CLASS} onClick={() => view(version)} style={{ ...secondary, flex: "1 1 84px" }}>
                View
              </button>
            )}
            <button type="button" className={FOCUS_CLASS} onClick={() => { setError(null); setConfirm({ id: version.id, kind: "restore" }); }}
              style={{ ...secondary, flex: "1 1 84px" }}>
              Restore
            </button>
            <button type="button" className={FOCUS_CLASS} onClick={() => { setError(null); setConfirm({ id: version.id, kind: "delete" }); }}
              style={{ ...secondary, flex: "1 1 84px", color: DANGER, border: "1.5px solid #f1c4bf" }}>
              Delete
            </button>
          </div>
        )}
      </div>
    );
  };

  const facts = (version) => (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 10px" }}>
      <span style={{ fontFamily: SANS, fontSize: "1rem", fontWeight: 800, color: TEXT }}>
        {capital(whenLabel(version.created_at)) || "A saved version"}
      </span>
      <SourceTag source={version.source} />
      <span style={{ fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700, color: TEXT_MUTED, fontVariantNumeric: "tabular-nums" }}>
        {plural(Number(version.word_count) || 0, "word")}
      </span>
    </div>
  );

  const shown = viewing ? versions.find((v) => v.id === viewing) || null : null;
  const shownBody = shown ? bodies?.[shown.id] : null;
  const full = versions.length >= max;
  const slide = reduce ? { opacity: 0 } : { x: isMobile ? 0 : 48, y: isMobile ? 32 : 0, opacity: 0 };

  return (
    <div style={{ ...ringVar(ink), position: "fixed", inset: 0, zIndex: DRAWER_Z }}>
      <motion.div aria-hidden="true" onClick={close}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0.01 : 0.18 }}
        style={{ position: "absolute", inset: 0, background: "rgba(20,20,19,0.42)" }} />
      <motion.div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={id("title")} onKeyDown={trapTab}
        initial={slide} animate={{ x: 0, y: 0, opacity: 1 }} exit={slide}
        transition={{ duration: reduce ? 0.01 : 0.26, ease: [0.22, 1, 0.36, 1] }}
        style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: isMobile ? "100%" : 520, maxWidth: "100%",
          background: BG, boxShadow: "-12px 0 40px rgba(20,20,19,0.18)", display: "flex", flexDirection: "column",
          boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 12px 12px 20px", background: WHITE,
          borderBottom: `1px solid ${BORDER}`, paddingTop: "calc(12px + env(safe-area-inset-top, 0px))" }}>
          <h2 id={id("title")} ref={titleRef} tabIndex={-1}
            style={{ flex: 1, minWidth: 0, margin: 0, fontFamily: SANS, fontSize: "1.3rem", fontWeight: 800, color: TEXT,
              letterSpacing: "-0.01em", lineHeight: 1.25, outline: "none" }}>
            {shown ? "A saved version" : "Saved versions"}
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

        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px 24px" }}>
          <p role="status" aria-live="polite" style={{ ...say, fontSize: "0.95rem", fontWeight: 700, color: TEXT_MID,
            margin: done ? "0 0 12px" : 0 }}>
            {done}
          </p>

          {shown ? (
            <>
              <button type="button" className={FOCUS_CLASS} onClick={() => { setViewing(null); setConfirm(null); titleRef.current?.focus(); }}
                style={{ ...secondary, marginBottom: 14 }}>
                <PixelArrow size={16} style={{ transform: "scaleX(-1)" }} />
                All versions
              </button>
              {facts(shown)}
              {actions(shown, { withView: false })}
              <div style={{ marginTop: 16, background: WHITE, border: `1px solid ${BORDER}`, borderRadius: RADIUS.control,
                padding: "14px 16px" }}>
                {(!shownBody || shownBody.state === "loading") && (
                  <p role="status" style={{ ...say, display: "flex", alignItems: "center", gap: 10, color: TEXT_MUTED, fontWeight: 600 }}>
                    <Spinner size={18} color={ink.text} />
                    Opening this version
                  </p>
                )}
                {shownBody?.state === "gone" && (
                  <p style={{ ...say, color: TEXT_MID, fontWeight: 600 }}>This version is no longer here. It may have been deleted.</p>
                )}
                {shownBody?.state === "error" && (
                  <div>
                    <p style={{ ...say, color: AMBER_TEXT, fontWeight: 700 }}>Couldn't open this version just now.</p>
                    <button type="button" className={FOCUS_CLASS} onClick={() => onLoad?.(shown.id)} style={{ ...secondary, marginTop: 10 }}>
                      Try again
                    </button>
                  </div>
                )}
                {shownBody?.state === "ready" && (
                  <div className={TYPE_CLASS} style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                    {shownBody.body || "This version is empty."}
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <p style={{ ...say, fontSize: "0.98rem", color: TEXT_MID }}>
                Quill saves the version it reads each time you ask for a review. You can save one yourself whenever you
                like. An essay keeps up to {max}.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 12px", marginTop: 12 }}>
                <button type="button" className={`${FOCUS_CLASS} ${saveBlock || busy ? "" : PRESS_CLASS}`} onClick={saveNow}
                  aria-disabled={!!saveBlock || !!busy || undefined} aria-busy={busy === "save" || undefined}
                  aria-describedby={id("save-note")}
                  style={{ ...secondary, border: saveBlock ? `1.5px solid ${BORDER}` : "none",
                    background: saveBlock ? "#e9e6e1" : ink.button.bg, color: saveBlock ? TEXT_MUTED : ink.button.fg,
                    cursor: saveBlock || busy ? "default" : "pointer" }}>
                  {busy === "save" ? <Spinner size={16} color={ink.button.fg} /> : <PixelStamp kind="check" size={16} />}
                  {busy === "save" ? "Saving..." : "Save a version now"}
                </button>
                <span id={id("save-note")} style={{ fontFamily: SANS, fontSize: "0.93rem", fontWeight: 700,
                  color: saveBlock && full ? AMBER_TEXT : TEXT_MUTED, fontVariantNumeric: "tabular-nums", lineHeight: 1.45 }}>
                  {saveBlock || `${versions.length} of ${max} saved`}
                </span>
              </div>
              {error?.id === "save" && (
                <Notice tone="warn" onDismiss={() => setError(null)} style={{ marginTop: 12 }}>{error.text}</Notice>
              )}

              {versions.length === 0 ? (
                <p style={{ ...say, marginTop: 18, color: TEXT_MID, fontWeight: 600 }}>
                  No saved versions yet. The first one appears when you save one, or when Quill reads a draft.
                </p>
              ) : (
                <ul style={{ listStyle: "none", margin: "18px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                  {versions.map((v) => (
                    <li key={v.id} style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: RADIUS.control,
                      padding: 12 }}>
                      {facts(v)}
                      {actions(v)}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
