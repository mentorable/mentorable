import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useConversation } from "@elevenlabs/react";
import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "./lib/supabase.js";


const AGENT_ID = import.meta.env.VITE_ELEVENLABS_AGENT_ID;

// ─── Spinner ──────────────────────────────────────────────────────────────────
function Spinner({ size = 20, color = "white" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={{ animation: "ob-spin 0.75s linear infinite", flexShrink: 0 }}
    >
      <circle cx="12" cy="12" r="10" stroke={`${color}44`} strokeWidth="3" />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ─── Logo ─────────────────────────────────────────────────────────────────────
function Logo() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <span
        style={{
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          fontWeight: 800,
          fontSize: "1.2rem",
          color: "white",
          letterSpacing: "-0.03em",
        }}
      >
        mentorable
      </span>
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: "#3b82f6",
          display: "inline-block",
          boxShadow: "0 0 8px rgba(59,130,246,0.7)",
          flexShrink: 0,
          marginBottom: 2,
        }}
      />
    </div>
  );
}

// ─── Waveform ─────────────────────────────────────────────────────────────────
function Waveform({ active, color }) {
  const delays = [0, 0.12, 0.24, 0.36, 0.48];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        height: 36,
      }}
    >
      {delays.map((delay, i) => (
        <div
          key={i}
          style={{
            width: 4,
            height: 28,
            borderRadius: 2,
            background: color,
            transformOrigin: "center",
            transform: active ? undefined : "scaleY(0.22)",
            animation: active ? "ob-wave 0.75s ease-in-out infinite" : "none",
            animationDelay: `${delay}s`,
            transition: "transform 0.3s ease, background 0.3s ease",
          }}
        />
      ))}
    </div>
  );
}

// ─── MicIcon ──────────────────────────────────────────────────────────────────
function MicIcon({ color = "white", size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1 1.93c-3.94-.49-7-3.85-7-7.93h2c0 3.31 2.69 6 6 6s6-2.69 6-6h2c0 4.08-3.06 7.44-7 7.93V22h-2v-4.07z" />
    </svg>
  );
}

// ─── Phase 1: Intro ───────────────────────────────────────────────────────────
function IntroPhase({ onStart, loading }) {
  return (
    <motion.div
      key="intro"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.5 }}
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
        textAlign: "center",
        minHeight: "100vh",
        position: "relative",
      }}
    >
      {/* Background glow */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 0,
        }}
      >
        <div
          style={{
            width: 640,
            height: 640,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(29,78,216,0.2) 0%, transparent 65%)",
            animation: "ob-glow 5s ease-in-out infinite",
          }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
        style={{ position: "relative", zIndex: 1, maxWidth: 520, width: "100%" }}
      >
        {/* Logo */}
        <div style={{ marginBottom: "3rem" }}>
          <Logo />
        </div>

        {/* Headline */}
        <h1
          style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontWeight: 800,
            fontSize: "clamp(2.2rem, 6vw, 3.25rem)",
            color: "white",
            letterSpacing: "-0.03em",
            lineHeight: 1.08,
            marginBottom: "1.125rem",
          }}
        >
          Let's get to know you.
        </h1>

        <p
          style={{
            color: "#94a3b8",
            fontSize: "1.0625rem",
            lineHeight: 1.7,
            maxWidth: 400,
            margin: "0 auto 2.5rem",
          }}
        >
          Have a 5–8 minute conversation with your AI guide. Just talk naturally
          There are no right or wrong answers.
        </p>

        {/* Info pills */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.625rem",
            justifyContent: "center",
            marginBottom: "3rem",
          }}
        >
          {[
            { icon: "🎙", label: "Voice conversation" },
            { icon: "⏱", label: "5–8 minutes" },
            { icon: "🔒", label: "Private & secure" },
          ].map(({ icon, label }) => (
            <div
              key={label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                padding: "0.4375rem 0.9375rem",
                borderRadius: 999,
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "#cbd5e1",
                fontSize: "0.8125rem",
                fontWeight: 500,
              }}
            >
              <span style={{ fontSize: "0.875rem" }}>{icon}</span>
              {label}
            </div>
          ))}
        </div>

        {/* Start button with pulsing rings */}
        <div
          style={{
            position: "relative",
            display: "inline-flex",
            marginBottom: "1.5rem",
          }}
        >
          {!loading && (
            <>
              <div
                style={{
                  position: "absolute",
                  inset: -8,
                  borderRadius: 999,
                  background: "rgba(29,78,216,0.35)",
                  animation: "ob-pulse-ring 2.2s ease-out infinite",
                  pointerEvents: "none",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  inset: -8,
                  borderRadius: 999,
                  background: "rgba(29,78,216,0.2)",
                  animation: "ob-pulse-ring 2.2s ease-out infinite 0.7s",
                  pointerEvents: "none",
                }}
              />
            </>
          )}
          <button
            onClick={onStart}
            disabled={loading}
            style={{
              position: "relative",
              padding: "1.0625rem 2.625rem",
              borderRadius: 999,
              border: "none",
              background: loading ? "rgba(29,78,216,0.65)" : "#1d4ed8",
              color: "white",
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontWeight: 700,
              fontSize: "1.0625rem",
              cursor: loading ? "not-allowed" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.625rem",
              boxShadow: "0 8px 32px rgba(29,78,216,0.5)",
              transition: "background 0.18s, transform 0.15s",
              letterSpacing: "-0.01em",
            }}
          >
            {loading ? <Spinner size={18} /> : <MicIcon size={18} />}
            {loading ? "Connecting..." : "Start Conversation"}
          </button>
        </div>

        <p
          style={{
            color: "#334155",
            fontSize: "0.8125rem",
            letterSpacing: "0.01em",
          }}
        >
          We'll ask for mic access when you start.
        </p>
      </motion.div>
    </motion.div>
  );
}

// ─── Phase 2: Active Conversation ─────────────────────────────────────────────
function ActivePhase({ transcript, elapsed, isSpeaking, onEnd, transcriptEndRef }) {
  const formatTime = (s) => {
    const m = Math.floor(s / 60)
      .toString()
      .padStart(2, "0");
    return `${m}:${(s % 60).toString().padStart(2, "0")}`;
  };

  return (
    <motion.div
      key="active"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
      }}
    >
      {/* Top bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "1.25rem 1.5rem",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          flexShrink: 0,
        }}
      >
        <Logo />
        <div
          style={{
            fontFamily: "ui-monospace, monospace",
            fontSize: "0.875rem",
            color: "#475569",
            letterSpacing: "0.08em",
            fontWeight: 500,
          }}
        >
          {formatTime(elapsed)}
        </div>
      </div>

      {/* Transcript area */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "1.5rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
          maxWidth: 680,
          width: "100%",
          margin: "0 auto",
          alignSelf: "stretch",
        }}
      >
        {transcript.length === 0 && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            style={{
              textAlign: "center",
              color: "#334155",
              fontSize: "0.9375rem",
              marginTop: "4rem",
              lineHeight: 1.6,
            }}
          >
            Your conversation will appear here...
          </motion.p>
        )}

        <AnimatePresence initial={false}>
          {transcript.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              style={{
                display: "flex",
                justifyContent: msg.role === "agent" ? "flex-start" : "flex-end",
              }}
            >
              <div
                style={{
                  maxWidth: "78%",
                  padding: "0.75rem 1.0625rem",
                  borderRadius:
                    msg.role === "agent"
                      ? "0.25rem 1rem 1rem 1rem"
                      : "1rem 0.25rem 1rem 1rem",
                  background:
                    msg.role === "agent"
                      ? "rgba(255,255,255,0.07)"
                      : "#1d4ed8",
                  border:
                    msg.role === "agent"
                      ? "1px solid rgba(255,255,255,0.08)"
                      : "none",
                  color: "white",
                  fontSize: "0.9375rem",
                  lineHeight: 1.6,
                }}
              >
                {msg.message}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        <div ref={transcriptEndRef} />
      </div>

      {/* Bottom bar */}
      <div
        style={{
          padding: "1.25rem 1.5rem 2rem",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "1rem",
          flexShrink: 0,
        }}
      >
        {/* Waveform + status */}
        <div
          style={{ display: "flex", alignItems: "center", gap: "0.875rem" }}
        >
          <Waveform
            active={true}
            color={isSpeaking ? "#3b82f6" : "#e2e8f0"}
          />
          <span
            style={{
              color: "#64748b",
              fontSize: "0.875rem",
              fontWeight: 500,
              minWidth: 180,
            }}
          >
            {isSpeaking ? "Mentorable is speaking..." : "Your turn..."}
          </span>
        </div>

        {/* End button */}
        <button
          onClick={onEnd}
          style={{
            padding: "0.625rem 1.625rem",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.13)",
            background: "transparent",
            color: "#64748b",
            fontSize: "0.875rem",
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            transition: "border-color 0.15s, color 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.28)";
            e.currentTarget.style.color = "#e2e8f0";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.13)";
            e.currentTarget.style.color = "#64748b";
          }}
        >
          End Conversation
        </button>
      </div>
    </motion.div>
  );
}

// ─── Phase 3: Processing ──────────────────────────────────────────────────────
function ProcessingPhase() {
  return (
    <motion.div
      key="processing"
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      style={{
        flex: 1,
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "2rem",
      }}
    >
      {/* Spinning ring */}
      <div style={{ position: "relative", marginBottom: "2.25rem" }}>
        <div
          style={{
            width: 76,
            height: 76,
            borderRadius: "50%",
            border: "3px solid rgba(59,130,246,0.18)",
            borderTopColor: "#3b82f6",
            animation: "ob-spin 1s linear infinite",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 44,
            height: 44,
            borderRadius: "50%",
            background: "rgba(59,130,246,0.08)",
            border: "1px solid rgba(59,130,246,0.15)",
          }}
        />
      </div>

      <h2
        style={{
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          fontWeight: 800,
          fontSize: "1.875rem",
          color: "white",
          letterSpacing: "-0.025em",
          marginBottom: "0.75rem",
        }}
      >
        Building your scorecard...
      </h2>

      <p
        style={{
          color: "#475569",
          fontSize: "0.9375rem",
          lineHeight: 1.7,
          maxWidth: 380,
        }}
      >
        This takes about 10 seconds. We're analyzing your conversation and
        identifying your unique strengths.
      </p>
    </motion.div>
  );
}

// ─── Error Phase ──────────────────────────────────────────────────────────────
function ErrorPhase({ error, onRetry }) {
  return (
    <motion.div
      key="error"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        flex: 1,
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "2rem",
      }}
    >
      <div
        style={{
          width: 60,
          height: 60,
          borderRadius: "50%",
          background: "rgba(239,68,68,0.1)",
          border: "1px solid rgba(239,68,68,0.22)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "1.5rem",
          fontSize: "1.5rem",
        }}
      >
        ⚠
      </div>

      <h2
        style={{
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          fontWeight: 700,
          fontSize: "1.5rem",
          color: "white",
          marginBottom: "0.75rem",
          letterSpacing: "-0.02em",
        }}
      >
        Something went wrong
      </h2>

      <p
        style={{
          color: "#64748b",
          fontSize: "0.9375rem",
          lineHeight: 1.65,
          maxWidth: 360,
          marginBottom: "2rem",
        }}
      >
        {error || "An unexpected error occurred. Please try again."}
      </p>

      <button
        onClick={onRetry}
        style={{
          padding: "0.9375rem 2.25rem",
          borderRadius: 999,
          border: "none",
          background: "#1d4ed8",
          color: "white",
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          fontWeight: 700,
          fontSize: "0.9375rem",
          cursor: "pointer",
          boxShadow: "0 4px 20px rgba(29,78,216,0.4)",
          transition: "background 0.18s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "#1e40af")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "#1d4ed8")}
      >
        Try again →
      </button>
    </motion.div>
  );
}

// ─── Mic Denied Phase ─────────────────────────────────────────────────────────
function MicDeniedPhase({ onRetry }) {
  return (
    <motion.div
      key="mic-denied"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        flex: 1,
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "2rem",
      }}
    >
      <div
        style={{
          width: 60,
          height: 60,
          borderRadius: "50%",
          background: "rgba(245,158,11,0.1)",
          border: "1px solid rgba(245,158,11,0.22)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "1.5rem",
          fontSize: "1.4rem",
        }}
      >
        🎙
      </div>

      <h2
        style={{
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          fontWeight: 700,
          fontSize: "1.5rem",
          color: "white",
          marginBottom: "0.75rem",
          letterSpacing: "-0.02em",
        }}
      >
        Microphone access needed
      </h2>

      <p
        style={{
          color: "#64748b",
          fontSize: "0.9375rem",
          lineHeight: 1.65,
          maxWidth: 360,
          marginBottom: "2rem",
        }}
      >
        We need microphone access to continue. Please allow access in your
        browser settings and try again.
      </p>

      <button
        onClick={onRetry}
        style={{
          padding: "0.9375rem 2.25rem",
          borderRadius: 999,
          border: "none",
          background: "#1d4ed8",
          color: "white",
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          fontWeight: 700,
          fontSize: "0.9375rem",
          cursor: "pointer",
          boxShadow: "0 4px 20px rgba(29,78,216,0.4)",
          transition: "background 0.18s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "#1e40af")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "#1d4ed8")}
      >
        Try again →
      </button>
    </motion.div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function OnboardingPage() {
  const [phase, setPhase] = useState("loading");
  const [transcript, setTranscript] = useState([]);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);
  const [startingConv, setStartingConv] = useState(false);

  const transcriptEndRef = useRef(null);
  const timerRef = useRef(null);
  // Mirror transcript in a ref so async functions always see latest
  const transcriptRef = useRef([]);

  // ── Auth guard + onboarding check ─────────────────────────────────────────
  useEffect(() => {
    const checkAuth = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/auth";
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarding_completed")
        .eq("id", user.id)
        .single();

      if (profile?.onboarding_completed) {
        window.location.href = "/scorecard";
        return;
      }

      setUser(user);
      setPhase("intro");
    };

    checkAuth();
  }, []);

  // ── ElevenLabs conversation hook ──────────────────────────────────────────
  const conversation = useConversation({
    onMessage: (msg) => {
      const newMsg = {
        role: msg.role, // "agent" or "user"
        message: msg.message,
        id: `${Date.now()}-${Math.random()}`,
      };
      setTranscript((prev) => {
        const next = [...prev, newMsg];
        transcriptRef.current = next;
        return next;
      });
    },
    onError: (err) => {
      const msg =
        typeof err === "string" ? err : "Connection error. Please try again.";
      setError(msg);
      setPhase("error");
    },
  });

  // ── Auto-scroll transcript ─────────────────────────────────────────────────
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  // ── Elapsed timer ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase === "active") {
      timerRef.current = setInterval(
        () => setElapsed((e) => e + 1),
        1000
      );
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [phase]);

  // ── Cleanup session on unmount ─────────────────────────────────────────────
  useEffect(() => {
    return () => {
      conversation.endSession().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Start conversation ─────────────────────────────────────────────────────
  const startConversation = async () => {
    setStartingConv(true);

    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setPhase("mic-denied");
      setStartingConv(false);
      return;
    }

    try {
      await conversation.startSession({ agentId: AGENT_ID });
      setPhase("active");
    } catch (err) {
      setError(err?.message || "Failed to connect. Please try again.");
      setPhase("error");
    }

    setStartingConv(false);
  };

  // ── End conversation + process transcript ──────────────────────────────────
  const endConversation = async () => {
    clearInterval(timerRef.current);

    try {
      await conversation.endSession();
    } catch {
      // Session may already be closed
    }

    setPhase("processing");

    try {
      const transcriptText = transcriptRef.current
        .map(
          (m) =>
            `${m.role === "agent" ? "Mentorable" : "Student"}: ${m.message}`
        )
        .join("\n");

      // Call Claude API directly
      const anthropic = new Anthropic({
        apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY,
        dangerouslyAllowBrowser: true,
      });

      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        messages: [
          {
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
          },
        ],
      });

      const responseText =
        message.content[0].type === "text" ? message.content[0].text : "";

      // Extract JSON even if Claude added surrounding text
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("Could not extract profile from conversation. Please try a longer conversation.");
      }
      const profile = JSON.parse(jsonMatch[0]);

      // Save to Supabase
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          strengths: profile.strengths,
          weaknesses: profile.weaknesses,
          interests: profile.interests,
          work_style: profile.work_style,
          career_matches: profile.career_matches,
          onboarding_summary: profile.onboarding_summary,
          onboarding_completed: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (updateError) throw new Error(updateError.message);

      window.location.href = "/scorecard";
    } catch (err) {
      setError(
        err?.message || "Something went wrong processing your profile. Please try again."
      );
      setPhase("error");
    }
  };

  // ── Loading state ──────────────────────────────────────────────────────────
  if (phase === "loading") {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#0f172a",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Spinner size={28} color="#3b82f6" />
      </div>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0f172a",
        display: "flex",
        flexDirection: "column",
        fontFamily: "system-ui, sans-serif",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        @keyframes ob-spin {
          to { transform: rotate(360deg); }
        }

        @keyframes ob-glow {
          0%, 100% { opacity: 0.85; transform: scale(1); }
          50%       { opacity: 1;    transform: scale(1.1); }
        }

        @keyframes ob-pulse-ring {
          0%   { transform: scale(1);   opacity: 0.6; }
          100% { transform: scale(1.6); opacity: 0; }
        }

        @keyframes ob-wave {
          0%, 100% { transform: scaleY(0.22); }
          50%       { transform: scaleY(1);    }
        }
      `}</style>

      <AnimatePresence mode="wait">
        {phase === "intro" && (
          <IntroPhase
            key="intro"
            onStart={startConversation}
            loading={startingConv}
          />
        )}
        {phase === "active" && (
          <ActivePhase
            key="active"
            transcript={transcript}
            elapsed={elapsed}
            isSpeaking={conversation.isSpeaking}
            onEnd={endConversation}
            transcriptEndRef={transcriptEndRef}
          />
        )}
        {phase === "processing" && <ProcessingPhase key="processing" />}
        {phase === "error" && (
          <ErrorPhase
            key="error"
            error={error}
            onRetry={() => {
              setError(null);
              setPhase("intro");
            }}
          />
        )}
        {phase === "mic-denied" && (
          <MicDeniedPhase
            key="mic-denied"
            onRetry={() => setPhase("intro")}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
