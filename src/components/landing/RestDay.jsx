import { useRef } from "react";
import Mascot from "../agents/Mascot.jsx";
import { C, CONTAINER, GUTTER, MOBILE_MAX, useMedia, useSettle } from "./kit.js";
import { TwoTone } from "./frames.jsx";

// A quiet beat between Quest and the agents, true to the real rest-day rule:
// a hairline with the three agents asleep on it (their Z frames play for 5s
// after it enters view, then hold), and one two-tone line under it. The
// sprites are decoration; the sentence is the content.

const AGENTS = ["beaker", "talon", "quill"];

export default function RestDay() {
  const ref = useRef(null);
  const { settled } = useSettle(ref);
  const phone = useMedia(`(max-width: ${MOBILE_MAX}px)`);
  const spots = phone ? [6, 40, 76] : [8, 31, 74];

  return (
    <section ref={ref} aria-label="Rest days" style={{ padding: `96px ${GUTTER}` }}>
      <div style={{ maxWidth: CONTAINER, margin: "0 auto" }}>
        <div aria-hidden="true" style={{ position: "relative", height: 64, borderBottom: `1px solid ${C.line}` }}>
          {AGENTS.map((agent, i) => (
            <div key={agent} style={{ position: "absolute", left: `${spots[i]}%`, bottom: 0 }}>
              <Mascot agent={agent} state="sleeping" size={64} title="" animate={!settled} />
            </div>
          ))}
        </div>
        <TwoTone lead="Weekends off?" rest="Pick your rest days. They never break your streak." style={{ marginTop: 28 }} />
      </div>
    </section>
  );
}
