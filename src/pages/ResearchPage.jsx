import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../lib/supabase.js";
import { getKnownUserId, setKnownUserId } from "../lib/cache.js";
import { getActiveResearch, setActiveResearch } from "../lib/liveState.js";
import { SIDEBAR_WIDTH } from "../components/common/Sidebar.jsx";
import { fetchUsage, LIMITS } from "../lib/usage.js";
import LimitModal from "../components/common/LimitModal.jsx";
import Drawer from "../components/common/Drawer.jsx";
import { useIsMobile } from "../hooks/useIsMobile.js";

const FONT   = "'Space Grotesk', sans-serif";
const LANGGRAPH_URL = import.meta.env.VITE_LANGGRAPH_CHAT_URL; // reuse same base URL
const BODY   = "'Space Grotesk', sans-serif";
const NAVY   = "#141413";
const BLUE   = "#1d4ed8";
const BLUE_MID = "#3b82f6";
const BLUE_SOFT = "#dbeafe";
const BLUE_TINT = "#eff6ff";
const SESSIONS_W = 256;

// ─── Constants ────────────────────────────────────────────────────────────────

const LOADING_STEPS = [
  "Breaking down your query…",
  "Searching across multiple angles…",
  "Synthesizing results…",
  "Reading opportunity pages…",
  "Building your strategy…",
];

const EXAMPLE_CHIPS = [
  "Summer programs for high school students",
  "Internships open to high schoolers",
  "Scholarships I can apply for in high school",
  "Academic competitions to enter this year",
  "Free online courses to build a new skill",
  "How to start a project that stands out on applications",
];

const TYPE_META = {
  competition: { label: "Competition", color: "#0369a1", bg: "rgba(3,105,161,0.08)",  border: "rgba(3,105,161,0.2)"  },
  internship:  { label: "Internship",  color: "#1d4ed8", bg: "rgba(29,78,216,0.07)",  border: "rgba(29,78,216,0.18)" },
  scholarship: { label: "Scholarship", color: "#065f46", bg: "rgba(6,95,70,0.07)",    border: "rgba(6,95,70,0.15)"   },
  program:     { label: "Program",     color: "#b45309", bg: "rgba(180,83,9,0.07)",   border: "rgba(180,83,9,0.15)"  },
  resource:    { label: "Resource",    color: "#3d3d3a", bg: "rgba(55,65,81,0.06)",   border: "rgba(55,65,81,0.12)"  },
  article:     { label: "Article",     color: "#494742", bg: "rgba(100,116,139,0.06)", border: "rgba(100,116,139,0.12)" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso)) / 1000;
  if (diff < 60)     return "Just now";
  if (diff < 3600)   return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 172800) return "Yesterday";
  return `${Math.floor(diff / 86400)}d ago`;
}

function groupByDate(sessions) {
  const now = new Date();
  const out = { Today: [], Yesterday: [], "This week": [], "This month": [], Older: [] };
  sessions.forEach((s) => {
    const d = (now - new Date(s.updated_at)) / 86400000;
    if (d < 1)       out["Today"].push(s);
    else if (d < 2)  out["Yesterday"].push(s);
    else if (d < 7)  out["This week"].push(s);
    else if (d < 30) out["This month"].push(s);
    else             out["Older"].push(s);
  });
  return out;
}

// ─── Icons ────────────────────────────────────────────────────────────────────

const IconSearch = ({ size = 16, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
  </svg>
);
const IconPlus = ({ size = 13, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);
const IconTrash = ({ size = 13, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
    <path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
  </svg>
);
const IconExternal = ({ size = 11, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
    <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
  </svg>
);
const IconStar = ({ size = 13, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>
);
const IconHistory = ({ size = 14, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.63"/>
  </svg>
);

// ─── Sessions sidebar ─────────────────────────────────────────────────────────

function SessionsPanel({ sessions, activeId, onSelect, onNew, onDelete, fullWidth = false }) {
  const grouped = groupByDate(sessions);
  const ORDER = ["Today", "Yesterday", "This week", "This month", "Older"];

  const SessionItem = ({ session }) => {
    const isActive = session.id === activeId;
    const [hovered, setHovered] = useState(false);
    const isPending = session.status === "pending";

    return (
      <div
        onClick={() => onSelect(session)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          position: "relative", padding: "7px 10px", borderRadius: 8,
          cursor: "pointer",
          display: "flex", alignItems: "center", gap: 8,
          background: isActive ? "rgba(29,78,216,0.07)" : hovered ? "#faf9f5" : "transparent",
          borderLeft: isActive ? `2px solid ${BLUE}` : "2px solid transparent",
          marginBottom: 1, transition: "background 0.12s",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontFamily: FONT, fontSize: 12.5,
            fontWeight: isActive ? 700 : 500,
            color: isActive ? NAVY : "#3d3d3a",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            lineHeight: 1.4, margin: 0,
          }}>
            {session.query}
          </p>
          <p style={{ fontFamily: FONT, fontSize: 10.5, color: "#6a6760", marginTop: 1 }}>
            {isPending ? "Searching…" : timeAgo(session.updated_at)}
          </p>
        </div>
        {hovered && !isPending && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(session.id); }}
            style={{ padding: "3px 5px", borderRadius: 5, border: "none", background: "#fef2f2", cursor: "pointer", flexShrink: 0 }}
            title="Delete"
          >
            <IconTrash size={12} color="#ef4444" />
          </button>
        )}
        {isPending && (
          <span style={{
            width: 14, height: 14, flexShrink: 0,
            border: "2px solid rgba(29,78,216,0.15)",
            borderTopColor: BLUE_MID, borderRadius: "50%",
            animation: "spinner-rotate 0.7s linear infinite",
            display: "inline-block",
          }} />
        )}
      </div>
    );
  };

  return (
    <div style={{
      width: fullWidth ? "100%" : SESSIONS_W, flexShrink: 0,
      height: fullWidth ? undefined : "100%",
      background: "#f5f0e8",
      borderLeft: fullWidth ? "none" : "1.5px solid rgba(29,78,216,0.1)",
      display: "flex", flexDirection: "column", overflow: "hidden",
      flex: fullWidth ? 1 : undefined,
    }}>
      {/* Header */}
      <div style={{ padding: "16px 14px 12px", borderBottom: "1px solid #e8edf2", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: 12.5, color: NAVY, display: "flex", alignItems: "center", gap: 6 }}>
            <IconHistory size={13} color="#494742" /> Searches
          </span>
          {sessions.length > 0 && (
            <span style={{ fontFamily: FONT, fontSize: 10.5, color: "#6a6760" }}>{sessions.length}</span>
          )}
        </div>
        <button
          onClick={onNew}
          style={{
            width: "100%", padding: "8px 12px", borderRadius: 8,
            border: "1.5px solid #e2e8f0", background: "#fff",
            display: "flex", alignItems: "center", gap: 6,
            fontFamily: FONT, fontWeight: 600, fontSize: 12.5, color: "#3d3d3a",
            cursor: "pointer", transition: "border-color 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${BLUE}50`; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#e6dfd8"; }}
        >
          <IconPlus size={13} color="#3d3d3a" /> New search
        </button>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 8px" }}>
        {ORDER.map((group) =>
          grouped[group]?.length > 0 ? (
            <div key={group} style={{ marginBottom: 14 }}>
              <p style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#b0bac6", padding: "3px 4px 5px", margin: 0 }}>
                {group}
              </p>
              {grouped[group].map((s) => <SessionItem key={s.id} session={s} />)}
            </div>
          ) : null
        )}
        {sessions.length === 0 && (
          <p style={{ fontFamily: FONT, fontSize: 12, color: "#b0bac6", textAlign: "center", marginTop: 32, padding: "0 12px", lineHeight: 1.6 }}>
            No searches yet.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

function HeroSection() {
  return (
    <div style={{ marginBottom: "2rem", position: "relative" }}>
      <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: "clamp(2rem, 3vw, 2.6rem)", color: NAVY, marginBottom: "0.875rem", lineHeight: 1.1, letterSpacing: "-0.02em" }}>
        Research Agent
      </h1>
      <p style={{ fontFamily: FONT, fontSize: "1rem", color: "#494742", maxWidth: 560, lineHeight: 1.75, fontWeight: 500, margin: 0 }}>
        Ask about scholarships, internships, programs, or competitions, and Mentorable searches the live web,
        reads the results, and synthesizes a tailored shortlist with a game plan, all filtered to your profile.
      </p>
    </div>
  );
}

// ─── Search bar ───────────────────────────────────────────────────────────────

function SearchBar({ value, onChange, onSubmit, loading }) {
  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey && value.trim() && !loading) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div style={{ display: "flex", gap: "0.625rem", marginBottom: "1.25rem" }}>
      <div style={{ flex: 1, position: "relative" }}>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKey}
          placeholder="e.g. Find research internships for high school students interested in AI…"
          rows={2}
          disabled={loading}
          style={{
            width: "100%", resize: "none", boxSizing: "border-box",
            fontFamily: FONT, fontSize: "1rem", fontWeight: 500, color: NAVY,
            background: "#fff",
            border: "2px solid rgba(29,78,216,0.15)",
            borderRadius: "0.875rem",
            padding: "1.1rem 1.375rem",
            outline: "none", lineHeight: 1.55,
            transition: "border-color 0.15s, box-shadow 0.15s",
            boxShadow: "0 2px 8px rgba(29,78,216,0.06)",
            opacity: loading ? 0.7 : 1,
          }}
          onFocus={(e) => { e.target.style.borderColor = "rgba(29,78,216,0.5)"; e.target.style.boxShadow = "0 0 0 4px rgba(29,78,216,0.07)"; }}
          onBlur={(e)  => { e.target.style.borderColor = "rgba(29,78,216,0.15)"; e.target.style.boxShadow = "0 2px 8px rgba(29,78,216,0.06)"; }}
        />
      </div>
      <motion.button
        onClick={onSubmit}
        disabled={!value.trim() || loading}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        style={{
          padding: "0 1.75rem", height: 62, alignSelf: "flex-end",
          background: value.trim() && !loading ? "linear-gradient(135deg, #1d4ed8, #3b82f6)" : "#e6dfd8",
          color: value.trim() && !loading ? "white" : "#6a6760",
          border: "none", borderRadius: "0.75rem",
          fontFamily: FONT, fontWeight: 700, fontSize: "0.9375rem",
          cursor: value.trim() && !loading ? "pointer" : "not-allowed",
          transition: "all 0.15s", whiteSpace: "nowrap",
          boxShadow: value.trim() && !loading ? "0 4px 14px rgba(29,78,216,0.28)" : "none",
          display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0,
        }}
      >
        {loading
          ? <span style={{ width: 16, height: 16, border: "2px solid rgba(148,163,184,0.3)", borderTopColor: "#6a6760", borderRadius: "50%", animation: "spinner-rotate 0.7s linear infinite", display: "inline-block" }} />
          : <IconSearch size={15} color="currentColor" />
        }
        Research
      </motion.button>
    </div>
  );
}

// ─── Chips ────────────────────────────────────────────────────────────────────

function ExampleChips({ onSelect, loading }) {
  return (
    <div style={{ marginBottom: "1.75rem" }}>
      <p style={{ fontFamily: FONT, fontSize: "0.72rem", fontWeight: 700, color: "#6a6760", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "0.625rem" }}>
        Try these
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
        {EXAMPLE_CHIPS.map((chip) => (
          <motion.button
            key={chip}
            onClick={() => !loading && onSelect(chip)}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            disabled={loading}
            style={{
              fontFamily: FONT, fontSize: "0.8rem", fontWeight: 600, color: BLUE,
              background: BLUE_TINT, border: `1.5px solid ${BLUE_SOFT}`,
              borderRadius: "2rem", padding: "0.4rem 0.875rem",
              cursor: loading ? "not-allowed" : "pointer", transition: "background 0.12s, border-color 0.12s",
              opacity: loading ? 0.5 : 1,
            }}
            onMouseEnter={(e) => { if (!loading) { e.currentTarget.style.background = "#dbeafe"; e.currentTarget.style.borderColor = "#93c5fd"; } }}
            onMouseLeave={(e) => { e.currentTarget.style.background = BLUE_TINT; e.currentTarget.style.borderColor = BLUE_SOFT; }}
          >
            {chip}
          </motion.button>
        ))}
      </div>
    </div>
  );
}

// ─── Loading state ────────────────────────────────────────────────────────────

function LoadingState({ step }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      style={{ background: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)", border: "1.5px solid #bfdbfe", borderRadius: "1.25rem", padding: "2.25rem 2rem", textAlign: "center", marginBottom: "2rem" }}
    >
      <div style={{ width: 50, height: 50, borderRadius: "50%", background: "#faf9f5", border: "1.5px solid #bfdbfe", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1.25rem", position: "relative", boxShadow: "0 4px 16px rgba(29,78,216,0.1)" }}>
        <div style={{ position: "absolute", inset: -4, borderRadius: "50%", border: "2px solid transparent", borderTopColor: BLUE, animation: "spinner-rotate 1s linear infinite" }} />
        <IconSearch size={20} color={BLUE} />
      </div>
      <AnimatePresence mode="wait">
        <motion.p key={step} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.25 }}
          style={{ fontFamily: FONT, fontSize: "0.95rem", fontWeight: 700, color: NAVY, marginBottom: "0.5rem" }}>
          {LOADING_STEPS[step] || LOADING_STEPS[LOADING_STEPS.length - 1]}
        </motion.p>
      </AnimatePresence>
      <div style={{ display: "flex", justifyContent: "center", gap: "0.4rem", marginTop: "1rem" }}>
        {LOADING_STEPS.map((_, i) => (
          <div key={i} style={{ width: i === step ? 18 : 5, height: 5, borderRadius: 3, background: i === step ? BLUE : "rgba(29,78,216,0.15)", transition: "all 0.3s" }} />
        ))}
      </div>
      <p style={{ fontFamily: FONT, fontSize: "0.75rem", color: "#494742", marginTop: "0.75rem" }}>
        This may take a moment…
      </p>
    </motion.div>
  );
}

// ─── Result card ──────────────────────────────────────────────────────────────

function ResultCard({ result, index }) {
  const meta = TYPE_META[result.type] || TYPE_META.article;
  const details = result.details || {};
  const [planOpen, setPlanOpen] = useState(false);

  const detailPairs = [
    details.deadline          && ["Deadline",      details.deadline],
    details.eligibility       && ["Eligibility",   details.eligibility],
    details.location          && ["Location",      details.location],
    details.compensation      && ["Award",         details.compensation],
    details.selectionCriteria && ["Criteria",      details.selectionCriteria],
  ].filter(Boolean);

  const visitUrl = details.applicationLink || result.url;

  const glowColor = meta.color + "20";
  const borderAccent = meta.color;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: index * 0.06 }}
      style={{
        background: "#fff",
        border: `1px solid rgba(15,23,42,0.07)`,
        borderLeft: `4px solid ${borderAccent}`,
        borderRadius: "1.125rem",
        padding: "1.375rem 1.5rem",
        boxShadow: "0 2px 10px rgba(15,23,42,0.05)",
        transition: "box-shadow 0.2s, border-color 0.2s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = `0 6px 28px ${glowColor}, 0 2px 8px rgba(15,23,42,0.06)`; e.currentTarget.style.borderColor = `${borderAccent}30`; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 2px 10px rgba(15,23,42,0.05)"; e.currentTarget.style.borderColor = "rgba(15,23,42,0.07)"; }}
    >
      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.875rem", marginBottom: "0.75rem" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem", flexWrap: "wrap" }}>
            <span style={{
              fontFamily: FONT, fontSize: "0.7rem", fontWeight: 700,
              letterSpacing: "0.07em", textTransform: "uppercase",
              color: meta.color, background: meta.bg,
              border: `1px solid ${meta.border}`,
              borderRadius: "2rem", padding: "0.2rem 0.6rem",
              flexShrink: 0,
            }}>
              {meta.label}
            </span>
            {result.pageEnriched && (
              <span style={{
                fontFamily: FONT, fontSize: "0.65rem", fontWeight: 600,
                color: "#10b981", background: "rgba(16,185,129,0.07)",
                border: "1px solid rgba(16,185,129,0.18)",
                borderRadius: "2rem", padding: "0.18rem 0.55rem",
                flexShrink: 0,
              }}>
                Verified
              </span>
            )}
          </div>
          <h3 style={{ fontFamily: FONT, fontWeight: 700, fontSize: "1rem", color: NAVY, lineHeight: 1.3, margin: 0 }}>
            {result.name || result.title}
          </h3>
        </div>
        <a
          href={visitUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "flex", alignItems: "center", gap: "0.3rem",
            padding: "0.4rem 0.875rem",
            background: "linear-gradient(135deg, #1d4ed8, #3b82f6)",
            color: "white", borderRadius: "2rem",
            fontFamily: FONT, fontSize: "0.75rem", fontWeight: 700,
            textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0,
            boxShadow: "0 2px 8px rgba(29,78,216,0.28)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          Visit <IconExternal size={10} color="white" />
        </a>
      </div>

      {/* Description */}
      <p style={{ fontFamily: FONT, fontSize: "0.86rem", color: "#3d3d3a", lineHeight: 1.65, margin: "0 0 0.875rem" }}>
        {result.description}
      </p>

      {/* Detail pills */}
      {detailPairs.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.875rem" }}>
          {detailPairs.map(([label, value]) => (
            <div key={label} style={{
              fontFamily: FONT, fontSize: "0.76rem",
              background: "#faf9f5", border: "1px solid #e2e8f0",
              borderRadius: "0.5rem", padding: "0.3rem 0.625rem",
              display: "flex", gap: "0.3rem", alignItems: "center",
            }}>
              <span style={{ color: "#6a6760", fontWeight: 600 }}>{label}:</span>
              <span style={{ color: "#3d3d3a", fontWeight: 600 }}>{value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Relevance note */}
      {result.relevance_note && (
        <div style={{
          display: "flex", gap: "0.45rem", alignItems: "flex-start",
          background: BLUE_TINT,
          border: `1px solid ${BLUE_SOFT}`,
          borderRadius: "0.75rem", padding: "0.6rem 0.875rem",
          marginBottom: result.gamePlan ? "0.75rem" : 0,
        }}>
          <IconStar size={13} color={BLUE} style={{ flexShrink: 0, marginTop: 2 }} />
          <p style={{ fontFamily: FONT, fontSize: "0.79rem", color: BLUE, fontWeight: 600, lineHeight: 1.55, margin: 0 }}>
            {result.relevance_note}
          </p>
        </div>
      )}

      {/* Game plan — collapsible */}
      {result.gamePlan && (
        <div>
          <button
            onClick={() => setPlanOpen(v => !v)}
            style={{
              display: "flex", alignItems: "center", gap: "0.45rem",
              background: "none", border: "none", cursor: "pointer",
              fontFamily: FONT, fontSize: "0.78rem", fontWeight: 700,
              color: "#0369a1", padding: "0.35rem 0",
              width: "100%", textAlign: "left",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0, transition: "transform 0.2s", transform: planOpen ? "rotate(90deg)" : "none" }}>
              <polyline points="9 18 15 12 9 6" />
            </svg>
            Your game plan
          </button>
          <AnimatePresence>
            {planOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                style={{ overflow: "hidden" }}
              >
                <div style={{
                  background: "rgba(3,105,161,0.04)",
                  border: "1px solid rgba(3,105,161,0.12)",
                  borderRadius: "0.75rem",
                  padding: "0.875rem 1rem",
                  marginTop: "0.35rem",
                }}>
                  <p style={{ fontFamily: FONT, fontSize: "0.83rem", color: "#0c4a6e", lineHeight: 1.7, margin: 0, fontWeight: 500 }}>
                    {result.gamePlan}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
}

// ─── Sources section ──────────────────────────────────────────────────────────

function SourcesSection({ sources }) {
  const [open, setOpen] = useState(false);
  if (!sources?.length) return null;

  return (
    <div style={{ marginTop: "1.5rem" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex", alignItems: "center", gap: "0.5rem",
          background: "none", border: "none", cursor: "pointer",
          fontFamily: FONT, fontSize: "0.8rem", fontWeight: 600, color: "#494742",
          padding: "0.5rem 0",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ transition: "transform 0.2s", transform: open ? "rotate(90deg)" : "none" }}>
          <polyline points="9 18 15 12 9 6" />
        </svg>
        Sources ({sources.length})
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} style={{ overflow: "hidden" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem", paddingTop: "0.5rem" }}>
              {sources.map((s, i) => (
                <a key={i} href={s.url} target="_blank" rel="noopener noreferrer"
                  style={{
                    fontFamily: FONT, fontSize: "0.8rem", color: BLUE, fontWeight: 500,
                    textDecoration: "none", display: "flex", alignItems: "center", gap: "0.375rem",
                    padding: "0.3rem 0",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.textDecoration = "underline"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.textDecoration = "none"; }}
                >
                  <IconExternal size={10} color={BLUE} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title || s.url}</span>
                </a>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Results area ─────────────────────────────────────────────────────────────

function ResultsArea({ results, sources, query, cached }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.125rem" }}>
        <div>
          <h2 style={{ fontFamily: FONT, fontWeight: 700, fontSize: "1rem", color: NAVY, margin: "0 0 0.2rem" }}>
            Results for "{query}"
          </h2>
          <p style={{ fontFamily: FONT, fontSize: "0.76rem", color: "#6a6760", margin: 0, fontWeight: 500 }}>
            {results.length} result{results.length !== 1 ? "s" : ""}
            {cached && " · From cache"}
          </p>
        </div>
        {cached && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.15)", borderRadius: "2rem", padding: "0.3rem 0.7rem" }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            <span style={{ fontFamily: FONT, fontSize: "0.7rem", fontWeight: 700, color: "#10b981" }}>Cached</span>
          </div>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
        {results.map((r, i) => <ResultCard key={r.url || i} result={r} index={i} />)}
      </div>
      <SourcesSection sources={sources} />
    </motion.div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ onChipSelect, loading }) {
  return (
    <div>
      <HeroSection />
      <ExampleChips onSelect={onChipSelect} loading={loading} />
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ResearchPage({ navigate, initialSessionId }) {
  const [query, setQuery]               = useState("");
  const [loading, setLoading]           = useState(false);
  const [loadingStep, setLoadingStep]   = useState(0);
  const [results, setResults]           = useState(null);
  const [sources, setSources]           = useState([]);
  const [activeQuery, setActiveQuery]   = useState("");
  const [cached, setCached]             = useState(false);
  const [error, setError]               = useState(null);
  const [sessions, setSessions]         = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(initialSessionId || getActiveResearch(getKnownUserId()) || null);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [researchUsed, setResearchUsed] = useState(0);
  const [limitModal, setLimitModal]     = useState(false);
  const isMobile = useIsMobile();

  const stepTimerRef = useRef(null);
  const pollRef = useRef(null);

  useEffect(() => {
    loadSessions();
    fetchUsage(supabase).then((u) => setResearchUsed(u.research_queries_used));
    return () => { if (pollRef.current) clearInterval(pollRef.current); stopLoadingSteps(); };
  }, []);

  // Remember which research session was open so returning reopens it.
  useEffect(() => { setActiveResearch(getKnownUserId(), activeSessionId); }, [activeSessionId]);

  // On mount, reopen the session from the URL — or, if returning without one,
  // the last session we were viewing.
  useEffect(() => {
    const id = initialSessionId || getActiveResearch(getKnownUserId());
    if (id) loadSession(id);
  }, [initialSessionId]);

  async function loadSessions() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setKnownUserId(user.id);
    const { data } = await supabase
      .from("research_sessions")
      .select("id, query, status, results, created_at, updated_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) setSessions(data);
  }

  async function loadSession(id) {
    const { data } = await supabase
      .from("research_sessions")
      .select("id, query, status, results, created_at, updated_at")
      .eq("id", id)
      .single();
    if (!data) return;

    setActiveSessionId(id);
    setActiveQuery(data.query);
    setQuery(data.query);

    if (data.status === "completed" && data.results) {
      const payload = data.results;
      setResults(payload.results || payload);
      setSources(payload.sources || []);
      setCached(true);
      setLoading(false);
      stopLoadingSteps();
    } else if (data.status === "pending") {
      // Still running in the background — show loading and poll until it finishes.
      setResults(null);
      setSources([]);
      setLoading(true);
      startLoadingSteps();
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        const { data: row } = await supabase
          .from("research_sessions")
          .select("status, query, results")
          .eq("id", id)
          .single();
        if (!row || row.status === "pending") return;
        clearInterval(pollRef.current);
        pollRef.current = null;
        stopLoadingSteps();
        setLoading(false);
        if (row.status === "completed" && row.results) {
          const payload = row.results;
          setResults(payload.results || payload);
          setSources(payload.sources || []);
          setActiveQuery(row.query);
          setCached(true);
        } else {
          setError("That research run didn't finish. Please try again.");
        }
      }, 2000);
    } else {
      // error / unknown
      setLoading(false);
    }
  }

  function startLoadingSteps() {
    setLoadingStep(0);
    let step = 0;
    stepTimerRef.current = setInterval(() => {
      step = Math.min(step + 1, LOADING_STEPS.length - 1);
      setLoadingStep(step);
    }, 1800);
  }

  function stopLoadingSteps() {
    if (stepTimerRef.current) { clearInterval(stepTimerRef.current); stepTimerRef.current = null; }
  }

  async function handleSearch() {
    if (!query.trim() || loading) return;
    setError(null);
    setResults(null);
    setSources([]);
    setLoading(true);
    startLoadingSteps();

    let sessionId = null;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      // Create pending session row immediately
      const { data: newSession, error: insertErr } = await supabase
        .from("research_sessions")
        .insert({ user_id: user.id, query: query.trim(), status: "pending" })
        .select("id")
        .single();
      if (insertErr) throw insertErr;
      sessionId = newSession.id;

      setActiveSessionId(sessionId);
      setSessions((prev) => [{ id: sessionId, query: query.trim(), status: "pending", created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, ...prev]);
      navigate(`/research/${sessionId}`);

      const { data: { session } } = await supabase.auth.getSession();

      // Route through LangGraph FastAPI
      const res = await fetch(`${LANGGRAPH_URL}/research`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session?.access_token}` },
        body: JSON.stringify({ query: query.trim(), session_id: sessionId }),
      });
      if (res.status === 429) { setLimitModal(true); setResearchUsed(LIMITS.research); return; }
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.detail || "Research failed"); }
      const data = await res.json();

      if (data?.error) {
        if (data.error === 'LIMIT_REACHED') { setLimitModal(true); setResearchUsed(LIMITS.research); return; }
        throw new Error(data.error);
      }

      setResults(data.results || []);
      setSources(data.sources || []);
      setActiveQuery(query.trim());
      setCached(!!data.cached);
      setSessions((prev) => prev.map((s) => s.id === sessionId ? { ...s, status: "completed", results: { results: data.results, sources: data.sources }, updated_at: new Date().toISOString() } : s));
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
      if (sessionId) {
        await supabase.from("research_sessions").update({ status: "error", updated_at: new Date().toISOString() }).eq("id", sessionId);
        setSessions((prev) => prev.map((s) => s.id === sessionId ? { ...s, status: "error" } : s));
      }
    } finally {
      stopLoadingSteps();
      setLoading(false);
    }
  }

  function handleSelectSession(session) {
    if (session.status === "pending") return;
    setActiveSessionId(session.id);
    const payload = session.results;
    if (payload) {
      setResults(payload.results || payload);
      setSources(payload.sources || []);
    }
    setActiveQuery(session.query);
    setQuery(session.query);
    setCached(true);
    setError(null);
    navigate(`/research/${session.id}`);
  }

  function handleNewSearch() {
    setQuery("");
    setResults(null);
    setSources([]);
    setActiveQuery("");
    setActiveSessionId(null);
    setError(null);
    setCached(false);
    navigate("/research");
  }

  async function handleDeleteSession(id) {
    await supabase.from("research_sessions").delete().eq("id", id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (activeSessionId === id) handleNewSearch();
  }

  const showEmpty = !loading && !results && !error;

  const sessionsPanel = (
    <SessionsPanel
      sessions={sessions}
      activeId={activeSessionId}
      onSelect={(s) => { handleSelectSession(s); setSessionsOpen(false); }}
      onNew={() => { handleNewSearch(); setSessionsOpen(false); }}
      onDelete={handleDeleteSession}
      fullWidth={isMobile}
    />
  );

  return (
    <div style={{ minHeight: "100vh", background: "#faf9f5", backgroundImage: "radial-gradient(circle, rgba(29,78,216,0.07) 1px, transparent 1px)", backgroundSize: "28px 28px", display: "flex", position: "relative" }}>

      <style>{`
        @import
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');
        @keyframes spinner-rotate { to { transform: rotate(360deg); } }
      `}</style>

      {/* Main content */}
      <div
        data-sidebar-offset
        style={{
          marginLeft: isMobile ? 0 : SIDEBAR_WIDTH,
          flex: 1,
          minHeight: "100vh",
          overflowY: "auto",
          padding: isMobile ? "1.25rem 1rem 5rem" : "2rem 2.5rem 4rem",
          paddingRight: isMobile ? undefined : `calc(${SESSIONS_W}px + 2.5rem)`,
          maxWidth: isMobile ? undefined : 840 + SESSIONS_W,
          boxSizing: "border-box",
          position: "relative",
        }}
      >
        {/* Mobile sessions toggle button */}
        {isMobile && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.75rem" }}>
            <button
              onClick={() => setSessionsOpen(true)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "8px 14px", borderRadius: 8,
                border: "1.5px solid #e2e8f0", background: "#fff",
                fontFamily: FONT, fontSize: 12.5, fontWeight: 600, color: "#3d3d3a",
                cursor: "pointer",
              }}
            >
              <IconHistory size={13} color="#494742" />
              History {sessions.length > 0 && `(${sessions.length})`}
            </button>
          </div>
        )}

        {showEmpty
          ? <EmptyState onChipSelect={(chip) => { setQuery(chip); }} loading={loading} />
          : null
        }

        {/* Search bar always visible after first use */}
        {!showEmpty && (
          <>
            <div style={{ marginBottom: "1.5rem" }}>
              <ExampleChips onSelect={setQuery} loading={loading} />
            </div>
          </>
        )}

        <SearchBar value={query} onChange={setQuery} onSubmit={handleSearch} loading={loading} />
        {(() => {
          const left = Math.max(0, LIMITS.research - researchUsed);
          return (
            <div style={{ textAlign: "right", marginTop: 6, marginBottom: 4 }}>
              <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 600,
                color: left <= 1 ? "#dc2626" : "#9ca3af" }}>
                {left === 0 ? "No research queries remaining" : `${left} research quer${left === 1 ? "y" : "ies"} remaining`}
              </span>
            </div>
          );
        })()}

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              style={{ background: "rgba(239,68,68,0.05)", border: "1.5px solid rgba(239,68,68,0.14)", borderRadius: "0.75rem", padding: "0.75rem 1.125rem", marginBottom: "1.25rem", fontFamily: FONT, fontSize: "0.86rem", color: "#dc2626", fontWeight: 600 }}
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {loading && <LoadingState key="loading" step={loadingStep} />}
        </AnimatePresence>

        <AnimatePresence>
          {!loading && results && (
            <ResultsArea
              key={activeSessionId}
              results={results}
              sources={sources}
              query={activeQuery}
              cached={cached}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Desktop sessions panel — fixed to right edge */}
      {!isMobile && (
        <div style={{ position: "fixed", top: 0, right: 0, height: "100vh", zIndex: 10 }}>
          {sessionsPanel}
        </div>
      )}

      {/* Mobile sessions drawer */}
      {isMobile && (
        <Drawer open={sessionsOpen} onClose={() => setSessionsOpen(false)} width={SESSIONS_W + 20}>
          {sessionsPanel}
        </Drawer>
      )}

      {limitModal && <LimitModal feature="research" onClose={() => setLimitModal(false)} />}
    </div>
  );
}
