import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDeps, type TestDeps } from './create-test-deps';
import { UniqueViolationError } from '@/application/ports';
import { goals, profiles } from '../db/schema';
import { eq } from 'drizzle-orm';

describe('Database infrastructure', () => {
  let t: TestDeps;

  beforeEach(async () => {
    t = await createTestDeps();
  });
  afterEach(() => t.close());

  const goal = (ownerId: string, id: string) => ({
    id,
    ownerId,
    title: 'Goal',
    vision: '',
    successCriteria: '',
    targetDate: null,
    status: 'draft' as const,
    statusBeforeArchive: null,
    purpose: { selfTangible: '', selfIntangible: '', othersTangible: '', othersIntangible: '' },
    activatedOn: null,
    achievedAt: null,
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const outcome = (goalId: string, id: string, position: number) => ({
    id,
    goalId,
    title: `O${position}`,
    description: '',
    measure: null,
    position,
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  it('creates a profile via the auth trigger', async () => {
    const userId = await t.createUser({ displayName: 'Ada', timeZone: 'Europe/London' });
    const rows = await t.db.select().from(profiles).where(eq(profiles.id, userId));
    expect(rows[0]).toMatchObject({ displayName: 'Ada', timeZone: 'Europe/London' });
  });

  it('enforces unique active outcome positions (exclusion constraint)', async () => {
    const userId = await t.createUser();
    const g = goal(userId, t.deps.ids());
    await expect(
      t.deps.uow.run(userId, async (r) => {
        await r.goals.insert(g);
        await r.outcomes.insert(outcome(g.id, t.deps.ids(), 0));
        await r.outcomes.insert(outcome(g.id, t.deps.ids(), 0));
      }),
    ).rejects.toBeInstanceOf(UniqueViolationError);
  });

  it('rolls back the whole unit of work on error', async () => {
    const userId = await t.createUser();
    const g = goal(userId, t.deps.ids());
    await expect(
      t.deps.uow.run(userId, async (r) => {
        await r.goals.insert(g);
        throw new Error('Rollback');
      }),
    ).rejects.toThrow('Rollback');
    const rows = await t.db.select().from(goals).where(eq(goals.id, g.id));
    expect(rows).toEqual([]);
  });

  it('applies RLS: a user cannot read another user goal', async () => {
    const a = await t.createUser();
    const b = await t.createUser();
    const g = goal(a, t.deps.ids());
    await t.deps.uow.run(a, (r) => r.goals.insert(g));
    expect(await t.deps.uow.run(b, (r) => r.goals.findById(b, g.id))).toBeNull();
    expect(await t.deps.uow.run(a, (r) => r.goals.findById(a, g.id))).not.toBeNull();
  });

  it('rejects a malformed user id', async () => {
    await expect(t.deps.uow.run('not-a-uuid', async () => 1)).rejects.toThrow();
  });
});
