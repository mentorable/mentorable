# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start Vite dev server (localhost:5173)
npm run build      # Production build → dist/
npm run preview    # Preview the production build
```

No test suite is configured. No lint script — Vite handles type/syntax errors at build time.

Deploy edge functions (Deno/Supabase):
```bash
supabase functions deploy <function-name>
supabase db push   # apply pending migrations
```

## Architecture

**Mentorable** is a React 19 SPA (Vite) backed by Supabase (Postgres + Auth + Edge Functions) and deployed on Vercel. All fonts are **Space Grotesk** (primary, headings, labels, body, buttons everywhere). No component library — all styling is inline styles.

### Frontend (React SPA)

- `main.jsx` → `App.jsx` — root router. `AppShell` wraps all logged-in routes with `Sidebar` (desktop) or `MobileNav` (mobile). `useIsMobile` hook drives layout throughout.
- Pages at root: `LandingPage`, `AuthPage`, `OnboardingPage`, `ScorecardPage`, `ChatPage`, `ResearchPage`, `ProfilePage`, `RoadmapPage`.
- `components/common/` — `Sidebar`, `MobileNav`, `Drawer`, `Spinner`, `ErrorBoundary`, `VoicePoweredOrb`, `LimitModal`.
- `lib/`:
  - `supabase.js` — single Supabase client (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)
  - `mentora.js` — builds AI system prompt from user profile + streams chat via `chat` edge function (SSE)
  - `usage.js` — fetches lifetime usage counts from `usage_tracking`; exports `LIMITS` constants
  - `onet.js` — calls `onet-proxy` edge function
  - `retry.js` — `withRetry` utility
  - `cache.js` — stale-while-revalidate in-memory cache

### Pages

**LandingPage** — cinematic scroll-driven marketing page. Mountain hero image (`/public/hero-mountains.png`), shimmer headline, 4 feature sections (laptop mockup, radar chart, phone mockup, chat window), newsletter, footer. Uses framer-motion throughout.

**OnboardingPage** — voice onboarding via `@elevenlabs/react` (`useConversation`). Max 360s call. After call ends, calls `extract-profile` edge function → structured profile. Then calls `initialize-roadmap`.

**ChatPage** — streams responses from `claude-sonnet-4-6` via `chat` edge function (SSE). System prompt built client-side in `lib/mentora.js` from profile + quest history + research queries + annotations. Shows inline "X messages remaining" counter. `LimitModal` on 429 `LIMIT_REACHED`.

**ResearchPage** — calls `run-research` edge function (Brave Search + Claude synthesis). Shows inline "X queries remaining" counter. `LimitModal` on limit hit. Sessions stored in `research_sessions`.

**RoadmapPage** — Kanban board: Suggestions → Considered → In Progress → Completed. Quest items generated via `generate-quest-items`. Desktop: drag-and-drop + trash zone. Mobile: tab switcher + "Move to" dropdown. Shows "X generations remaining" counter near generate button.

**ScorecardPage** — displays the 5-axis skill radar from `profiles.strengths` + career matches.

**ProfilePage** — editable profile fields, agent instructions, response style.

### Supabase Edge Functions (`supabase/functions/`)

All Deno/TypeScript. Anthropic API key never touches the client.

| Function | Purpose | Calls |
|---|---|---|
| `chat` | Streams Claude Sonnet 4.6 responses (SSE). Rate-limited: 15/lifetime | Anthropic |
| `run-research` | Brave Search → page fetch → Claude synthesis. Rate-limited: 3/lifetime | Brave, Anthropic |
| `extract-profile` | Parses ElevenLabs transcript → 17-field structured profile (Haiku sufficiency check + Sonnet extraction) | Anthropic |
| `generate-quest-items` | Generates 1–5 quest suggestions from profile + history. Rate-limited: 3/lifetime | Anthropic |
| `generate-phase` | Generates a 2-week roadmap phase (6–8 tasks) with O*NET + programs context | Anthropic, O*NET |
| `initialize-roadmap` | Creates first active roadmap, delegates to `generate-phase` | — |
| `regenerate-roadmap` | Synthesizes new direction from chat/research history, rebuilds roadmap | Anthropic |
| `complete-task` | Marks phase task complete/flagged, updates confidence score | — |
| `update-quest-item` | Updates quest item status (move/complete/delete) | — |
| `onet-proxy` | Proxies O*NET My Next Move API with auth | O*NET |
| `delete-account` | Full cascade user deletion | Supabase Admin |

Shared utilities in `supabase/functions/_shared/`:
- `onet.ts` — `mnmSearch()` wrapper with rate limit handling
- `programs.ts` + `programs.json` — curated opportunities dataset (summer programs, courses, internships, scholarships) injected into phase generation

### Database (Supabase Postgres)

Key tables:
- `profiles` — 20+ fields from voice onboarding (strengths, interests, career_matches, work_style, agent_instructions, etc.)
- `quest_items` — standalone quests with status (`suggested`/`considered`/`in_progress`/`completed`/`deleted`), difficulty, why_it_matters
- `quests` — roadmap metadata (mode, career_direction, confidence_score)
- `quest_phases` / `quest_tasks` — structured roadmap phases and tasks
- `chat_sessions` — full message history (JSONB), title, timestamps
- `research_sessions` — query + results (JSONB) + 7-day cache
- `confidence_history` — score change log
- `usage_tracking` — lifetime usage counters (chat_messages_used, research_queries_used, quest_generations_used)
- `waitlist` — emails for paid plan interest

RLS is enabled on all tables (`auth.uid() = user_id`).

### Rate Limits (Demo)

Lifetime caps enforced via `check_and_increment_usage` Postgres RPC (atomic check + increment):
- Chat: **15 messages**
- Research: **3 queries**
- Quest generation: **3 generations**

Dev bypass: accounts in the `dev_emails` array inside `check_and_increment_usage` (currently `app.mentora.ai@gmail.com`) get `allowed: true` with no counter increment.

When a limit is hit, edge functions return `429 { error: 'LIMIT_REACHED' }`. The frontend shows `LimitModal` with a waitlist email capture.

### Environment Variables

Client (`.env.local`):
```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_ELEVENLABS_AGENT_ID
```

Edge Functions (Supabase secrets):
```
ANTHROPIC_API_KEY
BRAVE_API_KEY
CORS_ORIGIN
SUPABASE_SERVICE_ROLE_KEY   # for check_and_increment_usage RPC
```

### Deployment

- Frontend → Vercel. `vercel.json` rewrites all routes to `index.html`.
- Edge functions → Supabase (`supabase functions deploy <name>`).
- DB migrations → `supabase db push`.

---

## Upcoming: LangGraph Migration

The agentic backend is being migrated from disconnected Supabase edge functions to a Python + LangGraph service on Railway. See `.claude/LANGGRAPH_MIGRATION.md` for the full plan.

**TL;DR:** Chat, Research, and Quest graphs share a `StudentState` backed by Supabase Postgres. Research findings automatically flow into quest generation and chat context. System prompt moves server-side. Token spend drops ~35–45%. Parallel deployment with feature flags — no big-bang cutover.

The 4 edge functions that will remain after migration: `delete-account`, `onet-proxy`, `update-quest-item`, `complete-task`.

---

## Design System

- **Fonts:** Space Grotesk everywhere (switched from Plus Jakarta Sans for body text)
- **Background:** `#f5f1ed` (Claude light creme) throughout
- **Primary blue:** `#1d4ed8` with `#60a5fa` accents
- **No component library** — inline styles with per-file token constants (`SANS`, `BODY`, `P`, `BG`, `FG`, `MUT`, etc.)
- Tailwind v4 available but used minimally
