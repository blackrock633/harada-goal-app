import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import { NotOwnedError, UniqueViolationError } from '@/application/ports';
import type { Action, Goal, GoalEvent, Outcome, Reflection, RoutineCheck } from '@/domain/types';
import { createTestDeps, type TestDeps } from '../../testing/create-test-deps';

const id = () => crypto.randomUUID();
const now = () => new Date('2026-10-19T12:00:00.000Z');

function makeGoal(ownerId: string, over: Partial<Goal> = {}): Goal {
  return {
    id: id(),
    ownerId,
    title: 'Goal',
    vision: 'vision',
    successCriteria: 'criteria',
    targetDate: '2027-01-31',
    status: 'draft',
    statusBeforeArchive: null,
    purpose: { selfTangible: 'a', selfIntangible: 'b', othersTangible: 'c', othersIntangible: 'd' },
    activatedOn: null,
    achievedAt: null,
    archivedAt: null,
    createdAt: now(),
    updatedAt: now(),
    ...over,
  };
}

function makeOutcome(goalId: string, position: number | null, over: Partial<Outcome> = {}): Outcome {
  return {
    id: id(),
    goalId,
    title: `O${position}`,
    description: 'desc',
    measure: null,
    position,
    archivedAt: null,
    createdAt: now(),
    updatedAt: now(),
    ...over,
  };
}

function makeTask(goalId: string, outcomeId: string, position: number | null, over: Partial<Action> = {}): Action {
  return {
    id: id(),
    goalId,
    outcomeId,
    title: `A${position}`,
    notes: 'notes',
    kind: 'task',
    position,
    dueDate: '2026-11-01',
    completedAt: null,
    schedule: null,
    startDate: null,
    archivedAt: null,
    createdAt: now(),
    updatedAt: now(),
    ...over,
  };
}

describe('repositories (real Postgres + RLS)', () => {
  let t: TestDeps;
  let userId: string;
  let otherId: string;

  beforeEach(async () => {
    t = await createTestDeps();
    userId = await t.createUser();
    otherId = await t.createUser();
  });
  afterEach(() => t.close());

  const run = <T>(fn: Parameters<typeof t.deps.uow.run<T>>[1], as = userId) => t.deps.uow.run(as, fn);

  async function seedGoal(): Promise<Goal> {
    const goal = makeGoal(userId);
    await run((r) => r.goals.insert(goal));
    return goal;
  }

  describe('profiles', () => {
    it('finds and updates the trigger-created profile', async () => {
      const found = await run((r) => r.profiles.findById(userId));
      expect(found).toMatchObject({ id: userId, displayName: 'Test User', timeZone: 'UTC' });
      const at = new Date('2026-10-20T00:00:00.000Z');
      const updated = await run((r) => r.profiles.update(userId, { displayName: 'New', timeZone: 'Europe/Paris', updatedAt: at }));
      expect(updated).toMatchObject({ displayName: 'New', timeZone: 'Europe/Paris', updatedAt: at });
    });

    it('partial update keeps other fields', async () => {
      const updated = await run((r) => r.profiles.update(userId, { displayName: 'Only', updatedAt: now() }));
      expect(updated.timeZone).toBe('UTC');
    });

    it("cannot see or update another user's profile", async () => {
      expect(await run((r) => r.profiles.findById(otherId))).toBeNull();
      await expect(run((r) => r.profiles.update(otherId, { displayName: 'x', updatedAt: now() }))).rejects.toBeInstanceOf(NotOwnedError);
    });
  });

  describe('goals', () => {
    it('round-trips every field including successCriteria', async () => {
      const goal = makeGoal(userId, {
        status: 'archived',
        statusBeforeArchive: 'active',
        activatedOn: '2026-10-01',
        achievedAt: new Date('2026-10-10T00:00:00.000Z'),
        archivedAt: new Date('2026-10-15T00:00:00.000Z'),
      });
      await run((r) => r.goals.insert(goal));
      expect(await run((r) => r.goals.findById(userId, goal.id))).toEqual(goal);
    });

    it('update writes all mutable fields', async () => {
      const goal = await seedGoal();
      const next: Goal = { ...goal, title: 'T2', successCriteria: 'new', status: 'active', activatedOn: '2026-10-19', updatedAt: new Date('2026-10-21T00:00:00.000Z') };
      await run((r) => r.goals.update(next));
      expect(await run((r) => r.goals.findById(userId, goal.id))).toEqual(next);
    });

    it('lists by owner and status; lock returns the goal', async () => {
      const a = await seedGoal();
      const b = makeGoal(userId, { status: 'active', activatedOn: '2026-10-19' });
      await run((r) => r.goals.insert(b));
      expect((await run((r) => r.goals.listByOwner(userId))).map((g) => g.id).sort()).toEqual([a.id, b.id].sort());
      expect((await run((r) => r.goals.listByOwner(userId, ['active']))).map((g) => g.id)).toEqual([b.id]);
      expect(await run((r) => r.goals.lock(userId, a.id))).toEqual(a);
    });

    it("another owner's goal is invisible, not lockable, not deletable", async () => {
      const goal = await seedGoal();
      expect(await run((r) => r.goals.findById(otherId, goal.id), otherId)).toBeNull();
      expect(await run((r) => r.goals.lock(otherId, goal.id), otherId)).toBeNull();
      expect(await run((r) => r.goals.listByOwner(otherId), otherId)).toEqual([]);
      await run((r) => r.goals.deleteById(otherId, goal.id), otherId);
      expect(await run((r) => r.goals.findById(userId, goal.id))).not.toBeNull();
    });

    it("cannot insert a goal owned by someone else", async () => {
      await expect(run((r) => r.goals.insert(makeGoal(otherId)))).rejects.toBeInstanceOf(NotOwnedError);
    });

    it('delete only works for archived goals (RLS)', async () => {
      const goal = await seedGoal();
      await run((r) => r.goals.deleteById(userId, goal.id));
      expect(await run((r) => r.goals.findById(userId, goal.id))).not.toBeNull();
      await run((r) => r.goals.update({ ...goal, status: 'archived', statusBeforeArchive: 'draft', archivedAt: now() }));
      await run((r) => r.goals.deleteById(userId, goal.id));
      expect(await run((r) => r.goals.findById(userId, goal.id))).toBeNull();
    });
  });

  describe('outcomes', () => {
    it('round-trips a measure, a measure with empty unit, and no measure', async () => {
      const goal = await seedGoal();
      const withMeasure = makeOutcome(goal.id, 0, { measure: { target: 10.5, current: 2, unit: 'km' } });
      const emptyUnit = makeOutcome(goal.id, 1, { measure: { target: 100, current: 0, unit: '' } });
      const none = makeOutcome(goal.id, 2);
      const archived = makeOutcome(goal.id, null, { archivedAt: now() });
      await run(async (r) => {
        for (const o of [withMeasure, emptyUnit, none, archived]) await r.outcomes.insert(o);
      });
      for (const o of [withMeasure, emptyUnit, none, archived]) {
        expect(await run((r) => r.outcomes.findById(userId, o.id))).toEqual(o);
      }
      const listed = await run((r) => r.outcomes.listByGoals([goal.id]));
      expect(listed.map((o) => o.id)).toEqual([withMeasure.id, emptyUnit.id, none.id, archived.id]);
    });

    it('update changes and clears the measure', async () => {
      const goal = await seedGoal();
      const o = makeOutcome(goal.id, 0, { measure: { target: 5, current: 1, unit: 'x' } });
      await run((r) => r.outcomes.insert(o));
      const next = { ...o, title: 'new', measure: { target: 5, current: 5, unit: '' } };
      await run((r) => r.outcomes.update(next));
      expect(await run((r) => r.outcomes.findById(userId, o.id))).toEqual(next);
      const cleared = { ...next, measure: null };
      await run((r) => r.outcomes.update(cleared));
      expect(await run((r) => r.outcomes.findById(userId, o.id))).toEqual(cleared);
    });

    it('an empty outcome (no actions) is valid', async () => {
      const goal = await seedGoal();
      const o = makeOutcome(goal.id, 3);
      await run((r) => r.outcomes.insert(o));
      expect(await run((r) => r.actions.listByGoals([goal.id]))).toEqual([]);
    });

    it('duplicate active position -> UniqueViolationError', async () => {
      const goal = await seedGoal();
      await run((r) => r.outcomes.insert(makeOutcome(goal.id, 0)));
      await expect(run((r) => r.outcomes.insert(makeOutcome(goal.id, 0)))).rejects.toBeInstanceOf(UniqueViolationError);
    });

    it('rejects positions outside 0..7', async () => {
      const goal = await seedGoal();
      await expect(run((r) => r.outcomes.insert(makeOutcome(goal.id, 8)))).rejects.toThrow();
      await expect(run((r) => r.outcomes.insert(makeOutcome(goal.id, -1)))).rejects.toThrow();
    });

    it('setPositions swaps 0 and 1', async () => {
      const goal = await seedGoal();
      const a = makeOutcome(goal.id, 0);
      const b = makeOutcome(goal.id, 1);
      await run(async (r) => {
        await r.outcomes.insert(a);
        await r.outcomes.insert(b);
      });
      await run((r) => r.outcomes.setPositions(goal.id, [{ id: a.id, position: 1 }, { id: b.id, position: 0 }]));
      const byId = new Map((await run((r) => r.outcomes.listByGoals([goal.id]))).map((o) => [o.id, o.position]));
      expect(byId.get(a.id)).toBe(1);
      expect(byId.get(b.id)).toBe(0);
    });

    it('setPositions applies a full permutation of 8', async () => {
      const goal = await seedGoal();
      const os = Array.from({ length: 8 }, (_, i) => makeOutcome(goal.id, i));
      await run(async (r) => {
        for (const o of os) await r.outcomes.insert(o);
      });
      const perm = [3, 7, 0, 5, 1, 6, 2, 4];
      await run((r) => r.outcomes.setPositions(goal.id, os.map((o, i) => ({ id: o.id, position: perm[i]! }))));
      const listed = await run((r) => r.outcomes.listByGoals([goal.id]));
      expect(listed.map((o) => o.position)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
      expect(listed.map((o) => o.id)).toEqual(perm.map((_, p) => os[perm.indexOf(p)]!.id));
    });

    it('setPositions with a colliding final state fails', async () => {
      const goal = await seedGoal();
      const a = makeOutcome(goal.id, 0);
      const b = makeOutcome(goal.id, 1);
      await run(async (r) => {
        await r.outcomes.insert(a);
        await r.outcomes.insert(b);
      });
      await expect(
        run((r) => r.outcomes.setPositions(goal.id, [{ id: a.id, position: 1 }])),
      ).rejects.toBeInstanceOf(UniqueViolationError);
    });

    it("findById is null for another owner's outcome and inserting into their goal is rejected", async () => {
      const goal = await seedGoal();
      const o = makeOutcome(goal.id, 0);
      await run((r) => r.outcomes.insert(o));
      expect(await run((r) => r.outcomes.findById(otherId, o.id), otherId)).toBeNull();
      await expect(run((r) => r.outcomes.insert(makeOutcome(goal.id, 1)), otherId)).rejects.toBeInstanceOf(NotOwnedError);
    });
  });

  describe('actions', () => {
    async function seedOutcome() {
      const goal = await seedGoal();
      const outcome = makeOutcome(goal.id, 0);
      await run((r) => r.outcomes.insert(outcome));
      return { goal, outcome };
    }

    it('round-trips tasks and every routine schedule shape', async () => {
      const { goal, outcome } = await seedOutcome();
      const routine = (position: number, schedule: Action['schedule']): Action =>
        makeTask(goal.id, outcome.id, position, { kind: 'routine', dueDate: null, schedule, startDate: '2026-10-19' });
      const list = [
        makeTask(goal.id, outcome.id, 0, { completedAt: new Date('2026-10-18T00:00:00.000Z') }),
        routine(1, { type: 'daily' }),
        routine(2, { type: 'weekdays', days: [1, 3, 5] }),
        routine(3, { type: 'weekly', timesPerWeek: 3 }),
        makeTask(goal.id, outcome.id, null, { archivedAt: now(), dueDate: null }),
      ];
      await run(async (r) => {
        for (const a of list) await r.actions.insert(a);
      });
      for (const a of list) expect(await run((r) => r.actions.findById(userId, a.id))).toEqual(a);
      expect((await run((r) => r.actions.listByGoals([goal.id]))).map((a) => a.id)).toEqual(list.map((a) => a.id));
    });

    it('update changes kind task -> routine and back', async () => {
      const { goal, outcome } = await seedOutcome();
      const task = makeTask(goal.id, outcome.id, 0);
      await run((r) => r.actions.insert(task));
      const asRoutine: Action = { ...task, kind: 'routine', dueDate: null, schedule: { type: 'weekdays', days: [2, 4] }, startDate: '2026-10-19', updatedAt: new Date('2026-10-22T00:00:00.000Z') };
      await run((r) => r.actions.update(asRoutine));
      expect(await run((r) => r.actions.findById(userId, task.id))).toEqual(asRoutine);
      const backToTask: Action = { ...asRoutine, kind: 'task', schedule: null, startDate: null, dueDate: '2026-12-01' };
      await run((r) => r.actions.update(backToTask));
      expect(await run((r) => r.actions.findById(userId, task.id))).toEqual(backToTask);
    });

    it('update archives (position null) and moves between outcomes', async () => {
      const { goal, outcome } = await seedOutcome();
      const second = makeOutcome(goal.id, 1);
      await run((r) => r.outcomes.insert(second));
      const a = makeTask(goal.id, outcome.id, 0);
      await run((r) => r.actions.insert(a));
      const moved = { ...a, outcomeId: second.id };
      await run((r) => r.actions.update(moved));
      expect(await run((r) => r.actions.findById(userId, a.id))).toEqual(moved);
      const archived = { ...moved, position: null, archivedAt: now() };
      await run((r) => r.actions.update(archived));
      expect(await run((r) => r.actions.findById(userId, a.id))).toEqual(archived);
    });

    it('duplicate position in an outcome -> UniqueViolationError', async () => {
      const { goal, outcome } = await seedOutcome();
      await run((r) => r.actions.insert(makeTask(goal.id, outcome.id, 2)));
      await expect(run((r) => r.actions.insert(makeTask(goal.id, outcome.id, 2)))).rejects.toBeInstanceOf(UniqueViolationError);
    });

    it('rejects positions outside 0..7', async () => {
      const { goal, outcome } = await seedOutcome();
      await expect(run((r) => r.actions.insert(makeTask(goal.id, outcome.id, 8)))).rejects.toThrow();
    });

    it("action whose outcome belongs to another goal -> NotOwnedError", async () => {
      const { goal } = await seedOutcome();
      const goal2 = await seedGoal();
      const foreign = makeOutcome(goal2.id, 0);
      await run((r) => r.outcomes.insert(foreign));
      await expect(run((r) => r.actions.insert(makeTask(goal.id, foreign.id, 0)))).rejects.toBeInstanceOf(NotOwnedError);
    });

    it('setPositions swaps 0 and 1 and applies a full permutation', async () => {
      const { goal, outcome } = await seedOutcome();
      const as = Array.from({ length: 8 }, (_, i) => makeTask(goal.id, outcome.id, i));
      await run(async (r) => {
        for (const a of as) await r.actions.insert(a);
      });
      await run((r) =>
        r.actions.setPositions(goal.id, [
          { id: as[0]!.id, outcomeId: outcome.id, position: 1 },
          { id: as[1]!.id, outcomeId: outcome.id, position: 0 },
        ]),
      );
      let pos = new Map((await run((r) => r.actions.listByGoals([goal.id]))).map((a) => [a.id, a.position]));
      expect(pos.get(as[0]!.id)).toBe(1);
      expect(pos.get(as[1]!.id)).toBe(0);

      const perm = [7, 6, 5, 4, 3, 2, 1, 0];
      await run((r) => r.actions.setPositions(goal.id, as.map((a, i) => ({ id: a.id, outcomeId: outcome.id, position: perm[i]! }))));
      pos = new Map((await run((r) => r.actions.listByGoals([goal.id]))).map((a) => [a.id, a.position]));
      as.forEach((a, i) => expect(pos.get(a.id)).toBe(perm[i]));
    });

    it('setPositions can move an action to another outcome', async () => {
      const { goal, outcome } = await seedOutcome();
      const second = makeOutcome(goal.id, 1);
      await run((r) => r.outcomes.insert(second));
      const a = makeTask(goal.id, outcome.id, 0);
      await run((r) => r.actions.insert(a));
      await run((r) => r.actions.setPositions(goal.id, [{ id: a.id, outcomeId: second.id, position: 4 }]));
      expect(await run((r) => r.actions.findById(userId, a.id))).toMatchObject({ outcomeId: second.id, position: 4 });
    });

    it("findById is null for another owner's action", async () => {
      const { goal, outcome } = await seedOutcome();
      const a = makeTask(goal.id, outcome.id, 0);
      await run((r) => r.actions.insert(a));
      expect(await run((r) => r.actions.findById(otherId, a.id), otherId)).toBeNull();
    });
  });

  describe('routine checks', () => {
    it('add is idempotent, lists inclusively by range, remove is idempotent', async () => {
      const goal = await seedGoal();
      const outcome = makeOutcome(goal.id, 0);
      const routine = makeTask(goal.id, outcome.id, 0, { kind: 'routine', dueDate: null, schedule: { type: 'daily' }, startDate: '2026-10-01' });
      await run(async (r) => {
        await r.outcomes.insert(outcome);
        await r.actions.insert(routine);
      });
      const check = (date: string): RoutineCheck => ({ id: id(), actionId: routine.id, date, createdAt: now() });
      const c1 = check('2026-10-10');
      await run(async (r) => {
        await r.checks.add(c1);
        await r.checks.add({ ...c1, id: id() });
        await r.checks.add(check('2026-10-12'));
        await r.checks.add(check('2026-10-20'));
      });
      const listed = await run((r) => r.checks.listForActions([routine.id], '2026-10-10', '2026-10-12'));
      expect(listed.map((c) => c.date)).toEqual(['2026-10-10', '2026-10-12']);
      expect(listed[0]).toEqual(c1);
      await run(async (r) => {
        await r.checks.remove(routine.id, '2026-10-10');
        await r.checks.remove(routine.id, '2026-10-10');
      });
      expect(await run((r) => r.checks.listForActions([routine.id], '2026-10-01', '2026-10-31'))).toHaveLength(2);
      expect(await run((r) => r.checks.listForActions([], '2026-10-01', '2026-10-31'))).toEqual([]);
    });

    it("cannot add a check to another user's routine", async () => {
      const goal = await seedGoal();
      const outcome = makeOutcome(goal.id, 0);
      const routine = makeTask(goal.id, outcome.id, 0, { kind: 'routine', dueDate: null, schedule: { type: 'daily' }, startDate: '2026-10-01' });
      await run(async (r) => {
        await r.outcomes.insert(outcome);
        await r.actions.insert(routine);
      });
      await expect(
        run((r) => r.checks.add({ id: id(), actionId: routine.id, date: '2026-10-10', createdAt: now() }), otherId),
      ).rejects.toBeInstanceOf(NotOwnedError);
    });
  });

  describe('reflections', () => {
    const make = (goalId: string, date: string, over: Partial<Reflection> = {}): Reflection => ({
      id: id(),
      goalId,
      date,
      kind: 'daily',
      wentWell: 'w',
      didntGoWell: 'd',
      nextChange: 'n',
      answers: {},
      createdAt: now(),
      updatedAt: now(),
      ...over,
    });

    it('round-trips, updates, lists newest first with before, latestDateByGoals, delete', async () => {
      await t.client.query(`insert into plan_grants (user_id, plan_id, reason) values ($1, 'pro', 'test')`, [userId]);
      const goal = await seedGoal();
      const r1 = make(goal.id, '2026-10-10');
      const r2 = make(goal.id, '2026-10-12', { kind: 'weekly' });
      const r3 = make(goal.id, '2026-10-14');
      await run(async (r) => {
        for (const x of [r1, r2, r3]) await r.reflections.insert(x);
      });
      expect(await run((r) => r.reflections.findById(userId, r2.id))).toEqual(r2);
      expect((await run((r) => r.reflections.listByGoal(goal.id, { limit: 10 }))).map((x) => x.id)).toEqual([r3.id, r2.id, r1.id]);
      expect((await run((r) => r.reflections.listByGoal(goal.id, { limit: 10, before: '2026-10-14' }))).map((x) => x.id)).toEqual([r2.id, r1.id]);
      expect((await run((r) => r.reflections.listByGoal(goal.id, { limit: 1 }))).map((x) => x.id)).toEqual([r3.id]);
      expect(await run((r) => r.reflections.latestDateByGoals([goal.id]))).toEqual({ [goal.id]: '2026-10-14' });
      expect(await run((r) => r.reflections.latestDateByGoals([]))).toEqual({});

      const next = { ...r1, wentWell: 'changed', updatedAt: new Date('2026-10-30T00:00:00.000Z') };
      await run((r) => r.reflections.update(next));
      expect(await run((r) => r.reflections.findById(userId, r1.id))).toEqual(next);
      await run((r) => r.reflections.deleteById(r1.id));
      expect(await run((r) => r.reflections.findById(userId, r1.id))).toBeNull();
    });

    it("findById is null for another owner", async () => {
      const goal = await seedGoal();
      const x = make(goal.id, '2026-10-10');
      await run((r) => r.reflections.insert(x));
      expect(await run((r) => r.reflections.findById(otherId, x.id), otherId)).toBeNull();
    });
  });

  describe('goal events', () => {
    it('appends and lists newest first with before; is append-only', async () => {
      const goal = await seedGoal();
      const ev = (sec: number, over: Partial<GoalEvent> = {}): GoalEvent => ({
        id: id(),
        goalId: goal.id,
        type: 'goal_created',
        subjectId: null,
        summary: `e${sec}`,
        data: { n: sec, nested: { ok: true } },
        occurredAt: new Date(Date.UTC(2026, 9, 19, 12, 0, sec)),
        ...over,
      });
      const e1 = ev(1);
      const e2 = ev(2, { type: 'outcome_added', subjectId: id() });
      const e3 = ev(3);
      await run(async (r) => {
        for (const e of [e1, e2, e3]) await r.events.append(e);
      });
      expect(await run((r) => r.events.listByGoal(goal.id, { limit: 10 }))).toEqual([e3, e2, e1]);
      expect(await run((r) => r.events.listByGoal(goal.id, { limit: 10, before: e3.occurredAt }))).toEqual([e2, e1]);
      expect(await run((r) => r.events.listByGoal(goal.id, { limit: 1 }))).toEqual([e3]);
      // goal_events has no UPDATE grant for the authenticated role.
      await expect(
        t.client.transaction(async (tx) => {
          await tx.query(`select set_config('role', 'authenticated', true), set_config('request.jwt.claims', $1, true)`, [
            JSON.stringify({ sub: userId }),
          ]);
          await tx.query(`update public.goal_events set summary = 'x'`);
        }),
      ).rejects.toThrow();
    });
  });
});
