import { BG, COLUMN, LAYOUT, SANS, lighten, useInk } from "../brand/brand.js";

// The wordmark as the app's sidebar draws it (lowercase Raleway 700, tight
// tracking, the accent, a small dot after it).

export function Wordmark({ size = 40 }) {
  const ink = useInk();
  const dot = Math.round(size * 0.16);
  const gap = Math.round(size * 0.14);
  // The dot hangs outside the word's box, so centring the wordmark centres
  // the word itself, not the word plus its dot.
  return (
    <span style={{ position: "relative", display: "inline-block", fontFamily: SANS, fontWeight: 700, fontSize: size,
      letterSpacing: "-0.04em", color: ink.title, lineHeight: 1 }}>
      mentorable
      <span style={{ position: "absolute", left: `calc(100% + ${gap}px)`, top: "50%", width: dot, height: dot,
        marginTop: Math.round(size * 0.12) - dot / 2, borderRadius: "50%",
        background: `linear-gradient(135deg, ${ink.accent}, ${lighten(ink.accent, 0.35)})` }} />
    </span>
  );
}

/** The wordmark, centred at the top of every scene but the end card. */
export function BrandBug() {
  return (
    <div style={{ position: "absolute", left: COLUMN.top.left, top: LAYOUT.bugTop, width: COLUMN.top.width, textAlign: "center" }}>
      <Wordmark size={46} />
    </div>
  );
}

/** A flat page background in the app's grey. */
export function Page({ children, style }) {
  return <div style={{ position: "absolute", inset: 0, background: BG, overflow: "hidden", ...style }}>{children}</div>;
}
