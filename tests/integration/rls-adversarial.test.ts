import crypto from 'crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PGlite, Transaction } from '@electric-sql/pglite';
import { createTestDeps, type TestDeps } from '@/infrastructure/testing/create-test-deps';

// MOCKED next/headers so DevAuthGateway can be imported (same approach as dev-auth-gateway.test.ts).
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }),
}));
import { createAuthGateway } from '@/infrastructure/auth/index';
import { isDevAuthEnabled } from '@/infrastructure/auth/mode';

/** Every test asserts the SECURE behaviour: a failing test is a confirmed hole. */
type Who = { sub: string } | 'anon';

async function setWho(tx: Transaction, who: Who) {
  if (who === 'anon') await tx.query(`select set_config('role','anon',true)`);
  else
    await tx.query(`select set_config('role','authenticated',true), set_config('request.jwt.claims',$1,true)`, [
      JSON.stringify({ sub: who.sub, role: 'authenticated' }),
    ]);
}
async function as<T>(client: PGlite, who: Who, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return client.transaction(async (tx) => {
    await setWho(tx, who);
    return fn(tx);
  });
}
/** Runs the statement as `who`, always rolls back, returns rows-affected or the error message. */
async function attempt(client: PGlite, who: Who, q: string, params: unknown[] = []) {
  let out: { affected?: number; error?: string } = {};
  try {
    await client.transaction(async (tx) => {
      await setWho(tx, who);
      const r = await tx.query(q, params);
      out = { affected: r.affectedRows };
      await tx.rollback();
    });
  } catch (e) {
    out = { error: (e as Error).message };
  }
  return out;
}
const uuid = () => crypto.randomUUID();
const PUBLIC_TABLES = ['profiles', 'goals', 'outcomes', 'actions', 'routine_checks', 'reflections', 'goal_events', 'daily_focus'];
const FEATURE_TABLES = [
  'plans', 'plan_features', 'prices', 'subscriptions', 'billing_events', 'plan_grants', 'goal_templates',
  'challenge_enrollments', 'share_links', 'referrals', 'analytics_events', 'admins',
];
/** Callable before sign-in: the public share page and first-party analytics. Both validate everything. */
const ANON_RPCS = ['get_shared_card', 'track_event'];
/**
 * Reviewed SECURITY DEFINER RPCs callable by `authenticated`. Each resolves the caller from auth.uid() itself
 * and touches only the caller's rows (or the public catalogue); adding one here needs the same review.
 */
const DEFINER_RPCS = [
  'admin_metrics', 'am_i_admin', 'challenge_summary', 'complete_challenge', 'create_share_link', 'get_my_plan',
  'get_my_referrals', 'get_shared_card', 'get_template', 'goal_history', 'join_challenge', 'leave_challenge',
  'list_templates', 'preview_share_card', 'revoke_share_link', 'track_event',
];

describe('RLS / authorization holes (asserting secure behaviour)', () => {
  let t: TestDeps;
  let A: string;
  let B: string;
  const id = { gA: uuid(), oA: uuid(), aA: uuid(), cA: uuid(), rA: uuid(), fA: uuid(), gB: uuid(), oB: uuid(), aB: uuid(), cB: uuid(), rB: uuid() };

  beforeAll(async () => {
    t = await createTestDeps();
    A = await t.createUser({ displayName: 'Alice' });
    B = await t.createUser({ displayName: 'Bob' });
    const c = t.client;
    await c.query(`insert into goals (id, owner_id, title, status) values ($1,$2,'GA','active'),($3,$4,'GB','active')`, [id.gA, A, id.gB, B]);
    await c.query(`insert into outcomes (id, goal_id, title, position) values ($1,$2,'OA',0),($3,$4,'OB',0)`, [id.oA, id.gA, id.oB, id.gB]);
    await c.query(
      `insert into actions (id, goal_id, outcome_id, title, kind, position, schedule_type, start_date) values
       ($1,$2,$3,'RA','routine',0,'daily','2026-01-01'), ($4,$5,$6,'RB','routine',0,'daily','2026-01-01')`,
      [id.aA, id.gA, id.oA, id.aB, id.gB, id.oB],
    );
    await c.query(`insert into routine_checks (id, action_id, date) values ($1,$2,'2026-01-02'),($3,$4,'2026-01-02')`, [id.cA, id.aA, id.cB, id.aB]);
    await c.query(`insert into reflections (id, goal_id, date, kind) values ($1,$2,'2026-01-02','daily'),($3,$4,'2026-01-02','daily')`, [id.rA, id.gA, id.rB, id.gB]);
    await c.query(`insert into daily_focus (id, owner_id, action_id, date, slot) values ($1,$2,$3,'2026-01-02',0)`, [id.fA, A, id.aA]);
  });
  afterAll(() => t.close());

  const bob = () => ({ sub: B });
  const expectBlocked = (r: { affected?: number; error?: string }) => {
    expect(r.error !== undefined || r.affected === 0, `expected blocked, got ${JSON.stringify(r)}`).toBe(true);
  };

  describe('privileges (default-privilege leakage)', () => {
    it.each(PUBLIC_TABLES)('authenticated has no TRUNCATE on %s (TRUNCATE ignores RLS)', async (tbl) => {
      const { rows } = await t.client.query<{ p: boolean }>(`select has_table_privilege('authenticated', 'public.${tbl}', 'TRUNCATE') p`);
      expect(rows[0]!.p).toBe(false);
    });

    it('end-to-end: user B cannot TRUNCATE goals and wipe every tenant', async () => {
      const r = await attempt(t.client, bob(), `truncate table goals cascade`);
      expect(r.error, 'TRUNCATE must be permission denied').toMatch(/permission denied/);
    });

    it('end-to-end: user B cannot TRUNCATE goal_events (append-only guarantee)', async () => {
      const r = await attempt(t.client, bob(), `truncate table goal_events`);
      expect(r.error).toMatch(/permission denied/);
    });

    it.each(PUBLIC_TABLES)('authenticated has no TRIGGER/REFERENCES on %s', async (tbl) => {
      const { rows } = await t.client.query<{ trg: boolean; ref: boolean }>(
        `select has_table_privilege('authenticated','public.${tbl}','TRIGGER') trg, has_table_privilege('authenticated','public.${tbl}','REFERENCES') ref`,
      );
      expect(rows[0]).toEqual({ trg: false, ref: false });
    });

    it('profiles: authenticated may only UPDATE display_name/time_zone/updated_at (not id, created_at)', async () => {
      const { rows } = await t.client.query<{ col: string; p: boolean }>(
        `select column_name col, has_column_privilege('authenticated','public.profiles',column_name,'UPDATE') p
         from information_schema.columns where table_schema='public' and table_name='profiles'`,
      );
      expect(rows.filter((r) => r.p).map((r) => r.col).sort()).toEqual(['display_name', 'time_zone', 'updated_at']);
    });

    it('profiles: authenticated has no INSERT or DELETE privilege (rows come from the auth trigger/cascade)', async () => {
      const { rows } = await t.client.query<{ i: boolean; d: boolean }>(
        `select has_table_privilege('authenticated','public.profiles','INSERT') i, has_table_privilege('authenticated','public.profiles','DELETE') d`,
      );
      expect(rows[0]).toEqual({ i: false, d: false });
    });

    it('daily_focus: authenticated has no UPDATE privilege (migration grants only select, insert, delete)', async () => {
      const { rows } = await t.client.query<{ p: boolean }>(`select has_table_privilege('authenticated','public.daily_focus','UPDATE') p`);
      expect(rows[0]!.p).toBe(false);
    });

    it('routine_checks: authenticated has no UPDATE privilege (no UPDATE policy exists, so none should be granted)', async () => {
      const { rows } = await t.client.query<{ p: boolean }>(`select has_table_privilege('authenticated','public.routine_checks','UPDATE') p`);
      expect(rows[0]!.p).toBe(false);
    });

    it('goal_events: authenticated has no UPDATE/DELETE', async () => {
      const { rows } = await t.client.query<{ u: boolean; d: boolean }>(
        `select has_table_privilege('authenticated','public.goal_events','UPDATE') u, has_table_privilege('authenticated','public.goal_events','DELETE') d`,
      );
      expect(rows[0]).toEqual({ u: false, d: false });
    });

    it.each(PUBLIC_TABLES)('anon has no privilege at all on %s', async (tbl) => {
      const { rows } = await t.client.query<{ p: boolean }>(
        `select bool_or(has_table_privilege('anon','public.${tbl}',p)) p from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p`,
      );
      expect(rows[0]!.p).toBe(false);
    });

    it('public functions: nothing executable by anon; everything authenticated can execute is an owns_* helper or a SECURITY INVOKER RPC with search_path=\'\'', async () => {
      // D-017 (45b5109): writes go through SECURITY INVOKER RPCs, so authenticated may EXECUTE them.
      const { rows } = await t.client.query<{ proname: string; anon: boolean; auth: boolean; definer: boolean; emptypath: boolean; config: string | null }>(
        `select p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') anon, has_function_privilege('authenticated', p.oid, 'EXECUTE') auth,
                p.prosecdef definer, coalesce('search_path=""' = any(p.proconfig), false) emptypath, p.proconfig::text config
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname='public'`,
      );
      expect(rows.filter((r) => r.anon).map((r) => r.proname).sort(), 'anon executes only the public RPCs').toEqual(ANON_RPCS);
      const bad = rows.filter((r) => r.auth && !r.proname.startsWith('owns_') && !r.emptypath);
      expect(bad.map((r) => `${r.proname} config=${r.config}`), 'executable RPCs must pin an empty search_path').toEqual([]);
      const definers = rows.filter((r) => r.auth && r.definer && !r.proname.startsWith('owns_')).map((r) => r.proname).sort();
      expect(definers, 'definer RPCs reachable by authenticated must be reviewed').toEqual(DEFINER_RPCS);

    });

    it('every SECURITY DEFINER function in public pins search_path', async () => {
      const { rows } = await t.client.query<{ proname: string }>(
        `select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='public' and p.prosecdef and coalesce(p.proconfig::text,'') not like '%search_path%'`,
      );
      expect(rows).toEqual([]);
    });

    it('public schema has no views / matviews / foreign tables that could bypass RLS', async () => {
      const { rows } = await t.client.query(`select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('v','m','f')`);
      expect(rows).toEqual([]);
    });

    it('authenticated cannot read auth.users (emails / metadata)', async () => {
      const r = await attempt(t.client, bob(), `select * from auth.users`);
      expect(r.error).toMatch(/permission denied/);
    });

    it('RLS is enabled AND has a policy on every public table, daily_focus included', async () => {
      const { rows } = await t.client.query<{ relname: string; relrowsecurity: boolean; n: number }>(
        `select c.relname, c.relrowsecurity, (select count(*)::int from pg_policy p where p.polrelid=c.oid) n
         from pg_class c join pg_namespace s on s.oid=c.relnamespace where s.nspname='public' and c.relkind in ('r','p')`,
      );
      expect(rows.map((r) => r.relname).sort()).toEqual([...PUBLIC_TABLES, ...FEATURE_TABLES].sort());
      expect(rows.filter((r) => !r.relrowsecurity)).toEqual([]);
      expect(rows.filter((r) => PUBLIC_TABLES.includes(r.relname) && r.n === 0)).toEqual([]);
    });
  });

  describe('cross-tenant writes: user B against user A', () => {
    const cases: [string, string, unknown[]][] = [
      ['routine_check for A action', `insert into routine_checks (id, action_id, date) values ($1,$2,'2026-03-01')`, [uuid(), id.aA]],
      ['goal_event into A goal', `insert into goal_events (id, goal_id, type, summary) values ($1,$2,'x','s')`, [uuid(), id.gA]],
      ['reflection into A goal', `insert into reflections (id, goal_id, date, kind) values ($1,$2,'2026-03-01','daily')`, [uuid(), id.gA]],
      ['outcome into A goal', `insert into outcomes (id, goal_id, title, position) values ($1,$2,'x',4)`, [uuid(), id.gA]],
      ['action into A goal+outcome', `insert into actions (id, goal_id, outcome_id, title, kind, position) values ($1,$2,$3,'x','task',4)`, [uuid(), id.gA, id.oA]],
      ['action in B goal pointing at A outcome', `insert into actions (id, goal_id, outcome_id, title, kind, position) values ($1,$2,$3,'x','task',4)`, [uuid(), id.gB, id.oA]],
      ['daily_focus owner=B on A action', `insert into daily_focus (id, owner_id, action_id, date, slot) values ($1,$2,$3,'2026-03-01',1)`, [uuid(), B, id.aA]],
      ['daily_focus owner=A on A action', `insert into daily_focus (id, owner_id, action_id, date, slot) values ($1,$2,$3,'2026-03-01',1)`, [uuid(), A, id.aA]],
      ['daily_focus owner=A on B action', `insert into daily_focus (id, owner_id, action_id, date, slot) values ($1,$2,$3,'2026-03-01',1)`, [uuid(), A, id.aB]],
      ['profile with random id', `insert into profiles (id, display_name) values ($1,'x')`, [uuid()]],
      ['profile row with A id', `insert into profiles (id, display_name) values ($1,'x')`, [A]],
      ['goal owned by A', `insert into goals (id, owner_id, title, status) values ($1,$2,'x','draft')`, [uuid(), A]],
    ];
    it.each(cases)('INSERT %s is blocked', async (_l, q, p) => {
      expectBlocked(await attempt(t.client, bob(), q, p));
    });

    const reparent: [string, string, unknown[]][] = [
      ['own action.goal_id -> A goal', `update actions set goal_id=$1 where id=$2`, [id.gA, id.aB]],
      ['own action.outcome_id -> A outcome', `update actions set outcome_id=$1 where id=$2`, [id.oA, id.aB]],
      ['own action goal_id+outcome_id -> A', `update actions set goal_id=$1, outcome_id=$2 where id=$3`, [id.gA, id.oA, id.aB]],
      ['own outcome.goal_id -> A goal', `update outcomes set goal_id=$1 where id=$2`, [id.gA, id.oB]],
      ['own reflection.goal_id -> A goal', `update reflections set goal_id=$1 where id=$2`, [id.gA, id.rB]],
      ['own routine_check.action_id -> A action', `update routine_checks set action_id=$1 where id=$2`, [id.aA, id.cB]],
      ['own goal.owner_id -> A', `update goals set owner_id=$1 where id=$2`, [A, id.gB]],
      ["A's action.goal_id -> B goal (steal)", `update actions set goal_id=$1 where id=$2`, [id.gB, id.aA]],
      ["A's goal.owner_id -> B (donate)", `update goals set owner_id=$1 where id=$2`, [B, id.gA]],
      ['own profile.id -> A', `update profiles set id=$1 where id=$2`, [A, B]],
      ["A's profile display_name", `update profiles set display_name='pwned' where id=$1`, [A]],
      ["A's routine_check date", `update routine_checks set date='2030-01-01' where id=$1`, [id.cA]],
      ["A's daily_focus slot", `update daily_focus set slot=3 where id=$1`, [id.fA]],
    ];
    it.each(reparent)('UPDATE %s is blocked', async (_l, q, p) => {
      expectBlocked(await attempt(t.client, bob(), q, p));
    });

    it("B cannot DELETE or SELECT A's daily_focus", async () => {
      expectBlocked(await attempt(t.client, bob(), `delete from daily_focus where id=$1`, [id.fA]));
      const rows = await as(t.client, bob(), (tx) => tx.query(`select * from daily_focus`));
      expect(rows.rows).toHaveLength(0);
    });

    it("no existence oracle: RLS error for another user's action == error for a nonexistent action", async () => {
      const q = `insert into routine_checks (id, action_id, date) values ($1,$2,'2026-03-01')`;
      const real = await attempt(t.client, bob(), q, [uuid(), id.aA]);
      const fake = await attempt(t.client, bob(), q, [uuid(), uuid()]);
      expect(real.error).toBeDefined();
      expect(real.error).toBe(fake.error);
    });

    it("owns_goal / owns_action never say yes for another user's ids", async () => {
      const r = await as(t.client, bob(), (tx) => tx.query<{ g: boolean; a: boolean }>(`select public.owns_goal($1) g, public.owns_action($2) a`, [id.gA, id.aA]));
      expect(r.rows[0]).toEqual({ g: false, a: false });
    });

    it('A data intact after all attempts', async () => {
      const r = await t.client.query<{ title: string; owner_id: string }>(`select title, owner_id from goals where id=$1`, [id.gA]);
      expect(r.rows[0]).toEqual({ title: 'GA', owner_id: A });
      expect((await t.client.query(`select 1 from profiles where display_name='pwned'`)).rows).toHaveLength(0);
      expect((await t.client.query(`select 1 from goals`)).rows.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('data-model integrity reachable by an authenticated user (not cross-tenant)', () => {
    it('routine_checks can only be recorded for ROUTINE actions (task action must be rejected)', async () => {
      const taskId = uuid();
      await t.client.query(`insert into actions (id, goal_id, outcome_id, title, kind, position) values ($1,$2,$3,'T','task',5)`, [taskId, id.gB, id.oB]);
      const r = await attempt(t.client, bob(), `insert into routine_checks (id, action_id, date) values ($1,$2,'2026-04-01')`, [uuid(), taskId]);
      expect(r.error, 'a check on a task action should be rejected').toBeDefined();
    });

    // H4 (P3): FIXED for clients by D-017 (45b5109): direct goal_events inserts are rejected by the write-path
    // guard (42501), so only trusted RPC/server code writes events.
    it("H4: a client cannot write a goal_event whose subject_id references a row outside the event's own goal", async () => {
      const r = await attempt(t.client, bob(), `insert into goal_events (id, goal_id, type, summary, subject_id) values ($1,$2,'action_added','s',$3)`, [uuid(), id.gB, id.aA]);
      expect(r.error, "event in B's goal pointing at A's action").toBeDefined();
    });
  });

  describe('unit of work', () => {
    it('uow.run does not leak role or claims to the connection afterwards (pool safety)', async () => {
      await t.deps.uow.run(B, async (r) => r.goals.listByOwner(B));
      await expect(t.deps.uow.run(B, async () => { throw new Error('boom'); })).rejects.toThrow('boom');
      const { rows } = await t.client.query<{ u: string; claims: string | null }>(`select current_user u, current_setting('request.jwt.claims', true) claims`);
      expect(rows[0]!.u).not.toBe('authenticated');
      expect(rows[0]!.claims ?? '').toBe('');
    });

    it('through the real repositories, B sees none of A (RLS applies to server queries)', async () => {
      expect(await t.deps.uow.run(B, (r) => r.goals.findById(A, id.gA))).toBeNull();
      expect(await t.deps.uow.run(B, (r) => r.reflections.listByGoal(id.gA, { limit: 10 }))).toEqual([]);
      expect(await t.deps.uow.run(B, (r) => r.events.listByGoal(id.gA, { limit: 10 }))).toEqual([]);
      expect(await t.deps.uow.run(B, (r) => r.checks.listForActions([id.aA], '2000-01-01', '2100-01-01'))).toEqual([]);
      expect(await t.deps.uow.run(B, (r) => r.focus.listForDate(A, '2026-01-02'))).toEqual([]);
      expect(await t.deps.uow.run(B, (r) => r.profiles.findById(A))).toBeNull();
    });

    it('repos that take no ownerId (reflections.deleteById, outcomes.setPositions, focus.add) cannot touch A rows as B', async () => {
      await t.deps.uow.run(B, async (r) => {
        await r.reflections.deleteById(id.rA);
        await r.outcomes.setPositions(id.gA, [{ id: id.oA, position: 6 }]);
        await r.focus.remove(A, id.aA, '2026-01-02');
      });
      expect((await t.client.query(`select 1 from reflections where id=$1`, [id.rA])).rows).toHaveLength(1);
      expect((await t.client.query(`select 1 from daily_focus where id=$1`, [id.fA])).rows).toHaveLength(1);
      expect((await t.client.query<{ position: number }>(`select position from outcomes where id=$1`, [id.oA])).rows[0]!.position).toBe(0);
      await expect(
        t.deps.uow.run(B, (r) => r.focus.add({ id: uuid(), ownerId: B, actionId: id.aA, date: '2026-05-01', slot: 0, createdAt: new Date() })),
      ).rejects.toThrow();
    });

    it.each(['00000000-0000-0000-0000-00000000000g', 'A-or-1=1', '', 'not-a-uuid', ' '])('uow.run rejects malformed user id %j', async (bad) => {
      await expect(t.deps.uow.run(bad, async () => 1)).rejects.toThrow();
    });

    it('uow.run with a well-formed but nonexistent user id sees nothing and cannot insert', async () => {
      const ghost = uuid();
      expect(await t.deps.uow.run(ghost, (r) => r.goals.listByOwner(ghost))).toEqual([]);
      await expect(
        t.deps.uow.run(ghost, (r) =>
          r.goals.insert({
            id: uuid(), ownerId: ghost, title: 'x', vision: '', successCriteria: '', targetDate: null, status: 'draft', statusBeforeArchive: null,
            purpose: { selfTangible: '', selfIntangible: '', othersTangible: '', othersIntangible: '' },
            activatedOn: null, achievedAt: null, archivedAt: null, createdAt: new Date(), updatedAt: new Date(),
          }),
        ),
      ).rejects.toThrow();
    });
  });

  describe('profile trigger sanitises client-supplied sign-up metadata', () => {
    it('oversized / hostile metadata still yields a valid profile', async () => {
      const uid = uuid();
      await t.client.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1,'meta@example.test',$2)`, [
        uid, JSON.stringify({ display_name: ' ' + 'x'.repeat(500), time_zone: "Mars/Olympus'; drop table goals;--" }),
      ]);
      const r = await t.client.query<{ display_name: string; time_zone: string }>(`select display_name, time_zone from profiles where id=$1`, [uid]);
      expect(r.rows[0]!.time_zone).toBe('UTC');
      expect(r.rows[0]!.display_name.length).toBeLessThanOrEqual(80);
      expect(r.rows[0]!.display_name.length).toBeGreaterThan(0);
    });
    it('non-string metadata (objects/arrays) does not break sign-up', async () => {
      const uid = uuid();
      await t.client.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1,'meta2@example.test',$2)`, [
        uid, JSON.stringify({ display_name: { a: 1 }, time_zone: ['UTC'] }),
      ]);
      expect((await t.client.query(`select 1 from profiles where id=$1`, [uid])).rows).toHaveLength(1);
    });
  });

  describe('dev auth gateway guards', () => {
    afterEach(() => vi.unstubAllEnvs());
    const stub = (env: Record<string, string>) => { for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v); };

    it('NODE_ENV=production + AUTH_PROVIDER=dev: createAuthGateway throws (fail closed)', () => {
      stub({ AUTH_PROVIDER: 'dev', NODE_ENV: 'production', DEV_AUTH_SECRET: 'x'.repeat(32) });
      expect(() => createAuthGateway(t.db)).toThrow();
      expect(isDevAuthEnabled()).toBe(false);
    });

    it('dev auth is refused when DATABASE_URL points at a real Postgres (Supabase), whatever NODE_ENV says', () => {
      stub({
        AUTH_PROVIDER: 'dev', NODE_ENV: 'staging', DEV_AUTH_SECRET: 'x'.repeat(32),
        DATABASE_URL: 'postgresql://postgres.abc:pw@aws-0-eu.pooler.supabase.com:6543/postgres',
      });
      expect(() => createAuthGateway(t.db)).toThrow();
    });

    it('dev auth is enabled only for NODE_ENV in {development,test} (allow-list), not for unset/unknown values', () => {
      for (const nodeEnv of [undefined, '', 'staging', 'prod', 'Production', 'preview']) {
        const env = { AUTH_PROVIDER: 'dev', ...(nodeEnv === undefined ? {} : { NODE_ENV: nodeEnv }) } as NodeJS.ProcessEnv;
        expect(isDevAuthEnabled(env), `NODE_ENV=${JSON.stringify(nodeEnv)}`).toBe(false);
      }
    });

    it('dev auth requires a long DEV_AUTH_SECRET', () => {
      stub({ AUTH_PROVIDER: 'dev', NODE_ENV: 'test', DEV_AUTH_SECRET: 'short' });
      expect(() => createAuthGateway(t.db)).toThrow();
    });
  });
});
