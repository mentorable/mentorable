import { C, GUTTER, SANS, TYPE, go, scrollToId, useMedia } from "../kit.js";
import { LpButton, TextLink } from "../frames.jsx";
import { HERO_IMAGES } from "../data.js";

// The hero photo (one <img> with its srcset, fetchpriority high and intrinsic
// size, never tinted or veiled) and, beside it, the copy every hero option
// shares, so the owner compares composition, not words: the signpost line,
// the h1, the subline, the two actions and the caption.

/** The photo for hero `which` ("a" dusk, "b" day, "c" shore). `position` is
 *  its object-position; `sizes` the srcset hint for this layout. */
export default function HeroImage({ which = "a", sizes = "100vw", position = "50% 100%", style }) {
  const img = HERO_IMAGES[which] || HERO_IMAGES.a;
  return (
    <img
      src={`${img.base}-1200.jpg`}
      srcSet={`${img.base}-1200.jpg 1200w, ${img.base}-2400.jpg 2400w`}
      sizes={sizes}
      alt=""
      fetchPriority="high"
      decoding="async"
      width={img.w}
      height={img.h}
      style={{ display: "block", width: "100%", height: "100%", objectFit: "cover", objectPosition: position, ...style }}
    />
  );
}

export const HERO_COPY = {
  kicker: "Free for US high school students",
  lead: "Expert guidance",
  accent: "for every student.",
  sub: "Mentorable keeps your grades, scores, activities and college list in one record, and an advisor reads all of it before it answers. The kind of help private counselors charge for, free.",
  primary: "Get started",
  secondary: "See how it works",
};

/** The signpost line: an 8px accent square, then the line in ink. */
export function HeroKicker({ style }) {
  return (
    <p style={{ fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700, color: C.ink, margin: 0, display: "flex",
      alignItems: "center", gap: 10, lineHeight: 1.3, ...style }}>
      <span aria-hidden="true" style={{ width: 8, height: 8, background: C.accent, flexShrink: 0 }} />
      {HERO_COPY.kicker}
    </p>
  );
}

// The whole headline on one line, as wide as the container allows: it
// measures 15.35 times its font size in Raleway 700, so dividing the
// container's width by 15.8 leaves it a little room.
const LINE_SIZE = `clamp(2.5rem, calc((100vw - 2 * ${GUTTER}) / 15.8), 5.25rem)`;

/** The h1, "for every student." in `accent`. `line`: one line across the
 *  container from 1100px up (and balanced lines below it); otherwise a line
 *  break before the accent from 900px up. */
export function HeroTitle({ accent = C.accent, id = "lp-hero-title", line = false, style }) {
  const wide = useMedia("(min-width: 900px)");
  const across = useMedia("(min-width: 1100px)") && line;
  return (
    <h1 id={id} style={{ ...TYPE.h1, ...(across ? { fontSize: LINE_SIZE, whiteSpace: "nowrap", lineHeight: 1.08 } : null), ...style }}>
      {HERO_COPY.lead}
      {wide && !line ? <br /> : " "}
      <span style={{ color: accent }}>{HERO_COPY.accent}</span>
    </h1>
  );
}

/** The subline, in the body style; each hero sets its own size and width. */
export function HeroSub({ style }) {
  return <p style={{ ...TYPE.body, ...style }}>{HERO_COPY.sub}</p>;
}

/** "Get started" and "See how it works": a text link with a down arrow, or a
 *  secondary button on the photo (`secondary`). `stacked` fills the column;
 *  `size` is the LpButton size ("lg", or "sm" where the sky is narrow). */
export function HeroActions({ secondary = false, stacked = false, size = "lg", style }) {
  return (
    <div style={{ display: "flex", flexDirection: stacked ? "column" : "row", alignItems: stacked ? "stretch" : "center",
      gap: 16, flexWrap: "wrap", ...style }}>
      <LpButton kind="primary" size={size} onClick={() => go("/auth")}>{HERO_COPY.primary}</LpButton>
      {secondary ? (
        <LpButton kind="secondary" size={size} onClick={() => scrollToId("record")}>{HERO_COPY.secondary}</LpButton>
      ) : (
        <TextLink arrow="down" onClick={() => scrollToId("record")} style={stacked ? { justifyContent: "center" } : undefined}>
          {HERO_COPY.secondary}
        </TextLink>
      )}
    </div>
  );
}

/** The caption under a plate: a muted lead, then the bold phrase in ink. */
export function HeroCaption({ lead, bold, style }) {
  return (
    <p style={{ ...TYPE.caption, marginTop: 14, ...style }}>
      {lead} <strong style={{ color: C.ink, fontWeight: 700 }}>{bold}</strong>
    </p>
  );
}
