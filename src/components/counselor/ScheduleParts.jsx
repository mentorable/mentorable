import { PixelArrow } from "../ui/PixelIcons.jsx";
import {
  BORDER, FOCUS_CLASS, RADIUS, SANS, SURFACE, TEXT, TEXT_MID, TEXT_MUTED, WHITE, useAgentInk,
} from "../ui/tokens.js";
import { formatTime, gradeText, shortName } from "./ScheduleLogic.js";

// The small pieces the schedule's views share: the "Today" mark, a confirmed
// meeting as a button (a compact one for the week grid, a full one for the
// lists), the icon button, and the few rules inline styles cannot
// express (hover, and a focus ring drawn inside a month square so it is never
// cut off by its neighbours). The hover rules only touch properties the
// inline styles leave alone: an inline border or background would win.

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

/**
 * One confirmed meeting, as a button that opens it. `entry` is
 * { request, at } (see splitRequests). `compact` is the two-line form for a
 * square of the week grid: the time and a short name, with the full name in
 * the label. A meeting whose time has passed is drawn quietly and says so.
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
        <span style={{ ...oneLine, fontSize: "0.9rem", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{time}</span>
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
