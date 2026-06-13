import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../lib/supabase.js";
import { getCache, setCache, getKnownUserId, setKnownUserId } from "../lib/cache.js";
import { fetchUsage, LIMITS } from "../lib/usage.js";
import LimitModal from "../components/common/LimitModal.jsx";
import { SIDEBAR_WIDTH } from "../components/common/Sidebar.jsx";
import { useIsMobile } from "../hooks/useIsMobile.js";

const LANGGRAPH_URL = import.meta.env.VITE_LANGGRAPH_CHAT_URL;

// ─── Design tokens (shared app palette — do not deviate) ──────────────────────
const SANS        = "'Space Grotesk', sans-serif";
const BG          = "#f5f1ed";
const WHITE       = "#ffffff";
const BLUE        = "#1d4ed8";
const BLUE_MID    = "#3b82f6";
const BLUE_TINT   = "#f0f5ff";
const BLUE_SOFT   = "#dbeafe";
const GREEN       = "#059669";
const GREEN_SOFT  = "#d1fae5";
const AMBER       = "#d97706";
const AMBER_SOFT  = "#fef3c7";
const PURPLE      = "#7c3aed";
const PURPLE_SOFT = "#ede9fe";
const TEXT        = "#141413";
const TEXT_MID    = "#3d3d3a";
const TEXT_MUTED  = "#6c6a64";
const TEXT_FAINT  = "#8e8b82";
const BORDER      = "#e6dfd8";

// ─── Pillar styling ───────────────────────────────────────────────────────────
const PILLAR_STYLES = {
  Project:  { bg: BLUE_TINT,   color: BLUE,   dot: BLUE },
  Research: { bg: AMBER_SOFT,  color: AMBER,  dot: AMBER },
  Activity: { bg: GREEN_SOFT,  color: GREEN,  dot: GREEN },
  Club:     { bg: PURPLE_SOFT, color: PURPLE, dot: PURPLE },
};
const pillarStyle = (p) => PILLAR_STYLES[p] || PILLAR_STYLES.Project;

const STATE_LABEL = {
  explore:  null,
  opened:   { text: "Opened",   bg: "#eef2ff", color: BLUE },
  on_board: { text: "On board", bg: AMBER_SOFT, color: AMBER },
  done:     { text: "Done",     bg: GREEN_SOFT, color: GREEN },
};

const TIMEFRAME_OPTIONS = [
  { value: 6,  label: "6 months" },
  { value: 12, label: "1 year" },
  { value: 18, label: "18 months" },
  { value: 24, label: "2 years" },
  { value: 0,  label: "Let Mentorable decide" },
];

// ─── Node card ────────────────────────────────────────────────────────────────
function NodeCard({ node, onOpen }) {
  const ps = pillarStyle(node.pillar);
  const state = STATE_LABEL[node.state];
  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -2 }}
      onClick={() => onOpen(node)}
      style={{
        display: "block", width: "100%", textAlign: "left", cursor: "pointer",
        background: WHITE, border: `1px solid ${BORDER}`, borderLeft: `3px solid ${ps.dot}`,
        borderRadius: 14, padding: "14px 16px", boxShadow: "0 1px 3px rgba(15,23,42,0.04)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
        <span style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", background: ps.bg, color: ps.color, borderRadius: 5, padding: "2px 8px" }}>
          {node.pillar}
        </span>
        {state && (
          <span style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", background: state.bg, color: state.color, borderRadius: 5, padding: "2px 8px" }}>
            {state.text}
          </span>
        )}
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={TEXT_FAINT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: "auto" }}>
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </div>
      <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 15, color: TEXT, lineHeight: 1.35, marginBottom: node.blurb ? 5 : 0 }}>
        {node.title}
      </div>
      {node.blurb && (
        <p style={{ fontFamily: SANS, fontSize: 13, color: TEXT_MUTED, lineHeight: 1.5, margin: 0 }}>{node.blurb}</p>
      )}
    </motion.button>
  );
}

// ─── Skeleton (shimmer) while generating ──────────────────────────────────────
function TimelineSkeleton() {
  return (
    <div style={{ maxWidth: 680, margin: "0 auto", width: "100%" }}>
      <style>{`
        @keyframes rm-shimmer { 0% { background-position: -480px 0 } 100% { background-position: 480px 0 } }
        .rm-sk { background: linear-gradient(90deg, ${BORDER}55 25%, ${BORDER}aa 50%, ${BORDER}55 75%); background-size: 480px 100%; animation: rm-shimmer 1.5s infinite; border-radius: 8px; }
      `}</style>
      {[0, 1, 2, 3].map((m) => (
        <div key={m} style={{ marginBottom: 28 }}>
          <div className="rm-sk" style={{ height: 16, width: 120, marginBottom: 14, marginLeft: 28 }} />
          <div style={{ position: "relative", paddingLeft: 28 }}>
            <div style={{ position: "absolute", left: 7, top: 0, bottom: 0, width: 2, background: BORDER }} />
            {[0, 1].slice(0, m % 2 === 0 ? 2 : 1).map((c) => (
              <div key={c} style={{ position: "relative", marginBottom: 12 }}>
                <div style={{ position: "absolute", left: -25, top: 16, width: 12, height: 12, borderRadius: "50%", background: BORDER, border: `2px solid ${BG}` }} />
                <div style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "14px 16px" }}>
                  <div className="rm-sk" style={{ height: 16, width: 64, marginBottom: 10 }} />
                  <div className="rm-sk" style={{ height: 14, width: "70%", marginBottom: 6 }} />
                  <div className="rm-sk" style={{ height: 12, width: "90%" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Goal-capture entry (empty state) ─────────────────────────────────────────
function GoalEntry({ onGenerate, generating, atLimit, onLimit }) {
  const [goal, setGoal] = useState("");
  const [timeframe, setTimeframe] = useState(0);
  const canGo = goal.trim().length >= 4 && !generating;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
      style={{ maxWidth: 560, margin: "0 auto", width: "100%", textAlign: "center", paddingTop: "2rem" }}
    >
      <h1 style={{ fontFamily: SANS, fontWeight: 700, fontSize: "2rem", color: TEXT, letterSpacing: "-0.03em", marginBottom: "0.6rem" }}>
        Build your roadmap
      </h1>
      <p style={{ fontFamily: SANS, fontSize: "1rem", color: TEXT_MUTED, lineHeight: 1.6, marginBottom: "2rem", maxWidth: 460, marginLeft: "auto", marginRight: "auto" }}>
        Tell Mentorable your ultimate goal. You'll get a month-by-month path of projects, research,
        and activities — with the big picture first, and specifics as you go.
      </p>

      <div style={{ textAlign: "left", background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 18, padding: "1.5rem", boxShadow: "0 2px 12px rgba(15,23,42,0.05)" }}>
        <label style={{ fontFamily: SANS, fontSize: "0.78rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: BLUE, display: "block", marginBottom: 8 }}>
          Your ultimate goal
        </label>
        <textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="e.g. Get into a top CS program and build a standout portfolio"
          rows={3}
          style={{
            width: "100%", fontFamily: SANS, fontSize: "1rem", color: TEXT, lineHeight: 1.55,
            border: `1.5px solid ${BORDER}`, borderRadius: 12, padding: "12px 14px", resize: "vertical",
            outline: "none", background: BG, marginBottom: "1.25rem",
          }}
          onFocus={(e) => (e.target.style.borderColor = BLUE)}
          onBlur={(e) => (e.target.style.borderColor = BORDER)}
        />

        <label style={{ fontFamily: SANS, fontSize: "0.78rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: BLUE, display: "block", marginBottom: 8 }}>
          Timeframe
        </label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: "1.5rem" }}>
          {TIMEFRAME_OPTIONS.map((opt) => {
            const active = timeframe === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setTimeframe(opt.value)}
                style={{
                  fontFamily: SANS, fontSize: "0.86rem", fontWeight: 600, cursor: "pointer",
                  padding: "7px 14px", borderRadius: 99,
                  border: `1.5px solid ${active ? BLUE : BORDER}`,
                  background: active ? BLUE : WHITE, color: active ? WHITE : TEXT_MID,
                  transition: "all 0.15s",
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <button
          onClick={() => {
            if (atLimit) { onLimit(); return; }
            if (canGo) onGenerate(goal.trim(), timeframe || null);
          }}
          disabled={!canGo}
          style={{
            width: "100%", fontFamily: SANS, fontSize: "1rem", fontWeight: 700, cursor: canGo ? "pointer" : "not-allowed",
            padding: "14px", borderRadius: 12, border: "none",
            background: canGo ? BLUE : "#c7d2e8", color: WHITE,
            boxShadow: canGo ? "0 6px 20px rgba(29,78,216,0.3)" : "none", transition: "all 0.15s",
          }}
        >
          {generating ? "Building your roadmap…" : "Generate roadmap"}
        </button>
        <p style={{ fontFamily: SANS, fontSize: "0.78rem", color: TEXT_FAINT, textAlign: "center", marginTop: 10 }}>
          The demo includes one roadmap generation.
        </p>
      </div>
    </motion.div>
  );
}

// ─── RoadmapPage ──────────────────────────────────────────────────────────────
export default function RoadmapPage({ navigate }) {
  const isMobile = useIsMobile();
  const [phase, setPhase] = useState("loading");  // loading | empty | generating | ready | error
  const [roadmap, setRoadmap] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [roadmapUsed, setRoadmapUsed] = useState(0);
  const [limitModal, setLimitModal] = useState(false);
  const userIdRef = useRef(null);

  // Load existing roadmap (latest active)
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/auth"; return; }
      userIdRef.current = user.id;
      setKnownUserId(user.id);

      const [{ data: rms }, usage] = await Promise.all([
        supabase.from("roadmaps").select("*").eq("user_id", user.id).eq("status", "active").order("created_at", { ascending: false }).limit(1),
        fetchUsage(supabase),
      ]);
      setRoadmapUsed(usage.roadmap_generations_used ?? 0);

      const rm = (rms || [])[0];
      if (!rm) { setPhase("empty"); return; }
      const { data: nd } = await supabase.from("roadmap_nodes").select("*").eq("roadmap_id", rm.id).order("month_index", { ascending: true }).order("order_index", { ascending: true });
      setRoadmap(rm);
      setNodes(nd || []);
      setPhase("ready");
    })();
  }, []);

  const handleGenerate = useCallback(async (goal, timeframe_months) => {
    setPhase("generating");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${LANGGRAPH_URL}/roadmap/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ goal, timeframe_months }),
      });
      if (res.status === 429) { setRoadmapUsed(LIMITS.roadmap_gen); setLimitModal(true); setPhase("empty"); return; }
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.detail || "Generation failed"); }
      const data = await res.json();
      setRoadmap(data.roadmap);
      setNodes(data.nodes || []);
      setRoadmapUsed((n) => n + 1);
      setPhase("ready");
    } catch (e) {
      console.error("[Roadmap] generate error:", e);
      setPhase("error");
    }
  }, []);

  const openNode = useCallback((node) => navigate(`/roadmap/node/${node.id}`), [navigate]);

  // Group nodes by month_index (already sorted ascending = current → future, top → bottom)
  const months = [];
  const byMonth = new Map();
  for (const n of nodes) {
    if (!byMonth.has(n.month_index)) { byMonth.set(n.month_index, []); months.push(n.month_index); }
    byMonth.get(n.month_index).push(n);
  }

  const pagePad = { minHeight: "100vh", background: BG, fontFamily: SANS, padding: isMobile ? "1.5rem 1rem 5rem" : "2.5rem 2rem 4rem", paddingLeft: isMobile ? "1rem" : `calc(${SIDEBAR_WIDTH}px + 2rem)` };

  if (phase === "loading") {
    return <div data-sidebar-offset style={{ ...pagePad, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 26, height: 26, borderRadius: "50%", border: `3px solid ${BLUE_SOFT}`, borderTopColor: BLUE, animation: "rm-spin 0.7s linear infinite" }} />
      <style>{`@keyframes rm-spin { to { transform: rotate(360deg) } }`}</style>
    </div>;
  }

  return (
    <div data-sidebar-offset style={pagePad}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');`}</style>

      {phase === "empty" && (
        <GoalEntry onGenerate={handleGenerate} generating={false} atLimit={roadmapUsed >= LIMITS.roadmap_gen} onLimit={() => setLimitModal(true)} />
      )}

      {phase === "generating" && (
        <div style={{ maxWidth: 680, margin: "0 auto", width: "100%" }}>
          <div style={{ textAlign: "center", marginBottom: "2rem" }}>
            <h1 style={{ fontFamily: SANS, fontWeight: 700, fontSize: "1.6rem", color: TEXT, letterSpacing: "-0.02em", marginBottom: 6 }}>Building your roadmap…</h1>
            <p style={{ fontFamily: SANS, fontSize: "0.95rem", color: TEXT_MUTED }}>Mapping your path month by month. This takes a moment.</p>
          </div>
          <TimelineSkeleton />
        </div>
      )}

      {phase === "error" && (
        <div style={{ maxWidth: 480, margin: "3rem auto 0", textAlign: "center" }}>
          <p style={{ fontFamily: SANS, color: "#dc2626", fontWeight: 600, marginBottom: 8 }}>Couldn't build your roadmap.</p>
          <button onClick={() => setPhase("empty")} style={{ fontFamily: SANS, color: BLUE, background: "none", border: "none", cursor: "pointer", fontWeight: 600, textDecoration: "underline" }}>Try again</button>
        </div>
      )}

      {phase === "ready" && roadmap && (
        <div style={{ maxWidth: 680, margin: "0 auto", width: "100%" }}>
          {/* Header */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} style={{ marginBottom: "2rem" }}>
            <p style={{ fontFamily: SANS, fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: BLUE, marginBottom: 6 }}>
              Your roadmap · {roadmap.timeframe_months} months
            </p>
            <h1 style={{ fontFamily: SANS, fontWeight: 700, fontSize: "1.7rem", color: TEXT, letterSpacing: "-0.02em", lineHeight: 1.2 }}>
              {roadmap.goal}
            </h1>
            <p style={{ fontFamily: SANS, fontSize: "0.9rem", color: TEXT_MUTED, marginTop: 8, lineHeight: 1.55 }}>
              The big picture first. Open a node to see resources and add it to your board when you're ready.
            </p>
          </motion.div>

          {/* Vertical timeline — current/near-term at top, future toward bottom */}
          {months.map((mi, idx) => {
            const monthNodes = byMonth.get(mi);
            const label = monthNodes[0]?.month_label || `Month ${mi + 1}`;
            const isNow = idx === 0;
            return (
              <div key={mi} style={{ marginBottom: 26 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, marginLeft: 28 }}>
                  <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 14, color: TEXT, letterSpacing: "-0.01em" }}>{label}</span>
                  {isNow && (
                    <span style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", background: BLUE, color: WHITE, borderRadius: 5, padding: "2px 8px" }}>Now</span>
                  )}
                </div>
                <div style={{ position: "relative", paddingLeft: 28 }}>
                  {/* timeline spine */}
                  <div style={{ position: "absolute", left: 7, top: 4, bottom: idx === months.length - 1 ? 12 : -26, width: 2, background: BORDER }} />
                  {monthNodes.map((node) => (
                    <div key={node.id} style={{ position: "relative", marginBottom: 12 }}>
                      <div style={{ position: "absolute", left: -25, top: 17, width: 12, height: 12, borderRadius: "50%", background: pillarStyle(node.pillar).dot, border: `2px solid ${BG}`, zIndex: 1 }} />
                      <NodeCard node={node} onOpen={openNode} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {limitModal && <LimitModal feature="roadmap_gen" onClose={() => setLimitModal(false)} />}
    </div>
  );
}
