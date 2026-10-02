import { interpolate, useCurrentFrame } from "remotion";
import {
  BG, BORDER, RADIUS, SANS, TEXT, TEXT_MUTED, WHITE, hexToRgbString, readableOn, useInk,
} from "../../brand/brand.js";
import { BEAKER } from "../../brand/sprites.js";
import { FrameSprite } from "../../kit/FrameSprite.jsx";
import { CLAMP, SNAP } from "../../kit/motion.js";
import { SCREEN } from "../../kit/PhoneFrame.jsx";

// The pieces Beaker's screens are built from, rebuilt from the app's own
// (src/components/ui/kit.jsx, ui/SpeechBubble.jsx, agents/Mascot.jsx,
// agents/StepRail.jsx, outreach/ProgressChecklist.jsx, outreach/flowUi.jsx)
// at the same sizes, weights and colors. The app's versions can't be imported
// as they are: they pull in ThemeContext (and with it Supabase), framer-motion
// and timers. Everything that moves here moves on the video's clock.
//
// The pixel icons are pure, so they come straight from the app.
export { PixelArrow, PixelStamp } from "../../../../src/components/ui/PixelIcons.jsx";
import { PixelArrow, PixelBeakIcon, PixelStamp } from "../../../../src/components/ui/PixelIcons.jsx";

/** The accent as text straight on the grey page (kit.jsx textOnPage). */
export function textOnPage(ink) {
  return readableOn(ink.accent, BG, 4.5);
}

// ─── The phone's page ────────────────────────────────────────────────────────

/** The app's mobile page under the status bar: the grey page, the 16px
 *  gutter, and a scroll offset (CSS px). Content never draws under the
 *  status bar. `children` lay out from the page's own top. */
export function PhonePage({ scroll = 0, children, padTop = 20, bg = BG }) {
  return (
    <div style={{ position: "absolute", left: 0, top: SCREEN.statusBar, width: SCREEN.width, height: 900,
      overflow: "hidden", background: bg }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: SCREEN.width, boxSizing: "border-box",
        padding: `${padTop}px 16px 96px`, transform: `translateY(${-scroll}px)`, fontFamily: SANS, color: TEXT }}>
        {children}
      </div>
    </div>
  );
}

/** Where page content at page-y `y` sits on the screen (SCREEN coordinates),
 *  for placing a Tap over something that scrolled. */
export const onScreen = (y, scroll) => SCREEN.statusBar + y - scroll;

/** A page scroll on the clock: starts at `from` (CSS px), and each move
 *  { at, dur, to } flicks it to `to`, most of the way in the first frames
 *  (a thumb's fling settling), done after `dur`. Moves are in order.
 *  `easing` swaps the fling for another curve (a slow drag eases in and out). */
export function scrollAt(frame, from, moves = [], easing = SNAP) {
  let y = from;
  for (const m of moves) {
    if (frame < m.at) break;
    const p = interpolate(frame, [m.at, m.at + m.dur], [0, 1], { ...CLAMP, easing });
    if (frame < m.at + m.dur) return y + (m.to - y) * p;
    y = m.to;
  }
  return y;
}

/** The thumb that drags the page: the same grey disc as a Tap, dragged up
 *  `dist` px from (x, y) over `len` frames from `at`, then lifted. Pass the
 *  page's own `easing` so the thumb and the page move together. */
export function Swipe({ at, x, y, dist = 160, len = 5, size = 44, easing = SNAP }) {
  const frame = useCurrentFrame();
  if (frame < at - 2 || frame > at + len + 4) return null;
  const t = interpolate(frame, [at, at + len], [0, 1], { ...CLAMP, easing });
  const opacity = interpolate(frame, [at - 2, at, at + len, at + len + 4], [0, 0.4, 0.34, 0], CLAMP);
  return (
    <div style={{ position: "absolute", left: x - size / 2, top: y - dist * t - size / 2, width: size, height: size,
      borderRadius: "50%", background: "rgba(40,40,40,1)", border: "2px solid rgba(255,255,255,0.7)",
      boxSizing: "border-box", opacity, pointerEvents: "none", zIndex: 50 }} />
  );
}

/** Where a phone's screen really ends (SCREEN y): an iPhone is about 812 CSS
 *  px tall, so in the usual framing the bottom 150 or so is below the video's
 *  edge. Things pinned to the bottom of the screen sit against this line. */
export const PHONE_SCREEN_BOTTOM = 812;

// ─── The keyboard (iOS's, light) ────────────────────────────────────────────
// A focused field on a phone raises the keyboard; it slides up from the
// screen's bottom edge and back down when the field lets go. Drawn simply:
// the predictive bar and the letter rows on pale grey, in the system font
// (it's the phone's keyboard, not the app's). In the usual framing only its
// top shows, below the platforms' safe line, so it hides nothing a viewer
// needs; on screen it is just a thumb's-width taller than a viewer expects.

export const KEYBOARD_HEIGHT = 336;    // with the predictive bar, as on an iPhone
const KB_BAR = 44;
const KB_KEY_H = 42;
const KB_ROW = 54;                     // a key and the gap under it
const KB_GAP = 6;
const KB_SIDE = 3;
const KB_BG = "#d1d4d9";
const KB_DARK = "#abb0ba";             // shift, delete, 123, return
const KB_SHADOW = "0 1px 0 #898a8d";
const KB_FONT = "system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif";
const KB_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];

function Key({ x, y, w, dark = false, children, size = 22 }) {
  return (
    <span style={{ position: "absolute", left: x, top: y, width: w, height: KB_KEY_H, borderRadius: 5,
      background: dark ? KB_DARK : WHITE, boxShadow: KB_SHADOW, display: "flex", alignItems: "center",
      justifyContent: "center", fontFamily: KB_FONT, fontSize: size, fontWeight: 400, color: "#000", lineHeight: 1 }}>
      {children}
    </span>
  );
}

/**
 * shown: 0 (below the screen) to 1 (up). bottom: the screen's real bottom
 * edge, SCREEN y. suggestions: the predictive bar's three words.
 */
export function Keyboard({ shown = 1, bottom = PHONE_SCREEN_BOTTOM, suggestions = [] }) {
  const up = Math.max(0, Math.min(1, shown));
  if (up <= 0) return null;
  const w = SCREEN.width;
  const key = (w - KB_SIDE * 2 - KB_GAP * 9) / 10;
  const rowY = (i) => KB_BAR + 8 + i * KB_ROW;
  const side = key + 12;               // shift and delete
  const lastRow = (w - KB_SIDE * 2 - KB_GAP * 2);
  const short = Math.round(lastRow * 0.24);
  return (
    <div style={{ position: "absolute", left: 0, top: bottom - KEYBOARD_HEIGHT, width: w, height: KEYBOARD_HEIGHT,
      background: KB_BG, transform: `translateY(${(1 - up) * KEYBOARD_HEIGHT}px)`, zIndex: 40, overflow: "hidden" }}>
      {/* The predictive bar: three words, thin dividers between them. */}
      <div style={{ position: "absolute", left: 0, top: 0, width: w, height: KB_BAR, display: "flex", alignItems: "center" }}>
        {[0, 1, 2].map((i) => (
          <span key={i} style={{ flex: 1, textAlign: "center", fontFamily: KB_FONT, fontSize: 16, color: "#000",
            borderLeft: i > 0 ? "1px solid #b4b7be" : "none", lineHeight: "24px", whiteSpace: "nowrap", overflow: "hidden" }}>
            {suggestions[i] || ""}
          </span>
        ))}
      </div>
      {KB_ROWS.map((row, r) => {
        const width = row.length * key + (row.length - 1) * KB_GAP;
        const x0 = (w - width) / 2;
        return [...row].map((ch, i) => (
          <Key key={`${r}-${ch}`} x={x0 + i * (key + KB_GAP)} y={rowY(r)} w={key}>{ch}</Key>
        ));
      })}
      <Key x={KB_SIDE} y={rowY(2)} w={side} dark>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="1.8" strokeLinejoin="round">
          <path d="M12 4 3.5 13H8v7h8v-7h4.5z" />
        </svg>
      </Key>
      <Key x={w - KB_SIDE - side} y={rowY(2)} w={side} dark>
        <svg width="22" height="18" viewBox="0 0 28 22" fill="none" stroke="#000" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round">
          <path d="M9 3h16v16H9L2 11z" /><path d="m13.5 7.5 7 7m0-7-7 7" />
        </svg>
      </Key>
      <Key x={KB_SIDE} y={rowY(3)} w={short} dark size={16}>123</Key>
      <Key x={KB_SIDE + short + KB_GAP} y={rowY(3)} w={lastRow - short * 2} size={16}>space</Key>
      <Key x={w - KB_SIDE - short} y={rowY(3)} w={short} dark size={16}>return</Key>
    </div>
  );
}

// ─── The bottom nav (common/MobileNav.jsx) ──────────────────────────────────
// On a phone every /agents page has it: a 60px white bar pinned to the
// bottom with the app's enabled sections (features.js), the current one in
// the accent, and the round feedback button floating 12px above its left
// end. The icons are the app's own: the beak is imported (PixelIcons.jsx is
// pure); the rest are inline SVGs in MobileNav.jsx and questUi.jsx, which
// pull in the theme context, so their paths are copied here.

const NAV_GREY = "#6a6760";
const navSvg = (active, children) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2}
    strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);
const NAV_ITEMS = [
  { key: "quest", label: "Quest", icon: (on) => navSvg(on, <>
    <path d="M3 5l3-1.2 3 1.2 3-1.2 3 1.2 3-1.2 3 1.2v14l-3 1.2-3-1.2-3 1.2-3-1.2-3 1.2-3-1.2z" />
    <path d="M7 16c1.8-.8 2.8-.1 4-1.5 1-1.2.8-2.7 2.4-3.6" strokeDasharray="0.1 2.6" />
    <path d="M14.9 7.9l3.2 3.2M18.1 7.9l-3.2 3.2" />
  </>) },
  { key: "colleges", label: "Colleges", icon: (on) => navSvg(on, <>
    <path d="M21.42 10.92a1 1 0 0 0-.02-1.84L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.83l8.57 3.91a2 2 0 0 0 1.66 0z" />
    <path d="M22 10v6" /><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5" />
  </>) },
  { key: "chat", label: "Chat", icon: (on) => navSvg(on,
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />) },
  { key: "portfolio", label: "Portfolio", icon: (on) => navSvg(on, <>
    <rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
  </>) },
  { key: "agents", label: "Agents", icon: () => <PixelBeakIcon size={22} /> },
  { key: "profile", label: "Profile", icon: (on) => navSvg(on, <>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
  </>) },
];

/** The nav and the feedback button, against the bottom of the page
 *  (`bottom`, SCREEN y): the browser's viewport, which on an iPhone ends
 *  above Safari's bottom bar (the app has no viewport-fit=cover, so it never
 *  runs under the home indicator). A sheet (zIndex 20 and up) covers both. */
export function MobileNav({ bottom = PHONE_SCREEN_BOTTOM, active = "agents" }) {
  const ink = useInk();
  const rgb = hexToRgbString(ink.accent);
  return (
    <>
      <span style={{ position: "absolute", left: 12, top: bottom - 60 - 12 - 44, width: 44, height: 44, borderRadius: "50%",
        background: ink.accent, boxShadow: `0 4px 16px rgba(${rgb},0.35)`, display: "flex", alignItems: "center",
        justifyContent: "center", zIndex: 11 }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </span>
      <nav style={{ position: "absolute", left: 0, top: bottom - 60, width: SCREEN.width, height: 60, display: "flex",
        alignItems: "stretch", background: "rgba(255,255,255,0.96)", backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)", borderTop: `1px solid rgba(${rgb},0.08)`,
        boxShadow: "0 -2px 16px rgba(15,23,42,0.06)", boxSizing: "border-box", zIndex: 10 }}>
        {NAV_ITEMS.map((item) => {
          const on = item.key === active;
          return (
            <span key={item.key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", gap: 2, padding: "4px 0", color: on ? ink.accent : NAV_GREY, minWidth: 44 }}>
              {item.icon(on)}
              <span style={{ fontFamily: SANS, fontSize: 9, fontWeight: on ? 700 : 500, letterSpacing: "0.03em", lineHeight: 1 }}>
                {item.label}
              </span>
            </span>
          );
        })}
      </nav>
    </>
  );
}

// ─── Safari's bottom bar (iOS, light) ───────────────────────────────────────
// Under the page on an iPhone: the address pill, the toolbar, and the home
// indicator, from the viewport's bottom (`top`, SCREEN y) down. It's the
// phone's browser, not the app, so it's drawn in the system font and iOS's
// own blue, like the keyboard. The page and any sheet end at `top`.

export const SAFARI_BAR_HEIGHT = 140;   // pill row, toolbar row, home indicator inset
const IOS_BLUE = "#007aff";
const IOS_GREY = "#b8b8bd";             // a disabled toolbar button

const barSvg = (color, children, size = 24) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.9"
    strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

export function SafariBar({ top, url = "mentorable.net" }) {
  return (
    <div style={{ position: "absolute", left: 0, top, width: SCREEN.width, height: SAFARI_BAR_HEIGHT + 20,
      background: "#f7f7f8", borderTop: "0.5px solid rgba(0,0,0,0.16)", zIndex: 30, fontFamily: KB_FONT }}>
      {/* The address pill: aA, the lock and the site, reload. */}
      <div style={{ position: "absolute", left: 12, right: 12, top: 8, height: 46, borderRadius: 13,
        background: "#e6e6ea", display: "flex", alignItems: "center", padding: "0 14px", boxSizing: "border-box" }}>
        <span style={{ fontSize: 17, color: "#000", letterSpacing: "-0.02em" }}>
          <span style={{ fontSize: 13 }}>a</span>A
        </span>
        <span style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
          fontSize: 17, color: "#000" }}>
          <svg width="11" height="14" viewBox="0 0 11 14">
            <rect x="0.5" y="6" width="10" height="7.5" rx="1.6" fill="#000" />
            <path d="M2.6 6V4.2a2.9 2.9 0 0 1 5.8 0V6" fill="none" stroke="#000" strokeWidth="1.5" />
          </svg>
          {url}
        </span>
        {barSvg("#000", <><path d="M20 12a8 8 0 1 1-2.6-5.9" /><path d="M20 4v4.5h-4.5" /></>, 18)}
      </div>
      {/* The toolbar: back, forward (nothing to go forward to), share, bookmarks, tabs. */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 60, height: 46, display: "flex",
        alignItems: "center", justifyContent: "space-around", padding: "0 6px" }}>
        {barSvg(IOS_BLUE, <path d="M15 4.5 7.5 12l7.5 7.5" />)}
        {barSvg(IOS_GREY, <path d="M9 4.5 16.5 12 9 19.5" />)}
        {barSvg(IOS_BLUE, <><path d="M8 9H6.5a1.5 1.5 0 0 0-1.5 1.5v9A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 17.5 9H16" /><path d="M12 14V2.5M8.5 6 12 2.5 15.5 6" /></>)}
        {barSvg(IOS_BLUE, <><path d="M12 6.5C10 4.8 7 4.2 3 4.5v14c4-.3 7 .3 9 2 2-1.7 5-2.3 9-2v-14c-4-.3-7 .3-9 2z" /><path d="M12 6.5v14" /></>)}
        {barSvg(IOS_BLUE, <><rect x="3.5" y="7.5" width="13" height="13" rx="2" /><path d="M7.5 4.5h10a2 2 0 0 1 2 2v10" /></>)}
      </div>
      <div style={{ position: "absolute", left: (SCREEN.width - 134) / 2, top: SAFARI_BAR_HEIGHT - 13, width: 134,
        height: 5, borderRadius: 99, background: "#000" }} />
    </div>
  );
}

// ─── Mascot and speech bubble (agents/Mascot.jsx, ui/SpeechBubble.jsx) ──────

/** Where the art sits in a `size` box: whole CSS pixels, as the app's mascotFit. */
export function mascotFit(size, sprite = BEAKER) {
  const box = Math.max(0, Math.floor(Number(size) || 0));
  const scale = Math.max(1, Math.floor(Math.min(box / sprite.width, box / sprite.height)));
  const width = sprite.width * scale;
  const height = sprite.height * scale;
  return {
    scale, width, height,
    top: Math.max(0, Math.floor((box - height) / 2)),
    left: Math.max(0, Math.floor((box - width) / 2)),
    beakRow: sprite.beakRow ?? 10,
  };
}

export function Mascot({ sprite = BEAKER, state = "idle", size = 80, offset = 0, style }) {
  const fit = mascotFit(size, sprite);
  return (
    <div style={{ width: size, height: size, flexShrink: 0, boxSizing: "border-box", paddingTop: fit.top,
      paddingLeft: fit.left, ...style }}>
      <FrameSprite sprite={sprite} state={state} scale={fit.scale} offset={offset} />
    </div>
  );
}

const INK = TEXT;
const UNIT = 2;
const TAIL_AT = 14;
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
const CLIP = stepClip(3, 4);

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
const TAILS = { left: TAIL_LEFT, right: mirror(TAIL_LEFT), top: transpose(TAIL_LEFT), bottom: [...transpose(TAIL_LEFT)].reverse() };

function Tail({ side, fill, at }) {
  const grid = TAILS[side];
  if (!grid) return null;
  const w = grid[0].length;
  const h = grid.length;
  const out = -((side === "left" || side === "right" ? w : h) - 1) * UNIT;
  const place = { left: { left: out, top: at }, right: { right: out, top: at }, top: { top: out, left: at },
    bottom: { bottom: out, left: at } }[side];
  const rects = [];
  grid.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch !== ".") rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={ch === "k" ? INK : fill} />);
  }));
  return (
    <svg width={w * UNIT} height={h * UNIT} viewBox={`0 0 ${w} ${h}`} shapeRendering="crispEdges"
      style={{ position: "absolute", display: "block", ...place }}>
      {rects}
    </svg>
  );
}

/** The game dialog box: a 2px ink frame with stepped corners, a name tab on
 *  the top edge, a pixel wedge for the tail. */
export function SpeechBubble({ children, side = "left", tone = "default", style, tailAt = TAIL_AT, name }) {
  const ink = useInk();
  const accent = tone === "accent";
  const bg = accent ? ink.soft : WHITE;
  const tabSide = side === "top" ? { right: 18 } : { left: 18 };
  return (
    <div style={{ position: "relative", marginTop: name ? TAB_ROOM : 0, minWidth: 0, boxSizing: "border-box", ...style }}>
      <div style={{ background: INK, clipPath: CLIP, padding: UNIT }}>
        <div style={{ background: bg, clipPath: CLIP, padding: "18px 16px 13px", fontFamily: SANS, fontSize: "1rem",
          fontWeight: 600, color: TEXT, lineHeight: 1.5, overflowWrap: "anywhere" }}>
          {children}
        </div>
      </div>
      {name && (
        <span style={{ position: "absolute", top: -11, ...tabSide, maxWidth: "calc(100% - 36px)",
          padding: "2px 8px", background: accent ? WHITE : ink.soft, color: accent ? ink.text : ink.onSoft,
          fontFamily: SANS, fontSize: "0.9rem", fontWeight: 800, letterSpacing: "0.01em", lineHeight: 1.3,
          whiteSpace: "nowrap", boxSizing: "border-box",
          boxShadow: `0 -2px 0 ${INK}, 0 2px 0 ${INK}, -2px 0 0 ${INK}, 2px 0 0 ${INK}` }}>
          {name}
        </span>
      )}
      <Tail side={side} fill={bg} at={tailAt} />
    </div>
  );
}

/** A mascot and what it says (agents/SpeechBubble.jsx MascotSays). On a
 *  phone (under 480px) the app stacks it: the mascot, then the bubble with
 *  its tail pointing up at the mascot. */
export function MascotSays({ state = "idle", size = 80, offset = 0, children, layout = "stack", style }) {
  const stacked = layout === "stack";
  const fit = mascotFit(size);
  const beakY = fit.top + fit.beakRow * fit.scale;
  return (
    <div style={{ display: "flex", flexDirection: stacked ? "column" : "row", alignItems: "flex-start",
      gap: stacked ? 20 : 16, minWidth: 0, paddingTop: TAB_ROOM, ...style }}>
      <Mascot state={state} size={size} offset={offset} />
      <SpeechBubble side={stacked ? "top" : "left"} name="Beaker"
        tailAt={stacked ? Math.max(TAIL_AT, Math.round(size / 2 - TIP)) : TAIL_AT}
        style={stacked ? { alignSelf: "stretch", marginTop: 0 }
          : { marginTop: Math.max(0, Math.round(beakY - TAIL_AT - TIP)), flex: "0 1 auto", maxWidth: 560 }}>
        {children}
      </SpeechBubble>
    </div>
  );
}

// ─── Step rail (agents/StepRail.jsx), as a phone shows it ────────────────────

const TILE = 30;
const ABOVE = 34;
const TILE_EDGE = "#d6d1c9";
const DOTS_OFF = "#c4bfb6";
const TILE_CLIP = "polygon(0 2px,2px 2px,2px 0,calc(100% - 2px) 0,calc(100% - 2px) 2px,100% 2px,100% calc(100% - 2px),calc(100% - 2px) calc(100% - 2px),calc(100% - 2px) 100%,2px 100%,2px calc(100% - 2px),0 calc(100% - 2px))";

function Tile({ done, on, n, ink }) {
  const face = { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
    clipPath: TILE_CLIP, fontSize: "0.95rem", fontWeight: 800, fontVariantNumeric: "tabular-nums", boxSizing: "border-box" };
  const inner = on ? { background: ink.button.bg, color: ink.button.fg }
    : done ? { background: ink.soft, color: ink.onSoft } : { background: WHITE, color: TEXT_MUTED };
  return (
    <span style={{ position: "relative", zIndex: 1, width: TILE, height: TILE, display: "block",
      background: on || done ? "transparent" : TILE_EDGE, clipPath: TILE_CLIP, padding: on || done ? 0 : 2, boxSizing: "border-box" }}>
      <span style={{ ...face, ...inner }}>{done ? <PixelStamp kind="check" size={16} /> : n}</span>
    </span>
  );
}

/** Narrow (a phone): tiles only, Beaker on the current one, one line under. */
export function StepRail({ steps, current, offset = 0 }) {
  const ink = useInk();
  const at = Math.max(0, steps.findIndex((s) => s.key === current));
  return (
    <div style={{ fontFamily: SANS }}>
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", alignItems: "flex-start" }}>
        {steps.map((s, i) => {
          const done = i < at;
          const on = i === at;
          return (
            <li key={s.key} style={{ flex: "1 1 0", minWidth: 0, position: "relative", paddingTop: ABOVE, display: "flex",
              flexDirection: "column", alignItems: "center" }}>
              {i > 0 && (
                <span style={{ position: "absolute", top: ABOVE + TILE / 2 - 1, right: "50%", width: "100%", height: 2,
                  background: `linear-gradient(90deg, ${i <= at ? ink.ring : DOTS_OFF} 50%, transparent 50%) left top / 4px 2px repeat-x` }} />
              )}
              {on && (
                <span style={{ position: "absolute", top: 0, left: "50%", marginLeft: -16, zIndex: 2 }}>
                  <Mascot state="idle" size={32} offset={offset} />
                </span>
              )}
              <Tile done={done} on={on} n={i + 1} ink={ink} />
            </li>
          );
        })}
      </ol>
      <p style={{ margin: "8px 0 0", fontSize: "0.95rem", fontWeight: 700, color: TEXT, lineHeight: 1.5 }}>
        {`Step ${at + 1} of ${steps.length}: ${steps[at].label}`}
      </p>
    </div>
  );
}

// ─── Buttons, cards, fields (ui/kit.jsx) ────────────────────────────────────

/** A spinner on the video clock (common/Spinner.jsx turns once every 0.75 s). */
export function Spinner({ size = 16, color = "#ffffff" }) {
  const frame = useCurrentFrame();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      style={{ flexShrink: 0, transform: `rotate(${(frame / 22.5) * 360}deg)` }}>
      <circle cx="12" cy="12" r="10" stroke={`${color}44`} strokeWidth="3" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke={color} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** kind: primary | secondary | quiet. `pressed`: the pixel-down a primary
 *  button takes under a thumb (the app's .ag-press). */
export function Button({ kind = "secondary", busy = false, pressed = false, children, style }) {
  const ink = useInk();
  const look = {
    primary: { background: ink.button.bg, color: ink.button.fg, border: `2px solid ${ink.button.bg}` },
    secondary: { background: WHITE, color: "#3d3d3a", border: `1.5px solid ${BORDER}` },
    quiet: { background: "transparent", color: textOnPage(ink), border: "1.5px solid transparent" },
  }[kind];
  return (
    <span style={{ fontFamily: SANS, fontSize: "1rem", fontWeight: 700, minHeight: 44, padding: "10px 18px",
      borderRadius: RADIUS.control, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
      lineHeight: 1.25, textAlign: "center", boxSizing: "border-box",
      transform: pressed && kind === "primary" ? "translateY(1px)" : undefined,
      filter: pressed && kind === "primary" ? "brightness(0.93)" : undefined, ...look, ...style }}>
      {busy && <Spinner size={16} color={kind === "primary" ? ink.button.fg : textOnPage(ink)} />}
      {children}
    </span>
  );
}

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
      <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: "1rem", color: TEXT }}>
        {children}
        {optional && <span style={{ fontWeight: 600, color: TEXT_MUTED }}> (optional)</span>}
      </span>
      {hint && <p style={{ margin: "2px 0 0", fontFamily: SANS, fontSize: "0.92rem", color: TEXT_MUTED, lineHeight: 1.5 }}>{hint}</p>}
    </div>
  );
}

export const inputStyle = {
  width: "100%", boxSizing: "border-box", fontFamily: SANS, fontSize: "1rem", color: TEXT, background: WHITE,
  border: `1.5px solid ${BORDER}`, borderRadius: RADIUS.control, padding: "11px 13px", minHeight: 46, lineHeight: 1.5,
};

/** The focus ring an input gets once tapped (kit.jsx: 3px of the ring color, 1px out). */
export const focusRing = (ink) => ({ outline: `3px solid ${ink.ring}`, outlineOffset: 1 });

/** A link to a source page (flowUi.jsx SourceLink): bold, the accent, underlined. */
export function SourceLink({ children, inline = false, style }) {
  const ink = useInk();
  return (
    <span style={{ fontFamily: SANS, fontWeight: 700, color: textOnPage(ink), textDecoration: "underline",
      textUnderlineOffset: 3, overflowWrap: "anywhere", borderRadius: 4,
      ...(inline ? null : { display: "inline-flex", alignItems: "center", minHeight: 44, maxWidth: "100%", boxSizing: "border-box" }),
      ...style }}>
      {children}
    </span>
  );
}

/** A text caret: solid while keys land, else blinking half a second on, half
 *  off (counted from `since`, when the field was tapped). */
export function TextCaret({ solid = false, since = 0, color = TEXT, height = "1.2em" }) {
  const frame = useCurrentFrame();
  const on = solid || Math.floor((frame - since) / 15) % 2 === 0;
  return (
    <span style={{ display: "inline-block", width: 0, height: 0, position: "relative", verticalAlign: "baseline" }}>
      <span style={{ position: "absolute", left: -1, bottom: -4, width: 2, height, background: color, opacity: on ? 1 : 0 }} />
    </span>
  );
}

/** The back link every outreach page opens with. */
export function BackLink({ color }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minHeight: 44, padding: "0 6px", marginLeft: -6,
      fontFamily: SANS, fontSize: "0.98rem", fontWeight: 700, color, borderRadius: 10 }}>
      <PixelArrow size={16} style={{ transform: "scaleX(-1)" }} />
      Your board
    </span>
  );
}
