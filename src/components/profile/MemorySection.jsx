import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { contrastRatio, readableOn } from "../../lib/theme.js";
import {
  MEMORY_FIRST_PAGE, countMemories, deleteAllMemories, deleteMemory, deleteNote, loadMemories,
  loadMemorySettings, memoryDate, setMemoryEnabled, whereSaid,
} from "../../lib/memory.js";

// "What Mentorable remembers": the body of a Profile card. Everything here
// saves the moment it is changed, unlike the rest of Profile (Save changes).

const SANS = "'Raleway', sans-serif";
const INK = "#141413";
const SOFT = "#494742";
const MUTED = "#6a6760";
const LINE = "#ece6de";
const WHITE = "#ffffff";
const DANGER = "#dc2626";
const DANGER_LINE = "#fca5a5";
// The switch's off track has to be visible against the card (3:1), not just tinted.
const OFF_TRACK = "#86817a";

function Label({ children }) {
  return (
    <p style={{ fontFamily: SANS, fontSize: "0.9375rem", fontWeight: 700, color: INK, margin: 0 }}>
      {children}
    </p>
  );
}

function Hint({ children }) {
  return (
    <p style={{ fontFamily: SANS, fontSize: "0.8rem", color: MUTED, marginTop: "0.35rem", lineHeight: 1.55 }}>
      {children}
    </p>
  );
}

function DeleteButton({ label, busy, onClick }) {
  return (
    <button type="button" className="pm-x" aria-label={label} title="Delete" disabled={busy} onClick={onClick}
      style={{ flexShrink: 0, width: 32, height: 32, marginTop: -4, marginRight: -6, display: "flex",
        alignItems: "center", justifyContent: "center", borderRadius: 8, border: "none", background: "transparent",
        color: MUTED, cursor: busy ? "default" : "pointer" }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
        strokeLinecap="round" aria-hidden="true">
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    </button>
  );
}

function Row({ children, dim }) {
  return (
    <li style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "0.8rem 0", borderTop: `1px solid ${LINE}`,
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
  const ring = readableOn(accent, WHITE, 3);

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
      .pm-x:hover:not(:disabled) { color: ${DANGER} !important; background: #fef2f2 !important; }
      .pm-x:focus-visible, .pm-switch:focus-visible, .pm-btn:focus-visible { outline: 2px solid ${ring}; outline-offset: 2px; }
      .pm-more:hover:not(:disabled) { border-color: #94a3b8 !important; }
      .pm-all:hover:not(:disabled) { background: #fef2f2 !important; border-color: ${DANGER} !important; }
      @keyframes pm-shimmer { 0% { background-position: -400px 0 } 100% { background-position: 400px 0 } }
    `}</style>
  );

  if (loading) {
    return (
      <div aria-busy="true">
        {styles}
        {[62, 100, 88].map((w, i) => (
          <div key={i} style={{ width: `${w}%`, height: 14, borderRadius: 6, marginBottom: 10,
            background: "linear-gradient(90deg, #e2e8f0 25%, #f1f5f9 50%, #e2e8f0 75%)",
            backgroundSize: "400px 100%", animation: "pm-shimmer 1.5s infinite" }} />
        ))}
      </div>
    );
  }

  if (failed) {
    return (
      <div>
        {styles}
        <p style={{ fontFamily: SANS, fontSize: "0.9rem", color: SOFT }}>Couldn't load what Mentorable remembers.</p>
        <button type="button" className="pm-btn pm-more" onClick={() => { setLoading(true); load(); }}
          style={{ marginTop: "0.75rem", padding: "0.5rem 1rem", background: "transparent", border: "1.5px solid #e2e8f0",
            borderRadius: "0.5rem", fontFamily: SANS, fontSize: "0.85rem", fontWeight: 600, color: "#3d3d3a", cursor: "pointer" }}>
          Try again
        </button>
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
          className="pm-switch" onClick={toggle} disabled={toggling}
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
          <ul style={{ listStyle: "none", marginTop: "0.6rem" }}>
            {[...notes].reverse().map((note, i) => (
              <Row key={`${i}:${note}`} dim={pending.has(`note:${note}`)}>
                <p style={{ flex: 1, minWidth: 0, fontFamily: SANS, fontSize: "0.95rem", color: INK, lineHeight: 1.5, overflowWrap: "anywhere" }}>
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
            <span style={{ fontFamily: SANS, fontSize: "0.85rem", fontWeight: 600, color: MUTED, fontVariantNumeric: "tabular-nums" }}>
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
          <ul style={{ listStyle: "none", marginTop: "0.6rem" }}>
            {items.map((m) => (
              <Row key={m.id} dim={pending.has(m.id)}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontFamily: SANS, fontSize: "0.95rem", color: INK, lineHeight: 1.5, overflowWrap: "anywhere" }}>
                    {m.body}
                  </p>
                  <p style={{ marginTop: "0.3rem", fontFamily: SANS, fontSize: "0.8rem", lineHeight: 1.45,
                    display: "flex", flexWrap: "wrap", columnGap: 10, rowGap: 2 }}>
                    <span style={{ fontWeight: 700, color: SOFT, fontVariantNumeric: "tabular-nums" }}>{memoryDate(m.created_at)}</span>
                    <span style={{ color: MUTED, overflowWrap: "anywhere" }}>{whereSaid(m)}</span>
                  </p>
                </div>
                <DeleteButton label={`Delete: ${m.body.slice(0, 60)}`} busy={pending.has(m.id)} onClick={() => removeLine(m)} />
              </Row>
            ))}
          </ul>
        )}
        {more && (
          <button type="button" className="pm-btn pm-more" onClick={showMore} disabled={loadingMore}
            style={{ marginTop: "0.75rem", padding: "0.5rem 1rem", background: "transparent", border: "1.5px solid #e2e8f0",
              borderRadius: "0.5rem", fontFamily: SANS, fontSize: "0.85rem", fontWeight: 600, color: "#3d3d3a",
              cursor: loadingMore ? "default" : "pointer", opacity: loadingMore ? 0.6 : 1 }}>
            {loadingMore ? "Loading..." : "Show more"}
          </button>
        )}
      </div>

      {/* Delete everything */}
      {anything && (
        <div style={{ marginTop: "1.75rem", paddingTop: "1.25rem", borderTop: `1px solid ${LINE}`,
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
          <p style={{ flex: "1 1 220px", fontFamily: SANS, fontSize: "0.8rem", color: MUTED, lineHeight: 1.55 }}>
            Deleting is permanent. These are kept apart from your chat history, so deleting a chat does not delete them.
          </p>
          <button type="button" className="pm-btn pm-all" ref={openerRef} onClick={() => setConfirming(true)}
            style={{ padding: "0.55rem 1.1rem", background: "transparent", border: `1.5px solid ${DANGER_LINE}`,
              borderRadius: "0.5rem", fontFamily: SANS, fontSize: "0.85rem", fontWeight: 600, color: DANGER,
              cursor: "pointer", whiteSpace: "nowrap", transition: "border-color 0.15s, background 0.15s" }}>
            Delete everything
          </button>
        </div>
      )}

      <AnimatePresence>
        {confirming && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(15,23,42,0.55)", display: "flex",
              alignItems: "center", justifyContent: "center", padding: "1.5rem" }}
            onClick={(e) => { if (e.target === e.currentTarget && !deletingAll) setConfirming(false); }}
          >
            <motion.div
              ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="pm-confirm-title"
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              style={{ background: WHITE, borderRadius: "1rem", padding: "2rem", width: "100%", maxWidth: 440,
                boxShadow: "0 25px 60px rgba(0,0,0,0.2)" }}
            >
              <p id="pm-confirm-title" style={{ fontFamily: SANS, fontSize: "1.05rem", fontWeight: 700, color: INK, marginBottom: "0.5rem" }}>
                Delete everything Mentorable remembers?
              </p>
              <p style={{ fontFamily: SANS, fontSize: "0.9rem", color: SOFT, lineHeight: 1.6, marginBottom: "1.5rem" }}>
                Every line and note listed here is deleted for good, along with the advisor's saved copy of your chat notes. Your record, your Quest and your chats stay as they are.
              </p>
              <div style={{ display: "flex", gap: "0.625rem", justifyContent: "flex-end" }}>
                <button type="button" className="pm-btn" autoFocus onClick={() => setConfirming(false)} disabled={deletingAll}
                  style={{ padding: "0.6rem 1.1rem", background: "transparent", border: "1.5px solid #e2e8f0", borderRadius: "0.5rem",
                    fontFamily: SANS, fontSize: "0.875rem", fontWeight: 600, color: "#3d3d3a", cursor: "pointer" }}>
                  Cancel
                </button>
                <button type="button" className="pm-btn" onClick={removeAll} disabled={deletingAll}
                  style={{ padding: "0.6rem 1.1rem", background: deletingAll ? DANGER_LINE : DANGER, border: "none",
                    borderRadius: "0.5rem", fontFamily: SANS, fontSize: "0.875rem", fontWeight: 700, color: WHITE,
                    cursor: deletingAll ? "not-allowed" : "pointer", transition: "background 0.15s" }}>
                  {deletingAll ? "Deleting..." : "Delete everything"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
