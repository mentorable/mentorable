import { useEffect, useId, useRef, useState } from "react";
import { Button, SR_ONLY } from "../ui/kit.jsx";
import { BORDER, RADIUS, SANS, SURFACE, TEXT, TEXT_MID, TEXT_MUTED, WHITE, useAgentInk } from "../ui/tokens.js";
import {
  addDays, addMonths, dayKey, formatDayLong, formatTime, givenName, meetingCount, monthWeeks, parseKey, sameMonth,
  startOfWeek, weekdayLong, weekdayShort,
} from "./ScheduleLogic.js";
import { DAY_CLASS, DayNumber, MeetingButton, TodayMark } from "./ScheduleParts.jsx";

// The month: a grid of days, each square one button showing how many
// meetings it holds and the first two. Choosing a day lists all of its
// meetings beside the grid (below it on a narrower screen), each one a
// button that opens it.
//
// The grid is one stop for Tab, as a date grid should be: the arrow keys
// move between days, Home and End go to the ends of the week, Page Up and
// Page Down change the month, and moving off an edge turns the page. Enter
// or Space chooses the day. The next Tab lands on that day's meetings.

const FIRST_SHOWN = 2;     // meetings named in a square; the count says the rest
const SQUARE = "7rem";

export default function CalendarMonth({ anchor, byDay, now, selectedKey, onSelect, onShift, onOpen, onSeeWeek, labelledBy }) {
  const ink = useAgentInk();
  const uid = useId();
  const hintId = `${uid}-hint`;
  const panelId = `${uid}-day`;
  const weeks = monthWeeks(anchor);
  const shown = new Set(weeks.flat().map(dayKey));
  const todayKey = dayKey(now);
  const [focusKey, setFocusKey] = useState(null);
  const wantFocus = useRef(null);          // the day to focus once the grid has drawn it
  const squares = useRef(new Map());

  // The one day Tab stops on: where the keys last were, else the chosen day,
  // else today, else the first of the month.
  const tabKey = shown.has(focusKey) ? focusKey
    : shown.has(selectedKey) ? selectedKey
    : sameMonth(now, anchor) ? todayKey
    : dayKey(new Date(anchor.getFullYear(), anchor.getMonth(), 1));

  useEffect(() => {
    const key = wantFocus.current;
    if (!key) return;
    wantFocus.current = null;
    squares.current.get(key)?.focus();
  });

  const moveTo = (date, turnPage) => {
    const key = dayKey(date);
    wantFocus.current = key;
    setFocusKey(key);
    if (turnPage || !shown.has(key)) onShift(date);
  };

  const onKeyDown = (e, date) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    let to = null;
    let turnPage = false;
    if (e.key === "ArrowLeft") to = addDays(date, -1);
    else if (e.key === "ArrowRight") to = addDays(date, 1);
    else if (e.key === "ArrowUp") to = addDays(date, -7);
    else if (e.key === "ArrowDown") to = addDays(date, 7);
    else if (e.key === "Home") to = startOfWeek(date);
    else if (e.key === "End") to = addDays(startOfWeek(date), 6);
    else if (e.key === "PageUp") { to = addMonths(date, -1); turnPage = true; }
    else if (e.key === "PageDown") { to = addMonths(date, 1); turnPage = true; }
    if (!to) return;
    e.preventDefault();
    moveTo(to, turnPage);
  };

  const line = `1px solid ${BORDER}`;
  const selectedDate = shown.has(selectedKey) ? parseKey(selectedKey) : null;
  const selectedEntries = selectedDate ? byDay.get(selectedKey) || [] : [];
  const oneLine = { display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.35 };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 20 }}>
      <div style={{ flex: "999 1 700px", minWidth: 0 }}>
        <div style={{ border: line, borderRadius: RADIUS.control, overflow: "hidden", background: WHITE }}>
          <table role="grid" aria-labelledby={labelledBy} aria-describedby={hintId}
            style={{ width: "100%", tableLayout: "fixed", borderCollapse: "separate", borderSpacing: 0 }}>
            <thead>
              <tr>
                {weeks[0].map((day, col) => (
                  <th key={day.getDay()} scope="col" abbr={weekdayLong(day)}
                    style={{ padding: "8px 8px", textAlign: "left", borderBottom: line, borderRight: col < 6 ? line : "none",
                      background: SURFACE, fontFamily: SANS, fontSize: "0.9rem", fontWeight: 700, color: TEXT_MUTED }}>
                    <span aria-hidden="true">{weekdayShort(day)}</span>
                    <span style={SR_ONLY}>{weekdayLong(day)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weeks.map((week, row) => (
                <tr key={dayKey(week[0])}>
                  {week.map((day, col) => {
                    const key = dayKey(day);
                    const entries = byDay.get(key) || [];
                    const isToday = key === todayKey;
                    const selected = key === selectedKey;
                    const outside = !sameMonth(day, anchor);
                    const named = entries.slice(0, 4)
                      .map((e) => `${formatTime(e.at)} ${e.request.student_name || "Student"}`).join(", ");
                    const label = `${formatDayLong(day)}${isToday ? ", today" : ""}, `
                      + (entries.length ? `${meetingCount(entries.length)}: ${named}${entries.length > 4 ? `, and ${entries.length - 4} more` : ""}` : "no meetings");
                    return (
                      <td key={key} style={{ padding: 0, verticalAlign: "top", borderRight: col < 6 ? line : "none",
                        borderBottom: row < weeks.length - 1 ? line : "none" }}>
                        <button type="button" className={DAY_CLASS} tabIndex={key === tabKey ? 0 : -1} aria-pressed={selected}
                          aria-label={label}
                          ref={(el) => { if (el) squares.current.set(key, el); else squares.current.delete(key); }}
                          onClick={() => { setFocusKey(key); onSelect(day); }}
                          onFocus={() => setFocusKey(key)}
                          onKeyDown={(e) => onKeyDown(e, day)}
                          style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: 1, width: "100%",
                            height: SQUARE, boxSizing: "border-box", padding: "6px 6px", overflow: "hidden", textAlign: "left",
                            border: "none", cursor: "pointer", fontFamily: SANS, color: outside ? TEXT_MUTED : TEXT,
                            background: selected ? ink.softer : outside ? SURFACE : WHITE,
                            boxShadow: selected ? `inset 0 0 0 2px ${ink.text}` : "none" }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 6, minHeight: "1.75rem" }}>
                            <DayNumber date={day} today={isToday} muted={outside} />
                            {isToday && (
                              <span style={{ fontSize: "0.9rem", fontWeight: 800, color: ink.onSoft, whiteSpace: "nowrap" }}>Today</span>
                            )}
                          </span>
                          {entries.length > 0 && (
                            <span style={{ ...oneLine, fontSize: "0.9rem", fontWeight: 800, color: ink.onSoft }}>
                              {meetingCount(entries.length)}
                            </span>
                          )}
                          {entries.slice(0, FIRST_SHOWN).map((e) => (
                            <span key={e.request.id} style={{ ...oneLine, fontSize: "0.9rem", fontWeight: 600 }}>
                              <span style={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{formatTime(e.at)}</span>
                              {" "}{givenName(e.request.student_name)}
                            </span>
                          ))}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p id={hintId} style={{ margin: "8px 0 0", fontFamily: SANS, fontSize: "0.9rem", fontWeight: 500, color: TEXT_MUTED, lineHeight: 1.5 }}>
          Choose a day to see its meetings. On a keyboard, the arrow keys move between days and Enter chooses one.
        </p>
      </div>

      <div role="group" aria-labelledby={panelId}
        style={{ flex: "1 1 280px", minWidth: 0, boxSizing: "border-box", border: line, borderRadius: RADIUS.control,
          background: WHITE, padding: "14px 14px 12px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 10px", marginBottom: 10 }}>
          <h4 id={panelId} style={{ margin: 0, fontFamily: SANS, fontSize: "1.1rem", fontWeight: 800, color: TEXT, lineHeight: 1.3 }}>
            {selectedDate ? formatDayLong(selectedDate) : "No day chosen"}
          </h4>
          {selectedDate && selectedKey === todayKey && <TodayMark />}
        </div>
        {!selectedDate ? (
          <p style={{ margin: 0, fontFamily: SANS, fontSize: "1rem", color: TEXT_MID, lineHeight: 1.5 }}>
            Choose a day on the calendar and its meetings are listed here.
          </p>
        ) : selectedEntries.length === 0 ? (
          <p style={{ margin: 0, fontFamily: SANS, fontSize: "1rem", color: TEXT_MID, lineHeight: 1.5 }}>
            Nothing is booked on this day.
          </p>
        ) : (
          <ul role="list" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
            {selectedEntries.map((entry) => (
              <li key={entry.request.id}><MeetingButton entry={entry} now={now} onOpen={onOpen} /></li>
            ))}
          </ul>
        )}
        {selectedDate && (
          <Button kind="quiet" onClick={() => onSeeWeek(selectedDate)} style={{ marginTop: 8, marginLeft: -10, padding: "10px 10px" }}>
            See this week
          </Button>
        )}
      </div>
    </div>
  );
}
