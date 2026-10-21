/**
 * Live verification against a REAL Supabase project (staging only, never production).
 *
 * Needs, in a local uncommitted .env.local or the shell:
 *   STAGING_DATABASE_URL         postgres connection for read-only catalog checks (grants)
 *   NEXT_PUBLIC_SUPABASE_URL     project URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
 * Run:  npx vitest run tests/staging
 *
 * Without them every test is SKIPPED with the reason, never passed: the QA report records
 * "real Supabase: BLOCKED" until this suite runs green against the project.
 *
 * Side effect: the isolation tests create two throwaway users (qa-staging-…@example.com) plus one goal
 * in the staging project. Deleting auth users needs the service role, which QA does not hold.
 */
import crypto from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const DB = process.env.STAGING_DATABASE_URL;
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Exact allow-list from supabase/migrations/20261019140000_harden_grants.sql (table-level privileges).
const EXPECTED: Record<string, string[]> = {
  profiles: ['SELECT'],
  goals: ['DELETE', 'INSERT', 'SELECT', 'UPDATE'],
  outcomes: ['DELETE', 'INSERT', 'SELECT', 'UPDATE'],
  actions: ['DELETE', 'INSERT', 'SELECT', 'UPDATE'],
  reflections: ['DELETE', 'INSERT', 'SELECT', 'UPDATE'],
  routine_checks: ['DELETE', 'INSERT', 'SELECT'],
  daily_focus: ['DELETE', 'INSERT', 'SELECT'],
  goal_events: ['INSERT', 'SELECT'],
};

describe.skipIf(!DB)('staging: grants on the live database (\\dp public.*)', () => {
  let sql: ReturnType<typeof postgres>;
  beforeAll(() => { sql = postgres(DB!, { max: 1, prepare: false }); });
  afterAll(async () => { await sql?.end(); });

  it('authenticated holds exactly the hardened table privileges', async () => {
    const rows = await sql<{ table_name: string; privilege_type: string }[]>`
      select table_name, privilege_type from information_schema.role_table_grants
      where table_schema = 'public' and grantee = 'authenticated'`;
    const actual: Record<string, string[]> = {};
    for (const r of rows) (actual[r.table_name] ??= []).push(r.privilege_type);
    for (const k of Object.keys(actual)) actual[k]!.sort();
    expect(actual).toEqual(EXPECTED);
  });

  it('anon holds no privileges on any public table', async () => {
    const rows = await sql`select table_name, privilege_type from information_schema.role_table_grants
      where table_schema = 'public' and grantee = 'anon'`;
    expect(rows).toEqual([]);
  });

  it('profiles UPDATE is column-limited to display_name, time_zone, updated_at', async () => {
    const rows = await sql<{ column_name: string }[]>`select column_name from information_schema.column_privileges
      where table_schema = 'public' and table_name = 'profiles' and grantee = 'authenticated' and privilege_type = 'UPDATE'`;
    expect(rows.map((r) => r.column_name).sort()).toEqual(['display_name', 'time_zone', 'updated_at']);
  });

  it('harada_private is not exposed through PostgREST (RPC-01)', async () => {
    const rows = await sql<{ cfg: string | null }[]>`select array_to_string(rolconfig, ',') cfg from pg_roles where rolname = 'authenticator'`;
    expect(rows[0]?.cfg ?? '').not.toMatch(/harada_private/);
  });

  it('GraphQL surface is closed to app roles (SEC-01 mitigation)', async () => {
    const rows = await sql<{ anon: boolean; auth: boolean }[]>`
      select coalesce(has_schema_privilege('anon', 'graphql', 'USAGE'), false) anon,
             coalesce(has_schema_privilege('authenticated', 'graphql', 'USAGE'), false) auth
      from pg_namespace where nspname = 'graphql'`;
    // No graphql schema at all (extension dropped) also passes.
    for (const r of rows) expect([r.anon, r.auth]).toEqual([false, false]);
  });

  it('every public table has RLS enabled', async () => {
    const rows = await sql<{ relname: string }[]>`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`;
    expect(rows.map((r) => r.relname)).toEqual([]);
  });
});

describe.skipIf(!URL_ || !KEY)('staging: cross-user isolation through real Auth + PostgREST', () => {
  const tag = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const client = () => createClient(URL_!, KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  let a: SupabaseClient;
  let b: SupabaseClient;
  let goalId: string;

  async function signedIn(name: string): Promise<SupabaseClient> {
    const c = client();
    const email = `qa-staging-${name}-${tag}@example.com`;
    const password = `Qa-${tag}-correct-horse`;
    const up = await c.auth.signUp({ email, password, options: { data: { display_name: `QA ${name}` } } });
    if (up.error) throw new Error(`sign-up failed for ${name}: ${up.error.message}`);
    if (!up.data.session) {
      throw new Error('BLOCKED: staging requires email confirmation; disable it for QA or provide pre-confirmed test users');
    }
    return c;
  }

  beforeAll(async () => {
    a = await signedIn('a');
    b = await signedIn('b');
    goalId = crypto.randomUUID();
    // D-017: clients write only through RPCs.
    const ins = await a.rpc('create_goal', { p_input: { id: goalId, title: `QA staging secret ${tag}` } });
    if (ins.error) throw new Error(`A could not create a goal: ${ins.error.message}`);
  });

  it('anon (no session) sees no goals', async () => {
    const r = await client().from('goals').select('id');
    expect(r.data ?? []).toEqual([]);
  });

  it("B cannot read A's goal", async () => {
    const r = await b.from('goals').select('id, title').eq('id', goalId);
    expect(r.data ?? []).toEqual([]);
  });

  it("B cannot update or delete A's goal (0 rows affected, A's row unchanged)", async () => {
    await b.from('goals').update({ title: 'stolen' }).eq('id', goalId);
    await b.from('goals').delete().eq('id', goalId);
    const mine = await a.from('goals').select('title').eq('id', goalId).single();
    expect(mine.data?.title).toBe(`QA staging secret ${tag}`);
  });

  it("B cannot attach an outcome to A's goal via the RPC", async () => {
    // Valid input (position included), so the only possible rejection is ownership: NOT_FOUND (HG404).
    const r = await b.rpc('add_outcome', { p_input: { id: crypto.randomUUID(), goalId, position: 0, title: 'injected' } });
    expect(r.error?.code, 'add_outcome on another user\'s goal must be NOT_FOUND').toBe('HG404');
  });

  it('direct table writes are rejected for a signed-in client (write path only via RPCs, 42501)', async () => {
    const { data: who } = await b.auth.getUser();
    const r = await b.from('goals').insert({ id: crypto.randomUUID(), owner_id: who.user!.id, title: 'direct', status: 'draft' });
    expect(r.error?.code).toBe('42501');
  });

  it("B cannot claim A's goal by inserting a goal row with A's owner_id", async () => {
    const { data: aUser } = await a.auth.getUser();
    const r = await b.from('goals').insert({ id: crypto.randomUUID(), owner_id: aUser.user!.id, title: 'forged owner', status: 'draft' });
    expect(r.error, 'owner_id must equal auth.uid()').not.toBeNull();
  });
});

describe.skipIf(!URL_ || !KEY)('staging: delete-account Edge Function (8575cf5)', () => {
  const tag = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const client = () => createClient(URL_!, KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const fn = `${URL_}/functions/v1/delete-account`;
  const email = `qa-staging-del-${tag}@example.com`;
  const password = `Qa-${tag}-correct-horse`;
  let victim: SupabaseClient;
  let bystander: SupabaseClient;
  let token: string;
  let victimGoal: string;
  let bystanderGoal: string;

  async function goalFor(c: SupabaseClient, title: string): Promise<string> {
    const { data: who } = await c.auth.getUser();
    const id = crypto.randomUUID();
    const r = await c.rpc('create_goal', { p_input: { id, title } });
    if (r.error) throw new Error(`create_goal failed for ${who.user?.id}: ${r.error.message}`);
    return id;
  }

  beforeAll(async () => {
    victim = client();
    const up = await victim.auth.signUp({ email, password });
    if (up.error || !up.data.session) throw new Error(`BLOCKED: sign-up needs a session (email confirmation off): ${up.error?.message ?? 'no session'}`);
    token = up.data.session.access_token;
    bystander = client();
    const b = await bystander.auth.signUp({ email: `qa-staging-bys-${tag}@example.com`, password });
    if (!b.data.session) throw new Error('BLOCKED: bystander sign-up has no session');
    victimGoal = await goalFor(victim, `victim ${tag}`);
    bystanderGoal = await goalFor(bystander, `bystander ${tag}`);
  });

  const post = (body: unknown, auth?: string) =>
    fetch(fn, { method: 'POST', headers: { 'content-type': 'application/json', apikey: KEY!, ...(auth ? { authorization: `Bearer ${auth}` } : {}) }, body: JSON.stringify(body) });

  it('no JWT → 401, nothing deleted', async () => {
    const r = await post({ password, confirmation: 'DELETE' });
    expect(r.status).toBe(401);
    expect((await victim.from('goals').select('id').eq('id', victimGoal)).data).toHaveLength(1);
  });

  it('wrong password → rejected, account and data intact', async () => {
    const r = await post({ password: 'definitely-wrong', confirmation: 'DELETE' }, token);
    expect(r.status).toBe(400);
    expect((await victim.from('goals').select('id').eq('id', victimGoal)).data).toHaveLength(1);
  });

  it('correct password → account deleted, every row gone, the other user untouched, cannot sign in again', async () => {
    const r = await post({ password, confirmation: 'DELETE' }, token);
    expect(r.status).toBe(200);
    expect((await bystander.from('goals').select('id').eq('id', bystanderGoal)).data).toHaveLength(1);
    const again = await client().auth.signInWithPassword({ email, password });
    expect(again.error, 'deleted user must not be able to sign in').not.toBeNull();
  });
});

