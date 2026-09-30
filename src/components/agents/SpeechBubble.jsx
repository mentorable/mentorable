import Mascot, { mascotFit } from "./Mascot.jsx";
import { SANS, TEXT, WHITE, useAgentInk } from "./agentUi.js";
import { getAgent } from "../../lib/agents/registry.js";
import { useIsMobile } from "../../hooks/useIsMobile.js";

// A game dialog box: a 2px ink frame with stepped pixel corners (three steps
// of 4px), a small name tab sitting on the top edge, and a flat-bottomed
// pixel wedge for the tail. Everything is drawn on the mascot's 2px grid.

const INK = TEXT;
const UNIT = 2;          // one tail pixel, the frame's width
const TAIL_AT = 14;      // how far along the edge the tail starts (px), clear of the corner steps
const STEPS = 3;         // corner steps
const STEP = 4;          // px per corner step
const TAB_ROOM = 12;     // the name tab pokes this far above the box

// The clip that gives a box stepped corners: `n` steps of `u` px.
function stepClip(n, u) {
  const c = n * u;
  const L = [[0, c]];
  for (let i = 1; i <= n; i++) { L.push([i * u, c - (i - 1) * u]); L.push([i * u, c - i * u]); }
  const f = (v, flip) => (flip ? (v === 0 ? "100%" : `calc(100% - ${v}px)`) : `${v}px`);
  const rev = [...L].reverse();
  const pts = [
    ...L.map(([x, y]) => [f(x, 0), f(y, 0)]),
    ...rev.map(([x, y]) => [f(x, 1), f(y, 0)]),
    ...L.map(([x, y]) => [f(x, 1), f(y, 1)]),
    ...rev.map(([x, y]) => [f(x, 0), f(y, 1)]),
  ];
  return `polygon(${pts.map((p) => p.join(" ")).join(",")})`;
}
const CLIP = stepClip(STEPS, STEP);

// The tail for side "left", pointing left: "k" is ink, "w" is the bubble's
// own fill (it opens the frame where the wedge joins). The last column sits
// exactly on the frame's edge.
const TAIL_LEFT = [
  ".........k",
  ".......kkw",
  ".....kkwww",
  "...kkwwwww",
  ".kkwwwwwww",
  "kkkkkkkkkw",
  ".........k",
];
const transpose = (g) => [...g[0]].map((_, c) => g.map((row) => row[c]).join(""));
const mirror = (g) => g.map((row) => [...row].reverse().join(""));
// Where the tip is, along the edge: the middle of the rows the first column fills.
const TIP_ROWS = TAIL_LEFT.map((row, i) => (row[0] !== "." ? i : -1)).filter((i) => i >= 0);
const TIP = ((TIP_ROWS[0] + TIP_ROWS[TIP_ROWS.length - 1] + 1) / 2) * UNIT;
const TAILS = {
  left: TAIL_LEFT,
  right: mirror(TAIL_LEFT),
  top: transpose(TAIL_LEFT),
  bottom: [...transpose(TAIL_LEFT)].reverse(),
};

function Tail({ side, fill, at }) {
  const grid = TAILS[side];
  if (!grid) return null;
  const w = grid[0].length;
  const h = grid.length;
  // Offsets are measured from the box's outer edge, so pulling the tail out
  // by its size less one pixel lands its last row or column on the frame.
  const out = -((side === "left" || side === "right" ? w : h) - 1) * UNIT;
  const place = {
    left: { left: out, top: at },
    right: { right: out, top: at },
    top: { top: out, left: at },
    bottom: { bottom: out, left: at },
  }[side];
  const rects = [];
  grid.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch !== ".") rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={ch === "k" ? INK : fill} />);
  }));
  return (
    <svg aria-hidden="true" focusable="false" width={w * UNIT} height={h * UNIT} viewBox={`0 0 ${w} ${h}`}
      shapeRendering="crispEdges" style={{ position: "absolute", display: "block", ...place }}>
      {rects}
    </svg>
  );
}

const SR_ONLY = {
  position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden",
  clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0,
};

/** `side`: where the tail is, facing the speaker ("left", "right", "top",
 *  "bottom", or "none"). `tone`: "default" (white) or "accent" (a soft tint
 *  of the student's accent, with dark ink so it always reads). `tailAt`: how
 *  far along that edge the tail starts, in px. `name`: whose box this is,
 *  shown on a small tab on the top edge (and read out to screen readers). */
export function SpeechBubble({ children, side = "left", tone = "default", style, tailAt = TAIL_AT, name }) {
  const ink = useAgentInk();
  const accent = tone === "accent";
  const bg = accent ? ink.soft : WHITE;
  // The tab sits on the right when the tail comes up from the top, so the two never meet.
  const tabSide = side === "top" ? { right: 18 } : { left: 18 };
  return (
    <div style={{ position: "relative", marginTop: name ? TAB_ROOM : 0, minWidth: 0, boxSizing: "border-box", ...style }}>
      {/* The frame is the ink, the inside is the fill, both with the same stepped corners. */}
      <div style={{ background: INK, clipPath: CLIP, padding: UNIT }}>
        <div style={{ background: bg, clipPath: CLIP, padding: "18px 16px 13px", fontFamily: SANS, fontSize: "1rem",
          fontWeight: 600, color: TEXT, lineHeight: 1.5, overflowWrap: "anywhere" }}>
          {name && <span style={SR_ONLY}>{name} says: </span>}
          {children}
        </div>
      </div>
      {name && (
        <span aria-hidden="true" style={{ position: "absolute", top: -11, ...tabSide, maxWidth: "calc(100% - 36px)",
          padding: "2px 8px", background: accent ? WHITE : ink.soft, color: accent ? ink.text : ink.onSoft,
          fontFamily: SANS, fontSize: "0.9rem", fontWeight: 800, letterSpacing: "0.01em",
          lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", boxSizing: "border-box",
          boxShadow: `0 -2px 0 ${INK}, 0 2px 0 ${INK}, -2px 0 0 ${INK}, 2px 0 0 ${INK}` }}>
          {name}
        </span>
      )}
      <Tail side={side} fill={bg} at={tailAt} />
    </div>
  );
}

/** A mascot and what it says. `layout`: "row" (mascot left, bubble right),
 *  "stack" (mascot above), or "auto" (a row, stacked on a narrow phone). */
export function MascotSays({ agent = "beaker", state = "idle", size = 72, children, layout = "row", tone = "default", style }) {
  const narrow = useIsMobile(480);
  const stacked = layout === "stack" || (layout === "auto" && narrow);
  const name = getAgent(agent)?.name || "Beaker";

  // Line the tail up with the beak, which is about 10 art pixels below the
  // top of the sprite; the fit says where the art sits in its box.
  const fit = mascotFit(size, agent);
  const beakY = fit.top + 10 * fit.scale;

  return (
    <div style={{ display: "flex", flexDirection: stacked ? "column" : "row", alignItems: "flex-start",
      gap: stacked ? 20 : 16, minWidth: 0, paddingTop: TAB_ROOM, ...style }}>
      <Mascot agent={agent} state={state} size={size} title="" />
      <SpeechBubble side={stacked ? "top" : "left"} tone={tone} name={name}
        tailAt={stacked ? Math.max(TAIL_AT, Math.round(size / 2 - TIP)) : TAIL_AT}
        style={stacked
          ? { alignSelf: "stretch", marginTop: 0 }
          : { marginTop: Math.max(0, Math.round(beakY - TAIL_AT - TIP)), flex: "0 1 auto", maxWidth: 560 }}>
        {children}
      </SpeechBubble>
    </div>
  );
}
