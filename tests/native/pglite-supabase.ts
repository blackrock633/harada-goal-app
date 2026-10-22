/**
 * A minimal supabase-js stand-in backed by the REAL database (PGlite + every Supabase migration).
 * Every call runs in its own transaction as role `authenticated` with the acting user's JWT claims,
 * exactly as PostgREST does, so RLS, grants, constraints, triggers and the SQL RPCs all apply for real.
 *
 * Reads: from(table).select(cols) + eq/in/gte/order/limit (the filters reads.ts uses). The result is
 * serialised by Postgres itself (json_agg) so values have PostgREST's JSON shapes: timestamptz as ISO
 * strings, date as 'YYYY-MM-DD', numeric as JSON numbers, arrays as arrays.
 * Writes: rpc(name, { p_input }) -> select to_json(t) from public.<name>($1::jsonb).
 */
import type { PGlite } from '@electric-sql/pglite';
import type { SupabaseClient } from '@supabase/supabase-js';

interface PgErr { code: string; message: string; details: string | null; hint: string | null }
interface Res { data: unknown; error: PgErr | null; status: number }

const IDENT = /^[a-z_][a-z0-9_]*$/;
const ident = (s: string, what: string) => {
  if (!IDENT.test(s)) throw new Error(`pglite-supabase: bad ${what} ${JSON.stringify(s)}`);
  return `"${s}"`;
};
const RPC_NAME = /^[a-z_]+$/;

function toPgErr(e: unknown): PgErr {
  const x = e as { code?: string; message?: string; detail?: string; hint?: string };
  return { code: x.code ?? 'XX000', message: x.message ?? String(e), details: x.detail ?? null, hint: x.hint ?? null };
}
/** PostgREST status for a Postgres error code (the common ones). */
function statusFor(code: string): number {
  if (code === '42501') return 403;
  if (code === 'P0001') return 400;
  if (code.startsWith('23')) return code === '23505' ? 409 : 400;
  if (code.startsWith('22') || code.startsWith('42')) return 400;
  return 500;
}

export interface PgliteSupabase {
  /** The supabase-js-shaped object: { from, rpc }. */
  client: SupabaseClient;
  from: (table: string) => unknown;
  rpc: (name: string, args: { p_input?: unknown }) => Promise<Res>;
  /** Switch the acting user (simulates signing in as another account). */
  actAs(userId: string): void;
  readonly userId: string;
  /** Every rpc call: name, input, whether the DB executed it, and what the app got back. */
  rpcLog: { name: string; input: unknown; executed: boolean }[];
  /** Hook run after the DB executed an rpc; may return a replacement response (e.g. a lost response). */
  afterRpc?: (name: string, executed: Res) => Res | Promise<Res> | undefined;
}

export function createPgliteSupabase(db: PGlite, userId: string): PgliteSupabase {
  let current = userId;

  async function asUser<T>(fn: (tx: { query: PGlite['query'] }) => Promise<T>): Promise<T> {
    return db.transaction(async (tx) => {
      await tx.query(`select set_config('role','authenticated',true), set_config('request.jwt.claims',$1,true)`, [
        JSON.stringify({ sub: current, role: 'authenticated' }),
      ]);
      return fn(tx as unknown as { query: PGlite['query'] });
    });
  }

  function from(table: string) {
    return {
      select(columns: string) {
        const cols = columns.split(',').map((c) => ident(c.trim(), 'column'));
        const params: unknown[] = [];
        const where: string[] = [];
        const order: string[] = [];
        let limit: number | null = null;
        const p = (v: unknown) => (params.push(v), `$${params.length}`);
        const builder = {
          eq(c: string, v: unknown) { where.push(`${ident(c, 'column')} = ${p(v)}`); return builder; },
          in(c: string, vs: unknown[]) {
            // empty IN list matches nothing
            where.push(vs.length ? `${ident(c, 'column')}::text = any(${p(vs.map(String))}::text[])` : 'false');
            return builder;
          },
          gte(c: string, v: unknown) { where.push(`${ident(c, 'column')} >= ${p(v)}`); return builder; },
          order(c: string, o?: { ascending?: boolean }) {
            order.push(`${ident(c, 'column')} ${o?.ascending === false ? 'desc' : 'asc'}`);
            return builder;
          },
          limit(n: number) { limit = n; return builder; },
          then<R1, R2>(ok: (v: Res) => R1, bad: (e: unknown) => R2) {
            const sql =
              `select coalesce(json_agg(t), '[]'::json) as j from (select ${cols.join(', ')} from public.${ident(table, 'table')}` +
              (where.length ? ` where ${where.join(' and ')}` : '') +
              (order.length ? ` order by ${order.join(', ')}` : '') +
              (limit !== null ? ` limit ${Math.trunc(limit)}` : '') +
              `) t`;
            const run: Promise<Res> = asUser((tx) => tx.query<{ j: unknown }>(sql, params))
              .then((r): Res => ({ data: (r.rows[0] as { j: unknown }).j, error: null, status: 200 }))
              .catch((e): Res => {
                const err = toPgErr(e);
                return { data: null, error: err, status: statusFor(err.code) };
              });
            return run.then(ok, bad);
          },
        };
        return builder;
      },
    };
  }

  const self: PgliteSupabase = {
    client: undefined as unknown as SupabaseClient,
    from,
    rpcLog: [],
    actAs(id) { current = id; },
    get userId() { return current; },
    async rpc(name, args) {
      if (!RPC_NAME.test(name)) throw new Error(`pglite-supabase: bad rpc name ${JSON.stringify(name)}`);
      let res: Res;
      let executed = false;
      try {
        const r = await asUser((tx) =>
          tx.query<{ j: unknown }>(`select to_json(t) as j from public.${name}($1::jsonb) as t`, [JSON.stringify(args?.p_input ?? null)]),
        );
        executed = true;
        const row = (r.rows[0] as { j: unknown } | undefined)?.j ?? null;
        // PostgREST: composite -> object; void -> null; scalar-returning functions are not used here.
        res = { data: row && typeof row === 'object' && !Array.isArray(row) && Object.keys(row).length === 1 && name in (row as object) ? (row as Record<string, unknown>)[name] : row, error: null, status: 200 };
      } catch (e) {
        const err = toPgErr(e);
        res = { data: null, error: err, status: statusFor(err.code) };
      }
      self.rpcLog.push({ name, input: args?.p_input, executed });
      return (await self.afterRpc?.(name, res)) ?? res;
    },
  };
  self.client = { from: self.from, rpc: self.rpc } as unknown as SupabaseClient;
  return self;
}
