import { Action, Goal, Id, LocalDate, Outcome } from './types.js';

import { isoWeekStart, weekdayOf, addDays } from './dates.js';

export interface NextItem {
  action: Action;
  goal: Goal;
  outcome: Outcome;
  overdue: boolean;
}

export function isDueToday(action: Action, checks: LocalDate[], today: LocalDate): boolean {
  if (action.kind !== 'routine' || action.archivedAt !== null || !action.startDate || !action.schedule) return false;
  if (today < action.startDate) return false;

  if (action.schedule.type === 'daily') return true;
  if (action.schedule.type === 'weekdays') return action.schedule.days.includes(weekdayOf(today));
  if (action.schedule.type === 'weekly') {
    const times = action.schedule.timesPerWeek;
    const wStart = isoWeekStart(today);
    let checksThisWeek = 0;
    for (let i = 0; i < 7; i++) {
      const d = addDays(wStart, i);
      if (d <= today && checks.includes(d)) checksThisWeek++;
    }
    return checksThisWeek < times;
  }
  return false;
}

export function nextActions(
  input: { goals: Goal[]; outcomes: Outcome[]; actions: Action[]; checksByActionId: Map<Id, LocalDate[]> },
  today: LocalDate,
  timeZone: string
): { next: NextItem[]; doneToday: NextItem[] } {
  // Only active goals, outcomes, actions
  const activeGoals = input.goals.filter(g => g.status === 'active');
  const goalMap = new Map(activeGoals.map(g => [g.id, g]));

  const activeOutcomes = input.outcomes.filter(o => o.archivedAt === null && goalMap.has(o.goalId));
  const outcomeMap = new Map(activeOutcomes.map(o => [o.id, o]));

  const activeActions = input.actions.filter(a => a.archivedAt === null && outcomeMap.has(a.outcomeId));

  const routinesDue: NextItem[] = [];
  const openTasks: NextItem[] = [];
  const doneToday: NextItem[] = [];

  for (const a of activeActions) {
    const g = goalMap.get(a.goalId)!;
    const o = outcomeMap.get(a.outcomeId)!;
    const item: NextItem = { action: a, goal: g, outcome: o, overdue: false };

    if (a.kind === 'routine') {
      const checks = input.checksByActionId.get(a.id) || [];
      if (checks.includes(today)) {
        doneToday.push(item);
      } else if (isDueToday(a, checks, today)) {
        routinesDue.push(item);
      }
    } else {
      if (a.completedAt !== null) {
        let completedToday = false;
        try {
          const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: timeZone || 'UTC',
            year: 'numeric', month: '2-digit', day: '2-digit'
          }).formatToParts(a.completedAt);
          const y = parts.find(p => p.type === 'year')?.value;
          const m = parts.find(p => p.type === 'month')?.value;
          const d = parts.find(p => p.type === 'day')?.value;
          if (`${y}-${m}-${d}` === today) completedToday = true;
        } catch { }

        if (completedToday) doneToday.push(item);
      } else {
        if (a.dueDate && a.dueDate < today) item.overdue = true;
        openTasks.push(item);
      }
    }
  }

  // Sort routines: goal (updatedAt desc), outcome pos, action pos
  routinesDue.sort((a, b) => {
    if (a.goal.id !== b.goal.id) return b.goal.updatedAt.getTime() - a.goal.updatedAt.getTime();
    if (a.outcome.position !== b.outcome.position) return (a.outcome.position ?? 0) - (b.outcome.position ?? 0);
    return (a.action.position ?? 0) - (b.action.position ?? 0);
  });

  // Sort tasks: overdue (oldest first) -> due today -> future due (soonest first) -> no due (outcome pos, action pos)
  openTasks.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    if (a.overdue && b.overdue) {
      if (a.action.dueDate !== b.action.dueDate) return (a.action.dueDate! < b.action.dueDate!) ? -1 : 1;
    }
    const aDueToday = a.action.dueDate === today;
    const bDueToday = b.action.dueDate === today;
    if (aDueToday !== bDueToday) return aDueToday ? -1 : 1;

    const aHasDue = !!a.action.dueDate;
    const bHasDue = !!b.action.dueDate;
    if (aHasDue !== bHasDue) return aHasDue ? -1 : 1;
    if (aHasDue && bHasDue && a.action.dueDate !== b.action.dueDate) {
      return (a.action.dueDate! < b.action.dueDate!) ? -1 : 1;
    }

    if (a.outcome.position !== b.outcome.position) return (a.outcome.position ?? 0) - (b.outcome.position ?? 0);
    return (a.action.position ?? 0) - (b.action.position ?? 0);
  });

  return { next: [...routinesDue, ...openTasks], doneToday };
}
