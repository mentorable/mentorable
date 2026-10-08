import { useCallback, useEffect, useId, useRef, useState } from "react";
import { LayoutGroup, motion, useReducedMotion } from "framer-motion";
import { requireUser } from "../lib/auth.js";
import {
  addSchool, importOnboardingNames, loadCollegeList, refreshSuggestions, removeSchool,
  restoreSuggestion, searchSchools, setCategory,
} from "../lib/collegeList.js";
import { LIST_GOAL, balance, explainItem, suggestCategory } from "../lib/collegeCategory.js";
import { readableOn } from "../lib/theme.js";
import Spinner from "../components/common/Spinner.jsx";
import { SIDEBAR_WIDTH } from "../components/common/Sidebar.jsx";
import { useIsMobile } from "../hooks/useIsMobile.js";
import { useTheme } from "../lib/ThemeContext.jsx";
import {
  BG, BORDER, DANGER, RADIUS, SANS, TEXT, TEXT_MID, TEXT_MUTED, WHITE, useAgentInk,
} from "../components/ui/tokens.js";
import { Button, Notice, PageHeader, StampTile, Tip } from "../components/ui/kit.jsx";
import { PixelStamp } from "../components/ui/PixelIcons.jsx";

// College List: the schools a student is applying to, grouped reach, target
// and likely. Built on the app's shared kit (the calm shell the Agents pages
// started), with its character in pixel stamps and the guide bubble: each
// group fills toward a goal.

const INK = TEXT;
const MID = TEXT_MID;
const LINE = BORDER;
const STONE = "#ebe8e3";         // an empty pip or tile
const STAMP = { reach: "peak", target: "target", likely: "check" };

// What each group means, said as a comparison, never as odds: the rule only
// sets scores against a school's range and admit rate. `empty` fills a group
// with nothing in it yet once the list has started.
const SECTIONS = [
  { key: "reach",  label: "Reach",  hint: "Few applicants get in, or your scores sit below their usual range.",
    empty: "None yet. A couple of schools you would love to attend belong here." },
  { key: "target", label: "Target", hint: "Your scores fit, but they turn many applicants away.",
    empty: "None yet. Most of a strong list sits here." },
  { key: "likely", label: "Likely", hint: "Your scores sit at or above their usual range, and they admit most applicants.",
    empty: "None yet. Add a couple you would be glad to attend." },
];
const LABEL = { reach: "Reach", target: "Target", likely: "Likely" };

// Orders within each group. "added" is the order the student built the list.
const SORTS = [
  { key: "added",     label: "Date added" },
  { key: "selective", label: "Most selective" },
  { key: "cost",      label: "Lowest price" },
];
const SORT_KEY = "mentorable.collegeSort";

// Card size. Past COMPACT_AFTER schools the list switches to one line per
// school unless the student has picked a size themselves.
const VIEWS = [
  { key: "cards",   label: "Full cards" },
  { key: "compact", label: "Compact" },
];
const VIEW_KEY = "mentorable.collegeView";
const COMPACT_AFTER = 8;
const byNull = (v) => (v === null || v === undefined ? Infinity : v);
function sortList(list, how) {
  if (how === "selective") return [...list].sort((a, b) => byNull(a.admission_rate) - byNull(b.admission_rate));
  if (how === "cost") return [...list].sort((a, b) => byNull(a.net_price) - byNull(b.net_price));
  return list;
}

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
function readPref(key, fallback) {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
}
function writePref(key, value) {
  try { localStorage.setItem(key, value); } catch { /* storage blocked: the choice lasts this visit */ }
}

// The focus ring is the accent darkened to 3:1 on the page grey, and the
// placeholder stays above the page's text floor.
const pageCss = (ring) => `
.cl-page :focus-visible { outline: 3px solid ${ring}; outline-offset: 2px; }
.cl-page input::placeholder { color: ${TEXT_MUTED}; opacity: 1; }
.cl-page summary { list-style: none; }
.cl-page summary::-webkit-details-marker { display: none; }
.cl-page details[open] .cl-caret { transform: rotate(90deg); }
`;

// ─── Formatting ───────────────────────────────────────────────────────────────

// Touch sizing follows the input, not the width: a tablet held in landscape is
// wider than the mobile breakpoint but still tapped with a finger.
const COARSE = "(pointer: coarse)";
function useCoarsePointer() {
  const [coarse, setCoarse] = useState(() => typeof window !== "undefined" && window.matchMedia(COARSE).matches);
  useEffect(() => {
    const mql = window.matchMedia(COARSE);
    const on = (e) => setCoarse(e.matches);
    mql.addEventListener("change", on);
    return () => mql.removeEventListener("change", on);
  }, []);
  return coarse;
}
function useTouch() {
  const coarse = useCoarsePointer();
  const narrow = useIsMobile();
  return coarse || narrow;
}

const money = (n) => `$${Number(n).toLocaleString("en-US")}`;
const ORDINAL = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];
const nth = (n) => ORDINAL[n - 1] || `${n}th`;

/** The school's facts, admit rate first, each with a plain-words meaning. */
function facts(s) {
  const out = [];
  if (s.admission_rate !== null && s.admission_rate !== undefined) {
    out.push({ text: s.admission_rate >= 1 ? "Open admission" : `${Math.round(s.admission_rate * 100)}% admitted`, lead: true,
      means: "Share of applicants who were offered a place" });
  }
  if (s.sat_25 && s.sat_75) out.push({ text: `SAT ${s.sat_25}-${s.sat_75}`, means: "Middle 50% of SAT scores among admitted students" });
  if (s.act_25 && s.act_75) out.push({ text: `ACT ${s.act_25}-${s.act_75}`, means: "Middle 50% of ACT scores among admitted students" });
  if (s.net_price !== null && s.net_price !== undefined) {
    out.push({ text: `${money(s.net_price)} avg. net price`, means: "What students on financial aid paid in a year, on average" });
  }
  if (s.enrollment) out.push({ text: `${Number(s.enrollment).toLocaleString("en-US")} undergrads`, means: "Undergraduate students enrolled" });
  return out;
}

const place = (s) => [s.city, s.state].filter(Boolean).join(", ");

/** Bring a school's card, or a group, into view and put focus on it. */
function reveal(selector, reduce) {
  const el = document.querySelector(selector);
  if (!el) return;
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
}

const SR_ONLY = { position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden",
  clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0 };

// ─── Colors ───────────────────────────────────────────────────────────────────

// The kit's accent colours, under the names this page uses: `text` reads on
// white and the page grey, `button` is the readable fill, `wash` the soft tint.
function useAccentInk() {
  const { accentRgb } = useTheme();
  const ink = useAgentInk();
  const text = readableOn(ink.accent, BG, 4.5);
  return { ...ink, accentRgb, text, ring: ink.ring, wash: ink.softer, onWash: ink.onSoft };
}
// ─── Small pieces ─────────────────────────────────────────────────────────────

/** Each group's mark, in pixels: a peak for reach, a target, a check for likely. */
function GroupIcon({ group, size = 16 }) {
  return <PixelStamp kind={STAMP[group]} size={size} />;
}

function Icon({ name, color = "currentColor", size = 18 }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: color,
    strokeWidth: 2.6, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
  if (name === "check") return <svg {...common} strokeWidth={3}><polyline points="5 12.5 10 17 19 7" /></svg>;
  if (name === "bookmark") return <svg {...common} strokeWidth={2.4}><path d="M6 3h12v18l-6-4-6 4z" /></svg>;
  if (name === "x") return <svg {...common}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>;
  if (name === "alert") return <svg {...common}><circle cx="12" cy="12" r="9.5" /><line x1="12" y1="7.5" x2="12" y2="12.5" /><line x1="12" y1="16.5" x2="12" y2="16.5" /></svg>;
  if (name === "search") return <svg {...common} strokeWidth={2.4}><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>;
  if (name === "lock") return <svg {...common} strokeWidth={2.4}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>;
  if (name === "caret") return <svg {...common} className="cl-caret" style={{ transition: "transform 0.15s" }}><polyline points="9 6 15 12 9 18" /></svg>;
  if (name === "star") return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path fill={color} d="M12 2.8l2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-2.9-5.4 2.9 1.1-6L3.2 9.2l6.1-.8L12 2.8z" />
    </svg>
  );
  return null;
}

/** A group's pixel mark on a soft tile: lit once the group has a school,
 *  grey before. It pops when it lights, the list's small reward. */
function GroupStone({ group, lit = true, size = 44 }) {
  const reduce = useReducedMotion();
  const was = useRef(lit);
  const lighting = lit && !was.current;
  useEffect(() => { was.current = lit; }, [lit]);
  return (
    <motion.span key={lit ? "lit" : "dark"} style={{ display: "inline-flex", flexShrink: 0 }}
      initial={lighting && !reduce ? { scale: 0.6 } : false}
      animate={{ scale: 1 }} transition={{ type: "spring", damping: 9, stiffness: 320 }}>
      <StampTile kind={STAMP[group]} size={size} lit={lit} />
    </motion.span>
  );
}

/** The kit's button under the page's old name: "accent" is the primary
 *  fill, "quiet" the outlined secondary. */
function Raised({ children, onClick, tone = "accent", small, full, disabled, busy, style, ...rest }) {
  return (
    <Button kind={tone === "accent" ? "primary" : "secondary"} onClick={onClick} disabled={disabled} busy={busy}
      style={{ width: full ? "100%" : undefined, fontSize: small ? "0.95rem" : "1rem", padding: small ? "8px 16px" : "10px 20px",
        flexShrink: 0, ...style }} {...rest}>
      {children}
    </Button>
  );
}

/** The kit's card: white, a 1px warm border, the shared radius. */
const card = (border = LINE) => ({
  background: WHITE, borderRadius: RADIUS.card, border: `1px solid ${border}`, boxSizing: "border-box",
});

/** The school's facts as chips. Each one is a button that shows what it
 *  means underneath, so the definitions work on touch and from the keyboard,
 *  not only on hover. `only` limits the chips (the compact card shows fewer). */
function Facts({ school, only }) {
  const ink = useAccentInk();
  const touch = useTouch();
  const base = useId();
  const [open, setOpen] = useState(null);
  const list = facts(school).filter((f, i) => !only || only.includes(i));
  if (!list.length) return null;
  const shown = list.find((f) => f.text === open);
  return (
    <div style={{ marginTop: 12 }}>
      <ul aria-label="Facts" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexWrap: "wrap", gap: 6 }}>
        {list.map((f) => {
          const on = open === f.text;
          return (
            <li key={f.text}>
              <button type="button" aria-expanded={on} aria-controls={`${base}-def`}
                onClick={() => setOpen(on ? null : f.text)}
                style={{ fontFamily: SANS, fontVariantNumeric: "tabular-nums", lineHeight: 1.3, cursor: "pointer",
                  borderRadius: 99, padding: "5px 11px", minHeight: touch ? 36 : 30, fontSize: f.lead ? "0.95rem" : "0.92rem",
                  fontWeight: f.lead ? 800 : 600, color: f.lead ? ink.onWash : MID,
                  background: f.lead ? ink.wash : "#f3f1ed", border: `1.5px solid ${on ? (f.lead ? ink.text : TEXT_MUTED) : "transparent"}` }}
                aria-label={`${f.text}. ${on ? "Hide" : "Show"} what this means.`}>
                {f.text}
              </button>
            </li>
          );
        })}
      </ul>
      <p id={`${base}-def`} aria-live="polite" style={{ margin: shown ? "8px 2px 0" : 0, fontFamily: SANS, fontSize: "0.95rem",
        fontWeight: 600, color: MID, lineHeight: 1.5 }}>
        {shown && <><span style={{ fontWeight: 800, color: INK }}>{shown.text}:</span> {shown.means}.</>}
      </p>
    </div>
  );
}

/** Reach / Target / Likely as three raised tiles, each a toggle button. The
 *  pressed one shows a spinner while its save is on the way. */
function CategoryPicker({ value, onChange, saving, label, stretch }) {
  const ink = useAccentInk();
  const touch = useTouch();
  return (
    <div role="group" aria-label={label} aria-busy={saving || undefined} style={{ display: "flex", gap: 6, flex: stretch ? 1 : undefined }}>
      {SECTIONS.map((s) => {
        const on = value === s.key;
        return (
          // aria-disabled, not disabled: a disabled button cannot hold focus,
          // and focus moves here while the save that disables it runs.
          <button key={s.key} type="button" aria-pressed={on} aria-disabled={saving || undefined}
            onClick={() => !on && !saving && onChange(s.key)}
            style={{ flex: stretch ? 1 : undefined, fontFamily: SANS, fontSize: "0.92rem", fontWeight: 800,
              cursor: on || saving ? "default" : "pointer", padding: "0 12px", minHeight: touch ? 44 : 38,
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
              borderRadius: RADIUS.control, border: `1.5px solid ${on ? ink.text : LINE}`, background: on ? ink.wash : WHITE,
              color: on ? ink.onWash : MID }}>
            {on && saving && <Spinner size={13} color={ink.text} />}
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

/** A note: the kit's Notice, with an action beside the text. */
function Banner({ error, children, action, onDismiss }) {
  return (
    <Notice tone={error ? "error" : "info"} onDismiss={onDismiss} action={action} style={{ background: error ? undefined : WHITE }}>
      {children}
    </Notice>
  );
}

// ─── The scoreboard ───────────────────────────────────────────────────────────

/** The three groups as raised tiles, each filling toward its goal and each a
 *  jump to its group. */
function Scoreboard({ counts, isMobile, reduce }) {
  const ink = useAccentInk();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <nav aria-label="Your list by group" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        gap: isMobile ? 8 : 12 }}>
        {SECTIONS.map((s) => {
          const n = counts[s.key];
          const goal = LIST_GOAL[s.key];
          return (
            <button key={s.key} type="button" onClick={() => reveal(`#sec-${s.key}`, reduce)}
              aria-label={`${n} ${s.label}, goal ${goal}. Go to ${s.label}.`}
              style={{ ...card(n > 0 ? ink.soft : LINE), cursor: "pointer", padding: isMobile ? "12px 6px" : "14px 16px",
                display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: "center",
                gap: isMobile ? 6 : 14, textAlign: isMobile ? "center" : "left" }}>
              <GroupStone group={s.key} lit={n > 0} size={isMobile ? 38 : 46} />
              <span style={{ minWidth: 0, display: "flex", flexDirection: "column", alignItems: isMobile ? "center" : "flex-start" }}>
                <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: isMobile ? "1.05rem" : "1.15rem", color: INK, lineHeight: 1.2 }}>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>{n}</span> {s.label}
                </span>
                {/* One pixel per school toward the goal; extras show as +n. */}
                <span aria-hidden="true" style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 6 }}>
                  {Array.from({ length: goal }, (_, i) => (
                    <span key={i} style={{ width: isMobile ? 10 : 12, height: isMobile ? 10 : 12,
                      background: i < n ? ink.button.bg : STONE }} />
                  ))}
                  {n > goal && (
                    <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: "0.9rem", color: MID, marginLeft: 2 }}>+{n - goal}</span>
                  )}
                </span>
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

/** The list's next step as plain text: the shape to aim for on
 *  an empty list, what each group still needs while the goal pips are filling,
 *  and the balance note (a list too low matters as much as one too high).
 *  No badge: reaching the goal is just a calm line. */
function NextStep({ counts }) {
  const plural = (key, n) => (n === 1 ? key : { reach: "reaches", target: "targets", likely: "likelies" }[key]);
  const missing = SECTIONS.map((s) => ({ ...s, n: Math.max(0, LIST_GOAL[s.key] - counts[s.key]) })).filter((s) => s.n);
  const shape = SECTIONS.map((s) => `${LIST_GOAL[s.key]} ${plural(s.key, LIST_GOAL[s.key])}`);
  let title, detail;
  if (counts.total === 0) {
    title = `Aim for ${shape[0]}, ${shape[1]} and ${shape[2]}.`;
    detail = "Search for a school below and it lands in one of the three groups, with the reason why. Every one should be a school you would be glad to attend.";
  } else if (missing.length) {
    const parts = missing.map((s) => `${s.n} more ${plural(s.key, s.n)}`);
    title = `Add ${parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0]}.`;
    detail = counts.note || "Each one a school you would be glad to attend.";
  } else {
    title = counts.note ? "Almost there." : "Every group has reached its goal.";
    detail = counts.note || "Keep every school on it one you would be glad to attend.";
  }
  return (
    <p style={{ margin: 0, fontFamily: SANS, lineHeight: 1.5, color: INK }}>
      <span style={{ display: "block", fontWeight: 800, fontSize: "1.05rem" }}>{title}</span>
      <span style={{ display: "block", marginTop: 2, color: MID }}>{detail}</span>
    </p>
  );
}

/** How the page sorts schools and what its numbers mean, one tap away. */
function HowItWorks({ navigate }) {
  const ink = useAccentInk();
  return (
    <details style={{ fontFamily: SANS }}>
      <summary style={{ display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer", fontWeight: 800,
        fontSize: "0.95rem", color: ink.text, padding: "6px 0", minHeight: 32 }}>
        <Icon name="caret" color={ink.text} size={16} /> How we sort schools
      </summary>
      <div style={{ ...card(), padding: "14px 18px", marginTop: 8, fontSize: "0.98rem", color: MID, lineHeight: 1.6, maxWidth: "62ch" }}>
        <p style={{ margin: "0 0 8px" }}>
          Each school is sorted by comparing your best SAT or ACT with the middle 50% of scores among students the
          school admitted, along with its admit rate. Anything admitting under 20% is a reach for everyone. With no
          score to compare, it is a rough guess from the admit rate and your GPA, shown in italics.
        </p>
        <p style={{ margin: "0 0 8px" }}>
          Average net price is what students on financial aid paid in a year, often far below the listed price.
          All figures come from the College Scorecard.
        </p>
        <p style={{ margin: 0 }}>
          A category is a starting point, not a prediction, and you can move any school.{" "}
          {navigate && (
            <button type="button" onClick={() => navigate("/chat")}
              style={{ fontFamily: SANS, fontSize: "0.98rem", color: ink.text, fontWeight: 800, background: "none",
                border: "none", padding: 0, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3 }}>
              Talk your list over in Chat.
            </button>
          )}
        </p>
      </div>
    </details>
  );
}

// ─── A school on the list ─────────────────────────────────────────────────────

/** Why the school sits where it does, and the card's lead line. A school the
 *  student sorted keeps our suggestion beside theirs, with a way back to it. */
function Reason({ item, stats, onRestore, saving }) {
  const ink = useAccentInk();
  const lead = { margin: "10px 0 0", fontFamily: SANS, lineHeight: 1.5, fontWeight: 600, fontSize: "1.05rem", color: INK };
  if (item.category_source !== "student") {
    const why = explainItem(item, stats);
    if (!why) return null;
    const rough = item.category_source === "rough";
    return (
      <p style={rough ? { ...lead, fontWeight: 500, fontSize: "1rem", color: TEXT_MUTED, fontStyle: "italic" } : lead}>
        {why}
      </p>
    );
  }
  const rule = suggestCategory(stats, item);
  const agrees = rule?.category === item.category;
  return (
    <>
      <p style={lead}>You put this in {LABEL[item.category]}{agrees ? ", which matches your scores." : "."}</p>
      {rule && !agrees && (
        <p style={{ margin: "4px 0 0", fontFamily: SANS, fontSize: "0.95rem", fontWeight: 500, color: TEXT_MUTED,
          lineHeight: 1.5, fontStyle: rule.source === "rough" ? "italic" : "normal" }}>
          Based on your scores we would say {LABEL[rule.category]}. {rule.reason.replace(/^Rough guess\. /, "")}{" "}
          <button type="button" onClick={() => !saving && onRestore(item, rule)} aria-disabled={saving || undefined}
            style={{ fontFamily: SANS, fontSize: "0.95rem", fontWeight: 800, fontStyle: "normal", color: ink.text,
              background: "none", border: "none", padding: "4px 0", cursor: saving ? "default" : "pointer",
              textDecoration: "underline", textUnderlineOffset: 3 }}>
            Move it to {LABEL[rule.category]}
          </button>
        </p>
      )}
    </>
  );
}

function SchoolCard({ item, stats, onSetCategory, onRestore, onRemove, isMobile, saving, flash, compact }) {
  const ink = useAccentInk();
  const reduce = useReducedMotion();
  const touch = useTouch();
  const size = touch ? 44 : 38;
  const [why, setWhy] = useState(false);
  const whyId = useId();
  const motionProps = {
    layoutId: reduce ? undefined : `school-${item.id}`,
    initial: flash ? { backgroundColor: `rgba(${ink.accentRgb},0.16)`, ...(reduce ? {} : { scale: 0.97 }) } : false,
    animate: { backgroundColor: "rgba(255,255,255,1)", scale: 1 },
    transition: { layout: { duration: 0.45, ease: [0.22, 1, 0.36, 1] }, backgroundColor: { duration: 1.6, ease: "easeOut" },
      scale: { type: "spring", damping: 16, stiffness: 300 } },
  };
  const remove = (
    <button type="button" onClick={() => onRemove(item)} aria-label={`Remove ${item.name}`}
      style={{ flexShrink: 0, height: size, minWidth: size, padding: isMobile || compact ? 0 : "0 10px",
        marginTop: compact ? 0 : -4, marginRight: -6, borderRadius: 12, border: "none", background: "none", cursor: "pointer",
        color: MID, fontFamily: SANS, fontWeight: 800, fontSize: "0.92rem",
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}
      onMouseEnter={(e) => { e.currentTarget.style.color = DANGER; e.currentTarget.style.background = "#f6f6f4"; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = MID; e.currentTarget.style.background = "none"; }}>
      <Icon name="x" size={15} />{!isMobile && !compact && "Remove"}
    </button>
  );
  const picker = (
    <CategoryPicker value={item.category} onChange={(c) => onSetCategory(item, c)} saving={saving} stretch={isMobile}
      label={`Category for ${item.name}`} />
  );

  // The compact card, for long lists: one line per school with the admit rate
  // and the category, and the reason and facts one tap away under "Why?".
  if (compact) {
    const lead = facts(item)[0];
    return (
      <motion.li data-school={item.id} tabIndex={-1} {...motionProps}
        style={{ ...card(), padding: isMobile ? "10px 12px 12px" : "10px 12px 10px 16px", listStyle: "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ margin: 0, fontFamily: SANS, fontWeight: 800, fontSize: "1.05rem", color: INK, lineHeight: 1.3,
              overflowWrap: "anywhere" }}>
              {item.name}
            </h3>
            <p style={{ margin: "1px 0 0", fontFamily: SANS, fontSize: "0.92rem", fontWeight: 600, color: TEXT_MUTED,
              fontVariantNumeric: "tabular-nums" }}>
              {[place(item), lead?.lead ? lead.text : null].filter(Boolean).join(" · ")}
            </p>
          </div>
          {!isMobile && picker}
          <button type="button" aria-expanded={why} aria-controls={whyId} onClick={() => setWhy((w) => !w)}
            style={{ flexShrink: 0, minHeight: size, padding: "0 8px", borderRadius: 12, border: "none", background: "none",
              cursor: "pointer", fontFamily: SANS, fontWeight: 800, fontSize: "0.92rem", color: ink.text,
              display: "inline-flex", alignItems: "center", gap: 2 }}>
            <span style={{ display: "inline-flex", transform: why ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>
              <Icon name="caret" color={ink.text} size={14} />
            </span>
            Why<span style={SR_ONLY}> {item.name} is in {LABEL[item.category]}</span>
          </button>
          {remove}
        </div>
        {isMobile && <div style={{ display: "flex", marginTop: 10 }}>{picker}</div>}
        <div id={whyId} hidden={!why} style={{ borderTop: why ? `1px solid ${LINE}` : "none", marginTop: why ? 10 : 0,
          paddingBottom: why ? 4 : 0 }}>
          {why && (
            <>
              <Reason item={item} stats={stats} onRestore={onRestore} saving={saving} />
              <Facts school={item} />
            </>
          )}
        </div>
      </motion.li>
    );
  }

  return (
    // layoutId carries the card from its old group to its new one when the
    // category changes, so the student sees where it went.
    <motion.li data-school={item.id} tabIndex={-1} {...motionProps}
      style={{ ...card(), padding: isMobile ? "14px 14px 12px" : "16px 18px 14px", listStyle: "none" }}>
      {/* Remove sits at the top, apart from the category tiles, so a slip
          on Likely cannot take a school off the list. */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ margin: 0, fontFamily: SANS, fontWeight: 800, fontSize: isMobile ? "1.2rem" : "1.3rem", color: INK,
            lineHeight: 1.25, letterSpacing: "-0.01em", overflowWrap: "anywhere" }}>
            {item.name}
          </h3>
          {place(item) && (
            <p style={{ margin: "3px 0 0", fontFamily: SANS, fontSize: "0.95rem", fontWeight: 600, color: TEXT_MUTED }}>{place(item)}</p>
          )}
        </div>
        {remove}
      </div>
      <Reason item={item} stats={stats} onRestore={onRestore} saving={saving} />
      <Facts school={item} />
      <div style={{ display: "flex", marginTop: 14, paddingTop: 12, borderTop: `1px solid ${LINE}` }}>{picker}</div>
    </motion.li>
  );
}

// ─── Search and add ───────────────────────────────────────────────────────────

function SearchResult({ school, stats, counts, onList, adding, onAdd, first }) {
  const ink = useAccentInk();
  const suggestion = suggestCategory(stats, school);
  // What this add would do to the list, so the balance is visible before it changes.
  const after = suggestion ? counts[suggestion.category] + 1 : null;
  return (
    <li style={{ listStyle: "none", padding: "14px 0", borderTop: first ? "none" : `1px solid ${LINE}`,
      display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <p style={{ margin: 0, fontFamily: SANS, fontWeight: 800, fontSize: "1.1rem", color: INK, overflowWrap: "anywhere" }}>
          {school.name}
        </p>
        <p style={{ margin: "3px 0 0", fontFamily: SANS, fontSize: "0.95rem", fontWeight: 600, color: TEXT_MUTED,
          fontVariantNumeric: "tabular-nums" }}>
          {[place(school), facts(school)[0]?.text].filter(Boolean).join(" · ")}
        </p>
        {suggestion && !onList && (
          <p style={{ margin: "3px 0 0", fontFamily: SANS, fontSize: "0.95rem", fontWeight: 600, color: MID,
            fontStyle: suggestion.source === "rough" ? "italic" : "normal" }}>
            Would be your {nth(after)} {LABEL[suggestion.category].toLowerCase()}
            {suggestion.source === "rough" ? ", a rough guess without a score range." : "."}
          </p>
        )}
      </div>
      {onList ? (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: SANS, fontSize: "0.95rem",
          fontWeight: 800, color: MID, background: "#f1f1ef", borderRadius: 99, padding: "6px 12px" }}>
          <Icon name="bookmark" size={16} /> On your list
        </span>
      ) : adding ? (
        <span role="status" style={{ display: "inline-flex", alignItems: "center", minHeight: 40, padding: "0 12px" }}>
          <Spinner size={20} color={ink.accent} /><span style={SR_ONLY}>Adding {school.name}</span>
        </span>
      ) : suggestion ? (
        <Raised small onClick={() => onAdd(school)}>
          <GroupIcon group={suggestion.category} size={16} /> Add as {LABEL[suggestion.category]}
        </Raised>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontFamily: SANS, fontSize: "0.95rem", fontWeight: 600, color: TEXT_MUTED }}>No admit rate published. Add as:</span>
          <CategoryPicker value={null} onChange={(c) => onAdd(school, c)} label={`Add ${school.name} as`} />
        </div>
      )}
    </li>
  );
}

/** The search, the page's main action: the one accent-edged card, like
 *  Quest's card for today. With nothing on the list yet it says what to do. */
function AddSchool({ api, stats, items, counts, onAdded, intro }) {
  const ink = useAccentInk();
  const isMobile = useIsMobile();
  const reduce = useReducedMotion();
  const inputRef = useRef(null);
  const [query, setQuery] = useState("");
  const [attempt, setAttempt] = useState(0);   // bumped by "Try again" to rerun the same search
  const [results, setResults] = useState(null);   // null: nothing searched yet
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(null);
  const [adding, setAdding] = useState(() => new Set());   // scorecard_ids being added
  const [added, setAdded] = useState(null);   // { id, name, category } of the last school added
  const latest = useRef(0);
  const seeIt = useRef(null);
  // The "Add as" button is gone once the school is on the list, so focus
  // moves to the confirmation's link rather than falling back to <body>.
  useEffect(() => { if (added) seeIt.current?.focus(); }, [added]);

  // "/" jumps to the search from anywhere on the page, as on most search-led tools.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reduce]);

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
        setResults(null);
        setError(e?.code === "NOT_CONFIGURED" ? "School search is not set up yet." : "School search is not responding right now.");
      } finally {
        if (ticket === latest.current) setSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [query, attempt, api]);

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
    <div style={{ ...card(ink.soft), borderWidth: 1.5, padding: isMobile ? "16px 14px 16px" : "18px 20px 20px" }}>
      <label htmlFor="college-search" style={{ display: "block", fontFamily: SANS, fontWeight: 800,
        fontSize: "1.15rem", color: INK, marginBottom: intro ? 4 : 10 }}>
        Add a school
      </label>
      {intro && (
        <p style={{ margin: "0 0 12px", fontFamily: SANS, fontSize: "1rem", fontWeight: 500, color: MID, lineHeight: 1.55 }}>
          {intro}
        </p>
      )}
      <div style={{ position: "relative" }}>
        <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", display: "flex" }}>
          <Icon name="search" color={TEXT_MUTED} size={18} />
        </span>
        <input id="college-search" ref={inputRef} type="search" value={query} autoComplete="off" aria-keyshortcuts="/"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") setQuery(""); }}
          placeholder={isMobile ? "Search, like Michigan or NYU" : "Search by name, like Michigan or NYU"}
          style={{ width: "100%", boxSizing: "border-box", fontFamily: SANS, fontSize: "1rem", fontWeight: 600, color: INK,
            border: `1.5px solid ${LINE}`, borderRadius: RADIUS.control, padding: isMobile ? "12px 14px 12px 42px" : "12px 44px 12px 42px",
            outline: "none", background: WHITE, transition: "border-color 0.15s, box-shadow 0.15s" }}
          // The focus ring is the one cue a keyboard user has here, so it
          // uses the accent darkened to 3:1, plus a soft halo.
          onFocus={(e) => { e.target.style.borderColor = ink.ring; e.target.style.boxShadow = `0 0 0 3px rgba(${ink.accentRgb},0.22)`; }}
          onBlur={(e) => { e.target.style.borderColor = LINE; e.target.style.boxShadow = "none"; }} />
        {!isMobile && !query && (
          <kbd aria-hidden="true" style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
            fontFamily: SANS, fontWeight: 800, fontSize: "0.9rem", color: MID, background: "#f1f1ef",
            border: `1px solid ${LINE}`, borderRadius: 7, padding: "0 7px", lineHeight: 1.5 }}>/</kbd>
        )}
      </div>

      <div aria-live="polite">
        {searching && (
          <p style={{ display: "flex", alignItems: "center", gap: 8, margin: "12px 2px 0", fontFamily: SANS,
            fontSize: "0.95rem", fontWeight: 600, color: TEXT_MUTED }}>
            <Spinner size={14} color={ink.accent} /> Searching...
          </p>
        )}
        {!searching && error && (
          <div role="alert" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", margin: "12px 2px 0" }}>
            <Icon name="alert" color={DANGER} size={18} />
            <span style={{ flex: "1 1 200px", fontFamily: SANS, fontSize: "0.98rem", fontWeight: 700, color: DANGER }}>{error}</span>
            {query.trim().length >= 2 && <Raised small tone="quiet" onClick={() => setAttempt((a) => a + 1)}>Try again</Raised>}
          </div>
        )}
        {!searching && results && results.length === 0 && (
          <p style={{ margin: "12px 2px 0", fontFamily: SANS, fontSize: "1rem", fontWeight: 600, color: TEXT_MUTED }}>
            No schools found. Try the full official name, like University of Michigan.
          </p>
        )}
        {!searching && results && results.length > 0 && !added && (
          <p style={SR_ONLY}>{results.length} {results.length === 1 ? "school" : "schools"} found.</p>
        )}
        {added && (
          <p style={{ display: "flex", alignItems: "flex-start", gap: 8, margin: "12px 2px 0",
            fontFamily: SANS, fontSize: "1rem", fontWeight: 700, color: INK, lineHeight: 1.5 }}>
            <span style={{ flexShrink: 0, marginTop: 2, display: "flex" }}><Icon name="check" color={ink.text} size={20} /></span>
            <span style={{ overflowWrap: "anywhere" }}>
              Added {added.name} to {LABEL[added.category]}.{" "}
              <button type="button" ref={seeIt} onClick={() => { const id = added.id; setQuery(""); reveal(`[data-school="${id}"]`, reduce); }}
                style={{ fontFamily: SANS, fontSize: "1rem", fontWeight: 800, color: ink.text, background: "none",
                  border: "none", padding: "4px 2px", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3 }}>
                See it on your list
              </button>
            </span>
          </p>
        )}
      </div>

      {!searching && results && results.length > 0 && (
        <ul style={{ margin: "6px 0 -6px", padding: 0 }}>
          {results.map((s, i) => (
            <SearchResult key={s.scorecard_id} school={s} stats={stats} counts={counts} first={i === 0}
              onList={onList.has(s.scorecard_id)} adding={adding.has(s.scorecard_id)} onAdd={add} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** A labelled row of raised chips, one of them chosen: the order within
 *  groups, and the card size. On a phone the chips share the row evenly. */
function ChipChoice({ label, options, value, onChange }) {
  const ink = useAccentInk();
  const touch = useTouch();
  const isMobile = useIsMobile();
  return (
    <div role="group" aria-label={label}
      style={isMobile ? { display: "grid", gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`, gap: 8 }
        : { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span style={isMobile ? SR_ONLY : { fontFamily: SANS, fontWeight: 700, fontSize: "0.95rem", color: MID }}>{label}</span>
      {options.map((s) => {
        const on = value === s.key;
        return (
          <button key={s.key} type="button" aria-pressed={on} onClick={() => onChange(s.key)}
            style={{ fontFamily: SANS, fontWeight: 700, fontSize: "0.92rem", cursor: "pointer", borderRadius: RADIUS.pill,
              padding: isMobile ? "4px 8px" : "0 14px", minHeight: touch ? 44 : 36, lineHeight: 1.2, border: `1.5px solid ${on ? ink.text : LINE}`,
              background: on ? ink.wash : WHITE, color: on ? ink.onWash : MID }}>
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

function Skeleton({ isMobile }) {
  const block = (h, w = "100%") => ({ height: h, width: w, borderRadius: RADIUS.card, background: "#ebe8e3" });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 18 : 22 }}>
      <div style={block(36, 220)} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {[0, 1, 2].map((i) => <div key={i} style={block(isMobile ? 96 : 78)} />)}
      </div>
      <div style={block(120)} />
      <div style={block(190)} />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CollegeListPage({ navigate, api = REAL_API }) {
  const isMobile = useIsMobile();
  const ink = useAccentInk();
  const [phase, setPhase] = useState("loading");
  const [userId, setUserId] = useState(null);
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState({ sat: null, act: null, gpa: null });
  const [onboardingNames, setOnboardingNames] = useState([]);
  const [notice, setNotice] = useState(null);   // { text, error, action: { label, run } }
  const [importing, setImporting] = useState(null);   // the name being looked up
  const [importDone, setImportDone] = useState(false);
  const [saving, setSaving] = useState(() => new Set());   // ids whose category is being saved
  const [flash, setFlash] = useState(null);   // id of the card that just moved or arrived
  const [sort, setSort] = useState(() => readPref(SORT_KEY, "added"));
  const [view, setView] = useState(() => readPref(VIEW_KEY, ""));   // "" until the student picks
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
    // Centered, so the bottom toast that follows a move never covers it.
    el.closest("li, section")?.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
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
      // A new score or GPA can move a suggested school; say which when it does.
      // If that update fails, the list as saved is still worth showing.
      let fresh = data.items;
      try {
        ({ items: fresh } = await api.refresh(data.items, data.stats));
      } catch (e) {
        console.warn("[college list] refresh failed:", e);
      }
      setItems(fresh);
      const before = new Map(data.items.map((i) => [i.id, i.category]));
      const moved = fresh.filter((i) => before.has(i.id) && before.get(i.id) !== i.category);
      if (moved.length) {
        const named = moved.slice(0, 3).map((i) => `${i.name} to ${LABEL[i.category]}`).join(", ");
        const more = moved.length > 3 ? `, and ${moved.length - 3} more` : "";
        setNotice({ text: `Updated to match your latest scores: moved ${named}${more}.` });
      }
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
    setFlash(row.id);
    return row;
  }, [api, userId, stats]);

  // One save per school at a time, so two quick taps cannot land out of order.
  // `rule` set means handing the school back to our suggestion. Every move
  // offers Undo, which puts the school back exactly as it was.
  const move = async (item, category, rule = null, undoing = false) => {
    if (saving.has(item.id)) return;
    const before = item;
    const moved = category !== item.category;
    setNotice(null);
    setSaving((prev) => new Set(prev).add(item.id));
    setItems((prev) => prev.map((i) => (i.id === item.id
      ? { ...i, category, category_source: rule ? rule.source : "student" } : i)));
    if (moved) setFlash(item.id);
    focusNext.current = `[data-school="${item.id}"] [aria-pressed="true"]`;
    try {
      const saved = rule ? await api.restore(item.id, rule) : await api.setCategory(item.id, category);
      setItems((prev) => prev.map((i) => (i.id === item.id ? saved : i)));
      if (moved) {
        const back = before.category_source === "student" ? null : { category: before.category, source: before.category_source };
        setNotice(undoing
          ? { text: `${item.name} is back in ${LABEL[category]}.` }
          : { text: `Moved ${item.name} to ${LABEL[category]}.`,
              action: { label: "Undo", run: () => move(saved, before.category, back, true) } });
      }
    } catch {
      setItems((prev) => prev.map((i) => (i.id === item.id ? before : i)));
      focusNext.current = `[data-school="${item.id}"] [aria-pressed="true"]`;
      setNotice({ error: true, text: `Could not move ${item.name} to ${LABEL[category]}. It is still in ${LABEL[before.category]}.`,
        action: { label: "Try again", run: () => move(before, category, rule) } });
    } finally {
      setSaving((prev) => { const next = new Set(prev); next.delete(item.id); return next; });
    }
  };
  const onSetCategory = (item, category) => move(item, category);
  const onRestore = (item, rule) => move(item, rule.category, rule);

  // Remove at once and offer Undo, rather than asking first: the school comes
  // back as it was, by adding it again with the same category.
  const undoRemove = async (item) => {
    setNotice(null);
    try {
      const row = await api.add(userId, item, stats, item.category_source === "student" ? item.category : null);
      setItems((prev) => [...prev, row]);
      setFlash(row.id);
      setNotice({ text: `${item.name} is back in ${LABEL[row.category]}.` });
      focusNext.current = `[data-school="${row.id}"]`;
    } catch {
      setNotice({ error: true, text: `Could not bring back ${item.name}.`,
        action: { label: "Try again", run: () => undoRemove(item) } });
    }
  };
  const onRemove = async (item) => {
    // Focus lands on the next school in the same group, or the one before,
    // or the group's heading when it was the last.
    const group = sortList(items.filter((i) => i.category === item.category), sort);
    const at = group.findIndex((i) => i.id === item.id);
    const neighbour = group[at + 1] || group[at - 1];
    try {
      await api.remove(item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      focusNext.current = neighbour ? `[data-school="${neighbour.id}"]` : `#sec-${item.category}`;
      setNotice({ text: `Removed ${item.name}.`, action: { label: "Undo", run: () => undoRemove(item) } });
    } catch {
      setNotice({ error: true, text: `Could not remove ${item.name}. It is still on your list.`,
        action: { label: "Try again", run: () => onRemove(item) } });
    }
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
      setNotice({ text: e.message, error: true, action: { label: "Try again", run: runImport } });
    } finally {
      setImporting(null);
    }
  };

  const skipImport = () => { writeFlag(IMPORT_KEY(userId)); setImportDone(true); };
  const chooseSort = (key) => { setSort(key); writePref(SORT_KEY, key); };
  const chooseView = (key) => { setView(key); writePref(VIEW_KEY, key); };
  const compact = view ? view === "compact" : items.length > COMPACT_AFTER;

  // Undo is a toast away from the card that changed, so it has a shortcut:
  // Ctrl+Z (Cmd+Z on a Mac) while the toast offers it, outside text fields.
  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  useEffect(() => {
    if (notice?.action?.label !== "Undo") return undefined;
    const onKey = (e) => {
      if (e.key.toLowerCase() !== "z" || e.shiftKey || !(mac ? e.metaKey : e.ctrlKey)) return;
      const t = e.target;
      if (t instanceof HTMLElement && /^(INPUT|TEXTAREA)$/.test(t.tagName)) return;
      e.preventDefault();
      notice.action.run();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [notice, mac]);

  const pagePad = {
    minHeight: "100vh", background: BG, fontFamily: SANS, boxSizing: "border-box",
    padding: isMobile ? "1.25rem 1rem 6rem" : "2.25rem 2rem 4rem",
    paddingLeft: isMobile ? "1rem" : `calc(${SIDEBAR_WIDTH}px + 2rem)`,
  };
  const column = { maxWidth: 880, margin: "0 auto", width: "100%" };

  if (phase === "loading") {
    return (
      <div data-sidebar-offset role="status" style={pagePad}>
        <span style={SR_ONLY}>Loading your college list</span>
        <div style={column} aria-hidden="true"><Skeleton isMobile={isMobile} /></div>
      </div>
    );
  }
  if (phase === "error") {
    return (
      <div data-sidebar-offset className="cl-page" style={{ ...pagePad, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <style>{pageCss(ink.ring)}</style>
        <div style={{ ...card(), textAlign: "center", maxWidth: 420, padding: "1.6rem" }}>
          <h1 style={{ fontFamily: SANS, fontSize: "1.2rem", fontWeight: 800, color: INK, margin: "0 0 8px" }}>
            We could not load your college list
          </h1>
          <p style={{ fontFamily: SANS, fontSize: "1rem", color: MID, lineHeight: 1.6, margin: "0 0 1.3rem" }}>
            Nothing has been lost. Give it another go in a moment.
          </p>
          <Raised onClick={load}>Try again</Raised>
        </div>
      </div>
    );
  }

  const b = balance(items);
  const empty = items.length === 0;
  const offerImport = empty && onboardingNames.length > 0 && !importDone;
  const search = (
    <AddSchool api={api} stats={stats} items={items} counts={b} onAdded={onAdded}
      intro={empty ? "A strong list has a few of each group. Search for a school and it lands in Reach, Target or Likely, with the reason why. You can move it any time." : null} />
  );

  return (
    <div data-sidebar-offset className="cl-page" style={pagePad}>
      <style>{pageCss(ink.ring)}</style>
      <div style={{ ...column, display: "flex", flexDirection: "column", gap: isMobile ? 18 : 22 }}>
        <PageHeader title="College List" isMobile={isMobile} style={{ margin: 0 }}>
          The schools you are applying to, grouped by how your scores compare with the students each one admits.
          Admit rates, score ranges and costs come from the U.S. Department of Education.
          <div style={{ marginTop: 6 }}><HowItWorks navigate={navigate} /></div>
        </PageHeader>

        {offerImport && (
          <Tip name="Start here" stamp="scroll" style={{ paddingTop: 0 }}>
            <strong style={{ fontWeight: 800 }}>Start with the schools you already named.</strong>{" "}
            When you signed up you mentioned {onboardingNames.join(", ")}. We can look them up and sort them for you.
            {importing ? (
              <span role="status" style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 10, fontWeight: 700, color: MID }}>
                <Spinner size={16} color={ink.accent} /> Looking up {importing}...
              </span>
            ) : (
              <span style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
                <Raised small onClick={runImport}>Add them to my list</Raised>
                <Raised small tone="quiet" onClick={skipImport}>No thanks</Raised>
              </span>
            )}
          </Tip>
        )}

        {/* An empty list leads with the search; once there are schools, the
            scoreboard leads and the search follows. */}
        {empty && search}

        <Scoreboard counts={b} isMobile={isMobile} reduce={reduce} />

        {/* The import offer already says "Start here" for a brand-new list. */}
        {!(empty && offerImport) && <NextStep counts={b} />}

        {!empty && search}

        {/* Notices float at the bottom of the screen, so "Removed X. Undo" is
            in view wherever the card was, above the mobile nav. */}
        <div aria-live="polite" style={{ position: "fixed", zIndex: 300, pointerEvents: "none", display: "flex", justifyContent: "center",
          left: isMobile ? 12 : SIDEBAR_WIDTH + 16, right: 12,
          bottom: isMobile ? "calc(60px + env(safe-area-inset-bottom, 0px) + 12px)" : 24 }}>
          {notice && (
            <div style={{ width: "100%", maxWidth: 560, pointerEvents: "auto", borderRadius: RADIUS.control,
              boxShadow: "0 14px 36px rgba(20,20,19,0.16)" }}>
              <Banner error={notice.error} onDismiss={() => setNotice(null)}
                action={notice.action && (
                  <Raised small tone="quiet" onClick={notice.action.run}
                    aria-keyshortcuts={notice.action.label === "Undo" ? (mac ? "Meta+Z" : "Control+Z") : undefined}>
                    {notice.action.label}
                    {notice.action.label === "Undo" && !isMobile && (
                      <span style={{ fontWeight: 700, color: MID }}>{mac ? "⌘Z" : "Ctrl+Z"}</span>
                    )}
                  </Raised>
                )}>
                {notice.text}
              </Banner>
            </div>
          )}
        </div>


        {items.length > 1 && (
          <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", flexWrap: "wrap",
            justifyContent: "space-between", gap: isMobile ? 10 : 14 }}>
            <ChipChoice label="Order" options={SORTS} value={sort} onChange={chooseSort} />
            <ChipChoice label="Cards" options={VIEWS} value={compact ? "compact" : "cards"} onChange={chooseView} />
          </div>
        )}

        <LayoutGroup>
          {SECTIONS.map((sec) => {
            const list = sortList(items.filter((i) => i.category === sec.key), sort);
            return (
              <section key={sec.key} aria-labelledby={`sec-${sec.key}`} style={{ scrollMarginTop: 24 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: empty ? 0 : 12 }}>
                  <GroupStone group={sec.key} lit={list.length > 0} size={isMobile ? 40 : 46} />
                  <div style={{ minWidth: 0 }}>
                    <h2 id={`sec-${sec.key}`} tabIndex={-1} style={{ margin: 0, fontFamily: SANS, fontWeight: 800, color: INK,
                      fontSize: isMobile ? "1.35rem" : "1.5rem", letterSpacing: "-0.01em" }}>
                      {sec.label}
                    </h2>
                    <p style={{ margin: "2px 0 0", fontFamily: SANS, fontSize: "1rem", fontWeight: 600, color: MID, lineHeight: 1.45 }}>
                      {sec.hint}
                    </p>
                  </div>
                </div>
                {empty ? null : list.length === 0 ? (
                  <p style={{ margin: 0, fontFamily: SANS, fontSize: "1rem", fontWeight: 600, color: TEXT_MUTED, lineHeight: 1.5,
                    border: `1px dashed ${LINE}`, borderRadius: RADIUS.card, padding: "16px 18px", background: WHITE }}>
                    {sec.empty}
                  </p>
                ) : (
                  <ul style={{ margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: compact ? 10 : 14 }}>
                    {list.map((it) => (
                      <SchoolCard key={it.id} item={it} stats={stats} isMobile={isMobile} saving={saving.has(it.id)} compact={compact}
                        flash={flash === it.id} onSetCategory={onSetCategory} onRestore={onRestore} onRemove={onRemove} />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </LayoutGroup>
      </div>
    </div>
  );
}
