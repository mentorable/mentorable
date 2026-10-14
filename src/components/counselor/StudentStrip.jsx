import { useCallback, useMemo, useRef, useState } from "react";
import { lighten } from "../../lib/theme.js";
import { PixelStamp } from "../ui/PixelIcons.jsx";
import { SR_ONLY } from "../ui/kit.jsx";
import {
  BORDER, FOCUS_CLASS, RADIUS, SANS, SURFACE, TEXT, TEXT_MID, TEXT_MUTED, WHITE, useAgentInk,
} from "../ui/tokens.js";
import { essayLines, gpaNumber, listCounts, sortScores, testName } from "./recordWords.js";
import { plural, shortDate } from "./counselorUi.jsx";
import { milestonesOf, questStatus, wholeCount } from "./StudentSections.jsx";

// The progress strip at the top of a student's page: four tiles, one per
// section a student may share, each saying where that section stands, or
// that it is not shared. The tile picked opens its section under the strip
// (the page renders it as the tab panel). The tiles are a tab list: Tab
// reaches the open one, the arrow keys, Home and End move between them.
//
// Every word on a tile comes from the section counselor_student() returned,
// so a tile can never say more than the open section would.

/** The four sections, in the order the student is asked to share them. */
export const STUDENT_SECTIONS = [
  { key: "college_list", title: "College list", stamp: "target" },
  { key: "portfolio", title: "Portfolio", stamp: "reportcard" },
  { key: "quest", title: "Quest", stamp: "flag" },
  { key: "essays", title: "Essay progress", stamp: "scroll" },
];
const isSection = (key) => STUDENT_SECTIONS.some((s) => s.key === key);

export const tabId = (key) => `cs-tab-${key}`;
export const panelId = (key) => `cs-panel-${key}`;

// ─── Which section is open ────────────────────────────────────────────────────

// The section last opened for each student, for this browser tab only, so it
// is still open after a look at the schedule. Only a student's id and a
// section's key, never anything they shared.
const PICK_KEY = "mentorable.counselorStudentSection";
const PICK_MAX = 50;
const ID_OK = /^[A-Za-z0-9-]{1,64}$/;

function readPicks() {
  try {
    const v = JSON.parse(sessionStorage.getItem(PICK_KEY) || "null");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

function readPick(studentId) {
  const id = String(studentId || "");
  if (!ID_OK.test(id)) return null;
  const picks = readPicks();
  const key = Object.prototype.hasOwnProperty.call(picks, id) ? picks[id] : null;
  return isSection(key) ? key : null;
}

function writePick(studentId, key) {
  const id = String(studentId || "");
  if (!ID_OK.test(id) || !isSection(key)) return;
  try {
    const picks = readPicks();
    delete picks[id];
    picks[id] = key;   // the newest last, so the oldest go first
    const ids = Object.keys(picks);
    ids.slice(0, Math.max(0, ids.length - PICK_MAX)).forEach((old) => { delete picks[old]; });
    sessionStorage.setItem(PICK_KEY, JSON.stringify(picks));
  } catch { /* storage blocked: the page just opens the first shared section */ }
}

/**
 * `[open, choose]`: the key of the section open on this student's page, and
 * how a tile opens another. Opens, in order: the tile picked on this page;
 * the one last picked for this student in this tab, while it is still shared;
 * the first shared section. Null when they share none.
 */
export function useOpenSection(studentId, detail) {
  const [picked, setPicked] = useState(null);   // { id, key }
  const remembered = useMemo(() => readPick(studentId), [studentId]);
  const shared = STUDENT_SECTIONS.filter((s) => detail?.[s.key]).map((s) => s.key);
  let open = shared[0] || null;
  if (picked && picked.id === studentId) open = picked.key;
  else if (remembered && shared.includes(remembered)) open = remembered;
  const choose = useCallback((key) => {
    if (!isSection(key)) return;
    setPicked({ id: studentId, key });
    writePick(studentId, key);
  }, [studentId]);
  return [open, choose];
}

// ─── What each tile says ──────────────────────────────────────────────────────

const EMPTY_BAR = "#e0dbd3";
/** Short phrases as one line, the first one capitalised. */
function sentence(parts) {
  const s = parts.filter(Boolean).join(", ");
  return s ? s[0].toUpperCase() + s.slice(1) : "";
}

/** { big, small, bar } for a shared section, or null when it is not shared.
 *  `bar` is a list of { n, color, edge } segments, drawn for the eye only:
 *  `small` says the same in words. */
function summaryOf(key, data, ink) {
  if (!data || typeof data !== "object") return null;

  if (key === "college_list") {
    const schools = (Array.isArray(data.schools) ? data.schools : []).filter((s) => s && typeof s === "object");
    if (!schools.length) return { big: "No schools yet", small: "Shared, with no school on it yet." };
    const n = listCounts(schools);
    const other = schools.length - n.total;
    return {
      big: plural(schools.length, "school"),
      small: [`${n.reach} reach, ${n.target} target, ${n.likely} likely`, other ? `${other} not sorted yet` : ""]
        .filter(Boolean).join(", "),
      bar: [
        { n: n.reach, color: ink.button.bg },
        { n: n.target, color: lighten(ink.accent, 0.5) },
        { n: n.likely, color: ink.soft, edge: `inset 0 0 0 1px ${lighten(ink.accent, 0.72)}` },
        { n: other, color: EMPTY_BAR },
      ],
    };
  }

  if (key === "portfolio") {
    const scale = typeof data.gpa_scale === "string" ? data.gpa_scale.trim() : "";
    const unweighted = gpaNumber(data.gpa_unweighted, scale);
    const weighted = gpaNumber(data.gpa_weighted, scale);
    const activities = Array.isArray(data.activities) ? data.activities.length : 0;
    const awards = Array.isArray(data.awards) ? data.awards.length : 0;
    const courses = Array.isArray(data.courses) ? data.courses.length : 0;
    const majors = Array.isArray(data.majors) ? data.majors.length : 0;
    const best = sortScores(data.test_scores).find((s) => s && s.score !== null && s.score !== undefined && s.score !== "");
    if (!unweighted && !weighted && !best && !activities && !awards && !courses && !majors && scale !== "not_used") {
      return { big: "Nothing yet", small: "Shared, with nothing added to it yet." };
    }
    const big = scale === "not_used" ? "No GPA used"
      : unweighted ? `${unweighted} GPA`
      : weighted ? `${weighted} weighted GPA`
      : "GPA not on file";
    const counts = `${plural(activities, "activity", "activities")}, ${plural(awards, "award")}, ${plural(courses, "course")}`;
    return { big, small: best ? `${testName(best)} ${best.score}. ${counts}.` : `${counts[0].toUpperCase()}${counts.slice(1)}.` };
  }

  if (key === "quest") {
    const status = questStatus(data);
    if (!status) return { big: "No quest yet", small: "Shared, and not started yet." };
    const milestones = milestonesOf(data);
    const done = milestones.filter((m) => m.status === "done").length;
    const streak = wholeCount(data.streak);
    const last = shortDate(data.last_checkin_at);
    return {
      big: milestones.length ? `${done} of ${plural(milestones.length, "milestone")}` : status.label,
      small: sentence([
        milestones.length ? status.label : "",
        streak > 0 ? `${streak} day streak` : "",
        last ? `last check-in ${last}` : "no check-in yet",
      ]),
      bar: milestones.slice(0, 12).map((m) => ({ n: 1, color: m.status === "done" ? ink.button.bg : EMPTY_BAR })),
    };
  }

  if (key === "essays") {
    const lines = essayLines(data.essays);
    if (!lines.length) return { big: "No essays yet", small: "Shared, and not started yet." };
    const statements = lines.filter((e) => e.key.startsWith("ps-"));
    const supplements = lines.filter((e) => !e.key.startsWith("ps-"));
    const first = statements.length === 1 ? `Personal statement: ${statements[0].stage}, ${statements[0].words}.`
      : statements.length > 1 ? `${statements.length} personal statements.`
      : "No personal statement yet.";
    const supps = supplements.length
      ? ` ${plural(supplements.length, "supplement")}, ${supplements.filter((e) => e.stage === "done").length} done.`
      : "";
    return { big: plural(lines.length, "essay"), small: `${first}${supps}` };
  }

  return null;
}

// ─── The tiles ────────────────────────────────────────────────────────────────

const TILE_CLASS = "cs-tile";
const STRIP_CSS = `
.${TILE_CLASS} { transition: border-color 0.12s; }
.${TILE_CLASS}[aria-selected="false"]:hover { border-color: #b9b0a5 !important; }
@media (prefers-reduced-motion: reduce) { .${TILE_CLASS} { transition: none; } }
`;
if (typeof document !== "undefined" && !document.querySelector("style[data-counselor-strip]")) {
  const el = document.createElement("style");
  el.dataset.counselorStrip = "";
  el.textContent = STRIP_CSS;
  document.head.appendChild(el);
}

function Bar({ parts }) {
  const shown = (parts || []).filter((p) => p.n > 0);
  if (!shown.length) return null;
  return (
    <span aria-hidden="true" style={{ display: "flex", gap: 3, marginTop: 10 }}>
      {shown.map((p, i) => (
        <span key={i} style={{ flex: `${p.n} 1 0`, minWidth: 6, height: 12, borderRadius: 4, background: p.color,
          boxShadow: p.edge || "none" }} />
      ))}
    </span>
  );
}

/** What a tile shows. Spans only, so it can sit inside a button. */
function TileFace({ section, summary, on, who, compact, why = true }) {
  const ink = useAgentInk();
  const small = { display: "block", marginTop: 8, fontSize: "0.95rem", fontWeight: 600, color: TEXT_MUTED, lineHeight: 1.45,
    overflowWrap: "anywhere" };
  return (
    <>
      <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.95rem", fontWeight: 800, lineHeight: 1.3,
        color: on ? ink.onSoft : TEXT_MID, overflowWrap: "anywhere" }}>
        <PixelStamp kind={section.stamp} size={16} />
        {section.title}
      </span>
      {summary ? (
        <>
          <span style={{ display: "block", marginTop: 8, fontSize: compact ? "1.15rem" : "1.35rem", fontWeight: 800,
            letterSpacing: "-0.01em", lineHeight: 1.2, color: TEXT, fontVariantNumeric: "tabular-nums",
            overflowWrap: "anywhere" }}>
            {summary.big}
          </span>
          <Bar parts={summary.bar} />
          {summary.small && <span style={small}>{summary.small}</span>}
        </>
      ) : (
        <>
          <span style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: compact ? "1.05rem" : "1.1rem",
            fontWeight: 800, lineHeight: 1.25, color: TEXT_MID }}>
            <PixelStamp kind="lock" size={16} />
            Not shared
          </span>
          {why && <span style={small}>{who} chooses what you see, and can change it at any time.</span>}
        </>
      )}
    </>
  );
}

/**
 * The four tiles. `open` is the open section's key and `onOpen(key)` opens
 * another; `fourUp`: one row of four (wide screens) rather than two by two.
 * When the student shares nothing the tiles are a plain list, since there is
 * nothing to open.
 */
export function StudentStrip({ detail, who, open, onOpen, fourUp = true }) {
  const ink = useAgentInk();
  const refs = useRef([]);
  const [said, setSaid] = useState("");
  const tiles = STUDENT_SECTIONS.map((s) => ({ ...s, summary: summaryOf(s.key, detail?.[s.key], ink) }));
  const anyShared = tiles.some((t) => t.summary);
  const whose = who === "This student" ? "this student" : who;
  const compact = !fourUp;

  const grid = { display: "grid", gridTemplateColumns: `repeat(${fourUp ? 4 : 2}, minmax(0, 1fr))`, gap: fourUp ? 12 : 10,
    alignItems: "stretch" };
  const box = (t, on) => ({
    position: "relative", display: "flex", flexDirection: "column", alignItems: "stretch", justifyContent: "flex-start",
    width: "100%", minWidth: 0, minHeight: 44, boxSizing: "border-box", margin: 0,
    padding: compact ? "12px 14px 14px" : "14px 16px 16px", borderRadius: RADIUS.card, textAlign: "left",
    fontFamily: SANS, color: TEXT, background: on ? ink.softer : t.summary ? WHITE : SURFACE,
    border: `1px solid ${on ? ink.text : BORDER}`, boxShadow: on ? `inset 0 0 0 1px ${ink.text}` : "none",
  });

  if (!anyShared) {
    return (
      <ul aria-label={`What ${whose} shares`} style={{ ...grid, listStyle: "none", margin: 0, padding: 0 }}>
        {tiles.map((t) => (
          <li key={t.key} style={{ ...box(t, false), minHeight: 0 }}>
            {/* The space under the strip says why, once, rather than each tile. */}
            <TileFace section={t} summary={null} on={false} who={who} compact={compact} why={false} />
          </li>
        ))}
      </ul>
    );
  }

  const select = (key) => {
    const t = tiles.find((x) => x.key === key);
    if (!t) return;
    onOpen(key);
    setSaid(t.summary ? `${t.title} is open below.` : `${t.title} is not shared.`);
  };
  const onKeyDown = (e) => {
    const n = tiles.length;
    const at = Math.max(0, tiles.findIndex((t) => t.key === open));
    let next = null;
    if (e.key === "ArrowRight") next = (at + 1) % n;
    else if (e.key === "ArrowLeft") next = (at - 1 + n) % n;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = n - 1;
    if (next === null) return;
    e.preventDefault();
    select(tiles[next].key);
    refs.current[next]?.focus();
  };

  return (
    <div>
      <div role="tablist" aria-label={`What ${whose} shares`} onKeyDown={onKeyDown} style={grid}>
        {tiles.map((t, i) => {
          const on = t.key === open;
          return (
            <button key={t.key} ref={(el) => { refs.current[i] = el; }} type="button" role="tab" id={tabId(t.key)}
              aria-selected={on} aria-controls={on ? panelId(t.key) : undefined} tabIndex={on ? 0 : -1}
              onClick={() => select(t.key)} className={`${FOCUS_CLASS} ${TILE_CLASS}`}
              style={{ ...box(t, on), cursor: on ? "default" : "pointer" }}>
              <TileFace section={t} summary={t.summary} on={on} who={who} compact={compact} />
              {/* Points down at the section it opened, when that is right under it. */}
              {on && fourUp && (
                <span aria-hidden="true" style={{ position: "absolute", left: "50%", bottom: -8, width: 14, height: 14,
                  marginLeft: -7, boxSizing: "border-box", background: ink.softer, borderRight: `2px solid ${ink.text}`,
                  borderBottom: `2px solid ${ink.text}`, transform: "rotate(45deg)" }} />
              )}
            </button>
          );
        })}
      </div>
      <p aria-live="polite" style={SR_ONLY}>{said}</p>
    </div>
  );
}
