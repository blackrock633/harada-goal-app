/**
 * DTOs returned across the application boundary to the UI (docs/API_CONTRACTS.md §2).
 * Plain serialisable objects: Instants are ISO strings, LocalDates are 'YYYY-MM-DD'.
 * CONTRACT FILE — the UI builds against these types.
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
  targetDate: LocalDate | null;
  status: GoalStatus;
  purpose: Purpose;
  activatedOn: LocalDate | null;
  achievedAt: ISO | null;
  archivedAt: ISO | null;
  createdAt: ISO;
  updatedAt: ISO;
}

export interface GoalSummaryDTO {
  id: Id;
  title: string;
  status: GoalStatus;
  targetDate: LocalDate | null;
  activatedOn: LocalDate | null;
  updatedAt: ISO;
  progress: Progress;
  pace: Pace;
  outcomeCount: number;
  actionCount: number;
  openTaskCount: number;
  dueTodayCount: number;
  lastReflectedOn: LocalDate | null;
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
  progress: Progress;
  actions: ActionDTO[];
}

export interface GoalDetailDTO extends GoalFieldsDTO {
  progress: Progress;
  pace: Pace;
  outcomes: OutcomeDTO[];
  archivedOutcomes: OutcomeFieldsDTO[];
  archivedActions: (ActionFieldsDTO & { outcomeTitle: string })[];
}

export interface NextItemDTO {
  action: ActionDTO;
  goalId: Id;
  goalTitle: string;
  outcomeId: Id;
  outcomeTitle: string;
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
