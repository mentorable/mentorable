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
