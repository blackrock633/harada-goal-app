/**
 * Drizzle mirror of the database schema, used to TYPE queries.
 *
 * The canonical schema is the SQL in supabase/migrations/ (it also holds RLS policies, triggers,
 * exclusion constraints and functions that Drizzle can't express). Keep this file in sync with it;
 * src/infrastructure/db/schema-sync.test.ts fails when a column here doesn't exist in the database.
 * Do NOT run drizzle-kit generate/push against Supabase.
 */
import {
  pgTable,
  text,
  uuid,
  timestamp,
  date,
  numeric,
  smallint,
  jsonb,
  uniqueIndex,
  index,
  check,
  pgSchema,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/** Mirrors auth.users just enough to type the FK; owned and managed by Supabase Auth. */
const auth = pgSchema('auth');
export const authUsers = auth.table('users', {
  id: uuid('id').primaryKey(),
});

export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey().references(() => authUsers.id, { onDelete: 'cascade' }),
  displayName: text('display_name').notNull(),
  timeZone: text('time_zone').notNull().default('UTC'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const goals = pgTable(
  'goals',
  {
    id: uuid('id').primaryKey(),
    ownerId: uuid('owner_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    vision: text('vision').notNull().default(''),
    successCriteria: text('success_criteria').notNull().default(''),
    targetDate: date('target_date', { mode: 'string' }),
    status: text('status').notNull(),
    statusBeforeArchive: text('status_before_archive'),
    purposeSelfTangible: text('purpose_self_tangible').notNull().default(''),
    purposeSelfIntangible: text('purpose_self_intangible').notNull().default(''),
    purposeOthersTangible: text('purpose_others_tangible').notNull().default(''),
    purposeOthersIntangible: text('purpose_others_intangible').notNull().default(''),
    activatedOn: date('activated_on', { mode: 'string' }),
    achievedAt: timestamp('achieved_at', { withTimezone: true, mode: 'date' }),
    archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    ownerStatusIdx: index('goals_owner_status_idx').on(table.ownerId, table.status),
    titleLenCheck: check('goals_title_len_check', sql`char_length(title) between 1 and 120`),
    statusCheck: check('goals_status_check', sql`status in ('draft','active','achieved','archived')`),
    statusBeforeArchiveCheck: check('goals_status_before_archive_check', sql`status_before_archive is null or status_before_archive in ('draft','active','achieved')`),
    archiveConsistencyCheck: check('goals_archive_consistency_check', sql`(status = 'archived') = (archived_at is not null and status_before_archive is not null)`),
  })
);

export const outcomes = pgTable(
  'outcomes',
  {
    id: uuid('id').primaryKey(),
    goalId: uuid('goal_id').notNull().references(() => goals.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    measureTarget: numeric('measure_target'),
    measureCurrent: numeric('measure_current'),
    measureUnit: text('measure_unit'),
    position: smallint('position'),
    archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    goalIdx: index('outcomes_goal_idx').on(table.goalId),
    titleLenCheck: check('outcomes_title_len_check', sql`char_length(title) between 1 and 120`),
    measureCheck: check('outcomes_measure_check', sql`(measure_target is null and measure_current is null and measure_unit is null) or (measure_target is not null and measure_current is not null and measure_target > 0 and measure_current >= 0)`),
    positionCheck: check('outcomes_position_check', sql`position between 0 and 7`),
    positionArchiveCheck: check('outcomes_position_archive_check', sql`(position is null) = (archived_at is not null)`),
  })
);

export const actions = pgTable(
  'actions',
  {
    id: uuid('id').primaryKey(),
    goalId: uuid('goal_id').notNull().references(() => goals.id, { onDelete: 'cascade' }),
    outcomeId: uuid('outcome_id').notNull(), // composite FK (outcome_id, goal_id) → outcomes(id, goal_id)
    title: text('title').notNull(),
    notes: text('notes').notNull().default(''),
    kind: text('kind').notNull(),
    position: smallint('position'),
    dueDate: date('due_date', { mode: 'string' }),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
    scheduleType: text('schedule_type'),
    scheduleDays: smallint('schedule_days').array(),
    scheduleTimesPerWeek: smallint('schedule_times_per_week'),
    startDate: date('start_date', { mode: 'string' }),
    archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    goalIdx: index('actions_goal_idx').on(table.goalId),
    outcomeIdx: index('actions_outcome_idx').on(table.outcomeId),
    titleLenCheck: check('actions_title_len_check', sql`char_length(title) between 1 and 160`),
    kindCheck: check('actions_kind_check', sql`kind in ('task','routine')`),
    positionCheck: check('actions_position_check', sql`position between 0 and 7`),
    positionArchiveCheck: check('actions_position_archive_check', sql`(position is null) = (archived_at is not null)`),
    scheduleTypeCheck: check('actions_schedule_type_check', sql`schedule_type is null or schedule_type in ('daily','weekdays','weekly')`),
    weeklyTimesCheck: check('actions_weekly_times_check', sql`schedule_times_per_week is null or (schedule_times_per_week between 1 and 7)`),
    kindConsistencyCheck: check('actions_kind_consistency_check', sql`
      (kind = 'task' and schedule_type is null and start_date is null) or
      (kind = 'routine' and schedule_type is not null and start_date is not null and due_date is null and completed_at is null)
    `),
  })
);

export const routineChecks = pgTable(
  'routine_checks',
  {
    id: uuid('id').primaryKey(),
    actionId: uuid('action_id').notNull().references(() => actions.id, { onDelete: 'cascade' }),
    date: date('date', { mode: 'string' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    actionDateUnique: uniqueIndex('routine_checks_action_date_unique').on(table.actionId, table.date),
  })
);

export const reflections = pgTable(
  'reflections',
  {
    id: uuid('id').primaryKey(),
    goalId: uuid('goal_id').notNull().references(() => goals.id, { onDelete: 'cascade' }),
    date: date('date', { mode: 'string' }).notNull(),
    kind: text('kind').notNull(),
    wentWell: text('went_well').notNull().default(''),
    didntGoWell: text('didnt_go_well').notNull().default(''),
    nextChange: text('next_change').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    goalDateIdx: index('reflections_goal_date_idx').on(table.goalId, table.date),
    kindCheck: check('reflections_kind_check', sql`kind in ('daily','weekly')`),
  })
);

export const goalEvents = pgTable(
  'goal_events',
  {
    id: uuid('id').primaryKey(),
    goalId: uuid('goal_id').notNull().references(() => goals.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    subjectId: uuid('subject_id'),
    summary: text('summary').notNull(),
    data: jsonb('data').notNull().default('{}'),
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    goalTimeIdx: index('goal_events_goal_time_idx').on(table.goalId, table.occurredAt),
  })
);

export const dailyFocus = pgTable(
  'daily_focus',
  {
    id: uuid('id').primaryKey(),
    ownerId: uuid('owner_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
    actionId: uuid('action_id').notNull().references(() => actions.id, { onDelete: 'cascade' }),
    date: date('date', { mode: 'string' }).notNull(),
    slot: smallint('slot').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    ownerDateIdx: index('daily_focus_owner_date_idx').on(table.ownerId, table.date),
  })
);
