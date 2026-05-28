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
const FONT_MONO = "'JetBrains Mono', 'Fira Mono', 'Courier New', monospace";
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

// ─── Brain SVG anatomy paths (viewBox 0 0 600 430) ───────────────────────────
//
// Two organic hemispheres with a true longitudinal fissure gap (x 291-309).
// Each hemisphere has a slightly irregular lateral boundary to suggest gyri.
// Divided into anterior/posterior lobes by horizontal fissure at y ≈ 192.

// Left hemisphere shape (lateral boundary, medial edge is straight at x=291)
const L_HEMI = "M 291,24 C 264,14 228,14 196,26 C 164,38 134,62 110,92 C 86,122 70,158 64,196 C 58,234 64,272 80,304 C 96,336 122,360 152,374 C 176,384 206,390 236,391 C 256,392 276,392 291,392 Z";
// Right hemisphere (mirror)
const R_HEMI = "M 309,24 C 336,14 372,14 404,26 C 436,38 466,62 490,92 C 514,122 530,158 536,196 C 542,234 536,272 520,304 C 504,336 478,360 448,374 C 424,384 394,390 364,391 C 344,392 324,392 309,392 Z";
// Full outline for clip/shadow (both hemispheres + fissure)
const BRAIN_OUTLINE = "M 291,24 C 264,14 228,14 196,26 C 164,38 134,62 110,92 C 86,122 70,158 64,196 C 58,234 64,272 80,304 C 96,336 122,360 152,374 C 176,384 206,390 236,391 C 256,392 276,392 291,392 L 291,24 M 309,24 C 336,14 372,14 404,26 C 436,38 466,62 490,92 C 514,122 530,158 536,196 C 542,234 536,272 520,304 C 504,336 478,360 448,374 C 424,384 394,390 364,391 C 344,392 324,392 309,392 Z";
// Brain stem
const STEM = "M 280,392 C 278,404 276,418 290,424 C 300,428 310,424 322,418 C 320,404 318,392 320,392 Z";

// Lobe paths (each lobe is a closed region)
const LOBE_PATHS = {
  core:      "M 291,24 C 264,14 228,14 196,26 C 164,38 134,62 110,92 C 86,122 70,158 64,196 L 64,192 C 98,186 148,183 196,183 C 234,183 264,184 284,187 L 291,190 L 291,24 Z",
  curiosity: "M 291,190 L 284,187 C 264,184 234,183 196,183 C 148,183 98,186 64,192 C 58,234 64,272 80,304 C 96,336 122,360 152,374 C 176,384 206,390 236,391 C 256,392 276,392 291,392 Z",
  drive:     "M 309,24 C 336,14 372,14 404,26 C 436,38 466,62 490,92 C 514,122 530,158 536,196 L 536,192 C 502,186 452,183 404,183 C 366,183 336,184 316,187 L 309,190 L 309,24 Z",
  voice:     "M 309,190 L 316,187 C 336,184 366,183 404,183 C 452,183 502,186 536,192 C 542,234 536,272 520,304 C 504,336 478,360 448,374 C 424,384 394,390 364,391 C 344,392 324,392 309,392 Z",
};

// Gyri — curved sulcal lines that make it look like a real brain surface.
// These are stroked white at low opacity on top of each lobe's fill.
const GYRI = {
  core: [
    "M 90,72 C 118,64 156,60 194,60 C 220,60 242,62 260,66 C 272,68 280,70 286,72",
    "M 84,96 C 114,88 152,84 190,84 C 218,84 240,86 258,90 C 270,92 278,94 285,96",
    "M 78,120 C 110,112 150,108 188,108 C 216,108 238,110 256,114 C 268,116 276,118 284,120",
    "M 74,144 C 108,136 148,132 186,132 C 214,132 236,134 254,138 C 266,140 274,142 282,144",
    "M 70,168 C 105,160 146,156 184,156 C 212,156 234,158 252,162 C 264,164 272,166 280,168",
    "M 68,186 C 104,179 145,176 183,176 C 211,176 233,178 251,181 C 263,183 272,185 279,187",
  ],
  drive: [
    "M 510,72 C 482,64 444,60 406,60 C 380,60 358,62 340,66 C 328,68 320,70 314,72",
    "M 516,96 C 486,88 448,84 410,84 C 382,84 360,86 342,90 C 330,92 322,94 315,96",
    "M 522,120 C 490,112 450,108 412,108 C 384,108 362,110 344,114 C 332,116 324,118 316,120",
    "M 526,144 C 492,136 452,132 414,132 C 386,132 364,134 346,138 C 334,140 326,142 318,144",
    "M 530,168 C 495,160 454,156 416,156 C 388,156 366,158 348,162 C 336,164 328,166 320,168",
    "M 532,186 C 496,179 455,176 417,176 C 389,176 367,178 349,181 C 337,183 328,185 321,187",
  ],
  curiosity: [
    "M 66,208 C 102,202 143,198 182,198 C 212,198 234,200 253,204 C 265,206 274,208 281,210",
    "M 65,232 C 101,226 142,222 181,222 C 211,222 233,224 252,228 C 264,230 273,232 280,234",
    "M 64,256 C 100,250 141,246 179,246 C 209,246 231,248 250,252 C 262,254 271,256 279,258",
    "M 65,280 C 100,274 140,270 177,270 C 207,270 229,272 248,276 C 260,278 269,280 277,282",
    "M 68,304 C 102,298 140,294 174,294 C 204,294 226,296 245,300 C 257,302 266,304 274,306",
    "M 74,328 C 106,322 142,318 172,318 C 200,318 220,320 239,324 C 250,326 260,328 267,330",
    "M 84,352 C 113,346 146,342 172,342 C 198,342 217,344 234,348 C 244,350 253,352 258,354",
    "M 98,374 C 124,368 152,364 174,364 C 198,364 215,367 229,371 C 238,373 246,376 250,378",
  ],
  voice: [
    "M 534,208 C 498,202 457,198 418,198 C 388,198 366,200 347,204 C 335,206 326,208 319,210",
    "M 535,232 C 499,226 458,222 419,222 C 389,222 367,224 348,228 C 336,230 327,232 320,234",
    "M 536,256 C 500,250 459,246 421,246 C 391,246 369,248 350,252 C 338,254 329,256 321,258",
    "M 535,280 C 500,274 460,270 423,270 C 393,270 371,272 352,276 C 340,278 331,280 323,282",
    "M 532,304 C 498,298 460,294 426,294 C 396,294 374,296 355,300 C 343,302 334,304 326,306",
    "M 526,328 C 494,322 458,318 428,318 C 400,318 380,320 361,324 C 350,326 340,328 333,330",
    "M 516,352 C 487,346 454,342 428,342 C 402,342 383,344 366,348 C 356,350 347,352 342,354",
    "M 502,374 C 476,368 448,364 426,364 C 402,364 385,367 371,371 C 362,373 354,376 350,378",
  ],
};

// Label positions (center of each lobe)
const LOBE_LABELS = {
  core:      { x: 178, y: 110 },
  drive:     { x: 422, y: 110 },
  curiosity: { x: 178, y: 294 },
  voice:     { x: 422, y: 294 },
};

// ─── Brain SVG ────────────────────────────────────────────────────────────────

function BrainSVG({ selected, hovered, onLobeClick, onLobeHover, mini = false, prefix = "b" }) {
  const W = mini ? 160 : 600;
  const H = mini ? 116 : 435;
  const clipId = `${prefix}-clip`;
  const filterId = `${prefix}-glow`;

  return (
    <svg viewBox="0 0 600 435" width={W} height={H} style={{ display: "block", overflow: "visible" }}>
      <defs>
        {/* Full brain clip */}
        <clipPath id={clipId}>
          <path d={L_HEMI} />
          <path d={R_HEMI} />
        </clipPath>

        {/* Glow filter for hover */}
        <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur" />
          <feColorMatrix in="blur" type="matrix"
            values="0 0 0 0 0.1  0 0 0 0 0.3  0 0 0 0 0.95  0 0 0 0.7 0" result="glow" />
          <feMerge><feMergeNode in="glow" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>

        {/* Per-lobe gradients with single top-left light source */}
        <radialGradient id={`${prefix}-g-core`} cx="160" cy="90" r="220" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#4a7be8" />
          <stop offset="45%"  stopColor="#1d4ed8" />
          <stop offset="100%" stopColor="#0d2280" />
        </radialGradient>
        <radialGradient id={`${prefix}-g-drive`} cx="160" cy="90" r="280" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#5c8ff4" />
          <stop offset="45%"  stopColor="#2563eb" />
          <stop offset="100%" stopColor="#1030a0" />
        </radialGradient>
        <radialGradient id={`${prefix}-g-curiosity`} cx="160" cy="90" r="340" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#6ca0f6" />
          <stop offset="50%"  stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#1840b8" />
        </radialGradient>
        <radialGradient id={`${prefix}-g-voice`} cx="160" cy="90" r="420" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#88b8fa" />
          <stop offset="50%"  stopColor="#60a5fa" />
          <stop offset="100%" stopColor="#2458cc" />
        </radialGradient>

        {/* Specular highlight — top-left white shimmer */}
        <radialGradient id={`${prefix}-g-hl`} cx="165" cy="88" r="150" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="rgba(255,255,255,0.28)" />
          <stop offset="50%"  stopColor="rgba(255,255,255,0.09)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
      </defs>

      {/* ── Hemisphere base fills ── */}
      {Object.entries(LOBE_PATHS).map(([id, path]) => {
        const isSelected   = selected === id;
        const isHovered    = hovered === id;
        const isDimmed     = !!selected && selected !== id;
        return (
          <g key={id}>
            <path
              d={path}
              fill={`url(#${prefix}-g-${id})`}
              style={{ cursor: "pointer", transition: "opacity 0.25s" }}
              opacity={isDimmed ? 0.32 : 1}
              onClick={() => onLobeClick(id)}
              onMouseEnter={() => onLobeHover(id)}
              onMouseLeave={() => onLobeHover(null)}
            />
            {/* Brightness overlay for hovered/selected */}
            {(isSelected || isHovered) && (
              <path d={path} fill="rgba(255,255,255,0.14)" style={{ pointerEvents: "none" }} />
            )}
            {/* Glow ring when hovered in idle mode */}
            {isHovered && !selected && (
              <path d={path} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2.5"
                style={{ pointerEvents: "none", filter: `drop-shadow(0 0 8px rgba(255,255,255,0.3))` }} />
            )}
          </g>
        );
      })}

      {/* ── Gyri lines (brain surface wrinkles) — clipped to brain ── */}
      <g clipPath={`url(#${clipId})`} style={{ pointerEvents: "none" }}>
        {Object.entries(GYRI).map(([lobeId, lines]) => {
          const isDimmed = !!selected && selected !== lobeId;
          return lines.map((d, i) => (
            <path key={`${lobeId}-${i}`} d={d}
              fill="none"
              stroke={`rgba(255,255,255,${isDimmed ? 0.06 : 0.18})`}
              strokeWidth="1.6"
              strokeLinecap="round"
              style={{ transition: "stroke 0.25s" }}
            />
          ));
        })}

        {/* Specular highlight */}
        <path d={L_HEMI} fill={`url(#${prefix}-g-hl)`} style={{ pointerEvents: "none" }} />
        <path d={R_HEMI} fill={`url(#${prefix}-g-hl)`} style={{ pointerEvents: "none" }} />
      </g>

      {/* ── Anatomical details ── */}
      <g style={{ pointerEvents: "none" }}>
        {/* Hemisphere outlines */}
        <path d={L_HEMI} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="1.5" />
        <path d={R_HEMI} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="1.5" />

        {/* Central longitudinal fissure — the deep groove between hemispheres */}
        <rect x="291" y="24" width="18" height="368"
          fill="url(#fissure-grad)"
          rx="9"
        />
        {/* Fissure gradient (dark center, fading to hemisphere colors) */}
        <defs>
          <linearGradient id="fissure-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor="rgba(255,255,255,0.04)" />
            <stop offset="30%"  stopColor="rgba(5,15,50,0.7)" />
            <stop offset="50%"  stopColor="rgba(3,10,40,0.85)" />
            <stop offset="70%"  stopColor="rgba(5,15,50,0.7)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.04)" />
          </linearGradient>
        </defs>

        {/* Horizontal fissure line (anterior/posterior boundary) */}
        <path d="M 64,192 C 106,186 162,183 230,183 C 262,183 280,185 291,188" fill="none" stroke="rgba(3,10,40,0.55)" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M 536,192 C 494,186 438,183 370,183 C 338,183 320,185 309,188" fill="none" stroke="rgba(3,10,40,0.55)" strokeWidth="2.5" strokeLinecap="round" />

        {/* Brain stem */}
        <path d={STEM} fill="url(#stem-grad)" />
        <defs>
          <radialGradient id="stem-grad" cx="300" cy="415" r="30" gradientUnits="userSpaceOnUse">
            <stop offset="0%"  stopColor="#2a55d0" />
            <stop offset="100%" stopColor="#0d1e7a" />
          </radialGradient>
        </defs>
        <path d={STEM} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
      </g>

      {/* ── Lobe labels (full mode only) ── */}
      {!mini && Object.entries(LOBE_LABELS).map(([id, pos]) => {
        const isDimmed = !!selected && selected !== id;
        const lobe = LOBES[id];
        return (
          <g key={id} style={{ pointerEvents: "none", userSelect: "none", transition: "opacity 0.25s", opacity: isDimmed ? 0.22 : 1 }}>
            <text x={pos.x} y={pos.y} textAnchor="middle"
              fill="rgba(255,255,255,0.95)" fontSize="18" fontWeight="700"
              fontFamily={FONT_HEAD} letterSpacing="-0.3">
              {lobe.label}
            </text>
            <text x={pos.x} y={pos.y + 20} textAnchor="middle"
              fill="rgba(255,255,255,0.55)" fontSize="11" fontFamily={FONT_BODY}
              fontWeight="500">
              {lobe.subtitle}
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
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        display: "flex", alignItems: "center", gap: 5,
        padding: "5px 11px", borderRadius: 7, cursor: "pointer",
        border: `1px solid ${hov ? color + "50" : BORDER}`,
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

// ─── Section card (light theme) ───────────────────────────────────────────────

function SectionCard({ section, lobeColor, isExcluded, annotation, onToggleExclude, onSaveAnnotation }) {
  const [hov, setHov]       = useState(false);
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
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

      {/* Content */}
      <pre style={{
        fontFamily: FONT_MONO, fontSize: "0.75rem", lineHeight: 1.7,
        color: isExcluded ? "#d1d5db" : "#374151",
        whiteSpace: "pre-wrap", wordBreak: "break-word",
        margin: 0, textDecoration: isExcluded ? "line-through" : "none",
      }}>
        {section.content}
      </pre>

      {/* Annotation display */}
      {annotation && !editing && !isExcluded && (
        <div style={{
          marginTop: 12, padding: "10px 14px",
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
  0%,100% { transform: translateY(0px);    filter: drop-shadow(0 12px 40px rgba(29,78,216,0.22)) drop-shadow(0 4px 12px rgba(0,0,0,0.08)); }
  50%      { transform: translateY(-6px);   filter: drop-shadow(0 20px 52px rgba(29,78,216,0.32)) drop-shadow(0 8px 20px rgba(0,0,0,0.1)); }
}
.brain-float { animation: brain-float 4s ease-in-out infinite; }

@keyframes lp { 0%,100% { opacity:1; } 50% { opacity:0.78; } }
.lp0 { animation: lp 3.6s ease-in-out 0s    infinite; }
.lp1 { animation: lp 3.6s ease-in-out 0.9s  infinite; }
.lp2 { animation: lp 3.6s ease-in-out 1.8s  infinite; }
.lp3 { animation: lp 3.6s ease-in-out 2.7s  infinite; }
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

  // Brain display size
  const brainW = isMobile ? 320 : Math.min(560, window?.innerWidth - SIDEBAR_WIDTH - 80 || 560);
  const brainH = Math.round(brainW * (435 / 600));

  return (
    <div style={{ marginLeft: ml, minHeight: "100vh", background: PAGE_BG, paddingBottom: pb }}>
      <style>{CSS}</style>
      <Toast message={toast} />

      <AnimatePresence mode="wait">

        {/* ── IDLE: full brain centered ──────────────────────────────── */}
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
            {/* Title */}
            <div style={{ textAlign: "center", marginBottom: 52 }}>
              <h1 style={{
                margin: "0 0 12px",
                fontFamily: FONT_HEAD, fontWeight: 800,
                fontSize: isMobile ? "2.6rem" : "3.8rem",
                color: TEXT, letterSpacing: "-0.05em", lineHeight: 1,
              }}>
                Mind
              </h1>
              <p style={{
                margin: 0, fontFamily: FONT_BODY, fontSize: isMobile ? "0.95rem" : "1.05rem",
                color: MUTED, lineHeight: 1.5, maxWidth: 420,
              }}>
                {loading ? "Loading your context…" : "Click a region to explore what Mentora knows about you"}
              </p>
            </div>

            {/* Brain */}
            {loading ? (
              <div style={{
                width: brainW, height: brainH,
                background: "linear-gradient(135deg, rgba(59,130,246,0.1) 0%, rgba(29,78,216,0.06) 100%)",
                borderRadius: "50%",
                animation: "brain-float 3s ease-in-out infinite",
              }} />
            ) : (
              <div className="brain-float" style={{ cursor: "default" }}>
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
                marginTop: 36, fontFamily: FONT_BODY, fontSize: "0.82rem",
                color: "rgba(107,114,128,0.6)", letterSpacing: "0.02em",
              }}>
                4 regions · {sections.length} context sections
              </p>
            )}
          </motion.div>
        )}

        {/* ── SELECTED: mini brain + cards ──────────────────────────── */}
        {selected && selectedLobe && (
          <motion.div key={`sel-${selected}`}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            style={{ minHeight: "100vh" }}
          >
            {/* Sticky header */}
            <div style={{
              display: "flex", alignItems: "center",
              gap: isMobile ? 16 : 28,
              padding: isMobile ? "16px 16px" : "20px 40px",
              borderBottom: `1px solid ${BORDER}`,
              background: PAGE_BG,
              position: "sticky", top: 0, zIndex: 20,
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
            }}>
              {/* Mini brain (still interactive) */}
              <div style={{
                flexShrink: 0,
                filter: "drop-shadow(0 4px 16px rgba(29,78,216,0.18))",
              }}>
                <BrainSVG
                  selected={selected} hovered={hovered}
                  onLobeClick={id => setSelected(id)}
                  onLobeHover={setHovered}
                  mini={true} prefix="mini"
                />
              </div>

              {/* Lobe name */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{
                  margin: "0 0 4px",
                  fontFamily: FONT_HEAD, fontWeight: 800,
                  fontSize: isMobile ? "1.7rem" : "2.2rem",
                  color: selectedLobe.color, letterSpacing: "-0.04em", lineHeight: 1,
                }}>
                  {selectedLobe.label}
                </h2>
                <p style={{ margin: 0, fontFamily: FONT_BODY, fontSize: "0.9rem", color: MUTED }}>
                  {selectedLobe.subtitle}
                </p>
              </div>

              {/* Back button */}
              <button onClick={() => setSelected(null)} style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "9px 16px", borderRadius: 9, flexShrink: 0,
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
