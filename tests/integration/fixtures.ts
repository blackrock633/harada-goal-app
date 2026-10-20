import type { Action, Goal, Outcome, Reflection, User } from '@/domain/types';
import { randomUUID } from 'node:crypto';

let counter = 0;
const uniq = () => `${Date.now()}-${++counter}`;

export function makeUser(over: Partial<User> = {}): User {
  const now = new Date();
  return {
    id: randomUUID(),
    email: `user-${uniq()}@example.com`,
    displayName: 'Test User',
    timeZone: 'UTC',
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

export function makeGoal(ownerId: string, over: Partial<Goal> = {}): Goal {
  const now = new Date();
  return {
    id: randomUUID(),
    ownerId,
    title: 'Goal',
    vision: '',
    targetDate: null,
    status: 'draft',
    statusBeforeArchive: null,
    purpose: { selfTangible: '', selfIntangible: '', othersTangible: '', othersIntangible: '' },
    activatedOn: null,
    achievedAt: null,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

export function makeOutcome(goalId: string, over: Partial<Outcome> = {}): Outcome {
  const now = new Date();
  return {
    id: randomUUID(),
    goalId,
    title: 'Outcome',
    description: '',
    measure: null,
    position: 0,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

export function makeAction(goalId: string, outcomeId: string, over: Partial<Action> = {}): Action {
  const now = new Date();
  return {
    id: randomUUID(),
    goalId,
    outcomeId,
    title: 'Action',
    notes: '',
    kind: 'task',
    position: 0,
    dueDate: null,
    completedAt: null,
    schedule: null,
    startDate: null,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

export function makeReflection(goalId: string, over: Partial<Reflection> = {}): Reflection {
  const now = new Date();
  return {
    id: randomUUID(),
    goalId,
    date: '2026-01-01',
    kind: 'daily',
    wentWell: 'a',
    didntGoWell: 'b',
    nextChange: 'c',
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}
