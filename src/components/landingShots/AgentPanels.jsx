import { useEffect, useRef, useState } from "react";
import Mascot from "../agents/Mascot.jsx";
import { BEACH_SCENE } from "../agents/outreach/BeachScene.jsx";
import { RIDGE_SCENE } from "../agents/finder/RidgeScene.jsx";
import { NIGHT_SCENE } from "../agents/essay/home/NightScene.jsx";

// The landing page's agents: three tall cards, each on its own scene from
// the app (Beaker's beach lab, Talon's dawn ridge, Quill's night desk). Point
// at one (or focus it) and it widens into a square, its scene opening out
// and its description appearing; the others narrow to make room. The mascot
// plays while the card is widening and holds still once it has settled, and
// the scene's own loops (clouds, stars, bubbles) do the same. On a phone the
// cards stack, open, and hold still.

const SANS = "'Raleway', sans-serif";
const EXPAND_MS = 650;
const EASE = "cubic-bezier(.33,0,.2,1)";   // gentle in, long soft settle

const AGENTS = [
  {
    id: "beaker", name: "Beaker", role: "Outreach pelican", scene: BEACH_SCENE, ink: "#0f2f57",
    body: "Helps you reach professors and professionals. It finds the right people, reads up on each one, and drafts a short email where every fact links to its source. You read it, change it, and send it yourself.",
  },
  {
    id: "talon", name: "Talon", role: "Opportunity hawk", scene: RIDGE_SCENE, ink: "#ffffff",
    body: "Finds scholarships, summer programs and competitions that fit your record. Every listing is checked on its own page, and scams and expired deadlines are left out, with the reason shown.",
  },
  {
    id: "quill", name: "Quill", role: "Essay owl", scene: NIGHT_SCENE, ink: "#ffffff",
    body: "Helps with your Common App essays. Its notes quote your own sentences and ask what a careful reader would. It never writes or edits a word for you.",
  },
];

const CSS = `
.lp-agents { display: flex; gap: 18px; height: 460px; }
.lp-agent { position: relative; flex: 1 1 0; min-width: 0; border-radius: 22px; overflow: hidden; cursor: default; outline: none;
  transition: flex-grow ${EXPAND_MS}ms ${EASE}, box-shadow 300ms ease; box-shadow: 0 10px 30px rgba(20,20,19,0.10); }
.lp-agent[data-open="true"] { flex-grow: 2.15; box-shadow: 0 18px 44px rgba(20,20,19,0.16); }
.lp-agent:focus-visible { box-shadow: 0 0 0 3px #faf8f4, 0 0 0 6px #1d4ed8; }
.lp-agent-still * { animation-play-state: paused !important; }
.lp-agent-body { transition: opacity 380ms ease 220ms, transform 380ms ease 220ms; }
.lp-agent[data-open="false"] .lp-agent-body { opacity: 0; transform: translateY(8px); transition: opacity 160ms ease, transform 160ms ease; }
@media (max-width: 820px) {
  .lp-agents { flex-direction: column; height: auto; }
  .lp-agent, .lp-agent[data-open] { flex: none; height: 540px; }
  .lp-agent[data-open] .lp-agent-body { opacity: 1; transform: none; }
}
@media (prefers-reduced-motion: reduce) {
  .lp-agent, .lp-agent-body { transition: none !important; }
}
`;

function useMedia(query) {
  const [on, setOn] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const f = () => setOn(m.matches);
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, [query]);
  return on;
}

function Panel({ agent, open, stacked, onOpen, onClose }) {
  const { sky, ground, Decor } = agent.scene;
  const [moving, setMoving] = useState(false);
  const timer = useRef(0);

  // Playing from the moment it starts to widen until the widening is done.
  useEffect(() => {
    clearTimeout(timer.current);
    if (open && !stacked) {
      setMoving(true);
      timer.current = setTimeout(() => setMoving(false), EXPAND_MS + 60);
    } else {
      setMoving(false);
    }
    return () => clearTimeout(timer.current);
  }, [open, stacked]);

  const groundH = ground.h + 26;      // a deeper strip of ground than the band's, for a tall card
  const size = 132;
  return (
    <article className={`lp-agent${moving ? "" : " lp-agent-still"}`} data-open={stacked ? true : open} tabIndex={stacked ? undefined : 0}
      aria-label={`${agent.name}, ${agent.role}`}
      onMouseEnter={onOpen} onMouseLeave={onClose} onFocus={onOpen} onBlur={onClose}
      style={{ background: sky }}>
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: groundH, boxSizing: "border-box",
          background: ground.color, borderTop: `4px solid ${ground.top}` }} />
        {/* The scenery starts under the name, so no cloud or star crosses it. */}
        <div style={{ position: "absolute", left: 0, right: 0, top: 104, bottom: 0 }}>
          <Decor px={4} groundH={groundH} isMobile={false} />
        </div>
        <div style={{ position: "absolute", left: "50%", bottom: groundH - 6, transform: "translateX(-50%)" }}>
          <Mascot agent={agent.id} state={open && !stacked ? "celebrating" : "idle"} size={size} title="" animate={moving} />
        </div>
      </div>

      <div style={{ position: "relative", padding: "26px 28px", color: agent.ink, maxWidth: 440 }}>
        <h3 style={{ margin: 0, fontFamily: SANS, fontWeight: 800, fontSize: "2rem", letterSpacing: "-0.03em", lineHeight: 1.1,
          textShadow: agent.ink === "#ffffff" ? "0 2px 0 rgba(0,0,0,0.2)" : "none" }}>{agent.name}</h3>
        <p style={{ margin: "4px 0 0", fontFamily: SANS, fontWeight: 700, fontSize: "1rem", opacity: 0.9 }}>{agent.role}</p>
        <p className="lp-agent-body" style={{ margin: "16px 0 0", fontFamily: SANS, fontWeight: 600, fontSize: "1.02rem",
          lineHeight: 1.6, maxWidth: 380, padding: "12px 14px", borderRadius: 12, color: "#141413",
          background: "rgba(255,255,255,0.9)", boxShadow: "0 4px 14px rgba(0,0,0,0.12)" }}>
          {agent.body}
        </p>
      </div>
    </article>
  );
}

export default function AgentPanels() {
  const [open, setOpen] = useState(null);
  const stacked = useMedia("(max-width: 820px)");
  return (
    <>
      <style>{CSS}</style>
      <div className="lp-agents">
        {AGENTS.map((a) => (
          <Panel key={a.id} agent={a} open={open === a.id} stacked={stacked}
            onOpen={() => setOpen(a.id)} onClose={() => setOpen((cur) => (cur === a.id ? null : cur))} />
        ))}
      </div>
    </>
  );
}
