import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "./lib/supabase.js";
import { buildPromptSections, SECTION_LABELS } from "./lib/mentora.js";
import { getCache, setCache, getKnownUserId, setKnownUserId } from "./lib/cache.js";
import { SIDEBAR_WIDTH } from "./components/common/Sidebar.jsx";
import { useIsMobile } from "./hooks/useIsMobile.js";

const FONT_HEAD = "'Space Grotesk', sans-serif";
const FONT_BODY = "'Plus Jakarta Sans', sans-serif";
const FONT_MONO = "'JetBrains Mono', 'Fira Mono', monospace";
const ACCENT    = "#1d4ed8";
const BG        = "#faf9f5";
const CARD_BG   = "#ffffff";
const BORDER    = "rgba(37,99,235,0.1)";
const TEXT      = "#1a1a1a";
const MUTED     = "#6b7280";

// ─── Icons ────────────────────────────────────────────────────────────────────

const IconAnnotate = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);

const IconExclude = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
  </svg>
);

const IconRestore = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1 4 1 10 7 10"/>
    <path d="M3.51 15a9 9 0 1 0 .49-3.01"/>
  </svg>
);

const IconClose = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

const IconBrain = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-1.07-3.33A3 3 0 0 1 4.46 8.1a3 3 0 0 1 .5-5.6A2.5 2.5 0 0 1 9.5 2Z"/>
    <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 1.07-3.33A3 3 0 0 0 19.54 8.1a3 3 0 0 0-.5-5.6A2.5 2.5 0 0 0 14.5 2Z"/>
  </svg>
);

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message }) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0, y: -8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0,  scale: 1 }}
          exit={{   opacity: 0, y: -8, scale: 0.96 }}
          transition={{ duration: 0.18 }}
          style={{
            position: "fixed", top: 20, right: 24, zIndex: 9999,
            background: "#111827", color: "#fff",
            padding: "10px 18px", borderRadius: 10,
            fontFamily: FONT_BODY, fontSize: "0.82rem", fontWeight: 500,
            boxShadow: "0 4px 20px rgba(0,0,0,0.22)",
            display: "flex", alignItems: "center", gap: 8,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Section card ─────────────────────────────────────────────────────────────

function SectionCard({ section, isExcluded, annotation, onToggleExclude, onSaveAnnotation }) {
  const [hovering, setHovering] = useState(false);
  const [editing, setEditing]   = useState(false);
  const [text, setText]         = useState(annotation || "");

  const handleEditOpen = () => {
    setText(annotation || "");
    setEditing(true);
  };
  const handleSave = () => {
    onSaveAnnotation(section.id, text);
    setEditing(false);
  };
  const handleCancel = () => {
    setText(annotation || "");
    setEditing(false);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      style={{
        background: CARD_BG,
        border: `1px solid ${isExcluded ? "rgba(239,68,68,0.2)" : BORDER}`,
        borderRadius: 14,
        padding: "18px 20px",
        opacity: isExcluded ? 0.55 : 1,
        transition: "opacity 0.2s, border-color 0.2s",
        boxShadow: "0 1px 4px rgba(15,23,42,0.05)",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            fontFamily: FONT_HEAD, fontWeight: 700, fontSize: "0.78rem",
            color: isExcluded ? "#ef4444" : ACCENT,
            textTransform: "uppercase", letterSpacing: "0.06em",
          }}>
            {SECTION_LABELS[section.id] || section.id}
          </span>
          {isExcluded && (
            <span style={{
              fontFamily: FONT_BODY, fontSize: "0.72rem", fontWeight: 500,
              color: "#ef4444", background: "rgba(239,68,68,0.08)",
              padding: "2px 8px", borderRadius: 999,
            }}>
              excluded
            </span>
          )}
          {annotation && !isExcluded && (
            <span style={{
              fontFamily: FONT_BODY, fontSize: "0.72rem", fontWeight: 500,
              color: "#0369a1", background: "rgba(3,105,161,0.08)",
              padding: "2px 8px", borderRadius: 999,
            }}>
              annotated
            </span>
          )}
        </div>

        {/* Action buttons — visible on hover or when section is non-default */}
        <div style={{
          display: "flex", gap: 6,
          opacity: (hovering || isExcluded || annotation) ? 1 : 0,
          transition: "opacity 0.15s",
        }}>
          {!isExcluded && (
            <button
              onClick={handleEditOpen}
              title="Add note"
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "5px 10px", borderRadius: 7, border: `1px solid ${BORDER}`,
                background: "transparent", cursor: "pointer",
                color: MUTED, fontFamily: FONT_BODY, fontSize: "0.75rem", fontWeight: 500,
                transition: "background 0.12s, color 0.12s",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(37,99,235,0.06)"; e.currentTarget.style.color = ACCENT; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = MUTED; }}
            >
              <IconAnnotate /> Note
            </button>
          )}
          <button
            onClick={() => onToggleExclude(section.id)}
            title={isExcluded ? "Restore to context" : "Remove from context"}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "5px 10px", borderRadius: 7, border: `1px solid ${isExcluded ? "rgba(239,68,68,0.3)" : BORDER}`,
              background: isExcluded ? "rgba(239,68,68,0.06)" : "transparent", cursor: "pointer",
              color: isExcluded ? "#ef4444" : MUTED,
              fontFamily: FONT_BODY, fontSize: "0.75rem", fontWeight: 500,
              transition: "background 0.12s, color 0.12s",
            }}
            onMouseEnter={e => {
              if (!isExcluded) { e.currentTarget.style.background = "rgba(239,68,68,0.06)"; e.currentTarget.style.color = "#ef4444"; }
            }}
            onMouseLeave={e => {
              if (!isExcluded) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = MUTED; }
            }}
          >
            {isExcluded ? <><IconRestore /> Restore</> : <><IconExclude /> Exclude</>}
          </button>
        </div>
      </div>

      {/* Content */}
      <pre style={{
        fontFamily: FONT_MONO, fontSize: "0.78rem", lineHeight: 1.65,
        color: isExcluded ? "#9ca3af" : TEXT,
        whiteSpace: "pre-wrap", wordBreak: "break-word",
        margin: 0, padding: 0,
        textDecoration: isExcluded ? "line-through" : "none",
      }}>
        {section.content}
      </pre>

      {/* Existing annotation */}
      {annotation && !editing && !isExcluded && (
        <div style={{
          marginTop: 12, padding: "10px 14px",
          background: "rgba(3,105,161,0.06)", borderRadius: 8,
          borderLeft: "3px solid #0369a1",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <p style={{ margin: 0, fontFamily: FONT_BODY, fontSize: "0.8rem", color: "#0369a1", lineHeight: 1.5 }}>
              <strong>Your note:</strong> {annotation}
            </p>
            <button
              onClick={() => onSaveAnnotation(section.id, "")}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#0369a1", opacity: 0.6, padding: 2, flexShrink: 0 }}
              title="Remove note"
            >
              <IconClose />
            </button>
          </div>
        </div>
      )}

      {/* Edit annotation */}
      <AnimatePresence>
        {editing && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{   opacity: 0, height: 0 }}
            style={{ overflow: "hidden", marginTop: 12 }}
          >
            <textarea
              autoFocus
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Add a note that Mentora will see alongside this section…"
              rows={3}
              style={{
                width: "100%", boxSizing: "border-box",
                padding: "10px 12px", borderRadius: 8,
                border: `1.5px solid rgba(3,105,161,0.4)`,
                background: "rgba(3,105,161,0.04)",
                fontFamily: FONT_BODY, fontSize: "0.82rem", lineHeight: 1.5,
                color: TEXT, resize: "vertical", outline: "none",
              }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button
                onClick={handleSave}
                style={{
                  padding: "6px 16px", borderRadius: 7,
                  background: ACCENT, color: "#fff", border: "none", cursor: "pointer",
                  fontFamily: FONT_BODY, fontSize: "0.8rem", fontWeight: 600,
                }}
              >
                Save note
              </button>
              <button
                onClick={handleCancel}
                style={{
                  padding: "6px 14px", borderRadius: 7,
                  background: "transparent", color: MUTED,
                  border: `1px solid ${BORDER}`, cursor: "pointer",
                  fontFamily: FONT_BODY, fontSize: "0.8rem",
                }}
              >
                Cancel
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard({ h = 80 }) {
  return (
    <div style={{
      border: `1px solid ${BORDER}`, borderRadius: 14,
      padding: "18px 20px", height: h,
      background: "linear-gradient(90deg, #f0f0ee 25%, #e8e7e3 50%, #f0f0ee 75%)",
      backgroundSize: "200% 100%",
      animation: "shimmer 1.4s infinite",
    }} />
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function MindPage({ navigate }) {
  const isMobile  = useIsMobile();
  const [loading, setLoading]   = useState(true);
  const [userId, setUserId]     = useState(null);
  const [sections, setSections] = useState([]);
  const [mindNotes, setMindNotes] = useState([]);
  const [toast, setToast]       = useState(null);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data?.user) { navigate("/auth"); return; }
      const uid = data.user.id;
      setUserId(uid);
      setKnownUserId(uid);

      const [profileRes, questsRes, researchRes, chatsRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", uid).single(),
        supabase.from("quest_items").select("title, category, status, completed_at").eq("user_id", uid),
        supabase.from("research_sessions").select("query").eq("user_id", uid).order("created_at", { ascending: false }).limit(10),
        supabase.from("chat_sessions").select("id, title, messages").eq("user_id", uid).order("updated_at", { ascending: false }).limit(10),
      ]);

      const profile  = profileRes.data;
      const quests   = questsRes.data   || [];
      const research = researchRes.data || [];
      const chats    = chatsRes.data    || [];

      if (profile) {
        setCache(`profile:${uid}`, profile);
        const notes = profile.mind_notes || [];
        setMindNotes(notes);

        const completedQuests    = quests.filter(q => q.status === "completed");
        const activeQuests       = quests.filter(q => ["in_progress", "considered"].includes(q.status));
        const deletedQuestTitles = quests.filter(q => q.status === "deleted").map(q => q.title);
        const recentResearch     = research.map(r => r.query).filter(Boolean);
        const chatTopics         = chats.map(c => {
          if (c.title) return c.title;
          const first = c.messages?.find(m => m.role === "user");
          return first?.content?.split("\n")[0]?.slice(0, 60) || null;
        }).filter(Boolean);

        setSections(buildPromptSections(profile, {
          completedQuests, activeQuests, deletedQuestTitles, recentResearch, chatTopics,
        }));
      }

      setLoading(false);
    });
  }, []);

  const persistNotes = useCallback(async (updated) => {
    if (!userId) return;
    setMindNotes(updated);
    await supabase.from("profiles").update({ mind_notes: updated }).eq("id", userId);
    showToast("Context updated");
  }, [userId, showToast]);

  const handleToggleExclude = useCallback(async (sectionId) => {
    const alreadyExcluded = mindNotes.some(n => n.type === "deletion" && n.section_id === sectionId);
    const updated = alreadyExcluded
      ? mindNotes.filter(n => !(n.type === "deletion" && n.section_id === sectionId))
      : [...mindNotes, { id: crypto.randomUUID(), type: "deletion", section_id: sectionId, created_at: new Date().toISOString() }];
    await persistNotes(updated);
  }, [mindNotes, persistNotes]);

  const handleSaveAnnotation = useCallback(async (sectionId, text) => {
    const existing = mindNotes.find(n => n.type === "annotation" && n.section_id === sectionId);
    let updated;
    if (!text.trim()) {
      updated = mindNotes.filter(n => !(n.type === "annotation" && n.section_id === sectionId));
    } else if (existing) {
      updated = mindNotes.map(n => n.type === "annotation" && n.section_id === sectionId ? { ...n, content: text.trim() } : n);
    } else {
      updated = [...mindNotes, { id: crypto.randomUUID(), type: "annotation", section_id: sectionId, content: text.trim(), created_at: new Date().toISOString() }];
    }
    await persistNotes(updated);
  }, [mindNotes, persistNotes]);

  const deletedIds    = new Set(mindNotes.filter(n => n.type === "deletion").map(n => n.section_id));
  const annotationMap = Object.fromEntries(mindNotes.filter(n => n.type === "annotation").map(n => [n.section_id, n.content]));

  const ml = isMobile ? 0 : SIDEBAR_WIDTH;
  const pb = isMobile ? 80 : 0;

  return (
    <div style={{ marginLeft: ml, minHeight: "100vh", background: BG, paddingBottom: pb }}>
      <style>{`
        @keyframes shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      <Toast message={toast} />

      {/* Header */}
      <div style={{
        padding: isMobile ? "28px 20px 16px" : "40px 40px 20px",
        borderBottom: `1px solid ${BORDER}`,
        background: BG,
      }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <div style={{ color: ACCENT, opacity: 0.85 }}>
              <IconBrain />
            </div>
            <h1 style={{ margin: 0, fontFamily: FONT_HEAD, fontWeight: 800, fontSize: isMobile ? "1.5rem" : "1.75rem", color: TEXT, letterSpacing: "-0.03em" }}>
              Mind
            </h1>
          </div>
          <p style={{ margin: 0, fontFamily: FONT_BODY, fontSize: "0.9rem", color: MUTED, lineHeight: 1.5 }}>
            Everything Mentora uses as context — exactly as it appears in her prompt. Exclude or annotate any section.
          </p>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 720, margin: "0 auto", padding: isMobile ? "20px 16px" : "28px 40px" }}>
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {[100, 80, 70, 90, 75, 85].map((h, i) => <SkeletonCard key={i} h={h} />)}
          </div>
        ) : sections.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: MUTED, fontFamily: FONT_BODY, fontSize: "0.9rem" }}>
            No context found. Complete onboarding to see your profile here.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {sections.map(section => (
              <SectionCard
                key={section.id}
                section={section}
                isExcluded={deletedIds.has(section.id)}
                annotation={annotationMap[section.id] || null}
                onToggleExclude={handleToggleExclude}
                onSaveAnnotation={handleSaveAnnotation}
              />
            ))}
          </div>
        )}

        {/* Footer note */}
        {!loading && sections.length > 0 && (
          <p style={{
            marginTop: 28, textAlign: "center",
            fontFamily: FONT_BODY, fontSize: "0.76rem", color: "#9ca3af", lineHeight: 1.6,
          }}>
            Changes take effect in your next chat with Mentora.
            Excluded sections are hidden from her — she won't reference that info.
          </p>
        )}
      </div>
    </div>
  );
}
