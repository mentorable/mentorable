import { C } from "../kit.js";

// The blue band's stepped edge (PLAN.md 4.5), the one stepped edge pair on
// the page: a 40 x 12 tile of ten 4px columns (heights 0, 4, 8, 12, 12,
// 12, 12, 8, 4, 0) repeated across, cut from a strip of the band's colour
// with a CSS mask. The bottom edge is the same tile mirrored. The tile is
// a data-URI SVG, so it costs no request.

const HEIGHTS = [0, 4, 8, 12, 12, 12, 12, 8, 4, 0];

function tile(side) {
  const rects = HEIGHTS
    .map((h, i) => (h ? `<rect x="${i * 4}" y="${side === "bottom" ? 0 : 12 - h}" width="4" height="${h}"/>` : ""))
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="12" viewBox="0 0 40 12" shape-rendering="crispEdges">${rects}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

const TILE = { top: tile("top"), bottom: tile("bottom") };

/** side: "top" (bumps rise from the band) or "bottom" (they hang from it). */
export default function BandEdge({ side = "top", color = C.accent, style }) {
  const url = TILE[side === "bottom" ? "bottom" : "top"];
  return (
    <div aria-hidden="true" data-side={side}
      style={{ height: 12, background: color, WebkitMaskImage: url, maskImage: url, WebkitMaskRepeat: "repeat-x",
        maskRepeat: "repeat-x", WebkitMaskSize: "40px 12px", maskSize: "40px 12px", WebkitMaskPosition: "center top",
        maskPosition: "center top", ...style }} />
  );
}
