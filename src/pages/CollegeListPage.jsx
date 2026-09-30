import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "framer-motion";
import { requireUser } from "../lib/auth.js";
import {
  addSchool, importOnboardingNames, loadCollegeList, refreshSuggestions, removeSchool,
  restoreSuggestion, searchSchools, setCategory,
} from "../lib/collegeList.js";
import { balance, explainItem, suggestCategory } from "../lib/collegeCategory.js";
import Spinner from "../components/common/Spinner.jsx";
import { SIDEBAR_WIDTH } from "../components/common/Sidebar.jsx";
import { useIsMobile } from "../hooks/useIsMobile.js";
import { useTheme } from "../lib/ThemeContext.jsx";
import { contrastRatio, readableOn } from "../lib/theme.js";

// College List: the schools a student is applying to, grouped reach, target
// and likely. Calm like Portfolio, not bold like Quest: this is a record to
// review, not a daily loop.

const SANS       = "'Raleway', sans-serif";
const BG         = "#F5F5F5";
const WHITE      = "#ffffff";
const TEXT       = "#141413";
const TEXT_MID   = "#3d3d3a";
const TEXT_MUTED = "#494742";
const TEXT_FAINT = "#6a6760";
const BORDER     = "#e6dfd8";
const DANGER     = "#dc2626";
const DANGER_BG  = "#fef2f2";

// What each group means, said as a comparison, never as odds: the rule only
// sets scores against a school's range and admit rate. `empty` fills a group
// with nothing in it yet, so an empty list still shows its shape.
const SECTIONS = [
  { key: "reach",  label: "Reach",  hint: "Few applicants get in, or your scores sit below their usual range.",
    empty: "None yet. A few schools you would love to attend belong here." },
  { key: "target", label: "Target", hint: "Your scores fit, but they turn many applicants away.",
    empty: "None yet. Most of a strong list sits here." },
  { key: "likely", label: "Likely", hint: "Most applicants with scores like yours get in.",
    empty: "None yet. Add a couple you would be glad to attend." },
];
const LABEL = { reach: "Reach", target: "Target", likely: "Likely" };

// The real data functions. The page takes them as one object so the same
// component can be driven with made-up data when checking it by hand.
const REAL_API = {
  requireUser, load: loadCollegeList, search: searchSchools, add: addSchool,
  setCategory, restore: restoreSuggestion, remove: removeSchool, refresh: refreshSuggestions,
  importNames: importOnboardingNames,
};

const IMPORT_KEY = (uid) => `mentorable.collegeImportDone.${uid}`;
function readFlag(key) {
  try { return localStorage.getItem(key) === "1"; } catch { return false; }
}
function writeFlag(key) {
  try { localStorage.setItem(key, "1"); } catch { /* storage blocked: the offer just comes back */ }
}

// ─── Formatting ───────────────────────────────────────────────────────────────

const money = (n) => `$${Number(n).toLocaleString("en-US")}`;

/** The school's facts, admit rate first. `lead` marks the one that sorts it,
 *  set bolder than the rest but below the reason, which leads the card. */
function facts(s) {
  const out = [];
  if (s.admission_rate !== null && s.admission_rate !== undefined) {
    out.push({ text: s.admission_rate >= 1 ? "Open admission" : `${Math.round(s.admission_rate * 100)}% admitted`, lead: true });
  }
  if (s.sat_25 && s.sat_75) out.push({ text: `SAT ${s.sat_25}-${s.sat_75}` });
  if (s.act_25 && s.act_75) out.push({ text: `ACT ${s.act_25}-${s.act_75}` });
  if (s.net_price !== null && s.net_price !== undefined) out.push({ text: `${money(s.net_price)} avg. net price` });
  if (s.enrollment) out.push({ text: `${Number(s.enrollment).toLocaleString("en-US")} undergrads` });
  return out;
}

const place = (s) => [s.city, s.state].filter(Boolean).join(", ");

/** Bring a school's card into view and put focus on it. */
function showSchool(id, reduce) {
  const el = document.querySelector(`[data-school="${id}"]`);
  if (!el) return;
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
}

const SR_ONLY = { position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden",
  clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0 };

// ─── Small pieces ─────────────────────────────────────────────────────────────

// The accent as text, darkened just enough to read on this page's white and
// #F5F5F5, and an accent-filled button whose label reads: white if it can,
// dark ink if that reads instead (amber, sky), and otherwise white on an
// accent darkened just enough (violet and indigo, where neither passes).
function useAccentInk() {
  const { accent } = useTheme();
  const button = contrastRatio(WHITE, accent) >= 4.5 ? { bg: accent, fg: WHITE }
    : contrastRatio(TEXT, accent) >= 4.5 ? { bg: accent, fg: TEXT }
    : { bg: readableOn(accent, WHITE, 4.5), fg: WHITE };
  return { text: readableOn(accent, WHITE, 4.5), title: readableOn(accent, BG, 3), button };
}

function Facts({ school }) {
  const list = facts(school);
  if (!list.length) return null;
  return (
    <p style={{ margin: "8px 0 0", fontFamily: SANS, color: TEXT, lineHeight: 1.5, fontVariantNumeric: "tabular-nums",
      display: "flex", flexWrap: "wrap", alignItems: "baseline", columnGap: 16, rowGap: 2 }}>
      {list.map((f) => (
        <span key={f.text} style={f.lead ? { fontSize: "1rem", fontWeight: 800 } : { fontSize: "0.95rem", fontWeight: 500 }}>
          {f.text}
        </span>
      ))}
    </p>
  );
}

/** Reach / Target / Likely as one segmented control: a labelled group of
 *  toggle buttons, each reachable with Tab. */
function CategoryPicker({ value, onChange, disabled, label }) {
  const ink = useAccentInk();
  const isMobile = useIsMobile();
  return (
    <div role="group" aria-label={label}
      style={{ display: "inline-flex", background: "rgba(20,20,19,0.05)", borderRadius: 10, padding: 3, gap: 2 }}>
      {SECTIONS.map((s) => {
        const on = value === s.key;
        return (
          // aria-disabled, not disabled: a disabled button cannot hold focus,
          // and focus moves here while the save that disables it runs.
          <button key={s.key} type="button" aria-pressed={on} aria-disabled={disabled || undefined}
            onClick={() => !on && !disabled && onChange(s.key)}
            style={{ fontFamily: SANS, fontSize: "0.9rem", fontWeight: 700, cursor: disabled ? "default" : "pointer",
              padding: isMobile ? "0 14px" : "0 12px", minHeight: isMobile ? 44 : 36, borderRadius: 8, border: "none",
              background: on ? ink.button.bg : "transparent", color: on ? ink.button.fg : TEXT_MUTED,
              transition: "background 0.15s, color 0.15s" }}>
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

function RemoveButton({ onClick, name }) {
  return (
    <button type="button" onClick={onClick} aria-label={`Remove ${name}`}
      style={{ flexShrink: 0, border: "none", background: "none", cursor: "pointer", color: TEXT_MUTED,
        display: "inline-flex", alignItems: "center", justifyContent: "center", width: 44, height: 44,
        borderRadius: 10, transition: "color 0.15s, background 0.15s" }}
      onMouseEnter={(e) => { e.currentTarget.style.color = DANGER; e.currentTarget.style.background = "rgba(220,38,38,0.08)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = TEXT_MUTED; e.currentTarget.style.background = "none"; }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  );
}

function ConfirmRemove({ name, onConfirm, onClose }) {
  const [removing, setRemoving] = useState(false);
  const cancelRef = useRef(null);
  const dialogRef = useRef(null);

  // Focus moves into the dialog, stays there on Tab, Escape closes it, and
  // focus goes back to the remove button that opened it.
  useEffect(() => {
    const opener = document.activeElement;
    cancelRef.current?.focus();
    return () => { if (opener && document.contains(opener)) opener.focus(); };
  }, []);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && !removing) onClose();
      if (e.key !== "Tab" || !dialogRef.current) return;
      const stops = [...dialogRef.current.querySelectorAll("button:not([disabled])")];
      if (!stops.length) { e.preventDefault(); return; }
      const first = stops[0], last = stops[stops.length - 1];
      const inside = dialogRef.current.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || !inside)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !inside)) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [removing, onClose]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: "fixed", inset: 0, zIndex: 320, background: "rgba(20,20,19,0.45)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}
      onClick={removing ? undefined : onClose}>
      <motion.div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="remove-title"
        initial={{ opacity: 0, y: 22, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }} onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 400, background: BG, borderRadius: 20, border: `1px solid ${BORDER}`,
          boxShadow: "0 30px 80px rgba(0,0,0,0.3)", padding: "1.9rem" }}>
        <h2 id="remove-title" style={{ fontFamily: SANS, fontWeight: 700, fontSize: "1.25rem", color: TEXT, marginBottom: 7 }}>
          Remove this school?
        </h2>
        <p style={{ fontFamily: SANS, fontSize: "0.96rem", color: TEXT_MID, lineHeight: 1.6, marginBottom: 22 }}>
          {name} will come off your college list. You can add it back any time.
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" ref={cancelRef} onClick={onClose} disabled={removing}
            style={{ flex: 1, fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700, cursor: "pointer",
              padding: "13px", borderRadius: 11, border: `1.5px solid ${BORDER}`, background: WHITE, color: TEXT_MID }}>
            Cancel
          </button>
          <button type="button" disabled={removing}
            onClick={async () => { setRemoving(true); await onConfirm(); }}
            style={{ flex: 1, fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700,
              cursor: removing ? "default" : "pointer", padding: "13px", borderRadius: 11, border: "none",
              background: DANGER, color: WHITE }}>
            {removing ? "Removing..." : "Remove"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── A school on the list ─────────────────────────────────────────────────────

/** Why the school sits where it does, and the card's lead line. A school the
 *  student sorted keeps the rule's view beside theirs, with a way back to it. */
function Reason({ item, stats, onRestore, saving }) {
  const ink = useAccentInk();
  const lead = { margin: "10px 0 0", fontFamily: SANS, lineHeight: 1.5, fontWeight: 600, fontSize: "1.1rem", color: TEXT };
  if (item.category_source !== "student") {
    const why = explainItem(item, stats);
    if (!why) return null;
    const rough = item.category_source === "rough";
    return (
      <p style={rough ? { ...lead, fontWeight: 500, fontSize: "1.05rem", color: TEXT_MUTED, fontStyle: "italic" } : lead}>
        {why}
      </p>
    );
  }
  const rule = suggestCategory(stats, item);
  const agrees = rule?.category === item.category;
  return (
    <>
      <p style={lead}>You put this in {LABEL[item.category]}{agrees ? ", and the rule agrees." : "."}</p>
      {rule && !agrees && (
        <p style={{ margin: "4px 0 0", fontFamily: SANS, fontSize: "0.95rem", fontWeight: 500, color: TEXT_MUTED,
          lineHeight: 1.5, fontStyle: rule.source === "rough" ? "italic" : "normal" }}>
          The rule would say {LABEL[rule.category]}. {rule.reason.replace(/^Rough guess\. /, "")}{" "}
          <button type="button" onClick={() => !saving && onRestore(item, rule)} aria-disabled={saving || undefined}
            style={{ fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700, fontStyle: "normal", color: ink.text,
              background: "none", border: "none", padding: "4px 0", cursor: saving ? "default" : "pointer",
              textDecoration: "underline", textUnderlineOffset: 3 }}>
            Move it to {LABEL[rule.category]}
          </button>
        </p>
      )}
    </>
  );
}

function SchoolCard({ item, stats, onSetCategory, onRestore, onRemove, isMobile, saving, flash }) {
  const { accentRgb } = useTheme();
  const reduce = useReducedMotion();
  return (
    // layoutId carries the card from its old group to its new one when the
    // category changes, so the student sees where it went.
    <motion.li data-school={item.id} tabIndex={-1}
      layoutId={reduce ? undefined : `school-${item.id}`}
      initial={flash ? { backgroundColor: `rgba(${accentRgb},0.14)` } : false}
      animate={{ backgroundColor: "rgba(255,255,255,1)" }}
      transition={{ layout: { duration: 0.45, ease: [0.22, 1, 0.36, 1] }, backgroundColor: { duration: 1.6, ease: "easeOut" } }}
      style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 16, padding: "1rem 1.1rem",
        listStyle: "none" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexDirection: isMobile ? "column" : "row" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontFamily: SANS, fontWeight: 700, fontSize: isMobile ? "1.2rem" : "1.3rem", color: TEXT,
            lineHeight: 1.3, letterSpacing: "-0.01em", overflowWrap: "anywhere" }}>
            {item.name}
          </p>
          {place(item) && (
            <p style={{ margin: "3px 0 0", fontFamily: SANS, fontSize: "0.95rem", fontWeight: 600, color: TEXT_MUTED }}>{place(item)}</p>
          )}
          <Reason item={item} stats={stats} onRestore={onRestore} saving={saving} />
          <Facts school={item} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
          width: isMobile ? "100%" : "auto", justifyContent: isMobile ? "space-between" : "flex-end" }}>
          <CategoryPicker value={item.category} onChange={(c) => onSetCategory(item, c)} disabled={saving}
            label={`Category for ${item.name}`} />
          <RemoveButton name={item.name} onClick={() => onRemove(item)} />
        </div>
      </div>
    </motion.li>
  );
}

// ─── Search and add ───────────────────────────────────────────────────────────

function SearchResult({ school, stats, onList, adding, onAdd, first }) {
  const { accent } = useTheme();
  const ink = useAccentInk();
  const isMobile = useIsMobile();
  const suggestion = suggestCategory(stats, school);
  return (
    <li style={{ listStyle: "none", padding: "12px 14px", borderTop: first ? "none" : `1px solid ${BORDER}`,
      display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <p style={{ margin: 0, fontFamily: SANS, fontWeight: 700, fontSize: "1.1rem", color: TEXT, overflowWrap: "anywhere" }}>
          {school.name}
        </p>
        <p style={{ margin: "3px 0 0", fontFamily: SANS, fontSize: "0.95rem", fontWeight: 600, color: TEXT_MUTED,
          fontVariantNumeric: "tabular-nums" }}>
          {[place(school), facts(school)[0]?.text].filter(Boolean).join(", ")}
          {suggestion?.source === "rough" && !onList && (
            <span style={{ fontStyle: "italic" }}>. {LABEL[suggestion.category]} is a rough guess without a score range.</span>
          )}
        </p>
      </div>
      {onList ? (
        <span style={{ fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700, color: TEXT_MUTED }}>On your list</span>
      ) : adding ? (
        <Spinner size={18} color={accent} />
      ) : suggestion ? (
        <button type="button" onClick={() => onAdd(school)}
          style={{ fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700, color: ink.text, cursor: "pointer",
            background: "rgba(var(--accent-rgb),0.08)", border: "none", borderRadius: 10, padding: "0 14px",
            minHeight: isMobile ? 44 : 38 }}>
          Add as {LABEL[suggestion.category]}
        </button>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontFamily: SANS, fontSize: "0.95rem", color: TEXT_MUTED }}>No admit rate published. Add as:</span>
          <CategoryPicker value={null} onChange={(c) => onAdd(school, c)} label={`Add ${school.name} as`} />
        </div>
      )}
    </li>
  );
}

function AddSchool({ api, stats, items, onAdded }) {
  const { accent, accentRgb } = useTheme();
  const ink = useAccentInk();
  const reduce = useReducedMotion();
  const [added, setAdded] = useState(null);   // { id, name, category } of the last school added
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);   // null: nothing searched yet
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(null);
  const [adding, setAdding] = useState(() => new Set());   // scorecard_ids being added
  const latest = useRef(0);

  useEffect(() => {
    const q = query.trim();
    setAdded(null);
    if (q.length < 2) {
      latest.current += 1;   // a search still in flight must not refill a cleared box
      setResults(null); setError(null); setSearching(false);
      return undefined;
    }
    const ticket = ++latest.current;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const { schools } = await api.search(q);
        if (ticket !== latest.current) return;
        setResults(schools); setError(null);
      } catch (e) {
        if (ticket !== latest.current) return;
        setResults(null); setError(e.message);
      } finally {
        if (ticket === latest.current) setSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [query, api]);

  const onList = new Set(items.map((i) => i.scorecard_id));

  const add = async (school, category) => {
    const id = school.scorecard_id;
    setAdding((prev) => new Set(prev).add(id)); setError(null); setAdded(null);
    try {
      const row = await onAdded(school, category);
      setAdded({ id: row.id, name: row.name, category: row.category });
    } catch (e) {
      setError(e.message);
    } finally {
      setAdding((prev) => { const next = new Set(prev); next.delete(id); return next; });
    }
  };

  return (
    <div style={{ marginBottom: "1.6rem" }}>
      <label htmlFor="college-search" style={{ display: "block", fontFamily: SANS, fontWeight: 700,
        fontSize: "1.05rem", color: TEXT, marginBottom: 8 }}>
        Add a school
      </label>
      <div style={{ position: "relative" }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={TEXT_FAINT} strokeWidth="2.2"
          strokeLinecap="round" aria-hidden="true" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }}>
          <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input id="college-search" type="search" value={query} autoComplete="off"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") setQuery(""); }}
          placeholder="Search by name, like Michigan or NYU"
          style={{ width: "100%", boxSizing: "border-box", fontFamily: SANS, fontSize: "1rem", color: TEXT,
            border: `1.5px solid ${BORDER}`, borderRadius: 12, padding: "13px 14px 13px 42px", outline: "none",
            background: WHITE, transition: "border-color 0.15s, box-shadow 0.15s" }}
          // The focus ring is the one cue a keyboard user has here, so it
          // uses the accent darkened to 3:1 against white, plus a soft halo.
          onFocus={(e) => { e.target.style.borderColor = readableOn(accent, WHITE, 3);
            e.target.style.boxShadow = `0 0 0 3px rgba(${accentRgb},0.22)`; }}
          onBlur={(e) => { e.target.style.borderColor = BORDER; e.target.style.boxShadow = "none"; }} />
      </div>

      <div aria-live="polite">
        {searching && (
          <p style={{ display: "flex", alignItems: "center", gap: 8, margin: "10px 2px 0", fontFamily: SANS,
            fontSize: "0.95rem", color: TEXT_MUTED }}>
            <Spinner size={14} color={accent} /> Searching...
          </p>
        )}
        {!searching && error && (
          <p role="alert" style={{ margin: "10px 2px 0", fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700, color: DANGER }}>
            {error}
          </p>
        )}
        {!searching && results && results.length === 0 && (
          <p style={{ margin: "10px 2px 0", fontFamily: SANS, fontSize: "1rem", color: TEXT_MUTED }}>
            No schools found. Try the full official name, like University of Michigan.
          </p>
        )}
        {!searching && results && results.length > 0 && !added && (
          <p style={SR_ONLY}>{results.length} {results.length === 1 ? "school" : "schools"} found.</p>
        )}
        {added && (
          <p style={{ display: "flex", alignItems: "flex-start", gap: 8, margin: "10px 2px 0",
            fontFamily: SANS, fontSize: "1rem", fontWeight: 600, color: TEXT, lineHeight: 1.5 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={ink.text} strokeWidth="2.6"
              strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, marginTop: 3 }}>
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span style={{ overflowWrap: "anywhere" }}>
            Added {added.name} to {LABEL[added.category]}.{" "}
            <button type="button" onClick={() => { const id = added.id; setQuery(""); showSchool(id, reduce); }}
              style={{ fontFamily: SANS, fontSize: "1rem", fontWeight: 700, color: ink.text, background: "none",
                border: "none", padding: "4px 2px", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3 }}>
              See it on your list
            </button>
            </span>
          </p>
        )}
      </div>

      {!searching && results && results.length > 0 && (
        <ul style={{ margin: "8px 0 0", padding: 0, background: WHITE, border: `1px solid ${BORDER}`,
          borderRadius: 14, overflow: "hidden" }}>
          {results.map((s, i) => (
            <SearchResult key={s.scorecard_id} school={s} stats={stats} first={i === 0}
              onList={onList.has(s.scorecard_id)} adding={adding.has(s.scorecard_id)} onAdd={add} />
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CollegeListPage({ navigate, api = REAL_API }) {
  const isMobile = useIsMobile();
  const { accent, accentRgb } = useTheme();
  const ink = useAccentInk();
  const [phase, setPhase] = useState("loading");
  const [userId, setUserId] = useState(null);
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState({ sat: null, act: null, gpa: null });
  const [onboardingNames, setOnboardingNames] = useState([]);
  const [notice, setNotice] = useState(null);   // { text, error }
  const [confirm, setConfirm] = useState(null);
  const [importing, setImporting] = useState(null);   // the name being looked up
  const [importDone, setImportDone] = useState(false);
  const [saving, setSaving] = useState(() => new Set());   // ids whose category is being saved
  const [flash, setFlash] = useState(null);   // id of the card that just moved
  const [said, setSaid] = useState("");       // read out by screen readers only
  const focusNext = useRef(null);             // a CSS selector to focus after the next render
  const reduce = useReducedMotion();

  // A card that changes group unmounts from one list and mounts in another, and
  // a removed card is gone, so focus would fall back to <body>. Put it where the
  // student can carry on from, and bring that into view.
  useEffect(() => {
    const target = focusNext.current;
    if (!target) return;
    focusNext.current = null;
    const el = document.querySelector(target);
    if (!el) return;
    el.focus({ preventScroll: true });
    el.closest("li, section")?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  });
  useEffect(() => {
    if (!flash) return undefined;
    const t = setTimeout(() => setFlash(null), 1800);
    return () => clearTimeout(t);
  }, [flash]);

  const load = useCallback(async () => {
    setPhase("loading");
    try {
      const user = await api.requireUser();
      if (!user) { navigate?.("/auth"); return; }
      setUserId(user.id);
      const data = await api.load(user.id);
      setStats(data.stats);
      setOnboardingNames(data.onboardingNames);
      setImportDone(readFlag(IMPORT_KEY(user.id)));
      // A new score or GPA can move a suggested school; say so when it does.
      // If that update fails, the list as saved is still worth showing.
      let fresh = data.items, moved = 0;
      try {
        ({ items: fresh, moved } = await api.refresh(data.items, data.stats));
      } catch (e) {
        console.warn("[college list] refresh failed:", e);
      }
      setItems(fresh);
      if (moved) setNotice({ text: `Updated to match your latest scores: ${moved} ${moved === 1 ? "school" : "schools"} moved.` });
      setPhase("ready");
    } catch (e) {
      console.error("[college list] load failed:", e);
      setPhase("error");
    }
  }, [api, navigate]);
  useEffect(() => { load(); }, [load]);

  const onAdded = useCallback(async (school, category) => {
    const row = await api.add(userId, school, stats, category);
    setItems((prev) => [...prev, row]);
    return row;
  }, [api, userId, stats]);

  // One save per school at a time, so two quick taps cannot land out of order.
  // `rule` set means handing the school back to the rule's suggestion.
  const move = async (item, category, rule = null) => {
    if (saving.has(item.id)) return;
    const before = item;
    const moved = category !== item.category;
    setSaving((prev) => new Set(prev).add(item.id));
    setItems((prev) => prev.map((i) => (i.id === item.id
      ? { ...i, category, category_source: rule ? rule.source : "student" } : i)));
    if (moved) {
      setFlash(item.id);
      setSaid(`Moved ${item.name} to ${LABEL[category]}.`);
    }
    focusNext.current = `[data-school="${item.id}"] [aria-pressed="true"]`;
    try {
      const saved = rule ? await api.restore(item.id, rule) : await api.setCategory(item.id, category);
      setItems((prev) => prev.map((i) => (i.id === item.id ? saved : i)));
    } catch (e) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? before : i)));
      focusNext.current = `[data-school="${item.id}"] [aria-pressed="true"]`;
      if (moved) setSaid(`${item.name} is still in ${LABEL[before.category]}.`);
      setNotice({ text: e.message, error: true });
    } finally {
      setSaving((prev) => { const next = new Set(prev); next.delete(item.id); return next; });
    }
  };
  const onSetCategory = (item, category) => move(item, category);
  const onRestore = (item, rule) => move(item, rule.category, rule);

  const onRemove = async () => {
    const item = confirm;
    // Focus lands on the next school in the same group, or the one before,
    // or the group's heading when it was the last.
    const group = items.filter((i) => i.category === item.category);
    const at = group.findIndex((i) => i.id === item.id);
    const neighbour = group[at + 1] || group[at - 1];
    try {
      await api.remove(item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      setSaid(`Removed ${item.name}.`);
      focusNext.current = neighbour ? `[data-school="${neighbour.id}"]` : `#sec-${item.category}`;
    } catch (e) {
      setNotice({ text: e.message, error: true });
    }
    setConfirm(null);
  };

  const runImport = async () => {
    setNotice(null);
    try {
      const { added, unmatched } = await api.importNames(userId, onboardingNames, stats, setImporting);
      setItems((prev) => [...prev, ...added.filter((a) => !prev.some((p) => p.id === a.id))]);
      setNotice({ text: unmatched.length
        ? `Added ${added.length}. Could not find ${unmatched.join(", ")}. Search for ${unmatched.length === 1 ? "it" : "them"} above.`
        : `Added ${added.length} ${added.length === 1 ? "school" : "schools"}.` });
      writeFlag(IMPORT_KEY(userId)); setImportDone(true);
    } catch (e) {
      setNotice({ text: e.message, error: true });
    } finally {
      setImporting(null);
    }
  };

  const skipImport = () => { writeFlag(IMPORT_KEY(userId)); setImportDone(true); };

  const pagePad = {
    minHeight: "100vh", background: BG, fontFamily: SANS, boxSizing: "border-box",
    padding: isMobile ? "1.5rem 1rem 6rem" : "2.5rem 2rem 4rem",
    paddingLeft: isMobile ? "1rem" : `calc(${SIDEBAR_WIDTH}px + 2rem)`,
  };

  if (phase === "loading") {
    return (
      <div data-sidebar-offset style={{ ...pagePad, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Spinner size={26} color={accent} />
      </div>
    );
  }
  if (phase === "error") {
    return (
      <div data-sidebar-offset style={{ ...pagePad, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", maxWidth: 420 }}>
          <p style={{ fontFamily: SANS, fontSize: "1.05rem", fontWeight: 700, color: TEXT, marginBottom: 8 }}>
            We could not load your college list
          </p>
          <p style={{ fontFamily: SANS, fontSize: "0.98rem", color: TEXT_MUTED, lineHeight: 1.6, marginBottom: "1.4rem" }}>
            Nothing has been lost. Give it another go in a moment.
          </p>
          <button type="button" onClick={load}
            style={{ fontFamily: SANS, fontSize: "0.98rem", fontWeight: 700, cursor: "pointer", padding: "0 22px",
              minHeight: 44, borderRadius: 10, border: "none", background: ink.button.bg, color: ink.button.fg }}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  const b = balance(items);
  const offerImport = items.length === 0 && onboardingNames.length > 0 && !importDone;

  return (
    <div data-sidebar-offset style={pagePad}>
      <div style={{ maxWidth: 820, margin: "0 auto", width: "100%" }}>
        <h1 style={{ fontFamily: SANS, fontWeight: 800, fontSize: isMobile ? "2.1rem" : "2.5rem", color: ink.title,
          letterSpacing: "-0.03em", margin: "0 0 0.6rem", lineHeight: 1.1 }}>
          College List
        </h1>
        <p style={{ fontFamily: SANS, fontSize: "1.15rem", color: TEXT_MUTED, lineHeight: 1.6, margin: "0 0 1.9rem", maxWidth: 640 }}>
          The schools you are applying to, grouped by how your scores compare with the students each one admits.
          Admit rates, score ranges and costs come from the U.S. Department of Education.
        </p>

        {offerImport && (
          <div style={{ background: WHITE, border: `2px solid ${accent}`, borderRadius: 16, padding: "1.2rem 1.4rem",
            marginBottom: "1.5rem" }}>
            <p style={{ fontFamily: SANS, fontWeight: 700, fontSize: "1.15rem", color: TEXT, margin: "0 0 5px" }}>
              Start with the schools you already named
            </p>
            <p style={{ fontFamily: SANS, fontSize: "1rem", color: TEXT_MUTED, lineHeight: 1.55, margin: "0 0 14px" }}>
              When you signed up you mentioned {onboardingNames.join(", ")}. We can look them up and sort them for you.
            </p>
            {importing ? (
              <p role="status" style={{ display: "flex", alignItems: "center", gap: 9, margin: 0, fontFamily: SANS,
                fontSize: "1rem", fontWeight: 700, color: TEXT_MID }}>
                <Spinner size={16} color={accent} /> Looking up {importing}...
              </p>
            ) : (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button type="button" onClick={runImport}
                  style={{ fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700, cursor: "pointer",
                    padding: "0 18px", minHeight: 44, borderRadius: 11, border: "none", background: ink.button.bg, color: ink.button.fg }}>
                  Add them to my list
                </button>
                <button type="button" onClick={skipImport}
                  style={{ fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700, cursor: "pointer",
                    padding: "0 16px", minHeight: 44, borderRadius: 11, border: `1.5px solid ${BORDER}`, background: WHITE, color: TEXT_MID }}>
                  No thanks
                </button>
              </div>
            )}
          </div>
        )}

        <AddSchool api={api} stats={stats} items={items} onAdded={onAdded} />

        <div aria-live="polite">
          {notice && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10, borderRadius: 12, padding: "0 0 0 14px",
              marginBottom: "1.2rem", background: notice.error ? DANGER_BG : WHITE,
              border: `1px solid ${notice.error ? "rgba(220,38,38,0.35)" : BORDER}` }}>
              {notice.error && (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={DANGER} strokeWidth="2.4"
                  strokeLinecap="round" aria-hidden="true" style={{ flexShrink: 0, marginTop: 13 }}>
                  <circle cx="12" cy="12" r="9.5" /><line x1="12" y1="7.5" x2="12" y2="12.5" /><line x1="12" y1="16.5" x2="12" y2="16.5" />
                </svg>
              )}
              <p style={{ flex: 1, margin: "11px 0", fontFamily: SANS, fontSize: "1rem", lineHeight: 1.5, overflowWrap: "anywhere",
                color: notice.error ? TEXT : TEXT_MID, fontWeight: notice.error ? 600 : 400 }}>
                {notice.error && <span style={SR_ONLY}>Error: </span>}{notice.text}
              </p>
              <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss this message"
                style={{ flexShrink: 0, width: 44, height: 44, display: "inline-flex", alignItems: "center",
                  justifyContent: "center", border: "none", background: "none", cursor: "pointer", color: TEXT_MUTED,
                  borderRadius: 10 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
                  strokeLinecap="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          )}
        </div>

        <div role="status" style={SR_ONLY}>{said}</div>

        {/* Empty or not, the three groups are always there: an empty list
            shows the shape a list should take before the first search. */}
        <div style={{ marginBottom: "1.8rem" }}>
          {items.length === 0 ? (
            <p style={{ margin: 0, fontFamily: SANS, fontSize: "1.1rem", fontWeight: 500, color: TEXT_MID, lineHeight: 1.6,
              maxWidth: 640 }}>
              A strong list has a few of each. Search for a school above and it lands in one of these three groups,
              with the reason why. You can move it any time.
            </p>
          ) : (
            <>
              <p style={{ margin: 0, fontFamily: SANS, fontSize: "1.2rem", fontWeight: 600, color: TEXT,
                fontVariantNumeric: "tabular-nums" }}>
                {b.reach} reach, {b.target} target, {b.likely} likely
              </p>
              {b.note && (
                <p style={{ margin: "12px 0 0", fontFamily: SANS, fontSize: "1rem", fontWeight: 600, color: TEXT, lineHeight: 1.55,
                  background: `rgba(${accentRgb},0.08)`, borderRadius: 12, padding: "10px 14px", maxWidth: 640 }}>
                  {b.note}
                </p>
              )}
            </>
          )}
        </div>

        <LayoutGroup>
          {SECTIONS.map((sec) => {
            const list = items.filter((i) => i.category === sec.key);
            return (
              <section key={sec.key} aria-labelledby={`sec-${sec.key}`} style={{ marginBottom: "1.8rem" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
                  <h2 id={`sec-${sec.key}`} tabIndex={-1} style={{ margin: 0, fontFamily: SANS, fontWeight: 700, color: TEXT,
                    fontSize: isMobile ? "1.35rem" : "1.5rem", letterSpacing: "-0.01em" }}>
                    {sec.label}
                  </h2>
                  <span style={{ fontFamily: SANS, fontWeight: 500, fontSize: isMobile ? "1.35rem" : "1.5rem", color: TEXT_MUTED,
                    fontVariantNumeric: "tabular-nums" }}>
                    {list.length}<span style={SR_ONLY}> {list.length === 1 ? "school" : "schools"}</span>
                  </span>
                </div>
                <p style={{ margin: "0 0 12px", fontFamily: SANS, fontSize: "1.1rem", color: ink.text, lineHeight: 1.5 }}>
                  {sec.hint}
                </p>
                {list.length === 0 ? (
                  <p style={{ margin: 0, fontFamily: SANS, fontSize: "1rem", fontWeight: 500, color: TEXT_MUTED, lineHeight: 1.5,
                    border: `1px dashed ${BORDER}`, borderRadius: 14, padding: "12px 14px" }}>
                    {sec.empty}
                  </p>
                ) : (
                  <ul style={{ margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                    {list.map((it) => (
                      <SchoolCard key={it.id} item={it} stats={stats} isMobile={isMobile} saving={saving.has(it.id)}
                        flash={flash === it.id} onSetCategory={onSetCategory} onRestore={onRestore} onRemove={setConfirm} />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </LayoutGroup>

        <p style={{ margin: "0.4rem 0 0", fontFamily: SANS, fontSize: "0.95rem", color: TEXT_MUTED, lineHeight: 1.6, maxWidth: 660 }}>
          Figures are from the College Scorecard. Score ranges are the middle 50% of admitted students, and average
          net price is what students who got financial aid paid in a year, which is often far below the listed price.
          A category is a starting point, not a prediction.{" "}
          {navigate && items.length > 0 && (
            <button type="button" onClick={() => navigate("/chat")}
              style={{ fontFamily: SANS, fontSize: "0.95rem", color: ink.text, fontWeight: 700, background: "none",
                border: "none", padding: 0, cursor: "pointer", textDecoration: "underline" }}>
              Talk your list over in Chat.
            </button>
          )}
        </p>
      </div>

      <AnimatePresence>
        {confirm && <ConfirmRemove key="confirm" name={confirm.name} onConfirm={onRemove} onClose={() => setConfirm(null)} />}
      </AnimatePresence>
    </div>
  );
}
