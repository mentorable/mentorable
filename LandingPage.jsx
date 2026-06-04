import { useState, useEffect, useRef, useContext, createContext } from "react";
import { motion, AnimatePresence, useInView, useScroll, useTransform, useSpring } from "framer-motion";

// ─── Tokens ───────────────────────────────────────────────────────────────────
const SANS = "'Space Grotesk', sans-serif";
const BODY = "'Space Grotesk', sans-serif";
const MONO = "'Roboto Mono', monospace";
const P    = "#1d4ed8";
const B2   = "#2563eb";
const B3   = "#3b82f6";
const B4   = "#60a5fa";
const GRAD = "linear-gradient(135deg,#1d4ed8,#60a5fa)";
const BG   = "#faf8f4";
const FG   = "#141413";
const MUT  = "#6b7280";
const BDR  = "rgba(37,99,235,0.1)";
const BDR2 = "rgba(37,99,235,0.18)";
const FOOT = "#2563eb";
const SH   = "0 4px 32px rgba(37,99,235,0.10),0 1px 4px rgba(0,0,0,0.05)";
const SH_LG= "0 24px 64px rgba(37,99,235,0.24),0 4px 20px rgba(0,0,0,0.10)";
const EASE = [0.22, 1, 0.36, 1];
const CARD = "#faf9f5";
const DOT_BG = "radial-gradient(circle, rgba(59,130,246,0.05) 1px, transparent 1px)";

const HERO_IMG = "/hero-mountains.png";

// ─── Motion primitives ────────────────────────────────────────────────────────
function FadeUp({ children, delay = 0, y = 24, style = {} }) {
  const ref = useRef(null);
  const iv  = useInView(ref, { once: true, margin: "-60px" });
  return (
    <motion.div ref={ref}
      initial={{ opacity: 0, y }}
      animate={iv ? { opacity: 1, y: 0 } : { opacity: 0, y }}
      transition={{ duration: 0.8, delay, ease: EASE }}
      style={style}>
      {children}
    </motion.div>
  );
}

function SpringIn({ children, delay = 0, style = {} }) {
  const ref = useRef(null);
  const iv  = useInView(ref, { once: true, margin: "-60px" });
  return (
    <motion.div ref={ref}
      initial={{ opacity: 0, scale: 0.92, y: 18 }}
      animate={iv ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.92, y: 18 }}
      transition={{ type: "spring", stiffness: 70, damping: 15, mass: 0.9, delay }}
      style={style}>
      {children}
    </motion.div>
  );
}

function ScrollScale({ children, style = {} }) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["0 1", "1 0"] });
  const rawScale = useTransform(scrollYProgress, [0, 0.4, 0.78, 1], [0.95, 1, 1, 0.98]);
  const rawOp    = useTransform(scrollYProgress, [0, 0.25, 0.88, 1], [0.6, 1, 1, 0.85]);
  const scale   = useSpring(rawScale, { stiffness: 45, damping: 18, mass: 0.6 });
  const opacity = useSpring(rawOp,   { stiffness: 45, damping: 18, mass: 0.6 });
  return <motion.div ref={ref} style={{ scale, opacity, ...style }}>{children}</motion.div>;
}

function Stagger({ children, style = {}, className }) {
  const ref = useRef(null);
  const iv  = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.div ref={ref} className={className} style={style}
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.12 } } }}
      initial="hidden" animate={iv ? "show" : "hidden"}>
      {children}
    </motion.div>
  );
}
const stagItem = {
  hidden: { opacity: 0, y: 22, scale: 0.96 },
  show:   { opacity: 1, y: 0, scale: 1, transition: { duration: 0.6, ease: EASE } },
};

// ─── Shared UI ────────────────────────────────────────────────────────────────
function Label({ children }) {
  return (
    <span style={{ display: "inline-block", fontFamily: SANS, fontSize: "0.72rem", fontWeight: 700,
      letterSpacing: "0.18em", textTransform: "uppercase", color: P, marginBottom: "1.1rem" }}>
      {children}
    </span>
  );
}

function Heading({ italic, rest, size = "clamp(2.4rem,4.4vw,3.5rem)" }) {
  return (
    <h2 style={{ margin: 0, lineHeight: 1.08, letterSpacing: "-0.02em" }}>
      <em style={{ fontFamily: SANS, fontStyle: "normal", fontWeight: 700, fontSize: size, color: "#000" }}>{italic} </em>
      <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: size, color: FG }}>{rest}</span>
    </h2>
  );
}

function SolidBtn({ children, onClick, style = {} }) {
  return (
    <motion.button onClick={onClick}
      whileHover={{ scale: 1.04, boxShadow: "0 14px 40px rgba(37,99,235,0.45)" }}
      whileTap={{ scale: 0.97 }}
      style={{ fontFamily: SANS, fontSize: "0.92rem", fontWeight: 600, color: "#fff",
        background: P, border: "none", borderRadius: 999, padding: "0.9rem 1.9rem", cursor: "pointer",
        display: "inline-flex", alignItems: "center", gap: 8,
        boxShadow: "0 6px 24px rgba(37,99,235,0.35)", transition: "background .3s", ...style }}>
      {children}
    </motion.button>
  );
}

function GhostBtn({ children, onClick }) {
  const [h, setH] = useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ fontFamily: SANS, fontSize: "0.92rem", fontWeight: 600,
        color: P, background: h ? "rgba(29,78,216,0.08)" : "rgba(255,255,255,0.6)",
        border: `1.5px solid ${P}`, borderRadius: 999, padding: "0.9rem 1.9rem", cursor: "pointer",
        display: "inline-flex", alignItems: "center", gap: 8,
        backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
        transition: "background .25s" }}>
      {children}
    </button>
  );
}

const ArrowRight = ({ color = "#fff", size = 17 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
  </svg>
);
const Check = ({ color = P, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

// ─── Inline markdown (**bold**, *italic*) ─────────────────────────────────────
function MD({ text, color = FG }) {
  const out = [];
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*)/g;
  let last = 0, m, k = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(<span key={k++}>{text.slice(last, m.index)}</span>);
    if (m[0].startsWith("**")) out.push(<strong key={k++} style={{ fontWeight: 700, color }}>{m[2]}</strong>);
    else out.push(<em key={k++} style={{ fontStyle: "italic" }}>{m[3]}</em>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(<span key={k++}>{text.slice(last)}</span>);
  return <>{out}</>;
}

function RichText({ text, color = FG, size = 14.5 }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      {text.split("\n\n").map((p, i) => (
        <p key={i} style={{ fontFamily: BODY, fontSize: size, color, lineHeight: 1.7, margin: 0 }}>
          <MD text={p} color={color}/>
        </p>
      ))}
    </div>
  );
}

// ─── Mac window chrome ────────────────────────────────────────────────────────
function MacFrame({ title, width = 640, children, style = {} }) {
  return (
    <div style={{ width: "100%", maxWidth: width, margin: "0 auto", borderRadius: 16, overflow: "hidden",
      background: "#fff", border: "1px solid rgba(37,99,235,0.12)",
      boxShadow: "0 44px 100px rgba(12,23,51,0.22), 0 10px 34px rgba(37,99,235,0.10)", ...style }}>
      <div style={{ height: 42, display: "flex", alignItems: "center", padding: "0 15px", position: "relative",
        background: "linear-gradient(180deg,#f8f6f1,#efece4)", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
        <div style={{ display: "flex", gap: 8 }}>
          {["#ff5f57","#febc2e","#28c840"].map((c) => (
            <span key={c} style={{ width: 12, height: 12, borderRadius: "50%", background: c, border: "0.5px solid rgba(0,0,0,0.12)" }}/>
          ))}
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, textAlign: "center", pointerEvents: "none",
          fontFamily: SANS, fontSize: "0.76rem", fontWeight: 600, color: "#8a8a82", letterSpacing: "-0.01em" }}>{title}</div>
      </div>
      {children}
    </div>
  );
}

function AgentAvatar({ size = 30 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: GRAD,
      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      boxShadow: "0 3px 10px rgba(37,99,235,0.35)" }}>
      <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: size * 0.46, color: "#fff", letterSpacing: "-0.04em", lineHeight: 1 }}>m</span>
    </div>
  );
}

function TypingDots({ color = "#9199b8" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, height: 18 }}>
      {[0,1,2].map((i) => (
        <motion.span key={i} animate={{ y: [0,-4,0], opacity: [0.3,0.9,0.3] }}
          transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.16, ease: "easeInOut" }}
          style={{ width: 6, height: 6, borderRadius: "50%", background: color, display: "block" }}/>
      ))}
    </div>
  );
}

// ─── Visual 1: Laptop mockup ──────────────────────────────────────────────────
function VoiceOrb() {
  const ref = useRef(null);
  const iv  = useInView(ref, { once: true, margin: "-80px" });
  return (
    <div ref={ref} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
      padding: "2rem 0", perspective: "900px" }}>
      <motion.div
        initial={{ opacity: 0, y: 60 }}
        animate={iv ? { opacity: 1, y: [0,-12,0] } : {}}
        transition={{
          opacity: { duration: 0.8, ease: EASE },
          y: { duration: 5.5, repeat: Infinity, ease: "easeInOut", delay: 0.8 },
        }}
        style={{ position: "relative", transformStyle: "preserve-3d" }}>
        {/* Screen lid */}
        <div style={{ width: 420, height: 280, background: "#0e1019",
          borderRadius: "14px 14px 4px 4px",
          transform: "rotateY(-14deg) rotateX(4deg)",
          boxShadow: "0 30px 80px rgba(0,0,0,0.35), 0 0 0 1.5px #2a2a3a",
          overflow: "hidden", position: "relative" }}>
          <div style={{ position: "absolute", inset: 0, borderRadius: "inherit",
            background: "linear-gradient(135deg, rgba(59,91,252,0.12) 0%, transparent 60%)",
            pointerEvents: "none", zIndex: 10 }}/>
          <div style={{ position: "absolute", top: 6, left: "50%", transform: "translateX(-50%)",
            width: 5, height: 5, borderRadius: "50%", background: "#2a2a3a", zIndex: 11 }}/>
          <div style={{ position: "absolute", inset: "10px", borderRadius: 8,
            background: "#fafbff", overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "10px 16px", display: "flex", alignItems: "center",
              justifyContent: "space-between", borderBottom: "1px solid rgba(59,91,252,0.1)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: "0.75rem", color: "#0e1019", letterSpacing: "-0.04em" }}>mentorable</span>
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: "linear-gradient(135deg,#3b5bfc,#7c3aed)" }}/>
              </div>
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", padding: "8px 16px", gap: "8px" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: "0.78rem", color: "#0e1019",
                  letterSpacing: "-0.03em", lineHeight: 1.2 }}>Tell us about yourself</div>
                <div style={{ fontFamily: BODY, fontSize: "0.52rem", color: "#4b5470", marginTop: 3, lineHeight: 1.4 }}>
                  Our AI advisor will ask you a few questions
                </div>
              </div>
              <div style={{ position: "relative", width: 72, height: 72 }}>
                <div style={{ position: "absolute", inset: 0, borderRadius: "50%",
                  background: "radial-gradient(circle at 38% 36%, #7c9fff 0%, #3b5bfc 42%, #4f0abf 80%, #1a1060 100%)",
                  boxShadow: "0 0 24px rgba(59,91,252,0.55), 0 0 44px rgba(124,58,237,0.25)" }}/>
                <div style={{ position: "absolute", inset: 6, borderRadius: "50%",
                  background: "radial-gradient(circle at 35% 32%, rgba(255,255,255,0.18) 0%, transparent 55%)" }}/>
                <div style={{ position: "absolute", inset: 0, borderRadius: "50%",
                  boxShadow: "inset 0 -6px 14px rgba(0,0,0,0.3)" }}/>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#111",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: "0 3px 12px rgba(0,0,0,0.28)" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path fillRule="evenodd" clipRule="evenodd"
                      d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.58.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1C9.61 21 3 14.39 3 6c0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.24 1.02L6.6 10.8z"
                      fill="white"/>
                    <path d="M17 3h4m0 0v4m0-4L15 9" stroke="white" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <span style={{ fontFamily: SANS, fontSize: "0.48rem", color: "#4b5470" }}>Call Agent</span>
              </div>
            </div>
          </div>
        </div>
        {/* Hinge */}
        <div style={{ width: 420, height: 6,
          background: "linear-gradient(to bottom, #b0b4be, #9ca3af)",
          borderRadius: "0 0 2px 2px",
          transform: "rotateY(-14deg) rotateX(4deg) translateY(-2px)", marginTop: -2 }}/>
        {/* Keyboard deck */}
        <div style={{ width: 420, height: 200,
          background: "linear-gradient(180deg, #c8ccd6 0%, #b0b5c2 50%, #9ca1ae 100%)",
          borderRadius: "0 0 14px 14px",
          transform: "rotateY(-14deg) rotateX(58deg)",
          transformOrigin: "top center",
          boxShadow: "0 22px 44px rgba(0,0,0,0.35), inset 0 2px 0 rgba(255,255,255,0.12)",
          marginTop: -4, overflow: "hidden", padding: "14px 18px 12px",
          display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", gap: 3 }}>
            {Array.from({length:13}).map((_,i) => (
              <div key={i} style={{ flex: 1, height: 7,
                background: "linear-gradient(180deg,#dde0e8,#c4c8d2)",
                borderRadius: 2, boxShadow: "0 1px 0 rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.55)" }}/>
            ))}
          </div>
          {[13,12,11,10].map((count, row) => (
            <div key={row} style={{ display: "flex", gap: 3 }}>
              {row === 3 && <div style={{ width: 18, height: 12, background: "linear-gradient(180deg,#dde0e8,#c4c8d2)", borderRadius: 3, boxShadow: "0 1px 0 rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.55)", flexShrink: 0 }}/>}
              {Array.from({length: count}).map((_,i) => (
                <div key={i} style={{ flex: (row === 2 && (i === 0 || i === count-1)) ? 1.6 : 1,
                  height: 12, background: "linear-gradient(180deg, #e2e5ed, #cdd1da)", borderRadius: 3,
                  boxShadow: "0 1px 0 rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.65)" }}/>
              ))}
              {row === 3 && <div style={{ width: 22, height: 12, background: "linear-gradient(180deg,#dde0e8,#c4c8d2)", borderRadius: 3, boxShadow: "0 1px 0 rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.55)", flexShrink: 0 }}/>}
            </div>
          ))}
          <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
            {[16,16].map((w,i) => <div key={i} style={{ width: w, height: 10, background: "linear-gradient(180deg,#dde0e8,#c4c8d2)", borderRadius: 3, boxShadow: "0 1px 0 rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.55)", flexShrink: 0 }}/>)}
            <div style={{ flex: 1, height: 10, background: "linear-gradient(180deg,#e2e5ed,#cdd1da)", borderRadius: 3, boxShadow: "0 1px 0 rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.65)" }}/>
            {[16,16].map((w,i) => <div key={i} style={{ width: w, height: 10, background: "linear-gradient(180deg,#dde0e8,#c4c8d2)", borderRadius: 3, boxShadow: "0 1px 0 rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.55)", flexShrink: 0 }}/>)}
          </div>
          <div style={{ display: "flex", justifyContent: "center", marginTop: 4 }}>
            <div style={{ width: "38%", height: 28, background: "linear-gradient(180deg,#c8ccd6,#b0b4be)",
              borderRadius: 5, boxShadow: "inset 0 1px 3px rgba(0,0,0,0.18), 0 1px 0 rgba(255,255,255,0.3)" }}/>
          </div>
        </div>
        {/* Fade away */}
        <div style={{ position: "absolute", bottom: -30, left: 0, right: 0, height: 100,
          background: "linear-gradient(to bottom, transparent, #faf8f4)",
          pointerEvents: "none", zIndex: 10 }}/>
      </motion.div>
    </div>
  );
}

// ─── Visual 2: Skill Radar ────────────────────────────────────────────────────
const RADAR_AXES = ["Problem Solving","Communication","Creativity","Leadership","Technical"];
const RADAR_VALS = [0.88, 0.76, 0.91, 0.64, 0.78];
const rPt = (a, r, cx, cy) => { const rad = (a - 90) * Math.PI / 180; return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }; };
const rPoly = (sc, R, cx, cy) => sc.map((s, i) => { const p = rPt(360/sc.length*i, s*R, cx, cy); return `${p.x.toFixed(1)},${p.y.toFixed(1)}`; }).join(" ");

function SkillRadar() {
  const SIZE = 420, cx = 210, cy = 210, R = 142;
  const ref = useRef(null);
  const iv  = useInView(ref, { once: true, margin: "-60px" });
  return (
    <div ref={ref} style={{ position: "relative", width: "100%", maxWidth: 440, margin: "0 auto" }}>
      <div style={{ position: "absolute", inset: "8%", borderRadius: "50%",
        background: "radial-gradient(circle, rgba(37,99,235,0.16), transparent 66%)",
        filter: "blur(38px)", pointerEvents: "none" }}/>
      <svg width="100%" viewBox={`0 0 ${SIZE} ${SIZE}`} overflow="visible" style={{ position: "relative", display: "block" }}>
        <defs>
          <linearGradient id="radarStroke" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1d4ed8"/><stop offset="55%" stopColor="#3b82f6"/><stop offset="100%" stopColor="#60a5fa"/>
          </linearGradient>
          <radialGradient id="radarFill" cx="50%" cy="50%" r="62%">
            <stop offset="0%" stopColor="rgba(96,165,250,0.42)"/>
            <stop offset="60%" stopColor="rgba(37,99,235,0.28)"/>
            <stop offset="100%" stopColor="rgba(29,78,216,0.14)"/>
          </radialGradient>
          <filter id="radarGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        {[1,0.75,0.5,0.25].map((r) => (
          <polygon key={r} points={rPoly([r,r,r,r,r], R, cx, cy)}
            fill="none" stroke="rgba(37,99,235,0.12)" strokeWidth={r===1 ? 1.5 : 1}/>
        ))}
        {RADAR_AXES.map((_,i) => { const p = rPt(360/5*i, R, cx, cy);
          return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="rgba(37,99,235,0.12)" strokeWidth="1"/>; })}
        <motion.g style={{ transformOrigin: `${cx}px ${cy}px` }}
          initial={{ scale: 0, opacity: 0, rotate: -12 }}
          animate={iv ? { scale: 1, opacity: 1, rotate: 0 } : {}}
          transition={{ duration: 1.2, delay: 0.2, ease: EASE }}>
          <polygon points={rPoly(RADAR_VALS, R, cx, cy)}
            fill="url(#radarFill)" stroke="url(#radarStroke)" strokeWidth="3" strokeLinejoin="round"
            filter="url(#radarGlow)"/>
        </motion.g>
        {RADAR_VALS.map((s, i) => {
          const p  = rPt(360/5*i, s*R, cx, cy);
          const lp = rPt(360/5*i, s*R - 22, cx, cy);
          return (
            <g key={i}>
              <motion.circle cx={p.x} cy={p.y} r="5.5" fill="#fff" stroke={P} strokeWidth="3"
                initial={{ scale: 0 }} animate={iv ? { scale: 1 } : {}}
                transition={{ duration: 0.4, delay: 0.85 + i * 0.08 }} style={{ transformOrigin: `${p.x}px ${p.y}px` }}/>
              {iv && (
                <motion.text x={lp.x} y={lp.y} textAnchor="middle" dominantBaseline="middle"
                  fontSize="12.5" fontFamily={SANS} fontWeight="700" fill="#1d4ed8"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.05 + i * 0.08 }}>
                  {Math.round(s * 100)}%
                </motion.text>
              )}
            </g>
          );
        })}
        {RADAR_AXES.map((label, i) => {
          const p = rPt(360/5*i, R*1.26, cx, cy);
          return <text key={label} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle"
            fontSize="12.5" fontFamily={SANS} fontWeight="600" fill="#4b5470">{label}</text>;
        })}
      </svg>
    </div>
  );
}

// ─── Visual 3: Phone Quest mockup ─────────────────────────────────────────────
function PhoneQuest() {
  const ref = useRef(null);
  const iv  = useInView(ref, { once: true, margin: "-50px" });
  const quests = [
    { category: "Project",  color: "#1d4ed8", bg: "#f0f5ff", time: "1–2 weeks", title: "Build a GitHub portfolio project" },
    { category: "Research", color: "#d97706", bg: "#fef3c7", time: "3–4 days",  title: "Explore summer programs at top universities" },
    { category: "Learning", color: "#7c3aed", bg: "#ede9fe", time: "1 week",    title: "Complete an intro Python course online" },
  ];
  return (
    <div ref={ref} style={{ position: "relative", display: "flex", justifyContent: "center", alignItems: "center", padding: "3rem 0 1rem" }}>
      <div style={{ position: "absolute", width: 520, height: 400, borderRadius: "50%",
        background: "radial-gradient(ellipse,rgba(29,78,216,0.15),transparent 65%)", pointerEvents: "none", top: "10%", zIndex: 0 }}/>
      <motion.div
        initial={{ opacity: 0, y: 80, rotateX: 58, rotateY: -14 }}
        animate={iv ? { opacity: 1, y: [0,-14,0], rotateX: 38, rotateY: [-8,-6,-8], rotateZ: [0,0.6,0] } : {}}
        transition={{
          opacity:  { duration: 0.7, ease: EASE },
          y:        { duration: 6, repeat: Infinity, ease: "easeInOut", delay: 0.8 },
          rotateX:  { duration: 1.2, ease: EASE },
          rotateY:  { duration: 7, repeat: Infinity, ease: "easeInOut", delay: 0.8 },
          rotateZ:  { duration: 9, repeat: Infinity, ease: "easeInOut", delay: 0.8 },
        }}
        style={{ transformPerspective: 1100, position: "relative", zIndex: 1, width: 290,
          borderRadius: 52, background: "#1c1c1e",
          boxShadow: "0 20px 60px rgba(0,0,0,0.5), 0 0 0 1.5px rgba(255,255,255,0.08)" }}>
        <div style={{ borderRadius: 52, border: "11px solid #1c1c1e", background: "#000" }}>
          <div style={{ height: 52, background: "#000", position: "relative", borderTopLeftRadius: 41, borderTopRightRadius: 41 }}>
            <div style={{ position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)",
              width: 110, height: 28, borderRadius: 999, background: "#000", border: "1px solid rgba(255,255,255,0.07)" }}/>
            <span style={{ position: "absolute", left: 14, top: 15, fontFamily: SANS, fontSize: "0.6rem", fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>9:41</span>
          </div>
          <div style={{ height: 540, position: "relative", overflow: "hidden", background: "#faf9f5",
            backgroundImage: "radial-gradient(circle,rgba(29,78,216,0.06) 1px,transparent 1px)", backgroundSize: "14px 14px" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 5,
              background: "rgba(238,244,255,0.92)", backdropFilter: "blur(12px)",
              borderBottom: "1px solid rgba(29,78,216,0.1)", padding: "8px 10px 7px",
              display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontFamily: "Georgia,serif", fontWeight: 600, fontSize: "0.88rem",
                background: "linear-gradient(135deg,#0f172a 30%,#1d4ed8)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Quest</span>
              <div style={{ display: "flex", gap: 4 }}>
                <div style={{ fontFamily: SANS, fontSize: "0.42rem", fontWeight: 700, color: "#1d4ed8",
                  background: "#f0f5ff", border: "1px solid #dbeafe", borderRadius: 6, padding: "2px 6px",
                  display: "flex", alignItems: "baseline", gap: 2 }}>
                  <span style={{ fontWeight: 800, fontSize: "0.52rem" }}>3</span>active
                </div>
                <div style={{ fontFamily: SANS, fontSize: "0.42rem", fontWeight: 700, color: "#059669",
                  background: "#d1fae5", border: "1px solid rgba(5,150,105,0.2)", borderRadius: 6, padding: "2px 6px",
                  display: "flex", alignItems: "baseline", gap: 2 }}>
                  <span style={{ fontWeight: 800, fontSize: "0.52rem" }}>1</span>done
                </div>
              </div>
            </div>
            <div style={{ position: "absolute", top: 40, left: 8, right: 8, zIndex: 3, display: "flex", flexDirection: "column", gap: 6 }}>
              {quests.map((q, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={iv ? { opacity: 1, y: 0 } : {}}
                  transition={{ duration: 0.4, delay: 0.3 + i * 0.15 }}
                  style={{ background: "#fff", borderRadius: 10, border: "1px solid #e6dfd8",
                    padding: "8px 10px", boxShadow: "0 1px 4px rgba(15,23,42,0.05)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                    <span style={{ fontFamily: SANS, fontSize: "0.4rem", fontWeight: 700, letterSpacing: "0.04em",
                      textTransform: "uppercase", background: q.bg, color: q.color, borderRadius: 5, padding: "2px 6px" }}>
                      {q.category}
                    </span>
                    <span style={{ fontFamily: SANS, fontSize: "0.4rem", fontWeight: 700, color: "#8e8b82",
                      background: "#faf9f5", border: "1px solid #e6dfd8", borderRadius: 4, padding: "1px 5px" }}>
                      {q.time}
                    </span>
                  </div>
                  <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: "0.52rem", color: "#141413", lineHeight: 1.3, marginBottom: 6 }}>{q.title}</div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <div style={{ flex: 1, fontFamily: SANS, fontSize: "0.38rem", fontWeight: 700,
                      color: "#fff", background: "linear-gradient(135deg,#1d4ed8,#3b82f6)",
                      borderRadius: 5, padding: "3px 0", textAlign: "center" }}>Complete</div>
                    <div style={{ fontFamily: SANS, fontSize: "0.38rem", fontWeight: 600,
                      color: "#6c6a64", background: "#f0ede6", border: "1px solid #e6dfd8",
                      borderRadius: 5, padding: "3px 8px" }}>Remove</div>
                  </div>
                </motion.div>
              ))}
            </div>
            <motion.div initial={{ opacity: 0 }} animate={iv ? { opacity: 1 } : {}}
              transition={{ duration: 0.5, delay: 0.9 }}
              style={{ position: "absolute", bottom: 12, left: 8, right: 8, zIndex: 3,
                background: "linear-gradient(135deg,#1d4ed8,#3b82f6)", borderRadius: 10,
                padding: "7px 10px", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
                <path d="M12 5v14M5 12h14"/>
              </svg>
              <span style={{ fontFamily: SANS, fontSize: "0.48rem", fontWeight: 700, color: "#fff" }}>Generate new quests</span>
            </motion.div>
          </div>
          <div style={{ height: 20, background: "#000", display: "flex", alignItems: "center", justifyContent: "center",
            borderBottomLeftRadius: 41, borderBottomRightRadius: 41 }}>
            <div style={{ width: 100, height: 4, borderRadius: 999, background: "rgba(255,255,255,0.18)" }}/>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Visual 4: Chat window ────────────────────────────────────────────────────
const CHAT_SCRIPT = [
  { role: "user", text: "What should I focus on this semester to stand out for CS programs?" },
  { role: "ai",   text: "Great question. Based on your Quest, two moves matter most right now:\n\n**1. Ship one real project.** A working robotics app says far more than another club membership.\n\n**2. Protect your math trajectory.** Strong calculus signals you're ready for rigorous CS coursework." },
  { role: "user", text: "How do I make the project actually stand out?" },
  { role: "ai",   text: "Solve a problem *you* genuinely have, then write up how you approached it. Showing how you think is more compelling than a polished screenshot." },
  { role: "user", text: "Got it. Anything for my application essay?" },
  { role: "ai",   text: "Lead with the moment you decided to build something, not the result. Your instinct to fix what's broken is the throughline, so let them see how you think, not just what you achieved." },
];

function ChatWindow() {
  const ref     = useRef(null);
  const iv      = useInView(ref, { once: true, margin: "-80px" });
  const [visible, setVisible] = useState([]);
  const [typing,  setTyping]  = useState(false);
  const scRef   = useRef(null);

  useEffect(() => {
    if (!iv) return;
    let cancelled = false;
    const timeouts = [];
    const wait = (ms) => new Promise((r) => { const t = setTimeout(r, ms); timeouts.push(t); });
    const typeHuman = async (text) => {
      setVisible((v) => [...v, { role: "user", text: "" }]);
      for (let i = 0; i < text.length; i++) {
        if (cancelled) return;
        const slice = text.slice(0, i + 1);
        setVisible((v) => { const cp = [...v]; cp[cp.length-1] = { role: "user", text: slice }; return cp; });
        const rand = Math.random();
        await wait(rand < 0.12 ? 100 + Math.random() * 50 : 20 + Math.random() * 30);
      }
    };
    const typeAI = async (text) => {
      setTyping(true); await wait(600); if (cancelled) return;
      setTyping(false);
      setVisible((v) => [...v, { role: "ai", text: "" }]);
      for (let c = 0; c <= text.length; c += 3) {
        if (cancelled) return;
        const slice = text.slice(0, Math.min(c, text.length));
        setVisible((v) => { const cp = [...v]; cp[cp.length-1] = { role: "ai", text: slice }; return cp; });
        await wait(28);
      }
      setVisible((v) => { const cp = [...v]; cp[cp.length-1] = { role: "ai", text }; return cp; });
      await wait(500);
    };
    (async () => {
      await wait(450);
      for (let i = 0; i < CHAT_SCRIPT.length; i++) {
        if (cancelled) return;
        const m = CHAT_SCRIPT[i];
        if (m.role === "user") { await typeHuman(m.text); await wait(600); }
        else { await typeAI(m.text); }
      }
    })();
    return () => { cancelled = true; timeouts.forEach(clearTimeout); };
  }, [iv]);

  useEffect(() => { const el = scRef.current; if (el) el.scrollTop = el.scrollHeight; });

  return (
    <div ref={ref} style={{ position: "relative", width: "100%", maxWidth: 660, margin: "0 auto" }}>
      <div style={{ position: "absolute", inset: -30, borderRadius: 30,
        background: "radial-gradient(ellipse, rgba(37,99,235,0.14), transparent 70%)",
        filter: "blur(40px)", pointerEvents: "none" }}/>
      <MacFrame title="Mentora · AI Career Mentor" width={660} style={{ position: "relative" }}>
        <div style={{ height: 54, flexShrink: 0, padding: "0 18px", display: "flex", alignItems: "center", gap: 10,
          background: "rgba(248,250,255,0.95)", borderBottom: `1px solid ${BDR}` }}>
          <AgentAvatar size={30}/>
          <div>
            <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: "0.92rem", color: FG, letterSpacing: "-0.02em" }}>Mentora</span>
            <span style={{ fontFamily: BODY, fontSize: "0.74rem", color: MUT, marginLeft: 6 }}>· AI Career Mentor</span>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, padding: "4px 11px",
            borderRadius: 100, background: "rgba(16,185,129,0.09)", border: "1px solid rgba(16,185,129,0.2)" }}>
            <motion.span animate={{ opacity: [1,0.3,1] }} transition={{ duration: 2.5, repeat: Infinity }}
              style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981" }}/>
            <span style={{ fontFamily: SANS, fontSize: "0.7rem", fontWeight: 700, color: "#059669" }}>Online</span>
          </div>
        </div>
        <div ref={scRef} style={{ height: 384, overflow: "hidden", padding: "22px 22px 8px",
          background: CARD, backgroundImage: DOT_BG, backgroundSize: "32px 32px" }}>
          {visible.map((m, i) => m.role === "user" ? (
            <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: EASE }}
              style={{ display: "flex", justifyContent: "flex-end", marginBottom: 18, paddingLeft: 60 }}>
              <div style={{ background: P, borderRadius: "16px 16px 3px 16px", padding: "12px 17px", maxWidth: 420, boxShadow: "0 2px 10px rgba(37,99,235,0.28)" }}>
                <p style={{ fontFamily: BODY, fontSize: "0.94rem", color: "#fff", lineHeight: 1.6, margin: 0 }}>{m.text}</p>
              </div>
            </motion.div>
          ) : (
            <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: EASE }}
              style={{ display: "flex", gap: 11, marginBottom: 18, paddingRight: 50, alignItems: "flex-start" }}>
              <AgentAvatar size={30}/>
              <div style={{ background: "#fff", borderRadius: "3px 16px 16px 16px", padding: "14px 17px",
                border: `1px solid ${BDR}`, boxShadow: "0 2px 12px rgba(29,78,216,0.06)", maxWidth: 480 }}>
                <RichText text={m.text} size={14.5}/>
              </div>
            </motion.div>
          ))}
          {typing && (
            <div style={{ display: "flex", gap: 11, marginBottom: 18, alignItems: "flex-start" }}>
              <AgentAvatar size={30}/>
              <div style={{ background: "#fff", borderRadius: "3px 16px 16px 16px", padding: "16px 18px",
                border: `1px solid ${BDR}`, boxShadow: "0 2px 12px rgba(29,78,216,0.06)" }}>
                <TypingDots/>
              </div>
            </div>
          )}
        </div>
        <div style={{ padding: "14px 18px 18px", background: CARD, borderTop: `1px solid ${BDR}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#fff",
            border: `1.5px solid ${BDR2}`, borderRadius: 14, padding: "11px 11px 11px 17px",
            boxShadow: "0 2px 12px rgba(29,78,216,0.05)" }}>
            <span style={{ flex: 1, fontFamily: BODY, fontSize: "0.92rem", color: "#a9b1c2" }}>Ask anything about your career…</span>
            <div style={{ width: 36, height: 36, borderRadius: 11, background: GRAD,
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 4px 12px rgba(37,99,235,0.3)" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <path d="M22 2L11 13" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>
        </div>
      </MacFrame>
    </div>
  );
}

// ─── Navbar ───────────────────────────────────────────────────────────────────
function Navbar() {
  const [sc, setSc] = useState(false);
  const go = (p) => { window.history.pushState({}, "", p); window.dispatchEvent(new PopStateEvent("popstate")); };
  useEffect(() => {
    const h = () => setSc(window.scrollY > 80);
    window.addEventListener("scroll", h, { passive: true });
    return () => window.removeEventListener("scroll", h);
  }, []);
  return (
    <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
      padding: "1.05rem clamp(1.25rem,4vw,3rem)",
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1.5rem",
      background: sc ? "rgba(250,249,245,0.9)" : "transparent",
      backdropFilter: sc ? "blur(20px)" : "none", WebkitBackdropFilter: sc ? "blur(20px)" : "none",
      borderBottom: sc ? `1px solid ${BDR}` : "1px solid transparent",
      boxShadow: sc ? "0 2px 30px rgba(37,99,235,0.08)" : "none",
      transition: "background .4s, box-shadow .4s, border-color .4s" }}>
      <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: "1.15rem", letterSpacing: "-0.03em", color: P, transition: "color .4s" }}>mentorable</div>
      <div style={{ display: "flex", alignItems: "center", gap: "1.1rem" }}>
        <button onClick={() => go("/auth")} style={{ fontFamily: SANS, fontSize: "0.92rem", fontWeight: 500,
          color: "#1a1a1a", background: "transparent", border: "none", cursor: "pointer",
          transition: "color .2s" }}>Log In</button>
        <SolidBtn onClick={() => go("/auth")} style={{ padding: "0.7rem 1.4rem", fontSize: "0.85rem" }}>Get Started <ArrowRight/></SolidBtn>
      </div>
    </nav>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────
function Hero() {
  const [shown, setShown] = useState(false);
  const go = (p) => { window.history.pushState({}, "", p); window.dispatchEvent(new PopStateEvent("popstate")); };
  useEffect(() => { const t = setTimeout(() => setShown(true), 60); return () => clearTimeout(t); }, []);
  const enter = (delay) => ({
    opacity: shown ? 1 : 0,
    transform: shown ? "none" : "translateY(24px)",
    transition: `opacity 0.9s cubic-bezier(0.22,1,0.36,1) ${delay}s, transform 0.9s cubic-bezier(0.22,1,0.36,1) ${delay}s`,
  });
  return (
    <section style={{ position: "relative", height: "100vh", minHeight: 620, overflow: "hidden", background: "#cfe0f2" }}>
      <img src={HERO_IMG} alt="" aria-hidden="true"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover",
          filter: "brightness(1.07) saturate(0.92)" }}/>
      {/* Lightening veil + seamless dissolve at bottom */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none",
        background: "linear-gradient(to bottom, rgba(255,255,255,0.72) 0%, rgba(255,255,255,0.6) 25%, rgba(255,255,255,0.3) 50%, rgba(250,248,244,0.7) 75%, #faf8f4 100%)" }}/>
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse 80% 55% at 50% 42%, rgba(255,255,255,0.42) 0%, transparent 62%)" }}/>
      {/* Content */}
      <div style={{ position: "relative", zIndex: 2, height: "100%", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", textAlign: "center", padding: "0 1.5rem", paddingBottom: "6vh" }}>
        <style>{`
          @keyframes shimmer {
            0%   { background-position: -200% center; }
            100% { background-position: 200% center; }
          }
          .hero-headline {
            background: linear-gradient(110deg, #1d3fbb 0%, #1d4ed8 30%, #60a5fa 48%, #1d4ed8 66%, #1a36a8 100%);
            background-size: 200% auto;
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            animation: shimmer 5s linear infinite;
          }
        `}</style>
        <h1 className="hero-headline" style={{ ...enter(0.05), fontFamily: SANS, fontWeight: 800,
          fontSize: "clamp(3.2rem,8.5vw,7rem)", lineHeight: 1.05, letterSpacing: "-0.04em",
          margin: 0, maxWidth: "14ch", paddingBottom: "0.08em",
          filter: "drop-shadow(0 2px 32px rgba(29,78,216,0.25))" }}>
          Expert guidance for every student.
        </h1>
        <p style={{ ...enter(0.22), fontFamily: BODY, fontWeight: 500, fontSize: "clamp(1rem,1.5vw,1.2rem)", lineHeight: 1.7,
          color: "#000000", fontWeight: 600, maxWidth: 540, margin: "1.8rem 0 0",
          textShadow: "0 1px 18px rgba(255,255,255,0.7)" }}>
          Your personal college and career advisor. The kind of support that used to cost $300 a session, now free.
        </p>
        <div style={{ ...enter(0.38), display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 14, marginTop: "2.4rem" }}>
          <SolidBtn onClick={() => go("/auth")}>Get Started <ArrowRight/></SolidBtn>
          <GhostBtn onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })}>How it works</GhostBtn>
        </div>
      </div>
      {/* Scroll cue */}
      <motion.div animate={{ y: [0,9,0] }} transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        style={{ position: "absolute", bottom: "2.2rem", left: "50%", transform: "translateX(-50%)",
          zIndex: 2, opacity: 0.5, pointerEvents: "none" }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="rgba(45,75,140,0.75)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </motion.div>
    </section>
  );
}

// ─── Feature row ──────────────────────────────────────────────────────────────
function FeatureRow({ label, italic, rest, body, items, visual, flip }) {
  return (
    <ScrollScale>
      <div className="lp-row" style={{ display: "flex", alignItems: "center",
        gap: "clamp(2.5rem,6vw,6rem)", flexDirection: flip ? "row-reverse" : "row",
        maxWidth: 1120, margin: "0 auto", padding: "3rem clamp(1.25rem,4vw,2.5rem)" }}>
        <div className="lp-textcol" style={{ flex: "0 0 46%" }}>
          <FadeUp>
            <Label>{label}</Label>
            <Heading italic={italic} rest={rest} size="clamp(2rem,3.6vw,2.9rem)"/>
            <p style={{ fontFamily: BODY, fontWeight: 300, fontSize: "1.02rem", color: MUT,
              lineHeight: 1.85, margin: "1.6rem 0 0", maxWidth: 420 }}>{body}</p>
            {items && (
              <ul style={{ listStyle: "none", padding: 0, margin: "1.6rem 0 0", display: "flex", flexDirection: "column", gap: 13 }}>
                {items.map((it) => (
                  <li key={it} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ width: 22, height: 22, borderRadius: 7, background: "rgba(37,99,235,0.08)",
                      border: `1px solid ${BDR2}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Check/>
                    </span>
                    <span style={{ fontFamily: BODY, fontSize: "0.95rem", color: B2, fontWeight: 500 }}>{it}</span>
                  </li>
                ))}
              </ul>
            )}
          </FadeUp>
        </div>
        <div style={{ flex: 1, display: "flex", justifyContent: "center", minWidth: 0 }}>
          <SpringIn delay={0.1} style={{ width: "100%", display: "flex", justifyContent: "center" }}>{visual}</SpringIn>
        </div>
      </div>
    </ScrollScale>
  );
}

// ─── Newsletter ───────────────────────────────────────────────────────────────
function Newsletter() {
  return (
    <section style={{ padding: "6rem clamp(1.25rem,4vw,2.5rem)", background: BG }}>
      <div style={{ maxWidth: 540, margin: "0 auto", textAlign: "center" }}>
        <FadeUp>
          <h3 style={{ fontFamily: SANS, fontWeight: 300, fontSize: "clamp(1.8rem,3.5vw,2.4rem)",
            color: FG, margin: 0, letterSpacing: "-0.02em" }}>Stay in the loop</h3>
          <p style={{ fontFamily: BODY, fontWeight: 300, fontSize: "0.98rem", color: MUT,
            lineHeight: 1.8, margin: "0.9rem 0 1.9rem" }}>
            Sign up for updates on new features, career insights, and Mentorable news.
          </p>
          <form onSubmit={(e) => e.preventDefault()}
            style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
            <input type="email" placeholder="Enter your email" required
              style={{ flex: "1 1 240px", fontFamily: BODY, fontSize: "0.95rem",
                padding: "0.9rem 1.2rem", borderRadius: 999, background: "#fff",
                border: `1px solid ${BDR2}`, color: FG, outline: "none",
                boxShadow: "0 2px 18px rgba(37,99,235,0.07)" }}/>
            <SolidBtn style={{ flexShrink: 0 }}>Subscribe</SolidBtn>
          </form>
        </FadeUp>
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────
const FOOT_COLS = [
  { heading: "Features",  links: ["Voice Onboarding","Scorecard","Quest","AI Guidance"] },
  { heading: "Resources", links: ["About","Blog","Help Center","Legal"] },
  { heading: "Company",   links: ["Careers","Contact","Privacy Policy","Terms"] },
];
function Footer() {
  return (
    <footer style={{ background: FOOT, color: "#fff", padding: "4.5rem clamp(1.25rem,4vw,2.5rem) 2rem" }}>
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: "2.5rem", marginBottom: "3rem" }}>
          <div>
            <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: "1.15rem", letterSpacing: "-0.03em", marginBottom: "0.8rem" }}>mentorable</div>
            <p style={{ fontFamily: BODY, fontWeight: 300, fontSize: "0.85rem", color: "rgba(255,255,255,0.62)", lineHeight: 1.8, maxWidth: 250, margin: 0 }}>
              AI-powered career guidance for high school students.
            </p>
          </div>
          {FOOT_COLS.map((col) => (
            <div key={col.heading}>
              <div style={{ fontFamily: SANS, fontSize: "0.68rem", fontWeight: 700, color: "rgba(255,255,255,0.55)",
                textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "1.1rem" }}>{col.heading}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {col.links.map((l) => (
                  <a key={l} href="#" onClick={(e) => e.preventDefault()}
                    style={{ fontFamily: SANS, fontSize: "0.85rem", color: "rgba(255,255,255,0.74)", textDecoration: "none", transition: "color .2s" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "#fff")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.74)")}>{l}</a>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
          flexWrap: "wrap", gap: 14, paddingTop: "1.8rem", borderTop: "1px solid rgba(255,255,255,0.18)" }}>
          <div style={{ fontFamily: SANS, fontSize: "0.78rem", color: "rgba(255,255,255,0.55)" }}>© 2026 Mentorable Inc. All rights reserved.</div>
          <div style={{ display: "flex", gap: "1.5rem" }}>
            {["X","LinkedIn","Instagram"].map((s) => (
              <a key={s} href="#" onClick={(e) => e.preventDefault()}
                style={{ fontFamily: SANS, fontSize: "0.78rem", color: "rgba(255,255,255,0.6)", textDecoration: "none", transition: "color .2s" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#fff")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.6)")}>{s}</a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function LandingPage() {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  return (
    <div style={{ background: BG, minHeight: "100vh", color: FG, fontFamily: BODY, overflowX: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Roboto+Mono:wght@400;500&display=swap');
        html,body { overflow-x: hidden; max-width: 100%; }
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        ::selection { background: rgba(37,99,235,0.25); }
        ::-webkit-scrollbar { width: 11px; }
        ::-webkit-scrollbar-track { background: #faf8f4; }
        ::-webkit-scrollbar-thumb { background: rgba(37,99,235,0.28); border-radius: 99px; border: 3px solid #faf8f4; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(37,99,235,0.45); }
        @media (max-width: 900px) {
          .lp-row { flex-direction: column !important; gap: 2.5rem !important; }
          .lp-row > * { flex: 1 1 auto !important; width: 100%; }
          .lp-textcol { flex: 1 1 auto !important; }
        }
      `}</style>

      <Navbar/>
      <Hero/>

      {/* Cinematic bridge — hero dissolves into page background */}
      <div style={{ marginTop: -180, height: 200, pointerEvents: "none", position: "relative", zIndex: 1,
        background: "linear-gradient(to bottom, transparent 0%, #faf8f4 100%)" }}/>

      <div id="features">
        <FeatureRow
          label="Step 01" italic="Discover" rest="your strengths."
          body="Our AI listens to your voice interview and extracts your profile, values, and career instincts automatically."
          items={["Interests and passions","Work style and values","Career curiosity and goals","Communication patterns"]}
          visual={<VoiceOrb/>}
          flip={false}/>

        <FeatureRow
          label="Step 02" italic="See" rest="your skill profile."
          body="See your 5-axis skill radar, top career path matches, and personalized strengths — all drawn from your voice data."
          visual={<SkillRadar/>}
          flip={true}/>

        <div style={{ marginTop: "-6.5rem" }}>
          <FeatureRow
            label="Step 03" italic="Your" rest="personalized path."
            body="AI-generated next steps tailored to where you are right now. Complete them, swap them out, and watch your path take shape."
            visual={<PhoneQuest/>}
            flip={false}/>
        </div>
      </div>

      {/* Step 04 — centered climax */}
      <ScrollScale>
        <section style={{ maxWidth: 900, margin: "0 auto", padding: "4.5rem clamp(1.25rem,4vw,2.5rem) 5rem", textAlign: "center" }}>
          <FadeUp style={{ marginBottom: "2.8rem", display: "inline-block" }}>
            <Label>Step 04</Label>
            <Heading italic="Ask" rest="anything, anytime." size="clamp(2rem,3.6vw,2.9rem)"/>
            <p style={{ fontFamily: BODY, fontWeight: 300, fontSize: "1.02rem", color: MUT,
              lineHeight: 1.85, margin: "1.6rem auto 0", maxWidth: 480 }}>
              Every answer is grounded in your personal data, not generic advice.
            </p>
          </FadeUp>
          <SpringIn delay={0.1}><ChatWindow/></SpringIn>
        </section>
      </ScrollScale>

      <Newsletter/>
      <Footer/>
    </div>
  );
}
