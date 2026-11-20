# Founding 100, achievements, profile metrics and privacy

Written 2026-10-27. Schema: `supabase/migrations/20261027140000_identity_achievements.sql`.
Tests: `tests/integration/identity-achievements.test.ts`, `src/ui/features/social/identity.test.tsx`,
`src/ui/features/admin/founding-admin.test.tsx`, `mobile/src/features/identity/identity.test.tsx`.

## 1. Separate concepts

| Concept | Where | Decided by |
|---|---|---|
| Founding Member (No. 1–100) | `founding_members` (defined in `20261027120000_monetization.sql`) | An operator, server-side |
| Entitlement (Free/Pro) | `plan_of()`, `subscriptions`, `native_subscriptions`, `plan_grants` | Payments (not touched here) |
| Achievement | `user_achievements` | The database, from recorded activity |
| Profile display preferences | `social_profiles.show_achievements`, `show_progress_metrics`, `founding_badge_on_posts` | The member |

Founding status never implies Pro. A founder gets complimentary Pro only when
`billing_settings.founding_complimentary_pro` is on at grant time (payments-owned), or an operator adds a grant.
A future club membership should be its own table, not a flag on any of these.

## 2. Founding 100

- **Grant:** `admin_entitlement(user, 'founding', reason)` (payments migration): admin check, advisory lock 100271,
  number = max + 1, `entitlement_audit` row, optional comp Pro.
- **Revoke:** `admin_revoke_founding_member({userId, reason})`: admin check, the same lock, deletes the row,
  audit action `founding_revoked`. A comp Pro grant is revoked separately (`admin_entitlement(..., 'revoke', ...)`).
- **Numbers** come from max + 1, so a revoked number is reissued only if it was the highest. `unique` and
  `check (1..100)` on the column are the backstop for any writer.
- **List/search:** `admin_founding_members()`, `admin_search_users({query})` (no emails). UI: `/admin`.
- **Clients** have no privilege on `founding_members`, `user_achievements` or `entitlement_audit`.
- **Display:** the profile always shows the credential; the mark beside the name on posts and in Discover
  follows `founding_badge_on_posts`.

## 3. Profile metrics (featured goal)

The featured goal is the member's most recently activated **public** active goal, else the latest public achieved
goal. Private goals never qualify, including on the owner's own view. `harada_private.goal_progress_metrics`:

| Metric | Definition |
|---|---|
| Days pursuing | `activated_on` to today (or to the achievement day), inclusive, in the owner's time zone. Draft: none |
| Actions completed | Completed, non-archived tasks + on-time routine check-ins |
| On-time check-in | Recorded on its day or up to 2 days later (`created_at` local date − `date` ∈ 0..2). Back-filled calendars do not count |
| Consistency | Days with ≥ 1 completed action ÷ days in the window. Window = last 30 days of the goal, or fewer for a newer goal |
| Key areas complete | Active outcomes whose measure reached its target, or, with no measure, whose tasks are all done (≥ 1 task) |
| Tasks completed | Done ÷ planned non-archived tasks (the progress bar) |

All counts read current rows, so reopening a task, unchecking a routine, archiving an action or deleting a goal
removes it from every figure. One check-in per routine per day (existing unique constraint) and the 64-action cap
bound what repetition can add.

## 4. Achievements

| Key | Title | Criterion | Subject |
|---|---|---|---|
| founding_member | Founding Member | Holds a founding number | — |
| first_goal_completed | First Goal Completed | Has an achieved goal | — |
| goal_completed | Goal Completed | This goal is achieved | goal |
| plan_complete | Full Plan Built | 8 active key areas and 64 active actions | goal |
| actions_100 / actions_500 | 100 / 500 Actions Completed | Verified completions (§3) | — |
| active_days_30 / active_days_90 | 30 Days of Progress / 90 Days of Commitment | Distinct days with verified activity | — |
| challenge_completed | 30-Day Challenge Completed | A completed enrollment | goal + enrollment |

- `harada_private.sync_achievements(user)` reconciles: it inserts what qualifies and deletes what no longer does.
  A kept row keeps its first `earned_at` and `hidden`. One row per (user, key, goal, ref) (`unique nulls not distinct`).
- Deferred constraint triggers on goals, outcomes, actions, routine_checks, challenge_enrollments and
  founding_members run it once per owner per transaction, at commit. A sync failure is logged and never blocks the write.
- `earned_at` is the date of the qualifying evidence (achieved_at, the Nth completion, the Nth active day, grant date).
- Titles: `harada_private.achievement_title()` mirrors `src/application/achievements.ts` (test-guarded).
- **Self-reported vs verified:** every achievement above is verified. Posts of type `milestone` and
  `general_achievement` are the member's own words and are labelled "Self-reported".

## 5. Achievement posts

`create_social_post({type: 'achievement', achievementId, visibility?, body?})`: own achievement only; one post per
achievement (a second share returns the first); the title is the achievement's and cannot be edited (trigger); a
public post needs the linked goal to be public. Deleting the achievement (e.g. its goal) deletes the post.

## 6. Privacy rules (server-side, in `get_social_profile`)

- Private profile: credential only; no featured goal, no achievements, no posts.
- `show_progress_metrics = false`: others see the featured goal's title without figures.
- `show_achievements = false`: others see no achievements. `hidden` hides one.
- Goal-tied achievements show to others only while that goal is public.
- Reflections are never read by any of these functions.
- "View as public" applies the same rules for the owner.

## 7. Analytics

New events (server-recorded; `track_event` refuses them from clients): `profile_viewed`, `founding_badge_viewed`
(`record_profile_view`), `user_followed`, `progress_post_created` (props `kind` = post type), `achievement_shared`
(`kind` = achievement key), `goal_completed`. No ids, titles or text in props. `admin_community_metrics()` reports
30-day counts and distinct members per event, returning members (activity in ≥ 2 of the last 4 weeks), achievements
awarded, public profiles/goals, founding count; shown on `/admin`.

## 8. Other social changes

- `list_blocked_users()`; unblock from the owner's profile (web and mobile). Blocking asks for confirmation.
- Mobile: social RPCs now send `p_input` (they sent `p`, which matched no function signature, so every mobile social
  call failed against PostgREST).
