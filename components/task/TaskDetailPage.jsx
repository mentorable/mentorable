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

const STORAGE_KEY_LAST_TASK = "mentorable_roadmap_last_task";

const TYPE_META = {
  video:      { label: "Video",      icon: "▶", color: "#818cf8", bg: "rgba(99,102,241,0.18)",  border: "rgba(99,102,241,0.35)" },
  reading:    { label: "Reading",    icon: "📖", color: "#a5b4fc", bg: "rgba(129,140,248,0.15)", border: "rgba(129,140,248,0.3)" },
  project:    { label: "Project",    icon: "🔧", color: "#c7d2fe", bg: "rgba(165,180,252,0.12)", border: "rgba(165,180,252,0.25)" },
  checkpoint: { label: "Checkpoint", icon: "🏁", color: "#34d399", bg: "rgba(52,211,153,0.12)",  border: "rgba(52,211,153,0.3)" },
  reflection: { label: "Reflection", icon: "💭", color: "#a5b4fc", bg: "rgba(129,140,248,0.15)", border: "rgba(129,140,248,0.3)" },
};

// ── Shared background ─────────────────────────────────────────────────────────
const BG_STARS = [
  { id: 0, top: "4%",  left: "10%" }, { id: 1, top: "7%",  left: "30%" },
  { id: 2, top: "3%",  left: "55%" }, { id: 3, top: "9%",  left: "72%" },
  { id: 4, top: "5%",  left: "88%" }, { id: 5, top: "14%", left: "22%" },
  { id: 6, top: "18%", left: "65%" }, { id: 7, top: "12%", left: "90%" },
];

function PageBackground() {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none",
      background: "linear-gradient(180deg, #1a1660 0%, #2d2894 30%, #4338ca 65%, #3730a3 100%)",
    }}>
      {BG_STARS.map((s) => (
        <motion.div key={s.id}
          animate={{ opacity: [0.3, 0.9, 0.3], scale: [1, 1.4, 1] }}
          transition={{ duration: 2.2 + (s.id % 3) * 0.6, repeat: Infinity, delay: s.id * 0.3, ease: "easeInOut" }}
          style={{
            position: "absolute", top: s.top, left: s.left,
            width: 3, height: 3, borderRadius: "50%",
            background: "white", boxShadow: "0 0 5px rgba(255,255,255,0.8)",
          }}
        />
      ))}
    </div>
  );
}

// ── Loading screen ────────────────────────────────────────────────────────────
function LoadingScreen() {
  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center",
      justifyContent: "center", fontFamily: "'Plus Jakarta Sans', sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap');
        @keyframes tdp-spin { to { transform: rotate(360deg); } }
      `}</style>
      <PageBackground />
      <motion.div
        initial={{ opacity: 0, scale: 0.88, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        style={{ position: "relative", zIndex: 1, textAlign: "center" }}
      >
        {/* Pulsing rings */}
        <div style={{ position: "relative", width: 88, height: 88, margin: "0 auto 1.75rem" }}>
          <motion.div
            animate={{ scale: [1, 1.55, 1], opacity: [0.4, 0, 0.4] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            style={{ position: "absolute", inset: -12, borderRadius: "50%", border: "2px solid rgba(129,140,248,0.45)" }}
          />
          <motion.div
            animate={{ scale: [1, 1.3, 1], opacity: [0.6, 0.1, 0.6] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 0.35 }}
            style={{ position: "absolute", inset: -4, borderRadius: "50%", border: "2px solid rgba(99,102,241,0.55)" }}
          />
          <div style={{
            width: 88, height: 88, borderRadius: "50%",
            background: "linear-gradient(135deg, #4338ca, #6366f1)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 0 40px rgba(99,102,241,0.55)",
          }}>
            <svg width="44" height="44" viewBox="0 0 44 44"
              style={{ animation: "tdp-spin 0.9s linear infinite" }}>
              <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="3.5" />
              <path d="M22 4 A18 18 0 0 1 40 22" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" />
            </svg>
          </div>
        </div>
        <p style={{
          fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800,
          fontSize: "1.25rem", color: "white", margin: "0 0 0.4rem",
          letterSpacing: "-0.02em",
        }}>
          Loading task
        </p>
        <p style={{
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          fontSize: "0.88rem", color: "rgba(165,180,252,0.75)", margin: 0, fontWeight: 500,
        }}>
          Getting everything ready…
        </p>
      </motion.div>
    </div>
  );
}

// ── Top bar ───────────────────────────────────────────────────────────────────
function TopBar({ phase, task, onBack }) {
  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, height: 60, zIndex: 50,
      background: "rgba(26,22,96,0.88)", backdropFilter: "blur(16px)",
      WebkitBackdropFilter: "blur(16px)",
      borderBottom: "1px solid rgba(99,102,241,0.2)",
      display: "flex", alignItems: "center",
      justifyContent: "space-between", padding: "0 1.25rem",
    }}>
      {/* Back */}
      <button onClick={onBack} style={{
        display: "flex", alignItems: "center", gap: 6,
        background: "none", border: "none", cursor: "pointer",
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        fontWeight: 700, fontSize: "0.85rem", color: "#a5b4fc",
        padding: "0.3rem 0", transition: "color 0.15s",
      }}
        onMouseEnter={(e) => { e.currentTarget.style.color = "white"; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = "#a5b4fc"; }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Back
      </button>

      {/* Center breadcrumb */}
      {phase && (
        <span style={{
          position: "absolute", left: "50%", transform: "translateX(-50%)",
          fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700,
          fontSize: "0.78rem", color: "rgba(165,180,252,0.85)",
          letterSpacing: "0.06em", textTransform: "uppercase",
          whiteSpace: "nowrap",
        }}>
          Phase {phase.phase_number} · Week {task?.week_number || 1}
        </span>
      )}

      {/* Wordmark */}
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{
          fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800,
          fontSize: "1rem", color: "#818cf8", letterSpacing: "-0.03em",
        }}>mentorable</span>
        <span style={{
          width: 5, height: 5, borderRadius: "50%", background: "#818cf8",
          boxShadow: "0 0 6px rgba(129,140,248,0.8)", flexShrink: 0, marginBottom: 2,
        }} />
      </div>
    </div>
  );
}

// ── Celebration modal ─────────────────────────────────────────────────────────
function CelebrationModal({ nextTask, nextLocked, onNext, onBack }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(15,12,60,0.75)", backdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 60, padding: "1rem",
      }}
      onClick={onBack}
    >
      <motion.div
        initial={{ scale: 0.75, opacity: 0, y: 30 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: "spring", damping: 22, stiffness: 300 }}
        style={{
          background: "linear-gradient(135deg, #2d2894 0%, #1e1b4b 100%)",
          border: "1.5px solid rgba(129,140,248,0.4)",
          borderRadius: "1.5rem",
          padding: "2.5rem 2rem",
          textAlign: "center", maxWidth: 340, width: "100%",
          boxShadow: "0 24px 80px rgba(67,56,202,0.5), 0 0 0 1px rgba(99,102,241,0.1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Checkmark with glow rings */}
        <div style={{ position: "relative", width: 80, height: 80, margin: "0 auto 1.5rem" }}>
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: [0, 1.3, 1], opacity: [0, 0.5, 0] }}
            transition={{ duration: 0.7, delay: 0.15 }}
            style={{
              position: "absolute", inset: -14, borderRadius: "50%",
              border: "2px solid rgba(52,211,153,0.5)",
            }}
          />
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", damping: 18, stiffness: 260, delay: 0.08 }}
            style={{
              width: 80, height: 80, borderRadius: "50%",
              background: "linear-gradient(135deg, #10b981, #34d399)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 0 40px rgba(52,211,153,0.5)",
            }}
          >
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          <p style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontWeight: 900, fontSize: "1.6rem", color: "white",
            margin: "0 0 0.4rem", letterSpacing: "-0.02em",
          }}>
            Task complete!
          </p>
          <p style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: "0.92rem", color: "rgba(165,180,252,0.8)",
            margin: "0 0 0.6rem", fontWeight: 500,
          }}>
            You're building real momentum.
          </p>
          <span style={{
            display: "inline-block",
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: "0.8rem", fontWeight: 700,
            color: "#34d399", background: "rgba(52,211,153,0.12)",
            border: "1px solid rgba(52,211,153,0.3)",
            borderRadius: "9999px", padding: "0.2rem 0.75rem",
            marginBottom: "1.75rem",
          }}>
            +3 confidence
          </span>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
            <button
              onClick={onNext}
              style={{
                padding: "0.8rem 1.5rem",
                background: "linear-gradient(135deg, #4338ca, #6366f1)",
                border: "none", borderRadius: "0.875rem",
                color: "white", fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontWeight: 700, fontSize: "0.95rem", cursor: "pointer",
                boxShadow: "0 4px 20px rgba(99,102,241,0.45)",
              }}
            >
              {nextTask && !nextLocked ? "Next Task →" : "Back to Roadmap"}
            </button>
            <button
              onClick={onBack}
              style={{
                padding: "0.6rem", background: "none", border: "none",
                color: "rgba(165,180,252,0.6)", fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontWeight: 600, fontSize: "0.82rem", cursor: "pointer",
              }}
            >
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
      .from("roadmap_phases")
      .select("*, tasks:roadmap_tasks(*)")
      .eq("roadmap_id", roadmapId)
      .order("phase_number", { ascending: true });
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
        } catch (_) {
          if (!cancelled) setTaskResponses(null);
        }
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

  // ── Loading ──
  if (loading) return <LoadingScreen />;

  // ── Error ──
  if (error || !task) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "1rem", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap');`}</style>
        <PageBackground />
        <div style={{ position: "relative", zIndex: 1, textAlign: "center" }}>
          <p style={{ color: "rgba(165,180,252,0.8)", marginBottom: "1.25rem", fontWeight: 600 }}>
            {error || "Task not found"}
          </p>
          <button onClick={goBack} style={{
            padding: "0.7rem 1.5rem",
            background: "linear-gradient(135deg, #4338ca, #6366f1)",
            border: "none", borderRadius: "0.875rem", color: "white",
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontWeight: 700, fontSize: "0.9rem", cursor: "pointer",
          }}>
            Back to Roadmap
          </button>
        </div>
      </div>
    );
  }

  // ── Main render ──
  return (
    <div style={{ minHeight: "100vh", fontFamily: "'Plus Jakarta Sans', sans-serif", position: "relative" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap');`}</style>

      <PageBackground />

      <div style={{ position: "relative", zIndex: 1 }}>
        <TopBar phase={phase} task={task} onBack={goBack} />

        <motion.main
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          style={{
            paddingTop: 76, maxWidth: 660,
            margin: "0 auto",
            paddingLeft: "1.25rem", paddingRight: "1.25rem",
            paddingBottom: 100,
          }}
        >
          {/* ── Task header ── */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            style={{ marginBottom: "2rem" }}
          >
            {/* Phase / Week breadcrumb pill */}
            <div style={{
              display: "inline-flex", alignItems: "center", gap: "0.4rem",
              background: "rgba(99,102,241,0.18)", border: "1px solid rgba(99,102,241,0.3)",
              borderRadius: "9999px", padding: "0.3rem 0.85rem",
              marginBottom: "1rem",
            }}>
              <span style={{
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontSize: "0.73rem", fontWeight: 800,
                letterSpacing: "0.1em", textTransform: "uppercase",
                color: "#a5b4fc",
              }}>
                Phase {phase?.phase_number}
              </span>
              <span style={{ color: "rgba(165,180,252,0.4)", fontSize: "0.65rem" }}>·</span>
              <span style={{
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontSize: "0.73rem", fontWeight: 700, color: "rgba(165,180,252,0.8)",
              }}>
                Week {task.week_number || 1}
              </span>
            </div>

            {/* Title */}
            <h1 style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontWeight: 900, fontSize: "2rem", color: "white",
              margin: "0 0 1rem", lineHeight: 1.2, letterSpacing: "-0.025em",
              textShadow: "0 2px 20px rgba(99,102,241,0.35)",
            }}>
              {task.title}
            </h1>

            {/* Meta badges */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
              {/* Type badge */}
              <span style={{
                display: "inline-flex", alignItems: "center", gap: "0.35rem",
                padding: "0.3rem 0.85rem",
                background: typeMeta.bg, border: `1px solid ${typeMeta.border}`,
                borderRadius: "9999px",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontSize: "0.78rem", fontWeight: 700, color: typeMeta.color,
              }}>
                {typeMeta.label}
              </span>

              {/* Time */}
              {task.estimated_time && (
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: "0.35rem",
                  padding: "0.3rem 0.85rem",
                  background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.25)",
                  borderRadius: "9999px",
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  fontSize: "0.78rem", fontWeight: 600, color: "rgba(199,210,254,0.9)",
                }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                  </svg>
                  {task.estimated_time}
                </span>
              )}

              {/* Skill gained */}
              {task.skill_gained && (
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: "0.35rem",
                  padding: "0.3rem 0.85rem",
                  background: "rgba(129,140,248,0.12)", border: "1px solid rgba(129,140,248,0.25)",
                  borderRadius: "9999px",
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  fontSize: "0.78rem", fontWeight: 600, color: "rgba(199,210,254,0.85)",
                }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                  {task.skill_gained}
                </span>
              )}

              {/* Status */}
              {completed && (
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: "0.35rem",
                  padding: "0.3rem 0.85rem",
                  background: "rgba(52,211,153,0.15)", border: "1px solid rgba(52,211,153,0.35)",
                  borderRadius: "9999px",
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  fontSize: "0.78rem", fontWeight: 700, color: "#34d399",
                }}>
                  ✓ Completed
                </span>
              )}
              {notForMe && (
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: "0.35rem",
                  padding: "0.3rem 0.85rem",
                  background: "rgba(249,115,22,0.12)", border: "1px solid rgba(249,115,22,0.3)",
                  borderRadius: "9999px",
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  fontSize: "0.78rem", fontWeight: 700, color: "#fb923c",
                }}>
                  Skipped
                </span>
              )}
            </div>
          </motion.div>

          {/* ── Content ── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
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
            nextTask={nextTask}
            nextLocked={nextLocked}
            onNext={() => { setShowCelebration(false); nextTask && !nextLocked ? navigate(`/roadmap/task/${nextTask.id}`) : goBack(); }}
            onBack={() => { setShowCelebration(false); goBack(); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
