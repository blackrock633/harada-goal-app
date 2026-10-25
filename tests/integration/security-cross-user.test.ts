import crypto from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite, Transaction } from '@electric-sql/pglite';
import { createTestDeps, type TestDeps } from '@/infrastructure/testing/create-test-deps';

/**
 * Cross-user isolation, attacker's view (docs/SECURITY_TESTING.md). User A attacks user B with B's real ids.
 * Real migrations + RLS on PGlite, as role `authenticated` with A's JWT claims (exactly what PostgREST does).
 *
 * Each direct-table attack runs twice: as a plain client (the write-path guard stops it first) and with
 * `harada.write_path` forced on, so RLS and grants alone must stop it. A failing test is a confirmed hole.
 */
type Who = { sub: string } | 'anon' | 'authenticated-noclaims' | 'service_role';
type Outcome = { error?: string; code?: string; rows?: Record<string, unknown>[]; affected?: number };

const uuid = () => crypto.randomUUID();

async function setWho(tx: Transaction, who: Who, writePath = false) {
  if (who === 'anon' || who === 'service_role') await tx.query(`select set_config('role',$1,true)`, [who]);
  else if (who === 'authenticated-noclaims') await tx.query(`select set_config('role','authenticated',true)`);
  else
    await tx.query(`select set_config('role','authenticated',true), set_config('request.jwt.claims',$1,true)`, [
      JSON.stringify({ sub: who.sub, role: 'authenticated' }),
    ]);
  if (writePath) await tx.query(`select set_config('harada.write_path','on',true)`);
}

/** Runs `sql` as `who` and always rolls back. */
async function attempt(client: PGlite, who: Who, sql: string, params: unknown[] = [], writePath = false): Promise<Outcome> {
  let out: Outcome = {};
  try {
    await client.transaction(async (tx) => {
      await setWho(tx, who, writePath);
      const r = await tx.query<Record<string, unknown>>(sql, params);
      out = { rows: r.rows, affected: r.affectedRows };
      await tx.rollback();
    });
  } catch (e) {
    out = { error: (e as Error).message, code: (e as { code?: string }).code };
  }
  return out;
}

/** Commits (used for setup through the public RPCs). */
async function rpc(client: PGlite, who: Who, name: string, input: unknown) {
  return client.transaction(async (tx) => {
    await setWho(tx, who);
    return (await tx.query<Record<string, unknown>>(`select * from public.${name}($1::jsonb)`, [JSON.stringify(input)])).rows[0]!;
  });
}

const blocked = (r: Outcome) =>
  expect(r.error !== undefined || (r.affected ?? 0) === 0, `expected blocked, got ${JSON.stringify(r)}`).toBe(true);
const seesNothing = (r: Outcome) => {
  expect(r.error, `query failed: ${r.error}`).toBeUndefined();
  expect(r.rows).toEqual([]);
};

describe('cross-user isolation: user A attacking user B', () => {
  let t: TestDeps;
  let A: string;
  let B: string;
  // B's private records (the victim), and A's own records (the attacker's foothold).
  const b = { goal: '', outcome: '', task: '', routine: '', reflection: '', focus: uuid() };
  const a = { goal: '', outcome: '', task: '' };
  let today = '';
  const asA = () => ({ sub: A });

  const snapshotB = async () =>
    (await t.client.query(
      `select (select json_agg(g order by id) from goals g where owner_id = $1) g,
              (select json_agg(o order by o.id) from outcomes o join goals g on g.id = o.goal_id where g.owner_id = $1) o,
              (select json_agg(x order by x.id) from actions x join goals g on g.id = x.goal_id where g.owner_id = $1) x,
              (select json_agg(r order by r.id) from reflections r join goals g on g.id = r.goal_id where g.owner_id = $1) r,
              (select json_agg(c order by c.id) from routine_checks c join actions x on x.id = c.action_id
                 join goals g on g.id = x.goal_id where g.owner_id = $1) c,
              (select json_agg(f order by f.id) from daily_focus f where owner_id = $1) f,
              (select count(*) from goal_events e join goals g on g.id = e.goal_id where g.owner_id = $1) e,
              (select json_agg(p) from profiles p where id = $1) p`,
      [B],
    )).rows[0];
  let before: unknown;

  beforeAll(async () => {
    t = await createTestDeps();
    A = await t.createUser({ displayName: 'Attacker' });
    B = await t.createUser({ displayName: 'Victim' });
    const c = t.client;
    today = (await c.query<{ d: string }>(`select to_char((now() at time zone 'UTC')::date, 'YYYY-MM-DD') d`)).rows[0]!.d;

    const bg = await rpc(c, { sub: B }, 'create_goal', {
      title: 'B private goal',
      vision: 'B private vision',
      outcomes: [{ title: 'B area', actions: [{ title: 'B task', kind: 'task' }, { title: 'B routine', kind: 'routine', schedule: { type: 'daily' } }] }],
    });
    b.goal = bg.id as string;
    await rpc(c, { sub: B }, 'activate_goal', { goalId: b.goal });
    b.outcome = (await c.query<{ id: string }>(`select id from outcomes where goal_id = $1`, [b.goal])).rows[0]!.id;
    const bActs = (await c.query<{ id: string; kind: string }>(`select id, kind from actions where goal_id = $1`, [b.goal])).rows;
    b.task = bActs.find((x) => x.kind === 'task')!.id;
    b.routine = bActs.find((x) => x.kind === 'routine')!.id;
    await rpc(c, { sub: B }, 'check_routine', { actionId: b.routine, date: today });
    b.reflection = (await rpc(c, { sub: B }, 'add_reflection', { goalId: b.goal, date: today, kind: 'daily', wentWell: 'B private journal' })).id as string;
    await c.query(`insert into daily_focus (id, owner_id, action_id, date, slot) values ($1,$2,$3,$4,0)`, [b.focus, B, b.task, today]);

    const ag = await rpc(c, asA(), 'create_goal', { title: 'A goal', outcomes: [{ title: 'A area', actions: [{ title: 'A task', kind: 'task' }] }] });
    a.goal = ag.id as string;
    a.outcome = (await c.query<{ id: string }>(`select id from outcomes where goal_id = $1`, [a.goal])).rows[0]!.id;
    a.task = (await c.query<{ id: string }>(`select id from actions where goal_id = $1`, [a.goal])).rows[0]!.id;

    before = await snapshotB();
  });
  afterAll(() => t?.close());

  describe('reads', () => {
    it.each([
      ['B goal by id', `select * from goals where id = $1`, () => [b.goal]],
      ['B goals by owner_id', `select * from goals where owner_id = $1`, () => [B]],
      ['B profile', `select * from profiles where id = $1`, () => [B]],
      ['B key areas', `select * from outcomes where goal_id = $1`, () => [b.goal]],
      ['B actions', `select * from actions where goal_id = $1`, () => [b.goal]],
      ['B action by id', `select * from actions where id = $1`, () => [b.task]],
      ['B completion records', `select * from routine_checks where action_id = $1`, () => [b.routine]],
      ['B reflections', `select * from reflections where goal_id = $1`, () => [b.goal]],
      ['B progress history', `select * from goal_events where goal_id = $1`, () => [b.goal]],
      ['B daily focus', `select * from daily_focus where owner_id = $1`, () => [B]],
      ['B children via a join from goals', `select o.* from goals g join outcomes o on o.goal_id = g.id where g.id = $1`, () => [b.goal]],
      ['B children via a join from A action', `select o.* from actions x join outcomes o on o.id = x.outcome_id or o.id = $1`, () => [b.outcome]],
    ])('A cannot read %s', async (_label, sql, params) => {
      const r = await attempt(t.client, asA(), sql, params());
      seesNothing(r.rows ? { rows: r.rows.filter((row) => JSON.stringify(row).includes('B ')) } : r);
    });

    it('A sees only their own rows in every table', async () => {
      for (const table of ['goals', 'outcomes', 'actions', 'routine_checks', 'reflections', 'goal_events', 'daily_focus', 'profiles']) {
        const r = await attempt(t.client, asA(), `select * from ${table}`);
        expect(JSON.stringify(r.rows), table).not.toContain(B);
        expect(JSON.stringify(r.rows), table).not.toContain(b.goal);
      }
    });
  });

  describe.each([false, true])('direct writes (write path forced on: %s)', (writePath) => {
    const run = (sql: string, params: () => unknown[]) => async () => blocked(await attempt(t.client, asA(), sql, params(), writePath));

    it('A cannot update B goal by id', run(`update goals set title = 'pwned' where id = $1`, () => [b.goal]));
    it('A cannot delete B goal by id', run(`delete from goals where id = $1`, () => [b.goal]));
    it('A cannot insert a goal owned by B',
      run(`insert into goals (id, owner_id, title, status) values ($1, $2, 'fake', 'draft')`, () => [uuid(), B]));
    it('A cannot hand their own goal to B', run(`update goals set owner_id = $1 where id = $2`, () => [B, a.goal]));
    it('A cannot upsert over B goal id',
      run(`insert into goals (id, owner_id, title, status) values ($1, $2, 'x', 'draft')
           on conflict (id) do update set title = 'pwned'`, () => [b.goal, A]));
    it('A cannot update B profile', run(`update profiles set display_name = 'pwned' where id = $1`, () => [B]));
    it('A cannot add a key area to B goal',
      run(`insert into outcomes (id, goal_id, title, position) values ($1, $2, 'x', 7)`, () => [uuid(), b.goal]));
    it('A cannot move their key area into B goal', run(`update outcomes set goal_id = $1 where id = $2`, () => [b.goal, a.outcome]));
    it('A cannot attach their action to B key area', run(`update actions set outcome_id = $1 where id = $2`, () => [b.outcome, a.task]));
    it('A cannot insert an action into B key area via A goal',
      run(`insert into actions (id, goal_id, outcome_id, title, kind, position) values ($1, $2, $3, 'x', 'task', 6)`,
        () => [uuid(), a.goal, b.outcome]));
    it('A cannot edit or delete B actions', async () => {
      blocked(await attempt(t.client, asA(), `update actions set title = 'pwned' where id = $1`, [b.task], writePath));
      blocked(await attempt(t.client, asA(), `delete from actions where id = $1`, [b.task], writePath));
    });
    it('A cannot record a completion on B routine',
      run(`insert into routine_checks (id, action_id, date) values ($1, $2, '2026-01-06')`, () => [uuid(), b.routine]));
    it('A cannot delete B completion records', run(`delete from routine_checks where action_id = $1`, () => [b.routine]));
    it('A cannot write a reflection into B goal',
      run(`insert into reflections (id, goal_id, date, kind) values ($1, $2, '2026-01-06', 'daily')`, () => [uuid(), b.goal]));
    it('A cannot read-modify B reflection or move theirs into B goal', async () => {
      blocked(await attempt(t.client, asA(), `update reflections set went_well = 'pwned' where id = $1`, [b.reflection], writePath));
      blocked(await attempt(t.client, asA(), `delete from reflections where id = $1`, [b.reflection], writePath));
    });
    it('A cannot forge progress history in B goal',
      run(`insert into goal_events (id, goal_id, type, summary) values ($1, $2, 'x', 'forged')`, () => [uuid(), b.goal]));
    it('A cannot focus B action (as A or as B)', async () => {
      blocked(await attempt(t.client, asA(), `insert into daily_focus (id, owner_id, action_id, date, slot) values ($1,$2,$3,'2026-01-06',1)`, [uuid(), A, b.task], writePath));
      blocked(await attempt(t.client, asA(), `insert into daily_focus (id, owner_id, action_id, date, slot) values ($1,$2,$3,'2026-01-06',1)`, [uuid(), B, a.task], writePath));
      blocked(await attempt(t.client, asA(), `delete from daily_focus where id = $1`, [b.focus], writePath));
    });
    it('A cannot TRUNCATE any table (TRUNCATE ignores RLS)', async () => {
      for (const table of ['goals', 'outcomes', 'actions', 'routine_checks', 'reflections', 'goal_events', 'daily_focus', 'profiles']) {
        expect((await attempt(t.client, asA(), `truncate table ${table} cascade`, [], writePath)).error, table).toMatch(/permission denied/);
      }
    });
  });

  describe('RPCs with B ids (and A/B id pairs)', () => {
    const code = async (name: string, input: () => unknown) => (await attempt(t.client, asA(), `select * from public.${name}($1::jsonb)`, [JSON.stringify(input())])).code;

    it.each([
      ['update_goal', () => ({ goalId: b.goal, title: 'pwned' })],
      ['archive_goal', () => ({ goalId: b.goal })],
      ['delete_goal', () => ({ goalId: b.goal, confirmTitle: 'B private goal' })],
      ['add_outcome', () => ({ goalId: b.goal, title: 'x' })],
      ['update_outcome', () => ({ outcomeId: b.outcome, title: 'pwned' })],
      ['update_action', () => ({ actionId: b.task, title: 'pwned' })],
      ['complete_action', () => ({ actionId: b.task })],
      ['check_routine', () => ({ actionId: b.routine, date: '2026-01-06' })],
      ['uncheck_routine', () => ({ actionId: b.routine, date: today })],
      ['add_action', () => ({ outcomeId: b.outcome, title: 'x', kind: 'task' })],
      ['move_action', () => ({ actionId: a.task, toOutcomeId: b.outcome, toPosition: 5 })],
      ['add_to_today', () => ({ actionId: b.task, date: '2026-01-06' })],
      ['remove_from_today', () => ({ actionId: b.task, date: today })],
      ['update_reflection', () => ({ reflectionId: b.reflection, wentWell: 'pwned' })],
      ['delete_reflection', () => ({ reflectionId: b.reflection })],
    ])('%s is refused', async (name, input) => {
      expect(['HG404', 'HG409', 'HG400']).toContain(await code(name, input));
    });

    it('reorders that mix A and B ids are refused', async () => {
      expect(['HG404', 'HG409']).toContain(await code('reorder_outcomes', () => ({ goalId: a.goal, orderedIds: [a.outcome, b.outcome] })));
      expect(['HG404', 'HG409']).toContain(await code('reorder_actions', () => ({ outcomeId: a.outcome, orderedIds: [a.task, b.task] })));
    });

    it('a create replaying B id is a conflict, not an overwrite', async () => {
      expect(await code('create_goal', () => ({ id: b.goal, title: 'pwned' }))).toBe('HG409');
      expect(await code('add_reflection', () => ({ id: b.reflection, goalId: a.goal, date: today, kind: 'weekly', wentWell: 'x' }))).toBe('HG409');
    });
  });

  describe('private helpers (SEC-DB-01)', () => {
    /** In one transaction as A: run `first`, then try a direct write; returns each step's SQLSTATE. */
    async function thenDirectWrite(first: string, params: unknown[] = []) {
      const codes: (string | undefined)[] = [];
      await t.client.transaction(async (tx) => {
        await setWho(tx, asA());
        for (const [sql, p] of [[first, params], [`update goals set status = 'achieved' where id = $1`, [a.goal]]] as const) {
          try {
            await tx.query('savepoint s');
            await tx.query(sql, p as unknown[]);
            codes.push('ok');
          } catch (e) {
            codes.push((e as { code?: string }).code);
            await tx.query('rollback to savepoint s');
          }
        }
        await tx.rollback();
      });
      return codes;
    }

    it('A cannot open the write path by calling harada_private directly', async () => {
      expect(await thenDirectWrite(`select harada_private.begin_write('{}'::jsonb)`)).toEqual(['42501', '42501']);
      expect(await thenDirectWrite(`select * from harada_private.create_goal_impl('{"title":"x"}'::jsonb)`)).toEqual(['42501', '42501']);
    });

    it('the public wrapper still works and closes the write path behind it', async () => {
      expect(await thenDirectWrite(`select * from public.update_goal($1::jsonb)`, [JSON.stringify({ goalId: a.goal, title: 'A renamed' })]))
        .toEqual(['ok', '42501']);
    });
  });

  describe('signed-out and anonymous clients', () => {
    it('anon has no access to any table', async () => {
      for (const table of ['goals', 'outcomes', 'actions', 'routine_checks', 'reflections', 'goal_events', 'daily_focus', 'profiles']) {
        expect((await attempt(t.client, 'anon', `select * from ${table}`)).error, table).toMatch(/permission denied/);
      }
    });
    it('anon cannot call any RPC', async () => {
      expect((await attempt(t.client, 'anon', `select * from public.create_goal('{"title":"x"}'::jsonb)`)).error).toMatch(/permission denied/);
      expect((await attempt(t.client, 'anon', `select public.consume_password_attempt($1)`, [B])).error).toMatch(/permission denied/);
    });
    it('a session without a user (expired / signed out token) sees no rows and cannot write', async () => {
      for (const table of ['goals', 'reflections', 'profiles']) seesNothing(await attempt(t.client, 'authenticated-noclaims', `select * from ${table}`));
      expect((await attempt(t.client, 'authenticated-noclaims', `select * from public.create_goal('{"title":"x"}'::jsonb)`)).code).toBe('HG401');
    });
  });

  describe('delete-account attempt limiter (SEC-EDGE-01)', () => {
    it('only the service role can consume attempts', async () => {
      expect((await attempt(t.client, asA(), `select public.consume_password_attempt($1)`, [A])).error).toMatch(/permission denied/);
    });
    it('allows 5 attempts per user, then refuses; other users are unaffected', async () => {
      const results: boolean[] = [];
      for (let i = 0; i < 6; i++) {
        results.push(await t.client.transaction(async (tx) => {
          await setWho(tx, 'service_role');
          return (await tx.query<{ ok: boolean }>(`select public.consume_password_attempt($1) ok`, [B])).rows[0]!.ok;
        }));
      }
      expect(results).toEqual([true, true, true, true, true, false]);
      const other = await t.client.transaction(async (tx) => {
        await setWho(tx, 'service_role');
        return (await tx.query<{ ok: boolean }>(`select public.consume_password_attempt($1) ok`, [A])).rows[0]!.ok;
      });
      expect(other).toBe(true);
    });
  });

  it('measure numbers with absurd precision are rejected (SEC-DB-02)', async () => {
    const r = await attempt(t.client, asA(), `select * from public.update_measure_current($1::jsonb)`, [
      `{"outcomeId":"${a.outcome}","current":0.${'1'.repeat(1000)}}`,
    ]);
    expect(r.code).toBe('HG400');
  });

  it("B's data is byte-for-byte unchanged after every attack", async () => {
    expect(await snapshotB()).toEqual(before);
  });
});
