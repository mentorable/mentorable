import { useState, useEffect, useRef, useContext, createContext } from "react";
import { motion, AnimatePresence, useInView, useScroll, useTransform, useSpring } from "framer-motion";
import { supabase } from "../lib/supabase";
import { Flame, TreasureMapIcon } from "../components/quest/questUi.jsx";

// ─── Tokens ───────────────────────────────────────────────────────────────────
const SANS = "'Raleway', sans-serif";
const BODY = "'Raleway', sans-serif";
const MONO = "'Raleway', sans-serif";
const P    = "#1d4ed8";
const B2   = "#2563eb";
const B3   = "#3b82f6";
const B4   = "#60a5fa";
const GRAD = "linear-gradient(135deg,#1d4ed8,#60a5fa)";
const BG   = "#faf8f4";
const FG   = "#141413";
const MUT  = "#4b5563";
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

function SolidBtn({ children, onClick, style = {}, disabled = false, type, className }) {
  return (
    <motion.button className={className} onClick={onClick} disabled={disabled} type={type}
      whileHover={disabled ? {} : { scale: 1.04, boxShadow: "0 14px 40px rgba(37,99,235,0.45)" }}
      whileTap={disabled ? {} : { scale: 0.97 }}
      style={{ fontFamily: SANS, fontSize: "0.92rem", fontWeight: 600, color: "#fff",
        background: P, border: "none", borderRadius: 999, padding: "0.9rem 1.9rem",
        cursor: disabled ? "not-allowed" : "pointer",
        display: "inline-flex", alignItems: "center", gap: 8, whiteSpace: "nowrap",
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

function TypingDots({ color = "#5b6188" }) {
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

// ─── Visual 1: Laptop showing the Portfolio record ────────────────────────────
const RECORD_COURSES = ["AP Calculus BC", "AP Computer Science A", "Honors Chemistry", "AP English Language"];
const RECORD_ACTIVITIES = [
  { title: "Robotics Team", meta: "Captain · 10 hrs/week · Grades 9–11" },
  { title: "Peer Math Tutoring", meta: "Founder · 4 hrs/week · Grades 10–11" },
];

function RecordCard({ title, children, style = {} }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e4e2dd", borderRadius: 7, padding: "7px 9px", ...style }}>
      <div style={{ fontFamily: SANS, fontSize: 7.5, fontWeight: 700, color: FG, marginBottom: 5 }}>{title}</div>
      {children}
    </div>
  );
}

function RecordScreen() {
  return (
    <div style={{ width: "100%", height: "100%", background: "#F5F5F5", padding: "14px 16px", overflow: "hidden",
      display: "flex", flexDirection: "column", gap: 7 }}>
      <div>
        <div style={{ fontFamily: SANS, fontSize: 15, fontWeight: 700, color: P, letterSpacing: "-0.03em" }}>Portfolio</div>
        <div style={{ fontFamily: SANS, fontSize: 7.5, color: MUT, marginTop: 2 }}>
          Your grades, scores, classes, activities and awards, all in one place.
        </div>
      </div>
      <div style={{ display: "flex", gap: 7 }}>
        <RecordCard title="GPA" style={{ flex: 1 }}>
          <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 700, color: FG, letterSpacing: "-0.02em" }}>
            3.86 <span style={{ fontSize: 7, fontWeight: 500, color: MUT, letterSpacing: 0 }}>unweighted</span>
          </div>
        </RecordCard>
        <RecordCard title="Test scores" style={{ flex: 1 }}>
          <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 700, color: FG, letterSpacing: "-0.02em" }}>
            1480 <span style={{ fontSize: 7, fontWeight: 500, color: MUT, letterSpacing: 0 }}>SAT</span>
          </div>
        </RecordCard>
      </div>
      <RecordCard title="Coursework">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {RECORD_COURSES.map((c) => (
            <span key={c} style={{ fontFamily: SANS, fontSize: 6.5, fontWeight: 600, color: P,
              background: "rgba(37,99,235,0.07)", border: `1px solid ${BDR2}`, borderRadius: 99, padding: "2px 6px" }}>{c}</span>
          ))}
        </div>
      </RecordCard>
      <RecordCard title="Activities">
        {RECORD_ACTIVITIES.map((a, i) => (
          <div key={a.title} style={{ paddingTop: i ? 5 : 0, marginTop: i ? 5 : 0, borderTop: i ? "1px solid #efede9" : "none" }}>
            <div style={{ fontFamily: SANS, fontSize: 7.5, fontWeight: 700, color: FG }}>{a.title}</div>
            <div style={{ fontFamily: SANS, fontSize: 6.5, color: MUT, marginTop: 1 }}>{a.meta}</div>
          </div>
        ))}
      </RecordCard>
    </div>
  );
}

function LaptopRecord() {
  const ref = useRef(null);
  const iv  = useInView(ref, { once: true, margin: "-80px" });
  return (
    <div ref={ref} className="lp-laptop" aria-hidden="true" style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
      padding: "2rem 0" }}>
      <motion.div
        initial={{ opacity: 0, y: 60 }}
        animate={iv ? { opacity: 1, y: [0,-12,0] } : {}}
        transition={{
          opacity: { duration: 0.8, ease: EASE },
          y: { duration: 5.5, repeat: Infinity, ease: "easeInOut", delay: 0.8 },
        }}
        style={{ position: "relative" }}>
        {/* Screen lid — kept flat (no rotate) so the screen's small text stays crisp instead of being
            resampled/blurred by a CSS 3D transform; only the keyboard deck below tilts into perspective. */}
        <div style={{ width: 420, height: 280, background: "#0e1019",
          borderRadius: "14px 14px 4px 4px",
          boxShadow: "0 30px 80px rgba(0,0,0,0.35), 0 0 0 1.5px #2a2a3a",
          overflow: "hidden", position: "relative" }}>
          <div style={{ position: "absolute", inset: 0, borderRadius: "inherit",
            background: "linear-gradient(135deg, rgba(59,91,252,0.12) 0%, transparent 60%)",
            pointerEvents: "none", zIndex: 10 }}/>
          <div style={{ position: "absolute", top: 6, left: "50%", transform: "translateX(-50%)",
            width: 5, height: 5, borderRadius: "50%", background: "#2a2a3a", zIndex: 11 }}/>
          <div style={{ position: "absolute", inset: "10px", borderRadius: 8,
            background: "#fafbff", overflow: "hidden" }}>
            <RecordScreen/>
          </div>
        </div>
        {/* Hinge */}
        <div style={{ width: 420, height: 6,
          background: "linear-gradient(to bottom, #b0b4be, #9ca3af)",
          borderRadius: "0 0 2px 2px",
          marginTop: -2 }}/>
        {/* Keyboard deck */}
        <div style={{ width: 420, height: 200,
          background: "linear-gradient(180deg, #c8ccd6 0%, #b0b5c2 50%, #9ca1ae 100%)",
          borderRadius: "0 0 14px 14px",
          // The perspective lives on the deck itself. Inherited 3D (perspective + preserve-3d on the
          // parents) is flattened by the browser whenever an ancestor's opacity is below 1, so the
          // deck showed as a flat rectangle during the fade-in and snapped to its real shape after.
          transform: "perspective(750px) rotateX(58deg)",
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

// ─── Visual 2: College List ───────────────────────────────────────────────────
// Mirrors the real page: a heading and count per group, then each school with
// its admit rate in heavy type and the reason it was sorted there.
const COLLEGE_GROUPS = [
  { label: "Reach", schools: [
    { name: "Carnegie Mellon University", admit: 11, reason: "They admit 11%. Under 20% is a reach for everyone, whatever the scores." },
    { name: "University of Michigan", admit: 18 },
  ] },
  { label: "Target", schools: [
    { name: "University of Illinois Urbana-Champaign", admit: 44, reason: "Your SAT 1480 is in their middle 50%, and they admit 44%." },
    { name: "University of Wisconsin–Madison", admit: 43 },
  ] },
  { label: "Likely", schools: [
    { name: "Arizona State University", admit: 90, reason: "Your SAT 1480 is above their middle 50%, and they admit 90%." },
  ] },
];

function CollegeListCard() {
  return (
    <div aria-hidden="true" style={{ position: "relative", width: "100%", maxWidth: 440, margin: "0 auto" }}>
      <div style={{ position: "absolute", inset: "8%", borderRadius: "50%",
        background: "radial-gradient(circle, rgba(37,99,235,0.16), transparent 66%)",
        filter: "blur(38px)", pointerEvents: "none" }}/>
      <Stagger style={{ position: "relative", background: "#F5F5F5", borderRadius: 20, border: `1px solid ${BDR}`,
        boxShadow: SH_LG, padding: "1.3rem 1.2rem 1.1rem", textAlign: "left" }}>
        <motion.div variants={stagItem} style={{ fontFamily: SANS, fontSize: "1.35rem", fontWeight: 800, color: P, letterSpacing: "-0.03em" }}>
          College List
        </motion.div>
        {COLLEGE_GROUPS.map((g) => (
          <motion.div key={g.label} variants={stagItem} style={{ marginTop: "0.95rem" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 7, fontFamily: SANS, fontSize: "0.95rem", marginBottom: 6 }}>
              <span style={{ fontWeight: 700, color: FG }}>{g.label}</span>
              <span style={{ fontWeight: 500, color: MUT }}>{g.schools.length}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {g.schools.map((sc) => (
                <div key={sc.name} style={{ background: "#fff", border: "1px solid #e4e2dd", borderRadius: 12, padding: "0.6rem 0.75rem" }}>
                  <div style={{ fontFamily: SANS, fontSize: "0.86rem", fontWeight: 700, color: FG, lineHeight: 1.3 }}>{sc.name}</div>
                  <div style={{ fontFamily: SANS, fontSize: "0.8rem", fontWeight: 800, color: FG, marginTop: 2 }}>{sc.admit}% admitted</div>
                  {sc.reason && (
                    <div style={{ fontFamily: SANS, fontSize: "0.74rem", fontWeight: 500, color: FG, lineHeight: 1.45, marginTop: 4 }}>{sc.reason}</div>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        ))}
      </Stagger>
    </div>
  );
}

// ─── Visual 3: Phone showing Quest ────────────────────────────────────────────
// Stones along a winding path: done, today (larger, ringed), then locked.
const QUEST_STONES = [
  { st: "done", x: 60, y: 0 }, { st: "done", x: 118, y: 36 }, { st: "done", x: 150, y: 84 },
  { st: "today", x: 100, y: 128 }, { st: "locked", x: 48, y: 184 }, { st: "locked", x: 96, y: 228 },
];

const PHONE_NAV = [
  { key: "quest", active: true },
  { key: "colleges", d: ["M21.42 10.92a1 1 0 0 0-.02-1.84L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.83l8.57 3.91a2 2 0 0 0 1.66 0z", "M22 10v6", "M6 12.5V16a6 3 0 0 0 12 0v-3.5"] },
  { key: "chat", d: ["M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"] },
  { key: "portfolio", d: ["M4 7h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z", "M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"] },
  { key: "profile", d: ["M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2", "M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"] },
];

function PhoneQuest() {
  const ref = useRef(null);
  const iv  = useInView(ref, { once: true, margin: "-50px" });
  const edge = "#1e3a8a";
  return (
    <div ref={ref} aria-hidden="true" style={{ position: "relative", display: "flex", justifyContent: "center", alignItems: "center", padding: "3rem 0 1rem" }}>
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
          <div style={{ height: 540, position: "relative", overflow: "hidden", background: "#F5F5F5" }}>
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column" }}>
              <div style={{ flex: 1, overflow: "hidden", padding: "16px 16px 6px" }}>
                <motion.div initial={{ opacity: 0, y: 6 }} animate={iv ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.4, delay: 0.2 }}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: "1.05rem", color: P, letterSpacing: "-0.03em" }}>Quest</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, background: "#fff", border: "1.5px solid #e4e2dd",
                    borderBottomWidth: 3, borderRadius: 99, padding: "3px 9px 3px 6px" }}>
                    <Flame size={15} streak={12} animate={iv}/>
                    <span style={{ fontFamily: SANS, fontSize: "0.72rem", fontWeight: 800, color: FG }}>12</span>
                  </div>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 8 }} animate={iv ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.4, delay: 0.32 }}>
                  <div style={{ fontFamily: SANS, fontSize: "0.56rem", fontWeight: 700, color: MUT }}>Milestone 2 of 4</div>
                  <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: "0.86rem", color: FG, letterSpacing: "-0.02em", lineHeight: 1.25, margin: "2px 0 12px" }}>
                    Build a website for my robotics team
                  </div>
                </motion.div>

                {/* The path of day stones */}
                <div style={{ position: "relative", height: 266, marginBottom: 12 }}>
                  {QUEST_STONES.map(({ st, x, y }, i) => {
                    const today = st === "today";
                    const size = today ? 44 : 34;
                    return (
                      <motion.div key={i} initial={{ opacity: 0, scale: 0.6 }} animate={iv ? { opacity: 1, scale: 1 } : {}}
                        transition={{ duration: 0.35, delay: 0.45 + i * 0.08, ease: EASE }}
                        style={{ position: "absolute", left: x, top: y, width: size, height: size, borderRadius: "50%",
                          background: st === "locked" ? "#e3e3e1" : P,
                          borderBottom: `4px solid ${st === "locked" ? "#cfcfcc" : edge}`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          boxShadow: today ? "0 0 0 4px rgba(37,99,235,0.18)" : "none" }}>
                        {st === "done" && <Check color="#fff" size={13}/>}
                        {today && <span style={{ fontFamily: SANS, fontSize: "0.7rem", fontWeight: 800, color: "#fff" }}>13</span>}
                        {st === "locked" && (
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#a9a49a" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/>
                          </svg>
                        )}
                      </motion.div>
                    );
                  })}
                </div>

                <motion.div initial={{ opacity: 0, y: 8 }} animate={iv ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.4, delay: 0.95 }}
                  style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #e4e2dd", borderBottomWidth: 4, padding: "10px 11px 11px" }}>
                  <div style={{ fontFamily: SANS, fontSize: "0.56rem", fontWeight: 700, color: P }}>Today · 20 min</div>
                  <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: "0.7rem", color: FG, lineHeight: 1.35, margin: "3px 0 9px" }}>
                    Draft the About page: who the team is and what you build
                  </div>
                  <div style={{ background: P, borderBottom: `4px solid ${edge}`, borderRadius: 11, padding: "6px 0",
                    textAlign: "center", fontFamily: SANS, fontSize: "0.66rem", fontWeight: 800, color: "#fff" }}>
                    Check in
                  </div>
                </motion.div>
              </div>

              {/* Bottom nav, matching the live app */}
              <div style={{ flexShrink: 0, borderTop: "1px solid #e4e2dd", background: "rgba(255,255,255,0.92)",
                padding: "7px 6px 6px", display: "flex", justifyContent: "space-around", alignItems: "center", color: "#a9a49a" }}>
                {PHONE_NAV.map((n) => (
                  <div key={n.key} style={{ display: "flex", color: n.active ? P : "#a9a49a" }}>
                    {n.active ? <TreasureMapIcon size={13} strokeWidth={2.4}/> : (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        {n.d.map((d) => <path key={d} d={d}/>)}
                      </svg>
                    )}
                  </div>
                ))}
              </div>
            </div>
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
    <div ref={ref} style={{ position: "relative", width: "100%", maxWidth: 660, margin: "0 auto", textAlign: "left" }}>
      <div style={{ position: "absolute", inset: -30, borderRadius: 30,
        background: "radial-gradient(ellipse, rgba(37,99,235,0.14), transparent 70%)",
        filter: "blur(40px)", pointerEvents: "none" }}/>
      <MacFrame title="Mentorable Chat · College Advisor" width={660} style={{ position: "relative" }}>
        <div style={{ height: 54, flexShrink: 0, padding: "0 18px", display: "flex", alignItems: "center", gap: 10,
          background: "rgba(248,250,255,0.95)", borderBottom: `1px solid ${BDR}` }}>
          <AgentAvatar size={30}/>
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
            <span style={{ flex: 1, fontFamily: BODY, fontSize: "0.92rem", color: "#a9b1c2" }}>Ask anything about your applications…</span>
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
    <nav className="lp-nav" style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
      padding: "1.05rem clamp(1.25rem,4vw,3rem)",
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1.5rem",
      background: sc ? "rgba(250,249,245,0.9)" : "transparent",
      backdropFilter: sc ? "blur(20px)" : "none", WebkitBackdropFilter: sc ? "blur(20px)" : "none",
      borderBottom: sc ? `1px solid ${BDR}` : "1px solid transparent",
      boxShadow: sc ? "0 2px 30px rgba(37,99,235,0.08)" : "none",
      transition: "background .4s, box-shadow .4s, border-color .4s" }}>
      <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: "1.15rem", letterSpacing: "-0.03em", color: P, transition: "color .4s" }}>mentorable</div>
      <div className="lp-nav-actions" style={{ display: "flex", alignItems: "center", gap: "1.1rem" }}>
        <button onClick={() => go("/auth")} style={{ fontFamily: SANS, fontSize: "0.92rem", fontWeight: 500,
          color: "#1a1a1a", background: "transparent", border: "none", cursor: "pointer",
          whiteSpace: "nowrap", transition: "color .2s" }}>Log In</button>
        <SolidBtn className="lp-nav-cta" onClick={() => go("/auth")} style={{ padding: "0.7rem 1.4rem", fontSize: "0.85rem" }}>Get Started <ArrowRight/></SolidBtn>
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
        <h1 className="hero-headline" style={{ ...enter(0.05), fontFamily: SANS, fontWeight: 700,
          fontSize: "clamp(3.2rem,8.5vw,7rem)", lineHeight: 1.05, letterSpacing: "-0.04em",
          margin: 0, maxWidth: "14ch", paddingBottom: "0.08em",
          filter: "drop-shadow(0 2px 32px rgba(29,78,216,0.25))" }}>
          Expert guidance for every student.
        </h1>
        <p style={{ ...enter(0.22), fontFamily: BODY, fontSize: "clamp(1rem,1.5vw,1.2rem)", lineHeight: 1.7,
          color: "#000000", fontWeight: 600, maxWidth: 540, margin: "1.8rem 0 0",
          textShadow: "0 1px 18px rgba(255,255,255,0.7)" }}>
          Your personal college application advisor. The kind of support that used to cost $300 a session, now free.
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
function FeatureRow({ label, italic, rest, body, items, visual, flip, center }) {
  return (
    <ScrollScale>
      <div className="lp-row" style={{ display: "flex", alignItems: "center",
        gap: "clamp(2.5rem,6vw,6rem)", flexDirection: flip ? "row-reverse" : "row",
        maxWidth: 1120, margin: "0 auto", padding: "3rem clamp(1.25rem,4vw,2.5rem)" }}>
        <div className="lp-textcol" style={{ flex: "0 0 46%", textAlign: center ? "center" : "left",
          display: "flex", flexDirection: "column", alignItems: center ? "center" : "flex-start" }}>
          <FadeUp>
            <Label>{label}</Label>
            <Heading italic={italic} rest={rest} size="clamp(2rem,3.6vw,2.9rem)"/>
            <p style={{ fontFamily: BODY, fontWeight: 300, fontSize: "1.02rem", color: MUT,
              lineHeight: 1.85, margin: "1.6rem 0 0", maxWidth: 420, marginLeft: center ? "auto" : 0,
              marginRight: center ? "auto" : 0 }}>{body}</p>
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
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle"); // idle | loading | done | error

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || status === "loading") return;
    setStatus("loading");
    const { error } = await supabase.from("waitlist").insert({ email: trimmed });
    // 23505 = unique_violation — already on the list, treat as success.
    setStatus(!error || error.code === "23505" ? "done" : "error");
  };

  return (
    <section style={{ padding: "6rem clamp(1.25rem,4vw,2.5rem)", background: BG }}>
      <div style={{ maxWidth: 540, margin: "0 auto", textAlign: "center" }}>
        <FadeUp>
          <h3 style={{ fontFamily: SANS, fontWeight: 700, fontSize: "clamp(1.8rem,3.5vw,2.4rem)",
            color: FG, margin: 0, letterSpacing: "-0.02em" }}>Interested in a full, paid version?</h3>
          <p style={{ fontFamily: BODY, fontWeight: 300, fontSize: "0.98rem", color: MUT,
            lineHeight: 1.8, margin: "0.9rem 0 1.9rem" }}>
            Join the waitlist, and we'll notify whenever we release a subscription for Mentorable.
          </p>
          {status === "done" ? (
            <p style={{ fontFamily: BODY, fontSize: "0.95rem", color: P, margin: 0 }}>
              You're on the list. We'll be in touch.
            </p>
          ) : (
            <form onSubmit={handleSubmit}
              style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
              <input type="email" placeholder="Enter your email" required value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ flex: "1 1 240px", fontFamily: BODY, fontSize: "0.95rem",
                  padding: "0.9rem 1.2rem", borderRadius: 999, background: "#fff",
                  border: `1px solid ${BDR2}`, color: FG, outline: "none",
                  boxShadow: "0 2px 18px rgba(37,99,235,0.07)" }}/>
              <SolidBtn style={{ flexShrink: 0, opacity: status === "loading" ? 0.7 : 1 }} disabled={status === "loading"}>
                {status === "loading" ? "Joining…" : "Join Waitlist"}
              </SolidBtn>
            </form>
          )}
          {status === "error" && (
            <p style={{ fontFamily: BODY, fontSize: "0.85rem", color: "#dc2626", margin: "0.8rem 0 0" }}>
              Something went wrong. Try again.
            </p>
          )}
        </FadeUp>
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────
function Footer() {
  const go = (p) => { window.history.pushState({}, "", p); window.dispatchEvent(new PopStateEvent("popstate")); };
  return (
    <footer style={{ background: FOOT, color: "#fff", padding: "3.5rem clamp(1.25rem,4vw,2.5rem) 2rem" }}>
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        <div style={{ marginBottom: "2.5rem" }}>
          <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: "1.15rem", letterSpacing: "-0.03em", marginBottom: "0.8rem" }}>mentorable</div>
          <p style={{ fontFamily: BODY, fontWeight: 400, fontSize: "0.88rem", color: "#fff", lineHeight: 1.8, maxWidth: 320, margin: 0 }}>
            AI-powered college application guidance for high school students.
          </p>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
          flexWrap: "wrap", gap: "1rem 2rem", paddingTop: "1.8rem", borderTop: "1px solid rgba(255,255,255,0.3)" }}>
          <div style={{ fontFamily: SANS, fontSize: "0.82rem", color: "#fff" }}>© 2026 Mentorable Inc. All rights reserved.</div>
          <div className="lp-foot-links" style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem 1.5rem" }}>
            {[
              { label: "Privacy Policy", to: "/privacy" },
              { label: "Terms of Service", to: "/terms" },
              { label: "X", href: "https://x.com/MentorableAI" },
              { label: "Instagram", href: "https://www.instagram.com/mentorable.ai/" },
            ].map((l) => {
              const style = { fontFamily: SANS, fontSize: "0.82rem", color: "#fff", background: "none", border: "none",
                cursor: "pointer", padding: 0, textDecoration: "none", whiteSpace: "nowrap" };
              const hover = { onMouseEnter: (e) => (e.currentTarget.style.textDecoration = "underline"),
                onMouseLeave: (e) => (e.currentTarget.style.textDecoration = "none") };
              return l.to
                ? <button key={l.label} onClick={() => go(l.to)} style={style} {...hover}>{l.label}</button>
                : <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" style={style} {...hover}>{l.label}</a>;
            })}
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
        @media (max-width: 480px) {
          /* The laptop mockup is a fixed 420px-wide composition; zoom scales its layout
             box too, so it fits narrow phones without clipping. */
          .lp-laptop { zoom: 0.8; }
        }
        @media (max-width: 400px) {
          .lp-laptop { zoom: 0.72; }
        }
        @media (max-width: 480px) {
          /* Two even rows of two instead of three links and an orphan. */
          .lp-foot-links { display: grid !important; grid-template-columns: 1fr 1fr; width: 100%; gap: 0.9rem 1.5rem !important; }
          .lp-foot-links > * { justify-self: start; }
        }
        @media (max-width: 420px) {
          .lp-nav { gap: 0.75rem !important; }
          .lp-nav-actions { gap: 0.75rem !important; }
          .lp-nav-cta { padding: 0.62rem 1.05rem !important; font-size: 0.82rem !important; gap: 6px !important; }
        }
      `}</style>

      <Navbar/>
      <Hero/>

      {/* Cinematic bridge — hero dissolves into page background */}
      <div style={{ marginTop: -180, height: 200, pointerEvents: "none", position: "relative", zIndex: 1,
        background: "linear-gradient(to bottom, transparent 0%, #faf8f4 100%)" }}/>

      <div id="features">
        <FeatureRow
          label="Step 01" italic="Build" rest="your record."
          body="Add your grades, test scores, classes and activities once, then tell the story behind them in a short text or voice interview. It all lands in one record you can edit any time."
          visual={<LaptopRecord/>}
          center
          flip={false}/>

        <FeatureRow
          label="Step 02" italic="Sort" rest="your college list."
          body="Add the schools you're considering and see their admit rates, score ranges and costs from the U.S. Department of Education. Each one is sorted reach, target or likely against your own scores, with the reason shown."
          visual={<CollegeListCard/>}
          flip={true}/>

        <div style={{ marginTop: "-6.5rem" }}>
          <FeatureRow
            label="Step 03" italic="Move" rest="forward every day."
            body="Pick one project and Quest splits it into milestones, then hands you one small task each day. Check in with what you did to keep your streak going."
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
              Every answer is grounded in your record, not generic advice.
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
