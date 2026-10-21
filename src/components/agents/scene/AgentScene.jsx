import { useLayoutEffect, useRef, useState } from "react";
import Mascot, { mascotFit } from "../Mascot.jsx";
import { SpeechBubble, TAIL_AT, TIP } from "../../ui/SpeechBubble.jsx";
import { SR_ONLY } from "../../ui/kit.jsx";
import { PixelArrow } from "../../ui/PixelIcons.jsx";
import { getAgent } from "../../../lib/agents/registry.js";
import { SANS } from "../../ui/tokens.js";

// The band across the top of an agent's page: a sky, a strip of ground, the
// page's title and the way back on the sky, the mascot standing on the right,
// and (on a wide screen) what it says in a pixel bubble to its left. Each
// agent brings its own sky, ground and props (Quill's night desk, Beaker's
// beach lab, Talon's dawn lookout); this file is the frame they share.
//
// Everything drawn is decoration (aria-hidden) except the back button, the
// title and the bubble's words. The small animations (twinkles, drifting
// clouds, rising bubbles) stop under reduced motion.

const SCENE_CLASS = "ag-scene";
const SCENE_CSS = `
.${SCENE_CLASS}-focus:focus-visible { outline: 3px solid #ffffff; outline-offset: 2px; }
.${SCENE_CLASS}-twinkle { animation: ag-twinkle 5s ease-in-out infinite; }
@keyframes ag-twinkle { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
.${SCENE_CLASS}-drift { animation: ag-drift 14s ease-in-out infinite alternate; }
@keyframes ag-drift { from { transform: translateX(0); } to { transform: translateX(28px); } }
.${SCENE_CLASS}-rise { animation: ag-rise 3.2s ease-in infinite; opacity: 0; }
@keyframes ag-rise { 0% { transform: translateY(0); opacity: 0; } 15% { opacity: 1; } 100% { transform: translateY(-34px); opacity: 0; } }
.${SCENE_CLASS}-bob { animation: ag-bob 3s ease-in-out infinite alternate; }
@keyframes ag-bob { from { transform: translateY(0); } to { transform: translateY(-3px); } }
@media (prefers-reduced-motion: reduce) {
  .${SCENE_CLASS}-twinkle, .${SCENE_CLASS}-drift, .${SCENE_CLASS}-bob { animation: none; }
  .${SCENE_CLASS}-rise { animation: none; opacity: 0; }
}
`;
if (typeof document !== "undefined" && !document.querySelector("style[data-agent-scene]")) {
  const el = document.createElement("style");
  el.dataset.agentScene = "";
  el.textContent = SCENE_CSS;
  document.head.appendChild(el);
}

/** Class names for a prop's animation: "twinkle", "drift", "rise", "bob". */
export const sceneAnim = (name) => `${SCENE_CLASS}-${name}`;

/** A grid of characters (one a pixel, "." empty) as crisp rects. Decorative. */
export function Pixels({ grid, ink, px, style, className }) {
  const rects = [];
  grid.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      let end = x + 1;
      while (end < row.length && row[end] === ch) end += 1;
      if (ink[ch]) rects.push(<rect key={`${y}-${x}`} x={x} y={y} width={end - x} height={1} fill={ink[ch]} />);
      x = end;
    }
  });
  return (
    <svg aria-hidden="true" focusable="false" width={grid[0].length * px} height={grid.length * px} className={className}
      viewBox={`0 0 ${grid[0].length} ${grid.length}`} shapeRendering="crispEdges" style={{ display: "block", ...style }}>
      {rects}
    </svg>
  );
}

/** A mountain range or a line of hills: columns of `px` pixels whose heights
 *  (in pixels of the grid) come from `heightAt(column)`. Spans `cols` columns
 *  from the left; the band clips what runs past its edge. */
export function Ridge({ cols, px, color, heightAt, style }) {
  const heights = Array.from({ length: cols }, (_, i) => Math.max(0, Math.round(heightAt(i))));
  const tall = Math.max(1, ...heights);
  return (
    <svg aria-hidden="true" focusable="false" width={cols * px} height={tall * px} viewBox={`0 0 ${cols} ${tall}`}
      shapeRendering="crispEdges" style={{ display: "block", ...style }}>
      {heights.map((h, i) => (h > 0 ? <rect key={i} x={i} y={tall - h} width={1} height={h} fill={color} /> : null))}
    </svg>
  );
}

/** The mascot's line, centred in the band, its tail aimed at the beak. The
 *  bubble's height is measured, so the tail follows the text however long. */
function SaysBeside({ children, agent, bandH, mascotBottom, size, right }) {
  const ref = useRef(null);
  const [h, setH] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const read = () => setH(el.offsetHeight);
    read();
    if (typeof ResizeObserver === "undefined") return undefined;
    const watch = new ResizeObserver(read);
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
  const fit = mascotFit(size, agent);
  const beakY = bandH - mascotBottom - size + fit.top + fit.beakRow * fit.scale;
  const top = Math.max(0, Math.round((bandH - h) / 2));
  const tailAt = Math.min(Math.max(TAIL_AT, Math.round(beakY - top - TIP)), Math.max(TAIL_AT, h - TAIL_AT));
  const name = getAgent(agent)?.name || "The agent";
  return (
    <div ref={ref} style={{ position: "absolute", top, right, width: "min(440px, 46%)" }}>
      <SpeechBubble side="right" tailAt={tailAt}>
        <span style={SR_ONLY}>{name} says: </span>
        {children}
      </SpeechBubble>
    </div>
  );
}

/**
 * title: the page's h1. onBack(): the "Agents" button. agent / state: the
 * mascot and its pose. says: its line (wide screens only; a phone's band has
 * no room, so the page shows it under the band). isMobile: the shorter band.
 *
 * sky: the band's CSS background. ground: { h, mobileH, color, top } (the
 * strip it stands on and that strip's top edge). backColor: the back
 * button's text. flip: turn the mascot to face the bubble. lift: how far the
 * mascot's box sinks into the ground (its feet sit on the ground's top).
 * decor({ px, groundH, isMobile }): the agent's props, absolutely placed.
 *
 * headingAs: the title's tag (an "h1" on its own page; a page that already
 * has an h1, like the landing, passes "p"). animate: the mascot's frames
 * play. The back button renders only when `onBack` is a function.
 */
export default function AgentScene({
  title, onBack, agent, state = "idle", says = null, isMobile = false,
  sky, ground, backColor = "#e4e6ff", flip = false, lift = 4, decor,
  headingAs: Heading = "h1", animate = true,
}) {
  const px = isMobile ? 3 : 4;
  const height = isMobile ? 150 : 200;
  const groundH = isMobile ? ground.mobileH : ground.h;
  const size = isMobile ? 96 : 128;
  const mascotRight = isMobile ? 14 : 56;
  const mascotBottom = groundH - lift;

  return (
    <header style={{ position: "relative", height, marginBottom: 14, borderRadius: 16, overflow: "hidden",
      background: sky, boxSizing: "border-box" }}>
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: groundH, boxSizing: "border-box",
          background: ground.color, borderTop: `4px solid ${ground.top}` }} />
        {decor?.({ px, groundH, isMobile })}
        <div style={{ position: "absolute", right: mascotRight, bottom: mascotBottom }}>
          <Mascot agent={agent} state={state} size={size} title="" animate={animate}
            style={flip ? { transform: "scaleX(-1)" } : undefined} />
        </div>
      </div>

      {says && !isMobile && (
        <SaysBeside agent={agent} bandH={height} mascotBottom={mascotBottom} size={size} right={mascotRight + size + 14}>
          {says}
        </SaysBeside>
      )}

      <div style={{ position: "relative", padding: isMobile ? "4px 16px 0" : "10px 26px 0" }}>
        {typeof onBack === "function" && (
          <button type="button" className={`${SCENE_CLASS}-focus`} onClick={onBack}
            style={{ minHeight: 44, display: "inline-flex", alignItems: "center", gap: 8, margin: "0 0 2px -8px", padding: "0 8px",
              border: "none", background: "none", borderRadius: 10, cursor: "pointer", fontFamily: SANS, fontSize: "0.95rem",
              fontWeight: 700, color: backColor }}>
            <PixelArrow size={16} style={{ transform: "scaleX(-1)" }} />
            Agents
          </button>
        )}
        <Heading style={{ margin: 0, fontFamily: SANS, fontWeight: 800, fontSize: isMobile ? "2.1rem" : "2.5rem", color: "#ffffff",
          letterSpacing: "-0.03em", lineHeight: 1.1, textShadow: "0 2px 0 rgba(0,0,0,0.18)" }}>
          {title}
        </Heading>
      </div>
    </header>
  );
}
