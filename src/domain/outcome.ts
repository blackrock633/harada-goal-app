import { Outcome, Id, Instant, Measure } from './types.js';
import { DomainError } from './errors.js';
import { LIMITS, MAX_OUTCOMES_PER_GOAL } from './limits.js';


export type PositionUpdate = { id: Id; position: number };

function trim(s: string) { return s.trim(); }

const SLOT_COUNT = 8;

/** Lowest free matrix slot in 0..7, or null when all are taken. */
export function firstFreePosition(takenPositions: number[]): number | null {
  const taken = new Set(takenPositions);
  for (let i = 0; i < SLOT_COUNT; i++) if (!taken.has(i)) return i;
  return null;
}

export function assertSlotFree(taken: number[], position: number): void {
  if (!Number.isInteger(position) || position < 0 || position >= SLOT_COUNT) {
    throw new DomainError('VALIDATION', 'Position must be an integer between 0 and 7', 'position');
  }
  if (taken.includes(position)) throw new DomainError('INVALID_STATE', 'That slot is already filled', 'position');
}

/** Resolve the slot for a new/restored row: explicit (must be free) or the first free one. */
export function resolveSlot(takenPositions: number[], explicit: number | undefined | null, limitMessage: string): number {
  if (explicit !== undefined && explicit !== null) {
    assertSlotFree(takenPositions, explicit);
    return explicit;
  }
  const free = firstFreePosition(takenPositions);
  if (free === null) throw new DomainError('LIMIT_REACHED', limitMessage);
  return free;
}

function takenOf(items: { position: number | null }[]): number[] {
  return items.map(i => i.position).filter((p): p is number => p !== null);
}

export function validateMeasure(measure: Measure): void {
  if (measure.target <= 0 || !Number.isFinite(measure.target)) throw new DomainError('VALIDATION', 'Measure target must be a positive finite number', 'measure.target');
  if (measure.current < 0 || !Number.isFinite(measure.current)) throw new DomainError('VALIDATION', 'Measure current must be a non-negative finite number', 'measure.current');
  const unit = trim(measure.unit);
  if (unit.length > LIMITS.measureUnit) throw new DomainError('LIMIT_REACHED', 'Measure unit too long', 'measure.unit');
}

export function createOutcome(
  input: { id: Id; goalId: Id; title: string; description?: string; measure?: Measure | null; position?: number },
  activeSiblings: Outcome[],
  now: Instant
): Outcome {
  if (activeSiblings.length >= MAX_OUTCOMES_PER_GOAL) throw new DomainError('LIMIT_REACHED', 'Max outcomes reached');
  
  const title = trim(input.title);
  if (!title) throw new DomainError('VALIDATION', 'Title cannot be empty', 'title');
  if (title.length > LIMITS.outcomeTitle) throw new DomainError('LIMIT_REACHED', 'Title too long', 'title');
  const description = trim(input.description || '');
  if (description.length > LIMITS.outcomeDescription) throw new DomainError('LIMIT_REACHED', 'Description too long', 'description');

  if (input.measure) {
    validateMeasure(input.measure);
  }
  const position = resolveSlot(takenOf(activeSiblings), input.position, 'Max outcomes reached');

  return {
    id: input.id,
    goalId: input.goalId,
    title,
    description,
    measure: input.measure || null,
    position,
    archivedAt: null,
    createdAt: now,
    updatedAt: now
  };
}

export function updateOutcome(
  outcome: Outcome,
  patch: { title?: string; description?: string; measure?: Measure | null },
  now: Instant
): { outcome: Outcome; changed: (keyof typeof patch)[] } {
  if (outcome.archivedAt !== null) throw new DomainError('INVALID_STATE', 'Cannot edit archived outcome');

  const next = { ...outcome };
  const changed: (keyof typeof patch)[] = [];

  if (patch.title !== undefined) {
    const t = trim(patch.title);
    if (!t) throw new DomainError('VALIDATION', 'Title cannot be empty', 'title');
    if (t.length > LIMITS.outcomeTitle) throw new DomainError('LIMIT_REACHED', 'Title too long', 'title');
    if (next.title !== t) { next.title = t; changed.push('title'); }
  }

  if (patch.description !== undefined) {
    const d = trim(patch.description);
    if (d.length > LIMITS.outcomeDescription) throw new DomainError('LIMIT_REACHED', 'Description too long', 'description');
    if (next.description !== d) { next.description = d; changed.push('description'); }
  }

  if (patch.measure !== undefined) {
    if (patch.measure) validateMeasure(patch.measure);
    const m1 = patch.measure;
    const m2 = next.measure;
    const isSame = m1 && m2 && m1.target === m2.target && m1.current === m2.current && m1.unit === m2.unit;
    if (!isSame && m1 !== m2) {
      next.measure = patch.measure ? { ...patch.measure } : null;
      changed.push('measure');
    }
  }

  if (changed.length > 0) {
    next.updatedAt = now;
  }
  return { outcome: next, changed };
}

export function setMeasureCurrent(
  outcome: Outcome,
  current: number,
  now: Instant
): { outcome: Outcome; from: number; to: number } {
  if (outcome.archivedAt !== null) throw new DomainError('INVALID_STATE', 'Cannot edit archived outcome');
  if (!outcome.measure) throw new DomainError('INVALID_STATE', 'Outcome has no measure');
  if (current < 0 || !Number.isFinite(current)) throw new DomainError('VALIDATION', 'Measure current must be a non-negative finite number', 'current');
  
  const from = outcome.measure.current;
  if (from === current) return { outcome, from, to: current };

  return {
    outcome: {
      ...outcome,
      measure: { ...outcome.measure, current },
      updatedAt: now
    },
    from,
    to: current
  };
}

/** Archiving frees the slot; remaining outcomes keep their positions (`positions` is always empty). */
export function archiveOutcome(
  outcome: Outcome,
  _activeSiblings: Outcome[],
  now: Instant
): { outcome: Outcome; positions: PositionUpdate[] } {
  if (outcome.archivedAt !== null) return { outcome, positions: [] };
  return { outcome: { ...outcome, position: null, archivedAt: now, updatedAt: now }, positions: [] };
}

export function restoreOutcome(
  outcome: Outcome,
  activeSiblings: Outcome[],
  now: Instant
): Outcome {
  if (outcome.archivedAt === null) return outcome;
  const position = resolveSlot(takenOf(activeSiblings), null, 'Max outcomes reached');
  return { ...outcome, position, archivedAt: null, updatedAt: now };
}
