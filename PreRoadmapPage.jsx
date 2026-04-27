import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "./lib/supabase.js";
import Spinner from "./components/common/Spinner.jsx";

// ─── Design tokens (matches OnboardingPage) ───────────────────────────────────
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

const fadeUp = (delay = 0) => ({
  initial:    { opacity: 0, y: 18 },
  animate:    { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1], delay },
});

// ─── Floating background shape ────────────────────────────────────────────────
function ElegantShape({ shapeStyle, delay = 0, width = 400, height = 100, rotate = 0, color, borderColor, glowColor }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -100, rotate: rotate - 15 }}
      animate={{ opacity: 1, y: 0, rotate }}
      transition={{ duration: 2.4, delay, ease: [0.23, 0.86, 0.39, 0.96], opacity: { duration: 1.2 } }}
      style={{ position: "absolute", ...shapeStyle }}
    >
      <motion.div
        animate={{ y: [0, 15, 0] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        style={{ width, height, position: "relative" }}
      >
        <div style={{
          position: "absolute", inset: 0, borderRadius: "9999px",
          background: `linear-gradient(to right, ${color}, transparent)`,
          backdropFilter: "blur(2px)",
          border: `2px solid ${borderColor}`,
          boxShadow: `0 8px 32px 0 ${glowColor}`,
        }} />
      </motion.div>
    </motion.div>
  );
}

// ─── Logo ─────────────────────────────────────────────────────────────────────
function Logo() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
      <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: "1.05rem", color: TEXT, letterSpacing: "-0.04em" }}>
        mentorable
      </span>
      <motion.span
        animate={{ scale: [1, 1.35, 1], opacity: [1, 0.7, 1] }}
        transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
        style={{
          width: 6, height: 6, borderRadius: "50%",
          background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT2})`,
          display: "inline-block", flexShrink: 0,
          boxShadow: `0 0 10px ${ACCENT}60`,
        }}
      />
    </div>
  );
}

const OPTIONS = [
  {
    value: "certain",
    label: "Yes, I have a specific career in mind",
    emoji: "🎯",
  },
  {
    value: "partial",
    label: "I have some ideas but nothing definite",
    emoji: "💡",
  },
  {
    value: "undecided",
    label: "Not yet — I'm still figuring it out",
    emoji: "🌱",
  },
];

export default function PreRoadmapPage({ navigate }) {
  const [phase, setPhase] = useState("loading"); // loading | question | saving
  const [selected, setSelected] = useState(null);
  const [inputValue, setInputValue] = useState("");
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const init = async () => {
      const { data: { user: u } } = await supabase.auth.getUser();
      if (!u) { (navigate || goHref)("/auth"); return; }
      setUser(u);

      const { data: profileData } = await supabase
        .from("profiles").select("*").eq("id", u.id).single();
      setProfile(profileData);
      setPhase("question");
    };
    init();
  }, []);

  const goHref = (path) => { window.location.href = path; };
  const nav = navigate || goHref;

  const selectedOption = OPTIONS.find((o) => o.value === selected);

  const canConfirm = (() => {
    if (!selected) return false;
    if (selected === "certain") return inputValue.trim().length > 0;
    if (selected === "partial") return inputValue.trim().length > 0;
    return true; // undecided needs no input
  })();

  const handleConfirm = async () => {
    if (!canConfirm || phase === "saving") return;
    setPhase("saving");
    setError(null);

    try {
      const careerText = selected !== "undecided" ? inputValue.trim() : null;

      // Build the profile update
      const profileUpdate = {
        pre_roadmap_certainty: selected,
        pre_roadmap_career: careerText || null,
        updated_at: new Date().toISOString(),
      };

      // For career mode, put the stated career at the front of career_matches
      // so initialize-roadmap picks it up as career_direction
      if (selected === "certain" && careerText) {
        const existing = profile?.career_matches || [];
        profileUpdate.career_matches = [careerText, ...existing.filter((c) => c !== careerText)];
      }

      await supabase.from("profiles").update(profileUpdate).eq("id", user.id);

      // Initialize the roadmap with the right mode
      const startingMode = selected === "certain" ? "career" : "discovery";
      const { error: fnError } = await supabase.functions.invoke("initialize-roadmap", {
        body: { userId: user.id, startingMode },
      });
      if (fnError) throw fnError;

      nav("/roadmap");
    } catch (err) {
      console.error("[PreRoadmap] error:", err);
      setError("Something went wrong. Please try again.");
      setPhase("question");
    }
  };

  if (phase === "loading") {
    return (
      <div style={{ minHeight: "100vh", background: BG, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Spinner size={28} color={ACCENT} />
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh", background: BG,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      position: "relative", fontFamily: SANS,
      padding: "2rem",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Space+Grotesk:wght@400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      `}</style>

      {/* Gradient wash */}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom right, rgba(99,102,241,0.07), transparent, rgba(124,58,237,0.05))", filter: "blur(80px)", zIndex: 0 }} />

      {/* Floating shapes */}
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", zIndex: 0 }}>
        <ElegantShape delay={0.3} width={600} height={140} rotate={12}  color="rgba(99,102,241,0.10)" borderColor="rgba(99,102,241,0.2)"  glowColor="rgba(99,102,241,0.06)" shapeStyle={{ left: "-10%", top: "15%" }} />
        <ElegantShape delay={0.5} width={500} height={120} rotate={-15} color="rgba(124,58,237,0.09)" borderColor="rgba(124,58,237,0.18)" glowColor="rgba(124,58,237,0.05)" shapeStyle={{ right: "-5%", top: "60%" }} />
        <ElegantShape delay={0.4} width={300} height={80}  rotate={-8}  color="rgba(59,91,252,0.08)"  borderColor="rgba(59,91,252,0.16)"  glowColor="rgba(59,91,252,0.05)"  shapeStyle={{ left: "5%", bottom: "5%" }} />
        <ElegantShape delay={0.6} width={220} height={60}  rotate={20}  color="rgba(99,102,241,0.07)" borderColor="rgba(99,102,241,0.15)" glowColor="rgba(99,102,241,0.04)" shapeStyle={{ right: "12%", top: "8%" }} />
      </div>

      {/* Fade overlay */}
      <div style={{ position: "absolute", inset: 0, background: `linear-gradient(to bottom, rgba(250,251,255,0.55), transparent, ${BG})`, pointerEvents: "none", zIndex: 0 }} />

      {/* Logo */}
      <div style={{ position: "absolute", top: "1.5rem", left: "3rem", zIndex: 2 }}>
        <Logo />
      </div>

      {/* Card */}
      <motion.div
        {...fadeUp(0.1)}
        style={{
          position: "relative", zIndex: 1,
          background: CARD,
          border: `1.5px solid ${BORDER}`,
          borderRadius: 20,
          padding: "2.5rem",
          maxWidth: 500, width: "100%",
          boxShadow: "0 4px 40px rgba(59,91,252,0.1), 0 1px 8px rgba(0,0,0,0.06)",
        }}
      >
        {/* Header */}
        <motion.div {...fadeUp(0.18)} style={{ marginBottom: "1.75rem", textAlign: "center" }}>
          <p style={{ fontFamily: SERIF, fontSize: "1.45rem", fontWeight: 400, color: TEXT, lineHeight: 1.3, marginBottom: "0.6rem" }}>
            One quick thing before we build your roadmap
          </p>
          <p style={{ fontFamily: SANS, fontSize: "0.92rem", color: TEXT2, fontWeight: 500, lineHeight: 1.5 }}>
            Do you currently have a career path in mind?
          </p>
        </motion.div>

        {/* Options */}
        <motion.div {...fadeUp(0.26)} style={{ display: "flex", flexDirection: "column", gap: "0.65rem", marginBottom: "1.5rem" }}>
          {OPTIONS.map((opt) => {
            const isSelected = selected === opt.value;
            return (
              <motion.button
                key={opt.value}
                onClick={() => { setSelected(opt.value); setInputValue(""); }}
                whileTap={{ scale: 0.98 }}
                style={{
                  display: "flex", alignItems: "center", gap: "0.75rem",
                  padding: "0.9rem 1.25rem",
                  border: `1.5px solid ${isSelected ? ACCENT : BORDER}`,
                  borderRadius: 999,
                  background: isSelected ? `rgba(59,91,252,0.06)` : "transparent",
                  color: isSelected ? ACCENT : TEXT2,
                  fontFamily: SANS, fontSize: "0.9rem", fontWeight: isSelected ? 700 : 500,
                  cursor: "pointer", width: "100%", textAlign: "left",
                  transition: "all 0.15s ease",
                  boxShadow: isSelected ? "0 2px 12px rgba(59,91,252,0.12)" : "none",
                }}
              >
                <span style={{ fontSize: "1rem", flexShrink: 0 }}>{opt.emoji}</span>
                <span>{opt.label}</span>
                {isSelected && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    style={{ marginLeft: "auto", flexShrink: 0, color: ACCENT, fontWeight: 800 }}
                  >
                    ✓
                  </motion.span>
                )}
              </motion.button>
            );
          })}
        </motion.div>

        {/* Follow-up section */}
        <AnimatePresence mode="wait">
          {selected === "certain" && (
            <motion.div
              key="certain"
              initial={{ opacity: 0, height: 0, marginBottom: 0 }}
              animate={{ opacity: 1, height: "auto", marginBottom: "1.5rem" }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              style={{ overflow: "hidden" }}
            >
              <label style={{ display: "block", fontFamily: SANS, fontSize: "0.72rem", fontWeight: 700, color: TEXT2, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "0.45rem" }}>
                What career do you have in mind?
              </label>
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="e.g. Software Engineer"
                autoFocus
                style={{
                  width: "100%", padding: "0.75rem 1rem",
                  border: `1.5px solid ${BORDER}`, borderRadius: 10,
                  background: SURFACE, color: TEXT,
                  fontFamily: SANS, fontSize: "0.95rem", fontWeight: 500,
                  outline: "none", transition: "border-color 0.15s",
                }}
                onFocus={(e) => { e.target.style.borderColor = ACCENT; }}
                onBlur={(e) => { e.target.style.borderColor = BORDER; }}
                onKeyDown={(e) => { if (e.key === "Enter" && canConfirm) handleConfirm(); }}
              />
            </motion.div>
          )}

          {selected === "partial" && (
            <motion.div
              key="partial"
              initial={{ opacity: 0, height: 0, marginBottom: 0 }}
              animate={{ opacity: 1, height: "auto", marginBottom: "1.5rem" }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              style={{ overflow: "hidden" }}
            >
              <label style={{ display: "block", fontFamily: SANS, fontSize: "0.72rem", fontWeight: 700, color: TEXT2, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "0.45rem" }}>
                What fields or areas are you drawn to?
              </label>
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="e.g. Healthcare, technology, creative arts…"
                autoFocus
                style={{
                  width: "100%", padding: "0.75rem 1rem",
                  border: `1.5px solid ${BORDER}`, borderRadius: 10,
                  background: SURFACE, color: TEXT,
                  fontFamily: SANS, fontSize: "0.95rem", fontWeight: 500,
                  outline: "none", transition: "border-color 0.15s",
                }}
                onFocus={(e) => { e.target.style.borderColor = ACCENT; }}
                onBlur={(e) => { e.target.style.borderColor = BORDER; }}
                onKeyDown={(e) => { if (e.key === "Enter" && canConfirm) handleConfirm(); }}
              />
            </motion.div>
          )}

          {selected === "undecided" && (
            <motion.div
              key="undecided"
              initial={{ opacity: 0, height: 0, marginBottom: 0 }}
              animate={{ opacity: 1, height: "auto", marginBottom: "1.5rem" }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              style={{ overflow: "hidden" }}
            >
              <div style={{
                display: "flex", alignItems: "center", gap: "0.6rem",
                padding: "0.75rem 1rem",
                background: "rgba(16,185,129,0.07)",
                border: "1.5px solid rgba(16,185,129,0.2)",
                borderRadius: 10,
              }}>
                <span style={{ fontSize: "1rem" }}>✨</span>
                <p style={{ fontFamily: SANS, fontSize: "0.875rem", color: "#065f46", fontWeight: 500, lineHeight: 1.45 }}>
                  That's completely okay — your roadmap will start with exploration and help you find your direction.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error */}
        {error && (
          <p style={{ fontFamily: SANS, fontSize: "0.825rem", color: "#dc2626", marginBottom: "1rem", textAlign: "center" }}>
            {error}
          </p>
        )}

        {/* Confirm button */}
        <motion.button
          {...fadeUp(0.34)}
          onClick={handleConfirm}
          disabled={!canConfirm || phase === "saving"}
          whileHover={canConfirm && phase !== "saving" ? { scale: 1.02 } : {}}
          whileTap={canConfirm && phase !== "saving" ? { scale: 0.97 } : {}}
          style={{
            width: "100%", padding: "0.875rem",
            border: "none", borderRadius: 12,
            background: canConfirm
              ? `linear-gradient(135deg, ${ACCENT}, ${ACCENT2})`
              : `rgba(59,91,252,0.12)`,
            color: canConfirm ? "#ffffff" : TEXT3,
            fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700,
            cursor: canConfirm && phase !== "saving" ? "pointer" : "not-allowed",
            transition: "all 0.2s ease",
            display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
            boxShadow: canConfirm ? "0 4px 20px rgba(59,91,252,0.3)" : "none",
          }}
        >
          {phase === "saving" ? (
            <>
              <Spinner size={16} color="#ffffff" />
              Building your roadmap…
            </>
          ) : (
            "Build my roadmap →"
          )}
        </motion.button>
      </motion.div>
    </div>
  );
}
