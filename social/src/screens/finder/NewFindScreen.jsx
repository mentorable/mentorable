import { Easing } from "remotion";
import {
  BORDER, RADIUS, SANS, SURFACE, TALON_LINES, TEXT, TEXT_MID, TEXT_MUTED, WHITE, useInk,
} from "../../brand/brand.js";
import { TALON } from "../../brand/sprites.js";
import { FrameSprite } from "../../kit/FrameSprite.jsx";
import {
  ActionButton, Button, Card, Counter, FieldCaret, FieldLabel, KindTag, Mascot, MascotSays, PixelArrow, PixelStamp,
  SourceLink, TrustBadge, Viewport, focusRing, inputStyle, textOnPage,
} from "./parts.jsx";
import { CITIZENSHIP, EFFORT, LANES, STEPS, WANT_MAX, deadlineLabel } from "./data.js";

// Talon's "new find" flow, rebuilt from src/pages/FinderNewPage.jsx and the
// steps in src/components/agents/finder/ (LaneStep, BriefStep, CheckStep,
// TalonAtWork, ResultsStep), as a phone shows them: the 16px gutter, the
// stacked mascot and bubble, the rail's tiles with one line under them.
//
// One component per step, each a whole page split at its key element (see
// Viewport in parts.jsx): the scene says where that element sits on the
// screen with `anchorY`, and animates the step's props from the frame.

const LH = 1.5;   // the app's base line height (Tailwind's preflight on <html>)

// ─── The page head: back link, title, the step rail ─────────────────────────

const TILE = 30;
const RAIL_MASCOT = 32;
const ABOVE = RAIL_MASCOT + 2;
const TILE_EDGE = "#d6d1c9";
const DOTS_OFF = "#c4bfb6";
const TILE_CLIP = "polygon(0 2px,2px 2px,2px 0,calc(100% - 2px) 0,calc(100% - 2px) 2px,100% 2px,100% calc(100% - 2px),calc(100% - 2px) calc(100% - 2px),calc(100% - 2px) 100%,2px 100%,2px calc(100% - 2px),0 calc(100% - 2px))";

function Tile({ done, on, n, ink }) {
  const face = { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
    clipPath: TILE_CLIP, fontSize: "0.95rem", fontWeight: 800, fontVariantNumeric: "tabular-nums", boxSizing: "border-box" };
  const inner = on ? { background: ink.button.bg, color: ink.button.fg }
    : done ? { background: ink.soft, color: ink.onSoft }
    : { background: WHITE, color: TEXT_MUTED };
  return (
    <span style={{ position: "relative", zIndex: 1, width: TILE, height: TILE, display: "block",
      background: on || done ? "transparent" : TILE_EDGE, clipPath: TILE_CLIP, padding: on || done ? 0 : 2, boxSizing: "border-box" }}>
      <span style={{ ...face, ...inner }}>
        {done ? <PixelStamp kind="check" size={16} /> : n}
      </span>
    </span>
  );
}

/** agents/StepRail.jsx on a phone: tiles only, and one line naming the step. */
export function StepRail({ current, allDone = false }) {
  const ink = useInk();
  const at = Math.max(0, STEPS.findIndex((s) => s.key === current));
  return (
    <div style={{ fontFamily: SANS }}>
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", alignItems: "flex-start" }}>
        {STEPS.map((s, i) => {
          const done = i < at || allDone;
          const on = i === at && !allDone;
          return (
            <li key={s.key} style={{ flex: "1 1 0", minWidth: 0, position: "relative", paddingTop: ABOVE, display: "flex",
              flexDirection: "column", alignItems: "center", textAlign: "center" }}>
              {i > 0 && (
                <span style={{ position: "absolute", top: ABOVE + TILE / 2 - 1, right: "50%", width: "100%", height: 2,
                  background: `linear-gradient(90deg, ${i <= at ? ink.ring : DOTS_OFF} 50%, transparent 50%) left top / 4px 2px repeat-x` }} />
              )}
              {i === at && (
                <span style={{ position: "absolute", top: 0, left: "50%", marginLeft: -RAIL_MASCOT / 2, zIndex: 2 }}>
                  <Mascot state={allDone ? "celebrating" : "idle"} size={RAIL_MASCOT} offset={5} />
                </span>
              )}
              <Tile done={done} on={on} n={i + 1} ink={ink} />
            </li>
          );
        })}
      </ol>
      <p style={{ margin: "8px 0 0", fontSize: "0.95rem", fontWeight: 700, color: TEXT, lineHeight: LH }}>
        {allDone ? "All steps done" : `Step ${at + 1} of ${STEPS.length}: ${STEPS[at].label}`}
      </p>
    </div>
  );
}

/** The top of FinderNewPage: "Your board", the title, the rail, and the 22px
 *  before the step. */
function PageHead({ current, allDone }) {
  const ink = useInk();
  return (
    <div style={{ paddingTop: 20, lineHeight: LH }}>
      <div>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minHeight: 44, padding: "0 6px", marginLeft: -6,
          fontSize: "0.98rem", fontWeight: 700, color: textOnPage(ink), borderRadius: 10 }}>
          <PixelArrow size={16} style={{ transform: "scaleX(-1)" }} />
          Your board
        </span>
      </div>
      <h1 style={{ margin: "6px 0 18px", fontWeight: 800, fontSize: "1.9rem", color: ink.title, letterSpacing: "-0.03em",
        lineHeight: 1.1 }}>
        Find opportunities
      </h1>
      <StepRail current={current} allDone={allDone} />
      <div style={{ height: 22 }} />
    </div>
  );
}

// ─── Step 1: what to look for (LaneStep) ────────────────────────────────────

/**
 * lane: the chosen lane or null. pressedKey: a lane card held down by a tap.
 * anchorY: where the top of the two lane cards sits.
 */
export function LaneScreen({ lane = null, pressedKey = null, anchorY = 250, mascotOffset = 0 }) {
  const ink = useInk();
  const above = (
    <div style={{ paddingBottom: 18 }}>
      <PageHead current="what" />
      <MascotSays state="idle" size={80} offset={mascotOffset}>{TALON_LINES.laneAsk}</MascotSays>
    </div>
  );
  const below = (
    <div style={{ display: "grid", gap: 12, lineHeight: LH }}>
      {LANES.map((l) => {
        const on = lane === l.key;
        const down = pressedKey === l.key;
        return (
          <div key={l.key} style={{ width: "100%", minHeight: 132, padding: "18px 18px 16px", boxSizing: "border-box",
            display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 10, textAlign: "left",
            borderRadius: RADIUS.card, border: `2px solid ${on ? ink.ring : BORDER}`, background: on ? ink.softer : WHITE,
            transform: down ? "scale(0.985)" : "none" }}>
            <span style={{ width: 40, height: 40, borderRadius: 10, background: ink.soft, color: ink.onSoft,
              display: "flex", alignItems: "center", justifyContent: "center" }}>
              <PixelStamp kind={l.key === "scholarship" ? "star" : "sparkle"} size={24} />
            </span>
            <span style={{ fontSize: "1.25rem", fontWeight: 800, color: TEXT, letterSpacing: "-0.01em" }}>{l.label}</span>
            <span style={{ fontSize: "0.98rem", fontWeight: 600, color: TEXT_MUTED, lineHeight: 1.5 }}>{l.blurb}</span>
            <span style={{ marginTop: "auto", display: "inline-flex", alignItems: "center", gap: 6,
              fontSize: "0.95rem", fontWeight: 800, color: on ? ink.onSoft : ink.text }}>
              {on ? "Selected" : "Choose"} <PixelArrow size={16} />
            </span>
          </div>
        );
      })}
    </div>
  );
  return <Viewport anchorY={anchorY} above={above} below={below} />;
}

// ─── Step 2: the brief (BriefStep) ──────────────────────────────────────────

const GRADE_LABEL = { 9: "9th grade", 10: "10th grade", 11: "11th grade", 12: "12th grade" };
const EXAMPLES = [
  "Scholarships for students who want to study marine biology",
  "Scholarships in my state with a short essay or none",
];
const PLACEHOLDER = "Scholarships for a future nurse who volunteers at a hospital";

function SectionTitle({ children }) {
  return <h3 style={{ margin: "0 0 14px", fontSize: "1.1rem", fontWeight: 800, color: TEXT, lineHeight: LH }}>{children}</h3>;
}

function PillRadios({ legend, hint, options, value }) {
  const ink = useInk();
  return (
    <div>
      <div style={{ marginBottom: hint ? 2 : 8, fontWeight: 700, fontSize: "1rem", color: TEXT }}>{legend}</div>
      {hint && <p style={{ margin: "0 0 8px", fontSize: "0.92rem", color: TEXT_MUTED, lineHeight: 1.5 }}>{hint}</p>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {options.map((o) => {
          const on = value === o.key;
          return (
            <span key={o.key} style={{ display: "inline-flex", alignItems: "center", gap: 8, minHeight: 44, padding: "8px 14px",
              borderRadius: RADIUS.pill, boxSizing: "border-box", fontSize: "0.95rem", fontWeight: 700, lineHeight: 1.3,
              maxWidth: "100%", border: `1.5px solid ${on ? ink.ring : BORDER}`, background: on ? ink.softer : WHITE,
              color: on ? ink.onSoft : TEXT_MID }}>
              <span style={{ flexShrink: 0, width: 16, height: 16, borderRadius: 99, boxSizing: "border-box",
                border: `2px solid ${on ? ink.ring : "#8a857c"}`, background: WHITE, display: "flex", alignItems: "center",
                justifyContent: "center" }}>
                {on && <span style={{ width: 8, height: 8, borderRadius: 99, background: ink.button.bg }} />}
              </span>
              {o.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function Chevron() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" shapeRendering="crispEdges" style={{ flexShrink: 0 }}>
      <path d="M2 4h2v2H2zM4 6h2v2H4zM6 6h2v2H6zM8 4h2v2H8z" fill="currentColor" />
    </svg>
  );
}

/**
 * brief: { want, interests: [], grade, state, citizenship, effort }.
 * typing: keys are landing (the caret holds solid). focused: the want box
 * has focus (ring and caret). anchorY: where the "What you're after" card's
 * top sits.
 */
export function BriefScreen({ brief, typing = false, focused = true, anchorY = 110, mascotOffset = 0 }) {
  const ink = useInk();
  const above = (
    <div style={{ paddingBottom: 16 }}>
      <PageHead current="details" />
      <MascotSays state="idle" size={80} offset={mascotOffset}>{TALON_LINES.briefAsk}</MascotSays>
      <div style={{ height: 16 }} />
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 12px", background: WHITE,
        border: `1px solid ${BORDER}`, borderRadius: RADIUS.control, padding: "8px 8px 8px 14px", lineHeight: LH }}>
        <span style={{ flex: "1 1 200px", minWidth: 0, fontSize: "1rem", color: TEXT_MID, lineHeight: 1.5 }}>
          Looking for <strong style={{ color: TEXT, fontWeight: 700 }}>Scholarships</strong>
        </span>
        <Button kind="quiet">Change</Button>
      </div>
    </div>
  );

  const want = brief.want || "";
  const below = (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, lineHeight: LH }}>
      <Card>
        <SectionTitle>What you're after</SectionTitle>
        <FieldLabel hint="In your own words: the subject, the kind of thing, anything that matters to you.">
          What should Talon look for?
        </FieldLabel>
        <div style={{ ...inputStyle, minHeight: 96, whiteSpace: "pre-wrap", overflowWrap: "anywhere",
          ...(focused ? focusRing(ink) : null) }}>
          {want}
          {/* The app sets no caret-color: the ink caret Beaker's fields draw too. */}
          {focused && <FieldCaret typing={typing} color={TEXT} />}
          {!want && <span style={{ color: TEXT_MUTED }}>{PLACEHOLDER}</span>}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginTop: 4 }}>
          <span />
          <Counter n={want.length} max={WANT_MAX} />
        </div>
        <p style={{ margin: "10px 0 8px", fontSize: "0.95rem", fontWeight: 700, color: TEXT_MID }}>Or start from an example:</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {EXAMPLES.map((ex) => (
            <span key={ex} style={{ fontSize: "0.95rem", fontWeight: 600, color: TEXT, textAlign: "left", background: WHITE,
              border: `1.5px solid ${BORDER}`, borderRadius: RADIUS.control, padding: "9px 12px", minHeight: 44,
              lineHeight: 1.4, maxWidth: "100%", boxSizing: "border-box" }}>
              {ex}
            </span>
          ))}
        </div>
        <div style={{ marginTop: 20 }}>
          <FieldLabel optional hint="Up to 5, like a subject or a hobby. Any majors on your record are already here.">
            Your interests
          </FieldLabel>
          <div style={{ margin: "0 0 10px", display: "flex", flexWrap: "wrap", gap: 8 }}>
            {brief.interests.map((v) => (
              <span key={v} style={{ minHeight: 44, maxWidth: "100%", padding: "6px 8px 6px 14px", display: "inline-flex",
                alignItems: "center", gap: 8, borderRadius: RADIUS.pill, border: `1.5px solid ${ink.soft}`,
                background: ink.softer, color: ink.onSoft, fontSize: "0.95rem", fontWeight: 700, boxSizing: "border-box" }}>
                <span>{v}</span>
                <span style={{ width: 24, height: 24, flexShrink: 0, borderRadius: 99, display: "inline-flex",
                  alignItems: "center", justifyContent: "center", background: WHITE }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2"
                    strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                </span>
              </span>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ ...inputStyle, flex: 1, minWidth: 0, color: TEXT_MUTED }}>Robotics</div>
            <Button kind="secondary" style={{ opacity: 0.55 }}>Add</Button>
          </div>
        </div>
      </Card>

      <Card>
        <SectionTitle>About you</SectionTitle>
        <div style={{ display: "grid", gap: 14 }}>
          <div>
            <FieldLabel>Grade</FieldLabel>
            <div style={{ ...inputStyle, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              {GRADE_LABEL[brief.grade] || "Prefer not to say"}
              <span style={{ color: TEXT_MID, display: "flex" }}><Chevron /></span>
            </div>
          </div>
          <div>
            <FieldLabel optional>State</FieldLabel>
            <div style={inputStyle}>{brief.state}</div>
            <p style={{ margin: "4px 0 0", fontSize: "0.92rem", color: TEXT_MUTED, lineHeight: 1.5 }}>
              Many scholarships are for one state only.
            </p>
          </div>
        </div>
        <div style={{ marginTop: 18 }}>
          <PillRadios legend="Citizenship status"
            hint="Some scholarships and programs need US citizenship or permanent residency. Used for this search only, never saved."
            options={CITIZENSHIP} value={brief.citizenship} />
        </div>
      </Card>

      <Card>
        <SectionTitle>What kind of application</SectionTitle>
        <PillRadios legend="How much writing?" options={EFFORT} value={brief.effort} />
      </Card>

      <Card style={{ padding: 0 }}>
        <div style={{ minHeight: 56, padding: "12px 18px", display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 12, boxSizing: "border-box" }}>
          <span style={{ fontSize: "1.05rem", fontWeight: 800, color: TEXT }}>Optional: things that open up more scholarships</span>
          <span style={{ display: "inline-flex", color: TEXT_MID }}><PixelArrow size={16} /></span>
        </div>
      </Card>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <Button kind="primary" style={{ minWidth: 180 }}>Check the details <PixelArrow size={16} /></Button>
        <span style={{ fontSize: "0.95rem", color: TEXT_MUTED, fontWeight: 600 }}>Nothing is spent yet.</span>
      </div>
    </div>
  );
  return <Viewport anchorY={anchorY} above={above} below={below} />;
}

// ─── Step 3: the check (CheckStep) ──────────────────────────────────────────

/**
 * brief: as BriefScreen. finds: { left, limit }. pressed: Start search held
 * down by a tap. anchorY: where the "Staying safe" box's top sits.
 */
export function CheckScreen({ brief, finds = { left: 4, limit: 4 }, pressed = false, anchorY = 40, mascotOffset = 0 }) {
  const ink = useInk();
  const label = (list, key) => list.find((o) => o.key === key)?.label || "";
  const rows = [
    { label: "Looking for", value: "Scholarships" },
    { label: "What you want", value: `"${brief.want.trim()}"` },
    { label: "Interests", value: brief.interests.join(", ") || "None added" },
    { label: "Grade", value: brief.grade ? `${brief.grade}th grade` : "Not given" },
    { label: "State", value: brief.state || "Not given" },
    { label: "Writing", value: label(EFFORT, brief.effort) },
    { label: "Citizenship", value: label(CITIZENSHIP, brief.citizenship) || "Not given" },
    { label: "Also open to", value: "Nothing picked" },
  ];
  const above = (
    <div style={{ paddingBottom: 18 }}>
      <PageHead current="check" />
      <MascotSays state="thinking" size={80} offset={mascotOffset}>{TALON_LINES.checkAsk}</MascotSays>
      <div style={{ height: 18 }} />
      <Card style={{ padding: "6px 8px 6px 16px" }}>
        {rows.map((r, i) => (
          <div key={r.label} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "2px 12px",
            padding: "8px 0", borderTop: i ? `1px solid ${BORDER}` : "none" }}>
            <div style={{ flex: "0 0 132px", fontSize: "0.93rem", fontWeight: 700, color: TEXT_MUTED }}>{r.label}</div>
            <div style={{ flex: "1 1 200px", minWidth: 0, fontSize: "1rem", fontWeight: 600, color: TEXT, lineHeight: 1.5,
              overflowWrap: "anywhere" }}>
              {r.value}
            </div>
            <Button kind="quiet" style={{ marginLeft: "auto", padding: "8px 12px" }}>Edit</Button>
          </div>
        ))}
      </Card>
      <p style={{ margin: "18px 0 0", fontSize: "0.95rem", fontWeight: 600, color: TEXT_MID, lineHeight: 1.55 }}>
        Talon searches the web with words built from this. Your citizenship and anything under "Also open to" shape the
        search but are never saved, and your name and school are never part of it.
      </p>
    </div>
  );
  const below = (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, lineHeight: LH }}>
      <section style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: RADIUS.control, padding: "12px 14px" }}>
        <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8, fontSize: "1.02rem", fontWeight: 800, color: TEXT }}>
          <span style={{ color: ink.text, display: "flex" }}><PixelStamp kind="check" size={16} /></span>
          Staying safe
        </h3>
        <p style={{ margin: "6px 0 0", fontSize: "0.98rem", color: TEXT_MID, lineHeight: 1.55 }}>{TALON_LINES.safety}</p>
      </section>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
        <Button kind="primary" pressed={pressed} style={{ minWidth: 180 }}>Start search <PixelArrow size={16} /></Button>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: "0.95rem", fontWeight: 600,
          color: TEXT_MUTED, fontVariantNumeric: "tabular-nums" }}>
          <span style={{ color: ink.text, display: "flex" }}><PixelStamp kind="sparkle" size={16} /></span>
          {`This uses 1 of your ${finds.limit} finds (${finds.left} left).`}
        </span>
      </div>
    </div>
  );
  return <Viewport anchorY={anchorY} above={above} below={below} />;
}

// ─── Step 4: the search (TalonAtWork) ───────────────────────────────────────

const CLOUD_CLIP = "polygon(0 50%,8px 50%,8px 25%,16px 25%,16px 0,calc(100% - 24px) 0,calc(100% - 24px) 25%,"
  + "calc(100% - 8px) 25%,calc(100% - 8px) 50%,100% 50%,100% 100%,0 100%)";
const CLOUDS = [
  { left: "6%", top: 0.11, narrow: 56 },
  { left: "62%", top: 0.07, narrow: 72 },
  { left: "80%", top: 0.48, narrow: 48 },
  { left: "24%", top: 0.77, narrow: 48 },
];
const SKY = { size: 64, height: 152, top: 44, trail: 84, pad: 12 };
const STAMP_BG = "#f3f1ee";
const EASE = Easing.bezier(0.42, 0, 0.58, 1);   // CSS ease-in-out

/** Where Talon is in the app's sky animation `t` seconds after it mounted:
 *  one crossing each way in 32 s (ts-cross), turning at each end
 *  (ts-turn, step-end), a 3.4 s bob of 5px (ts-bob). */
function flight(t) {
  const cyc = ((t % 32) + 32) % 32;
  const out = cyc < 16;
  const leg = out ? cyc / 16 : (cyc - 16) / 16;
  const p = EASE(leg);
  const across = out ? p : 1 - p;
  const b = ((t % 3.4) + 3.4) % 3.4 / 1.7;
  const bob = -5 * EASE(b <= 1 ? b : 2 - b);
  return { across, flip: !out, bob };
}

function Sky({ t, ink }) {
  const { across, flip, bob } = flight(t);
  const track = 342 - 2 - SKY.pad * 2 - SKY.size;   // the sky's inner width, less the padding and the bird
  return (
    <div style={{ position: "relative", height: SKY.height, overflow: "hidden", boxSizing: "border-box",
      borderRadius: RADIUS.card, border: `1px solid ${ink.soft}`,
      background: `linear-gradient(180deg, ${ink.soft} 0%, ${ink.softer} 70%, ${WHITE} 100%)` }}>
      {CLOUDS.map((c) => (
        <span key={c.left} style={{ position: "absolute", left: c.left, top: Math.round(c.top * SKY.height),
          width: c.narrow, height: 16, background: WHITE, opacity: 0.95, clipPath: CLOUD_CLIP }} />
      ))}
      <div style={{ position: "absolute", left: SKY.pad + Math.round(across * track), top: SKY.top + bob,
        width: SKY.size, height: SKY.size, transform: flip ? "scaleX(-1)" : "none" }}>
        <span style={{ position: "absolute", right: "100%", marginRight: 2, top: Math.round(SKY.size * 0.67),
          width: SKY.trail, height: 2, opacity: 0.6,
          background: `linear-gradient(90deg, ${ink.ring} 50%, transparent 50%) left top / 6px 2px repeat-x`,
          WebkitMaskImage: "linear-gradient(90deg, transparent, #000)", maskImage: "linear-gradient(90deg, transparent, #000)" }} />
        <FrameSprite sprite={TALON} state="flying" scale={2} />
      </div>
    </div>
  );
}

function Stamp({ line, ink }) {
  return (
    <li style={{ display: "inline-flex", alignItems: "flex-start", gap: 6, maxWidth: "100%", boxSizing: "border-box",
      padding: "5px 10px 5px 8px", borderRadius: 6, fontSize: "0.9rem", lineHeight: 1.4, fontWeight: 700, color: TEXT_MID,
      background: STAMP_BG }}>
      <span style={{ display: "flex", marginTop: 2, color: ink.text }}><PixelStamp kind="check" size={16} /></span>
      <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{line.label}</span>
    </li>
  );
}

/**
 * t: seconds since the search started (drives the flight and the pulse).
 * progress: { now, also: [], done: [{ id, label }] }, the server's lines.
 * saying: the Talon line under the strip (TALON_LINES.searching). anchorY:
 * where the sky's top sits.
 */
export function SearchScreen({ t = 0, progress, saying, anchorY = 20 }) {
  const ink = useInk();
  const pulseOn = ((t % 1.2) + 1.2) % 1.2;
  const above = <PageHead current="search" />;
  const below = (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0, lineHeight: LH }}>
      <Sky t={t} ink={ink} />
      <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", minWidth: 0,
            background: ink.softer, border: `1px solid ${ink.soft}`, borderRadius: RADIUS.control }}>
            <span style={{ display: "flex", marginTop: 4, color: ink.onSoft,
              opacity: pulseOn < 0.3 || pulseOn >= 0.9 ? 1 : 0.25 }}>
              <PixelStamp kind="sparkle" size={16} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, lineHeight: 1.45, color: TEXT, overflowWrap: "anywhere" }}>
                <span style={{ display: "inline-block", marginRight: 8, padding: "1px 7px", verticalAlign: 1,
                  background: ink.button.bg, color: ink.button.fg, fontSize: "0.9rem", fontWeight: 800, lineHeight: 1.4,
                  letterSpacing: "0.06em", textTransform: "uppercase", borderRadius: 6 }}>
                  Now
                </span>
                {progress.now}
              </p>
              {progress.also?.length > 0 && (
                <ul style={{ listStyle: "none", margin: "4px 0 0", padding: 0, display: "grid", gap: 2 }}>
                  {progress.also.map((l) => (
                    <li key={l} style={{ fontSize: "0.95rem", fontWeight: 600, lineHeight: 1.45, color: TEXT_MID }}>{l}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          {saying && (
            <p style={{ margin: 0, fontSize: "0.95rem", fontWeight: 600, lineHeight: 1.5, color: TEXT_MUTED }}>
              Talon: {"“"}{saying}{"”"}
            </p>
          )}
        </div>
        {progress.done?.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: "0.9rem", fontWeight: 800, color: TEXT_MUTED, letterSpacing: "0.02em" }}>
              Done so far
            </h3>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexWrap: "wrap", gap: 6, minWidth: 0 }}>
              {progress.done.map((l) => <Stamp key={l.id} line={l} ink={ink} />)}
            </ul>
          </div>
        )}
      </div>
      <p style={{ margin: 0, fontSize: "0.95rem", color: TEXT_MUTED, lineHeight: 1.55 }}>
        This usually takes a minute or two. You can leave this page: Talon keeps going, and what it finds lands on
        your board.
      </p>
      <div><Button kind="secondary">Go to your board</Button></div>
    </div>
  );
  return <Viewport anchorY={anchorY} above={above} below={below} />;
}

// ─── The end of a find (ResultsStep) ────────────────────────────────────────

/** agents/finder/ListingCard.jsx as the results show it: no drawer, so Save
 *  and Dismiss sit on the card. */
export function ListingCard({ item }) {
  const line = { margin: "6px 0 0", fontSize: "0.95rem", lineHeight: 1.45, overflowWrap: "anywhere" };
  return (
    <article style={{ background: WHITE, borderRadius: RADIUS.card, boxSizing: "border-box", minWidth: 0,
      border: `1px solid ${BORDER}`, padding: "14px 16px 12px", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        <KindTag />
        <TrustBadge verified={item.verified} />
      </div>
      <h3 style={{ margin: "10px 0 0", fontSize: "1.15rem", fontWeight: 800, color: TEXT, lineHeight: 1.3,
        letterSpacing: "-0.01em" }}>
        {item.title}
      </h3>
      <p style={{ ...line, margin: "3px 0 0", fontWeight: 500, color: TEXT_MUTED }}>{item.provider}</p>
      <p style={{ ...line, margin: "10px 0 0", display: "flex", alignItems: "flex-start", gap: 8, fontWeight: 700,
        color: TEXT_MID, fontVariantNumeric: "tabular-nums" }}>
        <span style={{ display: "flex", marginTop: 2 }}><PixelStamp kind="clock" size={16} /></span>
        <span>{deadlineLabel(item)}</span>
      </p>
      <p style={{ ...line, fontWeight: 600, color: TEXT_MID }}>{item.amount_text}</p>
      <p style={{ ...line, margin: "10px 0 0", color: TEXT, fontWeight: 500 }}>
        <span style={{ fontWeight: 800 }}>Why it fits you: </span>{item.fit_reason}
      </p>
      <div style={{ height: 2, margin: "12px 0 4px",
        background: "linear-gradient(90deg, #d6d1c9 50%, transparent 50%) left top / 4px 2px repeat-x" }} />
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 12px" }}>
        <SourceLink style={{ fontSize: "0.95rem" }}>Open its page</SourceLink>
        <span style={{ fontSize: "0.9rem", fontWeight: 600, color: TEXT_MUTED }}>{item.checked}</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
        <ActionButton primary>Save</ActionButton>
        <ActionButton>Dismiss</ActionButton>
      </div>
    </article>
  );
}

/**
 * items: what Talon kept. dropped: [{ title, message }]. open: the "Left
 * out" list is open. pressed: its button held down by a tap. anchorY: where
 * the "Left out" box's top sits.
 */
export function ResultsScreen({ items, dropped, open = false, pressed = false, anchorY = 80, mascotOffset = 0 }) {
  const above = (
    <div style={{ paddingBottom: 18 }}>
      <PageHead current="search" allDone />
      <MascotSays state="celebrating" size={88} offset={mascotOffset}>{TALON_LINES.results(items.length)}</MascotSays>
      <div style={{ marginTop: 18, fontSize: "0.98rem", fontWeight: 600, color: TEXT_MID, lineHeight: 1.55 }}>
        <p style={{ margin: 0 }}>
          They're all on your board under New finds. Save the ones worth a closer look, and dismiss the rest so they never
          come back.
        </p>
      </div>
      <ul style={{ listStyle: "none", margin: "18px 0 0", padding: 0, display: "grid", gap: 12, lineHeight: LH }}>
        {items.map((item) => <li key={item.id} style={{ minWidth: 0 }}><ListingCard item={item} /></li>)}
      </ul>
    </div>
  );
  const below = (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, lineHeight: LH }}>
      <section style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: RADIUS.card }}>
        <div style={{ width: "100%", minHeight: 52, padding: "12px 16px", display: "flex", alignItems: "center",
          justifyContent: "space-between", gap: 12, boxSizing: "border-box", borderRadius: RADIUS.card, fontSize: "1.05rem",
          fontWeight: 800, color: TEXT, background: pressed ? "rgba(20,20,19,0.04)" : "none" }}>
          Left out ({dropped.length})
          <span style={{ display: "inline-flex", color: TEXT_MID, transform: open ? "rotate(90deg)" : "none" }}>
            <PixelArrow size={16} />
          </span>
        </div>
        {open && (
          <div style={{ padding: "0 16px 16px" }}>
            <p style={{ margin: "0 0 10px", fontSize: "0.98rem", fontWeight: 600, color: TEXT_MID, lineHeight: 1.55 }}>
              {TALON_LINES.droppedIntro}
            </p>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              {dropped.map((d, i) => (
                <li key={`${i}-${d.title}`} style={{ padding: "10px 12px", background: SURFACE, border: `1px solid ${BORDER}`,
                  borderRadius: RADIUS.control, lineHeight: 1.5, overflowWrap: "anywhere" }}>
                  <span style={{ display: "block", fontSize: "1rem", fontWeight: 700, color: TEXT }}>{d.title}</span>
                  <span style={{ display: "block", marginTop: 2, fontSize: "0.95rem", fontWeight: 500, color: TEXT_MUTED }}>
                    {d.message}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <Button kind="primary">See your board <PixelArrow size={16} /></Button>
        <Button kind="secondary">Find more</Button>
      </div>
    </div>
  );
  return <Viewport anchorY={anchorY} above={above} below={below} />;
}
