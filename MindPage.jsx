import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
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

// ─── Cartoon brain SVG (viewBox 0 0 520 430) ────────────────────────────────
// Traced from the classic cartoon side-view brain illustration.
// Front LEFT · Back RIGHT · Mentorable blue palette · thick dark outlines.

const C_OUT  = "#0d1b4b";  // thick outlines (replaces the black in the image)
const C_BASE = "#2563eb";  // gyri body
const C_HI   = "#60a5fa";  // gyri mid-highlight
const C_TOP  = "#bfdbfe";  // gyri crown (brightest)
const C_DEEP = "#1e3a8a";  // dark fill between gyri / base
const C_CBL  = "#1e40af";  // cerebellum body
const C_CBLD = "#1a3380";  // cerebellum ridge shadow

// ── Outer brain silhouette ─────────────────────────────────────────────────
// The bumpy outer boundary of the cerebrum.
const BRAIN_OUTER =
  "M 155,66 " +
  "C 134,56 108,52 88,62 " +
  "C 68,72 52,94 48,122 " +
  "C 44,150 52,180 68,204 " +
  "C 80,222 96,236 112,246 " +
  "C 124,254 136,258 148,260 " +
  "C 168,264 194,265 222,263 " +
  "C 248,262 272,258 292,250 " +
  "C 314,240 330,226 338,208 " +
  "C 348,186 346,160 334,138 " +
  "C 322,116 302,100 284,92 " +
  "C 270,86 256,84 242,88 " +
  "C 230,82 216,72 200,66 " +
  "C 182,60 168,62 155,66 Z";

// This outer shape is the base cerebrum. Gyri push *outward* from inside it,
// and the cerebellum is a separate shape below-right.

// ── Cerebellum & stem ─────────────────────────────────────────────────────
const CBL_OUTER =
  "M 278,242 C 298,238 324,236 346,240 " +
  "C 368,244 384,256 386,272 " +
  "C 388,288 376,302 356,308 " +
  "C 334,314 308,312 290,300 " +
  "C 272,288 268,266 278,248 Z";

const CBL_RIDGES = [
  "M 282,254 C 304,248 330,246 352,252 C 368,256 376,264 372,272",
  "M 280,266 C 302,260 328,258 350,264 C 366,268 374,276 370,284",
  "M 280,278 C 302,272 326,270 346,276 C 362,280 370,290 364,298",
  "M 284,290 C 304,286 326,284 344,290 C 358,296 364,306 356,312",
];

const STEM_PATH =
  "M 174,256 C 170,274 168,294 174,310 " +
  "C 180,326 194,332 206,328 " +
  "C 218,324 222,310 218,294 " +
  "C 214,278 206,262 200,256 Z";

// ── Gyri — each one is an individually outlined raised blob ───────────────
// The image style: lighter fill blobs sitting on a dark base, thick outlines.
// `lobe` maps to LOBES keys for dim/highlight on interaction.

const GYRI = [
  // ─ BIG PARIETAL DOME (top-right, the most prominent feature) ─
  {
    id: "sup-par",
    lobe: "drive",
    body: "M 220,84 C 238,64 268,52 302,52 C 336,52 364,70 374,98 C 384,126 372,156 348,168 C 322,180 290,178 266,162 C 240,144 222,114 220,90 Z",
    crown: "M 250,66 C 270,52 298,50 322,60 C 342,68 352,86 346,104 C 338,118 318,124 296,116 C 270,106 250,88 248,70 Z",
  },

  // ─ UPPER-LEFT FRONTAL GYRUS ─
  {
    id: "sup-front",
    lobe: "core",
    body: "M 84,100 C 88,80 106,68 128,68 C 152,68 170,84 170,106 C 170,126 154,140 132,140 C 108,140 84,122 84,104 Z",
    crown: "M 102,80 C 116,70 138,70 152,82 C 160,90 158,104 146,110 C 130,116 110,110 100,96 C 94,88 96,80 102,80 Z",
  },

  // ─ INFERIOR FRONTAL / SCROLL GYRUS (front-left, the distinctive C-scroll) ─
  {
    id: "inf-front",
    lobe: "core",
    body: "M 50,168 C 44,146 48,122 64,108 C 78,96 96,94 112,102 C 128,110 134,128 128,148 C 122,166 106,176 88,174 C 70,170 52,170 50,168 Z",
    crown: "M 66,110 C 80,98 100,96 114,108 C 122,116 120,130 110,138 C 96,146 76,142 66,128 C 60,118 62,110 66,110 Z",
  },

  // ─ MIDDLE FRONTAL GYRUS ─
  {
    id: "mid-front",
    lobe: "core",
    body: "M 84,150 C 88,132 106,122 128,122 C 152,122 170,136 170,156 C 170,174 154,186 130,186 C 104,186 82,168 84,154 Z",
    crown: "M 100,132 C 116,122 140,124 154,136 C 162,144 158,158 146,164 C 128,170 106,164 96,150 C 90,140 92,132 100,132 Z",
  },

  // ─ INFERIOR PARIETAL (center mass, between frontal and big dome) ─
  {
    id: "inf-par",
    lobe: "drive",
    body: "M 168,104 C 176,84 198,72 222,76 C 246,80 260,98 256,120 C 252,140 234,152 212,150 C 188,148 166,130 168,108 Z",
    crown: "M 188,82 C 206,72 228,76 240,90 C 248,100 244,116 230,122 C 214,128 194,120 184,104 C 178,92 180,82 188,82 Z",
  },

  // ─ OCCIPITAL / BACK UPPER ─
  {
    id: "occ-up",
    lobe: "voice",
    body: "M 280,88 C 294,68 318,58 342,62 C 366,66 382,84 378,108 C 374,130 354,142 330,138 C 304,132 278,110 280,92 Z",
    crown: "M 302,70 C 320,60 344,64 358,80 C 364,90 360,106 344,112 C 326,118 304,108 294,90 C 288,78 292,70 302,70 Z",
  },

  // ─ OCCIPITAL BACK-LOWER ─
  {
    id: "occ-low",
    lobe: "voice",
    body: "M 298,142 C 308,122 330,112 354,116 C 378,120 394,140 388,164 C 382,186 360,196 336,190 C 310,182 292,162 298,146 Z",
    crown: "M 322,120 C 342,112 364,118 374,134 C 380,146 372,162 356,168 C 336,174 312,164 304,148 C 298,134 304,122 322,120 Z",
  },

  // ─ SUPERIOR TEMPORAL GYRUS ─
  {
    id: "sup-temp",
    lobe: "curiosity",
    body: "M 84,196 C 92,176 116,166 144,168 C 172,170 192,188 190,210 C 188,230 168,242 144,240 C 118,238 82,214 84,200 Z",
    crown: "M 106,176 C 126,166 154,170 168,184 C 176,194 172,210 158,216 C 138,222 112,216 100,200 C 92,188 96,176 106,176 Z",
  },

  // ─ MIDDLE TEMPORAL GYRUS ─
  {
    id: "mid-temp",
    lobe: "curiosity",
    body: "M 168,210 C 178,192 204,182 232,186 C 260,190 278,208 274,230 C 270,250 248,260 222,256 C 194,252 166,232 168,214 Z",
    crown: "M 192,192 C 212,182 240,186 256,202 C 264,212 260,228 246,234 C 226,242 200,234 188,216 C 180,204 184,192 192,192 Z",
  },

  // ─ INFERIOR TEMPORAL / BACK-LOWER ─
  {
    id: "inf-temp",
    lobe: "curiosity",
    body: "M 250,222 C 262,202 290,192 316,198 C 342,204 356,224 350,248 C 344,270 320,280 294,274 C 266,266 248,244 250,226 Z",
    crown: "M 276,202 C 298,192 324,198 338,216 C 346,228 340,246 324,252 C 304,260 278,252 266,232 C 258,218 262,202 276,202 Z",
  },
];

// ── Deep sulci — thick dark grooves between the gyri ──────────────────────
const SULCI = [
  // Sylvian fissure (the dominant horizontal groove)
  "M 60,188 C 88,182 124,178 162,178 C 200,178 238,184 270,196 C 294,206 312,220 324,236",
  // Central sulcus
  "M 170,90 C 168,116 164,146 158,172 C 152,192 144,208 136,220",
  // Superior frontal sulcus
  "M 106,104 C 104,126 100,150 96,172 C 92,190 88,206 84,218",
  // Intraparietal sulcus
  "M 252,80 C 250,108 246,138 240,162 C 234,182 224,198 212,210",
  // Parieto-occipital sulcus
  "M 318,80 C 316,106 310,134 302,158 C 294,178 282,194 268,206",
  // Temporal sulci
  "M 90,228 C 120,222 156,218 196,218 C 236,218 272,222 302,230",
  "M 96,244 C 124,238 160,234 198,234 C 236,234 270,238 298,246",
];

// ── Interactive lobe regions ───────────────────────────────────────────────
const LOBE_RECTS = {
  core:      { x: 42,  y: 58,  w: 132, h: 160 },  // front (left)
  drive:     { x: 174, y: 50,  w: 118, h: 140 },  // top-center
  curiosity: { x: 42,  y: 176, w: 250, h: 100 },  // bottom
  voice:     { x: 292, y: 58,  w:  96, h: 200 },  // back (right)
};

const LOBE_LABEL_POS = {
  core:      { x: 106, y: 210 },
  drive:     { x: 232, y: 170 },
  curiosity: { x: 200, y: 280 },
  voice:     { x: 340, y: 200 },
};

// ─── Brain SVG component ──────────────────────────────────────────────────────

function BrainSVG({ selected, hovered, onLobeClick, onLobeHover, mini = false, prefix = "b" }) {
  const W = mini ? 148 : 520;
  const H = mini ? 122 : 430;
  const clipId = `${prefix}-bc`;

  return (
    <svg viewBox="0 0 520 430" width={W} height={H} style={{ display: "block", overflow: "visible" }}>
      <defs>
        <clipPath id={clipId}>
          <path d={BRAIN_OUTER} />
        </clipPath>
      </defs>

      {/* ── Brain stem (behind everything) ── */}
      <path d={STEM_PATH} fill={C_DEEP} stroke={C_OUT} strokeWidth="3.5" strokeLinejoin="round" />

      {/* ── Cerebellum (behind main brain) ── */}
      <path d={CBL_OUTER}
        fill={C_CBL} stroke={C_OUT} strokeWidth="3.5" strokeLinejoin="round"
        opacity={selected && selected !== "voice" ? 0.35 : 1}
        style={{ transition: "opacity 0.25s" }}
      />
      {CBL_RIDGES.map((d, i) => (
        <path key={`cr${i}`} d={d} fill="none"
          stroke={C_CBLD} strokeWidth="3.5" strokeLinecap="round"
          opacity={selected && selected !== "voice" ? 0.35 : 1}
          style={{ transition: "opacity 0.25s", pointerEvents: "none" }}
        />
      ))}
      {/* cerebellum outline again on top of ridges */}
      <path d={CBL_OUTER} fill="none" stroke={C_OUT} strokeWidth="3.5"
        opacity={selected && selected !== "voice" ? 0.35 : 1}
        style={{ transition: "opacity 0.25s", pointerEvents: "none" }}
      />

      {/* ── Dark base fill (shows between gyri as sulci) ── */}
      <path d={BRAIN_OUTER} fill={C_DEEP} />

      {/* ── Individual gyri blobs ── */}
      {GYRI.map(({ id, lobe, body, crown }) => {
        const isDimmed = !!selected && selected !== lobe;
        const isLit    = hovered === lobe || selected === lobe;
        return (
          <g key={id} style={{ transition: "opacity 0.22s", opacity: isDimmed ? 0.25 : 1 }}>
            {/* Gyrus body */}
            <path d={body}
              fill={isLit ? C_HI : C_BASE}
              stroke={C_OUT} strokeWidth="3" strokeLinejoin="round"
              style={{ transition: "fill 0.18s" }}
            />
            {/* Crown specular */}
            <path d={crown}
              fill={isLit ? C_TOP : C_HI}
              style={{ pointerEvents: "none", transition: "fill 0.18s" }}
            />
          </g>
        );
      })}

      {/* ── Sulci strokes on top (dark deep grooves) ── */}
      <g clipPath={`url(#${clipId})`} style={{ pointerEvents: "none" }}>
        {SULCI.map((d, i) => (
          <path key={`s${i}`} d={d} fill="none"
            stroke={C_OUT} strokeWidth="5" strokeLinecap="round"
          />
        ))}
      </g>

      {/* ── Outer brain outline (drawn last so it's always crisp) ── */}
      <path d={BRAIN_OUTER} fill="none" stroke={C_OUT} strokeWidth="5" strokeLinejoin="round"
        style={{ pointerEvents: "none" }} />

      {/* ── Transparent interactive regions (pointer events) ── */}
      <g clipPath={`url(#${clipId})`}>
        {Object.entries(LOBE_RECTS).map(([id, r]) => (
          <rect key={id} x={r.x} y={r.y} width={r.w} height={r.h}
            fill="transparent"
            style={{ cursor: "pointer", pointerEvents: "visiblePainted" }}
            onClick={() => onLobeClick(id)}
            onMouseEnter={() => onLobeHover(id)}
            onMouseLeave={() => onLobeHover(null)}
          />
        ))}
      </g>

      {/* ── Lobe labels (full size only) ── */}
      {!mini && Object.entries(LOBE_LABEL_POS).map(([id, pos]) => {
        const isDimmed = !!selected && selected !== id;
        const lobe = LOBES[id];
        return (
          <g key={id} style={{ pointerEvents: "none", userSelect: "none", transition: "opacity 0.22s", opacity: isDimmed ? 0.12 : 1 }}>
            <text x={pos.x} y={pos.y} textAnchor="middle"
              fill="#fff" fontSize="13" fontWeight="700"
              fontFamily={FONT_HEAD} letterSpacing="-0.2"
              style={{ filter: "drop-shadow(0 1px 4px rgba(0,0,0,0.8))" }}>
              {lobe.label}
            </text>
            <text x={pos.x} y={pos.y + 15} textAnchor="middle"
              fill="rgba(255,255,255,0.65)" fontSize="9" fontFamily={FONT_BODY} fontWeight="500"
              style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.7))" }}>
              {lobe.subtitle}
            </text>
          </g>
        );
      })}
    </svg>
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

  const brainW = isMobile ? 340 : Math.min(500, (window?.innerWidth || 900) - SIDEBAR_WIDTH - 80);
  const brainH = Math.round(brainW * (430 / 520));

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
                  mini={false} prefix="main"
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
                  mini={true} prefix="mini"
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
