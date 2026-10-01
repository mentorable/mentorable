import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useConversation } from "@elevenlabs/react";
import { supabase } from "../lib/supabase.js";
import { requireUser } from "../lib/auth.js";
import Spinner from "../components/common/Spinner.jsx";
import { useIsMobile } from "../hooks/useIsMobile.js";
import IntakeForm, { EMPTY_INTAKE, clearDraft } from "../components/onboarding/IntakeForm.jsx";
import TextInterview from "../components/onboarding/TextInterview.jsx";
import IntakeReview from "../components/onboarding/IntakeReview.jsx";
import {
  AMBER_BG, AMBER_TEXT, BG, BORDER, DANGER, FOCUS_CLASS, RADIUS, SANS, TEXT, TEXT_MID, TEXT_MUTED, WHITE,
  ringVar, subtitleStyle, titleStyle, useIntakeInk,
} from "../components/onboarding/intakeTheme.js";
import { Button, Notice, StampTile } from "../components/ui/kit.jsx";
import { SpeechBubble } from "../components/ui/SpeechBubble.jsx";
import { PixelStamp } from "../components/ui/PixelIcons.jsx";
import { HOME_PATH, POST_ONBOARDING_PATH } from "../lib/features.js";
import {
  saveIntakeForm, fetchIntakeContext, extractIntake, commitIntake, fetchActivities,
  fetchStudentRecord, skipIntake,
} from "../lib/intake.js";

const AGENT_ID = import.meta.env.VITE_ELEVENLABS_AGENT_ID;
const MAX_CALL_SECONDS = 180; // ~3 min cap — keeps ElevenLabs credit cost down; the agent is prompted to wrap up by ~2.5 min
const SILENCE_TIMEOUT_MS = 45000; // auto-end only if the call sits FULLY silent (agent done, user not talking, no replies) this long
const SPEAKING_VOLUME_THRESHOLD = 0.02; // mic input above this = user is actively talking (counts as activity)

// The look comes from the shared kit (src/components/ui): the calm shell's
// grey page, white cards, flat buttons, and the student's accent only through
// useIntakeInk. Character comes from the pixel stamps and the dialog-box
// speech bubbles, never from louder chrome.

const ERROR_TILE = { background: "#fdf1f0", border: "1px solid #f4c7c2", color: DANGER };
const AMBER_TILE = { background: AMBER_BG, border: "1px solid #f3d9a4", color: AMBER_TEXT };

// ─── Framer-motion variant helper ────────────────────────────────────────────
const fadeUp = (delay = 0) => ({
  initial:    { opacity:0, y:22 },
  animate:    { opacity:1, y:0 },
  transition: { duration:0.65, ease:[0.16,1,0.3,1], delay },
});

// ─── Logo ─────────────────────────────────────────────────────────────────────
function Logo() {
  const ink = useIntakeInk();
  return (
    <div style={{ display:"flex", alignItems:"center", gap:7 }}>
      <span style={{ fontFamily:SANS, fontWeight:700, fontSize:"1.05rem", color:TEXT, letterSpacing:"-0.04em" }}>
        mentorable
      </span>
      <span aria-hidden="true" style={{
        width:6, height:6, borderRadius:"50%", background:ink.accent, display:"inline-block", flexShrink:0,
      }}/>
    </div>
  );
}

// ─── MicIcon ──────────────────────────────────────────────────────────────────
function MicIcon({ color = "currentColor", size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"
      stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="12" rx="3"/>
      <path d="M5 10a7 7 0 0 0 14 0"/>
      <line x1="12" y1="17" x2="12" y2="21"/>
      <line x1="8" y1="21" x2="16" y2="21"/>
    </svg>
  );
}

/** A square tile for the status screens' mark (an error, the mic). */
function StatusTile({ tone, children }) {
  return (
    <span aria-hidden="true" style={{
      width:56, height:56, borderRadius:RADIUS.control, boxSizing:"border-box",
      display:"inline-flex", alignItems:"center", justifyContent:"center", ...tone,
    }}>
      {children}
    </span>
  );
}

/** A centred status screen: a mark, a title, a line, and the actions. */
function StatusScreen({ phaseKey, mark, title, children, actions }) {
  const ink = useIntakeInk();
  const isMobile = useIsMobile();
  return (
    <motion.div
      key={phaseKey}
      initial={{ opacity:0, scale:0.97 }}
      animate={{ opacity:1, scale:1 }}
      exit={{ opacity:0 }}
      transition={{ duration:0.45, ease:[0.16,1,0.3,1] }}
      style={{
        flex:1, minHeight:"100vh", display:"flex", flexDirection:"column",
        alignItems:"center", justifyContent:"center",
        textAlign:"center", padding:isMobile ? "2rem 1rem" : "2rem", position:"relative", zIndex:1,
      }}
    >
      <motion.div
        initial={{ scale:0.7, opacity:0 }}
        animate={{ scale:1, opacity:1 }}
        transition={{ delay:0.15, duration:0.5, ease:[0.16,1,0.3,1] }}
        style={{ marginBottom:"1.5rem" }}
      >
        {mark}
      </motion.div>
      <motion.h2 {...fadeUp(0.25)} style={{ ...titleStyle(ink, isMobile), fontSize:isMobile ? "1.9rem" : "2.1rem", marginBottom:"0.8rem" }}>
        {title}
      </motion.h2>
      <motion.div {...fadeUp(0.35)} style={{ maxWidth:440, marginBottom:"2rem" }}>
        {children}
      </motion.div>
      <motion.div {...fadeUp(0.45)} style={{ display:"flex", gap:"0.75rem", flexWrap:"wrap", justifyContent:"center" }}>
        {actions}
      </motion.div>
    </motion.div>
  );
}

// ─── Channel picker: talk it through by text or by voice ─────────────────────
// The conversation walks through the activities and awards on the form, so with
// neither there is nothing to talk about: both options stay visible but
// disabled, with the reason and a way back to the form.
function ChannelPhase({ onPick, skipping, canTalk, onBackToForm }) {
  const ink = useIntakeInk();
  const isMobile = useIsMobile();
  const Option = ({ id, title, blurb, meta, stamp }) => (
    <button type="button" onClick={() => canTalk && onPick(id)} disabled={!canTalk}
      aria-describedby={canTalk ? undefined : "talk-needs-items"}
      className={FOCUS_CLASS}
      style={{
        display: "flex", alignItems: "center", gap: isMobile ? 14 : 18, width: "100%", textAlign: "left",
        cursor: canTalk ? "pointer" : "not-allowed", background: WHITE, border: `1px solid ${BORDER}`,
        borderRadius: RADIUS.card, padding: isMobile ? "1.1rem 1rem" : "1.3rem 1.4rem",
        transition: "border-color 0.15s", opacity: canTalk ? 1 : 0.55, boxSizing: "border-box",
      }}
      onMouseEnter={(e) => { if (!canTalk) return; e.currentTarget.style.borderColor = ink.text; }}
      onMouseLeave={(e) => { if (!canTalk) return; e.currentTarget.style.borderColor = BORDER; }}>
      <StampTile kind={stamp} size={48} />
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: "block", fontFamily: SANS, fontWeight: 800, fontSize: "1.25rem", color: TEXT, marginBottom: 4, letterSpacing: "-0.01em" }}>{title}</span>
        <span style={{ display: "block", fontFamily: SANS, fontSize: "1rem", color: TEXT_MID, lineHeight: 1.55 }}>{blurb}</span>
        <span style={{ display: "block", fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700, color: TEXT_MUTED, marginTop: 7 }}>{meta}</span>
      </span>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={ink.text} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
        <polyline points="9 18 15 12 9 6"/>
      </svg>
    </button>
  );

  return (
    <motion.div key="channel"
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.4 }}
      style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: isMobile ? "2rem 1rem" : "3rem 1.5rem" }}>
      <div style={{ width: "100%", maxWidth: 680 }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "2rem" }}><Logo /></div>

        <h1 style={{ ...titleStyle(ink, isMobile), textAlign: "center" }}>
          Now let's talk it through
        </h1>
        <p style={{ ...subtitleStyle(isMobile), marginBottom: "2rem", textAlign: "center", maxWidth: 540, marginLeft: "auto", marginRight: "auto" }}>
          {canTalk
            ? "We have your list. Now we just need a bit more detail on what you actually did. Pick whichever is easier for you."
            : "This conversation goes through the activities and awards you listed, one at a time."}
        </p>

        {!canTalk && (
          <div id="talk-needs-items" role="note"
            style={{ background: AMBER_BG, border: "1px solid #f3d9a4", borderRadius: RADIUS.control, padding: "0.9rem 1rem 0.9rem 1.1rem",
              marginBottom: 16, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <p style={{ flex: 1, minWidth: 220, margin: 0, fontFamily: SANS, fontSize: "1rem", fontWeight: 600, color: AMBER_TEXT, lineHeight: 1.55 }}>
              <strong style={{ fontWeight: 800 }}>You need at least one activity or award for the conversation.</strong> You didn't list any, so there
              is nothing for it to ask about yet.
            </p>
            <Button kind="primary" onClick={onBackToForm} style={{ flexShrink: 0 }}>
              Add one
            </Button>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Option id="text" title="Type it out" stamp="chat"
            blurb="A short back and forth. Take as long as you like on each answer."
            meta="About 5 minutes" />
          <Option id="voice" title="Talk out loud" stamp="person"
            blurb="A quick call with Mentorable. Usually the fastest way to get through it."
            meta="About 3 minutes, needs a microphone" />
        </div>

        {/* Deliberately a quiet third option, not a third card: skipping is
            supported but it genuinely costs the student advice quality, so it
            shouldn't look like an equal choice. */}
        <div style={{ textAlign: "center", marginTop: "1.6rem" }}>
          <button type="button" onClick={() => onPick("skip")} disabled={skipping} className={FOCUS_CLASS}
            style={{
              fontFamily: SANS, fontSize: "1rem", fontWeight: 700,
              color: skipping ? TEXT_MUTED : TEXT_MID, background: "none", border: "none",
              cursor: skipping ? "default" : "pointer", padding: "0 10px", minHeight: 44, borderRadius: 10,
              textDecoration: "underline", textUnderlineOffset: 3,
            }}>
            {skipping ? "Setting up your account…" : "Skip for now"}
          </button>
          <p style={{ fontFamily: SANS, fontSize: "0.95rem", color: TEXT_MUTED, lineHeight: 1.55, marginTop: 4, maxWidth: 440, marginLeft: "auto", marginRight: "auto" }}>
            {canTalk
              ? "We'll only know the names of your activities, so early advice will be more general. You can add the detail any time."
              : "You can add activities and awards from your Portfolio any time."}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Voice confirm: one tap, then the mic prompt fires ───────────────────────
function VoiceConfirmPhase({ onStart, onBack, loading }) {
  const ink = useIntakeInk();
  const isMobile = useIsMobile();
  return (
    <motion.div key="voice-confirm"
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.4 }}
      style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: isMobile ? "2rem 1rem" : "3rem 1.5rem" }}>
      <div style={{ width: "100%", maxWidth: 520, textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "2rem" }}><Logo /></div>

        <div aria-hidden="true" style={{
          width: 88, height: 88, borderRadius: RADIUS.card, margin: "0 auto 1.8rem", boxSizing: "border-box",
          background: ink.softer, border: `1px solid ${ink.soft}`, color: ink.onSoft,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <MicIcon size={38} />
        </div>

        <h1 style={{ ...titleStyle(ink, isMobile), textAlign: "center" }}>Ready when you are</h1>
        <p style={{ ...subtitleStyle(isMobile), marginBottom: "2rem" }}>
          Your browser will ask for microphone access, then we'll start straight away.
        </p>

        <Button kind="primary" onClick={onStart} busy={loading}
          style={{ width: "100%", minHeight: 52, fontSize: "1.05rem", gap: 10 }}>
          {!loading && <MicIcon size={20} />}
          {loading ? "Connecting…" : "Start the call"}
        </Button>

        <Button kind="quiet" onClick={onBack} disabled={loading} style={{ display: "flex", margin: "0.8rem auto 0" }}>
          Type it out instead
        </Button>
      </div>
    </motion.div>
  );
}

// ─── Phase 2: Active Conversation ─────────────────────────────────────────────
// ─── Live speaking meter ──────────────────────────────────────────────────────
// Samples the real mic level so the student can see the call is hearing them.
// Keeps its own state so the 12Hz sampling never re-renders the transcript.
function SpeakingMeter({ getInputLevel, agentSpeaking }) {
  const ink = useIntakeInk();
  const [level, setLevel] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      try {
        const v = getInputLevel?.();
        // Ease toward the new reading so the bars glide instead of flickering.
        setLevel((prev) => (typeof v === "number" ? prev + (v - prev) * 0.5 : 0));
      } catch { setLevel(0); }
    }, 80);
    return () => clearInterval(id);
  }, [getInputLevel]);

  const userTalking = !agentSpeaking && level > SPEAKING_VOLUME_THRESHOLD;
  const label = agentSpeaking ? "Mentorable is speaking" : userTalking ? "Listening to you" : "Your turn, go ahead";
  // Bars are graphics, so the raw accent is fine; the label stays readable text.
  const tint  = agentSpeaking ? ink.accent : userTalking ? ink.text : ink.soft;

  // 5 bars; the middle ones react hardest, which reads as a voice level.
  const weights = [0.55, 0.85, 1, 0.85, 0.55];
  const norm = Math.min(1, level / 0.35);   // mic levels sit low, so amplify

  return (
    <div style={{ display:"flex", alignItems:"center", gap:"0.9rem" }}>
      <div style={{ display:"flex", alignItems:"center", gap:3, height:30 }}>
        {weights.map((w, i) => {
          // While the agent talks we animate a steady idle pulse instead of the
          // mic level, since the mic level is the student's own voice.
          const h = agentSpeaking ? undefined : Math.max(4, 4 + norm * w * 26);
          return agentSpeaking ? (
            <span key={i} style={{
              width:3.5, height:22 * w + 6, borderRadius:2, background:tint,
              transformOrigin:"center",
              animation:"ob-wave 0.9s ease-in-out infinite",
              animationDelay:`${[0, 0.1, 0.2, 0.1, 0][i]}s`,
            }}/>
          ) : (
            <span key={i} style={{
              width:3.5, height:h, borderRadius:2, background:tint,
              transition:"height 0.08s linear, background 0.3s",
            }}/>
          );
        })}
      </div>
      <span style={{ fontFamily:SANS, fontWeight:700, fontSize:"0.95rem", minWidth:200, transition:"color 0.3s",
        color: agentSpeaking ? ink.text : userTalking ? TEXT : TEXT_MID }}>
        {label}
      </span>
    </div>
  );
}

function ActivePhase({ transcript, elapsed, isSpeaking, onEnd, getInputLevel }) {
  const ink = useIntakeInk();
  const isMobile = useIsMobile();
  const scrollerRef = useRef(null);

  // Keep the newest message in view by scrolling only this container.
  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [transcript]);

  const formatTime = (s) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    return `${m}:${(s % 60).toString().padStart(2, "0")}`;
  };

  const lastThirty = elapsed >= MAX_CALL_SECONDS - 30;
  const lastMinute = elapsed >= MAX_CALL_SECONDS - 60;

  return (
    <motion.div
      key="active"
      initial={{ opacity:0 }}
      animate={{ opacity:1 }}
      exit={{ opacity:0 }}
      transition={{ duration:0.4 }}
      // Exactly the viewport, not "at least": the three bands (header,
      // transcript, controls) always fit, and only the transcript scrolls. The
      // record panel used to have no height cap here, so its content grew the
      // column past 100vh and pushed the controls off screen.
      style={{ display:"flex", flexDirection:"column", height:"100vh", overflow:"hidden", position:"relative", zIndex:1, background:BG }}
    >
      {/* Top bar */}
      <motion.div
        initial={{ opacity:0, y:-12 }}
        animate={{ opacity:1, y:0 }}
        transition={{ duration:0.5 }}
        style={{
          display:"flex", alignItems:"center", justifyContent:"space-between",
          padding:isMobile ? "1rem" : "1.1rem 1.75rem",
          borderBottom:`1px solid ${BORDER}`,
          background:WHITE, flexShrink:0,
        }}
      >
        <Logo />
        <div style={{
          display:"flex", alignItems:"center", gap:7,
          padding:"4px 12px", borderRadius:RADIUS.pill,
          background:ink.softer, border:`1px solid ${ink.soft}`,
        }}>
          <span style={{
            width:7, height:7, borderRadius:"50%",
            background:ink.accent,
            animation:"ob-blink 2s ease-in-out infinite",
          }}/>
          <span style={{ fontFamily:SANS, fontWeight:800, fontSize:"0.9rem", color:ink.onSoft, letterSpacing:"0.04em" }}>LIVE</span>
        </div>
      </motion.div>

      {/* Transcript */}
      <div style={{
        flex:1, minHeight:0, display:"flex",
        width:"100%", maxWidth:820, margin:"0 auto", padding:isMobile ? "1.25rem 1rem" : "1.75rem 1.5rem",
      }}>
        {/* The scroller owns its own scrolling. scrollIntoView on a sentinel
            scrolled every ancestor including the window, which yanked the whole
            page down and left the newest message off screen. */}
        <div ref={scrollerRef} style={{
          flex:"1 1 0", minWidth:0, minHeight:0, overflowY:"auto",
          display:"flex", flexDirection:"column",
        }}>
          {/* Top-aligned and growing downward. An earlier version anchored this
              to the bottom, which shoved the first message to the floor of the
              screen with a wall of empty space above it. */}
          <div style={{ display:"flex", flexDirection:"column", gap:"0.875rem" }}>
            {transcript.length === 0 && (
              <motion.p
                initial={{ opacity:0 }}
                animate={{ opacity:1 }}
                transition={{ delay:0.8 }}
                style={{ textAlign:"center", color:TEXT_MUTED, fontFamily:SANS, fontSize:"1rem", lineHeight:1.7, margin:0 }}
              >
                Your conversation will appear here.
              </motion.p>
            )}
            <AnimatePresence initial={false}>
              {transcript.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity:0, y:12, scale:0.97 }}
                  animate={{ opacity:1, y:0, scale:1 }}
                  transition={{ duration:0.35, ease:[0.22,1,0.36,1] }}
                  style={{ display:"flex", justifyContent:msg.role === "agent" ? "flex-start" : "flex-end", alignItems:"flex-start", gap:12 }}
                >
                  {msg.role === "agent" ? (
                    <>
                      <span aria-hidden="true" style={{ flexShrink:0, width:40, height:40, marginTop:14, borderRadius:RADIUS.control,
                        background:ink.soft, color:ink.onSoft, display:"inline-flex", alignItems:"center", justifyContent:"center" }}>
                        <PixelStamp kind="chat" size={24} />
                      </span>
                      <SpeechBubble side="left" name="Mentorable" style={{ maxWidth:"76%" }}>
                        {msg.message}
                      </SpeechBubble>
                    </>
                  ) : (
                    <div style={{
                      maxWidth:"76%", padding:"0.8rem 1.1rem",
                      borderRadius:RADIUS.card, background:ink.soft, border:`1px solid ${ink.soft}`,
                      color:TEXT, fontFamily:SANS, fontSize:"1.02rem", lineHeight:1.6, fontWeight:500,
                      overflowWrap:"anywhere",
                    }}>
                      {msg.message}
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div style={{
        padding:isMobile ? "1rem 1rem 1.5rem" : "1.1rem 1.75rem 1.75rem",
        borderTop:`1px solid ${BORDER}`,
        background:WHITE,
        display:"flex", flexDirection:"column", alignItems:"center", gap:"0.9rem",
        flexShrink:0,
      }}>
        {/* Timer */}
        <div style={{ display:"flex", alignItems:"center", gap:"0.625rem" }}>
          <span style={{
            fontFamily:SANS, fontSize:"1.35rem", letterSpacing:"0.04em", fontWeight:700, fontVariantNumeric:"tabular-nums",
            color: lastThirty ? DANGER : lastMinute ? AMBER_TEXT : TEXT_MID,
            transition:"color 0.3s",
          }}>
            {formatTime(elapsed)}
          </span>
          <span style={{
            fontFamily:SANS, fontSize:"0.9rem", fontWeight:700,
            color: lastThirty ? DANGER : TEXT_MUTED,
            letterSpacing:"0.03em", textTransform:"uppercase",
          }}>
            {lastThirty ? `${MAX_CALL_SECONDS - elapsed}s left` : `${Math.floor(MAX_CALL_SECONDS / 60)}:00 max`}
          </span>
        </div>

        {/* Max time banner, shown in the final 5 seconds */}
        <AnimatePresence>
          {elapsed >= MAX_CALL_SECONDS - 5 && (
            <motion.div
              initial={{ opacity:0, y:6 }}
              animate={{ opacity:1, y:0 }}
              exit={{ opacity:0 }}
              transition={{ duration:0.3 }}
              style={{ textAlign:"center" }}
            >
              <Notice tone="warn">
                You've reached the maximum time for this call. Wrapping up now.
              </Notice>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Live speaking indicator */}
        {elapsed < MAX_CALL_SECONDS && (
          <SpeakingMeter getInputLevel={getInputLevel} agentSpeaking={isSpeaking} />
        )}

        <Button kind="secondary" onClick={() => onEnd(true)} style={{ padding:"10px 26px" }}>
          End conversation
        </Button>
      </div>
    </motion.div>
  );
}

// ─── Phase 3: Processing ──────────────────────────────────────────────────────
function ProcessingPhase() {
  const ink = useIntakeInk();
  const isMobile = useIsMobile();
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
        textAlign:"center", padding:isMobile ? "2rem 1rem" : "2rem",
        position:"relative", zIndex:1,
      }}
    >
      {/* A pixel scroll being written up, on the accent's soft tile */}
      <div style={{ marginBottom:"2rem" }}>
        <StampTile kind="scroll" size={56} />
      </div>

      <motion.h2
        initial={{ opacity:0, y:16 }}
        animate={{ opacity:1, y:0 }}
        transition={{ delay:0.2, duration:0.6 }}
        style={{ ...titleStyle(ink, isMobile), fontSize:isMobile ? "1.9rem" : "2.3rem", marginBottom:"0.8rem" }}
      >
        Writing up your record
      </motion.h2>
      <motion.p
        initial={{ opacity:0, y:12 }}
        animate={{ opacity:1, y:0 }}
        transition={{ delay:0.35, duration:0.6 }}
        style={{ ...subtitleStyle(isMobile), maxWidth:420, marginBottom:"2rem" }}
      >
        This takes about 30 seconds. We're writing up what you told us about each activity.
      </motion.p>

      {/* Pulsing dots */}
      <div aria-hidden="true" style={{ display:"flex", gap:8, justifyContent:"center" }}>
        {[0, 1, 2].map(i => (
          <motion.div
            key={i}
            animate={{ opacity:[0.25, 1, 0.25], scale:[0.75, 1.15, 0.75] }}
            transition={{ duration:1.2, delay:i * 0.2, repeat:Infinity, ease:"easeInOut" }}
            style={{ width:9, height:9, borderRadius:"50%", background:ink.accent }}
          />
        ))}
      </div>
    </motion.div>
  );
}

// ─── Error Phase ──────────────────────────────────────────────────────────────
function ErrorPhase({ error, onRetry }) {
  return (
    <StatusScreen phaseKey="error" title="Something went wrong"
      mark={<StatusTile tone={ERROR_TILE}><PixelStamp kind="question" size={24} /></StatusTile>}
      actions={<Button kind="primary" onClick={onRetry} style={{ padding:"10px 26px" }}>Try again</Button>}>
      <p style={{ fontFamily:SANS, color:TEXT_MUTED, fontSize:"1.1rem", lineHeight:1.65, margin:0 }}>
        {error || "An unexpected error occurred. Please try again."}
      </p>
    </StatusScreen>
  );
}

// ─── Mic Denied Phase ─────────────────────────────────────────────────────────
function MicDeniedPhase({ onRetry }) {
  return (
    <StatusScreen phaseKey="mic-denied" title="Microphone access needed"
      mark={<StatusTile tone={AMBER_TILE}><MicIcon size={26} /></StatusTile>}
      actions={<Button kind="primary" onClick={onRetry} style={{ padding:"10px 26px" }}>Try again</Button>}>
      <p style={{ fontFamily:SANS, color:TEXT_MUTED, fontSize:"1.1rem", lineHeight:1.65, margin:0 }}>
        We need microphone access to continue. Please allow access in your browser settings and try again.
      </p>
    </StatusScreen>
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
    <StatusScreen phaseKey="recovery" title="Processing hiccup"
      mark={(
        <StatusTile tone={ERROR_TILE}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        </StatusTile>
      )}
      actions={(
        <>
          <Button kind="primary" onClick={handleRetry} busy={retrying} style={{ padding:"10px 26px" }}>
            {retrying ? "Retrying…" : "Try again"}
          </Button>
          <Button kind="secondary" onClick={onRetry}>
            Record new conversation
          </Button>
        </>
      )}>
      <p style={{ fontFamily:SANS, color:TEXT_MUTED, fontSize:"1.1rem", lineHeight:1.65, margin:0 }}>
        We ran into an issue turning your conversation into a profile. Your transcript was saved, so click below to try again.
      </p>
      {error && <Notice tone="error" style={{ marginTop:"1rem", textAlign:"left" }}>{error}</Notice>}
    </StatusScreen>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function OnboardingPage() {
  const isMobile = useIsMobile();
  const ink = useIntakeInk();
  const [phase, setPhase]               = useState("loading");
  const [transcript, setTranscript]     = useState([]);
  const [elapsed, setElapsed]           = useState(0);
  const [error, setError]               = useState(null);
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
  const [savedRecord, setSavedRecord] = useState(null);
  // Where the error screen's "Try again" goes, and which form step "Add one" opens.
  const [errorReturn, setErrorReturn] = useState("channel");
  const [formStartAt, setFormStartAt] = useState(null);
  const [skipping, setSkipping] = useState(false);

  const timerRef         = useRef(null);
  const transcriptRef    = useRef([]);
  const lastActivityRef  = useRef(Date.now()); // last agent speech / message — drives silence auto-end

  useEffect(() => {
    const checkAuth = async () => {
      const user = await requireUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles").select("onboarding_completed, intake_draft, intake_channel")
        .eq("id", user.id).single();
      if (profile?.onboarding_completed) { window.location.href = HOME_PATH; return; }
      setUser(user);

      // A saved draft means extraction already ran, so a refresh shouldn't make
      // them redo the interview. Pick the review screen back up instead.
      const saved = profile?.intake_draft;
      if (saved && typeof saved === "object" && Object.keys(saved).length) {
        setDraft(saved);
        setChannel(profile.intake_channel === "voice" ? "voice" : "text");
        setActivities(await fetchActivities(user.id));
        setPhase("review");
        return;
      }
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
      // The draft deliberately survives until onboarding actually completes.
      // Clearing it here meant a refresh at the channel picker came back to an
      // empty form, and since saving replaces rather than appends, resubmitting
      // it half-filled wiped the complete record they had already saved.
      // Build the context once, here: both channels use the same rendered summary,
      // so the text interviewer and the voice agent see identical facts.
      try {
        const { context } = await fetchIntakeContext();
        intakeContextRef.current = context || "";
      } catch (err) {
        console.warn("[Onboarding] context fetch failed, continuing:", err);
      }
      // Powers the record panel shown beside both interview channels, and
      // whether there is anything to interview about. Cleared first so a failed
      // read falls back to what was just submitted, never to an older read.
      setSavedRecord(null);
      setFormStartAt(null);
      try {
        setSavedRecord(await fetchStudentRecord(user.id));
      } catch (err) {
        console.warn("[Onboarding] record fetch failed, continuing:", err);
      }
      setPhase("channel");
    } catch (err) {
      console.error("[Onboarding] form save error:", err);
      setError(err?.message || "We couldn't save that. Please try again.");
      setErrorReturn("form");
      setPhase("error");
    } finally {
      setSavingForm(false);
    }
  };

  // What the interview can talk about: the saved rows when we have them (what
  // the interviewer will actually see), otherwise the form as submitted.
  const listed = savedRecord || intake || {};
  const canTalk = (listed.activities?.length || 0) + (listed.awards?.length || 0) > 0;

  // ── Shared: transcript → draft → review ─────────────────────────────────────
  const lastAttemptRef = useRef({ transcript: "", via: "text" });

  const runExtraction = useCallback(async (transcriptText, via) => {
    lastAttemptRef.current = { transcript: transcriptText, via };
    setPhase("processing");
    try {
      // No "not enough" path: an interview that happened always goes to review,
      // even if it produced little. Being sent back to start over after using
      // the whole call is worse than confirming a thin draft.
      const result = await extractIntake(transcriptText, via);

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

  // ── Skip the interview entirely ─────────────────────────────────────────────
  const handleSkip = async () => {
    setSkipping(true);
    try {
      const result = await skipIntake();
      if (!result?.success) throw new Error(result?.error || "Could not finish setting up");
      clearDraft(user.id);   // onboarding is done, the record is the source of truth
      window.location.href = POST_ONBOARDING_PATH;
    } catch (err) {
      console.error("[Onboarding] skip error:", err);
      setError(err?.message || "We couldn't finish setting up. Please try again.");
      setPhase("error");
      setSkipping(false);
    }
  };

  // ── Review → commit ─────────────────────────────────────────────────────────
  const handleConfirm = async (edited) => {
    setCommitting(true);
    setReviewError(null);
    try {
      const result = await commitIntake(edited, channel);
      if (!result?.success) throw new Error(result?.error || "Save failed");
      clearDraft(user.id);   // onboarding is done, the record is the source of truth
      window.location.href = POST_ONBOARDING_PATH;
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

  // Handed to the speaking meter. useCallback keeps the identity stable so the
  // meter's sampling interval isn't torn down and rebuilt on every render.
  const getInputLevel = useCallback(() => {
    try { return conversation.getInputVolume?.() ?? 0; } catch { return 0; }
  }, [conversation]);

  const startConversation = async () => {
    setStartingConv(true);
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setPhase("mic-denied"); setStartingConv(false); return;
    }
    try {
      // The agent's opening line is a static template on the ElevenLabs dashboard,
      // spoken before the contextual update below can land. So the first item is
      // passed as a dynamic variable: otherwise the agent says "let's start with
      // the first one on your list", which asks the student to recall their own
      // list back to the agent that is holding it.
      const firstName = (intake.fullName || "").trim().split(/\s+/)[0];
      const firstItem = (intake.activities || [])[0] || (intake.awards || [])[0];

      await conversation.startSession({
        agentId: AGENT_ID,
        dynamicVariables: {
          student_name: firstName || "there",
          first_item: firstItem || "the first thing you've been involved in",
        },
      });
      setPhase("active");
      // Seed the agent with the full form data so it can keep naming specific
      // activities as it works down the list. Contextual updates need no
      // dashboard override permissions.
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
    await runExtraction(transcriptText, "voice");
  };

  if (phase === "loading") {
    return (
      <div style={{ minHeight:"100vh", background:BG, display:"flex", alignItems:"center", justifyContent:"center" }}>
        <Spinner size={26} color={ink.accent}/>
      </div>
    );
  }

  return (
    <div className="ui-page" style={{
      minHeight:"100vh", background:BG,
      display:"flex", flexDirection:"column",
      fontFamily:SANS, position:"relative", overflow:"hidden",
      ...ringVar(ink),
    }}>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

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
          <div key="form" style={{ flex: 1, overflowY: "auto", padding: isMobile ? "1.5rem 0 3rem" : "2.5rem 0 3rem" }}>
            <IntakeForm initial={intake} startAt={formStartAt} onComplete={handleFormComplete} submitting={savingForm} isMobile={isMobile} userId={user?.id} />
          </div>
        )}
        {phase === "channel" && (
          <ChannelPhase key="channel" skipping={skipping} canTalk={canTalk}
            onBackToForm={() => { setFormStartAt("record"); setPhase("form"); }}
            onPick={(c) => {
              if (c !== "skip" && !canTalk) return;
              setChannel(c);
              if (c === "skip") { handleSkip(); return; }
              setPhase(c === "voice" ? "voice-confirm" : "text-interview");
            }} />
        )}
        {phase === "text-interview" && (
          <div key="text-interview" style={{ flex: 1, minHeight: 0, display: "flex", padding: "2rem 0 1.5rem" }}>
            <TextInterview
              record={savedRecord} isMobile={isMobile}
              onFinish={(transcriptText) => runExtraction(transcriptText, "text")}
            />
          </div>
        )}
        {phase === "review" && (
          <div key="review" style={{ flex: 1, overflowY: "auto", padding: isMobile ? "1.5rem 0 3rem" : "2.5rem 0 3rem" }}>
            <IntakeReview draft={draft} activities={activities} onConfirm={handleConfirm}
              committing={committing} error={reviewError} isMobile={isMobile} />
          </div>
        )}
        {phase === "voice-confirm" && (
          <VoiceConfirmPhase key="voice-confirm" onStart={startConversation} loading={startingConv}
            onBack={() => { setChannel("text"); setPhase("text-interview"); }} />
        )}
        {phase === "active"     && <ActivePhase     key="active"     transcript={transcript} elapsed={elapsed} isSpeaking={conversation.isSpeaking} onEnd={endConversation} getInputLevel={getInputLevel}/>}
        {phase === "processing" && <ProcessingPhase key="processing"/>}
        {phase === "recovery"   && <RecoveryPhase   key="recovery"   onRetryExtraction={() => { const a = lastAttemptRef.current; return runExtraction(a.transcript, a.via); }} onRetry={() => { setPhase("channel"); }}/>}
        {phase === "error"      && <ErrorPhase      key="error"      error={error} onRetry={() => { setError(null); setPhase(errorReturn); setErrorReturn("channel"); }}/>}
        {phase === "mic-denied" && <MicDeniedPhase  key="mic-denied" onRetry={() => setPhase("voice-confirm")}/>}
      </AnimatePresence>
    </div>
  );
}



