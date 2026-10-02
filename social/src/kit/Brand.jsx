import { BG, BORDER, COLUMN, LAYOUT, SANS, TEXT_MUTED, WHITE, lighten, useInk } from "../brand/brand.js";

// The wordmark as the app's sidebar draws it (lowercase Raleway 700, tight
// tracking, the accent, a small dot after it) and the BETA pill that sits
// beside it everywhere in these videos.

export function Wordmark({ size = 40 }) {
  const ink = useInk();
  const dot = Math.round(size * 0.16);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: Math.round(size * 0.14) }}>
      <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: size, letterSpacing: "-0.04em", color: ink.title, lineHeight: 1 }}>
        mentorable
      </span>
      <span style={{ width: dot, height: dot, borderRadius: "50%", flexShrink: 0, marginTop: Math.round(size * 0.12),
        background: `linear-gradient(135deg, ${ink.accent}, ${lighten(ink.accent, 0.35)})` }} />
    </span>
  );
}

export function BetaPill({ size = 22 }) {
  const ink = useInk();
  return (
    <span style={{ display: "inline-block", fontFamily: SANS, fontWeight: 800, fontSize: size, letterSpacing: "0.12em",
      color: ink.onSoft, background: ink.soft, borderRadius: 999, padding: `${Math.round(size * 0.3)}px ${Math.round(size * 0.65)}px`,
      lineHeight: 1 }}>
      BETA
    </span>
  );
}

/** "demo data": says the people and finds on screen are invented. */
export function DemoPill({ size = 26 }) {
  return (
    <span style={{ display: "inline-block", fontFamily: SANS, fontWeight: 700, fontSize: size, color: TEXT_MUTED,
      background: WHITE, border: `1.5px solid ${BORDER}`, borderRadius: 999, lineHeight: 1,
      padding: `${Math.round(size * 0.28)}px ${Math.round(size * 0.6)}px` }}>
      demo data
    </span>
  );
}

/** The brand line at the top of every scene but the end card. `demo` adds
 *  the "demo data" pill, for scenes that show invented people or finds. It
 *  lives here rather than on the phone so punch-ins and a raised phone never
 *  move it under the caption. */
export function BrandBug({ demo = false }) {
  return (
    <div style={{ position: "absolute", left: COLUMN.top.left, top: LAYOUT.bugTop, width: COLUMN.top.width, display: "flex",
      justifyContent: "center", alignItems: "center", gap: 14 }}>
      <Wordmark size={46} />
      <BetaPill size={28} />
      {demo && <DemoPill />}
    </div>
  );
}

/** A flat page background in the app's grey. */
export function Page({ children, style }) {
  return <div style={{ position: "absolute", inset: 0, background: BG, overflow: "hidden", ...style }}>{children}</div>;
}
