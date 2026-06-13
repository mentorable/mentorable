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

// ─── Re-evaluate diff modal (Preview / Accept New Path / Keep Original) ───────
function ReevalModal({ reeval, applying, onAccept, onKeep }) {
  const proposed = reeval.proposed;
  const monthCount = proposed ? proposed.months.length : 0;
  const nodeCount = proposed ? proposed.months.reduce((s, m) => s + m.nodes.length, 0) : 0;
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(20,20,19,0.45)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}
      onClick={applying ? undefined : onKeep}
    >
      <motion.div
        initial={{ opacity: 0, y: 22, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 560, maxHeight: "85vh", overflowY: "auto", background: BG, borderRadius: 20, border: `1px solid ${BORDER}`, boxShadow: "0 30px 80px rgba(0,0,0,0.3)", padding: "1.75rem" }}
      >
        <p style={{ fontFamily: SANS, fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: BLUE, marginBottom: 6 }}>Preview changes</p>
        <h2 style={{ fontFamily: SANS, fontWeight: 700, fontSize: "1.35rem", color: TEXT, letterSpacing: "-0.02em", marginBottom: 12 }}>An updated path</h2>

        {reeval.loading ? (
          <p style={{ fontFamily: SANS, color: TEXT_MUTED }}>Re-evaluating…</p>
        ) : (
          <>
            <div style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "1rem 1.2rem", marginBottom: 16 }}>
              <p style={{ fontFamily: SANS, fontSize: "0.95rem", color: TEXT_MID, lineHeight: 1.6, margin: 0 }}>{reeval.summary}</p>
            </div>
            <p style={{ fontFamily: SANS, fontSize: "0.8rem", color: TEXT_FAINT, marginBottom: 12 }}>
              Proposed: {monthCount} months · {nodeCount} milestones. Accepting replaces your current roadmap.
            </p>
            <div style={{ maxHeight: 280, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
              {proposed.months.map((m) => (
                <div key={m.month_index}>
                  <p style={{ fontFamily: SANS, fontWeight: 700, fontSize: "0.8rem", color: TEXT, marginBottom: 6 }}>{m.nodes[0]?.month_label || `Month ${m.month_index + 1}`}</p>
                  {m.nodes.map((n, i) => {
                    const ps = pillarStyle(n.pillar);
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: ps.dot, flexShrink: 0 }} />
                        <span style={{ fontFamily: SANS, fontSize: "0.88rem", color: TEXT_MID }}>{n.title}</span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={onKeep} disabled={applying}
                style={{ flex: 1, fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700, cursor: "pointer", padding: "12px", borderRadius: 11, border: `1.5px solid ${BORDER}`, background: WHITE, color: TEXT_MID }}>
                Keep original
              </button>
              <button onClick={onAccept} disabled={applying}
                style={{ flex: 1, fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700, cursor: "pointer", padding: "12px", borderRadius: 11, border: "none", background: BLUE, color: WHITE, boxShadow: "0 6px 18px rgba(29,78,216,0.3)" }}>
                {applying ? "Applying…" : "Accept new path"}
              </button>
            </div>
          </>
        )}
      </motion.div>
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
  const [reevalUsed, setReevalUsed] = useState(0);
  const [limitModal, setLimitModal] = useState(false);
  const [limitFeature, setLimitFeature] = useState("roadmap_gen");
  const [reeval, setReeval] = useState(null);   // { loading, summary, proposed } | null
  const [applying, setApplying] = useState(false);
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
      setReevalUsed(usage.roadmap_reevals_used ?? 0);

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
      if (res.status === 429) { setRoadmapUsed(LIMITS.roadmap_gen); showLimit("roadmap_gen"); setPhase("empty"); return; }
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

  const showLimit = (feature) => { setLimitFeature(feature); setLimitModal(true); };

  const handleReevaluate = useCallback(async () => {
    if (!roadmap) return;
    if (reevalUsed >= LIMITS.roadmap_reeval) { showLimit("roadmap_reeval"); return; }
    setReeval({ loading: true });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${LANGGRAPH_URL}/roadmap/reevaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ roadmap_id: roadmap.id }),
      });
      if (res.status === 429) { setReeval(null); setReevalUsed(LIMITS.roadmap_reeval); showLimit("roadmap_reeval"); return; }
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.detail || "Re-evaluation failed"); }
      const data = await res.json();
      setReevalUsed((n) => n + 1);
      setReeval({ loading: false, summary: data.summary, proposed: data.proposed });
    } catch (e) {
      console.error("[Roadmap] reevaluate error:", e);
      setReeval(null);
    }
  }, [roadmap, reevalUsed]);

  // Accept New Path: archive the current roadmap, write the proposed one (direct RLS).
  const handleAcceptPath = useCallback(async () => {
    if (!reeval?.proposed || !roadmap) return;
    setApplying(true);
    try {
      const uid = userIdRef.current;
      await supabase.from("roadmaps").update({ status: "archived" }).eq("id", roadmap.id);
      const { data: newRm, error: rmErr } = await supabase.from("roadmaps").insert({
        user_id: uid, goal: roadmap.goal, timeframe_months: reeval.proposed.timeframe_months,
        start_month: new Date().toISOString().slice(0, 10), status: "active",
      }).select().single();
      if (rmErr) throw rmErr;
      const rows = [];
      for (const m of reeval.proposed.months) {
        for (const n of m.nodes) {
          rows.push({
            roadmap_id: newRm.id, user_id: uid, month_index: n.month_index, month_label: n.month_label,
            pillar: n.pillar, title: n.title, blurb: n.blurb, target_axis: n.target_axis,
            state: "explore", order_index: n.order_index,
          });
        }
      }
      const { data: newNodes } = await supabase.from("roadmap_nodes").insert(rows).select();
      setRoadmap(newRm);
      setNodes(newNodes || []);
      setReeval(null);
    } catch (e) {
      console.error("[Roadmap] accept path error:", e);
    } finally {
      setApplying(false);
    }
  }, [reeval, roadmap]);

  // Group nodes by month_index (already sorted ascending = current → future, top → bottom)
  const months = [];
  const byMonth = new Map();
  for (const n of nodes) {
    if (!byMonth.has(n.month_index)) { byMonth.set(n.month_index, []); months.push(n.month_index); }
    byMonth.get(n.month_index).push(n);
  }

  // Which month is "current" (elapsed since the roadmap started), and a reminder if
  // the current focus still has unopened nodes.
  let currentMonthIndex = 0;
  if (roadmap?.start_month) {
    const s = new Date(roadmap.start_month + "T00:00:00");
    const now = new Date();
    currentMonthIndex = Math.max(0, (now.getFullYear() - s.getFullYear()) * 12 + (now.getMonth() - s.getMonth()));
  }
  const dueNodes = nodes.filter((n) => n.month_index <= currentMonthIndex && n.state === "explore");
  const currentLabel = byMonth.get(currentMonthIndex)?.[0]?.month_label
    || nodes.find((n) => n.month_index === Math.min(...months.length ? months : [0]))?.month_label || "";

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
        <GoalEntry onGenerate={handleGenerate} generating={false} atLimit={roadmapUsed >= LIMITS.roadmap_gen} onLimit={() => showLimit("roadmap_gen")} />
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
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} style={{ marginBottom: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <p style={{ fontFamily: SANS, fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: BLUE, marginBottom: 6 }}>
                Your roadmap · {roadmap.timeframe_months} months
              </p>
              <button
                onClick={handleReevaluate}
                disabled={reeval?.loading}
                style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6, fontFamily: SANS, fontSize: "0.82rem", fontWeight: 600, cursor: "pointer", color: BLUE, background: WHITE, border: `1.5px solid ${BLUE_SOFT}`, borderRadius: 9, padding: "6px 12px" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>
                {reeval?.loading ? "Re-evaluating…" : "Re-evaluate"}
              </button>
            </div>
            <h1 style={{ fontFamily: SANS, fontWeight: 700, fontSize: "1.7rem", color: TEXT, letterSpacing: "-0.02em", lineHeight: 1.2 }}>
              {roadmap.goal}
            </h1>
            <p style={{ fontFamily: SANS, fontSize: "0.9rem", color: TEXT_MUTED, marginTop: 8, lineHeight: 1.55 }}>
              The big picture first. Open a node to see resources and add it to your board when you're ready.
            </p>
          </motion.div>

          {/* Reminder — current focus has unopened nodes */}
          {dueNodes.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }}
              onClick={() => openNode(dueNodes[0])}
              style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", background: BLUE_TINT, border: `1.5px solid ${BLUE_SOFT}`, borderRadius: 14, padding: "12px 16px", marginBottom: "1.75rem" }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: BLUE, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={WHITE} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontFamily: SANS, fontWeight: 700, fontSize: "0.92rem", color: TEXT }}>
                  {currentLabel ? `${currentLabel} is here — time to start` : "Time to start"}
                </p>
                <p style={{ fontFamily: SANS, fontSize: "0.82rem", color: TEXT_MUTED }}>
                  {dueNodes.length} node{dueNodes.length > 1 ? "s" : ""} ready to open. Tap to begin with one.
                </p>
              </div>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="9 18 15 12 9 6"/></svg>
            </motion.div>
          )}

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

      {limitModal && <LimitModal feature={limitFeature} onClose={() => setLimitModal(false)} />}
      {reeval && <ReevalModal reeval={reeval} applying={applying} onAccept={handleAcceptPath} onKeep={() => setReeval(null)} />}
    </div>
  );
}
