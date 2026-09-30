import { PixelStamp } from "../PixelIcons.jsx";
import { PULSE_CLASS, SR_ONLY } from "./flowUi.jsx";
import { BORDER, RADIUS, SANS, TEXT, TEXT_FAINT, TEXT_MUTED, WHITE, useAgentInk } from "../agentUi.js";

// The real progress the backend streams while Beaker searches and writes,
// as a checklist: one line per step, updated in place by its id (the same id
// moves a line from "active" to "done" or "failed"). Nothing here is made up:
// every label is the server's.

/** Fold one SSE event into the list of lines. Anything that is not a
 *  progress event leaves the list as it was. */
export function mergeProgress(lines, event) {
  if (!event || event.type !== "progress" || !event.id) return lines;
  const status = ["active", "done", "failed"].includes(event.status) ? event.status : "active";
  const line = { id: String(event.id), label: String(event.label || ""), status };
  const at = lines.findIndex((l) => l.id === line.id);
  if (at === -1) return [...lines, line];
  const next = lines.slice();
  next[at] = { ...next[at], ...line, label: line.label || next[at].label };
  return next;
}

// A small pixel cross for a step that did not work (a search that found
// nothing). Not red: it is not the student's problem, and the work goes on.
const CROSS = "M1 1h1v1H1zM6 1h1v1H6zM2 2h1v1H2zM5 2h1v1H5zM3 3h2v2H3zM2 5h1v1H2zM5 5h1v1H5zM1 6h1v1H1zM6 6h1v1H6z";

const NODE = 24;
const FAILED_BG = "#efedea";   // a quiet grey square
// A square with two 2px corner steps, for the stops on the route.
const STOP_CLIP = "polygon(0 4px,2px 4px,2px 2px,4px 2px,4px 0,calc(100% - 4px) 0,calc(100% - 4px) 2px,calc(100% - 2px) 2px,calc(100% - 2px) 4px,100% 4px,100% calc(100% - 4px),calc(100% - 2px) calc(100% - 4px),calc(100% - 2px) calc(100% - 2px),calc(100% - 4px) calc(100% - 2px),calc(100% - 4px) 100%,4px 100%,4px calc(100% - 2px),2px calc(100% - 2px),2px calc(100% - 4px),0 calc(100% - 4px))";

// One stop on the delivery route. Done: a soft square with a check. Now: an
// outlined square (ring, then white inside) with the pulsing sparkle. Failed:
// a grey square with a cross.
function Stop({ status, ink }) {
  const box = { width: NODE, height: NODE, boxSizing: "border-box", display: "flex", alignItems: "center",
    justifyContent: "center", clipPath: STOP_CLIP };
  if (status === "done") {
    return <span aria-hidden="true" style={{ ...box, background: ink.soft, color: ink.onSoft }}><PixelStamp kind="check" size={16} /></span>;
  }
  if (status === "failed") {
    return (
      <span aria-hidden="true" style={{ ...box, background: FAILED_BG, color: TEXT_FAINT }}>
        <svg width="16" height="16" viewBox="0 0 8 8" shapeRendering="crispEdges" focusable="false" style={{ display: "block" }}>
          <path d={CROSS} fill="currentColor" />
        </svg>
      </span>
    );
  }
  return (
    <span aria-hidden="true" style={{ ...box, background: ink.ring, padding: 2 }}>
      <span style={{ width: "100%", height: "100%", background: WHITE, clipPath: STOP_CLIP, display: "flex",
        alignItems: "center", justifyContent: "center", color: ink.text }}>
        <span className={PULSE_CLASS} style={{ display: "flex" }}><PixelStamp kind="sparkle" size={16} /></span>
      </span>
    </span>
  );
}

const SAY = { active: "Working on it: ", done: "Done: ", failed: "Didn't work: " };

// The dotted vertical pixel line to the next stop: 2px dashes on a 4px beat.
const routeLine = (color) => ({
  position: "absolute", left: NODE / 2 - 1, top: NODE + 2, bottom: 2, width: 2,
  background: `linear-gradient(180deg, ${color} 50%, transparent 50%) left top / 2px 4px repeat-y`,
});

/** lines: [{ id, label, status: "active" | "done" | "failed" }]. */
export default function ProgressChecklist({ lines, label = "What Beaker is doing" }) {
  const ink = useAgentInk();
  const items = lines.length === 0 ? [{ id: "__start", label: "Getting started", status: "active" }] : lines;
  return (
    <div style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: RADIUS.card, padding: "14px 16px",
      fontFamily: SANS, minWidth: 0 }}>
      <p style={{ margin: "0 0 10px", fontSize: "0.9rem", fontWeight: 800, color: TEXT_MUTED, letterSpacing: "0.02em" }}>
        {label}
      </p>
      <ol aria-live="polite" aria-relevant="additions text" style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {items.map((l, i) => (
          <li key={l.id} style={{ position: "relative", display: "grid", gridTemplateColumns: `${NODE}px minmax(0, 1fr)`,
            columnGap: 12, paddingBottom: i === items.length - 1 ? 0 : 14, fontSize: "1rem", lineHeight: 1.45,
            fontWeight: l.status === "active" ? 700 : 600, color: l.status === "failed" ? TEXT_MUTED : TEXT }}>
            {i < items.length - 1 && <span aria-hidden="true" style={routeLine(ink.ring)} />}
            <Stop status={l.status} ink={ink} />
            <span style={{ overflowWrap: "anywhere", minHeight: NODE, paddingTop: 0 }}>
              <span style={SR_ONLY}>{SAY[l.status]}</span>{l.label}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
