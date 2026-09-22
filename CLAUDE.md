# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start Vite dev server (localhost:5173)
npm run build      # Production build → dist/
npm run preview    # Preview the production build
```

**There is no test suite and no lint script, and the build catches less than you would expect.** Vite/esbuild does not type-check JSX, so an undefined identifier or a misspelled prop compiles clean and only crashes in the browser. This has shipped breakage more than once. Before finishing frontend work, check that every identifier a component references is actually declared. On the Python side there is no linter wired in either, and a missing variable in a returned dict once took `/chat` down entirely in production:

```bash
python3 -m pyflakes langgraph-service/app/   # run this after backend edits
```

Deploy edge functions (Deno/Supabase):
```bash
supabase functions deploy <function-name>
```

**`supabase db push` does not work on this project** — roughly 28 already-applied migrations are recorded as pending, so it tries to replay them. Apply a new migration directly instead:

```bash
supabase db query --linked -f supabase/migrations/<file>.sql
```
Then verify against `information_schema` rather than trusting the exit code.

## What this product is

Mentorable is a **college application tool for US high school students**. It builds a structured record of a student (grades, test scores, coursework, activities, awards), and an AI advisor reasons over that record to help them apply well.

It was pivoted from a broad career-guidance product in September 2026. Some of the older career features still exist in the tree but are **parked behind feature flags** (see below). Anything describing axes, quests, roadmaps or "career readiness" is pre-pivot and should be treated as legacy.

## Architecture

React 19 SPA (Vite) on Vercel, Supabase (Postgres + Auth), and a **Python + LangGraph/FastAPI service on Render** (the agentic backend; `render.yaml` is the live deploy config — `railway.toml` is a leftover). All fonts are **Raleway**. No component library, all styling is inline styles with per-file token constants.

Provider keys live only in the backend. The frontend reaches it via `VITE_LANGGRAPH_CHAT_URL`.

### Feature flags

`src/lib/features.js` is the source of truth for what a student can actually reach:

```js
FEATURES = { quest: false, roadmap: false, research: false, scorecard: false, chat: true, portfolio: true }
HOME_PATH = "/chat"                // where a returning student lands
POST_ONBOARDING_PATH = "/portfolio" // straight after onboarding
```

Quest, Roadmap, Research and Scorecard were built for career guidance and need a real redesign for admissions. Their code, endpoints and tables are intact but unreachable from the UI. **Do not wire new work into them**, and remember that a tool writing to a parked feature is a tool writing somewhere the student cannot see.

### Frontend

- `main.jsx` → `App.jsx` — root router. `AppShell` wraps logged-in routes with `Sidebar` (desktop) / `MobileNav` (mobile), filtered by `isEnabled()`.
- Live pages: `LandingPage`, `AuthPage`, `OnboardingPage`, `ChatPage`, `PortfolioPage`, `ProfilePage`. Parked: `ScorecardPage`, `QuestPage`, `RoadmapPage`, `ResearchPage`.
- `components/onboarding/` — `IntakeForm`, `TextInterview`, `IntakeReview`, `RecordPanel`, `intakeTheme.js`.
- `lib/`:
  - `supabase.js` — single client
  - `auth.js` — **`requireUser()` / `getValidUser()`. Always use these, never `getSession()`.** Routing off `getSession()` (unvalidated localStorage) while page guards used `getUser()` (server-validated) caused an infinite `/auth` ↔ `/onboarding` redirect loop. `requireUser()` validates server-side and purges a dead token.
  - `features.js` — the flags above
  - `intake.js` — onboarding form save + interview/extract/commit calls
  - `portfolio.js` — CRUD over the record + resume export
  - `mentora.js` — `streamChatResponse` (SSE from `/chat`)
  - `usage.js`, `retry.js`, `cache.js`, `onet.js`

### The student record (the core data model)

Five places hold everything. The Portfolio page and the onboarding intake write **the same rows** — there is no second copy.

`profiles` (scalars): `full_name`, `grade_level`, `graduation_year`, `location_general`, `gpa_unweighted` / `gpa_weighted` (`NUMERIC(6,3)`, wide enough for a 100-point scale), `gpa_scale`, `candidate_majors` (JSONB array), `target_colleges` (JSONB array), `narrative` (JSONB), `intake_channel`, `intake_draft` (JSONB, staging), `chat_signals` (JSONB), `resume_contact` (JSONB), `agent_instructions`, `agent_response_style`.

Child tables, all `user_id`-scoped with RLS (`auth.uid() = user_id`):

| Table | Shape |
|---|---|
| `student_activities` | Common App shaped: `category`, `title`, `position`, `organization`, `description`, `grade_levels INT[]`, `timing`, `hours_per_week`, `weeks_per_year`, `continue_in_college`, `detail_level` (`name_only` \| `enriched`), `order_index` |
| `student_awards` | `title`, `level`, `grade_level`, `year`, `description`, `order_index` |
| `student_courses` | `name`, `level`, `grade_level`, `year`, `planned`, `order_index` |
| `student_test_scores` | `test_type`, `score`, `section_scores` (JSONB), `subject`, `test_date`, `attempt` — **no `order_index` column**, ordered by `test_type` |

`narrative` shape: `{ theme, theme_evidence[], detailed_activity_ids[], concerns[], gaps[], student_voice[], summary }`, or `{}` if the student skipped the interview.

> The missing `order_index` on `student_test_scores` is a real trap: generic insert helpers that add it unconditionally fail on that one table. `addRow` in `src/lib/portfolio.js` gates it behind `ORDERED_TABLES`.

Legacy tables still present but parked: `quest_items`, `roadmaps`, `roadmap_nodes`, `roadmap_tasks`, `score_events`. Plus `chat_sessions`, `research_sessions`, `usage_tracking`, `waitlist`.

### Onboarding flow (`/onboarding`)

1. **Form** (`IntakeForm`) — 5 steps collecting names and numbers only. Saves via `saveIntakeForm`, which is **replace-not-append**: it wipes and reinserts the four child tables so a resubmit means latest-wins. Autosaves to localStorage; that draft survives until onboarding actually completes, because clearing it earlier let a refresh return an empty form whose resubmission wiped a complete record.
2. **Channel** — text interview, voice interview (ElevenLabs), or skip.
3. **Interview** — `POST /onboarding/interview` (SSE, 12 turn cap) or ElevenLabs. The agent prompt for voice lives on the **ElevenLabs dashboard**, not in this repo.
4. **Extraction** — `POST /onboarding/intake/extract` writes a draft to `profiles.intake_draft`. Nothing else is touched.
5. **Review** (`IntakeReview`) — the student edits the draft. Everything here was inferred, so all of it is correctable.
6. **Commit** — `POST /onboarding/intake/commit` enriches the activity rows, writes `narrative`, clears `intake_draft`, sets `onboarding_completed`, redirects to `/portfolio`.

### Chat (`/chat`)

The advisor. `load_context` → `build_prompt` → streaming tool-use loop in `main.py`.

`build_prompt.py` assembles: persona and advising rules, the live record, tool instructions, formatting, then memory from past sessions, then the student's own `agent_instructions` last (highest priority, but they cannot override the rules on predicting admission, writing essays, or inflating the record).

**The advising rules are researched, not invented** — NACAC's ethical practice guide, IECA principles, ASCA, public admissions-office writing, and the research on undermatching (Hoxby & Avery) and summer melt. Key behaviours: never predict admission odds, flag a list that is too *low* as hard as one too high, judge a record against the opportunity the student actually had, raise net price before being asked, never ghostwrite an essay or inflate a record, hand off when a disclosure stops being about applications.

**No volatile fact is hard-coded in the prompt.** Testing policies, aid deadlines and per-school demonstrated-interest weighting change every cycle, so the prompt sends students to the source rather than asserting a policy it cannot check. Keep it that way.

Chat tools (`nodes/chat/tools.py`) are full CRUD over the record: `view_portfolio`, `add_portfolio_item`, `update_portfolio_item`, `delete_portfolio_item`, `update_gpa`. Every write is scoped by `user_id` **as well as** row id — the service role bypasses RLS, so that filter is the only real guard. Model input is whitelisted, clamped and truncated to what each column holds. Writes emit a `portfolio_changed` SSE event → toast.

A tool call splits a reply into multiple model turns; `TURN_SEPARATOR` in `main.py` keeps them from running together in the rendered text.

### Model routing

**`app/models.py` is the single source of truth for every model id.** No literal model string belongs anywhere else.

| Task | Model | Why |
|---|---|---|
| Chat | `claude-sonnet-5` | Advising judgment shows in output the student reads |
| Text interview | `claude-sonnet-5` | Student-facing |
| Intake extraction | `claude-sonnet-5` | Produces the record everything else reasons from |
| Portfolio upload | `gpt-5-mini` (fallback Haiku 4.5) | Mechanical extraction |
| `extract_signals` | `gpt-5-nano` (fallback Haiku 4.5) | One sentence into a JSON blob, never shown as prose |

**`app/llm.py` → `json_completion()` is the one path for structured-output calls.** It prefers OpenAI's `json_schema` strict mode (which makes non-conforming JSON impossible to emit) and falls back to Anthropic plus a permissive parse when `OPENAI_API_KEY` is absent or the call fails. The service therefore behaves identically with or without an OpenAI key. Schemas must satisfy strict mode: top-level object, every property in `required`, `additionalProperties: false`, and a list wrapped in an object rather than returned bare.

Cost note: Claude 4.7 and later tokenize to ~30% more tokens for the same text, so Sonnet 5's lower list price is worth about 13% in practice, not 33%.

### Backend endpoints (`langgraph-service/`)

JWT-authed via `verify_jwt`. Chat uses an `AsyncPostgresSaver` checkpointer; `load_context` re-reads Supabase every request, so state is an assembled view, never a cache.

| Endpoint | Purpose | Rate limit |
|---|---|---|
| `POST /chat` | Streams the advisor (SSE) + tool loop | 8 / lifetime |
| `GET /onboarding/context` | Rendered form summary (seeds the voice agent) | free |
| `POST /onboarding/interview` | Text interview (SSE, 12 turns) | free |
| `POST /onboarding/intake/extract` | Transcript → `intake_draft` | free |
| `POST /onboarding/intake/commit` | Draft → the real tables | free |
| `POST /portfolio/extract` | Resume/brag sheet → activity + award rows | 2 / lifetime |
| `POST /portfolio/resume/pdf` | Jake's-Resume LaTeX → PDF via Tectonic. **Zero AI cost** | 1 / lifetime |
| `GET /health`, `GET /profile` | Probes | — |

Parked but still routed: `/research`, `/quests/generate`, `/scorecard/improve`, `/roadmap/*`.

Limits are enforced by the `check_and_increment_usage` Postgres RPC (atomic check + increment, with a dev-email bypass). On limit, endpoints return `429 {error: 'LIMIT_REACHED'}` and the frontend shows `LimitModal`.

### Edge functions (`supabase/functions/`)

`update-quest-item` and `toggle-roadmap-task` (both parked), `onet-proxy`, `delete-account`.

## Environment variables

Client (`.env.local`):
```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_ELEVENLABS_AGENT_ID
VITE_LANGGRAPH_CHAT_URL
```

Backend (Render dashboard, and `langgraph-service/.env` for local dev — both gitignored):
```
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY   # bypasses RLS; scope every query by user_id yourself
ANTHROPIC_API_KEY
OPENAI_API_KEY              # optional; absent = Anthropic fallback everywhere
GEMINI_API_KEY              # slot exists, unused
BRAVE_API_KEY               # parked features only
DATABASE_URL                # Supabase session pooler (IPv4) for the checkpointer
CORS_ORIGIN
DEV_BYPASS_EMAILS
POSTHOG_PROJECT_TOKEN, POSTHOG_HOST
```

## Design system

- **Raleway** everywhere
- Background `#F5F5F5`; the accent is per-user (`profiles.profile_color`) via `useTheme()` → `{ accent, accentLight, accentRgb }`, mirrored as CSS vars `--accent`, `--accent-light`, `--accent-rgb`. **Use the theme accent, not a hardcoded blue.**
- Inline styles with per-file token constants (`SANS`, `BG`, `TEXT`, `BORDER`, …)
- **No em dashes in user-facing copy.** This applies to model prompts too.

## Conventions

- `.claude/` is gitignored by design. Design docs live there locally and must not be force-added.
- Commit and push after completing a change, without asking.
- Verify before claiming something works. The recurring failure mode in this repo is a change that compiles, reads correctly, and is broken at runtime.
