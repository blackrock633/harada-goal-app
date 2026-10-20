import { DomainError } from './errors.js';
import { addDays } from './dates.js';
import { FOCUS_PLAN_AHEAD_DAYS, MAX_DAILY_FOCUS } from './limits.js';
import type { Action, DailyFocus, Goal, LocalDate, Outcome } from './types.js';

export type FocusAddPlan = { kind: 'already_focused' } | { kind: 'add'; slot: number };

/**
 * Decides how to add `action` to the focus list for `date`.
 * Rules: date within [today, today + FOCUS_PLAN_AHEAD_DAYS]; the action, its outcome and goal must be
 * live (not archived, goal not achieved); at most MAX_DAILY_FOCUS per day; re-adding is a no-op.
 */
export function planFocusAdd(input: {
  action: Action;
  outcome: Outcome;
  goal: Goal;
  existing: DailyFocus[];
  date: LocalDate;
  today: LocalDate;
}): FocusAddPlan {
  const { action, outcome, goal, existing, date, today } = input;
  if (date < today || date > addDays(today, FOCUS_PLAN_AHEAD_DAYS)) {
    throw new DomainError('VALIDATION', `You can plan focus from today up to ${FOCUS_PLAN_AHEAD_DAYS} days ahead`, 'date');
  }
  if (action.archivedAt !== null || outcome.archivedAt !== null || goal.status === 'archived' || goal.status === 'achieved') {
    throw new DomainError('INVALID_STATE', 'Only actions in a live plan can be added to a day');
  }
  if (existing.some((f) => f.actionId === action.id)) return { kind: 'already_focused' };
  const taken = new Set(existing.map((f) => f.slot));
  for (let slot = 0; slot < MAX_DAILY_FOCUS; slot++) {
    if (!taken.has(slot)) return { kind: 'add', slot };
  }
  throw new DomainError('LIMIT_REACHED', `You can focus on up to ${MAX_DAILY_FOCUS} actions per day`);
}
