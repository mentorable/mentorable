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
python3 -m pytest langgraph-service/tests/   # Quest's day, streak and XP rules (pip install -r langgraph-service/requirements-dev.txt)
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

It was pivoted from a broad career-guidance product in September 2026. Some of the older career features still exist in the tree but are **parked behind feature flags** (see below). Anything describing axes, roadmaps, "career readiness" or the `quest_items` board is pre-pivot and should be treated as legacy. **Quest** is the exception: rebuilt from scratch as the daily-streak home screen (see Quest below), sharing only the name with the old board.

## Architecture

React 19 SPA (Vite) on Vercel, Supabase (Postgres + Auth), and a **Python + LangGraph/FastAPI service on Render** (the agentic backend; `render.yaml` is the live deploy config — `railway.toml` is a leftover). All fonts are **Raleway**. No component library, all styling is inline styles with per-file token constants.

Provider keys live only in the backend. The frontend reaches it via `VITE_LANGGRAPH_CHAT_URL`.

### Feature flags

`src/lib/features.js` is the source of truth for what a student can actually reach:

```js
FEATURES = { quest: true, roadmap: false, research: false, scorecard: false, chat: true, portfolio: true }
HOME_PATH = "/quest"               // where a returning student lands
POST_ONBOARDING_PATH = "/portfolio" // straight after onboarding
```

Roadmap, Research and Scorecard were built for career guidance and need a real redesign for admissions. Their code, endpoints and tables are intact but unreachable from the UI. **Do not wire new work into them**, and remember that a tool writing to a parked feature is a tool writing somewhere the student cannot see.

### Frontend

- `main.jsx` → `App.jsx` — root router. `AppShell` wraps logged-in routes with `Sidebar` (desktop) / `MobileNav` (mobile), filtered by `isEnabled()`.
- Live pages: `LandingPage`, `AuthPage`, `OnboardingPage`, `QuestPage`, `ChatPage`, `PortfolioPage`, `ProfilePage`. Parked: `ScorecardPage`, `RoadmapPage`, `ResearchPage`.
- `components/onboarding/` — `IntakeForm`, `TextInterview`, `IntakeReview`, `RecordPanel`, `intakeTheme.js`.
- `components/quest/` — the map, check-in sheet, setup flow, panels, `NavStreakChip`, and `questUi.jsx` (tokens and the raised button).
- `lib/`:
  - `supabase.js` — single client
  - `auth.js` — **`requireUser()` / `getValidUser()`. Always use these, never `getSession()`.** Routing off `getSession()` (unvalidated localStorage) while page guards used `getUser()` (server-validated) caused an infinite `/auth` ↔ `/onboarding` redirect loop. `requireUser()` validates server-side and purges a dead token.
  - `features.js` — the flags above
  - `intake.js` — onboarding form save + interview/extract/commit calls
  - `portfolio.js` — CRUD over the record + resume export
  - `mentora.js` — `streamChatResponse` (SSE from `/chat`)
  - `quest.js` — Quest API client and date helpers. API dates are calendar dates: parse them with `parseDay`, since `new Date("2026-09-23")` lands on the previous evening in US zones
  - `QuestContext.jsx` — the streak/level summary behind the nav chip, mounted in `AppShell`
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

Legacy tables still present but parked: `quest_items` (the old quest board; still read by the parked research and scorecard code, so drop it only once those are gone), `roadmaps`, `roadmap_nodes`, `roadmap_tasks`, `score_events`. Plus `chat_sessions`, `research_sessions`, `usage_tracking`, `waitlist`.

### Onboarding flow (`/onboarding`)

1. **Form** (`IntakeForm`) — 5 steps collecting names and numbers only. Saves via `saveIntakeForm`, which is **replace-not-append**: it wipes and reinserts the four child tables so a resubmit means latest-wins. Autosaves to localStorage; that draft survives until onboarding actually completes, because clearing it earlier let a refresh return an empty form whose resubmission wiped a complete record.
2. **Channel** — text interview, voice interview (ElevenLabs), or skip.
3. **Interview** — `POST /onboarding/interview` (SSE, 12 turn cap) or ElevenLabs. The agent prompt for voice lives on the **ElevenLabs dashboard**, not in this repo.
4. **Extraction** — `POST /onboarding/intake/extract` writes a draft to `profiles.intake_draft`. Nothing else is touched.
5. **Review** (`IntakeReview`) — the student edits the draft. Everything here was inferred, so all of it is correctable.
6. **Commit** — `POST /onboarding/intake/commit` enriches the activity rows, writes `narrative`, clears `intake_draft`, sets `onboarding_completed`, redirects to `/portfolio`, which shows a "Start your first quest" card to anyone who has never had one.

### Quest (`/quest`, the home screen)

The retention loop. One project at a time, split into 3 to 8 milestones, moved forward by one small task on every scheduled day. The student checks in with a line about what they did; that keeps a streak and earns XP. A missed day becomes backlog, and the next milestone stays locked until the current one is fully done.

- **Where the rules live.** `app/nodes/quest/schedule.py` is pure (no I/O, no clock) and owns every rule a student would notice: which day a task belongs to, what is missed, the milestone gate, whether the streak survives. It is covered by `langgraph-service/tests/test_quest_schedule.py`; change the rule and the test together. `service.py` loads and writes; `app/routers/quest.py` only translates HTTP. XP numbers live in `xp.py` alone: the SQL function takes them as arguments.
- **Day-slots, not dates.** A quest has N day-slots. Their dates are derived from `quests.schedule` (a list of segments) and never stored. A pace change, a resume, or "count it as a break" appends a segment from the first slot not yet reached, so a day that has already happened never moves.
- **Settle before you rebase.** `_settle_streak` writes 0 when the streak is already dead. Call it before anything that rewrites the schedule or ends a quest: relaying the missed days would otherwise erase the miss and bring the streak back to life.
- **"Today" is the server's.** Computed from `profiles.timezone` (saved from the browser's zone on first visit). The client never sends a date.
- **Writes go through the backend only.** Students can read their quest rows but have no write policies, and the four `quest_*` SQL functions are callable by the service role only. `quest_complete_task` does the check-in, task, milestone, quest, XP and streak in one transaction; `UNIQUE (task_id)` on check-ins is what stops a double submit from paying twice.
- **The check-in lands before the reply.** The task is completed first and the advisor's reply is generated after, so a model outage costs a canned reply, never a streak.
- **Budgets.** Quest has its own (`quest_usage` + `quest_bump_usage`), separate from the lifetime caps. Daily ones (4 task generations, 4 replies) fall back to plain content when spent; monthly ones (3 plans, 3 suggestion refreshes) refuse with `429 {error: "QUEST_BUDGET"}`.
- **Chat can reshape, never complete.** `update_quest` and `retire_quest` exist; no tool touches tasks, check-ins, XP or the streak.
- Schema: `supabase/migrations/20260923_quest_v2.sql`. Live-API check of the five Quest prompts: `python3 scripts/check_quest.py` (reports cost per active day).

### Chat (`/chat`)

The advisor. `load_context` → `build_prompt` → streaming tool-use loop in `main.py`.

**Every key passed between graph nodes must be declared on `StudentState` (`app/state.py`).** LangGraph silently drops undeclared keys between nodes. The four record keys were once returned by `load_context` without being declared, so `build_prompt` got an empty record and the advisor's prompt said "nothing recorded" for every student while each function looked correct when tested on its own. Test prompt changes through `create_chat_graph`, not by calling the two functions in sequence.

`build_prompt.py` assembles: persona and advising rules, the live record, their Quest, tool instructions, formatting, then memory from past sessions, then the student's own `agent_instructions` last (highest priority, but they cannot override the rules on predicting admission, writing essays, or inflating the record).

**The advising rules are researched, not invented** — NACAC's ethical practice guide, IECA principles, ASCA, public admissions-office writing, and the research on undermatching (Hoxby & Avery) and summer melt. Key behaviours: never predict admission odds, flag a list that is too *low* as hard as one too high, judge a record against the opportunity the student actually had, raise net price before being asked, never ghostwrite an essay or inflate a record, hand off when a disclosure stops being about applications.

**No volatile fact is hard-coded in the prompt.** Testing policies, aid deadlines and per-school demonstrated-interest weighting change every cycle, so the prompt sends students to the source rather than asserting a policy it cannot check. Keep it that way.

Chat tools (`nodes/chat/tools.py`) are full CRUD over the record: `view_portfolio`, `add_portfolio_item`, `update_portfolio_item`, `delete_portfolio_item`, `update_gpa`, plus `view_quest`, `update_quest` and `retire_quest`. Every write is scoped by `user_id` **as well as** row id — the service role bypasses RLS, so that filter is the only real guard. Model input is whitelisted, clamped and truncated to what each column holds. Record writes emit a `portfolio_changed` SSE event, quest writes a `quest_changed` one; both toast, and the second refreshes the nav streak chip.

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
| Quest plan, suggestions, portfolio draft | `claude-sonnet-5` | A few calls per quest, and everything after them builds on the result |
| Quest daily task, check-in reply | `claude-haiku-4-5` | Every active student, every day; short replies |

The Quest calls go through `app/llm.py` → `tool_completion()`, which forces one Anthropic tool call so the reply always arrives as an object (intake extraction uses it too). Callers still type-check every field, and fall back to plain content when the reply is unusable.

**`app/llm.py` → `json_completion()` is the one path for structured-output calls.** It prefers OpenAI's `json_schema` strict mode (which makes non-conforming JSON impossible to emit) and falls back to Anthropic plus a permissive parse when `OPENAI_API_KEY` is absent or the call fails. The service therefore behaves identically with or without an OpenAI key. Schemas must satisfy strict mode: top-level object, every property in `required`, `additionalProperties: false`, and a list wrapped in an object rather than returned bare.

To check the OpenAI routing against the real API (does the model accept
`reasoning_effort`, how many reasoning tokens each job burns, whether it is
actually cheaper than the Anthropic call it replaced):

```bash
cd langgraph-service
OPENAI_API_KEY=sk-... python3 scripts/check_openai.py
```

It uses the app's real prompts and schemas, writes nothing, and touches no rate
limit. **Reasoning tokens are billed as output but invisible in the reply**, so
a reasoning model is not automatically cheaper: on the resume upload, gpt-5-mini
beats Haiku below roughly 1800 reasoning tokens per call and loses above it.

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
| `GET /quest`, `GET /quest/summary`, `POST /quest/...` | Quest state, the nav chip, and every Quest action (`app/routers/quest.py`) | Quest's own budgets (see Quest) |
| `GET /health`, `GET /profile` | Probes | — |

Parked but still routed: `/research`, `/scorecard/improve`, `/roadmap/*`.

Limits are enforced by the `check_and_increment_usage` Postgres RPC (atomic check + increment, with a dev-email bypass). On limit, endpoints return `429 {error: 'LIMIT_REACHED'}` and the frontend shows `LimitModal`.

### Edge functions (`supabase/functions/`)

`toggle-roadmap-task` (parked), `onet-proxy`, `delete-account`. The source of `update-quest-item` (the old quest board's) was deleted with the Quest rebuild; the deployed copy is unreferenced and can be removed with `supabase functions delete update-quest-item`.

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
- **No em dashes in user-facing copy.** This applies to model prompts too. Quest's model output is also run through `clean_text`, which strips any the model adds anyway.
- The Quest page is the one bold surface: raised buttons and stones with a solid bottom edge, all derived from the student's accent (`useQuestColors`). Amber is reserved for being behind, never red. Everywhere else stays calm; the nav streak chip is the only raised element outside `/quest`.
- `html, body` use `overflow-x: clip` (with `hidden` before it as the fallback). `hidden` makes `<body>` a scroll container, which silently disables every `position: sticky` in the app.

## Conventions

- `.claude/` is gitignored by design. Design docs live there locally and must not be force-added.
- Commit and push after completing a change, without asking.
- Verify before claiming something works. The recurring failure mode in this repo is a change that compiles, reads correctly, and is broken at runtime.
