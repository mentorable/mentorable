// Fixed brand blue — unchanged default for anyone who hasn't picked a profile color.
export const DEFAULT_ACCENT = "#1d4ed8";

export function hexToRgbString(hex) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

// Mixes a hex color toward white — used to derive the lighter gradient accent
// (the #60a5fa role) from whatever color the user picks.
export function lighten(hex, amt = 0.35) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  const mix = (c) => Math.round(c + (255 - c) * amt);
  const toHex = (c) => c.toString(16).padStart(2, "0");
  return `#${toHex(mix((n >> 16) & 255))}${toHex(mix((n >> 8) & 255))}${toHex(mix(n & 255))}`;
}

function luminance(hex) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  const lin = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

/** WCAG contrast ratio between two hex colors (1 to 21). */
export function contrastRatio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The color darkened just enough to reach `min` contrast on `bg`. A light
 *  accent (amber, sky) is unreadable as text on white otherwise; a dark one
 *  comes back unchanged. Large bold text only needs 3. */
export function readableOn(hex, bg = "#ffffff", min = 4.5) {
  let out = hex;
  for (let i = 1; i <= 25 && contrastRatio(out, bg) < min; i += 1) out = darken(hex, i * 0.04);
  return out;
}

// Mixes a hex color toward black. The Quest page's raised buttons and stones
// use it for their bottom edge, so the 3D look follows whatever accent the
// student picked instead of a fixed palette.
export function darken(hex, amt = 0.25) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  const mix = (c) => Math.round(c * (1 - amt));
  const toHex = (c) => c.toString(16).padStart(2, "0");
  return `#${toHex(mix((n >> 16) & 255))}${toHex(mix((n >> 8) & 255))}${toHex(mix(n & 255))}`;
}
