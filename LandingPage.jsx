import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, useInView } from "framer-motion";

// ─── SVG Icons ─────────────────────────────────────────────────────────────
const Svg = ({ size = 24, color = "#1d4ed8", sw = 1.5, children }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);
const IconMic = (p) => <Svg {...p}><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/></Svg>;
const IconBarChart = (p) => <Svg {...p}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></Svg>;
const IconMap = (p) => <Svg {...p}><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></Svg>;
const IconTrending = (p) => <Svg {...p}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></Svg>;
const IconBell = (p) => <Svg {...p}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></Svg>;
const IconMessage = (p) => <Svg {...p}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></Svg>;
const IconLightbulb = (p) => <Svg {...p}><line x1="9" y1="18" x2="15" y2="18"/><line x1="10" y1="22" x2="14" y2="22"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/></Svg>;
const IconUsers = (p) => <Svg {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></Svg>;
const IconZap = (p) => <Svg {...p}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></Svg>;
const IconNavigation = (p) => <Svg {...p}><polygon points="3 11 22 2 13 21 11 13 3 11"/></Svg>;
const IconStar = (p) => <Svg {...p}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></Svg>;

// ─── Topographic Background (4 paths, more visible) ───────────────────────
const TOPO = [
  "M -200 130 C 150 70, 420 180, 750 110 C 1080 40, 1280 150, 1650 95 C 1850 65, 2050 110, 2300 85",
  "M -200 240 C 120 175, 380 280, 720 210 C 1060 140, 1260 255, 1630 200 C 1830 170, 2030 210, 2300 190",
  "M -200 350 C 160 285, 430 390, 770 320 C 1110 250, 1310 360, 1680 305 C 1880 275, 2080 315, 2300 295",
  "M -200 460 C 130 395, 400 500, 740 430 C 1080 360, 1280 470, 1650 415 C 1850 385, 2050 425, 2300 405",
];

function TopoBg() {
  return (
    <div style={{
      position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none",
      maskImage: "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.6) 65%, transparent 100%)",
      WebkitMaskImage: "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.6) 65%, transparent 100%)",
    }}>
      <motion.svg
        width="100%" height="100%"
        viewBox="0 0 1440 600"
        preserveAspectRatio="xMidYMid slice"
        animate={{ x: [0, -20, 0] }}
        transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
        style={{ position: "absolute", inset: 0 }}
      >
        {TOPO.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="rgba(147,197,253,1)" strokeWidth="1.5"
            opacity={0.35 - i * 0.02} />
        ))}
      </motion.svg>
    </div>
  );
}

// ─── Radar Chart ─────────────────────────────────────────────────────────
const AXES = ["Problem Solving", "Communication", "Creativity", "Leadership", "Technical"];
const SCORES = [0.85, 0.72, 0.90, 0.65, 0.78];

function polarToCart(angle, r, cx, cy) {
  const rad = (angle - 90) * (Math.PI / 180);
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}
function buildPath(scores, r, cx, cy) {
  return scores.map((s, i) => {
    const pt = polarToCart((360 / scores.length) * i, s * r, cx, cy);
    return `${i === 0 ? "M" : "L"} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
  }).join(" ") + " Z";
}
function buildPoly(scores, r, cx, cy) {
  return scores.map((s, i) => {
    const pt = polarToCart((360 / scores.length) * i, s * r, cx, cy);
    return `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
  }).join(" ");
}

function RadarChart({ size = 200 }) {
  const cx = size / 2, cy = size / 2;
  const R = size * 0.37;
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  const rings = [0.25, 0.5, 0.75, 1];

  return (
    <svg ref={ref} width={size} height={size} viewBox={`0 0 ${size} ${size}`} overflow="visible">
      <defs>
        <linearGradient id="rfill" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.60"/>
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0.60"/>
        </linearGradient>
      </defs>
      {rings.map(r => (
        <polygon key={r} points={buildPoly([r,r,r,r,r], R, cx, cy)}
          fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1"
          strokeDasharray={r < 1 ? "2 3" : "none"} />
      ))}
      {AXES.map((_, i) => {
        const pt = polarToCart((360/AXES.length)*i, R, cx, cy);
        return <line key={i} x1={cx} y1={cy} x2={pt.x} y2={pt.y} stroke="rgba(255,255,255,0.08)" strokeWidth="1"/>;
      })}
      <motion.polygon points={buildPoly(SCORES, R, cx, cy)} fill="url(#rfill)"
        initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}}
        transition={{ duration: 0.7, delay: 1.0 }} />
      <motion.path d={buildPath(SCORES, R, cx, cy)} fill="none"
        stroke="#60a5fa" strokeWidth="2.5" strokeLinejoin="round"
        initial={{ pathLength: 0 }} animate={inView ? { pathLength: 1 } : {}}
        transition={{ duration: 1.3, ease: [0.22, 1, 0.36, 1] }} />
      {SCORES.map((s, i) => {
        const pt = polarToCart((360/SCORES.length)*i, s*R, cx, cy);
        return (
          <g key={i}>
            <motion.circle cx={pt.x} cy={pt.y} r="10" fill="rgba(96,165,250,0.15)"
              initial={{ scale: 0 }} animate={inView ? { scale: [0, 1] } : {}}
              transition={{ delay: 1.3 + i*0.08, duration: 0.3 }}
              className="pulse-glow"
              style={{ animationDelay: `${i*0.45}s`, transformOrigin: `${pt.x}px ${pt.y}px`, transformBox: "fill-box" }} />
            <motion.circle cx={pt.x} cy={pt.y} r="5"
              fill="#60a5fa"
              initial={{ scale: 0, opacity: 0 }}
              animate={inView ? { scale: 1, opacity: 1 } : {}}
              transition={{ delay: 1.25 + i*0.08, type: "spring", bounce: 0.55 }}
              style={{ filter: "drop-shadow(0 0 8px rgba(96,165,250,0.9))", transformOrigin: `${pt.x}px ${pt.y}px`, transformBox: "fill-box" }} />
          </g>
        );
      })}
      {AXES.map((label, i) => {
        const pt = polarToCart((360/AXES.length)*i, R + 18, cx, cy);
        return (
          <text key={i} x={pt.x} y={pt.y} textAnchor="middle" dominantBaseline="middle"
            fontSize="7.5" fill="rgba(148,163,184,0.8)" fontFamily="system-ui">{label}</text>
        );
      })}
    </svg>
  );
}

// ─── Score Counter ────────────────────────────────────────────────────────
function ScoreCounter({ target = 92, duration = 1600, delay = 500 }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => {
      let start = null;
      function step(ts) {
        if (!start) start = ts;
        const p = Math.min((ts - start) / duration, 1);
        setVal(Math.round((1 - Math.pow(1 - p, 3)) * target));
        if (p < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }, delay);
    return () => clearTimeout(t);
  }, [target, duration, delay]);
  return <>{val}</>;
}

// ─── Stat Tile (dark variant for dark card) ───────────────────────────────
function StatTile({ label, score, delay = 0 }) {
  const [filled, setFilled] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setFilled(true), delay + 800);
    return () => clearTimeout(t);
  }, [delay]);
  const barColor = score >= 80 ? "#22c55e" : score >= 60 ? "#3b82f6" : "#f59e0b";
  return (
    <div style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "0.7rem 0.875rem" }}>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", marginBottom: "0.25rem", textTransform: "uppercase", letterSpacing: "0.07em" }}>
        {label}
      </div>
      <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#f1f5f9", fontFamily: "'Plus Jakarta Sans', sans-serif", lineHeight: 1, marginBottom: "0.45rem" }}>
        {score}
      </div>
      <div style={{ background: "rgba(255,255,255,0.1)", borderRadius: 999, height: 3, overflow: "hidden" }}>
        <div style={{ width: filled ? `${score}%` : "0%", height: "100%", background: barColor, borderRadius: 999, transition: "width 0.9s cubic-bezier(0.4,0,0.2,1)" }} />
      </div>
    </div>
  );
}

// ─── Scorecard Card (dark navy, reordered) ────────────────────────────────
const STAT_DATA = [
  { label: "Problem Solving", score: 88 },
  { label: "Communication", score: 76 },
  { label: "Creativity", score: 91 },
  { label: "Leadership", score: 64 },
];
const STRENGTHS_CARD = [
  { label: "Creative Thinker", icon: <IconLightbulb size={11} color="rgba(255,255,255,0.75)" sw={2}/> },
  { label: "Strong Communicator", icon: <IconUsers size={11} color="rgba(255,255,255,0.75)" sw={2}/> },
  { label: "Self-Starter", icon: <IconZap size={11} color="rgba(255,255,255,0.75)" sw={2}/> },
];

function ScorecardCard() {
  return (
    <div style={{ position: "relative" }}>
      {/* Dynamic shadow synced to float */}
      <motion.div
        animate={{ scaleX: [1, 0.75, 1], opacity: [0.30, 0.12, 0.30] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        style={{ position: "absolute", bottom: -24, left: "6%", right: "6%", height: 32, background: "rgba(59,130,246,0.25)", borderRadius: "50%", filter: "blur(24px)", pointerEvents: "none" }} />

      <motion.div
        animate={{ y: [0, -14, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        style={{
          width: 420,
          background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)",
          border: "1px solid rgba(99,102,241,0.25)",
          borderRadius: 20,
          boxShadow: "0 4px 6px rgba(0,0,0,0.15), 0 20px 40px rgba(59,130,246,0.18), 0 40px 80px rgba(59,130,246,0.10)",
          overflow: "hidden",
        }}>

        {/* 1. Header: avatar + name + grade */}
        <div style={{ padding: "28px 28px 20px", display: "flex", alignItems: "center", gap: "1rem", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ position: "relative", flexShrink: 0 }}>
            <svg width="54" height="54" viewBox="0 0 54 54" style={{ position: "absolute", top: 0, left: 0 }}>
              <defs>
                <linearGradient id="aring" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#3b82f6"/>
                  <stop offset="100%" stopColor="#6366f1"/>
                </linearGradient>
              </defs>
              <circle cx="27" cy="27" r="25.5" fill="none" stroke="url(#aring)" strokeWidth="3"/>
            </svg>
            <div style={{ margin: "3px", width: 48, height: 48, borderRadius: "50%", background: "linear-gradient(135deg, #1d4ed8, #6366f1)", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 800, fontSize: "1.2rem", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              A
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: "1.25rem", color: "#f1f5f9", fontFamily: "'Plus Jakarta Sans', sans-serif", lineHeight: 1.2 }}>Alex Chen</div>
            <div style={{ fontSize: "0.875rem", color: "#94a3b8", marginTop: "0.2rem" }}>Grade 11 · Bay Area, CA</div>
          </div>
        </div>

        {/* 2. Score: centered hero */}
        <div style={{ padding: "20px 28px 16px", textAlign: "center", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ fontSize: "3.25rem", fontWeight: 900, lineHeight: 1, fontFamily: "'Plus Jakarta Sans', sans-serif", background: "linear-gradient(135deg, #3b82f6, #60a5fa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", display: "inline-block" }}>
            <ScoreCounter target={92}/>
            <span style={{ fontSize: "1.1rem", fontWeight: 600, WebkitTextFillColor: "#94a3b8", color: "#94a3b8" }}>/100</span>
          </div>
          <div style={{ fontSize: "0.68rem", fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", letterSpacing: "0.12em", marginTop: "0.35rem" }}>
            Career Readiness Score
          </div>
        </div>

        {/* 3. Radar chart */}
        <div style={{ display: "flex", justifyContent: "center", padding: "16px 28px 8px" }}>
          <RadarChart size={200}/>
        </div>

        {/* 4. Stat tiles 2×2 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", padding: "0 28px 16px" }}>
          {STAT_DATA.map(({ label, score }, i) => (
            <StatTile key={label} label={label} score={score} delay={i * 100}/>
          ))}
        </div>

        {/* 5. Strengths */}
        <div style={{ padding: "0 28px 16px", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.55rem" }}>
            <div style={{ width: 14, height: 1.5, background: "rgba(96,165,250,0.4)", borderRadius: 999 }}/>
            <span style={{ fontSize: "0.64rem", fontWeight: 700, letterSpacing: "0.13em", textTransform: "uppercase", color: "#60a5fa" }}>Strengths</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
            {STRENGTHS_CARD.map(({ label, icon }) => (
              <div key={label} style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", background: "#1e3a8a", borderRadius: 999, padding: "4px 10px", fontSize: "0.72rem", fontWeight: 500, color: "white" }}>
                {icon}{label}
              </div>
            ))}
          </div>
        </div>

        {/* 6. Career Matches */}
        <div style={{ padding: "0 28px 28px", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.55rem" }}>
            <div style={{ width: 14, height: 1.5, background: "rgba(96,165,250,0.4)", borderRadius: 999 }}/>
            <span style={{ fontSize: "0.64rem", fontWeight: 700, letterSpacing: "0.13em", textTransform: "uppercase", color: "#60a5fa" }}>Top Matches</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
            {["UX Designer", "Product Manager", "Data Analyst"].map(c => (
              <span key={c} style={{ background: "#2563eb", color: "white", borderRadius: 999, padding: "4px 12px", fontSize: "0.8rem", fontWeight: 600, boxShadow: "0 2px 8px rgba(37,99,235,0.4)" }}>{c}</span>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Word-by-word Animate ─────────────────────────────────────────────────
function WordAnimate({ text, style = {}, delay = 0 }) {
  const words = text.split(" ");
  return (
    <span style={style}>
      {words.map((w, i) => (
        <motion.span key={i}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: delay + i * 0.08, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          style={{ display: "inline-block", marginRight: "0.28em" }}>
          {w}
        </motion.span>
      ))}
    </span>
  );
}

// ─── Section Label Pill ───────────────────────────────────────────────────
function SectionLabel({ children }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", background: "linear-gradient(135deg, #eff6ff, #e0e7ff)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 999, padding: "0.28rem 0.875rem" }}>
      <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#1d4ed8", flexShrink: 0 }}/>
      <span style={{ fontSize: "0.66rem", fontWeight: 700, letterSpacing: "0.13em", textTransform: "uppercase", color: "#1d4ed8", fontFamily: "'Plus Jakarta Sans', sans-serif", whiteSpace: "nowrap" }}>
        {children}
      </span>
    </div>
  );
}

// ─── FadeIn ───────────────────────────────────────────────────────────────
function FadeIn({ children, delay = 0, style }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <motion.div ref={ref} initial={{ opacity: 0, y: 22 }} animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }} style={style}>
      {children}
    </motion.div>
  );
}

// ─── FAQ Item ─────────────────────────────────────────────────────────────
const FAQS = [
  { q: "How long does the onboarding take?", a: "About 5–8 minutes. It's a conversation, not a test. You'll talk with Mentorable like you'd talk to a mentor who genuinely wants to understand you." },
  { q: "Is Mentorable free?", a: "We offer a free tier that includes your full scorecard and initial roadmap. Full personalization, weekly check-ins, and ongoing AI guidance are available on our paid plan." },
  { q: "How does Mentorable personalize my roadmap?", a: "We combine your voice conversation, profile data, and real-time job market signals to generate a roadmap unique to you, not a template pulled from a database." },
  { q: "Is my data private?", a: "Yes. We never share your data with anyone. We only store your grade level and general region, never your full name or school name." },
  { q: "Can my school counselor or parents see my results?", a: "Only if you choose to share them. Your roadmap belongs to you, and you control who sees it." },
];

function FAQItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: "1px solid rgba(148,163,184,0.15)" }}>
      <button onClick={() => setOpen(!open)}
        style={{ width: "100%", textAlign: "left", padding: "1.75rem 0", display: "flex", alignItems: "center", justifyContent: "space-between", background: "none", border: "none", cursor: "pointer", gap: "1rem" }}>
        <span style={{ fontWeight: 600, fontSize: "1.1875rem", color: "#0f172a", fontFamily: "'Plus Jakarta Sans', sans-serif", lineHeight: 1.4 }}>{q}</span>
        <motion.div animate={{ rotate: open ? 45 : 0 }} transition={{ duration: 0.2 }}
          style={{ flexShrink: 0, width: 28, height: 28, borderRadius: "50%", border: "1.5px solid rgba(37,99,235,0.4)", display: "flex", alignItems: "center", justifyContent: "center", color: "#2563eb", fontSize: "1.15rem", lineHeight: 1 }}>+</motion.div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: "easeInOut" }} style={{ overflow: "hidden" }}>
            <p style={{ color: "#475569", lineHeight: 1.7, paddingBottom: "1.4rem", fontSize: "1rem" }}>{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── HOW IT WORKS ─────────────────────────────────────────────────────────
const HOW_STEPS = [
  { step: "01", icon: (featured) => <IconMic size={featured ? 44 : 36} color="#1d4ed8" sw={1.5}/>, title: "Talk to Mentorable", desc: "Have a 5-minute voice conversation. No forms, no checkboxes. Just a real conversation about you, your goals, and what makes you tick.", featured: true },
  { step: "02", icon: () => <IconStar size={36} color="#1d4ed8" sw={1.5}/>, title: "See your scorecard", desc: "Get a personalized profile card showing your strengths, work style, and top career matches. Your \"wow moment.\"", featured: false },
  { step: "03", icon: () => <IconNavigation size={36} color="#1d4ed8" sw={1.5}/>, title: "Get your roadmap", desc: "Receive a step-by-step career roadmap tailored to your goals, backed by real market data, and updated as you grow.", featured: false },
];

function HowItWorksSection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });

  return (
    <section id="how-it-works" style={{ padding: "6rem 2rem 7rem", background: "#f8fafc" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <FadeIn style={{ textAlign: "center", marginBottom: "4.5rem" }}>
          <SectionLabel>The Process</SectionLabel>
          <h2 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: "clamp(2.2rem, 4vw, 3.25rem)", color: "#0f172a", letterSpacing: "-0.025em", lineHeight: 1.12, marginTop: "1rem" }}>
            Three steps to clarity.
          </h2>
          {/* Simple centered divider */}
          <div style={{ width: 60, height: 1, background: "#1d4ed8", borderRadius: 999, margin: "1.25rem auto 0", opacity: 0.4 }} />
        </FadeIn>

        <div ref={ref} style={{ position: "relative" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1.5rem", position: "relative", zIndex: 1 }}>
            {HOW_STEPS.map(({ step, icon, title, desc, featured }, i) => (
              <motion.div key={step}
                initial={{ opacity: 0, rotateY: 15, y: 20 }}
                animate={inView ? { opacity: 1, rotateY: 0, y: 0 } : {}}
                transition={{ duration: 0.65, delay: i * 0.15, ease: [0.22, 1, 0.36, 1] }}
                style={{ transformPerspective: "600px", transform: i === 1 ? "translateY(2rem)" : undefined }}>
                <div className={`step-card${featured ? " step-card-featured" : ""}`}>
                  {/* START HERE badge on step 01 */}
                  {featured && (
                    <div style={{ position: "absolute", top: "1rem", right: "1rem", background: "#2563eb", color: "white", fontSize: "0.625rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", borderRadius: 4, padding: "2px 8px" }}>
                      Start Here
                    </div>
                  )}
                  {/* Icon container */}
                  <div style={{ width: 56, height: 56, borderRadius: 12, background: featured ? "#dbeafe" : "linear-gradient(135deg, #eff6ff, #e0e7ff)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "1.25rem" }}>
                    <div style={featured ? { filter: "drop-shadow(0 0 8px rgba(37,99,235,0.4))" } : {}}>
                      {icon(featured)}
                    </div>
                  </div>
                  <div style={{ fontSize: "0.68rem", fontWeight: 700, color: "#1d4ed8", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: "0.55rem", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                    Step {step}
                  </div>
                  <h3 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: featured ? "1.375rem" : "1.25rem", color: "#0f172a", marginBottom: "0.75rem", lineHeight: 1.3 }}>{title}</h3>
                  <p style={{ color: "#64748b", lineHeight: 1.7, fontSize: "0.9375rem" }}>{desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── FEATURES — Bento Grid ────────────────────────────────────────────────
const FEATURES = [
  { icon: <IconMic size={36} color="#1d4ed8" sw={1.5}/>, title: "Voice-First Onboarding", desc: "Feels like talking to a mentor, not filling out a form. In 5–8 minutes, Mentorable builds a complete picture of who you are from a natural conversation.", wide: true },
  { icon: <IconBarChart size={36} color="#1d4ed8" sw={1.5}/>, title: "Personalized Scorecard", desc: "Instant visual snapshot of who you are and where you shine." },
  { icon: <IconMap size={36} color="#1d4ed8" sw={1.5}/>, title: "Dynamic Roadmaps", desc: "Step-by-step paths that update as your goals evolve." },
  { icon: <IconTrending size={36} color="#1d4ed8" sw={1.5}/>, title: "Real-Time Market Data", desc: "Roadmaps backed by actual job market trends, not guesswork." },
  { icon: <IconBell size={36} color="#1d4ed8" sw={1.5}/>, title: "Weekly Career Pulse", desc: "Stay on track with weekly check-ins and opportunity alerts." },
  { icon: <IconMessage size={36} color="#1d4ed8" sw={1.5}/>, title: "AI Chat Guidance", desc: "Ask anything, anytime. Mentorable always has your full context: goals, strengths, and roadmap, in every response.", wide: true },
];
const BENTO_DIRS = [
  { x: -30, y: 0 }, { x: -30, y: 0 }, { x: 30, y: 0 },
  { x: -30, y: 0 }, { x: 30, y: 0 }, { x: 0, y: 30 },
];

function WaveformSvg() {
  const bars = [5, 10, 18, 26, 34, 28, 20, 14, 8, 14, 22, 30, 24, 18, 10, 16, 24, 20, 12, 7];
  return (
    <svg viewBox="0 0 86 44" width="86" height="44" style={{ opacity: 0.2 }}>
      {bars.map((h, i) => <rect key={i} x={i * 4.3} y={(44 - h) / 2} width={3} height={h} rx={1.5} fill="#1d4ed8"/>)}
    </svg>
  );
}

function FeaturesBento() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });

  return (
    <section id="features" style={{ padding: "6rem 2rem 7rem", background: "#ffffff", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: 700, height: 700, borderRadius: "50%", background: "radial-gradient(circle, rgba(224,231,255,0.30) 0%, transparent 65%)", pointerEvents: "none", zIndex: 0 }}/>
      <div style={{ maxWidth: 1200, margin: "0 auto", position: "relative", zIndex: 1 }}>
        <FadeIn style={{ textAlign: "center", marginBottom: "4.5rem" }}>
          <SectionLabel>Built For You</SectionLabel>
          <h2 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: "clamp(2.2rem, 4vw, 3.25rem)", color: "#0f172a", letterSpacing: "-0.025em", lineHeight: 1.12, marginTop: "1rem" }}>
            Everything you need.{" "}
            <span style={{ color: "#94a3b8", fontWeight: 600 }}>Nothing you don't.</span>
          </h2>
          <div style={{ width: 60, height: 1, background: "#1d4ed8", borderRadius: 999, margin: "1.25rem auto 0", opacity: 0.4 }} />
        </FadeIn>

        <div ref={ref} style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "1.25rem" }}>
          {FEATURES.map(({ icon, title, desc, wide }, i) => (
            <motion.div key={title}
              initial={{ opacity: 0, x: BENTO_DIRS[i].x, y: BENTO_DIRS[i].y }}
              animate={inView ? { opacity: 1, x: 0, y: 0 } : {}}
              transition={{ duration: 0.6, delay: i * 0.09, ease: [0.22, 1, 0.36, 1] }}
              style={{ gridColumn: wide ? "1 / -1" : undefined }}>
              <div className="feature-card"
                style={{ display: "flex", alignItems: wide ? "center" : "flex-start", gap: wide ? "2rem" : 0, flexDirection: wide ? "row" : "column", minHeight: wide ? undefined : 180 }}>
                <motion.div
                  whileHover={{ scale: 1.08 }}
                  transition={{ type: "spring", bounce: 0.4 }}
                  style={{ width: 56, height: 56, borderRadius: 12, background: "linear-gradient(135deg, #eff6ff, #e0e7ff)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: wide ? 0 : "1.25rem", flexShrink: 0 }}>
                  {icon}
                </motion.div>
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: "1.25rem", color: "#0f172a", marginBottom: "0.6rem" }}>{title}</h3>
                  <p style={{ color: "#64748b", lineHeight: 1.7, fontSize: "0.9375rem" }}>{desc}</p>
                </div>
                {i === 0 && <div style={{ flexShrink: 0, display: "flex", alignItems: "center" }}><WaveformSvg/></div>}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Main Landing Page ────────────────────────────────────────────────────
export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", fn);
    return () => window.removeEventListener("scroll", fn);
  }, []);
  const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", background: "#ffffff", color: "#0f172a" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        body { overflow-x: hidden; }

        .btn-primary {
          background: #1d4ed8; color: white; border: none; border-radius: 999px;
          padding: 0.875rem 2rem; font-weight: 600; font-size: 1rem;
          cursor: pointer; transition: background 0.2s, transform 0.15s, box-shadow 0.2s;
          font-family: 'Plus Jakarta Sans', sans-serif; display: inline-block;
          text-decoration: none; box-shadow: 0 4px 20px rgba(29,78,216,0.3);
          position: relative; overflow: hidden;
        }
        .btn-primary:hover { background: #1e40af; transform: translateY(-2px); box-shadow: 0 8px 28px rgba(29,78,216,0.38); }
        .btn-primary::after {
          content: ''; position: absolute; top: 0; left: -60%;
          width: 50%; height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.22), transparent);
          animation: shimmer 3.5s ease-in-out infinite;
          animation-delay: 2s;
        }
        @keyframes shimmer {
          0% { left: -60%; }
          100% { left: 130%; }
        }

        .btn-ghost {
          background: transparent; color: #1d4ed8; border: 1.5px solid rgba(29,78,216,0.28);
          border-radius: 999px; padding: 0.875rem 2rem; font-weight: 600; font-size: 1rem;
          cursor: pointer; transition: border-color 0.2s, background 0.2s, transform 0.15s;
          font-family: 'Plus Jakarta Sans', sans-serif; display: inline-block; text-decoration: none;
        }
        .btn-ghost:hover { border-color: #1d4ed8; background: rgba(29,78,216,0.05); transform: translateY(-2px); }

        @keyframes pulse-glow {
          0%, 100% { transform: scale(1); opacity: 0.2; }
          50% { transform: scale(2.4); opacity: 0; }
        }
        .pulse-glow {
          animation: pulse-glow 2.6s ease-in-out infinite;
          transform-box: fill-box; transform-origin: center;
        }

        /* Step cards */
        .step-card {
          background: #ffffff;
          border: 1px solid rgba(148,163,184,0.3);
          border-radius: 1.25rem;
          box-shadow: 0 4px 24px rgba(0,0,0,0.08);
          padding: 28px;
          min-height: 220px;
          position: relative;
          overflow: hidden;
          transition: transform 0.25s ease, box-shadow 0.25s ease, border-top 0.25s ease;
          cursor: default;
        }
        .step-card:hover {
          transform: translateY(-6px);
          box-shadow: 0 12px 40px rgba(0,0,0,0.12);
          border-top: 3px solid #3b82f6;
        }
        .step-card-featured {
          border-left: 3px solid #2563eb;
          box-shadow: 0 4px 24px rgba(0,0,0,0.08), 0 0 0 1px rgba(37,99,235,0.15);
        }

        /* Feature cards */
        .feature-card {
          background: #ffffff;
          border: 1px solid rgba(148,163,184,0.3);
          border-radius: 1.25rem;
          box-shadow: 0 4px 24px rgba(0,0,0,0.08);
          padding: 28px;
          height: 100%;
          position: relative;
          overflow: hidden;
          transition: transform 0.25s ease, box-shadow 0.25s ease, border-top 0.25s ease;
          cursor: default;
        }
        .feature-card:hover {
          transform: translateY(-6px);
          box-shadow: 0 12px 40px rgba(0,0,0,0.12);
          border-top: 3px solid #3b82f6;
        }
      `}</style>

      {/* ── Navbar ─────────────────────────────────────────────────────── */}
      <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, transition: "background 0.3s, box-shadow 0.3s", background: scrolled ? "rgba(255,255,255,0.92)" : "transparent", backdropFilter: scrolled ? "blur(20px)" : "none", WebkitBackdropFilter: scrolled ? "blur(20px)" : "none", boxShadow: scrolled ? "0 1px 24px rgba(0,0,0,0.07)" : "none", borderBottom: scrolled ? "1px solid rgba(148,163,184,0.15)" : "1px solid transparent" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 2rem", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: "1.25rem", color: "#0f172a", letterSpacing: "-0.025em" }}>mentorable</span>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#1d4ed8", display: "inline-block", marginBottom: 2 }}/>
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: "2rem" }}>
            <div style={{ display: "flex", gap: "1.75rem" }}>
              {[["how-it-works","How it Works"],["features","Features"],["faq","FAQ"]].map(([id, label]) => (
                <button key={id} onClick={() => scrollTo(id)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", fontSize: "0.9rem", fontWeight: 500, fontFamily: "system-ui", transition: "color 0.2s" }}
                  onMouseEnter={e => e.target.style.color = "#0f172a"}
                  onMouseLeave={e => e.target.style.color = "#64748b"}>
                  {label}
                </button>
              ))}
            </div>
            <button className="btn-primary" style={{ padding: "0.65rem 1.5rem", fontSize: "0.9rem" }} onClick={() => window.location.href = "/auth"}>Get Started</button>
          </div>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section style={{ minHeight: "100vh", display: "flex", alignItems: "center", padding: "7rem 2rem 5rem", position: "relative", overflow: "hidden", background: "linear-gradient(170deg, #ffffff 55%, #f4f8ff 100%)" }}>
        <TopoBg/>
        {/* Radial orbs — drifting slowly */}
        <motion.div
          animate={{ x: [0, 15, 0], y: [0, -10, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
          style={{ position: "absolute", top: "-10%", right: "-8%", width: 600, height: 600, borderRadius: "50%", background: "radial-gradient(circle, rgba(147,197,253,0.50) 0%, transparent 70%)", pointerEvents: "none" }}/>
        <motion.div
          animate={{ x: [0, -12, 0], y: [0, 8, 0] }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
          style={{ position: "absolute", bottom: "-15%", left: "-12%", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle, rgba(199,210,254,0.45) 0%, transparent 70%)", pointerEvents: "none" }}/>

        <div style={{ maxWidth: 1200, margin: "0 auto", width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "3rem", flexWrap: "wrap", position: "relative", zIndex: 1 }}>
          {/* Copy */}
          <div style={{ flex: "1 1 420px", maxWidth: 580 }}>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, delay: 0.1 }}>
              <SectionLabel>AI-Powered Career Guidance</SectionLabel>
            </motion.div>

            <h1 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 900, letterSpacing: "-0.02em", fontSize: "clamp(3rem, 6vw, 5.5rem)", margin: "1.25rem 0 1.5rem" }}>
              <span style={{ display: "block", lineHeight: 1.1 }}>
                <span style={{ color: "#0f172a" }}>
                  <WordAnimate text="Every great career starts with" delay={0.2}/>
                </span>
                {" "}
                <span style={{ background: "linear-gradient(135deg, #1d4ed8, #60a5fa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                  <WordAnimate text="one" delay={0.68}/>
                </span>
              </span>
              <span style={{ display: "block", lineHeight: 1.1, background: "linear-gradient(135deg, #1d4ed8, #60a5fa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                <WordAnimate text="conversation." delay={0.80}/>
              </span>
            </h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.2, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              style={{ color: "#64748b", fontSize: "1.125rem", lineHeight: 1.78, marginBottom: "2.5rem", maxWidth: 480 }}>
              Mentorable listens to your story, maps your strengths, and builds a career roadmap that's actually yours. Not a template.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 1.4, duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
              style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
              <button className="btn-primary" onClick={() => window.location.href = "/auth"}>Start your journey →</button>
              <button className="btn-ghost" onClick={() => scrollTo("how-it-works")}>See how it works</button>
            </motion.div>
          </div>

          {/* Scorecard */}
          <motion.div
            initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.9, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
            style={{ flex: "0 0 auto", display: "flex", justifyContent: "center" }}>
            <ScorecardCard/>
          </motion.div>
        </div>
      </section>

      {/* ── How It Works ─────────────────────────────────────────────────── */}
      <HowItWorksSection/>

      {/* ── Features (Bento) ─────────────────────────────────────────────── */}
      <FeaturesBento/>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <section id="faq" style={{ padding: "6rem 2rem 7rem", background: "#f8fafc" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <FadeIn style={{ textAlign: "center", marginBottom: "3.5rem" }}>
            <SectionLabel>FAQ</SectionLabel>
            <h2 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: "clamp(2.2rem, 4vw, 3.25rem)", color: "#0f172a", letterSpacing: "-0.025em", lineHeight: 1.12, marginTop: "1rem" }}>
              Questions answered.
            </h2>
          </FadeIn>
          <FadeIn delay={0.1}>
            <div style={{ background: "#ffffff", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", border: "1px solid rgba(148,163,184,0.2)", borderTop: "3px solid #3b82f6", borderRadius: "1.25rem", boxShadow: "0 8px 40px rgba(0,0,0,0.10)", padding: "0.25rem 2.25rem" }}>
              {FAQS.map(item => <FAQItem key={item.q} {...item}/>)}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── CTA + Gradient transition to dark footer ──────────────────────── */}
      <section id="cta" style={{ padding: "7rem 2rem 8rem", position: "relative", overflow: "hidden", background: "linear-gradient(175deg, #ffffff 0%, #dbeafe 35%, #3b82f6 70%, #0f172a 100%)" }}>
        <motion.div
          animate={{ x: [0, 12, 0], y: [0, -8, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
          style={{ position: "absolute", top: "-20%", right: "-8%", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle, rgba(147,197,253,0.45) 0%, transparent 60%)", pointerEvents: "none" }}/>
        <div style={{ maxWidth: 700, margin: "0 auto", textAlign: "center", position: "relative", zIndex: 1 }}>
          <FadeIn>
            <h2 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 900, fontSize: "clamp(2.2rem, 4vw, 3.2rem)", color: "#0f172a", letterSpacing: "-0.025em", lineHeight: 1.1, marginBottom: "1.1rem" }}>
              Your path starts with one conversation.
            </h2>
            <p style={{ color: "#475569", fontSize: "1.1rem", lineHeight: 1.75, marginBottom: "2.75rem" }}>
              Join thousands of students who stopped stressing and started planning.
            </p>
            <button className="btn-primary" style={{ fontSize: "1.05rem", padding: "1rem 2.5rem" }} onClick={() => window.location.href = "/auth"}>
              Start your voice onboarding →
            </button>
            <div style={{ marginTop: "1.35rem", display: "flex", justifyContent: "center", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
              {["Free to start", "No credit card required", "5 minutes"].map((t, i, arr) => (
                <span key={t} style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <span style={{ color: "rgba(255,255,255,0.8)", fontSize: "0.85rem" }}>{t}</span>
                  {i < arr.length - 1 && <span style={{ color: "rgba(255,255,255,0.4)" }}>·</span>}
                </span>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── Footer (dark navy) ────────────────────────────────────────────── */}
      <footer style={{ background: "#0f172a", padding: "3.5rem 2rem" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "2rem" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: "0.5rem" }}>
              <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: "1.2rem", color: "#f1f5f9", letterSpacing: "-0.025em" }}>mentorable</span>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#3b82f6", display: "inline-block", marginBottom: 2 }}/>
            </div>
            <p style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.7)" }}>Career clarity for every student.</p>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "1.5rem", alignItems: "center" }}>
            {[["how-it-works","How it Works"],["features","Features"],["faq","FAQ"],["cta","Privacy"],["cta","Contact"]].map(([id, label]) => (
              <button key={label} onClick={() => scrollTo(id)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.7)", fontSize: "0.875rem", transition: "color 0.2s", fontFamily: "system-ui" }}
                onMouseEnter={e => e.target.style.color = "#ffffff"}
                onMouseLeave={e => e.target.style.color = "rgba(255,255,255,0.7)"}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ maxWidth: 1200, margin: "2rem auto 0", paddingTop: "1.5rem", borderTop: "1px solid rgba(148,163,184,0.1)", fontSize: "0.78rem", color: "#475569" }}>
          <span style={{ color: "rgba(255,255,255,0.5)" }}>© 2025 Mentorable. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}
