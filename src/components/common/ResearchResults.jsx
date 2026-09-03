import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "../../lib/ThemeContext.jsx";

const FONT = "'Raleway', sans-serif";
const NAVY = "#141413";

export const TYPE_META = {
  competition: { label: "Competition", color: "#0369a1", bg: "rgba(3,105,161,0.08)",  border: "rgba(3,105,161,0.2)"  },
  internship:  { label: "Internship",  color: "#1d4ed8", bg: "rgba(29,78,216,0.07)",  border: "rgba(29,78,216,0.18)" },
  scholarship: { label: "Scholarship", color: "#065f46", bg: "rgba(6,95,70,0.07)",    border: "rgba(6,95,70,0.15)"   },
  program:     { label: "Program",     color: "#b45309", bg: "rgba(180,83,9,0.07)",   border: "rgba(180,83,9,0.15)"  },
  resource:    { label: "Resource",    color: "#3d3d3a", bg: "rgba(55,65,81,0.06)",   border: "rgba(55,65,81,0.12)"  },
  article:     { label: "Article",     color: "#494742", bg: "rgba(100,116,139,0.06)", border: "rgba(100,116,139,0.12)" },
};

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

export function ResultCard({ result, index }) {
  const { accent } = useTheme();
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
            background: "linear-gradient(135deg, var(--accent), var(--accent-light))",
            color: "white", borderRadius: "2rem",
            fontFamily: FONT, fontSize: "0.75rem", fontWeight: 700,
            textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0,
            boxShadow: "0 2px 8px rgba(var(--accent-rgb),0.28)",
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
          background: "rgba(var(--accent-rgb),0.06)",
          border: "1px solid rgba(var(--accent-rgb),0.2)",
          borderRadius: "0.75rem", padding: "0.6rem 0.875rem",
          marginBottom: result.gamePlan ? "0.75rem" : 0,
        }}>
          <IconStar size={13} color={accent} style={{ flexShrink: 0, marginTop: 2 }} />
          <p style={{ fontFamily: FONT, fontSize: "0.79rem", color: "var(--accent)", fontWeight: 600, lineHeight: 1.55, margin: 0 }}>
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

export function SourcesSection({ sources }) {
  const [open, setOpen] = useState(false);
  const { accent } = useTheme();
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
                    fontFamily: FONT, fontSize: "0.8rem", color: "var(--accent)", fontWeight: 500,
                    textDecoration: "none", display: "flex", alignItems: "center", gap: "0.375rem",
                    padding: "0.3rem 0",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.textDecoration = "underline"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.textDecoration = "none"; }}
                >
                  <IconExternal size={10} color={accent} />
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
