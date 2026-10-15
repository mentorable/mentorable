import { useEffect, useRef, useState } from "react";
import { ChoiceChips, INPUT_CLASS, SR_ONLY, inputStyle } from "../ui/kit.jsx";
import { BORDER, FOCUS_CLASS, RADIUS, SANS, TEXT, TEXT_MID, TEXT_MUTED, WHITE, useAgentInk } from "../ui/tokens.js";
import { cleanSort } from "./caseloadRules.js";

// What narrows and orders the caseload: a search by name, and everything else
// (grade, meeting requests, which sections a student shares) behind one Filters
// button. On a wide screen the grid's own headers sort it; on a narrow one, where the students are cards, a Sort
// menu does (`showSort`).

const SORT_OPTIONS = [
  { value: "name:asc", label: "Name, A to Z" },
  { value: "name:desc", label: "Name, Z to A" },
  { value: "grade:asc", label: "Grade, lowest first" },
  { value: "grade:desc", label: "Grade, highest first" },
  { value: "attention:desc", label: "Meeting requests first" },
  { value: "attention:asc", label: "Meeting requests last" },
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

const SHARE_OPTIONS = [
  { key: "college_list", label: "Shares their College list" },
  { key: "portfolio", label: "Shares their Portfolio" },
  { key: "quest", label: "Shares their Quest" },
  { key: "essays", label: "Shares their essay progress" },
];

function Check({ on, label, onToggle }) {
  const ink = useAgentInk();
  return (
    <button type="button" role="checkbox" aria-checked={on} onClick={onToggle} className={FOCUS_CLASS}
      style={{ width: "100%", minHeight: 44, padding: "0 4px", display: "flex", alignItems: "center", gap: 10, background: "none",
        border: "none", cursor: "pointer", fontFamily: SANS, fontSize: "1rem", fontWeight: 600, color: TEXT_MID, textAlign: "left" }}>
      <span aria-hidden="true" style={{ width: 20, height: 20, flexShrink: 0, boxSizing: "border-box", borderRadius: 5,
        border: `1.5px solid ${on ? ink.text : BORDER}`, background: on ? ink.text : WHITE, display: "flex",
        alignItems: "center", justifyContent: "center", color: WHITE, fontSize: "0.8rem", fontWeight: 800 }}>
        {on ? "\u2713" : ""}
      </span>
      {label}
    </button>
  );
}

/** One button that opens everything that narrows the list. */
function FiltersMenu({ grades, grade, onGrade, onlyAttention, onAttention, attentionCount, shares, onShares, isMobile }) {
  const ink = useAgentInk();
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  const trigger = useRef(null);
  const active = (grade !== null ? 1 : 0) + (onlyAttention ? 1 : 0) + shares.length;

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const gradeOptions = [{ key: "all", label: "All" }, ...grades.map((g) => ({ key: String(g), label: String(g) }))];
  const heading = { margin: "0 0 6px", fontFamily: SANS, fontSize: "0.9rem", fontWeight: 800, color: TEXT_MUTED };
  const toggleShare = (key) => onShares(shares.includes(key) ? shares.filter((k) => k !== key) : [...shares, key]);
  const clear = () => { onGrade(null); onAttention(false); onShares([]); };

  return (
    <div ref={wrap} style={{ position: "relative", flexShrink: 0 }}>
      <button ref={trigger} type="button" className={FOCUS_CLASS} aria-haspopup="dialog" aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{ minHeight: 44, padding: "0 16px", display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer",
          boxSizing: "border-box", borderRadius: RADIUS.pill, fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700,
          border: `1.5px solid ${active ? ink.text : BORDER}`, background: WHITE, color: active ? ink.text : TEXT_MID }}>
        Filters
        {active > 0 && (
          <span style={{ fontVariantNumeric: "lining-nums tabular-nums", fontWeight: 800 }}>
            {active}<span style={SR_ONLY}> on</span>
          </span>
        )}
      </button>
      {open && (
        <div role="dialog" aria-label="Filters" style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 50,
          width: isMobile ? "min(340px, calc(100vw - 32px))" : 340, padding: 16, boxSizing: "border-box", background: WHITE,
          border: `1px solid ${BORDER}`, borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.12)" }}>
          {grades.length > 1 && (
            <div style={{ marginBottom: 14 }}>
              <p style={heading}>Grade</p>
              <ChoiceChips label="Grade" hideLabel options={gradeOptions} value={grade === null ? "all" : String(grade)}
                onChange={(key) => onGrade(key === "all" ? null : Number(key))} />
            </div>
          )}
          <div style={{ marginBottom: 14 }}>
            <p style={heading}>Meetings</p>
            <Check on={onlyAttention} onToggle={() => onAttention(!onlyAttention)}
              label={`Has a meeting request waiting (${attentionCount})`} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <p style={heading}>Sharing</p>
            {SHARE_OPTIONS.map((o) => (
              <Check key={o.key} on={shares.includes(o.key)} onToggle={() => toggleShare(o.key)} label={o.label} />
            ))}
          </div>
          <button type="button" className={FOCUS_CLASS} onClick={clear} disabled={active === 0}
            style={{ minHeight: 44, padding: 0, background: "none", border: "none", fontFamily: SANS, fontSize: "0.95rem",
              fontWeight: 700, color: active ? TEXT : TEXT_MUTED, cursor: active ? "pointer" : "default", textDecoration: "underline" }}>
            Clear filters
          </button>
        </div>
      )}
    </div>
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
  query, onQuery, grades, grade, onGrade, onlyAttention, onAttention, attentionCount, shares = [], onShares = () => {},
  sort, onSort, showSort, isMobile, summary,
}) {
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

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
        <FiltersMenu grades={grades} grade={grade} onGrade={onGrade} onlyAttention={onlyAttention} onAttention={onAttention}
          attentionCount={attentionCount} shares={shares} onShares={onShares} isMobile={isMobile} />

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
