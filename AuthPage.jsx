import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "./lib/supabase.js";

// ─── Spinner ──────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <svg
      width="18" height="18" viewBox="0 0 24 24" fill="none"
      style={{ animation: "auth-spin 0.75s linear infinite", flexShrink: 0 }}
    >
      <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.28)" strokeWidth="3"/>
      <path d="M12 2a10 10 0 0 1 10 10" stroke="white" strokeWidth="3" strokeLinecap="round"/>
    </svg>
  );
}

// ─── Mode content ─────────────────────────────────────────────────────────
const CONTENT = {
  signup: {
    headline: "Start your journey.",
    sub: "Create your account and find out what you're made of.",
    btn: "Create account",
    togglePrompt: "Already have an account?",
    toggleLabel: "Sign in",
  },
  signin: {
    headline: "Welcome back.",
    sub: "Pick up right where you left off.",
    btn: "Sign in",
    togglePrompt: "Don't have an account?",
    toggleLabel: "Sign up",
  },
};

// ─── AuthPage ─────────────────────────────────────────────────────────────
export default function AuthPage() {
  const [mode, setMode] = useState("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [confirmed, setConfirmed] = useState(false);

  const isSignUp = mode === "signup";
  const c = CONTENT[mode];

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      if (isSignUp) {
        const { data, error: err } = await supabase.auth.signUp({ email, password });
        if (err) {
          const msg = err.message?.toLowerCase() ?? "";
          if (msg.includes("password")) {
            setError("Password must be at least 6 characters.");
          } else if (msg.includes("email")) {
            setError("Please enter a valid email address.");
          } else {
            setError(err.message);
          }
          return;
        }
        // Supabase silently succeeds for duplicate emails when confirmation is on —
        // but returns a user with an empty identities array
        if (!data.user || data.user.identities?.length === 0) {
          setError("already-exists");
          return;
        }
        setConfirmed(true);
      } else {
        const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) {
          setError("Incorrect email or password. Please try again.");
          return;
        }
        // Smart redirect: skip onboarding if already completed
        const { data: profile } = await supabase
          .from("profiles")
          .select("onboarding_completed")
          .eq("id", data.user.id)
          .single();
        window.location.href = profile?.onboarding_completed ? "/scorecard" : "/onboarding";
      }
    } catch (err) {
      setError(err.message ?? "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const toggle = () => {
    setMode((m) => (m === "signup" ? "signin" : "signup"));
    setError(null);
    setConfirmed(false);
  };

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
      overflow: "hidden",
      background: "#f8fafc",
      fontFamily: "system-ui, sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        @keyframes auth-spin { to { transform: rotate(360deg); } }

        @keyframes auth-glow {
          0%, 100% { opacity: 0.18; transform: scale(1); }
          50%       { opacity: 0.30; transform: scale(1.1); }
        }

        .auth-input {
          width: 100%;
          padding: 0.875rem 1rem;
          border: 1.5px solid rgba(148,163,184,0.3);
          border-radius: 0.75rem;
          font-size: 1rem;
          font-family: system-ui, sans-serif;
          color: #0f172a;
          background: rgba(255,255,255,0.95);
          outline: none;
          transition: border-color 0.18s, box-shadow 0.18s;
          -webkit-appearance: none;
        }
        .auth-input:focus {
          border-color: #1d4ed8;
          box-shadow: 0 0 0 3.5px rgba(29,78,216,0.1);
        }
        .auth-input:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .auth-input::placeholder { color: #94a3b8; }

        .auth-btn {
          width: 100%;
          padding: 0.9375rem;
          border: none;
          border-radius: 0.75rem;
          background: #1d4ed8;
          color: white;
          font-weight: 700;
          font-size: 1rem;
          font-family: 'Plus Jakarta Sans', sans-serif;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          transition: background 0.18s, transform 0.15s, box-shadow 0.18s;
          box-shadow: 0 4px 18px rgba(29,78,216,0.28);
          letter-spacing: -0.01em;
          position: relative;
          overflow: hidden;
        }
        .auth-btn:hover:not(:disabled) {
          background: #1e40af;
          transform: translateY(-1px);
          box-shadow: 0 8px 26px rgba(29,78,216,0.36);
        }
        .auth-btn:active:not(:disabled) {
          transform: translateY(0);
        }
        .auth-btn:disabled {
          cursor: not-allowed;
          opacity: 0.9;
        }
        .auth-btn::after {
          content: '';
          position: absolute;
          top: 0; left: -60%;
          width: 50%; height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent);
          animation: auth-shimmer 3.5s ease-in-out infinite;
          animation-delay: 1.5s;
        }
        @keyframes auth-shimmer {
          0%   { left: -60%; }
          100% { left: 130%; }
        }

        .auth-toggle-btn {
          background: none;
          border: none;
          cursor: pointer;
          color: #1d4ed8;
          font-weight: 600;
          font-size: 0.875rem;
          font-family: system-ui, sans-serif;
          padding: 0;
          text-decoration: underline;
          text-underline-offset: 2px;
          transition: color 0.15s;
        }
        .auth-toggle-btn:hover { color: #1e40af; }
      `}</style>

      {/* ── Dot grid ─────────────────────────────────────────────────── */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        backgroundImage: "radial-gradient(circle, rgba(148,163,184,0.28) 1px, transparent 1px)",
        backgroundSize: "26px 26px",
        maskImage: "radial-gradient(ellipse 85% 85% at 50% 50%, black 30%, transparent 100%)",
        WebkitMaskImage: "radial-gradient(ellipse 85% 85% at 50% 50%, black 30%, transparent 100%)",
      }}/>

      {/* ── Pulsing blue radial glow ──────────────────────────────────── */}
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        pointerEvents: "none",
      }}>
        <div style={{
          width: 640, height: 640,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(59,130,246,0.20) 0%, transparent 65%)",
          animation: "auth-glow 4.5s ease-in-out infinite",
        }}/>
      </div>

      {/* ── Card ─────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 28, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
        style={{
          position: "relative", zIndex: 1,
          width: "100%", maxWidth: 440,
          margin: "1rem",
          background: "rgba(255,255,255,0.85)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: "1px solid rgba(148,163,184,0.2)",
          borderRadius: "1.25rem",
          boxShadow: "0 4px 24px rgba(0,0,0,0.05), 0 20px 60px rgba(0,0,0,0.07), 0 0 0 0.5px rgba(148,163,184,0.15)",
          padding: "2.5rem 2.25rem",
        }}
      >
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: "2.25rem" }}>
          <span style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontWeight: 800, fontSize: "1.35rem",
            color: "#0f172a", letterSpacing: "-0.03em",
          }}>
            mentorable
          </span>
          <span style={{
            width: 7, height: 7,
            borderRadius: "50%",
            background: "#1d4ed8",
            display: "inline-block",
            marginBottom: 3,
            boxShadow: "0 0 10px rgba(29,78,216,0.55)",
            flexShrink: 0,
          }}/>
        </div>

        {/* Headline + subline — crossfade on mode toggle */}
        <div style={{ marginBottom: "2rem" }}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={mode}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              <h1 style={{
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontWeight: 800,
                fontSize: "2.05rem",
                color: "#0f172a",
                lineHeight: 1.18,
                marginBottom: "0.5rem",
                letterSpacing: "-0.025em",
              }}>
                {c.headline}
              </h1>
              <p style={{ color: "#64748b", fontSize: "0.9375rem", lineHeight: 1.65 }}>
                {c.sub}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* ── Success state (sign up confirmed) ────────────────────── */}
        <AnimatePresence>
          {confirmed && (
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              style={{
                background: "rgba(34,197,94,0.07)",
                border: "1px solid rgba(34,197,94,0.22)",
                borderRadius: "0.875rem",
                padding: "1.5rem",
                textAlign: "center",
                marginBottom: "1rem",
              }}
            >
              <div style={{
                width: 44, height: 44,
                borderRadius: "50%",
                background: "rgba(34,197,94,0.12)",
                display: "flex", alignItems: "center", justifyContent: "center",
                margin: "0 auto 0.75rem",
                fontSize: "1.2rem",
              }}>
                ✓
              </div>
              <p style={{
                fontWeight: 700,
                color: "#166534",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontSize: "1rem",
                marginBottom: "0.3rem",
              }}>
                Check your inbox.
              </p>
              <p style={{ color: "#15803d", fontSize: "0.875rem", lineHeight: 1.55 }}>
                We sent a confirmation link to{" "}
                <strong style={{ fontWeight: 600 }}>{email}</strong>.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Form ──────────────────────────────────────────────────── */}
        {!confirmed && (
          <div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1rem" }}>
              <input
                type="email"
                className="auth-input"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit(e)}
                disabled={loading}
                autoComplete="email"
              />
              <input
                type="password"
                className="auth-input"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit(e)}
                disabled={loading}
                autoComplete={isSignUp ? "new-password" : "current-password"}
              />
            </div>

            {/* Error pill — animates in from below */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: 6, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: "auto" }}
                  exit={{ opacity: 0, y: 6, height: 0 }}
                  transition={{ duration: 0.22, ease: "easeOut" }}
                  style={{ overflow: "hidden", marginBottom: "0.875rem" }}
                >
                  <div style={{
                    background: "rgba(239,68,68,0.07)",
                    border: "1px solid rgba(239,68,68,0.2)",
                    borderRadius: "0.75rem",
                    padding: "0.75rem 1rem",
                  }}>
                    <p style={{ color: "#dc2626", fontSize: "0.875rem", lineHeight: 1.5 }}>
                      {error === "already-exists"
                        ? "An account with this email already exists."
                        : error}
                    </p>
                    {error === "already-exists" && (
                      <button
                        onClick={toggle}
                        style={{
                          marginTop: "0.375rem",
                          background: "none",
                          border: "none",
                          padding: 0,
                          color: "#1d4ed8",
                          fontSize: "0.875rem",
                          fontWeight: 600,
                          cursor: "pointer",
                          textDecoration: "underline",
                          textUnderlineOffset: 2,
                        }}
                      >
                        Sign in instead →
                      </button>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Submit */}
            <button
              type="button"
              className="auth-btn"
              disabled={loading}
              onClick={handleSubmit}
            >
              {loading ? <Spinner /> : `${c.btn} →`}
            </button>
          </div>
        )}

        {/* Toggle */}
        <p style={{
          marginTop: "1.35rem",
          textAlign: "center",
          fontSize: "0.875rem",
          color: "#64748b",
        }}>
          {c.togglePrompt}{" "}
          <button className="auth-toggle-btn" onClick={toggle}>
            {c.toggleLabel}
          </button>
        </p>
      </motion.div>
    </div>
  );
}
