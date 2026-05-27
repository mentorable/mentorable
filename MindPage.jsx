import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "./lib/supabase.js";
import { buildPromptSections, SECTION_LABELS } from "./lib/mentora.js";
import { getCache, setCache, getKnownUserId, setKnownUserId } from "./lib/cache.js";
import { SIDEBAR_WIDTH } from "./components/common/Sidebar.jsx";
import { useIsMobile } from "./hooks/useIsMobile.js";

// ─── Design tokens ────────────────────────────────────────────────────────────

const PAGE_BG   = "#06091a";
const FONT_HEAD = "'Space Grotesk', sans-serif";
const FONT_BODY = "'Plus Jakarta Sans', sans-serif";
const FONT_MONO = "'JetBrains Mono', 'Fira Mono', 'Courier New', monospace";
const TEXT      = "rgba(255,255,255,0.88)";
const MUTED     = "rgba(255,255,255,0.40)";

function hexToRgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ].join(",");
}

// ─── Lobe config ──────────────────────────────────────────────────────────────

const LOBES = {
  core: {
    label: "Core",
    subtitle: "Who you are",
    color: "#4a7aed",
    sections: ["student_profile", "summary", "strengths", "growth_areas", "interests", "work_style", "career_matches"],
  },
  drive: {
    label: "Drive",
    subtitle: "Your path forward",
    color: "#6290f2",
    sections: ["active_quests", "completed_quests", "dismissed_quests"],
  },
  curiosity: {
    label: "Curiosity",
    subtitle: "What you explore",
    color: "#7ab0f8",
    sections: ["recent_research", "chat_topics"],
  },
  voice: {
    label: "Voice",
    subtitle: "How Mentora speaks to you",
    color: "#98c4fb",
    sections: ["agent_instructions"],
  },
};

// ─── Brain SVG paths ──────────────────────────────────────────────────────────

const BRAIN_OUTLINE = "M 200,38 C 228,32 268,38 296,58 C 324,78 344,108 350,142 C 356,176 350,210 336,238 C 322,266 298,284 272,290 C 254,294 236,296 220,297 L 212,300 205,305 200,308 L 195,305 188,300 180,297 C 164,296 146,294 128,290 C 102,284 78,266 64,238 C 50,210 44,176 50,142 C 56,108 76,78 104,58 C 132,38 172,32 200,38 Z";
const BRAIN_STEM   = "M 188,297 C 186,304 185,314 194,320 C 200,323 206,320 212,314 C 217,308 216,300 212,297 Z";
const FISSURE_V    = "M 200,40 C 200,70 199,105 200,138 C 200,170 200,200 200,230 C 200,255 200,275 200,294";
const FISSURE_H    = "M 52,170 C 90,164 145,160 200,160 C 255,160 310,164 348,170";
const GYRI = [
  "M 68,148 C 82,132 100,120 122,115",
  "M 54,194 C 72,178 94,166 118,162",
  "M 66,232 C 84,220 104,212 128,208",
  "M 332,148 C 318,132 300,120 278,115",
  "M 346,194 C 328,178 306,166 282,162",
  "M 334,232 C 316,220 296,212 272,208",
];

const LOBE_RECTS = {
  core:      { x: 0,   y: 0,   w: 200, h: 165 },
  drive:     { x: 200, y: 0,   w: 200, h: 165 },
  curiosity: { x: 0,   y: 165, w: 200, h: 155 },
  voice:     { x: 200, y: 165, w: 200, h: 155 },
};

const LOBE_LABEL_POS = {
  core:      { x: 118, y: 108 },
  drive:     { x: 282, y: 108 },
  curiosity: { x: 118, y: 232 },
  voice:     { x: 282, y: 232 },
};

// ─── Brain SVG component ──────────────────────────────────────────────────────

function BrainSVG({ selected, hovered, onLobeClick, onLobeHover, miniMode = false, prefix = "b" }) {
  const W = miniMode ? 150 : 400;
  const H = miniMode ? 116 : 310;
  const clip = `${prefix}-clip`;
  const gIds = {
    core:      `${prefix}-gc`,
    drive:     `${prefix}-gd`,
    curiosity: `${prefix}-gcu`,
    voice:     `${prefix}-gv`,
    hl:        `${prefix}-ghl`,
  };

  return (
    <svg viewBox="0 0 400 320" width={W} height={H} style={{ overflow: "visible", display: "block" }}>
      <defs>
        <clipPath id={clip}>
          <path d={BRAIN_OUTLINE} />
        </clipPath>

        {/* Lobe gradients — single top-left light source for 3D illusion */}
        <radialGradient id={gIds.core} cx="150" cy="80" r="200" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#3d6de8" />
          <stop offset="55%"  stopColor="#1a3ab0" />
          <stop offset="100%" stopColor="#091875" />
        </radialGradient>
        <radialGradient id={gIds.drive} cx="150" cy="80" r="240" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#5588f0" />
          <stop offset="55%"  stopColor="#2248b8" />
          <stop offset="100%" stopColor="#0e1e78" />
        </radialGradient>
        <radialGradient id={gIds.curiosity} cx="150" cy="80" r="280" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#6898f4" />
          <stop offset="55%"  stopColor="#2855c0" />
          <stop offset="100%" stopColor="#0f2280" />
        </radialGradient>
        <radialGradient id={gIds.voice} cx="150" cy="80" r="340" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#7aaaf8" />
          <stop offset="60%"  stopColor="#3060c5" />
          <stop offset="100%" stopColor="#122290" />
        </radialGradient>

        {/* Specular highlight — white shimmer top-left for sphere illusion */}
        <radialGradient id={gIds.hl} cx="130" cy="82" r="130" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="rgba(255,255,255,0.22)" />
          <stop offset="55%"  stopColor="rgba(255,255,255,0.07)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
      </defs>

      {/* ── Lobe regions (clipped) ── */}
      <g clipPath={`url(#${clip})`}>
        {Object.entries(LOBE_RECTS).map(([id, r], idx) => {
          const isSel   = selected === id;
          const isHov   = hovered === id;
          const isDimmed = selected && selected !== id;
          return (
            <g key={id}>
              {/* Base lobe color */}
              <rect
                x={r.x} y={r.y} width={r.w} height={r.h}
                fill={`url(#${gIds[id]})`}
                style={{ cursor: "pointer" }}
                onClick={() => onLobeClick(id)}
                onMouseEnter={() => onLobeHover(id)}
                onMouseLeave={() => onLobeHover(null)}
                className={!selected && !hovered ? `lobe-pulse lobe-pulse-${idx}` : ""}
              />
              {/* Dimming overlay for non-selected lobes */}
              {isDimmed && (
                <rect x={r.x} y={r.y} width={r.w} height={r.h}
                  fill="rgba(0,0,20,0.58)" style={{ pointerEvents: "none" }} />
              )}
              {/* Brightness overlay for hovered/selected */}
              {(isSel || isHov) && (
                <rect x={r.x} y={r.y} width={r.w} height={r.h}
                  fill="rgba(255,255,255,0.13)" style={{ pointerEvents: "none" }} />
              )}
            </g>
          );
        })}

        {/* Specular highlight layer */}
        <rect x="0" y="0" width="400" height="320"
          fill={`url(#${gIds.hl})`} style={{ pointerEvents: "none" }} />
      </g>

      {/* ── Decorative details ── */}
      <g style={{ pointerEvents: "none" }}>
        {/* Brain outline */}
        <path d={BRAIN_OUTLINE} fill="none" stroke="rgba(255,255,255,0.11)" strokeWidth="1.5" />
        {/* Brain stem */}
        <path d={BRAIN_STEM} fill={`url(#${gIds.core})`} opacity="0.65" />
        {/* Fissures and gyri inside clip */}
        <g clipPath={`url(#${clip})`}>
          <path d={FISSURE_V} fill="none" stroke="rgba(0,0,30,0.55)" strokeWidth="3" strokeLinecap="round" />
          <path d={FISSURE_H} fill="none" stroke="rgba(0,0,30,0.40)" strokeWidth="2" strokeLinecap="round" />
          {GYRI.map((d, i) => (
            <path key={i} d={d} fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth="1.5" strokeLinecap="round" />
          ))}
        </g>
      </g>

      {/* ── Lobe labels (full mode only) ── */}
      {!miniMode && Object.entries(LOBE_LABEL_POS).map(([id, pos]) => {
        const isDimmed = selected && selected !== id;
        return (
          <g key={id} style={{ pointerEvents: "none", userSelect: "none" }}>
            <text x={pos.x} y={pos.y} textAnchor="middle"
              fill={isDimmed ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.88)"}
              fontSize="15" fontWeight="700" fontFamily={FONT_HEAD}
              style={{ transition: "fill 0.3s" }}>
              {LOBES[id].label}
            </text>
            <text x={pos.x} y={pos.y + 16} textAnchor="middle"
              fill={isDimmed ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.42)"}
              fontSize="9.5" fontFamily={FONT_BODY}
              style={{ transition: "fill 0.3s" }}>
              {LOBES[id].subtitle}
            </text>
          </g>
        );
      })}
    </svg>
  );
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
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "flex", alignItems: "center", gap: 5,
        padding: "5px 10px", borderRadius: 7, cursor: "pointer",
        border: `1px solid ${hov ? color + "60" : "rgba(255,255,255,0.1)"}`,
        background: hov ? color + "18" : "transparent",
        color: hov ? color : "rgba(255,255,255,0.38)",
        fontFamily: FONT_BODY, fontSize: "0.72rem", fontWeight: 500,
        transition: "all 0.12s",
      }}
    >
      {icon} {label}
    </button>
  );
}

// ─── Section card (dark glass) ────────────────────────────────────────────────

function SectionCard({ section, lobeColor, isExcluded, annotation, onToggleExclude, onSaveAnnotation }) {
  const [hov, setHov]       = useState(false);
  const [editing, setEditing] = useState(false);
  const [text, setText]       = useState(annotation || "");
  const rgb = hexToRgb(lobeColor);

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        borderRadius: 12,
        border: `1px solid ${isExcluded ? "rgba(255,255,255,0.07)" : `rgba(${rgb},0.22)`}`,
        borderLeft: `4px solid ${isExcluded ? "rgba(255,255,255,0.18)" : lobeColor}`,
        background: isExcluded ? "rgba(255,255,255,0.02)" : `rgba(${rgb},0.07)`,
        padding: "16px 18px",
        opacity: isExcluded ? 0.45 : 1,
        transition: "opacity 0.2s",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            fontFamily: FONT_HEAD, fontWeight: 700, fontSize: "0.7rem",
            color: isExcluded ? "rgba(255,255,255,0.25)" : lobeColor,
            textTransform: "uppercase", letterSpacing: "0.07em",
          }}>
            {SECTION_LABELS[section.id] || section.id}
          </span>
          {isExcluded && (
            <span style={{ fontFamily: FONT_BODY, fontSize: "0.68rem", fontWeight: 500, color: "#f87171", background: "rgba(248,113,113,0.1)", padding: "1px 7px", borderRadius: 999 }}>
              excluded
            </span>
          )}
          {annotation && !isExcluded && (
            <span style={{ fontFamily: FONT_BODY, fontSize: "0.68rem", fontWeight: 500, color: lobeColor, background: `rgba(${rgb},0.15)`, padding: "1px 7px", borderRadius: 999 }}>
              annotated
            </span>
          )}
        </div>
        <div style={{ opacity: (hov || isExcluded || annotation) ? 1 : 0, display: "flex", gap: 6, transition: "opacity 0.15s" }}>
          {!isExcluded && (
            <IconBtn icon={<IconAnnotate />} label="Note" color={lobeColor}
              onClick={() => { setText(annotation || ""); setEditing(true); }} />
          )}
          <IconBtn
            icon={isExcluded ? <IconRestore /> : <IconExclude />}
            label={isExcluded ? "Restore" : "Exclude"}
            color={isExcluded ? "#f87171" : "rgba(255,255,255,0.5)"}
            onClick={() => onToggleExclude(section.id)}
          />
        </div>
      </div>

      {/* Content */}
      <pre style={{
        fontFamily: FONT_MONO, fontSize: "0.74rem", lineHeight: 1.65,
        color: isExcluded ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.72)",
        whiteSpace: "pre-wrap", wordBreak: "break-word",
        margin: 0, textDecoration: isExcluded ? "line-through" : "none",
      }}>
        {section.content}
      </pre>

      {/* Annotation display */}
      {annotation && !editing && !isExcluded && (
        <div style={{
          marginTop: 12, padding: "9px 12px",
          background: `rgba(${rgb},0.12)`, borderRadius: 8, borderLeft: `2px solid ${lobeColor}`,
          display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8,
        }}>
          <p style={{ margin: 0, fontFamily: FONT_BODY, fontSize: "0.77rem", color: "rgba(255,255,255,0.72)", lineHeight: 1.5 }}>
            <span style={{ color: lobeColor, fontWeight: 600 }}>Your note: </span>{annotation}
          </p>
          <button onClick={() => onSaveAnnotation(section.id, "")}
            style={{ background: "none", border: "none", cursor: "pointer", color: lobeColor, opacity: 0.55, padding: 2, flexShrink: 0 }}>
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
                border: `1.5px solid ${lobeColor}50`,
                background: `rgba(${rgb},0.1)`,
                fontFamily: FONT_BODY, fontSize: "0.8rem", lineHeight: 1.5,
                color: TEXT, resize: "vertical", outline: "none",
              }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button onClick={() => { onSaveAnnotation(section.id, text); setEditing(false); }}
                style={{ padding: "7px 16px", borderRadius: 8, background: lobeColor, color: "#fff", border: "none", cursor: "pointer", fontFamily: FONT_BODY, fontSize: "0.8rem", fontWeight: 600 }}>
                Save note
              </button>
              <button onClick={() => setEditing(false)}
                style={{ padding: "7px 14px", borderRadius: 8, background: "transparent", color: MUTED, border: "1px solid rgba(255,255,255,0.12)", cursor: "pointer", fontFamily: FONT_BODY, fontSize: "0.8rem" }}>
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
          initial={{ opacity: 0, y: -10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.95 }}
          transition={{ duration: 0.18 }}
          style={{
            position: "fixed", top: 20, right: 24, zIndex: 9999,
            background: "#111827", color: "#fff",
            padding: "10px 18px", borderRadius: 10,
            fontFamily: FONT_BODY, fontSize: "0.82rem", fontWeight: 500,
            boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
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

// ─── CSS animations ───────────────────────────────────────────────────────────

const CSS = `
@keyframes brain-glow {
  0%, 100% {
    filter: drop-shadow(0 0 22px rgba(74,122,237,0.38))
            drop-shadow(0 0 55px rgba(29,78,216,0.22));
  }
  50% {
    filter: drop-shadow(0 0 38px rgba(74,122,237,0.62))
            drop-shadow(0 0 90px rgba(29,78,216,0.38));
  }
}
.brain-glow { animation: brain-glow 3s ease-in-out infinite; }

@keyframes lp { 0%,100% { opacity:1; } 50% { opacity:0.82; } }
.lobe-pulse-0 { animation: lp 3.4s ease-in-out 0s    infinite; }
.lobe-pulse-1 { animation: lp 3.4s ease-in-out 0.85s infinite; }
.lobe-pulse-2 { animation: lp 3.4s ease-in-out 1.7s  infinite; }
.lobe-pulse-3 { animation: lp 3.4s ease-in-out 2.55s infinite; }
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
        const activeQuests       = quests.filter(q => ["in_progress", "considered"].includes(q.status));
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
  const brainSize = isMobile ? 260 : 360;

  return (
    <div style={{ marginLeft: ml, minHeight: "100vh", background: PAGE_BG, paddingBottom: pb }}>
      <style>{CSS}</style>
      <Toast message={toast} />

      <AnimatePresence mode="wait">
        {/* ── IDLE: full brain ─────────────────────────────────────────── */}
        {!selected && (
          <motion.div key="idle"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.28 }}
            style={{
              minHeight: "100vh", display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              padding: "40px 20px",
            }}
          >
            <div style={{ textAlign: "center", marginBottom: 44 }}>
              <h1 style={{ margin: "0 0 10px", fontFamily: FONT_HEAD, fontWeight: 800, fontSize: isMobile ? "2rem" : "2.5rem", color: TEXT, letterSpacing: "-0.04em" }}>
                Mind
              </h1>
              <p style={{ margin: 0, fontFamily: FONT_BODY, fontSize: "0.88rem", color: MUTED }}>
                {loading ? "Loading your context…" : "Click a region to explore what Mentora knows about you"}
              </p>
            </div>

            {loading ? (
              <div style={{
                width: brainSize, height: Math.round(brainSize * 0.775),
                borderRadius: "50%",
                background: "radial-gradient(circle at 35% 30%, rgba(74,122,237,0.18), rgba(29,78,216,0.06) 70%)",
                animation: "brain-glow 2.5s ease-in-out infinite",
              }} />
            ) : (
              <div className="brain-glow">
                <BrainSVG
                  selected={null} hovered={hovered}
                  onLobeClick={id => setSelected(id)}
                  onLobeHover={setHovered}
                  miniMode={false} prefix="main"
                  size={brainSize}
                />
              </div>
            )}

            {!loading && (
              <p style={{ marginTop: 32, fontFamily: FONT_BODY, fontSize: "0.78rem", color: "rgba(255,255,255,0.2)", letterSpacing: "0.02em" }}>
                4 regions · {sections.length} context sections
              </p>
            )}
          </motion.div>
        )}

        {/* ── SELECTED: mini brain + content ───────────────────────────── */}
        {selected && selectedLobe && (
          <motion.div key={`sel-${selected}`}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            style={{ minHeight: "100vh" }}
          >
            {/* Header */}
            <div style={{
              display: "flex", alignItems: "center", gap: isMobile ? 16 : 28,
              padding: isMobile ? "18px 16px" : "22px 40px",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              background: `rgba(${hexToRgb(selectedLobe.color)},0.05)`,
              position: "sticky", top: 0, zIndex: 20,
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
            }}>
              {/* Mini brain */}
              <div style={{ flexShrink: 0 }}>
                <BrainSVG
                  selected={selected} hovered={hovered}
                  onLobeClick={id => setSelected(id)}
                  onLobeHover={setHovered}
                  miniMode={true} prefix="mini"
                />
              </div>

              {/* Lobe info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{
                  margin: "0 0 3px", fontFamily: FONT_HEAD, fontWeight: 800,
                  fontSize: isMobile ? "1.5rem" : "1.9rem",
                  color: selectedLobe.color, letterSpacing: "-0.03em",
                }}>
                  {selectedLobe.label}
                </h2>
                <p style={{ margin: 0, fontFamily: FONT_BODY, fontSize: "0.84rem", color: MUTED }}>
                  {selectedLobe.subtitle}
                </p>
              </div>

              {/* Back */}
              <button onClick={() => setSelected(null)} style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "7px 14px", borderRadius: 8, flexShrink: 0,
                background: "transparent", color: MUTED,
                border: "1px solid rgba(255,255,255,0.1)", cursor: "pointer",
                fontFamily: FONT_BODY, fontSize: "0.78rem",
              }}>
                ← All
              </button>
            </div>

            {/* Section cards */}
            <div style={{ maxWidth: 720, margin: "0 auto", padding: isMobile ? "20px 16px" : "28px 40px" }}>
              {visibleSections.length === 0 ? (
                <div style={{ textAlign: "center", padding: "60px 0", color: MUTED, fontFamily: FONT_BODY, fontSize: "0.9rem" }}>
                  No context here yet — keep using Mentorable to build this up.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {visibleSections.map((section, i) => (
                    <motion.div key={section.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.055, duration: 0.22 }}
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

              <p style={{ marginTop: 30, textAlign: "center", fontFamily: FONT_BODY, fontSize: "0.73rem", color: "rgba(255,255,255,0.18)" }}>
                Changes take effect in your next chat with Mentora.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
