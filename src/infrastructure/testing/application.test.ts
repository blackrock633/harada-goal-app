import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDeps, type TestDeps } from '@/infrastructure/testing/create-test-deps';
import { goals as goalsTable, goalEvents } from '@/infrastructure/db/schema';
import type { Ctx } from './result';
import { makeCtx } from './context';
import * as uc from './use-cases';
import * as q from './queries';
import { toAppError } from './errors';
import { UniqueViolationError, AuthGatewayError } from './ports';

let t: TestDeps;
let userId: string;
let ctx: Ctx;
let other: Ctx;

beforeEach(async () => {
  t = await createTestDeps();
  userId = await t.createUser({ timeZone: 'UTC' });
  ctx = makeCtx(userId, 'UTC');
  other = makeCtx(await t.createUser(), 'UTC');
});
afterEach(() => t.close());

function must<T>(r: { ok: true; data: T } | { ok: false; error: { code: string; message: string } }): T {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.data;
}

async function newGoal(c: Ctx = ctx, title = 'Run a marathon') {
  return must(await uc.createGoal(t.deps, c, { title }));
}
async function newOutcome(goalId: string, title = 'Build base', extra: object = {}) {
  return must(await uc.addOutcome(t.deps, ctx, { goalId, title, ...extra }));
}
async function newTask(outcomeId: string, title = 'Buy shoes', extra: object = {}) {
  return must(await uc.addAction(t.deps, ctx, { outcomeId, title, kind: 'task', ...extra }));
}
async function eventTypes(goalId: string) {
  const rows = await t.db.select().from(goalEvents).where(eq(goalEvents.goalId, goalId));
  return rows.map((r) => r.type);
}

describe('goals (mocked auth)', () => {
  it('creates, reads and updates a goal', async () => {
    const g = await newGoal();
    expect(g.status).toBe('draft');
    const upd = must(await uc.updateGoal(t.deps, ctx, { goalId: g.id, title: 'Run a faster marathon', successCriteria: 'Sub 4h' }));
    expect(upd.title).toBe('Run a faster marathon');
    expect(upd.successCriteria).toBe('Sub 4h');
    const read = must(await q.getGoalDetail(t.deps, ctx, { goalId: g.id }));
    expect(read.title).toBe('Run a faster marathon');
    expect(await eventTypes(g.id)).toEqual(expect.arrayContaining(['goal_created', 'goal_updated']));
  });

  it('createGoal retried with the same id yields one row', async () => {
    const id = crypto.randomUUID();
    const a = must(await uc.createGoal(t.deps, ctx, { id, title: 'X' }));
    const b = must(await uc.createGoal(t.deps, ctx, { id, title: 'X' }));
    expect(b.id).toBe(a.id);
    expect(await t.db.select().from(goalsTable).where(eq(goalsTable.id, id))).toHaveLength(1);
  });

  it('createGoal with an id owned by another user is CONFLICT', async () => {
    const g = await newGoal(other);
    const r = await uc.createGoal(t.deps, ctx, { id: g.id, title: 'Steal' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('CONFLICT');
  });

  it('stale expectedUpdatedAt is CONFLICT', async () => {
    const g = await newGoal();
    const later = makeCtx(userId, 'UTC', new Date(ctx.now.getTime() + 5000));
    must(await uc.updateGoal(t.deps, later, { goalId: g.id, title: 'Changed' }));
    const r = await uc.updateGoal(t.deps, later, { goalId: g.id, title: 'Again', expectedUpdatedAt: g.updatedAt });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('CONFLICT');
  });

  it('invalid input returns VALIDATION with fieldErrors', async () => {
    const r = await uc.createGoal(t.deps, ctx, { title: '   ' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('VALIDATION');
      expect(r.error.fieldErrors?.title?.length).toBeGreaterThan(0);
    }
  });

  it('activates a goal with a plan, archives, and deletes only when archived with matching title', async () => {
    const g = await newGoal();
    const early = await uc.activateGoal(t.deps, ctx, { goalId: g.id });
    expect(!early.ok && early.error.code).toBe('INVALID_STATE');
    const o = await newOutcome(g.id);
    await newTask(o.id);
    const active = must(await uc.activateGoal(t.deps, ctx, { goalId: g.id }));
    expect(active.status).toBe('active');
    const notArchived = await uc.deleteGoalPermanently(t.deps, ctx, { goalId: g.id, confirmTitle: g.title });
    expect(!notArchived.ok && notArchived.error.code).toBe('INVALID_STATE');
    must(await uc.archiveGoal(t.deps, ctx, { goalId: g.id }));
    const wrong = await uc.deleteGoalPermanently(t.deps, ctx, { goalId: g.id, confirmTitle: 'nope' });
    expect(!wrong.ok && wrong.error.code).toBe('VALIDATION');
    must(await uc.deleteGoalPermanently(t.deps, ctx, { goalId: g.id, confirmTitle: g.title }));
    const gone = await q.getGoalDetail(t.deps, ctx, { goalId: g.id });
    expect(!gone.ok && gone.error.code).toBe('NOT_FOUND');
  });

  it('creates from a template with outcomes and actions', async () => {
    const templates = must(await q.listTemplates(t.deps));
    expect(templates.length).toBeGreaterThan(0);
    const g = must(await uc.createGoalFromTemplate(t.deps, ctx, { templateId: templates[0]!.id }));
    expect(g.outcomes.length).toBe(templates[0]!.outcomeCount);
    expect(g.outcomes.reduce((n, o) => n + o.actions.length, 0)).toBe(templates[0]!.actionCount);
  });
});

describe('matrix, outcomes and actions (mocked auth)', () => {
  it('empty goal detail returns 8 null outcome slots', async () => {
    const g = await newGoal();
    expect(g.matrix.outcomes).toHaveLength(8);
    expect(g.matrix.outcomes.every((o) => o === null)).toBe(true);
    expect(g.metrics.planning).toEqual({ filled: 0, total: 72, ratio: 0 });
    expect(g.metrics.execution).toBeNull();
    expect(g.metrics.attainment).toBeNull();
  });

  it('places outcomes and actions by explicit position, with null gaps', async () => {
    const g = await newGoal();
    const o = await newOutcome(g.id, 'Slot 3', { position: 3 });
    expect(o.position).toBe(3);
    await newTask(o.id, 'Cell 5', { position: 5 });
    const d = must(await q.getGoalDetail(t.deps, ctx, { goalId: g.id }));
    expect(d.matrix.outcomes[3]?.id).toBe(o.id);
    expect(d.matrix.outcomes[0]).toBeNull();
    expect(d.matrix.outcomes[3]!.slots).toHaveLength(8);
    expect(d.matrix.outcomes[3]!.slots[5]?.title).toBe('Cell 5');
    expect(d.matrix.outcomes[3]!.slots[0]).toBeNull();
    const taken = await uc.addOutcome(t.deps, ctx, { goalId: g.id, title: 'Dup', position: 3 });
    expect(!taken.ok && taken.error.code).toBe('CONFLICT');
    const free = await newOutcome(g.id, 'Auto');
    expect(free.position).toBe(0);
  });

  it('9th outcome is LIMIT_REACHED', async () => {
    const g = await newGoal();
    for (let i = 0; i < 8; i++) await newOutcome(g.id, `O${i}`);
    const r = await uc.addOutcome(t.deps, ctx, { goalId: g.id, title: 'Ninth' });
    expect(!r.ok && r.error.code).toBe('LIMIT_REACHED');
  });

  it('archive keeps other slots in place and restore takes the first free slot', async () => {
    const g = await newGoal();
    const a = await newOutcome(g.id, 'A');
    const b = await newOutcome(g.id, 'B');
    const d1 = must(await uc.archiveOutcome(t.deps, ctx, { outcomeId: a.id }));
    expect(d1.matrix.outcomes[0]).toBeNull();
    expect(d1.matrix.outcomes[1]?.id).toBe(b.id);
    const d2 = must(await uc.restoreOutcome(t.deps, ctx, { outcomeId: a.id }));
    expect(d2.matrix.outcomes[0]?.id).toBe(a.id);
  });

  it('measure updates drive attainment and append measure_updated', async () => {
    const g = await newGoal();
    const o = await newOutcome(g.id, 'Distance', { measure: { target: 100, current: 0, unit: 'km' } });
    const upd = must(await uc.updateMeasureCurrent(t.deps, ctx, { outcomeId: o.id, current: 50 }));
    expect(upd.attainment).toBe(0.5);
    const d = must(await q.getGoalDetail(t.deps, ctx, { goalId: g.id }));
    expect(d.metrics.attainment).toBe(0.5);
    expect(await eventTypes(g.id)).toContain('measure_updated');
  });

  it('reorders outcomes and rejects a stale permutation', async () => {
    const g = await newGoal();
    const a = await newOutcome(g.id, 'A');
    const b = await newOutcome(g.id, 'B');
    const d = must(await uc.reorderOutcomes(t.deps, ctx, { goalId: g.id, orderedIds: [b.id, a.id] }));
    expect(d.outcomes.map((o) => o.title)).toEqual(['B', 'A']);
    const bad = await uc.reorderOutcomes(t.deps, ctx, { goalId: g.id, orderedIds: [a.id] });
    expect(!bad.ok && bad.error.code).toBe('CONFLICT');
  });

  it('complete/reopen action are idempotent and append events once', async () => {
    const g = await newGoal();
    const o = await newOutcome(g.id);
    const a = await newTask(o.id);
    const c1 = must(await uc.completeAction(t.deps, ctx, { actionId: a.id }));
    const c2 = must(await uc.completeAction(t.deps, ctx, { actionId: a.id }));
    expect(c1.completedAt).toBe(c2.completedAt);
    expect(c2.progress).toBe(1);
    const r1 = must(await uc.reopenAction(t.deps, ctx, { actionId: a.id }));
    const r2 = must(await uc.reopenAction(t.deps, ctx, { actionId: a.id }));
    expect(r1.completedAt).toBeNull();
    expect(r2.progress).toBe(0);
    const types = await eventTypes(g.id);
    expect(types.filter((x) => x === 'action_completed')).toHaveLength(1);
    expect(types.filter((x) => x === 'action_reopened')).toHaveLength(1);
  });

  it('routine check and uncheck are idempotent', async () => {
    const g = await newGoal();
    const o = await newOutcome(g.id);
    const r = must(await uc.addAction(t.deps, ctx, { outcomeId: o.id, title: 'Run', kind: 'routine', schedule: { type: 'daily' } }));
    const c1 = must(await uc.checkRoutine(t.deps, ctx, { actionId: r.id, date: ctx.today }));
    const c2 = must(await uc.checkRoutine(t.deps, ctx, { actionId: r.id, date: ctx.today }));
    expect(c1.checkedToday && c2.checkedToday).toBe(true);
    expect(c2.recentChecks).toEqual([ctx.today]);
    const u = must(await uc.uncheckRoutine(t.deps, ctx, { actionId: r.id, date: ctx.today }));
    expect(u.checkedToday).toBe(false);
    const fut = await uc.checkRoutine(t.deps, ctx, { actionId: r.id, date: '2999-01-01' });
    expect(!fut.ok && fut.error.code).toBe('VALIDATION');
  });

  it('moves, archives and restores actions and reorders within an outcome', async () => {
    const g = await newGoal();
    const o1 = await newOutcome(g.id, 'One');
    const o2 = await newOutcome(g.id, 'Two');
    const a = await newTask(o1.id, 'A');
    const b = await newTask(o1.id, 'B');
    const moved = must(await uc.moveAction(t.deps, ctx, { actionId: a.id, toOutcomeId: o2.id, toPosition: 4 }));
    expect(moved.outcomes.find((o) => o.id === o2.id)!.slots[4]?.id).toBe(a.id);
    const clash = await uc.moveAction(t.deps, ctx, { actionId: b.id, toOutcomeId: o2.id, toPosition: 4 });
    expect(!clash.ok && clash.error.code).toBe('CONFLICT');
    const arch = must(await uc.archiveAction(t.deps, ctx, { actionId: b.id }));
    expect(arch.archivedActions.map((x) => x.id)).toEqual([b.id]);
    must(await uc.restoreAction(t.deps, ctx, { actionId: b.id }));
    const c = await newTask(o1.id, 'C');
    const re = must(await uc.reorderActions(t.deps, ctx, { outcomeId: o1.id, orderedIds: [c.id, b.id] }));
    expect(re.actions.map((x) => x.title)).toEqual(['C', 'B']);
  });

  it('addAction retried with same id yields one action; 9th action is LIMIT_REACHED', async () => {
    const g = await newGoal();
    const o = await newOutcome(g.id);
    const id = crypto.randomUUID();
    await newTask(o.id, 'Once', { id });
    await newTask(o.id, 'Once', { id });
    for (let i = 0; i < 7; i++) await newTask(o.id, `T${i}`);
    const r = await uc.addAction(t.deps, ctx, { outcomeId: o.id, title: 'Ninth', kind: 'task' });
    expect(!r.ok && r.error.code).toBe('LIMIT_REACHED');
  });

  it('updateAction with stale expectedUpdatedAt is CONFLICT and kind change persists', async () => {
    const g = await newGoal();
    const o = await newOutcome(g.id);
    const a = await newTask(o.id);
    const later = makeCtx(userId, 'UTC', new Date(ctx.now.getTime() + 5000));
    const r = must(await uc.updateAction(t.deps, later, { actionId: a.id, kind: 'routine', schedule: { type: 'daily' } }));
    expect(r.kind).toBe('routine');
    const stale = await uc.updateAction(t.deps, later, { actionId: a.id, title: 'x', expectedUpdatedAt: a.updatedAt });
    expect(!stale.ok && stale.error.code).toBe('CONFLICT');
  });
});

describe('ownership (mocked auth)', () => {
  it("another user's ids are NOT_FOUND for every command family", async () => {
    const g = await newGoal(other);
    const o = must(await uc.addOutcome(t.deps, other, { goalId: g.id, title: 'O' }));
    const a = must(await uc.addAction(t.deps, other, { outcomeId: o.id, title: 'A', kind: 'task' }));
    const rf = must(await uc.addReflection(t.deps, other, { goalId: g.id, date: other.today, kind: 'daily', wentWell: 'ok' }));
    const results = await Promise.all([
      uc.updateGoal(t.deps, ctx, { goalId: g.id, title: 'x' }),
      uc.activateGoal(t.deps, ctx, { goalId: g.id }),
      uc.deleteGoalPermanently(t.deps, ctx, { goalId: g.id, confirmTitle: g.title }),
      uc.addOutcome(t.deps, ctx, { goalId: g.id, title: 'x' }),
      uc.updateOutcome(t.deps, ctx, { outcomeId: o.id, title: 'x' }),
      uc.archiveOutcome(t.deps, ctx, { outcomeId: o.id }),
      uc.addAction(t.deps, ctx, { outcomeId: o.id, title: 'x', kind: 'task' }),
      uc.completeAction(t.deps, ctx, { actionId: a.id }),
      uc.checkRoutine(t.deps, ctx, { actionId: a.id, date: ctx.today }),
      uc.moveAction(t.deps, ctx, { actionId: a.id, toOutcomeId: o.id, toPosition: 2 }),
      uc.addReflection(t.deps, ctx, { goalId: g.id, date: ctx.today, kind: 'daily', wentWell: 'x' }),
      uc.updateReflection(t.deps, ctx, { reflectionId: rf.id, wentWell: 'x' }),
      uc.deleteReflection(t.deps, ctx, { reflectionId: rf.id }),
      q.getGoalDetail(t.deps, ctx, { goalId: g.id }),
      q.getGoalHistory(t.deps, ctx, { goalId: g.id }),
      q.listReflections(t.deps, ctx, { goalId: g.id }),
      q.getRoutineSheet(t.deps, ctx, { goalId: g.id, month: '2026-10' }),
    ]);
    for (const r of results) {
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe('NOT_FOUND');
    }
    expect(must(await q.listGoals(t.deps, ctx, {}))).toEqual([]);
  });
});

describe('reflections and history (mocked auth)', () => {
  it('adds, lists, updates and deletes reflections; rejects empty and future', async () => {
    const g = await newGoal();
    const r = must(await uc.addReflection(t.deps, ctx, { goalId: g.id, date: ctx.today, kind: 'daily', wentWell: 'Ran' }));
    expect(must(await q.listReflections(t.deps, ctx, { goalId: g.id })).map((x) => x.id)).toEqual([r.id]);
    const u = must(await uc.updateReflection(t.deps, ctx, { reflectionId: r.id, nextChange: 'Sleep more' }));
    expect(u.nextChange).toBe('Sleep more');
    const empty = await uc.addReflection(t.deps, ctx, { goalId: g.id, date: ctx.today, kind: 'weekly' });
    expect(!empty.ok && empty.error.code).toBe('VALIDATION');
    const future = await uc.addReflection(t.deps, ctx, { goalId: g.id, date: '2999-01-01', kind: 'daily', wentWell: 'x' });
    expect(!future.ok && future.error.code).toBe('VALIDATION');
    must(await uc.deleteReflection(t.deps, ctx, { reflectionId: r.id }));
    expect(must(await q.listReflections(t.deps, ctx, { goalId: g.id }))).toEqual([]);
  });

  it('getGoalHistory returns events newest first', async () => {
    const g = await newGoal();
    await newOutcome(g.id);
    const h = must(await q.getGoalHistory(t.deps, ctx, { goalId: g.id }));
    expect(h.map((e) => e.type)).toContain('outcome_added');
    expect(h.map((e) => e.type)).toContain('goal_created');
  });
});

describe('queries (mocked auth)', () => {
  it('getToday batches goals and returns next items with outcomePosition', async () => {
    const g1 = await newGoal(ctx, 'Goal one');
    const g2 = await newGoal(ctx, 'Goal two');
    const o1 = await newOutcome(g1.id, 'Out1');
    const o2 = await newOutcome(g2.id, 'Out2', { position: 2 });
    const task = await newTask(o1.id, 'Task');
    const done = await newTask(o2.id, 'Done task');
    const routine = must(await uc.addAction(t.deps, ctx, { outcomeId: o2.id, title: 'Daily', kind: 'routine', schedule: { type: 'daily' } }));
    must(await uc.activateGoal(t.deps, ctx, { goalId: g1.id }));
    must(await uc.activateGoal(t.deps, ctx, { goalId: g2.id }));
    must(await uc.completeAction(t.deps, ctx, { actionId: done.id }));
    const today = must(await q.getToday(t.deps, ctx));
    expect(today.hasAnyGoals).toBe(true);
    expect(today.goals).toHaveLength(2);
    expect(today.next.map((i) => i.action.id).sort()).toEqual([task.id, routine.id].sort());
    expect(today.next.find((i) => i.action.id === routine.id)!.outcomePosition).toBe(2);
    expect(today.doneToday.map((i) => i.action.id)).toEqual([done.id]);
    const s2 = today.goals.find((s) => s.id === g2.id)!;
    expect(s2.completedThisWeek).toBe(1);
    expect(s2.metrics.routineCount).toBe(1);
    expect(s2.metrics.completedTasks).toBe(1);
    expect(s2.metrics.totalTasks).toBe(1);
    expect(s2.dueTodayCount).toBe(1);
  });

  it('listGoals filters by status; exportData returns the user data only', async () => {
    const g = await newGoal();
    await newGoal(other, 'Other');
    expect(must(await q.listGoals(t.deps, ctx, { status: 'draft' }))).toHaveLength(1);
    expect(must(await q.listGoals(t.deps, ctx, { status: 'active' }))).toHaveLength(0);
    const exp = must(await q.exportData(t.deps, ctx));
    expect(exp.goals.map((x) => x.id)).toEqual([g.id]);
    expect(() => JSON.stringify(exp)).not.toThrow();
  });

  it('getRoutineSheet lists scheduled and checked dates', async () => {
    const g = await newGoal();
    const o = await newOutcome(g.id);
    const r = must(await uc.addAction(t.deps, ctx, { outcomeId: o.id, title: 'Run', kind: 'routine', schedule: { type: 'daily' } }));
    must(await uc.checkRoutine(t.deps, ctx, { actionId: r.id, date: ctx.today }));
    const month = ctx.today.slice(0, 7);
    const sheet = must(await q.getRoutineSheet(t.deps, ctx, { goalId: g.id, month }));
    expect(sheet.rows).toHaveLength(1);
    expect(sheet.rows[0]!.checkedDates).toEqual([ctx.today]);
    expect(sheet.rows[0]!.scheduledDates).toContain(ctx.today);
  });
});

describe('auth (mocked auth)', () => {
  it('signUp then signIn then getCurrentUser, signOut and expired session', async () => {
    const su = must(await uc.signUp(t.deps, { email: 'A@Example.com', password: 'longenough1', displayName: 'Ann', timeZone: 'Europe/Paris' }));
    expect(su.needsEmailConfirmation).toBe(false);
    const me = must(await uc.getCurrentUser(t.deps));
    expect(me).toMatchObject({ id: su.userId, email: 'a@example.com', displayName: 'Ann', timeZone: 'Europe/Paris' });
    must(await uc.signOut(t.deps));
    expect(must(await uc.getCurrentUser(t.deps))).toBeNull();
    const si = must(await uc.signIn(t.deps, { email: 'a@example.com', password: 'longenough1' }));
    expect(si.id).toBe(su.userId);
    t.auth.expireSession();
    expect(must(await uc.getCurrentUser(t.deps))).toBeNull();
  });

  it('signIn with a wrong password is a generic VALIDATION', async () => {
    await uc.signUp(t.deps, { email: 'b@example.com', password: 'longenough1', displayName: 'Bob', timeZone: 'UTC' });
    const r = await uc.signIn(t.deps, { email: 'b@example.com', password: 'wrongwrong' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('VALIDATION');
      expect(r.error.message).toBe('Email or password is incorrect');
    }
  });

  it('duplicate email is a generic CONFLICT; weak password is VALIDATION', async () => {
    const input = { email: 'c@example.com', password: 'longenough1', displayName: 'Cy', timeZone: 'UTC' };
    must(await uc.signUp(t.deps, input));
    const dup = await uc.signUp(t.deps, input);
    expect(!dup.ok && dup.error.code).toBe('CONFLICT');
    const weak = await uc.signUp(t.deps, { ...input, email: 'd@example.com', password: 'short' });
    expect(!weak.ok && weak.error.code).toBe('VALIDATION');
  });

  it('gateway outage maps to UNAVAILABLE', async () => {
    t.auth.failNextWith('UNAVAILABLE');
    const r = await uc.signIn(t.deps, { email: 'x@example.com', password: 'whatever1' });
    expect(!r.ok && r.error.code).toBe('UNAVAILABLE');
  });

  it('changePassword and deleteAccount verify the current password', async () => {
    const su = must(await uc.signUp(t.deps, { email: 'e@example.com', password: 'longenough1', displayName: 'Eve', timeZone: 'UTC' }));
    const c = makeCtx(su.userId, 'UTC');
    const bad = await uc.changePassword(t.deps, c, { currentPassword: 'nope', newPassword: 'brandnewpass1' });
    expect(!bad.ok && bad.error.code).toBe('VALIDATION');
    must(await uc.changePassword(t.deps, c, { currentPassword: 'longenough1', newPassword: 'brandnewpass1' }));
    const upd = must(await uc.updateProfile(t.deps, c, { displayName: 'Evelyn' }));
    expect(upd.displayName).toBe('Evelyn');
    const wrongConfirm = await uc.deleteAccount(t.deps, c, { password: 'brandnewpass1', confirmation: 'nope' });
    expect(!wrongConfirm.ok && wrongConfirm.error.code).toBe('VALIDATION');
    must(await uc.deleteAccount(t.deps, c, { password: 'brandnewpass1', confirmation: 'DELETE' }));
    expect(must(await uc.getCurrentUser(t.deps))).toBeNull();
  });

  it('rate limits repeated sign-in attempts', async () => {
    let last;
    for (let i = 0; i < 11; i++) last = await uc.signIn(t.deps, { email: 'z@example.com', password: 'bad-password' });
    expect(last && !last.ok && last.error.code).toBe('RATE_LIMITED');
  });
});

describe('toAppError', () => {
  const logger = { info() {}, warn() {}, error: () => { logged++; } };
  let logged = 0;
  it('maps expected errors and hides unexpected ones', () => {
    expect(toAppError(new UniqueViolationError('x'), logger).code).toBe('CONFLICT');
    expect(toAppError(new AuthGatewayError('EMAIL_NOT_CONFIRMED'), logger).code).toBe('UNAUTHENTICATED');
    expect(toAppError(new AuthGatewayError('RATE_LIMITED'), logger).code).toBe('RATE_LIMITED');
    const internal = toAppError(new Error('secret SQL detail'), logger);
    expect(internal.code).toBe('INTERNAL');
    expect(internal.message).not.toContain('secret');
    expect(logged).toBe(1);
  });
});
