import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { supabase } from "../lib/supabase.js";
import { invalidateCache } from "../lib/cache.js";
import { fetchUsage, LIMITS } from "../lib/usage.js";
import LimitModal from "../components/common/LimitModal.jsx";
import { SIDEBAR_WIDTH } from "../components/common/Sidebar.jsx";
import { useIsMobile } from "../hooks/useIsMobile.js";

const LANGGRAPH_URL = import.meta.env.VITE_LANGGRAPH_CHAT_URL;
const SANS = "'Space Grotesk', sans-serif";
const BG = "#f5f1ed", WHITE = "#fff", BLUE = "#1d4ed8", BLUE_TINT = "#f0f5ff";
const TEXT = "#141413", TEXT_MID = "#3d3d3a", TEXT_MUTED = "#6c6a64", TEXT_FAINT = "#8e8b82", BORDER = "#e6dfd8";
const AMBER_SOFT = "#fef3c7", AMBER = "#d97706", GREEN_SOFT = "#d1fae5", GREEN = "#059669", PURPLE_SOFT = "#ede9fe", PURPLE = "#7c3aed";

const PILLAR_STYLES = {
  Project:  { bg: BLUE_TINT,   color: BLUE },
  Research: { bg: AMBER_SOFT,  color: AMBER },
  Activity: { bg: GREEN_SOFT,  color: GREEN },
  Club:     { bg: PURPLE_SOFT, color: PURPLE },
};

// Reference type → badge label + tint
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

// Render an overview, turning a cited phrase + [n] into a clickable bold link to ref n.
// Prefers the model's "**phrase** [n]" boundary; falls back to the last few words
// before a bare "[n]". Strips any stray markdown asterisks.
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
  const [phase, setPhase] = useState("loading");  // loading | expanding | ready | error | notfound
  const [adding, setAdding] = useState(false);
  const [limitModal, setLimitModal] = useState(false);
  const [expandUsed, setExpandUsed] = useState(0);

  const expand = useCallback(async (n) => {
    setPhase("expanding");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${LANGGRAPH_URL}/roadmap/node/expand`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ node_id: n.id }),
      });
      if (res.status === 429) { setExpandUsed(LIMITS.node_expand); setLimitModal(true); setPhase("ready"); return; }
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.detail || "Expand failed"); }
      const data = await res.json();
      setNode(data);
      setExpandUsed((x) => x + 1);
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
      const [{ data }, usage] = await Promise.all([
        supabase.from("roadmap_nodes").select("*").eq("id", nodeId).single(),
        fetchUsage(supabase),
      ]);
      setExpandUsed(usage.node_expansions_used ?? 0);
      if (!data) { setPhase("notfound"); return; }
      setNode(data);
      if (data.references && data.references.length) { setPhase("ready"); }
      else { expand(data); }  // first open → generate
    })();
  }, [nodeId, expand]);

  const handleAddToBoard = async () => {
    if (adding || !node) return;
    setAdding(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const now = new Date().toISOString();
      const { data: inserted, error } = await supabase.from("quest_items").insert({
        user_id: user.id,
        title: node.title,
        description: node.blurb || null,
        category: node.pillar === "Club" || node.pillar === "Activity" ? "Other" : node.pillar,
        target_axis: node.target_axis || "execution",
        status: "suggested",
        order_index: 0,
        roadmap_node_id: node.id,
        created_at: now, updated_at: now,
      }).select("id").single();
      if (error) throw error;
      await supabase.from("roadmap_nodes").update({ quest_item_id: inserted.id, state: "on_board" }).eq("id", node.id);
      invalidateCache(`quest_items:${user.id}`);
      setNode((n) => ({ ...n, state: "on_board", quest_item_id: inserted.id }));
    } catch (e) {
      console.error("[RoadmapNode] add to board error:", e);
    } finally {
      setAdding(false);
    }
  };

  const ps = node ? (PILLAR_STYLES[node.pillar] || PILLAR_STYLES.Project) : PILLAR_STYLES.Project;
  const pad = { minHeight: "100vh", background: BG, fontFamily: SANS, padding: isMobile ? "1.5rem 1rem 5rem" : "2.5rem 2rem 4rem", paddingLeft: isMobile ? "1rem" : `calc(${SIDEBAR_WIDTH}px + 2rem)` };
  const onBoard = node?.state === "on_board" || node?.state === "done";

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
              {onBoard && <span style={{ marginLeft: "auto", fontFamily: SANS, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: node.state === "done" ? GREEN : AMBER, background: node.state === "done" ? GREEN_SOFT : AMBER_SOFT, borderRadius: 6, padding: "3px 10px" }}>{node.state === "done" ? "Done" : "On board"}</span>}
            </div>
            <h1 style={{ fontFamily: SANS, fontWeight: 700, fontSize: "1.7rem", color: TEXT, letterSpacing: "-0.02em", lineHeight: 1.25, marginBottom: 10 }}>{node.title}</h1>
            {node.blurb && <p style={{ fontFamily: SANS, fontSize: "1rem", color: TEXT_MUTED, lineHeight: 1.6, marginBottom: 24 }}>{node.blurb}</p>}

            {phase === "expanding" && (
              <div>
                <div className="rn-sk" style={{ height: 14, width: "92%", marginBottom: 8 }} />
                <div className="rn-sk" style={{ height: 14, width: "88%", marginBottom: 8 }} />
                <div className="rn-sk" style={{ height: 14, width: "70%", marginBottom: 24 }} />
                {[0,1,2].map((i) => <div key={i} className="rn-sk" style={{ height: 60, marginBottom: 10, borderRadius: 12 }} />)}
                <p style={{ fontFamily: SANS, fontSize: "0.85rem", color: TEXT_FAINT, textAlign: "center", marginTop: 8 }}>Finding the best resources for this node…</p>
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
                {/* Overview with inline-linked phrases */}
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
                        <span style={{ fontFamily: SANS, fontSize: 10, fontWeight: 800, color: WHITE, background: tm.color, borderRadius: 6, padding: "3px 7px", flexShrink: 0, minWidth: 28, textAlign: "center" }}>{ref.id}</span>
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

                {/* Add to board */}
                <button
                  onClick={handleAddToBoard}
                  disabled={onBoard || adding}
                  style={{
                    width: "100%", fontFamily: SANS, fontSize: "1rem", fontWeight: 700,
                    cursor: onBoard ? "default" : "pointer", padding: "14px", borderRadius: 12, border: "none",
                    background: onBoard ? GREEN_SOFT : BLUE, color: onBoard ? GREEN : WHITE,
                    boxShadow: onBoard ? "none" : "0 6px 20px rgba(29,78,216,0.3)", transition: "all 0.15s",
                  }}
                >
                  {onBoard ? "✓ On your quest board" : adding ? "Adding…" : "Add to my board"}
                </button>
                {!onBoard && (
                  <p style={{ fontFamily: SANS, fontSize: "0.8rem", color: TEXT_FAINT, textAlign: "center", marginTop: 10 }}>
                    Adds this as a quest you can track and complete — completing it raises your scorecard.
                  </p>
                )}
              </motion.div>
            )}
          </>
        )}
      </div>

      {limitModal && <LimitModal feature="node_expand" onClose={() => setLimitModal(false)} />}
    </div>
  );
}
