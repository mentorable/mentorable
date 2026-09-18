import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../lib/supabase.js";
import { fetchUsage, LIMITS } from "../lib/usage.js";
import LimitModal from "../components/common/LimitModal.jsx";
import { SIDEBAR_WIDTH } from "../components/common/Sidebar.jsx";
import { useIsMobile } from "../hooks/useIsMobile.js";
import { useTheme } from "../lib/ThemeContext.jsx";

const LANGGRAPH_URL = import.meta.env.VITE_LANGGRAPH_CHAT_URL;
const SANS = "'Raleway', sans-serif";
const BG = "#F5F5F5", WHITE = "#fff";
const TEXT = "#141413", TEXT_MID = "#3d3d3a", TEXT_MUTED = "#494742", TEXT_FAINT = "#6a6760", BORDER = "#e6dfd8";

// 8 categories, each a progressively lighter tint of the accent color
// (backgrounds only, dark text). "Other" stays a neutral gray catch-all.
const CATEGORIES = [
  { key: "experience",    label: "Experience",    bg: "color-mix(in srgb, var(--accent) 42%, white)" },
  { key: "project",       label: "Project",       bg: "color-mix(in srgb, var(--accent) 36%, white)" },
  { key: "volunteering",  label: "Volunteering",  bg: "color-mix(in srgb, var(--accent) 30%, white)" },
  { key: "award",         label: "Award",         bg: "color-mix(in srgb, var(--accent) 25%, white)" },
  { key: "course",        label: "Course",        bg: "color-mix(in srgb, var(--accent) 20%, white)" },
  { key: "certification", label: "Certification", bg: "color-mix(in srgb, var(--accent) 16%, white)" },
  { key: "club",          label: "Club",          bg: "color-mix(in srgb, var(--accent) 12%, white)" },
  { key: "skill",         label: "Skill",         bg: "color-mix(in srgb, var(--accent) 8%, white)" },
  { key: "other",         label: "Other",         bg: "#eceff4" },
];
const CAT_BY_KEY = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]));

// Per-category placeholder examples so the add/edit form doesn't feel generic.
const PLACEHOLDER_EXAMPLES = {
  experience:    { title: "Title (e.g. Marketing Intern, Acme Co.)",            description: "Description: dates, role, scope, results (optional) — e.g. Summer 2025, ran social campaigns, grew followers 30%" },
  project:       { title: "Title (e.g. Personal Budgeting App)",                description: "Description: what it does, tools used, outcome (optional) — e.g. Built with React and Supabase, used by 20 classmates" },
  volunteering:  { title: "Title (e.g. Weekend Tutor, City Library)",            description: "Description: dates, cause, hours, impact (optional) — e.g. 2024–2025, tutored 5 students weekly in math" },
  award:         { title: "Title (e.g. Dean's List, Fall 2025)",                description: "Description: awarding body, date, why you earned it (optional) — e.g. Top 10% of class, awarded by the university" },
  course:        { title: "Title (e.g. AP Computer Science A)",                 description: "Description: institution, grade, key topics (optional) — e.g. Completed Spring 2025, grade A, built a Java app" },
  certification: { title: "Title (e.g. Google Data Analytics Certificate)",     description: "Description: issuer, date earned, skills covered (optional) — e.g. Issued 2025 by Google, covers SQL and Tableau" },
  club:          { title: "Title (e.g. Vice President, Robotics Club)",         description: "Description: dates, responsibilities, achievements (optional) — e.g. 2024–present, led a team of 12 to states" },
  skill:         { title: "Title (e.g. Python)",                                description: "Description: proficiency, how you use it, projects (optional) — e.g. Intermediate, used in 3 personal projects" },
  other:         { title: "Title (e.g. Published Blog Post)",                   description: "Description: dates, context, why it matters (optional)" },
};

function CategoryBadge({ category }) {
  const cat = CAT_BY_KEY[category] || CAT_BY_KEY.other;
  return (
    <span style={{
      fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: "0.05em",
      background: cat.bg, color: TEXT_MID,
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
function PieceForm({ initial, category, onSave, onCancel, onDelete, saving }) {
  const [title, setTitle] = useState(initial?.title || "");
  const [description, setDescription] = useState(initial?.description || "");
  const examples = PLACEHOLDER_EXAMPLES[category || initial?.category] || PLACEHOLDER_EXAMPLES.other;
  const inputStyle = {
    fontFamily: SANS, fontSize: 13, color: TEXT, background: "#fafafa",
    border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: "9px 12px",
    outline: "none", width: "100%",
  };
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      style={{ background: WHITE, borderRadius: 14, border: `1.5px solid rgba(var(--accent-rgb),0.35)`, padding: "13px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
      <input autoFocus value={title} maxLength={120} placeholder={examples.title}
        onChange={(e) => setTitle(e.target.value)} style={inputStyle}
        onFocus={(e) => (e.target.style.borderColor = "var(--accent)")} onBlur={(e) => (e.target.style.borderColor = BORDER)} />
      <textarea value={description} maxLength={500} rows={2} placeholder={examples.description}
        onChange={(e) => setDescription(e.target.value)} style={{ ...inputStyle, resize: "vertical" }}
        onFocus={(e) => (e.target.style.borderColor = "var(--accent)")} onBlur={(e) => (e.target.style.borderColor = BORDER)} />
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button onClick={() => title.trim() && onSave(title.trim(), description.trim())} disabled={!title.trim() || saving}
          style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 700, color: WHITE, background: "var(--accent)", border: "none",
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
        style={{ background: "#faf9f5", borderRadius: 22, border: "1px solid rgba(var(--accent-rgb),0.19)",
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
                style={{ width: 16, height: 16, marginTop: 4, accentColor: "var(--accent)", cursor: "pointer", flexShrink: 0 }} />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <select value={row.category} onChange={(e) => update(i, { category: e.target.value })}
                    style={{ ...inputStyle, fontWeight: 700, fontSize: 11, letterSpacing: "0.04em",
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
            style={{ fontFamily: SANS, fontSize: 13.5, fontWeight: 700, color: WHITE, background: "var(--accent)", border: "none",
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

// ─── Export-as-resume modal ────────────────────────────────────────────────────
const EMPTY_CONTACT = { email: "", phone: "", location: "", links: [] };
const SPARSE_THRESHOLD = 3; // below this, warn that the resume will look thin

function ExportResumeModal({ items, fullName, contact: initialContact, exportsLeft, generating, error, onGenerate, onClose }) {
  const [contact, setContact] = useState(() => ({
    ...EMPTY_CONTACT, ...(initialContact || {}),
    links: Array.isArray(initialContact?.links) ? initialContact.links : [],
  }));
  const [checked, setChecked] = useState(() => new Set(items.map((i) => i.id)));
  const selectedCount = checked.size;
  const sparse = selectedCount > 0 && selectedCount < SPARSE_THRESHOLD;

  const setField = (k, v) => setContact((c) => ({ ...c, [k]: v }));
  const setLink = (i, patch) => setContact((c) => ({ ...c, links: c.links.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));
  const addLink = () => setContact((c) => ({ ...c, links: [...c.links, { label: "", url: "" }] }));
  const removeLink = (i) => setContact((c) => ({ ...c, links: c.links.filter((_, j) => j !== i) }));
  const toggle = (id) => setChecked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const cleanContact = () => ({ ...contact, links: contact.links.filter((l) => (l.url || "").trim()) });

  const inputStyle = {
    fontFamily: SANS, fontSize: 12.5, color: TEXT, background: "#fafafa",
    border: `1px solid ${BORDER}`, borderRadius: 8, padding: "7px 10px", outline: "none", minWidth: 0,
  };
  const sectionLabel = { fontFamily: SANS, fontSize: 11.5, fontWeight: 700, color: TEXT, letterSpacing: "0.04em", margin: "0 0 8px" };
  const canGenerate = selectedCount > 0 && !generating;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(20,20,19,0.45)", backdropFilter: "blur(6px)", padding: 16 }}
      onClick={(e) => { if (e.target === e.currentTarget && !generating) onClose(cleanContact()); }}>
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        style={{ background: "#faf9f5", borderRadius: 22, border: "1px solid rgba(var(--accent-rgb),0.19)",
          boxShadow: "0 30px 80px rgba(0,0,0,0.3)", width: "100%", maxWidth: 620,
          maxHeight: "88vh", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "1.4rem 1.5rem 0.9rem" }}>
          <h2 style={{ fontFamily: SANS, fontWeight: 700, fontSize: "1.15rem", color: TEXT, margin: 0, letterSpacing: "-0.02em" }}>
            Export as a PDF resume
          </h2>
          <p style={{ fontFamily: SANS, fontSize: "0.85rem", color: TEXT_MUTED, lineHeight: 1.55, margin: "0.35rem 0 0" }}>
            Add contact details for the header, then pick which pieces to include. Everything is optional except at least one piece.
          </p>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "0.25rem 1.5rem 0.5rem", display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Contact header */}
          <div>
            <p style={sectionLabel}>Contact header</p>
            <div style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "12px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
              <p style={{ fontFamily: SANS, fontSize: 12.5, color: TEXT_MUTED, margin: 0 }}>
                Name: <strong style={{ color: TEXT }}>{fullName || "Set your name in Profile"}</strong>
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
                <input value={contact.email} onChange={(e) => setField("email", e.target.value)} placeholder="Email" maxLength={120} style={inputStyle} />
                <input value={contact.phone} onChange={(e) => setField("phone", e.target.value)} placeholder="Phone" maxLength={40} style={inputStyle} />
                <input value={contact.location} onChange={(e) => setField("location", e.target.value)} placeholder="City, State" maxLength={80} style={inputStyle} />
              </div>
              {contact.links.map((l, i) => (
                <div key={i} style={{ display: "flex", gap: 6 }}>
                  <input value={l.label} onChange={(e) => setLink(i, { label: e.target.value })} placeholder="Label (e.g. LinkedIn)" maxLength={40} style={{ ...inputStyle, flex: "0 0 38%" }} />
                  <input value={l.url} onChange={(e) => setLink(i, { url: e.target.value })} placeholder="https://" maxLength={200} style={{ ...inputStyle, flex: 1 }} />
                  <button onClick={() => removeLink(i)} aria-label="Remove link"
                    style={{ border: "none", background: "transparent", color: TEXT_FAINT, cursor: "pointer", padding: "0 4px", display: "inline-flex", alignItems: "center" }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              ))}
              <button onClick={addLink}
                style={{ alignSelf: "flex-start", fontFamily: SANS, fontSize: 12, fontWeight: 700, color: "var(--accent)", background: "transparent", border: "none", cursor: "pointer", padding: "2px 0" }}>
                + Add a link (LinkedIn, GitHub, portfolio site)
              </button>
            </div>
          </div>

          {/* Item picker */}
          <div>
            <p style={sectionLabel}>Pieces to include ({selectedCount} of {items.length})</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {CATEGORIES.map((cat) => {
                const catItems = items.filter((i) => i.category === cat.key);
                if (!catItems.length) return null;
                return (
                  <div key={cat.key}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "4px 0 6px" }}>
                      <CategoryBadge category={cat.key} />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {catItems.map((item) => {
                        const on = checked.has(item.id);
                        return (
                          <label key={item.id} style={{ background: WHITE, border: `1px solid ${on ? BORDER : "#efece8"}`, borderRadius: 10,
                            padding: "8px 10px", display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer",
                            opacity: on ? 1 : 0.55, transition: "opacity 0.15s" }}>
                            <input type="checkbox" checked={on} onChange={() => toggle(item.id)}
                              style={{ width: 16, height: 16, marginTop: 2, accentColor: "var(--accent)", cursor: "pointer", flexShrink: 0 }} />
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 700, color: TEXT, lineHeight: 1.3 }}>{item.title}</div>
                              {item.description && (
                                <div style={{ fontFamily: SANS, fontSize: 12, color: TEXT_MUTED, lineHeight: 1.4, marginTop: 2,
                                  display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                                  {item.description}
                                </div>
                              )}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {selectedCount === 0 && (
            <p style={{ fontFamily: SANS, fontSize: 12.5, color: "#991b1b", background: "#fee2e2", border: "1px solid #fecaca", borderRadius: 10, padding: "9px 12px", margin: 0, lineHeight: 1.5 }}>
              Select at least one piece to export a resume.
            </p>
          )}
          {sparse && (
            <p style={{ fontFamily: SANS, fontSize: 12.5, color: "#92400e", background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: 10, padding: "9px 12px", margin: 0, lineHeight: 1.5 }}>
              Heads up: with fewer than {SPARSE_THRESHOLD} pieces your resume will look sparse. Consider adding a few more before you export, since the demo includes only one export.
            </p>
          )}
        </div>

        <div style={{ padding: "0.9rem 1.5rem 1.3rem", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", borderTop: `1px solid ${BORDER}` }}>
          <button onClick={() => onGenerate([...checked], cleanContact())} disabled={!canGenerate}
            style={{ fontFamily: SANS, fontSize: 13.5, fontWeight: 700, color: WHITE, background: "var(--accent)", border: "none",
              borderRadius: 10, padding: "10px 20px", cursor: canGenerate ? "pointer" : "not-allowed", opacity: canGenerate ? 1 : 0.55 }}>
            {generating ? "Building your PDF…" : "Download PDF"}
          </button>
          <button onClick={() => onClose(cleanContact())} disabled={generating}
            style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: TEXT_MUTED, background: "transparent", border: "none", cursor: "pointer" }}>
            Cancel
          </button>
          <span style={{ marginLeft: "auto", fontFamily: SANS, fontSize: 12, fontWeight: 600, color: exportsLeft === 0 ? "#dc2626" : TEXT }}>
            {exportsLeft} of {LIMITS.resume_export} export{LIMITS.resume_export === 1 ? "" : "s"} remaining
          </span>
          {error && (
            <p style={{ width: "100%", fontFamily: SANS, fontSize: 12.5, color: "#dc2626", margin: 0 }}>{error}</p>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────
export default function PortfolioPage({ navigate }) {
  const { accent } = useTheme();
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
  const [limitModal, setLimitModal] = useState(null); // feature key of the limit that was hit
  const [fullName, setFullName] = useState("");
  const [contact, setContact] = useState(EMPTY_CONTACT);
  const [exportsUsed, setExportsUsed] = useState(0);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(null);
  const fileRef = useRef(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data?.user) { navigate("/auth"); return; }
      setUserId(data.user.id);
      const [itemsRes, usage, profileRes] = await Promise.all([
        supabase.from("portfolio_items").select("*").eq("user_id", data.user.id)
          .order("category").order("order_index"),
        fetchUsage(supabase),
        supabase.from("profiles").select("full_name, resume_contact").eq("id", data.user.id).maybeSingle(),
      ]);
      setItems(itemsRes.data || []);
      setUploadsUsed(usage.portfolio_uploads_used || 0);
      setExportsUsed(usage.resume_exports_used || 0);
      setFullName(profileRes.data?.full_name || "");
      setContact({ ...EMPTY_CONTACT, ...(profileRes.data?.resume_contact || {}) });
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

  const saveContact = async (next) => {
    setContact(next);
    if (userId) await supabase.from("profiles").update({ resume_contact: next }).eq("id", userId);
  };

  const generateResume = async (selectedIds, nextContact) => {
    setExportError(null);
    setExporting(true);
    try {
      await saveContact(nextContact);
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${LANGGRAPH_URL}/portfolio/resume/pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ item_ids: selectedIds, contact: nextContact }),
      });
      if (res.status === 429) { setExportOpen(false); setExportsUsed(LIMITS.resume_export); setLimitModal("resume_export"); return; }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setExportError(typeof data.detail === "string" ? data.detail : "Export failed. Please try again.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "resume.pdf"; a.click();
      URL.revokeObjectURL(url);
      setExportsUsed((u) => u + 1);
      setExportOpen(false);
    } catch {
      setExportError("Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  const uploadsLeft = Math.max(0, LIMITS.portfolio_upload - uploadsUsed);
  const exportsLeft = Math.max(0, LIMITS.resume_export - exportsUsed);
  const canExport = items.length > 0;
  const pad = {
    minHeight: "100vh", background: BG, fontFamily: SANS,
    padding: isMobile ? "1.5rem 1rem 6rem" : "2.5rem 2rem 4rem",
    paddingLeft: isMobile ? "1rem" : `calc(${SIDEBAR_WIDTH}px + 2rem)`,
  };

  return (
    <div data-sidebar-offset style={pad}>
      <div style={{ maxWidth: 760, margin: "0 auto", width: "100%" }}>

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} style={{ marginBottom: "1.8rem" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <h1 style={{ fontFamily: SANS, fontWeight: 700, fontSize: "1.9rem", color: accent, letterSpacing: "-0.03em", lineHeight: 1.1, margin: 0 }}>
              Portfolio
            </h1>
            {phase === "ready" && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                <button
                  onClick={() => { if (!canExport) return; if (exportsLeft <= 0) { setLimitModal("resume_export"); return; } setExportError(null); setExportOpen(true); }}
                  disabled={!canExport}
                  title={canExport ? "Export your portfolio as a PDF resume" : "Add at least one portfolio piece first"}
                  style={{ display: "inline-flex", alignItems: "center", gap: 7, fontFamily: SANS, fontSize: 13, fontWeight: 700,
                    color: "#000", background: "transparent", border: "2px solid #000", borderRadius: 10, padding: "8px 14px",
                    cursor: canExport ? "pointer" : "not-allowed", opacity: canExport ? 1 : 0.45 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  Export resume
                </button>
                {!canExport && (
                  <span style={{ fontFamily: SANS, fontSize: 11.5, color: TEXT_MUTED }}>Add at least one piece to export</span>
                )}
              </div>
            )}
          </div>
          <p style={{ fontFamily: SANS, fontSize: "0.96rem", color: TEXT, lineHeight: 1.55, marginTop: "0.5rem", display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            Complete your portfolio <LearnMore /> Add your experiences, awards, courses, and more.
          </p>
          <p style={{ fontFamily: SANS, fontSize: "0.96rem", color: TEXT, lineHeight: 1.55, marginTop: "0.35rem" }}>
            You can also reference your portfolio directly in the{" "}
            <button onClick={() => navigate("/chat")}
              style={{ fontFamily: SANS, fontSize: "0.96rem", color: "var(--accent)", fontWeight: 700, background: "none",
                border: "none", padding: 0, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3 }}>
              chat page
            </button>.
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
                    <span style={{ fontFamily: SANS, fontSize: 11.5, fontWeight: 700, letterSpacing: "0.06em",
                      background: cat.bg, color: TEXT, borderRadius: 6, padding: "3px 10px" }}>
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
                      <PieceForm saving={saving} category={cat.key}
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
              style={{ marginTop: "2.2rem", background: WHITE, border: `1.5px solid rgba(var(--accent-rgb),0.35)`, borderRadius: 16, padding: "1.4rem 1.5rem", textAlign: "center" }}>
              <p style={{ fontFamily: SANS, fontWeight: 700, fontSize: "1rem", color: TEXT, margin: 0 }}>
                Have a resume or brag sheet?
              </p>
              <p style={{ fontFamily: SANS, fontSize: "0.85rem", color: TEXT_MUTED, lineHeight: 1.55, margin: "0.4rem auto 0.9rem", maxWidth: 420 }}>
                Upload a PDF or DOCX and Mentorable will pull out your experiences, awards, and courses for you to review before they're added.
              </p>
              <input ref={fileRef} type="file" accept=".pdf,.docx" style={{ display: "none" }}
                onChange={(e) => handleFile(e.target.files?.[0])} />
              <button onClick={() => uploadsLeft > 0 ? fileRef.current?.click() : setLimitModal("portfolio_upload")} disabled={uploading}
                style={{ fontFamily: SANS, fontSize: 13.5, fontWeight: 700, color: WHITE, background: uploading ? "#93b4f8" : "var(--accent)",
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

      <AnimatePresence>
        {exportOpen && (
          <ExportResumeModal items={items} fullName={fullName} contact={contact}
            exportsLeft={exportsLeft} generating={exporting} error={exportError}
            onGenerate={generateResume}
            onClose={(next) => { saveContact(next); setExportOpen(false); }} />
        )}
      </AnimatePresence>

      {limitModal && <LimitModal feature={limitModal} onClose={() => setLimitModal(null)} />}
    </div>
  );
}
