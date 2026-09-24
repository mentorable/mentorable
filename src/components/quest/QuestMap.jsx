import { Fragment, forwardRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { formatDay, relativeDay } from "../../lib/quest.js";
import {
  SANS, WHITE, INK, MID, MUTED, FAINT, STONE, STONE_EDGE, AMBER, AMBER_EDGE, AMBER_WASH,
  Chunky, Flame, useQuestColors,
} from "./questUi.jsx";

// The quest drawn as a climb: the start at the bottom, the finish line at the
// top, one stone per scheduled day and a plate for each milestone. The page
// scrolls today's stone into view, so the direction never costs a student a
// scroll to find where they are.

const ZIG = 0.9;

function offsetFor(slot, amp) {
  return Math.round(Math.sin((slot - 1) * ZIG) * amp);
}

function Icon({ name, color, size = 22 }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: color,
    strokeWidth: 3, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
  if (name === "check") return <svg {...common}><polyline points="5 12.5 10 17 19 7" /></svg>;
  if (name === "lock") return (
    <svg {...common} strokeWidth={2.4}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
  );
  if (name === "flag") return (
    <svg {...common} strokeWidth={2.4}><path d="M5 21V4" /><path d="M5 4h11l-2 4 2 4H5" /></svg>
  );
  if (name === "star") return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path fill={color} d="M12 2.8l2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-2.9-5.4 2.9 1.1-6L3.2 9.2l6.1-.8L12 2.8z" />
    </svg>
  );
  return null;
}

// ─── A stone ──────────────────────────────────────────────────────────────────

const Stone = forwardRef(function Stone({ stone, todayState, onOpen, justDone, amp, label }, ref) {
  const c = useQuestColors();
  const reduce = useReducedMotion();
  const { state, doable } = stone;
  const isToday = state === "today" || (todayState === "done" && stone.isTodaySlot);
  const size = isToday ? 70 : state === "future" ? 46 : 56;

  let bg = STONE, edge = STONE_EDGE, border = "none", icon = null, cursor = "default";
  if (state === "done") {
    bg = c.accent; edge = c.edge; icon = <Icon name="check" color={WHITE} />; cursor = "pointer";
  } else if (state === "late") {
    bg = c.soft; edge = c.accent; icon = <Icon name="check" color={c.edge} />; cursor = "pointer";
  } else if (state === "missed") {
    bg = doable ? AMBER_WASH : "#f0f0ee";
    edge = doable ? AMBER_EDGE : STONE_EDGE;
    border = `3px dashed ${doable ? AMBER_EDGE : STONE_EDGE}`;
    icon = doable ? null : <Icon name="lock" color={FAINT} size={18} />;
    cursor = "pointer";
  } else if (state === "today") {
    if (doable) {
      bg = WHITE; edge = c.edge; border = `4px solid ${c.accent}`;
      icon = <Icon name="star" color={c.accent} size={28} />;
    } else {
      bg = "#efefed"; edge = STONE_EDGE; icon = <Icon name="lock" color={FAINT} size={24} />;
    }
    cursor = "pointer";
  }

  const pop = justDone && !reduce;
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: isToday ? "10px 0" : "6px 0" }}>
      <div style={{ position: "relative", transform: `translateX(${offsetFor(stone.slot, amp)}px)` }}>
        {state === "today" && doable && (
          <span className="quest-halo" aria-hidden="true" style={{
            position: "absolute", inset: -8, borderRadius: "50%", border: `3px solid ${c.accent}`,
            animation: "quest-halo 1.8s ease-out infinite",
          }} />
        )}
        <motion.button
          ref={ref}
          type="button"
          className="quest-stone"
          aria-label={label}
          title={label}
          onClick={() => onOpen(stone)}
          initial={pop ? { scale: 0.55 } : false}
          animate={pop ? { scale: [0.55, 1.15, 1] } : { scale: 1 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          style={{
            width: size, height: size, borderRadius: "50%", cursor,
            background: bg, border, boxSizing: "border-box",
            boxShadow: state === "future" ? `0 4px 0 ${edge}` : `0 5px 0 ${edge}`,
            display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
          }}
        >
          {icon}
        </motion.button>
      </div>
    </div>
  );
});

// ─── Today's callout ──────────────────────────────────────────────────────────

function TodayCallout({ state, task, onStart, onCatchUp, amp, slot }) {
  const c = useQuestColors();
  const todayState = state.today_state;
  const unlocks = state.backlog?.unlocks_milestone;
  const inCurrent = state.backlog?.in_current || 0;

  let body;
  if (todayState === "open") {
    body = (
      <>
        <p style={{ margin: 0, fontFamily: SANS, fontSize: "0.86rem", fontWeight: 800, color: c.accent }}>
          Today{task ? `, about ${task.est_minutes} min` : ""}
        </p>
        <p style={{ margin: "4px 0 12px", fontFamily: SANS, fontSize: "1.06rem", fontWeight: 800, color: INK, lineHeight: 1.35 }}>
          {task ? task.title : "Setting up today's task..."}
        </p>
        <Chunky full onClick={onStart} disabled={!task}>Start</Chunky>
      </>
    );
  } else if (todayState === "done") {
    body = (
      <>
        <p style={{ margin: 0, fontFamily: SANS, fontSize: "0.86rem", fontWeight: 800, color: c.accent, display: "flex", alignItems: "center", gap: 6 }}>
          <Flame size={16} /> Done for today
        </p>
        <p style={{ margin: "4px 0 0", fontFamily: SANS, fontSize: "0.98rem", fontWeight: 600, color: MID, lineHeight: 1.45 }}>
          {state.next_work_date
            ? `Your next task opens ${relativeDay(state.next_work_date, state.today)}.`
            : "That was the last day of this quest."}
        </p>
      </>
    );
  } else if (todayState === "blocked") {
    body = (
      <>
        <p style={{ margin: 0, fontFamily: SANS, fontSize: "0.86rem", fontWeight: 800, color: AMBER }}>
          Today's task is locked
        </p>
        <p style={{ margin: "4px 0 12px", fontFamily: SANS, fontSize: "0.98rem", fontWeight: 600, color: MID, lineHeight: 1.45 }}>
          Clear {inCurrent} catch-up task{inCurrent === 1 ? "" : "s"} to unlock Milestone {unlocks}.
          {state.stats?.streak > 0 ? " Do it today and your streak lives." : " Do it today to start a new streak."}
        </p>
        <Chunky full tone="amber" onClick={onCatchUp}>Catch up</Chunky>
      </>
    );
  } else {
    return null;
  }

  const shift = Math.max(-amp, Math.min(amp, offsetFor(slot, amp)));
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
      style={{ display: "flex", justifyContent: "center", padding: "6px 0 2px" }}
    >
      <div style={{
        position: "relative", width: "min(320px, 100%)", transform: `translateX(${shift * 0.35}px)`,
        background: WHITE, borderRadius: 18, padding: "14px 16px 16px",
        border: `2px solid ${todayState === "blocked" ? AMBER_EDGE : c.accent}`,
        boxShadow: `0 4px 0 ${todayState === "blocked" ? AMBER_EDGE : c.edge}`,
      }}>
        {body}
        <span aria-hidden="true" style={{
          position: "absolute", left: `calc(50% + ${shift * 0.65}px - 9px)`, bottom: -11,
          width: 16, height: 16, background: WHITE, transform: "rotate(45deg)",
          borderRight: `2px solid ${todayState === "blocked" ? AMBER_EDGE : c.accent}`,
          borderBottom: `2px solid ${todayState === "blocked" ? AMBER_EDGE : c.accent}`,
        }} />
      </div>
    </motion.div>
  );
}

// ─── Milestone plates ─────────────────────────────────────────────────────────

function Plate({ milestone, isLast, state, glow }) {
  const c = useQuestColors();
  const reduce = useReducedMotion();
  const done = milestone.state === "done";
  const current = milestone.state === "current";
  const locked = milestone.state === "locked";
  const gateCount = locked && state.backlog?.unlocks_milestone === milestone.position ? state.backlog.in_current : 0;

  const bg = done ? c.accent : current ? WHITE : "#efefed";
  const fg = done ? WHITE : current ? INK : MUTED;
  const edge = done ? c.edge : current ? c.accent : STONE_EDGE;

  let right;
  if (done) right = <Icon name="check" color={WHITE} />;
  else if (locked) right = (
    <span style={{ display: "flex", alignItems: "center", gap: 6, color: gateCount ? AMBER : FAINT,
      fontFamily: SANS, fontWeight: 800, fontSize: "0.85rem" }}>
      <Icon name="lock" color={gateCount ? AMBER : FAINT} size={18} />
      {gateCount ? `${gateCount} to unlock` : null}
    </span>
  );

  const finishLine = isLast && !done && (state.projected_finish ? `Finish line, on pace for ${formatDay(state.projected_finish)}` : "Finish line");

  return (
    <motion.div
      initial={false}
      animate={glow && !reduce ? { scale: [1, 1.05, 1] } : { scale: 1 }}
      transition={{ duration: 0.7 }}
      style={{ display: "flex", justifyContent: "center", padding: "14px 0" }}
    >
      <div style={{
        width: "min(420px, 100%)", boxSizing: "border-box", display: "flex", alignItems: "center", gap: 14,
        background: bg, color: fg, borderRadius: 18, padding: "14px 16px",
        border: current ? `2px solid ${c.accent}` : "2px solid transparent",
        boxShadow: glow ? `0 5px 0 ${edge}, 0 0 0 6px rgba(${c.accentRgb},0.18)` : `0 5px 0 ${edge}`,
      }}>
        <span style={{
          width: 42, height: 42, borderRadius: 12, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
          background: done ? "rgba(255,255,255,0.18)" : current ? c.wash : "#e4e4e1",
        }}>
          <Icon name="flag" color={done ? WHITE : current ? c.accent : FAINT} size={20} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontFamily: SANS, fontSize: "0.8rem", fontWeight: 700, opacity: done ? 0.85 : 1,
            color: done ? WHITE : current ? c.accent : FAINT }}>
            {finishLine || `Milestone ${milestone.position}`}
          </p>
          <p style={{ margin: "2px 0 0", fontFamily: SANS, fontSize: "1rem", fontWeight: 800, lineHeight: 1.3 }}>
            {milestone.title}
          </p>
        </div>
        {right}
      </div>
    </motion.div>
  );
}

// ─── The map ──────────────────────────────────────────────────────────────────

function stoneLabel(stone, today) {
  const day = formatDay(stone.date);
  const what = {
    done: "done", late: "caught up",
    missed: stone.doable ? "missed, tap to catch up" : "missed, locked until the milestone before it is done",
    today: stone.doable ? "today's task" : "today's task, locked",
    future: `opens ${relativeDay(stone.date, today)}`,
  }[stone.state];
  return `Day ${stone.slot}, ${day}: ${what}`;
}

export default function QuestMap({ state, todayRef, focusSlot, onOpen, onStartToday, onCatchUp, justDone, glowMilestone, isMobile }) {
  const amp = isMobile ? 58 : 92;
  const stones = state.stones || [];
  const milestones = state.milestones || [];
  const todaySlot = state.today_slot;

  // Top to bottom: the last milestone (the finish) down to the start.
  const blocks = [...milestones].reverse().map((m, i) => {
    const mine = stones.filter((s) => s.slot >= m.first_slot && s.slot <= m.last_slot).reverse();
    return (
      <Fragment key={m.id}>
        <Plate milestone={m} isLast={i === 0} state={state} glow={glowMilestone === m.position} />
        {mine.map((s) => (
          <Fragment key={s.slot}>
            {s.slot === todaySlot && (
              <TodayCallout state={state} task={state.today_task} onStart={onStartToday} onCatchUp={onCatchUp}
                amp={amp} slot={s.slot} />
            )}
            <Stone
              ref={s.slot === focusSlot ? todayRef : undefined}
              stone={{ ...s, isTodaySlot: s.slot === todaySlot }}
              todayState={state.today_state}
              onOpen={onOpen}
              justDone={justDone === s.slot}
              amp={amp}
              label={stoneLabel(s, state.today)}
            />
          </Fragment>
        ))}
      </Fragment>
    );
  });

  return (
    <div style={{ position: "relative", padding: "8px 0 24px" }}>
      {blocks}
      <div style={{ display: "flex", justifyContent: "center", paddingTop: 12 }}>
        <span style={{ fontFamily: SANS, fontSize: "0.86rem", fontWeight: 700, color: FAINT,
          background: WHITE, borderRadius: 99, padding: "6px 14px", border: `2px solid ${STONE}` }}>
          Started {formatDay(state.quest?.start_date)}
        </span>
      </div>
    </div>
  );
}
