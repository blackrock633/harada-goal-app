import crypto from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite, Transaction } from '@electric-sql/pglite';
import { createTestDeps, type TestDeps } from '../testing/create-test-deps';

/**
 * The RPC write path (D-017), called exactly as PostgREST calls it: role `authenticated` with the user's
 * JWT claims and nothing else. Real migrations on PGlite with the auth shim.
 */
type Who = { sub: string } | 'anon' | 'authenticated-noclaims';
type Row = Record<string, unknown>;

const uuid = (): string => crypto.randomUUID();
const TABLES = ['goals', 'outcomes', 'actions', 'routine_checks', 'daily_focus', 'reflections', 'goal_events'];
const RPCS = [
  'create_goal', 'update_goal', 'activate_goal', 'mark_goal_achieved', 'reopen_goal', 'archive_goal',
  'restore_goal', 'delete_goal', 'add_outcome', 'update_outcome', 'update_measure_current',
  'archive_outcome', 'restore_outcome', 'reorder_outcomes', 'add_action', 'update_action',
  'complete_action', 'reopen_action', 'check_routine', 'uncheck_routine', 'archive_action',
  'restore_action', 'move_action', 'reorder_actions', 'add_to_today', 'remove_from_today',
  'add_reflection', 'update_reflection', 'delete_reflection', 'update_profile',
];

async function as<T>(client: PGlite, who: Who, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return client.transaction(async (tx) => {
    if (who === 'anon') await tx.query(`select set_config('role','anon',true)`);
    else if (who === 'authenticated-noclaims') await tx.query(`select set_config('role','authenticated',true)`);
    else {
      await tx.query(`select set_config('role','authenticated',true), set_config('request.jwt.claims',$1,true)`, [
        JSON.stringify({ sub: who.sub, role: 'authenticated' }),
      ]);
    }
    return fn(tx);
  });
}

/** Calls an RPC; returns its rows (one row for single-row functions, none for void). */
function call(client: PGlite, who: Who, name: string, input: unknown): Promise<Row[]> {
  return as(client, who, async (tx) => (await tx.query<Row>(`select * from public.${name}($1::jsonb)`, [JSON.stringify(input)])).rows);
}
const one = async (client: PGlite, who: Who, name: string, input: unknown): Promise<Row> => (await call(client, who, name, input))[0]!;

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return String((e as { code?: string }).code);
  }
  return 'resolved';
}

describe('RPC write path', () => {
  let t: TestDeps;
  let A: string;
  let B: string;
  let today: string;
  const a = () => ({ sub: A });
  const b = () => ({ sub: B });
  const count = async (sql: string, params: unknown[] = []) =>
    Number((await t.client.query<{ n: number }>(`select count(*)::int as n from ${sql}`, params)).rows[0]!.n);

  beforeAll(async () => {
    t = await createTestDeps();
    A = await t.createUser({ displayName: 'Alice' });
    B = await t.createUser({ displayName: 'Bob' });
    today = (await t.client.query<{ d: string }>(`select to_char((now() at time zone 'UTC')::date, 'YYYY-MM-DD') as d`)).rows[0]!.d;
  });
  afterAll(async () => t?.close());

  describe('guard: no direct writes from clients', () => {
    it.each(TABLES)('authenticated (with claims) cannot INSERT/UPDATE/DELETE %s directly', async (table) => {
      const who = { sub: A };
      const insert = table === 'goals'
        ? `insert into goals (id, owner_id, title, status) values ('${uuid()}', '${A}', 'x', 'draft')`
        : `insert into ${table} (id) values ('${uuid()}')`;
      expect(await codeOf(as(t.client, who, (tx) => tx.query(insert)))).toBe('42501');
      expect(await codeOf(as(t.client, who, (tx) => tx.query(`update ${table} set id = id where false`)))).toBe('42501');
      expect(await codeOf(as(t.client, who, (tx) => tx.query(`delete from ${table} where false`)))).toBe('42501');
    });
    it('authenticated cannot UPDATE profiles directly', async () => {
      expect(await codeOf(as(t.client, a(), (tx) => tx.query(`update profiles set display_name = 'x' where id = $1`, [A])))).toBe('42501');
    });
    it.each(TABLES)('anon cannot write %s', async (table) => {
      expect(await codeOf(as(t.client, 'anon', (tx) => tx.query(`delete from ${table} where false`)))).toBe('42501');
    });
    it('the write path does not persist past the RPC transaction', async () => {
      await one(t.client, a(), 'create_goal', { title: 'Persist check' });
      expect(await codeOf(as(t.client, a(), (tx) => tx.query(`delete from goals where false`)))).toBe('42501');
    });
    it('the write path closes when the RPC returns, even inside the same transaction (QA SEC-01)', async () => {
      const id = uuid();
      const code = await codeOf(
        as(t.client, a(), async (tx) => {
          await tx.query(`select * from public.create_goal($1::jsonb)`, [JSON.stringify({ title: 'via rpc' })]);
          return tx.query(`insert into goals (id, owner_id, title, status, achieved_at) values ($1, $2, 'forged', 'achieved', now())`, [id, A]);
        }),
      );
      expect(code).toBe('42501');
      expect(await count(`goals where id = $1`, [id])).toBe(0);
    });
    it('anon cannot execute any RPC; claimless authenticated is UNAUTHENTICATED', async () => {
      expect(await codeOf(call(t.client, 'anon', 'create_goal', { title: 'x' }))).toBe('42501');
      expect(await codeOf(call(t.client, 'authenticated-noclaims', 'create_goal', { title: 'x' }))).toBe('HG401');
    });
  });

  describe('catalog', () => {
    it('every RPC is SECURITY INVOKER, pins search_path, and only authenticated may execute it', async () => {
      const { rows } = await t.client.query<{ name: string; definer: boolean; config: string[] | null; anon: boolean; pub: boolean; authd: boolean }>(
        `select p.proname as name, p.prosecdef as definer, p.proconfig as config,
                has_function_privilege('anon', p.oid, 'execute') as anon,
                exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
                        where x.grantee = 0 and x.privilege_type = 'EXECUTE') as pub,
                has_function_privilege('authenticated', p.oid, 'execute') as authd
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = any($1)`,
        [RPCS],
      );
      expect(rows.map((r) => r.name).sort()).toEqual([...RPCS].sort());
      for (const r of rows) {
        expect({ name: r.name, definer: r.definer, anon: r.anon, pub: r.pub, authd: r.authd }).toEqual({
          name: r.name, definer: false, anon: false, pub: false, authd: true,
        });
        expect(r.config).toContain('search_path=""');
      }
    });
    it('the guard trigger is enabled on every table', async () => {
      const { rows } = await t.client.query<{ rel: string; enabled: string }>(
        `select c.relname as rel, tg.tgenabled as enabled from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
         join pg_proc p on p.oid = tg.tgfoid where p.proname = 'require_write_path'`,
      );
      expect(rows.map((r) => r.rel).sort()).toEqual([...TABLES, 'profiles'].sort());
      expect(rows.every((r) => r.enabled === 'O')).toBe(true);
    });
    it('only harada_private.begin_write sets the write-path flag, and no exposed function runs dynamic SQL', async () => {
      const { rows } = await t.client.query<{ fn: string }>(
        `select n.nspname || '.' || p.proname as fn from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname in ('public', 'harada_private') and p.prosrc ilike '%harada.write_path%' and p.prosrc ilike '%set_config%'`,
      );
      expect(rows.map((r) => r.fn).sort()).toEqual(['harada_private.begin_write', 'harada_private.end_write']);
      const dyn = await t.client.query(
        `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.prosrc ~* '\\mexecute\\M\\s'`,
      );
      expect(dyn.rows).toEqual([]);
    });
  });

  describe('goal lifecycle and matrix initialisation', () => {
    const goalId = uuid();
    const out1 = uuid();
    const out2 = uuid();
    const act1 = uuid();
    const routine = uuid();
    const plan = {
      id: goalId,
      title: '  Run a marathon  ',
      templateId: 'marathon',
      purpose: { selfTangible: 'Fitness' },
      outcomes: [
        { id: out1, title: 'Endurance', measure: { target: 42 }, actions: [
          { id: act1, title: 'Long run', kind: 'task', dueDate: today },
          { id: routine, title: 'Stretch', kind: 'routine', schedule: { type: 'weekdays', days: [3, 1, 1] } },
        ] },
        { id: out2, title: 'Nutrition', position: 5, actions: [{ title: 'Meal plan', kind: 'task' }] },
      ],
    };

    it('create_goal inserts the goal, key areas and actions atomically as a draft', async () => {
      const g = await one(t.client, a(), 'create_goal', plan);
      expect(g).toMatchObject({ id: goalId, owner_id: A, title: 'Run a marathon', status: 'draft', purpose_self_tangible: 'Fitness' });
      expect(await count(`outcomes where goal_id = $1`, [goalId])).toBe(2);
      expect(await count(`actions where goal_id = $1`, [goalId])).toBe(3);
      const o2 = await t.client.query<{ position: number }>(`select position from outcomes where id = $1`, [out2]);
      expect(o2.rows[0]!.position).toBe(5);
      const r = await t.client.query<{ schedule_days: number[]; start_date: Date }>(`select schedule_days, start_date from actions where id = $1`, [routine]);
      expect(r.rows[0]!.schedule_days).toEqual([1, 3]);
      const ev = await t.client.query<{ summary: string; data: unknown }>(`select summary, data from goal_events where goal_id = $1`, [goalId]);
      expect(ev.rows).toEqual([{ summary: 'Created goal "Run a marathon" from a template', data: { templateId: 'marathon' } }]);
    });
    it('create_goal is idempotent on id: a replay returns the goal and inserts nothing', async () => {
      const g = await one(t.client, a(), 'create_goal', plan);
      expect(g.id).toBe(goalId);
      expect(await count(`goals where id = $1`, [goalId])).toBe(1);
      expect(await count(`actions where goal_id = $1`, [goalId])).toBe(3);
      expect(await count(`goal_events where goal_id = $1`, [goalId])).toBe(1);
    });
    it('an invalid nested action rolls back the whole create', async () => {
      const id = uuid();
      const code = await codeOf(call(t.client, a(), 'create_goal', { id, title: 'Bad', outcomes: [{ title: 'O', actions: [{ title: 'x', kind: 'chore' }] }] }));
      expect(code).toBe('HG400');
      expect(await count(`goals where id = $1`, [id])).toBe(0);
    });
    it('malformed nested input and oversized values are VALIDATION, never raw errors (QA P3)', async () => {
      expect(await codeOf(call(t.client, a(), 'create_goal', { title: 'x', outcomes: [['title']] }))).toBe('HG400');
      expect(await codeOf(call(t.client, a(), 'create_goal', { title: 'x', outcomes: [{ title: 'O', measure: { target: 1e300 } }] }))).toBe('HG400');
      expect(await codeOf(call(t.client, a(), 'create_goal', { title: 'x', vision: ' '.repeat(100_000) }))).toBe('HG400');
    });
    it('validation errors carry the field in hint', async () => {
      await expect(call(t.client, a(), 'create_goal', { title: '   ' })).rejects.toMatchObject({ code: 'HG400', hint: 'title' });
      await expect(call(t.client, a(), 'create_goal', { title: 'x'.repeat(121) })).rejects.toMatchObject({ code: 'HG400', hint: 'title' });
      await expect(call(t.client, a(), 'create_goal', { title: 'x', targetDate: '2026-02-30' })).rejects.toMatchObject({ code: 'HG400', hint: 'targetDate' });
    });
    it('update_goal applies a patch, records the changed fields, and rejects stale writes', async () => {
      const before = await one(t.client, a(), 'update_goal', { goalId });
      const g = await one(t.client, a(), 'update_goal', {
        goalId, expectedUpdatedAt: (before.updated_at as Date).toISOString(), title: 'Run a sub-4 marathon', purpose: { othersTangible: 'Charity' },
      });
      expect(g).toMatchObject({ title: 'Run a sub-4 marathon', purpose_others_tangible: 'Charity', purpose_self_tangible: 'Fitness' });
      const ev = await t.client.query<{ summary: string }>(`select summary from goal_events where goal_id = $1 and type = 'goal_updated'`, [goalId]);
      expect(ev.rows).toEqual([{ summary: 'Updated title, purpose' }]);
      expect(await codeOf(call(t.client, a(), 'update_goal', { goalId, expectedUpdatedAt: '2020-01-01T00:00:00.000Z', title: 'x' }))).toBe('HG409');
    });
    it('transitions follow the lifecycle', async () => {
      expect(await one(t.client, a(), 'activate_goal', { goalId })).toMatchObject({ status: 'active' });
      expect(await codeOf(call(t.client, a(), 'activate_goal', { goalId }))).toBe('HG422');
      expect(await one(t.client, a(), 'mark_goal_achieved', { goalId })).toMatchObject({ status: 'achieved' });
      expect(await one(t.client, a(), 'reopen_goal', { goalId })).toMatchObject({ status: 'active', achieved_at: null });
      expect(await one(t.client, a(), 'archive_goal', { goalId })).toMatchObject({ status: 'archived', status_before_archive: 'active' });
      expect(await codeOf(call(t.client, a(), 'update_goal', { goalId, title: 'x' }))).toBe('HG422');
      expect(await one(t.client, a(), 'restore_goal', { goalId })).toMatchObject({ status: 'active', status_before_archive: null });
    });
    it('activation requires a key area with an action', async () => {
      const g = await one(t.client, a(), 'create_goal', { title: 'Empty' });
      expect(await codeOf(call(t.client, a(), 'activate_goal', { goalId: g.id }))).toBe('HG422');
    });

    describe('key areas', () => {
      it('slot conflicts, explicit slots and the 8-area limit', async () => {
        expect(await codeOf(call(t.client, a(), 'add_outcome', { goalId, title: 'Taken', position: 5 }))).toBe('HG409');
        const o = await one(t.client, a(), 'add_outcome', { goalId, title: 'Slot 7', position: 7 });
        expect(o.position).toBe(7);
        for (let i = 0; i < 5; i++) await one(t.client, a(), 'add_outcome', { goalId, title: `Fill ${i}` });
        expect(await count(`outcomes where goal_id = $1 and archived_at is null`, [goalId])).toBe(8);
        expect(await codeOf(call(t.client, a(), 'add_outcome', { goalId, title: 'Ninth' }))).toBe('HG429');
      });
      it('add_outcome replay returns the same row', async () => {
        const id = uuid();
        const g = await one(t.client, a(), 'create_goal', { title: 'Replay' });
        await one(t.client, a(), 'add_outcome', { id, goalId: g.id, title: 'Once' });
        await one(t.client, a(), 'add_outcome', { id, goalId: g.id, title: 'Once' });
        expect(await count(`outcomes where id = $1`, [id])).toBe(1);
      });
      it('measures: set, update current with an event, clear', async () => {
        const o = await one(t.client, a(), 'update_outcome', { outcomeId: out1, measure: { target: 42, current: 10, unit: 'km' } });
        expect(o).toMatchObject({ measure_unit: 'km' });
        expect(Number(o.measure_current)).toBe(10);
        await one(t.client, a(), 'update_measure_current', { outcomeId: out1, current: 21 });
        const ev = await t.client.query<{ summary: string }>(`select summary from goal_events where subject_id = $1 and type = 'measure_updated'`, [out1]);
        expect(ev.rows).toEqual([{ summary: 'Progress 10 → 21' }]);
        expect(await codeOf(call(t.client, a(), 'update_measure_current', { outcomeId: out2, current: 1 }))).toBe('HG422');
        expect(await codeOf(call(t.client, a(), 'update_measure_current', { outcomeId: out1, current: -1 }))).toBe('HG400');
      });
      it('archive frees the slot; restore takes the first free slot', async () => {
        const archived = await one(t.client, a(), 'archive_outcome', { outcomeId: out2 });
        expect(archived).toMatchObject({ position: null });
        const restored = await one(t.client, a(), 'restore_outcome', { outcomeId: out2 });
        expect(restored.position).toBe(5);
      });
      it('reorder must name exactly the active key areas', async () => {
        const ids = (await t.client.query<{ id: string }>(`select id from outcomes where goal_id = $1 and archived_at is null order by position`, [goalId])).rows.map((r) => r.id);
        expect(await codeOf(call(t.client, a(), 'reorder_outcomes', { goalId, orderedIds: ids.slice(1) }))).toBe('HG409');
        const rows = await call(t.client, a(), 'reorder_outcomes', { goalId, orderedIds: [...ids].reverse() });
        expect(rows.map((r) => r.id)).toEqual([...ids].reverse());
      });
    });

    describe('actions', () => {
      it('add, replay, routine needs a schedule, task cannot have one', async () => {
        const id = uuid();
        await one(t.client, a(), 'add_action', { id, outcomeId: out2, title: 'Shop' , kind: 'task' });
        await one(t.client, a(), 'add_action', { id, outcomeId: out2, title: 'Shop', kind: 'task' });
        expect(await count(`actions where id = $1`, [id])).toBe(1);
        expect(await codeOf(call(t.client, a(), 'add_action', { outcomeId: out2, title: 'R', kind: 'routine' }))).toBe('HG400');
        expect(await codeOf(call(t.client, a(), 'add_action', { outcomeId: out2, title: 'T', kind: 'task', schedule: { type: 'daily' } }))).toBe('HG400');
      });
      it('update_action turns a task into a routine and clears task fields', async () => {
        const id = uuid();
        await one(t.client, a(), 'add_action', { id, outcomeId: out2, title: 'Water', kind: 'task', dueDate: today });
        const r = await one(t.client, a(), 'update_action', { actionId: id, kind: 'routine', schedule: { type: 'weekly', timesPerWeek: 3 } });
        expect(r).toMatchObject({ kind: 'routine', due_date: null, schedule_type: 'weekly', schedule_times_per_week: 3 });
        expect(r.start_date).not.toBeNull();
      });
      it('complete and reopen tasks (idempotent); routines cannot be completed', async () => {
        expect((await one(t.client, a(), 'complete_action', { actionId: act1 })).completed_at).not.toBeNull();
        await one(t.client, a(), 'complete_action', { actionId: act1 });
        expect(await count(`goal_events where subject_id = $1 and type = 'action_completed'`, [act1])).toBe(1);
        expect((await one(t.client, a(), 'reopen_action', { actionId: act1 })).completed_at).toBeNull();
        expect(await codeOf(call(t.client, a(), 'complete_action', { actionId: routine }))).toBe('HG422');
      });
      it('routine checks: today ok and idempotent, future rejected, tasks rejected, uncheck', async () => {
        await one(t.client, a(), 'check_routine', { actionId: routine, date: today });
        await one(t.client, a(), 'check_routine', { actionId: routine, date: today });
        expect(await count(`routine_checks where action_id = $1`, [routine])).toBe(1);
        expect(await codeOf(call(t.client, a(), 'check_routine', { actionId: routine, date: '2999-01-01' }))).toBe('HG400');
        expect(await codeOf(call(t.client, a(), 'check_routine', { actionId: act1, date: today }))).toBe('HG422');
        await one(t.client, a(), 'uncheck_routine', { actionId: routine, date: today });
        expect(await count(`routine_checks where action_id = $1`, [routine])).toBe(0);
      });
      it('move into a free slot; a taken slot is a conflict', async () => {
        expect(await codeOf(call(t.client, a(), 'move_action', { actionId: act1, toOutcomeId: out1, toPosition: 1 }))).toBe('HG409');
        const m = await one(t.client, a(), 'move_action', { actionId: act1, toOutcomeId: out2, toPosition: 6 });
        expect(m).toMatchObject({ outcome_id: out2, position: 6 });
      });
      it('reorder actions, archive frees a slot, restore refills it', async () => {
        const ids = (await t.client.query<{ id: string }>(`select id from actions where outcome_id = $1 and archived_at is null order by position`, [out2])).rows.map((r) => r.id);
        const rows = await call(t.client, a(), 'reorder_actions', { outcomeId: out2, orderedIds: [...ids].reverse() });
        expect(rows.map((r) => r.position)).toEqual(ids.map((_, i) => i));
        expect(await one(t.client, a(), 'archive_action', { actionId: act1 })).toMatchObject({ position: null });
        expect((await one(t.client, a(), 'restore_action', { actionId: act1 })).position).not.toBeNull();
      });
    });

    describe('daily focus', () => {
      it('up to 5 per day, re-adding is a no-op, 8 days ahead is rejected, remove works', async () => {
        const g = await one(t.client, a(), 'create_goal', { title: 'Focus', outcomes: [{ title: 'O', actions: [1, 2, 3, 4, 5, 6].map((i) => ({ title: `F${i}`, kind: 'task' })) }] });
        const ids = (await t.client.query<{ id: string }>(`select id from actions where goal_id = $1 order by position`, [g.id])).rows.map((r) => r.id);
        for (const id of ids.slice(0, 5)) await one(t.client, a(), 'add_to_today', { actionId: id });
        await one(t.client, a(), 'add_to_today', { actionId: ids[0] });
        expect(await count(`daily_focus where owner_id = $1 and date = $2`, [A, today])).toBe(5);
        expect(await codeOf(call(t.client, a(), 'add_to_today', { actionId: ids[5] }))).toBe('HG429');
        const far = (await t.client.query<{ d: string }>(`select to_char($1::date + 8, 'YYYY-MM-DD') as d`, [today])).rows[0]!.d;
        expect(await codeOf(call(t.client, a(), 'add_to_today', { actionId: ids[5], date: far }))).toBe('HG400');
        await call(t.client, a(), 'remove_from_today', { actionId: ids[0] });
        expect(await count(`daily_focus where owner_id = $1 and date = $2`, [A, today])).toBe(4);
      });
    });

    describe('reflections and profile', () => {
      it('add (idempotent), reject future and empty, update, delete', async () => {
        const id = uuid();
        await one(t.client, a(), 'add_reflection', { id, goalId, date: today, kind: 'daily', wentWell: 'Ran' });
        await one(t.client, a(), 'add_reflection', { id, goalId, date: today, kind: 'daily', wentWell: 'Ran' });
        expect(await count(`reflections where id = $1`, [id])).toBe(1);
        expect(await codeOf(call(t.client, a(), 'add_reflection', { goalId, date: '2999-01-01', kind: 'daily', wentWell: 'x' }))).toBe('HG400');
        expect(await codeOf(call(t.client, a(), 'add_reflection', { goalId, date: today, kind: 'daily' }))).toBe('HG400');
        expect(await one(t.client, a(), 'update_reflection', { reflectionId: id, nextChange: 'Sleep more' })).toMatchObject({ next_change: 'Sleep more' });
        expect(await codeOf(call(t.client, a(), 'update_reflection', { reflectionId: id, wentWell: '', nextChange: '' }))).toBe('HG400');
        await call(t.client, a(), 'delete_reflection', { reflectionId: id });
        expect(await count(`reflections where id = $1`, [id])).toBe(0);
      });
      it('update_profile validates the time zone', async () => {
        expect(await codeOf(call(t.client, a(), 'update_profile', { timeZone: 'Mars/Olympus' }))).toBe('HG400');
        expect(await one(t.client, a(), 'update_profile', { timeZone: 'America/Chicago', displayName: ' Al ' })).toMatchObject({ time_zone: 'America/Chicago', display_name: 'Al' });
        expect(await codeOf(call(t.client, a(), 'update_profile', {}))).toBe('HG400');
      });
    });

    describe('user B with user A ids', () => {
      it('every RPC answers NOT_FOUND (or CONFLICT for a reused create id) and changes nothing', async () => {
        const snapshot = async () =>
          (await t.client.query(
            `select (select json_agg(g order by id) from goals g where owner_id = $1) as g,
                    (select json_agg(o order by o.id) from outcomes o join goals g on g.id = o.goal_id where g.owner_id = $1) as o,
                    (select json_agg(x order by x.id) from actions x join goals g on g.id = x.goal_id where g.owner_id = $1) as x,
                    (select json_agg(r order by r.id) from reflections r join goals g on g.id = r.goal_id where g.owner_id = $1) as r,
                    (select count(*) from goal_events e join goals g on g.id = e.goal_id where g.owner_id = $1) as e,
                    (select json_agg(p) from profiles p where id = $1) as p`,
            [A],
          )).rows[0];
        const bOwn = await one(t.client, b(), 'create_goal', { title: 'B own', outcomes: [{ title: 'B area' }] });
        const bOwnGoal = bOwn.id as string;
        const bOwnOutcome = (await t.client.query<{ id: string }>(`select id from outcomes where goal_id = $1`, [bOwnGoal])).rows[0]!.id;
        const before = await snapshot();
        const refl = uuid();
        // A fixed past date: A's time zone was changed above, so the UTC `today` may be A's tomorrow.
        await one(t.client, a(), 'add_reflection', { id: refl, goalId, date: '2026-01-02', kind: 'weekly', wentWell: 'x' });
        const beforeWithRefl = await snapshot();
        const cases: [string, unknown][] = [
          ['update_goal', { goalId, title: 'Mine' }],
          ['activate_goal', { goalId }], ['mark_goal_achieved', { goalId }], ['reopen_goal', { goalId }],
          ['archive_goal', { goalId }], ['restore_goal', { goalId }], ['delete_goal', { goalId, confirmTitle: 'x' }],
          ['add_outcome', { goalId, title: 'X' }], ['update_outcome', { outcomeId: out1, title: 'X' }],
          ['update_measure_current', { outcomeId: out1, current: 1 }], ['archive_outcome', { outcomeId: out1 }],
          ['restore_outcome', { outcomeId: out1 }], ['reorder_outcomes', { goalId, orderedIds: [out1] }],
          ['add_action', { outcomeId: out1, title: 'X', kind: 'task' }], ['update_action', { actionId: act1, title: 'X' }],
          ['complete_action', { actionId: act1 }], ['reopen_action', { actionId: act1 }],
          ['check_routine', { actionId: routine, date: today }], ['uncheck_routine', { actionId: routine, date: today }],
          ['archive_action', { actionId: act1 }], ['restore_action', { actionId: act1 }],
          ['move_action', { actionId: act1, toOutcomeId: out1, toPosition: 7 }],
          ['reorder_actions', { outcomeId: out1, orderedIds: [routine] }],
          ['add_to_today', { actionId: act1 }], ['remove_from_today', { actionId: act1 }],
          ['add_reflection', { goalId, date: today, kind: 'daily', wentWell: 'x' }],
          ['update_reflection', { reflectionId: refl, wentWell: 'mine' }], ['delete_reflection', { reflectionId: refl }],
        ];
        expect(new Set(cases.map(([n]) => n))).toEqual(new Set(RPCS.filter((n) => !['create_goal', 'update_profile'].includes(n))));
        for (const [name, input] of cases) {
          expect({ name, code: await codeOf(call(t.client, b(), name, input)) }).toEqual({ name, code: 'HG404' });
        }
        // Reusing A's ids in B's create: rejected as a generic CONFLICT (no constraint name, so no hint about
        // which table the id lives in), and nothing of B's plan is inserted.
        await expect(call(t.client, b(), 'create_goal', { id: goalId, title: 'Mine' })).rejects.toMatchObject({ code: 'HG409', constraint: undefined });
        const bGoal = uuid();
        expect(await codeOf(call(t.client, b(), 'create_goal', { id: bGoal, title: 'Mine', outcomes: [{ id: out1, title: 'Steal' }] }))).toBe('HG409');
        for (const [name, input] of [
          ['add_outcome', { id: out1, goalId: bOwnGoal, title: 'X' }],
          ['add_action', { id: act1, outcomeId: bOwnOutcome, title: 'X', kind: 'task' }],
          ['add_reflection', { id: refl, goalId: bOwnGoal, date: '2026-01-02', kind: 'daily', wentWell: 'x' }],
        ] as const) {
          expect({ name, code: await codeOf(call(t.client, b(), name, input)) }).toEqual({ name, code: 'HG409' });
        }
        expect(await count(`goals where id = $1`, [bGoal])).toBe(0);
        // update_profile can only ever touch the caller's own row.
        await one(t.client, b(), 'update_profile', { displayName: 'Bobby' });
        expect(await snapshot()).toEqual(beforeWithRefl);
        expect(before).not.toEqual(beforeWithRefl);
      });
    });

    it('permanent delete: archived only, exact title, cascades everything including events', async () => {
      const g = await one(t.client, a(), 'create_goal', { title: 'Doomed', outcomes: [{ title: 'O', actions: [{ title: 'A', kind: 'task' }] }] });
      expect(await codeOf(call(t.client, a(), 'delete_goal', { goalId: g.id, confirmTitle: 'Doomed' }))).toBe('HG422');
      await one(t.client, a(), 'archive_goal', { goalId: g.id });
      expect(await codeOf(call(t.client, a(), 'delete_goal', { goalId: g.id, confirmTitle: 'doomed' }))).toBe('HG400');
      await call(t.client, a(), 'delete_goal', { goalId: g.id, confirmTitle: 'Doomed' });
      for (const table of ['goals where id = $1', 'outcomes where goal_id = $1', 'actions where goal_id = $1', 'goal_events where goal_id = $1']) {
        expect(await count(table, [g.id])).toBe(0);
      }
    });
  });
});
