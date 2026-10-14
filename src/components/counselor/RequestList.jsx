import { PixelArrow, PixelStamp } from "../ui/PixelIcons.jsx";
import { Button, StampTile } from "../ui/kit.jsx";
import {
  AMBER_BG, AMBER_TEXT, BORDER, FOCUS_CLASS, RADIUS, SANS, TEXT, TEXT_MID, TEXT_MUTED, WHITE,
} from "../ui/tokens.js";
import { askedAgo, firstWords, gradeText, offeredTimes, statusText } from "./ScheduleLogic.js";
import { ROW_CLASS } from "./ScheduleParts.jsx";

// The requests waiting for the counselor, above the calendar: whoever has
// waited longest first. A row says who asked, their grade, when, and the
// start of what they wrote; pressing it opens the whole inquiry. Waiting is
// amber, never red.
//
// And, under the calendar, the ones closed lately (declined, or cancelled by
// the student), so an answer can be looked up after it is given.

const AMBER_LINE = "#f3d9a4";

const rowStyle = {
  width: "100%", boxSizing: "border-box", textAlign: "left", display: "flex", flexWrap: "wrap", alignItems: "center",
  gap: "6px 16px", minHeight: 64, padding: "12px 14px", background: WHITE, border: `1.5px solid ${BORDER}`,
  borderRadius: RADIUS.control, cursor: "pointer", fontFamily: SANS, color: TEXT,
};

function Who({ request }) {
  const grade = gradeText(request.grade);
  return (
    <span style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "0 10px" }}>
      <span style={{ fontSize: "1.1rem", fontWeight: 800, lineHeight: 1.3, overflowWrap: "anywhere" }}>
        {request.student_name || "Student"}
      </span>
      {grade && <span style={{ fontSize: "0.95rem", fontWeight: 600, color: TEXT_MUTED }}>{grade}</span>}
    </span>
  );
}

/** How many of the offered times can still be picked. All gone is the one
 *  thing on a row that needs a second look, so it is the amber one. */
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

/**
 * requests: the pending ones, oldest first (splitRequests). onOpen(request).
 * headingRef: the heading takes focus when the last row is answered.
 * onRefresh / refreshing: look for new requests without leaving the page.
 */
export default function RequestList({ requests, now, onOpen, headingRef, onRefresh, refreshing = false, isMobile = false }) {
  const n = requests.length;
  return (
    <section aria-labelledby="cs-waiting-title">
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "6px 12px",
        marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: "1 1 240px" }}>
          <StampTile kind="clock" size={40} lit={n > 0} />
          <h2 id="cs-waiting-title" ref={headingRef} tabIndex={-1} className={FOCUS_CLASS}
            style={{ margin: 0, display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 10px", fontFamily: SANS,
              fontSize: "1.3rem", fontWeight: 800, color: TEXT, lineHeight: 1.3, letterSpacing: "-0.01em", borderRadius: 6 }}>
            Waiting for your answer
            {n > 0 && (
              <span style={{ display: "inline-flex", alignItems: "center", padding: "1px 10px", borderRadius: RADIUS.pill,
                background: AMBER_BG, border: `1px solid ${AMBER_LINE}`, color: AMBER_TEXT, fontSize: "0.95rem", fontWeight: 800,
                letterSpacing: 0, fontVariantNumeric: "tabular-nums" }}>
                {n === 1 ? "1 request" : `${n} requests`}
              </span>
            )}
          </h2>
        </div>
        {onRefresh && (
          <Button kind="quiet" busy={refreshing} onClick={onRefresh} style={{ padding: "10px 10px" }}>
            Check for new requests
          </Button>
        )}
      </div>

      {n === 0 ? (
        <p style={{ margin: 0, fontFamily: SANS, fontSize: "1rem", color: TEXT_MID, lineHeight: 1.6, maxWidth: "60ch" }}>
          No requests are waiting. When a student asks for a meeting, it shows up here first.
        </p>
      ) : (
        <ul role="list" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
          {requests.map((request) => (
            <li key={request.id}>
              <button type="button" className={`${FOCUS_CLASS} ${ROW_CLASS}`} data-request-row={request.id}
                onClick={() => onOpen(request)} style={rowStyle}>
                <span style={{ flex: "1 1 280px", minWidth: 0 }}>
                  <Who request={request} />
                  <span style={{ display: "block", marginTop: 2, fontSize: "1rem", fontWeight: 500, color: TEXT_MID,
                    lineHeight: 1.45, overflowWrap: "anywhere" }}>
                    {firstWords(request.message) || "No message"}
                  </span>
                </span>
                {/* On a phone this takes the row under the message, so the arrow always ends it. */}
                <span style={{ flex: isMobile ? "1 1 0" : "0 1 auto", minWidth: 0, display: "flex", flexDirection: "column",
                  gap: 4, alignItems: isMobile ? "flex-start" : "flex-end" }}>
                  <span style={{ fontSize: "0.95rem", fontWeight: 700, color: TEXT_MID }}>{askedAgo(request.created_at, now)}</span>
                  <TimesNote request={request} now={now} />
                </span>
                <PixelArrow size={16} style={{ color: TEXT_MUTED }} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Requests that are closed, newest first. Nothing renders when there are none. */
export function ClosedRequests({ requests, now, onOpen }) {
  if (!requests.length) return null;
  return (
    <section aria-labelledby="cs-closed-title" style={{ marginTop: 28 }}>
      <h2 id="cs-closed-title" style={{ margin: "0 0 4px", fontFamily: SANS, fontSize: "1.3rem", fontWeight: 800, color: TEXT,
        lineHeight: 1.3, letterSpacing: "-0.01em" }}>
        Closed lately
      </h2>
      <p style={{ margin: "0 0 12px", fontFamily: SANS, fontSize: "1rem", color: TEXT_MUTED, lineHeight: 1.5 }}>
        Requests you declined, and ones a student cancelled, from the last two weeks.
      </p>
      <ul role="list" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
        {requests.map((request) => (
          <li key={request.id}>
            <button type="button" className={`${FOCUS_CLASS} ${ROW_CLASS}`} data-closed-row={request.id}
              onClick={() => onOpen(request)} style={{ ...rowStyle, minHeight: 56, padding: "8px 14px" }}>
              <span style={{ flex: "1 1 220px", minWidth: 0 }}><Who request={request} /></span>
              <span style={{ fontSize: "0.95rem", fontWeight: 700, color: TEXT_MID }}>{statusText(request.status)}</span>
              <span style={{ fontSize: "0.95rem", fontWeight: 600, color: TEXT_MUTED }}>{askedAgo(request.created_at, now)}</span>
              <PixelArrow size={16} style={{ color: TEXT_MUTED }} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
