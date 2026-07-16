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

**Mentorable** is a React 19 SPA (Vite) backed by Supabase (Postgres + Auth) and a **Python + LangGraph service on Railway** (the agentic backend), deployed on Vercel. All fonts are **Raleway** (primary, headings, labels, body, buttons everywhere). No component library — all styling is inline styles.

The agentic backend (chat, research, quest generation, onboarding extraction) lives in `langgraph-service/` (FastAPI). The Anthropic key lives only there. The frontend reaches it via `VITE_LANGGRAPH_CHAT_URL` (one base URL reused for all four endpoints). A handful of non-AI edge functions remain in Supabase. See `.claude/LANGGRAPH_MIGRATION.md` for the migration history.

### Frontend (React SPA)

- `main.jsx` → `App.jsx` — root router. `AppShell` wraps all logged-in routes with `Sidebar` (desktop) or `MobileNav` (mobile). `useIsMobile` hook drives layout throughout.
- Pages at root: `LandingPage`, `AuthPage`, `OnboardingPage`, `ScorecardPage`, `ChatPage`, `ResearchPage`, `ProfilePage`, `QuestPage`.
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

**OnboardingPage** — voice onboarding via `@elevenlabs/react` (`useConversation`). Max 180s call (3-min cap; the agent prompt lives on the ElevenLabs dashboard). After call ends, calls LangGraph `POST /onboarding/extract` (via `extractProfile`) → structured profile (incl. initial `axis_scores` + seeded `living_profile`), then redirects to `/scorecard` (first-timers). Login routing: onboarded users land on `/scorecard`.

**ChatPage** — streams `claude-sonnet-4-6` responses via LangGraph `POST /chat` (SSE). System prompt is built server-side. Mentora can add quests to the board via the `add_quest_to_board` tool (emits a `quest_added` SSE event → toast). Shows inline "X messages remaining" counter; `LimitModal` on 429 `LIMIT_REACHED`.

**ResearchPage** — calls LangGraph `POST /research` (Brave Search + Claude synthesis). Shows inline "X queries remaining" counter. `LimitModal` on limit hit. Sessions stored in `research_sessions`.

**QuestPage** (`QuestPage.jsx`, route `/quest`) — the **Quest Kanban board** (over `quest_items`). Columns: Suggestions → Considered → In Progress → Completed. Items generated via LangGraph `POST /quests/generate`; status changes via `update-quest-item` edge function. Clicking a card opens a detail modal. Completing awards axis points (+N toast with **Undo**). Roadmap-promoted cards show a "Roadmap" badge. Desktop: drag-and-drop + trash zone. Mobile: tab switcher + "Move to" dropdown.

**ScorecardPage** — the gamified home/dashboard. A standardized **5-axis radar** (Communication, Leadership, Technicality, Resourcefulness, Execution) over `profiles.axis_scores`, a **Career Readiness %** ring (axis average), and a "where you are now" strip (`living_profile` current_focus + momentum). Clicking a weak axis → `POST /scorecard/improve` generates 3 axis-tagged quest suggestions to add to the board. One-time welcome popup post-onboarding (`scorecard_intro_seen`).

**RoadmapPage** (`RoadmapPage.jsx`, route `/roadmap`; node detail at `/roadmap/node/:id`) — **phase-by-phase (v3)** structured guidance. Goal-capture entry (goal + target end-month, ≤2yr) → ≤3 intake questions → `POST /roadmap/generate` returns a one-time **broad phase OUTLINE** (the stages a student moves through, each with per-month concept focuses), shown once on a reveal screen. Then phases are materialized **one at a time** (`POST /roadmap/phase/generate`, auto-fired for Phase 1): the ongoing page is a **phase tracker** (completed phases collapsed with a readiness score, the active phase expanded into its nodes, locked phases greyed). Opening a node → `POST /roadmap/node/expand` (Brave + curation) fills references + an inline-cited overview **+ a checklist** (`RoadmapNodePage`); checking tasks (via `toggle-roadmap-task`) nudges the scorecard, node auto-completes when all tasks are checked (no quest promotion in v3). "Complete phase & continue" requires a **reflection** (`POST /roadmap/phase/complete`, Haiku → 0–100 readiness) before the next phase generates; that readiness feeds the next generation and quietly revises later phases. Legacy (pre-v3) roadmaps are archived on load → fresh start. See `.claude/ROADMAP_REDESIGN.md`.

**ProfilePage** — editable profile fields, agent instructions, response style.

### LangGraph Service (`langgraph-service/`)

Python + FastAPI on Railway. Holds the Anthropic key. JWT-authed (`verify_jwt` validates the Supabase token). Chat uses an `AsyncPostgresSaver` checkpointer; `load_context` re-fetches from Supabase on every request, so state is just an assembled view. Cross-feature memory: research findings (`profiles.research_findings`) flow into chat context and quest generation; chat signals (`profiles.chat_signals`) persist across sessions via a Haiku background task.

| Endpoint | Purpose | Calls |
|---|---|---|
| `POST /chat` | Streams Sonnet 4.6 (SSE), tool-use loop for `add_quest_to_board`. Rate-limited: 8/lifetime | Anthropic |
| `POST /research` | Brave Search → page fetch → Sonnet synthesis. Rate-limited: 2/lifetime | Brave, Anthropic |
| `POST /quests/generate` | 1–5 quest suggestions from profile + research findings. Rate-limited: 3/lifetime | Anthropic |
| `POST /scorecard/improve` | 3 axis-tagged quest suggestions for a weak axis. Rate-limited: 5/lifetime (`axis_boost`) | Anthropic |
| `POST /roadmap/intake` | ≤3 gap-only pre-questions (Haiku). Free | Anthropic |
| `POST /roadmap/generate` | One-time **broad phase OUTLINE** (Sonnet): `phases[]` with per-month concept focuses, `display_title`, typo-fixed `goal_clean`. No nodes. Rate-limited: 1/lifetime (`roadmap_gen`) | Anthropic |
| `POST /roadmap/phase/generate` | Materializes ONE phase's `roadmap_nodes` (Sonnet) from outline + prior reflections; quietly revises later locked phases. Rate-limited: 5/lifetime (`phase_gen`) | Anthropic |
| `POST /roadmap/phase/complete` | Scores the post-phase reflection → 0–100 readiness (Haiku), marks phase completed, mirrors to `living_profile.roadmap_progress`. Free | Anthropic |
| `POST /roadmap/node/expand` | Brave-sourced references + inline-cited overview **+ a 3–5 item checklist** (`roadmap_tasks`) for one node (cached after first). Rate-limited: 6/lifetime (`node_expand`) | Brave, Anthropic |
| `POST /onboarding/extract` | ElevenLabs transcript → 17-field profile + `axis_scores` + seeded `living_profile` (Haiku check + Sonnet extraction) | Anthropic |
| `GET /health`, `GET /profile` | Health + profile probes | — |

Cross-feature scoring: completing a quest (and research/chat) flows through the `award_axis_points` Postgres RPC (up-only, capped, diminishing returns, logs `score_events`); undo uses `revert_axis_points`. The `living_profile` re-synthesizes from activity via a Haiku background task (`maybe_refresh_living_profile`, threshold 3 events tracked in `award_axis_points`).

### Supabase Edge Functions (`supabase/functions/`)

Only non-AI functions remain (Deno/TypeScript):

| Function | Purpose | Calls |
|---|---|---|
| `update-quest-item` | Quest status (move/complete/uncomplete/delete); on complete awards axis points (`award_axis_points`); on uncomplete reverts the exact delta (`revert_axis_points`) | — |
| `toggle-roadmap-task` | Check/uncheck a roadmap checklist task: awards a small axis amount on the node's `target_axis` (check) or reverts the stored delta (uncheck), rolls the node's state up to `done` when all its tasks are checked | — |
| `onet-proxy` | Proxies O*NET My Next Move API with auth (uses `_shared/onet.ts` `mnmSearch()`) | O*NET |
| `delete-account` | Full cascade user deletion | Supabase Admin |

> `extract-profile` is still deployed as a temporary rollback net while onboarding-via-LangGraph is monitored; retire it once verified.

### Database (Supabase Postgres)

Key tables:
- `profiles` — 20+ onboarding fields (strengths, interests, career_matches, work_style, agent_instructions, etc.); plus `research_findings` + `chat_signals` JSONB (cross-feature memory), `axis_scores` JSONB (5-axis scorecard), `scorecard_intro_seen`, and `living_profile` JSONB + `living_synced_at` + `living_events_since_sync` (evolving memory; see `.claude/MEMORY_REDESIGN.md`)
- `quest_items` — standalone quests with status (`suggested`/`considered`/`in_progress`/`completed`/`deleted`), difficulty, `target_axis`, why_it_matters, `roadmap_node_id` (FK → roadmap_nodes; marks roadmap-originated cards)
- `roadmaps` — goal (typo-fixed), `display_title`, timeframe_months (3–24), start_month, end_month, status (active/archived), **`phases` JSONB** (v3: the broad outline, generated once — each `{index, title, blurb, pillar, target_axis, month_start, month_count, month_focuses[], status: locked|active|completed, reflection?:{text, readiness_score, summary, completed[]}}`)
- `roadmap_nodes` — month_index, pillar (Project/Research/Activity/Club), title, blurb, target_axis, technical_depth (resource gating), state (explore/opened/done), `overview` + `references` JSONB (null until expanded). v3 ignores `kind` (legacy column). Materialized per-phase, not all at once.
- `roadmap_tasks` — the per-node checklist (v3): node_id FK, text, done, axis_delta (exact points awarded, for clean revert), order_index. Generated lazily at node expansion. RLS user-owns.
- `score_events` — append-only log of axis-score changes (axis, delta, reason, source); powers undo + history
- `chat_sessions` — full message history (JSONB), title, timestamps
- `research_sessions` — query + results (JSONB) + 7-day cache
- `usage_tracking` — lifetime counters: chat/research/quest_gen, axis_boost, roadmap_gen, phase_gen, node_expand (roadmap_reeval retired)
- `waitlist` — emails for paid plan interest

RLS is enabled on all tables (`auth.uid() = user_id`). Key Postgres RPCs: `check_and_increment_usage` (atomic rate limit + dev bypass), `award_axis_points` / `revert_axis_points` (scorecard scoring, service-role only).

The phase-based roadmap (`quests`/`quest_phases`/`quest_tasks`/`confidence_history`) was removed. `20260607_drop_roadmap.sql` drops those dead tables + the `roadmap_*` profile columns — apply with `supabase db push`.

### Rate Limits (Demo)

Lifetime caps enforced via `check_and_increment_usage` Postgres RPC (atomic check + increment):
- Chat: **8 messages**
- Research: **2 queries**
- Quest generation: **3 generations**
- Scorecard axis boost: **5**
- Roadmap outline generation: **1** · Phase generation: **5** · Node expansion: **6** (roadmap re-evaluation retired in v3)

Dev bypass: accounts in the `dev_emails` array inside `check_and_increment_usage` (`app.mentora.ai@gmail.com`, `kwu.1600@gmail.com`) get `allowed: true` with no counter increment.

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

- **Fonts:** Raleway everywhere (switched from Space Grotesk)
- **Background:** `#f5f1ed` (Claude light creme) throughout
- **Primary blue:** `#1d4ed8` with `#60a5fa` accents
- **No component library** — inline styles with per-file token constants (`SANS`, `BODY`, `P`, `BG`, `FG`, `MUT`, etc.)
- Tailwind v4 available but used minimally
