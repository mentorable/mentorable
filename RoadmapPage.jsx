import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "./lib/supabase.js";
import Spinner from "./components/common/Spinner.jsx";
import RoadmapPath from "./components/roadmap/RoadmapPath.jsx";
import RegenerateModal from "./components/roadmap/RegenerateModal.jsx";
import PhaseCompleteModal from "./components/roadmap/PhaseCompleteModal.jsx";
import StickyWeekBar from "./components/roadmap/StickyWeekBar.jsx";
import { SIDEBAR_WIDTH } from "./components/common/Sidebar.jsx";

// ─── Background: Mountain Scene ───────────────────────────────────────────────
function PageBackground() {
  return (
    <div style={{
      position: "fixed",
      inset: 0,
      zIndex: 0,
      pointerEvents: "none",
      background: "linear-gradient(180deg, #e8f0ff 0%, #f4f8ff 25%, #f8faff 100%)",
    }} />
  );
}

// ─── Loading Screen ───────────────────────────────────────────────────────────
function LoadingScreen({ slow, generating }) {
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
        <Spinner size={28} color="#1d4ed8" />
        <AnimatePresence mode="wait">
          <motion.p
            key={slow ? "slow" : "normal"}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 600,
              fontSize: "0.9rem",
              color: "#1e3a8a",
              margin: 0,
            }}
          >
            {generating
              ? "Generating your first set of tasks..."
              : "Loading your roadmap..."}
          </motion.p>
        </AnimatePresence>
        <p style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontSize: "0.78rem",
          color: "#64748b",
          margin: 0,
        }}>
          This may take a moment…
        </p>
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
        background: "#ffffff",
        borderRadius: "1.25rem",
        padding: "2rem",
        maxWidth: "360px",
        textAlign: "center",
        boxShadow: "0 4px 32px rgba(37,99,235,0.1), 0 1px 4px rgba(0,0,0,0.05)",
        border: "1.5px solid rgba(239,68,68,0.2)",
      }}>
        <div style={{ width: 52, height: 52, borderRadius: "50%", background: "rgba(239,68,68,0.06)", border: "1.5px solid rgba(239,68,68,0.2)", display: "grid", placeItems: "center", margin: "0 auto 1rem" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        </div>
        <p style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontWeight: 700,
          color: "#dc2626",
          marginBottom: "0.5rem",
          fontSize: "0.95rem",
        }}>
          {message || "Something went wrong"}
        </p>
        <p style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "0.82rem", color: "#4b5470", marginBottom: "1.25rem" }}>
          We couldn't load your roadmap.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: "0.625rem 1.25rem",
            borderRadius: "0.75rem",
            border: "none",
            background: "linear-gradient(135deg, #1d4ed8, #3b82f6)",
            color: "white",
            fontFamily: "'Space Grotesk', sans-serif",
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
  const [loading, setLoading] = useState(true);
  const [loadingSlow, setLoadingSlow] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showGenNote, setShowGenNote] = useState(false);
  const [error, setError] = useState(null);

  const [showRegenerateModal, setShowRegenerateModal] = useState(false);
  const [regeneratePhaseData, setRegeneratePhaseData] = useState(null); // { phaseId, phaseNumber, phaseTitle }

  // App.jsx dispatches this event from the persistent sidebar's Regenerate button
  useEffect(() => {
    const handler = () => { setRegeneratePhaseData(null); setShowRegenerateModal(true); };
    window.addEventListener("roadmap:openRegenerateModal", handler);
    return () => window.removeEventListener("roadmap:openRegenerateModal", handler);
  }, []);
  const [showPhaseCompleteModal, setShowPhaseCompleteModal] = useState(false);
  const [completedPhaseData, setCompletedPhaseData] = useState(null);
  const [generatingNextPhase, setGeneratingNextPhase] = useState(false);
  const [stickyVisible, setStickyVisible] = useState(false);

  const currentWeekRef = useRef(null);
  const slowTimer = useRef(null);
  const initRan = useRef(false); // guard against React StrictMode double-init
  const nextPhaseInFlight = useRef(false); // serialize auto next-phase generation
  const phaseStatusTimer = useRef(null);

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
          setIsGenerating(true);
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

        setLoading(false);
        if (isGenerating) setShowGenNote(true);
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

  // ── Task: complete (server-validated) ────────────────────────────────────────
  const completeTask = useCallback(async (taskId, phaseId) => {
    // Optimistic UI update
    setPhases((prev) =>
      prev.map((ph) =>
        ph.id === phaseId
          ? { ...ph, tasks: ph.tasks.map((t) => t.id === taskId ? { ...t, status: "completed", completed_at: new Date().toISOString() } : t) }
          : ph
      )
    );

    try {
      const { data: result, error: fnError } = await supabase.functions.invoke("complete-task", {
        body: { taskId, action: "complete" },
      });
      if (fnError) throw new Error(fnError.message);

      if (result?.phaseCompleted) {
        setPhases((currentPhases) => {
          const phase = currentPhases.find((p) => p.id === phaseId);
          if (!phase) return currentPhases;
          const updatedTasks = phase.tasks.map((t) => t.id === taskId ? { ...t, status: "completed" } : t);
          setShowPhaseCompleteModal(true);
          setCompletedPhaseData({ ...phase, tasks: updatedTasks, status: "completed" });
          return currentPhases.map((p) => p.id === phaseId ? { ...p, status: "completed", tasks: updatedTasks } : p);
        });
      }
    } catch (err) {
      console.error("[RoadmapPage] completeTask error:", err);
      // Revert optimistic update on failure
      setPhases((prev) =>
        prev.map((ph) =>
          ph.id === phaseId
            ? { ...ph, tasks: ph.tasks.map((t) => t.id === taskId ? { ...t, status: "not_started", completed_at: null } : t) }
            : ph
        )
      );
    }
  }, [roadmap, user]);

  // ── Task: flag not for me (server-validated) ─────────────────────────────────
  const flagNotForMe = useCallback(async (taskId, phaseId) => {
    setPhases((prev) =>
      prev.map((ph) => {
        if (ph.id !== phaseId) return ph;
        const updatedTasks = ph.tasks.map((t) => t.id === taskId ? { ...t, not_for_me: true, status: "skipped" } : t);
        const allDone = updatedTasks.every((t) => t.status === "completed" || t.status === "skipped");
        if (allDone && ph.status !== "completed") {
          setShowPhaseCompleteModal(true);
          setCompletedPhaseData({ ...ph, tasks: updatedTasks, status: "completed" });
          return { ...ph, tasks: updatedTasks, status: "completed" };
        }
        return { ...ph, tasks: updatedTasks };
      })
    );

    try {
      const { error: fnError } = await supabase.functions.invoke("complete-task", {
        body: { taskId, action: "flag" },
      });
      if (fnError) throw new Error(fnError.message);
    } catch (err) {
      console.error("[RoadmapPage] flagNotForMe error:", err);
    }
  }, [roadmap, user]);

  // ── Ensure next phase is generated (idempotent; safe to call repeatedly) ─────
  // Triggers when the latest phase is completed and there's no active phase.
  // The Edge Function itself is idempotent (returns existing phase if already
  // created), so duplicate calls are harmless — the in-flight ref just avoids
  // wasted work.
  const ensureNextPhase = useCallback(async (phasesList) => {
    if (!roadmap || !user) return;
    if (nextPhaseInFlight.current) return;

    const list = phasesList || [];
    if (!list.length) return;

    const sorted = [...list].sort(
      (a, b) => (a.phase_number || 0) - (b.phase_number || 0)
    );
    const latest = sorted[sorted.length - 1];
    const hasActive = sorted.some((p) => p.status === "active");

    if (hasActive) return;
    if (!latest || latest.status !== "completed") return;

    const targetPhaseNumber = (latest.phase_number || 0) + 1;

    nextPhaseInFlight.current = true;
    setGeneratingNextPhase(true);

    try {
      await supabase.functions.invoke("generate-phase", {
        body: { userId: user.id, roadmapId: roadmap.id, phaseNumber: targetPhaseNumber },
      });

      const newPhases = await loadPhases(roadmap.id);
      setPhases(newPhases);

      const { data: refreshedRoadmap } = await supabase
        .from("roadmaps").select("*").eq("id", roadmap.id).single();
      if (refreshedRoadmap) setRoadmap(refreshedRoadmap);
    } catch (err) {
      console.error("[RoadmapPage] ensureNextPhase error:", err);
      setError("Failed to generate next phase. Please refresh to try again.");
    } finally {
      clearInterval(phaseStatusTimer.current);
      nextPhaseInFlight.current = false;
      setGeneratingNextPhase(false);
    }
  }, [roadmap, user, loadPhases]);

  // Modal "Continue" handler — closes modal; generation has already been kicked
  // off by the auto effect below, but call ensureNextPhase as a fallback.
  const generateNextPhase = useCallback(async () => {
    setShowPhaseCompleteModal(false);
    await ensureNextPhase(phases);
  }, [phases, ensureNextPhase]);

  // Auto-trigger next-phase generation whenever phases settle into a "latest
  // phase completed, nothing active" state — covers both:
  //   (a) user just finished the last task in-session, and
  //   (b) user reloaded the page after finishing it earlier.
  useEffect(() => {
    if (loading) return;
    if (!roadmap || !user) return;
    if (!phases.length) return;
    ensureNextPhase(phases);
  }, [phases, roadmap, user, loading, ensureNextPhase]);

  // ── Regenerate roadmap or phase ──────────────────────────────────────────────
  const handleRegenerate = useCallback(async () => {
    if (!roadmap || !user) return;

    if (regeneratePhaseData) {
      // Phase-level regenerate
      const { data: result, error: fnError } = await supabase.functions.invoke("regenerate-roadmap", {
        body: {
          roadmapId: roadmap.id,
          phaseId: regeneratePhaseData.phaseId,
          phaseNumber: regeneratePhaseData.phaseNumber,
        },
      });
      if (fnError || result?.error) throw new Error((fnError?.message || result?.error) || "Phase regeneration failed");
      // Reload phases
      const newPhases = await loadPhases(roadmap.id);
      setPhases(newPhases);
      setShowRegenerateModal(false);
      setRegeneratePhaseData(null);
    } else {
      // Full roadmap regenerate
      const { data: result, error: fnError } = await supabase.functions.invoke("regenerate-roadmap", {
        body: {},
      });
      if (fnError || result?.error) throw new Error((fnError?.message || result?.error) || "Regeneration failed");
      // Full reload so RoadmapPage re-initializes with the new roadmap
      window.location.reload();
    }
  }, [roadmap, user, regeneratePhaseData, loadPhases]);

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


  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: "100vh",
      fontFamily: "system-ui, sans-serif",
      position: "relative",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      `}</style>

      {/* Background */}
      <PageBackground />

      {/* Content sits above background */}
      <div data-sidebar-offset style={{ position: "relative", zIndex: 1, marginLeft: SIDEBAR_WIDTH }}>
        {/* Loading */}
        {loading && <LoadingScreen slow={loadingSlow} generating={isGenerating} />}

        {/* Error */}
        {!loading && error && <ErrorScreen message={error} />}

        {/* Main content */}
        {!loading && !error && roadmap && (
          <main style={{
            paddingTop: "2rem",
            minHeight: "100vh",
          }}>
            {/* First-gen note — shown only when roadmap was just created */}
            {showGenNote && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                style={{
                  margin: "0 1rem 1rem",
                  padding: "0.75rem 1rem 0.75rem 1.125rem",
                  background: "rgba(99,102,241,0.06)",
                  border: "1.5px solid rgba(99,102,241,0.14)",
                  borderRadius: "0.875rem",
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem",
                }}
              >
                <p style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "0.85rem", fontWeight: 600, color: "#4f46e5", margin: 0, lineHeight: 1.5 }}>
                  This roadmap was built specifically for you — no generic advice, no expensive counselor required.
                </p>
                <button
                  onClick={() => setShowGenNote(false)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#a5b4fc", padding: "2px", flexShrink: 0, lineHeight: 1 }}
                  aria-label="Dismiss"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </motion.div>
            )}

            {/* Content area */}
            <div style={{
              background: "transparent",
              minHeight: "60vh",
            }}>
              <div style={{
                maxWidth: "680px",
                margin: "0 auto",
                padding: "0 1rem 3rem",
              }}>
                {/* Roadmap path */}
                <RoadmapPath
                  phases={phases}
                  generatingNextPhase={generatingNextPhase}
                  navigate={navigate}
                  onRegeneratePhase={(phaseId, phaseNumber, phaseTitle) => {
                    setRegeneratePhaseData({ phaseId, phaseNumber, phaseTitle });
                    setShowRegenerateModal(true);
                  }}
                />
              </div>
            </div>
          </main>
        )}
      </div>

      {/* ── Modals ── */}

      {/* Regenerate Modal */}
      <AnimatePresence>
        {showRegenerateModal && (
          <RegenerateModal
            phaseTitle={regeneratePhaseData?.phaseTitle || null}
            onConfirm={handleRegenerate}
            onCancel={() => { setShowRegenerateModal(false); setRegeneratePhaseData(null); }}
          />
        )}
      </AnimatePresence>

      {/* Phase Complete Modal */}
      <AnimatePresence>
        {showPhaseCompleteModal && completedPhaseData && (
          <PhaseCompleteModal
            phase={completedPhaseData}
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
