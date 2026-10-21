import crypto from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createTestDeps, type TestDeps } from '../testing/create-test-deps';
import { getGoalDetail, getToday } from '@/application/queries';
import { buildGoalDetail, buildGraph, buildTodayDTO, checksFrom } from '@/application/read-model';
import {
  SELECT_COLUMNS,
  actionFromRow,
  dailyFocusFromRow,
  goalEventFromRow,
  goalFromRow,
  outcomeFromRow,
  reflectionFromRow,
  routineCheckFromRow,
} from '@/application/rows';
import type { Ctx } from '@/application/result';

/**
 * The native read path (D-017): rows selected as `authenticated` and serialised to JSON exactly like
 * PostgREST does, mapped by rows.ts, assembled by read-model.ts. Must equal what the web server builds
 * through its repositories.
 */
const uuid = (): string => crypto.randomUUID();

/** `select <columns>` as the user, each row as JSON text parsed in JS (PostgREST's wire format). */
async function select<T>(client: PGlite, sub: string, table: keyof typeof SELECT_COLUMNS, where = 'true', params: unknown[] = []): Promise<T[]> {
  return client.transaction(async (tx) => {
    await tx.query(`select set_config('role','authenticated',true), set_config('request.jwt.claims',$1,true)`, [JSON.stringify({ sub })]);
    const { rows } = await tx.query<{ j: string }>(
      `select to_json(t)::text as j from (select ${SELECT_COLUMNS[table]} from public.${table} where ${where}) t`,
      params,
    );
    return rows.map((r) => JSON.parse(r.j) as T);
  });
}

async function rpc(client: PGlite, sub: string, name: string, input: unknown) {
  return client.transaction(async (tx) => {
    await tx.query(`select set_config('role','authenticated',true), set_config('request.jwt.claims',$1,true)`, [JSON.stringify({ sub })]);
    return (await tx.query(`select * from public.${name}($1::jsonb)`, [JSON.stringify(input)])).rows;
  });
}

describe('native read path: rows -> entities -> DTOs', () => {
  let t: TestDeps;
  let A: string;
  let ctx: Ctx;
  const goalId = uuid();
  const routine = uuid();
  const task = uuid();

  beforeAll(async () => {
    t = await createTestDeps();
    A = await t.createUser({ displayName: 'Alice' });
    const today = (await t.client.query<{ d: string }>(`select to_char((now() at time zone 'UTC')::date, 'YYYY-MM-DD') as d`)).rows[0]!.d;
    ctx = { userId: A, now: new Date(), today };
    await rpc(t.client, A, 'create_goal', {
      id: goalId,
      title: 'Read parity',
      targetDate: '2027-06-01',
      outcomes: [
        { title: 'Measured', measure: { target: 10, current: 2.5, unit: 'km' }, actions: [
          { id: task, title: 'Task', kind: 'task', dueDate: today },
          { id: routine, title: 'Routine', kind: 'routine', schedule: { type: 'weekdays', days: [5, 1] } },
        ] },
        { title: 'Plain', position: 4 },
      ],
    });
    await rpc(t.client, A, 'activate_goal', { goalId });
    await rpc(t.client, A, 'check_routine', { actionId: routine, date: today });
    await rpc(t.client, A, 'complete_action', { actionId: task });
    await rpc(t.client, A, 'add_to_today', { actionId: routine });
    await rpc(t.client, A, 'add_reflection', { goalId, date: today, kind: 'daily', wentWell: 'Good' });
  });
  afterAll(async () => t?.close());

  it('row mappers produce the same entities as the server repositories', async () => {
    const viaRepos = await t.deps.uow.run(A, async (r) => ({
      goal: await r.goals.findById(A, goalId),
      outcomes: await r.outcomes.listByGoals([goalId]),
      actions: await r.actions.listByGoals([goalId]),
      checks: await r.checks.listForActions([routine], '2000-01-01', ctx.today),
      focus: await r.focus.listForDate(A, ctx.today),
    }));
    const byId = <T extends { id: string }>(xs: T[]) => [...xs].sort((a, b) => a.id.localeCompare(b.id));
    expect(goalFromRow((await select(t.client, A, 'goals'))[0] as never)).toEqual(viaRepos.goal);
    expect(byId((await select(t.client, A, 'outcomes')).map((r) => outcomeFromRow(r as never)))).toEqual(byId(viaRepos.outcomes));
    expect(byId((await select(t.client, A, 'actions')).map((r) => actionFromRow(r as never)))).toEqual(byId(viaRepos.actions));
    expect((await select(t.client, A, 'routine_checks')).map((r) => routineCheckFromRow(r as never))).toEqual(viaRepos.checks);
    expect((await select(t.client, A, 'daily_focus')).map((r) => dailyFocusFromRow(r as never))).toEqual(viaRepos.focus);
    const refl = (await select(t.client, A, 'reflections')).map((r) => reflectionFromRow(r as never));
    expect(refl).toHaveLength(1);
    expect(refl[0]).toMatchObject({ goalId, kind: 'daily', wentWell: 'Good', date: ctx.today });
    const events = (await select(t.client, A, 'goal_events')).map((r) => goalEventFromRow(r as never));
    expect(events.map((e) => e.type).sort()).toEqual(['action_completed', 'goal_activated', 'goal_created']);
  });

  it('read-model DTOs built from rows equal the web server queries', async () => {
    const goals = (await select(t.client, A, 'goals')).map((r) => goalFromRow(r as never));
    const outcomes = (await select(t.client, A, 'outcomes')).map((r) => outcomeFromRow(r as never));
    const actions = (await select(t.client, A, 'actions')).map((r) => actionFromRow(r as never));
    const checks = (await select(t.client, A, 'routine_checks', 'date >= $1::date', [checksFrom(ctx.today)])).map((r) => routineCheckFromRow(r as never));
    const focus = (await select(t.client, A, 'daily_focus', 'date = $1::date', [ctx.today])).map((r) => dailyFocusFromRow(r as never));
    const graph = buildGraph(outcomes, actions, checks, focus, ctx.today);

    const detail = await getGoalDetail(t.deps, ctx, { goalId });
    expect(detail.ok).toBe(true);
    expect(detail.ok && buildGoalDetail(goals[0]!, graph, ctx.today)).toEqual(detail.ok && detail.data);

    const today = await getToday(t.deps, ctx);
    expect(today.ok).toBe(true);
    const lastReflected = { [goalId]: ctx.today };
    expect(today.ok && buildTodayDTO(goals, graph, lastReflected, ctx.today, 'UTC')).toEqual(today.ok && today.data);
    expect(today.ok && today.data.focus.map((f) => f.action.id)).toEqual([routine]);
  });
});
