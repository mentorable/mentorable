import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../lib/supabase.js";
import { getCache, setCache, getKnownUserId, setKnownUserId, invalidateCache } from "../lib/cache.js";
import { fetchUsage, LIMITS } from "../lib/usage.js";
import LimitModal from "../components/common/LimitModal.jsx";
import Spinner from "../components/common/Spinner.jsx";
import { SIDEBAR_WIDTH } from "../components/common/Sidebar.jsx";

const SANS = "'Space Grotesk', sans-serif";
const LANGGRAPH_URL = import.meta.env.VITE_LANGGRAPH_CHAT_URL;

// ─── The 5 standardized axes ──────────────────────────────────────────────────
const AXES = [
  { key: "communication",  label: "Communication",  blurb: "How clearly you articulate your ideas" },
  { key: "leadership",     label: "Leadership",     blurb: "Initiative and bringing others along" },
  { key: "technicality",   label: "Technicality",   blurb: "Depth of knowledge and proficiency" },
  { key: "resourcefulness",label: "Resourcefulness",blurb: "Your capacity to self-educate" },
  { key: "execution",      label: "Execution",      blurb: "Turning knowledge into finished work" },
];

// ─── Card color themes (recolor the shareable radar card) ─────────────────────
const themes = [
  { name: "Ocean",   accent: "#3b82f6", glow: "rgba(59,130,246,0.25)",  rgb: "59,130,246"  },
  { name: "Violet",  accent: "#8b5cf6", glow: "rgba(139,92,246,0.25)",  rgb: "139,92,246"  },
  { name: "Emerald", accent: "#10b981", glow: "rgba(16,185,129,0.25)",  rgb: "16,185,129"  },
  { name: "Rose",    accent: "#f43f5e", glow: "rgba(244,63,94,0.25)",   rgb: "244,63,94"   },
  { name: "Amber",   accent: "#f59e0b", glow: "rgba(245,158,11,0.25)",  rgb: "245,158,11"  },
];

const DEFAULT = 40;
const clamp = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));

// ─── Count-up hook ────────────────────────────────────────────────────────────
function useCountUp(target, duration = 1100, start = true) {
  const [val, setVal] = useState(0);
  const raf = useRef(null);
  useEffect(() => {
    if (!start) { setVal(target); return; }
    const t0 = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(target * eased));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => raf.current && cancelAnimationFrame(raf.current);
  }, [target, duration, start]);
  return val;
}

// ─── Readiness ring ───────────────────────────────────────────────────────────
function ReadinessRing({ value, accent }) {
  const display = useCountUp(value);
  const R = 64, C = 2 * Math.PI * R;
  return (
    <div style={{ position: "relative", width: 156, height: 156, flexShrink: 0 }}>
      <svg width="156" height="156" viewBox="0 0 156 156" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="78" cy="78" r={R} fill="none" stroke="rgba(29,78,216,0.10)" strokeWidth="11" />
        <motion.circle
          cx="78" cy="78" r={R} fill="none" stroke={accent} strokeWidth="11" strokeLinecap="round"
          strokeDasharray={C}
          initial={{ strokeDashoffset: C }}
          animate={{ strokeDashoffset: C * (1 - value / 100) }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
        />
      </svg>
      <div style={{
        position: "absolute", inset: 0, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: "2.5rem", color: "#141413", lineHeight: 1, letterSpacing: "-0.03em" }}>
          {display}
        </span>
        <span style={{ fontFamily: SANS, fontWeight: 600, fontSize: "0.7rem", color: "#6a6760", letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 4 }}>
          Career Ready
        </span>
      </div>
    </div>
  );
}

// ─── Radar (standardized 5 axes, real scores, clickable) ──────────────────────
function RadarChart({ scores, weakSet, theme, onAxisClick }) {
  const R = 96, N = 5, LABEL_R = 132;
  const polar = (r, deg) => {
    const rad = (Math.PI / 180) * deg;
    return [r * Math.cos(rad), r * Math.sin(rad)];
  };
  const angle = (i) => -90 + i * (360 / N);
  const pts = scores.map((s, i) => polar((s / 100) * R, angle(i)));
  const dataPath = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ") + " Z";
  const grid = (lvl) =>
    Array.from({ length: N }, (_, i) => polar(R * lvl, angle(i)))
      .map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ") + " Z";

  return (
    <svg viewBox="-190 -176 380 352" style={{ width: "100%", maxWidth: 380, height: "auto", display: "block", margin: "0 auto", overflow: "visible" }}>
      {[0.25, 0.5, 0.75, 1].map((lvl, i) => (
        <path key={i} d={grid(lvl)} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
      ))}
      {Array.from({ length: N }, (_, i) => {
        const [x, y] = polar(R, angle(i));
        return <line key={i} x1="0" y1="0" x2={x.toFixed(1)} y2={y.toFixed(1)} stroke="rgba(255,255,255,0.12)" strokeWidth="1" />;
      })}
      <motion.path d={dataPath} fill={`rgba(${theme.rgb},0.20)`}
        initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.3 }} style={{ transformOrigin: "center" }} />
      <motion.path d={dataPath} fill="none" stroke={theme.accent} strokeWidth="2.5" strokeLinejoin="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, ease: "easeOut", delay: 0.3 }} />
      {pts.map((p, i) => (
        <motion.circle key={i} cx={p[0].toFixed(1)} cy={p[1].toFixed(1)} r="4" fill={theme.accent}
          initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1.1 + i * 0.07, type: "spring", stiffness: 400 }} />
      ))}
      {AXES.map((a, i) => {
        const [lx, ly] = polar(LABEL_R, angle(i));
        const isWeak = weakSet.has(a.key);
        const anchor = Math.abs(lx) < 12 ? "middle" : lx > 0 ? "start" : "end";
        return (
          <g key={a.key} onClick={() => onAxisClick(a.key)} style={{ cursor: "pointer" }} className={isWeak ? "sc-axis-weak" : "sc-axis"}>
            {/* generous transparent hit target */}
            <circle cx={lx.toFixed(1)} cy={(ly - 4).toFixed(1)} r="34" fill="transparent" />
            <text x={lx.toFixed(1)} y={(ly - 4).toFixed(1)} textAnchor={anchor}
              fontFamily={SANS} fontSize="12.5" fontWeight="600"
              fill={isWeak ? theme.accent : "rgba(255,255,255,0.82)"}>
              {a.label}
            </text>
            <text x={lx.toFixed(1)} y={(ly + 12).toFixed(1)} textAnchor={anchor}
              fontFamily={SANS} fontSize="13" fontWeight="700"
              fill={isWeak ? theme.accent : "#ffffff"}>
              {scores[i]}{isWeak ? "  ↗" : ""}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── Axis breakdown row (clickable) ───────────────────────────────────────────
function AxisRow({ axis, score, isWeak, accent, onClick, delay }) {
  return (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.4 }}
      whileHover={{ x: 3 }} whileTap={{ scale: 0.99 }}
      className={isWeak ? "sc-row-weak" : ""}
      style={{
        display: "block", width: "100%", textAlign: "left", cursor: "pointer",
        background: "#ffffff", border: `1.5px solid ${isWeak ? accent : "#e6dfd8"}`,
        borderRadius: 14, padding: "13px 16px",
        boxShadow: isWeak ? `0 4px 18px ${accent}22` : "0 1px 3px rgba(15,23,42,0.04)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: "0.95rem", color: "#141413" }}>{axis.label}</span>
          {isWeak && (
            <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: "0.62rem", letterSpacing: "0.06em", textTransform: "uppercase", color: accent, background: `${accent}14`, padding: "2px 7px", borderRadius: 5 }}>
              Improve ↗
            </span>
          )}
        </div>
        <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: "1.05rem", color: isWeak ? accent : "#141413" }}>{score}</span>
      </div>
      <div style={{ height: 7, borderRadius: 99, background: "#efe9e2", overflow: "hidden" }}>
        <motion.div
          initial={{ width: 0 }} animate={{ width: `${score}%` }} transition={{ delay: delay + 0.15, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          style={{ height: "100%", borderRadius: 99, background: isWeak ? accent : "linear-gradient(90deg, #1d4ed8, #60a5fa)" }}
        />
      </div>
      <p style={{ fontFamily: SANS, fontSize: "0.74rem", color: "#6a6760", marginTop: 7 }}>{axis.blurb}</p>
    </motion.button>
  );
}

// ─── One-time welcome popup ───────────────────────────────────────────────────
function WelcomePopup({ profile, accent, onClose }) {
  const first = (profile.full_name || "there").split(" ")[0];
  const Chip = ({ children, muted }) => (
    <span style={{
      display: "inline-flex", padding: "0.35rem 0.8rem", borderRadius: 99, fontFamily: SANS, fontSize: "0.82rem", fontWeight: 500,
      background: muted ? "rgba(148,163,184,0.12)" : `${accent}12`,
      border: `1.5px solid ${muted ? "rgba(148,163,184,0.28)" : accent + "55"}`, color: muted ? "#3d3d3a" : "#141413",
    }}>{children}</span>
  );
  const Sec = ({ label, children }) => (
    <div style={{ marginBottom: "1.1rem" }}>
      <p style={{ fontFamily: SANS, fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: accent, marginBottom: "0.5rem" }}>{label}</p>
      {children}
    </div>
  );
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(20,20,19,0.45)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.97 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 540, maxHeight: "88vh", overflowY: "auto", background: "#faf9f5", borderRadius: 22, border: `1px solid ${accent}30`, boxShadow: "0 30px 80px rgba(0,0,0,0.3)", padding: "2.25rem" }}
      >
        <h2 style={{ fontFamily: SANS, fontWeight: 700, fontSize: "1.6rem", color: "#141413", letterSpacing: "-0.02em", marginBottom: "0.4rem" }}>
          Here's what we learned about you, {first}.
        </h2>
        <p style={{ fontFamily: SANS, fontSize: "0.95rem", color: "#494742", lineHeight: 1.6, marginBottom: "1.6rem" }}>
          This is your starting point. Your scorecard grows as you complete quests and use Mentorable.
        </p>

        {profile.onboarding_summary && (
          <Sec label="About you"><p style={{ fontFamily: SANS, fontSize: "0.95rem", color: "#141413", lineHeight: 1.6 }}>{profile.onboarding_summary}</p></Sec>
        )}
        {profile.strengths?.length > 0 && (
          <Sec label="Strengths"><div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>{profile.strengths.map((s, i) => <Chip key={i}>{s}</Chip>)}</div></Sec>
        )}
        {profile.weaknesses?.length > 0 && (
          <Sec label="Growth areas"><div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>{profile.weaknesses.map((w, i) => <Chip key={i} muted>{w}</Chip>)}</div></Sec>
        )}
        {profile.interests?.length > 0 && (
          <Sec label="Interests"><div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>{profile.interests.map((it, i) => <Chip key={i}>{it}</Chip>)}</div></Sec>
        )}
        {profile.work_style && (
          <Sec label="Work style"><p style={{ fontFamily: SANS, fontSize: "0.9rem", color: "#3d3d3a", lineHeight: 1.55 }}>{profile.work_style}</p></Sec>
        )}

        <div style={{ background: `${accent}0c`, border: `1.5px solid ${accent}30`, borderRadius: 14, padding: "1rem 1.2rem", marginTop: "0.5rem", marginBottom: "1.6rem" }}>
          <p style={{ fontFamily: SANS, fontSize: "0.88rem", color: "#141413", lineHeight: 1.6 }}>
            Your radar tracks <strong>5 skills</strong>: Communication, Leadership, Technicality, Resourcefulness, and Execution.
            They start from this conversation and climb as you work. <strong>Tap a glowing (weak) axis</strong> any time and Mentorable will hand you quests to raise it.
          </p>
        </div>

        <button onClick={onClose} style={{
          width: "100%", padding: "0.95rem", border: "none", borderRadius: 12, cursor: "pointer",
          background: "#1d4ed8", color: "#fff", fontFamily: SANS, fontWeight: 700, fontSize: "1rem", boxShadow: "0 6px 20px rgba(29,78,216,0.3)",
        }}>
          Got it, show my scorecard
        </button>
      </motion.div>
    </motion.div>
  );
}

// ─── Improve modal (Phase 3) ──────────────────────────────────────────────────
function ImproveModal({ axisKey, accent, onClose, onAdded, onLimit, onConsumed }) {
  const axis = AXES.find((a) => a.key === axisKey);
  const [loading, setLoading] = useState(true);
  const [suggestions, setSuggestions] = useState([]);
  const [error, setError] = useState(null);
  const [added, setAdded] = useState(new Set());
  const [adding, setAdding] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`${LANGGRAPH_URL}/scorecard/improve`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
          body: JSON.stringify({ axis: axisKey }),
        });
        if (res.status === 429) { if (!cancelled) { onLimit(); onClose(); } return; }
        onConsumed();  // a boost was charged the moment we got past the limit gate
        if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.detail || "Failed to generate"); }
        const data = await res.json();
        if (!cancelled) setSuggestions(data.suggestions || []);
      } catch (e) {
        if (!cancelled) setError("Couldn't generate suggestions right now. Try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [axisKey]);

  const handleAdd = async (s, idx) => {
    if (added.has(idx) || adding !== null) return;
    setAdding(idx);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const now = new Date().toISOString();
      const { error: insErr } = await supabase.from("quest_items").insert({
        user_id: user.id, title: s.title, description: s.description,
        category: s.category || "Other", estimated_time: s.estimated_time || null,
        difficulty: s.difficulty || null, why_it_matters: s.why_it_matters || null,
        target_axis: axisKey, status: "suggested", order_index: 0,
        created_at: now, updated_at: now,
      });
      if (insErr) throw insErr;
      invalidateCache(`quest_items:${user.id}`);
      setAdded((prev) => new Set(prev).add(idx));
      onAdded();
    } catch { /* surface nothing fatal */ } finally { setAdding(null); }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: "fixed", inset: 0, zIndex: 210, background: "rgba(20,20,19,0.45)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.97 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 560, maxHeight: "88vh", overflowY: "auto", background: "#faf9f5", borderRadius: 22, border: `1px solid ${accent}30`, boxShadow: "0 30px 80px rgba(0,0,0,0.3)", padding: "2rem" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
          <div>
            <p style={{ fontFamily: SANS, fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: accent, marginBottom: 4 }}>Improve · {axis?.label}</p>
            <h2 style={{ fontFamily: SANS, fontWeight: 700, fontSize: "1.35rem", color: "#141413", letterSpacing: "-0.02em" }}>Quests to raise your {axis?.label}</h2>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.4rem", color: "#6a6760", lineHeight: 1, padding: 4 }}>×</button>
        </div>
        <p style={{ fontFamily: SANS, fontSize: "0.88rem", color: "#494742", lineHeight: 1.55, marginBottom: "1.5rem" }}>
          Add the ones you like. They land in your Suggestions column, and completing them raises this exact score.
        </p>

        {loading && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem", padding: "2.5rem 0" }}>
            <Spinner size={26} color={accent} />
            <p style={{ fontFamily: SANS, fontSize: "0.85rem", color: "#6a6760" }}>Designing quests for your {axis?.label}…</p>
          </div>
        )}

        {error && !loading && (
          <p style={{ fontFamily: SANS, fontSize: "0.9rem", color: "#dc2626", textAlign: "center", padding: "1.5rem 0" }}>{error}</p>
        )}

        {!loading && !error && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {suggestions.map((s, idx) => {
              const isAdded = added.has(idx);
              return (
                <div key={idx} style={{ background: "#fff", border: "1.5px solid #e6dfd8", borderRadius: 14, padding: "1rem 1.1rem" }}>
                  <div style={{ display: "flex", gap: 6, marginBottom: 7, flexWrap: "wrap" }}>
                    {s.difficulty && <span style={{ fontFamily: SANS, fontSize: "0.62rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#494742", background: "#efe9e2", padding: "2px 7px", borderRadius: 5 }}>{s.difficulty}</span>}
                    {s.estimated_time && <span style={{ fontFamily: SANS, fontSize: "0.62rem", fontWeight: 600, color: "#6a6760", padding: "2px 4px" }}>{s.estimated_time}</span>}
                  </div>
                  <p style={{ fontFamily: SANS, fontWeight: 700, fontSize: "0.98rem", color: "#141413", marginBottom: 4 }}>{s.title}</p>
                  <p style={{ fontFamily: SANS, fontSize: "0.85rem", color: "#3d3d3a", lineHeight: 1.5, marginBottom: 10 }}>{s.description}</p>
                  <button
                    onClick={() => handleAdd(s, idx)}
                    disabled={isAdded || adding !== null}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 6, padding: "0.5rem 1rem", borderRadius: 9, cursor: isAdded ? "default" : "pointer",
                      border: "none", fontFamily: SANS, fontWeight: 700, fontSize: "0.84rem",
                      background: isAdded ? "#d1fae5" : accent, color: isAdded ? "#059669" : "#fff",
                      opacity: adding !== null && !isAdded ? 0.6 : 1,
                    }}
                  >
                    {adding === idx ? <Spinner size={13} color="#fff" /> : isAdded ? "✓ Added to board" : "+ Add to board"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

// ─── ScorecardPage ────────────────────────────────────────────────────────────
export default function ScorecardPage({ navigate }) {
  const [phase, setPhase] = useState(() => { const uid = getKnownUserId(); return (uid && getCache(`profile:${uid}`)) ? "loaded" : "loading"; });
  const [profile, setProfile] = useState(() => { const uid = getKnownUserId(); return uid ? getCache(`profile:${uid}`) : null; });
  const [theme, setTheme] = useState(themes[0]);
  const [downloading, setDownloading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [improveAxis, setImproveAxis] = useState(null);
  const [limitModal, setLimitModal] = useState(false);
  const [boostsUsed, setBoostsUsed] = useState(0);
  const [addedToast, setAddedToast] = useState(0);
  const toastTimer = useRef(null);

  // Data load
  useEffect(() => {
    const load = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { window.location.href = "/auth"; return; }
        setKnownUserId(user.id);
        const { data: p } = await supabase.from("profiles").select("*").eq("id", user.id).single();
        if (!p?.onboarding_completed) { window.location.href = "/onboarding"; return; }
        setProfile(p);
        setCache(`profile:${user.id}`, p);
        setPhase("loaded");
        if (p.scorecard_intro_seen === false) setShowWelcome(true);
        fetchUsage(supabase).then((u) => setBoostsUsed(u.axis_boosts_used ?? 0));
      } catch { setPhase("error"); }
    };
    load();
  }, []);

  const dismissWelcome = async () => {
    setShowWelcome(false);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("profiles").update({ scorecard_intro_seen: true }).eq("id", user.id);
        const updated = { ...profile, scorecard_intro_seen: true };
        setProfile(updated); setCache(`profile:${user.id}`, updated);
      }
    } catch { /* non-fatal */ }
  };

  const openImprove = (axisKey) => {
    if (boostsUsed >= LIMITS.axis_boost) { setLimitModal(true); return; }
    setImproveAxis(axisKey);
  };

  const onAddedQuest = () => {
    setAddedToast((n) => n + 1);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setAddedToast(0), 4000);
  };

  // Capture / share
  const captureCard = async () => {
    const html2canvas = (await import("html2canvas")).default;
    return html2canvas(document.getElementById("scorecard-card"), { backgroundColor: "#141413", scale: 2, useCORS: true });
  };
  const handleDownload = async () => {
    if (downloading) return; setDownloading(true);
    try { const c = await captureCard(); const a = document.createElement("a"); a.download = "mentorable-scorecard.png"; a.href = c.toDataURL("image/png"); a.click(); }
    finally { setDownloading(false); }
  };
  const handleShare = async () => {
    if (sharing) return; setSharing(true);
    try {
      const c = await captureCard();
      await new Promise((resolve) => c.toBlob(async (blob) => {
        const file = new File([blob], "mentorable-scorecard.png", { type: "image/png" });
        if (navigator.share && navigator.canShare?.({ files: [file] })) {
          await navigator.share({ title: "My Mentorable Scorecard", text: "My career scorecard from Mentorable!", files: [file] });
        } else { const a = document.createElement("a"); a.download = "mentorable-scorecard.png"; a.href = c.toDataURL("image/png"); a.click(); }
        resolve();
      }));
    } finally { setSharing(false); }
  };

  // Derived
  const scoresObj = profile?.axis_scores || {};
  const scores = AXES.map((a) => clamp(scoresObj[a.key] ?? DEFAULT));
  const readiness = Math.round(scores.reduce((s, n) => s + n, 0) / scores.length);
  const ranked = scores.map((s, i) => ({ key: AXES[i].key, s })).sort((a, b) => a.s - b.s);
  const weakSet = new Set(ranked.slice(0, 2).map((r) => r.key));
  const first = (profile?.full_name || "there").split(" ")[0];
  const living = profile?.living_profile || {};
  // career_direction (evolving) wins over the frozen baseline matches.
  const careerMatches = living.career_direction
    ? [living.career_direction]
    : (profile?.career_matches || []).slice(0, 3);

  return (
    <div data-sidebar-offset style={{
      minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", position: "relative",
      fontFamily: SANS, padding: "2.5rem 1.5rem 6rem", paddingLeft: `calc(${SIDEBAR_WIDTH}px + 1.5rem)`, background: "#f5f1ed",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        @keyframes sc-pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.55 } }
        .sc-axis-weak text { animation: sc-pulse 1.8s ease-in-out infinite; }
        .sc-axis:hover text { fill: #ffffff; }
        .sc-row-weak { animation: sc-glow 2.4s ease-in-out infinite; }
        @keyframes sc-glow { 0%,100% { box-shadow: 0 4px 18px rgba(29,78,216,0.14) } 50% { box-shadow: 0 6px 26px rgba(29,78,216,0.30) } }
        .sc-btn { display:inline-flex; align-items:center; gap:0.5rem; padding:0.65rem 1.15rem; border:1.5px solid #141413; border-radius:0.7rem; background:transparent; color:#141413; font-family:${SANS}; font-size:0.85rem; font-weight:600; cursor:pointer; transition:background .15s,color .15s,transform .15s; }
        .sc-btn:hover:not(:disabled) { background:#141413; color:#fff; transform:translateY(-1px); }
        .sc-btn:disabled { opacity:.55; cursor:not-allowed; }
        .sc-dot { width:20px; height:20px; border-radius:50%; cursor:pointer; border:none; padding:0; transition:transform .15s; }
        .sc-dot:hover { transform:scale(1.18); }
        @media (max-width: 860px) {
          [data-sidebar-offset] { padding-left: 1.25rem !important; padding-right: 1.25rem !important; }
          .sc-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 1080 }}>

        {phase === "loading" && (
          <div style={{ display: "flex", justifyContent: "center", padding: "6rem 0" }}><Spinner size={28} color={theme.accent} /></div>
        )}

        {phase === "error" && (
          <div style={{ textAlign: "center", padding: "5rem 0" }}>
            <p style={{ color: "#dc2626", fontWeight: 600, marginBottom: "0.5rem" }}>Couldn't load your scorecard.</p>
            <button onClick={() => window.location.reload()} style={{ color: "#1d4ed8", background: "none", border: "none", cursor: "pointer", fontWeight: 600, textDecoration: "underline" }}>Try again</button>
          </div>
        )}

        {phase === "loaded" && profile && (
          <>
            {/* Header */}
            <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
              style={{ display: "flex", alignItems: "center", gap: "1.5rem", flexWrap: "wrap", marginBottom: "2rem" }}>
              <ReadinessRing value={readiness} accent={theme.accent} />
              <div style={{ flex: 1, minWidth: 220 }}>
                <h1 style={{ fontFamily: SANS, fontWeight: 700, fontSize: "1.9rem", color: "#141413", letterSpacing: "-0.03em", lineHeight: 1.1 }}>
                  {first}'s Scorecard
                </h1>
                <p style={{ fontFamily: SANS, fontSize: "0.96rem", color: "#494742", lineHeight: 1.55, marginTop: "0.5rem", maxWidth: 440 }}>
                  Five skills that grow as you work. <strong style={{ color: theme.accent }}>Tap a glowing axis</strong> and Mentorable builds quests to raise it.
                </p>
              </div>
            </motion.div>

            {/* "Where you are now" strip — the evolving living profile */}
            {(living.current_focus || living.momentum) && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.12 }}
                style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1.5rem" }}>
                {living.current_focus && (
                  <div style={{ flex: "1 1 240px", background: "#fff", border: `1.5px solid ${theme.accent}33`, borderRadius: 14, padding: "0.9rem 1.1rem", boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}>
                    <p style={{ fontFamily: SANS, fontSize: "0.64rem", fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: theme.accent, marginBottom: 5 }}>Current focus</p>
                    <p style={{ fontFamily: SANS, fontSize: "0.92rem", color: "#141413", lineHeight: 1.45 }}>{living.current_focus}</p>
                  </div>
                )}
                {living.momentum && (
                  <div style={{ flex: "1 1 240px", background: "#fff", border: "1.5px solid #e6dfd8", borderRadius: 14, padding: "0.9rem 1.1rem", boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}>
                    <p style={{ fontFamily: SANS, fontSize: "0.64rem", fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: "#6a6760", marginBottom: 5 }}>Momentum</p>
                    <p style={{ fontFamily: SANS, fontSize: "0.92rem", color: "#141413", lineHeight: 1.45 }}>{living.momentum}</p>
                  </div>
                )}
              </motion.div>
            )}

            {/* Main grid: radar card + axis breakdown */}
            <div className="sc-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.15fr) minmax(0, 1fr)", gap: "1.5rem", alignItems: "start" }}>

              {/* Radar card (shareable) */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, delay: 0.08 }}>
                <div id="scorecard-card" style={{
                  background: "#141413", borderRadius: "1.5rem", border: `1px solid rgba(${theme.rgb},0.35)`,
                  boxShadow: `0 25px 60px rgba(0,0,0,0.28), 0 0 90px ${theme.glow}`, padding: "1.75rem", position: "relative", overflow: "hidden",
                }}>
                  <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: `linear-gradient(135deg, rgba(${theme.rgb},0.16) 0%, transparent 58%)` }} />
                  <div style={{ position: "relative", zIndex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: "0.9rem", borderBottom: "1px solid rgba(255,255,255,0.1)", marginBottom: "1rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: "1rem", color: "#fff", letterSpacing: "-0.02em" }}>mentorable</span>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: theme.accent, boxShadow: `0 0 8px ${theme.accent}`, marginBottom: 2 }} />
                      </div>
                      <span style={{ fontFamily: SANS, fontSize: "0.66rem", fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em", textTransform: "uppercase" }}>{readiness}% Ready</span>
                    </div>
                    <RadarChart scores={scores} weakSet={weakSet} theme={theme} onAxisClick={openImprove} />
                    {careerMatches.length > 0 && (
                      <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
                        <p style={{ fontFamily: SANS, fontSize: "0.64rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: theme.accent, marginBottom: "0.6rem" }}>Top Career Matches</p>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                          {careerMatches.map((c, i) => (
                            <span key={i} style={{ fontFamily: SANS, fontSize: "0.8rem", fontWeight: 600, color: "rgba(255,255,255,0.92)", background: "rgba(255,255,255,0.06)", border: `1px solid rgba(${theme.rgb},0.3)`, borderRadius: 8, padding: "0.35rem 0.7rem" }}>{c}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* theme + actions */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", marginTop: "1rem", flexWrap: "wrap" }}>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    {themes.map((t) => (
                      <button key={t.name} className="sc-dot" title={t.name} onClick={() => setTheme(t)}
                        style={{ background: t.accent, boxShadow: theme.name === t.name ? `0 0 0 2px #f5f1ed, 0 0 0 4px ${t.accent}` : "none", transform: theme.name === t.name ? "scale(1.15)" : "scale(1)" }} />
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button className="sc-btn" disabled={downloading} onClick={handleDownload}>{downloading ? <Spinner size={14} color="#141413" /> : "Download"}</button>
                    <button className="sc-btn" disabled={sharing} onClick={handleShare}>{sharing ? <Spinner size={14} color="#141413" /> : "Share"}</button>
                  </div>
                </div>
              </motion.div>

              {/* Axis breakdown */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
                {AXES.map((a, i) => (
                  <AxisRow key={a.key} axis={a} score={scores[i]} isWeak={weakSet.has(a.key)} accent={theme.accent} onClick={() => openImprove(a.key)} delay={0.15 + i * 0.06} />
                ))}
                <p style={{ fontFamily: SANS, fontSize: "0.74rem", color: "#6a6760", textAlign: "center", marginTop: "0.4rem" }}>
                  {Math.max(0, LIMITS.axis_boost - boostsUsed)} skill boosts left in the demo
                </p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* added-to-board toast */}
      <AnimatePresence>
        {addedToast > 0 && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
            style={{ position: "fixed", bottom: 24, right: 24, zIndex: 220, display: "flex", alignItems: "center", gap: 10, background: "#1d4ed8", color: "#fff", padding: "12px 16px", borderRadius: 12, boxShadow: "0 8px 24px rgba(29,78,216,0.32)", fontFamily: SANS, fontSize: 14 }}>
            ✓ Added {addedToast} quest{addedToast > 1 ? "s" : ""} to your board
            <button onClick={() => navigate("/quest")} style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", fontFamily: SANS, fontWeight: 700, fontSize: 13, padding: "4px 10px", borderRadius: 7, cursor: "pointer" }}>View →</button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showWelcome && <WelcomePopup profile={profile} accent={theme.accent} onClose={dismissWelcome} />}
      </AnimatePresence>
      <AnimatePresence>
        {improveAxis && <ImproveModal axisKey={improveAxis} accent={theme.accent} onClose={() => setImproveAxis(null)} onAdded={onAddedQuest} onLimit={() => setLimitModal(true)} onConsumed={() => setBoostsUsed((n) => n + 1)} />}
      </AnimatePresence>
      {limitModal && <LimitModal feature="axis_boost" onClose={() => setLimitModal(false)} />}
    </div>
  );
}
