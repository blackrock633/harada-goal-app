import type { ActionDTO, GoalSummaryDTO, NextItemDTO, TodayDTO } from '@shared/application/dto';

export function action(over: Partial<ActionDTO> = {}): ActionDTO {
  return {
    id: 'a1', goalId: 'g1', outcomeId: 'o1', title: 'Write chapter', notes: '', kind: 'task', position: 0,
    dueDate: null, completedAt: null, schedule: null, startDate: null, archivedAt: null,
    createdAt: '', updatedAt: '', progress: 0, dueToday: false, checkedToday: false, streak: 0,
    focusedToday: false, recentChecks: [],
    ...over,
  };
}
export function item(over: Partial<ActionDTO> = {}, overdue = false): NextItemDTO {
  return { action: action(over), goalId: 'g1', goalTitle: 'Goal', outcomeId: 'o1', outcomeTitle: 'Area', outcomePosition: 3, overdue };
}
export function goal(over: Partial<GoalSummaryDTO> = {}): GoalSummaryDTO {
  return {
    id: 'g1', title: 'Run a marathon', status: 'active', targetDate: null, activatedOn: null, updatedAt: '',
    metrics: { planning: { filled: 10, total: 72, ratio: 10 / 72 }, taskCompletion: 0.25, completedTasks: 1, totalTasks: 4, routineAdherence: null, routineCount: 1, attainment: null },
    pace: 'unknown', outcomeCount: 1, actionCount: 2, openTaskCount: 1, dueTodayCount: 2, lastReflectedOn: null, completedThisWeek: 0,
    ...over,
  };
}
export function data(over: Partial<TodayDTO> = {}): TodayDTO {
  return { today: '2026-10-19', focus: [], next: [item(), item({ id: 'a2', title: 'Other' })], doneToday: [], goals: [goal()], draftGoals: [], hasAnyGoals: true, ...over };
}
