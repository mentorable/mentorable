import { useLayoutEffect, useRef, useState } from "react";
import { FixedTheme } from "../../lib/ThemeContext.jsx";
import { lighten } from "../../lib/theme.js";
import { Button, SR_ONLY } from "../ui/kit.jsx";
import { FOCUS_CLASS } from "../ui/tokens.js";
import { PixelArrow, PixelBeakIcon, PixelStamp } from "../ui/PixelIcons.jsx";
import { Flame, TreasureMapIcon } from "../quest/questUi.jsx";
import { C, SANS, SHADOW, TYPE, useMedia, useReduce } from "./kit.js";

// The landing page's frames and chrome: the inert mockup wrapper every
// scripted screen sits in, the three devices, the recreated app shell
// (sidebar and phone tab bar), the one moving pointer, and the small text
// pieces (signpost, two-tone heading, buttons, links, the play pill).
//
// Inside a device the app's own sizes and weights apply (a mockup is the app,
// not landing chrome); everything outside follows kit.js TYPE.

const FRAMES_CSS = `
.lp-still, .lp-still * { animation-play-state: paused !important; }
.lp-link:hover { text-decoration: underline; text-underline-offset: 4px; }
.lp-cursor { transition: left 520ms cubic-bezier(.4,0,.2,1), top 520ms cubic-bezier(.4,0,.2,1), transform 120ms ease, opacity 200ms ease; }
.lp-tap-ring { animation: lp-tap 300ms ease-out forwards; }
@keyframes lp-tap { from { transform: translate(-50%, -50%) scale(.6); opacity: 1; } to { transform: translate(-50%, -50%) scale(1); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .lp-cursor { transition: none; } .lp-tap-ring { animation: none; opacity: 0; } }
`;
if (typeof document !== "undefined" && !document.querySelector("style[data-lp-frames]")) {
  const el = document.createElement("style");
  el.dataset.lpFrames = "";
  el.textContent = FRAMES_CSS;
  document.head.appendChild(el);
}

const APP_BG = "#F5F5F5";
const INK = "#141413";

// ─── Text pieces ─────────────────────────────────────────────────────────────

/** Screen-reader-only text. Other props pass through (a label's `htmlFor`). */
export function SrOnly({ children, as: Tag = "span", ...rest }) {
  return <Tag style={SR_ONLY} {...rest}>{children}</Tag>;
}

/** A section's name with its 16px pixel stamp before it. `beak` draws the
 *  Agents icon instead of a stamp. */
export function Signpost({ stamp, children, tone = "accent", beak = false, style }) {
  const color = tone === "onBlue" ? C.onBlue : C.accent;
  return (
    <p style={{ ...TYPE.signpost, color, display: "flex", alignItems: "center", gap: 8, ...style }}>
      <span aria-hidden="true" style={{ display: "inline-flex", flexShrink: 0 }}>
        {beak ? <PixelBeakIcon size={16} /> : <PixelStamp kind={stamp} size={16} />}
      </span>
      <span>{children}</span>
    </p>
  );
}

/** The two-tone heading: the lead in ink, the continuation in muted, one
 *  element. On the blue band: white and the soft white. */
export function TwoTone({ as: Tag = "h2", lead, rest, tone = "page", style }) {
  const on = tone === "onBlue";
  return (
    <Tag style={{ ...TYPE.h2, color: on ? C.onBlue : C.ink, ...style }}>
      {lead}
      {rest ? <> <span style={{ color: on ? C.onBlueSoft : C.muted }}>{rest}</span></> : null}
    </Tag>
  );
}

/** The kit Button at the landing's two sizes. `onBlue`: white fill, accent text. */
export function LpButton({ kind = "primary", size = "lg", style, ...rest }) {
  const sz = size === "sm"
    ? { minHeight: 44, padding: "8px 16px", fontSize: "0.95rem" }
    : { minHeight: 52, padding: "14px 24px", fontSize: "1.05rem" };
  const look = kind === "onBlue" ? { background: "#ffffff", color: C.accent, border: "2px solid #ffffff" } : null;
  return <Button kind={kind === "onBlue" ? "secondary" : kind} style={{ ...sz, ...look, ...style }} {...rest} />;
}

/** A text link with the app's pixel arrow after it (rotated for down and up). */
export function TextLink({ onClick, href, arrow = "right", tone = "accent", children, style, ...rest }) {
  const color = tone === "onBlue" ? C.onBlue : tone === "ink" ? C.ink : C.accent;
  const rot = arrow === "down" ? "rotate(90deg)" : arrow === "up" ? "rotate(-90deg)" : undefined;
  const base = {
    fontFamily: SANS, fontSize: "1rem", fontWeight: 700, color, background: "none", border: "none", padding: 0,
    cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none", lineHeight: 1.3,
    minHeight: 44, borderRadius: 6, ...style,
  };
  const inner = (
    <>
      {children}
      {arrow && <PixelArrow size={16} style={{ transform: rot, flexShrink: 0 }} />}
    </>
  );
  if (href) {
    return <a href={href} className={`${FOCUS_CLASS} lp-link`} style={base} onClick={onClick} {...rest}>{inner}</a>;
  }
  return <button type="button" className={`${FOCUS_CLASS} lp-link`} style={base} onClick={onClick} {...rest}>{inner}</button>;
}

// Pause, play and replay, drawn on a 4px grid.
const GLYPHS = {
  pause: ["x.x", "x.x", "x.x"],
  play: ["x..", "xx.", "xxx", "xx.", "x.."],
  replay: ["x.xx.", "xx..x", "xxx.x", "....x", ".xxx."],
};
function Glyph({ grid, px = 4, color = INK }) {
  const rects = [];
  grid.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) if (row[x] === "x") rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={color} />);
  });
  return (
    <svg aria-hidden="true" focusable="false" width={grid[0].length * px} height={grid.length * px}
      viewBox={`0 0 ${grid[0].length} ${grid.length}`} shapeRendering="crispEdges" style={{ display: "block" }}>
      {rects}
    </svg>
  );
}

/** The pill under an autoplaying screen longer than 5s: Pause while playing,
 *  Play while paused, Replay when done. */
export function PlayPill({ state = "playing", onPause, onPlay, onReplay, tone = "page", style }) {
  const touch = useMedia("(pointer: coarse)");
  const h = touch ? 44 : 36;
  const label = state === "playing" ? "Pause" : state === "paused" ? "Play" : "Replay";
  const glyph = state === "playing" ? GLYPHS.pause : state === "paused" ? GLYPHS.play : GLYPHS.replay;
  const onClick = state === "playing" ? onPause : state === "paused" ? onPlay : onReplay;
  return (
    <button type="button" className={FOCUS_CLASS} onClick={onClick} data-tone={tone}
      style={{ height: h, minWidth: 44, padding: "0 12px 0 10px", display: "inline-flex", alignItems: "center", gap: 8,
        background: "#ffffff", border: `1px solid ${C.line}`, borderRadius: 10, cursor: "pointer", fontFamily: SANS,
        fontSize: "0.9rem", fontWeight: 700, color: C.ink, boxSizing: "border-box", ...style }}>
      <Glyph grid={glyph} />
      {label}
    </button>
  );
}

// ─── The mockup wrapper ──────────────────────────────────────────────────────

/**
 * Every scripted screen's wrapper: decoration to assistive tech (aria-hidden,
 * inert), the brand accent pinned by FixedTheme and local CSS variables, the
 * `data-lp-frame` the Cursor looks for, and `lp-still` once settled (every
 * CSS animation inside pauses). `label` is the one text alternative, as a
 * sibling the screen reader can reach. `isolation` keeps a screen's own
 * z-indexes (a sticky title bar, a toast) inside it, so they never paint
 * over the birds or bubbles placed beside the mockup; each device screen
 * does the same, so a laptop's screen never paints over the phone in front.
 */
export function Mockup({ label, settled = false, children, style, className }) {
  const cls = `${settled ? "lp-still " : ""}${className || ""}`.trim();
  return (
    <>
      <div data-lp-frame="" aria-hidden="true" inert className={cls || undefined}
        style={{ "--accent": C.accent, "--accent-rgb": "29,78,216", "--accent-light": lighten(C.accent, 0.35),
          "--ag-ring": C.accent, position: "relative", isolation: "isolate", ...style }}>
        <FixedTheme accent={C.accent}>{children}</FixedTheme>
      </div>
      {label ? <SrOnly>{label}</SrOnly> : null}
    </>
  );
}

// ─── Devices ─────────────────────────────────────────────────────────────────

const WINDOW_CHROME = 38;   // 36 of surface plus the hairline under it; a 600 window leaves a 560 screen

/** A browser window: 36px chrome with three square buttons and the address
 *  chip, then the screen. The outer box is `width` x `height`; the screen
 *  inside it is (width - 2) x (height - 40), so 880 x 600 holds 878 x 560. */
export function BrowserWindow({ address, width = 880, height = 600, children, style }) {
  return (
    <div style={{ width, height, boxSizing: "border-box", background: "#ffffff", border: `1px solid ${C.line}`,
      borderRadius: 14, overflow: "hidden", boxShadow: SHADOW.device, display: "flex", flexDirection: "column",
      flexShrink: 0, ...style }}>
      <div style={{ height: WINDOW_CHROME, flexShrink: 0, background: C.surface, borderBottom: `1px solid ${C.line}`,
        boxSizing: "border-box", display: "flex", alignItems: "center", padding: "0 14px", position: "relative" }}>
        <div style={{ display: "flex", gap: 6 }}>
          {[0, 1, 2].map((i) => <span key={i} style={{ width: 8, height: 8, background: C.line, display: "block" }} />)}
        </div>
        {address && (
          <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", fontFamily: SANS,
            fontSize: 12, fontWeight: 600, color: C.faint, background: "#f3f1ed", borderRadius: 8, padding: "4px 12px",
            lineHeight: 1.2, maxWidth: "60%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {address}
          </div>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0, position: "relative", overflow: "hidden", background: APP_BG, isolation: "isolate" }}>
        {children}
      </div>
    </div>
  );
}

const LAPTOP = { screenW: 860, screenH: 538, bezel: 10, baseW: 920, baseH: 20 };

/**
 * A laptop: a 860 x 538 screen in a 10px ink bezel (radius 16 at the top) on
 * a 20px base 920 wide with a notch. 920 x 578 in all. `paper` renders in a
 * zero-size anchor at the lid's bottom-right corner (x: the lid's right edge,
 * y: the top of the base), painted behind the lid; it positions itself from
 * there (RecordScreen.Paper uses left: -120, bottom: 40).
 */
export function Laptop({ children, paper = null, style }) {
  const lidW = LAPTOP.screenW + 2 * LAPTOP.bezel;
  const lidH = LAPTOP.screenH + 2 * LAPTOP.bezel;
  const lidLeft = (LAPTOP.baseW - lidW) / 2;
  return (
    <div style={{ width: LAPTOP.baseW, height: lidH + LAPTOP.baseH, position: "relative", flexShrink: 0, ...style }}>
      {paper && (
        <div style={{ position: "absolute", left: lidLeft + lidW, top: lidH, width: 0, height: 0, overflow: "visible",
          pointerEvents: "none" }}>
          {paper}
        </div>
      )}
      <div style={{ position: "absolute", left: lidLeft, top: 0, width: lidW, height: lidH, background: INK,
        borderRadius: "16px 16px 0 0", padding: LAPTOP.bezel, boxSizing: "border-box", boxShadow: SHADOW.device }}>
        <div style={{ width: LAPTOP.screenW, height: LAPTOP.screenH, background: APP_BG, overflow: "hidden", isolation: "isolate",
          position: "relative", borderRadius: 6 }}>
          {children}
        </div>
      </div>
      <div style={{ position: "absolute", left: 0, top: lidH, width: LAPTOP.baseW, height: LAPTOP.baseH, background: "#dcd8d1",
        borderRadius: "0 0 10px 10px", boxShadow: SHADOW.device }}>
        <div style={{ position: "absolute", left: "50%", top: 0, transform: "translateX(-50%)", width: 120, height: 6,
          background: "#c9c4bc", borderRadius: "0 0 4px 4px" }} />
      </div>
    </div>
  );
}

const PHONE = { bezel: 12, status: 40, radius: 46, innerRadius: 34 };

/**
 * A phone: a 12px ink bezel around a status row (40px, "9:41") and the app
 * area, appWidth x appHeight. Default outer 384 x 764. `translateZ(0)` makes
 * the frame the containing block for anything fixed inside. `cropBottom`
 * cuts that many px off the frame's bottom (the frame, never the UI).
 */
export function Phone({ children, time = "9:41", appWidth = 360, appHeight = 700, cropBottom = 0, style }) {
  const outerW = appWidth + 2 * PHONE.bezel;
  const outerH = appHeight + PHONE.status + 2 * PHONE.bezel;
  const crop = Math.max(0, Math.min(outerH, cropBottom));
  return (
    <div style={{ width: outerW, height: outerH - crop, overflow: crop ? "hidden" : "visible", flexShrink: 0, ...style }}>
      <div style={{ width: outerW, height: outerH, background: INK, borderRadius: PHONE.radius, padding: PHONE.bezel,
        boxSizing: "border-box", boxShadow: SHADOW.device, transform: "translateZ(0)", position: "relative" }}>
        <div style={{ width: appWidth, height: appHeight + PHONE.status, borderRadius: PHONE.innerRadius, overflow: "hidden",
          background: APP_BG, position: "relative" }}>
          <div style={{ height: PHONE.status, display: "flex", alignItems: "center", padding: "0 0 0 28px", fontFamily: SANS,
            fontSize: 14, fontWeight: 700, color: INK, position: "relative" }}>
            {time}
            <span style={{ position: "absolute", left: "50%", top: 10, transform: "translateX(-50%)", width: 96, height: 28,
              borderRadius: 14, background: INK }} />
          </div>
          <div style={{ width: appWidth, height: appHeight, position: "relative", overflow: "hidden", isolation: "isolate" }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

/** A mobile screen with no device: full column width (at most 360), white,
 *  radius 20, 1px line, cropped by the card. */
export function ScreenCard({ height = 620, children, style }) {
  return (
    <div style={{ width: "100%", maxWidth: 360, height, background: "#ffffff", borderRadius: 20, border: `1px solid ${C.line}`,
      overflow: "hidden", position: "relative", boxSizing: "border-box", ...style }}>
      {children}
    </div>
  );
}

/** The tinted plate a device sits on. */
export function Plate({ tint, children, style }) {
  return (
    <div style={{ background: tint, borderRadius: 24, overflow: "hidden", position: "relative", ...style }}>
      {children}
    </div>
  );
}

// ─── The app shell, recreated ────────────────────────────────────────────────

// The app's line icons (common/Sidebar.jsx and MobileNav.jsx).
const ICON = {
  colleges: (size, sw = 2) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.42 10.92a1 1 0 0 0-.02-1.84L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.83l8.57 3.91a2 2 0 0 0 1.66 0z" /><path d="M22 10v6" /><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5" />
    </svg>
  ),
  chat: (size, sw = 2) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  portfolio: (size, sw = 2) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  ),
  profile: (size, sw = 2) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  ),
};

const SIDEBAR_ITEMS = [
  { key: "quest", label: "Quest", icon: () => <TreasureMapIcon /> },
  { key: "colleges", label: "College List", icon: () => ICON.colleges(20) },
  { key: "chat", label: "Chat", icon: () => ICON.chat(20) },
  { key: "portfolio", label: "Portfolio", icon: () => ICON.portfolio(20) },
  { key: "agents", label: "Agents", icon: () => <PixelBeakIcon size={20} /> },
];
const SIDEBAR_BOTTOM = [
  { key: "profile", label: "Profile", icon: () => ICON.profile(20) },
  { key: "feedback", label: "Feedback", icon: () => ICON.chat(20) },
];

function SidebarRow({ item, active }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.7rem 1rem", borderRadius: "0.75rem",
      background: active ? "rgba(29,78,216,0.08)" : "transparent", color: active ? C.accent : "#4b5470",
      fontFamily: SANS, fontWeight: active ? 700 : 600, fontSize: "0.9rem", width: "100%", boxSizing: "border-box" }}>
      <span style={{ flexShrink: 0, opacity: active ? 1 : 0.7, display: "inline-flex" }}>{item.icon()}</span>
      {item.label}
    </div>
  );
}

/** The desktop sidebar, recreated from common/Sidebar.jsx with static state:
 *  the wordmark, the streak chip, the five live sections, Profile and
 *  Feedback. `active`: "quest" | "colleges" | "chat" | "portfolio" | "agents". */
export function AppSidebar({ active, streak = 3, lit = false, level = 1, width = 200, style }) {
  return (
    <div style={{ width, flexShrink: 0, height: "100%", background: C.surface, borderRight: "1px solid rgba(29,78,216,0.08)",
      display: "flex", flexDirection: "column", boxSizing: "border-box", fontFamily: SANS, ...style }}>
      <div style={{ padding: "1.5rem 1.25rem 1rem", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: "1.1rem", color: C.accent, letterSpacing: "-0.04em" }}>mentorable</span>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: `linear-gradient(135deg, ${C.accent}, ${lighten(C.accent, 0.35)})`,
            flexShrink: 0, marginBottom: 1 }} />
        </div>
        <div style={{ marginTop: 12, display: "inline-flex", alignItems: "center", gap: 8, whiteSpace: "nowrap",
          background: lit ? C.softer : "#ffffff", borderRadius: 12, padding: "6px 10px", minHeight: 40,
          border: `1px solid ${lit ? C.soft : C.line}`, boxSizing: "border-box" }}>
          <Flame size={20} lit={lit} animate={false} streak={streak} />
          <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: "0.98rem", color: lit ? C.accent : C.muted, fontVariantNumeric: "tabular-nums" }}>{streak}</span>
          <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: "0.9rem", color: "#ffffff", background: C.accent, borderRadius: 7,
            padding: "1px 7px", marginLeft: 2, lineHeight: 1.35 }}>Lv {level}</span>
        </div>
      </div>
      <div style={{ flex: 1, padding: "0.25rem 0.75rem", display: "flex", flexDirection: "column", gap: 2, minHeight: 0 }}>
        {SIDEBAR_ITEMS.map((item) => <SidebarRow key={item.key} item={item} active={active === item.key} />)}
      </div>
      <div style={{ height: 1, background: "rgba(0,0,0,0.06)", margin: "0 1rem", flexShrink: 0 }} />
      <div style={{ padding: "0.5rem 0.75rem 1rem", display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
        {SIDEBAR_BOTTOM.map((item) => <SidebarRow key={item.key} item={item} active={false} />)}
      </div>
    </div>
  );
}

const TAB_ITEMS = [
  { key: "quest", label: "Quest" },
  { key: "colleges", label: "Colleges" },
  { key: "chat", label: "Chat" },
  { key: "portfolio", label: "Portfolio" },
  { key: "agents", label: "Agents" },
  { key: "profile", label: "Profile" },
];

function TabIcon({ item, active, streak, lit }) {
  const sw = active ? 2.5 : 2;
  if (item.key === "quest") {
    return (
      <span style={{ position: "relative", display: "inline-flex" }}>
        <TreasureMapIcon size={22} strokeWidth={sw} />
        {streak > 0 && (
          <span style={{ position: "absolute", right: -14, top: -7, height: 17, display: "inline-flex", alignItems: "center", gap: 1,
            padding: "0 5px 0 3px", borderRadius: 99, background: "#fff", boxSizing: "border-box",
            border: `1.5px solid ${lit ? "#FF8A00" : "#d6d5d2"}`, color: lit ? "#C24E00" : "#8a877f",
            fontFamily: SANS, fontWeight: 800, fontSize: 10, lineHeight: 1 }}>
            <Flame size={11} lit={lit} streak={streak} />{streak}
          </span>
        )}
      </span>
    );
  }
  if (item.key === "agents") return <PixelBeakIcon size={22} />;
  // The app draws the active tab's icon a touch heavier.
  return <span style={{ display: "inline-flex" }}>{ICON[item.key](22, sw)}</span>;
}

/** The phone's bottom tab bar, recreated from common/MobileNav.jsx: six
 *  tabs, 22px icons, 9px labels, the streak badge on Quest. Sits at the
 *  bottom of the app area; no floating Feedback button. */
export function MobileTabBar({ active = "quest", streak = 3, lit = false, style }) {
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 60, background: "rgba(255,255,255,0.96)",
      borderTop: "1px solid rgba(29,78,216,0.08)", display: "flex", alignItems: "stretch", boxSizing: "border-box",
      boxShadow: "0 -2px 16px rgba(15,23,42,0.06)", ...style }}>
      {TAB_ITEMS.map((item) => {
        const on = active === item.key;
        return (
          <div key={item.key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            gap: 2, color: on ? C.accent : C.faint, padding: "4px 0", minWidth: 44, minHeight: 44 }}>
            <TabIcon item={item} active={on} streak={streak} lit={lit} />
            <span style={{ fontFamily: SANS, fontSize: 9, fontWeight: on ? 700 : 500, letterSpacing: "0.03em", lineHeight: 1 }}>{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── The cursor ──────────────────────────────────────────────────────────────

// A 1-bit pointer on a 16px grid ("k" ink, "w" white).
const ARROW_ROWS = [
  "k...........",
  "kk..........",
  "kwk.........",
  "kwwk........",
  "kwwwk.......",
  "kwwwwk......",
  "kwwwwwk.....",
  "kwwwwwwk....",
  "kwwwwwwwk...",
  "kwwwwwwwwk..",
  "kwwwwwkkkkk.",
  "kwwkwwk.....",
  "kwk.kwwk....",
  "kk..kwwk....",
  "k....kwwk...",
  ".....kkk....",
];

function ArrowGlyph() {
  const rects = [];
  ARROW_ROWS.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      const ch = row[x];
      if (ch === ".") continue;
      rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={ch === "k" ? INK : "#ffffff"} />);
    }
  });
  return (
    <svg aria-hidden="true" focusable="false" width={12} height={16} viewBox="0 0 12 16" shapeRendering="crispEdges" style={{ display: "block" }}>
      {rects}
    </svg>
  );
}

/**
 * The one moving pointer. It finds `[data-lp-anchor=anchor]` inside the
 * closest `[data-lp-frame]` and travels to its centre (520ms); `press` dips
 * it to 90% (arrow) or fires the tap ring. Render it inside the screen's
 * own positioned box (its scroller, when the target scrolls). Hidden under
 * reduced motion.
 */
export function Cursor({ anchor, press = false, show = true, variant = "arrow" }) {
  const reduce = useReduce();
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  const [tap, setTap] = useState(0);
  const wasPressed = useRef(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !anchor) { setPos(null); return; }
    const frame = el.closest("[data-lp-frame]") || document;
    let target = null;
    try { target = frame.querySelector(`[data-lp-anchor="${CSS.escape(String(anchor))}"]`); } catch { target = null; }
    const parent = el.offsetParent;
    if (!target || !parent) { setPos(null); return; }
    const tr = target.getBoundingClientRect();
    const pr = parent.getBoundingClientRect();
    const next = {
      x: Math.round(tr.left + tr.width / 2 - pr.left + parent.scrollLeft),
      y: Math.round(tr.top + tr.height / 2 - pr.top + parent.scrollTop),
    };
    setPos((prev) => (prev && prev.x === next.x && prev.y === next.y ? prev : next));
  }, [anchor, show, press]);

  useLayoutEffect(() => {
    if (press && !wasPressed.current) setTap((n) => n + 1);
    wasPressed.current = !!press;
  }, [press]);

  if (reduce || !pos) return <span ref={ref} style={{ position: "absolute", left: 0, top: 0, width: 0, height: 0 }} />;
  const common = { position: "absolute", left: pos.x, top: pos.y, pointerEvents: "none", zIndex: 5, opacity: show ? 1 : 0 };
  if (variant === "tap") {
    return (
      <span ref={ref} className="lp-cursor" style={common}>
        {tap > 0 && press && (
          <span key={tap} className="lp-tap-ring" style={{ position: "absolute", left: 0, top: 0, width: 28, height: 28, borderRadius: "50%",
            background: "rgba(20,20,19,.18)", transform: "translate(-50%, -50%)" }} />
        )}
      </span>
    );
  }
  return (
    <span ref={ref} className="lp-cursor" style={{ ...common, transform: press ? "scale(.9)" : "scale(1)", transformOrigin: "0 0" }}>
      <ArrowGlyph />
    </span>
  );
}
