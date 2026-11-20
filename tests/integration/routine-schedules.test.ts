import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Transaction } from '@electric-sql/pglite';
import * as uc from '@/application/use-cases';
import { getGoalDetail } from '@/application/queries';
import type { Ctx } from '@/application/result';
import { actionFromRow, SELECT_COLUMNS, type ActionRow } from '@/application/rows';
import { createTestDeps, type TestDeps } from '@/infrastructure/testing/create-test-deps';

/** Monthly and specific-date routines (20261027150000_routine_schedule_options.sql), on both write paths. */
let t: TestDeps;
let user: string;
let outcomeId: string;
const today = new Date().toISOString().slice(0, 10);
const ctx = (): Ctx => ({ userId: user, now: new Date(), today });

function rpc<T = Record<string, unknown>>(name: string, input: unknown): Promise<T> {
  return t.client.transaction(async (tx: Transaction) => {
    await tx.query(`select set_config('role','authenticated',true), set_config('request.jwt.claims',$1,true)`, [
      JSON.stringify({ sub: user, role: 'authenticated' }),
    ]);
    return (await tx.query<T>(`select * from public.${name}($1::jsonb)`, [JSON.stringify(input)])).rows[0]!;
  });
}

/** Reads the action the way the mobile app does (SELECT_COLUMNS + actionFromRow). */
async function readBack(id: string) {
  const { rows } = await t.client.query<ActionRow>(`select ${SELECT_COLUMNS.actions} from actions where id = $1`, [id]);
  return actionFromRow(rows[0]!);
}

beforeAll(async () => {
  t = await createTestDeps();
  user = await t.createUser();
  const g = await uc.createGoal(t.deps, ctx(), { title: 'Schedules' });
  if (!g.ok) throw new Error(g.error.message);
  const o = await uc.addOutcome(t.deps, ctx(), { goalId: g.data.id, title: 'Area' });
  if (!o.ok) throw new Error(o.error.message);
  outcomeId = o.data.id;
});
afterAll(() => t?.close());

describe('app write path (RPCs)', () => {
  it('creates a monthly routine, normalising the days', async () => {
    const r = await rpc<{ id: string }>('add_action', {
      outcomeId, title: 'Pay rent', kind: 'routine', schedule: { type: 'monthly', daysOfMonth: [15, 1, 15] },
    });
    expect((await readBack(r.id)).schedule).toEqual({ type: 'monthly', daysOfMonth: [1, 15] });
  });

  it('creates a specific-dates routine, sorted and de-duplicated, then switches it back to daily', async () => {
    const r = await rpc<{ id: string; updated_at: string }>('add_action', {
      outcomeId, title: 'Recitals', kind: 'routine', schedule: { type: 'dates', dates: ['2026-12-12', '2026-11-07', '2026-12-12'] },
    });
    expect((await readBack(r.id)).schedule).toEqual({ type: 'dates', dates: ['2026-11-07', '2026-12-12'] });

    await rpc('update_action', { actionId: r.id, schedule: { type: 'daily' } });
    const row = (await t.client.query<{ d: unknown }>(`select schedule_dates d from actions where id = $1`, [r.id])).rows[0]!;
    expect(row.d).toBeNull(); // no stale dates left behind
    expect((await readBack(r.id)).schedule).toEqual({ type: 'daily' });
  });

  it('rejects malformed schedules with a validation error', async () => {
    const bad = [
      { type: 'monthly', daysOfMonth: [] },
      { type: 'monthly', daysOfMonth: [0] },
      { type: 'monthly', daysOfMonth: [32] },
      { type: 'dates', dates: [] },
      { type: 'dates', dates: ['2026-02-30'] },
      { type: 'dates', dates: ['next week'] },
      { type: 'dates', dates: Array.from({ length: 61 }, (_, i) => `2027-01-01`.replace('01-01', `0${1 + Math.floor(i / 28)}-${String((i % 28) + 1).padStart(2, '0')}`)) },
    ];
    for (const schedule of bad) {
      await expect(rpc('add_action', { outcomeId, title: 'X', kind: 'routine', schedule }), JSON.stringify(schedule)).rejects.toThrow();
    }
  });
});

describe('web write path (repositories) and the database guard', () => {
  it('stores and reads both new schedules through the use cases', async () => {
    const m = await uc.addAction(t.deps, ctx(), { outcomeId, title: 'Review budget', kind: 'routine', schedule: { type: 'monthly', daysOfMonth: [31] } });
    if (!m.ok) throw new Error(m.error.message);
    expect((await readBack(m.data.id)).schedule).toEqual({ type: 'monthly', daysOfMonth: [31] });
    const d = await uc.addAction(t.deps, ctx(), { outcomeId, title: 'Exams', kind: 'routine', schedule: { type: 'dates', dates: ['2026-12-01'] } });
    if (!d.ok) throw new Error(d.error.message);
    expect((await readBack(d.data.id)).schedule).toEqual({ type: 'dates', dates: ['2026-12-01'] });
    const detail = await getGoalDetail(t.deps, ctx(), { goalId: (await t.client.query<{ goal_id: string }>(`select goal_id from outcomes where id = $1`, [outcomeId])).rows[0]!.goal_id });
    if (!detail.ok) throw new Error(detail.error.message);
    const fromRepo = JSON.stringify(detail.data);
    expect(fromRepo).toContain('"dates":["2026-12-01"]');
    expect(fromRepo).toContain('"daysOfMonth":[31]');
  });

  it('the table refuses inconsistent schedule columns from any writer', async () => {
    const id = crypto.randomUUID();
    const goalId = (await t.client.query<{ goal_id: string }>(`select goal_id from outcomes where id = $1`, [outcomeId])).rows[0]!.goal_id;
    await expect(
      t.client.query(
        `insert into actions (id, goal_id, outcome_id, title, kind, position, schedule_type, schedule_days, start_date)
         values ($1, $2, $3, 'X', 'routine', 7, 'dates', '{1}', current_date)`,
        [id, goalId, outcomeId],
      ),
    ).rejects.toThrow(/actions_schedule_shape_check|actions_outcome_position/);
  });
});
