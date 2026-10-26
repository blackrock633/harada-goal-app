/**
 * Pure read model: domain entities -> DTOs. No I/O and no ports, so the web server (via queries/) and the
 * native app (from rows read with supabase-js, mapped by rows.ts) build identical DTOs.
 * Relative imports only: this file is shared with mobile/.
 */
import type { Action, DailyFocus, Goal, Id, LocalDate, Outcome, Reflection, GoalEvent, RoutineCheck } from '../domain/types.js';
import {
  addDays,
  isoWeekEnd,
  isoWeekStart,
  localDateInZone,
  computeGoalMetrics,
  routineStreak,
  actionProgress,
  isDueToday,
  nextActions,
  type GoalMetrics,
  type NextItem,
} from '../domain/index.js';
import { MAX_ACTIONS_PER_OUTCOME, MAX_OUTCOMES_PER_GOAL } from '../domain/limits.js';
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
  NextItemDTO,
  TodayDTO,
} from './dto.js';

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

export function actionDTO(a: Action, checks: LocalDate[], today: LocalDate, focusedToday = false): ActionDTO {
  const windowStart = addDays(today, -(RECENT_CHECK_DAYS - 1));
  const recent = checks.filter((d) => d >= windowStart && d <= today).sort();
  return {
    ...actionFieldsDTO(a),
    progress: actionProgress(a, checks, today),
    dueToday: isDueToday(a, checks, today),
    checkedToday: a.kind === 'routine' && checks.includes(today),
    streak: routineStreak(a, checks, today),
    focusedToday,
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
    answers: r.answers,
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
  /** Action ids in the owner's focus list for today. */
  focused: Set<Id>;
  /** Today's focus rows in slot order. */
  focusRows: DailyFocus[];
}

/**
 * Builds a Graph from rows already loaded for `goalIds`. `checks` may cover any window; only the last
 * RECENT_CHECK_DAYS days up to `today` are kept. `focus` are the owner's focus rows for `today`.
 */
export function buildGraph(
  outcomes: Outcome[],
  actions: Action[],
  checks: Pick<RoutineCheck, 'actionId' | 'date'>[],
  focus: DailyFocus[],
  today: LocalDate,
): Graph {
  const from = addDays(today, -(RECENT_CHECK_DAYS - 1));
  const byAction = new Map<Id, LocalDate[]>();
  for (const c of checks) {
    if (c.date < from || c.date > today) continue;
    const list = byAction.get(c.actionId);
    if (list) list.push(c.date);
    else byAction.set(c.actionId, [c.date]);
  }
  const focusRows = [...focus].sort((a, b) => a.slot - b.slot);
  return { outcomes, actions, checks: byAction, focused: new Set(focusRows.map((f) => f.actionId)), focusRows };
}

/** The earliest date whose routine checks the read model needs (load checks from here to today). */
export const checksFrom = (today: LocalDate): LocalDate => addDays(today, -(RECENT_CHECK_DAYS - 1));

export function forGoal(graph: Graph, goalId: Id): Graph {
  return {
    outcomes: graph.outcomes.filter((o) => o.goalId === goalId),
    actions: graph.actions.filter((a) => a.goalId === goalId),
    checks: graph.checks,
    focused: graph.focused,
    focusRows: graph.focusRows,
  };
}

const byPosition = <T extends { position: number | null }>(a: T, b: T) =>
  (a.position ?? 99) - (b.position ?? 99);

export function metricsDTO(m: GoalMetrics): GoalMetricsDTO {
  return {
    planning: { ...m.planning },
    taskCompletion: m.tasks.ratio,
    completedTasks: m.tasks.completed,
    totalTasks: m.tasks.total,
    routineAdherence: m.routines.adherence,
    routineCount: m.routines.count,
    attainment: m.attainment,
  };
}

function outcomeDTO(
  o: Outcome,
  actions: Action[],
  checks: Map<Id, LocalDate[]>,
  today: LocalDate,
  m: GoalMetrics,
  focused: Set<Id>,
): OutcomeDTO {
  const mine = actions
    .filter((a) => a.outcomeId === o.id && a.archivedAt === null)
    .sort(byPosition)
    .map((a) => actionDTO(a, checks.get(a.id) ?? [], today, focused.has(a.id)));
  const slots: (ActionDTO | null)[] = Array.from({ length: MAX_ACTIONS_PER_OUTCOME }, () => null);
  for (const a of mine) if (a.position !== null && a.position >= 0 && a.position < slots.length) slots[a.position] = a;
  const om = m.outcomes.find((x) => x.outcomeId === o.id);
  return {
    ...outcomeFieldsDTO(o),
    taskCompletion: om?.tasks.ratio ?? null,
    completedTasks: om?.tasks.completed ?? 0,
    totalTasks: om?.tasks.total ?? 0,
    routineAdherence: om?.routines.adherence ?? null,
    routineCount: om?.routines.count ?? 0,
    attainment: om?.attainment ?? null,
    actions: mine,
    slots,
  };
}

export function buildGoalDetail(goal: Goal, g: Graph, today: LocalDate): GoalDetailDTO {
  const m = computeGoalMetrics(goal, g.outcomes, g.actions, g.checks, today);
  const active = g.outcomes.filter((o) => o.archivedAt === null).sort(byPosition);
  const outcomes = active.map((o) => outcomeDTO(o, g.actions, g.checks, today, m, g.focused));
  const matrix: (OutcomeDTO | null)[] = Array.from({ length: MAX_OUTCOMES_PER_GOAL }, () => null);
  for (const o of outcomes) if (o.position !== null && o.position >= 0 && o.position < matrix.length) matrix[o.position] = o;
  const titleById = new Map(g.outcomes.map((o) => [o.id, o.title]));
  return {
    ...goalFieldsDTO(goal),
    metrics: metricsDTO(m),
    pace: m.pace,
    outcomes,
    matrix: { outcomes: matrix },
    archivedOutcomes: g.outcomes.filter((o) => o.archivedAt !== null).map(outcomeFieldsDTO),
    archivedActions: g.actions
      .filter((a) => a.archivedAt !== null)
      .map((a) => ({ ...actionFieldsDTO(a), outcomeTitle: titleById.get(a.outcomeId) ?? '' })),
  };
}

/** Goal summaries from a graph covering all `goals`. `lastReflected` maps goal id → latest reflection date. */
export function buildSummaryDTOs(
  goals: Goal[],
  g: Graph,
  lastReflected: Record<Id, LocalDate>,
  today: LocalDate,
  timeZone: string,
): GoalSummaryDTO[] {
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
      metrics: metricsDTO(m),
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

/** Today screen from the owner's goals (all statuses) and a graph loaded for the live (active/draft) ones. */
export function buildTodayDTO(
  goals: Goal[],
  graph: Graph,
  lastReflected: Record<Id, LocalDate>,
  today: LocalDate,
  timeZone: string,
): TodayDTO {
  const live = goals.filter((g) => g.status === 'active' || g.status === 'draft');
  const { next, doneToday } = nextActions(
    { goals: live, outcomes: graph.outcomes, actions: graph.actions, checksByActionId: graph.checks },
    today,
    timeZone,
  );
  const goalById = new Map(live.map((g) => [g.id, g]));
  const outcomeById = new Map(graph.outcomes.map((o) => [o.id, o]));
  const actionById = new Map(graph.actions.map((a) => [a.id, a]));
  const focusItems: NextItem[] = [];
  for (const f of graph.focusRows) {
    const action = actionById.get(f.actionId);
    const outcome = action && outcomeById.get(action.outcomeId);
    const goal = action && goalById.get(action.goalId);
    if (!action || !outcome || !goal) continue;
    if (action.archivedAt !== null || outcome.archivedAt !== null) continue;
    focusItems.push({
      action,
      outcome,
      goal,
      overdue: action.kind === 'task' && action.completedAt === null && action.dueDate !== null && action.dueDate < today,
    });
  }
  const focusIds = new Set(focusItems.map((i) => i.action.id));
  const toDto = (i: NextItem): NextItemDTO => ({
    action: actionDTO(i.action, graph.checks.get(i.action.id) ?? [], today, graph.focused.has(i.action.id)),
    goalId: i.goal.id,
    goalTitle: i.goal.title,
    outcomeId: i.outcome.id,
    outcomeTitle: i.outcome.title,
    outcomePosition: i.outcome.position ?? 0,
    overdue: i.overdue,
  });
  const summaries = buildSummaryDTOs(live, graph, lastReflected, today, timeZone);
  return {
    today,
    focus: focusItems.map(toDto),
    next: next.filter((i) => !focusIds.has(i.action.id)).map(toDto),
    doneToday: doneToday.filter((i) => !focusIds.has(i.action.id)).map(toDto),
    goals: summaries.filter((s) => s.status === 'active'),
    draftGoals: summaries.filter((s) => s.status === 'draft'),
    hasAnyGoals: goals.some((g) => g.status !== 'archived'),
  };
}
