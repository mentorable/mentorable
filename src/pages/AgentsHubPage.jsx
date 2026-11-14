import { useEffect, useState } from "react";
import { requireUser } from "../lib/auth.js";
import { agentsApi } from "../lib/agentsApi.js";
import { AGENTS, BEAKER_LINES, POISE_LINES, QUILL_LINES, TALON_LINES } from "../lib/agents/registry.js";
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
  essayStatus: () => agentsApi.essayStatus(),
  interviewStatus: () => agentsApi.interviewStatus(),
};

/** A count line under an agent's tagline: a stamp, then the words. Amber when
 *  the agent can't start anything new, with `still`, what does still work
 *  (the board, for Beaker and Talon). */
function CountLine({ stamp, stopped, still = "Your board still works.", children }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, color: stopped ? AMBER_TEXT : TEXT_MUTED,
      fontVariantNumeric: "tabular-nums" }}>
      <PixelStamp kind={stamp} size={16} />
      <span>
        {children}
        {stopped && `. ${still}`}
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

/** Reviews left. With none, Quill can't read another draft, but writing,
 *  saving versions and the notes it already left all still work. */
function ReviewsLine({ reviews }) {
  return (
    <CountLine stamp="scroll" stopped={reviews.left <= 0} still="You can still write and save here.">
      {QUILL_LINES.reviewsLeft(reviews.left, reviews.limit)}
    </CountLine>
  );
}

/** Practice interviews left. With none, Poise can't start another, but the
 *  reports of the earlier ones still open. */
function MocksLine({ mocks }) {
  return (
    <CountLine stamp="chat" stopped={mocks.left <= 0} still="Your reports still open.">
      {POISE_LINES.mocksLeft(mocks.left, mocks.limit)}
    </CountLine>
  );
}

/** Poise's status as { left, limit }, or null when the count could not be
 *  read (mocks_left is null then: the card says nothing rather than "0 left"). */
function mocksOf(s) {
  return s && Number.isFinite(s.mocks_left) && Number.isFinite(s.mocks_limit)
    ? { left: s.mocks_left, limit: s.mocks_limit }
    : null;
}

export default function AgentsHubPage({ navigate, api = REAL_API }) {
  const isMobile = useIsMobile();
  const ink = useAgentInk();
  const [status, setStatus] = useState(null);   // agentsApi.status() once the backend answers
  const [finder, setFinder] = useState(null);   // agentsApi.finderStatus(), likewise
  const [essay, setEssay] = useState(null);     // agentsApi.essayStatus(), likewise
  const [interview, setInterview] = useState(null);   // agentsApi.interviewStatus(), likewise

  useEffect(() => {
    let cancelled = false;
    // Each agent's count is fetched on its own: any of them can fail (or be
    // slow) without holding up or hiding the others. The hub works without
    // them, and the card just leaves its count off.
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
        load("essay status", () => api.essayStatus?.(), (s) => !!budgetOf(s?.reviews), setEssay),
        load("interview status", () => api.interviewStatus?.(), (s) => !!mocksOf(s), setInterview),
      ]);
    })();
    return () => { cancelled = true; };
  }, [api, navigate]);

  const tries = budgetOf(status?.tries);
  const block = researchBlock(status);
  const finds = budgetOf(finder?.finds);
  const searches = budgetOf(finder?.searches);
  const reviews = budgetOf(essay?.reviews);
  const mocks = mocksOf(interview);

  const extraFor = (agent) => {
    if (agent.id === "outreach" && tries) return <TriesLine tries={tries} block={block} />;
    if (agent.id === "finder" && finds) return <FindsLine finds={finds} searches={searches} />;
    if (agent.id === "essay" && reviews) return <ReviewsLine reviews={reviews} />;
    if (agent.id === "interview" && mocks) return <MocksLine mocks={mocks} />;
    return null;
  };

  // The live agents sit two to a row on a wide screen, each card stacked
  // (mascot tile on top), so the four read as a team and the last one is not
  // a screen away. The sleeping ones share the rows under them, as many to a
  // row as there are (up to three), so two teasers sit side by side rather
  // than leaving a gap, and one alone takes the row. The grid has six tracks
  // so both fit: a live card spans three, a teaser 6 / columns. The first
  // teaser after a live card starts a fresh row, so an odd live card out is
  // never shoulder to shoulder with a silhouette. One column on a phone,
  // where each teaser lies on its side.
  const soonCount = AGENTS.filter((a) => a.status !== "live").length;
  const columns = Math.min(3, Math.max(1, soonCount));
  const spanOf = (agent, i) => {
    if (isMobile) return undefined;
    if (agent.status === "live") return "span 3";
    const startsRow = i === 0 || AGENTS[i - 1].status === "live";
    return `${startsRow ? "1 / " : ""}span ${6 / columns}`;
  };

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
          gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "repeat(6, minmax(0, 1fr))" }}>
          {AGENTS.map((agent, i) => (
            <li key={agent.id} style={{ gridColumn: spanOf(agent, i), minWidth: 0 }}>
              <AgentCard agent={agent} layout="stacked"
                onOpen={(a) => a.route && navigate?.(a.route)}
                extra={extraFor(agent)} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
