import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import brainImg from "./components/brain_image.png";
import { supabase } from "./lib/supabase.js";
import { buildPromptSections, SECTION_LABELS } from "./lib/mentora.js";
import { getCache, setCache, getKnownUserId, setKnownUserId } from "./lib/cache.js";
import { SIDEBAR_WIDTH } from "./components/common/Sidebar.jsx";
import { useIsMobile } from "./hooks/useIsMobile.js";

// ─── Design tokens ────────────────────────────────────────────────────────────

const PAGE_BG   = "#faf9f5";
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

// ─── Brain pixel classifier ───────────────────────────────────────────────────
// Thresholds derived from sampling brain_image.png actual pixel values:
//   Core  (dark navy):  r≈0-6,   g≈47-95,  b≈170-236  brightness≈72-112
//   Drive (light cyan): r≈0-89,  g≈165-218, b≈229-254  — G far exceeds R
//   Voice (periwinkle): r≈110-174, g≈142-196, b≈252-253 — R notably elevated
//   Curiosity (med blue): r≈25-65, g≈119-142, b≈252-254 — moderate G
//   Outlines (black):   r<30, g<30, b<60 — cartoon strokes throughout
function classifyBrainPixel(r, g, b) {
  // White / near-white background (any pixel where all channels ≥ 210)
  if (Math.min(r, g, b) >= 210) return null;
  // Black cartoon outlines — all channels very low.
  // MUST be excluded before the brightness check or every outline
  // pixel activates Core (they share low brightness).
  if (r < 30 && g < 30 && b < 60) return null;

  const brightness = (r + g + b) / 3;

  // Core: dark NAVY blue — low brightness, blue dominant, NOT cyan (g < 110)
  if (brightness < 145 && b > 100 && g < 110) return "core";

  // Drive: CYAN — low R (< 90) AND high G (> 165).
  // Curiosity's max G is ≈142, so g>165 cleanly separates them.
  if (r < 90 && g > 165) return "drive";

  // Voice: PERIWINKLE — R channel elevated to ≥ 110
  if (r >= 110) return "voice";

  // Curiosity: MEDIUM BLUE — everything remaining
  return "curiosity";
}

// ─── Brain URL cache (module-level) ──────────────────────────────────────────
// Pre-rendering 5 image versions is expensive; cache across BrainSVG instances
// so the work happens once per page load, not on every mount/unmount cycle.
// CLASSIFIER_VER must be bumped whenever classifyBrainPixel changes, so that
// Vite HMR during development doesn't serve stale pre-rendered URLs.
const CLASSIFIER_VER = "8";
let _brainUrlCache = null;
let _brainUrlCacheVer = null;
let _brainLoadCallbacks = [];

function getOrBuildBrainUrls(callback) {
  if (_brainUrlCache && _brainUrlCacheVer === CLASSIFIER_VER) {
    callback(_brainUrlCache); return;
  }
  _brainUrlCache = null;
  _brainUrlCacheVer = null;
  _brainLoadCallbacks = [];
  _brainLoadCallbacks.push(callback);
  if (_brainLoadCallbacks.length > 1) return;

  const img = new Image();
  img.onload = () => {
    const W = img.naturalWidth;
    const H = img.naturalHeight;

    const src = document.createElement("canvas");
    src.width = W; src.height = H;
    src.getContext("2d").drawImage(img, 0, 0);

    const { data } = src.getContext("2d").getImageData(0, 0, W, H);

    const LOBE_IDX = { core: 1, drive: 2, curiosity: 3, voice: 4 };
    const map = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) {
      const lobe = classifyBrainPixel(data[i*4], data[i*4+1], data[i*4+2]);
      map[i] = lobe ? LOBE_IDX[lobe] : 0;
    }

    // Single static render: original colors + gray dividing lines between sections.
    // A null pixel becomes gray if it has at least 2 different lobes within NR px.
    const NR = 12;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const ctx = c.getContext("2d");
    const out = ctx.createImageData(W, H);

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i   = y * W + x;
        const idx = i * 4;
        const lobeIdx = map[i];

        if (lobeIdx !== 0) {
          // Colored brain pixel — original color
          out.data[idx]   = data[idx];
          out.data[idx+1] = data[idx+1];
          out.data[idx+2] = data[idx+2];
          out.data[idx+3] = 255;
          continue;
        }

        // Null pixel — check how many distinct lobes are nearby
        const nearby = new Set();
        done: for (let dy = -NR; dy <= NR; dy++) {
          for (let dx = -NR; dx <= NR; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
            const n = map[ny * W + nx];
            if (n !== 0) { nearby.add(n); if (nearby.size >= 2) break done; }
          }
        }

        if (nearby.size >= 2) {
          // Sits between two sections — render as muted gray
          out.data[idx] = 120; out.data[idx+1] = 130; out.data[idx+2] = 148;
          out.data[idx+3] = 255;
        } else {
          // Background or inner-section stroke — transparent
          out.data[idx+3] = 0;
        }
      }
    }

    ctx.putImageData(out, 0, 0);

    _brainUrlCache = { srcCanvas: src, staticUrl: c.toDataURL("image/png") };
    _brainUrlCacheVer = CLASSIFIER_VER;

    const cbs = _brainLoadCallbacks;
    _brainLoadCallbacks = [];
    cbs.forEach(cb => cb(_brainUrlCache));
  };
  img.src = brainImg;
}

// ─── Brain image component ────────────────────────────────────────────────────

function BrainSVG({ selected, hovered, onLobeClick, onLobeHover, mini = false, size: sizeProp }) {
  const size   = sizeProp || (mini ? 90 : 420);
  const [cache, setCache_] = useState(_brainUrlCache);

  useEffect(() => {
    if (_brainUrlCache) { setCache_(_brainUrlCache); return; }
    getOrBuildBrainUrls((c) => setCache_(c));
  }, []);

  const dispSrc = cache?.staticUrl || null;

  function hitTestXY(clientX, clientY, element) {
    if (!cache?.srcCanvas) return null;
    const rect = element.getBoundingClientRect();
    const x = Math.round((clientX - rect.left) * cache.srcCanvas.width  / rect.width);
    const y = Math.round((clientY - rect.top)  * cache.srcCanvas.height / rect.height);
    if (x < 0 || x >= cache.srcCanvas.width || y < 0 || y >= cache.srcCanvas.height) return null;
    try {
      const ctx = cache.srcCanvas.getContext("2d");
      const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
      const direct = classifyBrainPixel(r, g, b);
      if (direct !== null) return direct;

      // Pixel is a white wrinkle highlight or dark outline stroke (returns null).
      // Sample a small region around the cursor and return whichever lobe
      // dominates — this keeps wrinkles "inside" their section.
      const R = 10; // search radius — covers strokes/highlights up to ~20px wide
      const region = ctx.getImageData(
        Math.max(0, x - R), Math.max(0, y - R),
        Math.min(R*2+1, cache.srcCanvas.width),
        Math.min(R*2+1, cache.srcCanvas.height)
      );
      const counts = {};
      for (let i = 0; i < region.data.length; i += 4) {
        const lobe = classifyBrainPixel(region.data[i], region.data[i+1], region.data[i+2]);
        if (lobe) counts[lobe] = (counts[lobe] || 0) + 1;
      }
      const entries = Object.entries(counts);
      if (!entries.length) return null;
      return entries.sort((a, b) => b[1] - a[1])[0][0];
    } catch { return null; }
  }

  const handleMouseMove = (e) => onLobeHover(hitTestXY(e.clientX, e.clientY, e.currentTarget));
  const handleMouseLeave = () => onLobeHover(null);
  const handleClick = (e) => { const l = hitTestXY(e.clientX, e.clientY, e.currentTarget); if (l) onLobeClick(l); };

  const handleTouchStart = (e) => {
    const t = e.touches[0];
    const l = hitTestXY(t.clientX, t.clientY, e.currentTarget);
    onLobeHover(l);
  };
  const handleTouchEnd = (e) => {
    const t = e.changedTouches[0];
    const l = hitTestXY(t.clientX, t.clientY, e.currentTarget);
    onLobeHover(null);
    if (l) onLobeClick(l);
  };

  // Label positions as % of image (center of each color zone)
  const LABEL_POS = {
    core:      { left: "26%", top: "32%" },
    drive:     { left: "74%", top: "32%" },
    curiosity: { left: "26%", top: "68%" },
    voice:     { left: "74%", top: "68%" },
  };

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      {/* Loading: plain spinner placeholder */}
      {!dispSrc && (
        <div style={{
          width: "100%", height: "100%",
          display: "flex", alignItems: "center", justifyContent: "center",
          opacity: 0.35,
        }}>
          <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="42" fill="none" stroke="#2563eb" strokeWidth="8" strokeDasharray="60 200"
              style={{ transformOrigin: "50% 50%", animation: "spin 1s linear infinite" }} />
          </svg>
        </div>
      )}

      {/* Processed image — transparent bg, organic per-lobe dimming */}
      {dispSrc && (
        <img
          src={dispSrc}
          draggable={false}
          alt="Brain regions"
          style={{
            width: "100%", height: "100%", objectFit: "contain", display: "block",
            userSelect: "none",
            cursor: hovered ? "pointer" : "default",
          }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onClick={handleClick}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        />
      )}

      {/* Labels — hidden in mini mode */}
      {!mini && dispSrc && Object.entries(LOBES).map(([id, lobe]) => {
        const isDimmed = !!selected && selected !== id;
        const pos = LABEL_POS[id];
        return (
          <div key={id} style={{
            position: "absolute", top: pos.top, left: pos.left,
            transform: "translate(-50%, -50%)",
            textAlign: "center", pointerEvents: "none",
            opacity: isDimmed ? 0.12 : 1,
            transition: "opacity 0.2s",
          }}>
            <div style={{
              display: "inline-flex", flexDirection: "column", alignItems: "center",
              gap: 3, padding: "7px 13px", borderRadius: 10,
              background: "rgba(10,20,60,0.52)",
              backdropFilter: "blur(6px)",
              WebkitBackdropFilter: "blur(6px)",
            }}>
              <span style={{
                fontFamily: FONT_HEAD, fontWeight: 800, fontSize: 15,
                color: "#fff", lineHeight: 1, letterSpacing: "-0.02em",
              }}>
                {lobe.label}
              </span>
              <span style={{
                fontFamily: FONT_BODY, fontSize: 9.5,
                color: "rgba(255,255,255,0.75)", lineHeight: 1,
              }}>
                {lobe.subtitle}
              </span>
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
          fontFamily: FONT_BODY, fontSize: "0.82rem",
          color: strikethrough ? "#d1d5db" : "#374151",
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
        border: `1px solid ${hov ? (color || "#1d4ed8") + "50" : BORDER}`,
        background: hov ? `rgba(${hexToRgb(color || "#1d4ed8")},0.07)` : "transparent",
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

  // Keep local text in sync when annotation changes externally (e.g. after save)
  useEffect(() => {
    if (!editing) setText(annotation || "");
  }, [annotation, editing]);

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
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span style={{
            fontFamily: FONT_HEAD, fontWeight: 700, fontSize: "0.72rem",
            color: isExcluded ? "#9ca3af" : lobeColor,
            textTransform: "uppercase", letterSpacing: "0.07em",
          }}>
            {SECTION_LABELS[section.id] || section.id}
          </span>
          {isExcluded && (
            <span style={{ fontFamily: FONT_BODY, fontSize: "0.68rem", fontWeight: 500, color: "#ef4444", background: "rgba(239,68,68,0.08)", padding: "1px 7px", borderRadius: 999, flexShrink: 0 }}>
              excluded
            </span>
          )}
          {annotation && !isExcluded && (
            <span style={{ fontFamily: FONT_BODY, fontSize: "0.68rem", fontWeight: 500, color: lobeColor, background: `rgba(${rgb},0.1)`, padding: "1px 7px", borderRadius: 999, flexShrink: 0 }}>
              annotated
            </span>
          )}
        </div>
        <div style={{ opacity: (hov || isExcluded || annotation) ? 1 : 0, display: "flex", gap: 6, transition: "opacity 0.15s", flexShrink: 0, marginLeft: 8 }}>
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
@keyframes spin { to { transform: rotate(360deg); } }
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

  const handleLobeClick = useCallback((id) => {
    setSelected(id);
    setHovered(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const handleBack = useCallback(() => {
    setSelected(null);
    setHovered(null);
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

  const ml      = isMobile ? 0 : SIDEBAR_WIDTH;
  const pb      = isMobile ? 80 : 0;
  const brainSz = isMobile ? Math.min(310, window.innerWidth - 32) : Math.min(400, (window.innerWidth || 1100) - SIDEBAR_WIDTH - 80);

  return (
    <div style={{ marginLeft: ml, minHeight: "100vh", background: PAGE_BG, paddingBottom: pb }}>
      <style>{CSS}</style>
      <Toast message={toast} />

      <AnimatePresence mode="wait">

        {/* ── IDLE: full brain centered ── */}
        {!selected && (
          <motion.div key="idle"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.28 }}
            style={{
              minHeight: "100vh",
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              padding: isMobile ? "32px 16px" : "40px 32px",
            }}
          >
            <div style={{ textAlign: "center", marginBottom: 40 }}>
              <h1 style={{
                margin: "0 0 10px",
                fontFamily: FONT_HEAD, fontWeight: 800,
                fontSize: isMobile ? "2.6rem" : "3.8rem",
                color: TEXT, letterSpacing: "-0.05em", lineHeight: 1,
              }}>
                Mind
              </h1>
              <p style={{
                margin: 0, fontFamily: FONT_BODY,
                fontSize: isMobile ? "0.9rem" : "1rem",
                color: MUTED, lineHeight: 1.55, maxWidth: 380,
              }}>
                {loading ? "Loading your context…" : "Click a region to explore what Mentora knows about you"}
              </p>
            </div>

            <div style={{ width: brainSz }}>
              {loading ? (
                <div style={{
                  width: brainSz, height: brainSz,
                  background: "linear-gradient(135deg, rgba(59,130,246,0.12), rgba(29,78,216,0.06))",
                  borderRadius: "46% 54% 50% 50% / 42% 42% 58% 58%",
                }} />
              ) : (
                <BrainSVG
                  selected={null}
                  hovered={hovered}
                  onLobeClick={handleLobeClick}
                  onLobeHover={setHovered}
                  mini={false}
                  size={brainSz}
                />
              )}
            </div>

            {!loading && (
              <p style={{
                marginTop: 28, fontFamily: FONT_BODY, fontSize: "0.8rem",
                color: "rgba(107,114,128,0.5)", letterSpacing: "0.02em",
              }}>
                4 regions · {sections.length} context sections
              </p>
            )}
          </motion.div>
        )}

        {/* ── SELECTED: mini brain header + cards ── */}
        {selected && selectedLobe && (
          <motion.div key={`sel-${selected}`}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            style={{ minHeight: "100vh" }}
          >
            {/* Sticky header */}
            <div style={{
              display: "flex", alignItems: "center",
              gap: isMobile ? 12 : 20,
              padding: isMobile ? "12px 16px" : "14px 40px",
              borderBottom: `1px solid ${BORDER}`,
              background: PAGE_BG,
              position: "sticky", top: 0, zIndex: 20,
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
            }}>
              {/* Mini brain — clickable to switch lobes */}
              <div style={{ flexShrink: 0 }}>
                <BrainSVG
                  selected={selected}
                  hovered={hovered}
                  onLobeClick={handleLobeClick}
                  onLobeHover={setHovered}
                  mini={true}
                  size={isMobile ? 72 : 88}
                />
              </div>

              {/* Lobe title */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{
                  margin: "0 0 2px",
                  fontFamily: FONT_HEAD, fontWeight: 800,
                  fontSize: isMobile ? "1.5rem" : "1.9rem",
                  color: selectedLobe.color, letterSpacing: "-0.04em", lineHeight: 1,
                }}>
                  {selectedLobe.label}
                </h2>
                <p style={{ margin: 0, fontFamily: FONT_BODY, fontSize: "0.83rem", color: MUTED }}>
                  {selectedLobe.subtitle}
                </p>
              </div>

              {/* Back button */}
              <button onClick={handleBack} style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "7px 14px", borderRadius: 8, flexShrink: 0,
                background: "transparent", color: MUTED,
                border: `1px solid ${BORDER}`, cursor: "pointer",
                fontFamily: FONT_BODY, fontSize: "0.83rem", fontWeight: 500,
              }}>
                ← All
              </button>
            </div>

            {/* Section cards */}
            <div style={{
              maxWidth: 760, margin: "0 auto",
              padding: isMobile ? "20px 16px" : "28px 40px",
            }}>
              {visibleSections.length === 0 ? (
                <div style={{
                  textAlign: "center", padding: "60px 0",
                  color: MUTED, fontFamily: FONT_BODY, fontSize: "0.95rem",
                }}>
                  No context here yet — keep using Mentorable to build this up.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {visibleSections.map((section, i) => (
                    <motion.div key={section.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05, duration: 0.22 }}
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

              <p style={{ marginTop: 28, textAlign: "center", fontFamily: FONT_BODY, fontSize: "0.76rem", color: "rgba(107,114,128,0.45)" }}>
                Changes take effect in your next chat with Mentora.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
