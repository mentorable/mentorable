import { useMemo } from "react";
import { STAGE_QUERY, STICKY_QUERY, useMedia } from "../kit.js";
import { storiesFor } from "./stories.js";
import StickyStories from "./StickyStories.jsx";
import Stage from "./Stage.jsx";
import Plates, { Inline } from "./Plates.jsx";

// The features showcase (PLAN.md 6): the same stories, told three ways.
// a "Sticky stories": each story pinned and scrubbed by scroll (1100 x 740 and up).
// b "One stage": one pinned section, a laptop and phone pair (1400 x 740 and up).
// c "Plates": each story on a tinted plate, played by a clock (1100 and up).
// Below its query, every option is the one-column inline layout.

export default function Features({ option = "a", hero = "a" }) {
  const stories = useMemo(() => storiesFor({ hero }), [hero]);
  const sticky = useMedia(STICKY_QUERY);
  const stage = useMedia(STAGE_QUERY);
  const wide = useMedia("(min-width: 1100px)");

  let body;
  if (option === "b" && stage) body = <Stage stories={stories} />;
  else if (option === "c" && wide) body = <Plates stories={stories} />;
  else if (option === "a" && sticky) body = <StickyStories stories={stories} />;
  else body = <Inline stories={stories} />;

  return <div data-features={option}>{body}</div>;
}
