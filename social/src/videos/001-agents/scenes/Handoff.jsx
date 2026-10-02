import { AbsoluteFill, Easing, useCurrentFrame } from "remotion";
import { AGENTS, BG } from "../../../brand/brand.js";
import { BEAKER, TALON } from "../../../brand/sprites.js";
import { pop } from "../../../kit/motion.js";
import { NameTag, STAGE, StageBird, arrive, depart } from "../../../screens/hub/Stage.jsx";

// "Our second agent: Talon". The same stage as Beaker's arrival, so the two
// read as a pair: Beaker, taking off on the cut, climbs out of the right edge
// over 24 frames; Talon sweeps in from the left down the same arc Beaker came
// in on over 28 frames, a hawk's swoop rather than a pelican's glide (he
// picks up speed, then brakes into the landing), lands on frame 28, and his
// name tag rises in on 30 and holds the last 45 frames. Talon starts further
// out than Beaker did and gathers speed while Beaker's take-off does, so the
// two are never closer than about 690px, box to box (a sprite is 480 wide).

const OUT_END = 24;
const LAND = 28;
const TAG_AT = 30;
const FROM_X = -480;
const SWOOP = Easing.inOut(Easing.sin);
const talon = AGENTS.find((a) => a.id === "finder");

export default function Handoff() {
  const frame = useCurrentFrame();
  const out = depart(frame, { start: 0, end: OUT_END });
  const inn = arrive(frame, { start: 0, land: LAND, fromX: FROM_X, easing: SWOOP });
  const bump = frame >= LAND && frame < LAND + 3 ? STAGE.unit : 0;
  return (
    <AbsoluteFill style={{ background: BG }}>
      <StageBird sprite={TALON} kind="talon" state={inn.landed ? "idle" : "flying"} x={inn.x} y={inn.y + bump}
        offset={inn.landed ? -LAND : 5} />
      {!out.gone && <StageBird sprite={BEAKER} kind="beaker" state="flying" x={out.x} y={out.y} offset={3} />}
      <div style={{ position: "absolute", left: 0, width: STAGE.center * 2, top: STAGE.ground + 50, display: "flex",
        justifyContent: "center", ...pop(frame, TAG_AT, { rise: 18, dur: 10 }) }}>
        <NameTag name={talon.name} role={talon.role} />
      </div>
    </AbsoluteFill>
  );
}
