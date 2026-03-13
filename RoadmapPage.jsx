import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "./lib/supabase.js";
import PhaseSection  from "./components/roadmap/PhaseSection.jsx";
import SkillGapRadar from "./components/roadmap/SkillGapRadar.jsx";
import MarketContext  from "./components/roadmap/MarketContext.jsx";

// ─── Static assets ────────────────────────────────────────────────────────────

const STARS = Array.from({ length: 26 }, (_, i) => ({
  id:      i,
  x:       (i * 137.508) % 100,
  y:       (i * 61.803)  % 52,
  size:    i % 5 === 0 ? 2.2 : 1.3,
  opacity: 0.35 + (i % 4) * 0.14,
  dur:     2.2 + (i % 7) * 0.35,
  delay:   (i % 9) * 0.28,
}));

const FALLBACK_COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981"];

const LOAD_MSGS = [
  "Analyzing your profile…",
  "Matching O*NET career data…",
  "Building your roadmap…",
  "Almost ready…",
];

// ─── RoadmapPage ──────────────────────────────────────────────────────────────

export default function RoadmapPage() {
  const [profile,         setProfile]         = useState(null);
  const [careerMatches,   setCareerMatches]    = useState([]);
  const [activeIdx,       setActiveIdx]        = useState(0);
  const [roadmap,         setRoadmap]          = useState(null);
  const [loading,         setLoading]          = useState(true);
  const [loadMsgIdx,      setLoadMsgIdx]       = useState(0);
  const [generatingIdx,   setGeneratingIdx]    = useState(null);
  const [savingMilestone, setSavingMilestone]  = useState(false);
  const [errorMsg,        setErrorMsg]         = useState(null);

  const userRef = useRef(null);

  // ── Auth + initial load ──────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/auth"; return; }
      userRef.current = user;

      const { data: prof } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (!prof?.onboarding_completed) { window.location.href = "/onboarding"; return; }
      if (!prof?.grade_level)          { window.location.href = "/profile-setup"; return; }

      setProfile(prof);
      const matches = prof.career_matches ?? [];
      setCareerMatches(matches);

      if (matches.length > 0) {
        await loadOrGenerate(user.id, matches[0], 0);
      } else {
        setLoading(false);
      }
    };
    init();
  }, []);

  // ── Loading message rotation ─────────────────────────────────────────────
  useEffect(() => {
    if (!loading) return;
    const iv = setInterval(() => setLoadMsgIdx(i => (i + 1) % LOAD_MSGS.length), 3500);
    return () => clearInterval(iv);
  }, [loading]);

  // ── Load or generate roadmap ─────────────────────────────────────────────
  const loadOrGenerate = async (userId, careerTitle, idx) => {
    setLoading(true);
    setGeneratingIdx(idx);

    const { data: existing } = await supabase
      .from("career_roadmaps")
      .select("*")
      .eq("user_id", userId)
      .eq("career_title", careerTitle)
      .eq("is_active", true)
      .single();

    if (existing?.roadmap_data) {
      setRoadmap(existing.roadmap_data);
      setActiveIdx(idx);
      setLoading(false);
      setGeneratingIdx(null);
      return;
    }

    try {
      console.log("[generate-roadmap] invoking with userId:", userId, "careerIndex:", idx);
      const { data, error } = await supabase.functions.invoke("generate-roadmap", {
        body: { userId, careerIndex: idx },
      });
      if (error) {
        // Try to read the actual JSON body from the failed response
        let detail = error.message;
        try {
          const body = await error.context?.json();
          console.error("[generate-roadmap] error body:", body);
          detail = body?.details || body?.dbError || body?.error || error.message;
        } catch {}
        throw new Error(detail);
      }
      if (!data?.roadmap) throw new Error("Edge function returned no roadmap data");
      setRoadmap(data.roadmap);
      setErrorMsg(null);
    } catch (err) {
      console.error("Roadmap generation failed:", err);
      setErrorMsg(err.message);
      setRoadmap(null);
    }

    setActiveIdx(idx);
    setLoading(false);
    setGeneratingIdx(null);
  };

  const handleTabClick = async (idx) => {
    if (idx === activeIdx || generatingIdx !== null) return;
    const uid = userRef.current?.id;
    if (!uid) return;
    await loadOrGenerate(uid, careerMatches[idx], idx);
  };

  // ── Milestone toggle ─────────────────────────────────────────────────────
  const toggleMilestone = async (phaseId, milestoneId) => {
    if (!userRef.current || savingMilestone || !roadmap) return;

    const updated = {
      ...roadmap,
      phases: roadmap.phases.map(phase =>
        phase.id !== phaseId ? phase : {
          ...phase,
          milestones: phase.milestones.map(m =>
            m.id !== milestoneId ? m : {
              ...m,
              status: m.status === "completed" ? "not_started" : "completed",
            }
          ),
        }
      ),
    };

    setRoadmap(updated);

    setSavingMilestone(true);
    try {
      await supabase
        .from("career_roadmaps")
        .update({ roadmap_data: updated })
        .eq("user_id", userRef.current.id)
        .eq("career_title", careerMatches[activeIdx])
        .eq("is_active", true);
    } catch (err) {
      console.error("Milestone save failed:", err);
    }
    setSavingMilestone(false);
  };

  const getPhaseStatus = (phase) => {
    if (!phase.milestones?.length) return phase.status;
    return phase.milestones.every(m => m.status === "completed") ? "completed" : phase.status;
  };

  const scrollToPhase = (phaseId) => {
    document.getElementById(`phase-${phaseId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const meta     = roadmap?.roadmapMeta;
  const phases   = roadmap?.phases ?? [];
  const skillGap = roadmap?.skillGapAnalysis;
  const market   = roadmap?.marketContext;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(180deg, #1e1b4b 0%, #312e81 20%, #6366f1 45%, #a5b4fc 65%, #fef3c7 82%, #fde68a 100%)",
      backgroundAttachment: "fixed",
      fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
      position: "relative",
      overflowX: "hidden",
    }}>

      {/* Stars */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }}>
        {STARS.map(s => (
          <motion.div
            key={s.id}
            animate={{ opacity: [s.opacity, s.opacity * 0.3, s.opacity] }}
            transition={{ duration: s.dur, repeat: Infinity, delay: s.delay, ease: "easeInOut" }}
            style={{
              position: "absolute", left: `${s.x}%`, top: `${s.y}%`,
              width: s.size, height: s.size, borderRadius: "50%", background: "white",
            }}
          />
        ))}
      </div>

      {/* Moon */}
      <div style={{
        position: "fixed", top: 36, right: 72,
        width: 58, height: 58, borderRadius: "50%",
        background: "white", filter: "blur(2px)", opacity: 0.88,
        zIndex: 0, pointerEvents: "none",
      }} />

      {/* Mountain silhouettes */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, height: "40vh", pointerEvents: "none", zIndex: 1 }}>
        <svg viewBox="0 0 1440 300" preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
          <path d="M0,300 L0,220 L120,158 L240,198 L360,138 L480,168 L600,108 L720,148 L840,118 L960,158 L1080,128 L1200,153 L1320,118 L1440,138 L1440,300Z"
            fill="#4c1d95" opacity="0.4" />
          <path d="M0,300 L0,240 L180,173 L300,213 L420,153 L540,193 L660,143 L780,183 L900,148 L1020,188 L1140,153 L1260,183 L1380,153 L1440,168 L1440,300Z"
            fill="#5b21b6" opacity="0.6" />
          <path d="M0,300 L0,258 L150,198 L270,238 L390,183 L510,223 L630,173 L750,213 L870,178 L990,218 L1110,183 L1230,213 L1350,183 L1440,198 L1440,300Z"
            fill="#4338ca" opacity="0.8" />
          <path d="M0,300 L0,273 L120,228 L240,263 L360,218 L480,253 L600,208 L720,248 L840,213 L960,248 L1080,218 L1200,246 L1320,218 L1440,233 L1440,300Z"
            fill="#312e81" opacity="0.95" />
          <path d="M0,300 L0,283 L100,253 L200,278 L300,248 L400,273 L500,246 L600,268 L700,243 L800,266 L900,246 L1000,266 L1100,246 L1200,263 L1300,248 L1400,260 L1440,253 L1440,300Z"
            fill="#1e1b4b" />
        </svg>
      </div>

      {/* ── Scrollable content ── */}
      <div style={{
        position: "relative", zIndex: 10,
        maxWidth: 900, margin: "0 auto",
        padding: "2rem 1.25rem 220px",
      }}>
        <AnimatePresence mode="wait">
          {loading ? (
            <LoadingState key="loading" msg={LOAD_MSGS[loadMsgIdx]} />
          ) : !roadmap ? (
            <ErrorState key="error" msg={errorMsg} />
          ) : (
            <motion.div
              key="content"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4 }}
            >
              <CareerTabs
                careers={careerMatches}
                activeIdx={activeIdx}
                generatingIdx={generatingIdx}
                onSelect={handleTabClick}
                activePhaseColor={phases.find(p => p.status === "active")?.color ?? FALLBACK_COLORS[0]}
              />

              {meta && <HeroCard meta={meta} market={market} />}

              {phases.length > 0 && (
                <PhaseProgressBar
                  phases={phases}
                  getPhaseStatus={getPhaseStatus}
                  onPhaseClick={scrollToPhase}
                />
              )}

              <div style={{ marginBottom: "2rem" }}>
                {phases.map((phase, i) => (
                  <PhaseSection
                    key={phase.id}
                    phase={phase}
                    phaseIndex={i}
                    onToggleMilestone={toggleMilestone}
                  />
                ))}
              </div>

              {skillGap && <SkillGapSection skillGap={skillGap} />}

              {market && (
                <div style={{
                  background: "rgba(15,23,42,0.85)",
                  backdropFilter: "blur(20px)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 16, padding: "1.6rem",
                  marginBottom: "1.5rem",
                }}>
                  <MarketContext marketContext={market} />
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─── Loading ──────────────────────────────────────────────────────────────────

function LoadingState({ msg }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", minHeight: "65vh", gap: "1.5rem",
    }}>
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }}
        style={{
          width: 42, height: 42, borderRadius: "50%",
          border: "3px solid rgba(255,255,255,0.14)",
          borderTop: "3px solid #a5b4fc",
        }}
      />
      <AnimatePresence mode="wait">
        <motion.p
          key={msg}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3 }}
          style={{ color: "rgba(255,255,255,0.7)", fontSize: "0.975rem", fontWeight: 500, margin: 0 }}
        >
          {msg}
        </motion.p>
      </AnimatePresence>
      <p style={{ color: "rgba(255,255,255,0.32)", fontSize: "0.78rem", margin: 0 }}>
        This takes 10–15 seconds the first time
      </p>
    </div>
  );
}

// ─── Error ────────────────────────────────────────────────────────────────────

function ErrorState({ msg }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", minHeight: "60vh", gap: "1.25rem",
    }}>
      <p style={{ color: "rgba(255,255,255,0.65)", fontSize: "1rem", margin: 0 }}>
        Couldn't load your roadmap.
      </p>
      {msg && (
        <div style={{
          maxWidth: 500, padding: "0.75rem 1rem",
          background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)",
          borderRadius: 10, fontSize: "0.8rem", color: "#fca5a5",
          fontFamily: "monospace", wordBreak: "break-word", textAlign: "center",
        }}>
          {msg}
        </div>
      )}
      <button
        onClick={() => window.location.reload()}
        style={{
          padding: "0.6rem 1.5rem", background: "#6366f1", color: "white",
          border: "none", borderRadius: 8, cursor: "pointer",
          fontSize: "0.9rem", fontFamily: "inherit",
        }}
      >
        Refresh
      </button>
    </div>
  );
}

// ─── Career tabs ──────────────────────────────────────────────────────────────

function CareerTabs({ careers, activeIdx, generatingIdx, onSelect, activePhaseColor }) {
  return (
    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1.75rem" }}>
      {careers.slice(0, 3).map((career, i) => {
        const isActive = i === activeIdx;
        const isGen    = i === generatingIdx;
        return (
          <motion.button
            key={i}
            onClick={() => onSelect(i)}
            whileTap={{ scale: 0.96 }}
            style={{
              padding: "0.55rem 1.2rem",
              background: isActive ? "rgba(255,255,255,0.13)" : "rgba(255,255,255,0.06)",
              border: isActive ? "1px solid rgba(255,255,255,0.22)" : "1px solid rgba(255,255,255,0.09)",
              borderBottom: isActive ? `2px solid ${activePhaseColor}` : "2px solid transparent",
              borderRadius: 10,
              color: isActive ? "white" : "rgba(255,255,255,0.45)",
              fontWeight: isActive ? 700 : 500,
              fontSize: "0.865rem",
              cursor: "pointer",
              display: "flex", alignItems: "center", gap: "0.4rem",
              backdropFilter: "blur(10px)",
              fontFamily: "inherit",
              transition: "all 0.18s",
            }}
          >
            {isGen ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                style={{
                  width: 11, height: 11, borderRadius: "50%",
                  border: "2px solid rgba(255,255,255,0.28)",
                  borderTop: "2px solid white",
                }}
              />
            ) : isActive ? "✓ " : null}
            {career}
          </motion.button>
        );
      })}
    </div>
  );
}

// ─── Hero card ────────────────────────────────────────────────────────────────

function HeroCard({ meta, market }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      style={{
        background: "rgba(15,23,42,0.9)",
        backdropFilter: "blur(20px)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 16, padding: "1.75rem",
        marginBottom: "1.25rem",
      }}
    >
      <div style={{
        fontSize: "0.68rem", fontWeight: 700, color: "rgba(255,255,255,0.38)",
        letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "0.5rem",
      }}>
        Your Roadmap
      </div>

      <h1 style={{
        fontSize: "clamp(1.4rem, 4vw, 2.1rem)", fontWeight: 800, color: "white",
        margin: 0, lineHeight: 1.2, marginBottom: "0.4rem",
      }}>
        {meta.careerTitle ?? meta.targetRole}
      </h1>

      {meta.personalNote && (
        <p style={{
          fontSize: "0.95rem", color: "rgba(255,255,255,0.55)",
          margin: "0 0 1.2rem", fontStyle: "italic",
        }}>
          "{meta.personalNote}"
        </p>
      )}

      {/* Stats */}
      <div style={{
        display: "flex", flexWrap: "wrap", gap: "1rem",
        paddingBottom: "1.2rem",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        marginBottom: "1.2rem",
      }}>
        {[
          meta.estimatedTimeline && { icon: "⏱", value: meta.estimatedTimeline, label: "to job-ready" },
          meta.salaryAtEntry      && { icon: "💰", value: meta.salaryAtEntry,      label: "entry salary" },
          meta.jobGrowth          && { icon: "📈", value: meta.jobGrowth,          label: "job growth" },
          market?.topHiringCompanies?.length > 0 && {
            icon: "🏢",
            value: market.topHiringCompanies.slice(0, 3).join(" · "),
            label: "top employers",
          },
        ].filter(Boolean).map((stat, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.38rem" }}>
            <span>{stat.icon}</span>
            <span style={{ fontWeight: 600, color: "rgba(255,255,255,0.82)", fontSize: "0.86rem" }}>
              {stat.value}
            </span>
            <span style={{ color: "rgba(255,255,255,0.32)", fontSize: "0.78rem" }}>
              {stat.label}
            </span>
          </div>
        ))}
      </div>

      {/* Edge + risk */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: "0.75rem",
      }}>
        {meta.unfairAdvantage && (
          <InfoBox accent="rgba(16,185,129" label="✨ Your edge"      labelColor="#10b981" body={meta.unfairAdvantage} />
        )}
        {meta.biggestRisk && (
          <InfoBox accent="rgba(245,158,11" label="⚠️ Watch out for" labelColor="#f59e0b" body={meta.biggestRisk} />
        )}
      </div>
    </motion.div>
  );
}

function InfoBox({ accent, label, labelColor, body }) {
  return (
    <div style={{
      padding: "0.85rem 1rem",
      background: `${accent},0.09)`,
      border: `1px solid ${accent},0.25)`,
      borderRadius: 10,
    }}>
      <div style={{
        fontSize: "0.68rem", fontWeight: 700, color: labelColor,
        marginBottom: "0.3rem", textTransform: "uppercase", letterSpacing: "0.08em",
      }}>
        {label}
      </div>
      <p style={{ fontSize: "0.84rem", color: "rgba(255,255,255,0.72)", margin: 0, lineHeight: 1.55 }}>
        {body}
      </p>
    </div>
  );
}

// ─── Phase progress bar ───────────────────────────────────────────────────────

function PhaseProgressBar({ phases, getPhaseStatus, onPhaseClick }) {
  return (
    <div style={{
      background: "rgba(15,23,42,0.75)",
      backdropFilter: "blur(20px)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 16, padding: "1.1rem 1.5rem",
      marginBottom: "1.5rem",
    }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        {phases.map((phase, i) => {
          const status      = getPhaseStatus(phase);
          const isCompleted = status === "completed";
          const isActive    = !isCompleted && phase.status === "active";
          const color       = phase.color ?? FALLBACK_COLORS[i];

          return (
            <div key={phase.id} style={{ display: "flex", alignItems: "center", flex: i < phases.length - 1 ? 1 : "none" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.38rem" }}>
                <motion.button
                  onClick={() => onPhaseClick(phase.id)}
                  whileHover={{ scale: 1.12 }}
                  whileTap={{ scale: 0.9 }}
                  style={{
                    width: 34, height: 34, borderRadius: "50%",
                    background: isCompleted ? color : isActive ? "transparent" : "rgba(255,255,255,0.07)",
                    border: isActive ? `2px solid ${color}` : isCompleted ? "none" : "2px solid rgba(255,255,255,0.14)",
                    color: isCompleted ? "white" : isActive ? color : "rgba(255,255,255,0.22)",
                    fontWeight: 700, fontSize: "0.78rem", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    position: "relative", fontFamily: "inherit",
                  }}
                >
                  {isActive && (
                    <motion.div
                      animate={{ scale: [1, 1.45, 1], opacity: [0.5, 0, 0.5] }}
                      transition={{ duration: 2.2, repeat: Infinity }}
                      style={{
                        position: "absolute", inset: -5, borderRadius: "50%",
                        border: `1.5px solid ${color}`,
                      }}
                    />
                  )}
                  {isCompleted ? "✓" : phase.phaseNumber}
                </motion.button>
                <span style={{
                  fontSize: "0.62rem", whiteSpace: "nowrap", fontWeight: isActive ? 600 : 400,
                  color: (isActive || isCompleted) ? "rgba(255,255,255,0.65)" : "rgba(255,255,255,0.22)",
                }}>
                  {phase.name?.split(" ")[0]}
                </span>
              </div>

              {i < phases.length - 1 && (
                <div style={{
                  flex: 1, height: 2, borderRadius: 1,
                  margin: "0 0.25rem 1.2rem",
                  background: isCompleted ? color : "rgba(255,255,255,0.09)",
                }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Skill gap section ────────────────────────────────────────────────────────

function SkillGapSection({ skillGap }) {
  const { radarAxes, currentSkills, gapSkills, strengthsToLeverage } = skillGap;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.45 }}
      style={{
        background: "rgba(15,23,42,0.85)",
        backdropFilter: "blur(20px)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 16, padding: "1.6rem",
        marginBottom: "1.5rem",
      }}
    >
      <div style={{ marginBottom: "1.4rem" }}>
        <div style={{
          fontSize: "0.7rem", fontWeight: 700, color: "rgba(255,255,255,0.38)",
          textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.3rem",
        }}>
          Skill Gap Analysis
        </div>
        <h2 style={{ fontSize: "1.2rem", fontWeight: 700, color: "white", margin: 0 }}>
          Where you are vs. where you need to be
        </h2>
      </div>

      {radarAxes?.length >= 3 && (
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "2rem" }}>
          <SkillGapRadar
            radarAxes={radarAxes}
            gapSkills={gapSkills ?? []}
            currentSkills={currentSkills ?? []}
            strengthsToLeverage={strengthsToLeverage ?? []}
          />
        </div>
      )}

      {gapSkills?.length > 0 && (
        <div style={{ marginBottom: "1.4rem" }}>
          <SectionLabel>Skills to develop</SectionLabel>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(195px, 1fr))",
            gap: "0.7rem",
          }}>
            {gapSkills.map((gap, i) => (
              <div key={i} style={{
                padding: "0.85rem 1rem",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 10,
              }}>
                <div style={{ fontWeight: 600, color: "white", fontSize: "0.86rem", marginBottom: "0.35rem" }}>
                  {gap.skill}
                </div>
                <div style={{ fontSize: "0.73rem", color: "rgba(255,255,255,0.38)", marginBottom: "0.2rem" }}>
                  O*NET Importance: {gap.onetImportance}
                </div>
                {gap.addressedInPhase && (
                  <div style={{ fontSize: "0.73rem", color: "rgba(165,180,252,0.7)" }}>
                    Addressed in: {gap.addressedInPhase}
                  </div>
                )}
                {gap.timeToLearn && (
                  <div style={{ fontSize: "0.73rem", color: "rgba(255,255,255,0.32)", marginTop: "0.15rem" }}>
                    ~{gap.timeToLearn}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {strengthsToLeverage?.length > 0 && (
        <div>
          <SectionLabel>Strengths to leverage</SectionLabel>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem" }}>
            {strengthsToLeverage.map((s, i) => (
              <span key={i} style={{
                padding: "0.38rem 0.85rem",
                background: "rgba(16,185,129,0.11)",
                border: "1px solid rgba(16,185,129,0.24)",
                borderRadius: 100, fontSize: "0.8rem", color: "#10b981",
              }}>
                ✓ {s}
              </span>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: "0.7rem", fontWeight: 700, color: "rgba(255,255,255,0.38)",
      textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.65rem",
    }}>
      {children}
    </div>
  );
}
