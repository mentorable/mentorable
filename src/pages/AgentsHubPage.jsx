import { useEffect, useState } from "react";
import { requireUser } from "../lib/auth.js";
import { agentsApi } from "../lib/agentsApi.js";
import { AGENTS, BEAKER_LINES, TALON_LINES } from "../lib/agents/registry.js";
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
const REAL_API = {
  requireUser,
  status: () => agentsApi.status(),
  finderStatus: () => agentsApi.finderStatus(),
};

/** A count line under an agent's tagline: a stamp, then the words. Amber when
 *  the agent can't start anything new (its board still works). */
function CountLine({ stamp, stopped, children }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, color: stopped ? AMBER_TEXT : TEXT_MUTED,
      fontVariantNumeric: "tabular-nums" }}>
      <PixelStamp kind={stamp} size={16} />
      <span>
        {children}
        {stopped && ". Your board still works."}
      </span>
    </span>
  );
}

/** Tries left, or why Beaker can't start a new one: out of tries, or out of
 *  research runs (a failed try is given back, its run is not). */
function TriesLine({ tries, block }) {
  return (
    <CountLine stamp="letter" stopped={!!block}>
      {block === "searches" ? BLOCK_COPY.searches.title : BEAKER_LINES.triesLeft(tries.left, tries.limit)}
    </CountLine>
  );
}

/** Finds left, or why Talon can't start a new one. A failed find is given
 *  back but its paid search is not, so searches can run out first. */
function FindsLine({ finds, searches }) {
  const noSearches = finds.left > 0 && !!searches && searches.left <= 0;
  return (
    <CountLine stamp="star" stopped={finds.left <= 0 || noSearches}>
      {noSearches ? "No searches left" : TALON_LINES.findsLeft(finds.left, finds.limit)}
    </CountLine>
  );
}

export default function AgentsHubPage({ navigate, api = REAL_API }) {
  const isMobile = useIsMobile();
  const ink = useAgentInk();
  const [status, setStatus] = useState(null);   // agentsApi.status() once the backend answers
  const [finder, setFinder] = useState(null);   // agentsApi.finderStatus(), likewise

  useEffect(() => {
    let cancelled = false;
    // Each agent's count is fetched on its own: either can fail (or be slow)
    // without holding up or hiding the other. The hub works without them,
    // and the card just leaves its count off.
    const load = async (name, get, ok, set) => {
      try {
        const s = await get();
        if (!cancelled && ok(s)) set(s);
      } catch (e) {
        console.warn(`[agents] ${name} failed:`, e);
      }
    };
    (async () => {
      let user = null;
      try { user = await api.requireUser(); } catch { user = null; }
      if (cancelled) return;
      if (!user) { navigate?.("/auth"); return; }
      await Promise.all([
        load("status", () => api.status(), (s) => !!budgetOf(s?.tries), setStatus),
        load("finder status", () => api.finderStatus?.(), (s) => !!budgetOf(s?.finds), setFinder),
      ]);
    })();
    return () => { cancelled = true; };
  }, [api, navigate]);

  const tries = budgetOf(status?.tries);
  const block = researchBlock(status);
  const finds = budgetOf(finder?.finds);
  const searches = budgetOf(finder?.searches);

  const extraFor = (agent) => {
    if (agent.id === "outreach" && tries) return <TriesLine tries={tries} block={block} />;
    if (agent.id === "finder" && finds) return <FindsLine finds={finds} searches={searches} />;
    return null;
  };

  // The live agents each take a full row; the sleeping ones share the rows
  // under them, as many to a row as there are (up to three), so two teasers
  // sit side by side rather than leaving a gap. One per row on a phone, where
  // each lies on its side.
  const soonCount = AGENTS.filter((a) => a.status !== "live").length;
  const columns = Math.min(3, Math.max(1, soonCount));

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

        <ul aria-label="Agents" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 14,
          gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : `repeat(${columns}, minmax(0, 1fr))` }}>
          {AGENTS.map((agent) => (
            <li key={agent.id} style={{ gridColumn: agent.status === "live" ? "1 / -1" : undefined, minWidth: 0 }}>
              <AgentCard agent={agent}
                onOpen={(a) => a.route && navigate?.(a.route)}
                extra={extraFor(agent)} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
