import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import PhaseHeader from "./PhaseHeader.jsx";
import MilestoneIcon from "./MilestoneIcon.jsx";
import { getTaskType } from "../../lib/taskType.js";

const FONT    = "'Space Grotesk', sans-serif";
const ROW_H   = 120; // px per node row

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

function Spinner({ size = 20, color = "#1d4ed8" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      style={{ animation: "rp-spin 0.85s linear infinite", flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" stroke={`${color}44`} strokeWidth="3" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke={color} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// ─── Alternating left/right layout with center progress bar ──────────────────
function PhaseNodes({ phase, phaseTasks, globalStartIdx, navigate }) {
  const N = phaseTasks.length;
  const completedCount = phaseTasks.filter(
    (t) => t.status === "completed" || t.status === "skipped"
  ).length;
  const fillPct = N > 0 ? Math.min(100, (completedCount / N) * 100) : 0;
  const barHeight = Math.max(0, (N - 1) * ROW_H);

  return (
    <div style={{ position: "relative", paddingBottom: "0.5rem" }}>

      {/* ── Center progress bar ── */}
      {N > 1 && (
        <div style={{
          position: "absolute",
          left: "50%",
          transform: "translateX(-50%)",
          top: ROW_H / 2,
          height: barHeight,
          width: 4,
          borderRadius: 9999,
          background: "rgba(37,99,235,0.1)",
          zIndex: 0,
        }}>
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: `${fillPct}%` }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
            style={{
              width: "100%",
              background: "linear-gradient(180deg, #1d4ed8, #3b82f6)",
              borderRadius: 9999,
            }}
          />
        </div>
      )}

      {/* ── Node rows ── */}
      {phaseTasks.map((task, taskIdx) => {
        const gIdx     = globalStartIdx + taskIdx;
        const isLeft   = taskIdx % 2 === 0;
        const locked   = isTaskLocked(task, phase, phaseTasks);
        const isActive = task.status === "in_progress" || (task.status === "not_started" && !locked);
        const taskType = getTaskType(task, { phaseTasks, taskIndex: taskIdx });
        const label    = task.title;

        const labelEl = (
          <span style={{
            fontFamily: FONT,
            fontSize: "0.78rem",
            fontWeight: 700,
            color: locked ? "#b4bcd4" : task.status === "completed" ? "#059669" : "#0b1340",
            textAlign: isLeft ? "right" : "left",
            maxWidth: 110,
            lineHeight: 1.35,
          }}>
            {label}
          </span>
        );

        return (
          <motion.div
            key={task.id}
            initial={{ opacity: 0, x: isLeft ? -24 : 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: taskIdx * 0.05, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            style={{
              display: "flex",
              alignItems: "center",
              height: ROW_H,
              position: "relative",
              zIndex: 1,
            }}
          >
            {/* Left half */}
            <div style={{
              flex: 1, display: "flex", alignItems: "center",
              justifyContent: "flex-end", paddingRight: 18, gap: 10,
            }}>
              {isLeft && <>{labelEl}<MilestoneIcon task={task} taskType={taskType} isLocked={locked} isActive={isActive} navigate={navigate} index={gIdx} hideLabel /></>}
            </div>

            {/* Right half */}
            <div style={{
              flex: 1, display: "flex", alignItems: "center",
              justifyContent: "flex-start", paddingLeft: 18, gap: 10,
            }}>
              {!isLeft && <><MilestoneIcon task={task} taskType={taskType} isLocked={locked} isActive={isActive} navigate={navigate} index={gIdx} hideLabel />{labelEl}</>}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

// ─── RoadmapPath ──────────────────────────────────────────────────────────────
export default function RoadmapPath({
  phases,
  generatingNextPhase,
  navigate,
}) {
  useMemo(() => phases, [phases]);

  if (!phases || phases.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "3rem 1rem", color: "#9199b8", fontSize: "0.9rem", fontFamily: FONT }}>
        No phases yet. Hang tight while we build your roadmap…
      </div>
    );
  }

  let globalIdx = 0;

  return (
    <div style={{ position: "relative", width: "100%", paddingBottom: "120px" }}>
      {phases.map((phase, phaseIdx) => {
        const isLocked = phase.status === "locked";
        const phaseTasks = (phase.tasks || [])
          .slice()
          .sort((a, b) =>
            (a.week_number || 1) - (b.week_number || 1) ||
            (a.created_at || "").localeCompare(b.created_at || "")
          );
        const completedInPhase = phaseTasks.filter(
          (t) => t.status === "completed" || t.status === "skipped"
        ).length;

        const phaseGlobalStart = globalIdx;
        globalIdx += phaseTasks.length;

        return (
          <div key={phase.id}>
            {/* Phase header */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: phaseIdx * 0.06, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              style={{ marginBottom: "1.75rem" }}
            >
              {isLocked ? (
                <div style={{
                  background: "#f8faff",
                  border: "1.5px dashed rgba(37,99,235,0.2)",
                  borderRadius: "1.25rem",
                  padding: "1rem 1.5rem",
                  display: "flex", alignItems: "center", gap: "0.75rem",
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9199b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  <div>
                    <p style={{ fontFamily: FONT, fontWeight: 700, fontSize: "0.9rem", color: "#9199b8", margin: 0 }}>
                      Phase {phase.phase_number}{phase.title ? ` — ${phase.title}` : ""}
                    </p>
                    <p style={{ fontFamily: FONT, fontSize: "0.75rem", color: "#b4bcd4", margin: "0.15rem 0 0" }}>
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

            {/* Nodes */}
            {!isLocked && phaseTasks.length > 0 && (
              <PhaseNodes
                phase={phase}
                phaseTasks={phaseTasks}
                globalStartIdx={phaseGlobalStart}
                navigate={navigate}
              />
            )}

            {phaseIdx < phases.length - 1 && <div style={{ height: "1.5rem" }} />}
          </div>
        );
      })}

      <AnimatePresence>
        {generatingNextPhase && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "0.75rem", marginTop: "1.25rem" }}
          >
            <Spinner />
            <span style={{ fontFamily: FONT, fontSize: "0.875rem", fontWeight: 600, color: "#1d4ed8" }}>
              Generating your next phase…
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`@keyframes rp-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
