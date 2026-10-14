import { BORDER, RADIUS, SANS, TEXT, TEXT_MID, WHITE, useAgentInk } from "../ui/tokens.js";
import { dayEntries, dayKey, formatDayLong } from "./ScheduleLogic.js";
import { EntryButton, TodayMark, entryKey } from "./ScheduleParts.jsx";

// The calendar on a phone, or any screen too narrow for seven columns: a
// list of days, each with its meetings in time order, in place of a grid too
// narrow to read. The same Week and Month switch, Previous, Next and Today
// drive it. A week lists all seven days; a month lists the days that hold a
// meeting or an offered time, and today.
//
// While a waiting request is chosen, the times that student offered sit in
// their days as dashed amber items that say "Offered, not booked yet",
// among the meetings already booked.

/**
 * days: the Dates to list, in order. byDay: meetingsByDay(). offered:
 * offeredByDay() for the chosen request, or an empty Map. emptyText: what to
 * say when `days` is empty (a month with nothing booked).
 */
export default function CalendarAgenda({ days, byDay, offered, now, onOpen, labelledBy, emptyText }) {
  const ink = useAgentInk();
  const todayKey = dayKey(now);

  if (!days.length) {
    return (
      <p style={{ margin: 0, fontFamily: SANS, fontSize: "1rem", color: TEXT_MID, lineHeight: 1.5 }}>{emptyText}</p>
    );
  }

  return (
    <ol role="list" aria-labelledby={labelledBy} style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
      {days.map((day) => {
        const key = dayKey(day);
        const entries = dayEntries(byDay, offered, key);
        const booked = (byDay.get(key) || []).length;
        const isToday = key === todayKey;
        return (
          <li key={key}
            style={{ boxSizing: "border-box", minWidth: 0, padding: "10px 12px 12px", background: WHITE,
              borderRadius: RADIUS.control, borderStyle: "solid", borderWidth: "1px 1px 1px 4px",
              borderColor: isToday ? `${BORDER} ${BORDER} ${BORDER} ${ink.button.bg}` : BORDER }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 10px" }}>
              <h4 style={{ margin: 0, fontFamily: SANS, fontSize: "1.05rem", fontWeight: 800, color: TEXT, lineHeight: 1.3 }}>
                {formatDayLong(day)}
              </h4>
              {isToday && <TodayMark />}
            </div>
            {booked === 0 && (
              <p style={{ margin: "4px 0 0", fontFamily: SANS, fontSize: "0.95rem", fontWeight: 500, color: TEXT_MID, lineHeight: 1.5 }}>
                Nothing booked.
              </p>
            )}
            {entries.length > 0 && (
              <ul role="list" style={{ listStyle: "none", margin: "8px 0 0", padding: 0, display: "grid", gap: 8 }}>
                {entries.map((entry) => (
                  <li key={entryKey(entry)}><EntryButton entry={entry} now={now} onOpen={onOpen} /></li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}
