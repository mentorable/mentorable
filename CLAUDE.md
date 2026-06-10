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

**Mentorable** is a React 19 SPA (Vite) backed by Supabase (Postgres + Auth) and a **Python + LangGraph service on Railway** (the agentic backend), deployed on Vercel. All fonts are **Space Grotesk** (primary, headings, labels, body, buttons everywhere). No component library — all styling is inline styles.

The agentic backend (chat, research, quest generation, onboarding extraction) lives in `langgraph-service/` (FastAPI). The Anthropic key lives only there. The frontend reaches it via `VITE_LANGGRAPH_CHAT_URL` (one base URL reused for all four endpoints). A handful of non-AI edge functions remain in Supabase. See `.claude/LANGGRAPH_MIGRATION.md` for the migration history.

### Frontend (React SPA)

- `main.jsx` → `App.jsx` — root router. `AppShell` wraps all logged-in routes with `Sidebar` (desktop) or `MobileNav` (mobile). `useIsMobile` hook drives layout throughout.
- Pages at root: `LandingPage`, `AuthPage`, `OnboardingPage`, `ScorecardPage`, `ChatPage`, `ResearchPage`, `ProfilePage`, `RoadmapPage`.
- `components/common/` — `Sidebar`, `MobileNav`, `Drawer`, `Spinner`, `ErrorBoundary`, `VoicePoweredOrb`, `LimitModal`.
- `lib/`:
  - `supabase.js` — single Supabase client (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)
  - `mentora.js` — `streamChatResponse` (SSE from LangGraph `/chat`) and `extractProfile` (LangGraph `/onboarding/extract`). The chat system prompt is built **server-side** now.
  - `usage.js` — fetches lifetime usage counts from `usage_tracking`; exports `LIMITS` constants
  - `onet.js` — calls `onet-proxy` edge function
  - `retry.js` — `withRetry` utility
  - `cache.js` — stale-while-revalidate in-memory cache

### Pages

**LandingPage** — cinematic scroll-driven marketing page. Mountain hero image (`/public/hero-mountains.png`), shimmer headline, 4 feature sections (laptop mockup, radar chart, phone mockup, chat window), newsletter, footer. Uses framer-motion throughout.

**OnboardingPage** — voice onboarding via `@elevenlabs/react` (`useConversation`). Max 360s call. After call ends, calls LangGraph `POST /onboarding/extract` (via `extractProfile`) → structured profile, then redirects to `/quest`.

**ChatPage** — streams `claude-sonnet-4-6` responses via LangGraph `POST /chat` (SSE). System prompt is built server-side. Mentora can add quests to the board via the `add_quest_to_board` tool (emits a `quest_added` SSE event → toast). Shows inline "X messages remaining" counter; `LimitModal` on 429 `LIMIT_REACHED`.

**ResearchPage** — calls LangGraph `POST /research` (Brave Search + Claude synthesis). Shows inline "X queries remaining" counter. `LimitModal` on limit hit. Sessions stored in `research_sessions`.

**RoadmapPage** — the live **Quest Kanban board** (over `quest_items`), not a roadmap. Columns: Suggestions → Considered → In Progress → Completed. Items generated via LangGraph `POST /quests/generate`; status changes via `update-quest-item` edge function. Desktop: drag-and-drop + trash zone. Mobile: tab switcher + "Move to" dropdown. Shows "X generations remaining" counter near the generate button.

**ScorecardPage** — displays the 5-axis skill radar from `profiles.strengths` + career matches.

**ProfilePage** — editable profile fields, agent instructions, response style.

### LangGraph Service (`langgraph-service/`)

Python + FastAPI on Railway. Holds the Anthropic key. JWT-authed (`verify_jwt` validates the Supabase token). Chat uses an `AsyncPostgresSaver` checkpointer; `load_context` re-fetches from Supabase on every request, so state is just an assembled view. Cross-feature memory: research findings (`profiles.research_findings`) flow into chat context and quest generation; chat signals (`profiles.chat_signals`) persist across sessions via a Haiku background task.

| Endpoint | Purpose | Calls |
|---|---|---|
| `POST /chat` | Streams Sonnet 4.6 (SSE), tool-use loop for `add_quest_to_board`. Rate-limited: 15/lifetime | Anthropic |
| `POST /research` | Brave Search → page fetch → Sonnet synthesis. Rate-limited: 3/lifetime | Brave, Anthropic |
| `POST /quests/generate` | 1–5 quest suggestions from profile + research findings. Rate-limited: 3/lifetime | Anthropic |
| `POST /onboarding/extract` | ElevenLabs transcript → 17-field profile (Haiku sufficiency check + Sonnet extraction) | Anthropic |
| `GET /health`, `GET /profile` | Health + profile probes | — |

### Supabase Edge Functions (`supabase/functions/`)

Only non-AI functions remain (Deno/TypeScript):

| Function | Purpose | Calls |
|---|---|---|
| `update-quest-item` | Updates quest item status (move/complete/delete) | — |
| `onet-proxy` | Proxies O*NET My Next Move API with auth (uses `_shared/onet.ts` `mnmSearch()`) | O*NET |
| `delete-account` | Full cascade user deletion | Supabase Admin |

> `extract-profile` is still deployed as a temporary rollback net while onboarding-via-LangGraph is monitored; retire it once verified.

### Database (Supabase Postgres)

Key tables:
- `profiles` — 20+ fields from voice onboarding (strengths, interests, career_matches, work_style, agent_instructions, etc.); plus `research_findings` and `chat_signals` JSONB for cross-feature memory
- `quest_items` — standalone quests with status (`suggested`/`considered`/`in_progress`/`completed`/`deleted`), difficulty, why_it_matters
- `chat_sessions` — full message history (JSONB), title, timestamps
- `research_sessions` — query + results (JSONB) + 7-day cache
- `usage_tracking` — lifetime usage counters (chat_messages_used, research_queries_used, quest_generations_used)
- `waitlist` — emails for paid plan interest

RLS is enabled on all tables (`auth.uid() = user_id`).

The phase-based roadmap (`quests`/`quest_phases`/`quest_tasks`/`confidence_history`) was removed. `20260607_drop_roadmap.sql` drops those dead tables + the `roadmap_*` profile columns — apply with `supabase db push`.

### Rate Limits (Demo)

Lifetime caps enforced via `check_and_increment_usage` Postgres RPC (atomic check + increment):
- Chat: **15 messages**
- Research: **3 queries**
- Quest generation: **3 generations**

Dev bypass: accounts in the `dev_emails` array inside `check_and_increment_usage` (currently `app.mentora.ai@gmail.com`) get `allowed: true` with no counter increment.

When a limit is hit, the LangGraph endpoints return `429 { error: 'LIMIT_REACHED' }`. The frontend shows `LimitModal` with a waitlist email capture.

### Environment Variables

Client (`.env.local`):
```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_ELEVENLABS_AGENT_ID
VITE_LANGGRAPH_CHAT_URL     # base URL of the Railway LangGraph service (required)
```

LangGraph service (Railway):
```
SUPABASE_URL
SUPABASE_ANON_KEY           # for JWT verification
SUPABASE_SERVICE_ROLE_KEY   # for check_and_increment_usage RPC + DB writes
ANTHROPIC_API_KEY
BRAVE_API_KEY
DATABASE_URL                # Supabase session pooler (IPv4) for the checkpointer
CORS_ORIGIN                 # comma-separated allowed origins
DEV_BYPASS_EMAILS           # comma-separated, e.g. app.mentora.ai@gmail.com
```

### Deployment

- Frontend → Vercel. `vercel.json` rewrites all routes to `index.html`.
- LangGraph service → Railway (auto-deploys on push to `main`).
- Remaining edge functions → Supabase (`supabase functions deploy <name>`).
- DB migrations → `supabase db push`.

---

## Design System

- **Fonts:** Space Grotesk everywhere (switched from Plus Jakarta Sans for body text)
- **Background:** `#f5f1ed` (Claude light creme) throughout
- **Primary blue:** `#1d4ed8` with `#60a5fa` accents
- **No component library** — inline styles with per-file token constants (`SANS`, `BODY`, `P`, `BG`, `FG`, `MUT`, etc.)
- Tailwind v4 available but used minimally
