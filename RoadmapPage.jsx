import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "./lib/supabase.js";
import RoadmapPath from "./components/roadmap/RoadmapPath.jsx";
import ConfidenceMeter from "./components/roadmap/ConfidenceMeter.jsx";
import ConfidencePanel from "./components/roadmap/ConfidencePanel.jsx";
import ModeSwitchModal from "./components/roadmap/ModeSwitchModal.jsx";
import PhaseCompleteModal from "./components/roadmap/PhaseCompleteModal.jsx";
import StickyWeekBar from "./components/roadmap/StickyWeekBar.jsx";

// ─── Background: Mountain Scene ───────────────────────────────────────────────
const MOUNTAIN_LAYERS = [
  {
    opacity: 0.2,
    color: "#312e81",
    points: "0,100 8,72 16,80 24,65 32,75 42,58 52,68 60,55 70,62 80,50 88,58 96,46 100,52 100,100",
  },
  {
    opacity: 0.3,
    color: "#4338ca",
    points: "0,100 5,78 12,85 20,70 30,80 38,63 48,72 57,60 65,68 73,55 82,63 90,52 100,58 100,100",
  },
  {
    opacity: 0.4,
    color: "#4f46e5",
    points: "0,100 6,82 14,88 22,75 32,84 40,68 50,76 59,65 68,72 76,60 85,68 93,57 100,62 100,100",
  },
  {
    opacity: 0.5,
    color: "#6366f1",
    points: "0,100 4,87 10,92 18,80 28,88 36,73 46,80 55,70 63,77 72,65 80,73 88,63 96,68 100,72 100,100",
  },
  {
    opacity: 0.6,
    color: "#818cf8",
    points: "0,100 3,90 9,94 16,84 24,90 32,77 42,84 50,75 58,80 66,70 74,76 82,67 90,73 97,68 100,74 100,100",
  },
];

const STARS = [
  { id: 0, top: "5%", left: "12%" },
  { id: 1, top: "8%", left: "28%" },
  { id: 2, top: "3%", left: "48%" },
  { id: 3, top: "11%", left: "63%" },
  { id: 4, top: "6%", left: "78%" },
  { id: 5, top: "15%", left: "90%" },
  { id: 6, top: "20%", left: "5%" },
  { id: 7, top: "18%", left: "38%" },
  { id: 8, top: "25%", left: "55%" },
  { id: 9, top: "22%", left: "82%" },
];

function MountainBackground() {
  return (
    <div style={{
      position: "fixed",
      inset: 0,
      zIndex: 0,
      pointerEvents: "none",
      background: "linear-gradient(180deg, #1e1b4b 0%, #312e81 25%, #6366f1 50%, #c7d2fe 70%, #f8fafc 100%)",
    }}>
      {/* Stars */}
      {STARS.map((star) => (
        <motion.div
          key={star.id}
          animate={{ opacity: [0.4, 1, 0.4], scale: [1, 1.3, 1] }}
          transition={{
            duration: 2 + (star.id % 3),
            repeat: Infinity,
            delay: star.id * 0.25,
            ease: "easeInOut",
          }}
          style={{
            position: "absolute",
            top: star.top,
            left: star.left,
            width: 3,
            height: 3,
            borderRadius: "50%",
            background: "white",
            boxShadow: "0 0 4px rgba(255,255,255,0.8)",
          }}
        />
      ))}

      {/* Mountain SVG layers */}
      <div style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: "25vh",
      }}>
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{ width: "100%", height: "100%", display: "block" }}
        >
          {MOUNTAIN_LAYERS.map((layer, i) => (
            <polygon
              key={i}
              points={layer.points}
              fill={layer.color}
              opacity={layer.opacity}
            />
          ))}
        </svg>
      </div>
    </div>
  );
}

// ─── Spinner ──────────────────────────────────────────────────────────────────
function Spinner({ size = 20, color = "white" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={{ animation: "rmp-spin 0.75s linear infinite", flexShrink: 0 }}
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

// ─── TopBar ───────────────────────────────────────────────────────────────────
function TopBar({ roadmap, onModeClick, onConfidenceClick }) {
  const mode = roadmap?.mode || "discovery";
  const modeLabel = mode === "career" ? "Career Mode" : "Discovery Mode";
  const modeColor = mode === "career" ? "#6366f1" : "#3b82f6";

  return (
    <div style={{
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      height: "64px",
      background: "rgba(248,250,252,0.95)",
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",
      borderBottom: "1px solid rgba(0,0,0,0.06)",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 1.25rem",
      zIndex: 50,
    }}>
      {/* Left: wordmark */}
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          fontWeight: 800,
          fontSize: "1.05rem",
          color: "#4f46e5",
          letterSpacing: "-0.03em",
        }}>
          mentorable
        </span>
        <span style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: "#6366f1",
          display: "inline-block",
          boxShadow: "0 0 6px rgba(99,102,241,0.7)",
          flexShrink: 0,
          marginBottom: 2,
        }} />
      </div>

      {/* Center: mode badge */}
      <button
        onClick={onModeClick}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.35rem",
          padding: "0.3rem 0.8rem",
          borderRadius: "9999px",
          border: `1.5px solid ${modeColor}40`,
          background: `${modeColor}10`,
          cursor: "pointer",
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          fontWeight: 700,
          fontSize: "0.78rem",
          color: modeColor,
          outline: "none",
          transition: "background 0.2s",
          position: "absolute",
          left: "50%",
          transform: "translateX(-50%)",
        }}
      >
        {mode === "career" ? (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        ) : (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
          </svg>
        )}
        {modeLabel}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Right: confidence meter — discovery mode only */}
      {roadmap && roadmap.mode !== "career" && (
        <ConfidenceMeter
          score={roadmap.confidence_score ?? 0}
          onClick={onConfidenceClick}
        />
      )}
    </div>
  );
}

// ─── Loading Screen ───────────────────────────────────────────────────────────
function LoadingScreen({ slow }) {
  return (
    <div style={{
      position: "fixed",
      inset: 0,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 10,
    }}>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "1rem",
          background: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          borderRadius: "1.25rem",
          padding: "2rem 2.5rem",
          boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
          border: "1px solid rgba(255,255,255,0.8)",
          maxWidth: "320px",
          textAlign: "center",
        }}
      >
        <Spinner size={28} color="#6366f1" />
        <AnimatePresence mode="wait">
          <motion.p
            key={slow ? "slow" : "normal"}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontWeight: 600,
              fontSize: "0.9rem",
              color: "#374151",
              margin: 0,
            }}
          >
            {slow
              ? "Generating your first set of tasks..."
              : "Building your personalized roadmap..."}
          </motion.p>
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

// ─── Error Screen ─────────────────────────────────────────────────────────────
function ErrorScreen({ message }) {
  return (
    <div style={{
      position: "fixed",
      inset: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "1rem",
      zIndex: 10,
    }}>
      <div style={{
        background: "rgba(255,255,255,0.95)",
        borderRadius: "1.25rem",
        padding: "2rem",
        maxWidth: "360px",
        textAlign: "center",
        boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
        border: "1.5px solid rgba(239,68,68,0.2)",
      }}>
        <div style={{ width: 52, height: 52, borderRadius: "50%", background: "rgba(239,68,68,0.08)", border: "1.5px solid rgba(239,68,68,0.25)", display: "grid", placeItems: "center", margin: "0 auto 1rem" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        </div>
        <p style={{
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          fontWeight: 700,
          color: "#dc2626",
          marginBottom: "0.5rem",
          fontSize: "0.95rem",
        }}>
          {message || "Something went wrong"}
        </p>
        <p style={{ fontSize: "0.82rem", color: "#64748b", marginBottom: "1.25rem" }}>
          We couldn't load your roadmap.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: "0.625rem 1.25rem",
            borderRadius: "0.75rem",
            border: "none",
            background: "#6366f1",
            color: "white",
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontWeight: 700,
            fontSize: "0.875rem",
            cursor: "pointer",
          }}
        >
          Refresh
        </button>
      </div>
    </div>
  );
}

// ─── RoadmapPage ──────────────────────────────────────────────────────────────
const STORAGE_KEY_LAST_TASK = "mentorable_roadmap_last_task";

export default function RoadmapPage({ navigate }) {
  const [user, setUser] = useState(null);
  const [roadmap, setRoadmap] = useState(null);
  const [phases, setPhases] = useState([]);
  const [confidenceHistory, setConfidenceHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingSlow, setLoadingSlow] = useState(false);
  const [error, setError] = useState(null);

  const [showConfidencePanel, setShowConfidencePanel] = useState(false);
  const [showModeModal, setShowModeModal] = useState(false);
  const [showPhaseCompleteModal, setShowPhaseCompleteModal] = useState(false);
  const [completedPhaseData, setCompletedPhaseData] = useState(null);
  const [generatingNextPhase, setGeneratingNextPhase] = useState(false);
  const [stickyVisible, setStickyVisible] = useState(false);

  const currentWeekRef = useRef(null);
  const slowTimer = useRef(null);
  const initRan = useRef(false); // guard against React StrictMode double-init

  // ── Slow-loading message timer ──────────────────────────────────────────────
  useEffect(() => {
    slowTimer.current = setTimeout(() => setLoadingSlow(true), 3000);
    return () => clearTimeout(slowTimer.current);
  }, []);

  // ── Scroll → sticky bar ─────────────────────────────────────────────────────
  useEffect(() => {
    const handleScroll = () => {
      setStickyVisible(window.scrollY > 200);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // ── Scroll to current week ──────────────────────────────────────────────────
  const scrollToCurrent = useCallback(() => {
    if (currentWeekRef.current) {
      currentWeekRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  // ── Load data ────────────────────────────────────────────────────────────────
  const loadPhases = useCallback(async (roadmapId) => {
    const { data, error } = await supabase
      .from("roadmap_phases")
      .select("*, tasks:roadmap_tasks(*)")
      .eq("roadmap_id", roadmapId)
      .order("phase_number", { ascending: true });
    if (error) throw error;
    return data || [];
  }, []);

  useEffect(() => {
    if (initRan.current) return; // prevent React StrictMode double-init
    initRan.current = true;

    const init = async () => {
      try {
        // Auth check
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) { window.location.href = "/auth"; return; }
        setUser(authUser);

        // Profile check — use maybeSingle to avoid 406 when profile row doesn't exist yet
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("onboarding_completed, grade_level")
          .eq("id", authUser.id)
          .maybeSingle();

        console.log("[roadmap] profile check:", { profile, profileError });

        if (!profile) { window.location.href = "/onboarding"; return; }
        if (!profile.onboarding_completed) { window.location.href = "/onboarding"; return; }
        if (!profile.grade_level) { window.location.href = "/profile-setup"; return; }

        // Load existing active roadmap (use limit+order to avoid 406 on multiple rows)
        const { data: roadmapRows } = await supabase
          .from("roadmaps")
          .select("*")
          .eq("user_id", authUser.id)
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(1);
        let existingRoadmap = roadmapRows?.[0] || null;

        // If no roadmap exists, initialize one
        // initialize-roadmap handles phase 1 generation internally — do NOT call generate-phase here
        if (!existingRoadmap) {
          setLoadingSlow(true);
          const { data: invokeData, error: invokeError } = await supabase.functions.invoke(
            "initialize-roadmap",
            { body: { userId: authUser.id, startingMode: "discovery" } }
          );

          if (invokeError) {
            let detail = invokeError.message;
            try { detail = invokeData?.error || invokeData?.details || invokeError.message; } catch {}
            throw new Error(`initialize-roadmap failed: ${detail}`);
          }
          if (invokeData?.error) {
            throw new Error(`initialize-roadmap: ${invokeData.error} — ${invokeData.details || ""}`);
          }

          // Use roadmap from invoke response
          existingRoadmap = invokeData?.roadmap || null;

          // Fallback: re-query
          if (!existingRoadmap) {
            const { data: fallbackRows } = await supabase
              .from("roadmaps")
              .select("*")
              .eq("user_id", authUser.id)
              .eq("is_active", true)
              .order("created_at", { ascending: false })
              .limit(1);
            existingRoadmap = fallbackRows?.[0] || null;
          }
        }

        if (!existingRoadmap) {
          setError("Could not create your roadmap. Please try again.");
          setLoading(false);
          return;
        }

        setRoadmap(existingRoadmap);

        // Load phases + tasks
        let phasesData = await loadPhases(existingRoadmap.id);
        // Sync phase status if all tasks completed (e.g. user completed last task on task detail page)
        for (const ph of phasesData || []) {
          if (ph.status !== "active") continue;
          const tasks = ph.tasks || [];
          if (tasks.length === 0) continue;
          const allDone = tasks.every((t) => t.status === "completed" || t.status === "skipped");
          if (allDone) {
            await supabase.from("roadmap_phases").update({ status: "completed" }).eq("id", ph.id);
            phasesData = phasesData.map((p) => (p.id === ph.id ? { ...p, status: "completed" } : p));
          }
        }
        setPhases(phasesData);

        // Load confidence history (last 5)
        const { data: historyData } = await supabase
          .from("confidence_history")
          .select("*")
          .eq("roadmap_id", existingRoadmap.id)
          .order("created_at", { ascending: false })
          .limit(5);
        setConfidenceHistory(historyData || []);

        setLoading(false);
      } catch (err) {
        console.error("RoadmapPage load error:", err);
        setError(err?.message || "Failed to load roadmap");
        setLoading(false);
      }
    };

    init();
  }, [loadPhases]);

  // ── Scroll to last viewed task when returning from task detail ─────────────────
  useEffect(() => {
    if (loading || !phases?.length) return;
    const taskId = sessionStorage.getItem(STORAGE_KEY_LAST_TASK);
    if (!taskId) return;
    sessionStorage.removeItem(STORAGE_KEY_LAST_TASK);
    const el = document.querySelector(`[data-task-id="${taskId}"]`);
    if (el) {
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }
  }, [loading, phases?.length]);

  // ── Task: complete ───────────────────────────────────────────────────────────
  const completeTask = useCallback(async (taskId, phaseId) => {
    // Optimistic update
    setPhases((prev) =>
      prev.map((ph) =>
        ph.id === phaseId
          ? {
              ...ph,
              tasks: ph.tasks.map((t) =>
                t.id === taskId
                  ? { ...t, status: "completed", completed_at: new Date().toISOString() }
                  : t
              ),
            }
          : ph
      )
    );

    await supabase
      .from("roadmap_tasks")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", taskId);

    // Update confidence +3
    const prevScore = roadmap?.confidence_score ?? 0;
    const newScore = Math.min(100, Math.max(0, prevScore + 3));

    await supabase
      .from("roadmaps")
      .update({ confidence_score: newScore })
      .eq("id", roadmap.id);

    await supabase.from("confidence_history").insert({
      roadmap_id: roadmap.id,
      user_id: user.id,
      previous_score: prevScore,
      new_score: newScore,
      delta: 3,
      reason: "You completed a task — great momentum!",
      trigger: "task_completed",
    });

    setRoadmap((prev) => ({ ...prev, confidence_score: newScore }));
    setConfidenceHistory((prev) => [
      {
        id: Date.now(),
        roadmap_id: roadmap.id,
        user_id: user.id,
        previous_score: prevScore,
        new_score: newScore,
        delta: 3,
        reason: "You completed a task — great momentum!",
        trigger: "task_completed",
        created_at: new Date().toISOString(),
      },
      ...prev,
    ].slice(0, 5));

    // Check phase completion (use latest phases state)
    setPhases((currentPhases) => {
      const phase = currentPhases.find((p) => p.id === phaseId);
      if (phase) {
        const updatedTasks = phase.tasks.map((t) =>
          t.id === taskId ? { ...t, status: "completed" } : t
        );
        const allDone = updatedTasks.every(
          (t) => t.status === "completed" || t.status === "skipped"
        );
        if (allDone) {
          setShowPhaseCompleteModal(true);
          setCompletedPhaseData({ ...phase, tasks: updatedTasks });
          supabase
            .from("roadmap_phases")
            .update({ status: "completed" })
            .eq("id", phaseId);
        }
      }
      return currentPhases;
    });
  }, [roadmap, user]);

  // ── Task: flag not for me ────────────────────────────────────────────────────
  const flagNotForMe = useCallback(async (taskId, phaseId) => {
    setPhases((prev) =>
      prev.map((ph) =>
        ph.id === phaseId
          ? {
              ...ph,
              tasks: ph.tasks.map((t) =>
                t.id === taskId ? { ...t, not_for_me: true, status: "skipped" } : t
              ),
            }
          : ph
      )
    );

    await supabase
      .from("roadmap_tasks")
      .update({ not_for_me: true, status: "skipped" })
      .eq("id", taskId);

    const prevScore = roadmap?.confidence_score ?? 0;
    const newScore = Math.min(100, Math.max(0, prevScore - 4));

    await supabase
      .from("roadmaps")
      .update({ confidence_score: newScore })
      .eq("id", roadmap.id);

    await supabase.from("confidence_history").insert({
      roadmap_id: roadmap.id,
      user_id: user.id,
      previous_score: prevScore,
      new_score: newScore,
      delta: -4,
      reason: "You flagged a task as not for you — that's useful information.",
      trigger: "task_flagged_not_for_me",
    });

    setRoadmap((prev) => ({ ...prev, confidence_score: newScore }));
    setConfidenceHistory((prev) => [
      {
        id: Date.now(),
        roadmap_id: roadmap.id,
        user_id: user.id,
        previous_score: prevScore,
        new_score: newScore,
        delta: -4,
        reason: "You flagged a task as not for you — that's useful information.",
        trigger: "task_flagged_not_for_me",
        created_at: new Date().toISOString(),
      },
      ...prev,
    ].slice(0, 5));
  }, [roadmap, user]);

  // ── Generate next phase ──────────────────────────────────────────────────────
  const generateNextPhase = useCallback(async () => {
    setShowPhaseCompleteModal(false);
    setGeneratingNextPhase(true);

    const nextPhaseNumber = (roadmap?.current_phase_number || 1) + 1;

    try {
      await supabase.functions.invoke("generate-phase", {
        body: {
          userId: user.id,
          roadmapId: roadmap.id,
          phaseNumber: nextPhaseNumber,
        },
      });

      const newPhases = await loadPhases(roadmap.id);
      setPhases(newPhases);
    } catch (err) {
      console.error("generateNextPhase error:", err);
    } finally {
      setGeneratingNextPhase(false);
    }
  }, [roadmap, user, loadPhases]);

  // ── Mode switch ──────────────────────────────────────────────────────────────
  const handleModeSwitch = useCallback(async (newMode, careerDirection, existingRoadmapId) => {
    setShowModeModal(false);
    if (!roadmap) return;

    setLoading(true);
    setLoadingSlow(true);

    try {
      // Deactivate the current roadmap
      await supabase
        .from("roadmaps")
        .update({ is_active: false })
        .eq("id", roadmap.id);

      if (existingRoadmapId) {
        // User chose to continue an existing roadmap (career or discovery)
        await supabase
          .from("roadmaps")
          .update({ is_active: true })
          .eq("id", existingRoadmapId);
      } else if (newMode === "discovery") {
        // Find the most recent saved discovery roadmap (excluding the one we just deactivated)
        const { data: prevDiscovery } = await supabase
          .from("roadmaps")
          .select("*")
          .eq("user_id", user.id)
          .eq("mode", "discovery")
          .neq("id", roadmap.id)
          .order("created_at", { ascending: false })
          .limit(1);

        if (prevDiscovery?.length > 0) {
          await supabase
            .from("roadmaps")
            .update({ is_active: true })
            .eq("id", prevDiscovery[0].id);
        } else {
          // No previous discovery roadmap — create fresh via initialize-roadmap
          await supabase.functions.invoke("initialize-roadmap", {
            body: { userId: user.id, startingMode: "discovery" }
          });
        }
      } else {
        // Career mode — create a brand new career roadmap
        const { data: newRoadmap, error: insertError } = await supabase
          .from("roadmaps")
          .insert({
            user_id: user.id,
            mode: "career",
            career_direction: careerDirection,
            current_phase_number: 1,
            confidence_score: 50,
            is_active: true,
          })
          .select()
          .single();

        if (insertError) throw insertError;

        // Generate phase 1 — await fully before continuing
        await supabase.functions.invoke("generate-phase", {
          body: { userId: user.id, roadmapId: newRoadmap.id, phaseNumber: 1 }
        });
      }

      // Full page reload — initRan ref resets on new page load
      window.location.reload();
    } catch (err) {
      console.error("Mode switch failed:", err);
      setLoading(false);
      setError("Failed to switch mode: " + (err?.message || "unknown error"));
    }
  }, [roadmap, user]);

  // ── Sticky bar data ──────────────────────────────────────────────────────────
  const activePhase = phases.find((p) => p.status === "active");
  const currentWeek = activePhase
    ? (() => {
        const incompleteTasks = (activePhase.tasks || []).filter(
          (t) => t.status !== "completed" && t.status !== "skipped"
        );
        if (incompleteTasks.length === 0) return null;
        return Math.min(...incompleteTasks.map((t) => t.week_number || 1));
      })()
    : null;

  const stickyTasks = activePhase && currentWeek
    ? (activePhase.tasks || []).filter((t) => t.week_number === currentWeek)
    : [];

  // Confidence delta for phase complete modal
  const phaseCompleteDelta = completedPhaseData
    ? (completedPhaseData.tasks || []).filter((t) => t.status === "completed").length * 3
    : 0;

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: "100vh",
      fontFamily: "system-ui, sans-serif",
      position: "relative",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes rmp-spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* Background */}
      <MountainBackground />

      {/* Content sits above background */}
      <div style={{ position: "relative", zIndex: 1 }}>
        {/* TopBar */}
        {!loading && !error && (
          <TopBar
            roadmap={roadmap}
            onModeClick={() => setShowModeModal(true)}
            onConfidenceClick={() => setShowConfidencePanel(true)}
          />
        )}

        {/* Loading */}
        {loading && <LoadingScreen slow={loadingSlow} />}

        {/* Error */}
        {!loading && error && <ErrorScreen message={error} />}

        {/* Main content */}
        {!loading && !error && roadmap && (
          <main style={{
            paddingTop: "64px",
            minHeight: "100vh",
          }}>
            {/* Sky-to-surface transition area */}
            <div style={{
              height: "clamp(60px, 10vw, 120px)",
              background: "transparent",
            }} />

            {/* Content card area — white/light bg starts here */}
            <div style={{
              background: "linear-gradient(180deg, transparent 0%, #f8fafc 80px)",
              minHeight: "60vh",
            }}>
              <div style={{
                maxWidth: "680px",
                margin: "0 auto",
                padding: "0 1rem 3rem",
              }}>
                {/* Career direction header (career mode only) */}
                {roadmap.mode === "career" && roadmap.career_direction && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{
                      marginBottom: "1.5rem",
                      padding: "1rem 1.25rem",
                      background: "rgba(99,102,241,0.06)",
                      border: "1.5px solid rgba(99,102,241,0.2)",
                      borderRadius: "1rem",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
                    <div>
                      <p style={{
                        fontSize: "0.7rem",
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        color: "#6366f1",
                        marginBottom: "0.2rem",
                      }}>
                        Career Direction
                      </p>
                      <p style={{
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                        fontWeight: 700,
                        fontSize: "0.95rem",
                        color: "#0f172a",
                      }}>
                        {roadmap.career_direction}
                      </p>
                    </div>
                  </motion.div>
                )}

                {/* Roadmap path */}
                <RoadmapPath
                  roadmap={roadmap}
                  phases={phases}
                  onTaskComplete={completeTask}
                  onTaskFlagNotForMe={flagNotForMe}
                  onPhaseComplete={() => {}}
                  generatingNextPhase={generatingNextPhase}
                  navigate={navigate}
                />
              </div>
            </div>
          </main>
        )}
      </div>

      {/* ── Modals & Panels ── */}

      {/* Confidence Panel */}
      <AnimatePresence>
        {showConfidencePanel && (
          <ConfidencePanel
            score={roadmap?.confidence_score ?? 0}
            history={confidenceHistory}
            onClose={() => setShowConfidencePanel(false)}
          />
        )}
      </AnimatePresence>

      {/* Mode Switch Modal */}
      <AnimatePresence>
        {showModeModal && (
          <ModeSwitchModal
            currentMode={roadmap?.mode || "discovery"}
            userId={user?.id}
            onConfirm={handleModeSwitch}
            onCancel={() => setShowModeModal(false)}
          />
        )}
      </AnimatePresence>

      {/* Phase Complete Modal */}
      <AnimatePresence>
        {showPhaseCompleteModal && completedPhaseData && (
          <PhaseCompleteModal
            phase={completedPhaseData}
            confidenceScore={roadmap?.confidence_score ?? 0}
            confidenceDelta={phaseCompleteDelta}
            confidenceReason="Phase complete — you're making real progress."
            onGenerateNext={generateNextPhase}
          />
        )}
      </AnimatePresence>

      {/* Sticky Week Bar */}
      <AnimatePresence>
        {stickyVisible && !loading && activePhase && currentWeek && (
          <StickyWeekBar
            phase={activePhase}
            currentWeek={currentWeek}
            tasks={stickyTasks}
            onScrollToCurrent={scrollToCurrent}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
