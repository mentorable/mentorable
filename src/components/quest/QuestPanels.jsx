import { forwardRef, useEffect, useId, useRef, useState } from "react";
import { motion } from "framer-motion";
import { formatDay, relativeDay } from "../../lib/quest.js";
import { PixelStamp } from "../ui/PixelIcons.jsx";
import { FOCUS_CLASS, RADIUS, SURFACE, TEXT } from "../ui/tokens.js";
import { Button, ChoiceChips, FieldLabel, Heading, INPUT_CLASS, Notice, Sheet as Dialog, StampTile, Tip, inputStyle } from "../ui/kit.jsx";
import {
  SANS, WHITE, INK, MID, MUTED, LINE, AMBER, AMBER_LINE, AMBER_WASH, DANGER,
  Chunky, DayToggles, ErrorLine, FLAME_GOLD, Flame, LevelChip, useQuestColors,
} from "./questUi.jsx";

// `key` for the kit's ChoiceChips, `value` for older callers.
export const MINUTE_OPTIONS = [
  { key: 15, value: 15, label: "15 min" },
  { key: 30, value: 30, label: "30 min" },
  { key: 45, value: 45, label: "45 min" },
];

// ─── Top bar ──────────────────────────────────────────────────────────────────

// headingAs: the title's tag (the landing page's copy of the bar passes "p",
// since that page has its own h1).
export function TopBar({ title, stats, streakLit, menu, isMobile, headingAs: TitleTag = "h1" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const trigger = useRef(null);
  const items = useRef([]);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    // The menu takes focus when it opens, so the arrow keys work at once.
    items.current[0]?.focus({ preventScroll: true });
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const close = () => { setOpen(false); trigger.current?.focus({ preventScroll: true }); };
  const onMenuKey = (e) => {
    const list = items.current.filter(Boolean);
    const at = list.indexOf(document.activeElement);
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); list[(at + 1) % list.length]?.focus({ preventScroll: true }); }
    else if (e.key === "ArrowUp") { e.preventDefault(); list[(at - 1 + list.length) % list.length]?.focus({ preventScroll: true }); }
    else if (e.key === "Home") { e.preventDefault(); list[0]?.focus({ preventScroll: true }); }
    else if (e.key === "End") { e.preventDefault(); list[list.length - 1]?.focus({ preventScroll: true }); }
    else if (e.key === "Tab") setOpen(false);
  };

  // A dark glass bar over the scene: the quest's name, the streak, and the
  // options menu; on a wide screen the level and its XP too. On a phone the
  // name gets the room (two lines, never cut to an ellipsis) and the level
  // waits in "How Quest works", since the bar is the page's only heading.
  const glass = "rgba(255,255,255,0.12)";
  const glassLine = "rgba(255,255,255,0.2)";
  const streak = stats?.streak || 0;
  const levelLabel = stats
    ? `Level ${stats.level}, ${stats.into_level} of ${stats.level_span} XP to level ${stats.level + 1}`
    : "";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 8 : 12, boxSizing: "border-box",
      padding: isMobile ? "10px 10px 10px 14px" : "12px 14px 12px 22px", borderRadius: RADIUS.dialog,
      background: "rgba(38,50,112,0.96)", border: "1px solid rgba(255,255,255,0.28)",
      backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", boxShadow: "0 12px 32px rgba(12,16,44,0.28)" }}>
      <TitleTag title={title} style={{ flex: 1, minWidth: 0, margin: 0, fontFamily: SANS, fontWeight: 800,
        fontSize: isMobile ? "1.1rem" : "1.6rem", color: WHITE, letterSpacing: "-0.02em", lineHeight: 1.25,
        display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
        overflowWrap: "anywhere" }}>
        {title}
      </TitleTag>
      {/* Gold beside a lit flame, white beside an unlit one; the flame says
          the same thing, so the colour is never the only cue. */}
      <span role="img" aria-label={`${streak} day streak${streakLit ? "" : ", not yet kept today"}`}
        title={`${streak} day streak`}
        style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0, fontFamily: SANS, fontWeight: 800,
          fontSize: isMobile ? "1rem" : "1.1rem", color: streakLit ? FLAME_GOLD : WHITE,
          fontVariantNumeric: "tabular-nums", background: glass, border: `1px solid ${glassLine}`, borderRadius: RADIUS.pill,
          padding: isMobile ? "3px 10px 3px 7px" : "4px 12px 4px 8px" }}>
        <Flame size={isMobile ? 20 : 22} lit={streakLit} animate={streakLit} streak={streak} /> {streak}
      </span>
      {!isMobile && stats && (
        <div role="img" aria-label={levelLabel} style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <LevelChip stats={stats} onDark />
          <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: "0.9rem", color: WHITE, whiteSpace: "nowrap",
            fontVariantNumeric: "tabular-nums" }}>
            {stats.into_level}/{stats.level_span} XP
          </span>
        </div>
      )}
      {menu && menu.length > 0 && (
        <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
          <button ref={trigger} type="button" aria-label="Quest options" aria-haspopup="menu" aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            onKeyDown={(e) => { if (e.key === "ArrowDown" && !open) { e.preventDefault(); setOpen(true); } }}
            className={FOCUS_CLASS}
            style={{ width: 44, height: 44, borderRadius: RADIUS.control, border: `1px solid ${glassLine}`, background: glass,
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill={WHITE} aria-hidden="true">
              <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
            </svg>
          </button>
          {open && (
            <div role="menu" aria-label="Quest options" onKeyDown={onMenuKey}
              style={{ position: "absolute", right: 0, top: 52, minWidth: 200, background: WHITE,
                borderRadius: RADIUS.control, border: `1px solid ${LINE}`, boxShadow: "0 12px 30px rgba(20,20,19,0.12)", padding: 6, zIndex: 30 }}>
              {menu.map((m, i) => (
                <button key={m.label} ref={(el) => { items.current[i] = el; }} type="button" role="menuitem" tabIndex={-1}
                  className={FOCUS_CLASS}
                  // Focus goes back to the trigger first, so a dialog the item
                  // opens hands focus back there when it closes.
                  onClick={() => { close(); m.onClick(); }}
                  style={{ display: "block", width: "100%", textAlign: "left", fontFamily: SANS, fontWeight: 700,
                    fontSize: "1rem", color: m.danger ? DANGER : INK, background: "none", border: "none",
                    borderRadius: RADIUS.control - 2, padding: "10px 12px", minHeight: 44, cursor: "pointer" }}
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
  );
}

/** Pins the top bar while the map scrolls. Anything absolutely placed inside
 *  it (the catch-up pill, the skip link) hangs just under the bar.
 *  It sticks at the very top with a 10px strip above the bar, and that strip
 *  blurs what scrolls under it: the scene's smooth colours come through
 *  unchanged, while a plate or a stone passing under is only a soft smudge
 *  instead of sharp text peeking out above the bar. */
export const StickyHeader = forwardRef(function StickyHeader({ children }, ref) {
  return (
    <div ref={ref} style={{ position: "sticky", top: 0, zIndex: 20, marginTop: -10, paddingTop: 10, paddingBottom: 10 }}>
      <div aria-hidden="true" style={{ position: "absolute", top: 0, left: 0, right: 0, height: 34, pointerEvents: "none",
        backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
        maskImage: "linear-gradient(to bottom, #000 10px, transparent)",
        WebkitMaskImage: "linear-gradient(to bottom, #000 10px, transparent)" }} />
      <div style={{ position: "relative" }}>{children}</div>
    </div>
  );
});

// ─── Banners ──────────────────────────────────────────────────────────────────

/** A notice on the map: the kit's Notice (warn for being behind, info
 *  otherwise) with its actions under the words. On a phone the actions stack
 *  at full width, as page-level buttons do on Portfolio. */
const MapNotice = forwardRef(function MapNotice({ tone = "warn", children, actions, isMobile }, ref) {
  return (
    <motion.div ref={ref} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
      style={{ maxWidth: 640, margin: "4px auto 0" }}>
      <Notice tone={tone} action={actions ? (
        <div style={isMobile ? { display: "grid", gap: 8, marginTop: 4 }
          : { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 4 }}>
          {actions}
        </div>
      ) : null}>
        {children}
      </Notice>
    </motion.div>
  );
});

/** The backlog. It sits just above today's callout (or above the map when
 *  today is not a work day), so the page lands on it. On a comeback visit it
 *  greets the student, and after a long gap it offers to count the time away
 *  as a break, with one recommended choice. */
export const CatchUpBanner = forwardRef(function CatchUpBanner({ state, onCatchUp, onBreak, isMobile }, ref) {
  const b = state.backlog || {};
  const w = state.welcome_back || {};
  if (!b.count || state.today_state === "blocked") return null;
  const them = b.count === 1 ? "it" : "them";
  const offerBreak = !!(w.show && w.offer_break && onBreak);
  // The rule the copy already states: after a week or more away the break
  // fits better; a shorter gap is worth catching up.
  const breakFirst = offerBreak && (w.gap ?? 7) >= 7;
  const by = b.catch_up_by ? relativeDay(b.catch_up_by, state.today) : null;
  const gate = b.unlocks_milestone && b.in_current
    ? `Clear ${b.in_current === b.count ? them : `the ${b.in_current} in this milestone`} to unlock Milestone ${b.unlocks_milestone}.`
    : "";
  const detail = offerBreak
    ? (by ? `Two a day clears ${them} by ${by}, or you can count the time away as a break.`
      : "Catch up, or count the time away as a break.")
    : [gate, by ? `Two a day clears ${them} by ${by}.` : ""].filter(Boolean).join(" ");
  const full = isMobile ? { width: "100%" } : undefined;
  const catchUp = b.oldest_doable_slot
    ? (breakFirst
      ? <Button key="catch" onClick={onCatchUp} style={full}>Catch up</Button>
      : <Chunky key="catch" tone="amber" onClick={onCatchUp} full={isMobile}>Catch up</Chunky>)
    : null;
  const takeBreak = offerBreak
    ? (breakFirst
      ? <Chunky key="break" onClick={onBreak} full={isMobile}>Count it as a break</Chunky>
      : <Button key="break" onClick={onBreak} style={full}>Count it as a break</Button>)
    : null;
  const actions = breakFirst ? [takeBreak, catchUp] : [catchUp, takeBreak];
  return (
    <MapNotice ref={ref} isMobile={isMobile} actions={actions.some(Boolean) ? actions : null}>
      <strong style={{ fontWeight: 800 }}>{w.show ? "Welcome back. " : ""}You're {b.count} task{b.count === 1 ? "" : "s"} behind.</strong>
      {detail && <span style={{ display: "block", marginTop: 2 }}>{detail}</span>}
    </MapNotice>
  );
});

/** The backlog in one line, hung under the stuck top bar once the banner has
 *  scrolled away, so catching up stays one tap from anywhere on the map. */
export function CatchUpPill({ state, onCatchUp }) {
  const b = state.backlog || {};
  if (!b.count || !b.oldest_doable_slot || state.today_state === "blocked") return null;
  return (
    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.18 }}
      style={{ position: "absolute", top: "calc(100% - 2px)", left: 0, right: 0, display: "flex", justifyContent: "center",
        pointerEvents: "none" }}>
      <button type="button" onClick={onCatchUp} className={FOCUS_CLASS}
        style={{ pointerEvents: "auto", display: "inline-flex", alignItems: "center", gap: 8, minHeight: 44,
          padding: "0 16px", borderRadius: RADIUS.pill, border: `1px solid ${AMBER_LINE}`, background: AMBER_WASH,
          color: AMBER, fontFamily: SANS, fontSize: "1rem", fontWeight: 600, cursor: "pointer" }}>
        <strong style={{ fontWeight: 800 }}>{b.count} behind</strong>
        <span aria-hidden="true">·</span>
        <span style={{ fontWeight: 700, textDecoration: "underline", textUnderlineOffset: 3 }}>Catch up</span>
      </button>
    </motion.div>
  );
}

export function DeadlineNotice({ state, onAskAdvisor, isMobile }) {
  if (!state.deadline_risk || !state.quest?.hard_deadline) return null;
  return (
    <MapNotice isMobile={isMobile}
      actions={<Button onClick={onAskAdvisor} style={isMobile ? { width: "100%" } : undefined}>Ask your advisor</Button>}>
      At this pace you finish {formatDay(state.projected_finish)}, after your {formatDay(state.quest.hard_deadline)} deadline.
      Your advisor can trim the milestones that have not started.
    </MapNotice>
  );
}

export function RestNote({ state }) {
  if (state.today_state !== "rest") return null;
  return (
    <Tip tone="default" stamp="clock" style={{ maxWidth: 640, margin: "4px auto 0" }}>
      <strong style={{ fontWeight: 800 }}>Rest day.</strong>{" "}
      {state.next_work_date
        ? `Nothing to do today. Your next task opens ${relativeDay(state.next_work_date, state.today)}.`
        : "Nothing to do today."}
    </Tip>
  );
}

export function PausedCard({ state, onResume, onRetire, busy, isMobile }) {
  return (
    <MapNotice tone="info" isMobile={isMobile} actions={[
      <Chunky key="resume" onClick={onResume} disabled={busy} full={isMobile}>Resume</Chunky>,
      <Button key="retire" onClick={onRetire} style={isMobile ? { width: "100%" } : undefined}>Retire</Button>,
    ]}>
      <strong style={{ fontWeight: 800 }}>Quest paused since {formatDay(state.quest?.paused_on)}.</strong> Your streak and
      progress are safe, and the rest of the quest picks up from the day you come back.
    </MapNotice>
  );
}

// ─── How Quest works ──────────────────────────────────────────────────────────

const RULES = [
  ["check", "Each scheduled day has one small task. Check in with a line or two about what you did."],
  ["clock", "Checking in on the day keeps your streak going. Rest days never break it."],
  ["star", "A missed day turns amber and waits for you. Catching it up earns the same XP, but only check-ins on the day count for the streak."],
  ["lock", "The next milestone unlocks once every day in this one is done. Tap a done stone to reread what you wrote."],
];

/** The rules in four lines, from the options menu or the first-visit tip. */
export function RulesSheet({ stats, onClose }) {
  const titleId = useId();
  return (
    <Dialog onClose={onClose} labelledBy={titleId} width={480}>
      <Heading id={titleId} style={{ margin: "0 0 14px" }}>How Quest works</Heading>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
        {RULES.map(([stamp, text]) => (
          <li key={stamp} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <StampTile kind={stamp} size={32} />
            <span style={{ flex: 1, minWidth: 0, fontFamily: SANS, fontSize: "1rem", fontWeight: 500, color: MID, lineHeight: 1.5, paddingTop: 4 }}>
              {text}
            </span>
          </li>
        ))}
      </ul>
      {stats && (
        <p style={{ margin: "16px 0 0", fontFamily: SANS, fontSize: "1rem", fontWeight: 700, color: INK, lineHeight: 1.5,
          background: SURFACE, border: `1px solid ${LINE}`, borderRadius: RADIUS.control, padding: "10px 14px",
          fontVariantNumeric: "tabular-nums" }}>
          Level {stats.level}: {stats.into_level} of {stats.level_span} XP to level {stats.level + 1}.
        </p>
      )}
      <div style={{ marginTop: 18 }}><Chunky full onClick={onClose} data-autofocus>Got it</Chunky></div>
    </Dialog>
  );
}

/** A one-time pointer to the rules, shown above today's callout until the
 *  student dismisses it. */
export function RulesTip({ onOpen, onDismiss, isMobile }) {
  return (
    <div style={{ maxWidth: 640, margin: "4px auto 0" }}>
      <Tip stamp="question" name="Quest tip">
        <strong style={{ fontWeight: 800 }}>New to Quest?</strong> Check in each work day to keep your streak going.
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
          <Button onClick={onOpen}>How it works</Button>
          <Button kind="quiet" onClick={onDismiss} style={isMobile ? { paddingLeft: 12, paddingRight: 12 } : undefined}>Got it</Button>
        </div>
      </Tip>
    </div>
  );
}

// ─── Milestone and finish cards ───────────────────────────────────────────────

export function MilestoneCard({ milestone, next, onClose }) {
  const c = useQuestColors();
  const titleId = useId();
  return (
    <Dialog onClose={onClose} labelledBy={titleId} width={440}>
      <div style={{ textAlign: "center" }}>
        <motion.div initial={{ scale: 0.4, rotate: -12 }} animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 14 }}
          aria-hidden="true"
          style={{ width: 76, height: 76, borderRadius: RADIUS.card, margin: "0 auto 14px", background: c.softer,
            border: `1px solid ${c.soft}`, color: c.onSoft, boxSizing: "border-box",
            display: "flex", alignItems: "center", justifyContent: "center" }}>
          <PixelStamp kind="flag" size={40} />
        </motion.div>
        <p style={{ margin: 0, fontFamily: SANS, fontWeight: 800, fontSize: "1rem", color: c.text }}>
          Milestone {milestone.position} complete, +50 XP
        </p>
        <Heading id={titleId} style={{ margin: "6px 0 14px" }}>
          {milestone.title}
        </Heading>
      </div>
      {milestone.lines?.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "0 0 18px" }}>
          <p style={{ margin: 0, fontFamily: SANS, fontWeight: 700, fontSize: "0.95rem", color: MUTED }}>What you did, in your words:</p>
          {milestone.lines.map((l, i) => (
            <p key={i} style={{ margin: 0, fontFamily: SANS, fontSize: "1rem", color: MID, lineHeight: 1.5,
              background: SURFACE, border: `1px solid ${LINE}`, borderRadius: RADIUS.control, padding: "8px 12px" }}>{l}</p>
          ))}
        </div>
      )}
      {next && (
        <p style={{ margin: "0 0 16px", fontFamily: SANS, fontSize: "1rem", color: MID, textAlign: "center" }}>
          Up next: <strong style={{ color: INK }}>{next.title}</strong>
        </p>
      )}
      <Chunky full onClick={onClose} data-autofocus>Keep going</Chunky>
    </Dialog>
  );
}

export function FinishCard({ state, onAddToPortfolio, onDismissPortfolio, onNewQuest, busy }) {
  const c = useQuestColors();
  const q = state.quest;
  const done = state.completion || {};
  const offer = q.add_to_portfolio && !q.portfolio_activity_id;
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      style={{ marginTop: 4, background: WHITE, borderRadius: RADIUS.card, padding: "1.3rem", boxSizing: "border-box",
        border: `1px solid ${LINE}` }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
        <StampTile kind="star" />
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontFamily: SANS, fontWeight: 700, fontSize: "0.95rem", color: c.text }}>Quest complete</p>
          <Heading style={{ marginTop: 2 }}>{q.title}</Heading>
        </div>
      </div>
      <p style={{ margin: "12px 0 16px", fontFamily: SANS, fontSize: "1rem", color: MID, lineHeight: 1.55 }}>
        {done.tasks} tasks over {done.days} days, {done.on_time === done.tasks ? "all" : done.on_time} on time,
        for {done.xp_earned} XP.
      </p>
      {offer && (
        <Tip stamp="resume" style={{ marginBottom: 16 }}>
          This is real work. Add it to your activities so your applications can use it.
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
            <Chunky small onClick={onAddToPortfolio} disabled={busy}>Draft the entry</Chunky>
            <Button kind="quiet" onClick={onDismissPortfolio} disabled={busy}>Not now</Button>
          </div>
        </Tip>
      )}
      {q.portfolio_activity_id && (
        <p style={{ margin: "0 0 16px", fontFamily: SANS, fontWeight: 700, color: c.text }}>In your activities.</p>
      )}
      <Chunky full onClick={onNewQuest}>Start a new quest</Chunky>
    </motion.div>
  );
}

// ─── Dialogs ──────────────────────────────────────────────────────────────────

export function ConfirmModal({ title, body, confirm, cancel = "Keep going", onConfirm, onClose, busy, danger }) {
  const titleId = useId();
  return (
    <Dialog onClose={onClose} locked={busy} labelledBy={titleId} width={420}>
      <Heading id={titleId} style={{ margin: "0 0 8px" }}>{title}</Heading>
      <p style={{ margin: "0 0 20px", fontFamily: SANS, fontSize: "1rem", color: MID, lineHeight: 1.6 }}>{body}</p>
      <div style={{ display: "flex", gap: 10 }}>
        <Chunky tone="quiet" onClick={onClose} disabled={busy} style={{ flex: 1 }} data-autofocus>{cancel}</Chunky>
        <Chunky tone={danger ? "danger" : "accent"} onClick={onConfirm} disabled={busy} style={{ flex: 1 }}>
          {busy ? "One moment..." : confirm}
        </Chunky>
      </div>
    </Dialog>
  );
}

/** The label over a row of choices: a group, not one control, so it is not a <label>. */
function GroupLabel({ id, children, style }) {
  return (
    <p id={id} style={{ margin: "0 0 8px", fontFamily: SANS, fontWeight: 700, fontSize: "1rem", color: TEXT, ...style }}>
      {children}
    </p>
  );
}

export function PaceModal({ quest, onSave, onClose, isMobile }) {
  const [minutes, setMinutes] = useState(quest.daily_minutes);
  const [rest, setRest] = useState(quest.rest_days || []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const titleId = useId();
  const restId = useId();
  const save = async () => {
    setBusy(true); setError(null);
    try { await onSave({ daily_minutes: minutes, rest_days: rest }); }
    catch (e) { setError(e.message); setBusy(false); }
  };
  return (
    <Dialog onClose={onClose} locked={busy} labelledBy={titleId} width={460}>
      <Heading id={titleId} style={{ margin: "0 0 16px" }}>Change pace</Heading>
      <GroupLabel>Time a day</GroupLabel>
      <ChoiceChips label="Time a day" hideLabel options={MINUTE_OPTIONS} value={minutes} onChange={setMinutes} isMobile={isMobile} />
      <GroupLabel id={restId} style={{ marginTop: 18 }}>Rest days</GroupLabel>
      <div role="group" aria-labelledby={restId}><DayToggles value={rest} onChange={setRest} /></div>
      <p style={{ margin: "8px 0 0", fontFamily: SANS, fontSize: "0.95rem", color: MUTED, lineHeight: 1.5 }}>
        Crossed-out days are off. Days that already happened stay as they were.
      </p>
      <ErrorLine>{error}</ErrorLine>
      <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
        <Chunky tone="quiet" onClick={onClose} disabled={busy} style={{ flex: 1 }}>Cancel</Chunky>
        <Chunky onClick={save} disabled={busy} style={{ flex: 1 }}>{busy ? "Saving..." : "Save"}</Chunky>
      </div>
    </Dialog>
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

/** A kit label tied to its control by id, with an optional count on the right. */
function Field({ label, count, style, children }) {
  const id = useId();
  return (
    <div style={{ marginBottom: 14, minWidth: 0, ...style }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {count && (
          <span style={{ fontFamily: SANS, fontSize: "0.9rem", fontWeight: 600, color: MUTED, fontVariantNumeric: "tabular-nums" }}>
            {count}
          </span>
        )}
      </div>
      {children(id)}
    </div>
  );
}

const GRADE_OPTIONS = [9, 10, 11, 12].map((g) => ({ key: g, label: String(g) }));

// Same height for inputs and the select, as on Portfolio, so a row of fields lines up.
const control = { ...inputStyle, height: 48, minHeight: 0, paddingTop: 0, paddingBottom: 0 };

export function PortfolioDraftModal({ draft, loading, error, onSave, onClose }) {
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const titleId = useId();
  useEffect(() => { if (draft && !f) setF({ ...draft, grade_levels: draft.grade_levels || [] }); }, [draft, f]);
  const set = (k) => (e) => setF((prev) => ({ ...prev, [k]: e.target.value }));
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
    <Dialog onClose={onClose} locked={busy} labelledBy={titleId} width={560}>
      <Heading id={titleId} style={{ margin: "0 0 6px" }}>Add to your activities</Heading>
      <p style={{ margin: "0 0 18px", fontFamily: SANS, fontSize: "1rem", color: MUTED, lineHeight: 1.55 }}>
        Drafted from your check-ins in Common App format. Change anything that is not quite right.
      </p>
      {loading && <p role="status" style={{ fontFamily: SANS, fontWeight: 700, color: MID }}>Drafting the entry...</p>}
      {!loading && error && <ErrorLine>{error}</ErrorLine>}
      {!loading && f && (
        <>
          <Field label="Name">
            {(id) => <input id={id} value={f.title || ""} onChange={set("title")} maxLength={120} className={INPUT_CLASS} style={control} />}
          </Field>
          <Field label="Category">
            {(id) => (
              <select id={id} value={f.category || "Other"} onChange={set("category")} className={INPUT_CLASS}
                style={{ ...control, cursor: "pointer" }}>
                {CATEGORIES.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            )}
          </Field>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Field label="Your role" count={`${(f.position || "").length}/50`} style={{ flex: 1, minWidth: 150 }}>
              {(id) => <input id={id} value={f.position || ""} onChange={set("position")} maxLength={50} className={INPUT_CLASS} style={control} />}
            </Field>
            <Field label="Organization" count={`${(f.organization || "").length}/100`} style={{ flex: 1, minWidth: 150 }}>
              {(id) => <input id={id} value={f.organization || ""} onChange={set("organization")} maxLength={100} className={INPUT_CLASS} style={control} />}
            </Field>
          </div>
          <Field label="What you did" count={`${(f.description || "").length}/150`}>
            {(id) => (
              <textarea id={id} value={f.description || ""} onChange={set("description")} maxLength={150} rows={3}
                className={INPUT_CLASS} style={{ ...inputStyle, resize: "vertical" }} />
            )}
          </Field>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Field label="Hours / week" style={{ width: 140 }}>
              {(id) => <input id={id} type="number" inputMode="decimal" min="0" step="0.5" value={f.hours_per_week ?? ""} onChange={set("hours_per_week")} className={INPUT_CLASS} style={control} />}
            </Field>
            <Field label="Weeks / year" style={{ width: 140 }}>
              {(id) => <input id={id} type="number" inputMode="numeric" min="0" max="52" value={f.weeks_per_year ?? ""} onChange={set("weeks_per_year")} className={INPUT_CLASS} style={control} />}
            </Field>
          </div>
          {/* Several can be on at once: the kit's multi-select chips, as on Portfolio. */}
          <div style={{ marginBottom: 14 }}>
            <ChoiceChips label="Grades involved" labelAbove multi options={GRADE_OPTIONS} value={f.grade_levels}
              onChange={(v) => setF((prev) => ({ ...prev, grade_levels: v }))} />
          </div>
          <ErrorLine>{saveError}</ErrorLine>
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <Chunky tone="quiet" onClick={onClose} disabled={busy} style={{ flex: 1 }}>Cancel</Chunky>
            <Chunky onClick={save} disabled={busy} style={{ flex: 1 }}>{busy ? "Adding..." : "Add to activities"}</Chunky>
          </div>
        </>
      )}
    </Dialog>
  );
}
