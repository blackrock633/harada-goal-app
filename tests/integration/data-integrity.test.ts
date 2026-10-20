import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDeps, type TestDeps } from '@/infrastructure/testing/create-test-deps';
import { UniqueViolationError, AuthGatewayError } from '@/application/ports';
import { updateAction } from '@/domain/action';
import { makeGoal, makeOutcome, makeAction, makeReflection } from './fixtures';

/**
 * Port of tests/integration/data-integrity.test.ts to the Supabase/RLS harness.
 * Changes (intent preserved; every `it.fails` is a plain `it` asserting the CONTRACT):
 *  - uow.run(fn) -> uow.run(userId, fn); users come from t.createUser() (auth.users + trigger).
 *  - Test 9 (sessions repo) DROPPED: sessions no longer exist (Supabase Auth owns sessions).
 *  - Test 3c (users repo duplicate email) re-expressed against the auth gateway (the only place email
 *    uniqueness now lives). NOTE: this exercises FakeAuthGateway only, not GoTrue.
 *  - Test 2c: the old test RECORDED "DB accepts position 8"; the new schema checks 0..7, so we assert
 *    the new contract (8 and -1 rejected, including via setPositions).
 */
describe('data integrity & isolation (PGlite + RLS)', () => {
  let t: TestDeps;
  beforeEach(async () => { t = await createTestDeps(); });
  afterEach(async () => { await t.close(); });

  /** Seeds user -> goal -> outcome -> action -> reflection, all written AS that user. */
  async function seedTree() {
    const userId = await t.createUser();
    const goal = makeGoal(userId);
    const outcome = makeOutcome(goal.id);
    const action = makeAction(goal.id, outcome.id);
    const reflection = makeReflection(goal.id);
    await t.deps.uow.run(userId, async (r) => {
      await r.goals.insert(goal);
      await r.outcomes.insert(outcome);
      await r.actions.insert(action);
      await r.reflections.insert(reflection);
    });
    return { userId, goal, outcome, action, reflection };
  }
  const as = <T>(userId: string, fn: Parameters<typeof t.deps.uow.run<T>>[1]) => t.deps.uow.run(userId, fn);

  it('1. user B cannot read or mutate user A data', async () => {
    const a = await seedTree();
    const b = await seedTree();
    const before = await as(a.userId, (r) => r.goals.findById(a.userId, a.goal.id));
    await as(b.userId, async (r) => {
      expect(await r.goals.findById(b.userId, a.goal.id)).toBeNull();
      expect(await r.goals.lock(b.userId, a.goal.id)).toBeNull();
      expect(await r.outcomes.findById(b.userId, a.outcome.id)).toBeNull();
      expect(await r.actions.findById(b.userId, a.action.id)).toBeNull();
      expect(await r.reflections.findById(b.userId, a.reflection.id)).toBeNull();
      expect((await r.goals.listByOwner(b.userId)).map((g) => g.id)).toEqual([b.goal.id]);
      // even asking for A's id as "owner" yields nothing under RLS
      expect(await r.goals.findById(a.userId, a.goal.id)).toBeNull();
      await r.goals.update({ ...a.goal, ownerId: b.userId, title: 'HACKED' });
      await r.goals.update({ ...a.goal, ownerId: a.userId, title: 'HACKED' });
      await r.goals.deleteById(b.userId, a.goal.id);
      await r.goals.deleteById(a.userId, a.goal.id);
    });
    const after = await as(a.userId, (r) => r.goals.findById(a.userId, a.goal.id));
    expect(after).not.toBeNull();
    expect(after).toEqual(before);
    expect(after!.title).toBe('Goal');
  });

  it('2a. duplicate active positions rejected for outcomes and actions', async () => {
    const a = await seedTree();
    await expect(as(a.userId, (r) => r.outcomes.insert(makeOutcome(a.goal.id, { position: 0 })))).rejects.toThrow();
    await expect(as(a.userId, (r) => r.actions.insert(makeAction(a.goal.id, a.outcome.id, { position: 0 })))).rejects.toThrow();
  });

  it('2b. archived rows (position null) do not collide', async () => {
    const a = await seedTree();
    const archivedAt = new Date();
    await as(a.userId, async (r) => {
      await r.outcomes.insert(makeOutcome(a.goal.id, { position: null, archivedAt }));
      await r.outcomes.insert(makeOutcome(a.goal.id, { position: null, archivedAt }));
      await r.actions.insert(makeAction(a.goal.id, a.outcome.id, { position: null, archivedAt }));
      await r.actions.insert(makeAction(a.goal.id, a.outcome.id, { position: null, archivedAt }));
    });
  });

  it('2c. position bounds are 0..7 in the DB (8 and -1 rejected, also via setPositions)', async () => {
    const a = await seedTree();
    await expect(as(a.userId, (r) => r.outcomes.insert(makeOutcome(a.goal.id, { position: 8 })))).rejects.toThrow();
    await expect(as(a.userId, (r) => r.actions.insert(makeAction(a.goal.id, a.outcome.id, { position: 8 })))).rejects.toThrow();
    await expect(as(a.userId, (r) => r.outcomes.insert(makeOutcome(a.goal.id, { position: -1 })))).rejects.toThrow();
    const o = makeOutcome(a.goal.id, { position: 1 });
    await as(a.userId, (r) => r.outcomes.insert(o));
    await expect(as(a.userId, (r) => r.outcomes.setPositions(a.goal.id, [{ id: o.id, position: 8 }]))).rejects.toThrow();
  });

  // D-01 ---------------------------------------------------------------------------------------
  it('3a. D-01: outcome duplicate position throws UniqueViolationError', async () => {
    const a = await seedTree();
    await expect(as(a.userId, (r) => r.outcomes.insert(makeOutcome(a.goal.id, { position: 0 })))).rejects.toBeInstanceOf(UniqueViolationError);
  });

  it('3b. D-01: action duplicate position throws UniqueViolationError', async () => {
    const a = await seedTree();
    await expect(as(a.userId, (r) => r.actions.insert(makeAction(a.goal.id, a.outcome.id, { position: 0 })))).rejects.toBeInstanceOf(UniqueViolationError);
  });

  it('3c. D-01 (re-expressed): duplicate email signup throws EMAIL_TAKEN [FakeAuthGateway only]', async () => {
    await t.createUser({ email: 'dup@example.com' });
    await expect(t.auth.signUp({ email: 'dup@example.com', password: 'longenough1', displayName: 'x', timeZone: 'UTC' }))
      .rejects.toBeInstanceOf(AuthGatewayError);
  });

  // D-02 ---------------------------------------------------------------------------------------
  it('4. D-02: action with goalId X but outcomeId from goal Y is rejected', async () => {
    const x = await seedTree();
    const y = await seedTree();
    await expect(as(x.userId, (r) => r.actions.insert(makeAction(x.goal.id, y.outcome.id, { position: 5 })))).rejects.toThrow();
  });

  it("4b. D-02: actions.update cannot move action under another goal's outcome", async () => {
    const x = await seedTree();
    const y = await seedTree();
    await expect(as(x.userId, (r) => r.actions.update({ ...x.action, outcomeId: y.outcome.id, position: 5 }))).rejects.toThrow();
    // and nothing changed
    const got = await as(x.userId, (r) => r.actions.findById(x.userId, x.action.id));
    expect(got!.outcomeId).toBe(x.outcome.id);
  });

  it("4c. D-02 (same-user variant): action cannot point at ANOTHER OF THE SAME USER's goal's outcome", async () => {
    const x = await seedTree();
    const g2 = makeGoal(x.userId);
    const o2 = makeOutcome(g2.id);
    await as(x.userId, async (r) => { await r.goals.insert(g2); await r.outcomes.insert(o2); });
    await expect(as(x.userId, (r) => r.actions.insert(makeAction(x.goal.id, o2.id, { position: 6 })))).rejects.toThrow();
  });

  // D-03 ---------------------------------------------------------------------------------------
  it('5. D-03: actions.update persists task -> routine kind change', async () => {
    const a = await seedTree();
    const { action: next } = updateAction(a.action, { kind: 'routine', schedule: { type: 'daily' } }, '2026-01-02', new Date());
    expect(next.kind).toBe('routine');
    expect(next.startDate).toBe('2026-01-02');
    await as(a.userId, (r) => r.actions.update(next)).catch(() => undefined);
    const got = await as(a.userId, (r) => r.actions.findById(a.userId, a.action.id));
    expect(got!.kind).toBe('routine');
    expect(got!.schedule).toEqual({ type: 'daily' });
  });

  it('5b. D-03: kind-change update does not throw', async () => {
    const a = await seedTree();
    const { action: next } = updateAction(a.action, { kind: 'routine', schedule: { type: 'daily' } }, '2026-01-02', new Date());
    await expect(as(a.userId, (r) => r.actions.update(next))).resolves.toBeUndefined();
  });

  it('5c. D-03: routine -> task kind change persists (reverse direction)', async () => {
    const a = await seedTree();
    const routine = makeAction(a.goal.id, a.outcome.id, { position: 1, kind: 'routine', schedule: { type: 'daily' }, startDate: '2026-01-01' });
    await as(a.userId, (r) => r.actions.insert(routine));
    const { action: next } = updateAction(routine, { kind: 'task' }, '2026-01-02', new Date());
    await as(a.userId, (r) => r.actions.update(next)).catch(() => undefined);
    const got = await as(a.userId, (r) => r.actions.findById(a.userId, routine.id));
    expect(got!.kind).toBe('task');
  });

  it('6. routine check add is idempotent', async () => {
    const a = await seedTree();
    const routine = makeAction(a.goal.id, a.outcome.id, { position: 1, kind: 'routine', schedule: { type: 'daily' }, startDate: '2026-01-01' });
    await as(a.userId, (r) => r.actions.insert(routine));
    const mk = () => ({ id: t.deps.ids(), actionId: routine.id, date: '2026-01-05', createdAt: new Date() });
    await as(a.userId, async (r) => { await r.checks.add(mk()); await r.checks.add(mk()); });
    expect(await as(a.userId, (r) => r.checks.listForActions([routine.id], '2026-01-01', '2026-01-31'))).toHaveLength(1);
    await as(a.userId, (r) => r.checks.remove(routine.id, '2026-01-05'));
    await as(a.userId, (r) => r.checks.remove(routine.id, '2026-01-05'));
    expect(await as(a.userId, (r) => r.checks.listForActions([routine.id], '2026-01-01', '2026-01-31'))).toHaveLength(0);
  });

  it('7. setPositions swaps outcome and action positions without violating the exclusion constraint', async () => {
    const a = await seedTree();
    const o2 = makeOutcome(a.goal.id, { position: 1 });
    const a2 = makeAction(a.goal.id, a.outcome.id, { position: 1 });
    await as(a.userId, async (r) => { await r.outcomes.insert(o2); await r.actions.insert(a2); });
    await as(a.userId, async (r) => {
      await r.outcomes.setPositions(a.goal.id, [{ id: a.outcome.id, position: 1 }, { id: o2.id, position: 0 }]);
      await r.actions.setPositions(a.goal.id, [
        { id: a.action.id, outcomeId: a.outcome.id, position: 1 },
        { id: a2.id, outcomeId: a.outcome.id, position: 0 },
      ]);
    });
    await as(a.userId, async (r) => {
      const os = await r.outcomes.listByGoals([a.goal.id]);
      expect(os.map((o) => [o.id, o.position])).toEqual([[o2.id, 0], [a.outcome.id, 1]]);
      const as_ = await r.actions.listByGoals([a.goal.id]);
      expect(Object.fromEntries(as_.map((x) => [x.id, x.position]))).toEqual({ [a2.id]: 0, [a.action.id]: 1 });
    });
  });

  it('7b. setPositions cannot touch rows of a different goal (cross-user)', async () => {
    const x = await seedTree();
    const y = await seedTree();
    await as(x.userId, (r) => r.outcomes.setPositions(x.goal.id, [{ id: y.outcome.id, position: 3 }]));
    await as(y.userId, (r) => r.outcomes.setPositions(x.goal.id, [{ id: y.outcome.id, position: 3 }]));
    const got = await as(y.userId, (r) => r.outcomes.findById(y.userId, y.outcome.id));
    expect(got!.position).toBe(0);
  });

  it('8. error mid-uow leaves no partial goal+outcome', async () => {
    const userId = await t.createUser();
    const goal = makeGoal(userId);
    const outcome = makeOutcome(goal.id);
    await expect(
      as(userId, async (r) => { await r.goals.insert(goal); await r.outcomes.insert(outcome); throw new Error('boom'); }),
    ).rejects.toThrow('boom');
    await as(userId, async (r) => {
      expect(await r.goals.findById(userId, goal.id)).toBeNull();
      expect(await r.outcomes.findById(userId, outcome.id)).toBeNull();
    });
  });

  // 9. sessions: DROPPED. There is no sessions table/repo any more (Supabase Auth owns sessions).

  it('10a. measure with current 0 and non-empty unit round-trips', async () => {
    const a = await seedTree();
    const o = makeOutcome(a.goal.id, { position: 1, measure: { target: 10, current: 0, unit: 'km' } });
    await as(a.userId, (r) => r.outcomes.insert(o));
    const got = await as(a.userId, (r) => r.outcomes.findById(a.userId, o.id));
    expect(got!.measure).toEqual({ target: 10, current: 0, unit: 'km' });
  });

  // D-04 ---------------------------------------------------------------------------------------
  it('10b. D-04: measure with empty unit round-trips as unit "" (not null)', async () => {
    const a = await seedTree();
    const o = makeOutcome(a.goal.id, { position: 1, measure: { target: 10, current: 0, unit: '' } });
    await as(a.userId, (r) => r.outcomes.insert(o));
    const got = await as(a.userId, (r) => r.outcomes.findById(a.userId, o.id));
    expect(got!.measure).toEqual({ target: 10, current: 0, unit: '' });
  });

  it('10c. D-04: outcomes.update with empty unit round-trips as ""', async () => {
    const a = await seedTree();
    const o = makeOutcome(a.goal.id, { position: 1 });
    await as(a.userId, (r) => r.outcomes.insert(o));
    await as(a.userId, (r) => r.outcomes.update({ ...o, measure: { target: 5, current: 1, unit: '' } }));
    const got = await as(a.userId, (r) => r.outcomes.findById(a.userId, o.id));
    expect(got!.measure).toEqual({ target: 5, current: 1, unit: '' });
  });

  it('11. deleting a user cascades to goals/outcomes/actions/checks/reflections/profile; others untouched', async () => {
    const a = await seedTree();
    const keep = await seedTree();
    const routine = makeAction(a.goal.id, a.outcome.id, { position: 1, kind: 'routine', schedule: { type: 'daily' }, startDate: '2026-01-01' });
    await as(a.userId, async (r) => {
      await r.actions.insert(routine);
      await r.checks.add({ id: t.deps.ids(), actionId: routine.id, date: '2026-01-02', createdAt: new Date() });
    });
    await t.auth.deleteUser(a.userId);
    const n = async (sql: string, p: unknown[]) => (await t.client.query<{ n: number }>(sql, p)).rows[0]!.n;
    expect(await n(`select count(*)::int n from profiles where id=$1`, [a.userId])).toBe(0);
    expect(await n(`select count(*)::int n from goals where owner_id=$1`, [a.userId])).toBe(0);
    expect(await n(`select count(*)::int n from outcomes where goal_id=$1`, [a.goal.id])).toBe(0);
    expect(await n(`select count(*)::int n from actions where goal_id=$1`, [a.goal.id])).toBe(0);
    expect(await n(`select count(*)::int n from routine_checks where action_id=$1`, [routine.id])).toBe(0);
    expect(await n(`select count(*)::int n from reflections where goal_id=$1`, [a.goal.id])).toBe(0);
    expect(await as(keep.userId, (r) => r.goals.findById(keep.userId, keep.goal.id))).not.toBeNull();
    expect(await as(keep.userId, (r) => r.actions.findById(keep.userId, keep.action.id))).not.toBeNull();
  });
});
