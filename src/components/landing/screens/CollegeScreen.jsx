import { memo, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { LayoutGroup } from "framer-motion";
import { Scoreboard, SchoolCard, SearchResult } from "../../../pages/CollegeListPage.jsx";
import { balance, suggestCategory } from "../../../lib/collegeCategory.js";
import { StampTile } from "../../ui/kit.jsx";
import { BG, BORDER, RADIUS, SANS, TEXT, TEXT_MID, TEXT_MUTED, WHITE, useAgentInk } from "../../ui/tokens.js";
import { hexToRgbString } from "../../../lib/theme.js";
import { clamp01, seg, smooth, typed, useReduce } from "../kit.js";
import { Cursor, MobileTabBar } from "../frames.jsx";
import { COLLEGES } from "../data.js";
import { publishList } from "./SatSlider.jsx";
import { MobileSizer } from "./RecordScreen.jsx";

// The College List story's screen (PLAN.md 6.4.2): the real page's column at
// 1:1 with its own scroller, driven by (step, t) and the SAT slider.
//
//   step 0  Find a school   "Ohio University" typed, two real results, "Add as Likely"
//   step 1  See why         the new card lands in Likely with its reason; the net price chip opens
//   step 2  Move it         Case Western moved to Reach by hand; the card says the rule disagrees
//
// The Scoreboard, SearchResult and SchoolCard are the real components (exported
// from CollegeListPage.jsx); the "Add a school" card, the group headers and the
// chip rows are recreated from the same file. Every category is recomputed with
// the real `suggestCategory` from the slider's SAT, so the slider moves them.

const OHIO_ID = COLLEGES.added.id;
const CW_ID = (COLLEGES.list.find((r) => r.name === "Case Western Reserve University") || {}).id;
const SEARCH_QUERY = COLLEGES.searchQuery;

const SECTIONS = [
  { key: "reach", label: "Reach", stamp: "peak", hint: "Few applicants get in, or your scores sit below their usual range." },
  { key: "target", label: "Target", stamp: "target", hint: "Your scores fit, but they turn many applicants away." },
  { key: "likely", label: "Likely", stamp: "check", hint: "Your scores sit at or above their usual range, and they admit most applicants." },
];
const LABEL = { reach: "Reach", target: "Target", likely: "Likely" };
const SORTS = ["Date added", "Most selective", "Lowest price"];
const VIEWS = ["Full cards", "Compact"];

const noop = () => {};
const HIDDEN_ANCHOR = { position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" };

/** The row with its category recomputed by the rule for these stats (a school the student sorted keeps theirs). */
function recat(row, stats) {
  if (row.category_source === "student") return row;
  const s = suggestCategory(stats, row);
  return s ? { ...row, category: s.category, category_source: s.source } : row;
}

function SearchIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={TEXT_MUTED} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}
function CheckIcon({ color }) {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="5 12.5 10 17 19 7" />
    </svg>
  );
}
function CaretIcon({ color }) {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9 6 15 12 9 18" />
    </svg>
  );
}

/** The page header, recreated from the page: title, the line under it, and the closed "How we sort schools". */
function Header({ mobile, ink }) {
  return (
    <div style={{ margin: 0 }}>
      <p style={{ fontFamily: SANS, fontWeight: 800, fontSize: mobile ? "2.1rem" : "2.5rem", color: ink.title, letterSpacing: "-0.03em",
        margin: "0 0 0.5rem", lineHeight: 1.1 }}>College List</p>
      <div style={{ fontFamily: SANS, fontSize: mobile ? "1.05rem" : "1.15rem", color: TEXT_MUTED, lineHeight: 1.6, maxWidth: "62ch" }}>
        The schools you are applying to, grouped by how your scores compare with the students each one admits.
        Admit rates, score ranges and costs come from the U.S. Department of Education.
        <div style={{ marginTop: 6 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: SANS, fontWeight: 800, fontSize: "0.95rem",
            color: ink.text, padding: "6px 0", minHeight: 32 }}>
            <CaretIcon color={ink.text} /> How we sort schools
          </span>
        </div>
      </div>
    </div>
  );
}

/** The "Add a school" card, recreated from AddSchool: the field, the results, and the "Added" line. */
function AddSchool({ mobile, ink, query, focused, results, counts, stats, added }) {
  return (
    <div data-lp-mark="search" style={{ background: WHITE, borderRadius: RADIUS.card, border: `1.5px solid ${ink.soft}`, boxSizing: "border-box",
      padding: mobile ? "16px 14px 16px" : "18px 20px 20px" }}>
      <p style={{ display: "block", fontFamily: SANS, fontWeight: 800, fontSize: "1.15rem", color: TEXT, margin: "0 0 10px" }}>Add a school</p>
      <div style={{ position: "relative" }}>
        <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", display: "flex" }}><SearchIcon /></span>
        <div data-lp-anchor="cl-search" style={{ width: "100%", boxSizing: "border-box", fontFamily: SANS, fontSize: "1rem", fontWeight: 600,
          color: query ? TEXT : TEXT_MUTED, border: `1.5px solid ${focused ? ink.ring : BORDER}`, borderRadius: RADIUS.control,
          padding: mobile ? "12px 14px 12px 42px" : "12px 44px 12px 42px", background: WHITE, lineHeight: 1.5, whiteSpace: "nowrap",
          overflow: "hidden", boxShadow: focused ? `0 0 0 3px rgba(${hexToRgbString(ink.accent)},0.22)` : "none" }}>
          {query || (mobile ? "Search, like Michigan or NYU" : "Search by name, like Michigan or NYU")}
        </div>
        {!mobile && !query && (
          <kbd aria-hidden="true" style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontFamily: SANS,
            fontWeight: 800, fontSize: "0.9rem", color: TEXT_MID, background: "#f1f1ef", border: `1px solid ${BORDER}`, borderRadius: 7,
            padding: "0 7px", lineHeight: 1.5 }}>/</kbd>
        )}
      </div>
      {added && (
        <p style={{ display: "flex", alignItems: "flex-start", gap: 8, margin: "12px 2px 0", fontFamily: SANS, fontSize: "1rem", fontWeight: 700,
          color: TEXT, lineHeight: 1.5 }}>
          <span style={{ flexShrink: 0, marginTop: 2, display: "flex" }}><CheckIcon color={ink.text} /></span>
          <span style={{ overflowWrap: "anywhere" }}>
            Added {COLLEGES.added.name} to {LABEL[added.category]}.{" "}
            <span style={{ fontFamily: SANS, fontSize: "1rem", fontWeight: 800, color: ink.text, padding: "4px 2px", textDecoration: "underline",
              textUnderlineOffset: 3 }}>See it on your list</span>
          </span>
        </p>
      )}
      {results && (
        <ul data-lp-results="" style={{ margin: "6px 0 -6px", padding: 0 }}>
          {COLLEGES.searchResults.map((s, i) => (
            <SearchResult key={s.scorecard_id} school={s} stats={stats} counts={counts} first={i === 0}
              onList={!!added && s.scorecard_id === COLLEGES.added.scorecard_id} adding={false} onAdd={noop} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** The two chip rows (order and card size), recreated from ChipChoice. */
function Chips({ mobile, ink }) {
  const row = (label, options, on) => (
    <div style={mobile ? { display: "grid", gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`, gap: 8 }
      : { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      {!mobile && <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: "0.95rem", color: TEXT_MID }}>{label}</span>}
      {options.map((o) => (
        <span key={o} style={{ fontFamily: SANS, fontWeight: 700, fontSize: "0.92rem", borderRadius: RADIUS.pill, padding: mobile ? "4px 8px" : "0 14px",
          minHeight: mobile ? 44 : 36, lineHeight: 1.2, display: "inline-flex", alignItems: "center", justifyContent: "center", textAlign: "center",
          boxSizing: "border-box", border: `1.5px solid ${o === on ? ink.text : BORDER}`, background: o === on ? ink.softer : WHITE,
          color: o === on ? ink.onSoft : TEXT_MID }}>{o}</span>
      ))}
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: mobile ? "column" : "row", flexWrap: "wrap", justifyContent: "space-between", gap: mobile ? 10 : 14 }}>
      {row("Order", SORTS, SORTS[0])}
      {row("Cards", VIEWS, VIEWS[0])}
    </div>
  );
}

/** The three groups with their real cards. Memoised: it re-renders on beats, never on t. */
const Groups = memo(function Groups({ items, stats, mobile, ohioCardShown, ohioKey }) {
  return (
    <LayoutGroup id="lp-college">
      {SECTIONS.map((sec) => {
        const list = items.filter((i) => i.category === sec.key && (i.id !== OHIO_ID || ohioCardShown));
        return (
          <section key={sec.key} data-lp-mark={`sec-${sec.key}`} style={{ scrollMarginTop: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <StampTile kind={sec.stamp} size={mobile ? 40 : 46} lit={list.length > 0} />
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontFamily: SANS, fontWeight: 800, color: TEXT, fontSize: mobile ? "1.35rem" : "1.5rem", letterSpacing: "-0.01em" }}>
                  {sec.label}
                </p>
                <p style={{ margin: "2px 0 0", fontFamily: SANS, fontSize: "1rem", fontWeight: 600, color: TEXT_MID, lineHeight: 1.45 }}>{sec.hint}</p>
              </div>
            </div>
            <ul style={{ margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 14 }}>
              {list.map((it) => (
                <SchoolCard key={it.id === OHIO_ID ? ohioKey : it.id} item={it} stats={stats} isMobile={mobile} saving={false} compact={false}
                  flash={it.id === OHIO_ID} onSetCategory={noop} onRestore={noop} onRemove={noop} />
              ))}
            </ul>
          </section>
        );
      })}
    </LayoutGroup>
  );
});

/**
 * Tags the real components' buttons the cursor travels to, and opens the
 * net price chip's definition when the beat says so. Rendered before the
 * Cursor so its layout effect runs first.
 */
function Wire({ root, defOpen, ohioCardShown }) {
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const tag = (sel, name) => {
      const n = el.querySelector(sel);
      if (n && n.getAttribute("data-lp-anchor") !== name) n.setAttribute("data-lp-anchor", name);
    };
    tag('[data-lp-results] li:first-child button', "cl-add");
    tag(`[data-school="${OHIO_ID}"] button[aria-label^="$20,666"]`, "cl-netprice");
    tag(`[data-school="${CW_ID}"] [role="group"] button`, "cl-cw-reach");
  });
  // Facts keeps the open chip in its own state and SchoolCard passes nothing
  // through, so the definition is opened the way a tap would, and closed
  // again when the beat is scrubbed back.
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const btn = el.querySelector(`[data-school="${OHIO_ID}"] button[aria-label^="$20,666"]`);
    if (!btn) return;
    const open = btn.getAttribute("aria-expanded") === "true";
    if (open !== defOpen) btn.click();
  }, [root, defOpen, ohioCardShown]);
  return null;
}

export default function CollegeScreen({ step = 0, t = 0, layout = "desktop", sat = 1450 }) {
  const mobile = layout === "mobile";
  const ink = useAgentInk();
  const reduce = useReduce();
  const root = useRef(null);
  const scroller = useRef(null);
  const s = Math.max(0, Math.min(2, Math.floor(Number(step) || 0)));
  const tt = clamp01(t);

  // The beats, as booleans and the typed query.
  const resultsShown = s > 0 || tt >= 0.55;
  const added = s > 0 || tt >= 0.86;
  const ohioCardShown = s > 1 || (s === 1 && tt >= 0.25);
  const defOpen = s > 1 || (s === 1 && tt >= 0.7);
  const cwMoved = s > 2 || (s === 2 && tt >= 0.45);
  const query = s > 0 ? SEARCH_QUERY : typed(SEARCH_QUERY, seg(tt, 0.15, 0.5));
  const focused = s === 0 && tt >= 0.12 && tt < 0.8;

  const stats = useMemo(() => ({ sat: Number(sat) || 1450, act: null, gpa: COLLEGES.stats.gpa }), [sat]);
  const items = useMemo(() => {
    const base = COLLEGES.list.map((r) => recat(r, stats));
    let list = added ? [...base, recat(COLLEGES.added, stats)] : base;
    if (cwMoved) list = list.map((i) => (i.id === CW_ID ? { ...i, category: "reach", category_source: "student" } : i));
    return list;
  }, [stats, added, cwMoved]);
  // One balance for the scoreboard and the results, as the page passes it: before the add the
  // first result says "Would be your 2nd likely", after it the chip "On your list" replaces that line.
  const counts = useMemo(() => balance(items), [items]);
  const addedRow = added ? items.find((i) => i.id === OHIO_ID) : null;

  useEffect(() => { publishList(items); }, [items]);

  // The scroller follows the story: the results, the Likely group, the Target group, then the moved card.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const top = (sel, pad) => {
      const n = el.querySelector(sel);
      return n ? Math.max(0, n.offsetTop - pad) : 0;
    };
    const search = top('[data-lp-mark="search"]', 16);
    const likely = top('[data-lp-mark="sec-likely"]', 16);
    const target = top('[data-lp-mark="sec-target"]', 16);
    let y = 0;
    if (s === 0) y = tt >= 0.5 ? search * smooth(seg(tt, 0.5, 0.6)) : 0;
    else if (s === 1) y = search + (likely - search) * smooth(seg(tt, 0, 0.25));
    else {
      const cw = top(`[data-school="${CW_ID}"]`, mobile ? 72 : 110);
      y = tt < 0.5 ? likely + (target - likely) * smooth(seg(tt, 0, 0.25)) : target + (cw - target) * smooth(seg(tt, 0.5, 0.75));
    }
    el.scrollTop = Math.max(0, Math.round(y));
  });

  // Where the pointer is, and when it presses.
  let anchor = "cl-away";
  let press = false;
  let show = true;
  if (s === 0) {
    anchor = tt < 0.05 ? "cl-away" : tt < 0.72 ? "cl-search" : "cl-add";
    press = (tt >= 0.12 && tt < 0.16) || (tt >= 0.82 && tt < 0.86);
  } else if (s === 1) {
    anchor = tt < 0.55 ? "cl-add" : "cl-netprice";
    press = tt >= 0.65 && tt < 0.69;
  } else {
    anchor = tt < 0.3 ? "cl-netprice" : "cl-cw-reach";
    press = tt >= 0.4 && tt < 0.44;
    show = tt < 0.5;
  }

  return (
    <>
      {mobile && <MobileSizer />}
      <div ref={root} style={{ position: "absolute", inset: 0, overflow: "hidden", background: BG, fontFamily: SANS, color: TEXT }}>
        <div ref={scroller} style={{ position: "absolute", inset: 0, overflowY: "auto", overflowX: "hidden" }}>
          <div style={{ position: "relative", padding: mobile ? "1.25rem 1rem 6rem" : "2.25rem 2rem 4rem", boxSizing: "border-box" }}>
            <span data-lp-anchor="cl-away" style={{ ...HIDDEN_ANCHOR, right: 24, top: 24 }} />
            <div style={{ maxWidth: 880, margin: "0 auto", width: "100%", display: "flex", flexDirection: "column", gap: mobile ? 18 : 22 }}>
              <Header mobile={mobile} ink={ink} />
              <Scoreboard counts={counts} isMobile={mobile} reduce={reduce} />
              <AddSchool mobile={mobile} ink={ink} query={query} focused={focused} results={resultsShown} counts={counts} stats={stats} added={addedRow} />
              <Chips mobile={mobile} ink={ink} />
              <Groups items={items} stats={stats} mobile={mobile} ohioCardShown={ohioCardShown} ohioKey={`${OHIO_ID}-${ohioCardShown ? "in" : "out"}`} />
            </div>
            <Wire root={root} defOpen={defOpen} ohioCardShown={ohioCardShown} />
            <Cursor anchor={anchor} press={press} show={show} variant={mobile ? "tap" : "arrow"} />
          </div>
        </div>
        {mobile && <MobileTabBar active="colleges" streak={3} lit={false} />}
      </div>
    </>
  );
}
