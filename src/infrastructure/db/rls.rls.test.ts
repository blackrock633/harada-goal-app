import crypto from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite, Transaction } from '@electric-sql/pglite';
import { createTestDeps, type TestDeps } from '../testing/create-test-deps';

/**
 * RLS regression suite against real Postgres (PGlite) with the real migrations. Raw SQL on purpose:
 * it tests the policies themselves, independent of repository code (a few tests at the end go through
 * the real repositories to prove server-side code is covered too).
 */
type Who = { sub: string } | 'anon' | 'authenticated-noclaims';

async function as<T>(client: PGlite, who: Who, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return client.transaction(async (tx) => {
    if (who === 'anon') {
      await tx.query(`select set_config('role','anon',true)`);
    } else if (who === 'authenticated-noclaims') {
      await tx.query(`select set_config('role','authenticated',true)`);
    } else {
      await tx.query(`select set_config('role','authenticated',true), set_config('request.jwt.claims',$1,true)`, [
        JSON.stringify({ sub: who.sub, role: 'authenticated' }),
      ]);
    }
    return fn(tx);
  });
}

const TABLES = ['profiles', 'goals', 'outcomes', 'actions', 'routine_checks', 'reflections', 'goal_events'];
const uuid = (): string => crypto.randomUUID();

describe('row level security', () => {
  let t: TestDeps;
  let A: string;
  let B: string;
  const ids = { goalA: uuid(), outA: uuid(), actA: uuid(), checkA: uuid(), refA: uuid(), evA: uuid(), goalB: uuid(), outB: uuid(), archivedA: uuid() };

  beforeAll(async () => {
    t = await createTestDeps();
    A = await t.createUser({ displayName: 'Alice' });
    B = await t.createUser({ displayName: 'Bob' });
    const c = t.client;
    const goal = (id: string, owner: string, status = 'active') =>
      c.query(
        status === 'archived'
          ? `insert into goals (id, owner_id, title, status, status_before_archive, archived_at) values ($1,$2,'G',$3,'active',now())`
          : `insert into goals (id, owner_id, title, status) values ($1,$2,'G',$3)`,
        [id, owner, status],
      );
    await goal(ids.goalA, A);
    await goal(ids.archivedA, A, 'archived');
    await goal(ids.goalB, B);
    await c.query(`insert into outcomes (id, goal_id, title, position) values ($1,$2,'O',0), ($3,$4,'OB',0)`, [ids.outA, ids.goalA, ids.outB, ids.goalB]);
    await c.query(`insert into actions (id, goal_id, outcome_id, title, kind, position) values ($1,$2,$3,'A','task',0)`, [ids.actA, ids.goalA, ids.outA]);
    await c.query(`insert into actions (id, goal_id, outcome_id, title, kind, position, schedule_type, start_date) values ($1,$2,$3,'R','routine',1,'daily','2026-01-01')`, [uuid(), ids.goalA, ids.outA]);
    const routine = (await c.query<{ id: string }>(`select id from actions where kind='routine'`)).rows[0]!.id;
    await c.query(`insert into routine_checks (id, action_id, date) values ($1,$2,'2026-01-02')`, [ids.checkA, routine]);
    await c.query(`insert into reflections (id, goal_id, date, kind) values ($1,$2,'2026-01-02','daily')`, [ids.refA, ids.goalA]);
    await c.query(`insert into goal_events (id, goal_id, type, summary) values ($1,$2,'x','s')`, [ids.evA, ids.goalA]);
  });
  afterAll(() => t.close());

  const count = async (who: Who, table: string) =>
    (await as(t.client, who, (tx) => tx.query<{ n: number }>(`select count(*)::int n from ${table}`))).rows[0]!.n;

  describe('structure guards', () => {
    it('RLS is enabled on every table in public', async () => {
      const { rows } = await t.client.query<{ relname: string; relrowsecurity: boolean }>(
        `select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind in ('r','p')`,
      );
      expect(rows.map((r) => r.relname).sort()).toEqual([...TABLES].sort());
      expect(rows.filter((r) => !r.relrowsecurity).map((r) => r.relname)).toEqual([]);
    });

    it('every public table has at least one policy', async () => {
      const { rows } = await t.client.query<{ relname: string }>(
        `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind in ('r','p')
           and not exists (select 1 from pg_policy p where p.polrelid = c.oid)`,
      );
      expect(rows.map((r) => r.relname)).toEqual([]);
    });

    it('no policy applies to anon or public', async () => {
      const { rows } = await t.client.query<{ polname: string }>(
        `select polname from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and (p.polroles = '{0}' or p.polroles @> array[(select oid from pg_roles where rolname='anon')])`,
      );
      expect(rows).toEqual([]);
    });
  });

  describe('user B cannot reach user A rows', () => {
    const bob = () => ({ sub: B });

    it.each(['goals', 'outcomes', 'actions', 'routine_checks', 'reflections', 'goal_events'])('SELECT on A rows in %s returns nothing', async (table) => {
      const r = await as(t.client, bob(), (tx) => tx.query(`select * from ${table} where id <> '00000000-0000-0000-0000-000000000000'`));
      const aIds = new Set([ids.goalA, ids.archivedA, ids.outA, ids.actA, ids.checkA, ids.refA, ids.evA]);
      expect((r.rows as { id: string }[]).filter((x) => aIds.has(x.id))).toEqual([]);
    });

    it("B cannot read A's profile but can read own", async () => {
      const r = await as(t.client, bob(), (tx) => tx.query<{ id: string }>(`select id from profiles`));
      expect(r.rows.map((x) => x.id)).toEqual([B]);
    });

    it("B cannot update A's profile", async () => {
      const r = await as(t.client, bob(), (tx) => tx.query(`update profiles set display_name='pwned' where id = $1`, [A]));
      expect(r.affectedRows).toBe(0);
    });

    it.each([
      ['goals', 'title', ids.goalA],
      ['outcomes', 'title', ids.outA],
      ['actions', 'title', ids.actA],
      ['reflections', 'went_well', ids.refA],
    ])('UPDATE on A rows in %s affects 0 rows', async (table, col, id) => {
      const r = await as(t.client, bob(), (tx) => tx.query(`update ${table} set ${col}='pwned' where id=$1`, [id]));
      expect(r.affectedRows).toBe(0);
    });

    it.each([
      ['goals', ids.goalA],
      ['goals', ids.archivedA],
      ['outcomes', ids.outA],
      ['actions', ids.actA],
      ['routine_checks', ids.checkA],
      ['reflections', ids.refA],
    ])('DELETE on A rows in %s affects 0 rows', async (table, id) => {
      const r = await as(t.client, bob(), (tx) => tx.query(`delete from ${table} where id=$1`, [id]));
      expect(r.affectedRows).toBe(0);
    });

    it('DELETE on A goal_events is denied', async () => {
      await expect(as(t.client, bob(), (tx) => tx.query(`delete from goal_events where id=$1`, [ids.evA]))).rejects.toThrow(/permission denied/);
    });

    it("INSERTs into A's goal/action are rejected", async () => {
      const attempts: [string, string, unknown[]][] = [
        ['outcome', `insert into outcomes (id, goal_id, title, position) values ($1,$2,'x',5)`, [uuid(), ids.goalA]],
        ['action', `insert into actions (id, goal_id, outcome_id, title, kind, position) values ($1,$2,$3,'x','task',5)`, [uuid(), ids.goalA, ids.outA]],
        ['reflection', `insert into reflections (id, goal_id, date, kind) values ($1,$2,'2026-02-01','daily')`, [uuid(), ids.goalA]],
        ['routine_check', `insert into routine_checks (id, action_id, date) values ($1,$2,'2026-02-01')`, [uuid(), ids.actA]],
        ['goal_event', `insert into goal_events (id, goal_id, type, summary) values ($1,$2,'x','s')`, [uuid(), ids.goalA]],
        ['goal owned by A', `insert into goals (id, owner_id, title, status) values ($1,$2,'x','draft')`, [uuid(), A]],
      ];
      for (const [label, q, params] of attempts) {
        await expect(as(t.client, bob(), (tx) => tx.query(q, params)), label).rejects.toThrow(/row-level security|violates|permission denied/);
      }
    });

    it('B cannot reassign own goal to A (owner_id)', async () => {
      await expect(as(t.client, bob(), (tx) => tx.query(`update goals set owner_id=$1 where id=$2`, [A, ids.goalB]))).rejects.toThrow(/row-level security/);
    });

    it("B cannot move own outcome into A's goal", async () => {
      await expect(as(t.client, bob(), (tx) => tx.query(`update outcomes set goal_id=$1 where id=$2`, [ids.goalA, ids.outB]))).rejects.toThrow(/row-level security/);
    });

    it("B cannot attach an action to A's outcome via own goal", async () => {
      await expect(
        as(t.client, bob(), (tx) =>
          tx.query(`insert into actions (id, goal_id, outcome_id, title, kind, position) values ($1,$2,$3,'x','task',3)`, [uuid(), ids.goalB, ids.outA]),
        ),
      ).rejects.toThrow(/violates foreign key/);
    });

    it('A data is unchanged after all attempts', async () => {
      const r = await t.client.query<{ title: string }>(`select title from goals where id=$1`, [ids.goalA]);
      expect(r.rows[0]!.title).toBe('G');
      expect((await t.client.query(`select 1 from outcomes where goal_id=$1`, [ids.goalA])).rows).toHaveLength(1);
    });
  });

  describe('anon and claimless access', () => {
    it.each(TABLES)('anon is denied on %s', async (table) => {
      await expect(as(t.client, 'anon', (tx) => tx.query(`select * from ${table}`))).rejects.toThrow(/permission denied/);
    });

    it.each(TABLES)('anon cannot write %s', async (table) => {
      await expect(as(t.client, 'anon', (tx) => tx.query(`delete from ${table}`))).rejects.toThrow(/permission denied/);
    });

    it('anon cannot call ownership helpers', async () => {
      await expect(as(t.client, 'anon', (tx) => tx.query(`select public.owns_goal($1)`, [ids.goalA]))).rejects.toThrow(/permission denied/);
    });

    // Fail closed: the authenticated role without a user id must see zero rows.
    it.each(TABLES)('authenticated with no claims sees nothing in %s', async (table) => {
      const n = await count('authenticated-noclaims', table);
      expect(n).toBe(0);
    });

    it('authenticated with a claim lacking sub sees nothing', async () => {
      const r = await t.client.transaction(async (tx) => {
        await tx.query(`select set_config('role','authenticated',true), set_config('request.jwt.claims','{"role":"authenticated"}',true)`);
        return tx.query(`select 1 from goals`);
      });
      expect(r.rows).toHaveLength(0);
    });
  });

  describe('owner rules (user A)', () => {
    const alice = () => ({ sub: A });

    it('A sees own rows', async () => {
      expect(await count(alice(), 'goals')).toBe(2);
      expect(await count(alice(), 'outcomes')).toBe(1);
      expect(await count(alice(), 'goal_events')).toBe(1);
    });

    it('goal DELETE is refused for a non-archived goal and works for an archived one', async () => {
      const del = (id: string) => as(t.client, alice(), (tx) => tx.query(`delete from goals where id=$1`, [id]));
      expect((await del(ids.goalA)).affectedRows).toBe(0);
      const gone = await t.client.transaction(async (tx) => {
        await tx.query(`select set_config('role','authenticated',true), set_config('request.jwt.claims',$1,true)`, [JSON.stringify({ sub: A })]);
        const r = await tx.query(`delete from goals where id=$1`, [ids.archivedA]);
        await tx.rollback(); // keep fixtures stable
        return r.affectedRows;
      });
      expect(gone).toBe(1);
    });

    it('goal_events UPDATE and DELETE are denied even for the owner', async () => {
      await expect(as(t.client, alice(), (tx) => tx.query(`update goal_events set summary='x' where id=$1`, [ids.evA]))).rejects.toThrow(/permission denied/);
      await expect(as(t.client, alice(), (tx) => tx.query(`delete from goal_events where id=$1`, [ids.evA]))).rejects.toThrow(/permission denied/);
    });

    it('goal_events INSERT works for the owner (append-only)', async () => {
      const ok = await t.client.transaction(async (tx) => {
        await tx.query(`select set_config('role','authenticated',true), set_config('request.jwt.claims',$1,true)`, [JSON.stringify({ sub: A })]);
        const r = await tx.query(`insert into goal_events (id, goal_id, type, summary) values ($1,$2,'x','s')`, [uuid(), ids.goalA]);
        await tx.rollback();
        return r.affectedRows;
      });
      expect(ok).toBe(1);
    });
  });

  describe('through the real repositories (server-side path)', () => {
    it("uow.run(B) cannot see A's goal; uow.run(A) can", async () => {
      expect(await t.deps.uow.run(B, (r) => r.goals.findById(B, ids.goalA))).toBeNull();
      expect(await t.deps.uow.run(B, (r) => r.goals.findById(A, ids.goalA))).toBeNull();
      expect(await t.deps.uow.run(A, (r) => r.goals.findById(A, ids.goalA))).not.toBeNull();
    });

    it("uow.run(B) cannot see A's profile, outcomes, or actions", async () => {
      expect(await t.deps.uow.run(B, (r) => r.profiles.findById(A))).toBeNull();
      expect(await t.deps.uow.run(B, (r) => r.outcomes.findById(B, ids.outA))).toBeNull();
      expect(await t.deps.uow.run(B, (r) => r.actions.findById(B, ids.actA))).toBeNull();
      expect(await t.deps.uow.run(B, (r) => r.outcomes.listByGoals([ids.goalA]))).toEqual([]);
    });

    it('uow.run rejects a non-uuid user id', async () => {
      await expect(t.deps.uow.run("x'; drop table goals; --", async () => 1)).rejects.toThrow();
    });
  });
});
