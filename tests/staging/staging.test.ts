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
    const { data: who } = await a.auth.getUser();
    goalId = crypto.randomUUID();
    const ins = await a.from('goals').insert({ id: goalId, owner_id: who.user!.id, title: `QA staging secret ${tag}`, status: 'draft' });
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

  it("B cannot attach an outcome to A's goal", async () => {
    const r = await b.from('outcomes').insert({ id: crypto.randomUUID(), goal_id: goalId, title: 'injected', position: 0 });
    expect(r.error, 'insert into another user\'s goal must be rejected').not.toBeNull();
  });

  it("B cannot claim A's goal by inserting a goal row with A's owner_id", async () => {
    const { data: aUser } = await a.auth.getUser();
    const r = await b.from('goals').insert({ id: crypto.randomUUID(), owner_id: aUser.user!.id, title: 'forged owner', status: 'draft' });
    expect(r.error, 'owner_id must equal auth.uid()').not.toBeNull();
  });
});
