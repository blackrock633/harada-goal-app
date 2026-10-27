import { Reflection, Id, LocalDate, ReflectionKind, Instant } from './types.js';
import { DomainError } from './errors.js';
import { LIMITS } from './limits.js';


function trim(s: string) { return s.trim(); }

export function createReflection(
  input: { id: Id; goalId: Id; date: LocalDate; kind: ReflectionKind; wentWell?: string; didntGoWell?: string; nextChange?: string },
  today: LocalDate,
  now: Instant
): Reflection {
  if (input.date > today) throw new DomainError('VALIDATION', 'Reflection date cannot be in the future', 'date');

  const wentWell = trim(input.wentWell || '');
  const didntGoWell = trim(input.didntGoWell || '');
  const nextChange = trim(input.nextChange || '');

  if (!wentWell && !didntGoWell && !nextChange) {
    throw new DomainError('VALIDATION', 'At least one reflection field must be non-empty');
  }

  if (wentWell.length > LIMITS.reflectionField) throw new DomainError('LIMIT_REACHED', 'wentWell too long', 'wentWell');
  if (didntGoWell.length > LIMITS.reflectionField) throw new DomainError('LIMIT_REACHED', 'didntGoWell too long', 'didntGoWell');
  if (nextChange.length > LIMITS.reflectionField) throw new DomainError('LIMIT_REACHED', 'nextChange too long', 'nextChange');

  return {
    id: input.id,
    goalId: input.goalId,
    date: input.date,
    kind: input.kind,
    wentWell,
    didntGoWell,
    nextChange,
    answers: {},
    createdAt: now,
    updatedAt: now
  };
}

export function updateReflection(
  reflection: Reflection,
  patch: { wentWell?: string; didntGoWell?: string; nextChange?: string },
  today: LocalDate,
  now: Instant
): { reflection: Reflection; changed: (keyof typeof patch)[] } {
  const next = { ...reflection };
  const changed: (keyof typeof patch)[] = [];

  let nextWentWell = next.wentWell;
  let nextDidntGoWell = next.didntGoWell;
  let nextNextChange = next.nextChange;

  if (patch.wentWell !== undefined) {
    nextWentWell = trim(patch.wentWell);
    if (nextWentWell.length > LIMITS.reflectionField) throw new DomainError('LIMIT_REACHED', 'wentWell too long', 'wentWell');
    if (next.wentWell !== nextWentWell) changed.push('wentWell');
  }
  if (patch.didntGoWell !== undefined) {
    nextDidntGoWell = trim(patch.didntGoWell);
    if (nextDidntGoWell.length > LIMITS.reflectionField) throw new DomainError('LIMIT_REACHED', 'didntGoWell too long', 'didntGoWell');
    if (next.didntGoWell !== nextDidntGoWell) changed.push('didntGoWell');
  }
  if (patch.nextChange !== undefined) {
    nextNextChange = trim(patch.nextChange);
    if (nextNextChange.length > LIMITS.reflectionField) throw new DomainError('LIMIT_REACHED', 'nextChange too long', 'nextChange');
    if (next.nextChange !== nextNextChange) changed.push('nextChange');
  }

  if (!nextWentWell && !nextDidntGoWell && !nextNextChange) {
    throw new DomainError('VALIDATION', 'At least one reflection field must be non-empty');
  }

  if (changed.length > 0) {
    next.wentWell = nextWentWell;
    next.didntGoWell = nextDidntGoWell;
    next.nextChange = nextNextChange;
    next.updatedAt = now;
  }

  return { reflection: next, changed };
}
