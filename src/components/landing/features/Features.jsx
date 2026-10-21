import { STICKY_QUERY, useMedia } from "../kit.js";
import { storiesFor } from "./stories.js";
import StickyStories from "./StickyStories.jsx";
import Inline from "./Inline.jsx";

// The features showcase (PLAN.md 6): each story pinned and scrubbed by
// scroll from 1100 x 740 up, and the one-column inline layout below that.

const STORIES = storiesFor();

export default function Features() {
  const sticky = useMedia(STICKY_QUERY);
  return sticky ? <StickyStories stories={STORIES} /> : <Inline stories={STORIES} />;
}
