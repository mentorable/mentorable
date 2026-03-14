import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import PhaseHeader from "./PhaseHeader.jsx";
import TaskCard from "./TaskCard.jsx";

// Group tasks by week_number, sorted ascending
function groupByWeek(tasks) {
  const map = {};
  (tasks || []).forEach((t) => {
    const w = t.week_number || 1;
    if (!map[w]) map[w] = [];
    map[w].push(t);
  });
  return Object.entries(map)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([week, tasks]) => ({ week: Number(week), tasks }));
}

// Find the current active week in a phase (lowest week with incomplete tasks)
function findCurrentWeek(phase) {
  if (phase.status !== "active") return null;
  const tasks = phase.tasks || [];
  const incomplete = tasks.filter(
    (t) => t.status !== "completed" && t.status !== "skipped"
  );
  if (incomplete.length === 0) return null;
  return Math.min(...incomplete.map((t) => t.week_number || 1));
}

// Checkpoint diamond component
function CheckpointDiamond({ status }) {
  const colors = {
    completed: { bg: "#6366f1", border: "#4f46e5", dot: "white" },
    active:    { bg: "#ffffff", border: "#6366f1", dot: "#6366f1" },
    locked:    { bg: "#f8fafc", border: "#cbd5e1", dot: "#cbd5e1" },
  };
  const c = colors[status] || colors.locked;

  return (
    <motion.div
      animate={status === "active" ? { scale: [1, 1.15, 1] } : {}}
      transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
      style={{
        width: 28,
        height: 28,
        background: c.bg,
        border: `2.5px solid ${c.border}`,
        borderRadius: "4px",
        transform: "rotate(45deg)",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: status === "active" ? `0 0 0 4px ${c.border}20` : "none",
      }}
    >
      {status === "completed" && (
        <div style={{ transform: "rotate(-45deg)" }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={c.dot} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
      )}
    </motion.div>
  );
}

// Week circle node on the line
function WeekNode({ week, status }) {
  const colors = {
    done:    { bg: "#6366f1", border: "#4f46e5" },
    current: { bg: "#ffffff", border: "#6366f1" },
    future:  { bg: "#f8fafc", border: "#cbd5e1" },
  };
  const c = colors[status] || colors.future;

  return (
    <div style={{
      width: 14,
      height: 14,
      borderRadius: "50%",
      background: c.bg,
      border: `2px solid ${c.border}`,
      flexShrink: 0,
    }} />
  );
}

export default function RoadmapPath({
  roadmap,
  phases,
  onTaskComplete,
  onTaskFlagNotForMe,
  onPhaseComplete,
  generatingNextPhase,
}) {
  const activePhase = useMemo(
    () => (phases || []).find((p) => p.status === "active"),
    [phases]
  );

  const currentWeekByPhase = useMemo(() => {
    const map = {};
    (phases || []).forEach((p) => {
      map[p.id] = findCurrentWeek(p);
    });
    return map;
  }, [phases]);

  if (!phases || phases.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "3rem 1rem", color: "#94a3b8", fontSize: "0.9rem" }}>
        No phases yet. Hang tight while we build your roadmap...
      </div>
    );
  }

  return (
    <div style={{ position: "relative", width: "100%", paddingBottom: "120px" }}>
      {/* Vertical line */}
      <div style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        left: "31px",
        width: "3px",
        background: "linear-gradient(180deg, #6366f1 0%, #c7d2fe 60%, #e2e8f0 100%)",
        borderRadius: "9999px",
        zIndex: 0,
      }} />

      {/* Phases */}
      {phases.map((phase, phaseIdx) => {
        const isCompleted = phase.status === "completed";
        const isActive = phase.status === "active";
        const isLocked = phase.status === "locked";
        const currentWeek = currentWeekByPhase[phase.id];
        const weekGroups = groupByWeek(phase.tasks || []);

        const checkpointStatus = isCompleted ? "completed" : isActive ? "active" : "locked";

        return (
          <div key={phase.id} style={{ position: "relative" }}>
            {/* Phase checkpoint diamond + header */}
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: phaseIdx * 0.08, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "1rem",
                marginBottom: "1.25rem",
                position: "relative",
                zIndex: 1,
              }}
            >
              {/* Diamond on the line */}
              <div style={{
                width: "64px",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                paddingTop: "0.2rem",
              }}>
                <CheckpointDiamond status={checkpointStatus} />
              </div>

              {/* Phase header card — full width to the right */}
              <div style={{ flex: 1, minWidth: 0 }}>
                {isLocked ? (
                  // Locked phase — show minimal locked card
                  <div style={{
                    background: "#f8fafc",
                    border: "1.5px dashed #e2e8f0",
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
                      <p style={{
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                        fontWeight: 700,
                        fontSize: "0.875rem",
                        color: "#94a3b8",
                        margin: 0,
                      }}>
                        Phase {phase.phase_number}{phase.title ? ` · ${phase.title}` : ""}
                      </p>
                      <p style={{ fontSize: "0.75rem", color: "#cbd5e1", margin: "0.1rem 0 0 0" }}>
                        Complete the current phase to unlock
                      </p>
                    </div>
                  </div>
                ) : (
                  <PhaseHeader phase={phase} currentWeek={currentWeek} />
                )}
              </div>
            </motion.div>

            {/* Week groups — only for non-locked phases */}
            {!isLocked && weekGroups.map(({ week, tasks: weekTasks }, weekIdx) => {
              // All weeks in an active phase are visible (not locked)
              // Only the NEXT PHASE is locked, not the next week
              const allWeekDone = weekTasks.every(
                (t) => t.status === "completed" || t.status === "skipped"
              );
              const weekStatus = isCompleted || allWeekDone ? "done" : "current";

              const isCurrentWeek = weekStatus === "current";
              const isFutureWeek = false; // weeks within a phase are never locked

              return (
                <motion.div
                  key={week}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    delay: phaseIdx * 0.08 + weekIdx * 0.05,
                    duration: 0.35,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "1rem",
                    marginBottom: "1rem",
                    position: "relative",
                    zIndex: 1,
                  }}
                >
                  {/* Week node + label */}
                  <div style={{
                    width: "64px",
                    flexShrink: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    paddingTop: "0.6rem",
                    gap: "0.25rem",
                  }}>
                    <WeekNode week={week} status={weekStatus} />
                    <span style={{
                      fontSize: "0.6rem",
                      fontWeight: 700,
                      letterSpacing: "0.05em",
                      color: isCurrentWeek ? "#6366f1" : "#94a3b8",
                      textTransform: "uppercase",
                      textAlign: "center",
                      lineHeight: 1.2,
                    }}>
                      W{week}
                    </span>
                  </div>

                  {/* Tasks */}
                  <div style={{
                    flex: 1,
                    minWidth: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.625rem",
                    position: "relative",
                  }}>
                    {/* Blur overlay for future weeks */}
                    {isFutureWeek && (
                      <div style={{
                        position: "absolute",
                        inset: "-0.25rem",
                        borderRadius: "1rem",
                        backdropFilter: "blur(3px)",
                        WebkitBackdropFilter: "blur(3px)",
                        background: "rgba(248,250,252,0.6)",
                        zIndex: 2,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        pointerEvents: "none",
                      }}>
                        <div style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.4rem",
                          background: "rgba(255,255,255,0.9)",
                          borderRadius: "9999px",
                          padding: "0.3rem 0.75rem",
                          boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                        }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                          </svg>
                          <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#6366f1" }}>
                            Week {week} — unlocks after current week
                          </span>
                        </div>
                      </div>
                    )}

                    {weekTasks.map((task) => {
                      const taskCompleted = task.status === "completed";
                      return (
                        <TaskCard
                          key={task.id}
                          task={task}
                          isLocked={isFutureWeek}
                          isCompleted={taskCompleted}
                          onComplete={() => onTaskComplete && onTaskComplete(task.id, phase.id)}
                          onFlagNotForMe={() => onTaskFlagNotForMe && onTaskFlagNotForMe(task.id, phase.id)}
                        />
                      );
                    })}
                  </div>
                </motion.div>
              );
            })}

            {/* Spacing between phases */}
            {phaseIdx < phases.length - 1 && (
              <div style={{ height: "1rem" }} />
            )}
          </div>
        );
      })}

      {/* Generating next phase spinner node */}
      <AnimatePresence>
        {generatingNextPhase && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "1rem",
              position: "relative",
              zIndex: 1,
              marginTop: "1rem",
            }}
          >
            {/* Pulsing spinner node on line */}
            <div style={{
              width: "64px",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              paddingTop: "0.25rem",
            }}>
              <motion.div
                animate={{ scale: [1, 1.25, 1], opacity: [0.6, 1, 0.6] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: "rgba(99,102,241,0.15)",
                  border: "2.5px dashed #6366f1",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  style={{ animation: "rp-spin 1s linear infinite" }}
                >
                  <circle cx="12" cy="12" r="10" stroke="rgba(99,102,241,0.3)" strokeWidth="3" />
                  <path d="M12 2a10 10 0 0 1 10 10" stroke="#6366f1" strokeWidth="3" strokeLinecap="round" />
                </svg>
              </motion.div>
            </div>

            {/* Generating label */}
            <div style={{
              flex: 1,
              background: "rgba(99,102,241,0.06)",
              border: "1.5px dashed #c7d2fe",
              borderRadius: "1rem",
              padding: "1rem 1.25rem",
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
            }}>
              <motion.span
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                style={{
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  color: "#6366f1",
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}
              >
                Generating your next phase...
              </motion.span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        @keyframes rp-spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
