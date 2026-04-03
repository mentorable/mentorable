import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import PhaseHeader from "./PhaseHeader.jsx";
import MilestoneIcon from "./MilestoneIcon.jsx";
import { getTaskType } from "../../lib/taskType.js";

/* Smooth sine-wave x-offset for a node at global index idx.
   Amplitude 80 px, period ≈ 7.8 nodes — creates a natural winding path. */
function getCurveOffset(idx) {
  return Math.round(Math.sin(idx * 0.8) * 80);
}

function getAllTasksOrdered(phases) {
  const list = [];
  (phases || []).forEach((phase) => {
    const tasks = (phase.tasks || [])
      .slice()
      .sort((a, b) =>
        (a.week_number || 1) - (b.week_number || 1) ||
        (a.created_at || "").localeCompare(b.created_at || "")
      );
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

/* Spinner used in "generating" state */
function Spinner({ size = 20, color = "#6366f1" }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      style={{ animation: "rp-spin 0.85s linear infinite", flexShrink: 0 }}
    >
      <circle cx="12" cy="12" r="10" stroke={`${color}44`} strokeWidth="3" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke={color} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
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

  if (!phases || phases.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "3rem 1rem", color: "#94a3b8", fontSize: "0.9rem", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        No phases yet. Hang tight while we build your roadmap…
      </div>
    );
  }

  /* Build a globalIdx counter so we can compute sine-wave offsets continuously
     across phase boundaries. */
  let globalIdx = 0;

  return (
    <div style={{ position: "relative", width: "100%", paddingBottom: "120px" }}>
      {phases.map((phase, phaseIdx) => {
        const isLocked = phase.status === "locked";
        const phaseTasks = (phase.tasks || [])
          .slice()
          .sort(
            (a, b) =>
              (a.week_number || 1) - (b.week_number || 1) ||
              (a.created_at || "").localeCompare(b.created_at || "")
          );
        const completedInPhase = phaseTasks.filter(
          (t) => t.status === "completed" || t.status === "skipped"
        ).length;

        return (
          <div key={phase.id} style={{ position: "relative" }}>
            {/* ── Phase header ── */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: phaseIdx * 0.06, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              style={{ marginBottom: "1.75rem", position: "relative", zIndex: 1 }}
            >
              {isLocked ? (
                <div style={{
                  background: "rgba(241,245,249,0.8)",
                  border: "1.5px dashed #cbd5e1",
                  borderRadius: "1rem",
                  padding: "1rem 1.25rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  <div>
                    <p style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: "0.875rem", color: "#94a3b8", margin: 0 }}>
                      Phase {phase.phase_number}{phase.title ? ` — ${phase.title}` : ""}
                    </p>
                    <p style={{ fontSize: "0.75rem", color: "#94a3b8", margin: "0.15rem 0 0 0" }}>
                      Complete the current phase to unlock
                    </p>
                  </div>
                </div>
              ) : (
                <PhaseHeader
                  phase={phase}
                  currentWeek={null}
                  completedMilestones={completedInPhase}
                  totalMilestones={phaseTasks.length}
                />
              )}
            </motion.div>

            {/* ── Milestone nodes — curved / zig-zag ── */}
            {!isLocked && phaseTasks.map((task, taskIdx) => {
              const myGlobalIdx = globalIdx++;
              const xOffset     = getCurveOffset(myGlobalIdx);
              const locked      = isTaskLocked(task, phase, phaseTasks);
              const isActive    = task.status === "in_progress" || (task.status === "not_started" && !locked);
              const taskType    = getTaskType(task, { phaseTasks, taskIndex: taskIdx });

              return (
                <motion.div
                  key={task.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    delay: phaseIdx * 0.05 + taskIdx * 0.04,
                    duration: 0.35,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  style={{
                    display:        "flex",
                    justifyContent: "center",
                    marginBottom:   "1.75rem",
                    position:       "relative",
                    zIndex:         1,
                    /* Horizontal shift creates the winding path */
                    transform:      `translateX(${xOffset}px)`,
                  }}
                >
                  <MilestoneIcon
                    task={task}
                    taskType={taskType}
                    isLocked={locked}
                    isActive={isActive}
                    navigate={navigate}
                    index={myGlobalIdx}
                  />
                </motion.div>
              );
            })}

            {/* Advance globalIdx for locked tasks so spacing continues smoothly */}
            {isLocked && (() => { globalIdx += (phase.tasks || []).length; return null; })()}

            {phaseIdx < phases.length - 1 && <div style={{ height: "0.75rem" }} />}
          </div>
        );
      })}

      {/* ── Generating next phase indicator ── */}
      <AnimatePresence>
        {generatingNextPhase && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            style={{
              display:        "flex",
              justifyContent: "center",
              alignItems:     "center",
              gap:            "0.75rem",
              marginTop:      "1.25rem",
              position:       "relative",
              zIndex:         1,
            }}
          >
            <Spinner />
            <span style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontSize:   "0.875rem",
              fontWeight: 600,
              color:      "#6366f1",
            }}>
              Generating your next phase…
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`@keyframes rp-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
