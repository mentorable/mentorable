import { useMemo } from "react";
import { useTheme } from "../../lib/ThemeContext.jsx";
import { inkFor } from "./tokens.base.js";

// ─── Tokens ───────────────────────────────────────────────────────────────────
// The app's one design system, grown from the Agents pages: a calm shell
// (white cards on #F5F5F5, 1px warm borders, Raleway, the student's accent for
// chrome) with all the character in pixel art, speech bubbles and copy, never
// in louder chrome. Every page builds from these tokens and from kit.jsx.
// The constants and `inkFor` live in tokens.base.js (no React, no Supabase).

export * from "./tokens.base.js";

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

export function useAgentInk() {
  const { accent } = useTheme();
  return useMemo(() => inkFor(accent), [accent]);
}
