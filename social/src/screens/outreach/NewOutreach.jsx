import { useCurrentFrame } from "remotion";
import {
  BEAKER_LINES, BORDER, RADIUS, SANS, TEXT, TEXT_FAINT, TEXT_MID, TEXT_MUTED, WHITE, useInk,
} from "../../brand/brand.js";
import {
  BackLink, Button, FieldLabel, MascotSays, PixelArrow, PixelStamp, SourceLink, StepRail, TextCaret,
  focusRing, inputStyle, textOnPage,
} from "./ui.jsx";
// The example goals are the app's own (options.js imports only the registry).
import { EXAMPLE_GOALS } from "../../../../src/components/agents/outreach/options.js";

// Beaker's "New outreach" page (src/pages/OutreachNewPage.jsx) as a phone
// shows it, one step at a time: Who, Beaker at work, and the shortlist.
// Props carry the state; a scene drives them from the frame.

/** The step rail's steps for a goal (a goal adds "Pick one"). */
export const GOAL_STEPS = [
  { key: "who", label: "Who" },
  { key: "shortlist", label: "Pick one" },
  { key: "details", label: "Details" },
  { key: "research", label: "Research" },
  { key: "review", label: "Review" },
];

// What Beaker says while it builds a shortlist. Not in the registry: the page
// keeps these (OutreachNewPage.jsx SHORTLIST_SAYINGS), copied here word for word.
export const SHORTLIST_SAYINGS = [
  "Scanning the coastline for people who fit your goal.",
  "Only keeping people I can link to a real page.",
  "Checking each one is really working on this.",
  "Picking the few worth writing to.",
];

/** The page around every step: back link, title, step rail, then the step. */
export function NewOutreachPage({ step, steps = GOAL_STEPS, railOffset = 0, children }) {
  const ink = useInk();
  return (
    <div>
      <BackLink color={textOnPage(ink)} />
      <h1 style={{ margin: "6px 0 18px", fontFamily: SANS, fontWeight: 800, fontSize: "1.9rem", color: ink.title,
        letterSpacing: "-0.03em", lineHeight: 1.1 }}>
        New outreach
      </h1>
      <StepRail steps={steps} current={step} offset={railOffset} />
      <div style={{ marginTop: 22 }}>{children}</div>
    </div>
  );
}

// ─── Step 1: who (outreach/WhoStep.jsx) ─────────────────────────────────────

const MODES = [
  { key: "person", label: "Someone I have in mind", hint: "A professor, scientist or professional you already know of." },
  { key: "goal", label: "A goal", hint: "Tell Beaker what you're after, and it finds a few real people to pick from." },
];

function ModeChoice({ mode }) {
  const ink = useInk();
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
      {MODES.map((m) => {
        const on = mode === m.key;
        return (
          <div key={m.key} style={{ display: "flex", gap: 12, alignItems: "flex-start", borderRadius: RADIUS.card,
            padding: "14px 16px", background: on ? ink.softer : WHITE, boxSizing: "border-box", minHeight: 44,
            border: `2px solid ${on ? ink.ring : BORDER}` }}>
            <span style={{ flexShrink: 0, width: 20, height: 20, marginTop: 3, borderRadius: 99,
              border: `2px solid ${on ? ink.ring : "#8a857c"}`, background: WHITE, display: "flex", alignItems: "center",
              justifyContent: "center", boxSizing: "border-box" }}>
              {on && <span style={{ width: 10, height: 10, borderRadius: 99, background: ink.button.bg }} />}
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontWeight: 800, fontSize: "1.05rem", color: TEXT }}>{m.label}</span>
              <span style={{ display: "block", marginTop: 3, fontSize: "0.95rem", color: TEXT_MUTED, lineHeight: 1.5 }}>{m.hint}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * mode: "goal" | "person". goal: the text in the box. focused: the box has
 * the caret (typing: it's solid). tries: { limit, left }. pressed: a thumb
 * is on "Find people".
 */
export function WhoStep({ mode = "goal", goal = "", focused = false, typing = false, tries, pressed = false }) {
  const ink = useInk();
  const goalLen = goal.length;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <MascotSays state="idle" size={80}>{BEAKER_LINES.who}</MascotSays>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <ModeChoice mode={mode} />
        <div>
          <FieldLabel hint="Who would you like to hear from, and about what? Mention where, if it matters.">Your goal</FieldLabel>
          <div style={{ ...inputStyle, minHeight: 96, whiteSpace: "pre-wrap", overflowWrap: "break-word",
            ...(focused ? focusRing(ink) : null) }}>
            {goal ? goal : !focused && <span style={{ color: "#757575" }}>A professor near Tampa who studies coral reefs</span>}
            {focused && <TextCaret color={TEXT} solid={typing} />}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
            <span style={{ fontSize: "0.9rem", fontWeight: 600, fontVariantNumeric: "tabular-nums", color: TEXT_FAINT }}>
              {goalLen} / 300
            </span>
          </div>
          <p style={{ margin: "6px 0 8px", fontSize: "0.95rem", fontWeight: 700, color: TEXT_MID }}>Or start from an example:</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {EXAMPLE_GOALS.map((g) => (
              <span key={g} style={{ fontSize: "0.95rem", fontWeight: 600, color: TEXT, textAlign: "left", background: WHITE,
                border: `1.5px solid ${BORDER}`, borderRadius: RADIUS.control, padding: "9px 12px", minHeight: 44,
                lineHeight: 1.4, maxWidth: "100%", boxSizing: "border-box" }}>
                {g}
              </span>
            ))}
          </div>
        </div>
        {tries && (
          <p style={{ margin: 0, display: "flex", alignItems: "center", gap: 8, fontSize: "0.98rem", fontWeight: 600,
            color: TEXT_MUTED, fontVariantNumeric: "tabular-nums" }}>
            <PixelStamp kind="letter" size={16} />
            Uses 1 of your {tries.limit} tries ({tries.left} left).
          </p>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <Button kind="primary" pressed={pressed} style={{ minWidth: 180 }}>
            {mode === "goal" ? "Find people" : "Continue"}
            <PixelArrow size={16} />
          </Button>
          {mode === "goal" && (
            <span style={{ fontSize: "0.95rem", color: TEXT_MUTED, fontWeight: 600 }}>This starts your try.</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Beaker at work (outreach/BeakerAtWork.jsx, ProgressChecklist.jsx) ──────

const NODE = 24;
const FAILED_BG = "#efedea";
const STOP_CLIP = "polygon(0 4px,2px 4px,2px 2px,4px 2px,4px 0,calc(100% - 4px) 0,calc(100% - 4px) 2px,calc(100% - 2px) 2px,calc(100% - 2px) 4px,100% 4px,100% calc(100% - 4px),calc(100% - 2px) calc(100% - 4px),calc(100% - 2px) calc(100% - 2px),calc(100% - 4px) calc(100% - 2px),calc(100% - 4px) 100%,4px 100%,4px calc(100% - 2px),2px calc(100% - 2px),2px calc(100% - 4px),0 calc(100% - 4px))";
const CROSS = "M1 1h1v1H1zM6 1h1v1H6zM2 2h1v1H2zM5 2h1v1H5zM3 3h2v2H3zM2 5h1v1H2zM5 5h1v1H5zM1 6h1v1H1zM6 6h1v1H6z";

function Stop({ status, ink, frame }) {
  const box = { width: NODE, height: NODE, boxSizing: "border-box", display: "flex", alignItems: "center",
    justifyContent: "center", clipPath: STOP_CLIP };
  if (status === "done") {
    return <span style={{ ...box, background: ink.soft, color: ink.onSoft }}><PixelStamp kind="check" size={16} /></span>;
  }
  if (status === "failed") {
    return (
      <span style={{ ...box, background: FAILED_BG, color: TEXT_FAINT }}>
        <svg width="16" height="16" viewBox="0 0 8 8" shapeRendering="crispEdges" style={{ display: "block" }}>
          <path d={CROSS} fill="currentColor" />
        </svg>
      </span>
    );
  }
  // The sparkle blinks in two steps every 1.2 s (flowUi.jsx oa-pulse).
  const lit = Math.floor(frame / 18) % 2 === 0;
  return (
    <span style={{ ...box, background: ink.ring, padding: 2 }}>
      <span style={{ width: "100%", height: "100%", background: WHITE, clipPath: STOP_CLIP, display: "flex",
        alignItems: "center", justifyContent: "center", color: ink.text }}>
        <span style={{ display: "flex", opacity: lit ? 1 : 0.25 }}><PixelStamp kind="sparkle" size={16} /></span>
      </span>
    </span>
  );
}

const routeLine = (color) => ({
  position: "absolute", left: NODE / 2 - 1, top: NODE + 2, bottom: 2, width: 2,
  background: `linear-gradient(180deg, ${color} 50%, transparent 50%) left top / 2px 4px repeat-y`,
});

/** lines: [{ id, label, status: "active" | "done" | "failed" }], the server's own. */
export function ProgressChecklist({ lines, label = "What Beaker is doing" }) {
  const ink = useInk();
  const frame = useCurrentFrame();
  const items = lines.length === 0 ? [{ id: "__start", label: "Getting started", status: "active" }] : lines;
  return (
    <div style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: RADIUS.card, padding: "14px 16px", minWidth: 0 }}>
      <p style={{ margin: "0 0 10px", fontSize: "0.9rem", fontWeight: 800, color: TEXT_MUTED, letterSpacing: "0.02em" }}>{label}</p>
      <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {items.map((l, i) => (
          <li key={l.id} style={{ position: "relative", display: "grid", gridTemplateColumns: `${NODE}px minmax(0, 1fr)`,
            columnGap: 12, paddingBottom: i === items.length - 1 ? 0 : 14, fontSize: "1rem", lineHeight: 1.45,
            fontWeight: l.status === "active" ? 700 : 600, color: l.status === "failed" ? TEXT_MUTED : TEXT }}>
            {i < items.length - 1 && <span style={routeLine(ink.ring)} />}
            <Stop status={l.status} ink={ink} frame={frame} />
            <span style={{ overflowWrap: "anywhere", minHeight: NODE }}>{l.label}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Beaker flying its route while the backend works: a saying, then the checklist. */
export function BeakerAtWork({ saying, lines, note, offset = 0 }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
      <MascotSays state="flying" size={96} offset={offset}>{saying}</MascotSays>
      <ProgressChecklist lines={lines} />
      {note && <p style={{ margin: 0, fontSize: "0.95rem", color: TEXT_MUTED, lineHeight: 1.55 }}>{note}</p>}
    </div>
  );
}

// ─── Step 2: pick one (outreach/ShortlistStep.jsx) ──────────────────────────

const domainOf = (url) => {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
};
const firstName = (name) => String(name || "").trim().replace(/^(dr|prof|professor|mr|ms|mrs|mx)\.?\s+/i, "").split(/\s+/)[0] || "them";

function Candidate({ person, pressed }) {
  const role = [person.title, person.organization].filter(Boolean).join(", ");
  return (
    <li style={{ listStyle: "none", background: WHITE, border: `1px solid ${BORDER}`, borderRadius: RADIUS.card,
      padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
      <div style={{ minWidth: 0 }}>
        <h3 style={{ margin: 0, fontWeight: 800, fontSize: "1.2rem", color: TEXT, lineHeight: 1.3 }}>{person.name}</h3>
        {role && <p style={{ margin: "3px 0 0", fontWeight: 600, fontSize: "0.98rem", color: TEXT_MUTED, lineHeight: 1.45 }}>{role}</p>}
      </div>
      {person.why && <p style={{ margin: 0, fontSize: "1rem", color: TEXT_MID, lineHeight: 1.55 }}>{person.why}</p>}
      {person.source_url && (
        <p style={{ margin: 0, fontSize: "0.95rem", color: TEXT_MUTED, lineHeight: 1.5 }}>
          Source:{" "}
          <SourceLink>{person.source_title ? `${person.source_title} (${domainOf(person.source_url)})` : domainOf(person.source_url)}</SourceLink>
        </p>
      )}
      <div style={{ marginTop: 4 }}>
        <Button kind="primary" pressed={pressed}>Write to {firstName(person.name)}<PixelArrow size={16} /></Button>
      </div>
    </li>
  );
}

/** candidates: the backend's shortlist. pressedIndex: a thumb on that card's button. */
export function ShortlistStep({ candidates, goal, pressedIndex = null, offset = 0 }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <MascotSays state="delivering" size={80} offset={offset}>{BEAKER_LINES.shortlist}</MascotSays>
      {goal && (
        <p style={{ margin: 0, fontSize: "0.98rem", color: TEXT_MUTED, lineHeight: 1.5 }}>
          Your goal: <span style={{ color: TEXT, fontWeight: 600 }}>{goal}</span>
        </p>
      )}
      <ul style={{ margin: 0, padding: 0, display: "grid", gap: 12, gridTemplateColumns: "1fr" }}>
        {candidates.map((c, i) => <Candidate key={c.name} person={c} pressed={pressedIndex === i} />)}
      </ul>
      <div><Button kind="quiet">None of these, start over</Button></div>
      <p style={{ margin: "-10px 0 0", fontSize: "0.93rem", color: TEXT_MUTED, lineHeight: 1.5 }}>
        Starting over uses another try. Picking someone here costs nothing more.
      </p>
    </div>
  );
}
