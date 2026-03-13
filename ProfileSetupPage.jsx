import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "./lib/supabase.js";

// ─── US States ────────────────────────────────────────────────────────────────
const US_STATES = [
  "Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut",
  "Delaware","Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa",
  "Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan",
  "Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada","New Hampshire",
  "New Jersey","New Mexico","New York","North Carolina","North Dakota","Ohio",
  "Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina","South Dakota",
  "Tennessee","Texas","Utah","Vermont","Virginia","Washington","West Virginia",
  "Wisconsin","Wyoming","Outside the US",
];

const GRADE_OPTIONS = [
  { label: "9th",  value: 9  },
  { label: "10th", value: 10 },
  { label: "11th", value: 11 },
  { label: "12th", value: 12 },
];

// ─── Stars ────────────────────────────────────────────────────────────────────
const STARS = Array.from({ length: 14 }, (_, i) => ({
  id: i,
  top:  `${5  + (i * 7)  % 30}%`,
  left: `${5  + (i * 13) % 88}%`,
  size: i % 3 === 0 ? 3 : 2,
  dur:  2 + i * 0.28,
}));

// ─── Location Dropdown ────────────────────────────────────────────────────────
function LocationSelect({ value, onChange, shake }) {
  const [open, setOpen]     = useState(false);
  const [query, setQuery]   = useState("");

  const filtered = US_STATES.filter((s) =>
    s.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  useEffect(() => {
    const close = () => setOpen(false);
    if (open) window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [open]);

  return (
    <motion.div
      animate={shake ? { x: [0, -8, 8, -8, 8, 0] } : { x: 0 }}
      transition={{ duration: 0.4 }}
      style={{ position: "relative" }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          padding: "0.875rem 1.1rem",
          background: "rgba(255,255,255,0.9)",
          border: `2px solid ${shake ? "#ef4444" : "rgba(99,102,241,0.35)"}`,
          borderRadius: "0.875rem",
          fontSize: "0.95rem",
          color: value ? "#1e1b4b" : "#94a3b8",
          fontWeight: value ? 600 : 400,
          textAlign: "left",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontFamily: "system-ui, sans-serif",
          transition: "border-color 0.2s",
        }}
      >
        {value || "Select your state or region"}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s", flexShrink: 0 }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            style={{
              position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0,
              background: "rgba(255,255,255,0.97)",
              backdropFilter: "blur(16px)",
              border: "1.5px solid rgba(99,102,241,0.25)",
              borderRadius: "0.875rem",
              boxShadow: "0 8px 32px rgba(99,102,241,0.15)",
              zIndex: 100,
              overflow: "hidden",
            }}
          >
            <div style={{ padding: "0.5rem" }}>
              <input
                autoFocus
                placeholder="Search..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{
                  width: "100%", padding: "0.5rem 0.75rem",
                  border: "1.5px solid rgba(99,102,241,0.25)",
                  borderRadius: "0.5rem", fontSize: "0.875rem",
                  outline: "none", fontFamily: "system-ui",
                  color: "#1e1b4b", background: "rgba(99,102,241,0.04)",
                }}
              />
            </div>
            <div style={{ maxHeight: 220, overflowY: "auto", padding: "0 0.5rem 0.5rem" }}>
              {filtered.length === 0 ? (
                <p style={{ padding: "0.75rem", color: "#94a3b8", fontSize: "0.875rem", textAlign: "center" }}>No results</p>
              ) : filtered.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { onChange(s); setOpen(false); }}
                  style={{
                    width: "100%", textAlign: "left",
                    padding: "0.55rem 0.75rem",
                    background: s === value ? "rgba(99,102,241,0.1)" : "none",
                    border: "none", borderRadius: "0.5rem",
                    fontSize: "0.9rem", color: s === value ? "#4f46e5" : "#1e1b4b",
                    fontWeight: s === value ? 600 : 400,
                    cursor: "pointer", fontFamily: "system-ui",
                    transition: "background 0.12s",
                  }}
                  onMouseEnter={(e) => { if (s !== value) e.currentTarget.style.background = "rgba(99,102,241,0.06)"; }}
                  onMouseLeave={(e) => { if (s !== value) e.currentTarget.style.background = "none"; }}
                >
                  {s}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── ProfileSetupPage ─────────────────────────────────────────────────────────
export default function ProfileSetupPage() {
  const [grade,    setGrade]    = useState(null);
  const [age,      setAge]      = useState("");
  const [location, setLocation] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [shaking,  setShaking]  = useState({ grade: false, age: false, location: false });

  // ── Auth guard ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/auth"; return; }

      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarding_completed, grade_level")
        .eq("id", user.id)
        .single();

      if (!profile?.onboarding_completed) { window.location.href = "/onboarding"; return; }
      if (profile?.grade_level)           { window.location.href = "/roadmap";     return; }
    };
    check();
  }, []);

  // ── Shake helper ───────────────────────────────────────────────────────────
  const shake = (field) => {
    setShaking((prev) => ({ ...prev, [field]: true }));
    setTimeout(() => setShaking((prev) => ({ ...prev, [field]: false })), 500);
  };

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    let valid = true;
    if (!grade)                      { shake("grade");    valid = false; }
    if (!age || age < 13 || age > 19){ shake("age");      valid = false; }
    if (!location)                   { shake("location"); valid = false; }
    if (!valid) return;

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/auth"; return; }

      await supabase
        .from("profiles")
        .update({
          grade_level:      grade,
          location_general: location,
          age:              Number(age),
          updated_at:       new Date().toISOString(),
        })
        .eq("id", user.id);

      window.location.href = "/roadmap";
    } catch {
      setLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: "100vh",
      position: "relative",
      overflow: "hidden",
      background: "linear-gradient(180deg, #c7d2fe 0%, #e0e7ff 25%, #f0f4ff 55%, #fef3c7 80%, #fde68a 100%)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "2rem 1rem 340px",
      fontFamily: "system-ui, sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800;900&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes ps-spin { to { transform: rotate(360deg); } }

        .ps-grade-pill {
          flex: 1;
          padding: 0.75rem 0;
          border-radius: 0.75rem;
          border: 2px solid #6366f1;
          font-size: 1rem;
          font-weight: 700;
          font-family: 'Plus Jakarta Sans', sans-serif;
          cursor: pointer;
          transition: all 0.18s ease;
          letter-spacing: -0.01em;
        }

        .ps-submit-btn {
          width: 100%;
          padding: 1rem;
          border: none;
          border-radius: 0.875rem;
          background: linear-gradient(135deg, #6366f1, #4f46e5);
          color: white;
          font-size: 1rem;
          font-weight: 700;
          font-family: 'Plus Jakarta Sans', sans-serif;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          box-shadow: 0 6px 24px rgba(99,102,241,0.35);
          letter-spacing: -0.01em;
          transition: filter 0.18s, transform 0.15s, box-shadow 0.18s;
        }
        .ps-submit-btn:hover:not(:disabled) {
          filter: brightness(1.06);
          transform: translateY(-1px);
          box-shadow: 0 10px 32px rgba(99,102,241,0.45);
        }
        .ps-submit-btn:disabled { opacity: 0.85; cursor: not-allowed; }

        .ps-age-input {
          font-size: 2rem;
          font-weight: 800;
          text-align: center;
          border: none;
          border-bottom: 2.5px solid #6366f1;
          background: transparent;
          width: 90px;
          color: #1e1b4b;
          outline: none;
          font-family: 'Plus Jakarta Sans', sans-serif;
          -moz-appearance: textfield;
        }
        .ps-age-input::-webkit-inner-spin-button,
        .ps-age-input::-webkit-outer-spin-button { -webkit-appearance: none; }
      `}</style>

      {/* ── Stars ────────────────────────────────────────────────────────── */}
      {STARS.map((s) => (
        <motion.div
          key={s.id}
          animate={{ opacity: [0.25, 1, 0.25] }}
          transition={{ duration: s.dur, repeat: Infinity, ease: "easeInOut" }}
          style={{
            position: "absolute",
            top: s.top, left: s.left,
            width: s.size, height: s.size,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.9)",
            boxShadow: "0 0 4px rgba(255,255,255,0.8)",
            pointerEvents: "none",
          }}
        />
      ))}

      {/* ── Wordmark ─────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        style={{ marginBottom: "1.75rem", display: "flex", alignItems: "center", gap: 5 }}
      >
        <span style={{
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          fontWeight: 800, fontSize: "1.2rem",
          color: "#312e81", letterSpacing: "-0.03em",
        }}>
          mentorable
        </span>
        <span style={{
          width: 7, height: 7, borderRadius: "50%",
          background: "#6366f1", display: "inline-block", marginBottom: 2,
          boxShadow: "0 0 8px rgba(99,102,241,0.6)", flexShrink: 0,
        }}/>
      </motion.div>

      {/* ── Card ─────────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        style={{
          width: "100%", maxWidth: 480,
          background: "rgba(255,255,255,0.88)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          border: "1px solid rgba(255,255,255,0.7)",
          borderRadius: "1.5rem",
          boxShadow: "0 8px 40px rgba(99,102,241,0.18), 0 2px 8px rgba(0,0,0,0.06)",
          padding: "2.25rem 2rem",
          position: "relative", zIndex: 2,
        }}
      >
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.5, ease: [0.22,1,0.36,1] }}
          style={{ marginBottom: "2rem" }}
        >
          <h1 style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontWeight: 800, fontSize: "1.9rem",
            color: "#1e1b4b", lineHeight: 1.15,
            letterSpacing: "-0.025em", marginBottom: "0.4rem",
          }}>
            Almost there.
          </h1>
          <p style={{ color: "#64748b", fontSize: "0.9375rem", lineHeight: 1.6 }}>
            Just a few quick things before we build your roadmap.
          </p>
        </motion.div>

        {/* ── Q1: Grade ──────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.5, ease: [0.22,1,0.36,1] }}
          style={{ marginBottom: "1.75rem" }}
        >
          <p style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontWeight: 700, fontSize: "1rem",
            color: "#1e1b4b", marginBottom: "0.875rem",
          }}>
            What grade are you in?
          </p>
          <motion.div
            animate={shaking.grade ? { x: [0, -8, 8, -8, 8, 0] } : { x: 0 }}
            transition={{ duration: 0.4 }}
            style={{ display: "flex", gap: "0.5rem" }}
          >
            {GRADE_OPTIONS.map((g) => (
              <button
                key={g.value}
                type="button"
                className="ps-grade-pill"
                onClick={() => setGrade(g.value)}
                style={{
                  background: grade === g.value ? "#6366f1" : "white",
                  color: grade === g.value ? "white" : "#6366f1",
                  boxShadow: grade === g.value ? "0 4px 14px rgba(99,102,241,0.35)" : "none",
                  transform: grade === g.value ? "translateY(-1px)" : "none",
                }}
              >
                {g.label}
              </button>
            ))}
          </motion.div>
          {shaking.grade && (
            <p style={{ marginTop: "0.4rem", fontSize: "0.8rem", color: "#ef4444", fontWeight: 500 }}>
              Please select your grade
            </p>
          )}
        </motion.div>

        {/* ── Q2: Age ────────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.38, duration: 0.5, ease: [0.22,1,0.36,1] }}
          style={{ marginBottom: "1.75rem" }}
        >
          <p style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontWeight: 700, fontSize: "1rem",
            color: "#1e1b4b", marginBottom: "0.875rem",
          }}>
            How old are you?
          </p>
          <motion.div
            animate={shaking.age ? { x: [0, -8, 8, -8, 8, 0] } : { x: 0 }}
            transition={{ duration: 0.4 }}
            style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}
          >
            <input
              type="number"
              className="ps-age-input"
              min={13} max={19}
              placeholder="—"
              value={age}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "" || (Number(v) >= 1 && Number(v) <= 19)) setAge(v);
              }}
            />
            <span style={{ color: "#94a3b8", fontSize: "0.875rem" }}>years old</span>
          </motion.div>
          {shaking.age && (
            <p style={{ marginTop: "0.4rem", fontSize: "0.8rem", color: "#ef4444", fontWeight: 500 }}>
              Please enter your age (13–19)
            </p>
          )}
        </motion.div>

        {/* ── Q3: Location ───────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.5, ease: [0.22,1,0.36,1] }}
          style={{ marginBottom: "2rem" }}
        >
          <p style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontWeight: 700, fontSize: "1rem",
            color: "#1e1b4b", marginBottom: "0.875rem",
          }}>
            Where are you based?
            <span style={{ fontWeight: 500, color: "#64748b", fontSize: "0.875rem", marginLeft: "0.4rem" }}>
              (just your state or region)
            </span>
          </p>
          <LocationSelect
            value={location}
            onChange={setLocation}
            shake={shaking.location}
          />
          {shaking.location && (
            <p style={{ marginTop: "0.4rem", fontSize: "0.8rem", color: "#ef4444", fontWeight: 500 }}>
              Please select your location
            </p>
          )}
        </motion.div>

        {/* ── Submit ─────────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.5, ease: [0.22,1,0.36,1] }}
        >
          <motion.button
            type="button"
            className="ps-submit-btn"
            disabled={loading}
            onClick={handleSubmit}
            whileTap={{ scale: 0.98 }}
          >
            {loading ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                style={{ animation: "ps-spin 0.75s linear infinite" }}>
                <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" strokeWidth="3"/>
                <path d="M12 2a10 10 0 0 1 10 10" stroke="white" strokeWidth="3" strokeLinecap="round"/>
              </svg>
            ) : "Build my roadmap →"}
          </motion.button>
        </motion.div>
      </motion.div>

      {/* ── Mountains ────────────────────────────────────────────────────── */}
      {/* Back mountains */}
      <svg viewBox="0 0 1440 320" preserveAspectRatio="none"
        style={{ position: "absolute", bottom: 0, left: 0, width: "100%", height: "35%", zIndex: 0 }}>
        <polygon
          points="0,320 0,200 100,130 260,185 420,100 580,160 740,75 900,145 1060,85 1220,135 1380,65 1440,90 1440,320"
          fill="#818cf8" opacity="0.45"
        />
      </svg>

      {/* Middle mountains */}
      <svg viewBox="0 0 1440 320" preserveAspectRatio="none"
        style={{ position: "absolute", bottom: 0, left: 0, width: "100%", height: "30%", zIndex: 1 }}>
        <polygon
          points="0,320 0,240 160,155 340,215 500,130 680,195 840,110 1020,170 1200,100 1380,155 1440,130 1440,320"
          fill="#312e81"
        />
      </svg>

      {/* Front mountains */}
      <svg viewBox="0 0 1440 320" preserveAspectRatio="none"
        style={{ position: "absolute", bottom: 0, left: 0, width: "100%", height: "22%", zIndex: 2 }}>
        <polygon
          points="0,320 0,275 140,210 280,255 440,190 600,240 760,180 920,228 1080,188 1260,220 1380,195 1440,205 1440,320"
          fill="#1e1b4b"
        />
      </svg>
    </div>
  );
}
