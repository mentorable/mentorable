import { useCurrentFrame } from "remotion";
import {
  BG, BORDER, DANGER, AMBER_TEXT, RADIUS, SANS, SURFACE, TEXT, TEXT_FAINT, TEXT_MID, TEXT_MUTED, WHITE,
  readableOn, useInk,
} from "../../brand/brand.js";
import { TALON } from "../../brand/sprites.js";
import { FrameSprite } from "../../kit/FrameSprite.jsx";
import { SCREEN } from "../../kit/PhoneFrame.jsx";

// The small shared pieces of Talon's screens, rebuilt from the app's own
// components so they look and measure the same at the app's mobile size:
// src/components/ui/kit.jsx (Button, Card, FieldLabel, inputStyle),
// ui/SpeechBubble.jsx and agents/SpeechBubble.jsx (MascotSays),
// ui/PixelIcons.jsx (the stamps), agents/finder/ListingCard.jsx (the pills),
// outreach/flowUi.jsx (Counter, SourceLink). Props in, picture out: nothing
// here keeps state or reads a clock except the mascot, which follows the
// video's frame.
//
// The app's files can't be imported as they are: they pull in ThemeContext
// (and with it Supabase), and their JSX would resolve React from the app's
// own node_modules.

export const NEUTRAL_TAG = "#efedea";   // outreach/BoardUi.js
export const INK_LINE = TEXT;           // the speech bubble's frame

/** The accent as text straight on the grey page (ui/kit.jsx textOnPage). */
export function textOnPage(ink) {
  return readableOn(ink.accent, BG, 4.5);
}

// ─── Pixel icons (ui/PixelIcons.jsx, grid for grid) ─────────────────────────

const STAMPS = {
  check: ["........", "......xx", ".....xx.", "x...xx..", "xx.xx...", ".xxx....", "..x.....", "........"],
  clock: ["..xxxx..", ".x....x.", "x..x...x", "x..x...x", "x..xxx.x", "x......x", ".x....x.", "..xxxx.."],
  star: ["...xx...", "...xx...", "..xxxx..", "xxxxxxxx", ".xxxxxx.", "..xxxx..", ".xxxxxx.", ".xx..xx."],
  sparkle: ["...xx...", "...xx...", "..xxxx..", "xxxxxxxx", "xxxxxxxx", "..xxxx..", "...xx...", "...xx..."],
  question: ["..xxxx..", ".xx..xx.", ".....xx.", "....xx..", "...xx...", "...xx...", "........", "...xx..."],
};
const ARROW = ["........", "...x....", "...xx...", "xxxxxx..", "xxxxxx..", "...xx...", "...x....", "........"];

const PATHS = new Map();
function pathFor(grid) {
  const key = grid.join("|");
  if (PATHS.has(key)) return PATHS.get(key);
  let d = "";
  grid.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (row[x] !== "x") { x += 1; continue; }
      let end = x;
      while (end < row.length && row[end] === "x") end += 1;
      d += `M${x} ${y}h${end - x}v1h${x - end}z`;
      x = end;
    }
  });
  PATHS.set(key, d);
  return d;
}

function GridIcon({ grid, size, style }) {
  const w = grid[0].length;
  const h = grid.length;
  const unit = size >= w ? Math.floor(size / w) : size / w;
  const view = size / unit;
  const padX = (view - w) / 2;
  const padY = (view - h) / 2;
  return (
    <svg width={size} height={size} viewBox={`${-padX} ${-padY} ${view} ${view}`} shapeRendering="crispEdges"
      style={{ display: "block", flexShrink: 0, ...style }}>
      <path d={pathFor(grid)} fill="currentColor" />
    </svg>
  );
}

/** kind: "check" | "clock" | "star" | "sparkle" | "question". */
export function PixelStamp({ kind, size = 16, style }) {
  return <GridIcon grid={STAMPS[kind] || STAMPS.sparkle} size={size} style={style} />;
}

export function PixelArrow({ size = 16, style }) {
  return <GridIcon grid={ARROW} size={size} style={style} />;
}

// ─── Kit ─────────────────────────────────────────────────────────────────────

/** ui/kit.jsx Button. `pressed`: held down by a tap (the app's .ag-press
 *  :active, a pixel down and a touch darker). */
export function Button({ kind = "secondary", children, style, pressed = false }) {
  const ink = useInk();
  const look = {
    primary: { background: ink.button.bg, color: ink.button.fg, border: `2px solid ${ink.button.bg}` },
    secondary: { background: WHITE, color: TEXT_MID, border: `1.5px solid ${BORDER}` },
    quiet: { background: "transparent", color: textOnPage(ink), border: "1.5px solid transparent" },
    danger: { background: WHITE, color: DANGER, border: `1.5px solid ${DANGER}` },
  }[kind];
  return (
    <span style={{ fontFamily: SANS, fontSize: "1rem", fontWeight: 700, minHeight: 44, padding: "10px 18px",
      borderRadius: RADIUS.control, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
      lineHeight: 1.25, textAlign: "center", boxSizing: "border-box", ...look,
      ...(pressed && kind === "primary" ? { transform: "translateY(1px)", filter: "brightness(0.93)" } : null),
      ...style }}>
      {children}
    </span>
  );
}

/** ui/kit.jsx Card: the calm shell's one container. */
export function Card({ children, style }) {
  return (
    <div style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: RADIUS.card, padding: "1.1rem 1.2rem",
      boxSizing: "border-box", minWidth: 0, ...style }}>
      {children}
    </div>
  );
}

export function FieldLabel({ children, hint, optional }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: "1rem", color: TEXT, lineHeight: 1.5 }}>
        {children}
        {optional && <span style={{ fontWeight: 600, color: TEXT_MUTED }}> (optional)</span>}
      </span>
      {hint && (
        <p style={{ margin: "2px 0 0", fontFamily: SANS, fontSize: "0.92rem", color: TEXT_MUTED, lineHeight: 1.5 }}>{hint}</p>
      )}
    </div>
  );
}

export const inputStyle = {
  width: "100%", boxSizing: "border-box", fontFamily: SANS, fontSize: "1rem", color: TEXT, background: WHITE,
  border: `1.5px solid ${BORDER}`, borderRadius: RADIUS.control, padding: "11px 13px", minHeight: 46, lineHeight: 1.5,
};

/** The app's focus ring on a field (.oa-input:focus): 3px of the ring colour, 1px out. */
export function focusRing(ink) {
  return { outline: `3px solid ${ink.ring}`, outlineOffset: 1 };
}

/** outreach/flowUi.jsx Counter: "42 / 300". */
export function Counter({ n, max }) {
  const near = n > max * 0.9;
  return (
    <span style={{ fontFamily: SANS, fontSize: "0.9rem", fontWeight: 600, fontVariantNumeric: "tabular-nums",
      whiteSpace: "nowrap", flexShrink: 0, lineHeight: 1.5, color: n > max ? DANGER : near ? AMBER_TEXT : TEXT_FAINT }}>
      {n} / {max}
    </span>
  );
}

/** outreach/flowUi.jsx SourceLink: an underlined link in the accent, a
 *  44px-tall target. */
export function SourceLink({ children, style }) {
  const ink = useInk();
  return (
    <span style={{ fontFamily: SANS, fontWeight: 700, color: textOnPage(ink), borderRadius: 4,
      textDecoration: "underline", textUnderlineOffset: 3, display: "inline-flex", alignItems: "center", minHeight: 44,
      maxWidth: "100%", boxSizing: "border-box", lineHeight: 1.5, ...style }}>
      {children}
    </span>
  );
}

// ─── Listing pills (agents/finder/ListingCard.jsx) ──────────────────────────

export function Pill({ children, style }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: RADIUS.pill,
      fontFamily: SANS, fontSize: "0.9rem", fontWeight: 800, lineHeight: 1.35, maxWidth: "100%", boxSizing: "border-box",
      whiteSpace: "nowrap", ...style }}>
      {children}
    </span>
  );
}

/** Verified or not, in words and an icon (never colour alone). */
export function TrustBadge({ verified }) {
  const ink = useInk();
  return verified ? (
    <Pill style={{ background: ink.softer, color: ink.onSoft, border: `1px solid ${ink.soft}` }}>
      <PixelStamp kind="check" size={16} />
      Verified on its own page
    </Pill>
  ) : (
    <Pill style={{ background: NEUTRAL_TAG, color: TEXT_MID, border: `1px solid ${BORDER}` }}>
      <PixelStamp kind="question" size={16} />
      Unconfirmed: check the provider
    </Pill>
  );
}

export function KindTag({ label = "Scholarship", kind = "scholarship" }) {
  return (
    <Pill style={{ background: SURFACE, color: TEXT_MID, border: `1px solid ${BORDER}`, borderRadius: 6 }}>
      <PixelStamp kind={kind === "scholarship" ? "star" : "sparkle"} size={16} />
      {label}
    </Pill>
  );
}

/** Save or Dismiss (ListingCard.jsx ActionButton). */
export function ActionButton({ children, primary, current }) {
  const ink = useInk();
  const look = current
    ? { background: SURFACE, color: TEXT_MUTED, border: `1.5px solid ${BORDER}` }
    : primary
      ? { background: ink.button.bg, color: ink.button.fg, border: `1.5px solid ${ink.button.bg}` }
      : { background: WHITE, color: TEXT_MID, border: `1.5px solid ${BORDER}` };
  return (
    <span style={{ minHeight: 44, padding: "0 16px", display: "inline-flex", alignItems: "center", gap: 8,
      borderRadius: RADIUS.control, fontFamily: SANS, fontSize: "0.98rem", fontWeight: 700, lineHeight: 1.25,
      boxSizing: "border-box", ...look }}>
      {children}
    </span>
  );
}

// ─── The speech bubble (ui/SpeechBubble.jsx) and MascotSays ─────────────────

const UNIT = 2;
const TAIL_AT = 14;
const STEPS = 3;
const STEP = 4;
const TAB_ROOM = 12;

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
  const out = -((side === "left" || side === "right" ? w : h) - 1) * UNIT;
  const place = {
    left: { left: out, top: at },
    right: { right: out, top: at },
    top: { top: out, left: at },
    bottom: { bottom: out, left: at },
  }[side];
  const rects = [];
  grid.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch !== ".") rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={ch === "k" ? INK_LINE : fill} />);
  }));
  return (
    <svg width={w * UNIT} height={h * UNIT} viewBox={`0 0 ${w} ${h}`} shapeRendering="crispEdges"
      style={{ position: "absolute", display: "block", ...place }}>
      {rects}
    </svg>
  );
}

export function SpeechBubble({ children, side = "left", style, tailAt = TAIL_AT, name }) {
  const ink = useInk();
  const bg = WHITE;
  const tabSide = side === "top" ? { right: 18 } : { left: 18 };
  return (
    <div style={{ position: "relative", marginTop: name ? TAB_ROOM : 0, minWidth: 0, boxSizing: "border-box", ...style }}>
      <div style={{ background: INK_LINE, clipPath: CLIP, padding: UNIT }}>
        <div style={{ background: bg, clipPath: CLIP, padding: "18px 16px 13px", fontFamily: SANS, fontSize: "1rem",
          fontWeight: 600, color: TEXT, lineHeight: 1.5, overflowWrap: "anywhere" }}>
          {children}
        </div>
      </div>
      {name && (
        <span style={{ position: "absolute", top: -11, ...tabSide, maxWidth: "calc(100% - 36px)",
          padding: "2px 8px", background: ink.soft, color: ink.onSoft,
          fontFamily: SANS, fontSize: "0.9rem", fontWeight: 800, letterSpacing: "0.01em",
          lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", boxSizing: "border-box",
          boxShadow: `0 -2px 0 ${INK_LINE}, 0 2px 0 ${INK_LINE}, -2px 0 0 ${INK_LINE}, 2px 0 0 ${INK_LINE}` }}>
          {name}
        </span>
      )}
      <Tail side={side} fill={bg} at={tailAt} />
    </div>
  );
}

/** agents/Mascot.jsx: the art at the largest whole scale that fits a `size`
 *  box, centred on whole pixels. Drawn by FrameSprite from the video clock. */
export function Mascot({ sprite = TALON, state = "idle", size = 80, offset = 0, hold = false, style }) {
  const scale = Math.max(1, Math.floor(Math.min(size / sprite.width, size / sprite.height)));
  const top = Math.max(0, Math.floor((size - sprite.height * scale) / 2));
  const left = Math.max(0, Math.floor((size - sprite.width * scale) / 2));
  return (
    <div style={{ width: size, height: size, flexShrink: 0, boxSizing: "border-box", paddingTop: top, paddingLeft: left, ...style }}>
      <FrameSprite sprite={sprite} state={state} scale={scale} offset={offset} hold={hold} />
    </div>
  );
}

/** agents/SpeechBubble.jsx MascotSays, as a phone (under 480px wide) shows
 *  it with layout "auto": the mascot above, the bubble under it, its tail
 *  pointing up at the bird and the name tab on the right. */
export function MascotSays({ name = "Talon", sprite = TALON, state = "idle", size = 80, offset = 0, children, style }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 20, minWidth: 0,
      paddingTop: TAB_ROOM, ...style }}>
      <Mascot sprite={sprite} state={state} size={size} offset={offset} />
      <SpeechBubble side="top" name={name} tailAt={Math.max(TAIL_AT, Math.round(size / 2 - TIP))}
        style={{ alignSelf: "stretch", marginTop: 0 }}>
        {children}
      </SpeechBubble>
    </div>
  );
}

// ─── The page under the status bar ──────────────────────────────────────────

/** What the browser shows below the phone's status bar: the page, scrolled.
 *  Rather than a scroll offset, the scene says where one element of the page
 *  sits (`anchorY`, px from the top of the viewport): `above` is laid out
 *  upward from that line and `below` downward from it, so a key element lands
 *  exactly where the scene wants it whatever the text above it measures.
 *  Animate anchorY to scroll. `overlay` draws over the page (a drawer). */
export function Viewport({ anchorY = 0, above, below, overlay, pad = "0 1rem", bg = BG }) {
  return (
    <div style={{ position: "absolute", left: 0, top: SCREEN.statusBar, width: SCREEN.width, bottom: 0, overflow: "hidden",
      background: bg, fontFamily: SANS, color: TEXT }}>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: `calc(100% - ${anchorY}px)`, padding: pad,
        boxSizing: "border-box" }}>
        {above}
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: anchorY, padding: pad, boxSizing: "border-box" }}>
        {below}
      </div>
      {overlay}
    </div>
  );
}

/** The text caret in a focused field: solid while keys land, else a blink. */
export function FieldCaret({ typing, color }) {
  const frame = useCurrentFrame();
  const on = typing || Math.floor(frame / 15) % 2 === 0;
  return (
    <span style={{ display: "inline-block", width: 1.5, height: "1.2em", marginLeft: 1, marginRight: -2.5,
      verticalAlign: "text-bottom", background: color, opacity: on ? 1 : 0 }} />
  );
}
