/**
 * DTOs returned across the application boundary to the UI (docs/API_CONTRACTS.md §2).
 * Plain serialisable objects: Instants are ISO strings, LocalDates are 'YYYY-MM-DD'.
 * CONTRACT FILE — the UI builds against these types.
 *
 * Progress semantics (three separate numbers, never blended; domain owns the math):
 *  - metrics.planning    filled/72 plan completeness (never null).
 *  - metrics.execution   mean action-level progress (task 0|1, routine 28-day adherence); null if none measurable.
 *  - metrics.attainment  mean clamp(current/target) over outcomes WITH a measure; null if none. Pace derives
 *                        from attainment only. Action completion never feeds attainment.
 *  - OutcomeDTO.execution / .attainment are the same two numbers at outcome level.
 *  - ActionDTO.progress  is the action-level value feeding execution.
 *
 * Matrix shape: GoalDetailDTO.matrix.outcomes is always length 8, indexed by outcome position (0..7);
 * an empty cell is `null` (no row exists in the database). Each OutcomeDTO.slots is length 8, indexed by
 * action position, `null` for empty cells. Active positions may have gaps (archiving does not compact).
 * `outcomes` / `actions` remain dense lists ordered by position for list-style rendering.
 */
import type {
  ActionKind,
  GoalEventType,
  GoalStatus,
  Id,
  LocalDate,
  Measure,
  Pace,
  Progress,
  Purpose,
  ReflectionKind,
  Schedule,
} from '@/domain/types';

type ISO = string;

export interface UserDTO {
  id: Id;
  email: string;
  displayName: string;
  timeZone: string;
}

export interface GoalFieldsDTO {
  id: Id;
  title: string;
  vision: string;
  successCriteria: string;
  targetDate: LocalDate | null;
  status: GoalStatus;
  purpose: Purpose;
  activatedOn: LocalDate | null;
  achievedAt: ISO | null;
  archivedAt: ISO | null;
  createdAt: ISO;
  updatedAt: ISO;
}

export interface PlanningDTO {
  filled: number;
  total: number;
  ratio: number;
}

export interface GoalMetricsDTO {
  planning: PlanningDTO;
  execution: number | null;
  completedTasks: number;
  totalTasks: number;
  routineCount: number;
  attainment: number | null;
}

export interface GoalSummaryDTO {
  id: Id;
  title: string;
  status: GoalStatus;
  targetDate: LocalDate | null;
  activatedOn: LocalDate | null;
  updatedAt: ISO;
  metrics: GoalMetricsDTO;
  pace: Pace;
  outcomeCount: number;
  actionCount: number;
  openTaskCount: number;
  dueTodayCount: number;
  lastReflectedOn: LocalDate | null;
  /**
   * Tasks (non-archived) whose completed_at falls in the current ISO week (Monday start) in the user's
   * time zone. Based on actions.completed_at, so a reopened task no longer counts.
   */
  completedThisWeek: number;
}

export interface OutcomeFieldsDTO {
  id: Id;
  goalId: Id;
  title: string;
  description: string;
  measure: Measure | null;
  position: number | null;
  archivedAt: ISO | null;
  createdAt: ISO;
  updatedAt: ISO;
}

export interface ActionFieldsDTO {
  id: Id;
  goalId: Id;
  outcomeId: Id;
  title: string;
  notes: string;
  kind: ActionKind;
  position: number | null;
  dueDate: LocalDate | null;
  completedAt: ISO | null;
  schedule: Schedule | null;
  startDate: LocalDate | null;
  archivedAt: ISO | null;
  createdAt: ISO;
  updatedAt: ISO;
}

export interface ActionDTO extends ActionFieldsDTO {
  progress: Progress;
  /** Routines: due today per schedule (false for tasks). */
  dueToday: boolean;
  /** Routines: checked today (false for tasks). */
  checkedToday: boolean;
  /** Routines: informational streak (0 for tasks). */
  streak: number;
  /** Routines: checked dates within the last 35 days, ascending. */
  recentChecks: LocalDate[];
}

export interface OutcomeDTO extends OutcomeFieldsDTO {
  execution: Progress;
  attainment: Progress;
  actions: ActionDTO[];
  /** Length 8, indexed by action position; null = empty cell. */
  slots: (ActionDTO | null)[];
}

export interface MatrixDTO {
  /** Length 8, indexed by outcome position; null = empty cell. */
  outcomes: (OutcomeDTO | null)[];
}

export interface GoalDetailDTO extends GoalFieldsDTO {
  metrics: GoalMetricsDTO;
  pace: Pace;
  outcomes: OutcomeDTO[];
  matrix: MatrixDTO;
  archivedOutcomes: OutcomeFieldsDTO[];
  archivedActions: (ActionFieldsDTO & { outcomeTitle: string })[];
}

export interface NextItemDTO {
  action: ActionDTO;
  goalId: Id;
  goalTitle: string;
  outcomeId: Id;
  outcomeTitle: string;
  /** Outcome slot 0..7 (next items only come from active outcomes). */
  outcomePosition: number;
  overdue: boolean;
}

export interface TodayDTO {
  today: LocalDate;
  next: NextItemDTO[];
  doneToday: NextItemDTO[];
  goals: GoalSummaryDTO[];
  draftGoals: GoalSummaryDTO[];
  hasAnyGoals: boolean;
}

export interface ReflectionDTO {
  id: Id;
  goalId: Id;
  date: LocalDate;
  kind: ReflectionKind;
  wentWell: string;
  didntGoWell: string;
  nextChange: string;
  createdAt: ISO;
  updatedAt: ISO;
}

export interface GoalEventDTO {
  id: Id;
  goalId: Id;
  type: GoalEventType;
  subjectId: Id | null;
  summary: string;
  data: Record<string, unknown>;
  occurredAt: ISO;
}

export interface RoutineSheetRowDTO {
  action: ActionFieldsDTO & { outcomeTitle: string };
  scheduledDates: LocalDate[];
  checkedDates: LocalDate[];
}

export interface RoutineSheetDTO {
  month: string; // YYYY-MM
  today: LocalDate;
  rows: RoutineSheetRowDTO[];
}

export interface TemplateSummaryDTO {
  id: string;
  name: string;
  summary: string;
  outcomeCount: number;
  actionCount: number;
}
