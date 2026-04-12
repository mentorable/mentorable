import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../../lib/supabase.js";
import { getTaskType } from "../../lib/taskType.js";
import VideoTaskContent from "./VideoTaskContent.jsx";
import ReadingTaskContent from "./ReadingTaskContent.jsx";
import ProjectTaskContent from "./ProjectTaskContent.jsx";
import CheckpointContent from "./CheckpointContent.jsx";
import ReflectionArea from "./ReflectionArea.jsx";
import TaskNavBar from "./TaskNavBar.jsx";
import Sidebar, { SIDEBAR_WIDTH } from "../common/Sidebar.jsx";

const STORAGE_KEY_LAST_TASK = "mentorable_roadmap_last_task";
const FONT = "'Space Grotesk', sans-serif";

const TYPE_META = {
  video:      { label: "Video",      color: "#1d4ed8", bg: "rgba(37,99,235,0.08)",  border: "rgba(37,99,235,0.2)" },
  reading:    { label: "Reading",    color: "#0369a1", bg: "rgba(3,105,161,0.07)",  border: "rgba(3,105,161,0.2)" },
  project:    { label: "Project",    color: "#0f766e", bg: "rgba(15,118,110,0.07)", border: "rgba(15,118,110,0.2)" },
  checkpoint: { label: "Checkpoint", color: "#b45309", bg: "rgba(180,83,9,0.07)",   border: "rgba(180,83,9,0.2)"  },
  reflection: { label: "Reflection", color: "#6d28d9", bg: "rgba(109,40,217,0.07)", border: "rgba(109,40,217,0.2)" },
};

// ── Background ────────────────────────────────────────────────────────────────
function PageBackground() {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none",
      background: "linear-gradient(180deg, #e8f0ff 0%, #f4f8ff 25%, #f8faff 100%)",
    }} />
  );
}

// ── Loading ───────────────────────────────────────────────────────────────────
function LoadingScreen() {
  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center",
      justifyContent: "center", fontFamily: FONT,
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');
        @keyframes tdp-spin { to { transform: rotate(360deg); } }
      `}</style>
      <PageBackground />
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        style={{ position: "relative", zIndex: 1, textAlign: "center" }}
      >
        <div style={{ position: "relative", width: 80, height: 80, margin: "0 auto 1.5rem" }}>
          <motion.div
            animate={{ scale: [1, 1.45, 1], opacity: [0.3, 0, 0.3] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            style={{ position: "absolute", inset: -10, borderRadius: "50%", border: "2px solid rgba(37,99,235,0.3)" }}
          />
          <div style={{
            width: 80, height: 80, borderRadius: "50%",
            background: "linear-gradient(135deg, #1d4ed8, #3b82f6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 8px 32px rgba(37,99,235,0.3)",
          }}>
            <svg width="40" height="40" viewBox="0 0 40 40" style={{ animation: "tdp-spin 0.9s linear infinite" }}>
              <circle cx="20" cy="20" r="15" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="3" />
              <path d="M20 5 A15 15 0 0 1 35 20" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </div>
        </div>
        <p style={{ fontFamily: FONT, fontWeight: 700, fontSize: "1.15rem", color: "#0b1340", margin: "0 0 0.35rem", letterSpacing: "-0.02em" }}>
          Loading task
        </p>
        <p style={{ fontFamily: FONT, fontSize: "0.85rem", color: "#4b5470", margin: 0, fontWeight: 500 }}>
          Getting everything ready…
        </p>
      </motion.div>
    </div>
  );
}

// ── Celebration ───────────────────────────────────────────────────────────────
function CelebrationModal({ nextTask, nextLocked, onNext, onBack }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(11,19,64,0.4)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 60, padding: "1rem",
      }}
      onClick={onBack}
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0, y: 24 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.92, opacity: 0 }}
        transition={{ type: "spring", damping: 22, stiffness: 280 }}
        style={{
          background: "#ffffff",
          border: "1.5px solid rgba(37,99,235,0.15)",
          borderRadius: "1.5rem",
          padding: "2.5rem 2rem",
          textAlign: "center", maxWidth: 340, width: "100%",
          boxShadow: "0 20px 60px rgba(37,99,235,0.2), 0 4px 16px rgba(0,0,0,0.08)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ position: "relative", width: 76, height: 76, margin: "0 auto 1.5rem" }}>
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: [0, 1.3, 1], opacity: [0, 0.4, 0] }}
            transition={{ duration: 0.65, delay: 0.1 }}
            style={{ position: "absolute", inset: -12, borderRadius: "50%", border: "2px solid rgba(16,185,129,0.4)" }}
          />
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", damping: 16, stiffness: 280, delay: 0.06 }}
            style={{
              width: 76, height: 76, borderRadius: "50%",
              background: "linear-gradient(135deg, #059669, #10b981)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 8px 32px rgba(16,185,129,0.35)",
            }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </motion.div>
        </div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }}>
          <p style={{ fontFamily: FONT, fontWeight: 700, fontSize: "1.5rem", color: "#0b1340", margin: "0 0 0.35rem", letterSpacing: "-0.02em" }}>
            Task complete!
          </p>
          <p style={{ fontFamily: FONT, fontSize: "0.9rem", color: "#4b5470", margin: "0 0 0.75rem", fontWeight: 500 }}>
            You're building real momentum.
          </p>
          <span style={{
            display: "inline-block", fontFamily: FONT, fontSize: "0.78rem", fontWeight: 700,
            color: "#059669", background: "rgba(16,185,129,0.08)",
            border: "1px solid rgba(16,185,129,0.2)",
            borderRadius: "9999px", padding: "0.2rem 0.75rem", marginBottom: "1.75rem",
          }}>
            +3 confidence
          </span>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
            <button onClick={onNext} style={{
              padding: "0.8rem 1.5rem",
              background: "linear-gradient(135deg, #1d4ed8, #3b82f6)",
              border: "none", borderRadius: "0.875rem",
              color: "white", fontFamily: FONT, fontWeight: 700,
              fontSize: "0.95rem", cursor: "pointer",
              boxShadow: "0 4px 20px rgba(37,99,235,0.35)",
            }}>
              {nextTask && !nextLocked ? "Next Task →" : "Back to Roadmap"}
            </button>
            <button onClick={onBack} style={{
              padding: "0.5rem", background: "none", border: "none",
              color: "#9199b8", fontFamily: FONT, fontWeight: 600,
              fontSize: "0.82rem", cursor: "pointer",
            }}>
              Return to roadmap
            </button>
          </div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function TaskDetailPage({ taskId, navigate }) {
  const [user, setUser] = useState(null);
  const [task, setTask] = useState(null);
  const [phase, setPhase] = useState(null);
  const [phases, setPhases] = useState([]);
  const [roadmap, setRoadmap] = useState(null);
  const [prevTask, setPrevTask] = useState(null);
  const [nextTask, setNextTask] = useState(null);
  const [nextLocked, setNextLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [taskResponses, setTaskResponses] = useState(null);
  const [showCelebration, setShowCelebration] = useState(false);

  const loadPhases = useCallback(async (roadmapId) => {
    const { data, error: e } = await supabase
      .from("roadmap_phases").select("*, tasks:roadmap_tasks(*)")
      .eq("roadmap_id", roadmapId).order("phase_number", { ascending: true });
    if (e) throw e;
    return data || [];
  }, []);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      try {
        const { data: { user: u } } = await supabase.auth.getUser();
        if (!u) { window.location.href = "/auth"; return; }
        if (cancelled) return;
        setUser(u);

        const { data: profile } = await supabase
          .from("profiles").select("onboarding_completed").eq("id", u.id).maybeSingle();
        if (!profile?.onboarding_completed) { window.location.href = "/onboarding"; return; }

        const { data: roadmapRows } = await supabase
          .from("roadmaps").select("*").eq("user_id", u.id).eq("is_active", true)
          .order("created_at", { ascending: false }).limit(1);
        const activeRoadmap = roadmapRows?.[0] || null;
        if (!activeRoadmap) { setError("No active roadmap"); setLoading(false); return; }
        if (cancelled) return;
        setRoadmap(activeRoadmap);

        const phasesData = await loadPhases(activeRoadmap.id);
        if (cancelled) return;
        setPhases(phasesData);

        let foundTask = null, foundPhase = null, prev = null, next = null, nextIsLocked = false;
        for (const ph of phasesData) {
          const tasks = (ph.tasks || []).slice().sort((a, b) => (a.week_number || 1) - (b.week_number || 1));
          for (let i = 0; i < tasks.length; i++) {
            if (tasks[i].id === taskId) {
              foundTask = tasks[i]; foundPhase = ph;
              prev = i > 0 ? tasks[i - 1] : null;
              next = i < tasks.length - 1 ? tasks[i + 1] : null;
              if (next) {
                const prevDone = tasks.slice(0, i + 1).every((t) => t.status === "completed" || t.status === "skipped");
                nextIsLocked = !prevDone;
              }
              break;
            }
          }
          if (foundTask) break;
        }

        if (!foundTask) { setError("Task not found"); setLoading(false); return; }
        if (cancelled) return;
        setTask(foundTask); setPhase(foundPhase);
        setPrevTask(prev); setNextTask(next); setNextLocked(nextIsLocked);

        if (foundTask.status === "not_started") {
          await supabase.from("roadmap_tasks").update({ status: "in_progress" }).eq("id", taskId);
          setTask((t) => (t ? { ...t, status: "in_progress" } : t));
        }

        try {
          const raw = localStorage.getItem(`mentorable_reflection_${taskId}`);
          if (!cancelled) setTaskResponses(raw ? { responses: JSON.parse(raw) } : null);
        } catch (_) { if (!cancelled) setTaskResponses(null); }
      } catch (err) {
        if (!cancelled) setError(err?.message || "Failed to load task");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    init();
    return () => { cancelled = true; };
  }, [taskId, loadPhases]);

  const goBack = useCallback(() => {
    if (taskId) sessionStorage.setItem(STORAGE_KEY_LAST_TASK, taskId);
    navigate("/roadmap");
  }, [taskId, navigate]);

  const completeTask = useCallback(async () => {
    if (!task || !phase || !roadmap || !user) return;
    setTask((t) => (t ? { ...t, status: "completed" } : t));
    await supabase.from("roadmap_tasks")
      .update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", task.id);
    const prevScore = roadmap.confidence_score ?? 0;
    const newScore = Math.min(100, Math.max(0, prevScore + 3));
    await supabase.from("roadmaps").update({ confidence_score: newScore, updated_at: new Date().toISOString() }).eq("id", roadmap.id);
    await supabase.from("confidence_history").insert({
      roadmap_id: roadmap.id, user_id: user.id,
      previous_score: prevScore, new_score: newScore, delta: 3,
      reason: "You completed a task — great momentum!", trigger: "task_completed",
    });
    setRoadmap((r) => (r ? { ...r, confidence_score: newScore } : r));
    setShowCelebration(true);
  }, [task, phase, roadmap, user]);

  const flagNotForMe = useCallback(async () => {
    if (!task || !phase || !roadmap || !user) return;
    setTask((t) => (t ? { ...t, not_for_me: true, status: "skipped" } : t));
    await supabase.from("roadmap_tasks").update({ not_for_me: true, status: "skipped" }).eq("id", task.id);
    const prevScore = roadmap.confidence_score ?? 0;
    const newScore = Math.min(100, Math.max(0, prevScore - 4));
    await supabase.from("roadmaps").update({ confidence_score: newScore, updated_at: new Date().toISOString() }).eq("id", roadmap.id);
    await supabase.from("confidence_history").insert({
      roadmap_id: roadmap.id, user_id: user.id,
      previous_score: prevScore, new_score: newScore, delta: -4,
      reason: "You flagged a task as not for you.", trigger: "task_flagged_not_for_me",
    });
    setRoadmap((r) => (r ? { ...r, confidence_score: newScore } : r));
  }, [task, phase, roadmap, user]);

  const goPrev = () => {
    if (prevTask) { if (taskId) sessionStorage.setItem(STORAGE_KEY_LAST_TASK, taskId); navigate(`/roadmap/task/${prevTask.id}`); }
  };
  const goNext = () => {
    if (nextTask && !nextLocked) { if (taskId) sessionStorage.setItem(STORAGE_KEY_LAST_TASK, taskId); navigate(`/roadmap/task/${nextTask.id}`); }
  };
  const markPhaseComplete = useCallback(async () => {
    if (!phase || !user) return;
    await supabase.from("roadmap_phases").update({ status: "completed" }).eq("id", phase.id);
    goBack();
  }, [phase, user, goBack]);

  const taskType = task
    ? getTaskType(task, { phaseTasks: phase?.tasks || [], taskIndex: (phase?.tasks || []).findIndex((t) => t.id === task.id) })
    : "reflection";
  const completed = task?.status === "completed";
  const notForMe = task?.not_for_me;
  const typeMeta = TYPE_META[taskType] || TYPE_META.reflection;

  if (loading) return <LoadingScreen />;

  if (error || !task) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "1rem", fontFamily: FONT }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');`}</style>
        <PageBackground />
        <div style={{ position: "relative", zIndex: 1, textAlign: "center" }}>
          <p style={{ color: "#4b5470", marginBottom: "1.25rem", fontWeight: 600 }}>{error || "Task not found"}</p>
          <button onClick={goBack} style={{
            padding: "0.7rem 1.5rem",
            background: "linear-gradient(135deg, #1d4ed8, #3b82f6)",
            border: "none", borderRadius: "0.875rem", color: "white",
            fontFamily: FONT, fontWeight: 700, fontSize: "0.9rem", cursor: "pointer",
          }}>
            Back to Roadmap
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", fontFamily: FONT, position: "relative" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');`}</style>

      <PageBackground />

      <Sidebar
        activePath="/roadmap"
        navigate={navigate}
        onModeClick={null}
        roadmapMode={roadmap?.mode || "discovery"}
      />

      <div style={{ position: "relative", zIndex: 1, marginLeft: SIDEBAR_WIDTH }}>
        <motion.main
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          style={{ paddingTop: 32, maxWidth: 660, margin: "0 auto", paddingLeft: "1.25rem", paddingRight: "1.25rem", paddingBottom: 100 }}
        >
          {/* Back link */}
          <button onClick={goBack} style={{
            display: "flex", alignItems: "center", gap: 5, marginBottom: "1.5rem",
            background: "none", border: "none", cursor: "pointer",
            fontFamily: FONT, fontWeight: 700, fontSize: "0.85rem", color: "#1d4ed8",
            padding: 0, transition: "color 0.15s",
          }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "#1e40af"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "#1d4ed8"; }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back to Roadmap
          </button>
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.07, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            style={{ marginBottom: "1.75rem" }}
          >
            {/* Breadcrumb pill */}
            <div style={{
              display: "inline-flex", alignItems: "center", gap: "0.4rem",
              background: "rgba(37,99,235,0.07)", border: "1px solid rgba(37,99,235,0.15)",
              borderRadius: "9999px", padding: "0.28rem 0.85rem", marginBottom: "0.9rem",
            }}>
              <span style={{ fontFamily: FONT, fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#1d4ed8" }}>
                Phase {phase?.phase_number}
              </span>
              <span style={{ color: "rgba(37,99,235,0.3)", fontSize: "0.6rem" }}>·</span>
              <span style={{ fontFamily: FONT, fontSize: "0.7rem", fontWeight: 600, color: "#4b5470" }}>
                Week {task.week_number || 1}
              </span>
            </div>

            <h1 style={{
              fontFamily: FONT, fontWeight: 700, fontSize: "1.9rem",
              color: "#0b1340", margin: "0 0 0.9rem", lineHeight: 1.2, letterSpacing: "-0.025em",
            }}>
              {task.title}
            </h1>

            {/* Meta badges */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem", alignItems: "center" }}>
              <span style={{
                display: "inline-flex", alignItems: "center",
                padding: "0.28rem 0.8rem",
                background: typeMeta.bg, border: `1px solid ${typeMeta.border}`,
                borderRadius: "9999px", fontFamily: FONT,
                fontSize: "0.75rem", fontWeight: 700, color: typeMeta.color,
              }}>
                {typeMeta.label}
              </span>

              {task.estimated_time && (
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: "0.3rem",
                  padding: "0.28rem 0.8rem",
                  background: "rgba(37,99,235,0.05)", border: "1px solid rgba(37,99,235,0.12)",
                  borderRadius: "9999px", fontFamily: FONT,
                  fontSize: "0.75rem", fontWeight: 600, color: "#4b5470",
                }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                  </svg>
                  {task.estimated_time}
                </span>
              )}

              {task.skill_gained && (
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: "0.3rem",
                  padding: "0.28rem 0.8rem",
                  background: "rgba(37,99,235,0.05)", border: "1px solid rgba(37,99,235,0.12)",
                  borderRadius: "9999px", fontFamily: FONT,
                  fontSize: "0.75rem", fontWeight: 600, color: "#4b5470",
                }}>
                  {task.skill_gained}
                </span>
              )}

              {completed && (
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: "0.3rem",
                  padding: "0.28rem 0.8rem",
                  background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)",
                  borderRadius: "9999px", fontFamily: FONT,
                  fontSize: "0.75rem", fontWeight: 700, color: "#059669",
                }}>
                  ✓ Completed
                </span>
              )}
              {notForMe && (
                <span style={{
                  display: "inline-flex", alignItems: "center",
                  padding: "0.28rem 0.8rem",
                  background: "rgba(249,115,22,0.07)", border: "1px solid rgba(249,115,22,0.2)",
                  borderRadius: "9999px", fontFamily: FONT,
                  fontSize: "0.75rem", fontWeight: 700, color: "#ea580c",
                }}>
                  Skipped
                </span>
              )}
            </div>
          </motion.div>

          {/* Content */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.16, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            {taskType === "video" && (
              <VideoTaskContent task={task} userId={user?.id} taskResponses={taskResponses}
                onSaveResponses={(r) => setTaskResponses((p) => p ? { ...p, responses: r } : { responses: r })} />
            )}
            {taskType === "reading" && (
              <ReadingTaskContent task={task} userId={user?.id} taskResponses={taskResponses}
                onSaveResponses={(r) => setTaskResponses((p) => p ? { ...p, responses: r } : { responses: r })} />
            )}
            {taskType === "project" && (
              <ProjectTaskContent task={task} userId={user?.id} taskResponses={taskResponses}
                onSaveResponses={(r) => setTaskResponses((p) => p ? { ...p, responses: r } : { responses: r })} />
            )}
            {taskType === "checkpoint" && (
              <CheckpointContent phase={phase} onMarkPhaseComplete={markPhaseComplete} />
            )}
            {taskType === "reflection" && (
              <ReflectionArea taskId={task.id} userId={user?.id} prompts={[]}
                initialResponses={taskResponses?.responses || {}}
                onSave={(r) => setTaskResponses((p) => p ? { ...p, responses: r } : { responses: r })} />
            )}
          </motion.div>
        </motion.main>
      </div>

      <TaskNavBar
        prevTask={prevTask} nextTask={nextTask} nextLocked={nextLocked}
        onPrev={goPrev} onNext={goNext}
        onMarkComplete={completeTask} onNotForMe={flagNotForMe}
        completed={completed} notForMe={notForMe}
      />

      <AnimatePresence>
        {showCelebration && (
          <CelebrationModal
            nextTask={nextTask} nextLocked={nextLocked}
            onNext={() => { setShowCelebration(false); nextTask && !nextLocked ? navigate(`/roadmap/task/${nextTask.id}`) : goBack(); }}
            onBack={() => { setShowCelebration(false); goBack(); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
