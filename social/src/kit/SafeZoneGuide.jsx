import { H, RIGHT_RAIL, SAFE, W } from "../brand/brand.js";

// Editing aid, never in a posted render: shades what TikTok and Reels cover
// with their own UI. Turn it on with the composition's `guides` prop.

const shade = { position: "absolute", background: "rgba(220,38,38,0.22)", outline: "2px dashed rgba(220,38,38,0.8)" };

export function SafeZoneGuide() {
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 1000 }}>
      <div style={{ ...shade, left: 0, top: 0, width: W, height: SAFE.top }} />
      <div style={{ ...shade, left: 0, top: SAFE.bottom, width: W, height: H - SAFE.bottom }} />
      <div style={{ ...shade, left: RIGHT_RAIL.x, top: RIGHT_RAIL.top, width: W - RIGHT_RAIL.x, height: RIGHT_RAIL.bottom - RIGHT_RAIL.top }} />
      <div style={{ ...shade, left: 0, top: SAFE.top, width: SAFE.left, height: SAFE.bottom - SAFE.top, background: "rgba(220,38,38,0.1)" }} />
    </div>
  );
}
