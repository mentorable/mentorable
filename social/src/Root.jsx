import { Composition } from "remotion";
import { FPS, H, W } from "./brand/brand.js";
import { AGENTS_001, Agents001 } from "./videos/001-agents/index.jsx";
import { KitCheck } from "./videos/_kit/KitCheck.jsx";

// Every video in the series. One entry per video; each lives in
// src/videos/<number>-<slug>/ with its own timeline, captions and demo data.
export function Root() {
  return (
    <>
      <Composition id={AGENTS_001.id} component={Agents001} durationInFrames={AGENTS_001.durationInFrames}
        fps={FPS} width={W} height={H} defaultProps={AGENTS_001.defaultProps} />
      {/* Not a video: a test card for the shared kit (src/kit). */}
      <Composition id="KitCheck" component={KitCheck} durationInFrames={90} fps={FPS} width={W} height={H}
        defaultProps={{ guides: true }} />
    </>
  );
}
