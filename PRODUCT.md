# Product

<!-- impeccable:product-schema 1 -->
<!-- Written from CLAUDE.md, the code and the project brief, without an interview. Facts marked (inferred) were not confirmed with the user. -->

## Platform

web

## Users

- **Primary: US high school students** applying to college, on phones and laptops (inferred). Their job: build an honest record of what they have done, pick a balanced list of schools, and keep a project moving a little every day.
- **Secondary: parents and school counselors**, who look over a student's record and list. Counselors have their own unlisted side (`/counselor`).

## Product Purpose

Mentorable builds a structured record of a student (grades, test scores, coursework, activities, awards) and an AI advisor reasons over that record to help them apply well. Success is a student who applies to a well-matched list with a record that is accurate and complete, and who kept working on something real along the way.

## Positioning

The advisor reasons over the student's own structured record, not a chat history, and follows researched advising ethics (NACAC, IECA, ASCA, the undermatching research). It will not predict admission odds, write essays or inflate a record, and it judges a record against the opportunity the student actually had.

## Operating Context

- **Onboarding:** a short form of names and numbers, then an optional text or voice interview, then a review where the student corrects everything that was inferred.
- **Quest (home, `/quest`):** one project at a time, split into 3 to 8 milestones, moved forward by one small task each scheduled day. A daily check-in keeps a streak and earns XP; a missed day becomes backlog.
- **Portfolio (`/portfolio`):** the record itself, editable by the student; resume export.
- **College List (`/college-list`):** schools grouped reach, target and likely by a stated rule against U.S. Department of Education data. Not an application tracker.
- **Chat (`/chat`):** the advisor, which reads the record, the list and the quest, and can edit the record but never complete a quest task.
- **Agents:** playful specialists with pixel mascots: Beaker (outreach emails), Talon (scholarships and programs), Quill (essay coaching that never writes or edits a word).

## Capabilities and Constraints

- The facts on a college (admit rate, score ranges, net price) are the government's; the category is a rule, shown with its reason, never a model's guess.
- Categories are comparisons, never odds. Nothing says a student "should get in".
- No volatile fact (testing policies, aid deadlines) is asserted; students are sent to the source.
- Usage is budgeted per student; spent budgets fall back to plain content or a clear limit message.
- Roadmap, Research and Scorecard are parked career-era features and are unreachable.

## Brand Commitments

- **Voice:** calm, specific, encouraging, never hype. Plain sentences that say what to do next. No em dashes.
- **Honesty:** never predict admission odds; never ghostwrite an essay or inflate a record; flag a list that is too low as firmly as one that is too high; raise net price before being asked.
- **Being behind is amber, never red:** a missed day is something to fix, not a failure.
- The mascots (Beaker the pelican, Talon the hawk, Quill the owl) and the pixel-art stamps are the product's personality.

## Evidence on Hand

- College data from the College Scorecard API. No testimonials, user counts, outcomes or admit-rate-by-score data exist; do not invent them.

## Product Principles

1. The record belongs to the student: everything inferred can be corrected, and the advisor's words are never the student's record.
2. Compare, do not predict.
3. One small step a day beats a plan nobody follows.
4. Judge a record against the opportunity the student actually had.
5. Calm by default; delight comes from the characters and the copy, not from pressure.

## Accessibility & Inclusion

- WCAG AA contrast is computed in code for every accent-derived colour; no text under 0.9rem or lighter than `#494742`.
- 44px touch targets, visible keyboard focus, every motion stilled under reduced motion.
- Phones from 320px wide with a 16px gutter.
