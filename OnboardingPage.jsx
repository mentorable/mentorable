import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useConversation } from "@elevenlabs/react";
import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "./lib/supabase.js";
import Spinner from "./components/common/Spinner.jsx";
import { VoicePoweredOrb } from "./components/common/VoicePoweredOrb.jsx";

const AGENT_ID = import.meta.env.VITE_ELEVENLABS_AGENT_ID;

// ─── Design tokens ────────────────────────────────────────────────────────────
const BG      = "#fafbff";
const TEXT    = "#0e1019";
const TEXT2   = "#4b5470";
const TEXT3   = "#9199b8";
const ACCENT  = "#3b5bfc";
const ACCENT2 = "#7c3aed";
const BORDER  = "rgba(59,91,252,0.13)";
const SURFACE = "rgba(59,91,252,0.05)";
const CARD    = "#ffffff";
const SERIF   = "'DM Serif Display', Georgia, serif";
const SANS    = "'Space Grotesk', Arial, sans-serif";
const MONO    = "'Space Grotesk', monospace";

// ─── Framer-motion variant helpers ───────────────────────────────────────────
const fadeUp = (delay = 0) => ({
  initial:    { opacity:0, y:22 },
  animate:    { opacity:1, y:0 },
  transition: { duration:0.65, ease:[0.16,1,0.3,1], delay },
});

const staggerParent = (delayChildren = 0, stagger = 0.12) => ({
  initial:  "hidden",
  animate:  "visible",
  variants: { hidden:{}, visible:{ transition:{ staggerChildren:stagger, delayChildren } } },
});

const staggerChild = {
  variants: {
    hidden:   { opacity:0, y:24 },
    visible:  { opacity:1, y:0, transition:{ duration:0.6, ease:[0.16,1,0.3,1] } },
  },
};

const chipChild = {
  variants: {
    hidden:   { opacity:0, scale:0.8, y:8 },
    visible:  { opacity:1, scale:1, y:0, transition:{ duration:0.35, ease:[0.16,1,0.3,1] } },
  },
};


// ─── Logo ─────────────────────────────────────────────────────────────────────
function Logo({ textColor = TEXT }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:7 }}>
      <span style={{ fontFamily:SANS, fontWeight:700, fontSize:"1.05rem", color:textColor, letterSpacing:"-0.04em" }}>
        mentorable
      </span>
      <motion.span
        animate={{ scale:[1, 1.35, 1], opacity:[1, 0.7, 1] }}
        transition={{ duration:2.8, repeat:Infinity, ease:"easeInOut" }}
        style={{
          width:6, height:6, borderRadius:"50%",
          background:`linear-gradient(135deg, ${ACCENT}, ${ACCENT2})`,
          display:"inline-block", flexShrink:0,
          boxShadow:`0 0 10px ${ACCENT}60`,
        }}
      />
    </div>
  );
}

// ─── Waveform ─────────────────────────────────────────────────────────────────
function Waveform({ active, color }) {
  const heights = [8, 16, 24, 28, 24, 16, 8];
  const delays  = [0, 0.1, 0.2, 0.3, 0.2, 0.1, 0];
  return (
    <div style={{ display:"flex", alignItems:"center", gap:3, height:32 }}>
      {heights.map((h, i) => (
        <div key={i} style={{
          width:3, height:h, borderRadius:2,
          background:color,
          transformOrigin:"center",
          transform:active ? undefined : "scaleY(0.25)",
          animation:active ? "ob-wave 0.9s ease-in-out infinite" : "none",
          animationDelay:`${delays[i]}s`,
          transition:"transform 0.3s ease, background 0.3s ease",
        }}/>
      ))}
    </div>
  );
}

// ─── MicIcon ──────────────────────────────────────────────────────────────────
function MicIcon({ color = "white", size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="12" rx="3"/>
      <path d="M5 10a7 7 0 0 0 14 0"/>
      <line x1="12" y1="17" x2="12" y2="21"/>
      <line x1="8" y1="21" x2="16" y2="21"/>
    </svg>
  );
}

// ─── Phone Icons ─────────────────────────────────────────────────────────────
function PhoneOutIcon({ color = "white", size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path fillRule="evenodd" clipRule="evenodd"
        d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.58.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1C9.61 21 3 14.39 3 6c0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.24 1.02L6.6 10.8z"
        fill={color}/>
      <path d="M17 3h4m0 0v4m0-4L15 9" stroke={color} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function PhoneInIcon({ color = "#111", size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path fillRule="evenodd" clipRule="evenodd"
        d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.58.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1C9.61 21 3 14.39 3 6c0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.24 1.02L6.6 10.8z"
        fill={color}/>
      <path d="M21 9l-6-6m0 6V5m0 4h4" stroke={color} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ─── Voice Orb ────────────────────────────────────────────────────────────────
function VoiceOrb({ onStart, loading }) {
  return (
    <motion.div
      initial={{ opacity:0, x:30 }}
      animate={{ opacity:1, x:0 }}
      transition={{ duration:0.75, ease:[0.16,1,0.3,1], delay:0.55 }}
      style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"2rem" }}
    >
      {/* WebGL orb */}
      <div style={{ position:"relative", width:340, height:340 }}>
        <VoicePoweredOrb
          hue={0}
          style={{ width:"100%", height:"100%" }}
        />
      </div>

      {/* Call button */}
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"0.75rem" }}>
        <motion.button
          onClick={onStart}
          disabled={loading}
          whileHover={loading ? {} : { scale:1.07 }}
          whileTap={loading ? {} : { scale:0.93 }}
          style={{
            width:80, height:80, borderRadius:"50%",
            background:"#111111",
            border:"none", cursor:loading ? "not-allowed" : "pointer",
            display:"flex", alignItems:"center", justifyContent:"center",
            boxShadow:"0 6px 28px rgba(0,0,0,0.32)",
          }}
        >
          {loading ? <Spinner size={24} color="#ffffff"/> : <PhoneOutIcon color="white" size={28}/>}
        </motion.button>
        <span style={{ fontFamily:SANS, fontSize:"1rem", color:TEXT2, fontWeight:400, letterSpacing:"-0.01em" }}>
          Call Agent
        </span>
      </div>
    </motion.div>
  );
}

// ─── Elegant floating shape (background element) ─────────────────────────────
function ElegantShape({ shapeStyle, delay = 0, width = 400, height = 100, rotate = 0, color = "rgba(99,102,241,0.15)", borderColor = "rgba(59,91,252,0.18)", glowColor = "rgba(59,91,252,0.07)" }) {
  return (
    <motion.div
      initial={{ opacity:0, y:-150, rotate:rotate - 15 }}
      animate={{ opacity:1, y:0, rotate }}
      transition={{ duration:2.4, delay, ease:[0.23,0.86,0.39,0.96], opacity:{ duration:1.2 } }}
      style={{ position:"absolute", ...shapeStyle }}
    >
      <motion.div
        animate={{ y:[0,15,0] }}
        transition={{ duration:12, repeat:Number.POSITIVE_INFINITY, ease:"easeInOut" }}
        style={{ width, height, position:"relative" }}
      >
        <div style={{
          position:"absolute", inset:0, borderRadius:"9999px",
          background:`linear-gradient(to right, ${color}, transparent)`,
          backdropFilter:"blur(2px)",
          border:`2px solid ${borderColor}`,
          boxShadow:`0 8px 32px 0 ${glowColor}`,
        }}/>
      </motion.div>
    </motion.div>
  );
}

// ─── Phase 0: Demographics ────────────────────────────────────────────────────
const US_STATES = [
  "Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut",
  "Delaware","District of Columbia","Florida","Georgia","Hawaii","Idaho","Illinois",
  "Indiana","Iowa","Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts",
  "Michigan","Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada",
  "New Hampshire","New Jersey","New Mexico","New York","North Carolina","North Dakota",
  "Ohio","Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina",
  "South Dakota","Tennessee","Texas","Utah","Vermont","Virginia","Washington",
  "West Virginia","Wisconsin","Wyoming",
];

const HS_GRADES = [
  { value:"9",  label:"9th Grade"  },
  { value:"10", label:"10th Grade" },
  { value:"11", label:"11th Grade" },
  { value:"12", label:"12th Grade" },
];

const COLLEGE_YEARS = [
  { value:"1", label:"Freshman"  },
  { value:"2", label:"Sophomore" },
  { value:"3", label:"Junior"    },
  { value:"4", label:"Senior"    },
];

const EDU_OPTIONS = [
  { value:"high_school", label:"High School"         },
  { value:"college",     label:"College / University" },
  { value:"other",       label:"Other"                },
];

function DemographicsPhase({ onContinue, submitting }) {
  const [fullName,        setFullName]        = useState("");
  const [educationLevel,  setEducationLevel]  = useState("");
  const [gradeYear,       setGradeYear]       = useState("");
  const [usState,         setUsState]         = useState("");

  const showGrade         = educationLevel === "high_school";
  const showYear          = educationLevel === "college";
  const gradeYearRequired = showGrade || showYear;

  const isValid = (
    fullName.trim().length > 0 &&
    educationLevel !== "" &&
    (!gradeYearRequired || gradeYear !== "")
  );

  const handleContinue = () => {
    if (!isValid || submitting) return;
    onContinue({
      fullName:       fullName.trim(),
      educationLevel,
      gradeYear:      gradeYearRequired ? gradeYear : null,
      state:          usState,
    });
  };

  const inputStyle = {
    width:"100%", padding:"0.75rem 1rem",
    border:`1.5px solid ${BORDER}`, borderRadius:10,
    background:SURFACE, color:TEXT,
    fontFamily:SANS, fontSize:"0.95rem", fontWeight:500,
    outline:"none", transition:"border-color 0.15s", boxSizing:"border-box",
  };

  const labelStyle = {
    display:"block", fontFamily:SANS, fontSize:"0.72rem", fontWeight:700,
    color:TEXT2, letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:"0.45rem",
  };

  return (
    <motion.div
      key="demographics"
      initial={{ opacity:0 }}
      animate={{ opacity:1 }}
      exit={{ opacity:0, y:-16 }}
      transition={{ duration:0.35 }}
      style={{
        display:"flex", flexDirection:"column",
        minHeight:"100vh", alignItems:"center", justifyContent:"center",
        padding:"2rem", position:"relative", zIndex:1, background:BG,
      }}
    >
      {/* Background */}
      <div style={{ position:"absolute", inset:0, background:"linear-gradient(to bottom right, rgba(99,102,241,0.07), transparent, rgba(124,58,237,0.05))", filter:"blur(80px)", zIndex:0 }}/>
      <div style={{ position:"absolute", inset:0, overflow:"hidden", zIndex:0 }}>
        <ElegantShape delay={0.3} width={500} height={120} rotate={12}  color="rgba(99,102,241,0.08)"  borderColor="rgba(99,102,241,0.18)"  glowColor="rgba(99,102,241,0.05)"  shapeStyle={{ left:"-8%", top:"10%" }}/>
        <ElegantShape delay={0.5} width={400} height={100} rotate={-15} color="rgba(124,58,237,0.07)"  borderColor="rgba(124,58,237,0.15)"  glowColor="rgba(124,58,237,0.04)"  shapeStyle={{ right:"-4%", bottom:"15%" }}/>
      </div>

      {/* Logo */}
      <div style={{ position:"absolute", top:"1.5rem", left:"3rem", zIndex:2 }}>
        <Logo />
      </div>

      {/* Step indicator */}
      <div style={{ position:"absolute", top:"1.6rem", right:"3rem", zIndex:2, display:"flex", alignItems:"center", gap:8 }}>
        <div style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"5px 14px", borderRadius:100, border:`1.5px solid ${BORDER}`, background:CARD, boxShadow:"0 2px 12px rgba(59,91,252,0.08)" }}>
          <div style={{ display:"flex", gap:5 }}>
            {[0,1].map(i => (
              <div key={i} style={{ width:i===0?18:6, height:6, borderRadius:3, background:i===0?ACCENT:`rgba(59,91,252,0.2)`, transition:"all 0.3s" }}/>
            ))}
          </div>
          <span style={{ fontFamily:SANS, fontSize:"0.78rem", fontWeight:600, color:ACCENT }}>Step 1 of 2</span>
        </div>
      </div>

      {/* Card */}
      <motion.div
        initial={{ opacity:0, y:28 }}
        animate={{ opacity:1, y:0 }}
        transition={{ duration:0.65, ease:[0.16,1,0.3,1], delay:0.1 }}
        style={{
          position:"relative", zIndex:1,
          background:CARD, border:`1.5px solid ${BORDER}`, borderRadius:20,
          padding:"2.5rem", maxWidth:460, width:"100%",
          boxShadow:"0 4px 40px rgba(59,91,252,0.1), 0 1px 8px rgba(0,0,0,0.06)",
        }}
      >
        {/* Header */}
        <motion.div {...fadeUp(0.15)} style={{ marginBottom:"1.75rem" }}>
          <h2 style={{ fontFamily:SERIF, fontWeight:700, fontSize:"1.85rem", color:TEXT, letterSpacing:"-0.025em", lineHeight:1.15, marginBottom:"0.5rem" }}>
            A bit about you
          </h2>
          <p style={{ fontFamily:SANS, fontSize:"0.9rem", color:TEXT2, lineHeight:1.65, margin:0 }}>
            This helps us personalize your roadmap and gives your AI guide the right context before your conversation.
          </p>
        </motion.div>

        {/* Fields */}
        <div style={{ display:"flex", flexDirection:"column", gap:"1.35rem" }}>

          {/* Name */}
          <motion.div {...fadeUp(0.22)}>
            <label style={labelStyle}>Your name</label>
            <input
              type="text"
              placeholder="First name is fine"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              onFocus={(e) => { e.target.style.borderColor = ACCENT; }}
              onBlur={(e)  => { e.target.style.borderColor = BORDER; }}
              onKeyDown={(e) => e.key === "Enter" && handleContinue()}
              style={inputStyle}
              autoFocus
            />
          </motion.div>

          {/* Education level */}
          <motion.div {...fadeUp(0.29)}>
            <label style={labelStyle}>Education level</label>
            <div style={{ display:"flex", gap:"0.5rem" }}>
              {EDU_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => { setEducationLevel(opt.value); setGradeYear(""); }}
                  style={{
                    flex:1, padding:"0.625rem 0.4rem", borderRadius:10,
                    border:`1.5px solid ${educationLevel === opt.value ? ACCENT : BORDER}`,
                    background:educationLevel === opt.value ? `rgba(59,91,252,0.07)` : "transparent",
                    color:educationLevel === opt.value ? ACCENT : TEXT2,
                    fontFamily:SANS, fontWeight:600, fontSize:"0.78rem",
                    cursor:"pointer", transition:"all 0.15s",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </motion.div>

          {/* Grade / Year (animated, conditional) */}
          <AnimatePresence>
            {(showGrade || showYear) && (
              <motion.div
                key="grade-year-field"
                initial={{ opacity:0, height:0 }}
                animate={{ opacity:1, height:"auto" }}
                exit={{ opacity:0, height:0 }}
                transition={{ duration:0.28, ease:[0.16,1,0.3,1] }}
                style={{ overflow:"hidden" }}
              >
                <label style={labelStyle}>{showGrade ? "Grade" : "Year in school"}</label>
                <div style={{ display:"flex", gap:"0.45rem", flexWrap:"wrap" }}>
                  {(showGrade ? HS_GRADES : COLLEGE_YEARS).map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setGradeYear(opt.value)}
                      style={{
                        padding:"0.55rem 1rem", borderRadius:8,
                        border:`1.5px solid ${gradeYear === opt.value ? ACCENT : BORDER}`,
                        background:gradeYear === opt.value ? `rgba(59,91,252,0.07)` : "transparent",
                        color:gradeYear === opt.value ? ACCENT : TEXT2,
                        fontFamily:SANS, fontWeight:600, fontSize:"0.82rem",
                        cursor:"pointer", transition:"all 0.15s",
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* State (optional) */}
          <motion.div {...fadeUp(0.36)}>
            <label style={labelStyle}>
              State{" "}
              <span style={{ fontWeight:500, opacity:0.55, textTransform:"none", letterSpacing:0, fontSize:"0.68rem" }}>
                (optional)
              </span>
            </label>
            <div style={{ position:"relative" }}>
              <select
                value={usState}
                onChange={(e) => setUsState(e.target.value)}
                onFocus={(e) => { e.target.style.borderColor = ACCENT; }}
                onBlur={(e)  => { e.target.style.borderColor = BORDER; }}
                style={{ ...inputStyle, cursor:"pointer", paddingRight:"2.25rem", appearance:"none", WebkitAppearance:"none" }}
              >
                <option value="">Select your state…</option>
                {US_STATES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              {/* Chevron icon */}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={TEXT3} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                style={{ position:"absolute", right:"0.85rem", top:"50%", transform:"translateY(-50%)", pointerEvents:"none" }}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>
          </motion.div>

          {/* Continue button */}
          <motion.div {...fadeUp(0.42)}>
            <motion.button
              onClick={handleContinue}
              disabled={!isValid || submitting}
              whileHover={isValid && !submitting ? { scale:1.02 } : {}}
              whileTap={isValid && !submitting ? { scale:0.97 } : {}}
              style={{
                width:"100%", padding:"0.9rem 1.5rem",
                borderRadius:12, border:"none",
                background:isValid ? `linear-gradient(135deg, ${ACCENT}, ${ACCENT2})` : `rgba(59,91,252,0.12)`,
                color:isValid ? "white" : TEXT3,
                fontFamily:SANS, fontWeight:700, fontSize:"0.95rem",
                cursor:isValid && !submitting ? "pointer" : "not-allowed",
                transition:"all 0.2s",
                display:"flex", alignItems:"center", justifyContent:"center", gap:"0.5rem",
                boxShadow:isValid ? "0 4px 20px rgba(59,91,252,0.3)" : "none",
              }}
            >
              {submitting
                ? <><Spinner size={16} color="white"/> Saving…</>
                : <>Continue to voice interview →</>
              }
            </motion.button>
          </motion.div>

        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Phase 1: Intro ───────────────────────────────────────────────────────────
function IntroPhase({ onStart, loading, retryNotice }) {
  const topics = [
    "Academic strengths","Career interests","Work style",
    "Problem-solving","Collaboration","Long-term goals","Personal values","Communication",
  ];

  return (
    <motion.div
      key="intro"
      initial={{ opacity:0 }}
      animate={{ opacity:1 }}
      exit={{ opacity:0, y:-16 }}
      transition={{ duration:0.35 }}
      style={{
        display:"flex", flexDirection:"column",
        height:"100vh", overflow:"hidden",
        position:"relative", zIndex:1,
        background:BG,
      }}
    >
      {/* ── Geometric background ────────────────────────────────────────────── */}
      <div style={{ position:"absolute", inset:0, background:"linear-gradient(to bottom right, rgba(99,102,241,0.07), transparent, rgba(124,58,237,0.05))", filter:"blur(80px)", zIndex:0 }}/>
      <div style={{ position:"absolute", inset:0, overflow:"hidden", zIndex:0 }}>
        <ElegantShape delay={0.3} width={600} height={140} rotate={12}  color="rgba(99,102,241,0.10)"  borderColor="rgba(99,102,241,0.2)"  glowColor="rgba(99,102,241,0.06)"  shapeStyle={{ left:"-10%", top:"15%" }}/>
        <ElegantShape delay={0.5} width={500} height={120} rotate={-15} color="rgba(124,58,237,0.09)"  borderColor="rgba(124,58,237,0.18)" glowColor="rgba(124,58,237,0.05)"  shapeStyle={{ right:"-5%", top:"70%" }}/>
        <ElegantShape delay={0.4} width={300} height={80}  rotate={-8}  color="rgba(59,91,252,0.08)"   borderColor="rgba(59,91,252,0.16)"  glowColor="rgba(59,91,252,0.05)"   shapeStyle={{ left:"5%", bottom:"5%" }}/>
        <ElegantShape delay={0.6} width={200} height={60}  rotate={20}  color="rgba(99,102,241,0.07)"  borderColor="rgba(99,102,241,0.15)" glowColor="rgba(99,102,241,0.04)"  shapeStyle={{ right:"15%", top:"10%" }}/>
        <ElegantShape delay={0.7} width={150} height={40}  rotate={-25} color="rgba(124,58,237,0.07)"  borderColor="rgba(124,58,237,0.14)" glowColor="rgba(124,58,237,0.04)"  shapeStyle={{ left:"20%", top:"5%" }}/>
      </div>
      <div style={{ position:"absolute", inset:0, background:`linear-gradient(to bottom, rgba(250,251,255,0.6), transparent, ${BG})`, pointerEvents:"none", zIndex:0 }}/>

      {/* ── Top nav ────────────────────────────────────────────────────────── */}
      <motion.div
        {...fadeUp(0.05)}
        style={{
          display:"flex", alignItems:"center", justifyContent:"space-between",
          padding:"1.5rem 3rem", flexShrink:0,
          position:"relative", zIndex:1,
        }}
      >
        <Logo />
        <motion.div
          initial={{ opacity:0, scale:0.88 }}
          animate={{ opacity:1, scale:1 }}
          transition={{ duration:0.5, ease:[0.16,1,0.3,1], delay:0.2 }}
        >
          <div style={{
            display:"inline-flex", alignItems:"center", gap:8,
            padding:"6px 16px", borderRadius:100,
            border:`1.5px solid ${BORDER}`,
            background:CARD, boxShadow:"0 2px 12px rgba(59,91,252,0.1)",
          }}>
            <span style={{
              width:7, height:7, borderRadius:"50%",
              background:"#22c55e", boxShadow:"0 0 8px #22c55e99",
              animation:"ob-blink 2s ease-in-out infinite",
            }}/>
            <span style={{ fontFamily:SANS, fontWeight:600, fontSize:"0.85rem", color:ACCENT, letterSpacing:"0.04em" }}>
              Voice interview · Ready
            </span>
          </div>
        </motion.div>
      </motion.div>

      {/* ── Two-column body ────────────────────────────────────────────────── */}
      <div style={{
        flex:1, display:"grid", gridTemplateColumns:"1fr 1fr",
        gap:"3rem", padding:"0 3rem 2rem",
        alignItems:"center", overflow:"hidden",
        position:"relative", zIndex:1,
      }}>

        {/* Left — text & topics */}
        <div style={{ display:"flex", flexDirection:"column", gap:"1.75rem", alignItems:"center", textAlign:"center", transform:"translateX(6rem)" }}>

          {/* Heading */}
          <h1 style={{
            fontFamily:SERIF,
            fontSize:"clamp(3.2rem,5.5vw,5.2rem)",
            fontWeight:900,
            letterSpacing:"-0.03em",
            lineHeight:1.06,
            margin:0, overflow:"visible",
          }}>
            {[
              { text:"Let's get to", delay:0.28 },
              { text:"know you.",    delay:0.42 },
            ].map(({ text, delay }, i) => (
              <motion.span
                key={i}
                initial={{ opacity:0, y:28 }}
                animate={{ opacity:1, y:0 }}
                transition={{ duration:0.7, ease:[0.16,1,0.3,1], delay }}
                style={{
                  display:"block",
                  color: i === 0 ? TEXT : ACCENT,
                }}
              >
                {text}
              </motion.span>
            ))}
          </h1>

          {/* Subtitle */}
          <motion.p
            {...fadeUp(0.58)}
            style={{
              fontFamily:SANS, color:TEXT2,
              fontSize:"1.25rem", lineHeight:1.75,
              fontWeight:400, margin:0,
            }}
          >
            Have a 5–8 minute conversation with your AI guide. Just talk naturally — there are no right or wrong answers.
          </motion.p>

          {/* Topics */}
          <motion.div {...fadeUp(0.74)}>
            <p style={{
              fontFamily:SANS, fontWeight:600, fontSize:"0.8rem", color:TEXT3,
              letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:"0.75rem",
            }}>
              What we'll explore together
            </p>
            <motion.div
              {...staggerParent(0.82, 0.045)}
              style={{ display:"flex", flexWrap:"wrap", gap:"0.45rem", justifyContent:"center" }}
            >
              {topics.map(topic => (
                <motion.div
                  key={topic}
                  {...chipChild}
                  whileHover={{ scale:1.07, y:-2 }}
                  transition={{ type:"spring", stiffness:400, damping:18 }}
                  style={{
                    padding:"5px 13px", borderRadius:100,
                    background:`linear-gradient(135deg, rgba(59,91,252,0.07), rgba(124,58,237,0.05))`,
                    border:`1.5px solid rgba(59,91,252,0.16)`,
                    color:ACCENT, fontFamily:SANS, fontWeight:500, fontSize:"0.92rem",
                    cursor:"default",
                  }}
                >
                  {topic}
                </motion.div>
              ))}
            </motion.div>
          </motion.div>

        </div>

        {/* Right — voice orb */}
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:"1.25rem" }}>
          {retryNotice && (
            <motion.div
              initial={{ opacity:0, y:8 }}
              animate={{ opacity:1, y:0 }}
              transition={{ duration:0.4 }}
              style={{
                maxWidth:340,
                background:"rgba(251,191,36,0.12)",
                border:"1.5px solid rgba(251,191,36,0.35)",
                borderRadius:"0.875rem",
                padding:"0.75rem 1rem",
                fontSize:"0.825rem",
                color:"#92400e",
                lineHeight:1.5,
                textAlign:"center",
                fontFamily:"'Space Grotesk', sans-serif",
              }}
            >
              {retryNotice}
            </motion.div>
          )}
          <VoiceOrb onStart={onStart} loading={loading}/>
        </div>

      </div>
    </motion.div>
  );
}

// ─── Phase 2: Active Conversation ─────────────────────────────────────────────
function ActivePhase({ transcript, elapsed, isSpeaking, onEnd, transcriptEndRef }) {
  const formatTime = (s) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    return `${m}:${(s % 60).toString().padStart(2, "0")}`;
  };

  return (
    <motion.div
      key="active"
      initial={{ opacity:0 }}
      animate={{ opacity:1 }}
      exit={{ opacity:0 }}
      transition={{ duration:0.4 }}
      style={{ display:"flex", flexDirection:"column", minHeight:"100vh", position:"relative", zIndex:1, background:BG }}
    >
      {/* Top bar */}
      <motion.div
        initial={{ opacity:0, y:-12 }}
        animate={{ opacity:1, y:0 }}
        transition={{ duration:0.5 }}
        style={{
          display:"flex", alignItems:"center", justifyContent:"space-between",
          padding:"1.25rem 1.75rem",
          borderBottom:`1.5px solid ${BORDER}`,
          background:CARD, flexShrink:0,
          boxShadow:"0 1px 0 rgba(59,91,252,0.06)",
        }}
      >
        <Logo />
        <div style={{ display:"flex", alignItems:"center", gap:"1rem" }}>
          <div style={{
            display:"flex", alignItems:"center", gap:7,
            padding:"5px 12px", borderRadius:100,
            background:"rgba(34,197,94,0.08)", border:"1.5px solid rgba(34,197,94,0.2)",
          }}>
            <span style={{
              width:6, height:6, borderRadius:"50%",
              background:"#22c55e", boxShadow:"0 0 6px #22c55e",
              animation:"ob-blink 2s ease-in-out infinite",
            }}/>
            <span style={{ fontFamily:SANS, fontWeight:600, fontSize:"0.72rem", color:"#16a34a", letterSpacing:"0.04em" }}>LIVE</span>
          </div>
          <span style={{ fontFamily:MONO, fontSize:"0.82rem", color:TEXT2, letterSpacing:"0.04em", fontWeight:500 }}>
            {formatTime(elapsed)}
          </span>
        </div>
      </motion.div>

      {/* Transcript */}
      <div style={{
        flex:1, overflowY:"auto", padding:"1.75rem",
        display:"flex", flexDirection:"column", gap:"0.875rem",
        maxWidth:640, width:"100%", margin:"0 auto", alignSelf:"stretch",
      }}>
        {transcript.length === 0 && (
          <motion.p
            initial={{ opacity:0 }}
            animate={{ opacity:1 }}
            transition={{ delay:0.8 }}
            style={{ textAlign:"center", color:TEXT3, fontFamily:SANS, fontSize:"0.9rem", marginTop:"5rem", lineHeight:1.7 }}
          >
            Your conversation will appear here...
          </motion.p>
        )}
        <AnimatePresence initial={false}>
          {transcript.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity:0, y:12, scale:0.97 }}
              animate={{ opacity:1, y:0, scale:1 }}
              transition={{ duration:0.35, ease:[0.22,1,0.36,1] }}
              style={{ display:"flex", justifyContent:msg.role === "agent" ? "flex-start" : "flex-end" }}
            >
              <div style={{
                maxWidth:"76%", padding:"0.875rem 1.125rem",
                borderRadius:msg.role === "agent" ? "4px 16px 16px 16px" : "16px 4px 16px 16px",
                background:msg.role === "agent"
                  ? CARD
                  : `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT2} 100%)`,
                border:msg.role === "agent" ? `1.5px solid ${BORDER}` : "none",
                color:msg.role === "agent" ? TEXT : "white",
                fontFamily:SANS, fontSize:"0.95rem", lineHeight:1.68, fontWeight:400,
                boxShadow:msg.role !== "agent"
                  ? "0 4px 20px rgba(59,91,252,0.35)"
                  : "0 1px 6px rgba(0,0,0,0.06)",
              }}>
                {msg.message}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        <div ref={transcriptEndRef}/>
      </div>

      {/* Bottom bar */}
      <div style={{
        padding:"1.25rem 1.75rem 2rem",
        borderTop:`1.5px solid ${BORDER}`,
        background:CARD,
        display:"flex", flexDirection:"column", alignItems:"center", gap:"1rem",
        flexShrink:0,
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:"1rem" }}>
          <Waveform active={true} color={isSpeaking ? ACCENT : "rgba(59,91,252,0.2)"}/>
          <motion.span
            animate={{ color: isSpeaking ? ACCENT : TEXT2 }}
            transition={{ duration:0.4 }}
            style={{ fontFamily:SANS, fontWeight:500, fontSize:"0.875rem", minWidth:220, fontFamily:SANS }}
          >
            {isSpeaking ? "Mentorable is speaking..." : "Your turn..."}
          </motion.span>
        </div>
        <motion.button
          onClick={onEnd}
          whileHover={{ borderColor:ACCENT, color:ACCENT }}
          transition={{ duration:0.15 }}
          style={{
            padding:"0.6rem 1.75rem", borderRadius:8,
            border:`1.5px solid ${BORDER}`, background:CARD,
            color:TEXT2, fontFamily:SANS, fontWeight:500, fontSize:"0.85rem",
            cursor:"pointer",
          }}
        >
          End conversation
        </motion.button>
      </div>
    </motion.div>
  );
}

// ─── Phase 3: Processing ──────────────────────────────────────────────────────
function ProcessingPhase() {
  return (
    <motion.div
      key="processing"
      initial={{ opacity:0, scale:0.97 }}
      animate={{ opacity:1, scale:1 }}
      exit={{ opacity:0 }}
      transition={{ duration:0.5, ease:[0.16,1,0.3,1] }}
      style={{
        flex:1, minHeight:"100vh",
        display:"flex", flexDirection:"column",
        alignItems:"center", justifyContent:"center",
        textAlign:"center", padding:"2rem",
        position:"relative", zIndex:1,
      }}
    >
      {/* Counter-rotating rings */}
      <div style={{ position:"relative", marginBottom:"2.5rem" }}>
        <div style={{
          width:68, height:68, borderRadius:"50%",
          border:`2px solid rgba(59,91,252,0.15)`, borderTopColor:ACCENT,
          animation:"spinner-rotate 1.2s linear infinite",
        }}/>
        <div style={{
          position:"absolute", top:"50%", left:"50%",
          transform:"translate(-50%, -50%)",
          width:44, height:44, borderRadius:"50%",
          border:`2px solid rgba(124,58,237,0.12)`, borderBottomColor:ACCENT2,
          animation:"spinner-rotate 1.8s linear infinite reverse",
        }}/>
      </div>

      <motion.h2
        initial={{ opacity:0, y:16 }}
        animate={{ opacity:1, y:0 }}
        transition={{ delay:0.2, duration:0.6 }}
        style={{ fontFamily:SERIF, fontWeight:700, fontSize:"1.75rem", color:TEXT, letterSpacing:"-0.03em", marginBottom:"0.875rem" }}
      >
        Building your scorecard...
      </motion.h2>
      <motion.p
        initial={{ opacity:0, y:12 }}
        animate={{ opacity:1, y:0 }}
        transition={{ delay:0.35, duration:0.6 }}
        style={{ fontFamily:SANS, color:TEXT2, fontSize:"1rem", lineHeight:1.72, maxWidth:360, marginBottom:"2rem" }}
      >
        This takes about 10 seconds. We're analysing your conversation and identifying your unique strengths.
      </motion.p>

      {/* Pulsing dots */}
      <div style={{ display:"flex", gap:8, justifyContent:"center" }}>
        {[0, 1, 2].map(i => (
          <motion.div
            key={i}
            animate={{ opacity:[0.25, 1, 0.25], scale:[0.75, 1.15, 0.75] }}
            transition={{ duration:1.2, delay:i * 0.2, repeat:Infinity, ease:"easeInOut" }}
            style={{
              width:9, height:9, borderRadius:"50%",
              background:`linear-gradient(135deg, ${ACCENT}, ${ACCENT2})`,
            }}
          />
        ))}
      </div>
    </motion.div>
  );
}

// ─── Error Phase ──────────────────────────────────────────────────────────────
function ErrorPhase({ error, onRetry }) {
  return (
    <motion.div
      key="error"
      initial={{ opacity:0, scale:0.97 }}
      animate={{ opacity:1, scale:1 }}
      exit={{ opacity:0 }}
      transition={{ duration:0.45, ease:[0.16,1,0.3,1] }}
      style={{
        flex:1, minHeight:"100vh", display:"flex", flexDirection:"column",
        alignItems:"center", justifyContent:"center",
        textAlign:"center", padding:"2rem", position:"relative", zIndex:1,
      }}
    >
      <motion.div
        initial={{ scale:0.7, opacity:0 }}
        animate={{ scale:1, opacity:1 }}
        transition={{ delay:0.15, duration:0.5, ease:[0.16,1,0.3,1] }}
        style={{
          width:56, height:56, borderRadius:14,
          background:"rgba(239,68,68,0.08)", border:"1.5px solid rgba(239,68,68,0.2)",
          display:"flex", alignItems:"center", justifyContent:"center",
          marginBottom:"1.5rem", fontSize:"1.35rem",
        }}
      >⚠</motion.div>

      <motion.h2 {...fadeUp(0.25)} style={{ fontFamily:SERIF, fontWeight:700, fontSize:"1.6rem", color:TEXT, letterSpacing:"-0.03em", marginBottom:"0.75rem" }}>
        Something went wrong
      </motion.h2>
      <motion.p {...fadeUp(0.35)} style={{ fontFamily:SANS, color:TEXT2, fontSize:"1rem", lineHeight:1.68, maxWidth:360, marginBottom:"2rem" }}>
        {error || "An unexpected error occurred. Please try again."}
      </motion.p>
      <motion.button
        {...fadeUp(0.45)}
        onClick={onRetry}
        whileHover={{ scale:1.04 }}
        whileTap={{ scale:0.97 }}
        style={{
          padding:"0.7rem 1.75rem", borderRadius:10,
          background:`linear-gradient(135deg, ${ACCENT}, ${ACCENT2})`,
          border:"none", color:"white", fontFamily:SANS, fontWeight:600, fontSize:"0.9rem",
          cursor:"pointer", boxShadow:"0 4px 20px rgba(59,91,252,0.35)",
        }}
      >
        Try again
      </motion.button>
    </motion.div>
  );
}

// ─── Mic Denied Phase ─────────────────────────────────────────────────────────
function MicDeniedPhase({ onRetry }) {
  return (
    <motion.div
      key="mic-denied"
      initial={{ opacity:0, scale:0.97 }}
      animate={{ opacity:1, scale:1 }}
      exit={{ opacity:0 }}
      transition={{ duration:0.45, ease:[0.16,1,0.3,1] }}
      style={{
        flex:1, minHeight:"100vh", display:"flex", flexDirection:"column",
        alignItems:"center", justifyContent:"center",
        textAlign:"center", padding:"2rem", position:"relative", zIndex:1,
      }}
    >
      <motion.div
        initial={{ scale:0.7, opacity:0 }}
        animate={{ scale:1, opacity:1 }}
        transition={{ delay:0.15, duration:0.5, ease:[0.16,1,0.3,1] }}
        style={{
          width:56, height:56, borderRadius:14,
          background:"rgba(245,158,11,0.08)", border:"1.5px solid rgba(245,158,11,0.25)",
          display:"flex", alignItems:"center", justifyContent:"center",
          marginBottom:"1.5rem", fontSize:"1.35rem",
        }}
      >🎙</motion.div>

      <motion.h2 {...fadeUp(0.25)} style={{ fontFamily:SERIF, fontWeight:700, fontSize:"1.6rem", color:TEXT, letterSpacing:"-0.03em", marginBottom:"0.75rem" }}>
        Microphone access needed
      </motion.h2>
      <motion.p {...fadeUp(0.35)} style={{ fontFamily:SANS, color:TEXT2, fontSize:"1rem", lineHeight:1.68, maxWidth:360, marginBottom:"2rem" }}>
        We need microphone access to continue. Please allow access in your browser settings and try again.
      </motion.p>
      <motion.button
        {...fadeUp(0.45)}
        onClick={onRetry}
        whileHover={{ scale:1.04 }}
        whileTap={{ scale:0.97 }}
        style={{
          padding:"0.7rem 1.75rem", borderRadius:10,
          background:`linear-gradient(135deg, ${ACCENT}, ${ACCENT2})`,
          border:"none", color:"white", fontFamily:SANS, fontWeight:600, fontSize:"0.9rem",
          cursor:"pointer", boxShadow:"0 4px 20px rgba(59,91,252,0.35)",
        }}
      >
        Try again
      </motion.button>
    </motion.div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function OnboardingPage() {
  const [phase, setPhase]               = useState("loading");
  const [transcript, setTranscript]     = useState([]);
  const [elapsed, setElapsed]           = useState(0);
  const [error, setError]               = useState(null);
  const [retryNotice, setRetryNotice]   = useState(null); // shown on intro screen after insufficient convo
  const [user, setUser]                 = useState(null);
  const [startingConv, setStartingConv] = useState(false);
  const [demographics, setDemographics] = useState({ fullName:"", educationLevel:"", gradeYear:null, state:"" });
  const [savingDemo, setSavingDemo]     = useState(false);

  const transcriptEndRef = useRef(null);
  const timerRef         = useRef(null);
  const transcriptRef    = useRef([]);
  const endingRef           = useRef(false); // prevents double-trigger from onDisconnect + manual end
  const endConversationRef  = useRef(null);  // stable ref so onDisconnect closure always calls latest fn

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/auth"; return; }
      const { data: profile } = await supabase
        .from("profiles").select("onboarding_completed").eq("id", user.id).single();
      if (profile?.onboarding_completed) { window.location.href = "/scorecard"; return; }
      setUser(user);
      setPhase("demographics");
    };
    checkAuth();
  }, []);

  const handleDemographicsContinue = async (data) => {
    setSavingDemo(true);
    setDemographics(data);
    try {
      await supabase.from("profiles").upsert({
        id:              user.id,
        full_name:       data.fullName,
        education_level: data.educationLevel,
        grade_level:     data.gradeYear ? parseInt(data.gradeYear) : null,
        location_general: data.state || null,
        updated_at:      new Date().toISOString(),
      }, { onConflict: "id" });
    } catch (err) {
      console.error("[Onboarding] demographics save error:", err);
      // Non-blocking — proceed even if save fails; will retry in final upsert
    }
    setSavingDemo(false);
    setPhase("intro");
  };

  const conversation = useConversation({
    onMessage: (msg) => {
      // ElevenLabs SDK may use msg.source ("user"/"ai") or msg.role ("user"/"agent")
      const role    = msg.role ?? (msg.source === "ai" ? "agent" : "user");
      const message = msg.message ?? msg.text ?? "";
      if (!message) return; // skip empty frames
      const newMsg = { role, message, id: `${Date.now()}-${Math.random()}` };
      setTranscript((prev) => {
        const next = [...prev, newMsg];
        transcriptRef.current = next;
        return next;
      });
    },
    onDisconnect: () => {
      // Fires when the agent ends the session from its side — auto-advance to processing
      endConversationRef.current?.();
    },
    onError: (err) => {
      console.error("[ElevenLabs] onError:", err);
      const msg = typeof err === "string" ? err : "Connection error. Please try again.";
      setError(msg); setPhase("error");
    },
  });

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior:"smooth" });
  }, [transcript]);

  useEffect(() => {
    if (phase === "active") {
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [phase]);

  useEffect(() => {
    return () => { conversation.endSession().catch(() => {}); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startConversation = async () => {
    setRetryNotice(null);
    setStartingConv(true);
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setPhase("mic-denied"); setStartingConv(false); return;
    }
    try {
      // Start the session exactly as before — no overrides that could be rejected by the agent config
      await conversation.startSession({ agentId: AGENT_ID });
      setPhase("active");
      // After the session is live, send demographic context via sendContextualUpdate.
      // This is the safe, supported way to inject context without touching session init.
      if (demographics.fullName || demographics.educationLevel || demographics.state) {
        const parts = [];
        if (demographics.fullName) {
          parts.push(`The student's name is ${demographics.fullName} — please address them by name throughout the conversation.`);
        }
        if (demographics.educationLevel) {
          const levelLabel = { high_school: "High School", college: "College / University", other: "Other" }[demographics.educationLevel] ?? demographics.educationLevel;
          const gradeLabel = { "9": "9th grade", "10": "10th grade", "11": "11th grade", "12": "12th grade", "1": "1st year (Freshman)", "2": "2nd year (Sophomore)", "3": "3rd year (Junior)", "4": "4th year (Senior)" }[demographics.gradeYear ?? ""] ?? null;
          parts.push(`They are a ${levelLabel} student${gradeLabel ? `, ${gradeLabel}` : ""}.`);
        }
        if (demographics.state) {
          parts.push(`They are based in ${demographics.state}.`);
        }
        try { conversation.sendContextualUpdate(parts.join(" ")); } catch (_) { /* best-effort */ }
      }
    } catch (err) {
      setError(err?.message || "Failed to connect. Please try again.");
      setPhase("error");
    }
    setStartingConv(false);
  };

  const endConversation = async () => {
    if (endingRef.current) return;
    endingRef.current = true;
    endConversationRef.current = null; // prevent any further onDisconnect re-entry
    clearInterval(timerRef.current);
    try { await conversation.endSession(); } catch { /* already closed */ }
    setPhase("processing");
    try {
      // Always get a fresh user — don't rely on potentially stale state
      const { data: { user: freshUser } } = await supabase.auth.getUser();
      if (!freshUser) throw new Error("Session expired. Please log in again.");

      const messages = transcriptRef.current;

      const transcriptText = messages.length > 0
        ? messages.map((m) => `${m.role === "agent" ? "Mentorable" : "Student"}: ${m.message}`).join("\n")
        : "";

      const anthropic = new Anthropic({
        apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY,
        dangerouslyAllowBrowser: true,
      });

      // Quick sufficiency check — did the student share enough to build a profile?
      const checkMsg = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 64,
        messages: [{
          role: "user",
          content: `A student just finished a voice onboarding conversation with an AI career guide. Did the student share enough personal information (interests, strengths, goals, or experiences) to meaningfully build a career profile? Reply with only "yes" or "no".\n\nTranscript:\n${transcriptText || "(empty — no messages recorded)"}`,
        }],
      });
      const checkText = (checkMsg.content[0]?.type === "text" ? checkMsg.content[0].text : "").trim().toLowerCase();

      if (!checkText.startsWith("yes")) {
        // Not enough info — reset and send back to intro with a gentle notice
        endingRef.current = false;
        setTranscript([]);
        transcriptRef.current = [];
        setElapsed(0);
        setRetryNotice("It looks like the conversation ended before we got to know you. No worries — just start it again and share a bit about yourself when you're ready.");
        setPhase("intro");
        return;
      }

      const aiMessage = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        messages: [{
          role: "user",
          content: `You are extracting structured career profile data from a voice conversation transcript between an AI career guide and a high school student.

Return ONLY valid JSON with no other text, no markdown, no backticks:
{
  "strengths": ["3-5 specific strengths mentioned or demonstrated"],
  "weaknesses": ["2-3 areas for growth"],
  "interests": ["3-5 specific interests or passions"],
  "work_style": "2-3 sentence description of how they like to work",
  "career_matches": ["top 3 career titles that fit this student"],
  "onboarding_summary": "2-3 warm, encouraging sentences summarizing who this student is and what makes them unique"
}

Transcript:
${transcriptText}`,
        }],
      });

      const responseText = aiMessage.content[0]?.type === "text" ? aiMessage.content[0].text : "";

      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("Could not extract a profile from the conversation. Please try again.");
      const profile = JSON.parse(jsonMatch[0]);

      const { data: upsertedRows, error: updateError } = await supabase
        .from("profiles")
        .upsert({
          id:                   freshUser.id,
          // Demographic fields (collected before voice call)
          full_name:            demographics.fullName || null,
          education_level:      demographics.educationLevel || null,
          grade_level:          demographics.gradeYear ? parseInt(demographics.gradeYear) : null,
          location_general:     demographics.state || null,
          // Voice-extracted fields
          strengths:            profile.strengths,
          weaknesses:           profile.weaknesses,
          interests:            profile.interests,
          work_style:           profile.work_style,
          career_matches:       profile.career_matches,
          onboarding_summary:   profile.onboarding_summary,
          onboarding_completed: true,
          updated_at:           new Date().toISOString(),
        }, { onConflict: "id" })
        .select("id");

      if (updateError) {
        console.error("[Onboarding] Supabase upsert error:", updateError);
        throw new Error(`Failed to save profile: ${updateError.message}`);
      }

      window.location.href = "/scorecard";
    } catch (err) {
      console.error("[Onboarding] endConversation error:", err);
      setError(err?.message || "Something went wrong processing your profile. Please try again.");
      setPhase("error");
    }
  };
  // Keep ref current so onDisconnect always calls the latest closure
  endConversationRef.current = endConversation;

  if (phase === "loading") {
    return (
      <div style={{ minHeight:"100vh", background:BG, display:"flex", alignItems:"center", justifyContent:"center" }}>
        <Spinner size={26} color={ACCENT}/>
      </div>
    );
  }

  return (
    <div style={{
      minHeight:"100vh", background:BG,
      display:"flex", flexDirection:"column",
      fontFamily:SANS, position:"relative", overflow:"hidden",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Space+Grotesk:wght@400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        @keyframes blob-pulse {
          0%, 100% { opacity:0.7; transform:scale(1); }
          50%       { opacity:1;   transform:scale(1.09) translateY(-14px); }
        }
        @keyframes blob-drift-tr {
          0%, 100% { transform:translate(0,0) scale(1); }
          50%       { transform:translate(-22px,18px) scale(1.04); }
        }
        @keyframes blob-drift-bl {
          0%, 100% { transform:translate(0,0) scale(1); }
          50%       { transform:translate(18px,-16px) scale(1.03); }
        }
        @keyframes blob-drift-br {
          0%, 100% { transform:translate(0,0) scale(1); }
          50%       { transform:translate(-14px,-20px) scale(1.05); }
        }
        @keyframes float-dot {
          0%, 100% { transform:translateY(0);    opacity:0.55; }
          50%       { transform:translateY(-10px); opacity:1; }
        }
        @keyframes gradient-slide {
          0%   { background-position:0% center; }
          100% { background-position:300% center; }
        }
        @keyframes ob-pulse-ring {
          0%   { transform:scale(1);   opacity:0.75; }
          100% { transform:scale(1.85); opacity:0; }
        }
        @keyframes ob-wave {
          0%, 100% { transform:scaleY(0.28); }
          50%       { transform:scaleY(1); }
        }
        @keyframes ob-blink {
          0%, 100% { opacity:1; }
          50%       { opacity:0.35; }
        }
        @keyframes spinner-rotate {
          from { transform:rotate(0deg); }
          to   { transform:rotate(360deg); }
        }
      `}</style>

      <AnimatePresence mode="wait">
        {phase === "demographics" && <DemographicsPhase key="demographics" onContinue={handleDemographicsContinue} submitting={savingDemo}/>}
        {phase === "intro"      && <IntroPhase      key="intro"      onStart={startConversation} loading={startingConv} retryNotice={retryNotice}/>}
        {phase === "active"     && <ActivePhase     key="active"     transcript={transcript} elapsed={elapsed} isSpeaking={conversation.isSpeaking} onEnd={endConversation} transcriptEndRef={transcriptEndRef}/>}
        {phase === "processing" && <ProcessingPhase key="processing"/>}
        {phase === "error"      && <ErrorPhase      key="error"      error={error} onRetry={() => { setError(null); setPhase("demographics"); }}/>}
        {phase === "mic-denied" && <MicDeniedPhase  key="mic-denied" onRetry={() => setPhase("intro")}/>}
      </AnimatePresence>
    </div>
  );
}
