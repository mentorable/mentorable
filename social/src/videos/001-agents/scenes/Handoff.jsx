import { AbsoluteFill, useCurrentFrame } from "remotion";
import { AGENTS, BG } from "../../../brand/brand.js";
import { BEAKER, TALON } from "../../../brand/sprites.js";
import { pop } from "../../../kit/motion.js";
import { NameTag, STAGE, StageBird, arrive, depart } from "../../../screens/hub/Stage.jsx";

// "and this is talon". The same stage as Beaker's arrival, so the two read
// as a pair: Beaker, already in the air on the cut, beats it out of the right
// edge; Talon sweeps in from the left down the same arc Beaker came in on,
// faster (a hawk's swoop, not a pelican's glide), lands on frame 14, stands,
// and his name tag pops two frames later, so it holds as long as Beaker's
// did (29 frames to the cut, Beaker's 30). Beaker's take-off starts slow, so
// Talon waits two frames and starts a little further out than Beaker did:
// the two never get closer than they are on the cut, where Talon's beak is
// just short of Beaker's raised wing.

const START = 2;
const LAND = 14;
const TAG_AT = 16;
const FROM_X = -300;
const talon = AGENTS.find((a) => a.id === "finder");

export default function Handoff() {
  const frame = useCurrentFrame();
  const out = depart(frame, { start: 0, end: 11 });
  const inn = arrive(frame, { start: START, land: LAND, fromX: FROM_X });
  const bump = frame >= LAND && frame < LAND + 2 ? STAGE.unit : 0;
  return (
    <AbsoluteFill style={{ background: BG }}>
      <StageBird sprite={TALON} kind="talon" state={inn.landed ? "idle" : "flying"} x={inn.x} y={inn.y + bump}
        offset={inn.landed ? -LAND : 5} />
      {!out.gone && <StageBird sprite={BEAKER} kind="beaker" state="flying" x={out.x} y={out.y} offset={3} />}
      <div style={{ position: "absolute", left: 0, width: STAGE.center * 2, top: STAGE.ground + 50, display: "flex",
        justifyContent: "center", ...pop(frame, TAG_AT, { rise: 14 }) }}>
        <NameTag name={talon.name} role={talon.role} />
      </div>
    </AbsoluteFill>
  );
}
