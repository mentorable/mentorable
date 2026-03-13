import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "./lib/supabase.js";

// ─── Themes ───────────────────────────────────────────────────────────────────
const themes = [
  { name: "Ocean",   accent: "#3b82f6", glow: "rgba(59,130,246,0.25)",   rgb: "59,130,246"   },
  { name: "Violet",  accent: "#8b5cf6", glow: "rgba(139,92,246,0.25)",   rgb: "139,92,246"   },
  { name: "Emerald", accent: "#10b981", glow: "rgba(16,185,129,0.25)",   rgb: "16,185,129"   },
  { name: "Rose",    accent: "#f43f5e", glow: "rgba(244,63,94,0.25)",    rgb: "244,63,94"    },
  { name: "Amber",   accent: "#f59e0b", glow: "rgba(245,158,11,0.25)",   rgb: "245,158,11"   },
  { name: "Slate",   accent: "#94a3b8", glow: "rgba(148,163,184,0.25)",  rgb: "148,163,184"  },
];

const DEFAULT_AXES = ["Problem Solving", "Communication", "Creativity", "Leadership", "Technical"];
const SCORES = [95, 88, 80, 72, 64];

// ─── Background shape definitions (zone grid — left/right edges only) ─────────
const SHAPES = [
  // TOP ROW
  { id: 0,  type: "ring",     size: 120, top: "3%",  left: "2%",  rotation: 0,  delay: 0   },
  { id: 1,  type: "square",   size: 55,  top: "2%",  left: "18%", rotation: 45, delay: 0.5 },
  { id: 2,  type: "triangle", size: 60,  top: "5%",  left: "35%", rotation: 0,  delay: 1   },
  { id: 3,  type: "ring",     size: 80,  top: "1%",  left: "55%", rotation: 0,  delay: 0.3 },
  { id: 4,  type: "square",   size: 45,  top: "4%",  left: "72%", rotation: 20, delay: 0.8 },
  { id: 5,  type: "ring",     size: 100, top: "2%",  left: "88%", rotation: 0,  delay: 0.2 },
  // UPPER MIDDLE ROW
  { id: 6,  type: "triangle", size: 50,  top: "20%", left: "1%",  rotation: 30, delay: 0.6 },
  { id: 7,  type: "ring",     size: 70,  top: "18%", left: "14%", rotation: 0,  delay: 0.4 },
  { id: 8,  type: "square",   size: 40,  top: "22%", left: "78%", rotation: 15, delay: 0.7 },
  { id: 9,  type: "triangle", size: 65,  top: "19%", left: "91%", rotation: 60, delay: 0.1 },
  // MIDDLE ROW
  { id: 10, type: "ring",     size: 150, top: "38%", left: "-3%", rotation: 0,  delay: 0.9 },
  { id: 11, type: "square",   size: 50,  top: "42%", left: "10%", rotation: 30, delay: 0.3 },
  { id: 12, type: "square",   size: 60,  top: "40%", left: "83%", rotation: 45, delay: 0.5 },
  { id: 13, type: "ring",     size: 90,  top: "45%", left: "94%", rotation: 0,  delay: 0.2 },
  // LOWER MIDDLE ROW
  { id: 14, type: "triangle", size: 55,  top: "62%", left: "3%",  rotation: 15, delay: 0.8 },
  { id: 15, type: "ring",     size: 75,  top: "60%", left: "15%", rotation: 0,  delay: 0.6 },
  { id: 16, type: "square",   size: 45,  top: "65%", left: "79%", rotation: 20, delay: 0.4 },
  { id: 17, type: "triangle", size: 70,  top: "63%", left: "90%", rotation: 45, delay: 0.1 },
  // BOTTOM ROW
  { id: 18, type: "ring",     size: 110, top: "80%", left: "1%",  rotation: 0,  delay: 0.7 },
  { id: 19, type: "square",   size: 50,  top: "82%", left: "16%", rotation: 30, delay: 0.3 },
  { id: 20, type: "triangle", size: 60,  top: "85%", left: "75%", rotation: 10, delay: 0.5 },
  { id: 21, type: "ring",     size: 95,  top: "78%", left: "88%", rotation: 0,  delay: 0.9 },
  { id: 22, type: "square",   size: 65,  top: "90%", left: "50%", rotation: 45, delay: 0.2 },
];

// ─── Label helpers ────────────────────────────────────────────────────────────
const truncateLabel = (label) => {
  const words = label.split(" ").filter((w) => w.length > 2);
  return words.slice(0, 2).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
};

const renderLabel = (text, x, y) => {
  const processed = truncateLabel(text);
  const words = processed.split(" ");
  const baseProps = {
    textAnchor: "middle",
    fill: "rgba(255,255,255,0.78)",
    fontSize: "12",
    fontFamily: "system-ui, sans-serif",
    style: { userSelect: "none" },
  };
  if (words.length === 1) {
    return <text {...baseProps} x={x} y={y}>{words[0]}</text>;
  }
  return (
    <text {...baseProps} x={x} y={y}>
      <tspan x={x} dy="-0.6em">{words[0]}</tspan>
      <tspan x={x} dy="1.2em">{words[1]}</tspan>
    </text>
  );
};

// ─── Spinner ──────────────────────────────────────────────────────────────────
function Spinner({ color = "#0f172a" }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      style={{ animation: "sc-spin 0.75s linear infinite", flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" stroke="rgba(0,0,0,0.15)" strokeWidth="3" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke={color} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// ─── Radar Chart ──────────────────────────────────────────────────────────────
function RadarChart({ axes, scores, theme }) {
  const R = 80;
  const N = 5;
  const LABEL_R = 128;

  const polar = (r, deg) => {
    const rad = (Math.PI / 180) * deg;
    return [r * Math.cos(rad), r * Math.sin(rad)];
  };
  const axisAngle = (i) => -90 + i * (360 / N);

  const dataPoints = scores.map((s, i) => polar((s / 100) * R, axisAngle(i)));
  const dataPath = dataPoints.map((p, i) =>
    `${i === 0 ? "M" : "L"}${p[0].toFixed(2)},${p[1].toFixed(2)}`
  ).join(" ") + " Z";

  const gridPath = (level) => {
    const pts = Array.from({ length: N }, (_, i) => polar(R * level, axisAngle(i)));
    return pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(" ") + " Z";
  };

  return (
    <svg viewBox="-180 -180 360 360"
      style={{ width: "100%", maxWidth: 240, height: "auto", display: "block", overflow: "visible", margin: "0 auto" }}>
      {[0.33, 0.66, 1].map((lvl, i) => (
        <path key={i} d={gridPath(lvl)} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
      ))}
      {Array.from({ length: N }, (_, i) => {
        const [x, y] = polar(R, axisAngle(i));
        return <line key={i} x1="0" y1="0" x2={x.toFixed(2)} y2={y.toFixed(2)} stroke="rgba(255,255,255,0.15)" strokeWidth="1" />;
      })}
      <path d={dataPath} fill={`rgba(${theme.rgb},0.18)`} style={{ transition: "fill 300ms ease" }} />
      <path d={dataPath} fill="none" stroke={theme.accent} strokeWidth="2.5"
        strokeLinecap="round" strokeLinejoin="round"
        style={{
          strokeDasharray: 1000, strokeDashoffset: 1000,
          animation: "sc-radar-draw 1.2s ease-out forwards",
          animationDelay: "0.3s",
          transition: "stroke 300ms ease",
        }}
      />
      {dataPoints.map((p, i) => (
        <circle key={i} cx={p[0].toFixed(2)} cy={p[1].toFixed(2)} r="4"
          fill={theme.accent}
          style={{
            opacity: 0, animation: "sc-dot-appear 0.3s ease-out forwards",
            animationDelay: `${1.2 + i * 0.08}s`,
            transition: "fill 300ms ease",
          }}
        />
      ))}
      {Array.from({ length: N }, (_, i) => {
        const [lx, ly] = polar(LABEL_R, axisAngle(i));
        return (
          <g key={i}>
            {renderLabel(axes[i], parseFloat(lx.toFixed(2)), parseFloat(ly.toFixed(2)))}
          </g>
        );
      })}
    </svg>
  );
}

// ─── Section Label ────────────────────────────────────────────────────────────
function SectionLabel({ children, color }) {
  return (
    <p style={{
      fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.1em",
      textTransform: "uppercase", color,
      marginBottom: "0.5rem",
      transition: "color 300ms ease",
    }}>
      {children}
    </p>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
const shimmerLight = {
  background: "linear-gradient(90deg, rgba(148,163,184,0.1) 25%, rgba(148,163,184,0.22) 50%, rgba(148,163,184,0.1) 75%)",
  backgroundSize: "400px 100%",
  animation: "sc-shimmer 1.5s infinite",
};
const shimmerDark = {
  background: "linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.04) 75%)",
  backgroundSize: "400px 100%",
  animation: "sc-shimmer 1.5s infinite",
};

function SBlock({ w = "100%", h = 14, br = "0.5rem", dark = false, mb = 0 }) {
  return <div style={{ ...(dark ? shimmerDark : shimmerLight), width: w, height: h, borderRadius: br, marginBottom: mb || 0 }} />;
}

function SkeletonLayout({ theme }) {
  const panelStyle = {
    background: "#f1f5f9",
    border: `2px solid ${theme.accent}`,
    borderTop: `4px solid ${theme.accent}`,
    borderRadius: "1.25rem",
    padding: "1.5rem",
    height: "100%",
    boxShadow: `0 4px 24px rgba(0,0,0,0.08), 0 0 0 1px ${theme.accent}20`,
    transition: "border-color 0.3s ease",
  };
  return (
    <div className="sc-layout" style={{ margin: "0 auto" }}>
      <div className="sc-left-panel">
        <div style={panelStyle}>
          <SBlock w={70} h={10} mb={10} /><SBlock h={14} mb={6} />
          <SBlock w="85%" h={14} mb={6} /><SBlock w="70%" h={14} mb={20} />
          <SBlock w={70} h={10} mb={10} /><SBlock h={52} br="0.75rem" mb={20} />
          <SBlock w={65} h={10} mb={10} />
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
            {[85, 105, 70, 90].map((w, i) => <SBlock key={i} w={w} h={28} br="2rem" />)}
          </div>
        </div>
      </div>
      <div className="sc-center-col">
        <div style={{
          background: "#0f172a", borderRadius: "1.5rem",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 25px 60px rgba(0,0,0,0.25)", padding: "2rem", width: "100%",
        }}>
          <SBlock dark w={110} h={18} mb={28} />
          <SBlock dark h={260} br="1rem" mb={24} />
          <SBlock dark w={90} h={11} mb={12} />
          {[1, 2, 3].map((i) => <SBlock key={i} dark h={52} br="0.75rem" mb={8} />)}
        </div>
      </div>
      <div className="sc-right-panel">
        <div style={panelStyle}>
          <SBlock w={75} h={10} mb={10} />
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: 20 }}>
            {[90, 110, 80, 120, 95].map((w, i) => <SBlock key={i} w={w} h={28} br="2rem" />)}
          </div>
          <SBlock w={95} h={10} mb={10} />
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
            {[100, 80, 110].map((w, i) => <SBlock key={i} w={w} h={28} br="2rem" />)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ScorecardPage ────────────────────────────────────────────────────────────
export default function ScorecardPage() {
  const [phase, setPhase] = useState("loading");
  const [profile, setProfile] = useState(null);
  const [theme, setTheme] = useState(themes[0]);
  const [downloading, setDownloading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  // ── CSS custom properties ─────────────────────────────────────────────────
  useEffect(() => {
    document.documentElement.style.setProperty("--theme-accent", theme.accent);
    document.documentElement.style.setProperty("--theme-glow", theme.glow);
    document.documentElement.style.setProperty("--theme-rgb", theme.rgb);
  }, [theme]);

  // ── Auth guard + data load ────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { window.location.href = "/auth"; return; }
        const { data: profileData } = await supabase
          .from("profiles").select("*").eq("id", user.id).single();
        if (!profileData?.onboarding_completed) { window.location.href = "/onboarding"; return; }
        setProfile(profileData);
        setPhase("loaded");
      } catch {
        setPhase("error");
      }
    };
    load();
  }, []);

  // ── html2canvas capture ───────────────────────────────────────────────────
  const captureCard = async () => {
    const html2canvas = (await import("html2canvas")).default;
    const card = document.getElementById("scorecard-card");
    return html2canvas(card, { backgroundColor: "#0f172a", scale: 2, useCORS: true });
  };

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const canvas = await captureCard();
      const link = document.createElement("a");
      link.download = "mentorable-scorecard.png";
      link.href = canvas.toDataURL("image/png");
      link.click();
    } finally { setDownloading(false); }
  };

  const handleShareImage = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const canvas = await captureCard();
      await new Promise((resolve) => {
        canvas.toBlob(async (blob) => {
          const file = new File([blob], "mentorable-scorecard.png", { type: "image/png" });
          if (navigator.share && navigator.canShare({ files: [file] })) {
            await navigator.share({
              title: "My Mentorable Career Scorecard",
              text: "Check out my career scorecard from Mentorable!",
              files: [file],
            });
          } else {
            const link = document.createElement("a");
            link.download = "mentorable-scorecard.png";
            link.href = canvas.toDataURL("image/png");
            link.click();
          }
          resolve();
        });
      });
    } finally { setSharing(false); }
  };

  const handleShareLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2200);
  };

  // ── Shape renderer ────────────────────────────────────────────────────────
  const renderShape = (shape) => {
    const baseStyle = {
      position: "fixed",
      top: shape.top,
      left: shape.left,
      pointerEvents: "none",
      zIndex: 0,
      transition: "border-color 300ms ease, background 300ms ease",
    };

    if (shape.type === "ring") return (
      <motion.div
        key={shape.id}
        animate={{ rotate: [shape.rotation, shape.rotation + 360] }}
        transition={{ duration: 15 + shape.delay * 5, repeat: Infinity, ease: "linear" }}
        style={{
          ...baseStyle,
          width: shape.size, height: shape.size,
          borderRadius: "50%",
          border: `3px solid ${theme.accent}`,
          opacity: 0.42,
        }}
      />
    );

    if (shape.type === "square") return (
      <motion.div
        key={shape.id}
        animate={{ rotate: [shape.rotation, shape.rotation + 360] }}
        transition={{ duration: 20 + shape.delay * 4, repeat: Infinity, ease: "linear" }}
        style={{
          ...baseStyle,
          width: shape.size, height: shape.size,
          border: `3px solid ${theme.accent}`,
          borderRadius: "8px",
          opacity: 0.38,
        }}
      />
    );

    if (shape.type === "triangle") return (
      <motion.div
        key={shape.id}
        animate={{ y: [-8, 8, -8] }}
        transition={{ duration: 4 + shape.delay * 2, repeat: Infinity, ease: "easeInOut" }}
        style={{
          ...baseStyle,
          width: 0, height: 0,
          border: "none",
          borderLeft: `${shape.size / 2}px solid transparent`,
          borderRight: `${shape.size / 2}px solid transparent`,
          borderBottom: `${shape.size}px solid ${theme.accent}`,
          transform: `rotate(${shape.rotation}deg)`,
          opacity: 0.35,
        }}
      />
    );

    return null;
  };

  // ── Derived data ──────────────────────────────────────────────────────────
  const axes = profile ? [...(profile.strengths || [])].slice(0, 5) : [];
  while (axes.length < 5) axes.push(DEFAULT_AXES[axes.length]);
  const careerMatches = (profile?.career_matches || []).slice(0, 3);
  const strengths = profile?.strengths || [];
  const weaknesses = profile?.weaknesses || [];
  const interests = profile?.interests || [];

  const pillBase = {
    display: "inline-flex", alignItems: "center",
    padding: "0.4rem 0.9rem",
    borderRadius: "2rem",
    fontSize: "0.83rem",
    fontWeight: 500,
  };

  const panelStyle = {
    background: "#f1f5f9",
    border: `2px solid ${theme.accent}`,
    borderTop: `4px solid ${theme.accent}`,
    borderRadius: "1.25rem",
    padding: "1.5rem",
    height: "100%",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    boxShadow: `0 4px 24px rgba(0,0,0,0.08), 0 0 0 1px ${theme.accent}20`,
    transition: "border-color 0.3s ease",
  };

  const sectionStyle = {
    background: "#ffffff",
    border: `2px solid ${theme.accent}60`,
    borderRadius: "0.875rem",
    padding: "1rem",
    marginBottom: "0.75rem",
    boxShadow: `0 2px 8px ${theme.accent}15`,
    transition: "border-color 0.3s ease, box-shadow 0.3s ease",
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      position: "relative",
      fontFamily: "system-ui, sans-serif",
      padding: "3rem 1.5rem 5rem",
      background: `linear-gradient(135deg, #f8fafc 0%, ${theme.accent}12 50%, #f1f5f9 100%)`,
      transition: "background 300ms ease",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        @keyframes sc-float      { 0%,100% { transform: translateY(0) }   50% { transform: translateY(-6px) } }
        @keyframes sc-shimmer    { 0%   { background-position: -400px 0 } 100% { background-position: 400px 0 } }
        @keyframes sc-radar-draw { from { stroke-dashoffset: 1000 }        to   { stroke-dashoffset: 0 } }
        @keyframes sc-dot-appear { from { opacity: 0; transform: scale(0) } to  { opacity: 1; transform: scale(1) } }
        @keyframes sc-spin       { to   { transform: rotate(360deg); } }

        .sc-layout {
          display: flex; flex-direction: row; gap: 2rem;
          align-items: flex-start; width: 100%; max-width: 1060px;
        }
        .sc-left-panel  { width: 280px; flex-shrink: 0; }
        .sc-right-panel { width: 280px; flex-shrink: 0; }
        .sc-center-col  {
          flex: 1; min-width: 0;
          display: flex; flex-direction: column; align-items: center; gap: 1.5rem;
        }
        @media (max-width: 920px) {
          .sc-layout { flex-direction: column; align-items: center; }
          .sc-left-panel, .sc-right-panel { width: 100%; max-width: 480px; }
          .sc-center-col { width: 100%; max-width: 480px; order: -1; }
          .sc-left-panel  { order: 0; }
          .sc-right-panel { order: 1; }
        }

        .sc-action-btn {
          display: inline-flex; align-items: center; gap: 0.5rem;
          padding: 0.675rem 1.2rem;
          border: 1.5px solid #0f172a; border-radius: 0.75rem;
          background: transparent; color: #0f172a;
          font-size: 0.875rem; font-weight: 600;
          cursor: pointer; white-space: nowrap;
          font-family: system-ui, sans-serif;
          transition: background 0.18s, color 0.18s, transform 0.15s;
        }
        .sc-action-btn:hover:not(:disabled) { background: #0f172a; color: white; transform: translateY(-1px); }
        .sc-action-btn:disabled { opacity: 0.55; cursor: not-allowed; }

        .sc-career-card {
          transition: background 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
        }
        .sc-career-card:hover {
          background: rgba(255,255,255,0.1) !important;
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(0,0,0,0.18);
        }

        .sc-theme-dot {
          width: 22px; height: 22px; border-radius: 50%;
          cursor: pointer; border: none; padding: 0; flex-shrink: 0;
          transition: transform 0.15s, box-shadow 0.15s;
        }
        .sc-theme-dot:hover { transform: scale(1.2); }
      `}</style>

      {/* ══ BG LAYER 0 — grid lines ════════════════════════════════════════ */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none",
        backgroundImage: `
          linear-gradient(${theme.accent}25 1.5px, transparent 1.5px),
          linear-gradient(90deg, ${theme.accent}25 1.5px, transparent 1.5px)
        `,
        backgroundSize: "50px 50px",
      }} />
      <div style={{
        position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none",
        backgroundImage: `linear-gradient(45deg, ${theme.accent}10 25%, transparent 25%)`,
        backgroundSize: "100px 100px",
      }} />

      {/* ══ BG LAYER 1 — large orbs ════════════════════════════════════════ */}
      <div style={{
        position: "fixed", top: "-15%", right: "-10%",
        width: 700, height: 700, borderRadius: "50%",
        background: `radial-gradient(circle, ${theme.accent}50 0%, ${theme.accent}20 40%, transparent 70%)`,
        filter: "blur(40px)", pointerEvents: "none", zIndex: 0,
        transition: "background 300ms ease",
      }} />
      <div style={{
        position: "fixed", bottom: "-15%", left: "-10%",
        width: 600, height: 600, borderRadius: "50%",
        background: `radial-gradient(circle, ${theme.accent}45 0%, ${theme.accent}15 40%, transparent 70%)`,
        filter: "blur(50px)", pointerEvents: "none", zIndex: 0,
        transition: "background 300ms ease",
      }} />
      <div style={{
        position: "fixed", top: "30%", left: "-5%",
        width: 350, height: 350, borderRadius: "50%",
        background: `radial-gradient(circle, ${theme.accent}35 0%, transparent 70%)`,
        filter: "blur(40px)", pointerEvents: "none", zIndex: 0,
        transition: "background 300ms ease",
      }} />
      <div style={{
        position: "fixed", top: "40%", right: "-5%",
        width: 350, height: 350, borderRadius: "50%",
        background: `radial-gradient(circle, ${theme.accent}35 0%, transparent 70%)`,
        filter: "blur(40px)", pointerEvents: "none", zIndex: 0,
        transition: "background 300ms ease",
      }} />

      {/* ══ BG LAYER 2 — floating shapes (zone grid) ═══════════════════════ */}
      {SHAPES.map((shape) => renderShape(shape))}

      {/* ══ CONTENT ═══════════════════════════════════════════════════════ */}
      <div style={{ position: "relative", zIndex: 1, width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>

        {phase === "loading" && <SkeletonLayout theme={theme} />}

        {phase === "error" && (
          <div style={{
            background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)",
            borderRadius: "1rem", padding: "2rem", textAlign: "center", maxWidth: 420,
          }}>
            <p style={{ color: "#dc2626", fontWeight: 600, marginBottom: "0.5rem" }}>Couldn't load your scorecard.</p>
            <button onClick={() => window.location.reload()}
              style={{ color: "#1d4ed8", background: "none", border: "none", cursor: "pointer", fontSize: "0.875rem", fontWeight: 600, textDecoration: "underline" }}>
              Try again
            </button>
          </div>
        )}

        {phase === "loaded" && profile && (
          <motion.div
            className="sc-layout"
            initial="hidden" animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.08 } } }}
            style={{ margin: "0 auto" }}
          >
            {/* ══ LEFT PANEL ══════════════════════════════════════════════ */}
            <motion.div className="sc-left-panel"
              variants={{ hidden: { opacity: 0, x: -30 }, visible: { opacity: 1, x: 0, transition: { duration: 0.55, ease: [0.22,1,0.36,1] } } }}>
              <div style={panelStyle}>
                {profile.onboarding_summary && (
                  <div style={sectionStyle}>
                    <SectionLabel color={theme.accent}>About You</SectionLabel>
                    <p style={{ color: "#0f172a", fontSize: "0.9rem", lineHeight: 1.65 }}>
                      {profile.onboarding_summary}
                    </p>
                  </div>
                )}
                {profile.work_style && (
                  <div style={sectionStyle}>
                    <SectionLabel color={theme.accent}>Work Style</SectionLabel>
                    <div style={{ paddingLeft: "0.25rem" }}>
                      <p style={{ color: "#374151", fontSize: "0.875rem", lineHeight: 1.55 }}>
                        {profile.work_style}
                      </p>
                    </div>
                  </div>
                )}
                {interests.length > 0 && (
                  <div style={{ ...sectionStyle, marginBottom: 0 }}>
                    <SectionLabel color={theme.accent}>Interests</SectionLabel>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                      {interests.map((item, i) => (
                        <span key={i} style={{
                          ...pillBase,
                          background: `${theme.accent}12`,
                          border: `1.5px solid ${theme.accent}70`,
                          color: "#0f172a",
                          transition: "background 300ms ease, border-color 300ms ease",
                        }}>
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>

            {/* ══ CENTER COLUMN ════════════════════════════════════════════ */}
            <motion.div className="sc-center-col"
              variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22,1,0.36,1] } } }}>

              <div
                id="scorecard-card"
                style={{
                  background: "#0f172a",
                  borderRadius: "1.5rem",
                  border: `1px solid rgba(${theme.rgb},0.35)`,
                  boxShadow: `0 25px 60px rgba(0,0,0,0.28), 0 0 100px ${theme.glow}`,
                  padding: "2rem",
                  width: "100%",
                  position: "relative",
                  overflow: "hidden",
                  animation: "sc-float 3s ease-in-out infinite",
                  transition: "border-color 300ms ease, box-shadow 300ms ease",
                }}
              >
                <div style={{
                  position: "absolute", inset: 0, pointerEvents: "none", borderRadius: "1.5rem",
                  background: `linear-gradient(135deg, rgba(${theme.rgb},0.15) 0%, transparent 60%)`,
                  transition: "background 300ms ease",
                }} />
                <div style={{ position: "relative", zIndex: 1 }}>
                  {/* Card header */}
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    paddingBottom: "1rem", borderBottom: "1px solid rgba(255,255,255,0.1)", marginBottom: "1.5rem",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                        fontWeight: 800, fontSize: "1rem", color: "white", letterSpacing: "-0.02em",
                      }}>
                        mentorable
                      </span>
                      <span style={{
                        width: 6, height: 6, borderRadius: "50%",
                        background: theme.accent, display: "inline-block", marginBottom: 2,
                        boxShadow: `0 0 8px ${theme.accent}`, flexShrink: 0,
                        transition: "background 300ms ease, box-shadow 300ms ease",
                      }} />
                    </div>
                    <span style={{
                      fontSize: "0.68rem", fontWeight: 700,
                      color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em", textTransform: "uppercase",
                    }}>
                      Career Profile
                    </span>
                  </div>

                  {/* Radar chart */}
                  <div style={{ marginBottom: "1.75rem" }}>
                    <RadarChart axes={axes} scores={SCORES} theme={theme} />
                  </div>

                  {/* Career matches */}
                  {careerMatches.length > 0 && (
                    <div>
                      <p style={{
                        fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.1em",
                        textTransform: "uppercase", color: theme.accent, marginBottom: "0.75rem",
                        transition: "color 300ms ease",
                      }}>
                        Top Matches
                      </p>
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                        {careerMatches.map((career, i) => (
                          <motion.div
                            key={i}
                            className="sc-career-card"
                            initial={{ opacity: 0, x: -16 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.4, delay: 0.4 + i * 0.1, ease: [0.22,1,0.36,1] }}
                            style={{
                              display: "flex", alignItems: "center", gap: "0.75rem",
                              background: "rgba(255,255,255,0.05)",
                              borderLeft: `3px solid ${theme.accent}`,
                              borderRadius: "0.75rem", padding: "0.8rem 1rem",
                              transition: "border-color 300ms ease",
                            }}
                          >
                            <span style={{
                              fontFamily: "'Plus Jakarta Sans', sans-serif",
                              fontWeight: 800, fontSize: "0.8rem", color: theme.accent, minWidth: 26,
                              transition: "color 300ms ease",
                            }}>
                              #{i + 1}
                            </span>
                            <span style={{
                              fontFamily: "'Plus Jakarta Sans', sans-serif",
                              fontWeight: 700, fontSize: "0.95rem", color: "rgba(255,255,255,0.95)",
                            }}>
                              {career}
                            </span>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Theme switcher */}
              <motion.div
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem" }}
              >
                <div style={{ display: "flex", gap: "0.625rem", alignItems: "center" }}>
                  {themes.map((t) => (
                    <button
                      key={t.name}
                      className="sc-theme-dot"
                      title={t.name}
                      onClick={() => setTheme(t)}
                      style={{
                        background: t.accent,
                        boxShadow: theme.name === t.name
                          ? `0 0 0 2.5px #f1f5f9, 0 0 0 4.5px ${t.accent}`
                          : "none",
                        transform: theme.name === t.name ? "scale(1.2)" : "scale(1)",
                      }}
                    />
                  ))}
                </div>
                <p style={{ fontSize: "0.75rem", color: "#64748b", letterSpacing: "0.03em" }}>
                  Customize your card
                </p>
              </motion.div>

              {/* Action buttons */}
              <motion.div
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", justifyContent: "center" }}
              >
                <button className="sc-action-btn" disabled={downloading} onClick={handleDownload}>
                  {downloading ? <Spinner /> : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                  )}
                  Download
                </button>

                <button className="sc-action-btn" disabled={sharing} onClick={handleShareImage}>
                  {sharing ? <Spinner /> : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                    </svg>
                  )}
                  Share image
                </button>

                <button className="sc-action-btn" onClick={handleShareLink}>
                  {linkCopied ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                    </svg>
                  )}
                  {linkCopied ? "Copied!" : "Copy link"}
                </button>

                <button
                  onClick={() => { window.location.href = "/profile-setup"; }}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: "0.5rem",
                    padding: "0.675rem 1.2rem",
                    border: "none", borderRadius: "0.75rem",
                    background: theme.accent, color: "white",
                    fontSize: "0.875rem", fontWeight: 700,
                    cursor: "pointer",
                    boxShadow: `0 4px 14px ${theme.glow}`,
                    fontFamily: "system-ui, sans-serif",
                    whiteSpace: "nowrap",
                    transition: "all 300ms ease",
                  }}
                >
                  See my roadmap →
                </button>
              </motion.div>
            </motion.div>

            {/* ══ RIGHT PANEL ══════════════════════════════════════════════ */}
            <motion.div className="sc-right-panel"
              variants={{ hidden: { opacity: 0, x: 30 }, visible: { opacity: 1, x: 0, transition: { duration: 0.55, ease: [0.22,1,0.36,1] } } }}>
              <div style={panelStyle}>
                {strengths.length > 0 && (
                  <div style={sectionStyle}>
                    <SectionLabel color={theme.accent}>Strengths</SectionLabel>
                    <motion.div
                      style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}
                      initial="hidden" animate="visible"
                      variants={{ visible: { transition: { staggerChildren: 0.05, delayChildren: 0.45 } } }}
                    >
                      {strengths.map((s, i) => (
                        <motion.span
                          key={i}
                          variants={{ hidden: { opacity: 0, scale: 0.85 }, visible: { opacity: 1, scale: 1 } }}
                          style={{
                            ...pillBase,
                            background: `${theme.accent}12`,
                            border: `1.5px solid ${theme.accent}70`,
                            color: "#0f172a",
                            transition: "background 300ms ease, border-color 300ms ease",
                          }}
                        >
                          {s}
                        </motion.span>
                      ))}
                    </motion.div>
                  </div>
                )}
                {weaknesses.length > 0 && (
                  <div style={{ ...sectionStyle, marginBottom: 0 }}>
                    <SectionLabel color="#64748b">Growth Areas</SectionLabel>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                      {weaknesses.map((w, i) => (
                        <span key={i} style={{
                          ...pillBase,
                          background: "rgba(148,163,184,0.12)",
                          border: "1px solid rgba(148,163,184,0.28)",
                          color: "#374151",
                        }}>
                          {w}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </div>

      {/* ── Toast ─────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {linkCopied && (
          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.22, ease: [0.22,1,0.36,1] }}
            style={{
              position: "fixed", bottom: "2rem",
              left: 0, right: 0,
              display: "flex", justifyContent: "center",
              pointerEvents: "none", zIndex: 200,
            }}
          >
            <div style={{
              background: "#0f172a", color: "white",
              padding: "0.75rem 1.25rem", borderRadius: "0.75rem",
              fontSize: "0.875rem", fontWeight: 600,
              boxShadow: "0 8px 28px rgba(0,0,0,0.22)",
              display: "flex", alignItems: "center", gap: "0.5rem",
              pointerEvents: "auto",
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Link copied to clipboard
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
