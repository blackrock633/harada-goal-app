# Database — Harada Goal App

> **Status: CANONICAL.** Implemented in `src/infrastructure/db/schema.ts` (Drizzle) with SQL
> migrations in `drizzle/`. Domain concepts are defined in `DOMAIN_MODEL.md`.

## Engine

- **PostgreSQL 15+** in production (`DATABASE_URL=postgres://…`).
- **PGlite** (embedded Postgres, WASM) for local development and tests:
  - `DATABASE_URL=pglite://.data/dev` → file-backed database in `.data/dev` (git-ignored)
  - `DATABASE_URL=memory://` → in-memory (tests)
  - Default when unset: `pglite://.data/dev` in development; **required** in production.
- The same Drizzle schema and SQL migrations run on both.

## Conventions

- Table names are `snake_case` plurals; columns `snake_case`. Drizzle maps them to camelCase.
- Primary keys: `uuid` (generated in app with `crypto.randomUUID()`).
- Timestamps: `timestamptz` (`created_at`, `updated_at` default `now()`).
- Local dates: `date` columns, read and written as `'YYYY-MM-DD'` strings (Drizzle `mode: 'string'`).
- Every user-owned row is reachable from `users.id`. **Every repository query is scoped by `owner_id`/`user_id`.**
- FK deletes: `ON DELETE CASCADE` from parents to children (only reached via an explicit permanent goal delete or account deletion).

## Tables

### `users`
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| email | text not null | stored lowercased + trimmed |
| password_hash | text not null | Argon2id |
| display_name | text not null | 1..80 |
| time_zone | text not null default 'UTC' | IANA name, validated with `Intl` |
| created_at / updated_at | timestamptz | |

Unique index: `users_email_unique (email)`.

### `sessions`
| column | type | notes |
|---|---|---|
| id | text pk | SHA-256 hex of the random session token (token never stored) |
| user_id | uuid not null → users.id cascade | |
| expires_at | timestamptz not null | 30 days, sliding (renewed when < 15 days remain) |
| created_at | timestamptz | |

Index: `sessions_user_id_idx (user_id)`.

### `goals`
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| owner_id | uuid not null → users.id cascade | |
| title | text not null | check `char_length(title) between 1 and 120` |
| vision | text not null default '' | |
| target_date | date null | |
| status | text not null | check in ('draft','active','achieved','archived') |
| status_before_archive | text null | check null or in ('draft','active','achieved') |
| purpose_self_tangible | text not null default '' | |
| purpose_self_intangible | text not null default '' | |
| purpose_others_tangible | text not null default '' | |
| purpose_others_intangible | text not null default '' | |
| activated_on | date null | |
| achieved_at | timestamptz null | |
| archived_at | timestamptz null | |
| created_at / updated_at | timestamptz | |

Index: `goals_owner_status_idx (owner_id, status)`.
Check: `(status = 'archived') = (archived_at is not null and status_before_archive is not null)`.

### `outcomes`
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| goal_id | uuid not null → goals.id cascade | |
| title | text not null | 1..120 |
| description | text not null default '' | |
| measure_target | numeric null | > 0 |
| measure_current | numeric null | >= 0 |
| measure_unit | text null | |
| position | smallint null | check between 0 and 107 (0..7 at rest; 100+ only transiently during reorder) |
| archived_at | timestamptz null | |
| created_at / updated_at | timestamptz | |

- Check: measure columns all null or (target and current not null).
- Check: `(position is null) = (archived_at is not null)`.
- **Partial unique index** `outcomes_goal_position_unique (goal_id, position) WHERE archived_at IS NULL`. This backs the max-8 and density invariants under concurrency.
- Index: `outcomes_goal_idx (goal_id)`.
- Numeric values are read as strings by drivers; repositories convert to `number`.

### `actions`
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| goal_id | uuid not null → goals.id cascade | denormalised for per-goal queries |
| outcome_id | uuid not null → outcomes.id cascade | |
| title | text not null | 1..160 |
| notes | text not null default '' | |
| kind | text not null | check in ('task','routine') |
| position | smallint null | check between 0 and 107 (0..7 at rest; 100+ only transiently during reorder) |
| due_date | date null | |
| completed_at | timestamptz null | |
| schedule_type | text null | check null or in ('daily','weekdays','weekly') |
| schedule_days | smallint[] null | weekdays type only |
| schedule_times_per_week | smallint null | check between 1 and 7; weekly type only |
| start_date | date null | |
| archived_at | timestamptz null | |
| created_at / updated_at | timestamptz | |

- Check (kind consistency):
  `kind = 'task'` ⇒ `schedule_type is null and start_date is null`;
  `kind = 'routine'` ⇒ `schedule_type is not null and start_date is not null and due_date is null and completed_at is null`.
- Check: `(position is null) = (archived_at is not null)`.
- **Partial unique index** `actions_outcome_position_unique (outcome_id, position) WHERE archived_at IS NULL`.
- Indexes: `actions_goal_idx (goal_id)`, `actions_outcome_idx (outcome_id)`.

> **Reordering and unique positions:** because the partial unique index is not deferrable, reorders
> run inside a transaction in two steps: (1) set the affected rows to `position + 100` (the check
> constraint is relaxed to `position between 0 and 107` to allow this), then (2) write the final positions.

### `routine_checks`
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| action_id | uuid not null → actions.id cascade | |
| date | date not null | |
| created_at | timestamptz | |

Unique index: `routine_checks_action_date_unique (action_id, date)`. Insert uses `ON CONFLICT DO NOTHING` (idempotent).

### `reflections`
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| goal_id | uuid not null → goals.id cascade | |
| date | date not null | |
| kind | text not null | check in ('daily','weekly') |
| went_well / didnt_go_well / next_change | text not null default '' | |
| created_at / updated_at | timestamptz | |

Index: `reflections_goal_date_idx (goal_id, date desc)`.

### `goal_events`
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| goal_id | uuid not null → goals.id cascade | |
| type | text not null | see DOMAIN_MODEL §3.6 |
| subject_id | uuid null | |
| summary | text not null | |
| data | jsonb not null default '{}' | |
| occurred_at | timestamptz not null default now() | |

Index: `goal_events_goal_time_idx (goal_id, occurred_at desc)`.

## Ownership and isolation

Ownership is always checked from the **goal** (`goals.owner_id = :userId`). Repository methods for
outcomes, actions, checks, reflections, and events either:
1. accept `userId` and join to `goals` on `owner_id`, or
2. are called only after the use case has loaded the parent goal scoped by `userId` in the same transaction.

A resource owned by another user is reported as `NOT_FOUND` (never `FORBIDDEN`), so existence isn't leaked.

## Migrations

- Generated with `npm run db:generate` (drizzle-kit) into `drizzle/` and committed.
- Applied by `npm run db:migrate` (production) and automatically on first connection for PGlite (dev/test).
- Migrations are forward-only and must not drop user data without an explicit data-preserving step.

## Deletion policy

| Entity | User-facing delete | Mechanism |
|---|---|---|
| Goal | Archive (reversible) → permanent delete only from archived, with typed confirmation | soft → hard |
| Outcome | Archive / restore | soft |
| Action | Archive / restore | soft |
| RoutineCheck | Uncheck | hard (single fact, trivially re-creatable) |
| Reflection | Delete with confirmation | hard |
| Account | Delete with password + typed confirmation; export offered first | hard cascade |
