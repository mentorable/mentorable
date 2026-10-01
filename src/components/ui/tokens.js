import { useMemo } from "react";
import { useTheme } from "../../lib/ThemeContext.jsx";
import { contrastRatio, lighten, readableOn } from "../../lib/theme.js";

// ─── Tokens ───────────────────────────────────────────────────────────────────
// The app's one design system, grown from the Agents pages: a calm shell
// (white cards on #F5F5F5, 1px warm borders, Raleway, the student's accent for
// chrome) with all the character in pixel art, speech bubbles and copy, never
// in louder chrome. Every page builds from these tokens and from kit.jsx.

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
 *  `button`: an accent fill with a label that reads (always white, on the accent darkened just enough).
 *  `soft` / `softer`: tints for tiles and bubbles, where TEXT stays readable.
 *  `onSoft`: the accent as text on `soft`. `ring`: the focus ring (3:1 on white and on the page background). */
export function inkFor(accent) {
  // A filled button is always white on the accent, darkened only as far as it
  // takes for the white to read (4.5:1). Never a dark label on a colour.
  const button = { bg: readableOn(accent, WHITE, 4.5), fg: WHITE };
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
