import crypto from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDeps, type TestDeps } from '../testing/create-test-deps';
import * as useCases from '@/application/use-cases';
import type { Ctx, Result } from '@/application/result';

/**
 * Drift guard for D-017: the web app writes through the TypeScript use cases, the native app through the SQL
 * RPCs. The same script of commands runs through both, one user each; every step must give the same outcome
 * (ok or the same error code) and the resulting rows and events must match once ids and timestamps are
 * normalised. A rule changed on one side only fails here.
 */
type Outcome = 'ok' | string;
type Exec = (op: string, input: Record<string, unknown>) => Promise<Outcome>;

const SQLSTATE_TO_CODE: Record<string, string> = {
  HG400: 'VALIDATION', HG401: 'UNAUTHENTICATED', HG404: 'NOT_FOUND', HG409: 'CONFLICT',
  HG422: 'INVALID_STATE', HG429: 'LIMIT_REACHED', '42501': 'NOT_FOUND',
};

/** camelCase use-case name for each snake_case RPC. */
const USE_CASE: Record<string, keyof typeof useCases> = {
  create_goal: 'createGoal', update_goal: 'updateGoal', activate_goal: 'activateGoal',
  mark_goal_achieved: 'markGoalAchieved', reopen_goal: 'reopenGoal', archive_goal: 'archiveGoal',
  restore_goal: 'restoreGoal', delete_goal: 'deleteGoalPermanently', add_outcome: 'addOutcome',
  update_outcome: 'updateOutcome', update_measure_current: 'updateMeasureCurrent', archive_outcome: 'archiveOutcome',
  restore_outcome: 'restoreOutcome', reorder_outcomes: 'reorderOutcomes', add_action: 'addAction',
  update_action: 'updateAction', complete_action: 'completeAction', reopen_action: 'reopenAction',
  check_routine: 'checkRoutine', uncheck_routine: 'uncheckRoutine', archive_action: 'archiveAction',
  restore_action: 'restoreAction', move_action: 'moveAction', reorder_actions: 'reorderActions',
  add_to_today: 'addToToday', remove_from_today: 'removeFromToday', add_reflection: 'addReflection',
  update_reflection: 'updateReflection', delete_reflection: 'deleteReflection',
};

describe('TypeScript use cases and SQL RPCs stay in step', () => {
  let t: TestDeps;
  let today: string;
  let future: string;
  const users: Record<'ts' | 'rpc', string> = { ts: '', rpc: '' };
  const ids: Record<'ts' | 'rpc', Record<string, string>> = { ts: {}, rpc: {} };
  const steps: Record<'ts' | 'rpc', Outcome[]> = { ts: [], rpc: [] };
  /** Updated_at strings as each side last saw them, for expectedUpdatedAt. */
  const seen: Record<'ts' | 'rpc', Record<string, string>> = { ts: {}, rpc: {} };

  const tsExec = (): Exec => async (op, input) => {
    const ctx: Ctx = { userId: users.ts, now: new Date(), today };
    const fn = useCases[USE_CASE[op]!] as unknown as (d: unknown, c: Ctx, i: unknown) => Promise<Result<unknown>>;
    const r = await fn(t.deps, ctx, input);
    if (r.ok && r.data && typeof r.data === 'object' && 'updatedAt' in r.data && 'id' in r.data) {
      seen.ts[(r.data as { id: string }).id] = (r.data as { updatedAt: string }).updatedAt;
    }
    return r.ok ? 'ok' : r.error.code;
  };

  const rpcExec = (): Exec => async (op, input) => {
    try {
      const rows = await t.client.transaction(async (tx) => {
        await tx.query(`select set_config('role','authenticated',true), set_config('request.jwt.claims',$1,true)`, [
          JSON.stringify({ sub: users.rpc }),
        ]);
        return (await tx.query<Record<string, unknown>>(`select * from public.${op}($1::jsonb)`, [JSON.stringify(input)])).rows;
      });
      for (const row of rows) {
        if (row.id && row.updated_at instanceof Date) seen.rpc[row.id as string] = (row.updated_at as Date).toISOString();
      }
      return 'ok';
    } catch (e) {
      const code = String((e as { code?: string }).code);
      return SQLSTATE_TO_CODE[code] ?? code;
    }
  };

  /** The script: [rpc name, input built from per-side labelled ids]. */
  function script(side: 'ts' | 'rpc'): [string, Record<string, unknown>][] {
    const id = (label: string) => (ids[side][label] ??= crypto.randomUUID());
    const fresh = (label: string) => seen[side][id(label)] ?? '';
    return [
      ['create_goal', { id: id('G'), title: '  Learn piano ', vision: 'Play Chopin', purpose: { selfTangible: 'Joy' } }],
      ['create_goal', { id: id('G'), title: 'Learn piano' }], // idempotent replay
      ['create_goal', { title: '   ' }],
      ['add_outcome', { id: id('O1'), goalId: id('G'), title: 'Technique' }],
      ['add_outcome', { id: id('O2'), goalId: id('G'), title: 'Repertoire', position: 5 }],
      ['add_outcome', { goalId: id('G'), title: 'Clash', position: 5 }],
      ['add_outcome', { goalId: id('G'), title: 'Bad slot', position: 9 }],
      ['activate_goal', { goalId: id('G') }],
      ['add_action', { id: id('T1'), outcomeId: id('O1'), title: 'Scales', kind: 'task', dueDate: today }],
      ['add_action', { id: id('R1'), outcomeId: id('O1'), title: 'Practice', kind: 'routine', schedule: { type: 'weekdays', days: [5, 1, 1] } }],
      ['add_action', { outcomeId: id('O1'), title: 'No schedule', kind: 'routine' }],
      ['add_action', { outcomeId: id('O1'), title: 'Task with schedule', kind: 'task', schedule: { type: 'daily' } }],
      ['activate_goal', { goalId: id('G') }],
      ['activate_goal', { goalId: id('G') }],
      ['update_goal', { goalId: id('G'), title: 'Learn jazz piano', purpose: { othersTangible: 'Gigs' } }],
      ['update_goal', { goalId: id('G'), expectedUpdatedAt: '2020-01-01T00:00:00.000Z', title: 'Stale' }],
      ['update_goal', { goalId: id('G'), expectedUpdatedAt: fresh('G'), vision: 'Play standards' }],
      ['complete_action', { actionId: id('T1') }],
      ['complete_action', { actionId: id('T1') }],
      ['reopen_action', { actionId: id('T1') }],
      ['complete_action', { actionId: id('R1') }],
      ['check_routine', { actionId: id('R1'), date: today }],
      ['check_routine', { actionId: id('R1'), date: today }],
      ['check_routine', { actionId: id('R1'), date: future }],
      ['check_routine', { actionId: id('T1'), date: today }],
      ['move_action', { actionId: id('T1'), toOutcomeId: id('O2'), toPosition: 3 }],
      ['move_action', { actionId: id('R1'), toOutcomeId: id('O2'), toPosition: 3 }],
      ['reorder_actions', { outcomeId: id('O2'), orderedIds: [id('T1')] }],
      ['reorder_actions', { outcomeId: id('O2'), orderedIds: [id('R1')] }],
      ['reorder_outcomes', { goalId: id('G'), orderedIds: [id('O2'), id('O1')] }],
      ['update_outcome', { outcomeId: id('O1'), description: 'Hands', measure: { target: 100, current: 10, unit: 'bpm' } }],
      ['update_measure_current', { outcomeId: id('O1'), current: 25.5 }],
      ['update_measure_current', { outcomeId: id('O2'), current: 1 }],
      ['update_measure_current', { outcomeId: id('O1'), current: -1 }],
      ['archive_action', { actionId: id('T1') }],
      ['restore_action', { actionId: id('T1') }],
      ['archive_outcome', { outcomeId: id('O1') }],
      ['restore_action', { actionId: id('R1') }],
      ['restore_outcome', { outcomeId: id('O1') }],
      ['update_action', { actionId: id('R1'), kind: 'task', dueDate: today }],
      ['update_action', { actionId: id('R1'), kind: 'routine', schedule: { type: 'weekly', timesPerWeek: 3 } }],
      ['update_action', { actionId: id('R1'), schedule: null }],
      ['add_to_today', { actionId: id('T1') }],
      ['add_to_today', { actionId: id('T1') }],
      ['add_to_today', { actionId: id('T1'), date: future.replace(/\d{4}/, '2999') }],
      ['remove_from_today', { actionId: id('T1') }],
      ['add_to_today', { actionId: id('R1') }],
      ['add_reflection', { id: id('F1'), goalId: id('G'), date: today, kind: 'daily', wentWell: ' Good ' }],
      ['add_reflection', { id: id('F1'), goalId: id('G'), date: today, kind: 'daily', wentWell: 'Good' }],
      ['add_reflection', { goalId: id('G'), date: future, kind: 'daily', wentWell: 'x' }],
      ['add_reflection', { goalId: id('G'), date: today, kind: 'weekly' }],
      ['update_reflection', { reflectionId: id('F1'), nextChange: 'Slower', kind: 'weekly' }],
      ['update_reflection', { reflectionId: id('F1'), wentWell: '', nextChange: '' }],
      ['mark_goal_achieved', { goalId: id('G') }],
      ['add_to_today', { actionId: id('T1') }],
      ['reopen_goal', { goalId: id('G') }],
      ['archive_goal', { goalId: id('G') }],
      ['archive_goal', { goalId: id('G') }],
      ['update_goal', { goalId: id('G'), title: 'Nope' }],
      ['add_outcome', { goalId: id('G'), title: 'Nope' }],
      ['complete_action', { actionId: id('T1') }],
      ['restore_goal', { goalId: id('G') }],
      ['add_outcome', { goalId: id('G'), title: 'Back' }],
      ['delete_goal', { goalId: id('G'), confirmTitle: 'Learn jazz piano' }],
      ['archive_goal', { goalId: id('G') }],
      ['delete_goal', { goalId: id('G'), confirmTitle: 'learn jazz piano' }],
      ['delete_reflection', { reflectionId: id('F1') }],
      ['delete_reflection', { reflectionId: id('F1') }],
    ];
  }

  /** Rows of one user, ids replaced by labels and server-generated ids/timestamps dropped. */
  async function state(side: 'ts' | 'rpc') {
    const label = new Map(Object.entries(ids[side]).map(([k, v]) => [v, k]));
    const norm = (v: unknown): unknown => {
      if (typeof v === 'string') return label.get(v) ?? (/^[0-9a-f-]{36}$/.test(v) ? '<generated id>' : v);
      if (Array.isArray(v)) return v.map(norm);
      if (v && typeof v === 'object' && !(v instanceof Date)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, norm(x)]));
      return v;
    };
    const drop = ['created_at', 'updated_at', 'occurred_at', 'archived_at', 'completed_at', 'achieved_at', 'owner_id'];
    const rows = async (sql: string) =>
      (await t.client.query<Record<string, unknown>>(sql, [users[side]])).rows.map((r) => {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(r)) {
          if (drop.includes(k)) out[k] = v === null ? null : 'set';
          else if (k === 'id' && !label.has(v as string)) continue;
          else out[k] = norm(v);
        }
        return out;
      });
    const goalIds = `select id from goals where owner_id = $1`;
    const sortKey = (r: Record<string, unknown>) => JSON.stringify(r);
    const sorted = (xs: Record<string, unknown>[]) => xs.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    return {
      goals: sorted(await rows(`select * from goals where owner_id = $1`)),
      outcomes: sorted(await rows(`select * from outcomes where goal_id in (${goalIds})`)),
      actions: sorted(await rows(`select * from actions where goal_id in (${goalIds})`)),
      checks: sorted(await rows(`select c.action_id, c.date from routine_checks c join actions a on a.id = c.action_id where a.goal_id in (${goalIds})`)),
      focus: sorted(await rows(`select action_id, date, slot from daily_focus where owner_id = $1`)),
      reflections: sorted(await rows(`select * from reflections where goal_id in (${goalIds})`)),
      events: sorted(await rows(`select type, subject_id, summary, data from goal_events where goal_id in (${goalIds})`)),
    };
  }

  beforeAll(async () => {
    t = await createTestDeps();
    users.ts = await t.createUser({ displayName: 'Web' });
    users.rpc = await t.createUser({ displayName: 'Native' });
    for (const u of [users.ts, users.rpc]) {
      await t.client.query(`insert into plan_grants (user_id, plan_id, reason) values ($1, 'pro', 'test')`, [u]);
    }
    const d = (await t.client.query<{ today: string; future: string }>(
      `select to_char(d, 'YYYY-MM-DD') as today, to_char(d + 1, 'YYYY-MM-DD') as future from (select (now() at time zone 'UTC')::date as d) x`,
    )).rows[0]!;
    today = d.today;
    future = d.future;
  });
  afterAll(async () => t?.close());

  it('every step has the same outcome, and the data ends up the same', async () => {
    const lengths = new Set<number>();
    for (const side of ['ts', 'rpc'] as const) {
      const exec = side === 'ts' ? tsExec() : rpcExec();
      const s = script(side);
      lengths.add(s.length);
      for (let i = 0; i < s.length; i++) {
        // Re-build lazily so `fresh()` sees updated_at values from earlier steps.
        const [op, input] = script(side)[i]!;
        steps[side].push(await exec(op, input));
      }
    }
    expect(lengths.size).toBe(1);
    const labelled = (side: 'ts' | 'rpc') => script(side).map(([op], i) => `${i}:${op}=${steps[side][i]}`);
    expect(labelled('rpc')).toEqual(labelled('ts'));
    // The script must exercise failures as well as successes.
    expect(steps.ts.filter((s) => s !== 'ok').length).toBeGreaterThan(15);
    expect(await state('rpc')).toEqual(await state('ts'));
  });
});
