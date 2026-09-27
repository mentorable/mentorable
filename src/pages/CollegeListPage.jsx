import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { requireUser } from "../lib/auth.js";
import {
  addSchool, importOnboardingNames, loadCollegeList, refreshSuggestions, removeSchool,
  searchSchools, setCategory,
} from "../lib/collegeList.js";
import { balance, explainItem, suggestCategory } from "../lib/collegeCategory.js";
import Spinner from "../components/common/Spinner.jsx";
import { SIDEBAR_WIDTH } from "../components/common/Sidebar.jsx";
import { useIsMobile } from "../hooks/useIsMobile.js";
import { useTheme } from "../lib/ThemeContext.jsx";

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

const SECTIONS = [
  { key: "reach",  label: "Reach",  hint: "Getting in would be a stretch. Worth applying to a few." },
  { key: "target", label: "Target", hint: "Your record looks like the students they admit." },
  { key: "likely", label: "Likely", hint: "You should get in. Choose ones you would be glad to attend." },
];
const LABEL = { reach: "Reach", target: "Target", likely: "Likely" };

// The real data functions. The page takes them as one object so the same
// component can be driven with made-up data when checking it by hand.
const REAL_API = {
  requireUser, load: loadCollegeList, search: searchSchools, add: addSchool,
  setCategory, remove: removeSchool, refresh: refreshSuggestions, importNames: importOnboardingNames,
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

function facts(s) {
  const out = [];
  if (s.admission_rate !== null && s.admission_rate !== undefined) {
    out.push(s.admission_rate >= 1 ? "Open admission" : `${Math.round(s.admission_rate * 100)}% admitted`);
  }
  if (s.sat_25 && s.sat_75) out.push(`SAT ${s.sat_25}-${s.sat_75}`);
  if (s.act_25 && s.act_75) out.push(`ACT ${s.act_25}-${s.act_75}`);
  if (s.net_price !== null && s.net_price !== undefined) out.push(`${money(s.net_price)} avg. net price`);
  if (s.enrollment) out.push(`${Number(s.enrollment).toLocaleString("en-US")} undergrads`);
  return out;
}

const place = (s) => [s.city, s.state].filter(Boolean).join(", ");

// ─── Small pieces ─────────────────────────────────────────────────────────────

function Facts({ school }) {
  const list = facts(school);
  if (!list.length) return null;
  return (
    <p style={{ margin: "6px 0 0", fontFamily: SANS, fontSize: "0.88rem", color: TEXT_MID, lineHeight: 1.5,
      display: "flex", flexWrap: "wrap", columnGap: 14, rowGap: 2 }}>
      {list.map((f) => <span key={f}>{f}</span>)}
    </p>
  );
}

/** Reach / Target / Likely as one segmented control: a labelled group of
 *  toggle buttons, each reachable with Tab. */
function CategoryPicker({ value, onChange, disabled, label }) {
  const { accent } = useTheme();
  return (
    <div role="group" aria-label={label}
      style={{ display: "inline-flex", background: "rgba(20,20,19,0.05)", borderRadius: 10, padding: 3, gap: 2 }}>
      {SECTIONS.map((s) => {
        const on = value === s.key;
        return (
          <button key={s.key} type="button" aria-pressed={on} disabled={disabled}
            onClick={() => !on && onChange(s.key)}
            style={{ fontFamily: SANS, fontSize: "0.84rem", fontWeight: 700, cursor: disabled ? "default" : "pointer",
              padding: "6px 11px", borderRadius: 8, border: "none",
              background: on ? accent : "transparent", color: on ? WHITE : TEXT_MUTED,
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
      style={{ flexShrink: 0, border: "none", background: "none", cursor: "pointer", color: TEXT_FAINT,
        display: "inline-flex", padding: 6, borderRadius: 8, transition: "color 0.15s, background 0.15s" }}
      onMouseEnter={(e) => { e.currentTarget.style.color = DANGER; e.currentTarget.style.background = "rgba(220,38,38,0.08)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = TEXT_FAINT; e.currentTarget.style.background = "none"; }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  );
}

function ConfirmRemove({ name, onConfirm, onClose }) {
  const [removing, setRemoving] = useState(false);
  const cancelRef = useRef(null);

  // Focus moves into the dialog, Escape closes it, and focus goes back to the
  // remove button that opened it.
  useEffect(() => {
    const opener = document.activeElement;
    cancelRef.current?.focus();
    return () => { if (opener && document.contains(opener)) opener.focus(); };
  }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !removing) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [removing, onClose]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: "fixed", inset: 0, zIndex: 320, background: "rgba(20,20,19,0.45)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}
      onClick={removing ? undefined : onClose}>
      <motion.div role="dialog" aria-modal="true" aria-labelledby="remove-title"
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

function SchoolCard({ item, stats, onSetCategory, onRemove, isMobile, saving }) {
  const why = explainItem(item, stats);
  const rough = item.category_source === "rough";
  return (
    <li style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 16, padding: "1rem 1.1rem",
      listStyle: "none" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexDirection: isMobile ? "column" : "row" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontFamily: SANS, fontWeight: 700, fontSize: "1.05rem", color: TEXT, lineHeight: 1.35 }}>
            {item.name}
          </p>
          {place(item) && (
            <p style={{ margin: "2px 0 0", fontFamily: SANS, fontSize: "0.88rem", color: TEXT_FAINT }}>{place(item)}</p>
          )}
          <Facts school={item} />
          {why && (
            <p style={{ margin: "7px 0 0", fontFamily: SANS, fontSize: "0.86rem", lineHeight: 1.5,
              color: rough ? TEXT_MUTED : TEXT_FAINT, fontStyle: rough ? "italic" : "normal" }}>
              {why}
            </p>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
          width: isMobile ? "100%" : "auto", justifyContent: isMobile ? "space-between" : "flex-end" }}>
          <CategoryPicker value={item.category} onChange={(c) => onSetCategory(item, c)} disabled={saving}
            label={`Category for ${item.name}`} />
          <RemoveButton name={item.name} onClick={() => onRemove(item)} />
        </div>
      </div>
    </li>
  );
}

// ─── Search and add ───────────────────────────────────────────────────────────

function SearchResult({ school, stats, onList, adding, onAdd, first }) {
  const { accent } = useTheme();
  const suggestion = suggestCategory(stats, school);
  return (
    <li style={{ listStyle: "none", padding: "12px 14px", borderTop: first ? "none" : `1px solid ${BORDER}`,
      display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <p style={{ margin: 0, fontFamily: SANS, fontWeight: 700, fontSize: "0.98rem", color: TEXT }}>{school.name}</p>
        <p style={{ margin: "2px 0 0", fontFamily: SANS, fontSize: "0.85rem", color: TEXT_FAINT }}>
          {[place(school), facts(school)[0]].filter(Boolean).join(", ")}
          {suggestion?.source === "rough" && !onList && (
            <span style={{ fontStyle: "italic" }}>. {LABEL[suggestion.category]} is a rough guess without a score range.</span>
          )}
        </p>
      </div>
      {onList ? (
        <span style={{ fontFamily: SANS, fontSize: "0.88rem", fontWeight: 700, color: TEXT_FAINT }}>On your list</span>
      ) : adding ? (
        <Spinner size={18} color={accent} />
      ) : suggestion ? (
        <button type="button" onClick={() => onAdd(school)}
          style={{ fontFamily: SANS, fontSize: "0.9rem", fontWeight: 700, color: accent, cursor: "pointer",
            background: "rgba(var(--accent-rgb),0.08)", border: "none", borderRadius: 10, padding: "8px 13px" }}>
          Add as {LABEL[suggestion.category]}
        </button>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontFamily: SANS, fontSize: "0.84rem", color: TEXT_MUTED }}>No admit rate published. Add as:</span>
          <CategoryPicker value={null} onChange={(c) => onAdd(school, c)} label={`Add ${school.name} as`} />
        </div>
      )}
    </li>
  );
}

function AddSchool({ api, stats, items, onAdded }) {
  const { accent } = useTheme();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);   // null: nothing searched yet
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(null);
  const [adding, setAdding] = useState(() => new Set());   // scorecard_ids being added
  const latest = useRef(0);

  useEffect(() => {
    const q = query.trim();
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
    setAdding((prev) => new Set(prev).add(id)); setError(null);
    try {
      await onAdded(school, category);
    } catch (e) {
      setError(e.message);
    } finally {
      setAdding((prev) => { const next = new Set(prev); next.delete(id); return next; });
    }
  };

  return (
    <div style={{ marginBottom: "1.6rem" }}>
      <label htmlFor="college-search" style={{ display: "block", fontFamily: SANS, fontWeight: 700,
        fontSize: "0.95rem", color: TEXT, marginBottom: 8 }}>
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
            background: WHITE }}
          onFocus={(e) => (e.target.style.borderColor = accent)}
          onBlur={(e) => (e.target.style.borderColor = BORDER)} />
      </div>

      <div aria-live="polite">
        {searching && (
          <p style={{ display: "flex", alignItems: "center", gap: 8, margin: "10px 2px 0", fontFamily: SANS,
            fontSize: "0.9rem", color: TEXT_FAINT }}>
            <Spinner size={14} color={accent} /> Searching...
          </p>
        )}
        {!searching && error && (
          <p role="alert" style={{ margin: "10px 2px 0", fontFamily: SANS, fontSize: "0.92rem", fontWeight: 700, color: DANGER }}>
            {error}
          </p>
        )}
        {!searching && results && results.length === 0 && (
          <p style={{ margin: "10px 2px 0", fontFamily: SANS, fontSize: "0.92rem", color: TEXT_MUTED }}>
            No schools found. Try the full official name, like University of Michigan.
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
  const { accent } = useTheme();
  const [phase, setPhase] = useState("loading");
  const [userId, setUserId] = useState(null);
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState({ sat: null, act: null, gpa: null });
  const [onboardingNames, setOnboardingNames] = useState([]);
  const [notice, setNotice] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [importing, setImporting] = useState(null);   // the name being looked up
  const [importDone, setImportDone] = useState(false);
  const [saving, setSaving] = useState(() => new Set());   // ids whose category is being saved

  useEffect(() => {
    (async () => {
      try {
        const user = await api.requireUser();
        if (!user) { navigate?.("/auth"); return; }
        setUserId(user.id);
        const data = await api.load(user.id);
        setStats(data.stats);
        setOnboardingNames(data.onboardingNames);
        setImportDone(readFlag(IMPORT_KEY(user.id)));
        // A new score or GPA can move a suggested school; say so when it does.
        const { items: fresh, moved } = await api.refresh(data.items, data.stats);
        setItems(fresh);
        if (moved) setNotice(`Updated to match your latest scores: ${moved} ${moved === 1 ? "school" : "schools"} moved.`);
        setPhase("ready");
      } catch (e) {
        console.error("[college list] load failed:", e);
        setPhase("error");
      }
    })();
  }, [api, navigate]);

  const onAdded = useCallback(async (school, category) => {
    const row = await api.add(userId, school, stats, category);
    setItems((prev) => [...prev, row]);
  }, [api, userId, stats]);

  // One save per school at a time, so two quick taps cannot land out of order.
  const onSetCategory = async (item, category) => {
    if (saving.has(item.id)) return;
    const before = item;
    setSaving((prev) => new Set(prev).add(item.id));
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, category, category_source: "student" } : i)));
    try {
      const saved = await api.setCategory(item.id, category);
      setItems((prev) => prev.map((i) => (i.id === item.id ? saved : i)));
    } catch (e) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? before : i)));
      setNotice(e.message);
    } finally {
      setSaving((prev) => { const next = new Set(prev); next.delete(item.id); return next; });
    }
  };

  const onRemove = async () => {
    const item = confirm;
    try {
      await api.remove(item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch (e) {
      setNotice(e.message);
    }
    setConfirm(null);
  };

  const runImport = async () => {
    setNotice(null);
    try {
      const { added, unmatched } = await api.importNames(userId, onboardingNames, stats, setImporting);
      setItems((prev) => [...prev, ...added.filter((a) => !prev.some((p) => p.id === a.id))]);
      setNotice(unmatched.length
        ? `Added ${added.length}. Could not find ${unmatched.join(", ")}. Search for ${unmatched.length === 1 ? "it" : "them"} above.`
        : `Added ${added.length} ${added.length === 1 ? "school" : "schools"}.`);
      writeFlag(IMPORT_KEY(userId)); setImportDone(true);
    } catch (e) {
      setNotice(e.message);
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
          <button type="button" onClick={() => window.location.reload()}
            style={{ fontFamily: SANS, fontSize: "0.98rem", fontWeight: 700, cursor: "pointer", padding: "11px 22px",
              borderRadius: 10, border: "none", background: accent, color: WHITE }}>
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
        <h1 style={{ fontFamily: SANS, fontWeight: 700, fontSize: isMobile ? "2rem" : "2.4rem", color: accent,
          letterSpacing: "-0.03em", margin: "0 0 0.6rem" }}>
          College List
        </h1>
        <p style={{ fontFamily: SANS, fontSize: "1.05rem", color: TEXT_MUTED, lineHeight: 1.6, margin: "0 0 1.75rem", maxWidth: 640 }}>
          The schools you are applying to, sorted by how likely you are to get in. Admit rates, score ranges and
          costs come from the U.S. Department of Education.
        </p>

        {offerImport && (
          <div style={{ background: WHITE, border: `2px solid ${accent}`, borderRadius: 16, padding: "1.2rem 1.4rem",
            marginBottom: "1.5rem" }}>
            <p style={{ fontFamily: SANS, fontWeight: 700, fontSize: "1.05rem", color: TEXT, margin: "0 0 4px" }}>
              Start with the schools you already named
            </p>
            <p style={{ fontFamily: SANS, fontSize: "0.95rem", color: TEXT_MUTED, lineHeight: 1.55, margin: "0 0 14px" }}>
              When you signed up you mentioned {onboardingNames.join(", ")}. We can look them up and sort them for you.
            </p>
            {importing ? (
              <p role="status" style={{ display: "flex", alignItems: "center", gap: 9, margin: 0, fontFamily: SANS,
                fontSize: "0.95rem", fontWeight: 700, color: TEXT_MID }}>
                <Spinner size={16} color={accent} /> Looking up {importing}...
              </p>
            ) : (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button type="button" onClick={runImport}
                  style={{ fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700, cursor: "pointer",
                    padding: "11px 18px", borderRadius: 11, border: "none", background: accent, color: WHITE }}>
                  Add them to my list
                </button>
                <button type="button" onClick={skipImport}
                  style={{ fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700, cursor: "pointer",
                    padding: "11px 16px", borderRadius: 11, border: `1.5px solid ${BORDER}`, background: WHITE, color: TEXT_MID }}>
                  Start fresh
                </button>
              </div>
            )}
          </div>
        )}

        <AddSchool api={api} stats={stats} items={items} onAdded={onAdded} />

        <div aria-live="polite">
          {notice && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10, background: WHITE, border: `1px solid ${BORDER}`,
              borderRadius: 12, padding: "10px 12px 10px 14px", marginBottom: "1.2rem" }}>
              <p style={{ flex: 1, margin: 0, fontFamily: SANS, fontSize: "0.93rem", color: TEXT_MID, lineHeight: 1.5 }}>{notice}</p>
              <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss"
                style={{ border: "none", background: "none", cursor: "pointer", color: TEXT_FAINT, padding: 2,
                  fontFamily: SANS, fontSize: "1.1rem", lineHeight: 1 }}>
                ×
              </button>
            </div>
          )}
        </div>

        {items.length === 0 ? (
          <div style={{ background: WHITE, border: `1px dashed ${BORDER}`, borderRadius: 16, padding: "1.6rem 1.4rem" }}>
            <p style={{ fontFamily: SANS, fontWeight: 700, fontSize: "1rem", color: TEXT, margin: "0 0 6px" }}>
              Your list is empty
            </p>
            <p style={{ fontFamily: SANS, fontSize: "0.95rem", color: TEXT_MUTED, lineHeight: 1.6, margin: 0, maxWidth: 560 }}>
              Search for a school above. Each one is sorted into reach, target or likely for you, and you can change
              that any time. A strong list has a few of each.
            </p>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: "1.4rem" }}>
              <p style={{ margin: 0, fontFamily: SANS, fontSize: "1rem", fontWeight: 700, color: TEXT }}>
                {b.reach} reach, {b.target} target, {b.likely} likely
              </p>
              {b.note && (
                <p style={{ margin: "6px 0 0", fontFamily: SANS, fontSize: "0.95rem", color: TEXT_MID, lineHeight: 1.55,
                  borderLeft: `3px solid ${accent}`, paddingLeft: 10, maxWidth: 640 }}>
                  {b.note}
                </p>
              )}
            </div>

            {SECTIONS.map((sec) => {
              const list = items.filter((i) => i.category === sec.key);
              return (
                <section key={sec.key} aria-labelledby={`sec-${sec.key}`} style={{ marginBottom: "1.8rem" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
                    <h2 id={`sec-${sec.key}`} style={{ margin: 0, fontFamily: SANS, fontWeight: 700, fontSize: "1.2rem", color: TEXT }}>
                      {sec.label}
                    </h2>
                    <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: "0.92rem", color: TEXT_FAINT }}>{list.length}</span>
                  </div>
                  <p style={{ margin: "0 0 10px", fontFamily: SANS, fontSize: "0.9rem", color: TEXT_FAINT, lineHeight: 1.5 }}>
                    {sec.hint}
                  </p>
                  {list.length === 0 ? (
                    <p style={{ margin: 0, fontFamily: SANS, fontSize: "0.92rem", color: TEXT_FAINT,
                      border: `1px dashed ${BORDER}`, borderRadius: 14, padding: "12px 14px" }}>
                      None yet.
                    </p>
                  ) : (
                    <ul style={{ margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                      {list.map((it) => (
                        <SchoolCard key={it.id} item={it} stats={stats} isMobile={isMobile} saving={saving.has(it.id)}
                          onSetCategory={onSetCategory} onRemove={setConfirm} />
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}

            <p style={{ margin: "0.4rem 0 0", fontFamily: SANS, fontSize: "0.85rem", color: TEXT_FAINT, lineHeight: 1.6, maxWidth: 660 }}>
              Figures are from the College Scorecard. Score ranges are the middle 50% of admitted students, and average
              net price is what students who got financial aid paid in a year, which is often far below the listed price.
              A category is a starting point, not a prediction.{" "}
              {navigate && (
                <button type="button" onClick={() => navigate("/chat")}
                  style={{ fontFamily: SANS, fontSize: "0.85rem", color: accent, fontWeight: 700, background: "none",
                    border: "none", padding: 0, cursor: "pointer", textDecoration: "underline" }}>
                  Talk your list over in Chat.
                </button>
              )}
            </p>
          </>
        )}
      </div>

      <AnimatePresence>
        {confirm && <ConfirmRemove key="confirm" name={confirm.name} onConfirm={onRemove} onClose={() => setConfirm(null)} />}
      </AnimatePresence>
    </div>
  );
}
