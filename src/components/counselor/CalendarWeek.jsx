import { useId } from "react";
import { SR_ONLY } from "../ui/kit.jsx";
import { BORDER, RADIUS, SANS, TEXT_MUTED, WHITE, useAgentInk } from "../ui/tokens.js";
import {
  dayEntries, dayKey, formatDayLong, hourLabel, meetingCount, offeredCount, weekHours, weekdayShort,
} from "./ScheduleLogic.js";
import { COMPACT_REM, DayNumber, EntryButton, TodayMark, entryKey } from "./ScheduleParts.jsx";

// The week: seven days as columns, an hour to a row, each meeting in the row
// of the hour it starts in. A request carries a time and no length, so a
// meeting is a card in its hour, never a block drawn to a made-up duration;
// two in the same hour stack, and that row grows for the whole week.
//
// While a waiting request is chosen, the times that student offered are drawn
// in their hours too, dashed and amber and labelled "Offered", beside what is
// already booked: a clash shows before a time is confirmed. Nothing about
// them is booked. Pressing one opens the request.
//
// Every column lays its hours out on the same row heights (worked out here,
// in rem so they follow the reader's text size), which is what keeps the
// hour lines level across the days without one shared grid. In the page's
// order a day's entries come together, earliest first, so Tab walks Sunday,
// then Monday, and so on, and each day is a group named by its heading.

const ROW_MIN = 3.75;      // an empty hour, in rem
const PAD = 0.375;         // above and below the cards in a row: room for a focus ring
const GAP = 0.25;          // between two cards in the same hour
const LINE = 0.1;          // the row's own top line, which sits inside its height
const HEAD = 4;            // a day's heading
const HEAD_TODAY = 5.6;    // taller in the week that holds today, for its "Today" mark
const GUTTER = "3.75rem";  // the hour labels

/**
 * days: the seven Dates. byDay: meetingsByDay(). offered: offeredByDay() for
 * the chosen request, or an empty Map. onOpen(request) opens a meeting or,
 * from an offered time, the request it belongs to.
 */
export default function CalendarWeek({ days, byDay, offered, now, onOpen, labelledBy }) {
  const ink = useAgentInk();
  const uid = useId();
  const todayKey = dayKey(now);
  const columns = days.map((day) => {
    const key = dayKey(day);
    const entries = dayEntries(byDay, offered, key);
    return { day, key, entries, booked: (byDay.get(key) || []).length };
  });
  const hours = weekHours(columns.flatMap((c) => c.entries));
  const inHour = (entries, hour) => entries.filter((e) => e.at.getHours() === hour);
  const rows = hours.map((hour) => {
    const most = Math.max(0, ...columns.map((c) => inHour(c.entries, hour).length));
    return Math.max(ROW_MIN, most * COMPACT_REM + Math.max(0, most - 1) * GAP + PAD * 2 + LINE);
  });
  const template = rows.map((r) => `${r}rem`).join(" ");
  const head = `${columns.some((c) => c.key === todayKey) ? HEAD_TODAY : HEAD}rem`;
  const line = `1px solid ${BORDER}`;

  return (
    <div role="group" aria-labelledby={labelledBy}
      style={{ display: "flex", border: line, borderRadius: RADIUS.control, overflow: "hidden", background: WHITE }}>
      {/* The hours down the side. Each meeting says its own time, so these are for the eye only. */}
      <div aria-hidden="true" style={{ flex: `0 0 ${GUTTER}` }}>
        <div style={{ height: head, boxSizing: "border-box", borderBottom: line }} />
        <div style={{ display: "grid", gridTemplateRows: template }}>
          {hours.map((hour, i) => (
            <div key={hour} style={{ boxSizing: "border-box", borderTop: i ? line : "none", padding: "4px 8px 0 4px",
              textAlign: "right", fontFamily: SANS, fontSize: "0.9rem", fontWeight: 600, color: TEXT_MUTED,
              whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
              {hourLabel(hour)}
            </div>
          ))}
        </div>
      </div>

      {columns.map(({ day, key, entries, booked }) => {
        const isToday = key === todayKey;
        const headingId = `${uid}-${key}`;
        const extra = entries.length - booked;
        const count = `${booked ? meetingCount(booked) : "no meetings"}${extra ? `, and ${offeredCount(extra)}, not booked` : ""}`;
        return (
          <div key={key} role="group" aria-labelledby={headingId}
            style={{ flex: "1 1 0", minWidth: 0, borderLeft: line, background: isToday ? ink.softer : WHITE }}>
            <h4 id={headingId}
              style={{ margin: 0, height: head, boxSizing: "border-box", padding: "5px 6px 4px", display: "flex",
                flexDirection: "column", alignItems: "flex-start", gap: 2, borderBottom: line,
                borderTop: `3px solid ${isToday ? ink.button.bg : "transparent"}`, fontFamily: SANS, overflow: "hidden" }}>
              <span aria-hidden="true" style={{ fontSize: "0.9rem", fontWeight: 700, color: TEXT_MUTED, lineHeight: 1.3 }}>
                {weekdayShort(day)}
              </span>
              <span aria-hidden="true" style={{ display: "flex" }}><DayNumber date={day} today={isToday} /></span>
              {isToday && <TodayMark hidden />}
              <span style={SR_ONLY}>{`${formatDayLong(day)}${isToday ? ", today" : ""}, ${count}`}</span>
            </h4>
            <div style={{ display: "grid", gridTemplateRows: template }}>
              {hours.map((hour, i) => (
                <div key={hour} style={{ boxSizing: "border-box", minWidth: 0, borderTop: i ? line : "none",
                  padding: `${PAD}rem 0.375rem`, display: "flex", flexDirection: "column", gap: `${GAP}rem` }}>
                  {inHour(entries, hour).map((entry) => (
                    <EntryButton key={entryKey(entry)} entry={entry} now={now} onOpen={onOpen} compact />
                  ))}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
