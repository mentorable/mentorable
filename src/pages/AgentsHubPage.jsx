import { useEffect, useState } from "react";
import { requireUser } from "../lib/auth.js";
import { agentsApi } from "../lib/agentsApi.js";
import { AGENTS, BEAKER_LINES } from "../lib/agents/registry.js";
import AgentCard from "../components/agents/AgentCard.jsx";
import { PixelStamp } from "../components/agents/PixelIcons.jsx";
import {
  AMBER_TEXT, BG, SANS, TEXT_MUTED, ringVar, useAgentInk,
} from "../components/agents/agentUi.js";
import { BLOCK_COPY, budgetOf, researchBlock } from "../components/agents/outreach/options.js";
import { SIDEBAR_WIDTH } from "../components/common/Sidebar.jsx";
import { useIsMobile } from "../hooks/useIsMobile.js";

// The Agents hub: every specialist from the registry. The live ones open
// their own screens; the rest sleep as silhouettes until their flag flips.
// Calm shell, playful mascots.

// The real calls. The page takes them as one object so it can be driven with
// made-up data when checking it by hand (see CollegeListPage).
const REAL_API = { requireUser, status: () => agentsApi.status() };

/** Tries left, or why Beaker can't start a new one: out of tries, or out of
 *  research runs (a failed try is given back, its run is not). */
function TriesLine({ tries, block }) {
  const none = !!block;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, color: none ? AMBER_TEXT : TEXT_MUTED,
      fontVariantNumeric: "tabular-nums" }}>
      <PixelStamp kind="letter" size={16} />
      {block === "searches" ? BLOCK_COPY.searches.title : BEAKER_LINES.triesLeft(tries.left, tries.limit)}
      {none && ". Your board still works."}
    </span>
  );
}

export default function AgentsHubPage({ navigate, api = REAL_API }) {
  const isMobile = useIsMobile();
  const ink = useAgentInk();
  const [status, setStatus] = useState(null);   // agentsApi.status() once the backend answers

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let user = null;
      try { user = await api.requireUser(); } catch { user = null; }
      if (cancelled) return;
      if (!user) { navigate?.("/auth"); return; }
      try {
        const s = await api.status();
        if (!cancelled && budgetOf(s?.tries)) setStatus(s);
      } catch (e) {
        // The hub works without it: the card just leaves the count off.
        console.warn("[agents] status failed:", e);
      }
    })();
    return () => { cancelled = true; };
  }, [api, navigate]);

  const tries = budgetOf(status?.tries);
  const block = researchBlock(status);

  const pagePad = {
    minHeight: "100vh", background: BG, fontFamily: SANS, boxSizing: "border-box",
    padding: isMobile ? "1.5rem 1rem 6rem" : "2.5rem 2rem 4rem",
    paddingLeft: isMobile ? "1rem" : `calc(${SIDEBAR_WIDTH}px + 2rem)`,
    ...ringVar(ink),
  };

  return (
    <div data-sidebar-offset style={pagePad}>
      <div style={{ maxWidth: 880, margin: "0 auto", width: "100%" }}>
        <h1 style={{ fontFamily: SANS, fontWeight: 800, fontSize: isMobile ? "2.1rem" : "2.5rem", color: ink.title,
          letterSpacing: "-0.03em", margin: "0 0 0.6rem", lineHeight: 1.1 }}>
          Agents
        </h1>
        <p style={{ fontFamily: SANS, fontSize: "1.15rem", color: TEXT_MUTED, lineHeight: 1.6, margin: "0 0 1.9rem", maxWidth: 640 }}>
          Small helpers with one job each. They do the legwork, and you decide what goes out.
        </p>

        {/* The live agent across the top, the sleeping ones three to a row
            under it (one per row on a phone, where each lies on its side). */}
        <ul aria-label="Agents" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 14,
          gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "repeat(3, minmax(0, 1fr))" }}>
          {AGENTS.map((agent) => (
            <li key={agent.id} style={{ gridColumn: agent.status === "live" ? "1 / -1" : undefined, minWidth: 0 }}>
              <AgentCard agent={agent}
                onOpen={(a) => a.route && navigate?.(a.route)}
                extra={agent.id === "outreach" && tries ? <TriesLine tries={tries} block={block} /> : null} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
