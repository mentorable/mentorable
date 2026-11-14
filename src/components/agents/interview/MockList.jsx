import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { RUBRIC } from "../../../lib/interview.js";
import { interviewErrorMessage } from "../../../lib/agentsApi.js";
import { PixelArrow, PixelStamp } from "../../ui/PixelIcons.jsx";
import { Button, Card, SR_ONLY, Sheet } from "../../ui/kit.jsx";
import { AMBER_TEXT, BORDER, DANGER, FOCUS_CLASS, SANS, TEXT, TEXT_MID, TEXT_MUTED } from "../../ui/tokens.js";
import { UNFINISHED, dayLabel, minutesLabel, modeLabel, scoreOf, short, targetLine } from "./interviewUi.js";

// The student's past mocks on Poise's home, newest first, one scannable row
// each: what it was for, the kind, when and how long, then where it stands. A
// finished one shows its four practice scores as a short label over "N of 5"
// (never as colour alone; a screen reader hears the full rubric name). One
// that is still being finished says so and cannot be opened or deleted yet,
// since the server is still writing it. A narrow column (a phone, a split
// window) stacks the rows into small cards instead.
//
// Nothing here shows what the student said. The transcript and the notes are
// read on the report page only.

// The rubric's names, short enough for four across in a row.
const SHORT_LABEL = { examples: "Examples", structure: "Structure", why: "Why", conversation: "Conversation" };
// Wider than this, a mock is one row of three columns; narrower, a small card,
// its scores four across from CARD_FOUR_FROM and two by two under it.
const ROWS_FROM = 760;
const CARD_FOUR_FROM = 480;
// The actions column, the same in every row so the status column lines up
// (wide enough for "Transcript" and "Delete" side by side).
const ACTIONS_W = 252;

const meta = { margin: 0, fontFamily: SANS, fontSize: "0.95rem", fontWeight: 600, color: TEXT_MUTED, lineHeight: 1.5 };

/** The width of an element, kept current as it changes. */
function useWidth(ref) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const read = () => setWidth(el.clientWidth || 0);
    read();
    if (typeof ResizeObserver === "undefined") return undefined;
    const watch = new ResizeObserver(read);
    watch.observe(el);
    return () => watch.disconnect();
  }, [ref]);
  return width;
}

/** Where a mock stands. cols: 0 lays the scores in one wrapping line (a row),
 *  2 or 4 in a grid of that many columns (a card). */
function StatusLine({ mock, cols = 0 }) {
  const line = (stamp, text, color = TEXT_MID) => (
    <p style={{ ...meta, display: "flex", alignItems: "flex-start", gap: 8, color, fontWeight: 700 }}>
      <span aria-hidden="true" style={{ display: "flex", marginTop: 3, flexShrink: 0 }}><PixelStamp kind={stamp} size={16} /></span>
      <span>{text}</span>
    </p>
  );
  if (UNFINISHED.has(mock.status)) return line("clock", "Still wrapping up. Poise is reading this one.", AMBER_TEXT);
  if (mock.status === "refunded") {
    return line("check", mock.refund_reason === "no_call"
      ? "Given back: the call never really started. It didn't count."
      : "Given back: too short to read. It didn't count.");
  }
  if (mock.status === "no_feedback") return line("clock", "Feedback isn't written yet. Open it to try again.", AMBER_TEXT);
  const scored = RUBRIC.map((r) => ({ ...r, s: scoreOf(mock.scores, r.key) })).filter((r) => r.s);
  if (scored.length < RUBRIC.length) return line("scroll", "Notes only. It was too short to score.");
  return (
    <dl aria-label="Practice scores" style={cols
      ? { margin: 0, display: "grid", gap: "10px 16px", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }
      : { margin: 0, display: "flex", flexWrap: "wrap", gap: "8px 22px" }}>
      {scored.map((r) => (
        <div key={r.key} style={{ minWidth: 0 }}>
          <dt style={{ ...meta, fontWeight: 700, color: TEXT_MID, overflowWrap: "anywhere" }}>
            <span aria-hidden="true">{SHORT_LABEL[r.key] || r.label}</span>
            <span style={SR_ONLY}>{r.label}</span>
          </dt>
          <dd style={{ margin: 0, fontFamily: SANS, fontSize: "1rem", fontWeight: 800, color: TEXT, lineHeight: 1.4,
            fontVariantNumeric: "tabular-nums" }}>
            {r.s.score} <span style={{ fontWeight: 700, color: TEXT_MID }}>of 5</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

function MockRow({ mock, onOpen, onAskDelete, rows, last, scoreCols = 2 }) {
  const uid = useId();
  const busy = UNFINISHED.has(mock.status);
  const when = dayLabel(mock.created_at || mock.started_at);
  const long = minutesLabel(mock.duration_s);
  const line = [modeLabel(mock.mode), when, long].filter(Boolean).join(", ");
  // A given-back mock keeps no transcript (service._refund stores none), so
  // every row opens the same way.
  const openWord = "Open";

  const head = (
    <div style={{ minWidth: 0 }}>
      <h3 id={`${uid}-t`} style={{ margin: 0, fontFamily: SANS, fontSize: "1.1rem", fontWeight: 800, color: TEXT,
        lineHeight: 1.35, overflowWrap: "anywhere" }}>
        {targetLine(mock)}
      </h3>
      {line && <p style={{ ...meta, marginTop: 2 }}>{line}</p>}
    </div>
  );
  const actions = busy ? <div aria-hidden="true" /> : (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: rows ? "flex-end" : "flex-start",
      gap: 4 }}>
      <Button kind="secondary" onClick={() => onOpen?.(mock.id)} aria-describedby={`${uid}-t`}>
        {openWord}
        <PixelArrow size={16} />
      </Button>
      <Button kind="quiet" tone="muted" onClick={(e) => onAskDelete(mock, e.currentTarget)} aria-describedby={`${uid}-t`}>
        Delete
      </Button>
    </div>
  );

  if (rows) {
    return (
      <li aria-labelledby={`${uid}-t`} style={{ display: "grid", alignItems: "center", gap: "10px 20px",
        gridTemplateColumns: `minmax(0, 1.5fr) minmax(0, 2fr) ${ACTIONS_W}px`, padding: "16px 20px",
        borderBottom: last ? "none" : `1px solid ${BORDER}` }}>
        {head}
        <div style={{ minWidth: 0 }}><StatusLine mock={mock} /></div>
        {actions}
      </li>
    );
  }
  return (
    <Card as="li" aria-labelledby={`${uid}-t`} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {head}
      <StatusLine mock={mock} cols={scoreCols} />
      {!busy && actions}
    </Card>
  );
}

/**
 * mocks: interview_mocks rows (LIST_COLUMNS), newest first. onOpen(id): go
 * to the report. onDelete(id): resolves when the row is gone, throws an
 * Error (or an InterviewError) when it is not.
 */
export default function MockList({ mocks, onOpen, onDelete }) {
  const uid = useId();
  const [asking, setAsking] = useState(null);        // the row the confirm is about
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);
  const headingRef = useRef(null);
  const toHeading = useRef(false);
  const boxRef = useRef(null);
  const width = useWidth(boxRef);

  const list = Array.isArray(mocks) ? mocks.filter((m) => m && m.id) : [];
  const rows = width >= ROWS_FROM;

  const ask = (mock) => { setError(null); setAsking(mock); };
  const close = () => { if (!deleting) setAsking(null); };
  const confirm = async () => {
    if (!asking || deleting) return;
    setDeleting(true); setError(null);
    try {
      await onDelete?.(asking.id);
      // The row that opened the confirm is gone: focus lands on the list's heading instead.
      toHeading.current = true;
      setDeleting(false);
      setAsking(null);
    } catch (e) {
      setDeleting(false);
      setError(interviewErrorMessage(e));
    }
  };

  // The measuring box is always there, so the width is known before the first row lands.
  return (
    <div ref={boxRef} style={{ minWidth: 0 }}>
      {(list.length > 0 || asking) && (
        <section aria-labelledby={`${uid}-h`} style={{ minWidth: 0 }}>
          <h2 id={`${uid}-h`} ref={headingRef} tabIndex={-1} className={FOCUS_CLASS}
            style={{ margin: "0 0 12px", fontFamily: SANS, fontSize: "1.3rem", fontWeight: 800, color: TEXT, letterSpacing: "-0.01em",
              borderRadius: 6 }}>
            Your mocks
          </h2>
          {list.length > 0 && (rows ? (
            <Card as="ul" style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {list.map((m, i) => (
                <MockRow key={m.id} mock={m} onOpen={onOpen} onAskDelete={ask} rows last={i === list.length - 1} />
              ))}
            </Card>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 12 }}>
              {list.map((m) => (
                <MockRow key={m.id} mock={m} onOpen={onOpen} onAskDelete={ask} rows={false}
                  scoreCols={width >= CARD_FOUR_FROM ? 4 : 2} />
              ))}
            </ul>
          ))}
        </section>
      )}

      <AnimatePresence onExitComplete={() => { if (toHeading.current) { toHeading.current = false; headingRef.current?.focus(); } }}>
        {asking && (
          <Sheet key="delete" onClose={close} locked={deleting} labelledBy={`${uid}-del`} width={480}>
            <h2 id={`${uid}-del`} style={{ margin: "0 0 8px", fontFamily: SANS, fontSize: "1.3rem", fontWeight: 800, color: TEXT,
              lineHeight: 1.3, overflowWrap: "anywhere" }}>
              Delete the mock for {short(targetLine(asking), 60)}?
            </h2>
            <p style={{ margin: 0, fontFamily: SANS, fontSize: "1.02rem", color: TEXT_MID, lineHeight: 1.6 }}>
              Its transcript, Poise&apos;s notes and its scores are deleted for good. This can&apos;t be undone, and it
              does not give the mock back.
            </p>
            {error && (
              <p role="alert" style={{ margin: "12px 0 0", fontFamily: SANS, fontSize: "0.98rem", fontWeight: 700, color: DANGER,
                lineHeight: 1.45 }}>
                {error}
              </p>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 18 }}>
              <Button kind="secondary" data-autofocus disabled={deleting} onClick={close} style={{ flex: "1 1 140px" }}>
                Keep it
              </Button>
              <Button kind="danger" busy={deleting} onClick={confirm} style={{ flex: "1 1 140px" }}>
                Delete this mock
              </Button>
            </div>
          </Sheet>
        )}
      </AnimatePresence>
    </div>
  );
}
