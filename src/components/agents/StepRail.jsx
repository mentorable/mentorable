import { PixelStamp } from "./PixelIcons.jsx";
import Mascot from "./Mascot.jsx";
import { SANS, TEXT, TEXT_MUTED, WHITE, useAgentInk } from "./agentUi.js";
import { useIsMobile } from "../../hooks/useIsMobile.js";

// The progress rail over a flow, as a pixel trail: stepped square tiles
// joined by dotted pixel connectors (the accent up to the current step, grey
// after), with the flow's mascot (Beaker unless told otherwise) standing on
// the current tile. The numbers are there because the steps are a real
// sequence. Done tiles get a check. On a phone the labels would crowd, so
// only the tiles show and one line underneath names the current step.

const TILE = 30;
const MASCOT = 32;              // the sprite's own size: one art pixel per CSS pixel
const ABOVE = MASCOT + 2;       // room over each tile for the mascot to stand in
const TILE_EDGE = "#d6d1c9";    // an unreached tile's outline (decorative)
const DOTS_OFF = "#c4bfb6";     // the connector past the current step (decorative)
// One 2px corner step.
const CLIP = "polygon(0 2px,2px 2px,2px 0,calc(100% - 2px) 0,calc(100% - 2px) 2px,100% 2px,100% calc(100% - 2px),calc(100% - 2px) calc(100% - 2px),calc(100% - 2px) 100%,2px 100%,2px calc(100% - 2px),0 calc(100% - 2px))";

const SR_ONLY = {
  position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden",
  clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0,
};

function Tile({ done, on, n, ink }) {
  const face = { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
    clipPath: CLIP, fontSize: "0.95rem", fontWeight: 800, fontVariantNumeric: "tabular-nums", boxSizing: "border-box" };
  const inner = on ? { background: ink.button.bg, color: ink.button.fg }
    : done ? { background: ink.soft, color: ink.onSoft }
    : { background: WHITE, color: TEXT_MUTED };
  return (
    <span aria-hidden="true" style={{ position: "relative", zIndex: 1, width: TILE, height: TILE, display: "block",
      background: on || done ? "transparent" : TILE_EDGE, clipPath: CLIP, padding: on || done ? 0 : 2, boxSizing: "border-box" }}>
      <span style={{ ...face, ...inner, clipPath: CLIP }}>
        {done ? <PixelStamp kind="check" size={16} /> : n}
      </span>
    </span>
  );
}

/** steps: [{ key, label }]. current: the current step's key (or its index).
 *  agent: the mascot on the current tile (a Mascot key, "beaker" by default).
 *  allDone: every step is done (the results are in), so no tile is
 *  "current" and the mascot cheers on the last one. */
export default function StepRail({ steps, current, agent = "beaker", allDone = false }) {
  const ink = useAgentInk();
  const narrow = useIsMobile(560);
  const found = typeof current === "number" ? current : steps.findIndex((s) => s.key === current);
  const at = Math.min(Math.max(found, 0), steps.length - 1);

  return (
    <div style={{ fontFamily: SANS }}>
      <ol aria-label="Steps" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", alignItems: "flex-start" }}>
        {steps.map((s, i) => {
          const done = i < at || allDone;
          const on = i === at && !allDone;
          const perch = i === at;
          return (
            <li key={s.key} aria-current={on ? "step" : undefined}
              style={{ flex: "1 1 0", minWidth: 0, position: "relative", paddingTop: ABOVE, display: "flex",
                flexDirection: "column", alignItems: "center", textAlign: "center" }}>
              {i > 0 && (
                <span aria-hidden="true" style={{ position: "absolute", top: ABOVE + TILE / 2 - 1, right: "50%", width: "100%",
                  height: 2, background: `linear-gradient(90deg, ${i <= at ? ink.ring : DOTS_OFF} 50%, transparent 50%) left top / 4px 2px repeat-x` }} />
              )}
              {perch && (
                <span aria-hidden="true" style={{ position: "absolute", top: 0, left: "50%", marginLeft: -MASCOT / 2, zIndex: 2 }}>
                  <Mascot agent={agent} state={allDone ? "celebrating" : "idle"} size={MASCOT} title="" />
                </span>
              )}
              <Tile done={done} on={on} n={i + 1} ink={ink} />
              <span style={narrow ? SR_ONLY : { marginTop: 6, fontSize: "0.9rem", lineHeight: 1.3, padding: "0 4px",
                fontWeight: on ? 800 : 600, color: on ? TEXT : TEXT_MUTED, overflowWrap: "anywhere" }}>
                {s.label}
              </span>
              <span style={SR_ONLY}>{done ? ", done" : on ? ", current step" : ""}</span>
            </li>
          );
        })}
      </ol>
      {narrow && steps[at] && (
        <p aria-hidden="true" style={{ margin: "8px 0 0", fontSize: "0.95rem", fontWeight: 700, color: TEXT }}>
          {allDone ? "All steps done" : `Step ${at + 1} of ${steps.length}: ${steps[at].label}`}
        </p>
      )}
    </div>
  );
}
