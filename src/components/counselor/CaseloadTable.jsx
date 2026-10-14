import { essayLine, formatWhen, listLine, listNote, questLine } from "../../lib/counselor.js";
import { PixelStamp } from "../ui/PixelIcons.jsx";
import { Card, LINK_CLASS, SR_ONLY } from "../ui/kit.jsx";
import { BORDER, FOCUS_CLASS, RADIUS, SANS, SURFACE, TEXT, TEXT_MID, TEXT_MUTED, useAgentInk } from "../ui/tokens.js";
import { gradeOf, portfolioEmpty, portfolioLine } from "./caseloadRules.js";
import {
  AttentionMarks, CLAMP_CLASS, ROW_CLASS, SKEL_CLASS, gradeLine, linkProps, recordPath, studentPath, toDate,
} from "./counselorUi.jsx";

// The caseload: one row per linked student. A real table on a wide screen,
// with column headers that sort; one card per student on a narrow one, so the
// page never scrolls sideways. Both show the same things in the same words:
// who the student is, then a line for each of the four sections they may
// share, then why they may need the counselor (in amber, an icon and words).
//
// A section the student has not shared says "Not shared", quietly: it is
// their choice, never a problem to fix.

const NOT_SHARED = "Not shared";

const line = (shared) => ({
  display: "block", fontFamily: SANS, fontSize: "0.95rem", lineHeight: 1.4, fontWeight: shared ? 600 : 500,
  color: shared ? TEXT : TEXT_MUTED, overflowWrap: "anywhere",
});
const sub = { fontFamily: SANS, fontSize: "0.9rem", lineHeight: 1.4, fontWeight: 500, color: TEXT_MUTED, overflowWrap: "anywhere" };

/** A confirmed meeting that is still ahead (or has only just started), in words. */
function upcoming(iso) {
  const d = toDate(iso);
  if (!d || d.getTime() < Date.now() - 3600000) return "";
  return formatWhen(iso);
}

function classLine(row) {
  const year = Number(row?.graduation_year);
  return row?.graduation_year && Number.isFinite(year) && year > 0 ? `Class of ${year}` : "";
}

// ─── What each cell says ──────────────────────────────────────────────────────

function QuestValue({ row }) {
  return <span style={line(!!row.quest)}>{questLine(row.quest)}</span>;
}

/** The counts by group and, when the list is out of balance, the same note
 *  the student sees. In the table the note is cut to two lines for the eye
 *  (the student's page has all of it). */
function ListValue({ row, clamp }) {
  const note = row.college_list ? listNote(row.college_list) : "";
  return (
    <>
      <span style={line(!!row.college_list)}>{listLine(row.college_list)}</span>
      {note && (
        <span className={clamp ? CLAMP_CLASS : undefined} style={{ ...sub, marginTop: 2, ...(clamp ? null : { display: "block" }) }}>
          {note}
        </span>
      )}
    </>
  );
}

function EssayValue({ row }) {
  return <span style={line(!!row.essays)}>{essayLine(row.essays)}</span>;
}

function PortfolioValue({ row, navigate }) {
  const ink = useAgentInk();
  const p = row.portfolio;
  if (!p) return <span style={line(false)}>{NOT_SHARED}</span>;
  const empty = portfolioEmpty(p);
  return (
    <>
      <span style={line(true)}>{empty ? "Nothing added yet" : portfolioLine(p)}</span>
      {!empty && !p.has_gpa && <span style={{ ...sub, display: "block", marginTop: 2 }}>No GPA yet</span>}
      <a {...linkProps(navigate, recordPath(row.student_id))} className={`${FOCUS_CLASS} ${LINK_CLASS}`}
        style={{ display: "inline-flex", alignItems: "center", minHeight: 44, margin: "-8px 0 -12px", fontFamily: SANS,
          fontSize: "0.95rem", fontWeight: 700, color: ink.text }}>
        Open record<span style={SR_ONLY}> for {row.name}</span>
      </a>
    </>
  );
}

function Meeting({ row, style }) {
  const when = upcoming(row.next_meeting_at);
  if (!when) return null;
  return (
    <span style={{ ...sub, display: "flex", alignItems: "flex-start", gap: 6, fontWeight: 600, color: TEXT_MID, ...style }}>
      <span aria-hidden="true" style={{ display: "flex", marginTop: 2 }}><PixelStamp kind="check" size={16} /></span>
      <span>Meeting {when}</span>
    </span>
  );
}

// ─── The table ────────────────────────────────────────────────────────────────

const HEAD = {
  fontFamily: SANS, fontSize: "0.92rem", fontWeight: 800, color: TEXT_MID, textAlign: "left", background: SURFACE,
  borderBottom: `1px solid ${BORDER}`, verticalAlign: "middle", lineHeight: 1.3,
};
const CELL = { padding: "12px", verticalAlign: "top", textAlign: "left", fontWeight: 400 };

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
function SortHeader({ label, sortKey, sort, onSort }) {
  const on = sort.key === sortKey;
  return (
    <th scope="col" aria-sort={on ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} style={{ ...HEAD, padding: 0 }}>
      <button type="button" className={FOCUS_CLASS} onClick={() => onSort(sortKey)}
        style={{ width: "100%", minHeight: 44, padding: "0 12px", display: "flex", alignItems: "center", gap: 6,
          background: "none", border: "none", cursor: "pointer", fontFamily: SANS, fontSize: "0.92rem", fontWeight: 800,
          color: on ? TEXT : TEXT_MID, textAlign: "left", lineHeight: 1.3, outlineOffset: -3 }}>
        {label}
        <SortArrows dir={on ? sort.dir : null} />
      </button>
    </th>
  );
}

function PlainHeader({ children }) {
  return <th scope="col" style={{ ...HEAD, height: 44, padding: "0 12px" }}>{children}</th>;
}

/**
 * rows: the students to show, already filtered and in order. marksFor(row):
 * that student's attention marks. sort: { key, dir }; onSort(key) is a click
 * on a sorting header. schoolName names the table for a screen reader.
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
          Students linked to {schoolName || "your school"}, one row each. The Student, Grade and Needs attention
          headers sort the table.
        </caption>
        <colgroup>
          <col style={{ width: "16%" }} />
          <col style={{ width: 74 }} />
          <col style={{ width: "15%" }} />
          <col style={{ width: "17%" }} />
          <col style={{ width: "17%" }} />
          <col style={{ width: "13%" }} />
          <col />
        </colgroup>
        <thead>
          <tr>
            <SortHeader label="Student" sortKey="name" sort={sort} onSort={onSort} />
            <SortHeader label="Grade" sortKey="grade" sort={sort} onSort={onSort} />
            <PlainHeader>Quest</PlainHeader>
            <PlainHeader>College list</PlainHeader>
            <PlainHeader>Essays</PlainHeader>
            <PlainHeader>Portfolio</PlainHeader>
            <SortHeader label="Needs attention" sortKey="attention" sort={sort} onSort={onSort} />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const marks = marksFor(row);
            const grade = gradeOf(row);
            const edge = i === rows.length - 1 ? "none" : `1px solid ${BORDER}`;
            return (
              <tr key={row.student_id} className={ROW_CLASS} onClick={(e) => openRow(e, row)}
                style={{ borderBottom: edge, cursor: "pointer" }}>
                <th scope="row" style={{ ...CELL, padding: 0 }}>
                  <a {...linkProps(navigate, studentPath(row.student_id))} className={FOCUS_CLASS}
                    style={{ display: "block", minHeight: 44, boxSizing: "border-box", padding: "12px 12px 10px",
                      textDecoration: "none", outlineOffset: -3 }}>
                    <span style={{ display: "block", fontFamily: SANS, fontSize: "1rem", fontWeight: 800, color: TEXT,
                      lineHeight: 1.3, overflowWrap: "anywhere" }}>
                      {row.name || "Student"}
                    </span>
                    {classLine(row) && <span style={{ ...sub, display: "block" }}>{classLine(row)}</span>}
                  </a>
                  <Meeting row={row} style={{ padding: "0 12px 12px" }} />
                </th>
                <td style={{ ...CELL, fontFamily: SANS, fontSize: "0.95rem", fontWeight: 600, color: grade ? TEXT : TEXT_MUTED,
                  fontVariantNumeric: "tabular-nums" }}>
                  {grade ?? <><span aria-hidden="true">Not set</span><span style={SR_ONLY}>No grade on file</span></>}
                </td>
                <td style={CELL}><QuestValue row={row} /></td>
                <td style={CELL}><ListValue row={row} clamp /></td>
                <td style={CELL}><EssayValue row={row} /></td>
                <td style={CELL}><PortfolioValue row={row} navigate={navigate} /></td>
                <td style={CELL}>
                  {marks.length ? <AttentionMarks marks={marks} /> : <span style={SR_ONLY}>Nothing flagged</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

// ─── The same rows as cards ───────────────────────────────────────────────────

const TERM = { margin: 0, fontFamily: SANS, fontSize: "0.9rem", fontWeight: 700, color: TEXT_MUTED, lineHeight: 1.5 };
const VALUE = { margin: 0, minWidth: 0 };

/** One card per student, for a phone or a narrow window. */
export function CaseloadCards({ rows, marksFor, navigate }) {
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 12,
      gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 320px), 1fr))" }}>
      {rows.map((row) => {
        const marks = marksFor(row);
        return (
          <li key={row.student_id} style={{ minWidth: 0 }}>
            <Card style={{ padding: 0, height: "100%" }}>
              <a {...linkProps(navigate, studentPath(row.student_id))} className={FOCUS_CLASS}
                style={{ display: "block", minHeight: 44, boxSizing: "border-box", padding: "12px 14px 8px",
                  textDecoration: "none", borderRadius: RADIUS.card, outlineOffset: -3 }}>
                <span style={{ display: "block", fontFamily: SANS, fontSize: "1.1rem", fontWeight: 800, color: TEXT,
                  lineHeight: 1.3, overflowWrap: "anywhere" }}>
                  {row.name || "Student"}
                </span>
                <span style={{ ...sub, display: "block", fontSize: "0.95rem" }}>{gradeLine(row)}</span>
              </a>
              <div style={{ padding: "0 14px 12px" }}>
                <AttentionMarks marks={marks} style={{ marginBottom: 8 }} />
                <Meeting row={row} style={{ marginBottom: 8 }} />
                <dl style={{ margin: 0, paddingTop: 10, borderTop: `1px solid ${BORDER}`, display: "grid",
                  gridTemplateColumns: "minmax(0, 6.2rem) minmax(0, 1fr)", gap: "8px 10px" }}>
                  <dt style={TERM}>Quest</dt>
                  <dd style={VALUE}><QuestValue row={row} /></dd>
                  <dt style={TERM}>College list</dt>
                  <dd style={VALUE}><ListValue row={row} /></dd>
                  <dt style={TERM}>Essays</dt>
                  <dd style={VALUE}><EssayValue row={row} /></dd>
                  <dt style={TERM}>Portfolio</dt>
                  <dd style={VALUE}><PortfolioValue row={row} navigate={navigate} /></dd>
                </dl>
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

/** The caseload's shape while it loads. Decorative: the page says it is
 *  loading. The shimmer stops under reduced motion. */
export function CaseloadSkeleton({ wide }) {
  if (!wide) {
    return (
      <div aria-hidden="true" style={{ display: "grid", gap: 12 }}>
        {[0, 1, 2].map((k) => (
          <Card key={k}>
            <Bar w="55%" h={18} />
            <Bar w="40%" style={{ marginTop: 8 }} />
            <Bar w="100%" style={{ marginTop: 18 }} />
            <Bar w="85%" style={{ marginTop: 10 }} />
            <Bar w="70%" style={{ marginTop: 10 }} />
          </Card>
        ))}
      </div>
    );
  }
  return (
    <Card aria-hidden="true" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ height: 44, background: SURFACE, borderBottom: `1px solid ${BORDER}` }} />
      {[0, 1, 2, 3, 4, 5].map((k) => (
        <div key={k} style={{ display: "grid", gridTemplateColumns: "1.2fr 0.5fr 1.2fr 1.4fr 1.4fr 1fr 1.2fr", gap: 16,
          padding: "16px 12px", borderBottom: k === 5 ? "none" : `1px solid ${BORDER}` }}>
          <div><Bar w="80%" h={16} /><Bar w="55%" style={{ marginTop: 8 }} /></div>
          <Bar w="50%" />
          <Bar w="85%" />
          <Bar w="80%" />
          <Bar w="90%" />
          <Bar w="70%" />
          <Bar w="60%" />
        </div>
      ))}
    </Card>
  );
}
