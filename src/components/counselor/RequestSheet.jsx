import { useEffect, useId, useRef, useState } from "react";
import Sheet from "../agents/outreach/Sheet.jsx";
import { formatWhen } from "../../lib/counselor.js";
import { PixelArrow, PixelStamp } from "../ui/PixelIcons.jsx";
import { Button, FieldLabel, INPUT_CLASS, LinkButton, Notice, inputStyle } from "../ui/kit.jsx";
import {
  AMBER_BG, AMBER_TEXT, BORDER, DANGER, FOCUS_CLASS, RADIUS, SANS, SURFACE, TEXT, TEXT_MID, TEXT_MUTED, WHITE,
  useAgentInk,
} from "../ui/tokens.js";
import {
  INPUT_STEP_SECONDS, MAX_AHEAD_DAYS, NOTE_MAX, fromInputValue, gradeText, inputBounds, offeredTimes, statusText,
  timeProblem, toDate,
} from "./ScheduleLogic.js";
import { CloseButton, SMALL_LABEL } from "./ScheduleParts.jsx";
import { recordPath, studentPath } from "./counselorUi.jsx";

// One meeting request, opened: the whole message, the times the student
// offered, and what the counselor can do about it.
//
//   Waiting: choose one of the offered times (one that has passed is shown as
//   passed and cannot be chosen), or pick another, then confirm; or decline.
//   Confirmed: move it to another time, or decline it.
//   Closed: read only.
//
// Choosing a time and confirming it are two presses, so a stray click never
// tells a student they have a meeting. A note is optional either way and the
// student reads it with the answer.
//
// The sheet decides nothing itself. It hands the answer up through
// `onAnswer(request, { action, time, note })`; the page closes it, shows the
// change at once and puts it back, with a message, if the save fails. There
// are two notes, one to go with a yes and one to go with a no, since they
// rarely say the same thing. Both are reported through `onDraft` as they
// change, so closing the sheet by accident, or a save that fails, loses
// neither.
//
// Only what counselor_requests() returns is shown: the student's name, grade,
// message and times. The two links at the bottom go to pages that show what
// the student shares, and the record link is there only when they share
// their portfolio.

const OTHER = "other";
const AMBER_LINE = "#f3d9a4";
const PROBLEMS = {
  missing: "Enter a date and a time.",
  past: "That time has already passed. Pick one that is still ahead.",
  far: `Pick a time within the next ${MAX_AHEAD_DAYS} days.`,
};

/**
 * request: a row of counselor_requests(). now: the page's clock.
 * busy: an answer to this request is being saved. draft: { answer, decline },
 * notes typed earlier and not sent. onAnswer(request, { action, time, note }).
 * onDraft(id, { answer, decline }). onClose(). onGo(path): leave for another
 * counselor page.
 */
export default function RequestSheet({ request, now, busy = false, draft, onAnswer, onDraft, onClose, onGo }) {
  const ink = useAgentInk();
  const uid = useId();
  const id = (k) => `${uid}-${k}`;

  const pending = request.status === "pending";
  const confirmed = request.status === "confirmed";
  const canAnswer = (pending || confirmed) && !busy;
  // The database says "Student" when a name is not on file.
  const named = !!request.student_name && request.student_name !== "Student";
  const name = named ? request.student_name : "This student";
  const nameWithin = named ? request.student_name : "this student";
  const grade = gradeText(request.grade);
  const asked = formatWhen(request.created_at);
  const meetingAt = confirmed ? toDate(request.meeting_at) : null;
  const meetingPassed = !!meetingAt && meetingAt.getTime() < now.getTime();
  const times = offeredTimes(request, now);
  const isCurrent = (t) => !!meetingAt && t.at.getTime() === meetingAt.getTime();
  const pickable = times.filter((t) => !t.passed && !isCurrent(t));
  const bounds = inputBounds(now);

  const [mode, setMode] = useState("answer");          // answer | decline
  const [moving, setMoving] = useState(false);         // a confirmed meeting's time controls are open
  // With nothing left to choose from, the field for another time is already open.
  const [showOther, setShowOther] = useState(() => pickable.length === 0);
  const [choice, setChoice] = useState(() => (pickable.length === 0 ? OTHER : null));   // an offered time's key, OTHER, or null
  const [other, setOther] = useState("");
  // The note that goes with a confirmed time. A meeting already confirmed
  // starts from the note it has, so moving it does not wipe that.
  const [note, setNote] = useState(() => (typeof draft?.answer === "string" ? draft.answer : confirmed ? request.counselor_note || "" : ""));
  const [declineNote, setDeclineNote] = useState(() => (typeof draft?.decline === "string" ? draft.decline : ""));
  const [error, setError] = useState(null);            // { field: "times" | "other", message }
  const body = useRef(null);
  const focusNext = useRef(null);                       // a data-focus name to move to after the next render

  useEffect(() => {
    const what = focusNext.current;
    if (!what) return;
    focusNext.current = null;
    body.current?.querySelector(`[data-focus="${what}"]`)?.focus?.();
  });

  const typeNote = (kind, value) => {
    const text = value.slice(0, NOTE_MAX);
    if (kind === "decline") setDeclineNote(text); else setNote(text);
    onDraft?.(request.id, kind === "decline" ? { answer: note, decline: text } : { answer: text, decline: declineNote });
  };

  const chosen = choice === OTHER ? fromInputValue(other)
    : choice ? (pickable.find((t) => t.key === choice)?.at || null)
    : null;
  const chosenOk = !!chosen && !timeProblem(chosen, now);
  const confirmLabel = chosenOk ? `${confirmed ? "Move to" : "Confirm"} ${formatWhen(chosen)}`
    : confirmed ? "Move the meeting" : "Confirm a time";

  const fail = (field, message, focus) => {
    setError({ field, message });
    focusNext.current = focus;
  };

  const confirm = () => {
    if (!canAnswer) return;
    // The page's clock ticks once a minute: check against this very moment.
    const rightNow = new Date();
    let time = null;
    if (choice === OTHER) {
      time = fromInputValue(other);
      const problem = timeProblem(time, rightNow);
      if (problem) { fail("other", PROBLEMS[problem], "other"); return; }
    } else if (choice) {
      time = pickable.find((t) => t.key === choice)?.at || null;
      if (timeProblem(time, rightNow)) {
        setChoice(null);
        fail("times", "That time has just passed. Choose another one.", "time");
        return;
      }
    } else {
      fail("times", pickable.length ? "Choose one of the times, or pick another time." : "Pick a time first.", "time");
      return;
    }
    if (meetingAt && time.getTime() === meetingAt.getTime()) {
      fail(choice === OTHER ? "other" : "times", "That is the time the meeting is already set for.", choice === OTHER ? "other" : "time");
      return;
    }
    onAnswer(request, { action: "confirm", time, note: note.trim() });
  };

  const decline = () => {
    if (!canAnswer) return;
    onAnswer(request, { action: "decline", time: null, note: declineNote.trim() });
  };

  const follow = (path) => (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onGo?.(path);
  };

  // ── Pieces ────────────────────────────────────────────────────────────────

  const title = pending ? `${name} asked to meet`
    : confirmed ? `Meeting with ${nameWithin}`
    : `Request from ${nameWithin}`;
  const status = pending ? { tone: "amber", stamp: "clock", text: "Waiting for your answer" }
    : confirmed ? {
      tone: "accent", stamp: "check",
      text: meetingAt ? `Confirmed for ${formatWhen(meetingAt)}${meetingPassed ? ". This time has passed" : ""}` : "Confirmed",
    }
    : { tone: "plain", stamp: null, text: statusText(request.status) };
  const statusLook = status.tone === "amber" ? { background: AMBER_BG, border: `1px solid ${AMBER_LINE}`, color: AMBER_TEXT }
    : status.tone === "accent" ? { background: ink.softer, border: `1px solid ${ink.soft}`, color: ink.onSoft }
    : { background: SURFACE, border: `1px solid ${BORDER}`, color: TEXT_MID };

  const timeButton = (on, blocked) => ({
    width: "100%", minHeight: 48, boxSizing: "border-box", padding: "8px 14px", display: "flex", alignItems: "center",
    gap: 10, textAlign: "left", borderRadius: RADIUS.control, fontFamily: SANS, fontSize: "1rem", fontWeight: 700,
    lineHeight: 1.3, cursor: blocked ? "not-allowed" : "pointer", color: blocked ? TEXT_MUTED : TEXT,
    background: blocked ? SURFACE : on ? ink.softer : WHITE,
    border: `2px solid ${on ? ink.text : BORDER}`,
  });
  const tagStyle = {
    flexShrink: 0, padding: "1px 8px", borderRadius: RADIUS.pill, border: `1px solid ${BORDER}`, background: WHITE,
    color: TEXT_MUTED, fontSize: "0.9rem", fontWeight: 700, whiteSpace: "nowrap",
  };
  // The first thing in the time controls that can take focus after a refusal.
  const firstPick = pickable[0]?.key || null;

  // Only one of the two is on screen at a time, so they can share an id.
  const noteField = (kind, hint) => {
    const value = kind === "decline" ? declineNote : note;
    return (
      <div style={{ marginTop: 16 }}>
        <FieldLabel htmlFor={id("note")} optional hint={hint}>Add a note</FieldLabel>
        <textarea id={id("note")} data-focus="note" className={INPUT_CLASS} rows={2} maxLength={NOTE_MAX} value={value}
          onChange={(e) => typeNote(kind, e.target.value)} aria-describedby={id("note-count")}
          style={{ ...inputStyle, display: "block", resize: "vertical", minHeight: 76 }} />
        <p id={id("note-count")} style={{ margin: "4px 0 0", fontFamily: SANS, fontSize: "0.9rem", fontWeight: 600,
          color: TEXT_MUTED, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
          {value.length} of {NOTE_MAX} characters
        </p>
      </div>
    );
  };

  const timeControls = (
    <div style={{ marginTop: 18 }}>
      <h3 id={id("times")} style={SMALL_LABEL}>{confirmed ? "Move it to" : "Times that suit them"}</h3>
      {pending && times.length > 0 && pickable.length === 0 && (
        <Notice tone="warn" style={{ marginBottom: 10 }}>
          {times.length === 1 ? "The time they offered has passed." : "Every time they offered has passed."}
          {" "}Pick another time, or decline so they can ask again.
        </Notice>
      )}
      {pending && times.length === 0 && (
        <p style={{ margin: "0 0 10px", fontFamily: SANS, fontSize: "1rem", color: TEXT_MID, lineHeight: 1.5 }}>
          They did not offer a time. Pick one below.
        </p>
      )}
      <div role="group" aria-labelledby={id("times")} aria-describedby={error?.field === "times" ? id("error") : undefined}
        style={{ display: "grid", gap: 8 }}>
        {times.map((t) => {
          const current = isCurrent(t);
          const blocked = t.passed || current;
          const on = !blocked && choice === t.key;
          return (
            <button key={t.key} type="button" className={FOCUS_CLASS} aria-pressed={blocked ? undefined : on}
              aria-disabled={blocked || undefined} data-focus={t.key === firstPick ? "time" : undefined}
              onClick={() => { if (blocked) return; setChoice(on ? null : t.key); setError(null); }}
              style={timeButton(on, blocked)}>
              <span aria-hidden="true" style={{ display: "flex", width: 16, flexShrink: 0, color: ink.onSoft }}>
                {on && <PixelStamp kind="check" size={16} />}
              </span>
              <span style={{ flex: 1, minWidth: 0, textDecoration: t.passed && !current ? "line-through" : "none" }}>
                {formatWhen(t.at)}
              </span>
              {current ? <span style={tagStyle}>Current time</span> : t.passed ? <span style={tagStyle}>Passed</span> : null}
            </button>
          );
        })}
        <button type="button" className={FOCUS_CLASS} aria-expanded={showOther} aria-controls={id("other-box")}
          data-focus={firstPick ? undefined : "time"}
          onClick={() => { setShowOther(true); setChoice(OTHER); setError(null); focusNext.current = "other"; }}
          style={timeButton(choice === OTHER, false)}>
          <span aria-hidden="true" style={{ display: "flex", width: 16, flexShrink: 0, color: ink.onSoft }}>
            {choice === OTHER && <PixelStamp kind="check" size={16} />}
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>Pick another time</span>
        </button>
      </div>
      <div id={id("other-box")} hidden={!showOther} style={{ marginTop: 12 }}>
        {showOther && (
          <>
            <FieldLabel htmlFor={id("other")}
              hint={`Any time from now to ${MAX_AHEAD_DAYS} days ahead, in your own time zone.`}>
              Another time
            </FieldLabel>
            <input id={id("other")} data-focus="other" type="datetime-local" className={INPUT_CLASS} value={other}
              min={bounds.min} max={bounds.max} step={INPUT_STEP_SECONDS}
              aria-invalid={error?.field === "other" || undefined}
              aria-describedby={error?.field === "other" ? id("error") : undefined}
              onChange={(e) => { setOther(e.target.value); setChoice(OTHER); setError(null); }}
              style={{ ...inputStyle, display: "block", minWidth: 0, maxWidth: "100%" }} />
          </>
        )}
      </div>
      {error && (
        <p id={id("error")} role="alert" style={{ margin: "8px 0 0", fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700,
          color: DANGER, lineHeight: 1.45 }}>
          {error.message}
        </p>
      )}
    </div>
  );

  const actions = { display: "flex", flexWrap: "wrap", gap: 10, marginTop: 18 };

  return (
    <Sheet onClose={onClose} labelledBy={id("title")} width={560}>
      <div ref={body}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 id={id("title")} style={{ margin: 0, fontFamily: SANS, fontSize: "1.35rem", fontWeight: 800, color: TEXT,
              lineHeight: 1.25, letterSpacing: "-0.01em", overflowWrap: "anywhere" }}>
              {title}
            </h2>
            <p style={{ margin: "4px 0 0", fontFamily: SANS, fontSize: "1rem", fontWeight: 600, color: TEXT_MUTED, lineHeight: 1.45 }}>
              {[grade, asked ? `Asked ${asked}` : ""].filter(Boolean).join(". ")}{grade || asked ? "." : ""}
            </p>
          </div>
          <CloseButton onClick={onClose} />
        </div>

        <p style={{ display: "inline-flex", alignItems: "center", gap: 8, margin: "12px 0 0", padding: "5px 12px",
          borderRadius: RADIUS.control, fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700, lineHeight: 1.4, ...statusLook }}>
          {status.stamp && <PixelStamp kind={status.stamp} size={16} />}
          <span>{status.text}</span>
        </p>

        <h3 style={{ ...SMALL_LABEL, marginTop: 18 }}>Their message</h3>
        <p style={{ margin: 0, padding: "12px 14px", background: SURFACE, border: `1px solid ${BORDER}`,
          borderRadius: RADIUS.control, fontFamily: SANS, fontSize: "1.05rem", color: TEXT, lineHeight: 1.55,
          whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
          {request.message || "No message."}
        </p>

        {busy && (
          <Notice tone="info" style={{ marginTop: 16 }}>Saving your answer. This takes a moment.</Notice>
        )}

        {canAnswer && mode === "decline" && (
          <div style={{ marginTop: 18, padding: "14px 14px 16px", background: SURFACE, border: `1px solid ${BORDER}`,
            borderRadius: RADIUS.control }}>
            <h3 style={{ margin: 0, fontFamily: SANS, fontSize: "1.1rem", fontWeight: 800, color: TEXT, lineHeight: 1.3 }}>
              {confirmed ? "Decline this meeting?" : "Decline this request?"}
            </h3>
            <p style={{ margin: "6px 0 0", fontFamily: SANS, fontSize: "1rem", color: TEXT_MID, lineHeight: 1.55 }}>
              {name} will see that it was declined, with your note if you add one. They can send a new request.
            </p>
            {noteField("decline", "A line on why, or what to do next, helps.")}
            <div style={actions}>
              <Button kind="danger" onClick={decline} style={{ flex: "1 1 190px" }}>
                {confirmed ? "Decline the meeting" : "Decline the request"}
              </Button>
              <Button kind="secondary" onClick={() => { setMode("answer"); focusNext.current = "decline"; }} style={{ flex: "1 1 120px" }}>
                Go back
              </Button>
            </div>
          </div>
        )}

        {canAnswer && mode === "answer" && (pending || moving) && (
          <>
            {timeControls}
            {noteField("answer", `${name} reads it with your answer. For example, where to meet.`)}
            <div style={actions}>
              <Button kind="primary" onClick={confirm} style={{ flex: "1 1 240px" }}>{confirmLabel}</Button>
              {pending ? (
                <Button kind="secondary" data-focus="decline" onClick={() => { setMode("decline"); focusNext.current = "note"; }}
                  style={{ flex: "1 1 120px" }}>
                  Decline
                </Button>
              ) : (
                <Button kind="secondary" onClick={() => { setMoving(false); setError(null); focusNext.current = "move"; }}
                  style={{ flex: "1 1 120px" }}>
                  Keep the time
                </Button>
              )}
            </div>
          </>
        )}

        {confirmed && !(canAnswer && mode === "decline") && !moving && request.counselor_note && (
          <>
            <h3 style={{ ...SMALL_LABEL, marginTop: 18 }}>Your note to them</h3>
            <p style={{ margin: 0, fontFamily: SANS, fontSize: "1rem", color: TEXT, lineHeight: 1.55, whiteSpace: "pre-wrap",
              overflowWrap: "anywhere" }}>
              {request.counselor_note}
            </p>
          </>
        )}

        {/* A meeting whose time has passed can be given a new time, never declined after the fact. */}
        {canAnswer && mode === "answer" && confirmed && !moving && (
          <div style={actions}>
            <Button kind="secondary" data-focus="move" onClick={() => { setMoving(true); focusNext.current = "time"; }}
              style={{ flex: "1 1 190px" }}>
              {meetingPassed ? "Set a new time" : "Move to another time"}
            </Button>
            {!meetingPassed && (
              <Button kind="secondary" data-focus="decline" onClick={() => { setMode("decline"); focusNext.current = "note"; }}
                style={{ flex: "1 1 190px" }}>
                Decline this meeting
              </Button>
            )}
          </div>
        )}

        {!pending && !confirmed && (
          <>
            {request.counselor_note && (
              <>
                <h3 style={{ ...SMALL_LABEL, marginTop: 18 }}>Your note to them</h3>
                <p style={{ margin: 0, fontFamily: SANS, fontSize: "1rem", color: TEXT, lineHeight: 1.55, whiteSpace: "pre-wrap",
                  overflowWrap: "anywhere" }}>
                  {request.counselor_note}
                </p>
              </>
            )}
            <p style={{ margin: "16px 0 0", fontFamily: SANS, fontSize: "1rem", color: TEXT_MID, lineHeight: 1.55 }}>
              This request is closed. {name} can send a new one from their Profile.
            </p>
          </>
        )}

        {request.student_id && (
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${BORDER}` }}>
            <h3 style={SMALL_LABEL}>What they share with you</h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <LinkButton href={studentPath(request.student_id)} onClick={follow(studentPath(request.student_id))}
                style={{ flex: "1 1 200px" }}>
                Open their page
                <PixelArrow size={16} />
              </LinkButton>
              {request.shares_portfolio === true && (
                <LinkButton href={recordPath(request.student_id)}
                  onClick={follow(recordPath(request.student_id))} style={{ flex: "1 1 200px" }}>
                  Open their printable record
                  <PixelArrow size={16} />
                </LinkButton>
              )}
            </div>
            {request.shares_portfolio !== true && (
              <p style={{ margin: "8px 0 0", fontFamily: SANS, fontSize: "0.95rem", color: TEXT_MUTED, lineHeight: 1.5 }}>
                {name} has not shared their portfolio, so there is no record to print. Each student chooses what you see.
              </p>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}
