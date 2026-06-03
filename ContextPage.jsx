import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "./lib/supabase.js";
import { buildSections, SECTION_LABELS } from "./lib/mentora.js";
import { getKnownUserId, setKnownUserId } from "./lib/cache.js";
import { SIDEBAR_WIDTH } from "./components/common/Sidebar.jsx";
import { useIsMobile } from "./hooks/useIsMobile.js";

const FONT = "'Inter', -apple-system, sans-serif";
const BG   = "#faf9f5";
const BLUE = "#1d4ed8";

// ─── Utilities ────────────────────────────────────────────────────────────────

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function replaceFirst(str, needle, replacement) {
  const idx = str.indexOf(needle);
  if (idx === -1) return str;
  return str.slice(0, idx) + replacement + str.slice(idx + needle.length);
}

function buildAnnotatedHtml(rawContent, sectionAnnotations) {
  let html = escapeHtml(rawContent);

  for (const ann of sectionAnnotations) {
    if (!ann.highlighted_text) continue;
    const needle = escapeHtml(ann.highlighted_text);
    if (!html.includes(needle)) continue;

    if (ann.type === "note") {
      html = replaceFirst(
        html, needle,
        `<mark class="ctx-note" data-ann-id="${ann.id}">${needle}</mark>`
      );
    } else {
      html = replaceFirst(
        html, needle,
        `<mark class="ctx-replace" data-ann-id="${ann.id}"><del>${needle}</del><ins> ${escapeHtml(ann.annotation_text)}</ins></mark>`
      );
    }
  }

  html = html.split("\n").map(line => {
    if (line.startsWith("## "))
      return `<span class="ctx-h2">${line.slice(3)}</span>`;
    if (line.startsWith("- "))
      return `<span class="ctx-bullet">• ${line.slice(2)}</span>`;
    if (line.trim() === "")
      return `<span class="ctx-blank"></span>`;
    return `<span class="ctx-line">${line}</span>`;
  }).join("\n");

  return html;
}

function isStale(ann, sectionContent) {
  return ann.type === "replace" && ann.highlighted_text && !sectionContent.includes(ann.highlighted_text);
}

// ─── ContextPage ──────────────────────────────────────────────────────────────

export default function ContextPage({ navigate }) {
  const isMobile  = useIsMobile();
  const [sections,    setSections]    = useState([]);
  const [annotations, setAnnotations] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [userId,      setUserId]      = useState(getKnownUserId);
  const [popover,     setPopover]     = useState(null);
  const [pForm,       setPForm]       = useState({ type: "note", text: "" });
  const [saving,      setSaving]      = useState(false);
  const [showHelp,    setShowHelp]    = useState(false);
  const popoverRef = useRef(null);

  // ── Load data ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { navigate?.("/auth"); return; }
        const uid = user.id;
        setUserId(uid);
        setKnownUserId(uid);

        const [profileRes, questsRes, researchRes, sessionsRes, annsRes] = await Promise.all([
          supabase.from("profiles").select("*").eq("id", uid).single(),
          supabase.from("quest_items")
            .select("title, category, status, completed_at").eq("user_id", uid)
            .in("status", ["completed", "in_progress", "considered", "deleted"])
            .order("completed_at", { ascending: false }),
          supabase.from("research_sessions")
            .select("query").eq("user_id", uid)
            .order("created_at", { ascending: false }).limit(10),
          supabase.from("chat_sessions")
            .select("messages, title").eq("user_id", uid)
            .order("updated_at", { ascending: false }).limit(8),
          supabase.from("context_annotations").select("*").eq("user_id", uid),
        ]);

        const profile  = profileRes.data  || {};
        const allQ     = questsRes.data   || [];
        const research = (researchRes.data || []).map(r => r.query).filter(Boolean);
        const topics   = (sessionsRes.data || []).flatMap(s => {
          if (s.title) return [s.title.slice(0, 60)];
          const first = (s.messages || []).find(m => m.role === "user");
          return first?.content ? [first.content.split("\n")[0].slice(0, 60)] : [];
        });

        const completedQuests    = allQ.filter(q => q.status === "completed");
        const activeQuests       = allQ.filter(q => ["in_progress", "considered"].includes(q.status));
        const deletedQuestTitles = allQ.filter(q => q.status === "deleted").map(q => q.title);

        setSections(buildSections(profile, {
          completedQuests, activeQuests, deletedQuestTitles,
          recentResearch: research, chatTopics: topics,
        }));
        setAnnotations(annsRes.data || []);
      } catch (err) {
        console.error("[ContextPage]", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // ── Close popover on outside click ──────────────────────────────────────────
  useEffect(() => {
    const onDown = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target) && !e.target.closest("mark[data-ann-id]")) {
        setPopover(null);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // ── Selection ────────────────────────────────────────────────────────────────
  const handleMouseUp = useCallback((sectionId) => {
    if (isMobile) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const text = sel.toString().trim();
    if (text.length < 2) return;
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    setPopover({ sectionId, highlightedText: text, rect, ann: null });
    setPForm({ type: "note", text: "" });
  }, [isMobile]);

  const handleMarkClick = useCallback((e, sectionId) => {
    const mark = e.target.closest("mark[data-ann-id]");
    if (!mark) return;
    const ann = annotations.find(a => a.id === mark.dataset.annId);
    if (!ann) return;
    e.stopPropagation();
    setPopover({ sectionId, highlightedText: ann.highlighted_text, rect: mark.getBoundingClientRect(), ann });
    setPForm({ type: ann.type, text: ann.annotation_text });
  }, [annotations]);

  const handleMobileTap = useCallback((sectionId) => {
    setPopover({ sectionId, highlightedText: null, rect: null, ann: null });
    setPForm({ type: "note", text: "" });
  }, []);

  // ── CRUD ─────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!popover || !pForm.text.trim() || !userId) return;
    setSaving(true);
    try {
      if (popover.ann) {
        const { data, error } = await supabase.from("context_annotations")
          .update({ annotation_text: pForm.text.trim(), type: pForm.type })
          .eq("id", popover.ann.id).select().single();
        if (error) throw error;
        setAnnotations(prev => prev.map(a => a.id === popover.ann.id ? data : a));
      } else {
        const { data, error } = await supabase.from("context_annotations").insert({
          user_id:          userId,
          section_id:       popover.sectionId,
          highlighted_text: popover.highlightedText || "",
          annotation_text:  pForm.text.trim(),
          type:             pForm.type,
        }).select().single();
        if (error) throw error;
        setAnnotations(prev => [...prev, data]);
      }
      setPopover(null);
    } catch (err) {
      console.error("[ContextPage] save", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!popover?.ann) return;
    setSaving(true);
    try {
      await supabase.from("context_annotations").delete().eq("id", popover.ann.id);
      setAnnotations(prev => prev.filter(a => a.id !== popover.ann.id));
      setPopover(null);
    } catch (err) {
      console.error("[ContextPage] delete", err);
    } finally {
      setSaving(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  const annCount = annotations.length;

  return (
    <div style={{
      minHeight: "100vh",
      background: BG,
      backgroundImage: "radial-gradient(circle, rgba(29,78,216,0.06) 1px, transparent 1px)",
      backgroundSize: "28px 28px",
      paddingLeft: isMobile ? 0 : SIDEBAR_WIDTH,
      paddingBottom: isMobile ? 96 : 40,
      fontFamily: FONT,
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600&family=Inter:wght@400;500;600;700;800&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        .ctx-h2     { display:block; font-weight:700; font-size:0.875rem; color:${BLUE}; letter-spacing:-0.01em; margin-bottom:0.1rem; }
        .ctx-bullet { display:block; padding-left:1.1rem; }
        .ctx-line   { display:block; }
        .ctx-blank  { display:block; height:0.3rem; }
        .ctx-note   { background:rgba(253,224,71,0.55); cursor:pointer; border-radius:2px; padding:0 1px; transition:background 0.12s; }
        .ctx-note:hover { background:rgba(253,224,71,0.88); }
        .ctx-replace { cursor:pointer; }
        .ctx-replace del { background:rgba(254,202,202,0.65); text-decoration:line-through; color:#dc2626; border-radius:2px; padding:0 1px; }
        .ctx-replace ins { text-decoration:none; color:#16a34a; font-weight:600; margin-left:3px; }
        .ctx-replace:hover del { background:rgba(254,202,202,0.92); }
        ::selection { background:rgba(59,130,246,0.18); }
      `}</style>

      <div style={{ maxWidth: 700, margin: "0 auto", padding: "2.75rem 1.5rem 2rem" }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "1.75rem" }}>
          <div>
            <h1 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 600, fontSize: "clamp(2rem, 3vw, 2.6rem)", color: "#141413", lineHeight: 1.1, letterSpacing: "-0.02em" }}>
              Context
            </h1>
            <p style={{ fontFamily: FONT, fontSize: "0.9rem", color: "#6c6a64", marginTop: "0.4rem", lineHeight: 1.75, fontWeight: 500 }}>
              Everything Mentora knows about you.{" "}
              <span style={{ color: "#b0aaa2" }}>
                {isMobile ? "Tap a section to add a note." : "Select any text to annotate."}
              </span>
            </p>
          </div>
          <button
            onClick={() => setShowHelp(true)}
            style={{
              width: 32, height: 32, borderRadius: "50%",
              border: "1.5px solid #e2e8f0", background: "#fff",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              color: "#8e8b82", fontFamily: FONT, fontWeight: 700, fontSize: "0.875rem",
              flexShrink: 0, marginTop: "0.15rem",
              transition: "border-color 0.15s, color 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = BLUE; e.currentTarget.style.color = BLUE; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.color = "#8e8b82"; }}
            title="How annotations work"
          >
            ?
          </button>
        </div>

        {/* ── Annotation badge ── */}
        <AnimatePresence>
          {!loading && annCount > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                background: "rgba(29,78,216,0.07)", border: "1px solid rgba(29,78,216,0.14)",
                borderRadius: "2rem", padding: "0.3rem 0.85rem",
                fontSize: "0.78rem", fontWeight: 600, color: BLUE,
                marginBottom: "1.25rem",
              }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              {annCount} annotation{annCount !== 1 ? "s" : ""} active
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Sections ── */}
        {loading ? <ContextSkeleton /> : sections.length === 0 ? (
          <div style={{ textAlign: "center", padding: "4rem 0", color: "#8e8b82", fontSize: "0.9rem" }}>
            No context yet. Complete onboarding to see your profile here.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
            {sections.map((section, i) => {
              const sAnns    = annotations.filter(a => a.section_id === section.id);
              const hasAnns  = sAnns.length > 0;
              const hasStale = sAnns.some(a => isStale(a, section.content));
              const sectionAnns   = sAnns.filter(a => a.highlighted_text); // inline
              const sectionNotes  = sAnns.filter(a => !a.highlighted_text); // section-level

              return (
                <motion.div
                  key={section.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22, delay: i * 0.035, ease: [0.22, 1, 0.36, 1] }}
                  style={{
                    background: "#fff",
                    border: `1px solid ${hasAnns ? "rgba(29,78,216,0.18)" : "rgba(0,0,0,0.06)"}`,
                    borderRadius: "0.875rem",
                    overflow: "hidden",
                  }}
                >
                  {/* Section header */}
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "0.65rem 1.125rem",
                    borderBottom: "1px solid rgba(0,0,0,0.04)",
                    background: "rgba(29,78,216,0.02)",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{
                        fontFamily: FONT, fontSize: "0.65rem", fontWeight: 700,
                        letterSpacing: "0.1em", textTransform: "uppercase", color: BLUE,
                      }}>
                        {SECTION_LABELS[section.id] || section.id}
                      </span>
                      {hasStale && (
                        <span title="One or more replacements may be outdated" style={{ color: "#f59e0b", display: "flex" }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                          </svg>
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {hasAnns && (
                        <span style={{
                          background: "rgba(29,78,216,0.09)", color: BLUE,
                          fontSize: "0.68rem", fontWeight: 700,
                          borderRadius: "2rem", padding: "0.1rem 0.5rem",
                        }}>
                          {sAnns.length}
                        </span>
                      )}
                      {isMobile && (
                        <button
                          onClick={() => handleMobileTap(section.id)}
                          style={{
                            background: "transparent", border: "1.5px solid #e2e8f0",
                            borderRadius: "0.45rem", padding: "0.2rem 0.55rem",
                            fontSize: "0.7rem", fontWeight: 600, color: "#6b7280",
                            cursor: "pointer", fontFamily: FONT,
                          }}
                        >
                          + Note
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Section-level notes (mobile, no highlight) */}
                  {sectionNotes.map(ann => (
                    <div
                      key={ann.id}
                      onClick={() => {
                        setPopover({ sectionId: section.id, highlightedText: null, rect: null, ann });
                        setPForm({ type: ann.type, text: ann.annotation_text });
                      }}
                      style={{
                        padding: "0.55rem 1.125rem",
                        borderBottom: "1px solid rgba(0,0,0,0.04)",
                        background: "rgba(253,224,71,0.12)",
                        display: "flex", alignItems: "flex-start", gap: 8,
                        cursor: "pointer",
                        transition: "background 0.12s",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = "rgba(253,224,71,0.22)"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "rgba(253,224,71,0.12)"; }}
                    >
                      <span style={{ color: "#92400e", display: "flex", marginTop: "0.15rem", flexShrink: 0 }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </span>
                      <span style={{ fontFamily: FONT, fontSize: "0.8rem", color: "#374151", lineHeight: 1.5 }}>
                        {ann.annotation_text}
                      </span>
                    </div>
                  ))}

                  {/* Section content */}
                  <div
                    data-section-id={section.id}
                    onMouseUp={() => handleMouseUp(section.id)}
                    onClick={(e) => handleMarkClick(e, section.id)}
                    style={{
                      padding: "0.875rem 1.125rem",
                      fontFamily: FONT, fontSize: "0.875rem", lineHeight: 1.8,
                      color: "#374151",
                      userSelect: isMobile ? "none" : "text",
                    }}
                    dangerouslySetInnerHTML={{ __html: buildAnnotatedHtml(section.content, sectionAnns) }}
                  />
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Popover ── */}
      <AnimatePresence>
        {popover && (
          <AnnotationPopover
            key="popover"
            popover={popover}
            form={pForm}
            setForm={setPForm}
            onSave={handleSave}
            onDelete={handleDelete}
            onClose={() => setPopover(null)}
            saving={saving}
            isMobile={isMobile}
            popoverRef={popoverRef}
          />
        )}
      </AnimatePresence>

      {/* ── Help ── */}
      <AnimatePresence>
        {showHelp && <HelpModal key="help" onClose={() => setShowHelp(false)} />}
      </AnimatePresence>
    </div>
  );
}

// ─── Annotation Popover ───────────────────────────────────────────────────────

function AnnotationPopover({ popover, form, setForm, onSave, onDelete, onClose, saving, isMobile, popoverRef }) {
  const inputRef = useRef(null);
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 60); }, []);

  const isEditing = !!popover.ann;

  const posStyle = isMobile
    ? { position: "fixed", bottom: 84, left: "1rem", right: "1rem" }
    : (() => {
        const r = popover.rect || {};
        const midX = (r.left || 0) + (r.width || 0) / 2;
        const clampedX = Math.min(Math.max(midX, 170), (window.innerWidth - 170));
        return {
          position: "fixed",
          left: clampedX,
          top: (r.top || 200) - 8,
          transform: "translate(-50%, -100%)",
          width: 296,
        };
      })();

  return (
    <motion.div
      ref={popoverRef}
      initial={{ opacity: 0, y: isMobile ? 14 : -8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: isMobile ? 14 : -8, scale: 0.96 }}
      transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
      style={{
        ...posStyle,
        zIndex: 500,
        background: "#fff",
        border: "1px solid rgba(0,0,0,0.09)",
        borderRadius: "0.875rem",
        boxShadow: "0 12px 40px rgba(0,0,0,0.13), 0 2px 8px rgba(0,0,0,0.07)",
        padding: "0.875rem",
        fontFamily: FONT,
      }}
      onClick={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
    >
      {/* Preview */}
      {popover.highlightedText ? (
        <div style={{
          fontSize: "0.7rem", color: "#8e8b82", marginBottom: "0.65rem",
          background: "#f8f8f5", borderRadius: "0.4rem", padding: "0.35rem 0.55rem",
          fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          &ldquo;{popover.highlightedText.slice(0, 55)}{popover.highlightedText.length > 55 ? "…" : ""}&rdquo;
        </div>
      ) : (
        <div style={{ fontSize: "0.7rem", color: "#b0aaa2", marginBottom: "0.65rem" }}>
          Section note
        </div>
      )}

      {/* Type toggle */}
      <div style={{ display: "flex", gap: 4, marginBottom: "0.65rem" }}>
        {(["note", "replace"] ).map(type => (
          <button
            key={type}
            onClick={() => setForm(f => ({ ...f, type }))}
            style={{
              flex: 1, padding: "0.3rem 0.5rem",
              border: `1.5px solid ${form.type === type ? BLUE : "#e2e8f0"}`,
              borderRadius: "0.5rem",
              background: form.type === type ? "rgba(29,78,216,0.07)" : "transparent",
              color: form.type === type ? BLUE : "#6b7280",
              fontSize: "0.76rem", fontWeight: 600,
              cursor: "pointer", fontFamily: FONT, transition: "all 0.12s",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
              {type === "note" ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                </svg>
              )}
              {type === "note" ? "Note" : "Replace"}
            </span>
          </button>
        ))}
      </div>

      {/* Input */}
      <textarea
        ref={inputRef}
        value={form.text}
        onChange={e => setForm(f => ({ ...f, text: e.target.value }))}
        onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onSave(); } }}
        placeholder={form.type === "note" ? "Add a note for Mentora…" : "Replace with…"}
        rows={3}
        style={{
          width: "100%", resize: "none",
          border: "1.5px solid #e2e8f0", borderRadius: "0.6rem",
          padding: "0.55rem 0.7rem",
          fontFamily: FONT, fontSize: "0.84rem", lineHeight: 1.5,
          color: "#141413", background: "#fafafa",
          outline: "none", boxSizing: "border-box",
          transition: "border-color 0.12s",
        }}
        onFocus={e => { e.target.style.borderColor = BLUE; }}
        onBlur={e => { e.target.style.borderColor = "#e2e8f0"; }}
      />
      <div style={{ fontSize: "0.66rem", color: "#c4bfb8", marginTop: "0.2rem", marginBottom: "0.65rem" }}>
        {isMobile ? "Tap Save to confirm" : "⌘↵ to save"}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: "0.4rem" }}>
        {isEditing && (
          <button
            onClick={onDelete}
            disabled={saving}
            title="Delete annotation"
            style={{
              padding: "0.45rem 0.55rem",
              border: "1.5px solid #fca5a5", borderRadius: "0.5rem",
              background: "transparent", color: "#ef4444",
              cursor: "pointer", display: "flex", alignItems: "center",
              transition: "background 0.12s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "#fef2f2"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
            </svg>
          </button>
        )}
        <button
          onClick={onClose}
          style={{
            flex: 1, padding: "0.45rem",
            border: "1.5px solid #e2e8f0", borderRadius: "0.5rem",
            background: "transparent", color: "#6b7280",
            fontSize: "0.82rem", fontWeight: 600, cursor: "pointer", fontFamily: FONT,
            transition: "background 0.12s",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "#f5f4f0"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={saving || !form.text.trim()}
          style={{
            flex: 2, padding: "0.45rem",
            border: "none", borderRadius: "0.5rem",
            background: form.text.trim() && !saving ? BLUE : "#93c5fd",
            color: "white", fontSize: "0.82rem", fontWeight: 700,
            cursor: form.text.trim() && !saving ? "pointer" : "not-allowed",
            fontFamily: FONT, transition: "background 0.12s",
          }}
        >
          {saving ? "Saving…" : isEditing ? "Update" : "Save"}
        </button>
      </div>
    </motion.div>
  );
}

// ─── Help Modal ───────────────────────────────────────────────────────────────

const HELP_STEPS = [
  {
    title: "What you're looking at",
    body: "Every section here is exactly what Mentora sees before each conversation — your profile, quests, research, and more.",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
      </svg>
    ),
    accent: "#1d4ed8",
    bg: "rgba(29,78,216,0.07)",
  },
  {
    title: "Select text to annotate",
    body: "On desktop, drag to highlight any text, then choose Note or Replace. On mobile, tap + Note on any section.",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
      </svg>
    ),
    accent: "#7c3aed",
    bg: "rgba(124,58,237,0.07)",
  },
  {
    title: "Notes vs. Replacements",
    body: "A Note adds context alongside the original — shown in yellow. A Replace swaps the text entirely — shown as strikethrough + correction in green.",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
      </svg>
    ),
    accent: "#0891b2",
    bg: "rgba(8,145,178,0.07)",
  },
  {
    title: "Edit or delete anytime",
    body: "Click any highlighted span to reopen its popover. Update the text or hit the trash icon to remove it.",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
      </svg>
    ),
    accent: "#dc2626",
    bg: "rgba(220,38,38,0.06)",
  },
  {
    title: "Live in every conversation",
    body: "Annotations are injected into Mentora's context immediately — no need to restart a chat.",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
      </svg>
    ),
    accent: "#059669",
    bg: "rgba(5,150,105,0.07)",
  },
];

function HelpModal({ onClose }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      style={{ position: "fixed", inset: 0, zIndex: 600, background: "rgba(15,23,42,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 12 }} animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 12 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        onClick={e => e.stopPropagation()}
        style={{
          background: "#faf9f5", borderRadius: "1.25rem",
          width: "100%", maxWidth: 440,
          boxShadow: "0 32px 72px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.06)",
          fontFamily: FONT, overflow: "hidden",
        }}
      >
        {/* Header band */}
        <div style={{
          background: BLUE, padding: "1.25rem 1.5rem",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <p style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.6)", marginBottom: "0.2rem" }}>
              Guide
            </p>
            <h2 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "1.45rem", fontWeight: 600, color: "#fff", lineHeight: 1.1, letterSpacing: "-0.01em" }}>
              How Context works
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.12)", border: "none", cursor: "pointer",
              color: "rgba(255,255,255,0.8)", padding: 8, borderRadius: "0.5rem",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "background 0.12s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.22)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.12)"; }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Steps */}
        <div style={{ padding: "1.25rem 1.5rem 1rem" }}>
          {HELP_STEPS.map(({ title, body, icon, accent, bg }, i) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2, delay: 0.05 + i * 0.055, ease: [0.22, 1, 0.36, 1] }}
              style={{ display: "flex", gap: "0.875rem", marginBottom: i < HELP_STEPS.length - 1 ? "0.75rem" : 0 }}
            >
              {/* Step number + icon column */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                <div style={{
                  width: 34, height: 34, borderRadius: "0.625rem",
                  background: bg, color: accent,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}>
                  {icon}
                </div>
                {i < HELP_STEPS.length - 1 && (
                  <div style={{ width: 1, flex: 1, minHeight: 10, background: "rgba(0,0,0,0.07)", marginTop: 4 }} />
                )}
              </div>

              {/* Content */}
              <div style={{ paddingBottom: i < HELP_STEPS.length - 1 ? "0.75rem" : 0 }}>
                <p style={{ fontWeight: 700, fontSize: "0.84rem", color: "#141413", marginBottom: "0.2rem", lineHeight: 1.3 }}>
                  {title}
                </p>
                <p style={{ fontSize: "0.79rem", color: "#6b7280", lineHeight: 1.6 }}>
                  {body}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: "0 1.5rem 1.5rem" }}>
          <button
            onClick={onClose}
            style={{
              width: "100%", padding: "0.75rem",
              background: "#141413", border: "none", borderRadius: "0.75rem",
              color: "white", fontWeight: 700, fontSize: "0.875rem",
              cursor: "pointer", fontFamily: FONT,
              transition: "background 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = BLUE; }}
            onMouseLeave={e => { e.currentTarget.style.background = "#141413"; }}
          >
            Got it
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────────

function ContextSkeleton() {
  const shimmer = {
    background: "linear-gradient(90deg, #e2e8f0 25%, #f1f5f9 50%, #e2e8f0 75%)",
    backgroundSize: "400px 100%",
    animation: "ctx-shimmer 1.5s infinite",
    borderRadius: "0.4rem",
  };
  return (
    <>
      <style>{`@keyframes ctx-shimmer { 0%{background-position:-400px 0} 100%{background-position:400px 0} }`}</style>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
        {[[50, 18, 18], [70, 18, 18, 18], [60, 18, 18]].map((heights, ci) => (
          <div key={ci} style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.06)", borderRadius: "0.875rem", padding: "0.875rem 1.125rem" }}>
            {heights.map((h, i) => (
              <div key={i} style={{ ...shimmer, height: h, width: i === 0 ? "28%" : "80%", marginBottom: i < heights.length - 1 ? 10 : 0 }} />
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
