import { lighten, readableOn } from "../../lib/theme.js";

// The plain half of tokens.js: constants and `inkFor`, with no React, no
// Supabase and no DOM. tokens.js re-exports all of it; anything outside the
// app (the social videos in social/) imports this file instead, since
// tokens.js pulls in ThemeContext and with it the Supabase client.

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
