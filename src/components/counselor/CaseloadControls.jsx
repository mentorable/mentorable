import { ChoiceChips, INPUT_CLASS, SR_ONLY, inputStyle } from "../ui/kit.jsx";
import { AMBER_BG, AMBER_TEXT, BORDER, FOCUS_CLASS, RADIUS, SANS, TEXT_MID, TEXT_MUTED, WHITE } from "../ui/tokens.js";
import { cleanSort } from "./caseloadRules.js";

// What narrows and orders the caseload: a search by name, the grade, and
// "Needs attention", then how many students show. On a wide screen the grid's
// own headers sort it; on a narrow one, where the students are cards, a Sort
// menu does (`showSort`).

const SORT_OPTIONS = [
  { value: "name:asc", label: "Name, A to Z" },
  { value: "name:desc", label: "Name, Z to A" },
  { value: "grade:asc", label: "Grade, lowest first" },
  { value: "grade:desc", label: "Grade, highest first" },
  { value: "attention:desc", label: "Needs attention first" },
  { value: "attention:asc", label: "Needs attention last" },
];

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"
      strokeLinejoin="round" aria-hidden="true" focusable="false">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

/**
 * query / onQuery: the name search. grades: the grades anyone is in; grade
 * (a number, or null for all) / onGrade. onlyAttention / onAttention, with
 * attentionCount students flagged. sort ({ key, dir }) / onSort(sort), shown
 * as a menu when showSort. summary: how many students show, said at the end
 * of the row (and announced when it changes).
 */
export default function CaseloadControls({
  query, onQuery, grades, grade, onGrade, onlyAttention, onAttention, attentionCount, sort, onSort, showSort, isMobile,
  summary,
}) {
  const gradeOptions = [
    { key: "all", label: isMobile ? "All" : "All grades" },
    ...grades.map((g) => ({ key: String(g), label: String(g) })),
  ];
  const sortValue = `${sort.key}:${sort.dir}`;
  const pickSort = (value) => {
    const [key, dir] = String(value).split(":");
    onSort(cleanSort({ key, dir }));
  };

  return (
    <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", flexWrap: "wrap",
      alignItems: isMobile ? "stretch" : "center", gap: isMobile ? 10 : "10px 18px" }}>
      <div style={{ position: "relative", flex: isMobile ? "0 0 auto" : "1 1 220px", maxWidth: isMobile ? "none" : 300 }}>
        <label htmlFor="caseload-search" style={SR_ONLY}>Search students by name</label>
        <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", display: "flex",
          color: TEXT_MUTED, pointerEvents: "none" }}>
          <SearchIcon />
        </span>
        <input id="caseload-search" type="search" className={INPUT_CLASS} value={query} autoComplete="off"
          placeholder="Search by name" onChange={(e) => onQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape" && query) { e.preventDefault(); onQuery(""); } }}
          style={{ ...inputStyle, paddingLeft: 40, fontWeight: 600 }} />
      </div>

      {grades.length > 1 && (
        <ChoiceChips label="Grade" options={gradeOptions} value={grade === null ? "all" : String(grade)}
          onChange={(key) => onGrade(key === "all" ? null : Number(key))} isMobile={isMobile} />
      )}

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
        <button type="button" className={FOCUS_CLASS} aria-pressed={onlyAttention} onClick={() => onAttention(!onlyAttention)}
          style={{ minHeight: 44, padding: "0 14px", display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer",
            boxSizing: "border-box", borderRadius: RADIUS.pill, fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700,
            lineHeight: 1.2, border: `1.5px solid ${onlyAttention ? AMBER_TEXT : BORDER}`,
            background: onlyAttention ? AMBER_BG : WHITE, color: onlyAttention ? AMBER_TEXT : TEXT_MID }}>
          Needs attention
          <span style={{ fontVariantNumeric: "lining-nums tabular-nums", fontWeight: 800 }}>
            {attentionCount}
            <span style={SR_ONLY}> {attentionCount === 1 ? "student" : "students"}</span>
          </span>
        </button>

        {showSort && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "1 1 200px", minWidth: 0 }}>
            <label htmlFor="caseload-sort" style={{ fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700, color: TEXT_MID }}>
              Sort
            </label>
            <select id="caseload-sort" className={INPUT_CLASS} value={sortValue} onChange={(e) => pickSort(e.target.value)}
              style={{ ...inputStyle, flex: 1, minWidth: 0, width: "auto", padding: "9px 10px", fontWeight: 600,
                cursor: "pointer" }}>
              {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        )}
      </div>

      {summary !== undefined && (
        <p role="status" style={{ margin: isMobile ? "4px 2px 0" : "0 2px 0 auto", fontFamily: SANS, fontSize: "0.95rem",
          fontWeight: 600, color: TEXT_MUTED, lineHeight: 1.4, fontVariantNumeric: "lining-nums tabular-nums" }}>
          {summary}
        </p>
      )}
    </div>
  );
}
