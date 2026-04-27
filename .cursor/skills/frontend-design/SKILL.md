---
name: frontend-design
description: Creates distinctive, production-grade web interfaces (components, pages, apps) with bold aesthetic direction, refined typography, motion, and layout—while avoiding generic AI visual tropes. Use when building or redesigning frontend UIs, landing pages, dashboards, or any interface where design quality and memorability matter.
license: Complete terms in LICENSE.txt
---

# Frontend design

Implements real working code with exceptional attention to aesthetic detail. Each output should feel **intentional**, not default.

## Inputs

The user may specify a component, page, application, or full interface, plus purpose, audience, and technical constraints. Infer missing context only when it stays aligned with their goals.

## Design thinking (do this before coding)

1. **Purpose** — What problem does the UI solve? Who uses it?
2. **Tone** — Commit to a clear direction: e.g. brutally minimal, maximalist, retro-futuristic, organic, luxury, playful, editorial, brutalist, art deco, soft/pastel, industrial. Treat these as inspiration; the actual direction should be specific to the product.
3. **Constraints** — Framework, performance targets, accessibility (WCAG) requirements, and brand rules if any.
4. **Differentiation** — What is the one memorable thing? (Layout? Type? Motion? A single color story?)

**Critical:** Intentionality beats “loudness.” Maximal and minimal are both valid when executed with precision.

Then ship production-grade, functional UI (HTML/CSS/JS, React, Vue, etc.) that is:

- Cohesive and memorable
- Visually striking without relying on clichés
- Refined in spacing, hierarchy, and states (hover, focus, loading, empty)

## Aesthetic guidelines

| Area | Direction |
|------|------------|
| **Typography** | Distinctive display + refined body. Avoid overused “AI default” stacks; vary choices across projects—do not repeat the same pairing every time. |
| **Color** | Cohesive system via CSS custom properties. Prefer a dominant story with sharp accents over flat, evenly weighted palettes. |
| **Motion** | CSS-first where possible; React: Motion/Framer Motion when it fits. Prefer one strong orchestrated moment (e.g. staggered page load) over many tiny unconnected twitches. Scroll-linked and hover surprises are fair game when they match the tone. |
| **Layout** | Bias toward interesting composition: asymmetry, overlap, diagonal flow, grid-breaking, generous negative space *or* controlled density—match the concept. |
| **Backgrounds & surface** | Atmosphere over flat solids when appropriate: gradients, grain/noise, mesh, patterns, layered transparency, strong shadows, borders, cursors, textures—tied to the chosen aesthetic, not generic decoration. |

## Anti-patterns (avoid)

- Tired “AI” defaults: Inter/Roboto/Arial as the automatic choice, purple-on-white hero clichés, identical card stacks every time, meaningless glassmorphism without concept.
- Converging on the same “safe” display font (e.g. always Space Grotesk) across deliverables.
- One-size-fits-all light theme or the same dark template.

## Execution depth

- **Maximalist / expressive** — Elaborate structure, rich motion, layered visuals; still organized and performant.
- **Minimal / refined** — Restraint, typographic and spacing precision, subtle motion; no empty minimalism (every decision earns its place).

**Accessibility:** Favor real focus styles, sufficient contrast for text and interactive elements, and reduced-motion respect (`prefers-reduced-motion`) when animations are central.

Remember: prefer unexpected, context-appropriate choices over brand-neutral boilerplate. Vary themes, type, and layout patterns between requests so work does not all look the same. Commit fully to the chosen direction—this is a chance to show what careful, opinionated design can do when the usual defaults are rejected.
