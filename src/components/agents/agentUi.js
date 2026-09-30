import { useMemo } from "react";
import { useTheme } from "../../lib/ThemeContext.jsx";
import { contrastRatio, lighten, readableOn } from "../../lib/theme.js";

// ─── Tokens ───────────────────────────────────────────────────────────────────
// The Agents pages keep the calm shell (white cards on #F5F5F5, Raleway, the
// student's accent for chrome). All the character comes from the mascots, the
// speech bubbles and the copy, never from louder chrome. Shared by the hub,
// the board, the flow and the review screen.

export const SANS       = "'Raleway', sans-serif";
export const BG         = "#F5F5F5";
export const WHITE      = "#ffffff";
export const SURFACE    = "#faf9f5";   // an inset panel on a white card
export const TEXT       = "#141413";
export const TEXT_MID   = "#3d3d3a";
export const TEXT_MUTED = "#494742";
export const TEXT_FAINT = "#6a6760";   // still 5:1 on white and on BG
export const BORDER     = "#e6dfd8";
export const DANGER     = "#b42318";   // 6:1 on white, 6:1 on BG
export const AMBER_TEXT = "#92400e";   // "due" and "waiting", never red
export const AMBER_BG   = "#fff7e6";

export const RADIUS = { card: 16, control: 12, pill: 999 };

/** Class that gives any button or link a visible keyboard focus ring in the
 *  accent (see `ring`). Set `--ag-ring` on an ancestor; pages do it on their
 *  root with `ringVar(ink)`. */
export const FOCUS_CLASS = "ag-focus";
export const ringVar = (ink) => ({ "--ag-ring": ink.ring });
/** Class for a filled button: a touch darker on hover, a pixel down when pressed. */
export const PRESS_CLASS = "ag-press";

// Injected once, so every Agents screen gets the same focus ring and press
// feel without each one mounting its own stylesheet.
const AGENT_CSS = `
.${FOCUS_CLASS}:focus-visible { outline: 3px solid var(--ag-ring, #1d4ed8); outline-offset: 2px; }
.${FOCUS_CLASS}:focus:not(:focus-visible) { outline: none; }
.${PRESS_CLASS} { transition: filter 0.15s, transform 0.08s; }
.${PRESS_CLASS}:hover:not(:disabled) { filter: brightness(0.93); }
.${PRESS_CLASS}:active:not(:disabled) { transform: translateY(1px); }
@media (prefers-reduced-motion: reduce) { .${PRESS_CLASS} { transition: none; } .${PRESS_CLASS}:active:not(:disabled) { transform: none; } }
`;
if (typeof document !== "undefined" && !document.querySelector("style[data-agent-ui]")) {
  const el = document.createElement("style");
  el.dataset.agentUi = "";
  el.textContent = AGENT_CSS;
  document.head.appendChild(el);
}

/** Every accent-derived color the Agents screens need, all readable.
 *  `text`: the accent as body text on white. `title`: as large text on BG.
 *  `button`: an accent fill with a label that reads (white if it can, dark
 *  ink if that reads instead, else white on an accent darkened just enough).
 *  `soft` / `softer`: tints for tiles and bubbles, where TEXT stays readable.
 *  `onSoft`: the accent as text on `soft`. `ring`: the focus ring (3:1 on white and on the page background). */
export function inkFor(accent) {
  const button = contrastRatio(WHITE, accent) >= 4.5 ? { bg: accent, fg: WHITE }
    : contrastRatio(TEXT, accent) >= 4.5 ? { bg: accent, fg: TEXT }
    : { bg: readableOn(accent, WHITE, 4.5), fg: WHITE };
  const soft = lighten(accent, 0.86);
  return {
    accent,
    text: readableOn(accent, WHITE, 4.5),
    title: readableOn(accent, BG, 3),
    button,
    soft,
    softer: lighten(accent, 0.93),
    onSoft: readableOn(accent, soft, 4.5),
    // 3:1 on the page background as well as on white (#ecebe7 is a touch darker than both).
    ring: readableOn(accent, "#ecebe7", 3),
  };
}

export function useAgentInk() {
  const { accent } = useTheme();
  return useMemo(() => inkFor(accent), [accent]);
}
