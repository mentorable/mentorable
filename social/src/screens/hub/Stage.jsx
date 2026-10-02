import { Easing, interpolate } from "remotion";
import { BORDER, SANS, TEXT, WHITE, useInk } from "../../brand/brand.js";
import { FrameSprite } from "../../kit/FrameSprite.jsx";
import { CLAMP } from "../../kit/motion.js";

// The mascots on an empty stage: a bird drawn big on the app's grey, a flat
// pixel shadow on the ground under it, and a name tag set like the hub card's
// heading (name in 800, role in 700 in the accent). Used by the scenes where
// Beaker and Talon arrive, hand over and sign off.

/** Where a stage bird stands, in canvas px. `unit` is CSS px per art pixel. */
export const STAGE = {
  unit: 15,                 // a 32px sprite drawn 480px wide
  x: 255,                   // the sprite box's left edge once landed: centred on x 495, the middle of the safe area
  y: 610,                   // the sprite box's top edge once landed
  ground: 610 + 32 * 15,    // where the feet stand
  center: 255 + 16 * 15,
};

// Each sprite's feet, in art columns (centre), so the shadow sits under them.
const FEET = { beaker: 12.5, talon: 16.5 };

/** A flight in from the left: the box's left/top at `frame`, landing at
 *  `land`. Decelerates into the landing (x eases out) while gliding down a
 *  shallow curve (y eases in and out), so the path is a slight arc. */
export function arrive(frame, { start = 0, land, fromX = -240, fromY = 470, toX = STAGE.x, toY = STAGE.y }) {
  return {
    x: interpolate(frame, [start, land], [fromX, toX], { ...CLAMP, easing: Easing.out(Easing.quad) }),
    y: interpolate(frame, [start, land], [fromY, toY], { ...CLAMP, easing: Easing.inOut(Easing.sin) }),
    landed: frame >= land,
  };
}

/** A take-off to the right: accelerating, climbing. */
export function depart(frame, { start, end, fromX = STAGE.x, fromY = STAGE.y, toX = 1180, toY = 380 }) {
  return {
    x: interpolate(frame, [start, end], [fromX, toX], { ...CLAMP, easing: Easing.in(Easing.quad) }),
    y: interpolate(frame, [start, end], [fromY, toY], { ...CLAMP, easing: Easing.in(Easing.sin) }),
    gone: frame >= end,
  };
}

/**
 * A flat shadow on the floor: a plain ellipse a shade darker than the page,
 * no blur. `width` is in art pixels; it narrows and pales as the bird climbs
 * (`lift`, 0 on the ground to 1 high up).
 */
export function GroundShadow({ cx, ground, unit = STAGE.unit, width = 18, lift = 0, color = "#e3e1dc" }) {
  const l = Math.min(1, Math.max(0, lift));
  const w = width * unit * (1 - 0.5 * l);
  const h = 2 * unit * (1 - 0.35 * l);
  return (
    <div style={{ position: "absolute", left: Math.round(cx - w / 2), top: Math.round(ground - unit * 0.5 - h / 2),
      width: Math.round(w), height: Math.round(h), borderRadius: "50%", background: color, opacity: 1 - 0.65 * l }} />
  );
}

/** A bird on the stage at box position (x, y), with its shadow on `ground`. */
export function StageBird({ sprite, kind, state, x, y, unit = STAGE.unit, ground = STAGE.ground, offset = 0, shadow = true, shadowWidth = 18 }) {
  const feetX = x + FEET[kind] * unit;
  const lift = (ground - (y + 32 * unit)) / (10 * unit);
  return (
    <>
      {shadow && <GroundShadow cx={feetX} ground={ground} unit={unit} width={shadowWidth} lift={lift} />}
      <div style={{ position: "absolute", left: Math.round(x), top: Math.round(y) }}>
        <FrameSprite sprite={sprite} state={state} scale={unit} offset={offset} />
      </div>
    </>
  );
}

/** The hub card's heading, on its own white card: name, then role. */
export function NameTag({ name, role, size = 72, style }) {
  const ink = useInk();
  return (
    <div style={{ display: "inline-block", background: WHITE, border: `2px solid ${BORDER}`, borderRadius: 32,
      padding: `${Math.round(size * 0.36)}px ${Math.round(size * 0.58)}px ${Math.round(size * 0.42)}px`, boxSizing: "border-box",
      fontFamily: SANS, ...style }}>
      <div style={{ fontWeight: 800, fontSize: size, color: TEXT, letterSpacing: "-0.02em", lineHeight: 1.1 }}>{name}</div>
      <div style={{ marginTop: Math.round(size * 0.1), fontWeight: 700, fontSize: Math.round(size * 0.56), color: ink.text, lineHeight: 1.2 }}>
        {role}
      </div>
    </div>
  );
}
