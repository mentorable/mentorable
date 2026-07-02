import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../lib/supabase.js";
import { fetchUsage, LIMITS } from "../lib/usage.js";
import LimitModal from "../components/common/LimitModal.jsx";
import { SIDEBAR_WIDTH } from "../components/common/Sidebar.jsx";
import { useIsMobile } from "../hooks/useIsMobile.js";

const LANGGRAPH_URL = import.meta.env.VITE_LANGGRAPH_CHAT_URL;
const SANS = "'Space Grotesk', sans-serif";
const BG = "#f5f1ed", WHITE = "#fff", BLUE = "#1d4ed8", BLUE_TINT = "#f0f5ff", BLUE_SOFT = "#dbeafe";
const TEXT = "#141413", TEXT_MID = "#3d3d3a", TEXT_MUTED = "#494742", TEXT_FAINT = "#6a6760", BORDER = "#e6dfd8";
const AMBER_SOFT = "#fef3c7", AMBER = "#d97706", GREEN_SOFT = "#d1fae5", GREEN = "#059669", PURPLE_SOFT = "#ede9fe", PURPLE = "#7c3aed";

const PILLAR_STYLES = {
  Project:  { bg: BLUE_TINT,   color: BLUE },
  Research: { bg: AMBER_SOFT,  color: AMBER },
  Activity: { bg: GREEN_SOFT,  color: GREEN },
  Club:     { bg: PURPLE_SOFT, color: PURPLE },
};

const AXIS_LABELS = {
  communication: "Communication", leadership: "Leadership", technicality: "Technicality",
  resourcefulness: "Resourcefulness", execution: "Execution",
};

const TYPE_META = {
  doc:       { label: "Docs",     color: BLUE },
  video:     { label: "Video",    color: "#dc2626" },
  platform:  { label: "Platform", color: GREEN },
  course:    { label: "Course",   color: PURPLE },
  paper:     { label: "Paper",    color: AMBER },
  framework: { label: "Framework",color: BLUE },
  article:   { label: "Article",  color: TEXT_MUTED },
};
const typeMeta = (t) => TYPE_META[t] || TYPE_META.article;

function renderOverview(text, references) {
  if (!text) return null;
  const refById = new Map((references || []).map((r) => [r.id, r]));
  const re = /\*\*(.+?)\*\*\s*\[(\d+)\]|([\w'’\-]+(?:\s+[\w'’\-]+){0,4})\s*\[(\d+)\]/g;
  const out = [];
  let last = 0, m, key = 0;
  while ((m = re.exec(text)) !== null) {
    const phrase = m[1] ?? m[3];
    const num = m[2] ?? m[4];
    const before = text.slice(last, m.index).replace(/\*\*/g, "");
    if (before) out.push(<span key={key++}>{before}</span>);
    const ref = refById.get(parseInt(num, 10));
    if (ref) {
      out.push(
        <a key={key++} href={ref.url} target="_blank" rel="noopener noreferrer"
          style={{ fontWeight: 700, color: BLUE, textDecoration: "none", borderBottom: `1.5px solid ${BLUE}40`, cursor: "pointer" }}>
          {phrase}
        </a>
      );
    } else {
      out.push(<span key={key++}>{phrase} [{num}]</span>);
    }
    last = m.index + m[0].length;
  }
  const tail = text.slice(last).replace(/\*\*/g, "");
  if (tail) out.push(<span key={key++}>{tail}</span>);
  return out;
}

export default function RoadmapNodePage({ navigate, nodeId }) {
  const isMobile = useIsMobile();
  const [node, setNode] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [phase, setPhase] = useState("loading");  // loading | expanding | ready | error | notfound
  const [limitModal, setLimitModal] = useState(false);
  const [pendingTask, setPendingTask] = useState(null);   // task id mid-toggle
  const [award, setAward] = useState(null);               // { delta, axis } transient toast

  const expand = useCallback(async (n) => {
    setPhase("expanding");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${LANGGRAPH_URL}/roadmap/node/expand`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ node_id: n.id }),
      });
      if (res.status === 429) { setLimitModal(true); setPhase("ready"); return; }
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.detail || "Expand failed"); }
      const data = await res.json();
      setNode(data);
      setTasks(data.tasks || []);
      setPhase("ready");
    } catch (e) {
      console.error("[RoadmapNode] expand error:", e);
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/auth"; return; }
      const [{ data }, , { data: existingTasks }] = await Promise.all([
        supabase.from("roadmap_nodes").select("*").eq("id", nodeId).single(),
        fetchUsage(supabase),
        supabase.from("roadmap_tasks").select("*").eq("node_id", nodeId).order("order_index"),
      ]);
      if (!data) { setPhase("notfound"); return; }
      setNode(data);
      setTasks(existingTasks || []);
      if (data.references && data.references.length) { setPhase("ready"); }
      else { expand(data); }  // first open → generate resources + tasks
    })();
  }, [nodeId, expand]);

  const toggleTask = async (task) => {
    if (pendingTask) return;
    const action = task.done ? "uncheck" : "check";
    setPendingTask(task.id);
    // optimistic
    setTasks((ts) => ts.map((t) => t.id === task.id ? { ...t, done: !t.done } : t));
    try {
      const { data, error } = await supabase.functions.invoke("toggle-roadmap-task", { body: { taskId: task.id, action } });
      if (error) throw error;
      if (action === "check" && data?.award?.delta > 0) {
        setAward({ delta: data.award.delta, axis: data.axis });
        setTimeout(() => setAward(null), 2200);
      }
      // reflect node completion roll-up
      if (data?.node_state) setNode((n) => n ? { ...n, state: data.node_state } : n);
    } catch (e) {
      console.error("[RoadmapNode] toggle error:", e);
      setTasks((ts) => ts.map((t) => t.id === task.id ? { ...t, done: task.done } : t));  // revert
    } finally {
      setPendingTask(null);
    }
  };

  const ps = node ? (PILLAR_STYLES[node.pillar] || PILLAR_STYLES.Project) : PILLAR_STYLES.Project;
  const pad = { minHeight: "100vh", background: BG, fontFamily: SANS, padding: isMobile ? "1.5rem 1rem 5rem" : "2.5rem 2rem 4rem", paddingLeft: isMobile ? "1rem" : `calc(${SIDEBAR_WIDTH}px + 2rem)` };
  const isDone = node?.state === "done";
  const doneCount = tasks.filter((t) => t.done).length;

  return (
    <div data-sidebar-offset style={pad}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');
        @keyframes rn-shimmer { 0% { background-position: -480px 0 } 100% { background-position: 480px 0 } }
        .rn-sk { background: linear-gradient(90deg, ${BORDER}55 25%, ${BORDER}aa 50%, ${BORDER}55 75%); background-size: 480px 100%; animation: rn-shimmer 1.5s infinite; border-radius: 8px; }
      `}</style>

      <div style={{ maxWidth: 640, margin: "0 auto", width: "100%" }}>
        <button onClick={() => navigate("/roadmap")} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: SANS, fontSize: "0.88rem", fontWeight: 600, color: TEXT_MUTED, background: "none", border: "none", cursor: "pointer", marginBottom: "1.5rem", padding: 0 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          Back to roadmap
        </button>

        {phase === "loading" && <p style={{ fontFamily: SANS, color: TEXT_FAINT }}>Loading…</p>}
        {phase === "notfound" && <p style={{ fontFamily: SANS, color: "#dc2626" }}>Node not found.</p>}

        {node && phase !== "loading" && phase !== "notfound" && (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center" }}>
              <span style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", background: ps.bg, color: ps.color, borderRadius: 6, padding: "3px 10px" }}>{node.pillar}</span>
              <span style={{ fontFamily: SANS, fontSize: 11, fontWeight: 600, color: TEXT_FAINT }}>{node.month_label}</span>
              {isDone && <span style={{ marginLeft: "auto", fontFamily: SANS, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: GREEN, background: GREEN_SOFT, borderRadius: 6, padding: "3px 10px" }}>Done</span>}
            </div>
            <h1 style={{ fontFamily: SANS, fontWeight: 700, fontSize: "1.7rem", color: TEXT, letterSpacing: "-0.02em", lineHeight: 1.25, marginBottom: 10 }}>{node.title}</h1>
            {node.blurb && <p style={{ fontFamily: SANS, fontSize: "1rem", color: TEXT_MUTED, lineHeight: 1.6, marginBottom: 24 }}>{node.blurb}</p>}

            {phase === "expanding" && (
              <div>
                <div className="rn-sk" style={{ height: 14, width: "92%", marginBottom: 8 }} />
                <div className="rn-sk" style={{ height: 14, width: "88%", marginBottom: 8 }} />
                <div className="rn-sk" style={{ height: 14, width: "70%", marginBottom: 24 }} />
                {[0,1,2].map((i) => <div key={i} className="rn-sk" style={{ height: 60, marginBottom: 10, borderRadius: 12 }} />)}
                <p style={{ fontFamily: SANS, fontSize: "0.85rem", color: TEXT_FAINT, textAlign: "center", marginTop: 8 }}>Finding the best resources and building your checklist…</p>
              </div>
            )}

            {phase === "error" && (
              <div style={{ textAlign: "center", padding: "1rem 0" }}>
                <p style={{ fontFamily: SANS, color: "#dc2626", fontWeight: 600, marginBottom: 8 }}>Couldn't load resources.</p>
                <button onClick={() => expand(node)} style={{ fontFamily: SANS, color: BLUE, background: "none", border: "none", cursor: "pointer", fontWeight: 600, textDecoration: "underline" }}>Try again</button>
              </div>
            )}

            {phase === "ready" && node.references && node.references.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
                {/* Checklist — first, so it's the first thing you act on */}
                {tasks.length > 0 && (
                  <div style={{ marginBottom: 28 }}>
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
                      <p style={{ fontFamily: SANS, fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: BLUE, margin: 0 }}>Your checklist</p>
                      <span style={{ fontFamily: SANS, fontSize: "0.82rem", fontWeight: 700, color: isDone ? GREEN : TEXT_MUTED }}>{doneCount}/{tasks.length} done</span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {tasks.map((task) => (
                        <button key={task.id} onClick={() => toggleTask(task)} disabled={pendingTask === task.id}
                          style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", cursor: "pointer", background: WHITE, border: `1px solid ${task.done ? GREEN_SOFT : BORDER}`, borderRadius: 12, padding: "12px 14px", transition: "border-color 0.15s" }}>
                          <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 7, display: "inline-flex", alignItems: "center", justifyContent: "center", border: `2px solid ${task.done ? GREEN : BORDER}`, background: task.done ? GREEN : WHITE, transition: "all 0.15s" }}>
                            {task.done && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={WHITE} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                          </span>
                          <span style={{ fontFamily: SANS, fontSize: "0.95rem", fontWeight: 500, color: task.done ? TEXT_FAINT : TEXT, lineHeight: 1.4, textDecoration: task.done ? "line-through" : "none" }}>{task.text}</span>
                        </button>
                      ))}
                    </div>
                    <p style={{ fontFamily: SANS, fontSize: "0.8rem", color: TEXT_FAINT, marginTop: 12 }}>
                      Check tasks off as you finish them. Each one nudges your scorecard up. The resources below help you get there.
                    </p>
                  </div>
                )}

                {node.overview && (
                  <div style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 16, padding: "1.4rem 1.5rem", marginBottom: 24 }}>
                    <p style={{ fontFamily: SANS, fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: BLUE, marginBottom: 10 }}>Overview</p>
                    <p style={{ fontFamily: SANS, fontSize: "1rem", color: TEXT_MID, lineHeight: 1.7, margin: 0 }}>
                      {renderOverview(node.overview, node.references)}
                    </p>
                  </div>
                )}

                {/* References */}
                <p style={{ fontFamily: SANS, fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: TEXT_FAINT, marginBottom: 12 }}>Resources</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28 }}>
                  {node.references.map((ref) => {
                    const tm = typeMeta(ref.type);
                    return (
                      <a key={ref.id} href={ref.url} target="_blank" rel="noopener noreferrer"
                        style={{ display: "flex", alignItems: "center", gap: 12, background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "13px 16px", textDecoration: "none", transition: "border-color 0.15s, transform 0.15s" }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = BLUE; e.currentTarget.style.transform = "translateY(-1px)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.transform = "none"; }}>
                        <span style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, color: WHITE, background: tm.color, borderRadius: 6, padding: "3px 7px", flexShrink: 0, minWidth: 28, textAlign: "center" }}>{ref.id}</span>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: "0.95rem", color: TEXT, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ref.title}</div>
                          <div style={{ fontFamily: SANS, fontSize: "0.78rem", color: TEXT_FAINT, marginTop: 2 }}>
                            <span style={{ fontWeight: 700, color: tm.color }}>{tm.label}</span> · {ref.source}
                          </div>
                        </div>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={TEXT_FAINT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M7 17L17 7M7 7h10v10"/></svg>
                      </a>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </>
        )}
      </div>

      {/* Transient axis-award toast */}
      <AnimatePresence>
        {award && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
            style={{ position: "fixed", bottom: isMobile ? "calc(72px + env(safe-area-inset-bottom, 0px))" : 24, left: "50%", transform: "translateX(-50%)", zIndex: 400, display: "flex", alignItems: "center", gap: 8, background: "#141413", color: "#fff", padding: "10px 16px", borderRadius: 12, boxShadow: "0 10px 30px rgba(0,0,0,0.25)" }}>
            <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: "1rem", color: "#34d399" }}>+{award.delta}</span>
            <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: "0.9rem" }}>{AXIS_LABELS[award.axis] || award.axis}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {limitModal && <LimitModal feature="node_expand" onClose={() => setLimitModal(false)} />}
    </div>
  );
}
