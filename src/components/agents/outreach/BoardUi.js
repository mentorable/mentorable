import { readableOn } from "../../../lib/theme.js";

// Shared bits for Beaker's board (the /agents/outreach page and its parts):
// a few tokens on top of agentUi.js, and the handful of rules inline styles
// cannot express (hover, the skeleton shimmer, reduced motion, focus on
// inputs). Injected once, like agentUi's.

export const COLUMN_BG   = "#ecebe7";   // the column wells; white cards sit on them
export const NEUTRAL_TAG = "#efedea";   // the "You" tag and other quiet pills
export const COLUMN_MIN  = 172;         // px; six fit from about 1360px wide, below that the board scrolls inside itself
export const COLUMN_GAP  = 10;
export const TOAST_Z     = 600;
export const DRAWER_Z    = 450;
export const MENU_Z      = 470;         // above the drawer's backdrop, in case one is ever opened from it

export const SR_ONLY = {
  position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden",
  clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0,
};

export const CARD_CLASS  = "ob-card";
export const SKEL_CLASS  = "ob-skel";
export const INPUT_CLASS = "ob-input";
export const ITEM_CLASS  = "ob-item";
export const SCROLL_CLASS = "ob-scroll";

const BOARD_CSS = `
.${CARD_CLASS} { transition: box-shadow 0.15s, border-color 0.15s, opacity 0.15s; }
.${CARD_CLASS}:hover { box-shadow: 0 3px 12px rgba(20,20,19,0.08); }
.${CARD_CLASS}[draggable="true"] { cursor: grab; }
.${CARD_CLASS}[draggable="true"]:active { cursor: grabbing; }
.${SKEL_CLASS} { background: linear-gradient(90deg, #e3e0db 25%, #eeebe7 50%, #e3e0db 75%); background-size: 480px 100%;
  animation: ob-shimmer 1.4s linear infinite; }
@keyframes ob-shimmer { 0% { background-position: -480px 0; } 100% { background-position: 480px 0; } }
.${INPUT_CLASS}:focus { outline: 3px solid var(--ag-ring, #1d4ed8); outline-offset: 1px; }
.${ITEM_CLASS}:hover:not([aria-disabled="true"]), .${ITEM_CLASS}:focus { background: rgba(20,20,19,0.06); }
.${ITEM_CLASS}:focus-visible { outline: 3px solid var(--ag-ring, #1d4ed8); outline-offset: -3px; }
.${SCROLL_CLASS} { scrollbar-width: thin; scrollbar-color: #bdb8b0 transparent; }
@media (prefers-reduced-motion: reduce) {
  .${CARD_CLASS} { transition: none; }
  .${SKEL_CLASS} { animation: none; }
}
`;
if (typeof document !== "undefined" && !document.querySelector("style[data-outreach-board]")) {
  const el = document.createElement("style");
  el.dataset.outreachBoard = "";
  el.textContent = BOARD_CSS;
  document.head.appendChild(el);
}

/** The focus ring and drop line for the board: the accent darkened just
 *  enough for 3:1 on the column wells, the darkest surface either sits on
 *  (agentUi's ring is tuned for white, and amber or sky fall short on grey). */
export function boardRing(accent) {
  return readableOn(accent, COLUMN_BG, 3);
}

/** "2 tries left", "1 try left", "No tries left". */
export function triesText(left) {
  return left > 0 ? `${left} ${left === 1 ? "try" : "tries"} left` : "No tries left";
}
