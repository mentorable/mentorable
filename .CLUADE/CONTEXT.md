# Mentorable — CONTEXT.md

## Project Overview
Mentorable is an AI-powered career guidance app for high school students. It replaces the lack of personalized career advice with a voice-first onboarding experience, a personalized scorecard, and a dynamic phase-by-phase career roadmap. The emotional goal: students feel guided — like someone finally has a hand on their shoulder pointing them in the right direction.

**Primary goal right now:** Win the Congressional App Challenge. Build a working, impressive demo. No monetization, no free/paid tiers.


## The Problem We're Solving
Most high schoolers lack access to professional networks and personalized guidance, leading to misaligned college choices and missed opportunities. School counselors are overwhelmed (avg. 400+ students per counselor). Mentorable fills that gap with AI.

---

## Core User Journey
1. **Sign Up / Sign In** (`/auth`) — Supabase auth, email/password
2. **Voice Onboarding** (`/onboarding`) — ElevenLabs Conversational AI, 2–3 min conversation, transcript sent to Claude to extract structured profile JSON
3. **Scorecard** (`/scorecard`) — personalized card with animated radar chart, career matches, strengths, growth areas, work style, color themes, download + share
4. **Profile Setup** (`/profile-setup`) — quick collection of grade level, age, and general location before roadmap
5. **Roadmap** (`/roadmap`) — dynamic phase-by-phase career guidance path (see Roadmap System below)
6. **Chatbot** — future implementation

---

## What's Built

| Screen | Status |
|--------|--------|
| Landing page | ✅ Live |
| Auth screen (`/auth`) | ✅ Complete |
| Voice onboarding (`/onboarding`) | ✅ Complete |
| Scorecard (`/scorecard`) | ✅ Complete |
| Profile setup (`/profile-setup`) | ✅ Complete |
| Roadmap (`/roadmap`) | 🔨 In progress |
| Chatbot | ⏳ Future |

---

## Tech Stack

### Frontend
- **Framework**: React + TypeScript
- **Styling**: Tailwind CSS + inline styles for effects
- **Fonts**: Plus Jakarta Sans (headings), Geist (body)
- **Animation**: Framer Motion
- **Charts**: Pure SVG (radar chart — no chart library)

### Backend
- **Database + Auth**: Supabase (Row Level Security on all tables)
- **AI**: Anthropic Claude API (`claude-sonnet-4-6`)
- **Voice**: ElevenLabs Conversational AI (Agent ID configured, Mark voice, Claude Sonnet 4.5 LLM, V3 Conversational model)
- **Edge Functions**: Supabase Edge Functions (Deno) for all Claude API calls

### Key Integrations
- ElevenLabs → transcript → Supabase Edge Function → Claude → structured profile JSON → saved to `profiles` table
- Claude API (via Edge Functions) → generates roadmap phases fresh on demand
- Supabase → all user data, roadmap state, confidence history

---


## Key Differentiators
1. **Voice-first onboarding** — no competitor does this for high schoolers
2. **Personalized scorecard** — visual, shareable, immediately personal
3. **Adaptive roadmap** — phases generated fresh by Claude using real student behavior
4. **Confidence meter** — students see how clearly their direction is emerging over time
5. **Calm, reassuring tone** — not hype, not corporate, just clarity

---