import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useConversation } from "@elevenlabs/react";
import { supabase } from "../lib/supabase.js";
import Spinner from "../components/common/Spinner.jsx";
import { VoicePoweredOrb } from "../components/common/VoicePoweredOrb.jsx";
import { useIsMobile } from "../hooks/useIsMobile.js";
import IntakeForm, { EMPTY_INTAKE } from "../components/onboarding/IntakeForm.jsx";
import TextInterview from "../components/onboarding/TextInterview.jsx";
import IntakeReview from "../components/onboarding/IntakeReview.jsx";
import {
  saveIntakeForm, fetchIntakeContext, extractIntake, commitIntake, fetchActivities,
} from "../lib/intake.js";

const AGENT_ID = import.meta.env.VITE_ELEVENLABS_AGENT_ID;
const MAX_CALL_SECONDS = 180; // ~3 min cap — keeps ElevenLabs credit cost down; the agent is prompted to wrap up by ~2.5 min
const SILENCE_TIMEOUT_MS = 45000; // auto-end only if the call sits FULLY silent (agent done, user not talking, no replies) this long
const SPEAKING_VOLUME_THRESHOLD = 0.02; // mic input above this = user is actively talking (counts as activity)

// ─── Design tokens ────────────────────────────────────────────────────────────
const BG      = "#fafbff";
const TEXT    = "#0e1019";
const TEXT2   = "#4b5470";
const TEXT3   = "#5b6188";
const ACCENT  = "#1d4ed8";
const ACCENT2 = "#3b82f6";
const BORDER  = "rgba(59,91,252,0.13)";
const SURFACE = "rgba(59,91,252,0.05)";
const CARD    = "#faf9f5";
const SERIF   = "'Raleway', sans-serif";
const SANS    = "'Raleway', sans-serif";
const MONO    = "'Raleway', sans-serif";

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
function VoiceOrb({ onStart, loading, size = 340 }) {
  return (
    <motion.div
      initial={{ opacity:0, x:30 }}
      animate={{ opacity:1, x:0 }}
      transition={{ duration:0.75, ease:[0.16,1,0.3,1], delay:0.55 }}
      style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"2rem" }}
    >
      {/* WebGL orb */}
      <div style={{ position:"relative", width:size, height:size, maxWidth:"80vw" }}>
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
          {loading ? <Spinner size={24} color="#faf9f5"/> : <PhoneOutIcon color="white" size={28}/>}
        </motion.button>
        <span style={{ fontFamily:SANS, fontSize:"1rem", color:TEXT2, fontWeight:400, letterSpacing:"-0.01em" }}>
          Call Agent
        </span>
      </div>
    </motion.div>
  );
}

// ─── Elegant floating shape (background element) ─────────────────────────────
function ElegantShape({ shapeStyle, delay = 0, width = 400, height = 100, rotate = 0, color = "rgba(37,99,235,0.15)", borderColor = "rgba(59,91,252,0.18)", glowColor = "rgba(59,91,252,0.07)" }) {
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

// ─── Channel picker: talk it through by text or by voice ─────────────────────
function ChannelPhase({ onPick, retryNotice }) {
  const Option = ({ id, title, blurb, meta, icon }) => (
    <button type="button" onClick={() => onPick(id)}
      style={{
        display: "flex", alignItems: "flex-start", gap: 15, width: "100%", textAlign: "left",
        cursor: "pointer", background: "#fff", border: `1.5px solid ${BORDER}`,
        borderRadius: 16, padding: "1.2rem 1.3rem", transition: "all 0.15s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = ACCENT; e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.transform = "none"; }}>
      <span style={{
        flexShrink: 0, width: 42, height: 42, borderRadius: 12,
        background: "rgba(59,91,252,0.08)", color: ACCENT,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
      }}>{icon}</span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontFamily: SANS, fontWeight: 700, fontSize: "1.05rem", color: TEXT, marginBottom: 4 }}>{title}</span>
        <span style={{ display: "block", fontFamily: SANS, fontSize: "0.92rem", color: TEXT2, lineHeight: 1.55 }}>{blurb}</span>
        <span style={{ display: "block", fontFamily: SANS, fontSize: "0.8rem", fontWeight: 600, color: TEXT3, marginTop: 7 }}>{meta}</span>
      </span>
    </button>
  );

  return (
    <motion.div key="channel"
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.4 }}
      style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "2.5rem 1.25rem" }}>
      <div style={{ width: "100%", maxWidth: 560 }}>
        <h1 style={{ fontFamily: SANS, fontWeight: 700, fontSize: "1.9rem", color: TEXT, letterSpacing: "-0.02em", marginBottom: "0.5rem", textAlign: "center" }}>
          Now let's talk it through
        </h1>
        <p style={{ fontFamily: SANS, fontSize: "1rem", color: TEXT2, lineHeight: 1.6, marginBottom: "1.9rem", textAlign: "center" }}>
          We have your list. Next we find what connects it, and where the gaps are. Pick whichever you'd rather do.
        </p>

        {retryNotice && (
          <div style={{ background: "rgba(217,119,6,0.08)", border: "1.5px solid rgba(217,119,6,0.3)", borderRadius: 12, padding: "0.9rem 1.1rem", marginBottom: "1.4rem" }}>
            <p style={{ fontFamily: SANS, fontSize: "0.9rem", color: "#7c4a03", lineHeight: 1.55, margin: 0 }}>{retryNotice}</p>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
          <Option id="text" title="Type it out"
            blurb="A short back and forth. Take as long as you like on each answer."
            meta="About 5 minutes"
            icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>} />
          <Option id="voice" title="Talk out loud"
            blurb="A quick call with Mentorable. Easiest way to get your thinking out."
            meta="About 3 minutes, needs a microphone"
            icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>} />
        </div>
      </div>
    </motion.div>
  );
}

// ─── Phase 1: Intro ───────────────────────────────────────────────────────────
function IntroPhase({ onStart, loading, retryNotice }) {
  const isMobile = useIsMobile();
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
        // Mobile stacks and scrolls; desktop stays a fixed viewport-height splash.
        height:isMobile ? "auto" : "100vh",
        minHeight:"100vh",
        overflow:isMobile ? "visible" : "hidden",
        position:"relative", zIndex:1,
        background:BG,
      }}
    >
      {/* ── Geometric background ────────────────────────────────────────────── */}
      <div style={{ position:"absolute", inset:0, background:"linear-gradient(to bottom right, rgba(37,99,235,0.07), transparent, rgba(59,130,246,0.05))", filter:"blur(80px)", zIndex:0 }}/>
      <div style={{ position:"absolute", inset:0, overflow:"hidden", zIndex:0 }}>
        <ElegantShape delay={0.3} width={600} height={140} rotate={12}  color="rgba(37,99,235,0.10)"  borderColor="rgba(37,99,235,0.2)"  glowColor="rgba(37,99,235,0.06)"  shapeStyle={{ left:"-10%", top:"15%" }}/>
        <ElegantShape delay={0.5} width={500} height={120} rotate={-15} color="rgba(59,130,246,0.09)"  borderColor="rgba(59,130,246,0.18)" glowColor="rgba(59,130,246,0.05)"  shapeStyle={{ right:"-5%", top:"70%" }}/>
        <ElegantShape delay={0.4} width={300} height={80}  rotate={-8}  color="rgba(59,91,252,0.08)"   borderColor="rgba(59,91,252,0.16)"  glowColor="rgba(59,91,252,0.05)"   shapeStyle={{ left:"5%", bottom:"5%" }}/>
        <ElegantShape delay={0.6} width={200} height={60}  rotate={20}  color="rgba(37,99,235,0.07)"  borderColor="rgba(37,99,235,0.15)" glowColor="rgba(37,99,235,0.04)"  shapeStyle={{ right:"15%", top:"10%" }}/>
        <ElegantShape delay={0.7} width={150} height={40}  rotate={-25} color="rgba(59,130,246,0.07)"  borderColor="rgba(59,130,246,0.14)" glowColor="rgba(59,130,246,0.04)"  shapeStyle={{ left:"20%", top:"5%" }}/>
      </div>
      <div style={{ position:"absolute", inset:0, background:`linear-gradient(to bottom, rgba(250,251,255,0.6), transparent, ${BG})`, pointerEvents:"none", zIndex:0 }}/>

      {/* ── Top nav ────────────────────────────────────────────────────────── */}
      <motion.div
        {...fadeUp(0.05)}
        style={{
          display:"flex", alignItems:"center", justifyContent:"space-between",
          padding:isMobile ? "1.25rem 1.5rem" : "1.5rem 3rem", flexShrink:0,
          position:"relative", zIndex:1,
        }}
      >
        <Logo />
      </motion.div>

      {/* ── Two-column body (stacks on mobile) ─────────────────────────────── */}
      <div style={{
        flex:1, display:"grid", gridTemplateColumns:isMobile ? "1fr" : "1fr 1fr",
        gap:isMobile ? "2.5rem" : "3rem",
        padding:isMobile ? "0.5rem 1.5rem 3rem" : "0 3rem 2rem",
        alignItems:"center", overflow:isMobile ? "visible" : "hidden",
        position:"relative", zIndex:1,
      }}>

        {/* Left — text & topics */}
        <div style={{ display:"flex", flexDirection:"column", gap:"1.75rem", alignItems:"center", textAlign:"center", transform:isMobile ? "none" : "translateX(6rem)" }}>

          {/* Heading */}
          <h1 style={{
            fontFamily:SERIF,
            fontSize:isMobile ? "clamp(2.5rem,11vw,3.2rem)" : "clamp(3.2rem,5.5vw,5.2rem)",
            fontWeight:700,
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
              fontSize:isMobile ? "1.05rem" : "1.25rem", lineHeight:1.75,
              fontWeight:400, margin:0,
            }}
          >
            Hit the call button and have a short voice conversation with your AI advisor. Just talk naturally, no forms to fill out. It takes about 3 minutes and helps us tailor everything to you.
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
                    background:`linear-gradient(135deg, rgba(59,91,252,0.07), rgba(59,130,246,0.05))`,
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
                fontFamily:"'Raleway', sans-serif",
              }}
            >
              {retryNotice}
            </motion.div>
          )}
          <VoiceOrb onStart={onStart} loading={loading} size={isMobile ? 260 : 340}/>
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
        {/* Timer */}
        <div style={{ display:"flex", alignItems:"center", gap:"0.625rem" }}>
          <span style={{
            fontFamily:MONO, fontSize:"1.35rem", letterSpacing:"0.06em", fontWeight:600,
            color: elapsed >= MAX_CALL_SECONDS - 30 ? "#ef4444" : elapsed >= MAX_CALL_SECONDS - 60 ? "#f59e0b" : TEXT2,
            transition:"color 0.3s",
          }}>
            {formatTime(elapsed)}
          </span>
          <span style={{
            fontFamily:SANS, fontSize:"0.72rem", fontWeight:600,
            color: elapsed >= MAX_CALL_SECONDS - 30 ? "#ef4444" : "#6a6760",
            letterSpacing:"0.04em", textTransform:"uppercase",
          }}>
            {elapsed >= MAX_CALL_SECONDS - 30 ? `${MAX_CALL_SECONDS - elapsed}s left` : `${Math.floor(MAX_CALL_SECONDS / 60)}:00 max`}
          </span>
        </div>

        {/* Max time banner — shown in final 5 seconds */}
        <AnimatePresence>
          {elapsed >= MAX_CALL_SECONDS - 5 && (
            <motion.div
              initial={{ opacity:0, y:6 }}
              animate={{ opacity:1, y:0 }}
              exit={{ opacity:0 }}
              transition={{ duration:0.3 }}
              style={{
                background:"rgba(239,68,68,0.07)",
                border:"1.5px solid rgba(239,68,68,0.2)",
                borderRadius:10, padding:"0.6rem 1.25rem",
                fontFamily:SANS, fontSize:"0.82rem", fontWeight:600,
                color:"#dc2626", textAlign:"center", lineHeight:1.5,
              }}
            >
              You've reached the maximum time for this call. Wrapping up now.
            </motion.div>
          )}
        </AnimatePresence>

        {/* Waveform + status */}
        {elapsed < 355 && (
          <div style={{ display:"flex", alignItems:"center", gap:"1rem" }}>
            <Waveform active={true} color={isSpeaking ? ACCENT : "rgba(59,91,252,0.2)"}/>
            <motion.span
              animate={{ color: isSpeaking ? ACCENT : TEXT2 }}
              transition={{ duration:0.4 }}
              style={{ fontFamily:SANS, fontWeight:500, fontSize:"0.875rem", minWidth:220 }}
            >
              {isSpeaking ? "Mentorable is speaking..." : "Your turn..."}
            </motion.span>
          </div>
        )}

        <motion.button
          onClick={() => onEnd(true)}
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
          border:`2px solid rgba(59,130,246,0.12)`, borderBottomColor:ACCENT2,
          animation:"spinner-rotate 1.8s linear infinite reverse",
        }}/>
      </div>

      <motion.h2
        initial={{ opacity:0, y:16 }}
        animate={{ opacity:1, y:0 }}
        transition={{ delay:0.2, duration:0.6 }}
        style={{ fontFamily:SERIF, fontWeight:700, fontSize:"1.75rem", color:TEXT, letterSpacing:"-0.03em", marginBottom:"0.875rem" }}
      >
        Setting up your profile...
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

// ─── RecoveryPhase ────────────────────────────────────────────────────────────
function RecoveryPhase({ onRetryExtraction, onRetry }) {
  const [retrying, setRetrying] = useState(false);
  const [error, setError]       = useState(null);

  // The parent still holds the transcript in memory, so a retry just re-runs
  // extraction on it rather than re-reading a saved copy from the database.
  const handleRetry = async () => {
    if (retrying) return;
    setRetrying(true);
    setError(null);
    try {
      await onRetryExtraction();
    } catch (err) {
      console.error("[Recovery] retry error:", err);
      setError(err?.message || "Something went wrong. Please try again.");
      setRetrying(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      style={{ flex: 1, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "2rem", position: "relative", zIndex: 1 }}
    >
      <motion.div initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.1, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        style={{ width: 56, height: 56, borderRadius: 14, background: "rgba(239,68,68,0.07)", border: "1.5px solid rgba(239,68,68,0.2)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "1.5rem" }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      </motion.div>
      <h2 style={{ fontFamily: "'Raleway', sans-serif", fontWeight: 700, fontSize: "1.4rem", color: TEXT, letterSpacing: "-0.02em", marginBottom: "0.75rem" }}>
        Processing hiccup
      </h2>
      <p style={{ fontFamily: "'Raleway', sans-serif", color: TEXT2, fontSize: "0.95rem", lineHeight: 1.68, maxWidth: 360, marginBottom: "0.5rem" }}>
        We ran into an issue turning your conversation into a profile. Your transcript was saved, so click below to try again.
      </p>
      {error && <p style={{ fontFamily: "'Raleway', sans-serif", color: "#ef4444", fontSize: "0.85rem", marginBottom: "1rem", maxWidth: 360 }}>{error}</p>}
      <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.5rem", flexWrap: "wrap", justifyContent: "center" }}>
        <button onClick={handleRetry} disabled={retrying}
          style={{ padding: "0.7rem 1.75rem", borderRadius: 10, background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT2})`, border: "none", color: "white", fontFamily: "'Raleway', sans-serif", fontWeight: 600, fontSize: "0.9rem", cursor: retrying ? "not-allowed" : "pointer", opacity: retrying ? 0.7 : 1 }}>
          {retrying ? "Retrying…" : "Try again"}
        </button>
        <button onClick={onRetry}
          style={{ padding: "0.7rem 1.5rem", borderRadius: 10, background: "transparent", border: "1.5px solid rgba(59,91,252,0.25)", color: ACCENT, fontFamily: "'Raleway', sans-serif", fontWeight: 600, fontSize: "0.9rem", cursor: "pointer" }}>
          Record new conversation
        </button>
      </div>
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

  // ── College intake ──────────────────────────────────────────────────────────
  const [intake, setIntake]         = useState(EMPTY_INTAKE);
  const [savingForm, setSavingForm] = useState(false);
  const [draft, setDraft]           = useState(null);
  const [activities, setActivities] = useState([]);
  const [committing, setCommitting] = useState(false);
  const [reviewError, setReviewError] = useState(null);
  const [channel, setChannel]       = useState(null);   // "text" | "voice"
  const intakeContextRef            = useRef("");

  const transcriptEndRef = useRef(null);
  const timerRef         = useRef(null);
  const transcriptRef    = useRef([]);
  const lastActivityRef  = useRef(Date.now()); // last agent speech / message — drives silence auto-end

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/auth"; return; }
      const { data: profile } = await supabase
        .from("profiles").select("onboarding_completed").eq("id", user.id).single();
      if (profile?.onboarding_completed) { window.location.href = "/chat"; return; }
      setUser(user);
      setPhase("form");
    };
    checkAuth();
  }, []);

  // ── Form → channel picker ───────────────────────────────────────────────────
  const handleFormComplete = async (values) => {
    setSavingForm(true);
    setIntake(values);
    try {
      await saveIntakeForm(user.id, values);
      // Build the context once, here: both channels use the same rendered summary,
      // so the text interviewer and the voice agent see identical facts.
      try {
        const { context } = await fetchIntakeContext();
        intakeContextRef.current = context || "";
      } catch (err) {
        console.warn("[Onboarding] context fetch failed, continuing:", err);
      }
      setPhase("channel");
    } catch (err) {
      console.error("[Onboarding] form save error:", err);
      setError(err?.message || "We couldn't save that. Please try again.");
      setPhase("error");
    } finally {
      setSavingForm(false);
    }
  };

  // ── Shared: transcript → draft → review ─────────────────────────────────────
  const lastAttemptRef = useRef({ transcript: "", via: "text", force: true });

  const runExtraction = useCallback(async (transcriptText, via, force) => {
    lastAttemptRef.current = { transcript: transcriptText, via, force };
    setPhase("processing");
    try {
      const result = await extractIntake(transcriptText, via, force);

      if (!result?.sufficient) {
        setRetryNotice("We didn't get quite enough to work with. Give it another go and tell us a bit more about what you've been up to.");
        setPhase("channel");
        return;
      }
      if (!result?.success) {
        console.error("[Onboarding] extraction failed:", result?.error);
        setPhase("recovery");
        return;
      }

      setDraft(result.draft);
      setActivities(await fetchActivities(user.id));
      setPhase("review");
    } catch (err) {
      console.error("[Onboarding] extraction error:", err);
      setError(err?.message || "Something went wrong reading the conversation. Please try again.");
      setPhase("error");
    }
  }, [user]);

  // ── Review → commit ─────────────────────────────────────────────────────────
  const handleConfirm = async (edited) => {
    setCommitting(true);
    setReviewError(null);
    try {
      const result = await commitIntake(edited, channel);
      if (!result?.success) throw new Error(result?.error || "Save failed");
      window.location.href = "/chat";
    } catch (err) {
      console.error("[Onboarding] commit error:", err);
      setReviewError(err?.message || "We couldn't save that. Please try again.");
      setCommitting(false);
    }
  };


  const conversation = useConversation({
    onMessage: (msg) => {
      // ElevenLabs SDK may use msg.source ("user"/"ai") or msg.role ("user"/"agent")
      const role    = msg.role ?? (msg.source === "ai" ? "agent" : "user");
      const message = msg.message ?? msg.text ?? "";
      if (!message) return; // skip empty frames
      lastActivityRef.current = Date.now(); // any message = activity → reset silence timer
      const newMsg = { role, message, id: `${Date.now()}-${Math.random()}` };
      setTranscript((prev) => {
        const next = [...prev, newMsg];
        transcriptRef.current = next;
        // Persist transcript to DB every 4 messages for recovery if extraction fails
        if (next.length % 4 === 0) {
          const transcriptText = next.map((m) => `${m.role === "agent" ? "Mentorable" : "Student"}: ${m.message}`).join("\n");
          supabase.auth.getUser().then(({ data }) => {
            if (data?.user) {
              supabase.from("profiles").update({ raw_voice_transcript: transcriptText }).eq("id", data.user.id).then(() => {});
            }
          });
        }
        return next;
      });
    },
    onDisconnect: () => {
      // Intentionally a no-op: onDisconnect fires on normal ElevenLabs turn
      // transitions, not only on real session ends. Only the manual End button
      // should trigger endConversation.
      console.log("[ElevenLabs] onDisconnect fired (ignored)");
    },
    onError: (err) => {
      console.error("[ElevenLabs] onError:", err);
      const msg = typeof err === "string" ? err : "Connection error. Please try again.";
      setError(msg); setPhase("error"); setStartingConv(false);
    },
  });

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior:"smooth" });
  }, [transcript]);

  useEffect(() => {
    if (phase !== "active") {
      clearInterval(timerRef.current);
      return;
    }
    lastActivityRef.current = Date.now(); // start the silence clock fresh when the call begins
    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(timerRef.current);
  }, [phase]);

  // Speaking state flipping (agent starts OR stops talking) counts as activity — so the
  // student gets a full silence window after the agent finishes a turn.
  useEffect(() => {
    if (phase === "active") lastActivityRef.current = Date.now();
  }, [conversation.isSpeaking, phase]);

  useEffect(() => {
    if (phase !== "active") return;
    if (elapsed >= MAX_CALL_SECONDS) { endConversation(); return; }

    // A long SPOKEN answer emits no onMessage until the turn ends, so the agent isn't speaking
    // and lastActivityRef goes stale even though the user is mid-sentence. Sample the mic input
    // volume each tick: if the user is audibly talking, that's activity — never end on them.
    try {
      const vol = conversation.getInputVolume?.();
      if (typeof vol === "number" && vol > SPEAKING_VOLUME_THRESHOLD) {
        lastActivityRef.current = Date.now();
      }
    } catch { /* SDK may not expose input volume; fall through to the timeout check */ }

    // Silent-call safety net: the agent reached a closing point and went quiet but the session
    // never ended. Only after a full silent window (agent not speaking, USER not speaking, no
    // new messages, conversation actually underway) do we end so the user isn't stuck on a dead call.
    if (
      transcriptRef.current.length >= 2 &&
      !conversation.isSpeaking &&
      Date.now() - lastActivityRef.current >= SILENCE_TIMEOUT_MS
    ) {
      endConversation();
    }
  }, [elapsed, phase]);  // eslint-disable-line react-hooks/exhaustive-deps

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
      await conversation.startSession({ agentId: AGENT_ID });
      setPhase("active");
      // Seed the agent with the form data so it can ask about specific activities
      // by name instead of starting from scratch. Contextual updates need no
      // dashboard override permissions, unlike dynamic variables.
      if (intakeContextRef.current) {
        try {
          conversation.sendContextualUpdate(
            "Here is the student's application record, which they just filled in. " +
            "Do not ask them to repeat any of it. Use it to ask about specific " +
            "activities and awards by name.\n\n" + intakeContextRef.current
          );
        } catch (_) { /* best-effort */ }
      }
    } catch (err) {
      console.error("[ElevenLabs] startSession error:", err);
      setError(typeof err === "string" ? err : "Connection error. Please try again.");
      setPhase("error");
    } finally {
      setStartingConv(false);
    }
  };

  const endConversation = async (manual = false) => {
    clearInterval(timerRef.current);
    try { await conversation.endSession(); } catch { /* already closed */ }

    const messages = transcriptRef.current;
    const transcriptText = messages.length > 0
      ? messages.map((m) => `${m.role === "agent" ? "Interviewer" : "Student"}: ${m.message}`).join("\n")
      : "";

    // `force` skips the sufficiency gate when the student deliberately ended the call.
    // That's their call to make, so we take our best shot instead of making them start
    // over. Auto-ends (silence timeout, max call time) still go through the gate.
    await runExtraction(transcriptText, "voice", manual);
  };

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
        {phase === "form" && (
          <div key="form" style={{ flex: 1, overflowY: "auto", padding: "2.5rem 0 3rem" }}>
            <IntakeForm initial={intake} onComplete={handleFormComplete} submitting={savingForm} />
          </div>
        )}
        {phase === "channel" && (
          <ChannelPhase key="channel" retryNotice={retryNotice}
            onPick={(c) => {
              setChannel(c); setRetryNotice(null);
              if (c === "voice") { setPhase("intro"); } else { setPhase("text-interview"); }
            }} />
        )}
        {phase === "text-interview" && (
          <div key="text-interview" style={{ flex: 1, minHeight: 0, display: "flex", padding: "2rem 0 1.5rem" }}>
            <TextInterview
              onFinish={(transcriptText) => runExtraction(transcriptText, "text", true)}
              onError={(msg) => { setError(msg); setPhase("error"); }}
            />
          </div>
        )}
        {phase === "review" && (
          <div key="review" style={{ flex: 1, overflowY: "auto", padding: "2.5rem 0 3rem" }}>
            <IntakeReview draft={draft} activities={activities} onConfirm={handleConfirm}
              committing={committing} error={reviewError} />
          </div>
        )}
        {phase === "intro"      && <IntroPhase      key="intro"      onStart={startConversation} loading={startingConv} retryNotice={retryNotice}/>}
        {phase === "active"     && <ActivePhase     key="active"     transcript={transcript} elapsed={elapsed} isSpeaking={conversation.isSpeaking} onEnd={endConversation} transcriptEndRef={transcriptEndRef}/>}
        {phase === "processing" && <ProcessingPhase key="processing"/>}
        {phase === "recovery"   && <RecoveryPhase   key="recovery"   onRetryExtraction={() => { const a = lastAttemptRef.current; return runExtraction(a.transcript, a.via, a.force); }} onRetry={() => { setPhase("channel"); }}/>}
        {phase === "error"      && <ErrorPhase      key="error"      error={error} onRetry={() => { setError(null); setPhase("channel"); }}/>}
        {phase === "mic-denied" && <MicDeniedPhase  key="mic-denied" onRetry={() => setPhase("intro")}/>}
      </AnimatePresence>
    </div>
  );
}
