import { Action, Id, LocalDate, Instant, ActionKind, Schedule, Outcome, Weekday } from './types.js';
import { DomainError } from './errors.js';
import { LIMITS, MAX_ACTIONS_PER_OUTCOME } from './limits.js';

import { PositionUpdate } from './outcome.js';

function trim(s: string) { return s.trim(); }

export function normalizeSchedule(schedule: Schedule): Schedule {
  if (schedule.type === 'daily') return schedule;
  if (schedule.type === 'weekly') {
    if (!Number.isInteger(schedule.timesPerWeek) || schedule.timesPerWeek < 1 || schedule.timesPerWeek > 7) {
      throw new DomainError('VALIDATION', 'timesPerWeek must be an integer between 1 and 7', 'schedule');
    }
    return schedule;
  }
  if (schedule.type === 'weekdays') {
    if (!Array.isArray(schedule.days) || schedule.days.length === 0) {
      throw new DomainError('VALIDATION', 'weekdays must have at least one day', 'schedule');
    }
    const days = Array.from(new Set(schedule.days)).sort() as Weekday[];
    if (days.some(d => d < 0 || d > 6 || !Number.isInteger(d))) {
      throw new DomainError('VALIDATION', 'invalid weekday', 'schedule');
    }
    return { type: 'weekdays', days };
  }
  throw new DomainError('VALIDATION', 'Invalid schedule type', 'schedule');
}

export function createAction(
  input: { id: Id; goalId: Id; outcomeId: Id; title: string; notes?: string; kind: ActionKind; dueDate?: LocalDate | null; schedule?: Schedule | null },
  activeSiblings: Action[],
  today: LocalDate,
  now: Instant
): Action {
  if (activeSiblings.length >= MAX_ACTIONS_PER_OUTCOME) throw new DomainError('LIMIT_REACHED', 'Max actions reached');
  
  const title = trim(input.title);
  if (!title) throw new DomainError('VALIDATION', 'Title cannot be empty', 'title');
  if (title.length > LIMITS.actionTitle) throw new DomainError('LIMIT_REACHED', 'Title too long', 'title');
  const notes = trim(input.notes || '');
  if (notes.length > LIMITS.actionNotes) throw new DomainError('LIMIT_REACHED', 'Notes too long', 'notes');

  let dueDate: LocalDate | null = null;
  let schedule: Schedule | null = null;
  let startDate: LocalDate | null = null;

  if (input.kind === 'routine') {
    if (!input.schedule) throw new DomainError('VALIDATION', 'Routine requires a schedule', 'schedule');
    schedule = normalizeSchedule(input.schedule);
    startDate = today;
  } else {
    if (input.schedule) throw new DomainError('VALIDATION', 'Task cannot have a schedule', 'schedule');
    dueDate = input.dueDate || null;
  }

  return {
    id: input.id,
    goalId: input.goalId,
    outcomeId: input.outcomeId,
    title,
    notes,
    kind: input.kind,
    position: activeSiblings.length,
    dueDate,
    completedAt: null,
    schedule,
    startDate,
    archivedAt: null,
    createdAt: now,
    updatedAt: now
  };
}

export function updateAction(
  action: Action,
  patch: { title?: string; notes?: string; kind?: ActionKind; dueDate?: LocalDate | null; schedule?: Schedule | null },
  today: LocalDate,
  now: Instant
): { action: Action; changed: (keyof typeof patch)[] } {
  if (action.archivedAt !== null) throw new DomainError('INVALID_STATE', 'Cannot edit archived action');

  const next = { ...action };
  const changed: (keyof typeof patch)[] = [];

  if (patch.title !== undefined) {
    const t = trim(patch.title);
    if (!t) throw new DomainError('VALIDATION', 'Title cannot be empty', 'title');
    if (t.length > LIMITS.actionTitle) throw new DomainError('LIMIT_REACHED', 'Title too long', 'title');
    if (next.title !== t) { next.title = t; changed.push('title'); }
  }

  if (patch.notes !== undefined) {
    const n = trim(patch.notes);
    if (n.length > LIMITS.actionNotes) throw new DomainError('LIMIT_REACHED', 'Notes too long', 'notes');
    if (next.notes !== n) { next.notes = n; changed.push('notes'); }
  }

  const newKind = patch.kind ?? next.kind;
  if (patch.kind !== undefined && patch.kind !== next.kind) {
    next.kind = patch.kind;
    changed.push('kind');
  }

  if (newKind === 'routine') {
    if (patch.schedule !== undefined) {
      const s = normalizeSchedule(patch.schedule!);
      // compare schedule deep
      if (JSON.stringify(next.schedule) !== JSON.stringify(s)) {
        next.schedule = s;
        if (!changed.includes('schedule')) changed.push('schedule');
      }
    } else if (!next.schedule) {
      throw new DomainError('VALIDATION', 'Routine requires a schedule', 'schedule');
    }
    
    if (next.dueDate !== null || next.completedAt !== null) {
      next.dueDate = null;
      next.completedAt = null;
    }
    if (next.startDate === null) {
      next.startDate = today;
    }
  } else {
    if (patch.schedule !== undefined && patch.schedule !== null) {
      throw new DomainError('VALIDATION', 'Task cannot have a schedule', 'schedule');
    }
    if (patch.dueDate !== undefined && next.dueDate !== patch.dueDate) {
      next.dueDate = patch.dueDate;
      changed.push('dueDate');
    }
    if (next.schedule !== null || next.startDate !== null) {
      next.schedule = null;
      next.startDate = null;
    }
  }

  if (changed.length > 0) {
    next.updatedAt = now;
  }
  return { action: next, changed };
}

export function completeTask(action: Action, now: Instant): { action: Action; changed: boolean } {
  if (action.archivedAt !== null) throw new DomainError('INVALID_STATE', 'Cannot edit archived action');
  if (action.kind === 'routine') throw new DomainError('INVALID_STATE', 'Cannot complete a routine');
  if (action.completedAt !== null) return { action, changed: false };
  return { action: { ...action, completedAt: now, updatedAt: now }, changed: true };
}

export function reopenTask(action: Action, now: Instant): Action {
  if (action.archivedAt !== null) throw new DomainError('INVALID_STATE', 'Cannot edit archived action');
  if (action.kind === 'routine') throw new DomainError('INVALID_STATE', 'Cannot reopen a routine');
  if (action.completedAt === null) return action;
  return { ...action, completedAt: null, updatedAt: now };
}

export function archiveAction(action: Action, activeSiblings: Action[], now: Instant): { action: Action; positions: PositionUpdate[] } {
  if (action.archivedAt !== null) return { action, positions: [] };

  const nextAction = { ...action, position: null, archivedAt: now, updatedAt: now };
  const others = activeSiblings.filter(a => a.id !== action.id).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const positions: PositionUpdate[] = others.map((a, i) => ({ id: a.id, position: i })).filter(u => u.position !== others.find(x => x.id === u.id)?.position);

  return { action: nextAction, positions };
}

export function restoreAction(action: Action, activeSiblingsInOutcome: Action[], now: Instant): Action {
  if (action.archivedAt === null) return action;
  if (activeSiblingsInOutcome.length >= MAX_ACTIONS_PER_OUTCOME) throw new DomainError('LIMIT_REACHED', 'Max actions reached');
  
  return {
    ...action,
    position: activeSiblingsInOutcome.length,
    archivedAt: null,
    updatedAt: now
  };
}

export function moveAction(
  action: Action,
  fromActiveSiblings: Action[],
  toActiveSiblings: Action[],
  toOutcome: Outcome,
  toPosition: number,
  now: Instant
): { action: Action; positions: { id: Id; outcomeId: Id; position: number }[] } {
  if (action.archivedAt !== null) throw new DomainError('INVALID_STATE', 'Cannot move archived action');
  if (toOutcome.archivedAt !== null) throw new DomainError('INVALID_STATE', 'Cannot move to an archived outcome');
  if (toOutcome.goalId !== action.goalId) throw new DomainError('VALIDATION', 'Cannot move action to a different goal');
  
  const isSameOutcome = action.outcomeId === toOutcome.id;
  
  if (!isSameOutcome && toActiveSiblings.length >= MAX_ACTIONS_PER_OUTCOME) {
    throw new DomainError('LIMIT_REACHED', 'Max actions reached in target outcome');
  }

  const safePos = Math.max(0, Math.min(toPosition, toActiveSiblings.length + (isSameOutcome ? -1 : 0)));

  const nextAction = { ...action, outcomeId: toOutcome.id, position: safePos, updatedAt: now };
  
  const positions: { id: Id; outcomeId: Id; position: number }[] = [];

  if (isSameOutcome) {
    const list = fromActiveSiblings.filter(a => a.id !== action.id).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    list.splice(safePos, 0, nextAction);
    list.forEach((a, i) => {
      if (a.id === action.id) return;
      if (a.position !== i) positions.push({ id: a.id, outcomeId: a.outcomeId, position: i });
    });
  } else {
    const fromList = fromActiveSiblings.filter(a => a.id !== action.id).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    fromList.forEach((a, i) => {
      if (a.position !== i) positions.push({ id: a.id, outcomeId: a.outcomeId, position: i });
    });
    
    const toList = [...toActiveSiblings].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    toList.splice(safePos, 0, nextAction);
    toList.forEach((a, i) => {
      if (a.id === action.id) return;
      if (a.position !== i) positions.push({ id: a.id, outcomeId: a.outcomeId, position: i });
    });
  }

  return { action: nextAction, positions };
}

export function computeReorder(activeItems: { id: Id }[], orderedIds: Id[]): PositionUpdate[] | null {
  if (activeItems.length !== orderedIds.length) return null;
  const set = new Set(orderedIds);
  if (set.size !== orderedIds.length) return null;
  for (const item of activeItems) {
    if (!set.has(item.id)) return null;
  }
  
  return orderedIds.map((id, index) => ({ id, position: index }));
}

export function validateCheckDate(action: Action, date: LocalDate, today: LocalDate): void {
  if (action.archivedAt !== null) throw new DomainError('INVALID_STATE', 'Cannot check archived action');
  if (action.kind !== 'routine' || !action.startDate) throw new DomainError('INVALID_STATE', 'Only routines can be checked');
  if (date > today) throw new DomainError('VALIDATION', 'Cannot check future dates');
  if (date < action.startDate) throw new DomainError('VALIDATION', 'Cannot check dates before routine start date');
}
