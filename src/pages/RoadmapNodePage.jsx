import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase.js";
import { SIDEBAR_WIDTH } from "../components/common/Sidebar.jsx";
import { useIsMobile } from "../hooks/useIsMobile.js";

// Minimal node page (Phase 2). Phase 3 adds the Brave-sourced reference package,
// the inline-linked overview, and "Add to my board".
const SANS = "'Space Grotesk', sans-serif";
const BG = "#f5f1ed", WHITE = "#fff", BLUE = "#1d4ed8", BLUE_TINT = "#f0f5ff";
const TEXT = "#141413", TEXT_MUTED = "#6c6a64", TEXT_FAINT = "#8e8b82", BORDER = "#e6dfd8";
const AMBER_SOFT = "#fef3c7", AMBER = "#d97706", GREEN_SOFT = "#d1fae5", GREEN = "#059669", PURPLE_SOFT = "#ede9fe", PURPLE = "#7c3aed";
const PILLAR_STYLES = {
  Project:  { bg: BLUE_TINT,   color: BLUE },
  Research: { bg: AMBER_SOFT,  color: AMBER },
  Activity: { bg: GREEN_SOFT,  color: GREEN },
  Club:     { bg: PURPLE_SOFT, color: PURPLE },
};

export default function RoadmapNodePage({ navigate, nodeId }) {
  const isMobile = useIsMobile();
  const [node, setNode] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/auth"; return; }
      const { data } = await supabase.from("roadmap_nodes").select("*").eq("id", nodeId).single();
      setNode(data || null);
      setLoading(false);
    })();
  }, [nodeId]);

  const ps = node ? (PILLAR_STYLES[node.pillar] || PILLAR_STYLES.Project) : PILLAR_STYLES.Project;
  const pad = { minHeight: "100vh", background: BG, fontFamily: SANS, padding: isMobile ? "1.5rem 1rem 5rem" : "2.5rem 2rem 4rem", paddingLeft: isMobile ? "1rem" : `calc(${SIDEBAR_WIDTH}px + 2rem)` };

  return (
    <div data-sidebar-offset style={pad}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');`}</style>
      <div style={{ maxWidth: 640, margin: "0 auto", width: "100%" }}>
        <button onClick={() => navigate("/roadmap")} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: SANS, fontSize: "0.88rem", fontWeight: 600, color: TEXT_MUTED, background: "none", border: "none", cursor: "pointer", marginBottom: "1.5rem", padding: 0 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          Back to roadmap
        </button>

        {loading && <p style={{ fontFamily: SANS, color: TEXT_FAINT }}>Loading…</p>}

        {!loading && !node && <p style={{ fontFamily: SANS, color: "#dc2626" }}>Node not found.</p>}

        {!loading && node && (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              <span style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", background: ps.bg, color: ps.color, borderRadius: 6, padding: "3px 10px" }}>{node.pillar}</span>
              <span style={{ fontFamily: SANS, fontSize: 11, fontWeight: 600, color: TEXT_FAINT, padding: "3px 4px" }}>{node.month_label}</span>
            </div>
            <h1 style={{ fontFamily: SANS, fontWeight: 700, fontSize: "1.6rem", color: TEXT, letterSpacing: "-0.02em", lineHeight: 1.25, marginBottom: 12 }}>{node.title}</h1>
            {node.blurb && <p style={{ fontFamily: SANS, fontSize: "1rem", color: TEXT_MUTED, lineHeight: 1.6, marginBottom: 24 }}>{node.blurb}</p>}

            <div style={{ background: WHITE, border: `1px dashed ${BORDER}`, borderRadius: 16, padding: "2rem", textAlign: "center" }}>
              <p style={{ fontFamily: SANS, fontSize: "0.95rem", color: TEXT_MUTED, lineHeight: 1.6 }}>
                Curated resources and an overview for this node are coming next.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
