---
name: Mentorable
description: A calm shell for a college application tool, with its character in pixel stamps, speech bubbles and copy.
colors:
  accent: "#1d4ed8"
  page-grey: "#F5F5F5"
  card-white: "#ffffff"
  inset-surface: "#faf9f5"
  ink: "#141413"
  ink-mid: "#3d3d3a"
  ink-muted: "#494742"
  ink-faint: "#6a6760"
  warm-border: "#e6dfd8"
  danger: "#b42318"
  error-wash: "#fdf1f0"
  amber-text: "#92400e"
  amber-wash: "#fff7e6"
  amber-line: "#f3d9a4"
  amber-edge: "#d97706"
  quest-stone: "#e6e3de"
  quest-stone-edge: "#cfcac2"
  quest-bar-navy: "rgba(38,50,112,0.9)"
  flame-deep: "#C24E00"
  flame-body: "#FF8A00"
  flame-core: "#FFD23F"
typography:
  display: { fontFamily: "Raleway, sans-serif", fontSize: "2.5rem", fontWeight: 800, lineHeight: 1.1, letterSpacing: "-0.03em" }
  headline: { fontFamily: "Raleway, sans-serif", fontSize: "1.3rem", fontWeight: 800, lineHeight: 1.3, letterSpacing: "-0.01em" }
  title: { fontFamily: "Raleway, sans-serif", fontSize: "1.1rem", fontWeight: 800, lineHeight: 1.3, letterSpacing: "-0.01em" }
  lead: { fontFamily: "Raleway, sans-serif", fontSize: "1.15rem", fontWeight: 400, lineHeight: 1.6 }
  body: { fontFamily: "Raleway, sans-serif", fontSize: "1rem", fontWeight: 600, lineHeight: 1.5 }
  body-quiet: { fontFamily: "Raleway, sans-serif", fontSize: "1rem", fontWeight: 500, lineHeight: 1.55 }
  label: { fontFamily: "Raleway, sans-serif", fontSize: "1rem", fontWeight: 700, lineHeight: 1.25 }
  chip: { fontFamily: "Raleway, sans-serif", fontSize: "0.95rem", fontWeight: 700, lineHeight: 1.2 }
  caption: { fontFamily: "Raleway, sans-serif", fontSize: "0.9rem", fontWeight: 700, lineHeight: 1.3 }
  quest-bar-title: { fontFamily: "Raleway, sans-serif", fontSize: "1.6rem", fontWeight: 800, lineHeight: 1.2, letterSpacing: "-0.02em" }
rounded:
  control: "12px"
  card: "16px"
  dialog: "20px"
  pill: "999px"
spacing:
  page-top: "2.5rem"
  page-side: "2rem"
  page-bottom: "4rem"
  page-top-mobile: "1.5rem"
  gutter-mobile: "1rem"
  page-bottom-mobile: "8.5rem"
  column: "880px"
  lead-measure: "62ch"
  header-gap: "1.6rem"
  card-pad: "1.1rem 1.2rem"
  section-card-pad: "1.3rem"
  stamp-tile: "40px"
  touch-min: "44px"
components:
  page-title: { textColor: "{colors.accent}", typography: "{typography.display}" }
  button-primary: { backgroundColor: "{colors.accent}", textColor: "{colors.card-white}", typography: "{typography.label}", rounded: "{rounded.control}", padding: "10px 18px", height: "44px" }
  button-secondary: { backgroundColor: "{colors.card-white}", textColor: "{colors.ink-mid}", typography: "{typography.label}", rounded: "{rounded.control}", padding: "10px 18px", height: "44px" }
  button-quiet: { textColor: "{colors.accent}", typography: "{typography.label}", rounded: "{rounded.control}", padding: "10px 18px", height: "44px" }
  button-danger: { backgroundColor: "{colors.card-white}", textColor: "{colors.danger}", typography: "{typography.label}", rounded: "{rounded.control}", padding: "10px 18px", height: "44px" }
  card: { backgroundColor: "{colors.card-white}", rounded: "{rounded.card}", padding: "{spacing.card-pad}" }
  section-card: { backgroundColor: "{colors.card-white}", rounded: "{rounded.card}", padding: "{spacing.section-card-pad}" }
  inset-panel: { backgroundColor: "{colors.inset-surface}", rounded: "{rounded.control}" }
  input: { backgroundColor: "{colors.card-white}", textColor: "{colors.ink}", typography: "{typography.label}", rounded: "{rounded.control}", padding: "11px 13px", height: "46px" }
  chip: { backgroundColor: "{colors.card-white}", textColor: "{colors.ink-mid}", typography: "{typography.chip}", rounded: "{rounded.pill}", padding: "0 14px", height: "44px" }
  tip-card: { backgroundColor: "{colors.card-white}", textColor: "{colors.ink}", typography: "{typography.body}", rounded: "{rounded.card}", padding: "12px 16px" }
  stamp-tile: { rounded: "{rounded.control}", size: "{spacing.stamp-tile}" }
  notice-warn: { backgroundColor: "{colors.amber-wash}", textColor: "{colors.amber-text}", rounded: "{rounded.control}", padding: "10px 12px 10px 14px" }
  quest-top-bar: { backgroundColor: "{colors.quest-bar-navy}", textColor: "{colors.card-white}", typography: "{typography.quest-bar-title}", rounded: "{rounded.dialog}" }
---

# Design System: Mentorable

## Overview

**Creative North Star: "The Calm Shell"**

A quiet, flat frame that every page shares: white cards with a 1px warm border on a light grey page, flat buttons, Raleway, and the student's own accent on the page title. All personality lives inside that frame, in the 8 by 8 and 16 by 16 pixel stamps, the game-dialog speech bubble the agent mascots speak in, and the copy. Polish should make a page look more like its siblings, never more bespoke. The source of truth is `src/components/ui/` (`tokens.js`, `tokens.base.js`, `kit.jsx`, `PixelIcons.jsx`, `SpeechBubble.jsx`); College List and Portfolio are the reference pages.

Density is moderate: one centred column, generous card padding, one idea per card. Quest is the one page with a scene; it keeps its game pieces on the same calm shell (see Intentional Exceptions).

**Key Characteristics:**
- Grey page, white cards, 1px warm border, no resting shadow.
- One accent per student, always derived through `useAgentInk()`.
- Character from pixel stamps, the speech bubble and copy, never from louder chrome.
- Raleway everywhere; nothing under 0.9rem; no text lighter than ink-muted.
- Amber means "behind". Red means an error, never lateness.

## Colors

One per-student accent over warm, near-neutral greys, plus amber for "behind".

### Primary
- **Student Accent** (default shown; real value is `profiles.profile_color`): page titles, primary fills, stamp tiles, selected chips, focus rings. Never used raw. `useAgentInk()` (`inkFor` in `tokens.base.js`) derives every use: `text` (4.5:1 on white), `title` (3:1 on the page), `button.bg` (darkened until white reads at 4.5:1; the label is always white), `soft` (accent mixed 86% to white) and `softer` (93%) tints, `onSoft` (text on `soft`), `ring` (3:1 focus ring). `textOnPage(ink)` gives accent text that passes on the grey page.

### Neutral
- **Page Grey**: every page background, painted by `pageStyle`.
- **Card White**: cards, inputs, secondary buttons, the Tip card in its default tone.
- **Inset Surface**: an inset panel inside a white card; the info Notice. (`index.css` also paints `html, body` and the Sidebar in it; pages cover it with Page Grey.)
- **Ink / Ink Mid / Ink Muted**: body text, secondary text, the lightest text allowed (hints, counts, the lead line).
- **Ink Faint**: icons and decoration only, never text.
- **Warm Border**: the 1px line on every card and control.

### Status
- **Danger** with **Error Wash** (`DANGER_BG`) and its line (`DANGER_LINE`): errors and destructive buttons only.
- **Amber Text / Amber Wash / Amber Line / Amber Edge**: "due", "waiting", missed Quest days, the catch-up banner. Amber Edge is for lines and dashed stone rings, not text.

### Named Rules
**The Accent Through Ink Rule.** The accent reaches the screen only through `useAgentInk()` (or `readableOn` / `contrastRatio` in `src/lib/theme.js`). Never hard-code a blue; `#1d4ed8` is `DEFAULT_ACCENT`, a fallback for students with no colour, not a design colour.

**The Behind Is Amber Rule.** Being behind is something to fix, not a failure: amber, never red.

## Typography

**Font:** Raleway (with sans-serif), forced on every element in `index.css`, inputs and SVG text included.

**Character:** One family carried by weight. Titles are 800, labels 700, body 500 to 600; tight negative tracking on large sizes only.

### Hierarchy
- **Display**: the page title in `PageHeader`, in `ink.title`; 2.1rem on mobile.
- **Lead**: the line or two under the title, in Ink Muted, max 62ch; 1.05rem on mobile.
- **Headline**: `Heading` level 2, section card titles beside a 40px StampTile.
- **Title**: `Heading` level 3, sub-sections inside a card or dialog.
- **Body / Body Quiet**: card and Tip text (600) and section hints (500, Ink Muted, 62ch).
- **Label / Chip**: buttons and field labels; choice-chip pills.
- **Caption**: the floor (speech-bubble name tab, small plate labels). Nothing smaller.

**The Text Floor Rule.** No text under 0.9rem and no text lighter than Ink Muted (`#494742`). Field hints at 0.92rem are the smallest body copy in the kit.

**The No Em Dash Rule.** No em dashes in user-facing copy, model prompts included.

## Layout

- **Page frame:** `pageStyle({ isMobile, sidebar, ink })` gives Page Grey, `minHeight: 100vh`, padding `2.5rem 2rem 4rem` with `calc(sidebar + 2rem)` on the left (Sidebar is 220px), and `1.5rem 1rem 8.5rem` on mobile (room for the 60px bottom nav and the floating feedback button above it). It also sets `--ag-ring` so every focus ring inside uses the accent.
- **Column:** one centred column, `maxWidth: 880`, `margin: 0 auto`.
- **Header pattern:** `PageHeader` (title, muted lead, optional action on the right, 1.6rem below), then a `Tip` immediately under it when the page has a next step or guide line (Portfolio's "Next step", College List's "Start here"). Then the content cards.
- **Rhythm:** section cards stack with about 1.25rem between them (College List uses a 22px / 18px flex gap); items inside a section are smaller control-radius cards 10px apart.
- **Mobile:** below 768px the sidebar hides and pages keep a 16px gutter, down to 320px wide. `html, body` use `overflow-x: clip` (with `hidden` first as fallback) so `position: sticky` keeps working.

## Elevation & Depth

Flat by default. Depth comes from tone (grey page, white card, Inset Surface panel, accent `softer` tint), not shadow. Only layers that float above the page carry a soft, diffuse shadow: the Toast, dialogs and sheets, and the Quest top bar (values in `.impeccable/design.json`).

**The No Hard Edge Rule.** No hard bottom-edge shadows on buttons or cards, and no raised "3D" chrome. Buttons move 1px down on press instead.

## Shapes

Gently rounded: controls and inset items 12px, cards and the Tip card 16px, dialogs and the Quest bar 20px, pills and chips fully round. Always through `RADIUS` (`card`, `control`, `pill`). Lines are 1px Warm Border; focus rings are 3px accent outlines offset 2px. The one stepped, square silhouette is pixel art: the stamps, the stones and the speech bubble's stepped corners.

## Components

### Buttons (`Button`, `LinkButton`)
Flat and steady, 44px minimum, 1rem 700 labels, 10px 18px padding, control radius.
- **Primary:** the readable accent fill, white label. Darkens slightly on hover, moves 1px down on press (`PRESS_CLASS`, off under reduced motion).
- **Secondary:** white with a Warm Border stroke and Ink Mid label. **Quiet:** text only in the page-safe accent. **Danger:** white with a Danger stroke and label.
- Quest's `Chunky` and College List's `Raised` are thin wrappers over `Button`, not separate styles.

### Cards (`Card`)
White, 1px Warm Border, card radius, `1.1rem 1.2rem` padding, no shadow. A section card (Portfolio's `SectionCard`) pads 1.3rem and opens with a 40px `StampTile` beside a `Heading`, an optional count in Ink Muted, an action on the right, and a 62ch hint.

### StampTile and PixelStamp
A pixel stamp on a control-radius tile in `ink.softer` with a `soft` border and `onSoft` stamp; unlit tiles go grey. Stamps: letter, check, clock, star, sparkle, question, peak, target, flag, scroll, chat, person, lock, and the two-tone 16px reportcard, answersheet, notebook, rocket, trophy, resume. Drawn crisp at whole pixels.

### Tip
The guide line for tips, next steps and empty states: a 40px stamp tile in `ink.soft` beside a plain card (max 640px, 12px 16px padding, card radius, body text). Tone `accent` uses `softer` with a `soft` border; tone `default` is white with Warm Border. Tip is not a speech bubble.

### SpeechBubble and MascotSays
The game dialog box: a 2px Ink frame with three-step stepped corners (clip-path), a name tab on the top edge, and a pixel wedge tail. It belongs to the agent mascots (`MascotSays` on the Finder and Outreach boards, in waiting and empty states), where the mascot sits beside or above it. The 2px frame is part of the pixel art.

### Inputs, Chips, Notice, Toast
- **Input (`inputStyle`):** white, Warm Border stroke, control radius, 46px, 3px accent outline on focus.
- **ChoiceChips:** pills, 44px tall; selected is `softer` fill, accent stroke, `onSoft` label.
- **Notice:** control radius, tones info (Inset Surface), success (accent `softer`), warn (amber), error (Error Wash).
- **Toast:** a Notice fixed above the mobile nav, white, the one kit piece with a shadow.
- **Dialogs:** the kit `Sheet` (`src/components/ui/Sheet.jsx`, exported from `kit.jsx`; the old `agents/outreach/Sheet.jsx` path re-exports it): a bottom sheet on phones, a centred 20px white card on wider screens, focus trapped and returned.
- **ChoiceChips** also does several-at-once (`multi`) and a label above the pills (`labelAbove`) for form fields. **RemoveButton** is the one "× Remove" control (`iconOnly` on tight cards). **Toast** draws Undo and owns its Ctrl/Cmd+Z when the notice carries `undo`.

### Navigation
Sidebar (220px) and MobileNav (60px bottom bar). Both predate the kit: active items use the raw accent. MobileNav labels and the streak badge are at the 0.9rem floor in Ink Muted; below 360px only the active tab shows its label (the rest stay readable to screen readers). Known drift otherwise, not a reference.

### Intentional Exceptions: Quest's game pieces
These are deliberate and must not be scored as inconsistency:
- **Navy glass top bar** (`QuestPanels.jsx` `TopBar`, commit 3e51196): Quest Bar Navy at 0.9 alpha, white title, 20px radius, backdrop blur, soft shadow, sticky over the scene.
- **The sky scene** (`SkyBackdrop.jsx`, commit 2f3e032): beach to space, drawn smooth with gradients, gently animated, still under reduced motion. Its blues and other illustration colours are not UI colour and are exempt from the Accent Through Ink Rule.
- **Pixel stones and milestone flags**: stepped 4px-grid discs with a one-pixel-row edge, in the accent when done, Quest Stone when ahead, amber dashed when missed; milestone plates use a flag StampTile.
- **The streak flame**: real fire colours (Flame Deep, Body, Core), never the accent, since a blue flame reads as a drop; a sticker below `FLAME_GROWS_AT` (7 days), a three-tongue campfire from then on.

## Do's and Don'ts

### Do:
- **Do** build every page from `pageStyle`, an 880px column, `PageHeader`, `Tip`, `Card`, `StampTile` + `Heading`, and kit `Button`s.
- **Do** take every accent colour from `useAgentInk()` and every radius from `RADIUS`.
- **Do** keep touch targets at 44px and every motion still under `prefers-reduced-motion`.
- **Do** put character in a pixel stamp, the Tip line or the copy when a page feels flat.

### Don't:
- **Don't** define per-file colour constants or literal hexes (`INK`, `MID`, `LINE`, `STONE`, `#f3f1ed`, `#f1f1ef`); import tokens.
- **Don't** hand-roll buttons, chips, inputs, toasts or modals when a kit piece or `Sheet` exists.
- **Don't** put 1.5px borders on cards, plates or hand-rolled controls; cards are 1px. The 1.5px strokes inside kit `Button`, `inputStyle` and `ChoiceChips` are the kit's own and stay.
- **Don't** write literal radii (`borderRadius: 12`, `99`, `7`); use `RADIUS`.
- **Don't** add hard bottom-edge shadows, resting card shadows or 2px borders (focus rings and the speech-bubble frame excepted).
- **Don't** hard-code a blue, use red for lateness, or set text under 0.9rem or lighter than `#494742`.
