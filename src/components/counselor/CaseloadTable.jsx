import { useEffect, useState } from "react";
import { formatWhen } from "../../lib/counselor.js";
import { PixelStamp } from "../ui/PixelIcons.jsx";
import { Card, LINK_CLASS, SR_ONLY } from "../ui/kit.jsx";
import {
  AMBER_BG, AMBER_TEXT, BORDER, FOCUS_CLASS, RADIUS, SANS, SURFACE, TEXT, TEXT_MID, TEXT_MUTED, useAgentInk,
} from "../ui/tokens.js";
import { essayCell, gradeOf, listCell, questCell, sharesNothing, shortMark, streakCell } from "./caseloadRules.js";
import { AttentionMarks, ROW_CLASS, SKEL_CLASS, gradeLine, linkProps, recordPath, studentPath, toDate } from "./counselorUi.jsx";

// The caseload as a dense grid: one line per student, so a laptop screen holds
// the whole of a small caseload. Milestones and the personal statement's stage
// are small bars, the College List is its three counts (a zero under Likely in
// amber), then the streak, the record link and why a student may need the
// counselor. Every bar has a number or a word beside it and a sentence for a
// screen reader, so nothing is said by colour or length alone. The longer
// details (word counts, supplements, the note on a list's balance, the
// portfolio's counts) are on the student's page.
//
// Below the width where the grid fits, the same students are compact cards,
// so the page never scrolls sideways. A section a student has not shared says
// "Not shared", quietly: it is their choice, never a problem to fix.

const RULE = "#f0ebe5";        // the faint line between columns
const BAR_OFF = "#ddd7ce";     // a milestone or stage not reached yet
const BAR_HELD = "#86817a";    // a paused quest's done milestones (3.9:1 on white)
const AMBER_LINE = "#f3d9a4";
const MARK_STAMP = { request: "letter" };
const NUMS = "lining-nums tabular-nums";

// The grid's columns, in rem so they grow with the reader's font size. The
// Student column takes what is left over and needs at least STUDENT_MIN.
const COLS = [
  { key: "student", width: 0 },
  { key: "grade", width: 5.5 },
  { key: "quest", width: 10.75 },
  { key: "streak", width: 6 },   // "100 days" on one line
  { key: "list", width: 11 },
  { key: "essays", width: 9.75 },
  { key: "record", width: 7.5 },
  { key: "attention", width: 11.5 },
];
const STUDENT_MIN = 9.5;
const GRID_REM = COLS.reduce((n, c) => n + c.width, 0) + STUDENT_MIN;

/** Whether the window is wide enough for the grid: its columns, plus the
 *  shell's 64px of side padding and room for a scrollbar. In em, so a larger
 *  default font size moves the switch with the columns. */
export const GRID_FITS_QUERY = `(min-width: ${GRID_REM + 5.5}em)`;

/** True while the grid fits; false means the students show as cards. */
export function useGridFits() {
  const [fits, setFits] = useState(() => (
    typeof window !== "undefined" && typeof window.matchMedia === "function" && !!window.matchMedia(GRID_FITS_QUERY).matches
  ));
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const mql = window.matchMedia(GRID_FITS_QUERY);
    const update = () => setFits(!!mql.matches);
    update();
    if (mql.addEventListener) {
      mql.addEventListener("change", update);
      return () => mql.removeEventListener("change", update);
    }
    mql.addListener?.(update);
    return () => mql.removeListener?.(update);
  }, []);
  return fits;
}

// ─── Words and small parts ────────────────────────────────────────────────────

const QUIET = { fontSize: "0.92rem", fontWeight: 500, color: TEXT_MUTED };
const sub = { fontFamily: SANS, fontSize: "0.9rem", lineHeight: 1.35, fontWeight: 500, color: TEXT_MUTED, overflowWrap: "anywhere" };

/** A confirmed meeting that is still ahead (or has only just started), as
 *  { d, when }, or null. */
function nextMeeting(row) {
  const d = toDate(row?.next_meeting_at);
  if (!d || d.getTime() < Date.now() - 3600000) return null;
  const when = formatWhen(d);
  return when ? { d, when } : null;
}

/** "Oct 15", with the year when it is not this one. */
function shortDay(d) {
  const opts = { month: "short", day: "numeric" };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString("en-US", opts);
}

const MEETING = { ...sub, display: "flex", alignItems: "center", gap: 6, fontWeight: 600, color: TEXT_MID };

/** The student's next meeting, day and time spelled out (a card has room). */
function MeetingLine({ row, style }) {
  const meeting = nextMeeting(row);
  if (!meeting) return null;
  return (
    <span style={{ ...MEETING, ...style }}>
      <PixelStamp kind="check" size={16} />
      <span style={{ minWidth: 0 }}>Meeting {meeting.when}</span>
    </span>
  );
}

/** A row of small bars, `filled` of them lit. Decorative: the words beside
 *  them say the same. `held` greys the lit ones (a paused quest). */
function Bars({ count, filled, held = false, narrow = false }) {
  const ink = useAgentInk();
  if (!count) return null;
  const many = count > 5;
  const width = narrow ? 8 : many ? 7 : 12;
  return (
    <span aria-hidden="true" style={{ display: "inline-flex", gap: many ? 2 : 3, flexShrink: 0 }}>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} style={{ width, height: 10, borderRadius: 3,
          background: i < filled ? (held ? BAR_HELD : ink.button.bg) : BAR_OFF }} />
      ))}
    </span>
  );
}

/** Bars and their number or word for the eye, the sentence for a screen reader. */
function Measured({ bars, text, words, quiet }) {
  return (
    <>
      <span aria-hidden="true" style={{ display: "inline-flex", alignItems: "center", gap: 8, maxWidth: "100%",
        fontVariantNumeric: NUMS, ...(quiet ? QUIET : null) }}>
        {bars}
        <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{text}</span>
      </span>
      <span style={SR_ONLY}>{words}</span>
    </>
  );
}

function QuestValue({ quest }) {
  const c = questCell(quest);
  return <Measured bars={<Bars count={c.bars} filled={c.done} held={c.held} />} text={c.text} words={c.words} quiet={c.quiet} />;
}

/** The streak. In the grid its column says "Streak"; a card spells it out. */
function StreakValue({ quest, spelled = false }) {
  const c = streakCell(quest);
  const paused = c.text === "Paused";
  const shown = spelled && c.text && !paused ? c.words : c.text;
  return (
    <>
      {shown && (
        <span aria-hidden="true" style={{ fontVariantNumeric: NUMS, ...(spelled ? null : { whiteSpace: "nowrap" }),
          ...(paused ? { ...QUIET, fontWeight: 600 } : null) }}>
          {shown}
        </span>
      )}
      <span style={SR_ONLY}>{c.words}</span>
    </>
  );
}

function EssayValue({ essays }) {
  const c = essayCell(essays);
  return <Measured bars={<Bars count={c.bars} filled={c.step} narrow />} text={c.text} words={c.words} quiet={c.quiet} />;
}

const SLOT_W = "3rem";
const GROUPS = [["reach", "Reach"], ["target", "Target"], ["likely", "Likely"]];

function Slot({ n, warn }) {
  // A zero under Likely on a list with schools stands out in amber; any other
  // zero is quieter than a count.
  const look = warn ? { background: AMBER_BG, border: `1px solid ${AMBER_LINE}`, color: AMBER_TEXT, fontWeight: 800 }
    : { background: SURFACE, border: `1px solid ${BORDER}`, color: n === 0 ? TEXT_MUTED : TEXT, fontWeight: n === 0 ? 600 : 700 };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: SLOT_W, height: "1.875rem",
      boxSizing: "border-box", borderRadius: 8, fontFamily: SANS, fontSize: "0.95rem", fontVariantNumeric: NUMS, ...look }}>
      {n}
    </span>
  );
}

/** The list's three counts. `labelled` names each under its box (a card has
 *  no column header to do it). */
function ListValue({ list, labelled = false }) {
  const c = listCell(list);
  if (!c.shared || c.empty) return <span style={QUIET}>{c.words}</span>;
  return (
    <>
      <span aria-hidden="true" style={{ display: "inline-flex", gap: labelled ? 6 : 4 }}>
        {GROUPS.map(([key, label]) => {
          const slot = <Slot n={c[key]} warn={key === "likely" && c.warn} />;
          if (!labelled) return <span key={key} style={{ display: "flex" }}>{slot}</span>;
          return (
            <span key={key} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              {slot}
              <span style={{ ...sub, fontWeight: 600, lineHeight: 1.3 }}>{label}</span>
            </span>
          );
        })}
      </span>
      <span style={SR_ONLY}>{c.words}</span>
    </>
  );
}

function RecordValue({ row, navigate, style }) {
  const ink = useAgentInk();
  if (!row.portfolio) return <span style={QUIET}>Not shared</span>;
  return (
    <a {...linkProps(navigate, recordPath(row.student_id))} className={`${FOCUS_CLASS} ${LINK_CLASS}`}
      style={{ display: "inline-flex", alignItems: "center", minHeight: 44, fontFamily: SANS, fontSize: "0.95rem",
        fontWeight: 700, color: ink.text, whiteSpace: "nowrap", ...style }}>
      Open record<span style={SR_ONLY}> for {row.name || "Student"}</span>
    </a>
  );
}

/** The marks, short, for the grid's last column: an icon and a word or two in
 *  amber, the full reason for a screen reader. */
function ShortMarks({ marks }) {
  if (!marks.length) return <span style={SR_ONLY}>Nothing flagged</span>;
  return (
    <span style={{ display: "grid", gap: 2, padding: "2px 0" }}>
      {marks.map((m) => (
        <span key={m.key} style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: SANS, fontSize: "0.92rem",
          fontWeight: 700, color: AMBER_TEXT, lineHeight: 1.3 }}>
          <PixelStamp kind={Object.prototype.hasOwnProperty.call(MARK_STAMP, m.key) ? MARK_STAMP[m.key] : "clock"} size={16} />
          <span aria-hidden="true" style={{ minWidth: 0, overflowWrap: "anywhere" }}>{shortMark(m)}</span>
          <span style={SR_ONLY}>{m.label}.</span>
        </span>
      ))}
    </span>
  );
}

/** A student who shares none of the four sections: one quiet line. */
function NothingShared() {
  return (
    <span style={{ ...QUIET, fontSize: "0.95rem", display: "inline-flex", alignItems: "center", gap: 8 }}>
      <PixelStamp kind="lock" size={16} />
      Has not shared a section yet
    </span>
  );
}

// ─── The grid ─────────────────────────────────────────────────────────────────

const HEAD = {
  background: SURFACE, borderBottom: `1px solid ${BORDER}`, borderLeft: `1px solid ${RULE}`, verticalAlign: "top",
  textAlign: "left", fontFamily: SANS, fontSize: "0.92rem", fontWeight: 800, color: TEXT_MID, lineHeight: 1.3,
  padding: "9px 12px 8px",
};
const NOTE = { display: "block", marginTop: 1, fontSize: "0.9rem", fontWeight: 600, color: TEXT_MUTED, lineHeight: 1.3 };
const CELL = {
  height: 48, padding: "6px 12px", boxSizing: "border-box", verticalAlign: "middle", textAlign: "left",
  borderLeft: `1px solid ${RULE}`, fontFamily: SANS, fontSize: "0.95rem", fontWeight: 600, color: TEXT, lineHeight: 1.3,
};

function SortArrows({ dir }) {
  const up = dir === "asc";
  const down = dir === "desc";
  return (
    <svg width="10" height="14" viewBox="0 0 10 14" aria-hidden="true" focusable="false" style={{ flexShrink: 0 }}>
      <path d="M5 1 9 6H1z" fill="currentColor" opacity={up ? 1 : down ? 0.25 : 0.45} />
      <path d="M5 13 1 8h8z" fill="currentColor" opacity={down ? 1 : up ? 0.25 : 0.45} />
    </svg>
  );
}

/** A column that sorts: its header is a button, and aria-sort says which way
 *  the table runs. */
function SortHeader({ label, sortKey, sort, onSort, first = false }) {
  const on = sort.key === sortKey;
  return (
    <th scope="col" aria-sort={on ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      style={{ ...HEAD, padding: 0, ...(first ? { borderLeft: "none" } : null) }}>
      <button type="button" className={FOCUS_CLASS} onClick={() => onSort(sortKey)}
        style={{ width: "100%", minHeight: 44, padding: "9px 12px 8px", boxSizing: "border-box", display: "flex",
          alignItems: "flex-start", gap: 6, background: "none", border: "none", cursor: "pointer", fontFamily: SANS,
          fontSize: "0.92rem", fontWeight: 800, color: on ? TEXT : TEXT_MID, textAlign: "left", lineHeight: 1.3,
          outlineOffset: -3 }}>
        {label}
        <span style={{ display: "flex", marginTop: 2 }}><SortArrows dir={on ? sort.dir : null} /></span>
      </button>
    </th>
  );
}

function PlainHeader({ label, note, counts = false }) {
  return (
    <th scope="col" style={HEAD}>
      {label}
      {note && <span style={NOTE}>{note}</span>}
      {counts && (
        <span aria-hidden="true" style={{ display: "flex", gap: 4, marginTop: 1 }}>
          {GROUPS.map(([key, word]) => (
            <span key={key} style={{ ...NOTE, marginTop: 0, width: SLOT_W, textAlign: "center" }}>{word}</span>
          ))}
        </span>
      )}
    </th>
  );
}

/**
 * rows: the students to show, already filtered and in order. marksFor(row):
 * that student's attention marks. sort: { key, dir }; onSort(key) is a click
 * on a sorting header. schoolName names the table for a screen reader. Only
 * shown where useGridFits() says it fits.
 */
export default function CaseloadTable({ rows, marksFor, sort, onSort, navigate, schoolName }) {
  const openRow = (e, row) => {
    if (e.target.closest("a, button, input, select, label")) return;
    navigate?.(studentPath(row.student_id));
  };
  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
        <caption style={SR_ONLY}>
          Students linked to {schoolName || "your school"}, one row each. The Student, Grade and Meeting requests headers sort
          the table.
        </caption>
        <colgroup>
          {COLS.map((c) => <col key={c.key} style={c.width ? { width: `${c.width}rem` } : undefined} />)}
        </colgroup>
        <thead>
          <tr>
            <SortHeader label="Student" sortKey="name" sort={sort} onSort={onSort} first />
            <SortHeader label="Grade" sortKey="grade" sort={sort} onSort={onSort} />
            <PlainHeader label="Quest" note="milestones done" />
            <PlainHeader label="Streak" />
            <PlainHeader label="College list" counts />
            <PlainHeader label="Essays" note="statement stage" />
            <PlainHeader label="Portfolio" />
            <SortHeader label="Meeting requests" sortKey="attention" sort={sort} onSort={onSort} />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const marks = marksFor(row);
            const grade = gradeOf(row);
            const meeting = nextMeeting(row);
            return (
              <tr key={row.student_id} className={ROW_CLASS} onClick={(e) => openRow(e, row)}
                style={{ borderTop: i ? `1px solid ${BORDER}` : "none", cursor: "pointer" }}>
                <th scope="row" style={{ ...CELL, padding: 0, borderLeft: "none",
                  boxShadow: marks.length ? `inset 3px 0 0 ${AMBER_TEXT}` : "none" }}>
                  {/* The meeting's date sits under the name inside the link, so the
                      row stays one tap target; the link's name is the student's
                      alone, and the full day and time follow it for a screen reader. */}
                  <a {...linkProps(navigate, studentPath(row.student_id))} className={FOCUS_CLASS}
                    style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "flex-start",
                      minHeight: 48, boxSizing: "border-box", padding: "5px 12px", textDecoration: "none", outlineOffset: -3 }}>
                    <span style={{ maxWidth: "100%", fontFamily: SANS, fontSize: "1rem", fontWeight: 800, color: TEXT,
                      lineHeight: 1.3, overflowWrap: "anywhere" }}>
                      {row.name || "Student"}
                    </span>
                    {meeting && (
                      <span aria-hidden="true" style={{ ...MEETING, maxWidth: "100%" }}>
                        <PixelStamp kind="check" size={16} />
                        <span style={{ minWidth: 0 }}>Meeting {shortDay(meeting.d)}</span>
                      </span>
                    )}
                  </a>
                  {meeting && <span style={SR_ONLY}>Meeting {meeting.when}</span>}
                </th>
                <td style={{ ...CELL, fontVariantNumeric: NUMS, color: grade ? TEXT : TEXT_MUTED, fontWeight: grade ? 600 : 500 }}>
                  {grade ?? <><span aria-hidden="true">Not set</span><span style={SR_ONLY}>No grade on file</span></>}
                </td>
                {sharesNothing(row) ? (
                  <td colSpan={5} style={CELL}><NothingShared /></td>
                ) : (
                  <>
                    <td style={CELL}><QuestValue quest={row.quest} /></td>
                    <td style={CELL}><StreakValue quest={row.quest} /></td>
                    <td style={CELL}><ListValue list={row.college_list} /></td>
                    <td style={CELL}><EssayValue essays={row.essays} /></td>
                    <td style={CELL}><RecordValue row={row} navigate={navigate} style={{ margin: "-4px 0" }} /></td>
                  </>
                )}
                <td style={CELL}><ShortMarks marks={marks} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

// ─── The same students as compact cards ───────────────────────────────────────

const TERM = { margin: 0, fontFamily: SANS, fontSize: "0.9rem", fontWeight: 700, color: TEXT_MUTED, lineHeight: 1.4 };
const VALUE = { margin: 0, minWidth: 0, fontFamily: SANS, fontSize: "0.95rem", fontWeight: 600, color: TEXT, lineHeight: 1.35 };
const CARD_GRID = "repeat(auto-fill, minmax(min(100%, 20rem), 1fr))";

/** One compact card per student, for a phone or a window too narrow for the grid. */
export function CaseloadCards({ rows, marksFor, navigate }) {
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 12, gridTemplateColumns: CARD_GRID }}>
      {rows.map((row) => {
        const marks = marksFor(row);
        const quest = questCell(row.quest);
        return (
          <li key={row.student_id} style={{ minWidth: 0 }}>
            <Card style={{ padding: 0, height: "100%", boxShadow: marks.length ? `inset 3px 0 0 ${AMBER_TEXT}` : "none" }}>
              <a {...linkProps(navigate, studentPath(row.student_id))} className={FOCUS_CLASS}
                style={{ display: "block", minHeight: 44, boxSizing: "border-box", padding: "12px 14px 6px",
                  textDecoration: "none", borderRadius: RADIUS.card, outlineOffset: -3 }}>
                <span style={{ display: "block", fontFamily: SANS, fontSize: "1.05rem", fontWeight: 800, color: TEXT,
                  lineHeight: 1.3, overflowWrap: "anywhere" }}>
                  {row.name || "Student"}
                </span>
                <span style={{ ...sub, display: "block", fontVariantNumeric: NUMS }}>{gradeLine(row)}</span>
              </a>
              <div style={{ padding: "0 14px 12px" }}>
                <AttentionMarks marks={marks} style={{ marginBottom: 6 }} />
                <MeetingLine row={row} style={{ marginBottom: 6 }} />
                {sharesNothing(row) ? (
                  <div style={{ paddingTop: 8, borderTop: `1px solid ${BORDER}` }}><NothingShared /></div>
                ) : (
                  <dl style={{ margin: 0, paddingTop: 8, borderTop: `1px solid ${BORDER}`, display: "grid",
                    gridTemplateColumns: "minmax(0, 6rem) minmax(0, 1fr)", gap: "6px 10px", alignItems: "center" }}>
                    <dt style={TERM}>Quest</dt>
                    <dd style={{ ...VALUE, display: "flex", flexWrap: "wrap", alignItems: "center", gap: "2px 12px" }}>
                      <span><QuestValue quest={row.quest} /></span>
                      {!quest.quiet && <span><StreakValue quest={row.quest} spelled /></span>}
                    </dd>
                    <dt style={TERM}>College list</dt>
                    <dd style={VALUE}><ListValue list={row.college_list} labelled /></dd>
                    <dt style={TERM}>Essays</dt>
                    <dd style={VALUE}><EssayValue essays={row.essays} /></dd>
                    <dt style={TERM}>Portfolio</dt>
                    <dd style={VALUE}><RecordValue row={row} navigate={navigate} /></dd>
                  </dl>
                )}
              </div>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

// ─── While it loads ───────────────────────────────────────────────────────────

function Bar({ w, h = 14, style }) {
  return <div className={SKEL_CLASS} style={{ width: w, height: h, borderRadius: 7, ...style }} />;
}

const SKELETON_COLUMNS = `minmax(${STUDENT_MIN}rem, 1fr) ${COLS.slice(1).map((c) => `${c.width}rem`).join(" ")}`;
const SKELETON_WIDTHS = ["70%", "35%", "80%", "55%", "85%", "75%", "80%", "60%"];

/** The caseload's shape while it loads. Decorative: the page says it is
 *  loading. The shimmer stops under reduced motion. */
export function CaseloadSkeleton({ wide }) {
  if (!wide) {
    return (
      <div aria-hidden="true" style={{ display: "grid", gap: 12, gridTemplateColumns: CARD_GRID }}>
        {[0, 1, 2, 3].map((k) => (
          <Card key={k} style={{ padding: "14px" }}>
            <Bar w="60%" h={18} />
            <Bar w="45%" style={{ marginTop: 8 }} />
            <div style={{ display: "grid", gap: 10, marginTop: 14, paddingTop: 10, borderTop: `1px solid ${BORDER}` }}>
              <Bar w="80%" />
              <Bar w="65%" />
              <Bar w="55%" />
              <Bar w="40%" />
            </div>
          </Card>
        ))}
      </div>
    );
  }
  return (
    <Card aria-hidden="true" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ height: 52, background: SURFACE, borderBottom: `1px solid ${BORDER}` }} />
      {[0, 1, 2, 3, 4, 5, 6, 7].map((k) => (
        <div key={k} style={{ display: "grid", gridTemplateColumns: SKELETON_COLUMNS, alignItems: "center", height: 48,
          borderTop: k ? `1px solid ${BORDER}` : "none" }}>
          {SKELETON_WIDTHS.map((w, j) => (
            <div key={j} style={{ padding: "0 12px" }}><Bar w={w} h={12} /></div>
          ))}
        </div>
      ))}
    </Card>
  );
}
