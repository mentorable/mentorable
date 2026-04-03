# Development Rules

## Core Principles

1. **Keep it simple**

   * Prefer straightforward solutions over complex ones.
   * Avoid overengineering.

2. **Build for clarity**

   * Code should be easy to read, debug, and extend.
   * Prioritize maintainability over cleverness.

3. **Be consistent**

   * Follow consistent patterns across components, styles, and APIs.
   * Reuse existing solutions instead of creating new ones.

4. **Ship working features**

   * Prioritize functionality and stability.
   * Avoid leaving partially implemented features.

---

## Frontend Rules (React + TypeScript)

### Structure

* Use **functional components only**
* Keep components:

  * Small
  * Focused
  * Reusable
* Extract logic into hooks when appropriate

### TypeScript

* Use strict typing — avoid `any`
* Define clear interfaces/types for:

  * Props
  * API responses
  * State

### State Management

* Keep state local when possible
* Avoid unnecessary global state
* Prevent deeply nested prop drilling (use hooks or context if needed)

---

## Styling Rules (Tailwind CSS)

* Use **Tailwind as the primary styling system**
* Avoid inline styles unless needed for:

  * Dynamic values
  * Complex visual effects

### Best Practices

* Follow consistent spacing scale (`p-4`, `gap-6`, etc.)
* Use `flex` and `grid` for layout
* Group classes logically:

  * Layout → spacing → typography → color

### Avoid

* Arbitrary values unless necessary
* Messy or duplicated class lists

---

## Typography & Design

* Use:

  * **Plus Jakarta Sans** for headings
  * **Geist** for body text

* Maintain:

  * Clear hierarchy
  * Consistent font sizes and weights
  * Readable line heights

---

## Animation (Framer Motion)

* Use animations **intentionally**, not excessively

* Prefer:

  * Smooth transitions
  * Subtle motion

* Avoid:

  * Distracting or heavy animations
  * Performance-heavy effects

---

## Charts & Visualization

* Use **pure SVG only**
* Do NOT use chart libraries

### Rules

* Keep charts:

  * Clean
  * Accurate
  * Responsive

---

## Backend Rules (Supabase)

### Database

* Use **Row Level Security (RLS)** on all tables
* Never expose sensitive data to the client

### Queries

* Keep queries efficient and minimal
* Avoid unnecessary repeated calls

### Auth

* Use Supabase Auth correctly
* Always validate user state before accessing data

---

## API & AI Integration

### Claude API (via Edge Functions)

* All AI calls must go through **Supabase Edge Functions**
* Never call Claude directly from the frontend

### Output Handling

* Expect structured responses (JSON)
* Always:

  * Validate responses
  * Handle missing/invalid fields

### Error Handling

* Never expose raw errors to users
* Always fail gracefully with fallback behavior

---

## Edge Functions (Deno)

* Keep functions:

  * Small
  * Focused
  * Stateless

* Validate:

  * Input data
  * Output format

* Handle errors cleanly and return safe responses

---

## Voice Integration (ElevenLabs)

* Ensure:

  * Conversations complete without breaking
  * Transcripts are always captured

* Always:

  * Send transcript to backend
  * Handle failed or incomplete sessions gracefully

---

## Performance

* Minimize unnecessary renders
* Avoid large component trees
* Optimize API usage

### Ensure:

* Fast load times
* Smooth interactions
* No UI blocking

---

## Code Quality

* Keep files clean and organized
* Use clear naming conventions
* Remove unused code

### Always:

* Refactor when needed
* Avoid duplication

---

## Error Handling

* Handle all edge cases gracefully
* Provide safe fallbacks
* Never leave the UI in a broken state

---

## Definition of Done

A feature is complete when:

* It works end-to-end
* It is type-safe
* It is visually consistent
* It handles errors properly
* It does not break existing functionality

---

