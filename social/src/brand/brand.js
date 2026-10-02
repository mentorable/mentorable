import { createContext, useContext } from "react";
import { DEFAULT_ACCENT } from "../../../src/lib/theme.js";
import { inkFor } from "../../../src/components/ui/tokens.base.js";

// The app's own tokens, imported rather than copied, so a change to the app's
// look reaches the videos too. tokens.base.js (not tokens.js) because
// tokens.js pulls in ThemeContext and with it the Supabase client.
export * from "../../../src/components/ui/tokens.base.js";
export { DEFAULT_ACCENT, contrastRatio, darken, hexToRgbString, lighten, readableOn } from "../../../src/lib/theme.js";
export { BEAKER_LINES, TALON_LINES, AGENTS } from "../../../src/lib/agents/registry.js";

// ─── The canvas ──────────────────────────────────────────────────────────────
// 1080x1920 at 30 fps, the size TikTok and Reels both want.
export const W = 1080;
export const H = 1920;
export const FPS = 30;

// What TikTok and Reels cover with their own UI: the header tabs at the top,
// the caption, sound and profile at the bottom, and the like / comment /
// share column on the right. Anything a viewer must read sits inside SAFE.
export const SAFE = { top: 220, bottom: 1440, left: 60, right: 930 };
export const RIGHT_RAIL = { x: 930, top: 640, bottom: 1700 };

// Everything is centred on the canvas's middle. Above the rail (y < 640) a
// centred block may be up to 960 wide (x 60..1020); beside it, up to 780
// (x 150..930, the phone's own column), so nothing slides under the buttons.
export const CENTER_X = W / 2;
export const COLUMN = { top: { left: 60, width: 960 }, beside: { left: 150, width: 780 } };

// Where the shared overlays sit, so scenes can stay clear of them.
export const LAYOUT = {
  bugTop: 222,        // the wordmark + BETA pill
  captionTop: 300,    // the caption card's top edge (one or two lines, up to ~520)
  phoneTop: 580,      // the phone frame's top edge, in scenes that use it
};

// ─── The accent ──────────────────────────────────────────────────────────────
// Each video picks one profile color (the app's per-student accent) and every
// accent-derived color comes from the app's own `inkFor`, so text and button
// fills stay readable whatever the accent.
const InkContext = createContext(inkFor(DEFAULT_ACCENT));
export const InkProvider = InkContext.Provider;
/** { accent, text, title, button: { bg, fg }, soft, softer, onSoft, ring } */
export function useInk() {
  return useContext(InkContext);
}
export { inkFor };
