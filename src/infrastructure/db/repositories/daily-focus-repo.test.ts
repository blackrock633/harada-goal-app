import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import { UniqueViolationError } from '@/application/ports';
import { createTestDeps, TestDeps } from '../../testing/create-test-deps';

describe('DailyFocusRepo (real PGlite + RLS)', () => {
  let t: TestDeps;
  let userId: string;
  const actionIds = [crypto.randomUUID(), crypto.randomUUID()];

  beforeEach(async () => {
    t = await createTestDeps();
    userId = await t.createUser();
    const goalId = crypto.randomUUID();
    const outcomeId = crypto.randomUUID();
    await t.client.query(`insert into goals (id, owner_id, title, status) values ($1,$2,'G','active')`, [goalId, userId]);
    await t.client.query(`insert into outcomes (id, goal_id, title, position) values ($1,$2,'O',0)`, [outcomeId, goalId]);
    for (const [i, id] of actionIds.entries()) {
      await t.client.query(`insert into actions (id, goal_id, outcome_id, title, kind, position) values ($1,$2,$3,'A','task',$4)`, [id, goalId, outcomeId, i]);
    }
  });
  afterEach(() => t.close());

  const focus = (actionId: string, slot: number) => ({
    id: crypto.randomUUID(), ownerId: userId, actionId, date: '2026-10-19', slot, createdAt: new Date(),
  });

  it('re-adding the same action for the same date is a no-op', async () => {
    await t.deps.uow.run(userId, async (r) => {
      expect(await r.focus.add(focus(actionIds[0]!, 0))).toBe(true);
      expect(await r.focus.add(focus(actionIds[0]!, 1))).toBe(false);
      expect(await r.focus.listForDate(userId, '2026-10-19')).toHaveLength(1);
    });
  });

  it('a concurrent add that lost the slot race fails with UniqueViolationError (→ CONFLICT)', async () => {
    await t.deps.uow.run(userId, (r) => r.focus.add(focus(actionIds[0]!, 0)));
    await expect(t.deps.uow.run(userId, (r) => r.focus.add(focus(actionIds[1]!, 0)))).rejects.toBeInstanceOf(UniqueViolationError);
  });
});
