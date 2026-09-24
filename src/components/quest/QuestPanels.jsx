import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { formatDay, relativeDay } from "../../lib/quest.js";
import {
  SANS, WHITE, INK, MID, MUTED, FAINT, LINE, AMBER, AMBER_EDGE, AMBER_WASH,
  Chunky, DayToggles, ErrorLine, Flame, LevelChip, Modal, Segmented, TextButton,
  fieldStyle, useQuestColors,
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
    <div style={{ padding: isMobile ? "12px 0 10px" : "18px 0 12px", borderBottom: `2px solid ${LINE}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <h1 style={{ flex: 1, minWidth: 0, margin: 0, fontFamily: SANS, fontWeight: 800,
          fontSize: isMobile ? "1.15rem" : "1.45rem", color: INK, letterSpacing: "-0.01em",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {title}
        </h1>
        <span title={`${stats?.streak || 0} day streak`}
          style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: SANS, fontWeight: 800,
            fontSize: "1.1rem", color: streakLit ? c.accent : FAINT, fontVariantNumeric: "tabular-nums" }}>
          <Flame size={24} lit={streakLit} animate={streakLit} streak={stats?.streak || 0} /> {stats?.streak || 0}
        </span>
        <LevelChip stats={stats} compact={isMobile} />
        {menu && menu.length > 0 && (
          <div ref={ref} style={{ position: "relative" }}>
            <button type="button" aria-label="Quest options" aria-expanded={open} onClick={() => setOpen((o) => !o)}
              style={{ width: 38, height: 38, borderRadius: 12, border: `2px solid ${LINE}`, background: WHITE,
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill={MID} aria-hidden="true">
                <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
              </svg>
            </button>
            {open && (
              <div role="menu" style={{ position: "absolute", right: 0, top: 46, minWidth: 190, background: WHITE,
                borderRadius: 14, border: `2px solid ${LINE}`, boxShadow: "0 12px 30px rgba(0,0,0,0.12)", padding: 6, zIndex: 30 }}>
                {menu.map((m) => (
                  <button key={m.label} type="button" role="menuitem"
                    onClick={() => { setOpen(false); m.onClick(); }}
                    style={{ display: "block", width: "100%", textAlign: "left", fontFamily: SANS, fontWeight: 700,
                      fontSize: "0.95rem", color: m.danger ? "#b42318" : INK, background: "none", border: "none",
                      borderRadius: 10, padding: "10px 12px", cursor: "pointer" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "#f3f3f1"; }}
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

function Strip({ tone = "amber", children, action }) {
  const c = useQuestColors();
  const amber = tone === "amber";
  return (
    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
      style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginTop: 14,
        background: amber ? AMBER_WASH : WHITE, borderRadius: 16, padding: "14px 16px",
        border: `2px solid ${amber ? AMBER_EDGE : c.accent}` }}>
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
        <span style={{ display: "block", color: MUTED, fontSize: "0.9rem", marginTop: 2 }}>
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
    <p style={{ margin: "14px 0 0", fontFamily: SANS, fontSize: "0.98rem", fontWeight: 600, color: MUTED }}>
      Rest day today.{state.next_work_date ? ` Your next task opens ${relativeDay(state.next_work_date, state.today)}.` : ""}
    </p>
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
          style={{ width: 76, height: 76, borderRadius: 22, margin: "0 auto 14px", background: c.accent,
            boxShadow: `0 6px 0 ${c.edge}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={WHITE} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 21V4" /><path d="M5 4h11l-2 4 2 4H5" />
          </svg>
        </motion.div>
        <p style={{ margin: 0, fontFamily: SANS, fontWeight: 800, fontSize: "0.9rem", color: c.accent }}>
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
              borderLeft: `3px solid ${c.soft}`, paddingLeft: 10 }}>{l}</p>
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
      style={{ marginTop: 16, background: WHITE, borderRadius: 22, padding: "22px 20px",
        border: `2px solid ${c.accent}`, boxShadow: `0 5px 0 ${c.edge}` }}>
      <p style={{ margin: 0, fontFamily: SANS, fontWeight: 800, fontSize: "0.92rem", color: c.accent }}>Quest complete</p>
      <h2 style={{ margin: "6px 0 10px", fontFamily: SANS, fontWeight: 800, fontSize: "1.5rem", color: INK, lineHeight: 1.25 }}>
        {q.title}
      </h2>
      <p style={{ margin: "0 0 16px", fontFamily: SANS, fontSize: "1rem", color: MID, lineHeight: 1.55 }}>
        {done.tasks} tasks over {done.days} days, {done.on_time === done.tasks ? "all" : done.on_time} on time,
        for {done.xp_earned} XP.
      </p>
      {offer && (
        <div style={{ background: c.wash, borderRadius: 16, padding: "14px 16px", marginBottom: 16 }}>
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
        <p style={{ margin: "0 0 16px", fontFamily: SANS, fontWeight: 700, color: c.accent }}>In your activities.</p>
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
        <Chunky onClick={onConfirm} disabled={busy} style={{ flex: 1, ...(danger ? { background: "#b42318", boxShadow: "0 4px 0 #7a1a12" } : {}) }}>
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
      <p style={{ margin: "8px 0 0", fontFamily: SANS, fontSize: "0.88rem", color: MUTED, lineHeight: 1.5 }}>
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
        fontSize: "0.9rem", color: INK, marginBottom: 6 }}>
        {label}{hint && <span style={{ fontWeight: 600, color: FAINT }}>{hint}</span>}
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
          <Field label="Activity name"><input value={f.title || ""} onChange={set("title")} maxLength={120} style={fieldStyle} /></Field>
          <Field label="Category">
            <select value={f.category || "Other"} onChange={set("category")} style={fieldStyle}>
              {CATEGORIES.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </Field>
          <Field label="Your role" hint={`${(f.position || "").length}/50`}>
            <input value={f.position || ""} onChange={set("position")} maxLength={50} style={fieldStyle} />
          </Field>
          <Field label="Organization" hint={`${(f.organization || "").length}/100`}>
            <input value={f.organization || ""} onChange={set("organization")} maxLength={100} style={fieldStyle} />
          </Field>
          <Field label="Description" hint={`${(f.description || "").length}/150`}>
            <textarea value={f.description || ""} onChange={set("description")} maxLength={150} rows={3}
              style={{ ...fieldStyle, resize: "vertical" }} />
          </Field>
          <div style={{ display: "flex", gap: 12 }}>
            <Field label="Hours a week">
              <input type="number" min="0" step="0.5" value={f.hours_per_week ?? ""} onChange={set("hours_per_week")} style={fieldStyle} />
            </Field>
            <Field label="Weeks a year">
              <input type="number" min="0" max="52" value={f.weeks_per_year ?? ""} onChange={set("weeks_per_year")} style={fieldStyle} />
            </Field>
          </div>
          <Field label="Grades you did this in">
            <div style={{ display: "flex", gap: 8 }}>
              {[9, 10, 11, 12].map((g) => {
                const on = f.grade_levels.includes(g);
                return (
                  <button key={g} type="button" aria-pressed={on} onClick={() => toggleGrade(g)}
                    style={{ fontFamily: SANS, fontWeight: 800, fontSize: "0.95rem", cursor: "pointer",
                      padding: "9px 14px", borderRadius: 12, border: `2px solid ${on ? c.accent : LINE}`,
                      background: on ? c.wash : WHITE, color: on ? c.accent : MID }}>
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
    <p role="status" style={{ margin: "14px 0 0", fontFamily: SANS, fontWeight: 700, fontSize: "0.95rem",
      color: tone === "error" ? "#b42318" : AMBER }}>
      {children}
    </p>
  );
}
