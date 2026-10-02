import {
  AGENTS, BEAKER_LINES, BG, BORDER, RADIUS, SANS, TALON_LINES, TEXT, TEXT_MID, TEXT_MUTED, WHITE, useInk,
} from "../../brand/brand.js";
import { BEAKER, TALON, OWL, HERON } from "../../brand/sprites.js";
import { FrameSprite } from "../../kit/FrameSprite.jsx";
import { SCREEN } from "../../kit/PhoneFrame.jsx";
import { PixelArrow, PixelStamp } from "./pixelIcons.jsx";

// The Agents hub (src/pages/AgentsHubPage.jsx + components/agents/AgentCard.jsx)
// as a phone shows it: the app's mobile layout, sizes in the app's own CSS
// pixels, drawn inside PhoneFrame. Live agents get a full card (mascot tile,
// name, role, tagline, a count line, Open); the ones still to come sleep as
// "???" cards lying on their side, one per row, as they do under 768px.
//
// `scroll` moves the page up (logical px), the way a thumb would. The status
// bar keeps a strip of page background behind it so scrolled content slides
// under it rather than through it.

const SPRITES = { beaker: BEAKER, talon: TALON, owl: OWL, heron: HERON };
const MUTED_TILE = "#efedf3";

/** Where things sit on the page, in logical px from the page's top (before
 *  scroll), measured from renders: used to aim a scroll at a card. */
export const HUB_LAYOUT = {
  pageTop: SCREEN.statusBar,  // the page starts under the status bar
  liveBottom: 1098,           // Talon's card's bottom edge (the list's 14px gap above the first sleeping card)
  liveButtonBottom: 1082,     // Talon's Open button's bottom edge (the card's 16px padding under it)
  soonTop: 1112,              // the first sleeping card's top edge
  soonBottom: 1326,           // the second sleeping card's bottom edge
};

/** Mascot as the app's Mascot.jsx places it: a `size` box, the art at the
 *  largest whole scale that fits, centred on whole pixels. */
function Mascot({ agent, state, size, offset = 0 }) {
  const sprite = SPRITES[agent] || BEAKER;
  const scale = Math.max(1, Math.floor(Math.min(size / sprite.width, size / sprite.height)));
  const top = Math.max(0, Math.floor((size - sprite.height * scale) / 2));
  const left = Math.max(0, Math.floor((size - sprite.width * scale) / 2));
  return (
    <div style={{ width: size, height: size, flexShrink: 0, boxSizing: "border-box", paddingTop: top, paddingLeft: left }}>
      <FrameSprite sprite={sprite} state={state} scale={scale} offset={offset} />
    </div>
  );
}

function CountLine({ stamp, children }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, color: TEXT_MUTED, fontVariantNumeric: "tabular-nums" }}>
      <PixelStamp kind={stamp} size={16} />
      <span>{children}</span>
    </span>
  );
}

function LiveCard({ agent, extra, offset, pressed }) {
  const ink = useInk();
  return (
    <article style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: RADIUS.card, padding: 16, display: "flex",
      flexWrap: "wrap", gap: "16px 22px", alignItems: "stretch", boxSizing: "border-box", height: "100%" }}>
      <div style={{ flex: "0 0 auto", width: 168, maxWidth: "100%", minHeight: 150, background: ink.softer,
        border: `1px solid ${ink.soft}`, borderRadius: RADIUS.control, display: "flex", alignItems: "flex-end",
        justifyContent: "center", padding: "14px 0 10px", boxSizing: "border-box", marginInline: "auto" }}>
        <Mascot agent={agent.mascot} state="idle" size={128} offset={offset} />
      </div>
      <div style={{ flex: "1 1 240px", minWidth: 0, display: "flex", flexDirection: "column" }}>
        <h2 style={{ margin: 0, fontFamily: SANS, fontWeight: 800, fontSize: 24, color: TEXT, letterSpacing: "-0.02em", lineHeight: 1.2 }}>
          {agent.name}
        </h2>
        {agent.role && (
          <p style={{ margin: "4px 0 0", fontFamily: SANS, fontWeight: 700, fontSize: 16, color: ink.text }}>{agent.role}</p>
        )}
        {agent.tagline && (
          <p style={{ margin: "10px 0 0", fontFamily: SANS, fontWeight: 400, fontSize: 16.8, color: TEXT_MID, lineHeight: 1.55 }}>
            {agent.tagline}
          </p>
        )}
        {extra && (
          <div style={{ marginTop: 10, fontFamily: SANS, fontSize: 15.2, fontWeight: 600, color: TEXT_MUTED }}>{extra}</div>
        )}
        <div style={{ marginTop: "auto", paddingTop: 16 }}>
          <span style={{ fontFamily: SANS, fontSize: 16, fontWeight: 700, minHeight: 44, padding: "10px 22px",
            borderRadius: RADIUS.control, background: ink.button.bg, color: ink.button.fg, display: "inline-flex",
            alignItems: "center", gap: 8, boxSizing: "border-box", filter: pressed ? "brightness(0.93)" : undefined,
            transform: pressed ? "translateY(1px)" : undefined }}>
            Open
            <PixelArrow size={16} />
          </span>
        </div>
      </div>
    </article>
  );
}

// On a phone a sleeping card lies on its side: the tile left, the words right.
function SoonCard({ agent, offset }) {
  return (
    <div style={{ background: WHITE, border: `1px dashed ${BORDER}`, borderRadius: RADIUS.card, padding: 10, display: "flex",
      flexDirection: "row", alignItems: "center", textAlign: "left", gap: 14, boxSizing: "border-box", height: "100%" }}>
      <div style={{ width: 84, flexShrink: 0, background: MUTED_TILE, borderRadius: RADIUS.control, display: "flex",
        justifyContent: "center", padding: "6px 0 4px" }}>
        <Mascot agent={agent.mascot} state="sleeping" size={64} offset={offset} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4, minWidth: 0 }}>
        <p style={{ margin: 0, fontFamily: SANS, fontWeight: 800, fontSize: 20.8, color: TEXT_MUTED, letterSpacing: "0.08em" }}>???</p>
        <p style={{ margin: 0, fontFamily: SANS, fontWeight: 600, fontSize: 15.2, color: TEXT_MUTED }}>{agent.hint}</p>
        <span style={{ marginTop: 2, fontFamily: SANS, fontWeight: 700, fontSize: 14.4, color: TEXT_MUTED, background: MUTED_TILE,
          borderRadius: RADIUS.pill, padding: "4px 12px", whiteSpace: "nowrap" }}>
          Arriving soon
        </span>
      </div>
    </div>
  );
}

/**
 * The hub page. `counts`: { outreach: { left, limit }, finder: { left, limit } }
 * (the count lines are left off when absent, as the app does while the
 * budgets load). `offsets`: per-agent sprite offsets (video frames) so no two
 * birds blink in step. `pressed`: an agent id whose Open button is held down.
 */
export function AgentsHubScreen({ scroll = 0, counts = {}, offsets = {}, pressed }) {
  const ink = useInk();
  const extraFor = (agent) => {
    const c = counts[agent.id];
    if (!c) return null;
    if (agent.id === "outreach") return <CountLine stamp="letter">{BEAKER_LINES.triesLeft(c.left, c.limit)}</CountLine>;
    if (agent.id === "finder") return <CountLine stamp="star">{TALON_LINES.findsLeft(c.left, c.limit)}</CountLine>;
    return null;
  };
  return (
    <>
      <div style={{ position: "absolute", left: 0, top: HUB_LAYOUT.pageTop, width: SCREEN.width, transform: `translateY(${-scroll}px)`,
        background: BG, fontFamily: SANS, boxSizing: "border-box", padding: "24px 16px 96px" }}>
        <h1 style={{ fontFamily: SANS, fontWeight: 800, fontSize: 33.6, color: ink.title, letterSpacing: "-0.03em",
          margin: "0 0 9.6px", lineHeight: 1.1 }}>
          Agents
        </h1>
        <p style={{ fontFamily: SANS, fontWeight: 400, fontSize: 18.4, color: TEXT_MUTED, lineHeight: 1.6, margin: "0 0 30.4px" }}>
          Small helpers with one job each. They do the legwork, and you decide what goes out.
        </p>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1fr)" }}>
          {AGENTS.map((agent) => (
            <li key={agent.id} style={{ minWidth: 0 }}>
              {agent.status === "live"
                ? <LiveCard agent={agent} extra={extraFor(agent)} offset={offsets[agent.id] || 0} pressed={pressed === agent.id} />
                : <SoonCard agent={agent} offset={offsets[agent.id] || 0} />}
            </li>
          ))}
        </ul>
      </div>
      {/* The page's own colour behind the status bar. */}
      <div style={{ position: "absolute", left: 0, top: 0, width: SCREEN.width, height: SCREEN.statusBar, background: BG, zIndex: 4 }} />
    </>
  );
}

