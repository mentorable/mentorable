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
