import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import PhaseHeader from "./PhaseHeader.jsx";
import MilestoneIcon from "./MilestoneIcon.jsx";
import PathLine from "./PathLine.jsx";
import { getTaskType } from "../../lib/taskType.js";

// All tasks from all phases in order (for path line completed %)
function getAllTasksOrdered(phases) {
  const list = [];
  (phases || []).forEach((phase) => {
    const tasks = (phase.tasks || []).slice().sort((a, b) => (a.week_number || 1) - (b.week_number || 1) || (a.created_at || "").localeCompare(b.created_at || ""));
    tasks.forEach((t) => list.push({ ...t, phaseId: phase.id, phase }));
  });
  return list;
}

function isTaskLocked(task, phase, allTasksInPhase) {
  if (phase.status === "locked") return true;
  const idx = allTasksInPhase.findIndex((t) => t.id === task.id);
  if (idx <= 0) return false;
  for (let i = 0; i < idx; i++) {
    const t = allTasksInPhase[i];
    if (t.status !== "completed" && t.status !== "skipped") return true;
  }
  return false;
}

export default function RoadmapPath({
  roadmap,
  phases,
  onTaskComplete,
  onTaskFlagNotForMe,
  onPhaseComplete,
  generatingNextPhase,
  navigate,
}) {
  const allTasks = useMemo(() => getAllTasksOrdered(phases), [phases]);
  const completedCount = useMemo(
    () => allTasks.filter((t) => t.status === "completed" || t.status === "skipped").length,
    [allTasks]
  );
  const completedPct = allTasks.length ? (completedCount / allTasks.length) * 100 : 0;

  if (!phases || phases.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "3rem 1rem", color: "#94a3b8", fontSize: "0.9rem" }}>
        No phases yet. Hang tight while we build your roadmap...
      </div>
    );
  }

  return (
    <div style={{ position: "relative", width: "100%", paddingBottom: "120px" }}>
      <PathLine completedPct={completedPct} />

      {phases.map((phase, phaseIdx) => {
        const isLocked = phase.status === "locked";
        const phaseTasks = (phase.tasks || []).slice().sort(
          (a, b) => (a.week_number || 1) - (b.week_number || 1) || (a.created_at || "").localeCompare(b.created_at || "")
        );
        const completedInPhase = phaseTasks.filter(
          (t) => t.status === "completed" || t.status === "skipped"
        ).length;
        const totalInPhase = phaseTasks.length;

        return (
          <div key={phase.id} style={{ position: "relative" }}>
            {/* Phase divider */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: phaseIdx * 0.06, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              style={{
                marginBottom: "1.25rem",
                position: "relative",
                zIndex: 1,
              }}
            >
              {isLocked ? (
                <div style={{
                  background: "rgba(30, 45, 74, 0.5)",
                  border: "1.5px dashed #1E2D4A",
                  borderRadius: "1rem",
                  padding: "1rem 1.25rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  <div>
                    <p style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: "0.875rem", color: "#64748B", margin: 0 }}>
                      Phase {phase.phase_number}{phase.title ? ` — ${phase.title}` : ""}
                    </p>
                    <p style={{ fontSize: "0.75rem", color: "#64748B", margin: "0.1rem 0 0 0" }}>
                      Complete the current phase to unlock
                    </p>
                  </div>
                </div>
              ) : (
                <PhaseHeader
                  phase={phase}
                  currentWeek={null}
                  completedMilestones={completedInPhase}
                  totalMilestones={totalInPhase}
                />
              )}
            </motion.div>

            {/* Milestones — alternating left/right */}
            {!isLocked && phaseTasks.map((task, taskIdx) => {
              const locked = isTaskLocked(task, phase, phaseTasks);
              const isActive =
                task.status === "in_progress" ||
                (task.status === "not_started" && !locked);
              const taskType = getTaskType(task, { phaseTasks, taskIndex: taskIdx });
              const side = taskIdx % 2 === 0 ? "left" : "right";

              return (
                <motion.div
                  key={task.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    delay: phaseIdx * 0.06 + taskIdx * 0.04,
                    duration: 0.35,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    marginBottom: "1.25rem",
                    position: "relative",
                    zIndex: 1,
                  }}
                >
                  <div
                    style={{
                      flex: 1,
                      maxWidth: "50%",
                      display: "flex",
                      justifyContent: side === "left" ? "flex-end" : "flex-start",
                      paddingRight: side === "left" ? 24 : 0,
                      paddingLeft: side === "right" ? 24 : 0,
                    }}
                  >
                    <MilestoneIcon
                      task={task}
                      taskType={taskType}
                      isLocked={locked}
                      isActive={isActive}
                      navigate={navigate}
                      index={taskIdx}
                    />
                  </div>
                </motion.div>
              );
            })}

            {phaseIdx < phases.length - 1 && <div style={{ height: "0.5rem" }} />}
          </div>
        );
      })}

      <AnimatePresence>
        {generatingNextPhase && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              position: "relative",
              zIndex: 1,
              marginTop: "1rem",
            }}
          >
            <motion.div
              animate={{ scale: [1, 1.25, 1], opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: "rgba(59, 130, 246, 0.2)",
                border: "2.5px dashed #3B82F6",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ animation: "rp-spin 1s linear infinite" }}>
                <circle cx="12" cy="12" r="10" stroke="rgba(59,130,246,0.3)" strokeWidth="3" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="#3B82F6" strokeWidth="3" strokeLinecap="round" />
              </svg>
            </motion.div>
            <span style={{ marginLeft: 12, fontSize: "0.875rem", fontWeight: 600, color: "#3B82F6" }}>
              Generating your next phase...
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        @keyframes rp-spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
