import Mascot, { mascotFit } from "./Mascot.jsx";
import { SpeechBubble, TAB_ROOM, TAIL_AT, TIP } from "../ui/SpeechBubble.jsx";
import { getAgent } from "../../lib/agents/registry.js";
import { useIsMobile } from "../../hooks/useIsMobile.js";

// The speech bubble itself is shared by every page (src/components/ui); the
// agents add the mascot that says it.
export { SpeechBubble };

/** A mascot and what it says. `layout`: "row" (mascot left, bubble right),
 *  "stack" (mascot above), or "auto" (a row, stacked on a narrow phone). */
export function MascotSays({ agent = "beaker", state = "idle", size = 72, children, layout = "row", tone = "default", style }) {
  const narrow = useIsMobile(480);
  const stacked = layout === "stack" || (layout === "auto" && narrow);
  const name = getAgent(agent)?.name || "Beaker";

  // Line the tail up with the beak, which is about 10 art pixels below the
  // top of the sprite; the fit says where the art sits in its box.
  const fit = mascotFit(size, agent);
  const beakY = fit.top + 10 * fit.scale;

  return (
    <div style={{ display: "flex", flexDirection: stacked ? "column" : "row", alignItems: "flex-start",
      gap: stacked ? 20 : 16, minWidth: 0, paddingTop: TAB_ROOM, ...style }}>
      <Mascot agent={agent} state={state} size={size} title="" />
      <SpeechBubble side={stacked ? "top" : "left"} tone={tone} name={name}
        tailAt={stacked ? Math.max(TAIL_AT, Math.round(size / 2 - TIP)) : TAIL_AT}
        style={stacked
          ? { alignSelf: "stretch", marginTop: 0 }
          : { marginTop: Math.max(0, Math.round(beakY - TAIL_AT - TIP)), flex: "0 1 auto", maxWidth: 560 }}>
        {children}
      </SpeechBubble>
    </div>
  );
}
