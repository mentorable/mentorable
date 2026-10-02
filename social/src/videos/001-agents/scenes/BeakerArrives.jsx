import { AbsoluteFill, useCurrentFrame } from "remotion";
import { AGENTS, BG } from "../../../brand/brand.js";
import { BEAKER } from "../../../brand/sprites.js";
import { pop } from "../../../kit/motion.js";
import { NameTag, STAGE, StageBird, arrive } from "../../../screens/hub/Stage.jsx";

// "So we built an agent for that". Hard cut onto Beaker already flying in
// from the left (his real flying frames, at their own 8 fps), gliding down a
// slight arc and slowing well before the ground. He lands on frame 34 with a
// one-art-pixel bump, stands (idle) for a beat, and his name tag (the hub
// card's name and role) rises in on 42 and holds the last 48 frames.

const LAND = 34;
const TAG_AT = 42;
const beaker = AGENTS.find((a) => a.id === "outreach");

export default function BeakerArrives() {
  const frame = useCurrentFrame();
  const p = arrive(frame, { land: LAND });
  // Touchdown: the body sinks one art pixel for three frames.
  const bump = frame >= LAND && frame < LAND + 3 ? STAGE.unit : 0;
  return (
    <AbsoluteFill style={{ background: BG }}>
      <StageBird sprite={BEAKER} kind="beaker" state={p.landed ? "idle" : "flying"} x={p.x} y={p.y + bump}
        offset={p.landed ? -LAND : 0} />
      <div style={{ position: "absolute", left: 0, width: STAGE.center * 2, top: STAGE.ground + 50, display: "flex",
        justifyContent: "center", ...pop(frame, TAG_AT, { rise: 18, dur: 10 }) }}>
        <NameTag name={beaker.name} role={beaker.role} />
      </div>
    </AbsoluteFill>
  );
}
