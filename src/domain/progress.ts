import { Action, Goal, Id, LocalDate, Outcome, Progress, Pace, RoutineCheck } from './types.js';
import { ADHERENCE_WINDOW_DAYS, MAX_OUTCOMES_PER_GOAL, MAX_ACTIONS_PER_OUTCOME } from './limits.js';

import { addDays, diffDays, eachDay, isoWeekStart, isoWeekEnd, weekdayOf } from './dates.js';

export function taskProgress(action: Action): Progress {
  if (action.kind !== 'task') return null;
  if (action.archivedAt !== null) return null;
  return action.completedAt !== null ? 1 : 0;
}

export function routineAdherence(action: Action, checks: (LocalDate | RoutineCheck)[], today: LocalDate): Progress {
  if (action.kind !== 'routine' || !action.startDate || !action.schedule || action.archivedAt !== null) return null;

  const checkDatesSet = new Set(checks.map(c => typeof c === 'string' ? c : c.date));
  
  const windowStartCandidate = addDays(today, -(ADHERENCE_WINDOW_DAYS - 1));
  const windowStart = windowStartCandidate > action.startDate ? windowStartCandidate : action.startDate;

  if (windowStart > today) return null;

  const evaluatedDays = eachDay(windowStart, today).filter(d => d < today || checkDatesSet.has(today));
  
  if (evaluatedDays.length === 0) return null;

  let expected = 0;
  let kept = 0;

  if (action.schedule.type === 'daily') {
    expected = evaluatedDays.length;
    kept = evaluatedDays.filter(d => checkDatesSet.has(d)).length;
  } else if (action.schedule.type === 'weekdays') {
    const s = action.schedule;
    const isScheduled = (d: LocalDate) => s.days.includes(weekdayOf(d));
    expected = evaluatedDays.filter(isScheduled).length;
    kept = evaluatedDays.filter(d => isScheduled(d) && checkDatesSet.has(d)).length;
  } else if (action.schedule.type === 'weekly') {
    const times = action.schedule.timesPerWeek;
    if (evaluatedDays.length === 0) return null;
    
    // Group evaluated days by ISO week
    const weeks = new Map<LocalDate, LocalDate[]>();
    for (const d of evaluatedDays) {
      const wStart = isoWeekStart(d);
      if (!weeks.has(wStart)) weeks.set(wStart, []);
      weeks.get(wStart)!.push(d);
    }

    let expectedWeekSum = 0;
    let keptWeekSum = 0;

    for (const [wStart, daysInWeek] of weeks.entries()) {
      const expectedWeek = times * daysInWeek.length / 7;
      expectedWeekSum += expectedWeek;
      
      const checksInWeek = daysInWeek.filter(d => checkDatesSet.has(d)).length;
      keptWeekSum += Math.min(checksInWeek, times);
    }

    expected = expectedWeekSum;
    kept = keptWeekSum;
  }

  if (expected === 0) return null;
  return Math.min(1, kept / expected);
}

export function actionProgress(action: Action, checks: (LocalDate | RoutineCheck)[], today: LocalDate): Progress {
  if (action.archivedAt !== null) return null;
  if (action.kind === 'task') return taskProgress(action);
  return routineAdherence(action, checks, today);
}

/** @deprecated Blends measure and action completion; use outcomeAttainment / outcomeExecution. */
export function outcomeProgress(
  outcome: Outcome,
  activeActions: Action[],
  checksByActionId: Map<Id, LocalDate[]>,
  today: LocalDate
): Progress {
  if (outcome.archivedAt !== null) return null;
  if (outcome.measure) {
    const { target, current } = outcome.measure;
    if (target === 0) return null; // should not happen if validated
    return Math.max(0, Math.min(1, current / target));
  }

  const validActions = activeActions.filter(a => a.outcomeId === outcome.id && a.archivedAt === null);
  if (validActions.length === 0) return null;

  let sum = 0;
  let count = 0;
  for (const a of validActions) {
    const checks = checksByActionId.get(a.id) || [];
    const p = actionProgress(a, checks, today);
    if (p !== null) {
      sum += p;
      count++;
    }
  }

  return count === 0 ? null : sum / count;
}

/** @deprecated Blends measure and action completion; use goalAttainment / executionProgress. */
export function goalProgress(
  activeOutcomes: Outcome[],
  activeActionsByOutcome: Map<Id, Action[]>,
  checksByActionId: Map<Id, LocalDate[]>,
  today: LocalDate
): Progress {
  const outcomes = activeOutcomes.filter(o => o.archivedAt === null);
  if (outcomes.length === 0) return null;

  let sum = 0;
  let count = 0;

  for (const o of outcomes) {
    const actions = activeActionsByOutcome.get(o.id) || [];
    const p = outcomeProgress(o, actions, checksByActionId, today);
    if (p !== null) {
      sum += p;
      count++;
    }
  }

  return count === 0 ? null : sum / count;
}

/** Pace is driven by real-world attainment only; action completion never feeds it. */
export function pace(goal: Goal, attainment: Progress, today: LocalDate): Pace {
  if (goal.status !== 'active') return 'unknown';
  if (!goal.targetDate || !goal.activatedOn) return 'unknown';
  if (goal.targetDate <= goal.activatedOn) return 'unknown'; // Edge case

  if (today > goal.targetDate) return 'overdue';

  const elapsedRaw = diffDays(goal.activatedOn, today) / diffDays(goal.activatedOn, goal.targetDate);
  const elapsed = Math.max(0, Math.min(1, elapsedRaw));

  if (attainment === null || !Number.isFinite(attainment)) return 'unknown';

  if (attainment >= elapsed + 0.10) return 'ahead';
  if (attainment >= elapsed - 0.15) return 'on_track';
  return 'behind';
}

/** @deprecated Use computeGoalMetrics. */
export function computeGoalProgress(
  goal: Goal,
  activeOutcomes: Outcome[],
  activeActions: Action[],
  checksByActionId: Map<Id, LocalDate[]>,
  today: LocalDate
): { goal: Progress; outcomes: Map<Id, Progress>; actions: Map<Id, Progress>; pace: Pace } {
  const actionProgs = new Map<Id, Progress>();
  for (const a of activeActions) {
    actionProgs.set(a.id, actionProgress(a, checksByActionId.get(a.id) || [], today));
  }

  const outcomeProgs = new Map<Id, Progress>();
  const actionsByOut = new Map<Id, Action[]>();
  for (const a of activeActions) {
    if (!actionsByOut.has(a.outcomeId)) actionsByOut.set(a.outcomeId, []);
    actionsByOut.get(a.outcomeId)!.push(a);
  }

  for (const o of activeOutcomes) {
    outcomeProgs.set(o.id, outcomeProgress(o, actionsByOut.get(o.id) || [], checksByActionId, today));
  }

  const gp = goalProgress(activeOutcomes, actionsByOut, checksByActionId, today);
  const p = pace(goal, goalAttainment(activeOutcomes), today);

  return { goal: gp, outcomes: outcomeProgs, actions: actionProgs, pace: p };
}

// ---------- Canonical metrics (see docs/DOMAIN_MODEL.md section 4) ----------

export const PLANNING_TOTAL = MAX_OUTCOMES_PER_GOAL + MAX_OUTCOMES_PER_GOAL * MAX_ACTIONS_PER_OUTCOME;

export interface PlanningCompleteness { filled: number; total: number; ratio: number }
export interface ExecutionProgress { value: Progress; completedTasks: number; totalTasks: number }
export interface OutcomeMetrics { outcomeId: Id; execution: ExecutionProgress; attainment: Progress }
export interface GoalMetrics {
  planning: PlanningCompleteness;
  execution: ExecutionProgress;
  attainment: Progress;
  pace: Pace;
  outcomes: OutcomeMetrics[];
}

/** Active outcomes (archivedAt null) and the active actions that sit under them. */
function activeScope(outcomes: Outcome[], actions: Action[]) {
  const activeOutcomes = outcomes.filter(o => o.archivedAt === null);
  const ids = new Set(activeOutcomes.map(o => o.id));
  const activeActions = actions.filter(a => a.archivedAt === null && ids.has(a.outcomeId));
  return { activeOutcomes, activeActions };
}

export function planningCompleteness(outcomes: Outcome[], actions: Action[]): PlanningCompleteness {
  const { activeOutcomes, activeActions } = activeScope(outcomes, actions);
  const filledOutcomes = Math.min(MAX_OUTCOMES_PER_GOAL, activeOutcomes.filter(o => o.title.trim() !== '').length);
  const filledActions = Math.min(MAX_OUTCOMES_PER_GOAL * MAX_ACTIONS_PER_OUTCOME, activeActions.length);
  const filled = filledOutcomes + filledActions;
  return { filled, total: PLANNING_TOTAL, ratio: filled / PLANNING_TOTAL };
}

function executionOf(actions: Action[], checksByActionId: Map<Id, LocalDate[]>, today: LocalDate): ExecutionProgress {
  let sum = 0;
  let count = 0;
  let completedTasks = 0;
  let totalTasks = 0;
  for (const a of actions) {
    if (a.kind === 'task') {
      totalTasks++;
      if (a.completedAt !== null) completedTasks++;
    }
    const p = actionProgress(a, checksByActionId.get(a.id) ?? [], today);
    if (p !== null && Number.isFinite(p)) { sum += p; count++; }
  }
  return { value: count === 0 ? null : sum / count, completedTasks, totalTasks };
}

/** Goal-level execution: mean action progress over active actions in active outcomes. */
export function executionProgress(
  outcomes: Outcome[],
  actions: Action[],
  checksByActionId: Map<Id, LocalDate[]>,
  today: LocalDate
): ExecutionProgress {
  return executionOf(activeScope(outcomes, actions).activeActions, checksByActionId, today);
}

export function outcomeExecution(
  outcome: Outcome,
  actions: Action[],
  checksByActionId: Map<Id, LocalDate[]>,
  today: LocalDate
): ExecutionProgress {
  if (outcome.archivedAt !== null) return { value: null, completedTasks: 0, totalTasks: 0 };
  return executionOf(actions.filter(a => a.outcomeId === outcome.id && a.archivedAt === null), checksByActionId, today);
}

/** Measure-based progress of one outcome; null when archived or without a usable measure. */
export function outcomeAttainment(outcome: Outcome): Progress {
  if (outcome.archivedAt !== null || !outcome.measure) return null;
  const { target, current } = outcome.measure;
  if (!Number.isFinite(target) || !Number.isFinite(current) || target <= 0) return null;
  return Math.max(0, Math.min(1, current / target));
}

/** Real-world goal progress: mean outcome attainment. Action completion never contributes. */
export function goalAttainment(outcomes: Outcome[]): Progress {
  let sum = 0;
  let count = 0;
  for (const o of outcomes) {
    const p = outcomeAttainment(o);
    if (p !== null) { sum += p; count++; }
  }
  return count === 0 ? null : sum / count;
}

export function computeGoalMetrics(
  goal: Goal,
  outcomes: Outcome[],
  actions: Action[],
  checksByActionId: Map<Id, LocalDate[]>,
  today: LocalDate
): GoalMetrics {
  const { activeOutcomes } = activeScope(outcomes, actions);
  const attainment = goalAttainment(activeOutcomes);
  return {
    planning: planningCompleteness(outcomes, actions),
    execution: executionProgress(outcomes, actions, checksByActionId, today),
    attainment,
    pace: pace(goal, attainment, today),
    outcomes: activeOutcomes.map(o => ({
      outcomeId: o.id,
      execution: outcomeExecution(o, actions, checksByActionId, today),
      attainment: outcomeAttainment(o)
    }))
  };
}

export function routineStreak(action: Action, checks: LocalDate[], today: LocalDate): number {
  if (action.kind !== 'routine' || !action.startDate || !action.schedule || action.archivedAt !== null) return 0;

  const checkSet = new Set(checks);
  if (checkSet.size === 0) return 0;

  const type = action.schedule.type;
  let streak = 0;

  if (type === 'daily') {
    let d = today;
    if (!checkSet.has(d)) {
      d = addDays(d, -1);
    }
    while (d >= action.startDate && checkSet.has(d)) {
      streak++;
      d = addDays(d, -1);
    }
  } else if (type === 'weekdays') {
    const isScheduled = (d: LocalDate) => (action.schedule as {days: number[]}).days.includes(weekdayOf(d));
    let d = today;
    if (!checkSet.has(d)) {
      d = addDays(d, -1);
      while (d >= action.startDate && !isScheduled(d)) {
        d = addDays(d, -1);
      }
    }
    while (d >= action.startDate) {
      if (isScheduled(d)) {
        if (!checkSet.has(d)) break;
        streak++;
      }
      d = addDays(d, -1);
    }
  } else if (type === 'weekly') {
    const times = action.schedule.timesPerWeek;
    let currentWeekStart = isoWeekStart(today);
    const earliestWeek = isoWeekStart(action.startDate);

    let d = today;
    let checksThisWeek = 0;
    let evalD = currentWeekStart;
    while (evalD <= addDays(currentWeekStart, 6) && evalD <= today) {
      if (checkSet.has(evalD)) checksThisWeek++;
      evalD = addDays(evalD, 1);
    }

    let wStart = currentWeekStart;
    if (checksThisWeek < times) {
      wStart = addDays(wStart, -7);
    }

    while (wStart >= earliestWeek) {
      const wEnd = addDays(wStart, 6);
      let c = 0;
      let checkD = wStart;
      while (checkD <= wEnd) {
        if (checkD >= action.startDate && checkSet.has(checkD)) c++;
        checkD = addDays(checkD, 1);
      }
      if (c >= times) {
        streak++;
      } else {
        break;
      }
      wStart = addDays(wStart, -7);
    }
  }

  return streak;
}
