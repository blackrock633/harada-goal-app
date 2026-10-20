import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDeps } from '@/infrastructure/testing/create-test-deps';
import { UniqueViolationError, type Deps } from '@/application/ports';
import { updateAction } from '@/domain/action';
import { makeUser, makeGoal, makeOutcome, makeAction, makeReflection } from './fixtures';

describe('data integrity & isolation (real PGlite)', () => {
  let deps: Deps;
  let close: () => Promise<void>;

  beforeEach(async () => {
    const s = await createTestDeps({ fastHashing: true });
    deps = s.deps;
    close = s.close;
  });
  afterEach(async () => {
    await close();
  });

  /** Seeds user -> goal -> outcome -> action -> reflection. */
  async function seedTree(email?: string) {
    const user = makeUser(email ? { email } : {});
    const goal = makeGoal(user.id);
    const outcome = makeOutcome(goal.id);
    const action = makeAction(goal.id, outcome.id);
    const reflection = makeReflection(goal.id);
    await deps.uow.run(async (r) => {
      await r.users.insert(user, 'hash');
      await r.goals.insert(goal);
      await r.outcomes.insert(outcome);
      await r.actions.insert(action);
      await r.reflections.insert(reflection);
    });
    return { user, goal, outcome, action, reflection };
  }

  it('1. user B cannot read or mutate user A data', async () => {
    const a = await seedTree();
    const b = await seedTree();
    await deps.uow.run(async (r) => {
      expect(await r.goals.findById(b.user.id, a.goal.id)).toBeNull();
      expect(await r.goals.lock(b.user.id, a.goal.id)).toBeNull();
      expect(await r.outcomes.findById(b.user.id, a.outcome.id)).toBeNull();
      expect(await r.actions.findById(b.user.id, a.action.id)).toBeNull();
      expect(await r.reflections.findById(b.user.id, a.reflection.id)).toBeNull();
      // sanity: owner can read
      expect(await r.goals.findById(a.user.id, a.goal.id)).not.toBeNull();

      const listB = await r.goals.listByOwner(b.user.id);
      expect(listB.map((g) => g.id)).toEqual([b.goal.id]);

      const before = await r.goals.findById(a.user.id, a.goal.id);
      await r.goals.update({ ...a.goal, ownerId: b.user.id, title: 'HACKED' });
      await r.goals.deleteById(b.user.id, a.goal.id);
      const after = await r.goals.findById(a.user.id, a.goal.id);
      expect(after).toEqual(before);
      expect(after!.title).toBe('Goal');
    });
  });

  it('2a. duplicate active positions rejected for outcomes and actions', async () => {
    const a = await seedTree();
    await expect(
      deps.uow.run((r) => r.outcomes.insert(makeOutcome(a.goal.id, { position: 0 }))),
    ).rejects.toThrow();
    await expect(
      deps.uow.run((r) => r.actions.insert(makeAction(a.goal.id, a.outcome.id, { position: 0 }))),
    ).rejects.toThrow();
  });

  it('2b. archived rows (position null) do not collide', async () => {
    const a = await seedTree();
    const archivedAt = new Date();
    await deps.uow.run(async (r) => {
      await r.outcomes.insert(makeOutcome(a.goal.id, { position: null, archivedAt }));
      await r.outcomes.insert(makeOutcome(a.goal.id, { position: null, archivedAt }));
      await r.actions.insert(makeAction(a.goal.id, a.outcome.id, { position: null, archivedAt }));
      await r.actions.insert(makeAction(a.goal.id, a.outcome.id, { position: null, archivedAt }));
    });
  });

  it('2c. records DB behaviour for position 8 (docs: 0..7 at rest) and bounds', async () => {
    const a = await seedTree();
    // ACTUAL: DB only enforces 0..107, so position 8 is ACCEPTED (cap of 8 is domain-only).
    await deps.uow.run((r) => r.outcomes.insert(makeOutcome(a.goal.id, { position: 8 })));
    await deps.uow.run((r) => r.actions.insert(makeAction(a.goal.id, a.outcome.id, { position: 8 })));
    // 108 and negative are rejected by check constraint.
    await expect(deps.uow.run((r) => r.outcomes.insert(makeOutcome(a.goal.id, { position: 108 })))).rejects.toThrow();
    await expect(deps.uow.run((r) => r.outcomes.insert(makeOutcome(a.goal.id, { position: -1 })))).rejects.toThrow();
    // Consequence: setPositions' +100 bump overflows the check for a position >= 8.
    const o = makeOutcome(a.goal.id, { position: 1 });
    await deps.uow.run((r) => r.outcomes.insert(o));
    await expect(
      deps.uow.run((r) => r.outcomes.setPositions(a.goal.id, [{ id: o.id, position: 8 }])),
    ).rejects.toThrow();
  });

  // DEFECT documented below; asserts the CONTRACT and currently fails.
  it.fails('3a. DEFECT D-01: outcome duplicate position throws UniqueViolationError', async () => {
    const a = await seedTree();
    await expect(
      deps.uow.run((r) => r.outcomes.insert(makeOutcome(a.goal.id, { position: 0 }))),
    ).rejects.toBeInstanceOf(UniqueViolationError);
  });

  // DEFECT documented below; asserts the CONTRACT and currently fails.
  it.fails('3b. DEFECT D-01: action duplicate position throws UniqueViolationError', async () => {
    const a = await seedTree();
    await expect(
      deps.uow.run((r) => r.actions.insert(makeAction(a.goal.id, a.outcome.id, { position: 0 }))),
    ).rejects.toBeInstanceOf(UniqueViolationError);
  });

  // DEFECT D-01 (users): user-repo checks e.code but Drizzle wraps the driver error in cause.
  it.fails('3c. DEFECT D-01: user duplicate email throws UniqueViolationError', async () => {
    const a = await seedTree('dup@example.com');
    await expect(
      deps.uow.run((r) => r.users.insert(makeUser({ email: a.user.email }), 'h')),
    ).rejects.toBeInstanceOf(UniqueViolationError);
  });

  // DEFECT documented below; asserts the CONTRACT and currently fails.
  it.fails('4. DEFECT D-02: action with goalId X but outcomeId from goal Y is rejected', async () => {
    const x = await seedTree();
    const y = await seedTree();
    await expect(
      deps.uow.run((r) => r.actions.insert(makeAction(x.goal.id, y.outcome.id, { position: 5 }))),
    ).rejects.toThrow();
  });

  // DEFECT documented below; asserts the CONTRACT and currently fails.
  it.fails('4b. DEFECT D-02: actions.update cannot move action under another goal\'s outcome', async () => {
    const x = await seedTree();
    const y = await seedTree();
    await expect(
      deps.uow.run((r) => r.actions.update({ ...x.action, outcomeId: y.outcome.id, position: 5 })),
    ).rejects.toThrow();
  });

  // DEFECT documented below; asserts the CONTRACT and currently fails.
  it.fails('5. DEFECT D-03: actions.update persists task -> routine kind change', async () => {
    const a = await seedTree();
    const { action: next } = updateAction(
      a.action,
      { kind: 'routine', schedule: { type: 'daily' } },
      '2026-01-02',
      new Date(),
    );
    expect(next.kind).toBe('routine');
    expect(next.startDate).toBe('2026-01-02');
    await deps.uow.run((r) => r.actions.update(next)).catch(() => undefined);
    const got = await deps.uow.run((r) => r.actions.findById(a.user.id, a.action.id));
    expect(got!.kind).toBe('routine');
    expect(got!.schedule).toEqual({ type: 'daily' });
  });

  // DEFECT documented below; asserts the CONTRACT and currently fails.
  it.fails('5b. DEFECT D-03: kind-change update does not throw', async () => {
    const a = await seedTree();
    const { action: next } = updateAction(a.action, { kind: 'routine', schedule: { type: 'daily' } }, '2026-01-02', new Date());
    await expect(deps.uow.run((r) => r.actions.update(next))).resolves.toBeUndefined();
  });

  it.fails('5c. DEFECT D-03: routine -> task kind change persists (reverse direction)', async () => {
    const a = await seedTree();
    const routine = makeAction(a.goal.id, a.outcome.id, {
      position: 1, kind: 'routine', schedule: { type: 'daily' }, startDate: '2026-01-01',
    });
    await deps.uow.run((r) => r.actions.insert(routine));
    const { action: next } = updateAction(routine, { kind: 'task' }, '2026-01-02', new Date());
    await deps.uow.run((r) => r.actions.update(next)).catch(() => undefined);
    const got = await deps.uow.run((r) => r.actions.findById(a.user.id, routine.id));
    expect(got!.kind).toBe('task');
  });

  it('6. routine check add is idempotent', async () => {
    const a = await seedTree();
    const routine = makeAction(a.goal.id, a.outcome.id, {
      position: 1, kind: 'routine', schedule: { type: 'daily' }, startDate: '2026-01-01',
    });
    await deps.uow.run((r) => r.actions.insert(routine));
    const mk = () => ({ id: deps.ids(), actionId: routine.id, date: '2026-01-05', createdAt: new Date() });
    await deps.uow.run(async (r) => {
      await r.checks.add(mk());
      await r.checks.add(mk());
    });
    const rows = await deps.uow.run((r) => r.checks.listForActions([routine.id], '2026-01-01', '2026-01-31'));
    expect(rows).toHaveLength(1);
    await deps.uow.run((r) => r.checks.remove(routine.id, '2026-01-05'));
    await deps.uow.run((r) => r.checks.remove(routine.id, '2026-01-05'));
    expect(await deps.uow.run((r) => r.checks.listForActions([routine.id], '2026-01-01', '2026-01-31'))).toHaveLength(0);
  });

  it('7. setPositions swaps outcome and action positions without violating the unique index', async () => {
    const a = await seedTree();
    const o2 = makeOutcome(a.goal.id, { position: 1 });
    const a2 = makeAction(a.goal.id, a.outcome.id, { position: 1 });
    await deps.uow.run(async (r) => {
      await r.outcomes.insert(o2);
      await r.actions.insert(a2);
    });
    await deps.uow.run(async (r) => {
      await r.outcomes.setPositions(a.goal.id, [
        { id: a.outcome.id, position: 1 },
        { id: o2.id, position: 0 },
      ]);
      await r.actions.setPositions(a.goal.id, [
        { id: a.action.id, outcomeId: a.outcome.id, position: 1 },
        { id: a2.id, outcomeId: a.outcome.id, position: 0 },
      ]);
    });
    await deps.uow.run(async (r) => {
      const os = await r.outcomes.listByGoals([a.goal.id]);
      expect(os.map((o) => [o.id, o.position])).toEqual([[o2.id, 0], [a.outcome.id, 1]]);
      const as = await r.actions.listByGoals([a.goal.id]);
      expect(Object.fromEntries(as.map((x) => [x.id, x.position]))).toEqual({ [a2.id]: 0, [a.action.id]: 1 });
    });
  });

  it('7b. setPositions cannot touch rows of a different goal', async () => {
    const x = await seedTree();
    const y = await seedTree();
    await deps.uow.run((r) => r.outcomes.setPositions(x.goal.id, [{ id: y.outcome.id, position: 3 }]));
    const got = await deps.uow.run((r) => r.outcomes.findById(y.user.id, y.outcome.id));
    expect(got!.position).toBe(0);
  });

  it('8. error mid-uow leaves no partial goal+outcome', async () => {
    const user = makeUser();
    await deps.uow.run((r) => r.users.insert(user, 'h'));
    const goal = makeGoal(user.id);
    const outcome = makeOutcome(goal.id);
    await expect(
      deps.uow.run(async (r) => {
        await r.goals.insert(goal);
        await r.outcomes.insert(outcome);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    await deps.uow.run(async (r) => {
      expect(await r.goals.findById(user.id, goal.id)).toBeNull();
      expect(await r.outcomes.findById(user.id, outcome.id)).toBeNull();
    });
  });

  it('9. sessions: expired/deleted invalid; deleteAllForUser keeps exceptId', async () => {
    const user = makeUser();
    await deps.uow.run((r) => r.users.insert(user, 'h'));
    const now = new Date('2026-06-01T00:00:00Z');
    const mk = (id: string, expiresAt: Date) => ({ id, userId: user.id, expiresAt, createdAt: now });
    const future = new Date(now.getTime() + 3600_000);
    const past = new Date(now.getTime() - 3600_000);
    await deps.uow.run(async (r) => {
      await r.sessions.insert(mk('s-valid', future));
      await r.sessions.insert(mk('s-expired', past));
      await r.sessions.insert(mk('s-del', future));
      await r.sessions.insert(mk('s-other', future));
    });
    await deps.uow.run(async (r) => {
      expect((await r.sessions.findValid('s-valid', now))!.user.id).toBe(user.id);
      expect(await r.sessions.findValid('s-expired', now)).toBeNull();
      expect(await r.sessions.findValid('nope', now)).toBeNull();
      await r.sessions.delete('s-del');
      expect(await r.sessions.findValid('s-del', now)).toBeNull();
      await r.sessions.deleteAllForUser(user.id, 's-valid');
      expect(await r.sessions.findValid('s-valid', now)).not.toBeNull();
      expect(await r.sessions.findValid('s-other', now)).toBeNull();
      await r.sessions.deleteAllForUser(user.id);
      expect(await r.sessions.findValid('s-valid', now)).toBeNull();
    });
  });

  it('10a. measure with current 0 and non-empty unit round-trips', async () => {
    const a = await seedTree();
    const o = makeOutcome(a.goal.id, { position: 1, measure: { target: 10, current: 0, unit: 'km' } });
    await deps.uow.run((r) => r.outcomes.insert(o));
    const got = await deps.uow.run((r) => r.outcomes.findById(a.user.id, o.id));
    expect(got!.measure).toEqual({ target: 10, current: 0, unit: 'km' });
  });

  // DEFECT documented below; asserts the CONTRACT and currently fails.
  it.fails('10b. DEFECT D-04: measure with empty unit round-trips as unit "" (not null)', async () => {
    const a = await seedTree();
    const o = makeOutcome(a.goal.id, { position: 1, measure: { target: 10, current: 0, unit: '' } });
    await deps.uow.run((r) => r.outcomes.insert(o));
    const got = await deps.uow.run((r) => r.outcomes.findById(a.user.id, o.id));
    expect(got!.measure).toEqual({ target: 10, current: 0, unit: '' });
  });

  // DEFECT documented below; asserts the CONTRACT and currently fails.
  it.fails('10c. DEFECT D-04: outcomes.update with empty unit round-trips as ""', async () => {
    const a = await seedTree();
    const o = makeOutcome(a.goal.id, { position: 1 });
    await deps.uow.run((r) => r.outcomes.insert(o));
    await deps.uow.run((r) => r.outcomes.update({ ...o, measure: { target: 5, current: 1, unit: '' } }));
    const got = await deps.uow.run((r) => r.outcomes.findById(a.user.id, o.id));
    expect(got!.measure).toEqual({ target: 5, current: 1, unit: '' });
  });

  it('11. deleting a user cascades to goals/outcomes/actions/checks/reflections/sessions', async () => {
    const a = await seedTree();
    const keep = await seedTree();
    const routine = makeAction(a.goal.id, a.outcome.id, {
      position: 1, kind: 'routine', schedule: { type: 'daily' }, startDate: '2026-01-01',
    });
    await deps.uow.run(async (r) => {
      await r.actions.insert(routine);
      await r.checks.add({ id: deps.ids(), actionId: routine.id, date: '2026-01-02', createdAt: new Date() });
      await r.sessions.insert({ id: 'sess-a', userId: a.user.id, expiresAt: new Date(Date.now() + 1e6), createdAt: new Date() });
    });
    await deps.uow.run((r) => r.users.delete(a.user.id));
    await deps.uow.run(async (r) => {
      expect(await r.users.findById(a.user.id)).toBeNull();
      expect(await r.goals.listByOwner(a.user.id)).toEqual([]);
      expect(await r.outcomes.listByGoals([a.goal.id])).toEqual([]);
      expect(await r.actions.listByGoals([a.goal.id])).toEqual([]);
      expect(await r.checks.listForActions([routine.id, a.action.id], '2000-01-01', '2100-01-01')).toEqual([]);
      expect(await r.reflections.listByGoal(a.goal.id, { limit: 10 })).toEqual([]);
      expect(await r.sessions.findValid('sess-a', new Date(0))).toBeNull();
      // other user untouched
      expect(await r.goals.findById(keep.user.id, keep.goal.id)).not.toBeNull();
      expect(await r.actions.findById(keep.user.id, keep.action.id)).not.toBeNull();
    });
  });
});
