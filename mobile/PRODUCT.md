# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

- **Personal goal-setters:** individuals working toward one ambitious long-term goal (career, fitness, learning), using the app on their own, mostly on their phone.
- **Athletes and students:** the audience the Harada Method came from. Whether a coach or teacher takes part in the app (shared views, review) is **undecided**. Until it is decided, the app is single-user.

The job in both cases is the same: define one goal and its purpose, break it into 8 key areas of 8 actions, and then act on it day by day, reflecting along the way.

## Product Purpose

Help a person reach one long-term goal with the Harada Method:

- **Plan:** the goal and its purpose, 8 key areas, and 64 actions (the 1 + 8 + 64 matrix).
- **Execute:** complete tasks, check routines, and choose up to 5 actions as today's focus.
- **Review:** write dated reflections and see progress that never overstates achievement.

Success means the user keeps acting on their plan and can see honestly where they stand.

## Positioning

A faithful Harada Method tool, not a generic habit tracker. The 9×9 matrix is the plan of record, and daily work is drawn from the matrix rather than typed in again. Planning completeness, action completion and goal attainment are separate measures. Only the user declares a goal achieved.

## Operating Context

- Phone-first. A native Expo/React Native app (`mobile/`) is the client being built. A Next.js web app exists in the same repo.
- Daily use is short check-ins: today's focus, due routines and open tasks. Building or editing the matrix happens in longer sessions.
- Reflections are dated entries (what went well, what didn't, what to change), stored per goal.
- "Today" is the user's local date in their own time zone.

## Capabilities and Constraints

- **Matrix:** one central goal, up to 8 key areas, and up to 8 actions per key area. Partial matrices are valid, and empty positions are invitations, not errors. Moving or renaming an action keeps its id and history. Archiving hides a record and never deletes it.
- **Actions** are either tasks (one-off) or routines (scheduled and tracked on a check sheet; adherence is measured over 28 days). The method advises tracking at most 10 routines: the app may warn past 10 but must not block.
- **Metrics** are computed once in the domain layer and never in the UI. Each is shown separately and none is labelled "goal progress": "N of 72 positions planned", task completion, routines kept, and goal attainment.
- **Terminology:** the UI says "key area" and "action" (the code says `Outcome` and `Action`).
- **Data:** Supabase Postgres with row-level security on every table, and Supabase Auth. The device reads directly and writes only through Postgres RPCs. No service-role key on any client. User data is never destructively migrated.
- **Online-only:** a failed write shows "not saved" loudly and is never queued silently.
- **Not yet verified:** never run against a real Supabase project; never verified on a real device beyond Expo Go.

## Brand Commitments

- **Faithful to the method.** Separate method from adaptation: schedules, 28-day adherence, streaks, pace, templates, weekly reflections, the goal-status lifecycle and the 4-quadrant purpose prompt are product features, not "the method", and are never presented as such. Completion counts never read as goal achievement.
- **No gamification and no AI.** No XP, levels, badges, achievements, confetti, sounds or streak pressure (streaks may appear only as information). No AI chat. If suggestions are ever added, they are optional, labelled "Suggested", accepted item by item, and never overwrite text the user wrote.
- The name is **Harada**. The existing calm "paper planner" look (`docs/DESIGN_SYSTEM.md`) is the current implementation, but the user did not make it binding.

## Evidence on Hand

- Research on the method and its sources, with confidence tags: `docs/research/HARADA_METHOD_SOURCES.md`, `docs/HARADA_SPEC.md`. No primary source (Bodek 2012, Harada Education Institute) was retrievable.
- Mobile usability review: `docs/research/MOBILE_USABILITY_REVIEW.md`.
- No testimonials, users, metrics or press exist. Do not fabricate any.

## Product Principles

1. **The matrix is the plan.** Daily execution is drawn from it and never re-entered.
2. **Honest progress.** Planning, doing and achieving are different things. Never blend them or overstate them.
3. **Purpose over pressure.** Motivation comes from the user's own purpose, not from game mechanics.
4. **Never lose the user's work.** Saves are confirmed or fail loudly, history survives edits, and archiving comes before deleting.
5. **Method fidelity is labelled.** Be clear about what is Harada and what is this app's adaptation.

## Accessibility & Inclusion

- Screen readers (VoiceOver and TalkBack): every control is labelled, and check circles announce "<action title>, checked/not checked".
- Text at 200% (iOS Dynamic Type XXXL, Android font scale 2.0): no clipped controls and nothing unreadable.
- Touch targets of at least 44 pt.
- Respect reduced-motion settings.
