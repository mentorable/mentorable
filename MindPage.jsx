import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import brainImg from "./components/brain_image.png";
import { supabase } from "./lib/supabase.js";
import { buildPromptSections, SECTION_LABELS } from "./lib/mentora.js";
import { getCache, setCache, getKnownUserId, setKnownUserId } from "./lib/cache.js";
import { SIDEBAR_WIDTH } from "./components/common/Sidebar.jsx";
import { useIsMobile } from "./hooks/useIsMobile.js";

// ─── Design tokens ────────────────────────────────────────────────────────────

const PAGE_BG   = "#faf9f5";
const ACCENT    = "#1d4ed8";
const FONT_HEAD = "'Space Grotesk', sans-serif";
const FONT_BODY = "'Plus Jakarta Sans', sans-serif";
const TEXT      = "#141413";
const MUTED     = "#6b7280";
const BORDER    = "rgba(37,99,235,0.1)";

function hexToRgb(hex) {
  return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)].join(",");
}

// ─── Lobe configuration ───────────────────────────────────────────────────────

const LOBES = {
  core:      { label: "Core",      subtitle: "Who you are",               color: "#1d4ed8", sections: ["student_profile","summary","strengths","growth_areas","interests","work_style","career_matches"] },
  drive:     { label: "Drive",     subtitle: "Your path forward",         color: "#2563eb", sections: ["active_quests","completed_quests","dismissed_quests"] },
  curiosity: { label: "Curiosity", subtitle: "What you explore",          color: "#3b82f6", sections: ["recent_research","chat_topics"] },
  voice:     { label: "Voice",     subtitle: "How Mentora speaks to you", color: "#60a5fa", sections: ["agent_instructions"] },
};

// ─── Brain image quadrant config ─────────────────────────────────────────────
// brain_image.png is already split into 4 color zones (top-left view):
//   Core (TL, dark blue) · Drive (TR, light blue) ·
//   Curiosity (BL, medium blue) · Voice (BR, periwinkle)

// ─── Brain image component ────────────────────────────────────────────────────
// Uses brain_image.png exactly as-is. Overlays 4 transparent quadrant regions
// for interaction. Dims non-selected quadrants with a page-colored veil.
//
// Quadrant → lobe mapping (matches the 4 colors already in the image):
//   TL (dark blue)    → Core      TR (light cyan) → Drive
//   BL (medium blue)  → Curiosity BR (periwinkle)  → Voice

function BrainSVG({ selected, hovered, onLobeClick, onLobeHover, mini = false }) {
  const size = mini ? 130 : 420;

  // Which quadrant each lobe occupies
  const isRight = (id) => id === "drive" || id === "voice";
  const isBot   = (id) => id === "curiosity" || id === "voice";

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      {/* The actual image — untouched */}
      <img
        src={brainImg}
        alt="Brain"
        draggable={false}
        style={{ width: "100%", height: "100%", objectFit: "contain", display: "block",
                 userSelect: "none", pointerEvents: "none" }}
      />

      {/* Dim overlay on each non-selected quadrant */}
      {Object.keys(LOBES).map((id) => {
        const isDimmed = !!selected && selected !== id;
        if (!isDimmed) return null;
        return (
          <div key={`dim-${id}`} style={{
            position: "absolute",
            top:    isBot(id)   ? "50%" : "0",
            left:   isRight(id) ? "50%" : "0",
            width:  "50%", height: "50%",
            background: `${PAGE_BG}cc`,  // page off-white at ~80% opacity
            pointerEvents: "none",
            transition: "background 0.22s",
          }} />
        );
      })}

      {/* Clickable quadrant regions */}
      {Object.keys(LOBES).map((id) => (
        <div key={id} style={{
          position: "absolute",
          top:    isBot(id)   ? "50%" : "0",
          left:   isRight(id) ? "50%" : "0",
          width:  "50%", height: "50%",
          cursor: "pointer",
        }}
          onClick={() => onLobeClick(id)}
          onMouseEnter={() => onLobeHover(id)}
          onMouseLeave={() => onLobeHover(null)}
        />
      ))}

      {/* Lobe labels — full size only */}
      {!mini && Object.entries(LOBES).map(([id, lobe]) => {
        const isDimmed = !!selected && selected !== id;
        return (
          <div key={`lbl-${id}`} style={{
            position: "absolute",
            top:       isBot(id)   ? "72%" : "28%",
            left:      isRight(id) ? "75%" : "25%",
            transform: "translate(-50%, -50%)",
            textAlign: "center",
            pointerEvents: "none",
            opacity: isDimmed ? 0.12 : 1,
            transition: "opacity 0.22s",
          }}>
            <div style={{
              fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 14, color: "#fff", lineHeight: 1.1,
              textShadow: "0 1px 5px rgba(0,0,0,0.85), 0 0 12px rgba(0,0,0,0.4)",
            }}>
              {lobe.label}
            </div>
            <div style={{
              fontFamily: FONT_BODY, fontSize: 9.5, color: "rgba(255,255,255,0.82)",
              textShadow: "0 1px 4px rgba(0,0,0,0.8)", marginTop: 3,
            }}>
              {lobe.subtitle}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Markdown renderer ────────────────────────────────────────────────────────

function renderInline(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : part
  );
}

function MarkdownContent({ text, color, strikethrough }) {
  const lines = (text || "").split("\n");
  const els = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("## ")) {
      els.push(
        <div key={i} style={{
          fontFamily: FONT_HEAD, fontWeight: 700, fontSize: "0.7rem",
          color: strikethrough ? "#9ca3af" : color || MUTED,
          textTransform: "uppercase", letterSpacing: "0.07em",
          marginTop: els.length ? 12 : 0, marginBottom: 6,
          textDecoration: strikethrough ? "line-through" : "none",
        }}>
          {line.slice(3)}
        </div>
      );
    } else if (line.startsWith("- ")) {
      els.push(
        <div key={i} style={{
          display: "flex", gap: 8, lineHeight: 1.65,
          fontFamily: FONT_BODY, fontSize: "0.82rem", color: strikethrough ? "#d1d5db" : "#374151",
          textDecoration: strikethrough ? "line-through" : "none",
        }}>
          <span style={{ color: MUTED, flexShrink: 0, marginTop: 1 }}>•</span>
          <span>{renderInline(line.slice(2))}</span>
        </div>
      );
    } else if (line.trim() === "") {
      if (els.length > 0) els.push(<div key={i} style={{ height: 6 }} />);
    } else {
      els.push(
        <div key={i} style={{
          lineHeight: 1.65, fontFamily: FONT_BODY, fontSize: "0.82rem",
          color: strikethrough ? "#d1d5db" : "#374151",
          textDecoration: strikethrough ? "line-through" : "none",
        }}>
          {renderInline(line)}
        </div>
      );
    }
    i++;
  }
  return <>{els}</>;
}

// ─── Icons ────────────────────────────────────────────────────────────────────

const IconAnnotate = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);
const IconExclude = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
  </svg>
);
const IconRestore = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.01"/>
  </svg>
);
const IconClose = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

// ─── Icon button ──────────────────────────────────────────────────────────────

function IconBtn({ icon, label, color, onClick }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick} title={label}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        display: "flex", alignItems: "center", gap: 5,
        padding: "5px 11px", borderRadius: 7, cursor: "pointer",
        border: `1px solid ${hov ? (color || ACCENT) + "50" : BORDER}`,
        background: hov ? `rgba(${hexToRgb(color || ACCENT)},0.07)` : "transparent",
        color: hov ? color : MUTED,
        fontFamily: FONT_BODY, fontSize: "0.73rem", fontWeight: 500,
        transition: "all 0.12s",
      }}
    >
      {icon} {label}
    </button>
  );
}

// ─── Section card ─────────────────────────────────────────────────────────────

function SectionCard({ section, lobeColor, isExcluded, annotation, onToggleExclude, onSaveAnnotation }) {
  const [hov, setHov]         = useState(false);
  const [editing, setEditing] = useState(false);
  const [text, setText]       = useState(annotation || "");
  const rgb = hexToRgb(lobeColor);

  return (
    <div
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        background: "#fff",
        borderRadius: 12,
        border: `1px solid ${isExcluded ? "rgba(239,68,68,0.15)" : BORDER}`,
        borderLeft: `4px solid ${isExcluded ? "#fca5a5" : lobeColor}`,
        padding: "16px 20px",
        opacity: isExcluded ? 0.55 : 1,
        boxShadow: hov && !isExcluded ? `0 4px 20px rgba(${rgb},0.1)` : "0 1px 4px rgba(15,23,42,0.05)",
        transition: "box-shadow 0.2s, opacity 0.2s",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            fontFamily: FONT_HEAD, fontWeight: 700, fontSize: "0.72rem",
            color: isExcluded ? "#9ca3af" : lobeColor,
            textTransform: "uppercase", letterSpacing: "0.07em",
          }}>
            {SECTION_LABELS[section.id] || section.id}
          </span>
          {isExcluded && <span style={{ fontFamily: FONT_BODY, fontSize: "0.68rem", fontWeight: 500, color: "#ef4444", background: "rgba(239,68,68,0.08)", padding: "1px 7px", borderRadius: 999 }}>excluded</span>}
          {annotation && !isExcluded && <span style={{ fontFamily: FONT_BODY, fontSize: "0.68rem", fontWeight: 500, color: lobeColor, background: `rgba(${rgb},0.1)`, padding: "1px 7px", borderRadius: 999 }}>annotated</span>}
        </div>
        <div style={{ opacity: (hov || isExcluded || annotation) ? 1 : 0, display: "flex", gap: 6, transition: "opacity 0.15s" }}>
          {!isExcluded && (
            <IconBtn icon={<IconAnnotate />} label="Note" color={lobeColor}
              onClick={() => { setText(annotation || ""); setEditing(true); }} />
          )}
          <IconBtn
            icon={isExcluded ? <IconRestore /> : <IconExclude />}
            label={isExcluded ? "Restore" : "Exclude"}
            color={isExcluded ? "#ef4444" : MUTED}
            onClick={() => onToggleExclude(section.id)}
          />
        </div>
      </div>

      {/* Content — rendered markdown */}
      <MarkdownContent text={section.content} color={lobeColor} strikethrough={isExcluded} />

      {/* Annotation display */}
      {annotation && !editing && !isExcluded && (
        <div style={{
          marginTop: 14, padding: "10px 14px",
          background: `rgba(${rgb},0.07)`, borderRadius: 8, borderLeft: `2px solid ${lobeColor}`,
          display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8,
        }}>
          <p style={{ margin: 0, fontFamily: FONT_BODY, fontSize: "0.8rem", color: "#374151", lineHeight: 1.5 }}>
            <span style={{ color: lobeColor, fontWeight: 700 }}>Your note: </span>{annotation}
          </p>
          <button onClick={() => onSaveAnnotation(section.id, "")}
            style={{ background: "none", border: "none", cursor: "pointer", color: lobeColor, opacity: 0.6, padding: 2, flexShrink: 0 }}>
            <IconClose />
          </button>
        </div>
      )}

      {/* Edit annotation */}
      <AnimatePresence>
        {editing && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            style={{ overflow: "hidden", marginTop: 12 }}>
            <textarea
              autoFocus value={text} onChange={e => setText(e.target.value)}
              placeholder="Add a note Mentora will see alongside this section…"
              rows={3}
              style={{
                width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 8,
                border: `1.5px solid ${lobeColor}60`,
                background: `rgba(${rgb},0.04)`,
                fontFamily: FONT_BODY, fontSize: "0.82rem", lineHeight: 1.5,
                color: TEXT, resize: "vertical", outline: "none",
              }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button onClick={() => { onSaveAnnotation(section.id, text); setEditing(false); }}
                style={{ padding: "7px 18px", borderRadius: 8, background: lobeColor, color: "#fff", border: "none", cursor: "pointer", fontFamily: FONT_BODY, fontSize: "0.82rem", fontWeight: 600 }}>
                Save
              </button>
              <button onClick={() => setEditing(false)}
                style={{ padding: "7px 14px", borderRadius: 8, background: "transparent", color: MUTED, border: `1px solid ${BORDER}`, cursor: "pointer", fontFamily: FONT_BODY, fontSize: "0.82rem" }}>
                Cancel
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message }) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0, y: -12, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.95 }}
          transition={{ duration: 0.18 }}
          style={{
            position: "fixed", top: 20, right: 24, zIndex: 9999,
            background: "#111827", color: "#fff",
            padding: "10px 18px", borderRadius: 10,
            fontFamily: FONT_BODY, fontSize: "0.82rem", fontWeight: 500,
            boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
            display: "flex", alignItems: "center", gap: 8,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── CSS ──────────────────────────────────────────────────────────────────────

const CSS = `
@keyframes brain-float {
  0%,100% { transform: translateY(0px);   filter: drop-shadow(0 14px 44px rgba(29,78,216,0.24)) drop-shadow(0 4px 12px rgba(0,0,0,0.08)); }
  50%      { transform: translateY(-7px); filter: drop-shadow(0 22px 56px rgba(29,78,216,0.34)) drop-shadow(0 8px 20px rgba(0,0,0,0.1)); }
}
.brain-float { animation: brain-float 4.2s ease-in-out infinite; }
`;

// ─── Main page ────────────────────────────────────────────────────────────────

export default function MindPage({ navigate }) {
  const isMobile = useIsMobile();
  const [loading, setLoading]     = useState(true);
  const [userId, setUserId]       = useState(null);
  const [sections, setSections]   = useState([]);
  const [mindNotes, setMindNotes] = useState([]);
  const [selected, setSelected]   = useState(null);
  const [hovered, setHovered]     = useState(null);
  const [toast, setToast]         = useState(null);

  const showToast = useCallback(msg => {
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
        setMindNotes(profile.mind_notes || []);
        const completedQuests    = quests.filter(q => q.status === "completed");
        const activeQuests       = quests.filter(q => ["in_progress","considered"].includes(q.status));
        const deletedQuestTitles = quests.filter(q => q.status === "deleted").map(q => q.title);
        const recentResearch     = research.map(r => r.query).filter(Boolean);
        const chatTopics         = chats.map(c => {
          if (c.title) return c.title;
          const m = c.messages?.find(x => x.role === "user");
          return m?.content?.split("\n")[0]?.slice(0, 60) || null;
        }).filter(Boolean);
        setSections(buildPromptSections(profile, { completedQuests, activeQuests, deletedQuestTitles, recentResearch, chatTopics }));
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
    const excluded = mindNotes.some(n => n.type === "deletion" && n.section_id === sectionId);
    await persistNotes(
      excluded
        ? mindNotes.filter(n => !(n.type === "deletion" && n.section_id === sectionId))
        : [...mindNotes, { id: crypto.randomUUID(), type: "deletion", section_id: sectionId, created_at: new Date().toISOString() }]
    );
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

  const deletedIds    = useMemo(() => new Set(mindNotes.filter(n => n.type === "deletion").map(n => n.section_id)), [mindNotes]);
  const annotationMap = useMemo(() => Object.fromEntries(mindNotes.filter(n => n.type === "annotation").map(n => [n.section_id, n.content])), [mindNotes]);

  const selectedLobe    = selected ? LOBES[selected] : null;
  const visibleSections = selected ? sections.filter(s => LOBES[selected].sections.includes(s.id)) : [];

  const ml = isMobile ? 0 : SIDEBAR_WIDTH;
  const pb = isMobile ? 80 : 0;

  const brainW = isMobile ? 320 : Math.min(420, (window?.innerWidth || 900) - SIDEBAR_WIDTH - 80);
  const brainH = brainW; // image is square

  return (
    <div style={{ marginLeft: ml, minHeight: "100vh", background: PAGE_BG, paddingBottom: pb }}>
      <style>{CSS}</style>
      <Toast message={toast} />

      <AnimatePresence mode="wait">

        {/* ── IDLE: full brain centered ── */}
        {!selected && (
          <motion.div key="idle"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            style={{
              minHeight: "100vh",
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              padding: "40px 32px",
            }}
          >
            <div style={{ textAlign: "center", marginBottom: 48 }}>
              <h1 style={{
                margin: "0 0 12px",
                fontFamily: FONT_HEAD, fontWeight: 800,
                fontSize: isMobile ? "2.8rem" : "4rem",
                color: TEXT, letterSpacing: "-0.05em", lineHeight: 1,
              }}>
                Mind
              </h1>
              <p style={{
                margin: 0, fontFamily: FONT_BODY,
                fontSize: isMobile ? "0.95rem" : "1.05rem",
                color: MUTED, lineHeight: 1.5, maxWidth: 420,
              }}>
                {loading ? "Loading your context…" : "Click a region to explore what Mentora knows about you"}
              </p>
            </div>

            {loading ? (
              <div style={{
                width: brainW, height: brainH,
                background: "linear-gradient(135deg, rgba(59,130,246,0.1), rgba(29,78,216,0.05))",
                borderRadius: "46% 54% 50% 50% / 40% 40% 60% 60%",
                animation: "brain-float 3s ease-in-out infinite",
              }} />
            ) : (
              <div className="brain-float" style={{ cursor: "default", width: brainW }}>
                <BrainSVG
                  selected={null} hovered={hovered}
                  onLobeClick={id => setSelected(id)}
                  onLobeHover={setHovered}
                  mini={false}
                />
              </div>
            )}

            {!loading && (
              <p style={{
                marginTop: 32, fontFamily: FONT_BODY, fontSize: "0.82rem",
                color: "rgba(107,114,128,0.55)", letterSpacing: "0.02em",
              }}>
                4 regions · {sections.length} context sections
              </p>
            )}
          </motion.div>
        )}

        {/* ── SELECTED: mini brain + cards ── */}
        {selected && selectedLobe && (
          <motion.div key={`sel-${selected}`}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            style={{ minHeight: "100vh" }}
          >
            {/* Sticky header */}
            <div style={{
              display: "flex", alignItems: "center",
              gap: isMobile ? 14 : 24,
              padding: isMobile ? "14px 16px" : "18px 40px",
              borderBottom: `1px solid ${BORDER}`,
              background: PAGE_BG,
              position: "sticky", top: 0, zIndex: 20,
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
            }}>
              <div style={{ flexShrink: 0, filter: "drop-shadow(0 4px 16px rgba(29,78,216,0.2))" }}>
                <BrainSVG
                  selected={selected} hovered={hovered}
                  onLobeClick={id => setSelected(id)}
                  onLobeHover={setHovered}
                  mini={true}
                />
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{
                  margin: "0 0 3px",
                  fontFamily: FONT_HEAD, fontWeight: 800,
                  fontSize: isMobile ? "1.7rem" : "2.1rem",
                  color: selectedLobe.color, letterSpacing: "-0.04em", lineHeight: 1,
                }}>
                  {selectedLobe.label}
                </h2>
                <p style={{ margin: 0, fontFamily: FONT_BODY, fontSize: "0.88rem", color: MUTED }}>
                  {selectedLobe.subtitle}
                </p>
              </div>

              <button onClick={() => setSelected(null)} style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "8px 16px", borderRadius: 9, flexShrink: 0,
                background: "transparent", color: MUTED,
                border: `1px solid ${BORDER}`, cursor: "pointer",
                fontFamily: FONT_BODY, fontSize: "0.85rem", fontWeight: 500,
              }}>
                ← All
              </button>
            </div>

            {/* Section cards */}
            <div style={{
              maxWidth: 760, margin: "0 auto",
              padding: isMobile ? "24px 16px" : "32px 40px",
            }}>
              {visibleSections.length === 0 ? (
                <div style={{ textAlign: "center", padding: "60px 0", color: MUTED, fontFamily: FONT_BODY, fontSize: "0.95rem" }}>
                  No context here yet — keep using Mentorable to build this up.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {visibleSections.map((section, i) => (
                    <motion.div key={section.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.06, duration: 0.24 }}
                    >
                      <SectionCard
                        section={section}
                        lobeColor={selectedLobe.color}
                        isExcluded={deletedIds.has(section.id)}
                        annotation={annotationMap[section.id] || null}
                        onToggleExclude={handleToggleExclude}
                        onSaveAnnotation={handleSaveAnnotation}
                      />
                    </motion.div>
                  ))}
                </div>
              )}

              <p style={{ marginTop: 32, textAlign: "center", fontFamily: FONT_BODY, fontSize: "0.78rem", color: "rgba(107,114,128,0.5)" }}>
                Changes take effect in your next chat with Mentora.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
