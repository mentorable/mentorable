import { PixelArrow } from "../ui/PixelIcons.jsx";
import {
  AMBER_BG, AMBER_TEXT, BORDER, FOCUS_CLASS, RADIUS, SANS, SURFACE, TEXT, TEXT_MID, TEXT_MUTED, WHITE, useAgentInk,
} from "../ui/tokens.js";
import { formatTime, gradeText, shortName } from "./ScheduleLogic.js";

// The small pieces the schedule's views share: the "Today" mark, a confirmed
// meeting as a button (a compact one for the week grid, a full one for the
// lists), a time a student offered drawn beside them (dashed amber, and
// labelled "Offered", so it never reads as booked), the icon button, and the
// few rules inline styles cannot express (hover, and a focus ring drawn
// inside a month square so it is never cut off by its neighbours). The hover
// rules only touch properties the inline styles leave alone: an inline
// border or background would win.

export const ROW_CLASS = "cs-row";
export const DAY_CLASS = "cs-day";
const MEETING_CLASS = "cs-meeting";
const ICON_CLASS = "cs-icon";

const SCHEDULE_CSS = `
.${ROW_CLASS} { transition: box-shadow 0.15s; }
.${ROW_CLASS}:hover { box-shadow: inset 0 0 0 1.5px var(--ag-ring, #1d4ed8); }
.${MEETING_CLASS}:hover, .${ICON_CLASS}:hover { filter: brightness(0.96); }
.${DAY_CLASS}:hover { filter: brightness(0.97); }
.${DAY_CLASS}:focus-visible { outline: 3px solid var(--ag-ring, #1d4ed8); outline-offset: -3px; }
.${DAY_CLASS}:focus:not(:focus-visible) { outline: none; }
@media (prefers-reduced-motion: reduce) { .${ROW_CLASS} { transition: none; } }
`;
if (typeof document !== "undefined" && !document.querySelector("style[data-counselor-schedule]")) {
  const el = document.createElement("style");
  el.dataset.counselorSchedule = "";
  el.textContent = SCHEDULE_CSS;
  document.head.appendChild(el);
}

/** A small heading over a block inside a card or the sheet. */
export const SMALL_LABEL = {
  margin: "0 0 6px", fontFamily: SANS, fontSize: "0.95rem", fontWeight: 800, color: TEXT_MID, lineHeight: 1.35,
};

/** The word "Today" on the accent: today is marked by this, a filled date and
 *  a heavier edge, never by colour alone. `hidden` keeps it from being read
 *  twice where the day's label already says "today". */
export function TodayMark({ hidden = false, style }) {
  const ink = useAgentInk();
  return (
    <span aria-hidden={hidden || undefined}
      style={{ display: "inline-flex", alignItems: "center", flexShrink: 0, borderRadius: RADIUS.pill, padding: "1px 8px",
        background: ink.button.bg, color: ink.button.fg, fontFamily: SANS, fontSize: "0.9rem", fontWeight: 800,
        lineHeight: 1.4, whiteSpace: "nowrap", ...style }}>
      Today
    </span>
  );
}

/** The date's number, on a filled circle when it is today. */
export function DayNumber({ date, today, muted = false }) {
  const ink = useAgentInk();
  return (
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, minWidth: "1.75rem",
      height: "1.75rem", boxSizing: "border-box", padding: today ? "0 6px" : 0, borderRadius: RADIUS.pill,
      background: today ? ink.button.bg : "transparent", color: today ? ink.button.fg : muted ? TEXT_MUTED : TEXT,
      fontFamily: SANS, fontSize: "1.1rem", fontWeight: 800, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
      {date.getDate()}
    </span>
  );
}

export function Chevron({ dir = "right", size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"
      style={{ display: "block", transform: dir === "left" ? "scaleX(-1)" : "none" }}>
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

/** A 44px square button holding only an icon. `label` is what it is called. */
export function IconButton({ label, onClick, children, style, ...rest }) {
  return (
    <button type="button" className={`${FOCUS_CLASS} ${ICON_CLASS}`} aria-label={label} title={label} onClick={onClick}
      style={{ flexShrink: 0, width: 44, height: 44, display: "inline-flex", alignItems: "center", justifyContent: "center",
        boxSizing: "border-box", borderRadius: RADIUS.control, border: `1.5px solid ${BORDER}`, background: WHITE,
        color: TEXT_MID, cursor: "pointer", ...style }}
      {...rest}>
      {children}
    </button>
  );
}

export function CloseButton({ onClick, label = "Close" }) {
  return (
    <IconButton label={label} onClick={onClick} style={{ border: "none", background: "none", margin: "-6px -8px 0 0" }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6"
        strokeLinecap="round" aria-hidden="true" focusable="false">
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    </IconButton>
  );
}

/** How tall a compact meeting is, in rem, so the week grid can size its rows. */
export const COMPACT_REM = 3.25;

/** "10:15" from "10:15 AM", for the week grid's narrow squares: the row's own
 *  hour label already says AM or PM, and the button's label and tooltip keep
 *  the whole time. Without it "10:15 AM" does not fit a day column beside the
 *  requests rail. */
const clockOnly = (time) => time.replace(/\s*[AP]M$/i, "");

/**
 * One confirmed meeting, as a button that opens it. `entry` is
 * { request, at } (see splitRequests). `compact` is the two-line form for a
 * square of the week grid: the time without AM or PM (its row says which) and
 * a short name, with the full time and name in the label. A meeting whose time has passed is drawn quietly and says so.
 */
export function MeetingButton({ entry, now, onOpen, compact = false }) {
  const ink = useAgentInk();
  const { request, at } = entry;
  const past = at.getTime() < now.getTime();
  const name = request.student_name || "Student";
  const grade = gradeText(request.grade);
  const time = formatTime(at);
  const label = [time, name, grade, past ? "this meeting has passed" : ""].filter(Boolean).join(", ");
  const base = {
    width: "100%", minWidth: 0, boxSizing: "border-box", textAlign: "left", cursor: "pointer", fontFamily: SANS,
    borderRadius: 10, borderStyle: "solid", borderWidth: "1px 1px 1px 4px",
    borderColor: past ? `${BORDER} ${BORDER} ${BORDER} ${TEXT_MUTED}` : `${ink.soft} ${ink.soft} ${ink.soft} ${ink.button.bg}`,
    background: past ? SURFACE : ink.softer, color: past ? TEXT_MUTED : TEXT,
  };
  const oneLine = { display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.3 };

  if (compact) {
    return (
      <button type="button" className={`${FOCUS_CLASS} ${MEETING_CLASS}`} data-meeting={request.id} aria-label={label}
        title={label} onClick={() => onOpen(request)}
        style={{ ...base, height: `${COMPACT_REM}rem`, padding: "0.2rem 0.4rem", display: "flex", flexDirection: "column",
          justifyContent: "center", overflow: "hidden" }}>
        <span style={{ ...oneLine, fontSize: "0.9rem", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{clockOnly(time)}</span>
        <span style={{ ...oneLine, fontSize: "0.9rem", fontWeight: 600 }}>{shortName(name)}</span>
      </button>
    );
  }
  return (
    <button type="button" className={`${FOCUS_CLASS} ${MEETING_CLASS}`} data-meeting={request.id} aria-label={label}
      onClick={() => onOpen(request)}
      style={{ ...base, minHeight: 56, padding: "8px 12px", display: "flex", alignItems: "center", gap: 12 }}>
      <span style={{ flex: "0 0 auto", minWidth: "4.9rem", fontSize: "1rem", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
        {time}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: "1rem", fontWeight: 700, lineHeight: 1.35, overflowWrap: "anywhere" }}>{name}</span>
        {(grade || past) && (
          <span style={{ display: "block", fontSize: "0.9rem", fontWeight: 600, color: TEXT_MUTED, lineHeight: 1.35 }}>
            {[grade, past ? "Passed" : ""].filter(Boolean).join(", ")}
          </span>
        )}
      </span>
      <PixelArrow size={16} style={{ color: TEXT_MUTED }} />
    </button>
  );
}

/** The look of an offered time: amber, a dashed edge all round where a
 *  booked meeting has a solid one with a thick accent bar. */
const OFFERED_EDGE = `1.5px dashed ${AMBER_TEXT}`;

/**
 * A time a student offered, drawn beside the booked meetings while their
 * request is chosen. It is not a meeting, and it says so three ways: a
 * dashed amber edge, the word "Offered" on it, and a label that reads
 * "offered by <name>, not booked". Pressing it opens the request, where a
 * time is confirmed. `entry` is { request, at, id } (see offeredByDay);
 * `compact` is the two-line form for the week grid.
 */
export function OfferedButton({ entry, onOpen, compact = false }) {
  const { request, at } = entry;
  const name = request.student_name || "Student";
  const time = formatTime(at);
  const label = `${time}, offered by ${name}, not booked`;
  const base = {
    width: "100%", minWidth: 0, boxSizing: "border-box", textAlign: "left", cursor: "pointer", fontFamily: SANS,
    borderRadius: 10, border: OFFERED_EDGE, background: AMBER_BG, color: AMBER_TEXT,
  };
  const oneLine = { display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.3 };

  if (compact) {
    return (
      <button type="button" className={`${FOCUS_CLASS} ${MEETING_CLASS}`} data-offered={entry.id} aria-label={label}
        title={label} onClick={() => onOpen(request)}
        style={{ ...base, height: `${COMPACT_REM}rem`, padding: "0.2rem 0.4rem", display: "flex", flexDirection: "column",
          justifyContent: "center", overflow: "hidden" }}>
        <span style={{ ...oneLine, fontSize: "0.9rem", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{clockOnly(time)}</span>
        <span style={{ ...oneLine, fontSize: "0.9rem", fontWeight: 700 }}>Offered</span>
      </button>
    );
  }
  return (
    <button type="button" className={`${FOCUS_CLASS} ${MEETING_CLASS}`} data-offered={entry.id} aria-label={label}
      onClick={() => onOpen(request)}
      style={{ ...base, minHeight: 56, padding: "8px 12px", display: "flex", alignItems: "center", gap: 12 }}>
      <span style={{ flex: "0 0 auto", minWidth: "4.9rem", fontSize: "1rem", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
        {time}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: "1rem", fontWeight: 700, lineHeight: 1.35, overflowWrap: "anywhere" }}>{name}</span>
        <span style={{ display: "block", fontSize: "0.9rem", fontWeight: 700, lineHeight: 1.35 }}>Offered, not booked yet</span>
      </span>
      <PixelArrow size={16} />
    </button>
  );
}

/** A meeting or an offered time, whichever `entry` is. */
export function EntryButton({ entry, now, onOpen, compact = false }) {
  return entry.offered
    ? <OfferedButton entry={entry} onOpen={onOpen} compact={compact} />
    : <MeetingButton entry={entry} now={now} onOpen={onOpen} compact={compact} />;
}

/** A small dashed box for the line that explains the outlines. */
export function OfferedSwatch() {
  return (
    <span aria-hidden="true" style={{ flexShrink: 0, display: "inline-block", width: 34, height: 18, boxSizing: "border-box",
      borderRadius: 6, border: OFFERED_EDGE, background: AMBER_BG }} />
  );
}

/** The React key of an entry: a meeting is its request, an offered time its own id. */
export const entryKey = (entry) => (entry.offered ? `offered-${entry.id}` : entry.request.id);
