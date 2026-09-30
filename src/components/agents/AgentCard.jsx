import Mascot from "./Mascot.jsx";
import { PixelArrow } from "./PixelIcons.jsx";
import { useIsMobile } from "../../hooks/useIsMobile.js";
import {
  BORDER, FOCUS_CLASS, PRESS_CLASS, RADIUS, SANS, TEXT, TEXT_MID, TEXT_MUTED, WHITE, ringVar, useAgentInk,
} from "./agentUi.js";

// A card on the Agents hub. A live agent: its mascot idling on a soft tile of
// the student's accent, name, role, tagline, an optional extra line (tries
// left) and an Open button. An agent still to come: a sleeping silhouette,
// "???", one hint word and "Arriving soon". Never a promise of what it does,
// and not clickable.

const MUTED_TILE = "#efedf3";   // the silhouettes' own quiet background

function LiveCard({ agent, onOpen, extra }) {
  const ink = useAgentInk();
  return (
    <article aria-labelledby={`agent-${agent.id}-name`}
      style={{ ...ringVar(ink), background: WHITE, border: `1px solid ${BORDER}`, borderRadius: RADIUS.card,
        padding: 16, display: "flex", flexWrap: "wrap", gap: "16px 22px", alignItems: "stretch", boxSizing: "border-box",
        height: "100%" }}>
      <div style={{ flex: "0 0 auto", width: 168, maxWidth: "100%", minHeight: 150, background: ink.softer,
        border: `1px solid ${ink.soft}`, borderRadius: RADIUS.control, display: "flex", alignItems: "flex-end",
        justifyContent: "center", padding: "14px 0 10px", boxSizing: "border-box", marginInline: "auto" }}>
        <Mascot agent={agent.mascot} state="idle" size={128} />
      </div>
      <div style={{ flex: "1 1 240px", minWidth: 0, display: "flex", flexDirection: "column" }}>
        <h2 id={`agent-${agent.id}-name`} style={{ margin: 0, fontFamily: SANS, fontWeight: 800, fontSize: "1.5rem",
          color: TEXT, letterSpacing: "-0.02em", lineHeight: 1.2 }}>
          {agent.name}
        </h2>
        {agent.role && (
          <p style={{ margin: "4px 0 0", fontFamily: SANS, fontWeight: 700, fontSize: "1rem", color: ink.text }}>
            {agent.role}
          </p>
        )}
        {agent.tagline && (
          <p style={{ margin: "10px 0 0", fontFamily: SANS, fontSize: "1.05rem", color: TEXT_MID, lineHeight: 1.55 }}>
            {agent.tagline}
          </p>
        )}
        {extra && (
          <div style={{ marginTop: 10, fontFamily: SANS, fontSize: "0.95rem", fontWeight: 600, color: TEXT_MUTED }}>
            {extra}
          </div>
        )}
        <div style={{ marginTop: "auto", paddingTop: 16 }}>
          <button type="button" className={`${FOCUS_CLASS} ${PRESS_CLASS}`} onClick={() => onOpen?.(agent)}
            aria-label={`Open ${agent.name}`}
            style={{ fontFamily: SANS, fontSize: "1rem", fontWeight: 700, cursor: "pointer", minHeight: 44,
              padding: "10px 22px", borderRadius: RADIUS.control, border: "none", background: ink.button.bg,
              color: ink.button.fg, display: "inline-flex", alignItems: "center", gap: 8 }}>
            Open
            <PixelArrow size={16} />
          </button>
        </div>
      </div>
    </article>
  );
}

// Standing up in a row of three; on a phone, lying on its side, one per row.
function SoonCard({ agent }) {
  const flat = useIsMobile();
  return (
    <div role="group" aria-disabled="true" aria-label={`A new agent, arriving soon. Hint: ${agent.hint}`}
      style={{ background: WHITE, border: `1px dashed ${BORDER}`, borderRadius: RADIUS.card, padding: flat ? 10 : 14,
        display: "flex", flexDirection: flat ? "row" : "column", alignItems: "center", textAlign: flat ? "left" : "center",
        gap: flat ? 14 : 6, cursor: "default", userSelect: "none", height: "100%", boxSizing: "border-box" }}>
      <div aria-hidden="true" style={{ width: flat ? 84 : "100%", flexShrink: 0, background: MUTED_TILE,
        borderRadius: RADIUS.control, display: "flex", justifyContent: "center", padding: flat ? "6px 0 4px" : "10px 0 6px" }}>
        <Mascot agent={agent.mascot} state="sleeping" size={flat ? 64 : 88} title="" />
      </div>
      <div aria-hidden="true" style={{ display: "flex", flexDirection: "column", alignItems: flat ? "flex-start" : "center",
        gap: 4, minWidth: 0 }}>
        <p style={{ margin: flat ? 0 : "6px 0 0", fontFamily: SANS, fontWeight: 800, fontSize: "1.3rem",
          color: TEXT_MUTED, letterSpacing: "0.08em" }}>
          ???
        </p>
        <p style={{ margin: 0, fontFamily: SANS, fontWeight: 600, fontSize: "0.95rem", color: TEXT_MUTED }}>
          {agent.hint}
        </p>
        <span style={{ marginTop: 2, fontFamily: SANS, fontWeight: 700, fontSize: "0.9rem", color: TEXT_MUTED,
          background: MUTED_TILE, borderRadius: RADIUS.pill, padding: "4px 12px", whiteSpace: "nowrap" }}>
          Arriving soon
        </span>
      </div>
    </div>
  );
}

/** `agent`: a registry entry (src/lib/agents/registry.js). `onOpen(agent)`
 *  runs from a live card's Open button. `extra`: a line under the tagline. */
export default function AgentCard({ agent, onOpen, extra }) {
  return agent.status === "live"
    ? <LiveCard agent={agent} onOpen={onOpen} extra={extra} />
    : <SoonCard agent={agent} />;
}
