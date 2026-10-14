import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { getValidUser } from "../lib/auth.js";
import { answerRequest, counselorErrorMessage, counselorMe, formatWhen, loadRequests } from "../lib/counselor.js";
import { useIsMobile } from "../hooks/useIsMobile.js";
import Spinner from "../components/common/Spinner.jsx";
import { Button, Card, Heading, PageHeader, SR_ONLY, Toast } from "../components/ui/kit.jsx";
import { SANS, TEXT, TEXT_MID, TEXT_MUTED, ringVar, useAgentInk } from "../components/ui/tokens.js";
import CounselorShell from "../components/counselor/CounselorShell.jsx";
import CalendarAgenda from "../components/counselor/CalendarAgenda.jsx";
import CalendarMonth from "../components/counselor/CalendarMonth.jsx";
import CalendarToolbar from "../components/counselor/CalendarToolbar.jsx";
import CalendarWeek from "../components/counselor/CalendarWeek.jsx";
import RequestList from "../components/counselor/RequestList.jsx";
import RequestSheet from "../components/counselor/RequestSheet.jsx";
import { OfferedSwatch } from "../components/counselor/ScheduleParts.jsx";
import { ENTRY_PATH, SCHEDULE_PATH, entryPath } from "../components/counselor/counselorUi.jsx";
import {
  NOTE_MAX, dayKey, formatDayLong, meetingCount, meetingsByDay, monthDays, offeredByDay, offeredCount, offeredId,
  offeredTimes, rangeSummary, rangeTitle, shiftAnchor, splitRequests, startOfDay, toDate, weekDays, zoneName,
} from "../components/counselor/ScheduleLogic.js";

// The counselor's schedule (/counselor/schedule): a calendar of the meetings
// already confirmed (a week or a month; an agenda list on a phone or any
// screen too narrow for seven columns), with the meeting requests that are
// waiting, oldest first, in a rail beside it (above it on a narrower screen).
//
// Picking a request in the rail opens it there and draws the times that
// student offered on the calendar, dashed and amber and labelled "Offered",
// next to what is already booked, so a clash shows before a time is
// confirmed. An offered time is not a meeting. Opening the request (its
// "Answer this request" button, or one of its outlines) shows the whole
// inquiry in a sheet, where it is confirmed for one of the offered times or
// another, or declined; a confirmed meeting can be moved or declined later
// from the calendar. The requests closed lately sit behind a disclosure
// under the rail.
//
// Everything here comes from one SQL function, counselor_requests(), which
// answers only for the signed-in counselor's own school and returns a
// student's name, grade, message and times: nothing of their record. The
// links out go to pages that show what the student chose to share.
//
// An answer is optimistic: the request moves at once (onto the calendar, or
// into "Closed lately") and moves back, with a message, if the save fails.
// One answer to a request at a time; the list is not reloaded underneath one.
// Nothing a student wrote is ever logged: a failure logs its code only.

// The real calls. The page takes them as one object so it can be driven with
// made-up data when checking it by hand (see FinderBoardPage).
const REAL_API = { getValidUser, counselorMe, loadRequests, answerRequest };

// Signed out, or no school yet: the entry page deals with both, and brings a
// counselor back here once they are in.
const SIGN_IN_PATH = entryPath(SCHEDULE_PATH);
const TITLE_ID = "cs-calendar-title";
const VIEW_KEY = "mentorable.counselorScheduleView";
const REFRESH_AFTER_MS = 60000;   // coming back to the tab looks for new requests, at most this often
// Seven day columns need about 100px each to hold a time and a name. Below
// this the calendar is the agenda list, on a phone and on a tablet held upright.
const GRID_FROM_PX = 900;
// The rail sits beside the calendar only where the week still has about 90px
// a day beside it (the page at its full width); below this it sits above.
const SIDE_FROM_PX = 1200;
const RAIL_PX = 348;

function readView() {
  try { return localStorage.getItem(VIEW_KEY) === "month" ? "month" : "week"; } catch { return "week"; }
}
function writeView(view) {
  try { localStorage.setItem(VIEW_KEY, view); } catch { /* storage blocked: the choice lasts this visit */ }
}

/** A student's name for a sentence. The database says "Student" when a name is not on file. */
function nameFor(request) {
  return request?.student_name && request.student_name !== "Student" ? request.student_name : "this student";
}

export default function CounselorSchedulePage({ navigate, api = REAL_API }) {
  const isMobile = useIsMobile();
  const asList = useIsMobile(GRID_FROM_PX);
  const side = !useIsMobile(SIDE_FROM_PX);
  const ink = useAgentInk();
  const [phase, setPhase] = useState("loading");      // loading | ready | error
  const [me, setMe] = useState(null);                 // counselorMe(), for the shell
  const [requests, setRequests] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [view, setView] = useState(readView);         // week | month
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));   // a day inside what the calendar shows
  const [selectedKey, setSelectedKey] = useState(() => dayKey(new Date()));   // the month view's chosen day
  const [openId, setOpenId] = useState(null);         // the request in the sheet
  const [pickedId, setPickedId] = useState(null);     // the waiting request whose times are drawn on the calendar
  const [saving, setSaving] = useState(() => new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState(null);           // { text, error, action }
  const [announce, setAnnounce] = useState("");
  const [now, setNow] = useState(() => new Date());   // ticks each minute: "today", and which offered times have passed

  const alive = useRef(true);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const requestsRef = useRef(requests);
  requestsRef.current = requests;
  const inFlight = useRef(new Set());   // request ids with an answer on its way
  const changes = useRef(0);            // goes up as each answer starts and ends (see refresh)
  const refreshBusy = useRef(false);
  const loadedAt = useRef(0);
  const drafts = useRef(new Map());     // per request: notes typed and not sent, { answer, decline }
  const focusAfter = useRef(null);      // { row, meeting, offered, fallback }: where focus goes once the page has redrawn
  const toastTimer = useRef(null);
  const sayTimer = useRef(null);
  const waitingHeadRef = useRef(null);
  const titleRef = useRef(null);

  // ── Messages ──────────────────────────────────────────────────────────────

  const dismissToast = useCallback(() => { clearTimeout(toastTimer.current); setToast(null); }, []);
  const notify = useCallback((text, { error = false, action = null } = {}) => {
    clearTimeout(toastTimer.current);
    setToast({ text, error, action });
    toastTimer.current = setTimeout(() => setToast(null), error || action ? 9000 : 5500);
  }, []);
  /** For screen readers only. Cleared first, so saying the same thing twice is heard twice. */
  const say = useCallback((text) => {
    clearTimeout(sayTimer.current);
    setAnnounce("");
    sayTimer.current = setTimeout(() => { if (alive.current) setAnnounce(text); }, 60);
  }, []);

  // ── Loading ───────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setPhase("loading");
    setLoadError("");
    let user = null;
    try { user = await api.getValidUser(); } catch { user = null; }
    if (!alive.current) return;
    if (!user) { navigate?.(SIGN_IN_PATH, { replace: true }); return; }
    // Both at once. Someone with no school is refused the requests, which is
    // not an error here: the entry page is where a school is set up.
    const [mine, rows] = await Promise.allSettled([api.counselorMe(), api.loadRequests()]);
    if (!alive.current) return;
    if (mine.status === "rejected") {
      console.warn("[counselor] schedule load failed:", mine.reason?.code || "error");
      if (mine.reason?.code === "not_signed_in") { navigate?.(SIGN_IN_PATH, { replace: true }); return; }
      setLoadError(counselorErrorMessage(mine.reason));
      setPhase("error");
      return;
    }
    if (!mine.value) { navigate?.(SIGN_IN_PATH, { replace: true }); return; }
    setMe(mine.value);
    if (rows.status === "rejected") {
      console.warn("[counselor] schedule load failed:", rows.reason?.code || "error");
      setLoadError(counselorErrorMessage(rows.reason));
      setPhase("error");
      return;
    }
    setRequests(Array.isArray(rows.value) ? rows.value : []);
    loadedAt.current = Date.now();
    setPhase("ready");
  }, [api, navigate]);

  useEffect(() => {
    alive.current = true;
    load();
    return () => {
      alive.current = false;
      clearTimeout(toastTimer.current);
      clearTimeout(sayTimer.current);
    };
  }, [load]);

  /** Read the requests again without leaving the page. Never while an answer
   *  is on its way, and never over one that was given meanwhile: those rows
   *  would be older than what the page already shows. `loud` is the button. */
  const refresh = useCallback(async (loud = false) => {
    if (refreshBusy.current || inFlight.current.size > 0) return;
    const before = changes.current;
    refreshBusy.current = true;
    if (loud) setRefreshing(true);
    try {
      const rows = await api.loadRequests();
      if (!alive.current || changes.current !== before) return;
      const list = Array.isArray(rows) ? rows : [];
      setRequests(list);
      loadedAt.current = Date.now();
      if (loud) {
        const n = splitRequests(list).pending.length;
        say(n === 0 ? "Up to date. No requests are waiting." : `Up to date. ${n === 1 ? "1 request is" : `${n} requests are`} waiting.`);
      }
    } catch (e) {
      console.warn("[counselor] schedule refresh failed:", e?.code || "error");
      if (alive.current && loud) notify(counselorErrorMessage(e), { error: true });
    } finally {
      refreshBusy.current = false;
      if (alive.current && loud) setRefreshing(false);
    }
  }, [api, notify, say]);

  // The clock, and a look for new requests when the counselor comes back to a
  // tab that has sat open.
  useEffect(() => {
    const tick = () => setNow(new Date());
    const timer = setInterval(tick, 60000);
    const onBack = () => {
      if (document.visibilityState !== "visible") return;
      tick();
      if (phaseRef.current === "ready" && Date.now() - loadedAt.current > REFRESH_AFTER_MS) refresh(false);
    };
    document.addEventListener("visibilitychange", onBack);
    window.addEventListener("focus", onBack);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onBack);
      window.removeEventListener("focus", onBack);
    };
  }, [refresh]);

  // ── What shows ────────────────────────────────────────────────────────────

  const { pending, meetings, closed } = useMemo(() => splitRequests(requests), [requests]);
  const byDay = useMemo(() => meetingsByDay(meetings), [meetings]);
  const todayKey = dayKey(now);
  const zone = useMemo(() => zoneName(new Date()), [todayKey]);   // eslint-disable-line react-hooks/exhaustive-deps
  const countIn = (span) => span.reduce((n, day) => n + (byDay.get(dayKey(day))?.length || 0), 0);
  const daysOf = (v, a) => (v === "month" ? monthDays(a) : weekDays(a));
  const days = daysOf(view, anchor);
  const shownKeys = new Set(days.map(dayKey));
  const unit = view === "month" ? "month" : "week";
  const title = rangeTitle(view, anchor);
  const summary = rangeSummary(view, anchor, countIn(days));
  // The picked request, while it is still waiting (an answer, or a refresh
  // that finds it cancelled, takes its times off the calendar), and the times
  // it offers that are still ahead, by day.
  const picked = pickedId ? pending.find((r) => r.id === pickedId) || null : null;
  const pickedName = nameFor(picked);
  const offered = useMemo(() => offeredByDay(picked, now), [picked, now]);
  const offeredAll = [...offered.values()].flat();
  const offeredShown = offeredAll.filter((e) => shownKeys.has(dayKey(e.at))).length;
  // As a list: a week shows every day; a month shows the days that hold a
  // meeting or an offered time, and today.
  const agendaDays = view === "month"
    ? days.filter((d) => { const k = dayKey(d); return byDay.has(k) || offered.has(k) || k === todayKey; })
    : days;
  const openRequest = openId ? requests.find((r) => r.id === openId) || null : null;

  // After an answer the row or meeting the sheet was opened from has moved,
  // so focus cannot go back to it: it goes to the next row waiting, or to the
  // meeting where it now sits, or to the heading of that part of the page.
  useEffect(() => {
    const target = focusAfter.current;
    if (!target || phase !== "ready") return;
    focusAfter.current = null;
    const find = (attr, id) => (id ? [...document.querySelectorAll(`[${attr}]`)].find((n) => n.getAttribute(attr) === String(id)) || null : null);
    const el = find("data-request-row", target.row) || find("data-meeting", target.meeting) || find("data-offered", target.offered);
    if (el) el.focus();
    else (target.fallback === "waiting" ? waitingHeadRef : titleRef).current?.focus();
  });

  // ── The calendar's controls ───────────────────────────────────────────────

  /** Change what the calendar shows, and say so. */
  const show = (nextView, nextAnchor) => {
    setView(nextView);
    setAnchor(nextAnchor);
    const span = daysOf(nextView, nextAnchor);
    const keys = new Set(span.map(dayKey));
    const o = offeredAll.filter((e) => keys.has(dayKey(e.at))).length;
    const extra = o ? `, and ${offeredCount(o)} from ${pickedName}, not booked` : "";
    say(`Showing ${rangeTitle(nextView, nextAnchor)}. ${rangeSummary(nextView, nextAnchor, countIn(span))}${extra}.`);
  };
  const changeView = (next) => {
    if (next !== "week" && next !== "month") return;
    writeView(next);
    show(next, anchor);
  };
  const goToday = () => {
    const today = startOfDay(new Date());
    setSelectedKey(dayKey(today));
    show(view, today);
  };
  const selectDay = (date) => {
    const key = dayKey(date);
    setSelectedKey(key);
    const n = byDay.get(key)?.length || 0;
    const o = offered.get(key)?.length || 0;
    const extra = o ? `, and ${offeredCount(o)} from ${pickedName}, not booked` : "";
    say(`${formatDayLong(date)}. ${n ? meetingCount(n) : "Nothing is booked"}${extra}${n || o ? ", listed after the calendar" : ""}.`);
  };
  const seeWeek = (date) => {
    writeView("week");
    focusAfter.current = { fallback: "calendar" };
    show("week", startOfDay(date));
  };
  /** From a toast: bring a meeting into view on the calendar and focus it.
   *  The toast may be pressed some time after it was made, so this reads
   *  nothing from the render it was made in: it keeps whichever view is
   *  showing and only moves the calendar to the meeting's day. */
  const showOnCalendar = (id, when) => {
    dismissToast();
    setSelectedKey(dayKey(when));
    setAnchor(startOfDay(when));
    focusAfter.current = { meeting: id, fallback: "calendar" };
    say(`The calendar now shows ${formatDayLong(when)}.`);
  };

  // ── The rail: a picked request's times on the calendar ────────────────────

  /** Pick a waiting request (or none): its offered times are drawn on the
   *  calendar. The calendar stays where it is; a time it is not showing has
   *  its own "Show on the calendar" in the rail. */
  const pick = (id) => {
    const request = id ? pending.find((r) => r.id === id) || null : null;
    setPickedId(request ? request.id : null);
    if (!request) { say("Offered times are no longer drawn on the calendar."); return; }
    const name = nameFor(request);
    const times = offeredTimes(request, now);
    const ahead = times.filter((t) => !t.passed);
    const inView = ahead.filter((t) => shownKeys.has(dayKey(t.at))).length;
    if (!times.length) { say(`${name.charAt(0).toUpperCase()}${name.slice(1)} did not offer a time.`); return; }
    if (!ahead.length) { say(times.length === 1 ? `The time ${name} offered has passed.` : `Every time ${name} offered has passed.`); return; }
    if (inView === 0) {
      say(ahead.length === 1
        ? `The time ${name} offered is not in this ${unit}. It has a button to show it on the calendar.`
        : `None of the times ${name} offered are in this ${unit}. Each has a button to show it on the calendar.`);
      return;
    }
    const which = inView === ahead.length ? `The ${ahead.length === 1 ? "time" : `${ahead.length} times`} ${name} offered`
      : `${inView} of the ${ahead.length} times ${name} offered`;
    say(`${which} ${inView === 1 ? "is" : "are"} drawn dashed on the calendar: offered, not booked.`);
  };

  /** From the rail: move the calendar to an offered time it is not showing,
   *  and put focus on that time's outline. */
  const showOffered = (request, at) => {
    setSelectedKey(dayKey(at));
    setAnchor(startOfDay(at));
    focusAfter.current = { offered: offeredId(request.id, at), fallback: "calendar" };
    say(`The calendar now shows ${rangeTitle(view, at)}.`);
  };

  // ── Answering ─────────────────────────────────────────────────────────────

  const markSaving = (id, on) => setSaving((prev) => {
    const next = new Set(prev);
    if (on) next.add(id); else next.delete(id);
    return next;
  });

  /**
   * Confirm (for `time`), move, or decline a request. The page shows the
   * answer at once and sends it; if the save fails the request goes back to
   * exactly what the database last returned, and a message says so.
   */
  const answer = async (request, { action, time, note }) => {
    const id = request.id;
    const before = requestsRef.current.find((r) => r.id === id);
    if (!before || inFlight.current.has(id)) return;
    const when = action === "confirm" ? toDate(time) : null;
    if (action === "confirm" ? !when : action !== "decline") return;
    const text = String(note || "").trim().slice(0, NOTE_MAX);
    const who = before.student_name && before.student_name !== "Student" ? before.student_name : "this student";
    const wasMeeting = before.status === "confirmed";
    const next = action === "confirm"
      ? { ...before, status: "confirmed", meeting_at: when.toISOString(), counselor_note: text }
      : { ...before, status: "declined", counselor_note: text };

    if (wasMeeting) {
      focusAfter.current = { meeting: action === "confirm" ? id : null, fallback: "calendar" };
    } else {
      const list = splitRequests(requestsRef.current).pending;
      const at = list.findIndex((r) => r.id === id);
      const neighbour = at < 0 ? null : list[at + 1] || list[at - 1] || null;
      focusAfter.current = { row: neighbour ? neighbour.id : null, fallback: "waiting" };
    }

    inFlight.current.add(id);
    changes.current += 1;
    markSaving(id, true);
    setRequests((prev) => prev.map((r) => (r.id === id ? next : r)));
    setOpenId(null);

    let saved = null;
    let failed = null;
    try {
      saved = await api.answerRequest(id, { action, time: when ? when.toISOString() : null, note: text });
    } catch (e) {
      failed = e || new Error("answer failed");
    }
    inFlight.current.delete(id);
    changes.current += 1;
    if (!alive.current) return;
    markSaving(id, false);

    if (!failed) {
      drafts.current.delete(id);
      // Its times leave the calendar with it. (A failed answer brings the
      // request back still picked, so its times come back too.)
      setPickedId((p) => (p === id ? null : p));
      const row = saved && typeof saved === "object" && saved.id === id ? { ...next, ...saved } : next;
      setRequests((prev) => prev.map((r) => (r.id === id ? row : r)));
      if (action === "confirm") {
        const at = toDate(row.meeting_at) || when;
        const label = formatWhen(at);
        notify(wasMeeting ? `Moved your meeting with ${who} to ${label}.` : `Confirmed with ${who} for ${label}.`, {
          action: <Button kind="secondary" onClick={() => showOnCalendar(id, at)}>Show on calendar</Button>,
        });
      } else {
        notify(`${wasMeeting ? `Declined your meeting with ${who}.` : `Declined the request from ${who}.`}`
          + `${text ? " They will see your note." : ""}`);
      }
      return;
    }

    console.warn("[counselor] answer failed:", failed?.code || "error");
    // Back to what the database last returned. A note they typed is still in
    // `drafts` (the sheet reports it as it is typed) for when they open it again.
    setRequests((prev) => prev.map((r) => (r.id === id ? before : r)));
    if (failed?.code === "not_signed_in") { navigate?.(SIGN_IN_PATH, { replace: true }); return; }
    notify(`${counselorErrorMessage(failed)} ${wasMeeting ? `Your meeting with ${who} is as it was.` : `The request from ${who} is back in the waiting list.`}`
      + `${text ? " Your note is kept for when you open it again." : ""}`, { error: true });
    // The refusal may mean the request changed under us (the student
    // cancelled, or left the school): read what is true now.
    refresh(false);
  };

  // ── Layout ────────────────────────────────────────────────────────────────

  const shell = (children) => (
    <CounselorShell me={me} active="schedule" navigate={navigate} pending={pending.length}>
      <div style={{ minWidth: 0, fontFamily: SANS, color: TEXT, ...ringVar(ink) }}>
        <PageHeader title="Schedule" isMobile={isMobile} style={{ margin: "0 0 1.3rem" }}>
          Meeting requests from your students, and the meetings you have confirmed.
          {zone ? ` Times are in your own time zone, ${zone}.` : ""}
        </PageHeader>
        {children}
      </div>
    </CounselorShell>
  );

  if (phase === "loading") {
    return shell(
      <div role="status" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, padding: "4rem 0",
        fontFamily: SANS, fontSize: "1rem", fontWeight: 600, color: TEXT_MUTED }}>
        <Spinner size={20} color={ink.text} />
        Loading your schedule
      </div>,
    );
  }

  if (phase === "error") {
    return shell(
      <Card role="alert" style={{ maxWidth: 560, padding: "1.4rem 1.4rem 1.5rem" }}>
        <Heading>Your schedule did not load</Heading>
        <p style={{ margin: "8px 0 0", fontFamily: SANS, fontSize: "1rem", color: TEXT_MID, lineHeight: 1.6 }}>
          {loadError || "Something went wrong. Try again."}
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 18 }}>
          <Button kind="primary" onClick={load}>Try again</Button>
          <Button kind="secondary" onClick={() => navigate?.(ENTRY_PATH)}>Back to the caseload</Button>
        </div>
      </Card>,
    );
  }

  const openSheet = (request) => setOpenId(request.id);

  // What the dashed outlines are, said in words beside them while a request
  // is picked (above the list on a phone, under the grid on a wider screen).
  const outside = offeredAll.length - offeredShown;
  const legend = picked && offeredAll.length > 0 ? (
    <p style={{ margin: asList ? "0 0 12px" : "12px 0 0", display: "flex", alignItems: "flex-start", gap: 10, fontFamily: SANS,
      fontSize: "0.95rem", fontWeight: 500, color: TEXT_MUTED, lineHeight: 1.5 }}>
      <span style={{ display: "flex", marginTop: 2 }}><OfferedSwatch /></span>
      <span style={{ minWidth: 0 }}>
        {offeredAll.length === 1
          ? `Dashed: the time ${pickedName} offered. Nothing is booked until you confirm it.`
          : `Dashed: times ${pickedName} offered. Nothing is booked until you confirm one.`}
        {outside > 0 && (offeredShown === 0
          ? ` ${offeredAll.length === 1 ? "It is" : "They are"} not in this ${unit}.`
          : ` ${outside} more ${outside === 1 ? "is" : "are"} not in this ${unit}.`)}
      </span>
    </p>
  ) : null;

  const pad = isMobile ? "1rem" : "1.1rem 1.2rem 1.25rem";
  const calendarCard = (
    <Card key="calendar" as="section" aria-labelledby="cs-calendar-heading" style={{ padding: pad }}>
      <Heading id="cs-calendar-heading" style={{ marginBottom: 12 }}>Confirmed meetings</Heading>
      <CalendarToolbar view={view} onView={changeView} title={title} summary={summary} titleId={TITLE_ID} titleRef={titleRef}
        onPrev={() => show(view, shiftAnchor(view, anchor, -1))} onNext={() => show(view, shiftAnchor(view, anchor, 1))}
        onToday={goToday} isMobile={isMobile} />
      {asList && legend}
      {asList ? (
        <CalendarAgenda days={agendaDays} byDay={byDay} offered={offered} now={now} onOpen={openSheet} labelledBy={TITLE_ID}
          emptyText={`${summary}.`} />
      ) : view === "month" ? (
        <CalendarMonth anchor={anchor} byDay={byDay} offered={offered} now={now} selectedKey={selectedKey} onSelect={selectDay}
          onShift={(date) => show("month", startOfDay(date))} onOpen={openSheet} onSeeWeek={seeWeek} labelledBy={TITLE_ID} />
      ) : (
        <CalendarWeek days={days} byDay={byDay} offered={offered} now={now} onOpen={openSheet} labelledBy={TITLE_ID} />
      )}
      {!asList && legend}
    </Card>
  );
  const railCard = (
    <Card key="rail" style={{ padding: side ? "1.1rem 1rem" : pad }}>
      <RequestList requests={pending} closed={closed} now={now} pickedId={picked ? picked.id : null} onPick={pick}
        onOpen={openSheet} byDay={byDay} shownKeys={shownKeys} unit={unit} onShowTime={showOffered} headingRef={waitingHeadRef}
        onRefresh={() => refresh(true)} refreshing={refreshing} />
    </Card>
  );

  return shell(
    <>
      {/* The page reads in the order it is seen: the calendar then the rail
          side by side, the rail first when it sits above. */}
      <div style={{ display: "grid", gap: 20, alignItems: "start",
        gridTemplateColumns: side ? `minmax(0, 1fr) ${RAIL_PX}px` : "minmax(0, 1fr)" }}>
        {side ? [calendarCard, railCard] : [railCard, calendarCard]}
      </div>

      <p aria-live="polite" style={SR_ONLY}>{announce}</p>
      <Toast notice={toast} onDismiss={dismissToast} />

      <AnimatePresence>
        {openRequest && (
          <RequestSheet key={openRequest.id} request={openRequest} now={now} busy={saving.has(openRequest.id)}
            draft={drafts.current.get(openRequest.id)} onAnswer={answer}
            onDraft={(id, notes) => { drafts.current.set(id, notes); }} onClose={() => setOpenId(null)}
            onGo={(path) => { setOpenId(null); navigate?.(path); }} />
        )}
      </AnimatePresence>
    </>,
  );
}
