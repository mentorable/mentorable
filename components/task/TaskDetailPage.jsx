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
        if (!u) {
          window.location.href = "/auth";
          return;
        }
        if (cancelled) return;
        setUser(u);

        const { data: profile } = await supabase
          .from("profiles")
          .select("onboarding_completed")
          .eq("id", u.id)
          .maybeSingle();
        if (!profile?.onboarding_completed) {
          window.location.href = "/onboarding";
          return;
        }

        const { data: roadmapRows } = await supabase
          .from("roadmaps")
          .select("*")
          .eq("user_id", u.id)
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(1);
        const activeRoadmap = roadmapRows?.[0] || null;
        if (!activeRoadmap) {
          setError("No active roadmap");
          setLoading(false);
          return;
        }
        if (cancelled) return;
        setRoadmap(activeRoadmap);

        const phasesData = await loadPhases(activeRoadmap.id);
        if (cancelled) return;
        setPhases(phasesData);

        let foundTask = null;
        let foundPhase = null;
        let prev = null;
        let next = null;
        let nextIsLocked = false;
        for (const ph of phasesData) {
          const tasks = (ph.tasks || []).slice().sort((a, b) => (a.week_number || 1) - (b.week_number || 1));
          for (let i = 0; i < tasks.length; i++) {
            if (tasks[i].id === taskId) {
              foundTask = tasks[i];
              foundPhase = ph;
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

        if (!foundTask) {
          setError("Task not found");
          setLoading(false);
          return;
        }
        if (cancelled) return;
        setTask(foundTask);
        setPhase(foundPhase);
        setPrevTask(prev);
        setNextTask(next);
        setNextLocked(nextIsLocked);

        if (foundTask.status === "not_started") {
          await supabase.from("roadmap_tasks").update({ status: "in_progress" }).eq("id", taskId);
          setTask((t) => (t ? { ...t, status: "in_progress" } : t));
        }

        try {
          const key = `mentorable_reflection_${taskId}`;
          const raw = localStorage.getItem(key);
          if (!cancelled) setTaskResponses(raw ? { responses: JSON.parse(raw) } : null);
        } catch (_) {
          if (!cancelled) setTaskResponses(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || "Failed to load task");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    init();
    return () => { cancelled = true; };
  }, [taskId, loadPhases]);

  const goBack = () => {
    if (taskId) sessionStorage.setItem(STORAGE_KEY_LAST_TASK, taskId);
    navigate("/roadmap");
  };

  const completeTask = useCallback(async () => {
    if (!task || !phase || !roadmap || !user) return;
    setTask((t) => (t ? { ...t, status: "completed" } : t));
    await supabase
      .from("roadmap_tasks")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", task.id);
    const prevScore = roadmap.confidence_score ?? 0;
    const newScore = Math.min(100, Math.max(0, prevScore + 3));
    await supabase.from("roadmaps").update({ confidence_score: newScore, updated_at: new Date().toISOString() }).eq("id", roadmap.id);
    await supabase.from("confidence_history").insert({
      roadmap_id: roadmap.id,
      user_id: user.id,
      previous_score: prevScore,
      new_score: newScore,
      delta: 3,
      reason: "You completed a task — great momentum!",
      trigger: "task_completed",
    });
    setRoadmap((r) => (r ? { ...r, confidence_score: newScore } : r));
    setShowCelebration(true);
  }, [task, phase, roadmap, user]);

  const flagNotForMe = useCallback(async () => {
    if (!task || !phase || !roadmap || !user) return;
    setTask((t) => (t ? { ...t, not_for_me: true, status: "skipped" } : t));
    await supabase
      .from("roadmap_tasks")
      .update({ not_for_me: true, status: "skipped" })
      .eq("id", task.id);
    const prevScore = roadmap.confidence_score ?? 0;
    const newScore = Math.min(100, Math.max(0, prevScore - 4));
    await supabase.from("roadmaps").update({ confidence_score: newScore, updated_at: new Date().toISOString() }).eq("id", roadmap.id);
    await supabase.from("confidence_history").insert({
      roadmap_id: roadmap.id,
      user_id: user.id,
      previous_score: prevScore,
      new_score: newScore,
      delta: -4,
      reason: "You flagged a task as not for you.",
      trigger: "task_flagged_not_for_me",
    });
    setRoadmap((r) => (r ? { ...r, confidence_score: newScore } : r));
  }, [task, phase, roadmap, user]);

  const goPrev = () => {
    if (prevTask) {
      if (taskId) sessionStorage.setItem(STORAGE_KEY_LAST_TASK, taskId);
      navigate(`/roadmap/task/${prevTask.id}`);
    }
  };
  const goNext = () => {
    if (nextTask && !nextLocked) {
      if (taskId) sessionStorage.setItem(STORAGE_KEY_LAST_TASK, taskId);
      navigate(`/roadmap/task/${nextTask.id}`);
    }
  };

  const markPhaseComplete = useCallback(async () => {
    if (!phase || !user) return;
    await supabase.from("roadmap_phases").update({ status: "completed" }).eq("id", phase.id);
    goBack();
  }, [phase, user]);

  const taskType = task ? getTaskType(task, { phaseTasks: phase?.tasks || [], taskIndex: (phase?.tasks || []).findIndex((t) => t.id === task.id) }) : "reflection";
  const completed = task?.status === "completed";
  const notForMe = task?.not_for_me;

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#0A0F1E", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#64748B", fontSize: "0.9rem" }}>Loading task...</div>
      </div>
    );
  }
  if (error || !task) {
    return (
      <div style={{ minHeight: "100vh", background: "#0A0F1E", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
        <p style={{ color: "#94a3b8", marginBottom: "1rem" }}>{error || "Task not found"}</p>
        <button
          onClick={goBack}
          style={{
            padding: "0.6rem 1.25rem",
            background: "#3B82F6",
            border: "none",
            borderRadius: 8,
            color: "#fff",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Back to Roadmap
        </button>
      </div>
    );
  }

  const typeLabels = { video: "Video Task", reading: "Reading", reflection: "Reflection", project: "Project", checkpoint: "Checkpoint" };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #0A0F1E 0%, #1e1b4b 40%, #1E2D4A 100%)", fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');`}</style>

      {/* Top bar */}
      <div style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: 56,
        background: "rgba(10, 15, 30, 0.9)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid #1E2D4A",
        display: "flex",
        alignItems: "center",
        padding: "0 1.25rem",
        zIndex: 50,
      }}>
        <button
          onClick={goBack}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "none",
            border: "none",
            color: "#3B82F6",
            fontSize: "0.9rem",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          ← Back to Roadmap
        </button>
        <span style={{ marginLeft: 16, fontWeight: 800, fontSize: "1rem", color: "#E8EDF5" }}>mentorable</span>
      </div>

      <main style={{ paddingTop: 72, maxWidth: 640, margin: "0 auto", paddingLeft: "1rem", paddingRight: "1rem", paddingBottom: 100 }}>
        {/* Header */}
        <p style={{ fontSize: "0.75rem", color: "#64748B", marginBottom: 4 }}>
          Phase {phase?.phase_number} · Week {task.week_number || 1}
        </p>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "#E8EDF5", margin: "0 0 1rem 0", lineHeight: 1.25 }}>
          {task.title}
        </h1>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: "1.5rem" }}>
          {task.estimated_time && (
            <span style={{
              padding: "0.25rem 0.6rem",
              background: "rgba(59, 130, 246, 0.2)",
              borderRadius: 9999,
              fontSize: "0.8rem",
              color: "#38BDF8",
            }}>
              ~{task.estimated_time}
            </span>
          )}
          <span style={{
            padding: "0.25rem 0.6rem",
            background: "rgba(30, 45, 74, 0.8)",
            borderRadius: 9999,
            fontSize: "0.8rem",
            color: "#94a3b8",
          }}>
            {typeLabels[taskType] || "Task"}
          </span>
          {completed && (
            <span style={{ padding: "0.25rem 0.6rem", background: "#22C55E", borderRadius: 9999, fontSize: "0.8rem", color: "#fff" }}>
              Completed
            </span>
          )}
          {notForMe && (
            <span style={{ padding: "0.25rem 0.6rem", background: "#F97316", borderRadius: 9999, fontSize: "0.8rem", color: "#fff" }}>
              Not for me
            </span>
          )}
        </div>

        {/* Content by type */}
        {taskType === "video" && (
          <VideoTaskContent
            task={task}
            userId={user?.id}
            taskResponses={taskResponses}
            onSaveResponses={(r) => setTaskResponses((prev) => (prev ? { ...prev, responses: r } : { responses: r }))}
          />
        )}
        {taskType === "reading" && (
          <ReadingTaskContent
            task={task}
            userId={user?.id}
            taskResponses={taskResponses}
            onSaveResponses={(r) => setTaskResponses((prev) => (prev ? { ...prev, responses: r } : { responses: r }))}
          />
        )}
        {taskType === "project" && (
          <ProjectTaskContent
            task={task}
            userId={user?.id}
            taskResponses={taskResponses}
            onSaveResponses={(r) => setTaskResponses((prev) => (prev ? { ...prev, responses: r } : { responses: r }))}
          />
        )}
        {taskType === "checkpoint" && (
          <CheckpointContent phase={phase} onMarkPhaseComplete={markPhaseComplete} />
        )}
        {taskType === "reflection" && (
          <ReflectionArea
            taskId={task.id}
            userId={user?.id}
            prompts={[]}
            initialResponses={taskResponses?.responses || {}}
            onSave={(r) => setTaskResponses((prev) => (prev ? { ...prev, responses: r } : { responses: r }))}
          />
        )}
      </main>


      <TaskNavBar
        prevTask={prevTask}
        nextTask={nextTask}
        nextLocked={nextLocked}
        onPrev={goPrev}
        onNext={goNext}
        onMarkComplete={completeTask}
        onNotForMe={flagNotForMe}
        completed={completed}
        notForMe={notForMe}
      />

      <AnimatePresence>
        {showCelebration && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 60,
            }}
            onClick={() => setShowCelebration(false)}
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", damping: 20 }}
              style={{
                background: "#111827",
                border: "1px solid #22C55E",
                borderRadius: 16,
                padding: "2rem",
                textAlign: "center",
                maxWidth: 320,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.1, type: "spring" }}
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: "50%",
                  background: "#22C55E",
                  margin: "0 auto 1rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </motion.div>
              <p style={{ fontWeight: 700, color: "#E8EDF5", marginBottom: 8 }}>Task complete!</p>
              <p style={{ fontSize: "0.9rem", color: "#94a3b8", marginBottom: "1rem" }}>
                Ready for the next task?
              </p>
              <button
                onClick={() => { setShowCelebration(false); nextTask && !nextLocked ? navigate(`/roadmap/task/${nextTask.id}`) : goBack(); }}
                style={{
                  padding: "0.6rem 1.25rem",
                  background: "#3B82F6",
                  border: "none",
                  borderRadius: 8,
                  color: "#fff",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {nextTask && !nextLocked ? "Next Task →" : "Back to Roadmap"}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
