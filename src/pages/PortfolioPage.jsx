import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../lib/supabase.js";
import { fetchUsage, LIMITS } from "../lib/usage.js";
import LimitModal from "../components/common/LimitModal.jsx";
import { SIDEBAR_WIDTH } from "../components/common/Sidebar.jsx";
import { useIsMobile } from "../hooks/useIsMobile.js";

const LANGGRAPH_URL = import.meta.env.VITE_LANGGRAPH_CHAT_URL;
const SANS = "'Raleway', sans-serif";
const BG = "#f5f1ed", WHITE = "#fff", BLUE = "#1d4ed8";
const TEXT = "#141413", TEXT_MID = "#3d3d3a", TEXT_MUTED = "#494742", TEXT_FAINT = "#6a6760", BORDER = "#e6dfd8";

// 8 categories, each a different shade of blue (backgrounds only, dark text).
const CATEGORIES = [
  { key: "experience",    label: "Experience",    bg: "#a8c8fb" },
  { key: "volunteering",  label: "Volunteering",  bg: "#b8d3fc" },
  { key: "award",         label: "Award",         bg: "#c8ddfd" },
  { key: "course",        label: "Course",        bg: "#d4e4fd" },
  { key: "certification", label: "Certification", bg: "#dfebfe" },
  { key: "club",          label: "Club",          bg: "#e8f0fe" },
  { key: "skill",         label: "Skill",         bg: "#f0f5ff" },
  { key: "other",         label: "Other",         bg: "#eceff4" },
];
const CAT_BY_KEY = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]));

function CategoryBadge({ category }) {
  const cat = CAT_BY_KEY[category] || CAT_BY_KEY.other;
  return (
    <span style={{
      fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: "0.05em",
      textTransform: "uppercase", background: cat.bg, color: TEXT_MID,
      borderRadius: 5, padding: "2px 7px", flexShrink: 0,
    }}>
      {cat.label}
    </span>
  );
}

// ─── Piece card (Name, Type, Description) ─────────────────────────────────────
function PieceCard({ item, onEdit, onDelete }) {
  const [hover, setHover] = useState(false);
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        background: WHITE, borderRadius: 14, border: `1px solid ${BORDER}`,
        padding: "13px 14px", boxShadow: "0 1px 3px rgba(15,23,42,0.04)", position: "relative",
      }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: item.description ? 6 : 0 }}>
        <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 13.5, color: TEXT, lineHeight: 1.38 }}>
          {item.title}
        </span>
        <CategoryBadge category={item.category} />
        <span style={{ marginLeft: "auto", display: "flex", gap: 4, opacity: hover ? 1 : 0, transition: "opacity 0.15s" }}>
          <button onClick={onEdit} title="Edit"
            style={{ border: "none", background: "transparent", cursor: "pointer", color: TEXT_FAINT, padding: 3, borderRadius: 6, display: "inline-flex" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></svg>
          </button>
          <button onClick={onDelete} title="Remove"
            style={{ border: "none", background: "transparent", cursor: "pointer", color: TEXT_FAINT, padding: 3, borderRadius: 6, display: "inline-flex" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </span>
      </div>
      {item.description && (
        <p style={{ fontFamily: SANS, fontSize: 12.5, color: TEXT_MUTED, lineHeight: 1.5, margin: 0 }}>
          {item.description}
        </p>
      )}
    </motion.div>
  );
}

// ─── Inline add/edit form ──────────────────────────────────────────────────────
function PieceForm({ initial, onSave, onCancel, onDelete, saving }) {
  const [title, setTitle] = useState(initial?.title || "");
  const [description, setDescription] = useState(initial?.description || "");
  const inputStyle = {
    fontFamily: SANS, fontSize: 13, color: TEXT, background: "#fafafa",
    border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: "9px 12px",
    outline: "none", width: "100%",
  };
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      style={{ background: WHITE, borderRadius: 14, border: `1.5px solid rgba(37,99,235,0.35)`, padding: "13px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
      <input autoFocus value={title} maxLength={120} placeholder="Title (e.g. AP Computer Science A)"
        onChange={(e) => setTitle(e.target.value)} style={inputStyle}
        onFocus={(e) => (e.target.style.borderColor = BLUE)} onBlur={(e) => (e.target.style.borderColor = BORDER)} />
      <textarea value={description} maxLength={500} rows={2} placeholder="Description: dates, role, scope, results (optional)"
        onChange={(e) => setDescription(e.target.value)} style={{ ...inputStyle, resize: "vertical" }}
        onFocus={(e) => (e.target.style.borderColor = BLUE)} onBlur={(e) => (e.target.style.borderColor = BORDER)} />
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button onClick={() => title.trim() && onSave(title.trim(), description.trim())} disabled={!title.trim() || saving}
          style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 700, color: WHITE, background: BLUE, border: "none",
            borderRadius: 8, padding: "7px 16px", cursor: title.trim() && !saving ? "pointer" : "not-allowed", opacity: title.trim() && !saving ? 1 : 0.55 }}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button onClick={onCancel}
          style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 600, color: TEXT_MUTED, background: "transparent", border: "none", cursor: "pointer", padding: "7px 8px" }}>
          Cancel
        </button>
        {onDelete && (
          <button onClick={onDelete}
            style={{ marginLeft: "auto", fontFamily: SANS, fontSize: 12.5, fontWeight: 600, color: "#dc2626", background: "transparent", border: "none", cursor: "pointer", padding: "7px 8px" }}>
            Delete
          </button>
        )}
      </div>
    </motion.div>
  );
}

// ─── Learn-more "?" popover (also used by the Scorecard banner) ────────────────
export function LearnMore() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);
  return (
    <span ref={ref} style={{ position: "relative", display: "inline-flex" }}>
      <button onClick={() => setOpen((o) => !o)} aria-label="What is the portfolio for?"
        style={{ width: 17, height: 17, borderRadius: "50%", border: `1.5px solid ${TEXT_FAINT}`, background: "transparent",
          color: TEXT_FAINT, fontFamily: SANS, fontSize: 10.5, fontWeight: 700, cursor: "pointer",
          display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0, lineHeight: 1 }}>
        ?
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} transition={{ duration: 0.15 }}
            style={{ position: "absolute", top: 24, left: "50%", transform: "translateX(-50%)", zIndex: 50, width: 270,
              background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "12px 14px",
              boxShadow: "0 12px 32px rgba(0,0,0,0.12)" }}>
            <p style={{ fontFamily: SANS, fontSize: 12.5, color: TEXT_MID, lineHeight: 1.55, margin: 0 }}>
              Your portfolio gives Mentorable real context about your background. It sharpens many aspects of Mentorable, such as the roadmap, chat, and research, and it keeps your profile current as you grow.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}

// ─── Extraction review modal ───────────────────────────────────────────────────
function ReviewModal({ items, onConfirm, onClose, saving }) {
  // Each row: {category, title, description, checked}
  const [rows, setRows] = useState(() => items.map((it) => ({ ...it, checked: true })));
  const update = (i, patch) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const selected = rows.filter((r) => r.checked && r.title.trim());

  const inputStyle = {
    fontFamily: SANS, fontSize: 12.5, color: TEXT, background: "#fafafa",
    border: `1px solid ${BORDER}`, borderRadius: 8, padding: "6px 9px", outline: "none",
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(20,20,19,0.45)", backdropFilter: "blur(6px)", padding: 16 }}
      onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        style={{ background: "#faf9f5", borderRadius: 22, border: "1px solid rgba(37,99,235,0.19)",
          boxShadow: "0 30px 80px rgba(0,0,0,0.3)", width: "100%", maxWidth: 620,
          maxHeight: "85vh", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "1.4rem 1.5rem 0.9rem" }}>
          <h2 style={{ fontFamily: SANS, fontWeight: 700, fontSize: "1.15rem", color: TEXT, margin: 0, letterSpacing: "-0.02em" }}>
            Here's what we found
          </h2>
          <p style={{ fontFamily: SANS, fontSize: "0.85rem", color: TEXT_MUTED, lineHeight: 1.55, margin: "0.35rem 0 0" }}>
            Review each piece before it goes into your portfolio. Edit anything, uncheck what you don't want.
          </p>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "0.25rem 1.5rem", display: "flex", flexDirection: "column", gap: 10 }}>
          {rows.map((row, i) => (
            <div key={i} style={{ background: WHITE, border: `1px solid ${row.checked ? BORDER : "#efece8"}`, borderRadius: 12,
              padding: "10px 12px", display: "flex", gap: 10, opacity: row.checked ? 1 : 0.55, transition: "opacity 0.15s" }}>
              <input type="checkbox" checked={row.checked} onChange={(e) => update(i, { checked: e.target.checked })}
                style={{ width: 16, height: 16, marginTop: 4, accentColor: BLUE, cursor: "pointer", flexShrink: 0 }} />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <select value={row.category} onChange={(e) => update(i, { category: e.target.value })}
                    style={{ ...inputStyle, fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em",
                      background: (CAT_BY_KEY[row.category] || CAT_BY_KEY.other).bg, color: TEXT_MID, border: "none", cursor: "pointer" }}>
                    {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                  <input value={row.title} maxLength={120} onChange={(e) => update(i, { title: e.target.value })}
                    style={{ ...inputStyle, flex: 1, minWidth: 160, fontWeight: 700 }} placeholder="Title" />
                </div>
                <textarea value={row.description} maxLength={500} rows={2} onChange={(e) => update(i, { description: e.target.value })}
                  style={{ ...inputStyle, resize: "vertical", width: "100%" }} placeholder="Description (optional)" />
              </div>
            </div>
          ))}
        </div>

        <div style={{ padding: "0.9rem 1.5rem 1.3rem", display: "flex", gap: 10, alignItems: "center", borderTop: `1px solid ${BORDER}` }}>
          <button onClick={() => onConfirm(selected)} disabled={!selected.length || saving}
            style={{ fontFamily: SANS, fontSize: 13.5, fontWeight: 700, color: WHITE, background: BLUE, border: "none",
              borderRadius: 10, padding: "10px 20px", cursor: selected.length && !saving ? "pointer" : "not-allowed",
              opacity: selected.length && !saving ? 1 : 0.55 }}>
            {saving ? "Adding…" : `Add ${selected.length} to portfolio`}
          </button>
          <button onClick={onClose} disabled={saving}
            style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: TEXT_MUTED, background: "transparent", border: "none", cursor: "pointer" }}>
            Cancel
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────
export default function PortfolioPage({ navigate }) {
  const [items, setItems] = useState([]);
  const [phase, setPhase] = useState("loading"); // loading | ready
  const [userId, setUserId] = useState(null);
  const [formFor, setFormFor] = useState(null);   // category key with the add form open
  const [editing, setEditing] = useState(null);   // item id being edited
  const [saving, setSaving] = useState(false);
  const [uploadsUsed, setUploadsUsed] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [extracted, setExtracted] = useState(null); // items awaiting review
  const [limitModal, setLimitModal] = useState(false);
  const fileRef = useRef(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data?.user) { navigate("/auth"); return; }
      setUserId(data.user.id);
      const [itemsRes, usage] = await Promise.all([
        supabase.from("portfolio_items").select("*").eq("user_id", data.user.id)
          .order("category").order("order_index"),
        fetchUsage(supabase),
      ]);
      setItems(itemsRes.data || []);
      setUploadsUsed(usage.portfolio_uploads_used || 0);
      setPhase("ready");
    });
  }, []);

  const nextIndex = useCallback((category, current) =>
    current.filter((i) => i.category === category)
      .reduce((max, i) => Math.max(max, (i.order_index ?? 0) + 1), 0), []);

  const addPiece = async (category, title, description) => {
    setSaving(true);
    const row = {
      user_id: userId, category, title, description: description || null,
      source: "manual", order_index: nextIndex(category, items),
    };
    const { data, error } = await supabase.from("portfolio_items").insert(row).select().single();
    setSaving(false);
    if (!error && data) { setItems((prev) => [...prev, data]); setFormFor(null); }
  };

  const updatePiece = async (id, title, description) => {
    setSaving(true);
    const patch = { title, description: description || null, updated_at: new Date().toISOString() };
    const { error } = await supabase.from("portfolio_items").update(patch).eq("id", id);
    setSaving(false);
    if (!error) { setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i))); setEditing(null); }
  };

  const deletePiece = async (id) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    setEditing(null);
    await supabase.from("portfolio_items").delete().eq("id", id);
  };

  const handleFile = async (file) => {
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${LANGGRAPH_URL}/portfolio/extract`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token}` },
        body: fd,
      });
      if (res.status === 429) { setLimitModal(true); setUploadsUsed(LIMITS.portfolio_upload); return; }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setUploadError(data.detail || "Upload failed. Please try again."); return; }
      setUploadsUsed((u) => u + 1);
      setExtracted(data.items || []);
    } catch {
      setUploadError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const confirmExtracted = async (selected) => {
    setSaving(true);
    const counters = {};
    const rows = selected.map((r) => {
      const cat = CAT_BY_KEY[r.category] ? r.category : "other";
      counters[cat] = (counters[cat] ?? nextIndex(cat, items)) ;
      const row = {
        user_id: userId, category: cat, title: r.title.trim().slice(0, 120),
        description: r.description.trim().slice(0, 500) || null,
        source: "upload", order_index: counters[cat],
      };
      counters[cat] += 1;
      return row;
    });
    const { data, error } = await supabase.from("portfolio_items").insert(rows).select();
    setSaving(false);
    if (!error && data) { setItems((prev) => [...prev, ...data]); setExtracted(null); }
  };

  const uploadsLeft = Math.max(0, LIMITS.portfolio_upload - uploadsUsed);
  const pad = {
    minHeight: "100vh", background: BG, fontFamily: SANS,
    padding: isMobile ? "1.5rem 1rem 6rem" : "2.5rem 2rem 4rem",
    paddingLeft: isMobile ? "1rem" : `calc(${SIDEBAR_WIDTH}px + 2rem)`,
  };

  return (
    <div data-sidebar-offset style={pad}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Raleway:wght@400;500;600;700&display=swap');`}</style>
      <div style={{ maxWidth: 760, margin: "0 auto", width: "100%" }}>

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} style={{ marginBottom: "1.8rem" }}>
          <h1 style={{ fontFamily: SANS, fontWeight: 700, fontSize: "1.9rem", color: TEXT, letterSpacing: "-0.03em", lineHeight: 1.1, margin: 0 }}>
            Portfolio
          </h1>
          <p style={{ fontFamily: SANS, fontSize: "0.96rem", color: TEXT_MUTED, lineHeight: 1.55, marginTop: "0.5rem", display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            Complete your portfolio! <LearnMore /> Add your experiences, awards, courses, and more.
          </p>
        </motion.div>

        {phase === "loading" && <p style={{ fontFamily: SANS, color: TEXT_FAINT }}>Loading…</p>}

        {phase === "ready" && (
          <>
            {/* Category sections */}
            {CATEGORIES.map((cat, ci) => {
              const catItems = items.filter((i) => i.category === cat.key);
              return (
                <motion.section key={cat.key}
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.05 * ci }}
                  style={{ marginBottom: "1.6rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <span style={{ fontFamily: SANS, fontSize: 11.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
                      background: cat.bg, color: TEXT_MID, borderRadius: 6, padding: "3px 10px" }}>
                      {cat.label}
                    </span>
                    {catItems.length > 0 && (
                      <span style={{ fontFamily: SANS, fontSize: 12, fontWeight: 600, color: TEXT_FAINT }}>{catItems.length}</span>
                    )}
                    <button onClick={() => { setFormFor(formFor === cat.key ? null : cat.key); setEditing(null); }}
                      title={`Add ${cat.label.toLowerCase()}`}
                      style={{ width: 22, height: 22, borderRadius: 7, border: `1.5px solid ${BORDER}`, background: WHITE,
                        color: TEXT_MUTED, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    </button>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {formFor === cat.key && (
                      <PieceForm saving={saving}
                        onSave={(t, d) => addPiece(cat.key, t, d)}
                        onCancel={() => setFormFor(null)} />
                    )}
                    <AnimatePresence>
                      {catItems.map((item) =>
                        editing === item.id ? (
                          <PieceForm key={item.id} initial={item} saving={saving}
                            onSave={(t, d) => updatePiece(item.id, t, d)}
                            onCancel={() => setEditing(null)}
                            onDelete={() => deletePiece(item.id)} />
                        ) : (
                          <PieceCard key={item.id} item={item}
                            onEdit={() => { setEditing(item.id); setFormFor(null); }}
                            onDelete={() => deletePiece(item.id)} />
                        )
                      )}
                    </AnimatePresence>
                    {catItems.length === 0 && formFor !== cat.key && (
                      <p style={{ fontFamily: SANS, fontSize: 12.5, color: TEXT_FAINT, margin: "2px 0 0 2px" }}>
                        Nothing here yet. Click + to add one.
                      </p>
                    )}
                  </div>
                </motion.section>
              );
            })}

            {/* Upload */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.45 }}
              style={{ marginTop: "2.2rem", background: WHITE, border: `1.5px dashed rgba(37,99,235,0.35)`, borderRadius: 16, padding: "1.4rem 1.5rem", textAlign: "center" }}>
              <p style={{ fontFamily: SANS, fontWeight: 700, fontSize: "1rem", color: TEXT, margin: 0 }}>
                Have a resume or brag sheet?
              </p>
              <p style={{ fontFamily: SANS, fontSize: "0.85rem", color: TEXT_MUTED, lineHeight: 1.55, margin: "0.4rem auto 0.9rem", maxWidth: 420 }}>
                Upload a PDF or DOCX and Mentorable will pull out your experiences, awards, and courses for you to review before they're added.
              </p>
              <input ref={fileRef} type="file" accept=".pdf,.docx" style={{ display: "none" }}
                onChange={(e) => handleFile(e.target.files?.[0])} />
              <button onClick={() => uploadsLeft > 0 ? fileRef.current?.click() : setLimitModal(true)} disabled={uploading}
                style={{ fontFamily: SANS, fontSize: 13.5, fontWeight: 700, color: WHITE, background: uploading ? "#93b4f8" : BLUE,
                  border: "none", borderRadius: 10, padding: "10px 22px", cursor: uploading ? "wait" : "pointer" }}>
                {uploading ? "Reading your file…" : "Upload resume"}
              </button>
              <p style={{ fontFamily: SANS, fontSize: 12, color: TEXT_FAINT, margin: "0.7rem 0 0" }}>
                {uploadsLeft} of {LIMITS.portfolio_upload} uploads remaining
              </p>
              {uploadError && (
                <p style={{ fontFamily: SANS, fontSize: 12.5, color: "#dc2626", margin: "0.6rem 0 0" }}>{uploadError}</p>
              )}
            </motion.div>
          </>
        )}
      </div>

      <AnimatePresence>
        {extracted && (
          <ReviewModal items={extracted} saving={saving}
            onConfirm={confirmExtracted}
            onClose={() => setExtracted(null)} />
        )}
      </AnimatePresence>

      {limitModal && <LimitModal feature="portfolio_upload" onClose={() => setLimitModal(false)} />}
    </div>
  );
}
