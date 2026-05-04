import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "./lib/supabase.js";
import Sidebar, { SIDEBAR_WIDTH } from "./components/common/Sidebar.jsx";

const FONT = "'Space Grotesk', sans-serif";

const LOADING_STEPS = [
  "Searching the web…",
  "Analyzing results…",
  "Personalizing for your profile…",
  "Almost there…",
];

const EXAMPLE_CHIPS = [
  "Find research internships for high school students interested in AI",
  "What competitions can I enter for environmental science?",
  "Scholarships for first-gen students pursuing medicine",
  "Summer programs for high schoolers interested in computer science",
  "How do I get published as a high school researcher?",
  "College prep resources for first-generation students",
];

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function HeroSection() {
  return (
    <div style={{
      background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)",
      borderRadius: "1.5rem",
      padding: "3rem 2.5rem 2.5rem",
      marginBottom: "2rem",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Background glow orbs */}
      <div style={{
        position: "absolute", top: "-60px", right: "-40px",
        width: 260, height: 260, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(99,102,241,0.18) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute", bottom: "-40px", left: "30%",
        width: 200, height: 200, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(59,130,246,0.12) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      <div style={{ position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
          <div style={{
            width: 40, height: 40, borderRadius: "0.75rem",
            background: "linear-gradient(135deg, #6366f1, #3b82f6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 16px rgba(99,102,241,0.4)",
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </div>
          <span style={{
            fontFamily: FONT, fontWeight: 700, fontSize: "0.75rem",
            letterSpacing: "0.12em", textTransform: "uppercase",
            color: "#a5b4fc",
          }}>
            Deep Research
          </span>
        </div>

        <h1 style={{
          fontFamily: FONT, fontWeight: 800, fontSize: "clamp(1.6rem, 3vw, 2.2rem)",
          color: "#f8fafc", marginBottom: "0.75rem", lineHeight: 1.2,
          letterSpacing: "-0.03em",
        }}>
          Find real opportunities,<br />tailored to you.
        </h1>

        <p style={{
          fontFamily: FONT, fontSize: "1rem", color: "#94a3b8",
          maxWidth: 520, lineHeight: 1.65, fontWeight: 500,
        }}>
          Ask anything — internships, scholarships, competitions, programs. The research agent
          searches the web and filters results based on your interests, grade, and goals.
        </p>

        <div style={{ display: "flex", gap: "1.5rem", marginTop: "1.5rem" }}>
          {[
            { icon: "🎓", label: "Scholarships" },
            { icon: "🔬", label: "Internships" },
            { icon: "🏆", label: "Competitions" },
            { icon: "📚", label: "Programs" },
          ].map(({ icon, label }) => (
            <div key={label} style={{
              display: "flex", alignItems: "center", gap: "0.4rem",
              fontFamily: FONT, fontSize: "0.82rem", fontWeight: 600, color: "#cbd5e1",
            }}>
              <span>{icon}</span>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SearchBar({ value, onChange, onSubmit, loading }) {
  const inputRef = useRef(null);

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey && value.trim() && !loading) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div style={{ position: "relative", marginBottom: "1.5rem" }}>
      <div style={{
        display: "flex", gap: "0.75rem", alignItems: "flex-end",
      }}>
        <div style={{ flex: 1, position: "relative" }}>
          <textarea
            ref={inputRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKey}
            placeholder="e.g. Find research internships for high school students interested in AI…"
            rows={2}
            disabled={loading}
            style={{
              width: "100%", resize: "none", boxSizing: "border-box",
              fontFamily: FONT, fontSize: "0.95rem", fontWeight: 500, color: "#0f172a",
              background: "#ffffff",
              border: "2px solid rgba(99,102,241,0.2)",
              borderRadius: "1rem",
              padding: "1rem 1.25rem",
              outline: "none",
              lineHeight: 1.55,
              transition: "border-color 0.15s, box-shadow 0.15s",
              boxShadow: "0 2px 12px rgba(99,102,241,0.06)",
              opacity: loading ? 0.7 : 1,
            }}
            onFocus={(e) => {
              e.target.style.borderColor = "rgba(99,102,241,0.5)";
              e.target.style.boxShadow = "0 0 0 4px rgba(99,102,241,0.08), 0 2px 12px rgba(99,102,241,0.06)";
            }}
            onBlur={(e) => {
              e.target.style.borderColor = "rgba(99,102,241,0.2)";
              e.target.style.boxShadow = "0 2px 12px rgba(99,102,241,0.06)";
            }}
          />
        </div>
        <motion.button
          onClick={onSubmit}
          disabled={!value.trim() || loading}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          style={{
            padding: "0 1.75rem",
            height: 56,
            background: value.trim() && !loading
              ? "linear-gradient(135deg, #6366f1, #3b82f6)"
              : "rgba(99,102,241,0.15)",
            color: value.trim() && !loading ? "white" : "#94a3b8",
            border: "none",
            borderRadius: "0.875rem",
            fontFamily: FONT, fontWeight: 700, fontSize: "0.9rem",
            cursor: value.trim() && !loading ? "pointer" : "not-allowed",
            transition: "all 0.15s",
            whiteSpace: "nowrap",
            boxShadow: value.trim() && !loading ? "0 4px 16px rgba(99,102,241,0.3)" : "none",
            display: "flex", alignItems: "center", gap: "0.5rem",
            flexShrink: 0,
          }}
        >
          {loading ? (
            <span style={{
              display: "inline-block",
              width: 16, height: 16,
              border: "2px solid rgba(148,163,184,0.3)",
              borderTopColor: "#94a3b8",
              borderRadius: "50%",
              animation: "spinner-rotate 0.7s linear infinite",
            }} />
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          )}
          Research
        </motion.button>
      </div>
    </div>
  );
}

function ExampleChips({ onSelect, loading }) {
  return (
    <div style={{ marginBottom: "2rem" }}>
      <p style={{
        fontFamily: FONT, fontSize: "0.78rem", fontWeight: 600,
        color: "#94a3b8", letterSpacing: "0.08em", textTransform: "uppercase",
        marginBottom: "0.75rem",
      }}>
        Try these
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
        {EXAMPLE_CHIPS.map((chip) => (
          <motion.button
            key={chip}
            onClick={() => !loading && onSelect(chip)}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            disabled={loading}
            style={{
              fontFamily: FONT, fontSize: "0.82rem", fontWeight: 600,
              color: "#6366f1",
              background: "rgba(99,102,241,0.07)",
              border: "1.5px solid rgba(99,102,241,0.15)",
              borderRadius: "2rem",
              padding: "0.45rem 1rem",
              cursor: loading ? "not-allowed" : "pointer",
              transition: "background 0.12s, border-color 0.12s",
              opacity: loading ? 0.5 : 1,
            }}
            onMouseEnter={(e) => { if (!loading) { e.currentTarget.style.background = "rgba(99,102,241,0.12)"; e.currentTarget.style.borderColor = "rgba(99,102,241,0.3)"; } }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(99,102,241,0.07)"; e.currentTarget.style.borderColor = "rgba(99,102,241,0.15)"; }}
          >
            {chip}
          </motion.button>
        ))}
      </div>
    </div>
  );
}

function LoadingState({ step }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      style={{
        background: "linear-gradient(135deg, #0f172a, #1e1b4b)",
        borderRadius: "1.25rem",
        padding: "2.5rem 2rem",
        textAlign: "center",
        marginBottom: "2rem",
      }}
    >
      <div style={{
        width: 52, height: 52, borderRadius: "50%",
        background: "rgba(99,102,241,0.15)",
        border: "2px solid rgba(99,102,241,0.3)",
        display: "flex", alignItems: "center", justifyContent: "center",
        margin: "0 auto 1.5rem",
        position: "relative",
      }}>
        <div style={{
          position: "absolute", inset: -4,
          borderRadius: "50%",
          border: "2px solid transparent",
          borderTopColor: "#6366f1",
          animation: "spinner-rotate 1s linear infinite",
        }} />
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#a5b4fc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
      </div>

      <AnimatePresence mode="wait">
        <motion.p
          key={step}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.3 }}
          style={{
            fontFamily: FONT, fontSize: "1rem", fontWeight: 600,
            color: "#e2e8f0", marginBottom: "0.5rem",
          }}
        >
          {LOADING_STEPS[step] || LOADING_STEPS[LOADING_STEPS.length - 1]}
        </motion.p>
      </AnimatePresence>

      <div style={{ display: "flex", justifyContent: "center", gap: "0.5rem", marginTop: "1.25rem" }}>
        {LOADING_STEPS.map((_, i) => (
          <div key={i} style={{
            width: i === step ? 20 : 6, height: 6,
            borderRadius: 3,
            background: i === step ? "#6366f1" : "rgba(99,102,241,0.2)",
            transition: "all 0.3s",
          }} />
        ))}
      </div>
    </motion.div>
  );
}

function ResultCard({ result, index }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.07 }}
      style={{
        background: "#ffffff",
        border: "1.5px solid rgba(99,102,241,0.1)",
        borderRadius: "1.25rem",
        padding: "1.5rem",
        boxShadow: "0 2px 16px rgba(99,102,241,0.06)",
        transition: "box-shadow 0.15s, border-color 0.15s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = "0 6px 28px rgba(99,102,241,0.12)";
        e.currentTarget.style.borderColor = "rgba(99,102,241,0.2)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "0 2px 16px rgba(99,102,241,0.06)";
        e.currentTarget.style.borderColor = "rgba(99,102,241,0.1)";
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", marginBottom: "0.75rem" }}>
        <h3 style={{
          fontFamily: FONT, fontWeight: 700, fontSize: "1rem",
          color: "#0f172a", lineHeight: 1.35, margin: 0,
        }}>
          {result.title}
        </h3>
        <a
          href={result.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "flex", alignItems: "center", gap: "0.35rem",
            padding: "0.4rem 0.875rem",
            background: "linear-gradient(135deg, #6366f1, #3b82f6)",
            color: "white", borderRadius: "2rem",
            fontFamily: FONT, fontSize: "0.78rem", fontWeight: 700,
            textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0,
            boxShadow: "0 2px 8px rgba(99,102,241,0.3)",
            transition: "box-shadow 0.15s, opacity 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.9"; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
        >
          Visit
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </a>
      </div>

      <p style={{
        fontFamily: FONT, fontSize: "0.875rem", color: "#475569",
        lineHeight: 1.6, margin: "0 0 1rem",
      }}>
        {result.description}
      </p>

      {result.relevance_note && (
        <div style={{
          display: "flex", gap: "0.5rem", alignItems: "flex-start",
          background: "rgba(99,102,241,0.05)",
          border: "1px solid rgba(99,102,241,0.1)",
          borderRadius: "0.75rem",
          padding: "0.625rem 0.875rem",
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          <p style={{
            fontFamily: FONT, fontSize: "0.8rem", color: "#6366f1",
            fontWeight: 600, lineHeight: 1.5, margin: 0,
          }}>
            {result.relevance_note}
          </p>
        </div>
      )}

      <p style={{
        fontFamily: FONT, fontSize: "0.72rem", color: "#94a3b8",
        margin: "0.75rem 0 0",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {result.url}
      </p>
    </motion.div>
  );
}

function ResultsSection({ results, query, cached }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{ marginBottom: "2.5rem" }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
        <div>
          <h2 style={{
            fontFamily: FONT, fontWeight: 700, fontSize: "1.1rem",
            color: "#0f172a", margin: "0 0 0.25rem",
          }}>
            Results for "{query}"
          </h2>
          <p style={{ fontFamily: FONT, fontSize: "0.78rem", color: "#94a3b8", margin: 0, fontWeight: 500 }}>
            {results.length} result{results.length !== 1 ? "s" : ""}
            {cached && " · From cache"}
          </p>
        </div>
        {cached && (
          <div style={{
            display: "flex", alignItems: "center", gap: "0.35rem",
            background: "rgba(16,185,129,0.08)",
            border: "1px solid rgba(16,185,129,0.15)",
            borderRadius: "2rem", padding: "0.3rem 0.75rem",
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <span style={{ fontFamily: FONT, fontSize: "0.72rem", fontWeight: 700, color: "#10b981" }}>Cached</span>
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {results.map((r, i) => <ResultCard key={r.url || i} result={r} index={i} />)}
      </div>
    </motion.div>
  );
}

function HistorySection({ history, onReopen, onDelete }) {
  if (!history.length) return null;

  return (
    <div style={{ marginTop: "1rem" }}>
      <div style={{
        height: 1, background: "rgba(99,102,241,0.08)", marginBottom: "1.75rem",
      }} />
      <h2 style={{
        fontFamily: FONT, fontWeight: 700, fontSize: "1rem",
        color: "#0f172a", marginBottom: "1rem",
        display: "flex", alignItems: "center", gap: "0.5rem",
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="1 4 1 10 7 10" />
          <path d="M3.51 15a9 9 0 1 0 .49-3.63" />
        </svg>
        Past Searches
      </h2>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {history.map((item) => (
          <div
            key={item.id}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              gap: "1rem",
              background: "#ffffff",
              border: "1.5px solid rgba(99,102,241,0.08)",
              borderRadius: "0.875rem",
              padding: "0.875rem 1.25rem",
              transition: "border-color 0.12s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(99,102,241,0.2)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(99,102,241,0.08)"; }}
          >
            <button
              onClick={() => onReopen(item)}
              style={{
                flex: 1, background: "none", border: "none", cursor: "pointer",
                textAlign: "left", padding: 0,
              }}
            >
              <p style={{
                fontFamily: FONT, fontWeight: 600, fontSize: "0.9rem",
                color: "#1e293b", margin: "0 0 0.2rem",
              }}>
                {item.query}
              </p>
              <p style={{
                fontFamily: FONT, fontSize: "0.75rem", color: "#94a3b8",
                margin: 0, fontWeight: 500,
              }}>
                {formatDate(item.created_at)} · {item.results?.length ?? 0} results
              </p>
            </button>
            <button
              onClick={() => onDelete(item.id)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                padding: "0.375rem", borderRadius: "0.5rem",
                color: "#cbd5e1", transition: "color 0.12s, background 0.12s",
                display: "flex", alignItems: "center",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "#ef4444"; e.currentTarget.style.background = "rgba(239,68,68,0.06)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "#cbd5e1"; e.currentTarget.style.background = "none"; }}
              title="Delete"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14H6L5 6" />
                <path d="M10 11v6M14 11v6" />
                <path d="M9 6V4h6v2" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ResearchPage({ navigate }) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [results, setResults] = useState(null);
  const [activeQuery, setActiveQuery] = useState("");
  const [cached, setCached] = useState(false);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);
  const [roadmapMode, setRoadmapMode] = useState(localStorage.getItem("roadmapMode") || "discovery");

  const stepTimerRef = useRef(null);
  const resultsRef = useRef(null);

  useEffect(() => {
    loadHistory();
  }, []);

  async function loadHistory() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("research_history")
      .select("id, query, results, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (data) setHistory(data);
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
    if (stepTimerRef.current) {
      clearInterval(stepTimerRef.current);
      stepTimerRef.current = null;
    }
  }

  async function handleSearch() {
    if (!query.trim() || loading) return;
    setError(null);
    setResults(null);
    setLoading(true);
    startLoadingSteps();

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error: fnError } = await supabase.functions.invoke("run-research", {
        body: { query: query.trim() },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });

      if (fnError || data?.error) {
        throw new Error(data?.error || fnError?.message || "Research failed");
      }

      setResults(data.results || []);
      setActiveQuery(query.trim());
      setCached(!!data.cached);
      await loadHistory();

      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      stopLoadingSteps();
      setLoading(false);
    }
  }

  function handleChipSelect(chip) {
    setQuery(chip);
  }

  function handleReopenHistory(item) {
    setQuery(item.query);
    setResults(item.results);
    setActiveQuery(item.query);
    setCached(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDeleteHistory(id) {
    await supabase.from("research_history").delete().eq("id", id);
    setHistory((prev) => prev.filter((h) => h.id !== id));
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f4f8ff" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700;800&display=swap');`}</style>

      <Sidebar
        activePath="/research"
        navigate={navigate}
        onModeClick={null}
        roadmapMode={roadmapMode}
      />

      <div
        data-sidebar-offset
        style={{
          marginLeft: SIDEBAR_WIDTH,
          minHeight: "100vh",
          padding: "2rem 2.5rem 4rem",
          maxWidth: 860,
          boxSizing: "border-box",
        }}
      >
        <HeroSection />
        <ExampleChips onSelect={handleChipSelect} loading={loading} />
        <SearchBar
          value={query}
          onChange={setQuery}
          onSubmit={handleSearch}
          loading={loading}
        />

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              style={{
                background: "rgba(239,68,68,0.06)",
                border: "1.5px solid rgba(239,68,68,0.15)",
                borderRadius: "0.875rem",
                padding: "0.875rem 1.25rem",
                marginBottom: "1.5rem",
                fontFamily: FONT, fontSize: "0.875rem", color: "#dc2626", fontWeight: 600,
              }}
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {loading && <LoadingState key="loading" step={loadingStep} />}
        </AnimatePresence>

        <div ref={resultsRef}>
          <AnimatePresence>
            {!loading && results && (
              <ResultsSection
                key="results"
                results={results}
                query={activeQuery}
                cached={cached}
              />
            )}
          </AnimatePresence>
        </div>

        <HistorySection
          history={history}
          onReopen={handleReopenHistory}
          onDelete={handleDeleteHistory}
        />
      </div>
    </div>
  );
}
