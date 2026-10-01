import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { formatDay, relativeDay } from "../../lib/quest.js";
import { PixelStamp } from "../ui/PixelIcons.jsx";
import { FOCUS_CLASS, RADIUS, SURFACE } from "../ui/tokens.js";
import { INPUT_CLASS, StampTile, Tip } from "../ui/kit.jsx";
import {
  SANS, WHITE, INK, MID, MUTED, LINE, AMBER, AMBER_LINE, AMBER_WASH, DANGER,
  Chunky, DayToggles, ErrorLine, Flame, LevelChip, Modal, Segmented, TextButton,
  choiceLook, fieldStyle, useQuestColors,
} from "./questUi.jsx";

export const MINUTE_OPTIONS = [
  { value: 15, label: "15 min" },
  { value: 30, label: "30 min" },
  { value: 45, label: "45 min" },
];

// ─── Top bar ──────────────────────────────────────────────────────────────────

export function TopBar({ title, stats, streakLit, menu, isMobile }) {
  const c = useQuestColors();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div style={{ padding: isMobile ? "16px 0 12px" : "28px 0 14px", borderBottom: `1px solid ${LINE}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 10 : 14 }}>
        <h1 title={title} style={{ flex: 1, minWidth: 0, margin: 0, fontFamily: SANS, fontWeight: 800,
          fontSize: isMobile ? "1.5rem" : "2.1rem", color: c.title, letterSpacing: "-0.03em", lineHeight: 1.15,
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
          overflowWrap: "anywhere" }}>
          {title}
        </h1>
        <span title={`${stats?.streak || 0} day streak`}
          style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: SANS, fontWeight: 800,
            fontSize: "1.1rem", color: streakLit ? c.page : MUTED, fontVariantNumeric: "tabular-nums" }}>
          <Flame size={24} lit={streakLit} animate={streakLit} streak={stats?.streak || 0} /> {stats?.streak || 0}
        </span>
        <LevelChip stats={stats} compact={isMobile} />
        {menu && menu.length > 0 && (
          <div ref={ref} style={{ position: "relative" }}>
            <button type="button" aria-label="Quest options" aria-expanded={open} onClick={() => setOpen((o) => !o)}
              className={FOCUS_CLASS}
              style={{ width: 44, height: 44, borderRadius: RADIUS.control, border: `1.5px solid ${LINE}`, background: WHITE,
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill={MID} aria-hidden="true">
                <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
              </svg>
            </button>
            {open && (
              <div role="menu" style={{ position: "absolute", right: 0, top: 50, minWidth: 200, background: WHITE,
                borderRadius: RADIUS.control, border: `1px solid ${LINE}`, boxShadow: "0 12px 30px rgba(20,20,19,0.12)", padding: 6, zIndex: 30 }}>
                {menu.map((m) => (
                  <button key={m.label} type="button" role="menuitem" className={FOCUS_CLASS}
                    onClick={() => { setOpen(false); m.onClick(); }}
                    style={{ display: "block", width: "100%", textAlign: "left", fontFamily: SANS, fontWeight: 700,
                      fontSize: "0.95rem", color: m.danger ? DANGER : INK, background: "none", border: "none",
                      borderRadius: 10, padding: "10px 12px", minHeight: 44, cursor: "pointer" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = SURFACE; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}>
                    {m.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Pins the top bar, and the catch-up banner under it, while the map scrolls. */
export function StickyHeader({ children }) {
  return (
    <div style={{ position: "sticky", top: 0, zIndex: 20, background: "rgba(245,245,245,0.94)",
      backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", paddingBottom: 10 }}>
      {children}
    </div>
  );
}

// ─── Banners ──────────────────────────────────────────────────────────────────

/** A banner: soft amber for being behind, a white card otherwise. */
function Strip({ tone = "amber", children, action }) {
  const amber = tone === "amber";
  return (
    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
      style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginTop: 14,
        background: amber ? AMBER_WASH : WHITE, borderRadius: RADIUS.card, padding: "14px 16px", boxSizing: "border-box",
        border: `1px solid ${amber ? AMBER_LINE : LINE}` }}>
      <div style={{ flex: "1 1 220px", fontFamily: SANS, fontSize: "0.98rem", color: INK, lineHeight: 1.5 }}>
        {children}
      </div>
      {action}
    </motion.div>
  );
}

export function CatchUpBanner({ state, onCatchUp }) {
  const b = state.backlog || {};
  if (!b.count || state.welcome_back?.show || state.today_state === "blocked") return null;
  const gate = b.unlocks_milestone && b.in_current
    ? ` Clear ${b.in_current === b.count ? "them" : `the ${b.in_current} in this milestone`} to unlock Milestone ${b.unlocks_milestone}.`
    : "";
  return (
    <Strip action={b.oldest_doable_slot ? <Chunky small tone="amber" onClick={onCatchUp}>Catch up</Chunky> : null}>
      <strong>You're {b.count} task{b.count === 1 ? "" : "s"} behind.</strong>{gate}
      {b.catch_up_by && (
        <span style={{ display: "block", color: MUTED, fontSize: "0.92rem", marginTop: 2 }}>
          Two a day clears it by {relativeDay(b.catch_up_by, state.today)}.
        </span>
      )}
    </Strip>
  );
}

export function WelcomeBack({ state, onCatchUp, onBreak, onLighter, busy }) {
  const w = state.welcome_back || {};
  if (!w.show) return null;
  const b = state.backlog || {};
  return (
    <Strip tone="accent">
      <strong>Welcome back.</strong> You have {b.count} task{b.count === 1 ? "" : "s"} to catch up on
      {b.unlocks_milestone ? ` and Milestone ${b.unlocks_milestone} is waiting.` : "."}
      {w.offer_break ? (
        <>
          <span style={{ display: "block", color: MUTED, fontSize: "0.92rem", marginTop: 6, lineHeight: 1.5 }}>
            That is a lot to make up. You can count the time away as a break: the missed days move to start
            from today, and your streak starts fresh.
          </span>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
            <Chunky small onClick={onBreak} disabled={busy}>Count it as a break</Chunky>
            {state.quest?.daily_minutes > 15 && (
              <Chunky small tone="quiet" onClick={onLighter} disabled={busy}>Switch to 15 min a day</Chunky>
            )}
            {b.oldest_doable_slot && <TextButton onClick={onCatchUp}>Catch up instead</TextButton>}
          </div>
        </>
      ) : (
        b.oldest_doable_slot && (
          <div style={{ marginTop: 10 }}>
            <Chunky small tone="amber" onClick={onCatchUp}>Catch up</Chunky>
          </div>
        )
      )}
    </Strip>
  );
}

export function DeadlineNotice({ state, onAskAdvisor }) {
  if (!state.deadline_risk || !state.quest?.hard_deadline) return null;
  return (
    <Strip action={<Chunky small tone="quiet" onClick={onAskAdvisor}>Ask your advisor</Chunky>}>
      At this pace you finish {formatDay(state.projected_finish)}, after your {formatDay(state.quest.hard_deadline)} deadline.
      Your advisor can trim the milestones that have not started.
    </Strip>
  );
}

export function RestNote({ state }) {
  if (state.today_state !== "rest") return null;
  return (
    <Tip name="Rest day" stamp="clock" tone="default" style={{ marginTop: 14 }}>
      Rest day today.{state.next_work_date ? ` Your next task opens ${relativeDay(state.next_work_date, state.today)}.` : ""}
    </Tip>
  );
}

export function PausedCard({ state, onResume, onRetire, busy }) {
  return (
    <Strip tone="accent" action={
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <Chunky small onClick={onResume} disabled={busy}>Resume</Chunky>
        <TextButton onClick={onRetire} color={MUTED}>Retire</TextButton>
      </div>
    }>
      <strong>Quest paused since {formatDay(state.quest?.paused_on)}.</strong> Your streak and progress are safe,
      and the rest of the quest picks up from the day you come back.
    </Strip>
  );
}

// ─── Milestone and finish cards ───────────────────────────────────────────────

export function MilestoneCard({ milestone, next, onClose }) {
  const c = useQuestColors();
  return (
    <Modal onClose={onClose} label={`Milestone ${milestone.position} complete`}>
      <div style={{ textAlign: "center" }}>
        <motion.div initial={{ scale: 0.4, rotate: -12 }} animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 14 }}
          aria-hidden="true"
          style={{ width: 76, height: 76, borderRadius: RADIUS.card, margin: "0 auto 14px", background: c.softer,
            border: `1px solid ${c.soft}`, color: c.onSoft, boxSizing: "border-box",
            display: "flex", alignItems: "center", justifyContent: "center" }}>
          <PixelStamp kind="flag" size={40} />
        </motion.div>
        <p style={{ margin: 0, fontFamily: SANS, fontWeight: 800, fontSize: "0.95rem", color: c.text }}>
          Milestone {milestone.position} complete, +50 XP
        </p>
        <h2 style={{ margin: "6px 0 14px", fontFamily: SANS, fontWeight: 800, fontSize: "1.45rem", color: INK, lineHeight: 1.25 }}>
          {milestone.title}
        </h2>
      </div>
      {milestone.lines?.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "0 0 18px" }}>
          <p style={{ margin: 0, fontFamily: SANS, fontWeight: 700, fontSize: "0.9rem", color: MUTED }}>What you did, in your words:</p>
          {milestone.lines.map((l, i) => (
            <p key={i} style={{ margin: 0, fontFamily: SANS, fontSize: "0.98rem", color: MID, lineHeight: 1.5,
              background: SURFACE, border: `1px solid ${LINE}`, borderRadius: 12, padding: "8px 12px" }}>{l}</p>
          ))}
        </div>
      )}
      {next && (
        <p style={{ margin: "0 0 16px", fontFamily: SANS, fontSize: "0.98rem", color: MID, textAlign: "center" }}>
          Up next: <strong style={{ color: INK }}>{next.title}</strong>
        </p>
      )}
      <Chunky full onClick={onClose}>Keep going</Chunky>
    </Modal>
  );
}

export function FinishCard({ state, onAddToPortfolio, onDismissPortfolio, onNewQuest, busy }) {
  const c = useQuestColors();
  const q = state.quest;
  const done = state.completion || {};
  const offer = q.add_to_portfolio && !q.portfolio_activity_id;
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      style={{ marginTop: 16, background: WHITE, borderRadius: RADIUS.card, padding: "22px 20px", boxSizing: "border-box",
        border: `1px solid ${LINE}` }}>
      <p style={{ margin: 0, display: "flex", alignItems: "center", gap: 10, fontFamily: SANS, fontWeight: 800,
        fontSize: "0.95rem", color: c.text }}>
        <StampTile kind="star" size={32} /> Quest complete
      </p>
      <h2 style={{ margin: "6px 0 10px", fontFamily: SANS, fontWeight: 800, fontSize: "1.5rem", color: INK, lineHeight: 1.25 }}>
        {q.title}
      </h2>
      <p style={{ margin: "0 0 16px", fontFamily: SANS, fontSize: "1rem", color: MID, lineHeight: 1.55 }}>
        {done.tasks} tasks over {done.days} days, {done.on_time === done.tasks ? "all" : done.on_time} on time,
        for {done.xp_earned} XP.
      </p>
      {offer && (
        <div style={{ background: c.softer, border: `1px solid ${c.soft}`, borderRadius: RADIUS.control,
          padding: "14px 16px", marginBottom: 16 }}>
          <p style={{ margin: "0 0 10px", fontFamily: SANS, fontSize: "0.98rem", color: INK, lineHeight: 1.5 }}>
            This is real work. Add it to your activities so your applications can use it.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <Chunky small onClick={onAddToPortfolio} disabled={busy}>Draft the entry</Chunky>
            <TextButton onClick={onDismissPortfolio} color={MUTED}>Not now</TextButton>
          </div>
        </div>
      )}
      {q.portfolio_activity_id && (
        <p style={{ margin: "0 0 16px", fontFamily: SANS, fontWeight: 700, color: c.text }}>In your activities.</p>
      )}
      <Chunky full onClick={onNewQuest}>Start a new quest</Chunky>
    </motion.div>
  );
}

// ─── Dialogs ──────────────────────────────────────────────────────────────────

export function ConfirmModal({ title, body, confirm, onConfirm, onClose, busy, danger }) {
  return (
    <Modal onClose={onClose} locked={busy} label={title} width={400}>
      <h2 style={{ margin: "0 0 8px", fontFamily: SANS, fontWeight: 800, fontSize: "1.25rem", color: INK }}>{title}</h2>
      <p style={{ margin: "0 0 20px", fontFamily: SANS, fontSize: "0.98rem", color: MID, lineHeight: 1.6 }}>{body}</p>
      <div style={{ display: "flex", gap: 10 }}>
        <Chunky tone="quiet" onClick={onClose} disabled={busy} style={{ flex: 1 }}>Keep going</Chunky>
        <Chunky tone={danger ? "danger" : "accent"} onClick={onConfirm} disabled={busy} style={{ flex: 1 }}>
          {busy ? "One moment..." : confirm}
        </Chunky>
      </div>
    </Modal>
  );
}

export function PaceModal({ quest, onSave, onClose }) {
  const [minutes, setMinutes] = useState(quest.daily_minutes);
  const [rest, setRest] = useState(quest.rest_days || []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const save = async () => {
    setBusy(true); setError(null);
    try { await onSave({ daily_minutes: minutes, rest_days: rest }); }
    catch (e) { setError(e.message); setBusy(false); }
  };
  return (
    <Modal onClose={onClose} locked={busy} label="Change pace">
      <h2 style={{ margin: "0 0 16px", fontFamily: SANS, fontWeight: 800, fontSize: "1.3rem", color: INK }}>Change pace</h2>
      <p style={{ margin: "0 0 8px", fontFamily: SANS, fontWeight: 800, fontSize: "0.95rem", color: INK }}>Time a day</p>
      <Segmented options={MINUTE_OPTIONS} value={minutes} onChange={setMinutes} label="Time a day" />
      <p style={{ margin: "18px 0 8px", fontFamily: SANS, fontWeight: 800, fontSize: "0.95rem", color: INK }}>Rest days</p>
      <DayToggles value={rest} onChange={setRest} />
      <p style={{ margin: "8px 0 0", fontFamily: SANS, fontSize: "0.92rem", color: MUTED, lineHeight: 1.5 }}>
        Crossed-out days are off. Days that already happened stay as they were.
      </p>
      <ErrorLine>{error}</ErrorLine>
      <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
        <Chunky tone="quiet" onClick={onClose} disabled={busy} style={{ flex: 1 }}>Cancel</Chunky>
        <Chunky onClick={save} disabled={busy} style={{ flex: 1 }}>{busy ? "Saving..." : "Save"}</Chunky>
      </div>
    </Modal>
  );
}

const CATEGORIES = [
  "Academic", "Art", "Athletics: Club", "Athletics: JV/Varsity", "Career Oriented",
  "Community Service (Volunteer)", "Computer/Technology", "Cultural", "Dance", "Debate/Speech",
  "Environmental", "Family Responsibilities", "Foreign Exchange", "Foreign Language",
  "Internship", "Journalism/Publication", "Junior R.O.T.C.", "LGBT", "Music: Instrumental",
  "Music: Vocal", "Religious", "Research", "Robotics", "School Spirit",
  "Science/Math", "Student Govt./Politics", "Theater/Drama", "Work (Paid)", "Other",
];

function Field({ label, hint, children }) {
  return (
    <label style={{ display: "block", marginBottom: 14 }}>
      <span style={{ display: "flex", justifyContent: "space-between", fontFamily: SANS, fontWeight: 800,
        fontSize: "0.95rem", color: INK, marginBottom: 6 }}>
        {label}{hint && <span style={{ fontWeight: 600, color: MUTED }}>{hint}</span>}
      </span>
      {children}
    </label>
  );
}

export function PortfolioDraftModal({ draft, loading, error, onSave, onClose }) {
  const c = useQuestColors();
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState(null);
  useEffect(() => { if (draft && !f) setF({ ...draft, grade_levels: draft.grade_levels || [] }); }, [draft, f]);
  const set = (k) => (e) => setF((prev) => ({ ...prev, [k]: e.target.value }));
  const toggleGrade = (g) => setF((prev) => {
    const has = prev.grade_levels.includes(g);
    return { ...prev, grade_levels: has ? prev.grade_levels.filter((x) => x !== g) : [...prev.grade_levels, g].sort() };
  });
  const save = async () => {
    if (!f.title?.trim()) { setSaveError("Give the activity a name."); return; }
    setBusy(true); setSaveError(null);
    try {
      await onSave({
        ...f,
        hours_per_week: f.hours_per_week === "" ? null : Number(f.hours_per_week),
        weeks_per_year: f.weeks_per_year === "" ? null : Number(f.weeks_per_year),
      });
    } catch (e) { setSaveError(e.message); setBusy(false); }
  };

  return (
    <Modal onClose={onClose} locked={busy} label="Add to your activities" width={560}>
      <h2 style={{ margin: "0 0 6px", fontFamily: SANS, fontWeight: 800, fontSize: "1.3rem", color: INK }}>Add to your activities</h2>
      <p style={{ margin: "0 0 18px", fontFamily: SANS, fontSize: "0.95rem", color: MUTED, lineHeight: 1.55 }}>
        Drafted from your check-ins in Common App format. Change anything that is not quite right.
      </p>
      {loading && <p style={{ fontFamily: SANS, fontWeight: 700, color: MID }}>Drafting the entry...</p>}
      {!loading && error && <ErrorLine>{error}</ErrorLine>}
      {!loading && f && (
        <>
          <Field label="Activity name"><input value={f.title || ""} onChange={set("title")} maxLength={120} className={INPUT_CLASS} style={fieldStyle} /></Field>
          <Field label="Category">
            <select value={f.category || "Other"} onChange={set("category")} className={INPUT_CLASS} style={fieldStyle}>
              {CATEGORIES.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </Field>
          <Field label="Your role" hint={`${(f.position || "").length}/50`}>
            <input value={f.position || ""} onChange={set("position")} maxLength={50} className={INPUT_CLASS} style={fieldStyle} />
          </Field>
          <Field label="Organization" hint={`${(f.organization || "").length}/100`}>
            <input value={f.organization || ""} onChange={set("organization")} maxLength={100} className={INPUT_CLASS} style={fieldStyle} />
          </Field>
          <Field label="Description" hint={`${(f.description || "").length}/150`}>
            <textarea value={f.description || ""} onChange={set("description")} maxLength={150} rows={3}
              className={INPUT_CLASS} style={{ ...fieldStyle, resize: "vertical" }} />
          </Field>
          <div style={{ display: "flex", gap: 12 }}>
            <Field label="Hours a week">
              <input type="number" min="0" step="0.5" value={f.hours_per_week ?? ""} onChange={set("hours_per_week")} className={INPUT_CLASS} style={fieldStyle} />
            </Field>
            <Field label="Weeks a year">
              <input type="number" min="0" max="52" value={f.weeks_per_year ?? ""} onChange={set("weeks_per_year")} className={INPUT_CLASS} style={fieldStyle} />
            </Field>
          </div>
          <Field label="Grades you did this in">
            <div style={{ display: "flex", gap: 8 }}>
              {[9, 10, 11, 12].map((g) => {
                const on = f.grade_levels.includes(g);
                return (
                  <button key={g} type="button" aria-pressed={on} onClick={() => toggleGrade(g)} className={FOCUS_CLASS}
                    style={{ ...choiceLook(c, on), padding: "8px 16px", minWidth: 52 }}>
                    {g}
                  </button>
                );
              })}
            </div>
          </Field>
          <ErrorLine>{saveError}</ErrorLine>
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <Chunky tone="quiet" onClick={onClose} disabled={busy} style={{ flex: 1 }}>Cancel</Chunky>
            <Chunky onClick={save} disabled={busy} style={{ flex: 1 }}>{busy ? "Adding..." : "Add to activities"}</Chunky>
          </div>
        </>
      )}
    </Modal>
  );
}

export function Notice({ children, tone }) {
  if (!children) return null;
  return (
    <p role="status" style={{ margin: "14px 0 0", fontFamily: SANS, fontWeight: 700, fontSize: "0.95rem", lineHeight: 1.5,
      borderRadius: RADIUS.control, padding: "10px 14px",
      ...(tone === "error"
        ? { color: DANGER, background: "#fdf1f0", border: "1px solid #f4c7c2" }
        : { color: AMBER, background: AMBER_WASH, border: `1px solid ${AMBER_LINE}` }) }}>
      {children}
    </p>
  );
}
