/**
 * Table rows as returned by PostgREST / supabase-js (snake_case JSON) -> domain entities.
 * Pure and relative-import-only: shared with mobile/, so native reads feed the same read model
 * (read-model.ts) as the web server. Columns per table: API_CONTRACTS §7.
 *
 * JSON shapes: timestamptz arrives as an ISO string, date as 'YYYY-MM-DD', numeric as a number (or a
 * string when a driver returns it that way), smallint[] as number[]. Mappers accept both string and Date
 * instants so they also work on rows read by other drivers.
 */
import type {
  Action,
  DailyFocus,
  Goal,
  GoalEvent,
  GoalEventType,
  GoalStatus,
  Outcome,
  Reflection,
  ReflectionKind,
  RestorableGoalStatus,
  RoutineCheck,
  Schedule,
  Weekday,
} from '../domain/types.js';

type Instant = string | Date;
type Numeric = number | string;

export interface GoalRow {
  id: string;
  owner_id: string;
  title: string;
  vision: string;
  success_criteria: string;
  target_date: string | null;
  status: string;
  status_before_archive: string | null;
  purpose_self_tangible: string;
  purpose_self_intangible: string;
  purpose_others_tangible: string;
  purpose_others_intangible: string;
  activated_on: string | null;
  achieved_at: Instant | null;
  archived_at: Instant | null;
  created_at: Instant;
  updated_at: Instant;
}

export interface OutcomeRow {
  id: string;
  goal_id: string;
  title: string;
  description: string;
  measure_target: Numeric | null;
  measure_current: Numeric | null;
  measure_unit: string | null;
  position: number | null;
  archived_at: Instant | null;
  created_at: Instant;
  updated_at: Instant;
}

export interface ActionRow {
  id: string;
  goal_id: string;
  outcome_id: string;
  title: string;
  notes: string;
  kind: string;
  position: number | null;
  due_date: string | null;
  completed_at: Instant | null;
  schedule_type: string | null;
  schedule_days: number[] | null;
  schedule_times_per_week: number | null;
  start_date: string | null;
  archived_at: Instant | null;
  created_at: Instant;
  updated_at: Instant;
}

export interface RoutineCheckRow {
  id: string;
  action_id: string;
  date: string;
  created_at: Instant;
}

export interface DailyFocusRow {
  id: string;
  owner_id: string;
  action_id: string;
  date: string;
  slot: number;
  created_at: Instant;
}

export interface ReflectionRow {
  id: string;
  goal_id: string;
  date: string;
  kind: string;
  went_well: string;
  didnt_go_well: string;
  next_change: string;
  created_at: Instant;
  updated_at: Instant;
}

export interface GoalEventRow {
  id: string;
  goal_id: string;
  type: string;
  subject_id: string | null;
  summary: string;
  data: Record<string, unknown> | null;
  occurred_at: Instant;
}

export interface ProfileRow {
  id: string;
  display_name: string;
  time_zone: string;
  created_at: Instant;
  updated_at: Instant;
}

/** Column lists for `.select()`, so the native read layer asks for exactly what the mappers use. */
export const SELECT_COLUMNS = {
  goals:
    'id,owner_id,title,vision,success_criteria,target_date,status,status_before_archive,purpose_self_tangible,purpose_self_intangible,purpose_others_tangible,purpose_others_intangible,activated_on,achieved_at,archived_at,created_at,updated_at',
  outcomes: 'id,goal_id,title,description,measure_target,measure_current,measure_unit,position,archived_at,created_at,updated_at',
  actions:
    'id,goal_id,outcome_id,title,notes,kind,position,due_date,completed_at,schedule_type,schedule_days,schedule_times_per_week,start_date,archived_at,created_at,updated_at',
  routine_checks: 'id,action_id,date,created_at',
  daily_focus: 'id,owner_id,action_id,date,slot,created_at',
  reflections: 'id,goal_id,date,kind,went_well,didnt_go_well,next_change,created_at,updated_at',
  goal_events: 'id,goal_id,type,subject_id,summary,data,occurred_at',
  profiles: 'id,display_name,time_zone,created_at,updated_at',
} as const;

const instant = (v: Instant): Date => (v instanceof Date ? v : new Date(v));
const instantOrNull = (v: Instant | null): Date | null => (v === null ? null : instant(v));
/** A `date` column; tolerates drivers that return a Date at UTC midnight. */
const localDate = (v: string | Date): string => (v instanceof Date ? v.toISOString().slice(0, 10) : v);
const localDateOrNull = (v: string | Date | null): string | null => (v === null ? null : localDate(v));

export function goalFromRow(r: GoalRow): Goal {
  return {
    id: r.id,
    ownerId: r.owner_id,
    title: r.title,
    vision: r.vision,
    successCriteria: r.success_criteria,
    targetDate: localDateOrNull(r.target_date),
    status: r.status as GoalStatus,
    statusBeforeArchive: r.status_before_archive as RestorableGoalStatus | null,
    purpose: {
      selfTangible: r.purpose_self_tangible,
      selfIntangible: r.purpose_self_intangible,
      othersTangible: r.purpose_others_tangible,
      othersIntangible: r.purpose_others_intangible,
    },
    activatedOn: localDateOrNull(r.activated_on),
    achievedAt: instantOrNull(r.achieved_at),
    archivedAt: instantOrNull(r.archived_at),
    createdAt: instant(r.created_at),
    updatedAt: instant(r.updated_at),
  };
}

export function outcomeFromRow(r: OutcomeRow): Outcome {
  const hasMeasure = r.measure_target !== null && r.measure_current !== null;
  return {
    id: r.id,
    goalId: r.goal_id,
    title: r.title,
    description: r.description,
    measure: hasMeasure
      ? { target: Number(r.measure_target), current: Number(r.measure_current), unit: r.measure_unit ?? '' }
      : null,
    position: r.position,
    archivedAt: instantOrNull(r.archived_at),
    createdAt: instant(r.created_at),
    updatedAt: instant(r.updated_at),
  };
}

function scheduleFromRow(r: ActionRow): Schedule | null {
  switch (r.schedule_type) {
    case 'daily':
      return { type: 'daily' };
    case 'weekdays':
      return { type: 'weekdays', days: (r.schedule_days ?? []).map(Number) as Weekday[] };
    case 'weekly':
      return { type: 'weekly', timesPerWeek: Number(r.schedule_times_per_week) };
    default:
      return null;
  }
}

export function actionFromRow(r: ActionRow): Action {
  return {
    id: r.id,
    goalId: r.goal_id,
    outcomeId: r.outcome_id,
    title: r.title,
    notes: r.notes,
    kind: r.kind as Action['kind'],
    position: r.position,
    dueDate: localDateOrNull(r.due_date),
    completedAt: instantOrNull(r.completed_at),
    schedule: scheduleFromRow(r),
    startDate: localDateOrNull(r.start_date),
    archivedAt: instantOrNull(r.archived_at),
    createdAt: instant(r.created_at),
    updatedAt: instant(r.updated_at),
  };
}

export function routineCheckFromRow(r: RoutineCheckRow): RoutineCheck {
  return { id: r.id, actionId: r.action_id, date: localDate(r.date), createdAt: instant(r.created_at) };
}

export function dailyFocusFromRow(r: DailyFocusRow): DailyFocus {
  return {
    id: r.id,
    ownerId: r.owner_id,
    actionId: r.action_id,
    date: localDate(r.date),
    slot: r.slot,
    createdAt: instant(r.created_at),
  };
}

export function reflectionFromRow(r: ReflectionRow): Reflection {
  return {
    id: r.id,
    goalId: r.goal_id,
    date: localDate(r.date),
    kind: r.kind as ReflectionKind,
    wentWell: r.went_well,
    didntGoWell: r.didnt_go_well,
    nextChange: r.next_change,
    createdAt: instant(r.created_at),
    updatedAt: instant(r.updated_at),
  };
}

export function goalEventFromRow(r: GoalEventRow): GoalEvent {
  return {
    id: r.id,
    goalId: r.goal_id,
    type: r.type as GoalEventType,
    subjectId: r.subject_id,
    summary: r.summary,
    data: r.data ?? {},
    occurredAt: instant(r.occurred_at),
  };
}
