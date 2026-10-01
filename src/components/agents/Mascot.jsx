import PixelSprite from "./PixelSprite.jsx";
import { BEAKER } from "./sprites/beaker.js";
import { TALON } from "./sprites/talon.js";
import { TEASERS } from "./sprites/teasers.js";
import { getAgent } from "../../lib/agents/registry.js";

// An agent's mascot at a given size. `agent` is a mascot key ("beaker",
// "talon", "owl") or an agent id from the registry ("outreach", "finder").
//
// The box is always `size` square, so layouts can count on it, but the art
// inside is drawn at the largest whole-number scale that fits (a 32-pixel
// sprite at 80px is drawn at 64px), centred in the box on whole CSS pixels.
// Any fractional scale, even 2.5, gives art pixels of uneven width on the 1x
// and 1.25x screens many school laptops have.

const SPRITES = { beaker: BEAKER, talon: TALON, ...TEASERS };

const TITLES = {
  beaker: {
    idle: "Beaker the pelican",
    flying: "Beaker flying off to look things up",
    thinking: "Beaker thinking",
    delivering: "Beaker holding up a letter",
    celebrating: "Beaker cheering",
    sleeping: "Beaker asleep",
  },
  talon: {
    idle: "Talon the hawk",
    flying: "Talon scouting from above",
    thinking: "Talon thinking",
    delivering: "Talon holding up a find",
    celebrating: "Talon cheering",
    sleeping: "Talon asleep",
  },
};
const MYSTERY_TITLE = "A mystery agent, fast asleep";

function resolve(agent) {
  if (SPRITES[agent]) return agent;
  const entry = getAgent(agent);
  return entry && SPRITES[entry.mascot] ? entry.mascot : "beaker";
}

/**
 * Where the art sits inside a `size` box: { scale, top, left, width, height },
 * all whole CSS pixels. Whatever lines up with the art (a speech bubble's tail
 * and the beak, say) should use this rather than work it out again.
 */
export function mascotFit(size, agent = "beaker") {
  const sprite = SPRITES[resolve(agent)];
  const box = Math.max(0, Math.floor(Number(size) || 0));
  const scale = Math.max(1, Math.floor(Math.min(box / sprite.width, box / sprite.height)));
  const width = sprite.width * scale;
  const height = sprite.height * scale;
  return {
    scale, width, height,
    top: Math.max(0, Math.floor((box - height) / 2)),
    left: Math.max(0, Math.floor((box - width) / 2)),
  };
}

export default function Mascot({ agent = "beaker", state = "idle", size = 96, title, animate = true, style }) {
  const key = resolve(agent);
  const sprite = SPRITES[key];
  const fit = mascotFit(size, key);
  // `title=""` marks the mascot as decoration (a bubble beside it already
  // says everything); undefined gets a description of what it is doing.
  const label = title !== undefined ? title : (TITLES[key]?.[state] || TITLES[key]?.idle || MYSTERY_TITLE);
  // Placed by padding rather than flex centring, which can land the art on a
  // half pixel when the space around it is odd.
  return (
    <div style={{ width: size, height: size, flexShrink: 0, boxSizing: "border-box", paddingTop: fit.top,
      paddingLeft: fit.left, ...style }}>
      <PixelSprite sprite={sprite} state={state} scale={fit.scale} title={label || undefined} animate={animate} />
    </div>
  );
}
