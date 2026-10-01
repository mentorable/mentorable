import { useEffect, useMemo, useRef, useState } from "react";
import Mascot from "../Mascot.jsx";
import { PixelStamp } from "../PixelIcons.jsx";
import { RADIUS, SANS, TEXT, TEXT_FAINT, TEXT_MID, TEXT_MUTED, WHITE, useAgentInk } from "../agentUi.js";
import { Button, PULSE_CLASS, SR_ONLY } from "../outreach/flowUi.jsx";
import { TALON_LINES } from "../../../lib/agents/registry.js";
import { TALON } from "./finderUi.js";

// Step 4, while the search runs: the scouting sky. Talon flies back and forth
// over a soft sky tinted from the student's accent, the step in hand sits in
// its own "Now" strip, and each finished step lands as a stamp under "Done so
// far", in the order it finished. Every label is the server's (the progress
// events, merged by mergeProgress); Talon's line under the strip rotates on a
// timer and is flavour only.
//
// Screen readers: the strip and the stamps together are the whole list, each
// line prefixed with what state it is in, and one polite status region says
// each new step (and each step that did not work) as it arrives, never the
// whole list again. Leaving is fine: the search runs on the server and lands
// on the board.

const EVERY_MS = 4500;
const EMPTY = [];

// The flight: one crossing each way in 32s, eased so Talon slows at each end
// before it turns, a slow bob on its own beat, and the turn itself a flip on
// the beat the crossing ends (step-end, so it never squashes mid-turn). Under
// reduced motion everything holds still with Talon most of the way across, on
// a whole pixel where round() is supported (a half pixel blurs the art). The
// new-stamp pop is the same deal.
const SKY_CSS = `
@keyframes ts-cross { 0% { transform: translateX(0); } 50% { transform: translateX(100%); } 100% { transform: translateX(0); } }
@keyframes ts-turn { 0% { transform: scaleX(1); } 50% { transform: scaleX(-1); } 100% { transform: scaleX(1); } }
@keyframes ts-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
@keyframes ts-land { from { transform: scale(0.85); opacity: 0; } to { transform: none; opacity: 1; } }
.ts-move { animation: ts-cross 32s ease-in-out infinite; }
.ts-turn { animation: ts-turn 32s step-end infinite; }
.ts-bob { animation: ts-bob 3.4s ease-in-out infinite; }
.ts-stamp { animation: ts-land 0.25s ease-out; }
@media (prefers-reduced-motion: reduce) {
  .ts-move, .ts-turn, .ts-bob, .ts-stamp { animation: none; }
  .ts-move { transform: translateX(72%); transform: translateX(round(72%, 1px)); }
}
`;
if (typeof document !== "undefined" && !document.querySelector("style[data-talon-sky]")) {
  const el = document.createElement("style");
  el.dataset.talonSky = "";
  el.textContent = SKY_CSS;
  document.head.appendChild(el);
}

// A flat pixel cloud: a 16px bar with stepped shoulders, as in the mockup.
const CLOUD_CLIP = "polygon(0 50%,8px 50%,8px 25%,16px 25%,16px 0,calc(100% - 24px) 0,calc(100% - 24px) 25%,"
  + "calc(100% - 8px) 25%,calc(100% - 8px) 50%,100% 50%,100% 100%,0 100%)";
// left, top as a share of the sky's height, width on a wide screen and on a phone.
const CLOUDS = [
  { left: "6%", top: 0.11, wide: 72, narrow: 56 },
  { left: "62%", top: 0.07, wide: 96, narrow: 72 },
  { left: "80%", top: 0.48, wide: 64, narrow: 48 },
  { left: "24%", top: 0.77, wide: 56, narrow: 48 },
];
const SKY_PAD = 12;   // Talon never flies closer than this to either side

// The same small cross the checklist uses for a step that did not work.
const CROSS = "M1 1h1v1H1zM6 1h1v1H6zM2 2h1v1H2zM5 2h1v1H5zM3 3h2v2H3zM2 5h1v1H2zM5 5h1v1H5zM1 6h1v1H1zM6 6h1v1H6z";
const STAMP_BG = "#f3f1ee";      // a quiet paper tone for a finished step
const FAILED_EDGE = "#d6d1c9";   // a step that did not work: white with a grey edge, never red

const SAY = { active: "Now: ", done: "Done: ", failed: "Didn't work: " };

/** The finished lines (done or failed) in the order they finished. A line
 *  already finished when this mounts keeps its place in the list. */
function useFinished(lines) {
  const known = useRef([]);
  const finished = useMemo(() => {
    const byId = new Map(lines.map((l) => [l.id, l]));
    const ids = known.current.filter((id) => byId.has(id) && byId.get(id).status !== "active");
    for (const l of lines) if (l.status !== "active" && !ids.includes(l.id)) ids.push(l.id);
    return ids.map((id) => byId.get(id));
  }, [lines]);
  useEffect(() => { known.current = finished.map((l) => l.id); }, [finished]);
  return finished;
}

/** What the status region says: each line the first time it appears, and a
 *  line the moment it fails. `n` changes every time, so the same words twice
 *  are still said twice. */
function useStepAnnouncer(lines) {
  const seen = useRef(null);
  const [said, setSaid] = useState({ text: "", n: 0 });
  useEffect(() => {
    const before = seen.current;
    seen.current = new Map(lines.map((l) => [l.id, l.status]));
    if (!before) return;   // first look: whatever is here already is not news
    const parts = [];
    for (const l of lines) {
      const was = before.get(l.id);
      if (was === undefined) parts.push(`${SAY[l.status] || SAY.active}${l.label}`);
      else if (was !== "failed" && l.status === "failed") parts.push(`${SAY.failed}${l.label}`);
    }
    if (parts.length) setSaid((s) => ({ text: parts.join(". "), n: s.n + 1 }));
  }, [lines]);
  return said;
}

function Sky({ ink, isMobile }) {
  const size = isMobile ? 64 : 96;      // whole-number art: 2x and 3x the 32px sprite
  const height = isMobile ? 152 : 200;
  const top = isMobile ? 44 : 56;
  const trail = isMobile ? 84 : 150;
  return (
    <div style={{ position: "relative", height, overflow: "hidden", boxSizing: "border-box",
      borderRadius: RADIUS.card, border: `1px solid ${ink.soft}`,
      background: `linear-gradient(180deg, ${ink.soft} 0%, ${ink.softer} 70%, ${WHITE} 100%)` }}>
      {CLOUDS.map((c) => (
        <span key={c.left} aria-hidden="true" style={{ position: "absolute", left: c.left, top: Math.round(c.top * height),
          width: isMobile ? c.narrow : c.wide, height: 16, background: WHITE, opacity: 0.95, clipPath: CLOUD_CLIP }} />
      ))}
      {/* The track is the room Talon has: its width is the sky less the
          padding and Talon itself, and the mover crosses 100% of it, so the
          bird stays inside the panel at every width. */}
      <div style={{ position: "absolute", left: SKY_PAD, right: SKY_PAD + size, top, height: size }}>
        <div className="ts-move" style={{ width: "100%", height: "100%" }}>
          <div className="ts-bob">
            <div className="ts-turn" style={{ position: "relative", width: size, height: size }}>
              {/* A fading dotted wake behind the tail (the tail's tip is on art
                  rows 21 and 22 of the level wingbeat); it turns with Talon. */}
              <span aria-hidden="true" style={{ position: "absolute", right: "100%", marginRight: 2,
                top: Math.round(size * 0.67), width: trail, height: 2, opacity: 0.6,
                background: `linear-gradient(90deg, ${ink.ring} 50%, transparent 50%) left top / 6px 2px repeat-x`,
                WebkitMaskImage: "linear-gradient(90deg, transparent, #000)",
                maskImage: "linear-gradient(90deg, transparent, #000)" }} />
              <Mascot agent={TALON} state="flying" size={size} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stamp({ line, ink }) {
  const failed = line.status === "failed";
  return (
    <li className="ts-stamp" style={{ display: "inline-flex", alignItems: "flex-start", gap: 6, maxWidth: "100%",
      boxSizing: "border-box", padding: "5px 10px 5px 8px", borderRadius: 6, fontSize: "0.9rem", lineHeight: 1.4,
      fontWeight: failed ? 600 : 700, color: failed ? TEXT_MUTED : TEXT_MID, background: failed ? WHITE : STAMP_BG,
      boxShadow: failed ? `inset 0 0 0 1.5px ${FAILED_EDGE}` : "none" }}>
      <span aria-hidden="true" style={{ display: "flex", marginTop: 2, color: failed ? TEXT_FAINT : ink.text }}>
        {failed ? (
          <svg width="16" height="16" viewBox="0 0 8 8" shapeRendering="crispEdges" focusable="false" style={{ display: "block" }}>
            <path d={CROSS} fill="currentColor" />
          </svg>
        ) : (
          <PixelStamp kind="check" size={16} />
        )}
      </span>
      <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>
        <span style={SR_ONLY}>{failed ? SAY.failed : SAY.done}</span>{line.label}
      </span>
    </li>
  );
}

/** lines: the merged progress lines. onLeave(): back to the board.
 *  isMobile: the smaller sky and bird for a phone. */
export default function TalonAtWork({ lines, onLeave, isMobile = false }) {
  const ink = useAgentInk();
  const list = Array.isArray(lines) ? lines : EMPTY;

  const sayings = TALON_LINES.searching;
  const [at, setAt] = useState(0);
  useEffect(() => {
    if (!Array.isArray(sayings) || sayings.length < 2) return undefined;
    const t = setInterval(() => setAt((i) => (i + 1) % sayings.length), EVERY_MS);
    return () => clearInterval(t);
  }, [sayings]);
  const saying = (Array.isArray(sayings) && sayings[at % sayings.length]) || "";

  const finished = useFinished(list);
  const said = useStepAnnouncer(list);

  // The newest active line leads; searches run side by side, so any others
  // still going are listed under it rather than hidden.
  const active = list.filter((l) => l.status === "active");
  const now = active[active.length - 1] || null;
  const also = active.slice(0, -1);
  const last = finished[finished.length - 1];
  const nowLabel = now ? (now.label || "Working on it")
    : list.length === 0 ? "Getting started"
    : last?.status === "failed" ? "That step didn't work, so Talon is moving on"
    : "Lining up the next step";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0, fontFamily: SANS }}>
      <Sky ink={ink} isMobile={isMobile} />

      <section aria-label="What Talon is doing" style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", minWidth: 0,
            background: ink.softer, border: `1px solid ${ink.soft}`, borderRadius: RADIUS.control }}>
            <span className={PULSE_CLASS} aria-hidden="true" style={{ display: "flex", marginTop: 4, color: ink.onSoft }}>
              <PixelStamp kind="sparkle" size={16} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, lineHeight: 1.45, color: TEXT,
                overflowWrap: "anywhere" }}>
                <span style={{ display: "inline-block", marginRight: 8, padding: "1px 7px", verticalAlign: 1,
                  background: ink.button.bg, color: ink.button.fg, fontSize: "0.9rem", fontWeight: 800, lineHeight: 1.4,
                  letterSpacing: "0.06em", textTransform: "uppercase", borderRadius: 6 }}>
                  Now
                </span>
                <span style={SR_ONLY}>: </span>
                {nowLabel}
              </p>
              {also.length > 0 && (
                <ul style={{ listStyle: "none", margin: "4px 0 0", padding: 0, display: "grid", gap: 2 }}>
                  {also.map((l) => (
                    <li key={l.id} style={{ fontSize: "0.95rem", fontWeight: 600, lineHeight: 1.45, color: TEXT_MID,
                      overflowWrap: "anywhere" }}>
                      <span style={SR_ONLY}>Also working on: </span>{l.label}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          {saying && (
            <p style={{ margin: 0, fontSize: "0.95rem", fontWeight: 600, lineHeight: 1.5, color: TEXT_MUTED }}>
              Talon: &ldquo;{saying}&rdquo;
            </p>
          )}
        </div>

        {finished.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
            <h3 style={{ margin: 0, fontFamily: SANS, fontSize: "0.9rem", fontWeight: 800, color: TEXT_MUTED,
              letterSpacing: "0.02em" }}>
              Done so far
            </h3>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexWrap: "wrap", gap: 6, minWidth: 0 }}>
              {finished.map((l) => <Stamp key={l.id} line={l} ink={ink} />)}
            </ul>
          </div>
        )}
      </section>

      <p role="status" aria-live="polite" style={SR_ONLY}>
        {said.text && <span key={said.n}>{said.text}</span>}
      </p>

      <p style={{ margin: 0, fontSize: "0.95rem", color: TEXT_MUTED, lineHeight: 1.55 }}>
        This usually takes a minute or two. You can leave this page: Talon keeps going, and what it finds lands on
        your board.
      </p>
      {onLeave && (
        <div>
          <Button kind="secondary" onClick={onLeave}>Go to your board</Button>
        </div>
      )}
    </div>
  );
}
