/**
 * Shared read-side assembly: domain entities -> DTOs, with batched loading (no N+1).
 * Used by queries and by commands that return a refreshed GoalDetailDTO / OutcomeDTO / ActionDTO.
 */
import type { Action, Goal, Id, LocalDate, Outcome, Reflection, GoalEvent } from '@/domain/types';
import { addDays, isoWeekEnd, isoWeekStart, localDateInZone } from '@/domain/dates';
import { computeGoalMetrics, routineStreak, actionProgress, type GoalMetrics } from '@/domain/progress';
import { isDueToday } from '@/domain/next';
import { MAX_ACTIONS_PER_OUTCOME, MAX_OUTCOMES_PER_GOAL } from '@/domain/limits';
import type { Repos } from '../ports';
import type {
  ActionDTO,
  ActionFieldsDTO,
  GoalDetailDTO,
  GoalEventDTO,
  GoalFieldsDTO,
  GoalMetricsDTO,
  GoalSummaryDTO,
  OutcomeDTO,
  OutcomeFieldsDTO,
  ReflectionDTO,
} from '../dto';

export const RECENT_CHECK_DAYS = 35;

export const iso = (d: Date) => d.toISOString();

export function goalFieldsDTO(g: Goal): GoalFieldsDTO {
  return {
    id: g.id,
    title: g.title,
    vision: g.vision,
    successCriteria: g.successCriteria,
    targetDate: g.targetDate,
    status: g.status,
    purpose: { ...g.purpose },
    activatedOn: g.activatedOn,
    achievedAt: g.achievedAt ? iso(g.achievedAt) : null,
    archivedAt: g.archivedAt ? iso(g.archivedAt) : null,
    createdAt: iso(g.createdAt),
    updatedAt: iso(g.updatedAt),
  };
}

export function outcomeFieldsDTO(o: Outcome): OutcomeFieldsDTO {
  return {
    id: o.id,
    goalId: o.goalId,
    title: o.title,
    description: o.description,
    measure: o.measure ? { ...o.measure } : null,
    position: o.position,
    archivedAt: o.archivedAt ? iso(o.archivedAt) : null,
    createdAt: iso(o.createdAt),
    updatedAt: iso(o.updatedAt),
  };
}

export function actionFieldsDTO(a: Action): ActionFieldsDTO {
  return {
    id: a.id,
    goalId: a.goalId,
    outcomeId: a.outcomeId,
    title: a.title,
    notes: a.notes,
    kind: a.kind,
    position: a.position,
    dueDate: a.dueDate,
    completedAt: a.completedAt ? iso(a.completedAt) : null,
    schedule: a.schedule ? ({ ...a.schedule } as Action['schedule']) : null,
    startDate: a.startDate,
    archivedAt: a.archivedAt ? iso(a.archivedAt) : null,
    createdAt: iso(a.createdAt),
    updatedAt: iso(a.updatedAt),
  };
}

export function actionDTO(a: Action, checks: LocalDate[], today: LocalDate): ActionDTO {
  const windowStart = addDays(today, -(RECENT_CHECK_DAYS - 1));
  const recent = checks.filter((d) => d >= windowStart && d <= today).sort();
  return {
    ...actionFieldsDTO(a),
    progress: actionProgress(a, checks, today),
    dueToday: isDueToday(a, checks, today),
    checkedToday: a.kind === 'routine' && checks.includes(today),
    streak: routineStreak(a, checks, today),
    recentChecks: recent,
  };
}

export function reflectionDTO(r: Reflection): ReflectionDTO {
  return {
    id: r.id,
    goalId: r.goalId,
    date: r.date,
    kind: r.kind,
    wentWell: r.wentWell,
    didntGoWell: r.didntGoWell,
    nextChange: r.nextChange,
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
  };
}

export function eventDTO(e: GoalEvent): GoalEventDTO {
  return {
    id: e.id,
    goalId: e.goalId,
    type: e.type,
    subjectId: e.subjectId,
    summary: e.summary,
    data: e.data,
    occurredAt: iso(e.occurredAt),
  };
}

export interface Graph {
  outcomes: Outcome[];
  actions: Action[];
  checks: Map<Id, LocalDate[]>;
}

/** 2 batched queries for structure + 1 for recent checks of active actions. */
export async function loadGraph(repos: Repos, goalIds: Id[], today: LocalDate): Promise<Graph> {
  if (goalIds.length === 0) return { outcomes: [], actions: [], checks: new Map() };
  const [outcomes, actions] = await Promise.all([
    repos.outcomes.listByGoals(goalIds),
    repos.actions.listByGoals(goalIds),
  ]);
  const routineIds = actions.filter((a) => a.archivedAt === null && a.kind === 'routine').map((a) => a.id);
  const rows = routineIds.length
    ? await repos.checks.listForActions(routineIds, addDays(today, -(RECENT_CHECK_DAYS - 1)), today)
    : [];
  const checks = new Map<Id, LocalDate[]>();
  for (const c of rows) {
    const list = checks.get(c.actionId);
    if (list) list.push(c.date);
    else checks.set(c.actionId, [c.date]);
  }
  return { outcomes, actions, checks };
}

export function forGoal(graph: Graph, goalId: Id): Graph {
  return {
    outcomes: graph.outcomes.filter((o) => o.goalId === goalId),
    actions: graph.actions.filter((a) => a.goalId === goalId),
    checks: graph.checks,
  };
}

const byPosition = <T extends { position: number | null }>(a: T, b: T) =>
  (a.position ?? 99) - (b.position ?? 99);

export function metricsDTO(m: GoalMetrics, actions: Action[]): GoalMetricsDTO {
  const activeOutcomeIds = new Set(m.outcomes.map((o) => o.outcomeId));
  const routineCount = actions.filter(
    (a) => a.archivedAt === null && a.kind === 'routine' && activeOutcomeIds.has(a.outcomeId),
  ).length;
  return {
    planning: { ...m.planning },
    execution: m.execution.value,
    completedTasks: m.execution.completedTasks,
    totalTasks: m.execution.totalTasks,
    routineCount,
    attainment: m.attainment,
  };
}

function outcomeDTO(
  o: Outcome,
  actions: Action[],
  checks: Map<Id, LocalDate[]>,
  today: LocalDate,
  m: GoalMetrics,
): OutcomeDTO {
  const mine = actions
    .filter((a) => a.outcomeId === o.id && a.archivedAt === null)
    .sort(byPosition)
    .map((a) => actionDTO(a, checks.get(a.id) ?? [], today));
  const slots: (ActionDTO | null)[] = Array.from({ length: MAX_ACTIONS_PER_OUTCOME }, () => null);
  for (const a of mine) if (a.position !== null && a.position >= 0 && a.position < slots.length) slots[a.position] = a;
  const om = m.outcomes.find((x) => x.outcomeId === o.id);
  return {
    ...outcomeFieldsDTO(o),
    execution: om?.execution.value ?? null,
    attainment: om?.attainment ?? null,
    actions: mine,
    slots,
  };
}

export function buildGoalDetail(goal: Goal, g: Graph, today: LocalDate): GoalDetailDTO {
  const m = computeGoalMetrics(goal, g.outcomes, g.actions, g.checks, today);
  const active = g.outcomes.filter((o) => o.archivedAt === null).sort(byPosition);
  const outcomes = active.map((o) => outcomeDTO(o, g.actions, g.checks, today, m));
  const matrix: (OutcomeDTO | null)[] = Array.from({ length: MAX_OUTCOMES_PER_GOAL }, () => null);
  for (const o of outcomes) if (o.position !== null && o.position >= 0 && o.position < matrix.length) matrix[o.position] = o;
  const titleById = new Map(g.outcomes.map((o) => [o.id, o.title]));
  return {
    ...goalFieldsDTO(goal),
    metrics: metricsDTO(m, g.actions),
    pace: m.pace,
    outcomes,
    matrix: { outcomes: matrix },
    archivedOutcomes: g.outcomes.filter((o) => o.archivedAt !== null).map(outcomeFieldsDTO),
    archivedActions: g.actions
      .filter((a) => a.archivedAt !== null)
      .map((a) => ({ ...actionFieldsDTO(a), outcomeTitle: titleById.get(a.outcomeId) ?? '' })),
  };
}

export async function loadGoalDetail(repos: Repos, goal: Goal, today: LocalDate): Promise<GoalDetailDTO> {
  return buildGoalDetail(goal, await loadGraph(repos, [goal.id], today), today);
}

export async function loadOutcomeDTO(repos: Repos, goal: Goal, outcomeId: Id, today: LocalDate): Promise<OutcomeDTO> {
  const detail = await loadGoalDetail(repos, goal, today);
  const found = detail.outcomes.find((o) => o.id === outcomeId);
  if (!found) throw new Error('Outcome missing after write');
  return found;
}

export async function loadActionDTO(repos: Repos, action: Action, today: LocalDate): Promise<ActionDTO> {
  const rows =
    action.kind === 'routine'
      ? await repos.checks.listForActions([action.id], addDays(today, -(RECENT_CHECK_DAYS - 1)), today)
      : [];
  return actionDTO(action, rows.map((c) => c.date), today);
}

/** Summaries for many goals using batched queries only. */
export async function buildSummaries(
  repos: Repos,
  goals: Goal[],
  today: LocalDate,
  timeZone: string,
  graph?: Graph,
): Promise<GoalSummaryDTO[]> {
  if (goals.length === 0) return [];
  const ids = goals.map((g) => g.id);
  const [g, lastReflected] = await Promise.all([
    graph ?? loadGraph(repos, ids, today),
    repos.reflections.latestDateByGoals(ids),
  ]);
  const weekStart = isoWeekStart(today);
  const weekEnd = isoWeekEnd(today);
  return goals.map((goal) => {
    const sub = forGoal(g, goal.id);
    const m = computeGoalMetrics(goal, sub.outcomes, sub.actions, sub.checks, today);
    const activeOutcomeIds = new Set(sub.outcomes.filter((o) => o.archivedAt === null).map((o) => o.id));
    const live = sub.actions.filter((a) => a.archivedAt === null && activeOutcomeIds.has(a.outcomeId));
    const openTasks = live.filter((a) => a.kind === 'task' && a.completedAt === null);
    const dueTasks = openTasks.filter((a) => a.dueDate !== null && a.dueDate <= today).length;
    const dueRoutines = live.filter(
      (a) => a.kind === 'routine' && isDueToday(a, sub.checks.get(a.id) ?? [], today) && !(sub.checks.get(a.id) ?? []).includes(today),
    ).length;
    const completedThisWeek = sub.actions.filter((a) => {
      if (a.archivedAt !== null || a.kind !== 'task' || a.completedAt === null) return false;
      const d = localDateInZone(a.completedAt, timeZone);
      return d >= weekStart && d <= weekEnd;
    }).length;
    return {
      id: goal.id,
      title: goal.title,
      status: goal.status,
      targetDate: goal.targetDate,
      activatedOn: goal.activatedOn,
      updatedAt: iso(goal.updatedAt),
      metrics: metricsDTO(m, sub.actions),
      pace: m.pace,
      outcomeCount: activeOutcomeIds.size,
      actionCount: live.length,
      openTaskCount: openTasks.length,
      dueTodayCount: dueTasks + dueRoutines,
      lastReflectedOn: lastReflected[goal.id] ?? null,
      completedThisWeek,
    };
  });
}
