import { Goal, GoalStatus, Purpose, Id, LocalDate, Instant } from './types.js';
import { DomainError } from './errors.js';
import { LIMITS } from './limits.js';


function trim(s: string) { return s.trim(); }

export function createGoal(
  input: { id: Id; ownerId: Id; title: string; vision?: string; targetDate?: LocalDate | null; purpose?: Partial<Purpose> },
  now: Instant
): Goal {
  const title = trim(input.title);
  if (!title) throw new DomainError('VALIDATION', 'Title cannot be empty', 'title');
  if (title.length > LIMITS.goalTitle) throw new DomainError('LIMIT_REACHED', 'Title too long', 'title');
  const vision = trim(input.vision || '');
  if (vision.length > LIMITS.vision) throw new DomainError('LIMIT_REACHED', 'Vision too long', 'vision');

  const purpose: Purpose = {
    selfTangible: trim(input.purpose?.selfTangible || ''),
    selfIntangible: trim(input.purpose?.selfIntangible || ''),
    othersTangible: trim(input.purpose?.othersTangible || ''),
    othersIntangible: trim(input.purpose?.othersIntangible || '')
  };

  for (const [k, v] of Object.entries(purpose)) {
    if (v.length > LIMITS.purposeQuadrant) throw new DomainError('LIMIT_REACHED', `${k} too long`, k);
  }

  return {
    id: input.id,
    ownerId: input.ownerId,
    title,
    vision,
    targetDate: input.targetDate || null,
    status: 'draft',
    statusBeforeArchive: null,
    purpose,
    activatedOn: null,
    achievedAt: null,
    archivedAt: null,
    createdAt: now,
    updatedAt: now
  };
}

export function updateGoalDetails(
  goal: Goal,
  patch: { title?: string; vision?: string; targetDate?: LocalDate | null; purpose?: Partial<Purpose> },
  now: Instant
): { goal: Goal; changed: (keyof typeof patch)[] } {
  if (goal.status === 'archived') throw new DomainError('INVALID_STATE', 'Cannot edit archived goal');
  
  const next = { ...goal, purpose: { ...goal.purpose } };
  const changed: (keyof typeof patch)[] = [];

  if (patch.title !== undefined) {
    const t = trim(patch.title);
    if (!t) throw new DomainError('VALIDATION', 'Title cannot be empty', 'title');
    if (t.length > LIMITS.goalTitle) throw new DomainError('LIMIT_REACHED', 'Title too long', 'title');
    if (next.title !== t) { next.title = t; changed.push('title'); }
  }

  if (patch.vision !== undefined) {
    const v = trim(patch.vision);
    if (v.length > LIMITS.vision) throw new DomainError('LIMIT_REACHED', 'Vision too long', 'vision');
    if (next.vision !== v) { next.vision = v; changed.push('vision'); }
  }

  if (patch.targetDate !== undefined) {
    if (next.targetDate !== patch.targetDate) { next.targetDate = patch.targetDate; changed.push('targetDate'); }
  }

  if (patch.purpose !== undefined) {
    let pChanged = false;
    for (const k of ['selfTangible', 'selfIntangible', 'othersTangible', 'othersIntangible'] as const) {
      if (patch.purpose[k] !== undefined) {
        const val = trim(patch.purpose[k] as string);
        if (val.length > LIMITS.purposeQuadrant) throw new DomainError('LIMIT_REACHED', `${k} too long`, k);
        if (next.purpose[k] !== val) { next.purpose[k] = val; pChanged = true; }
      }
    }
    if (pChanged) changed.push('purpose');
  }

  if (changed.length > 0) {
    next.updatedAt = now;
  }
  return { goal: next, changed };
}

export function activateGoal(
  goal: Goal,
  counts: { activeOutcomes: number; activeActions: number },
  today: LocalDate,
  now: Instant
): Goal {
  if (goal.status !== 'draft') throw new DomainError('INVALID_STATE', 'Goal is not draft');
  if (counts.activeOutcomes < 1 || counts.activeActions < 1) {
    throw new DomainError('INVALID_STATE', 'Goal must have at least 1 active outcome and 1 active action to activate');
  }
  return {
    ...goal,
    status: 'active',
    activatedOn: goal.activatedOn || today,
    updatedAt: now
  };
}

export function markGoalAchieved(goal: Goal, now: Instant): Goal {
  if (goal.status !== 'active') throw new DomainError('INVALID_STATE', 'Only active goals can be achieved');
  return { ...goal, status: 'achieved', achievedAt: now, updatedAt: now };
}

export function reopenGoal(goal: Goal, now: Instant): Goal {
  if (goal.status !== 'achieved') throw new DomainError('INVALID_STATE', 'Only achieved goals can be reopened');
  return { ...goal, status: 'active', achievedAt: null, updatedAt: now };
}

export function archiveGoal(goal: Goal, now: Instant): Goal {
  if (goal.status === 'archived') return goal;
  return {
    ...goal,
    status: 'archived',
    statusBeforeArchive: goal.status as Exclude<GoalStatus, 'archived'>,
    archivedAt: now,
    updatedAt: now
  };
}

export function restoreGoal(goal: Goal, now: Instant): Goal {
  if (goal.status !== 'archived') return goal;
  return {
    ...goal,
    status: goal.statusBeforeArchive || 'draft',
    statusBeforeArchive: null,
    archivedAt: null,
    updatedAt: now
  };
}

export function assertGoalEditable(goal: Goal): void {
  if (goal.status === 'archived') throw new DomainError('INVALID_STATE', 'Goal is archived and cannot be edited');
}

export function assertPermanentDeleteAllowed(goal: Goal, confirmTitle: string): void {
  if (goal.status !== 'archived') throw new DomainError('INVALID_STATE', 'Only archived goals can be deleted');
  if (goal.title !== confirmTitle) throw new DomainError('VALIDATION', 'Title confirmation does not match');
}
