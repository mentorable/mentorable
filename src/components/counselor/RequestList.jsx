import { useId, useState } from "react";
import { formatWhen } from "../../lib/counselor.js";
import { PixelArrow, PixelStamp } from "../ui/PixelIcons.jsx";
import { Button, SR_ONLY, StampTile } from "../ui/kit.jsx";
import {
  AMBER_BG, AMBER_TEXT, BORDER, FOCUS_CLASS, RADIUS, SANS, TEXT, TEXT_MID, TEXT_MUTED, WHITE, useAgentInk,
} from "../ui/tokens.js";
import { agoWords, clashNote, dayKey, firstWords, gradeText, offeredTimes, statusText } from "./ScheduleLogic.js";
import { ROW_CLASS, SMALL_LABEL } from "./ScheduleParts.jsx";

// The requests waiting for the counselor, in a rail beside the calendar
// (above it on a narrower screen): whoever has waited longest first. A folded
// card says who asked, their grade, when, and the start of what they wrote.
//
// Picking one opens it in place: the whole message and each time the student
// offered, with what is already booked near it ("The same time as your
// meeting with ..."), worked out against every confirmed meeting. At the same
// time the page draws those times on the calendar, dashed, so a clash shows
// before anything is confirmed. Nothing is booked from here: "Answer this
// request" opens the inquiry sheet, where a time is confirmed or the request
// declined. Waiting is amber, never red.
//
// Under the rail, behind a disclosure, the requests closed lately (declined,
// or cancelled by the student), so an answer can be looked up after it is
// given.

const AMBER_LINE = "#f3d9a4";
// One column in the rail, several across a wide screen when the rail sits
// above the calendar, one on a phone.
const CARDS = "repeat(auto-fill, minmax(min(100%, 300px), 1fr))";
const CLAMP = { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" };

function Who({ request, size = "1.1rem" }) {
  const grade = gradeText(request.grade);
  return (
    <span style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "0 10px" }}>
      <span style={{ fontSize: size, fontWeight: 800, lineHeight: 1.3, overflowWrap: "anywhere" }}>
        {request.student_name || "Student"}
      </span>
      {grade && <span style={{ fontSize: "0.95rem", fontWeight: 600, color: TEXT_MUTED }}>{grade}</span>}
    </span>
  );
}

/** How many of the offered times can still be picked. All gone is the one
 *  thing on a card that needs a second look, so it is the amber one. */
function TimesNote({ request, now }) {
  const times = offeredTimes(request, now);
  const ahead = times.filter((t) => !t.passed).length;
  if (times.length > 0 && ahead === 0) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "2px 10px", borderRadius: RADIUS.pill,
        background: AMBER_BG, border: `1px solid ${AMBER_LINE}`, color: AMBER_TEXT, fontSize: "0.9rem", fontWeight: 700,
        lineHeight: 1.4 }}>
        <PixelStamp kind="clock" size={16} />
        {times.length === 1 ? "The time they offered has passed" : "The times they offered have passed"}
      </span>
    );
  }
  const text = times.length === 0 ? "No times offered"
    : ahead < times.length ? `${ahead} of ${times.length} offered times still ahead`
    : times.length === 1 ? "1 time offered" : `${times.length} times offered`;
  return <span style={{ fontSize: "0.95rem", fontWeight: 600, color: TEXT_MUTED }}>{text}</span>;
}

/** One offered time in an opened card: when, and how it sits beside what is
 *  booked. A time the calendar is not showing gets a button that shows it. */
function OfferedLine({ request, time, byDay, shown, unit, onShowTime }) {
  const ink = useAgentInk();
  const note = time.passed ? null : clashNote(time.at, byDay);
  const when = formatWhen(time.at);
  return (
    <li style={{ padding: "8px 0 6px", borderTop: `1px solid ${note?.warn ? AMBER_LINE : BORDER}` }}>
      <span style={{ display: "block", fontSize: "1rem", fontWeight: 700, lineHeight: 1.35, fontVariantNumeric: "tabular-nums",
        color: time.passed ? TEXT_MUTED : TEXT, textDecoration: time.passed ? "line-through" : "none" }}>
        {when}
      </span>
      {note ? (
        <span style={{ display: "flex", alignItems: "flex-start", gap: 6, marginTop: 1, fontSize: "0.92rem",
          fontWeight: note.warn ? 700 : 600, color: note.warn ? AMBER_TEXT : TEXT_MUTED, lineHeight: 1.4 }}>
          {note.warn && <span style={{ display: "flex", flexShrink: 0, marginTop: 2 }}><PixelStamp kind="clock" size={16} /></span>}
          <span style={{ minWidth: 0 }}>{note.text}</span>
        </span>
      ) : (
        <span style={{ display: "block", marginTop: 1, fontSize: "0.92rem", fontWeight: 600, color: TEXT_MUTED, lineHeight: 1.4 }}>
          This time has passed
        </span>
      )}
      {!time.passed && !shown && (
        <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0 8px" }}>
          <span style={{ fontSize: "0.92rem", fontWeight: 600, color: TEXT_MUTED, lineHeight: 1.4 }}>Not in this {unit}.</span>
          <button type="button" className={FOCUS_CLASS} aria-label={`Show on the calendar: ${when}`}
            onClick={() => onShowTime(request, time.at)}
            style={{ minHeight: 44, padding: "0 4px", margin: "0 -4px", border: "none", background: "none", borderRadius: 8,
              cursor: "pointer", fontFamily: SANS, fontSize: "0.92rem", fontWeight: 800, color: ink.onSoft,
              textDecoration: "underline", textUnderlineOffset: 3 }}>
            Show on the calendar
          </button>
        </span>
      )}
    </li>
  );
}

/** One waiting request: folded, or picked and open. */
function RequestCard({ request, on, now, onPick, onOpen, byDay, shownKeys, unit, onShowTime }) {
  const ink = useAgentInk();
  const uid = useId();
  const detailId = `${uid}-detail`;
  const timesId = `${uid}-times`;
  const ago = agoWords(request.created_at, now);
  const times = on ? offeredTimes(request, now) : [];

  return (
    <div className={on ? undefined : ROW_CLASS}
      style={{ boxSizing: "border-box", minWidth: 0, borderRadius: RADIUS.control, fontFamily: SANS, color: TEXT,
        border: `1.5px solid ${on ? ink.text : BORDER}`, boxShadow: on ? `inset 0 0 0 1px ${ink.text}` : undefined,
        background: on ? ink.softer : WHITE }}>
      <button type="button" className={FOCUS_CLASS} data-request-row={request.id} aria-expanded={on} aria-controls={detailId}
        onClick={() => onPick(on ? null : request.id)}
        style={{ display: "block", width: "100%", minHeight: 44, boxSizing: "border-box", textAlign: "left",
          padding: on ? "12px 14px 2px" : "12px 14px", border: "none", borderRadius: RADIUS.control - 2,
          background: "transparent", cursor: "pointer", fontFamily: SANS, color: TEXT }}>
        <span style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ flex: 1, minWidth: 0 }}><Who request={request} /></span>
          {ago && (
            <span style={{ flexShrink: 0, fontSize: "0.92rem", fontWeight: 700, color: TEXT_MID }}>
              <span style={SR_ONLY}>Asked </span>{ago}
            </span>
          )}
        </span>
        {!on && (
          <>
            <span style={{ ...CLAMP, marginTop: 4, fontSize: "1rem", fontWeight: 500, color: TEXT_MID, lineHeight: 1.45,
              overflowWrap: "anywhere" }}>
              {firstWords(request.message, 140) || "No message"}
            </span>
            <span style={{ display: "block", marginTop: 6 }}><TimesNote request={request} now={now} /></span>
          </>
        )}
      </button>

      <div id={detailId} hidden={!on}>
        {on && (
          <div style={{ padding: "0 14px 14px" }}>
            <p style={{ margin: "4px 0 0", fontSize: "1rem", fontWeight: 500, color: TEXT, lineHeight: 1.5, whiteSpace: "pre-wrap",
              overflowWrap: "anywhere" }}>
              {request.message || "No message."}
            </p>
            <h3 id={timesId} style={{ ...SMALL_LABEL, margin: "12px 0 4px" }}>Times that suit them</h3>
            {times.length === 0 ? (
              <p style={{ margin: 0, fontSize: "0.95rem", fontWeight: 600, color: TEXT_MUTED, lineHeight: 1.5 }}>
                They did not offer a time. You can pick one when you answer.
              </p>
            ) : (
              <ul role="list" aria-labelledby={timesId} style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {times.map((t) => (
                  <OfferedLine key={t.key} request={request} time={t} byDay={byDay} shown={shownKeys.has(dayKey(t.at))}
                    unit={unit} onShowTime={onShowTime} />
                ))}
              </ul>
            )}
            <Button kind="primary" onClick={() => onOpen(request)} style={{ width: "100%", marginTop: 10 }}>
              Answer this request
              <PixelArrow size={16} />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * requests: the pending ones, oldest first (splitRequests). closed: the ones
 * closed lately. pickedId / onPick(id | null): the request whose times are
 * drawn on the calendar. onOpen(request): the inquiry sheet. byDay:
 * meetingsByDay() of every confirmed meeting. shownKeys: the day keys the
 * calendar is showing, and unit ("week" | "month") what it is showing.
 * onShowTime(request, at): bring an offered time into view on the calendar.
 * headingRef: the heading takes focus when the last request is answered.
 * onRefresh / refreshing: look for new requests without leaving the page.
 */
export default function RequestList({
  requests, closed = [], now, pickedId, onPick, onOpen, byDay, shownKeys, unit = "week", onShowTime, headingRef,
  onRefresh, refreshing = false,
}) {
  const uid = useId();
  const closedId = `${uid}-closed`;
  const [closedOpen, setClosedOpen] = useState(false);
  const n = requests.length;

  return (
    <section aria-labelledby="cs-waiting-title">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <StampTile kind="clock" size={32} lit={n > 0} />
        <h2 id="cs-waiting-title" ref={headingRef} tabIndex={-1} className={FOCUS_CLASS}
          style={{ flex: 1, minWidth: 0, margin: 0, fontFamily: SANS, fontSize: "1.15rem", fontWeight: 800, color: TEXT,
            lineHeight: 1.3, letterSpacing: "-0.01em", borderRadius: 6 }}>
          Waiting for your answer
          {n > 0 && <span style={SR_ONLY}>{`, ${n === 1 ? "1 request" : `${n} requests`}`}</span>}
        </h2>
        {n > 0 && (
          <span aria-hidden="true" style={{ flexShrink: 0, minWidth: 28, height: 28, padding: "0 8px", boxSizing: "border-box",
            display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: RADIUS.pill,
            background: AMBER_BG, border: `1px solid ${AMBER_LINE}`, color: AMBER_TEXT, fontFamily: SANS, fontSize: "0.95rem",
            fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
            {n}
          </span>
        )}
      </div>

      {n === 0 ? (
        <p style={{ margin: 0, fontFamily: SANS, fontSize: "1rem", color: TEXT_MID, lineHeight: 1.6, maxWidth: "60ch" }}>
          No requests are waiting. When a student asks for a meeting, it shows up here first.
        </p>
      ) : (
        <ul role="list" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: CARDS,
          alignItems: "start", gap: 10 }}>
          {/* An open card takes the whole row, so it never leaves a hole beside a folded one. */}
          {requests.map((request) => (
            <li key={request.id} style={{ minWidth: 0, gridColumn: request.id === pickedId ? "1 / -1" : undefined }}>
              <RequestCard request={request} on={request.id === pickedId} now={now} onPick={onPick} onOpen={onOpen}
                byDay={byDay} shownKeys={shownKeys} unit={unit} onShowTime={onShowTime} />
            </li>
          ))}
        </ul>
      )}

      {(onRefresh || closed.length > 0) && (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "0 8px",
          marginTop: 8 }}>
          {onRefresh && (
            <Button kind="quiet" busy={refreshing} onClick={onRefresh}
              style={{ padding: "10px 6px", marginLeft: -6, fontSize: "0.95rem" }}>
              Check for new requests
            </Button>
          )}
          {closed.length > 0 && (
            <button type="button" className={FOCUS_CLASS} aria-expanded={closedOpen} aria-controls={closedId}
              onClick={() => setClosedOpen((open) => !open)}
              style={{ minHeight: 44, padding: "0 6px", marginRight: -6, border: "none", background: "none", borderRadius: 8,
                cursor: "pointer", fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700, color: TEXT_MID,
                textDecoration: "underline", textUnderlineOffset: 3 }}>
              Closed lately ({closed.length})
            </button>
          )}
        </div>
      )}
      <div id={closedId} hidden={!closedOpen}>
        {closedOpen && <ClosedRequests requests={closed} now={now} onOpen={onOpen} />}
      </div>
    </section>
  );
}

/** Requests that are closed, newest first. Nothing renders when there are none. */
export function ClosedRequests({ requests, now, onOpen }) {
  if (!requests.length) return null;
  return (
    <div style={{ marginTop: 4, fontFamily: SANS }}>
      <p style={{ margin: "0 0 8px", fontSize: "0.95rem", fontWeight: 500, color: TEXT_MUTED, lineHeight: 1.5 }}>
        Requests you declined, and ones a student cancelled, from the last two weeks.
      </p>
      <ul role="list" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: CARDS, gap: 8 }}>
        {requests.map((request) => {
          const ago = agoWords(request.created_at, now);
          return (
            <li key={request.id} style={{ minWidth: 0 }}>
              <button type="button" className={`${FOCUS_CLASS} ${ROW_CLASS}`} data-closed-row={request.id}
                onClick={() => onOpen(request)}
                style={{ width: "100%", minHeight: 56, boxSizing: "border-box", display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 12px", textAlign: "left", background: WHITE, border: `1.5px solid ${BORDER}`,
                  borderRadius: RADIUS.control, cursor: "pointer", fontFamily: SANS, color: TEXT }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <Who request={request} size="1rem" />
                  <span style={{ display: "block", fontSize: "0.92rem", fontWeight: 600, color: TEXT_MUTED, lineHeight: 1.4 }}>
                    {statusText(request.status)}{ago ? `, asked ${ago}` : ""}
                  </span>
                </span>
                <PixelArrow size={16} style={{ color: TEXT_MUTED }} />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
