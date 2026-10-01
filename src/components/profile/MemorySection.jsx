import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { contrastRatio, readableOn } from "../../lib/theme.js";
import {
  MEMORY_FIRST_PAGE, countMemories, deleteAllMemories, deleteMemory, deleteNote, loadMemories,
  loadMemorySettings, memoryDate, setMemoryEnabled, whereSaid,
} from "../../lib/memory.js";
import { BORDER, DANGER, FOCUS_CLASS, RADIUS, SANS, TEXT, TEXT_MUTED, WHITE } from "../ui/tokens.js";
import { Button, Heading } from "../ui/kit.jsx";

// "What Mentorable remembers": the body of a Profile card. Everything here
// saves the moment it is changed, unlike the rest of Profile (Save changes).

// The switch's off track has to be visible against the card (3:1), not just tinted.
const OFF_TRACK = "#86817a";

function Label({ children }) {
  return (
    <p style={{ fontFamily: SANS, fontSize: "1rem", fontWeight: 700, color: TEXT, margin: 0 }}>
      {children}
    </p>
  );
}

function Hint({ children }) {
  return (
    <p style={{ fontFamily: SANS, fontSize: "0.92rem", color: TEXT_MUTED, margin: "0.35rem 0 0", lineHeight: 1.55 }}>
      {children}
    </p>
  );
}

function DeleteButton({ label, busy, onClick }) {
  return (
    <button type="button" className={`pm-x ${FOCUS_CLASS}`} aria-label={label} title="Delete" disabled={busy} onClick={onClick}
      style={{ flexShrink: 0, width: 44, height: 44, marginTop: -10, marginRight: -10, display: "flex",
        alignItems: "center", justifyContent: "center", borderRadius: RADIUS.control, border: "none", background: "transparent",
        color: TEXT_MUTED, cursor: busy ? "default" : "pointer" }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
        strokeLinecap="round" aria-hidden="true">
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    </button>
  );
}

function Row({ children, dim }) {
  return (
    <li style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "0.8rem 0", borderTop: `1px solid ${BORDER}`,
      opacity: dim ? 0.45 : 1, transition: "opacity 0.15s" }}>
      {children}
    </li>
  );
}

export default function MemorySection({ userId, accent, onToast }) {
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [notes, setNotes] = useState([]);
  const [items, setItems] = useState([]);
  const [more, setMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [toggling, setToggling] = useState(false);
  const [pending, setPending] = useState(() => new Set());
  const [loadingMore, setLoadingMore] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);

  // The switch track carries a white knob, so it needs 3:1 against white.
  const track = contrastRatio(WHITE, accent) >= 3 ? accent : readableOn(accent, WHITE, 3);

  const load = useCallback(async () => {
    if (!userId) { setFailed(true); setLoading(false); return; }
    setFailed(false);
    try {
      const [settings, page, count] = await Promise.all([
        loadMemorySettings(userId), loadMemories(userId, { limit: MEMORY_FIRST_PAGE }), countMemories(userId),
      ]);
      setEnabled(settings.enabled);
      setNotes(settings.notes);
      setItems(page.items);
      setMore(page.more);
      setTotal(count);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  // Deleted every line on screen while more were saved: fetch the next ones,
  // once (the ref stops a loop if the count and the rows ever disagree).
  const refilled = useRef(false);
  useEffect(() => {
    if (items.length > 0) { refilled.current = false; return; }
    if (!loading && !failed && total > 0 && !refilled.current) { refilled.current = true; load(); }
  }, [items.length, total, loading, failed, load]);

  // The confirm dialog: Escape closes it, Tab stays inside it, and closing
  // hands focus back to the button that opened it.
  const dialogRef = useRef(null);
  const openerRef = useRef(null);
  useEffect(() => {
    if (!confirming) return;
    const opener = openerRef.current;
    const onKey = (e) => {
      if (e.key === "Escape" && !deletingAll) { setConfirming(false); return; }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const buttons = [...dialogRef.current.querySelectorAll("button:not(:disabled)")];
      if (!buttons.length) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      const inside = dialogRef.current.contains(document.activeElement);
      if (!inside || (e.shiftKey && document.activeElement === first)) { e.preventDefault(); (inside ? last : first).focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); opener?.focus?.(); };
  }, [confirming, deletingAll]);

  const toggle = async () => {
    if (toggling) return;
    const next = !enabled;
    setEnabled(next);
    setToggling(true);
    try {
      await setMemoryEnabled(userId, next);
      onToast(next ? "Memory is on" : "Memory is off");
    } catch {
      setEnabled(!next);
      onToast("Couldn't change that. Try again.", "error");
    } finally {
      setToggling(false);
    }
  };

  const mark = (key, on) => setPending((prev) => {
    const next = new Set(prev);
    if (on) next.add(key); else next.delete(key);
    return next;
  });

  const removeLine = async (memory) => {
    if (pending.has(memory.id)) return;
    mark(memory.id, true);
    try {
      await deleteMemory(userId, memory.id);
      setItems((xs) => xs.filter((x) => x.id !== memory.id));
      setTotal((n) => Math.max(0, n - 1));
    } catch {
      onToast("Couldn't delete that. Try again.", "error");
    } finally {
      mark(memory.id, false);
    }
  };

  const removeNote = async (note) => {
    const key = `note:${note}`;
    if (pending.has(key)) return;
    mark(key, true);
    try {
      setNotes(await deleteNote(userId, note));
    } catch {
      onToast("Couldn't delete that. Try again.", "error");
    } finally {
      mark(key, false);
    }
  };

  const showMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await loadMemories(userId, { after: items[items.length - 1] });
      setItems((xs) => [...xs, ...page.items.filter((p) => !xs.some((x) => x.id === p.id))]);
      setMore(page.more);
    } catch {
      onToast("Couldn't load more. Try again.", "error");
    } finally {
      setLoadingMore(false);
    }
  };

  const removeAll = async () => {
    if (deletingAll) return;
    setDeletingAll(true);
    try {
      await deleteAllMemories();
      setItems([]);
      setNotes([]);
      setMore(false);
      setTotal(0);
      setConfirming(false);
      onToast("Deleted everything Mentorable remembered");
    } catch {
      setConfirming(false);
      onToast("Couldn't delete everything. Try again.", "error");
      load(); // show what is actually left
    } finally {
      setDeletingAll(false);
    }
  };

  const styles = (
    <style>{`
      .pm-x:hover:not(:disabled) { color: ${DANGER} !important; background: #fdf1f0 !important; }
      .pm-all:hover:not(:disabled) { background: #fdf1f0 !important; }
      @keyframes pm-shimmer { 0% { background-position: -400px 0 } 100% { background-position: 400px 0 } }
      @media (prefers-reduced-motion: reduce) { .pm-skel { animation: none !important; } }
    `}</style>
  );

  if (loading) {
    return (
      <div aria-busy="true">
        {styles}
        {[62, 100, 88].map((w, i) => (
          <div key={i} className="pm-skel" style={{ width: `${w}%`, height: 14, borderRadius: 6, marginBottom: 10,
            background: "linear-gradient(90deg, #ece6de 25%, #f5f1ec 50%, #ece6de 75%)",
            backgroundSize: "400px 100%", animation: "pm-shimmer 1.5s infinite" }} />
        ))}
      </div>
    );
  }

  if (failed) {
    return (
      <div>
        {styles}
        <p style={{ fontFamily: SANS, fontSize: "1rem", color: TEXT_MUTED, margin: 0 }}>Couldn't load what Mentorable remembers.</p>
        <Button onClick={() => { setLoading(true); load(); }} style={{ marginTop: "0.75rem" }}>
          Try again
        </Button>
      </div>
    );
  }

  const anything = items.length > 0 || notes.length > 0 || total > 0;

  return (
    <div>
      {styles}

      {/* The switch */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem" }}>
        <div>
          <Label>Remember what I say</Label>
          <Hint>
            {enabled
              ? "Your advisor keeps what you write in chat and in Quest check-ins, word for word, so it can pick up where you left off. Serious personal topics are filtered out, and you can delete anything below."
              : "Off. Nothing new is saved, and your advisor does not use anything already here. Delete it below if you want it gone."}
          </Hint>
        </div>
        <button type="button" role="switch" aria-checked={enabled} aria-label="Remember what I say"
          className={`pm-switch ${FOCUS_CLASS}`} onClick={toggle} disabled={toggling}
          style={{ flexShrink: 0, position: "relative", width: 46, height: 26, borderRadius: 13, border: "none", padding: 0,
            background: enabled ? track : OFF_TRACK, cursor: toggling ? "default" : "pointer", transition: "background 0.18s" }}>
          <span aria-hidden="true" style={{ position: "absolute", top: 3, left: enabled ? 23 : 3, width: 20, height: 20,
            borderRadius: "50%", background: WHITE, boxShadow: "0 1px 3px rgba(0,0,0,0.25)", transition: "left 0.18s" }} />
        </button>
      </div>

      {/* Notes from chats */}
      {notes.length > 0 && (
        <div style={{ marginTop: "1.75rem" }}>
          <Label>Notes from your chats</Label>
          <Hint>A one-line note after each chat, so the next one starts where you left off.</Hint>
          <ul style={{ listStyle: "none", margin: "0.6rem 0 0", padding: 0 }}>
            {[...notes].reverse().map((note, i) => (
              <Row key={`${i}:${note}`} dim={pending.has(`note:${note}`)}>
                <p style={{ flex: 1, minWidth: 0, margin: 0, fontFamily: SANS, fontSize: "1rem", color: TEXT, lineHeight: 1.5, overflowWrap: "anywhere" }}>
                  {note}
                </p>
                <DeleteButton label={`Delete the note: ${note.slice(0, 60)}`} busy={pending.has(`note:${note}`)} onClick={() => removeNote(note)} />
              </Row>
            ))}
          </ul>
        </div>
      )}

      {/* Their own words */}
      <div style={{ marginTop: "1.75rem" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "1rem" }}>
          <Label>Things you said</Label>
          {total > 0 && (
            <span style={{ fontFamily: SANS, fontSize: "0.92rem", fontWeight: 600, color: TEXT_MUTED, fontVariantNumeric: "tabular-nums" }}>
              {total} saved
            </span>
          )}
        </div>
        {items.length === 0 ? (
          total > 0 ? null : (
            <Hint>
              {enabled
                ? "Nothing yet. What you write in chat and in Quest check-ins will show up here."
                : "Nothing saved."}
            </Hint>
          )
        ) : (
          <ul style={{ listStyle: "none", margin: "0.6rem 0 0", padding: 0 }}>
            {items.map((m) => (
              <Row key={m.id} dim={pending.has(m.id)}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontFamily: SANS, fontSize: "1rem", color: TEXT, lineHeight: 1.5, overflowWrap: "anywhere" }}>
                    {m.body}
                  </p>
                  <p style={{ margin: "0.3rem 0 0", fontFamily: SANS, fontSize: "0.9rem", lineHeight: 1.45,
                    display: "flex", flexWrap: "wrap", columnGap: 10, rowGap: 2 }}>
                    <span style={{ fontWeight: 700, color: TEXT_MUTED, fontVariantNumeric: "tabular-nums" }}>{memoryDate(m.created_at)}</span>
                    <span style={{ color: TEXT_MUTED, overflowWrap: "anywhere" }}>{whereSaid(m)}</span>
                  </p>
                </div>
                <DeleteButton label={`Delete: ${m.body.slice(0, 60)}`} busy={pending.has(m.id)} onClick={() => removeLine(m)} />
              </Row>
            ))}
          </ul>
        )}
        {more && (
          <Button onClick={showMore} disabled={loadingMore} style={{ marginTop: "0.75rem" }}>
            {loadingMore ? "Loading..." : "Show more"}
          </Button>
        )}
      </div>

      {/* Delete everything */}
      {anything && (
        <div style={{ marginTop: "1.75rem", paddingTop: "1.25rem", borderTop: `1px solid ${BORDER}`,
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
          <p style={{ flex: "1 1 220px", margin: 0, fontFamily: SANS, fontSize: "0.92rem", color: TEXT_MUTED, lineHeight: 1.55 }}>
            Deleting is permanent. These are kept apart from your chat history, so deleting a chat does not delete them.
          </p>
          <Button kind="danger" className={`${FOCUS_CLASS} pm-all`} ref={openerRef} onClick={() => setConfirming(true)}
            style={{ whiteSpace: "nowrap", transition: "background 0.15s" }}>
            Delete everything
          </Button>
        </div>
      )}

      <AnimatePresence>
        {confirming && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(20,20,19,0.5)", display: "flex",
              alignItems: "center", justifyContent: "center", padding: "1rem" }}
            onClick={(e) => { if (e.target === e.currentTarget && !deletingAll) setConfirming(false); }}
          >
            <motion.div
              ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="pm-confirm-title"
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: RADIUS.card, padding: "1.5rem",
                width: "100%", maxWidth: 460, boxSizing: "border-box", boxShadow: "0 18px 48px rgba(20,20,19,0.18)" }}
            >
              <Heading id="pm-confirm-title" style={{ marginBottom: "0.5rem" }}>
                Delete everything Mentorable remembers?
              </Heading>
              <p style={{ fontFamily: SANS, fontSize: "1rem", color: TEXT_MUTED, lineHeight: 1.6, margin: "0 0 1.5rem" }}>
                Every line and note listed here is deleted for good, along with the advisor's saved copy of your chat notes. Your record, your Quest and your chats stay as they are.
              </p>
              <div style={{ display: "flex", gap: "0.625rem", justifyContent: "flex-end", flexWrap: "wrap" }}>
                <Button autoFocus onClick={() => setConfirming(false)} disabled={deletingAll}>
                  Cancel
                </Button>
                <Button kind="danger" onClick={removeAll} disabled={deletingAll} style={{ background: DANGER, color: WHITE }}>
                  {deletingAll ? "Deleting..." : "Delete everything"}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
