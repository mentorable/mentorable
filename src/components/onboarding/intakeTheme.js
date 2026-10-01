// Onboarding's design tokens, now a thin layer over the app's shared kit
// (src/components/ui). The flow used to carry its own blue world; everything
// here maps onto the calm shell instead: #F5F5F5 page, white cards with 1px
// warm borders, Raleway, and the student's accent only through `useIntakeInk`
// (a brand-new student gets ThemeContext's default accent).

import {
  AMBER_BG, AMBER_TEXT, BG, BORDER, DANGER, FOCUS_CLASS, PRESS_CLASS, RADIUS, SANS, SURFACE, TEXT,
  TEXT_FAINT, TEXT_MID, TEXT_MUTED, WHITE, ringVar, useAgentInk,
} from "../ui/tokens.js";
import { INPUT_CLASS, inputStyle } from "../ui/kit.jsx";

export {
  AMBER_BG, AMBER_TEXT, BG, BORDER, DANGER, FOCUS_CLASS, INPUT_CLASS, PRESS_CLASS, RADIUS, SANS, SURFACE, TEXT,
  TEXT_FAINT, TEXT_MID, TEXT_MUTED, WHITE, inputStyle, ringVar,
};

/** Every accent-derived colour the flow needs, all readable (see tokens.js `inkFor`). */
export const useIntakeInk = useAgentInk;

/** The page headline: the accent as large text on the grey page, like every
 *  other page title. No eyebrow label above it any more. */
export const titleStyle = (ink, isMobile) => ({
  fontFamily: SANS, fontWeight: 800, fontSize: isMobile ? "2.1rem" : "2.5rem", color: ink.title,
  letterSpacing: "-0.03em", lineHeight: 1.1, margin: "0 0 0.6rem",
});

/** The line or two under a headline. */
export const subtitleStyle = (isMobile) => ({
  fontFamily: SANS, fontSize: isMobile ? "1.05rem" : "1.15rem", color: TEXT_MUTED,
  lineHeight: 1.6, margin: 0,
});

/** A field's label: the kit's FieldLabel look. */
export const labelStyle = {
  fontFamily: SANS, fontSize: "1rem", fontWeight: 700, color: TEXT, display: "block", marginBottom: 8,
};

/** A small label above an input inside a nested card (the review screen). */
export const miniLabelStyle = {
  fontFamily: SANS, fontSize: "0.92rem", fontWeight: 700, color: TEXT_MID, display: "block", marginBottom: 5,
};

/** A pill choice: outlined when off, a soft accent tint when chosen. */
export const pillStyle = (ink, on) => ({
  fontFamily: SANS, fontSize: "1rem", fontWeight: 700, cursor: "pointer", borderRadius: RADIUS.pill,
  padding: "0 18px", minHeight: 44, lineHeight: 1.2, boxSizing: "border-box",
  border: `1.5px solid ${on ? ink.text : BORDER}`, background: on ? ink.softer : WHITE,
  color: on ? ink.onSoft : TEXT_MID,
});

/** A small square choice (a score, a grade): the accent fill when chosen. */
export const squareChoiceStyle = (ink, on, size = 40) => ({
  width: size, height: size, borderRadius: 10, cursor: "pointer", flexShrink: 0,
  fontFamily: SANS, fontWeight: 700, fontSize: "0.95rem", boxSizing: "border-box",
  border: `1.5px solid ${on ? ink.button.bg : BORDER}`,
  background: on ? ink.button.bg : WHITE, color: on ? ink.button.fg : TEXT_MID,
});
