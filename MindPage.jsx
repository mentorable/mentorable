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

// ─── Cartoon brain SVG data (viewBox 0 0 560 460) ───────────────────────────
// Modelled after the classic cartoon side-view brain illustration.
// Front faces LEFT, back faces RIGHT.
// Colors: Mentorable blue palette, thick dark outlines like the original image.

const C_OUTLINE  = "#0d1b4b";   // near-black navy — replaces the thick black lines
const C_BASE     = "#2563eb";   // medium blue — main gyri fill
const C_LIGHT    = "#60a5fa";   // light blue — gyri highlights
const C_LIGHTER  = "#bfdbfe";   // very light — specular crown highlights
const C_DARK     = "#1d4ed8";   // darker blue — shadowed sulcal areas
const C_DEEP     = "#1e3a8a";   // deep blue — deepest sulci / cerebellum base
const C_CBL      = "#1e40af";   // cerebellum fill
const C_CBL_RDG  = "#1d4ed8";   // cerebellum ridge fill
const C_STEM     = "#1e3a8a";   // brain stem

// ── Outer brain silhouette ─────────────────────────────────────────────────

// The main cerebrum shape. Front-facing left, strongly bumpy top like the image.
const BRAIN_OUTER =
  "M 132,68 " +
  "C 110,54 88,50 72,62 " +       // front-upper forehead slope
  "C 56,74 46,96 44,122 " +       // front face going down
  "C 42,148 48,176 60,200 " +     // front-lower face
  "C 70,220 84,238 100,252 " +    // transition to temporal
  "C 116,266 138,274 162,278 " +  // temporal front
  "C 188,284 218,286 248,284 " +  // temporal floor
  "C 278,282 308,276 332,264 " +  // temporal back
  "C 356,250 372,230 378,206 " +  // back-lower
  "C 386,180 386,152 376,128 " +  // back
  "C 364,102 344,82 320,70 " +    // back-upper
  "C 294,56 264,50 234,52 " +     // top-right
  "C 204,50 176,54 158,62 " +     // top-center
  "C 148,66 140,68 132,68 Z";     // close at front-top

// ── Individual gyri (raised folds) ────────────────────────────────────────
// Each gyrus is a distinct filled blob with thick outline — matching cartoon style.

// Gyri are drawn bottom-up so lower ones don't cover upper ones.
const GYRI_SHAPES = [
  // ── TEMPORAL LOBE GYRI (bottom region) ──

  // Inferior temporal gyrus — large horizontal blob at very bottom
  { id: "g-inf-temp",
    fill: C_BASE, light: C_LIGHT,
    path: "M 140,268 C 160,260 200,256 240,256 C 280,256 316,260 340,268 C 356,274 360,282 348,288 C 332,296 300,298 264,298 C 228,298 190,296 162,288 C 144,282 130,274 140,268 Z",
    hilite: "M 168,262 C 196,256 228,254 258,258 C 282,262 298,268 296,274 C 290,278 268,278 242,276 C 210,272 182,266 168,262 Z",
  },
  // Superior temporal gyrus — slightly above, curves front to back
  { id: "g-sup-temp",
    fill: C_BASE, light: C_LIGHT,
    path: "M 114,232 C 134,220 168,214 208,212 C 248,210 286,214 316,224 C 340,232 354,244 346,254 C 336,264 308,268 272,266 C 236,264 196,260 162,250 C 138,242 104,242 114,232 Z",
    hilite: "M 142,222 C 168,214 204,210 240,212 C 272,214 298,222 302,230 C 298,236 272,238 244,236 C 210,232 178,226 142,222 Z",
  },

  // ── FRONTAL LOBE GYRI (left/front region) ──

  // Inferior frontal gyrus — the C-shaped front scroll (very distinctive in image)
  { id: "g-inf-front",
    fill: C_BASE, light: C_LIGHT,
    path: "M 52,178 C 44,158 46,136 60,118 C 72,102 90,94 108,96 C 126,98 138,112 140,130 C 142,148 134,166 120,176 C 106,186 86,188 70,182 C 62,178 54,178 52,178 Z",
    hilite: "M 68,118 C 84,108 104,104 118,112 C 128,120 130,132 122,140 C 114,148 98,150 86,144 C 76,138 68,128 68,118 Z",
  },
  // Middle frontal gyrus — horizontal slab above the Sylvian region
  { id: "g-mid-front",
    fill: C_BASE, light: C_LIGHT,
    path: "M 72,154 C 80,140 98,130 120,128 C 142,126 162,132 172,144 C 180,154 178,168 166,176 C 152,184 128,184 108,178 C 88,170 66,166 72,154 Z",
    hilite: "M 94,136 C 112,128 136,128 152,136 C 162,142 164,150 156,156 C 146,162 126,162 110,156 C 98,150 90,142 94,136 Z",
  },
  // Superior frontal gyrus — top-left large bump
  { id: "g-sup-front",
    fill: C_BASE, light: C_LIGHT,
    path: "M 72,124 C 68,104 74,82 90,70 C 104,58 124,56 144,62 C 162,68 174,82 174,98 C 174,114 162,128 144,136 C 124,144 98,142 84,132 C 76,126 74,124 72,124 Z",
    hilite: "M 92,72 C 108,62 130,62 146,72 C 158,80 160,94 150,102 C 138,110 118,110 104,102 C 94,94 88,82 92,72 Z",
  },

  // ── PARIETAL LOBE GYRI (top-center) ──

  // Inferior parietal lobule — large central mass
  { id: "g-inf-par",
    fill: C_BASE, light: C_LIGHT,
    path: "M 178,156 C 182,136 196,118 218,110 C 240,102 266,104 284,116 C 300,128 306,146 300,162 C 294,178 278,188 256,190 C 232,192 208,184 194,170 C 184,160 176,158 178,156 Z",
    hilite: "M 200,118 C 218,108 244,108 262,120 C 274,130 276,144 266,152 C 254,160 234,160 220,152 C 208,144 200,132 200,118 Z",
  },
  // Superior parietal — top-center large dome (biggest bump)
  { id: "g-sup-par",
    fill: C_BASE, light: C_LIGHT,
    path: "M 190,110 C 188,88 198,66 218,54 C 238,42 264,42 284,54 C 302,64 312,84 308,104 C 304,122 288,136 266,140 C 242,144 216,136 202,122 C 194,114 190,112 190,110 Z",
    hilite: "M 210,60 C 230,48 258,50 274,62 C 286,72 286,90 274,100 C 260,110 238,110 224,100 C 212,90 208,74 210,60 Z",
  },

  // ── OCCIPITAL / BACK REGION ──

  // Parieto-occipital — top-right bump
  { id: "g-par-occ",
    fill: C_BASE, light: C_LIGHT,
    path: "M 296,112 C 296,90 308,68 328,58 C 348,48 372,52 386,68 C 398,82 398,104 386,120 C 374,136 352,144 330,138 C 310,132 296,124 296,112 Z",
    hilite: "M 318,66 C 336,56 358,60 370,76 C 378,88 374,106 360,114 C 346,120 328,116 318,104 C 310,92 310,76 318,66 Z",
  },
  // Occipital — back rounded region
  { id: "g-occ",
    fill: C_BASE, light: C_LIGHT,
    path: "M 332,140 C 340,120 356,104 376,100 C 394,96 410,106 416,124 C 422,142 416,164 400,178 C 384,192 360,196 342,186 C 326,176 324,158 332,140 Z",
    hilite: "M 360,108 C 376,102 392,112 396,128 C 400,144 390,160 374,166 C 360,170 346,162 342,148 C 338,134 346,114 360,108 Z",
  },
];

// ── Sulci (deep dark grooves between gyri) ─────────────────────────────────

const SULCI_PATHS = [
  // Sylvian / lateral fissure — major horizontal groove
  "M 60,200 C 90,194 130,190 172,190 C 214,190 256,194 294,202 C 318,208 338,218 352,230",
  // Central sulcus — divides frontal from parietal
  "M 184,100 C 184,126 182,154 180,178 C 178,196 174,208 170,218",
  // Superior frontal sulcus
  "M 80,122 C 86,140 90,160 88,180 C 86,196 82,210 78,220",
  // Intraparietal sulcus
  "M 284,108 C 284,130 282,154 278,174 C 274,190 268,204 262,214",
  // Parieto-occipital sulcus
  "M 330,96 C 330,118 328,142 322,162 C 316,180 308,196 298,208",
  // Temporal sulci
  "M 120,248 C 160,242 204,238 248,238 C 292,238 330,242 356,250",
  "M 130,264 C 166,258 208,254 250,254 C 290,254 326,258 348,266",
  // Frontal operculum (the deep fold in front)
  "M 134,130 C 138,148 140,168 138,188 C 136,202 132,214 128,224",
];

// ── Lobe interactive regions ───────────────────────────────────────────────
// Simple rectangles clipped to brain shape for pointer events.
// Core=front, Drive=top-center, Curiosity=bottom, Voice=back

const LOBE_RECTS = {
  core:      { x: 40,  y: 40,  w: 160, h: 200 },  // x<200
  drive:     { x: 200, y: 40,  w: 120, h: 165 },  // 200≤x<320, y<205
  curiosity: { x: 40,  y: 200, w: 280, h: 100 },  // y≥200, x<320
  voice:     { x: 310, y: 40,  w: 100, h: 250 },  // x≥310
};

const LOBE_LABEL_POS = {
  core:      { x: 112, y: 205 },
  drive:     { x: 250, y: 175 },
  curiosity: { x: 210, y: 270 },
  voice:     { x: 358, y: 175 },
};

// ── Cerebellum ─────────────────────────────────────────────────────────────

const CEREBELLUM_OUTER =
  "M 320,258 C 336,250 358,244 378,244 " +
  "C 400,244 418,254 422,270 " +
  "C 426,286 416,304 398,314 " +
  "C 378,324 352,326 332,316 " +
  "C 310,304 306,282 320,258 Z";

const CEREBELLUM_RIDGES = [
  "M 322,270 C 344,262 370,260 392,266 C 408,270 416,278 412,284",
  "M 320,282 C 342,274 368,272 390,278 C 406,282 414,290 410,296",
  "M 322,294 C 342,288 366,286 386,292 C 400,296 408,304 402,310",
  "M 328,306 C 346,300 366,300 382,306 C 394,310 400,318 394,322",
];

// ── Brain stem ─────────────────────────────────────────────────────────────

const STEM_PATH =
  "M 188,272 C 184,292 182,314 188,332 " +
  "C 194,350 208,358 222,354 " +
  "C 236,350 240,336 236,316 " +
  "C 232,298 224,278 218,272 Z";

// ─── Brain SVG component ──────────────────────────────────────────────────────

function BrainSVG({ selected, hovered, onLobeClick, onLobeHover, mini = false, prefix = "b" }) {
  const W = mini ? 150 : 560;
  const H = mini ? 98  : 370;
  const clipId = `${prefix}-brain-clip`;

  return (
    <svg viewBox="0 0 560 370" width={W} height={H} style={{ display: "block", overflow: "visible" }}>
      <defs>
        <clipPath id={clipId}>
          <path d={BRAIN_OUTER} />
        </clipPath>
      </defs>

      {/* ── Brain stem (drawn first, behind brain) ── */}
      <path d={STEM_PATH} fill={C_STEM} stroke={C_OUTLINE} strokeWidth="3.5" strokeLinejoin="round" />

      {/* ── Cerebellum (drawn behind brain) ── */}
      <path d={CEREBELLUM_OUTER}
        fill={C_CBL}
        stroke={C_OUTLINE} strokeWidth="3.5" strokeLinejoin="round"
        opacity={selected && selected !== "voice" ? 0.4 : 1}
        style={{ transition: "opacity 0.25s" }}
      />
      {CEREBELLUM_RIDGES.map((d, i) => (
        <path key={i} d={d} fill="none"
          stroke={C_CBL_RDG} strokeWidth="3" strokeLinecap="round"
          opacity={selected && selected !== "voice" ? 0.4 : 1}
          style={{ transition: "opacity 0.25s" }}
        />
      ))}

      {/* ── Base brain fill (dark background under gyri) ── */}
      <path d={BRAIN_OUTER} fill={C_DEEP} />

      {/* ── Individual gyri blobs ── */}
      {GYRI_SHAPES.map(({ id, path, hilite }) => {
        // Determine which lobe this gyrus belongs to for dimming
        const lobeId = (() => {
          if (["g-inf-front","g-mid-front","g-sup-front"].includes(id)) return "core";
          if (["g-inf-par","g-sup-par"].includes(id)) return "drive";
          if (["g-inf-temp","g-sup-temp"].includes(id)) return "curiosity";
          return "voice";
        })();
        const isDimmed = !!selected && selected !== lobeId;
        const isActive = hovered === lobeId || selected === lobeId;

        return (
          <g key={id} style={{ transition: "opacity 0.25s", opacity: isDimmed ? 0.28 : 1 }}>
            {/* Gyrus body */}
            <path d={path}
              fill={isActive ? C_LIGHT : C_BASE}
              stroke={C_OUTLINE} strokeWidth="3" strokeLinejoin="round"
              style={{ transition: "fill 0.2s" }}
            />
            {/* Crown highlight */}
            <path d={hilite}
              fill={isActive ? C_LIGHTER : C_LIGHT}
              style={{ pointerEvents: "none", transition: "fill 0.2s" }}
            />
          </g>
        );
      })}

      {/* ── Sulci strokes (dark carved grooves) ── */}
      <g clipPath={`url(#${clipId})`} style={{ pointerEvents: "none" }}>
        {SULCI_PATHS.map((d, i) => (
          <path key={i} d={d} fill="none"
            stroke={C_OUTLINE} strokeWidth="4.5" strokeLinecap="round"
          />
        ))}
      </g>

      {/* ── Brain outer outline ── */}
      <path d={BRAIN_OUTER} fill="none" stroke={C_OUTLINE} strokeWidth="4.5" strokeLinejoin="round"
        style={{ pointerEvents: "none" }} />

      {/* ── Interactive lobe overlay (transparent, pointer events only) ── */}
      <g clipPath={`url(#${clipId})`}>
        {Object.entries(LOBE_RECTS).map(([id, r]) => (
          <rect
            key={id}
            x={r.x} y={r.y} width={r.w} height={r.h}
            fill="transparent"
            style={{ cursor: "pointer", pointerEvents: "visiblePainted" }}
            onClick={() => onLobeClick(id)}
            onMouseEnter={() => onLobeHover(id)}
            onMouseLeave={() => onLobeHover(null)}
          />
        ))}
      </g>

      {/* ── Lobe labels (full mode only) ── */}
      {!mini && Object.entries(LOBE_LABEL_POS).map(([id, pos]) => {
        const isDimmed = !!selected && selected !== id;
        const lobe = LOBES[id];
        return (
          <g key={id} style={{ pointerEvents: "none", userSelect: "none", transition: "opacity 0.25s", opacity: isDimmed ? 0.15 : 1 }}>
            <text x={pos.x} y={pos.y} textAnchor="middle"
              fill="rgba(255,255,255,0.97)" fontSize="14" fontWeight="700"
              fontFamily={FONT_HEAD} letterSpacing="-0.2"
              style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.7))" }}>
              {lobe.label}
            </text>
            <text x={pos.x} y={pos.y + 16} textAnchor="middle"
              fill="rgba(255,255,255,0.6)" fontSize="9.5" fontFamily={FONT_BODY} fontWeight="500"
              style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.6))" }}>
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

  const brainW = isMobile ? 340 : Math.min(520, (window?.innerWidth || 900) - SIDEBAR_WIDTH - 80);
  const brainH = Math.round(brainW * (370 / 560));

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
