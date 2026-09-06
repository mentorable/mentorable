import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../lib/supabase.js";
import { getCache, setCache, getKnownUserId, setKnownUserId, invalidateCache } from "../lib/cache.js";
import { fetchUsage, LIMITS } from "../lib/usage.js";
import LimitModal from "../components/common/LimitModal.jsx";
import Spinner from "../components/common/Spinner.jsx";
import { SIDEBAR_WIDTH } from "../components/common/Sidebar.jsx";
import { LearnMore as PortfolioLearnMore } from "./PortfolioPage.jsx";
import { useTheme } from "../lib/ThemeContext.jsx";
import { hexToRgbString } from "../lib/theme.js";

const SANS = "'Raleway', sans-serif";
const LANGGRAPH_URL = import.meta.env.VITE_LANGGRAPH_CHAT_URL;

// ─── The 5 standardized axes ──────────────────────────────────────────────────
const AXES = [
  { key: "communication",  label: "Communication",  blurb: "How clearly you articulate your ideas" },
  { key: "leadership",     label: "Leadership",     blurb: "Initiative and bringing others along" },
  { key: "technicality",   label: "Technicality",   blurb: "Depth of knowledge and proficiency" },
  { key: "resourcefulness",label: "Resourcefulness",blurb: "Your capacity to self-educate" },
  { key: "execution",      label: "Execution",      blurb: "Turning knowledge into finished work" },
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
          {display}%
        </span>
        <span style={{ fontFamily: SANS, fontWeight: 600, fontSize: "0.7rem", color: "#6a6760", letterSpacing: "0.08em", marginTop: 4 }}>
          Career Ready
        </span>
      </div>
    </div>
  );
}

// ─── Radar (standardized 5 axes, real scores, read-only) ──────────────────────
function RadarChart({ scores, weakSet, theme }) {
  const R = 108, N = 5, LABEL_R = 128;
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
    <svg viewBox="-232 -144 464 264" style={{ width: "100%", maxWidth: 480, height: "auto", display: "block", margin: "0 auto", overflow: "visible" }}>
      {[0.25, 0.5, 0.75, 1].map((lvl, i) => (
        <path key={i} d={grid(lvl)} fill="none" stroke="rgba(20,20,19,0.08)" strokeWidth="1" />
      ))}
      {Array.from({ length: N }, (_, i) => {
        const [x, y] = polar(R, angle(i));
        return <line key={i} x1="0" y1="0" x2={x.toFixed(1)} y2={y.toFixed(1)} stroke="rgba(20,20,19,0.1)" strokeWidth="1" />;
      })}
      <motion.path d={dataPath} fill={`rgba(${theme.rgb},0.20)`}
        initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.3 }} style={{ transformOrigin: "center" }} />
      <motion.path d={dataPath} fill="none" stroke={theme.accent} strokeWidth="2.5" strokeLinejoin="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, ease: "easeOut", delay: 0.3 }} />
      {pts.map((p, i) => (
        <motion.circle key={i} cx={p[0].toFixed(1)} cy={p[1].toFixed(1)} r="4.5" fill={theme.accent}
          initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1.1 + i * 0.07, type: "spring", stiffness: 400 }} />
      ))}
      {AXES.map((a, i) => {
        const [lx, ly] = polar(LABEL_R, angle(i));
        const isWeak = weakSet.has(a.key);
        const anchor = Math.abs(lx) < 12 ? "middle" : lx > 0 ? "start" : "end";
        return (
          <g key={a.key}>
            <text x={lx.toFixed(1)} y={(ly - 4).toFixed(1)} textAnchor={anchor}
              fontFamily={SANS} fontSize="13.5" fontWeight="700"
              fill={isWeak ? theme.accent : "#141413"}>
              {a.label}
            </text>
            <text x={lx.toFixed(1)} y={(ly + 15).toFixed(1)} textAnchor={anchor}
              fontFamily={SANS} fontSize="14.5" fontWeight="700"
              fill={isWeak ? theme.accent : "#141413"}>
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
      style={{
        display: "block", width: "100%", textAlign: "left", cursor: "pointer",
        background: "#ffffff", border: "2px solid #141413",
        borderRadius: 14, padding: "13px 16px",
        boxShadow: "0 1px 3px rgba(15,23,42,0.04)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: "0.95rem", color: "#141413" }}>{axis.label}</span>
          {isWeak && (
            <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: "0.62rem", letterSpacing: "0.06em", color: accent, background: `${accent}14`, padding: "2px 7px", borderRadius: 5 }}>
              Improve ↗
            </span>
          )}
        </div>
        <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: "1.05rem", color: isWeak ? accent : "#141413" }}>{score}</span>
      </div>
      <div style={{ height: 7, borderRadius: 99, background: "#efe9e2", overflow: "hidden" }}>
        <motion.div
          initial={{ width: 0 }} animate={{ width: `${score}%` }} transition={{ delay: delay + 0.15, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          style={{ height: "100%", borderRadius: 99, background: isWeak ? accent : `${accent}99` }}
        />
      </div>
      <p style={{ fontFamily: SANS, fontWeight: 500, fontSize: "0.74rem", color: "#000", marginTop: 7, lineHeight: 1.4, minHeight: "2.1em" }}>{axis.blurb}</p>
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
      <p style={{ fontFamily: SANS, fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.09em", color: accent, marginBottom: "0.5rem" }}>{label}</p>
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
          background: accent, color: "#fff", fontFamily: SANS, fontWeight: 700, fontSize: "1rem", boxShadow: `0 6px 20px ${accent}4d`,
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
            <p style={{ fontFamily: SANS, fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.09em", color: accent, marginBottom: 4 }}>Improve · {axis?.label}</p>
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
                    {s.difficulty && <span style={{ fontFamily: SANS, fontSize: "0.62rem", fontWeight: 700, textTransform: "capitalize", letterSpacing: "0.05em", color: "#494742", background: "#efe9e2", padding: "2px 7px", borderRadius: 5 }}>{s.difficulty}</span>}
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
  const { accent: siteAccent, accentRgb: siteAccentRgb } = useTheme();
  // Card theme always matches the site-wide accent (from Profile settings).
  const theme = { name: "Your color", accent: siteAccent, glow: `rgba(${siteAccentRgb},0.25)`, rgb: siteAccentRgb };
  const [phase, setPhase] = useState(() => { const uid = getKnownUserId(); return (uid && getCache(`profile:${uid}`)) ? "loaded" : "loading"; });
  const [profile, setProfile] = useState(() => { const uid = getKnownUserId(); return uid ? getCache(`profile:${uid}`) : null; });
  const [downloading, setDownloading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [improveAxis, setImproveAxis] = useState(null);
  const [limitModal, setLimitModal] = useState(false);
  const [boostsUsed, setBoostsUsed] = useState(0);
  const [addedToast, setAddedToast] = useState(0);
  const [portfolioCount, setPortfolioCount] = useState(null); // null until counted; banner needs an explicit 0
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
        supabase.from("portfolio_items").select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .then(({ count }) => setPortfolioCount(count ?? 0));
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

  const dismissPortfolioBanner = async () => {
    setProfile((p) => ({ ...p, portfolio_banner_dismissed: true }));
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("profiles").update({ portfolio_banner_dismissed: true }).eq("id", user.id);
        setCache(`profile:${user.id}`, { ...profile, portfolio_banner_dismissed: true });
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
    return html2canvas(document.getElementById("scorecard-card"), { backgroundColor: "#fff", scale: 2, useCORS: true });
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
      fontFamily: SANS, padding: "2.5rem 1.5rem 6rem", paddingLeft: `calc(${SIDEBAR_WIDTH}px + 1.5rem)`, background: "#F5F5F5",
    }}>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        .sc-btn { display:inline-flex; align-items:center; gap:0.5rem; padding:0.65rem 1.15rem; border:2px solid #000; border-radius:0.7rem; background:transparent; color:#000; font-family:${SANS}; font-size:0.85rem; font-weight:700; cursor:pointer; transition:background .15s,color .15s,transform .15s; }
        .sc-btn:hover:not(:disabled) { background:#000; color:#fff; transform:translateY(-1px); }
        .sc-btn:disabled { opacity:.55; cursor:not-allowed; }
        .sc-cloud-wrap { position: relative; display: flex; justify-content: center; align-items: center; width: 100%; max-width: 320px; aspect-ratio: 640 / 400; margin-top: 8px; }
        @keyframes sc-float { 0%,100% { transform: translateY(0) rotate(-0.6deg); } 50% { transform: translateY(-6px) rotate(0.6deg); } }
        .sc-cloud { animation: sc-float 4.5s ease-in-out infinite; }
        .sc-cloud-svg { position: absolute; inset: 0; width: 100%; height: 100%; }
        .sc-cloud-text { position: relative; z-index: 1; padding: 0 46px; text-align: center; }
        @media (max-width: 860px) {
          .sc-grid { grid-template-columns: 1fr !important; }
        }
        /* Sidebar padding only drops once the sidebar itself is gone (useIsMobile < 768). */
        @media (max-width: 767px) {
          [data-sidebar-offset] { padding-left: 1.25rem !important; padding-right: 1.25rem !important; }
          .sc-toast { bottom: calc(72px + env(safe-area-inset-bottom, 0px)) !important; right: 12px !important; }
        }
      `}</style>

      <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 1080 }}>

        {phase === "loading" && (
          <div style={{ display: "flex", justifyContent: "center", padding: "6rem 0" }}><Spinner size={28} color={theme.accent} /></div>
        )}

        {phase === "error" && (
          <div style={{ textAlign: "center", padding: "5rem 0" }}>
            <p style={{ color: "#dc2626", fontWeight: 600, marginBottom: "0.5rem" }}>Couldn't load your scorecard.</p>
            <button onClick={() => window.location.reload()} style={{ color: siteAccent, background: "none", border: "none", cursor: "pointer", fontWeight: 600, textDecoration: "underline" }}>Try again</button>
          </div>
        )}

        {phase === "loaded" && profile && (
          <>
            {/* Header */}
            <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
              style={{ display: "flex", alignItems: "center", gap: "1.5rem", flexWrap: "wrap", marginBottom: "2rem" }}>
              <ReadinessRing value={readiness} accent={theme.accent} />
              <div style={{ flex: 1, minWidth: 220, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                <div>
                  <h1 style={{ fontFamily: SANS, fontWeight: 700, fontSize: "2.3rem", color: theme.accent, letterSpacing: "-0.03em", lineHeight: 1.1 }}>
                    {first}'s Scorecard
                  </h1>
                  <p style={{ fontFamily: SANS, fontSize: "1.05rem", fontWeight: 600, color: "#141413", lineHeight: 1.4, marginTop: "0.25rem", maxWidth: 440 }}>
                    Five skills that grow as you work. <strong style={{ color: theme.accent }}>Tap a glowing axis</strong> and Mentorable builds quests to raise it.
                  </p>
                </div>
                <div className="sc-cloud-wrap sc-cloud">
                  <svg className="sc-cloud-svg" viewBox="0 0 640 512" preserveAspectRatio="none">
                    <path
                      d="M0,320c0,53,43,96,96,96h368c61.9,0,112-50.1,112-112c0-51.7-35.2-95.2-82.9-107.7c.6-5.7,.9-11.5,.9-17.3c0-88.4-71.6-160-160-160c-59.3,0-111,32.2-138.7,80.2C185.5,97,181.8,96,178,96c-70.7,0-128,57.3-128,128c0,12.3,1.7,24.2,5,35.5C23,271.4,0,299,0,320z"
                      fill={`rgba(${theme.rgb},0.20)`} stroke="#141413" strokeWidth="10" strokeLinejoin="round"
                    />
                  </svg>
                  <span className="sc-cloud-text" style={{ fontFamily: SANS, fontSize: "0.8rem", fontWeight: 600, color: "#141413", lineHeight: 1.35 }}>
                    Your scores aren't comparable to anyone else's. They're just here to help you spot where to focus next.
                  </span>
                </div>
              </div>
            </motion.div>

            {/* Portfolio nudge — optional, dismissable, gone once they've added anything */}
            {portfolioCount === 0 && profile.portfolio_banner_dismissed !== true && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.08 }}
                style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", background: "#fff",
                  border: `1.5px solid rgba(${siteAccentRgb},0.25)`, borderRadius: 14, padding: "0.8rem 1.1rem",
                  marginBottom: "1.5rem", boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={siteAccent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
                </svg>
                <button onClick={() => navigate("/portfolio")}
                  style={{ fontFamily: SANS, fontSize: "0.92rem", fontWeight: 700, color: siteAccent, background: "none",
                    border: "none", cursor: "pointer", padding: 0, textDecoration: "underline", textUnderlineOffset: 3 }}>
                  Complete your portfolio
                </button>
                <PortfolioLearnMore />
                <span style={{ fontFamily: SANS, fontSize: "0.85rem", color: "#494742" }}>
                  Add your experiences, awards, and courses whenever you're ready.
                </span>
                <button onClick={dismissPortfolioBanner} aria-label="Dismiss"
                  style={{ marginLeft: "auto", border: "none", background: "transparent", cursor: "pointer",
                    color: "#6a6760", padding: 4, display: "inline-flex", flexShrink: 0 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </motion.div>
            )}

            {/* Main grid: radar card + axis breakdown */}
            <div className="sc-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.15fr) minmax(0, 1fr)", gap: "1.5rem", alignItems: "start" }}>

              {/* Radar card (shareable) */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, delay: 0.08 }}>
                <div id="scorecard-card" style={{
                  background: "#fff", borderRadius: "1.5rem", border: "2px solid #141413",
                  boxShadow: "0 3px 14px rgba(15,23,42,0.06)", padding: "1.75rem", position: "relative", overflow: "hidden",
                }}>
                  <div style={{ position: "relative", zIndex: 1 }}>
                    <div style={{ textAlign: "center", paddingBottom: "0.9rem", borderBottom: "1.5px solid rgba(20,20,19,0.16)", marginBottom: "1rem" }}>
                      <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: "0.95rem", color: "#141413", letterSpacing: "-0.01em" }}>Scorecard Radar Map</span>
                    </div>
                    <div style={{ padding: "0.75rem 0" }}>
                      <RadarChart scores={scores} weakSet={weakSet} theme={theme} />
                    </div>
                    {careerMatches.length > 0 && (
                      <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1.5px solid rgba(20,20,19,0.16)" }}>
                        <p style={{ fontFamily: SANS, fontSize: "0.64rem", fontWeight: 700, letterSpacing: "0.1em", color: theme.accent, marginBottom: "0.6rem" }}>Top Career Matches</p>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                          {careerMatches.map((c, i) => (
                            <span key={i} style={{ fontFamily: SANS, fontSize: "0.8rem", fontWeight: 600, color: "#141413", background: `rgba(${theme.rgb},0.07)`, border: `1px solid rgba(${theme.rgb},0.2)`, borderRadius: 8, padding: "0.35rem 0.7rem" }}>{c}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* actions */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }}>
                  <button className="sc-btn" disabled={downloading} onClick={handleDownload}>{downloading ? <Spinner size={14} color="#000" /> : "Download"}</button>
                  <button className="sc-btn" disabled={sharing} onClick={handleShare}>{sharing ? <Spinner size={14} color="#000" /> : "Share"}</button>
                </div>
              </motion.div>

              {/* Axis breakdown */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
                {AXES.map((a, i) => (
                  <AxisRow key={a.key} axis={a} score={scores[i]} isWeak={weakSet.has(a.key)} accent={theme.accent} onClick={() => openImprove(a.key)} delay={0.15 + i * 0.06} />
                ))}
                <p style={{ fontFamily: SANS, fontWeight: 600, fontSize: "0.88rem", color: "#141413", textAlign: "center", marginTop: "0.4rem" }}>
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
            className="sc-toast"
            style={{ position: "fixed", bottom: 24, right: 24, zIndex: 220, display: "flex", alignItems: "center", gap: 10, background: siteAccent, color: "#fff", padding: "12px 16px", borderRadius: 12, boxShadow: `0 8px 24px rgba(${siteAccentRgb},0.32)`, fontFamily: SANS, fontSize: 14, maxWidth: "calc(100vw - 24px)", flexWrap: "wrap" }}>
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
