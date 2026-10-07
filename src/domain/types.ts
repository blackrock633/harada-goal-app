/**
 * Canonical domain types. Mirrors docs/DOMAIN_MODEL.md exactly.
 * CONTRACT FILE — change only via the protocol in docs/ARCHITECTURE.md §7.
 */

export type Id = string;
/** Calendar date in the user's time zone, formatted 'YYYY-MM-DD'. */
export type LocalDate = string;
/** Absolute timestamp. */
export type Instant = Date;
/** 0 = Sunday … 6 = Saturday */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

// ---------- Goal ----------

export type GoalStatus = 'draft' | 'active' | 'achieved' | 'archived';
export type RestorableGoalStatus = Exclude<GoalStatus, 'archived'>;

export interface Purpose {
  selfTangible: string;
  selfIntangible: string;
  othersTangible: string;
  othersIntangible: string;
}

export interface Goal {
  id: Id;
  ownerId: Id;
  title: string;
  vision: string;
  targetDate: LocalDate | null;
  status: GoalStatus;
  statusBeforeArchive: RestorableGoalStatus | null;
  purpose: Purpose;
  activatedOn: LocalDate | null;
  achievedAt: Instant | null;
  archivedAt: Instant | null;
  createdAt: Instant;
  updatedAt: Instant;
}

// ---------- Outcome ----------

export interface Measure {
  target: number;
  current: number;
  unit: string;
}

export interface Outcome {
  id: Id;
  goalId: Id;
  title: string;
  description: string;
  measure: Measure | null;
  /** 0..7 while active; null while archived. */
  position: number | null;
  archivedAt: Instant | null;
  createdAt: Instant;
  updatedAt: Instant;
}

// ---------- Action ----------

export type ActionKind = 'task' | 'routine';

export type Schedule =
  | { type: 'daily' }
  | { type: 'weekdays'; days: Weekday[] }
  | { type: 'weekly'; timesPerWeek: number };

export interface Action {
  id: Id;
  goalId: Id;
  outcomeId: Id;
  title: string;
  notes: string;
  kind: ActionKind;
  /** 0..7 while active; null while archived. */
  position: number | null;
  dueDate: LocalDate | null;
  completedAt: Instant | null;
  schedule: Schedule | null;
  startDate: LocalDate | null;
  archivedAt: Instant | null;
  createdAt: Instant;
  updatedAt: Instant;
}

// ---------- RoutineCheck ----------

export interface RoutineCheck {
  id: Id;
  actionId: Id;
  date: LocalDate;
  createdAt: Instant;
}

// ---------- Reflection ----------

export type ReflectionKind = 'daily' | 'weekly';

export interface Reflection {
  id: Id;
  goalId: Id;
  date: LocalDate;
  kind: ReflectionKind;
  wentWell: string;
  didntGoWell: string;
  nextChange: string;
  createdAt: Instant;
  updatedAt: Instant;
}

// ---------- GoalEvent ----------

export type GoalEventType =
  | 'goal_created'
  | 'goal_updated'
  | 'goal_activated'
  | 'goal_achieved'
  | 'goal_reopened'
  | 'goal_archived'
  | 'goal_restored'
  | 'outcome_added'
  | 'outcome_updated'
  | 'outcome_archived'
  | 'outcome_restored'
  | 'outcomes_reordered'
  | 'measure_updated'
  | 'action_added'
  | 'action_updated'
  | 'action_archived'
  | 'action_restored'
  | 'action_moved'
  | 'actions_reordered'
  | 'action_completed'
  | 'action_reopened';

export interface GoalEvent {
  id: Id;
  goalId: Id;
  type: GoalEventType;
  subjectId: Id | null;
  summary: string;
  data: Record<string, unknown>;
  occurredAt: Instant;
}

// ---------- User (identity, used by application/infrastructure) ----------

export interface User {
  id: Id;
  email: string;
  displayName: string;
  timeZone: string;
  createdAt: Instant;
  updatedAt: Instant;
}

// ---------- Derived ----------

/** Progress in [0,1] or null when not yet measurable. */
export type Progress = number | null;
export type Pace = 'ahead' | 'on_track' | 'behind' | 'overdue' | 'unknown';
